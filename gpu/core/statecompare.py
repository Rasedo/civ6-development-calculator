"""STATE COMPARE, GPU side — the manifest's extractors, the digests, the census.

`shared/statecompare.manifest.json` names every field the two engines compare
and both `covers` (the TS type surface) and `planes` (this engine's `_MUTABLE`
tensors) for each. This module implements one EXTRACTOR per manifest field name
and folds them into per-group digests. `cpu/core/statecompare.ts` is the twin:
same manifest, same field names, same digest arithmetic.

Three things live here:

  `state_digest(sim, b)`  the per-turn product. One `exact` and one `milli`
      digest per group, order-independent, so a mismatch says WHICH GROUP
      diverged on WHICH TURN without either engine shipping its state.

  `group_dump(sim, b, group)`  the keyed rows behind a digest — what a by-name
      diff reads once a digest says which group moved.

  `census()`  the anti-rot check: every `_MUTABLE` plane must be named by a
      manifest field or by an explicit, justified exclusion. It parses the
      engine's source rather than importing it, so it costs no torch and no
      constructed sim: `python gpu/core/statecompare.py`.

DIGEST ARITHMETIC. Both engines fold 32-bit words with the same mixing
function and ADD the per-row hashes, which is what makes the result
independent of the order the rows were walked in — the GPU's slot order and
TS's array order need never agree. Values are quantised to integers first
(`exact` fields as they stand, `milli` fields as JS Math.round(x*1000)) and
split into two 32-bit halves, so nothing depends on float formatting. The
`exact` and `milli` digests are SEPARATE because a hash cannot carry a
tolerance: an integer disagreement and a float-accumulator disagreement are
different findings and the caller must be able to treat them differently.
"""
from __future__ import annotations

import ast
import json
import math
from pathlib import Path

try:  # the census must stay importable with no numpy on the path
    import numpy as _np
except ImportError:  # pragma: no cover
    _np = None

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "shared" / "statecompare.manifest.json"
ENGINE_PATH = Path(__file__).resolve().parent / "simbase.py"

_MASK = 0xFFFFFFFF
_2_32 = 1 << 32
_VEC_MIN_ROWS = 64


def load_manifest(path: Path = MANIFEST_PATH) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))




def _mix32(h: int) -> int:
    h &= _MASK
    h = ((h ^ (h >> 16)) * 0x85EBCA6B) & _MASK
    h = ((h ^ (h >> 13)) * 0xC2B2AE35) & _MASK
    return (h ^ (h >> 16)) & _MASK


def _step(h: int, x: int) -> int:
    return _mix32(((h & _MASK) ^ (x & _MASK)) + 0x9E3779B9)


def _quantise(v, scale: int) -> int:
    """JS Math.round semantics — half-up toward +inf, matching `js_round` in the
    engine and `Math.round` in the TS twin. Python's own round() is half-to-even
    and would disagree on every .5 boundary."""
    if isinstance(v, bool):
        return 1 if v else 0
    if scale == 1:
        return v if isinstance(v, int) else int(math.floor(float(v) + 0.5))
    return int(math.floor(float(v) * scale + 0.5))


