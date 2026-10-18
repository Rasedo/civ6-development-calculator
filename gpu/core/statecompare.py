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

import numpy as _np

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "shared" / "statecompare.manifest.json"
ENGINE_PATH = Path(__file__).resolve().parent / "simbase.py"

_MASK = 0xFFFFFFFF
_2_32 = 1 << 32
# the row floor below which the scalar fold beats the numpy one. Measured
# on a turn-220 state: 16 and 32 beat 64 at B=1 and through
# `fold_rows_multi` at B=3; 8 loses (the 9-row seat and city-state groups
# go vector and pay numpy's per-op overhead). The check at the bottom of the
# file sets it to 0 to exercise the arithmetic on every group.
_VEC_MIN_ROWS = 16


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


def _chain(h: int, words) -> int:
    """`_step` over `words` in order, inlined: every word must already be in
    [0, 2^32), which `_words` guarantees."""
    for x in words:
        h = ((h ^ x) + 0x9E3779B9) & _MASK
        h = ((h ^ (h >> 16)) * 0x85EBCA6B) & _MASK
        h = ((h ^ (h >> 13)) * 0xC2B2AE35) & _MASK
        h ^= h >> 16
    return h


def _words(out: list, values, scale: int) -> None:
    """Append the words `_fold` steps over for one field value: its length,
    then each quantised value's low and high 32-bit halves."""
    seq = values if isinstance(values, (list, tuple)) else (values,)
    out.append(len(seq))
    for v in seq:
        q = v if scale == 1 and type(v) is int else _quantise(v, scale)
        out.append(q % _2_32)
        out.append((q // _2_32) & _MASK)


def _fold(h: int, values, scale: int) -> int:
    """One field value folded `_step` by `_step` — the reference arithmetic
    `_fold_ab_check` holds the word-list and numpy paths to."""
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
    # the majors' cities, then the Free Cities row's — TS's `cityHolders` order
    alive = sim.city_alive[b].tolist()
    rows = []
    for c in (*_civ_seats(sim), sim.FREE_ROW):
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
        sup = sim._type_support.tolist()
        # FOUR slots per tile — the stacking rule allows four classes, so the
        # key has to carry four or two units merge into one row. An AIR or SPY
        # unit holds no plot and keys where it always did, slot 0.
        return [tile[i] * 4 + (3 if emb[i] else 2 if sup[typ[i]]
                               else 1 if _is_civilian(sim, typ[i]) and not sup[typ[i]]
                               else 0)
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


def _batch_rows(sim, tag: str, c: int, fn) -> list:
    """`fn(c)` — a WHOLE-BATCH tensor for seat row `c` — as nested lists,
    derived once per `state_digest_all` (its memo, keyed by `tag` and the
    row) rather than once per game; uncached outside it."""
    memo = sim._dg_memo
    if memo is None:
        return fn(c).tolist()
    key = (tag, c)
    if key not in memo:
        memo[key] = fn(c).tolist()
    return memo[key]


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


def _unit_pools_row(sim, b: int) -> list[int]:
    """`unitPools`: each live city-state's unit pool by id, then the Free
    Cities' (`poolSlots`) — its size, its free slots, those waiting to go
    free, each unit's slot in unit order."""

    def row(k: int, pre: str, seat: int) -> list[int]:
        nf = int(sim.seat_pool_nfree[b, k])
        free = [int(x) for x in sim.seat_pool_free[b, k, :nf].tolist()]
        dying = sim.seat_pool_dying[b, k].nonzero().flatten().tolist()
        alive = getattr(sim, f"{pre}_unit_alive")[b].tolist()
        seats = getattr(sim, f"{pre}_unit_seat")[b].tolist()
        slots = [int(n) for a, s_, n in zip(alive, seats, getattr(sim, f"{pre}_unit_pslot")[b].tolist())
                 if a and s_ == seat]
        return [int(sim.seat_pool_size[b, k]), nf, *free, len(dying), *dying, len(slots), *slots]

    out: list[int] = []
    for s in range(sim.S):
        if bool(sim.citystate_alive[b, s]):
            out += [s, *row(s, "major", 100 + s)]
    return out + row(sim.S, "barb", int(sim._ROW_SEAT[sim.FREE_ROW]))


def _research_record(sim, b: int, s: int) -> list:
    """`researchRecord`'s twin for research row `s`: the techs held behind
    their count, the civics held behind theirs, each tree's progress, the
    items in hand, the goal, the overflows, the AI's turns left, the progress
    kept per row, then each AI's last analysis behind a flag"""
    techs = [i for i, on in enumerate(sim.citystate_techs[b, s].tolist()) if on]
    civics = [i for i, on in enumerate(sim.citystate_civics[b, s].tolist()) if on]
    out = [len(techs), *techs, len(civics), *civics,
           float(sim.citystate_tech_prog[b, s]), float(sim.citystate_civic_prog[b, s]),
           int(sim.citystate_cur_tech[b, s]), int(sim.citystate_cur_civic[b, s]), int(sim.citystate_tech_goal[b, s]),
           float(sim.citystate_tech_ovf[b, s]), float(sim.citystate_civic_ovf[b, s]),
           int(sim.citystate_ai_left[b, s]), int(sim.citystate_ai_left_seen[b, s]),
           *sim.citystate_tech_retain[b, s].tolist(), *sim.citystate_civic_retain[b, s].tolist()]
    tv = bool(sim.citystate_ai_valid[b, s])
    out.append(1 if tv else 0)
    if tv:
        out += [v for t in range(sim.citystate_ai_turns.shape[2]) for v in (
            int(sim.citystate_ai_turns[b, s, t]), int(sim.citystate_ai_next[b, s, t]), int(sim.citystate_ai_base[b, s, t]),
            int(sim.citystate_ai_score[b, s, t]), int(sim.citystate_ai_owned[b, s, t]))]
    cv = bool(sim.citystate_cai_valid[b, s])
    out.append(1 if cv else 0)
    if cv:
        out += [v for c in range(sim.citystate_cai_turns.shape[2]) for v in (
            int(sim.citystate_cai_turns[b, s, c]), int(sim.citystate_cai_next[b, s, c]), int(sim.citystate_cai_base[b, s, c]),
            int(sim.citystate_cai_score[b, s, c]), int(sim.citystate_cai_owned[b, s, c]))]
    return out


def _barb_tribes_row(sim, b: int) -> list[int]:
    """`barbTribes`: whether the camp step has added once, each tribe in order
    (plot, alive, kind, name, its two clocks, the living units and scouts it
    raised), then the barbarians' techs and civics, each behind its length."""
    lo, hi = sim.POOL_LO["barb"], sim.POOL_HI["barb"]
    alive = sim.unit_alive[b, lo:hi].tolist()
    tribe = sim.barb_unit_tribe[b].tolist()
    scout = sim.barb_unit_scout[b].tolist()
    row = [int(sim.barb_camps_begun[b]), int(sim.n_tribes[b])]
    for k in range(int(sim.n_tribes[b])):
        units = sum(1 for a, t, sc in zip(alive, tribe, scout) if a and t == k and not sc)
        scouts = sum(1 for a, t, sc in zip(alive, tribe, scout) if a and t == k and sc)
        row += [int(sim.tribe_plot[b, k]), int(sim.tribe_alive[b, k]), int(sim.tribe_kind[b, k]),
                int(sim.tribe_name[b, k]), int(sim.tribe_spawn[b, k]), int(sim.tribe_scoutc[b, k]), units, scouts]
        # the raid and the city assault
        queue = [int(x) for x in sim.tribe_queue[b, k].tolist() if x >= 0]
        raidq = [int(x) for x in sim.tribe_raidq[b, k].tolist() if x >= 0]
        raidp = [int(p) for x, p in zip(sim.tribe_raidq[b, k].tolist(), sim.tribe_raidp[b, k].tolist()) if x >= 0]
        assq = [int(x) for x in sim.tribe_assq[b, k].tolist() if x >= 0]
        assp = [int(p) for x, p in zip(sim.tribe_assq[b, k].tolist(), sim.tribe_assp[b, k].tolist()) if x >= 0]
        op = int(sim.tribe_op[b, k]) if not bool(sim.tribe_op_done[b, k]) else 0
        opu = sum(1 for a, t, o in zip(alive, tribe, sim.barb_unit_op[b].tolist()) if a and t == k and o)
        dead = int(sim.tribe_op_dead[b, k]) + sum(1 for a, t, o in zip(alive, tribe, sim.barb_unit_op[b].tolist())
                                                  if not a and t == k and o)
        # the scout's tree (`barbHomingRecord`)
        home = ([int(sim.tribe_home_seat[b, k]), int(sim.tribe_home_plot[b, k]), int(sim.tribe_home_id[b, k]),
                 int(sim.tribe_home_resume[b, k]), int(sim.tribe_home_mu[b, k])]
                if int(sim.tribe_home_slot[b, k]) != -1 else [-1, -1, -1, -1, -1])
        # the operation on the manager (`barbOpRecord`)
        oper = ([op, int(sim.tribe_op_seat[b, k]), int(sim.tribe_op_plot[b, k]), int(sim.tribe_rally[b, k]),
                 int(sim.tribe_op_seat[b, k]) if op == 2 else -1, int(sim.tribe_op_id[b, k]), int(sim.tribe_op_resume[b, k]),
                 int(sim.tribe_op_rstart[b, k]), int(sim.tribe_raid_from[b, k]), opu, dead]
                if op else [0, -1, -1, -1, -1, -1, -1, -1, -1, 0, 0])
        row += [int(sim.tribe_bold[b, k]), int(sim.tribe_every[b, k]), len(queue), *queue,
                len(raidq), *raidq, *raidp, len(assq), *assq, *assp, *home,
                int(sim.tribe_score[b, k]), *oper,
                int(sim.tribe_ramp[b, k])]
    row += [int(x) for x in sim.barb_spot_next[b, : sim.n_majors].tolist()]
    row += [int(sim.barb_tree_next[b])]
    techs = sim.barb_techs[b].nonzero().flatten().tolist()
    civics = sim.barb_civics[b].nonzero().flatten().tolist()
    row += [len(techs), *techs, len(civics), *civics]
    # the unit pool (`barbSlots`): its size, its free slots, those waiting to
    # go free, each unit's slot in unit order; each tribe's camp defender alive
    nf = int(sim.barb_pool_nfree[b])
    free = [int(x) for x in sim.barb_pool_free[b, :nf].tolist()]
    dying = sim.barb_pool_dying[b].nonzero().flatten().tolist()
    seat = sim.barb_unit_seat[b].tolist()
    slotno = sim.barb_unit_slotno[b].tolist()
    barb = int(sim._ROW_SEAT[sim.BARB_ROW])
    slots = [int(n) for a, s, n in zip(alive, seat, slotno) if a and s == barb]
    defs = []
    for k in range(int(sim.n_tribes[b])):
        d = int(sim.tribe_defender[b, k])
        defs.append(1 if d >= 0 and alive[d] and seat[d] == barb else 0)
    return row + [int(sim.barb_pool_size[b]), nf, *free, len(dying), *dying, len(slots), *slots, *defs]


GAME = {
    "turn": lambda sim, b, rows: [sim.turn],
    "rng": lambda sim, b, rows: [int(sim.rng_state[b])],
    "gameOver": lambda sim, b, rows: [1 if bool(sim.game_over[b]) else 0],
    "victoryType": lambda sim, b, rows: [int(sim.victory_type[b])],
    "victoryRow": lambda sim, b, rows: [int(sim.victory_row[b])],
    "congressSessions": lambda sim, b, rows: [int(sim.congress_sessions[b])],
    # ONE row, so ONE outer list. The game group has a single row and the
    # fold reads `vals[0]`: a FLAT list would compare only its first element
    # (the competition's kind, the first resolution's id, the first
    # emergency's kind, the first class's claimed list), so `fold_rows`
    # refuses that shape on both engines.
    "competition": lambda sim, b, rows: [(
        [int(sim.comp_kind[b]), int(sim.comp_left[b]), int(sim.comp_target[b])]
        + [float(sim.comp_score[b, r]) for r in range(sim.n_majors)]
        + [int(bool(sim.comp_member[b, r])) for r in range(sim.n_majors)])],
    "congressActive": lambda sim, b, rows: [[int(x) for x in sim.congress_active[b].reshape(-1).tolist()]],
    "emergencyTable": lambda sim, b, rows: [_emg_table(sim, b)],
    "lastSessionTurn": lambda sim, b, rows: [int(sim.last_session_turn[b])],
    "roadTier": lambda sim, b, rows: [int(sim.road_tier[b])],
    "gameEra": lambda sim, b, rows: [[int(sim.game_era[b]), int(sim.era_start[b]), int(sim.era_countdown[b])]],
    "momentsWorld": lambda sim, b, rows: [[k for k, x in enumerate(sim.moment_world[b].tolist()) if x]],
    "pantheonsClaimed": lambda sim, b, rows: [int(sim.pantheon_claimed_n[b])],
    # the four religion classes' claim masks, summed: TS keeps one list
    "beliefsClaimed": lambda sim, b, rows: [sum(int(m[b, :n].sum()) for m, _ids, n in sim._bel_pools())],
    # one flat row: each class's claimed list behind its LENGTH (the lists
    # vary), then the offer, price and passed-by vectors (one per class)
    "greatPeopleByClass": lambda sim, b, rows: [_gp_by_class(sim, b)],
    "barbCamps": lambda sim, b, rows: [sorted(int(t) for t in sim.camp_tile[b].tolist() if t >= 0)],
    # the barbarians' revealed plots, by index
    "barbExplored": lambda sim, b, rows: [sim.barb_explored[b].nonzero(as_tuple=True)[0].tolist()],
    "barbTribes": lambda sim, b, rows: [_barb_tribes_row(sim, b)],
    "unitPools": lambda sim, b, rows: [_unit_pools_row(sim, b)],
    "cityCount": lambda sim, b, rows: [sum(1 for c, _ in _city_rows(sim, b) if c < sim.n_majors)],  # civSeats' cities, as TS counts
    "unitCount": lambda sim, b, rows: [len(_unit_rows(sim, b))],
    "climatePhase": lambda sim, b, rows: [int(sim.climate_idx[b])],
    "relicsMade": lambda sim, b, rows: [int(sim.relics_made[b])],
    "seaRiseFrom": lambda sim, b, rows: [int(sim.sea_rise_from[b])],
    "removableAtStart": lambda sim, b, rows: [int(sim._removable_at_start[b])],
    "iceAtStart": lambda sim, b, rows: [int(sim._ice_at_start[b])],
    "freeTreasury": lambda sim, b, rows: [float(sim.free_treasury[b])],
    "freeShortfall": lambda sim, b, rows: [int(sim.seat_shortfall[b, sim.FREE_ROW])],
    "freeResearch": lambda sim, b, rows: [_research_record(sim, b, sim.FR)],
    "barbArmyKnown": lambda sim, b, rows: [[x for r in sorted(
        (int(o), int(t), int(n), int(p), int(d)) for k, o, t, n, p, d in zip(
            sim.citystate_kb_slot[b, sim.BK].tolist(), sim.citystate_kb_owner[b, sim.BK].tolist(),
            sim.citystate_kb_type[b, sim.BK].tolist(), sim.citystate_kb_seen[b, sim.BK].tolist(),
            sim.citystate_kb_plot[b, sim.BK].tolist(), sim.citystate_kb_damage[b, sim.BK].tolist()) if k != -2) for x in r]],
    "storms": lambda sim, b, rows: [_storm_table(sim, b)],
    "droughts": lambda sim, b, rows: [_drought_table(sim, b)],
}


def _storm_table(sim, b: int) -> list[int]:
    """The last serial, then each live storm record in slot order (the order
    they began): serial, row, centre, turns left, its struck plots sorted
    behind their count — TS's `storms` row."""
    out = [int(sim.storm_serial[b])]
    for k in range(sim.storm_left.shape[1]):
        if int(sim.storm_left[b, k]) <= 0:
            continue
        struck = sim.storm_struck[b, k].nonzero(as_tuple=True)[0].tolist()
        out += [int(sim.storm_id[b, k]), int(sim.storm_event[b, k]), int(sim.storm_at[b, k]),
                int(sim.storm_left[b, k]), len(struck), *struck]
    return out


def _drought_table(sim, b: int) -> list[int]:
    """Each live drought record in slot order: turns left, then its footprint
    behind its count — TS's `droughts` row."""
    out: list[int] = []
    for k in range(sim.drought_left.shape[1]):
        if int(sim.drought_left[b, k]) <= 0:
            continue
        plots = [int(t) for t in sim.drought_plots[b, k].tolist() if t >= 0]
        out += [int(sim.drought_left[b, k]), len(plots), *plots]
    return out


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


def _gp_by_class(sim, b) -> list:
    out: list = []
    for c in range(sim.gp_claimed.shape[1]):
        at = [int(i) for i in sim.gp_claimed[b, c, : int(sim._gp_roster[c])].nonzero(as_tuple=True)[0].tolist()]
        out.append(len(at))
        out.extend(at)
    out.extend(int(x) for x in sim.gp_offer[b].tolist())
    out.extend(float(x) for x in sim.gp_price[b].tolist())
    out.extend(int(x) for x in sim.gp_passed_by[b].tolist())
    return out


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
    """What past emergencies left standing: envoy gold, minor-leg gold, the
    pressure cut, then the per-seat heal, city-strike and nuclear CS counts,
    each dense over the roster."""
    return [[int(sim.civ_emg_envoy_gold[b, c]), int(sim.civ_emg_route_gold[b, c]),
             int(sim.civ_emg_nuke_cut[b, c])]
            + [int(sim.civ_emg_heal[b, c, o]) for o in rows]
            + [int(sim.civ_emg_strike[b, c, o]) for o in rows]
            + [int(sim.civ_emg_nuke_cs[b, c, o]) for o in rows]
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


def _seat_pair_relation(plane: str, live):
    """A seat<->seat [n_majors, n_majors] relation read as a per-seat set of ABSOLUTE
    opponent seats. One index space: the row IS the seat, so every seat
    answers alike and the TS side's `overSeats` walker lines up with it
    without a hole."""
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [sorted(j for j, v in enumerate(m[c]) if live(v)) for c in rows]
    return get



def _seat_pair_kind(plane: str):
    """A signed seat<->seat plane read as each seat's [foe, value] pairs in
    foe order, flattened — `Seat.warKinds` as the TS digest lays it out."""
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [[x for j, v in enumerate(m[c]) if v != 0 for x in (j, int(v))] for c in rows]
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


def _promise_line(sim, b, rows):
    """THE PROMISE LEDGER from the asker's side: [promiser, the signed turns
    per promise kind, the broken window per promise kind, ...] for every
    promiser with anything standing, ascending. Majors-only, so the row IS
    the seat."""
    pr = sim.seat_promise[b].tolist()
    br = sim.seat_promise_broken[b].tolist()
    out = []
    for c in rows:
        line: list[int] = []
        for j in range(sim.n_majors):
            if j == c:
                continue
            if any(v > 0 for v in br[c][j]) or any(v != 0 for v in pr[c][j]):
                line += [j, *[int(v) for v in pr[c][j]], *[int(v) for v in br[c][j]]]
        out.append(line)
    return out


def _seat_pair_clock(plane: str):
    """A DIPLOMATIC AGREEMENT clock read the flat way the war and treaty clocks
    are: [opponentSeat, turnsLeft, ...] over the majors it still runs with, in
    ascending seat order. Majors-only, so the row index IS the seat."""
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [[x for j, v in enumerate(m[c]) if v > 0 for x in (j, int(v))] for c in rows]
    return get


def _spy_held_count(sim, b, rows):
    """The spy cell as the pair clock reads it — [captor, count, ...] over the
    majors holding any, ascending; the count is the level buckets summed."""
    m = sim.seat_spy_held[b].sum(dim=2).tolist()
    return [[x for j, v in enumerate(m[c]) if v > 0 for x in (j, int(v))] for c in rows]


def _spy_held_levels(sim, b, rows):
    """[captor, level, level, ...] per holding captor, ascending captor, levels
    DESCENDING with repeats — the order the release takes them in."""
    cell = sim.seat_spy_held[b].tolist()
    out = []
    for c in rows:
        line: list[int] = []
        for j, buckets in enumerate(cell[c]):
            if sum(buckets) > 0:
                line.append(j)
                for lvl in range(len(buckets) - 1, -1, -1):
                    line.extend([lvl] * int(buckets[lvl]))
        out.append(line)
    return out


def _seat_pair_mark(plane: str):
    """`allianceType`'s renderer: [opponentSeat, code, ...] where a code
    >= 0 stands, in ascending opponent order."""
    def get(sim, b, rows):
        m = getattr(sim, plane)[b].tolist()
        return [[x for j, v in enumerate(m[c]) if v >= 0 for x in (j, int(v))] for c in rows]
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
    exp, born, walkTile, leg, course x courseMax] rows sorted ascending — the `routes`
    extractor's twin. Kind: 0 domestic, 1 city-state, 2 international.
    `seat_routes[..., 1]` carries the domestic destination city id, or
    -(2 + city-state index), or -1 for international (whose destination is
    the dseat/dcity pair). The walk triple is the Trader: its birth turn,
    current tile and leg (0 out, 1 home)."""
    row = _seat_row(sim, seat)
    rr = sim.seat_routes[b, row].tolist()
    ds = sim.seat_route_dseat[b, row].tolist()
    dc = sim.seat_route_dcity[b, row].tolist()
    ex = sim.seat_route_exp[b, row].tolist()
    bo = sim.seat_route_born[b, row].tolist()
    wk = sim.seat_route_walk[b, row].tolist()
    lg = sim.seat_route_leg[b, row].tolist()
    ch = sim.seat_route_course[b, row].tolist()
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
        # a city-state's routes leave its one city, origin code 0
        org = (int(sim.citystate_center[b, row - sim._CITY_MINOR0])
               if sim._CITY_MINOR0 <= row < sim.FREE_ROW else _centre_of(sim, b, row, frm))
        out.append([org, dest, kind, int(ex[k]), int(bo[k]),
                    int(wk[k]), int(lg[k])] + [int(x) for x in ch[k]])
    out.sort()
    return [x for t in out for x in t]


SEAT = {
    # Fog — the seat_explored [n_majors, T] row per seat, dense 0/1 (the TS
    # extractor renders its empty-array state dense the same way).
    "explored": _civ_scalar("seat_explored"),
    "treasury": _civ_scalar("civ_treasury"),
    "goldShortfall": _civ_scalar("seat_shortfall"),
    "co2": _civ_scalar("civ_co2"),
    "co2Turn": _civ_scalar("civ_co2_turn"),
    "gppTurn": lambda sim, b, rows: [
        [float(x) for x in sim.civ_gpp_turn[b, c].tolist()] for c in rows],
    "cultureTotal": _civ_scalar("civ_culture"),
    "faith": _civ_scalar("civ_faith"),
    "tourism": _civ_scalar("civ_tourism"),
    "tourismReligious": _civ_scalar("civ_tourism_rel"),
    "sciRate": _civ_scalar("civ_sci_rate"),
    "culRate": _civ_scalar("civ_cul_rate"),
    "tourRate": _civ_scalar("civ_tour_rate"),
    "tourismTo": lambda sim, b, rows: [
        [int(sim.civ_tourism_to[b, c, o]) if o != c else 0 for o in _civ_seats(sim)] for c in rows],
    "tourismReligiousTo": lambda sim, b, rows: [
        [int(sim.civ_tourism_rel_to[b, c, o]) if o != c else 0 for o in _civ_seats(sim)] for c in rows],
    "culturallyDominant": lambda sim, b, rows: [
        [int(bool(sim.civ_dominant[b, c, o])) for o in _civ_seats(sim)] for c in rows],
    "unitsAcquired": lambda sim, b, rows: [
        [x for i, n in enumerate(sim.civ_unit_acq[b, c].tolist()) if n > 0 for x in (i, n)]
        for c in rows],
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
    "grantedTitles": _civ_scalar("civ_granted_titles"),
    "researchProjectPct": _civ_scalar("civ_research_project_pct"),
    "buildersTrained": _civ_scalar("civ_builders_trained"),
    "settlersTrained": _civ_scalar("civ_settlers_trained"),
    "discountDistricts": _civ_scalar("civ_discount_districts"),
    "relicReserve": _civ_scalar("civ_relic_reserve"),
    "emergencyRewards": _emg_rewards,
    "bestMeleeCS": _civ_scalar("civ_best_melee"),
    "bestRangedCS": _civ_scalar("civ_best_ranged"),
    "techs": _civ_mask("civ_techs"),
    "civics": _civ_mask("civ_civics"),
    "boosted": _boosted,
    "currentTech": _civ_scalar("civ_cur_tech"),
    "currentCivic": _civ_scalar("civ_cur_civic"),
    "techProgress": _civ_scalar("civ_tech_prog"),
    "civicProgress": _civ_scalar("civ_civic_prog"),
    "techOverflow": _civ_scalar("civ_tech_ovf"),
    "civicOverflow": _civ_scalar("civ_civic_ovf"),
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
    "darkBar": _civ_scalar("dark_bar"),
    "goldenBar": _civ_scalar("golden_bar"),
    "score": lambda sim, b, rows: [[int(x) for x in _batch_rows(sim, "score", c, sim.score_lines)[b]] for c in rows],
    "age": _civ_scalar("civ_age"),
    "governmentsHeld": _civ_scalar("civ_gov_held"),
    "governmentChosen": _civ_scalar("civ_gov_chosen"),
    "governmentCivicTurn": _civ_scalar("civ_civic_turn"),
    "governmentAnarchyEnd": _civ_scalar("civ_gov_anarchy_end"),
    "policySlotsExtra": lambda sim, b, rows: [
        [int(x) for x in _batch_rows(sim, "wslots", c, sim._wonder_extra_slots)[b]] for c in rows],
    "policiesSlotted": _civ_mask("civ_policies"),
    "policiesLapsed": _civ_mask("civ_policy_lapsed"),
    "prevAge": _civ_scalar("prev_age"),
    "darkAges": _civ_scalar("dark_ages"),
    "goldenAges": _civ_scalar("golden_ages"),
    "moments": lambda sim, b, rows: [[k for k, x in enumerate(sim.moment_seen[b, c].tolist()) if x] for c in rows],
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
    "firstImpTech": lambda sim, b, rows: [1 if bool(sim.civ_first_imp_tech[b, c]) else 0 for c in rows],
    "pantheonDone": lambda sim, b, rows: [1 if bool(sim.civ_pantheon_done[b, c]) else 0 for c in rows],
    "beliefsEarned": lambda sim, b, rows: [int(sim.civ_beliefs_earned[b, c]) for c in rows],
    "gpPoints": lambda sim, b, rows: [[float(x) for x in sim.civ_gpp[b, c].tolist()] for c in rows],
    "projectsDone": lambda sim, b, rows: [sum(1 for x in sim.project_done[b, c].tolist() if x) for c in rows],
    "wmd": lambda sim, b, rows: [int(sim.civ_wmd[b, c].sum()) for c in rows],
    "spaceLy": _civ_scalar("space_ly"),
    "citizenNames": _civ_scalar("civ_citizen_names"),
    "goodyKinds": lambda sim, b, rows: [[int(x) for x in sim.civ_goody_kinds[b, c].tolist()] for c in rows],
    "laserSpeed": lambda sim, b, rows: [int(_batch_rows(sim, "laser", c, sim._laser_speed)[b]) for c in rows],
    "laserStations": lambda sim, b, rows: [
        int(sim.city_lasers[b, c, : sim.RC][sim.city_alive[b, c, : sim.RC]].sum()) for c in rows
    ],
    "stockpile": lambda sim, b, rows: [[int(x) for x in sim.civ_stockpile[b, c].tolist()] for c in rows],
    "fuelShort": lambda sim, b, rows: [
        sum(1 << k for k, x in enumerate(sim.civ_fuel_short[b, c].tolist()) if x) for c in rows
    ],
    "routeCount": lambda sim, b, rows: [
        sum(1 for r in sim.seat_routes[b, _seat_row(sim, c)].tolist() if r[0] >= 0) for c in rows
    ],
    "routes": lambda sim, b, rows: [_routes_of(sim, b, c) for c in rows],
    "tradingPosts": lambda sim, b, rows: [
        sim.trading_post[b, _seat_row(sim, c)].nonzero(as_tuple=True)[0].tolist() for c in rows
    ],
    "prophets": _civ_scalar("civ_prophets"),
    "gpUsed": _civ_scalar("civ_gp_used"),
    "barbKills": lambda sim, b, rows: [int(sim.civ_barb_kills[b, c]) for c in rows],
    "gpEarnedByClass": lambda sim, b, rows: [[int(x) for x in sim.civ_gp_earned[b, c].tolist()] for c in rows],
    "gpPerm": lambda sim, b, rows: [[float(x) for x in sim.civ_gp_perm[b, c].tolist()] for c in rows],
    "gpLuxuries": lambda sim, b, rows: [
        [int(x) for x in sim.civ_gp_lux[b, c, : int(sim.civ_gp_lux_n[b, c])].tolist()] for c in rows
    ],
    "gpLuxCopies": lambda sim, b, rows: [
        [int(x) for x in sim.civ_gp_lux_copies[b, c, : sim._n_lux].tolist()] for c in rows
    ],
    "beliefPantheon": _civ_scalar("civ_pantheon"),
    "religionType": _civ_scalar("civ_religion_type"),
    "beliefFollower": _civ_scalar("civ_follower"),
    "beliefFounder": _civ_scalar("civ_founder"),
    "beliefWorship": _civ_scalar("civ_worship"),
    "beliefEnhancer": _civ_scalar("civ_enhancer"),
    "nextCityId": _civ_scalar("civ_next_city_id"),
    "scienceTotal": lambda sim, b, rows: [float(sim.seat_science_total[b, _seat_row(sim, c)]) for c in rows],
    "warKinds": _seat_pair_kind("seat_warkind"),
    "denounced": _seat_pair_relation("seat_denounced", lambda v: v >= 0),
    "friendTurns": _seat_pair_clock("seat_friend_turns"),
    "allyTurns": _seat_pair_clock("seat_ally_turns"),
    "allianceType": _seat_pair_mark("seat_alliance_type"),
    "alliancePts": _seat_pair_clock("seat_alliance_pts"),
    # DIRECTED: the row is what that seat GRANTS, never what it holds.
    "borderTurns": _seat_pair_clock("seat_borders_turns"),
    "delegations": _seat_pair_clock("seat_delegation"),
    "metTurns": _seat_pair_mark("seat_met_turn"),
    "peaceTurn": _seat_pair_mark("seat_peace_turn"),
    "spyHeld": _spy_held_count,
    "spyHeldLevels": _spy_held_levels,
    "dealOffers": _deal_line("deal_offer_left", ("deal_offer_give", "deal_offer_ask")),
    "dealTerms": _deal_line("deal_term_left", ("deal_term_item",)),
    "promises": _promise_line,
}


def _citystate_plane(plane: str, minor: bool):
    def get(sim, b, rows):
        t = getattr(sim, plane)[b].tolist()
        if minor:
            m0 = sim._CITY_MINOR0
            return [t[m0 + s][0] for s in rows]
        return [t[s] for s in rows]
    return get


def _governor_at_minor(sim, b, rows):
    """Per city-state, per major seat: the first governor that seat has
    appointed to it, -1 none."""
    appointed = sim.civ_gov_appointed[b].tolist()
    at = sim.civ_gov_minor[b].tolist()
    return [[next((g for g in range(sim.n_governors) if appointed[c][g] and at[c][g] == s), -1)
             for c in _civ_seats(sim)] for s in rows]


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
    "governorAtMinor": lambda sim, b, rows: _governor_at_minor(sim, b, rows),
    "met": _csr("seat_citystate_met"),
    "questType": _csr("seat_citystate_quest"),
    "questTarget": _csr("seat_citystate_quest_target"),
    "questLast": _csr("seat_citystate_quest_last"),
    "suzerain": lambda sim, b, rows: [int(sim.citystate_suzerain[b, s]) for s in rows],
    "techs": lambda sim, b, rows: [[i for i, on in enumerate(sim.citystate_techs[b, s].tolist()) if on] for s in rows],
    "civics": lambda sim, b, rows: [[i for i, on in enumerate(sim.citystate_civics[b, s].tolist()) if on] for s in rows],
    "techProgress": lambda sim, b, rows: [float(sim.citystate_tech_prog[b, s]) for s in rows],
    "civicProgress": lambda sim, b, rows: [float(sim.citystate_civic_prog[b, s]) for s in rows],
    "minorCurrentTech": lambda sim, b, rows: [int(sim.citystate_cur_tech[b, s]) for s in rows],
    "minorCurrentCivic": lambda sim, b, rows: [int(sim.citystate_cur_civic[b, s]) for s in rows],
    "minorTechGoal": lambda sim, b, rows: [int(sim.citystate_tech_goal[b, s]) for s in rows],
    "minorResearchAi": lambda sim, b, rows: [
        [v for t in range(sim.citystate_ai_turns.shape[2]) for v in (
            int(sim.citystate_ai_turns[b, s, t]), int(sim.citystate_ai_next[b, s, t]), int(sim.citystate_ai_base[b, s, t]),
            int(sim.citystate_ai_score[b, s, t]), int(sim.citystate_ai_owned[b, s, t]))]
        if bool(sim.citystate_ai_valid[b, s]) else [] for s in rows],
    "minorCivicAi": lambda sim, b, rows: [
        [v for c in range(sim.citystate_cai_turns.shape[2]) for v in (
            int(sim.citystate_cai_turns[b, s, c]), int(sim.citystate_cai_next[b, s, c]), int(sim.citystate_cai_base[b, s, c]),
            int(sim.citystate_cai_score[b, s, c]), int(sim.citystate_cai_owned[b, s, c]))]
        if bool(sim.citystate_cai_valid[b, s]) else [] for s in rows],
    "minorResearchLeft": lambda sim, b, rows: [[int(sim.citystate_ai_left[b, s]), int(sim.citystate_ai_left_seen[b, s])] for s in rows],
    "minorTechOverflow": lambda sim, b, rows: [float(sim.citystate_tech_ovf[b, s]) for s in rows],
    "minorCivicOverflow": lambda sim, b, rows: [float(sim.citystate_civic_ovf[b, s]) for s in rows],
    "minorBoosted": lambda sim, b, rows: [
        [i for i, on in enumerate(sim.citystate_tech_boosted[b, s].tolist()) if on]
        + [sim.citystate_techs.shape[2] + i for i, on in enumerate(sim.citystate_civic_boosted[b, s].tolist()) if on]
        for s in rows],
    "minorBarbKills": lambda sim, b, rows: [int(sim.citystate_barb_kills[b, s]) for s in rows],
    "minorTechRetained": lambda sim, b, rows: [sim.citystate_tech_retain[b, s].tolist() for s in rows],
    "minorCivicRetained": lambda sim, b, rows: [sim.citystate_civic_retain[b, s].tolist() for s in rows],
    "prodProgress": lambda sim, b, rows: [float(sim.citystate_prod[b, s]) for s in rows],
    "minorProdItem": lambda sim, b, rows: [int(sim.citystate_item[b, s]) for s in rows],
    "minorProdOverflow": lambda sim, b, rows: [float(sim.citystate_ovf[b, s]) for s in rows],
    "minorProdKept": lambda sim, b, rows: [
        [x for i, v in enumerate(sim.citystate_kept[b, s].tolist()) if v != 0 for x in (i, v)] for s in rows],
    "minorArmyKnown": lambda sim, b, rows: [
        [x for r in sorted(
            (int(o), int(t), int(n), int(p), int(d)) for k, o, t, n, p, d in zip(
                sim.citystate_kb_slot[b, s].tolist(), sim.citystate_kb_owner[b, s].tolist(),
                sim.citystate_kb_type[b, s].tolist(), sim.citystate_kb_seen[b, s].tolist(),
                sim.citystate_kb_plot[b, s].tolist(), sim.citystate_kb_damage[b, s].tolist()) if k != -2) for x in r] for s in rows],
    "minorOps": lambda sim, b, rows: [_minor_ops(sim, b, s) for s in rows],
    "minorCampsKnown": lambda sim, b, rows: [[int(x) for x in sim.mops_camps[b, s].tolist() if x >= 0] for s in rows],
    "minorProjectYield": lambda sim, b, rows: [
        [int(sim.city_proj_yield[b, sim._CITY_MINOR0 + s, 0]), float(sim.city_proj_conv[b, sim._CITY_MINOR0 + s, 0])]
        for s in rows
    ],
    "minorTreasury": lambda sim, b, rows: [float(sim.citystate_treasury[b, s]) for s in rows],
    "minorShortfall": lambda sim, b, rows: [int(sim.seat_shortfall[b, sim._CITY_MINOR0 + s]) for s in rows],
    # a minor's row is a row of the CITY BLOCK, so its population and its
    # three boxes are read straight off it — no second name for one fact
    "minorPop": lambda sim, b, rows: [int(sim.citystate_pop[b, s]) for s in rows],
    "minorFoodBox": lambda sim, b, rows: [float(sim.city_growth[b, sim._CITY_MINOR0 + s, 0]) for s in rows],
    "minorCultureBox": lambda sim, b, rows: [float(sim.city_cbox[b, sim._CITY_MINOR0 + s, 0]) for s in rows],
    "minorNextPlot": lambda sim, b, rows: [int(sim.city_next_plot[b, sim._CITY_MINOR0 + s, 0]) for s in rows],
    "minorTilesAcquired": lambda sim, b, rows: [int(sim.city_acquired[b, sim._CITY_MINOR0 + s, 0]) for s in rows],
    "minorFaith": lambda sim, b, rows: [float(sim.citystate_faith[b, s]) for s in rows],
    "minorBuildingsPillaged": lambda sim, b, rows: [
        [i for i, on in enumerate(sim.city_bldg_pillaged[b, sim._CITY_MINOR0 + s, 0].tolist()) if on] for s in rows],
    "minorBuildings": lambda sim, b, rows: [
        [i for i, on in enumerate(sim.city_bldg[b, sim._CITY_MINOR0 + s, 0].tolist()) if on] for s in rows],
    "minorDistricts": lambda sim, b, rows: [
        [int(x) for x in sim.city_dist_tile[b, sim._CITY_MINOR0 + s, 0].tolist()] for s in rows],
    "minorOuterHp": lambda sim, b, rows: [int(sim.city_outer_hp[b, sim._CITY_MINOR0 + s, 0]) for s in rows],
    "religionPressure": lambda sim, b, rows: [
        [float(sim.city_pressure[b, sim._CITY_MINOR0 + s, 0, c]) for c in _civ_seats(sim)] for s in rows],
    "minorUnconverted": lambda sim, b, rows: [float(sim.city_unconverted[b, sim._CITY_MINOR0 + s, 0]) for s in rows],
    "levySeat": lambda sim, b, rows: [int(sim._ROW_SEAT[int(sim.citystate_levy_seat[b, s])])
                                      if int(sim.citystate_levy_seat[b, s]) >= 0 else -1 for s in rows],
    "levyEnds": lambda sim, b, rows: [int(sim.citystate_levy_ends[b, s]) for s in rows],
    "minorLastHit": lambda sim, b, rows: [int(sim.city_last_hit[b, sim._CITY_MINOR0 + s, 0]) for s in rows],
    "minorPowered": lambda sim, b, rows: [1 if bool(sim.city_powered[b, sim._CITY_MINOR0 + s, 0]) else 0
                                          for s in rows],
    "minorFullyPowered": lambda sim, b, rows: [1 if bool(sim.citystate_full_power[b, s]) else 0 for s in rows],
    "minorBuildProject": lambda sim, b, rows: [int(sim.citystate_build_proj[b, s]) for s in rows],
    "minorRepairWait": lambda sim, b, rows: [1 if bool(sim.citystate_repair_wait[b, s]) else 0 for s in rows],
    "minorRoutes": lambda sim, b, rows: [_routes_of(sim, b, 100 + s) for s in rows],
    "minorProdSite": lambda sim, b, rows: [int(sim.citystate_prod_site[b, s]) for s in rows],
    "minorProdSet": lambda sim, b, rows: [[int(sim.citystate_prod_set_turn[b, s]), int(sim.citystate_prod_set_value[b, s])] for s in rows],
    "minorThreat": lambda sim, b, rows: [int(sim.citystate_threat[b, s]) for s in rows],
    "minorAiGrowth": lambda sim, b, rows: [[int(x) for x in sim.citystate_ai_growth[b, s].tolist()] for s in rows],
    "minorCombatDesire": lambda sim, b, rows: [int(sim.citystate_combat_desire[b, s]) for s in rows],
    "minorStandingArmyShort": lambda sim, b, rows: [int(sim.citystate_standing_short[b, s]) for s in rows],
    "minorUnitValues": lambda sim, b, rows: [[int(x) for x in sim.citystate_unit_values[b, s].tolist()]
                                             if bool(sim.citystate_unit_on[b, s]) else [] for s in rows],
    "minorResourceCounts": lambda sim, b, rows: [[int(x) for x in sim.citystate_res_counts[b, s].tolist()] for s in rows],
    "minorTradeList": lambda sim, b, rows: [_trade_list(sim, b, s) for s in rows],
    "minorTradeValue": lambda sim, b, rows: [int(sim.citystate_trade_value[b, s]) for s in rows],
    "minorRevealed": lambda sim, b, rows: [[int(p) for p in sim.mops_revealed[b, s].nonzero(as_tuple=True)[0].tolist()]
                                           for s in rows],
    "minorSavings": lambda sim, b, rows: [[int(x) for x in sim.citystate_savings[b, s].tolist()] + [int(sim.citystate_balance[b, s])]
                                          for s in rows],
    "minorAiSlots": lambda sim, b, rows: [[int(x) for x in sim.cai_slots[b, s].tolist()] for s in rows],
    "minorAiTrees": lambda sim, b, rows: [_ai_trees(sim, b, s) for s in rows],
    "minorContracts": lambda sim, b, rows: [_ai_contracts(sim, b, s) for s in rows],
    "minorReservations": lambda sim, b, rows: [
        [x for r in sorted((int(p), int(t), int(v)) for p, t, v in zip(sim.cai_r_plot[b, s].tolist(), sim.cai_r_tree[b, s].tolist(),
                                                                        sim.cai_r_value[b, s].tolist()) if p >= 0) for x in r]
        for s in rows],
    "minorAiHand": lambda sim, b, rows: [[int(sim.cai_in_hand[b, s]), int(sim.cai_c_serial[b, s]), int(sim.cai_t_serial[b, s]),
                                          int(bool(sim.citystate_ai_on[b, s]))] for s in rows],
    "minorBuildersTrained": lambda sim, b, rows: [int(sim.citystate_builders_trained[b, s]) for s in rows],
    "minorBestMeleeCS": lambda sim, b, rows: [int(sim.citystate_best_melee[b, s]) for s in rows],
    "minorBestRangedCS": lambda sim, b, rows: [int(sim.citystate_best_ranged[b, s]) for s in rows],
    "warTurns": lambda sim, b, rows: [_war_clock_line(sim, b, 100 + s) for s in rows],
    "treatyTurns": lambda sim, b, rows: [_treaty_clock_line(sim, b, 100 + s) for s in rows],
}


def _trade_list(sim, b: int, s: int) -> list[int]:
    """minor `s`'s trade list, its known-city slots read through their
    centres: the listed centres ascending, -1, the rejected ones ascending"""
    ctr = sim._minor_trade_cands(s)[1][b].tolist()
    ok = sim.citystate_trade_ok[b, s].tolist()
    no = sim.citystate_trade_no[b, s].tolist()
    return (sorted(int(c) for c, on in zip(ctr, ok) if on) + [-1]
            + sorted(int(c) for c, on in zip(ctr, no) if on))


def _ai_trees(sim, b: int, s: int) -> list[int]:
    """per slot the running tree: [id, its living units as plot x 1000 +
    unit index sorted (-1 padded to 4), its trigger's unit, building,
    district, improvement rows, plot, tech, civic] (-1s for none)"""
    out: list[int] = []
    lo = sim.POOL_LO["major"]
    for k in range(sim.cai_slots.shape[2]):
        if not bool(sim.cai_tr_alive[b, s, k]):
            out += [-1] * 12
            continue
        units = sorted(int(sim.unit_tile[b, int(u)]) * 1000 + int(sim.unit_type[b, int(u)])
                       for u in sim.cai_tr_units[b, s, k].tolist()
                       if int(u) >= lo and bool(sim.unit_alive[b, int(u)]) and int(sim.unit_seat[b, int(u)]) == 100 + s)
        tr = [int(x) for x in sim.cai_tr_trigger[b, s, k].tolist()]
        out += [int(sim.cai_tr_id[b, s, k])] + (units + [-1] * 4)[:4] + tr[:7]
    return out


def _minor_ops(sim, b: int, s: int) -> list[int]:
    """the minor's operations as `minorOpsRecord` reads them: the pool's
    size, its free slots, the pick, per slot its definition (-1 free), id,
    target, rally, backup, strengths, per team its team, its members' pool
    slots (-1 unslotted, -2 gone), its requirements' counts, goals, flags,
    unit, strength"""
    from .sim_minorops import minor_ops_tables
    T = minor_ops_tables(sim.rules)
    size = int(sim.mops_size[b, s])
    nf = int(sim.mops_nfree[b, s])
    out = [size, nf] + [int(x) for x in sim.mops_free[b, s, :nf].tolist()]
    pk = int(sim.mops_pick[b, s])
    out += [pk, int(sim.mops_pick_target[b, s]) if pk >= 0 else -1, int(sim.mops_pick_rally[b, s]) if pk >= 0 else -1]
    lo = sim.POOL_LO["major"]
    for k in range(size):
        d = int(sim.mops_def[b, s, k])
        if d < 0:
            out.append(-1)
            continue
        out += [d, int(sim.mops_id[b, s, k]), int(sim.mops_target[b, s, k]), int(sim.mops_rally[b, s, k]),
                int(sim.mops_bk_target[b, s, k]), int(sim.mops_bk_rally[b, s, k]), int(sim.mops_estr[b, s, k]),
                int(sim.mops_str[b, s, k])]
        for ti in range(2):
            tm = int(sim.mops_tm[b, s, k, ti])
            if tm < 0:
                out.append(-1)
                continue
            mem = [int(x) for x in sim.mops_mem[b, s, k, ti].tolist() if x >= 0]
            slots = []
            for u in mem:
                g = u + lo
                alive = bool(sim.unit_alive[b, g]) and int(sim.unit_seat[b, g]) == 100 + s
                slots.append(int(sim.unit_pslot[b, g]) if alive else -2)
            R = T.team_reqs[d][tm]["n"]
            out += [tm, len(slots)] + slots + [R] + [int(x) for x in sim.mops_cnt[b, s, k, ti, :R].tolist()]
            out += [int(x) for x in sim.mops_goal[b, s, k, ti].tolist()]
            out += [int(bool(sim.mops_eng[b, s, k, ti])), int(bool(sim.mops_mins[b, s, k, ti])),
                    int(bool(sim.mops_ready[b, s, k, ti])), int(bool(sim.mops_ong[b, s, k, ti])),
                    int(sim.mops_unit[b, s, k, ti]), int(sim.mops_tstr[b, s, k, ti])]
    return out


def _ai_contracts(sim, b: int, s: int) -> list[int]:
    """the contracts by id: [id, tree, unit, building, district rows, goal
    kind, goal, plot, value, city, most turns, turns, progress, assign,
    queued, held by its tree, listed]"""
    rows = []
    for j in range(sim.cai_c_id.shape[2]):
        cid = int(sim.cai_c_id[b, s, j])
        if cid < 0:
            continue
        tree = int(sim.cai_c_tree[b, s, j])
        live = any(bool(sim.cai_tr_alive[b, s, k]) and int(sim.cai_tr_id[b, s, k]) == tree for k in range(sim.cai_tr_id.shape[2])) \
            or any(int(sim.mops_def[b, s, k]) >= 0 and int(sim.mops_id[b, s, k]) == tree for k in range(sim.mops_id.shape[2]))
        rows.append([cid, tree, int(sim.cai_c_unit[b, s, j]), int(sim.cai_c_building[b, s, j]), int(sim.cai_c_district[b, s, j]),
                     int(sim.cai_c_goal_kind[b, s, j]), int(sim.cai_c_goal[b, s, j]), int(sim.cai_c_plot[b, s, j]),
                     int(sim.cai_c_value[b, s, j]), int(sim.cai_c_city[b, s, j]), int(sim.cai_c_max_turns[b, s, j]),
                     int(sim.cai_c_turns[b, s, j]), int(sim.cai_c_progress[b, s, j]), int(bool(sim.cai_c_assign[b, s, j])),
                     int(bool(sim.cai_c_queued[b, s, j])), int(bool(sim.cai_c_in_tree[b, s, j]) and live),
                     int(bool(sim.cai_c_listed[b, s, j]))])
    return [x for r in sorted(rows) for x in r]


def _gw_rows(sim, b, rows):
    """every layout slot's work — object, maker, era, civilization; -1s for
    an empty slot — exactly like the TS extractor: per city, slot-major, the
    four planes in that order. One fancy-index per plane."""
    if not rows:
        return []
    ci = _np.asarray([c for c, _ in rows], dtype=_np.int64)
    si = _np.asarray([s for _, s in rows], dtype=_np.int64)
    planes = [getattr(sim, p)[b].numpy()[ci, si] for p in ("city_gw_obj", "city_gw_maker", "city_gw_era", "city_gw_seat")]
    return _np.stack(planes, axis=-1).reshape(len(rows), -1).astype(_np.int64).tolist()


def _cty(plane: str):
    def get(sim, b, rows):
        t = getattr(sim, plane)[b].tolist()
        return [t[c][s] for c, s in rows]
    return get


def _queue_cost(sim, b, rows):
    """`queueItemCost` over the WHOLE queue — a BUILDING's price is read live,
    which is what TS does, and it does it for a waiting entry as readily as for
    the head; every other kind carries the cost it locked."""
    stored = sim.city_cost[b].tolist()
    cur = sim.city_current[b].tolist()
    live: dict = sim._dg_memo if sim._dg_memo is not None else {}
    out = []
    for c, s in rows:
        key = ("lbc", c)
        if key not in live:
            live[key] = sim._live_building_cost(c).tolist()  # whole batch, once per digest
        out.append([live[key][b][s][k] if 0 <= cur[c][s][k] < sim.NB else stored[c][s][k]
                    for k in range(sim.QD)])
    return out


def _spec_rows(sim, b, rows):
    # one _city_specialists call per distinct seat row — the digest asks
    # per city and the recompute walks the tile window
    cache: dict = sim._dg_memo if sim._dg_memo is not None else {}
    out = []
    for c, s in rows:
        key = ("spec", c)
        if key not in cache:
            cache[key] = sim._city_specialists(c)
        out.append([int(x) for x in cache[key][b, s].tolist()])
    return out


def _qfront(sim, b, c, s):
    # ORACLE: TS's queueTile reads the queue item's own tileIndex for both
    # district and wonder kinds. Here the district pick is city_qtile; a
    # WONDER's completion target lives in the city_wonder registry. EVERY entry
    # is compared, not the head alone — a queue that agrees at the front and
    # differs behind it is still two different cities.
    out = []
    for k in range(sim.QD):
        cur = int(sim.city_current[b, c, s, k])
        if sim.WONDER_BASE <= cur < sim.PROJECT_BASE:
            out += [cur, int(sim.city_wonder[b, c, s, cur - sim.WONDER_BASE])]
        else:
            out += [cur, int(sim.city_qtile[b, c, s, k])]
    return out


CITY = {
    "seat": lambda sim, b, rows: [int(sim._ROW_SEAT[c]) for c, _ in rows],  # the Free row renders 300
    "gpPerm": lambda sim, b, rows: [[int(x) for x in sim.city_gp_perm[b, c, s].tolist()] for c, s in rows],
    "population": _cty("city_pop"),
    "hp": _cty("city_hp"),
    "outerHp": _cty("city_outer_hp"),
    "lastHitTurn": _cty("city_last_hit"),
    "reactorAge": _cty("city_reactor_age"),
    "projectBoostTurn": _cty("city_boost_turn"),
    "isCapital": _cty("city_is_cap"),
    # the tiles this city actually works, ASCENDING and -1-free. The
    # pick is a SET, so both engines canonicalise it here rather than pinning
    # the order each happens to build it in.
    "workedTiles": lambda sim, b, rows: [
        sorted(x for x in sim._worked_tiles(c)[b, s].tolist() if x >= 0)
        for c, s in rows],
    # the AMENITY TIER the walk's recorded read ran on: it multiplies every yield
    # the city pays, so a disagreement is otherwise invisible until it
    # surfaces as a fraction of a food box.
    "amenityTier": _cty("city_amen_tier"),
    "parkAmenities": _cty("city_park_amen"),
    "foodBox": _cty("city_growth"),
    "cultureBox": _cty("city_cbox"),
    "nextPlot": _cty("city_next_plot"),
    "tilesAcquired": _cty("city_acquired"),
    "origCapitalSeat": _cty("city_orig_cap"),
    "founderSeat": _cty("city_founder"),
    "formerSeat": _cty("city_former"),
    "loyalty": _cty("city_loyalty"),
    "spySources": lambda sim, b, rows: [
        int(sim.city_spy_sources[b, c, s].sum()) for c, s in rows
    ],
    "buildings": lambda sim, b, rows: [
        [i for i, on in enumerate(sim.city_bldg[b, c, s].tolist()) if on] for c, s in rows
    ],
    "buildingEras": lambda sim, b, rows: [
        [x for k, e in enumerate(sim.city_bldg_era[b, c, s].tolist()[:sim._bpe_n]) if e >= 0
         for x in (int(sim._bpe_bidx[k]), int(e))]
        for c, s in rows
    ],
    "buildingsPillaged": lambda sim, b, rows: [
        [i for i, on in enumerate(sim.city_bldg_pillaged[b, c, s].tolist()) if on] for c, s in rows
    ],
    "productionBank": lambda sim, b, rows: [
        float(sim.city_prod_bank[b, c, s]) for c, s in rows
    ],
    "projectYield": lambda sim, b, rows: [
        [int(sim.city_proj_yield[b, c, s]), float(sim.city_proj_conv[b, c, s])] for c, s in rows
    ],
    "queueFront": lambda sim, b, rows: [_qfront(sim, b, c, s) for c, s in rows],
    "specialists": _spec_rows,
    "idleCitizens": _cty("city_idle"),
    "specialistPref": lambda sim, b, rows: [
        [int(x) for x in sim.city_spec_pin[b, c, s].tolist()] for c, s in rows
    ],
    "queueProgress": _cty("city_progress"),
    "queueCost": _queue_cost,
    "followedReligion": _cty("city_followed"),
    "religionPressure": lambda sim, b, rows: [
        [float(x) for x in sim.city_pressure[b, c, s].tolist()] for c, s in rows
    ],
    "unconvertedPressure": _cty("city_unconverted"),
    "growthDrift": _cty("city_growth_drift"),
    "freePressure": lambda sim, b, rows: [
        [float(x) for x in sim.city_free_press[b, c, s].tolist()] for c, s in rows
    ],
    "foundedTurn": _cty("city_founded_turn"),
    "freeGrantTurns": _cty("city_free_grant"),
    "freeAllowed": lambda sim, b, rows: [[i for i, on in enumerate(sim.city_free_allowed[b, c, s].tolist()) if on]
                                         for c, s in rows],
    # every layout slot's work — object, maker, era, civilization; -1s for an
    # empty slot — exactly like the TS extractor.
    "greatWorks": lambda sim, b, rows: _gw_rows(sim, b, rows),
    "powered": lambda sim, b, rows: [1 if sim.city_powered[b, c, s] else 0 for c, s in rows],
}


def _unit(plane: str):
    def get(sim, b, rows):
        return getattr(sim, plane)[b].numpy()[_np.asarray(rows, dtype=_np.int64)]
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
    "promoBonus": _unit("unit_promo_bonus"),
    "xpPct": _unit("unit_xp_pct"),
    "mpBonus": _unit("unit_mp_bonus"),
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
    "levied": _unit("unit_levy_src"),
    "formation": _unit("unit_formation"),
        "escorted": _unit("unit_escorted"),
        "aiDefender": _unit("unit_defender"),
    "patrol": _unit("unit_patrol"),
    "freeCity": _unit("unit_free_city"),
    "noResourceUpkeep": _unit("unit_no_res_upkeep"),
}


def _tile(plane: str):
    # A zero-copy numpy VIEW of the live row — the fold consumes it before
    # the sim mutates again, and it skips boxing 1144 values per field per
    # game per turn into a Python list only to array them right back.
    def get(sim, b, rows):
        return getattr(sim, plane)[b].numpy()
    return get


def _prov(era: str, seat: str):
    # Two C-level passes instead of 2*T scalar tensor reads, for the same
    # uniform 2-element rows the vector fold path already handles.
    def get(sim, b, rows):
        return [[e, s] for e, s in zip(getattr(sim, era)[b].tolist(),
                                       getattr(sim, seat)[b].tolist())]
    return get


def _owner_city(sim, b, rows):
    # a major's or a FREE CITY's tile names its city; a minor's and nobody's
    # is -1 (TS `setTileOwner`)
    free = int(sim._ROW_SEAT[sim.FREE_ROW])
    seat = sim.tile_seat[b].numpy()
    return _np.where(((seat >= 0) & (seat < 100)) | (seat == free), sim.tile_city[b].numpy(), -1)


TILE = {
    "ownerSeat": _tile("tile_seat"),
    "ownerCity": _owner_city,
    "improvement": _tile("improvement"),
    "pillaged": _tile("pillaged"),
    "goodyHut": _tile("tile_goody"),
    "meteorSite": _tile("tile_meteor"),
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
    "fertilitySci": _tile("fertility_sci"),
    "fertilityCul": _tile("fertility_cul"),
    "droughtTurns": _tile("drought"),
    "fireStart": _tile("fire_start"),
    "fireSeq": _tile("fire_seq"),
    "stormStruck": _tile("storm_scar"),
    "featureId": lambda sim, b, rows: sim.feat_id[b].masked_fill(sim.feat_stripped[b], -1).numpy(),
    "terrainId": lambda sim, b, rows: (sim.terrain[b] * 2 + sim.hills[b].long()).numpy(),
    "lowland": lambda sim, b, rows: sim.tile_lowland[b].long().numpy(),
    "flooded": lambda sim, b, rows: sim.tile_flooded[b].long().numpy(),
    "railroad": lambda sim, b, rows: sim.railroad[b].long().numpy(),
    "submerged": lambda sim, b, rows: sim.tile_submerged[b].long().numpy(),
    "falloutTurns": lambda sim, b, rows: sim.tile_fallout[b].long().numpy(),
    "water": lambda sim, b, rows: sim.water[b].long().numpy(),
    "floodCount": lambda sim, b, rows: sim.tile_flood_ct[b].numpy(),
    "volcanoActive": lambda sim, b, rows: sim.volcano_active[b].long().numpy(),
    "eventFired": lambda sim, b, rows: sim.tile_event_fired[b].numpy(),
    "airSlotBonus": lambda sim, b, rows: sim.tile_air_bonus[b].numpy(),
    "gpRegRange": lambda sim, b, rows: sim.tile_gp_perm[b, :, 0].numpy(),
    "gpRegProd": lambda sim, b, rows: sim.tile_gp_perm[b, :, min(1, sim.tile_gp_perm.shape[2] - 1)].numpy(),
    "gpRegAmen": lambda sim, b, rows: sim.tile_gp_perm[b, :, min(2, sim.tile_gp_perm.shape[2] - 1)].numpy(),
    "gpFaithAdjSci": lambda sim, b, rows: sim.tile_gp_perm[b, :, min(3, sim.tile_gp_perm.shape[2] - 1)].numpy(),
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
    """`_mix32` over a uint32 vector: numpy's uint32 arithmetic wraps mod
    2^32, which is exactly the masking `_mix32` does. Returns a new vector."""
    h = h ^ (h >> 16)
    h *= 0x85EBCA6B
    h ^= h >> 13
    h *= 0xC2B2AE35
    h ^= h >> 16
    return h


def _step_np(h, x):
    """`_step` over uint32 vectors (`x` a uint32 vector or a word)."""
    t = h ^ x
    t += 0x9E3779B9
    return _mix32_np(t)


def _lo_hi(q):
    """An int64 vector's words: (q mod 2^32, (q // 2^32) mod 2^32) as uint32."""
    return q.astype(_np.uint32), (q >> 32).astype(_np.uint32)


def _q_np(arr, scale: int):
    if arr.dtype.kind == "f":
        return _np.floor(arr * scale + 0.5).astype(_np.int64)
    q = arr.astype(_np.int64)
    return q * scale if scale != 1 else q


def _chain_np(keys, cols):
    """The per-row hash chains in PARALLEL — the identical arithmetic on
    uint32 vectors, whose wrapping is the mod-2^32 `_mix32` keeps. Returns
    the {exact, milli} per-row hash vectors (uint32).

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
    seed = _step_np(_np.full(len(k), 0x811C9DC5, dtype=_np.uint32), k.astype(_np.uint32))
    h = {"exact": seed.copy(), "milli": seed.copy()}
    for i, (cmp, kind, q) in enumerate(qs):
        t = _step_np(h[cmp], _np.uint32(i))
        if kind == "vec":
            cols2d = q.reshape(len(k), -1) if q.ndim == 2 else q.reshape(len(k), 1)
            t = _step_np(t, _np.uint32(cols2d.shape[1]))  # _fold's len(seq)
            lo, hi = _lo_hi(cols2d)
            for j in range(cols2d.shape[1]):
                t = _step_np(t, lo[:, j])
                t = _step_np(t, hi[:, j])
        else:  # ragged: chain LENGTH differs per row — scalar per row
            t = t.copy()
            for r, seq in enumerate(q):
                w = [len(seq)]
                for v in seq:
                    w.append(v % _2_32)
                    w.append((v // _2_32) & _MASK)
                t[r] = _chain(int(t[r]), w)
        h[cmp] = t
    return h


def _acc_hex(h_seg) -> str:
    a = int(h_seg.sum(dtype=_np.uint64)) & _MASK
    b = int(_mix32_np(h_seg ^ 0x5BF03635).sum(dtype=_np.uint64)) & _MASK
    return f"{b:08x}{a:08x}"


def _fold_rows_np(keys, cols) -> dict | None:
    """`fold_rows` with the rows in parallel — `_chain_np` plus the summed
    accumulators."""
    # Below the floor the per-op numpy overhead LOSES to the scalar loop
    # (the game / seat / city-state groups); the vector path exists for the
    # tile group's 1144 rows, the unit group's mid-game hundreds, the city
    # group — and `fold_rows_multi`, whose whole-batch concatenation lifts
    # every group over the floor at B >= 2.
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
    segment's sums — same bits as `fold_rows` per game. None (too few total
    rows, or a value type the chain declines) means: take the per-game path
    instead.

    `per_b[b]` is `(keys, cols)` exactly as `fold_rows` takes them, every
    game over the SAME column list (one manifest group)."""
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
    rows x 16 fields, every turn, every game — the scalar loop would be half
    the serve lane's wall); small groups keep the loop below, unless a whole
    batch folds at once through `fold_rows_multi`. Same bits every way.
    """
    for i, (_, vals) in enumerate(cols):
        if len(vals) != len(keys):
            raise AssertionError(
                f"digest column {i} carries {len(vals)} values for {len(keys)} rows — "
                "an extractor handed ONE row's list as the whole column")
    vec = _fold_rows_np(keys, cols)
    if vec is not None:
        return vec
    accs = {"exact": _Acc(), "milli": _Acc()}
    scales = [(cmp == "milli", 1000 if cmp == "milli" else 1, vals) for cmp, vals in cols]
    for r in range(len(keys)):
        seed = _step(0x811C9DC5, keys[r] % _2_32)
        he = hm = seed
        first = 0
        # a long LEAD column (the seat's explored plane) folds off the row
        # seed alone, so its chain is looked up by its value
        if scales:
            milli0, scale0, vals0 = scales[0]
            v0 = vals0[r]
            if scale0 == 1 and isinstance(v0, list) and len(v0) >= _LEAD_MEMO_MIN:
                h0 = _lead_chain(seed, scale0, v0)
                if milli0:
                    hm = h0
                else:
                    he = h0
                first = 1
        # a row's two chains as word lists: the column index, then `_fold`'s
        # words, column by column into the chain its compare names
        we: list = []
        wm: list = []
        for i in range(first, len(scales)):
            milli, scale, vals = scales[i]
            w = wm if milli else we
            w.append(i)
            _words(w, vals[r], scale)
        accs["exact"].add(_chain(he, we))
        accs["milli"].add(_chain(hm, wm))
    return {"exact": accs["exact"].hex(), "milli": accs["milli"].hex()}


# the lead column's chain by (row seed, value) on an EXACT column: a function
# of those two alone, so a value seen again answers without the walk. At
# scale 1 elements that compare equal quantise to the same word (a bool, an
# int and an integral float alike), so a tuple key is the value's own words.
_LEAD_MEMO_MIN = 64
_LEAD_MEMO: dict = {}


def _lead_chain(seed: int, scale: int, values: list) -> int:
    key = (seed, scale, tuple(values))
    h = _LEAD_MEMO.get(key)
    if h is None:
        w: list = [0]
        _words(w, values, scale)
        h = _chain(seed, w)
        if len(_LEAD_MEMO) >= 4096:
            _LEAD_MEMO.clear()
        _LEAD_MEMO[key] = h
    return h


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
    # an extractor that derives a WHOLE-BATCH tensor per seat row (the
    # specialists, the live building prices) derives it once per digest,
    # not once per game: the memo lives for this call only
    sim._dg_memo = {}
    try:
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
    finally:
        sim._dg_memo = None
    return outs


def _py(v):
    """Plain-Python view of an extractor value — the extractors return numpy
    scalars/arrays (the fold path's zero-copy contract) and this dump path is
    the one consumer that must json-serialize them."""
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