def _fold(h: int, values, scale: int) -> int:
    seq = values if isinstance(values, (list, tuple)) else (values,)
    h = _step(h, len(seq))
    for v in seq:
        q = _quantise(v, scale)
        h = _step(h, q % _2_32)
        h = _step(h, (q // _2_32) & _MASK)
    return h


class _Acc:
    """Order-independent accumulator: per-row hashes are ADDED, and a second
    re-mixed sum widens the result to 64 bits so distinct row sets do not
    collide at 32."""

    def __init__(self) -> None:
        self.a = 0
        self.b = 0

    def add(self, row_hash: int) -> None:
        self.a = (self.a + row_hash) & _MASK
        self.b = (self.b + _mix32(row_hash ^ 0x5BF03635)) & _MASK

    def hex(self) -> str:
        return f"{self.b:08x}{self.a:08x}"




def _civ_seats(sim) -> list[int]:
    return list(range(sim.n_majors))


def _city_rows(sim, b: int) -> list[tuple[int, int]]:
    alive = sim.city_alive[b].tolist()
    rows = []
    for c in _civ_seats(sim):
        rows += [(c, s) for s in range(sim.RC) if alive[c][s]]
    return rows


def _unit_rows(sim, b: int) -> list[int]:
    return [i for i, a in enumerate(sim.unit_alive[b].tolist()) if a]


def _citystate_rows(sim, b: int) -> list[int]:
    alive = sim.citystate_alive[b].tolist()
    return [s for s in range(sim.S) if alive[s]]


def _is_civilian(sim, unit_type: int) -> bool:
    return bool(sim._type_civilian[unit_type])


def group_rows(sim, b: int, group: str) -> list:
    if group == "game":
        return [0]
    if group == "seat":
        return _civ_seats(sim)
    if group == "cityState":
        return _citystate_rows(sim, b)
    if group == "city":
        return _city_rows(sim, b)
    if group == "unit":
        return _unit_rows(sim, b)
    if group == "tile":
        return list(range(sim.T))
    raise KeyError(f"unknown manifest group {group!r}")


def group_keys(sim, b: int, group: str, rows: list) -> list[int]:
    if group == "game":
        return [0]
    if group == "seat":
        return list(rows)
    if group == "cityState":
        return list(rows)
    if group == "city":
        centre = sim.city_center[b].tolist()
        return [centre[c][s] for c, s in rows]
    if group == "unit":
        tile = sim.unit_tile[b].tolist()
        typ = sim.unit_type[b].tolist()
        emb = sim.unit_emb[b].tolist()
        return [tile[i] * 3 + (2 if emb[i] else 1 if _is_civilian(sim, typ[i]) else 0)
                for i in rows]
    if group == "tile":
        return list(rows)
    raise KeyError(f"unknown manifest group {group!r}")


# ---------------------------------------------------------------------------
# extractors. One per manifest field name, per group. Each takes (sim, b, rows)
# and returns one value (int/float) or one vector per row, in `rows` order —
# vectorised deliberately: a per-cell tensor read over every tile every turn is
# the difference between a cheap gate and an unusable one.


def _seat_row(sim, seat: int) -> int:
    return int(sim._seat_row[seat])


def _wars_of(sim, b: int, seat: int) -> list[int]:
    row = sim.war[b, _seat_row(sim, seat)].tolist()
    return sorted(int(sim._ROW_SEAT[j]) for j, on in enumerate(row) if on)


def _war_clock_line(sim, b: int, seat: int) -> list[int]:
    """[opponentSeat, turnsAtWar, ...] — FLATTENED pairs (the wwPairs shape,
    because the digest fold is flat) for every LIVE war of `seat`, in
    ascending opponent-seat order.

    One clock per WAR, so the pair is the key. Only live wars are emitted: a
    settled war's cell is reset by both engines, but comparing a value nothing
    reads would make the digest fail on bookkeeping rather than on rules."""
    row = _seat_row(sim, seat)
    on = sim.war[b, row].tolist()
    wt = sim.war_turns[b, row].tolist()
    pairs = sorted((int(sim._ROW_SEAT[j]), int(wt[j])) for j, w in enumerate(on) if w)
    return [x for p in pairs for x in p]


def _grievance_line(sim, b: int, rows) -> list:
    """[opponentSeat, balance, ...] per seat row, ascending opponent seat, only
    the pairs carrying a live balance. Signed from THIS seat's side: positive
    means that opponent transgressed against it."""
    out = []
    for row in rows:
        line: list[int] = []
        for o in range(sim.n_majors):
            g = int(sim.civ_grievance[b, row, o])
            if o != row and g != 0:
                line.append(int(sim._ROW_SEAT[o]))
                line.append(g)
        out.append(line)
    return out


def _treaty_clock_line(sim, b: int, seat: int) -> list[int]:
    """[opponentSeat, turnsBound, ...] — the same flat shape for the PEACE
    TREATY, over every opponent still bound, in ascending opponent-seat
    order."""
    row = _seat_row(sim, seat)
    tt = sim.treaty_turns[b, row].tolist()
    pairs = sorted((int(sim._ROW_SEAT[j]), int(v)) for j, v in enumerate(tt) if v > 0)
    return [x for p in pairs for x in p]


GAME = {
    "turn": lambda sim, b, rows: [sim.turn],
    "rng": lambda sim, b, rows: [int(sim.rng_state[b])],
    "gameOver": lambda sim, b, rows: [1 if bool(sim.game_over[b]) else 0],
    "victoryType": lambda sim, b, rows: [int(sim.victory_type[b])],
    "victoryRow": lambda sim, b, rows: [int(sim.victory_row[b])],
    "congressSessions": lambda sim, b, rows: [int(sim.congress_sessions[b])],
    "congressSlate": lambda sim, b, rows: [[int(x) for x in sim.congress_slate[b].tolist()]],
    "congressActive": lambda sim, b, rows: [int(x) for x in sim.congress_active[b].reshape(-1).tolist()],
    "emergencyTable": lambda sim, b, rows: _emg_table(sim, b),
    "lastSessionTurn": lambda sim, b, rows: [int(sim.last_session_turn[b])],
    "roadBridges": lambda sim, b, rows: [1 if sim.road_bridged else 0],
    "pantheonsClaimed": lambda sim, b, rows: [int(sim.pantheon_claimed_n[b])],
    "beliefsClaimed": lambda sim, b, rows: [int(sim.claimed_f_n[b]) + int(sim.claimed_o_n[b])],
    "enhancerBeliefsClaimed": lambda sim, b, rows: [int(sim.claimed_e_n[b])],
    "greatPeopleByClass": lambda sim, b, rows: [
        *[[int(i) for i in sim.gp_claimed[b, c, : int(sim._gp_roster[c])].nonzero(as_tuple=True)[0].tolist()]
          for c in range(sim.gp_claimed.shape[1])],
        [int(x) for x in sim.gp_offer[b].tolist()],
        [float(x) for x in sim.gp_price[b].tolist()],
    ],
    "barbCamps": lambda sim, b, rows: [sorted(int(t) for t in sim.camp_tile[b].tolist() if t >= 0)],
    "cityCount": lambda sim, b, rows: [len(_city_rows(sim, b))],
    "unitCount": lambda sim, b, rows: [len(_unit_rows(sim, b))],
    "climatePhase": lambda sim, b, rows: [int(sim.climate_idx[b])],
    "removableAtStart": lambda sim, b, rows: [int(sim._removable_at_start[b])],
    "iceAtStart": lambda sim, b, rows: [int(sim._ice_at_start[b])],
}


def _gov_row(plane: str):
    """One governor-roster plane, per seat row, in catalog order."""
    def get(sim, b, rows):
        t = getattr(sim, plane)[b]
        return [[int(t[c, g]) for g in range(sim.n_governors)] for c in rows]
    return get


def _civ_scalar(plane: str):
    def get(sim, b, rows):
        t = getattr(sim, plane)[b].tolist()
        return [t[c] for c in rows]
    return get


def _civ_mask(plane: str, offset: int = 0):
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [[i + offset for i, on in enumerate(m[c]) if on] for c in rows]
    return get


def _emg_table(sim, b):
    """Sorted by (kind, target, city) and padded to the slot table: the TS list
    is an array in trigger order and the GPU a fixed table, so slot POSITION is
    not a fact either engine owns."""
    live = []
    for k in range(sim.emg_kind.shape[1]):
        kind = int(sim.emg_kind[b, k])
        if kind < 0:
            continue
        mask = lambda pl: sum(1 << i for i in range(sim.n_majors) if bool(pl[b, k, i]))
        live.append((kind, int(sim.emg_target[b, k]), int(sim.emg_city[b, k]),
                     int(sim.emg_phase[b, k]), int(sim.emg_act[b, k]),
                     mask(sim.emg_affected), mask(sim.emg_member)))
    live.sort(key=lambda r: (r[0], r[1], r[2]))
    out = []
    for k in range(sim.emg_kind.shape[1]):
        out.extend(live[k] if k < len(live) else (-1, -1, -1, -1, -1, 0, 0))
    return out


def _emg_rewards(sim, b, rows):
    """What past emergencies left standing: envoy gold, minor-leg gold, then
    the per-seat heal and city-strike counts, both dense over the roster."""
    return [[int(sim.civ_emg_envoy_gold[b, c]), int(sim.civ_emg_route_gold[b, c])]
            + [int(sim.civ_emg_heal[b, c, o]) for o in rows]
            + [int(sim.civ_emg_strike[b, c, o]) for o in rows]
            for c in rows]


def _boosted(sim, b, rows):
    """TS keeps ONE `boosted` list mixing tech and civic ids; the GPU keeps two
    masks. Civics are offset past the tech table so the two spaces cannot
    collide in the merged vector."""
    nt = sim.civ_techs.shape[2]
    tb = sim.civ_tech_boosted[b].tolist()
    cb = sim.civ_civic_boosted[b].tolist()
    return [[i for i, on in enumerate(tb[c]) if on] + [nt + i for i, on in enumerate(cb[c]) if on]
            for c in rows]


def _ww_pairs(plane: str, live):
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        out = []
        for c in rows:
            row = m[_seat_row(sim, c)]
            pairs = []
            for j, v in enumerate(row):
                if live(v):
                    pairs += [int(sim._ROW_SEAT[j]), int(v)]
            out.append(pairs)
        return out
    return get


def _capital_tile(sim, b, rows):
    return [int(sim.civ_cap_tile[b, c]) for c in rows]


def _civ_only(plane: str, absent):
    def get(sim, b, rows):
        t = getattr(sim, plane)[b].tolist()
        return [absent if c == 0 else t[c - 1] for c in rows]
    return get


def _seat_pair_relation(plane: str, live):
    """A seat<->seat [n_majors, n_majors] relation read as a per-seat set of ABSOLUTE
    opponent seats. One index space: the row IS the seat, so seat 0 answers
    like any other and the TS side's `overSeats` walker lines up with it
    without a hole."""
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [sorted(j for j, v in enumerate(m[c]) if live(v)) for c in rows]
    return get



def _deal_line(clock: str, planes: tuple):
    """A DEAL's table, flat: [otherRow, clock, ...slots...] for every row this
    one has one with, in ascending row order. `dealOfferLine` /
    `dealTermLine`'s twin — the bundles are already padded to `_deal_items`
    slots, so both engines emit the same width."""
    def get(sim, b, rows):
        out = []
        for c in rows:
            line: list[int] = []
            for j in range(sim.n_majors):
                if j == c or int(getattr(sim, clock)[b, c, j]) <= 0:
                    continue
                line += [j, int(getattr(sim, clock)[b, c, j])]
                for p in planes:
                    line += [int(x) for x in getattr(sim, p)[b, c, j].reshape(-1).tolist()]
            out.append(line)
        return out
    return get


def _seat_pair_clock(plane: str):
    """A DIPLOMATIC AGREEMENT clock read the flat way the war and treaty clocks
    are: [opponentSeat, turnsLeft, ...] over the majors it still runs with, in
    ascending seat order. Majors-only, so the row index IS the seat."""
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [[x for j, v in enumerate(m[c]) if v > 0 for x in (j, int(v))] for c in rows]
    return get


def _centre_of(sim, b: int, row: int, city_id: int) -> int:
    """The centre TILE of seat row `row`'s city `city_id`, or -1. Routes are
    compared in centre-tile space because `city_id` is not compared at all —
    the city group joins on the centre tile."""
    if city_id < 0:
        return -1
    ids = sim.city_id[b, row].tolist()
    alive = sim.city_alive[b, row].tolist()
    for j, cid in enumerate(ids):
        if alive[j] and int(cid) == city_id:
            return int(sim.city_center[b, row, j])
    return -1


def _routes_of(sim, b: int, seat: int) -> list[int]:
    """Every live route of `seat`, as flattened [fromTile, destTile, kind,
    exp, born, walkTile, leg] rows sorted ascending — the `routes`
    extractor's twin. Kind: 0 domestic, 1 city-state, 2 international.
    `seat_routes[..., 1]` carries the domestic destination city id, or
    -(2 + city-state index), or -1 for international (whose destination is
    the dseat/dcity pair). The walk triple is the Trader: its birth turn,
    current tile and leg (-1 parked, 0 out, 1 home)."""
    row = _seat_row(sim, seat)
    rr = sim.seat_routes[b, row].tolist()
    ds = sim.seat_route_dseat[b, row].tolist()
    dc = sim.seat_route_dcity[b, row].tolist()
    ex = sim.seat_route_exp[b, row].tolist()
    bo = sim.seat_route_born[b, row].tolist()
    wk = sim.seat_route_walk[b, row].tolist()
    lg = sim.seat_route_leg[b, row].tolist()
    out: list[list[int]] = []
    for k, pair in enumerate(rr):
        frm = int(pair[0])
        if frm < 0:
            continue
        raw = int(pair[1])
        d_seat, d_city = int(ds[k]), int(dc[k])
        if raw >= 0:
            kind, dest = 0, _centre_of(sim, b, row, raw)
        elif raw <= -2:
            cs = -raw - 2
            kind = 1
            dest = int(sim.citystate_center[b, cs]) if cs < sim.S else -1
        else:
            kind = 2
            dest = _centre_of(sim, b, d_seat, d_city) if d_seat >= 0 else -1
        out.append([_centre_of(sim, b, row, frm), dest, kind, int(ex[k]), int(bo[k]), int(wk[k]), int(lg[k])])
    out.sort()
    return [x for t in out for x in t]


SEAT = {
    # Fog — the seat_explored [n_majors, T] row per seat, dense 0/1 (the TS
    # extractor renders its empty-array state dense the same way).
    "explored": _civ_scalar("seat_explored"),
    "treasury": _civ_scalar("civ_treasury"),
    "co2": _civ_scalar("civ_co2"),
    "cultureTotal": _civ_scalar("civ_culture"),
    "faith": _civ_scalar("civ_faith"),
    "tourism": _civ_scalar("civ_tourism"),
    "tourismReligious": _civ_scalar("civ_tourism_rel"),
    "tourismTo": lambda sim, b, rows: [
        [int(sim.civ_tourism_to[b, c, o]) if o != c else 0 for o in _civ_seats(sim)] for c in rows],
    "tourismReligiousTo": lambda sim, b, rows: [
        [int(sim.civ_tourism_rel_to[b, c, o]) if o != c else 0 for o in _civ_seats(sim)] for c in rows],
    "rockBandsBought": _civ_scalar("civ_rock_bands"),
    "governorAppointed": _gov_row("civ_gov_appointed"),
    "governorCity": lambda sim, b, rows: [
        [int(sim.civ_gov_city[b, c, g]) if bool(sim.civ_gov_appointed[b, c, g]) else -1
         for g in range(sim.n_governors)] for c in rows],
    "governorEstablish": _gov_row("civ_gov_establish"),
    "governorOut": _gov_row("civ_gov_out"),
    "governorPromotions": _gov_row("civ_gov_promos"),
    "grievances": _grievance_line,
    "diplomaticFavor": _civ_scalar("civ_diplo_favor"),
    "diplomaticPoints": _civ_scalar("civ_diplo_points"),
    "influencePoints": _civ_scalar("civ_influence"),
    "envoysAvailable": _civ_scalar("civ_envoys_avail"),
    "buildersTrained": _civ_scalar("civ_builders_trained"),
    "relicReserve": _civ_scalar("civ_relic_reserve"),
    "emergencyRewards": _emg_rewards,
    "bestMeleeCS": _civ_scalar("civ_best_melee"),
    "techs": _civ_mask("civ_techs"),
    "civics": _civ_mask("civ_civics"),
    "boosted": _boosted,
    "currentTech": _civ_scalar("civ_cur_tech"),
    "currentCivic": _civ_scalar("civ_cur_civic"),
    "techProgress": _civ_scalar("civ_tech_prog"),
    "civicProgress": _civ_scalar("civ_civic_prog"),
    # one LIST per row (the `wars` shape) — flattening across rows would hand
    # row k a single element while the TS side folds the whole table-order
    # vector under that key
    "techRetained": lambda sim, b, rows: [sim.civ_tech_retain[b, c].tolist() for c in rows],
    "civicRetained": lambda sim, b, rows: [sim.civ_civic_retain[b, c].tolist() for c in rows],
    "cityCount": lambda sim, b, rows: [
        sum(1 for a in sim.city_alive[b, c].tolist() if a) for c in rows
    ],
    "wars": lambda sim, b, rows: [_wars_of(sim, b, c) for c in rows],
    "warTurns": lambda sim, b, rows: [_war_clock_line(sim, b, c) for c in rows],
    "treatyTurns": lambda sim, b, rows: [_treaty_clock_line(sim, b, c) for c in rows],
    "peaceTurns": lambda sim, b, rows: [int(sim.peace_turns[b, _seat_row(sim, c)]) for c in rows],
    "conquestProdTurns": lambda sim, b, rows: [int(sim.conquest_turns[b, _seat_row(sim, c)]) for c in rows],
    "warWeariness": _ww_pairs("ww", lambda v: v != 0),
    "warWearinessTurn": _ww_pairs("ww_turn", lambda v: v >= 0),
    "eraScore": _civ_scalar("era_score"),
    "age": _civ_scalar("civ_age"),
    "prevAge": _civ_scalar("prev_age"),
    "dedications": _civ_scalar("dedications"),
    "dedicationPicks": lambda sim, b, rows: [sorted(int(x) for x in sim.ded_picks[b, c].tolist() if x >= 0) for c in rows],
    "capitalTile": _capital_tile,
    "holyTile": lambda sim, b, rows: [int(sim.holy_tile[b, c]) for c in rows],
    # The BIT THE RULES READ, not a proxy for it: every founded-gate in this
    # engine tests `civ_religion_done`, so that is what must match TS's
    # `religion.founded`. Deriving it from `holy_tile` compared a different
    # fact and could not see the two coming apart.
    "religionFounded": lambda sim, b, rows: [1 if bool(sim.civ_religion_done[b, c]) else 0 for c in rows],
    "inquisition": lambda sim, b, rows: [1 if bool(sim.civ_inquisition[b, c]) else 0 for c in rows],
    "pantheonDone": lambda sim, b, rows: [1 if bool(sim.civ_pantheon_done[b, c]) else 0 for c in rows],
    "enhancerDone": lambda sim, b, rows: [1 if bool(sim.civ_enhancer_done[b, c]) else 0 for c in rows],
    "gpPoints": lambda sim, b, rows: [[float(x) for x in sim.civ_gpp[b, c].tolist()] for c in rows],
    "spaceProjects": lambda sim, b, rows: [sum(1 for x in sim.space_done[b, c].tolist() if x) for c in rows],
    "spaceLy": _civ_scalar("space_ly"),
    "laserSpeed": lambda sim, b, rows: [int(sim._laser_speed(c)[b]) for c in rows],
    "laserStations": lambda sim, b, rows: [
        int(sim.city_lasers[b, c, : sim.RC][sim.city_alive[b, c, : sim.RC]].sum()) for c in rows
    ],
    "stockpile": lambda sim, b, rows: [[int(x) for x in sim.civ_stockpile[b, c].tolist()] for c in rows],
    "routeCount": lambda sim, b, rows: [
        sum(1 for r in sim.seat_routes[b, _seat_row(sim, c)].tolist() if r[0] >= 0) for c in rows
    ],
    "routes": lambda sim, b, rows: [_routes_of(sim, b, c) for c in rows],
    "tradingPosts": lambda sim, b, rows: [
        sim.trading_post[b, _seat_row(sim, c)].nonzero(as_tuple=True)[0].tolist() for c in rows
    ],
    "prophets": _civ_scalar("civ_prophets"),
    "gpUsed": _civ_scalar("civ_gp_used"),
    "gpPerm": lambda sim, b, rows: [[int(x) for x in sim.civ_gp_perm[b, c].tolist()] for c in rows],
    "gpLuxuries": lambda sim, b, rows: [
        [int(x) for x in sim.civ_gp_lux[b, c, : int(sim.civ_gp_lux_n[b, c])].tolist()] for c in rows
    ],
    "beliefPantheon": _civ_scalar("civ_pantheon"),
    "beliefFollower": _civ_scalar("civ_follower"),
    "beliefFounder": _civ_scalar("civ_founder"),
    "beliefEnhancer": _civ_scalar("civ_enhancer"),
    "nextCityId": _civ_scalar("civ_next_city_id"),
    "scienceTotal": lambda sim, b, rows: [float(sim.seat_science_total[b, _seat_row(sim, c)]) for c in rows],
    "formalWars": _seat_pair_relation("seat_warkind", lambda v: bool(v)),
    "denounced": _seat_pair_relation("seat_denounced", lambda v: v >= 0),
    "friendTurns": _seat_pair_clock("seat_friend_turns"),
    "allyTurns": _seat_pair_clock("seat_ally_turns"),
    # DIRECTED: the row is what that seat GRANTS, never what it holds.
    "borderTurns": _seat_pair_clock("seat_borders_turns"),
    "delegations": _seat_pair_clock("seat_delegation"),
    "spyHeld": _seat_pair_clock("seat_spy_held"),
    "dealOffers": _deal_line("deal_offer_left", ("deal_offer_give", "deal_offer_ask")),
    "dealTerms": _deal_line("deal_term_left", ("deal_term_item",)),
    "tilesPurchased": _civ_only("civ_only_tiles_purchased", 0),
}


def _citystate_plane(plane: str, minor: bool):
    def get(sim, b, rows):
        t = getattr(sim, plane)[b].tolist()
        if minor:
            m0 = sim._CITY_MINOR0
            return [t[m0 + s][0] for s in rows]
        return [t[s] for s in rows]
    return get


def _csr(plane: str):
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [[m[c][s] for c in _civ_seats(sim)] for s in rows]
    return get


CITY_STATE = {
    "type": lambda sim, b, rows: [int(sim.citystate_type[b, s]) for s in rows],
    "centerIndex": _citystate_plane("city_center", True),
    "population": _citystate_plane("city_pop", True),
    "hp": _citystate_plane("city_hp", True),
    "envoys": _csr("seat_citystate_envoys"),
    "met": _csr("seat_citystate_met"),
    "questKind": _csr("seat_citystate_quest"),
    "questIssued": _csr("seat_citystate_quest_issued"),
    "questCamp": _csr("seat_citystate_quest_camp"),
    "questDistrict": lambda sim, b, rows: [
        [int(sim._citystate_didx[b, s]) if int(sim.seat_citystate_quest[b, c, s]) == 3 else -1
         for c in _civ_seats(sim)] for s in rows],
    "suzerain": lambda sim, b, rows: [int(sim.citystate_suzerain[b, s]) for s in rows],
    "techs": lambda sim, b, rows: [[i for i, on in enumerate(sim.citystate_techs[b, s].tolist()) if on] for s in rows],
    "civics": lambda sim, b, rows: [[i for i, on in enumerate(sim.citystate_civics[b, s].tolist()) if on] for s in rows],
    "techProgress": lambda sim, b, rows: [int(sim.citystate_tech_prog[b, s]) for s in rows],
    "civicProgress": lambda sim, b, rows: [int(sim.citystate_civic_prog[b, s]) for s in rows],
    "religionPressure": lambda sim, b, rows: [
        [int(sim.city_pressure[b, sim._CITY_MINOR0 + s, 0, c]) for c in _civ_seats(sim)] for s in rows],
    "lastLevyTurn": lambda sim, b, rows: [int(sim.citystate_last_levy[b, s]) for s in rows],
    "warTurns": lambda sim, b, rows: [_war_clock_line(sim, b, 100 + s) for s in rows],
    "treatyTurns": lambda sim, b, rows: [_treaty_clock_line(sim, b, 100 + s) for s in rows],
}


def _cty(plane: str):
    def get(sim, b, rows):
        t = getattr(sim, plane)[b].tolist()
        return [t[c][s] for c, s in rows]
    return get


def _queue_cost(sim, b, rows):
    """`queueItemCost` — a BUILDING's price is read live, which is what TS
    does; every other queue kind carries the cost it locked."""
    stored = sim.city_cost[b].tolist()
    cur = sim.city_current[b].tolist()
    live: dict = {}
    out = []
    for c, s in rows:
        if 0 <= cur[c][s] < sim.NB:
            if c not in live:
                live[c] = sim._live_building_cost(c)[b].tolist()
            out.append(live[c][s])
        else:
            out.append(stored[c][s])
    return out


def _spec_rows(sim, b, rows):
    # one _city_specialists call per distinct seat row — the digest asks
    # per city and the recompute walks the tile window
    cache: dict = {}
    out = []
    for c, s in rows:
        if c not in cache:
            cache[c] = sim._city_specialists(c)
        out.append([int(x) for x in cache[c][b, s].tolist()])
    return out


def _qfront(sim, b, c, s):
    # ORACLE: TS's queueTile reads the queue item's own tileIndex for both
    # district and wonder kinds. Here the district pick is city_qtile; a
    # WONDER's completion target lives in the city_wonder registry.
    cur = int(sim.city_current[b, c, s])
    if sim.WONDER_BASE <= cur < sim.PROJECT_BASE:
        return [cur, int(sim.city_wonder[b, c, s, cur - sim.WONDER_BASE])]
    return [cur, int(sim.city_qtile[b, c, s])]


CITY = {
    "seat": lambda sim, b, rows: [c for c, _ in rows],
    "gpPerm": lambda sim, b, rows: [[int(x) for x in sim.city_gp_perm[b, c, s].tolist()] for c, s in rows],
    "population": _cty("city_pop"),
    "hp": _cty("city_hp"),
    "outerHp": _cty("city_outer_hp"),
    "lastHitTurn": _cty("city_last_hit"),
    "projectBoostTurn": _cty("city_boost_turn"),
    "isCapital": _cty("city_is_cap"),
    "foodBox": _cty("city_growth"),
    "cultureBox": _cty("city_cbox"),
    "tilesAcquired": _cty("city_acquired"),
    "origCapitalSeat": _cty("city_orig_cap"),
    "founderSeat": _cty("city_founder"),
    "loyalty": _cty("city_loyalty"),
    "spySources": lambda sim, b, rows: [
        int(sim.city_spy_sources[b, c, s].sum()) for c, s in rows
    ],
    "buildings": lambda sim, b, rows: [
        [i for i, on in enumerate(sim.city_bldg[b, c, s].tolist()) if on] for c, s in rows
    ],
    "productionBank": lambda sim, b, rows: [
        float(sim.city_prod_bank[b, c, s]) for c, s in rows
    ],
    "queueFront": lambda sim, b, rows: [_qfront(sim, b, c, s) for c, s in rows],
    "specialists": _spec_rows,
    "specialistPref": lambda sim, b, rows: [
        [int(x) for x in sim.city_spec_pin[b, c, s].tolist()] for c, s in rows
    ],
    "queueProgress": _cty("city_progress"),
    "queueCost": _queue_cost,
    "followedReligion": _cty("city_followed"),
    "religionPressure": lambda sim, b, rows: [
        [int(x) for x in sim.city_pressure[b, c, s].tolist()] for c, s in rows
    ],
    "greatWorksWriting": _cty("city_gw_writing"),
    "greatWorksArt": _cty("city_gw_art"),
    "greatWorksMusic": _cty("city_gw_music"),
    "powered": lambda sim, b, rows: [1 if sim.city_powered[b, c, s] else 0 for c, s in rows],
    "relics": _cty("city_relics"),
    "artifacts": _cty("city_artifacts"),
    # the museum's provenance, slot by slot: era then civilization, so one
    # row reads [e0, s0, e1, s1, ...] exactly like the TS extractor.
    "artifactProv": lambda sim, b, rows: [
        [int(x) for i in range(sim._artifact_slots)
         for x in (sim.city_artifact_era[b, c, s, i], sim.city_artifact_seat[b, c, s, i])]
        for c, s in rows
    ],
    # the ART MUSEUM's provenance, slot by slot: type then artist.
    "gwArtProv": lambda sim, b, rows: [
        [int(x) for i in range(sim._gw_slots_k[1])
         for x in (sim.city_gwart_type[b, c, s, i], sim.city_gwart_artist[b, c, s, i])]
        for c, s in rows
    ],
}


def _unit(plane: str):
    def get(sim, b, rows):
        if _np is not None:
            return getattr(sim, plane)[b].numpy()[_np.asarray(rows, dtype=_np.int64)]
        t = getattr(sim, plane)[b].tolist()  # pragma: no cover — numpy rides with torch
        return [t[i] for i in rows]
    return get


UNIT = {
    "seat": _unit("unit_seat"),
    "type": _unit("unit_type"),
    "hp": _unit("unit_hp"),
    "charges": _unit("unit_charges"),
    "fortifyTurns": _unit("unit_fortify"),
    "xp": _unit("unit_xp"),
    "level": _unit("unit_level"),
    "promos": _unit("unit_promos"),
    "promoOffer": _unit("unit_promo_offer"),
    "promoUsed": _unit("unit_promo_used"),
    "xpPct": _unit("unit_xp_pct"),
    "embarked": _unit("unit_emb"),
    "movesLeft": _unit("unit_mp"),
    "movesFull": _unit("unit_mp_full"),
    "attacksLeft": _unit("unit_attacks"),
    "spyMission": _unit("unit_spy_mission"),
    "spyTurns": _unit("unit_spy_turns"),
    "spyTarget": _unit("unit_spy_target"),
    "spyLevel": _unit("unit_spy_level"),
    "bandLevel": _unit("unit_band_level"),
    "bandAlbum": _unit("unit_band_album"),
    "gpAt": _unit("unit_gp_at"),
    "revealedTurn": _unit("unit_revealed_turn"),
    "formation": _unit("unit_formation"),
        "escorted": _unit("unit_escorted"),
}


def _tile(plane: str):
    # A zero-copy numpy VIEW of the live row — the fold consumes it before
    # the sim mutates again, and it skips boxing 1144 values per field per
    # game per turn into a Python list only to array them right back.
    def get(sim, b, rows):
        if _np is not None:
            return getattr(sim, plane)[b].numpy()
        return getattr(sim, plane)[b].tolist()  # pragma: no cover
    return get


def _prov(era: str, seat: str):
    # Two C-level passes instead of 2*T scalar tensor reads, for the same
    # uniform 2-element rows the vector fold path already handles.
    def get(sim, b, rows):
        return [[e, s] for e, s in zip(getattr(sim, era)[b].tolist(),
                                       getattr(sim, seat)[b].tolist())]
    return get


def _owner_city(sim, b, rows):
    if _np is not None:
        seat = sim.tile_seat[b].numpy()
        return _np.where((seat >= 0) & (seat < 100), sim.tile_city[b].numpy(), -1)
    seat = sim.tile_seat[b].tolist()
    city = sim.tile_city[b].tolist()
    return [city[t] if 0 <= seat[t] < 100 else -1 for t in rows]


TILE = {
    "ownerSeat": _tile("tile_seat"),
    "ownerCity": _owner_city,
    "improvement": _tile("improvement"),
    "pillaged": _tile("pillaged"),
    "district": _tile("district"),
    "districtComplete": _tile("district_complete"),
    "districtPillaged": _tile("district_pillaged"),
    "builtWonder": _tile("built_wonder"),
    "builtWonderComplete": _tile("built_wonder_complete"),
    "antiquity": _tile("antiquity"),
    "antiquityProv": _prov("antiquity_era", "antiquity_seat"),
    "shipwreck": _tile("shipwreck"),
    "shipwreckProv": _prov("shipwreck_era", "shipwreck_seat"),
    "park": _tile("park"),
    "encampHp": _tile("encamp_hp"),
    "encampOuterHp": _tile("encamp_outer_hp"),
    "road": _tile("road"),
    "locked": _tile("tile_locked"),
    "fertility": _tile("fertility"),
    "fertilityProd": _tile("fertility_prod"),
    "droughtTurns": _tile("drought"),
    "hasFeature": lambda sim, b, rows: ((sim.feat_id[b] >= 0) & ~sim.feat_stripped[b]).long().numpy(),
    "lowland": lambda sim, b, rows: sim.tile_lowland[b].long().numpy(),
    "flooded": lambda sim, b, rows: sim.tile_flooded[b].long().numpy(),
    "floodCount": lambda sim, b, rows: sim.tile_flood_ct[b].numpy(),
    "airSlotBonus": lambda sim, b, rows: sim.tile_air_bonus[b].numpy(),
    "hasResource": lambda sim, b, rows: ((sim.res_cat[b] != 0) & ~sim.res_stripped[b]).long().numpy(),
}

EXTRACTORS = {"game": GAME, "seat": SEAT, "cityState": CITY_STATE, "city": CITY, "unit": UNIT, "tile": TILE}




def check_extractors(manifest: dict | None = None) -> None:
    """Every manifest field must have an extractor and every extractor a
    manifest field; a missing name on either side raises."""
    man = manifest or load_manifest()
    declared = {g["name"]: {f["name"] for f in g["fields"]} for g in man["groups"]}
    if set(declared) != set(EXTRACTORS):
        raise AssertionError(
            f"manifest groups {sorted(declared)} vs GPU extractor groups {sorted(EXTRACTORS)}"
        )
    for g, names in declared.items():
        have = set(EXTRACTORS[g])
        if names != have:
            raise AssertionError(
                f"group {g!r}: manifest-only fields {sorted(names - have)}, "
                f"extractor-only fields {sorted(have - names)}"
            )


def _mix32_np(h):
    h = h & _MASK
    h = ((h ^ (h >> 16)) * 0x85EBCA6B) & _MASK
    h = ((h ^ (h >> 13)) * 0xC2B2AE35) & _MASK
    return (h ^ (h >> 16)) & _MASK


def _step_np(h, x):
    return _mix32_np(((h & _MASK) ^ (x & _MASK)) + 0x9E3779B9)


def _q_np(arr, scale: int):
    if arr.dtype.kind == "f":
        return _np.floor(arr * scale + 0.5).astype(_np.int64)
    q = arr.astype(_np.int64)
    return q * scale if scale != 1 else q


def _chain_np(keys, cols):
    """The per-row hash chains in PARALLEL — the identical arithmetic on
    int64 vectors (multiplication wraps mod 2^64; `& _MASK` right after makes
    that exactly mod-2^32, which is all `_mix32` ever keeps). Returns the
    {exact, milli} per-row hash vectors.

    Scalar columns fold as one vector; a UNIFORM-length list column folds as
    `len` plus one vector per element position (every row's chain has the
    same shape, so the rows stay parallel); a RAGGED column drops to a
    per-row loop for that column alone. Returns None only on value types
    none of those paths handle — the digest VALUE is the seam and must not
    depend on which path ran.
    """
    qs = []
    for cmp, vals in cols:
        scale = 1000 if cmp == "milli" else 1
        try:
            arr = _np.asarray(vals)
        except ValueError:
            arr = _np.empty(0, dtype=object)  # ragged — take the per-row path
        if arr.dtype.kind in "ifb" and arr.ndim in (1, 2):
            qs.append((cmp, "vec", _q_np(arr, scale)))
        elif len(vals) and all(isinstance(v, (list, tuple)) for v in vals):
            qs.append((cmp, "ragged", [[_quantise(x, scale) for x in v] for v in vals]))
        else:
            return None
    k = _np.asarray(keys, dtype=_np.int64)
    seed = _step_np(_np.int64(0x811C9DC5), k % _2_32)
    h = {"exact": seed.copy(), "milli": seed.copy()}
    for i, (cmp, kind, q) in enumerate(qs):
        t = _step_np(h[cmp], _np.int64(i))
        if kind == "vec":
            cols2d = q.reshape(len(k), -1) if q.ndim == 2 else q.reshape(len(k), 1)
            t = _step_np(t, _np.int64(cols2d.shape[1]))  # _fold's len(seq)
            for j in range(cols2d.shape[1]):
                qj = cols2d[:, j]
                t = _step_np(t, qj % _2_32)
                t = _step_np(t, (qj // _2_32) & _MASK)
        else:  # ragged: chain LENGTH differs per row — scalar per row
            t = t.copy()
            for r, seq in enumerate(q):
                hr = int(t[r])
                hr = _step(hr, len(seq))
                for v in seq:
                    hr = _step(hr, v % _2_32)
                    hr = _step(hr, (v // _2_32) & _MASK)
                t[r] = hr
        h[cmp] = t
    return h


def _acc_hex(h_seg) -> str:
    a = int(h_seg.sum()) & _MASK
    b = int(_mix32_np(h_seg ^ 0x5BF03635).sum()) & _MASK
    return f"{b:08x}{a:08x}"


def _fold_rows_np(keys, cols) -> dict | None:
    """`fold_rows` with the rows in parallel — `_chain_np` plus the summed
    accumulators."""
    if _np is None:
        return None
    # Below ~64 rows the per-op numpy overhead LOSES to the scalar loop —
    # the seat/city/game groups are 1-15 rows and vectorising them QUADRUPLED
    # digest time. The vector path exists for the tile group's 1144 rows, the
    # unit group's mid-game hundreds — and `fold_rows_multi`, whose
    # whole-batch concatenation clears the floor for every group.
    if len(keys) < _VEC_MIN_ROWS:
        return None
    h = _chain_np(keys, cols)
    if h is None:
        return None
    return {cmp: _acc_hex(h[cmp]) for cmp in ("exact", "milli")}


def fold_rows_multi(per_b) -> list | None:
    """`fold_rows` for EVERY game of a batch in one vector pass. A row's
    chain never reads the game, so the games' rows concatenate into one
    `_chain_np` call and each game's accumulators are its contiguous
    segment's sums — same bits as `fold_rows` per game. None (numpy absent,
    too few total rows, or a value type the chain declines) means: take the
    per-game path instead.

    `per_b[b]` is `(keys, cols)` exactly as `fold_rows` takes them, every
    game over the SAME column list (one manifest group)."""
    if _np is None:
        return None
    lens = [len(k) for k, _ in per_b]
    if sum(lens) < _VEC_MIN_ROWS:
        return None
    keys = [k for ks, _ in per_b for k in ks]
    cols = []
    for i in range(len(per_b[0][1])):
        cmp = per_b[0][1][i][0]
        parts = [cs[i][1] for _, cs in per_b if len(cs[i][1])]
        if parts and all(isinstance(p, _np.ndarray) for p in parts):
            try:
                cat = _np.concatenate(parts)
            except ValueError:
                return None  # shape-mismatched games — per-game path
        else:
            cat = []
            for p in parts:
                cat.extend(p.tolist() if isinstance(p, _np.ndarray) else list(p))
        if len(cat) != len(keys):
            return None
        cols.append((cmp, cat))
    h = _chain_np(keys, cols)
    if h is None:
        return None
    out = []
    off = 0
    for n in lens:
        out.append({cmp: _acc_hex(h[cmp][off:off + n]) for cmp in ("exact", "milli")})
        off += n
    return out


def fold_rows(keys, cols) -> dict:
    """The digest arithmetic itself, over already-extracted columns. THE seam
    the two engines must agree on bit for bit — `cpu/core/statecompare.ts`'s
    `foldRows` is the same function, and feeding both the same keys and columns
    is how that is checked without either of them running a game.

    `cols[i]` is `(compare, vals)` and `vals[r]` is field i's value for row r.
    Column ORDER is folded in, so two fields swapping places changes the digest;
    ROW order is not, because the per-row hashes are summed.

    Groups above the row floor take `_fold_rows_np` (the tile group is 1144
    rows x 16 fields, every turn, every game — the scalar loop was half the
    serve lane's wall); small groups keep the loop below, unless a whole
    batch folds at once through `fold_rows_multi`. Same bits every way.
    """
    vec = _fold_rows_np(keys, cols)
    if vec is not None:
        return vec
    accs = {"exact": _Acc(), "milli": _Acc()}
    for r in range(len(keys)):
        seed = _step(0x811C9DC5, keys[r] % _2_32)
        h = {"exact": seed, "milli": seed}
        for i, (cmp, vals) in enumerate(cols):
            h[cmp] = _fold(_step(h[cmp], i), vals[r], 1000 if cmp == "milli" else 1)
        accs["exact"].add(h["exact"])
        accs["milli"].add(h["milli"])
    return {"exact": accs["exact"].hex(), "milli": accs["milli"].hex()}


def state_digest(sim, b: int, manifest: dict | None = None, include_gaps: bool = False) -> dict:
    """Per-group `exact` and `milli` digests for game `b`.

    Both digests are order-independent, so the GPU's slot order and TS's array
    order need never agree — only the KEYED CONTENT has to.
    """
    man = manifest or load_manifest()
    out: dict[str, dict] = {}
    for g in man["groups"]:
        name = g["name"]
        rows = group_rows(sim, b, name)
        keys = group_keys(sim, b, name, rows)
        cols = [(f["compare"], EXTRACTORS[name][f["name"]](sim, b, rows))
                for f in g["fields"] if include_gaps or "gap" not in f]
        out[name] = dict(fold_rows(keys, cols), rows=len(rows))
    return out


def state_digest_all(sim, manifest: dict | None = None, include_gaps: bool = False) -> list[dict]:
    """`state_digest` for every game of the batch — one `fold_rows_multi`
    pass per group instead of a per-game scalar loop (the serve gate digests
    every game every turn, and the sub-floor groups' Python folds were the
    cost). Extraction stays per game because the row sets differ."""
    man = manifest or load_manifest()
    outs: list[dict] = [{} for _ in range(sim.B)]
    for g in man["groups"]:
        name = g["name"]
        fields = [f for f in g["fields"] if include_gaps or "gap" not in f]
        per_b = []
        for b in range(sim.B):
            rows = group_rows(sim, b, name)
            keys = group_keys(sim, b, name, rows)
            per_b.append((keys, [(f["compare"], EXTRACTORS[name][f["name"]](sim, b, rows))
                                 for f in fields]))
        digs = fold_rows_multi(per_b)
        if digs is None:
            digs = [fold_rows(k, c) for k, c in per_b]
        for b in range(sim.B):
            outs[b][name] = dict(digs[b], rows=len(per_b[b][0]))
    return outs


def _py(v):
    """Plain-Python view of an extractor value — the extractors return numpy
    scalars/arrays (the fold path's zero-copy contract) and this dump path is
    the one consumer that must json-serialize them."""
    if _np is not None:
        if isinstance(v, _np.ndarray):
            return v.tolist()
        if isinstance(v, _np.generic):
            return v.item()
    if isinstance(v, (list, tuple)):
        return [_py(x) for x in v]
    return v


def group_dump(sim, b: int, group: str, manifest: dict | None = None, include_gaps: bool = False) -> dict:
    man = manifest or load_manifest()
    g = next(x for x in man["groups"] if x["name"] == group)
    rows = group_rows(sim, b, group)
    keys = group_keys(sim, b, group, rows)
    fields = [f for f in g["fields"] if include_gaps or "gap" not in f]
    cols = {f["name"]: EXTRACTORS[group][f["name"]](sim, b, rows) for f in fields}
    return {_py(keys[r]): {n: _py(v[r]) for n, v in cols.items()} for r in range(len(rows))}




def engine_mutable(path: Path = ENGINE_PATH) -> list[str]:
    """`_MUTABLE` read out of the engine's SOURCE. Parsing beats importing here:
    the census must be runnable without torch and without a constructed sim, and
    the list is a module-level literal either way."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "_MUTABLE":
            return [e.value for e in node.value.elts]
    raise AssertionError(f"no module-level _MUTABLE list in {path}")


def census(manifest: dict | None = None) -> list[str]:
    man = manifest or load_manifest()
    covered: set[str] = set()
    for g in man["groups"]:
        for f in g["fields"]:
            covered |= set(f.get("planes", []))
    excluded = {e["plane"] for e in man["exclusions"]["gpu"]}
    mutable = engine_mutable()

    bad: list[str] = []
    for plane in sorted(set(mutable) - covered - excluded):
        bad.append(f"UNCOVERED plane {plane!r}: name it in a manifest field's `planes`, or exclude it with a reason")
    for plane in sorted(covered & excluded):
        bad.append(f"plane {plane!r} is BOTH covered and excluded — one of the two justifications is stale")
    for plane in sorted((covered | excluded) - set(mutable)):
        bad.append(f"manifest names plane {plane!r}, which is not in _MUTABLE — it was renamed or deleted")
    for e in man["exclusions"]["gpu"]:
        if not e.get("why"):
            bad.append(f"excluded plane {e['plane']!r} carries no reason")
    # DEPTH, not just naming. Coverage above proves a plane is NAMED by some
    # field; it cannot prove the field's extractor reads it. A field naming
    # several planes is where the two come apart — one that compares a COUNT
    # over four planes reads as covered while three of them go unverified — so
    # a multi-plane field must say in its `note` what it actually compares.
    for g in man["groups"]:
        for f in g["fields"]:
            if len(f.get("planes", [])) > 1 and not f.get("note"):
                bad.append(
                    f"field {g['name']}.{f['name']!r} names {len(f['planes'])} planes with no `note` — "
                    "state what it compares, or split it into one field per fact")
    return bad


def _fold_ab_check() -> list[str]:
    """The vectorised fold against the scalar fold, on adversarial columns —
    negatives, floats on both scales, bools, empty row sets, values above
    2^32. One digest arithmetic, two implementations; any split is a bug in
    the numpy path, never a manifest problem."""
    if _np is None:
        return []
    cases = [
        ([0], [("exact", [0])]),
        ([3, 7, 11], [("exact", [-1, 0, 2]), ("milli", [0.05, -2.5, 1e6]),
                      ("exact", [True, False, True]), ("exact", [2**33 + 5, -(2**33), 7])]),
        ([2288], [("exact", [123456.789]), ("milli", [-0.0005])]),
        ([], [("exact", []), ("milli", [])]),
        (list(range(1144)), [("exact", list(range(-500, 644))),
                             ("milli", [i * 0.001 for i in range(1144)])]),
        # list-valued columns: uniform (vectorised), empty, and ragged
        # (per-row path) — plus a scalar column beside them in one group
        ([5, 6], [("exact", [[1, 2], [3, 4]]), ("exact", [[], []]), ("exact", [7, -8])]),
        ([5, 6, 9], [("milli", [[0.5], [1.5, -2.5], []]), ("exact", [[2**33], [0], [1, 2, 3]])]),
    ]
    out = []
    global _VEC_MIN_ROWS
    keep_min = _VEC_MIN_ROWS
    _VEC_MIN_ROWS = 0  # the check exercises the ARITHMETIC on small rows too
    try:
        # A column no path handles must DECLINE, so fold_rows keeps the loop.
        if _fold_rows_np([5, 6], [("exact", [[1], "x"])]) is not None:
            out.append("fold A/B: np path accepted a mixed-type column")
        return out + _fold_ab_cases(cases) + _fold_multi_ab(cases)
    finally:
        _VEC_MIN_ROWS = keep_min


def _fold_ab_cases(cases) -> list[str]:
    out = []
    for keys, cols in cases:
        vec = _fold_rows_np(keys, cols)
        ref = {"exact": _Acc(), "milli": _Acc()}
        for r in range(len(keys)):
            seed = _step(0x811C9DC5, keys[r] % _2_32)
            h = {"exact": seed, "milli": seed}
            for i, (cmp, vals) in enumerate(cols):
                h[cmp] = _fold(_step(h[cmp], i), vals[r], 1000 if cmp == "milli" else 1)
            ref["exact"].add(h["exact"])
            ref["milli"].add(h["milli"])
        want = {"exact": ref["exact"].hex(), "milli": ref["milli"].hex()}
        if vec != want:
            out.append(f"fold A/B split on keys[:3]={keys[:3]}: np {vec} vs scalar {want}")
    return out


def _fold_multi_ab(cases) -> list[str]:
    """Every case becomes a 3-game batch — front half, back half, an EMPTY
    game — and `fold_rows_multi` per game must equal `fold_rows` per game.
    A decline (None) is not a complaint: the caller falls back per game."""
    out = []
    for keys, cols in cases:
        cut = len(keys) // 2
        per_b = [(keys[lo:hi], [(cmp, vals[lo:hi]) for cmp, vals in cols])
                 for lo, hi in ((0, cut), (cut, len(keys)), (len(keys), len(keys)))]
        got = fold_rows_multi(per_b)
        if got is not None:
            want = [fold_rows(k, c) for k, c in per_b]
            if got != want:
                out.append(f"fold MULTI split on keys[:3]={keys[:3]}: {got} vs per-game {want}")
    return out


def _main() -> int:
    man = load_manifest()
    bad = census(man)
    bad += _fold_ab_check()
    try:
        check_extractors(man)
    except AssertionError as exc:
        bad.append(str(exc))
    n_planes = sum(len(f.get("planes", [])) for g in man["groups"] for f in g["fields"])
    n_fields = sum(len(g["fields"]) for g in man["groups"])
    if bad:
        for line in bad:
            print(line)
        print(f"STATE-COMPARE CENSUS (GPU) RED — {len(bad)} complaint(s)")
        return 1
    print(
        f"STATE-COMPARE CENSUS (GPU) OK — {n_fields} manifest fields over {len(man['groups'])} groups "
        f"name {n_planes} of the {len(engine_mutable())} _MUTABLE planes; "
        f"{len(man['exclusions']['gpu'])} are excluded with a reason"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
