"""THE DECISION SERVER: every decision a seat takes in a turn, from the
NEUTRAL OBSERVATION (`shared/decide.schema.json`) and the game's static facts
alone. It reads no engine: `st` is the game's static value (the schema's
`static` section — rules and map facts), `nobs` a seat's observation, one
dict per game, and `geos` the per-game diplomatic table. It writes nothing;
the engine that asked applies what it answers."""
from __future__ import annotations

import json
from pathlib import Path

import torch

import ladder

# The NEUTRAL OBSERVATION's field spec (names, kinds, meanings), shared with
# every engine that emits it.
_SCHEMA = json.loads((Path(__file__).resolve().parents[1] / "shared" / "decide.schema.json")
                     .read_text(encoding="utf-8"))


def _turns(nobs: list) -> tuple:
    """(the engine turn the coming step plays, the 0-based index the draws
    key on). The observation carries the engine turn; the draws have always
    keyed on the loop's own count, which starts at 0 on turn 1 — the ONE
    place the two meet."""
    turn = int(nobs[0]["turn"])
    return turn, turn - 1


def _obs_group(nobs: list, group: str, device) -> dict:
    """The SCALAR fields of one schema group of the per-game observations
    (`nobs[b]`) as [B] tensors: `bool` fields as bool, the rest as long."""
    fields = [f for f in _SCHEMA["seat"][group] if f[1] != "list"]
    t = torch.tensor([[o[group][f[0]] for f in fields] for o in nobs], dtype=torch.long, device=device)
    return {f[0]: (t[:, i] != 0 if f[1] == "bool" else t[:, i]) for i, f in enumerate(fields)}


def _obs_dense(nobs: list, group: str, field: str, device) -> torch.Tensor:
    """[B, w] long — a dense `list` field, one row per game."""
    return torch.tensor([o[group][field] for o in nobs], dtype=torch.long, device=device).reshape(len(nobs), -1)


def _obs_members(nobs: list, group: str, field: str, width: int, device) -> torch.Tensor:
    """[B, width] bool — an ascending-index `list` field as a membership mask."""
    m = torch.zeros(len(nobs), width, dtype=torch.bool)
    for b, o in enumerate(nobs):
        idx = o[group][field]
        if idx:
            m[b, idx] = True
    return m.to(device)


# The per-seat STYLE assignment. None = today's behaviour exactly: every
# knob at its default and the deep/diplo booleans drawn per (seed, seat).
# A list of ladder.STYLE_PRESETS names assigns seat r the r-th entry
# (cycled). The draws are salted hashes, not a consumed stream, so a pinned
# boolean skips nothing for anybody else.
STYLE_TABLE: list | None = None


def _seat_style(row: int) -> dict:
    if STYLE_TABLE is None:
        return ladder.STYLE_KNOBS
    return ladder.style_of(STYLE_TABLE[row % len(STYLE_TABLE)])


def _obs_cities(nobs: list, width: int, device) -> dict:
    """The observation's `cities` rows as tensors on ONE city axis — array
    order, padded to the widest seat of the batch: `centre` [B, C] (-1 on a
    pad), `is_capital` [B, C], `settlers` [B] (on order anywhere), `mask`
    [B, C, width] (the open production columns) and `sites`
    {(b, k, column): [(tile, adjacency), ...]}."""
    B = len(nobs)
    C = max(1, max(len(o["cities"]) for o in nobs))
    centre = torch.full((B, C), -1, dtype=torch.long)
    is_cap = torch.zeros(B, C, dtype=torch.bool)
    settlers = torch.zeros(B, dtype=torch.long)
    mask = torch.zeros(B, C, width, dtype=torch.bool)
    sites: dict = {}
    for b, o in enumerate(nobs):
        for k, c in enumerate(o["cities"]):
            centre[b, k] = c["centre"]
            is_cap[b, k] = c["isCapital"]
            settlers[b] += c["settlerQueued"]
            if c["prodOpen"]:
                mask[b, k, c["prodOpen"]] = True
            for col, t, a in c["distSites"]:
                sites.setdefault((b, k, col), []).append((t, a))
    return {"centre": centre.to(device), "is_capital": is_cap.to(device),
            "settlers": settlers.to(device), "mask": mask.to(device), "sites": sites}


def _prod_ctx(st, blocks: dict, cities: dict, seat: int, turn: int) -> dict:
    """The per-seat counters no mask can express, read from the OBSERVATION —
    the ctx block (ladder.CTX_FIELDS) and the `cities` rows — so a TS client
    rendering the same observation feeds the ladder identically. city_cap is
    static data, not state."""
    ctx = blocks["ctx"]
    n_cities = ctx[:, 0].long()
    # ONE city cap for every seat — the ladder's maxCities heuristic
    style = _seat_style(seat)
    cap = st.max_cities if style["city_cap"] is None else int(style["city_cap"])
    nS = len(st.scaffold) if st.districts_on else 0
    # WHICH district to place is a decision, and the driver rotates it so
    # the whole scaffold is reached rather than only its head; a style's
    # dist_pref pins the rotation START to a named district, keeping the
    # legal fallthrough.
    rot = ((seat + turn) % nS) if nS else None
    if nS and style["dist_pref"] is not None:
        si = next((k for k, did in enumerate(st.scaffold) if did == style["dist_pref"]), None)
        rot = si if si is not None else rot
    return {
        "dist_rot": rot,
        "settler_queued": cities["settlers"] > 0,
        "is_capital": cities["is_capital"],  # the wonder tier's capital heuristic
        "melee": ctx[:, 2].long(),
        "ranged": ctx[:, 3].long(),
        "unit_count": ctx[:, 1].long(),
        "unit_cap": ctx[:, 4].long(),
        "n_cities": n_cities,
        "city_cap": torch.full_like(n_cities, cap),
    }


def _blocks(st, nobs: list) -> dict:
    """The observation's `vec`, one row per game, split into its blocks."""
    vec = torch.tensor([o["vec"] for o in nobs], dtype=torch.float64, device=st.device)
    return ladder.split(vec, st.S, st.n_majors - 1, st.RC, st.NT, st.NC)


_M32 = 0xFFFFFFFF


def _policy_rand(seed: int, turn: int, row: int, salt: int) -> float:
    """ONE mulberry32 draw from the DRIVER's policy stream, keyed on (game
    seed, turn, seat row, salt). Deterministic — the same engine always
    re-records the same file — and fully separate from the engines' shared
    rule stream, whose draw-count parity a policy decision must not move."""
    a = (seed * 2654435761 ^ turn * 40503 ^ row * 97 ^ salt * 1013904223) & _M32
    a = (a + 0x6D2B79F5) & _M32
    t = ((a ^ (a >> 15)) * (1 | a)) & _M32
    t = (((t + (((t ^ (t >> 7)) * (61 | t)) & _M32)) & _M32) ^ t) & _M32
    return ((t ^ (t >> 14)) & _M32) / 4294967296.0


def _policy_rng(device, seeds: list, turn: int, row: int, salt: int) -> torch.Tensor:
    return torch.tensor(
        [_policy_rand(int(s_), turn, row, salt) for s_ in seeds],
        dtype=torch.float64, device=device,
    )



def _obs_units(st, nobs: list) -> tuple:
    """The observation's `units` rows on the unit-slot axis the unit mask
    rides (N = `unit_slots`; the rows are the living units in array order, so
    rank n IS slot-map row n): (present, tiles, types, charges, gp_site,
    gp_arg), each [B, N], -1 past a game's last unit."""
    device = st.device
    B, N = len(nobs), st.unit_slots
    fields = ("tile", "type", "charges", "gpSite", "gpArg")
    m = torch.full((B, N, len(fields)), -1, dtype=torch.long)
    n = torch.zeros(B, 1, dtype=torch.long)
    for b, o in enumerate(nobs):
        us = o["units"]
        n[b, 0] = len(us)
        if us:
            m[b, :len(us)] = torch.tensor([[u[f] for f in fields] for u in us], dtype=torch.long)
    m = m.to(device)
    present = (torch.arange(N).unsqueeze(0) < n).to(device)
    return (present, *m.unbind(dim=2))


def _obs_plane(st, nobs: list, field: str) -> torch.Tensor:
    """[B, T] bool — a `targets` tile list as a plane."""
    m = torch.zeros(len(nobs), st.T, dtype=torch.bool)
    for b, o in enumerate(nobs):
        ts = o["targets"][field]
        if ts:
            m[b, ts] = True
    return m.to(st.device)


def _obs_unit_mask(st, nobs: list) -> torch.Tensor:
    """[B, N, act_w] bool — every unit's `mask` list on the unit-slot axis,
    False past a game's last unit; one index write for the whole seat."""
    idx = [(b, k, c) for b, o in enumerate(nobs) for k, u in enumerate(o["units"]) for c in u["mask"]]
    m = torch.zeros(len(nobs), st.unit_slots, st.act_w, dtype=torch.bool)
    if idx:
        bb, kk, cc = torch.tensor(idx, dtype=torch.long).unbind(dim=1)
        m[bb, kk, cc] = True
    return m.to(st.device)


def _obs_war(st, nobs: list) -> dict:
    """The war march's inputs off the observation: `at_war` [B], `imps`
    [B, T] (the `warImps` plane), and the `warCities` rows padded to [B, M]
    as `seat`, `centre` and `live`."""
    device = st.device
    B = len(nobs)
    rows = [o["targets"]["warCities"] for o in nobs]
    M = max((len(r) for r in rows), default=0)
    sc = torch.full((B, M, 2), -1, dtype=torch.long)
    for b, r in enumerate(rows):
        if r:
            sc[b, :len(r)] = torch.tensor(r, dtype=torch.long)
    sc = sc.to(device)
    return {"at_war": torch.tensor([bool(o["war"]["at_war"]) for o in nobs], dtype=torch.bool, device=device),
            "imps": _obs_plane(st, nobs, "warImps"),
            "seat": sc[:, :, 0], "centre": sc[:, :, 1], "live": sc[:, :, 1] >= 0}


def _march_targets(st, war: dict, hcs: torch.Tensor) -> tuple:
    """The war-march DESTINATION for units standing at `hcs` [B, N]: the
    nearest of `war`'s improvement tiles within 13 (tile index breaking the
    tie), else the nearest of its cities on `hostileUnitAct`'s key —
    distance, then the owner's seat id, then the centre tile — else the
    stand itself. Distances are the STATIC `pair_dist`. Returns (tgt,
    has_imp, has_city), each [B, N]."""
    B, N = hcs.shape
    T = st.T
    no = torch.zeros(B, N, dtype=torch.bool, device=hcs.device)
    has_imp, imp_tgt = no, hcs
    imps = war["imps"]
    # only a tile listed in SOME game can win the argmin, so the sweep runs
    # over those columns alone
    cand = imps.any(dim=0).nonzero(as_tuple=True)[0]                  # [K]
    if int(cand.numel()):
        d_s = st.pair_dist.index_select(1, cand).index_select(0, hcs.reshape(-1)).to(torch.long).reshape(B, N, -1)
        ikey = torch.where(imps.index_select(1, cand).unsqueeze(1) & (d_s < 13),
                           d_s * (T + 1) + cand, torch.full_like(d_s, 10 ** 9))
        imp_min, iwin = ikey.min(dim=2)
        has_imp = imp_min < 10 ** 9
        imp_tgt = cand[iwin]
    has_city, city_tgt = no, hcs
    live = war["live"]
    if bool(live.any()):
        cc = war["centre"].clamp(min=0)
        d2 = st.pair_dist[hcs.unsqueeze(2), cc.unsqueeze(1)].to(torch.long)
        key = torch.where(live.unsqueeze(1), d2 * (2048 * 256) + (war["seat"] * 2048 + cc).unsqueeze(1),
                          torch.full_like(d2, 10 ** 18))
        ckey_min, cwin = key.min(dim=2)
        has_city = ckey_min < 10 ** 18
        city_tgt = torch.where(has_city, cc.gather(1, cwin), hcs)
    return torch.where(has_imp, imp_tgt, city_tgt), has_imp, has_city


def _unit_view(st, nobs: list, present: torch.Tensor, tiles: torch.Tensor, war: dict) -> dict:
    """The per-unit geometry `ladder.pick_unit_orders` reads, off the
    observation's unit tiles, city centres and war targets and the STATIC
    map (`neigh`, `ring2`, `pair_dist`). A distance with nothing to measure
    to is the map's tile count, which no real distance reaches."""
    B, N = tiles.shape
    dev = tiles.device
    BIG = st.T
    tc = tiles.clamp(min=0)
    nb = st.neigh[tc]                                                # [B, N, 6]
    nbc = nb.clamp(min=0)
    off = nb < 0
    d_home = torch.full((B, N), BIG, dtype=torch.long, device=dev)
    d_nb = torch.full((B, N, 6), BIG, dtype=torch.long, device=dev)
    C = max((len(o["cities"]) for o in nobs), default=0)
    if C:
        ctr = torch.full((B, C), -1, dtype=torch.long)
        for b, o in enumerate(nobs):
            if o["cities"]:
                ctr[b, :len(o["cities"])] = torch.tensor([c["centre"] for c in o["cities"]], dtype=torch.long)
        ctr = ctr.to(dev)
        ok = (ctr >= 0).unsqueeze(1)
        cc = ctr.clamp(min=0).unsqueeze(1)
        d_home = torch.where(ok, st.pair_dist[tc.unsqueeze(2), cc].to(torch.long), BIG).amin(dim=2)
        d_nb = torch.where(ok, st.pair_dist[nbc.reshape(B, N * 6, 1), cc].to(torch.long), BIG) \
            .amin(dim=2).reshape(B, N, 6)
    d_nb = torch.where(off, BIG, d_nb)
    at_war = war["at_war"].unsqueeze(1) & present
    war_tgt = torch.full((B, N), -1, dtype=torch.long, device=dev)
    if bool(at_war.any()):
        tgt, hi, hc = _march_targets(st, war, tc)
        war_tgt = torch.where((hi | hc) & at_war, tgt, war_tgt)
    has_wt = war_tgt >= 0
    wtc = war_tgt.clamp(min=0)
    d_war = torch.where(has_wt, st.pair_dist[tc, wtc].to(torch.long), BIG)
    d_war_nb = torch.where(has_wt.unsqueeze(2) & ~off, st.pair_dist[nbc, wtc.unsqueeze(2)].to(torch.long), BIG)
    return {"nb_tile": nb, "ring_tile": st.ring2[tc], "d_home": d_home, "d_nb": d_nb,
            "at_war": at_war, "d_war": d_war, "d_war_nb": d_war_nb}


def _acting_slots(rows_all: torch.Tensor) -> list:
    """The unit SLOTS any game acts in, from one reduction and one transfer.

    Every per-slot walk below asked `bool(x.any())` twice a slot — two host
    syncs each, for a roster that is mostly empty. The slot map is prefix-dense
    (`_seat_slot_map` ranks the living), so the `break` those loops carried and
    this filter cover exactly the same slots."""
    return [n for n, v in enumerate(rows_all.any(dim=0).tolist()) if v]


def _nearest(st, plane: torch.Tensor, rows_all: torch.Tensor, tiles: torch.Tensor,
             out: torch.Tensor, stride: int, taken: bool = False) -> torch.Tensor:
    """For every slot in `rows_all`, the nearest tile of `plane` [B, T] — key
    distance * stride + tile index, lowest wins — written into `out`. Distances
    are the STATIC `pair_dist` (map geometry, not state). With `taken`, a tile
    one slot takes is masked out for the later slots (the plane is the
    caller's own, built from the observation, and is consumed)."""
    T = st.T
    arangeT = torch.arange(T, device=out.device)
    for n in _acting_slots(rows_all):
        rows = rows_all[:, n]
        d = st.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(plane, d * stride + arangeT, torch.full_like(d, 2 ** 40))
        best = key.argmin(dim=1)
        has = rows & plane.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
        if taken and bool(has.any()):
            _hr = has.nonzero(as_tuple=True)[0]
            plane[_hr, best[_hr]] = False
    return out


def _charge_jobs(st, idx: int, jobs: torch.Tensor,
                 out: torch.Tensor, present, tiles, types, charges) -> torch.Tensor:
    """The nearest tile with work on it for every unit of type `idx` that still
    holds a charge, tile index breaking the tie. A job TAKEN by an earlier
    slot is masked out for the later ones, so two units of one type (on one
    tile, or with one nearest job) are not both sent to the same tile — one
    plane per call, as the TS driver keeps one taken set per type."""
    if idx < 0 or not bool(jobs.any()):
        return out
    rows_all = present & (types.clamp(min=0, max=st.NU - 1) == idx) & (charges > 0)
    return _nearest(st, jobs, rows_all, tiles, out, st.T, taken=True)


def _builder_jobs(st, nobs: list, units=None) -> torch.Tensor:
    """[B, N] — each Builder's and Military Engineer's job tile off the
    observation's `jobs` and `engJobs` planes, -1 for the rest."""
    dev = st.device
    present, tiles, types, charges, _gs, _ga = _obs_units(st, nobs) if units is None else units
    out = torch.full(present.shape, -1, dtype=torch.long, device=dev)
    if not st.improvements_on:
        return out
    # BUILDERS take the improvement jobs — a missionary's charge is a spread,
    # not a build. The MILITARY ENGINEER walks to its own list instead: its
    # improvements, an unroaded tile, or a 20% charge waiting to be spent.
    out = _charge_jobs(st, st.builder, _obs_plane(st, nobs, "jobs"),
                       out, present, tiles, types, charges)
    return _charge_jobs(st, st.engineer, _obs_plane(st, nobs, "engJobs"),
                        out, present, tiles, types, charges)


def _gp_jobs(st, nobs: list, units=None) -> torch.Tensor:
    """[B, N] — the nearest tile each Great Person can spend its charge on,
    tile index breaking the tie, off the observation's `gpSites` table. -1
    for every other unit and for a person whose site exists nowhere yet."""
    dev = st.device
    present, tiles, _types, charges, site, sdist = _obs_units(st, nobs) if units is None else units
    out = torch.full(present.shape, -1, dtype=torch.long, device=dev)
    if st.col("ACTIVATE_GP") < 0:
        return out
    # site 1 activates where it stands: nothing to walk to
    live = present & (site >= 0) & (site != 1) & (charges > 0)
    if not bool(live.any()):
        return out
    planes: dict = {}
    for b, o in enumerate(nobs):
        for s, a, t in o["targets"]["gpSites"]:
            pl = planes.get((s, a))
            if pl is None:
                pl = planes[(s, a)] = torch.zeros(len(nobs), st.T, dtype=torch.bool)
            pl[b, t] = True
    # the keys are disjoint per unit, so their order moves no pick
    for (s, a), pl in sorted(planes.items()):
        out = _nearest(st, pl.to(dev), live & (site == s) & (sdist == a), tiles, out, st.T)
    return out


def _spread_targets(st, nobs: list, units=None) -> torch.Tensor:
    """[B, N] — the nearest city centre off the observation's `spread` list
    for every Missionary and Apostle holding a charge, -1 for the rest."""
    dev = st.device
    present, tiles, types, charges, _gs, _ga = _obs_units(st, nobs) if units is None else units
    out = torch.full(present.shape, -1, dtype=torch.long, device=dev)
    tm = _obs_plane(st, nobs, "spread")
    if not bool(tm.any()):
        return out
    vt_all = types.clamp(min=0, max=st.NU - 1)
    relig_all = torch.zeros_like(present)
    if st.missionary >= 0:
        relig_all = relig_all | (vt_all == st.missionary)
    if st.apostle >= 0:
        relig_all = relig_all | (vt_all == st.apostle)
    return _nearest(st, tm, present & relig_all & (charges > 0), tiles, out, st.T + 1)


def _settle_targets(st, nobs: list, units=None):
    """([B, N] nearest-foundable tile per SETTLER row, [B, T] foundable plane)
    off the observation's `foundOk` list (canFoundCity's own terms, the city
    cap included). The plane feeds the FOUND override (found only where the
    apply would accept) and the target feeds the walk."""
    dev = st.device
    present, tiles, types, _charges, _gs, _ga = _obs_units(st, nobs) if units is None else units
    out = torch.full(present.shape, -1, dtype=torch.long, device=dev)
    ok = _obs_plane(st, nobs, "foundOk")
    if st.settler < 0 or st.col("FOUND_CITY") < 0 or not bool(ok.any()):
        return out, ok
    return _nearest(st, ok, present & (types == st.settler), tiles, out, st.T), ok


def _dig_targets(st, nobs: list, units=None) -> torch.Tensor:
    """[B, N] — the nearest workable DIG off the observation's `digs` list
    for each Archaeologist that still holds a charge, or -1. Keyed like the
    builder's job (distance, then tile index)."""
    dev = st.device
    present, tiles, types, charges, _gs, _ga = _obs_units(st, nobs) if units is None else units
    out = torch.full(present.shape, -1, dtype=torch.long, device=dev)
    if st.archaeologist < 0 or st.col("EXCAVATE") < 0:
        return out
    digs = _obs_plane(st, nobs, "digs")
    if not bool(digs.any()):
        return out
    rows_all = present & (types.clamp(min=0, max=st.NU - 1) == st.archaeologist) & (charges > 0)
    return _nearest(st, digs, rows_all, tiles, out, st.T)


def _park_targets(st, nobs: list, units=None) -> torch.Tensor:
    """[B, N] — the nearest tile that ANCHORS a legal National Park cluster
    off the observation's `parks` list, for each Naturalist holding a charge
    (vacuous for the Naturalist since ParkCharges 1 consumes it at 0, kept so
    the walks share one shape), or -1. Same key as the dig."""
    dev = st.device
    present, tiles, types, charges, _gs, _ga = _obs_units(st, nobs) if units is None else units
    out = torch.full(present.shape, -1, dtype=torch.long, device=dev)
    if st.naturalist < 0 or st.col("PARK") < 0:
        return out
    anchors = _obs_plane(st, nobs, "parks")
    if not bool(anchors.any()):
        return out
    rows_all = present & (types.clamp(min=0, max=st.NU - 1) == st.naturalist) & (charges > 0)
    return _nearest(st, anchors, rows_all, tiles, out, st.T)


def _seat_unit_orders(st, seat: int, nobs: list):
    # ONE read of the observation's units for the whole pass, shared by every
    # target table below; a unit's rank is its row of the mask.
    turn, _t = _turns(nobs)
    units = _obs_units(st, nobs)
    present, tiles, _types, _charges, _gs, _ga = units
    um = _obs_unit_mask(st, nobs)
    war = _obs_war(st, nobs)
    view = _unit_view(st, nobs, present, tiles, war)
    orders0 = ladder.pick_unit_orders(um, view, a_pillage=st.a_pillage, a_snipe=st.a_snipe, a_snipe3=st.a_snipe3)
    job_t = _builder_jobs(st, nobs, units=units)
    spread_t = _spread_targets(st, nobs, units=units)
    settle_t, found_ok = _settle_targets(st, nobs, units=units)
    dig_t = _dig_targets(st, nobs, units=units)
    park_t = _park_targets(st, nobs, units=units)
    # WHICH VERB COLUMNS any game has open, in one reduction and one transfer.
    # Every block below writes through `torch.where(present & um[..., c], ...)`,
    # so a column no row holds is an identity pass — and most of the table
    # (the improvement run, the religious combat verbs, the air and spy heads)
    # is dead on nearly every turn.
    umc = um.any(dim=0).any(dim=0).tolist()
    umW = len(umc)

    def _live(c: int, k: int = 1) -> bool:
        return c >= 0 and c + k <= umW and any(umc[c:c + k])

    tclamp = tiles.clamp(min=0)
    nbr_all = None  # the neighbour table, built at most once for three readers
    on_job = (job_t >= 0) & (tiles == job_t) & present
    # Rank-0 WALK toward a civilian destination (job, spread or settle
    # target): the virtual planner extends MOVE rows only, so rank 0 must
    # itself step or the unit never leaves the city it spawned in.
    tgt = torch.where(job_t >= 0, job_t, torch.where(spread_t >= 0, spread_t, settle_t))
    gp_t = _gp_jobs(st, nobs, units=units)
    tgt = torch.where(tgt >= 0, tgt, torch.where(dig_t >= 0, dig_t, park_t))
    tgt = torch.where(tgt >= 0, tgt, gp_t)
    walkers = present & (tgt >= 0) & (tiles != tgt)
    if bool(walkers.any()):
        nbr_all = st.neigh[tclamp]  # [B, N, 6]
        nbr = nbr_all
        d_cur = st.pair_dist[tclamp, tgt.clamp(min=0)].to(torch.long)
        d_nb = st.pair_dist[nbr.clamp(min=0), tgt.clamp(min=0).unsqueeze(2)].to(torch.long)
        closer = um[:, :, 0:6] & (nbr >= 0) & (d_nb < d_cur.unsqueeze(2))
        w_key = torch.where(closer, d_nb * 8 + torch.arange(6, device=um.device), torch.full_like(d_nb, 2 ** 30))
        has_w = walkers & closer.any(dim=2)
        orders0 = torch.where(has_w, w_key.argmin(dim=2), orders0)
    # A TRIBAL VILLAGE within one step is worth taking, and it OUTRANKS the
    # walk: the driver may freely choose (the applier validates and TS
    # replays the same orders), so steering at one is free coverage of a
    # mechanic the scripted walk otherwise never reaches — 250 turns over a
    # village-carrying world claimed NOTHING without this.
    if any(o["targets"]["goody"] for o in nobs):
        goody = _obs_plane(st, nobs, "goody")
        if nbr_all is None:
            nbr_all = st.neigh[tclamp]
        gnb = nbr_all                                             # [B, N, 6]
        B_, N_ = tiles.shape
        ghut = goody.gather(1, gnb.reshape(B_, -1).clamp(min=0)).reshape(B_, N_, 6)
        ghut = ghut & (gnb >= 0) & um[:, :, 0:6]
        gtake = present & ghut.any(dim=2)
        if bool(gtake.any()):
            # the lowest legal direction, the engine's own tie-break
            orders0 = torch.where(gtake, ghut.long().argmax(dim=2), orders0)
    A_SP = st.col("SPREAD_HERE")
    if A_SP >= 0 and bool((spread_t >= 0).any()):
        d_sp = st.pair_dist[tclamp, spread_t.clamp(min=0)].to(torch.long)
        close = (spread_t >= 0) & present & (d_sp <= 1)
        if bool(close.any()):
            if nbr_all is None:
                nbr_all = st.neigh[tclamp]
            nbr = nbr_all
            dir_hit = (nbr == spread_t.unsqueeze(2)) & (nbr >= 0)
            dcol = torch.where(
                tiles == spread_t,
                torch.zeros_like(spread_t),
                dir_hit.float().argmax(dim=2) + 1,
            )
            valid_dir = (tiles == spread_t) | dir_hit.any(dim=2)
            # ...and the MASK column, like every other arm: the applier
            # refuses a spread the mask does not offer (a target already
            # following, a spent charge, a foreign border), so an order
            # written off distance alone cost a refusal a turn.
            _spcol = (A_SP + dcol).clamp(min=0, max=umW - 1).unsqueeze(2)
            take_sp = close & valid_dir & um.gather(2, _spcol).squeeze(2)
            orders0 = torch.where(take_sp, A_SP + dcol, orders0)
    A_F = st.col("FOUND_CITY")
    if st.settler >= 0 and _live(A_F):
        is_settler = present & (_types == st.settler)
        if bool(is_settler.any()):
            # FOUND only where canFoundCity's own terms say yes: the mask
            # column is type-only and the APPLY validates the spot, so an
            # unconditional FOUND pins a settler on illegal ground to a
            # refused verb forever.
            take_f = is_settler & um[:, :, A_F] & found_ok.gather(1, tiles.clamp(min=0))
            orders0 = torch.where(take_f, torch.full_like(orders0, A_F), orders0)
    A_X = st.col("EXCAVATE")
    if _live(A_X):
        # standing ON the dig: work it. The mask carries every legality term,
        # so the pick is "the column is open", never a second opinion.
        take_x = present & (dig_t >= 0) & (tiles == dig_t) & um[:, :, A_X]
        orders0 = torch.where(take_x, torch.full_like(orders0, A_X), orders0)
    A_PK = st.col("PARK")
    if _live(A_PK):
        take_pk = present & um[:, :, A_PK]
        orders0 = torch.where(take_pk, torch.full_like(orders0, A_PK), orders0)
    A_FU = st.col("FORM_UP_0")
    if _live(A_FU, 6):
        # a unit with a target FIGHTS; one with nothing to hit and a twin of its
        # own chassis next door merges into it. Both civics sit in the Industrial
        # and Modern trees, so this is the only way a formation is ever reached.
        _fu = um[:, :, A_FU:A_FU + 6]
        _idle = ~um[:, :, 6:12].any(dim=2)
        orders0 = torch.where(present & _idle & _fu.any(dim=2),
                              A_FU + _fu.float().argmax(dim=2), orders0)
    A_BS = st.col("BOOST_PROJECT")
    if _live(A_BS):
        # a Builder standing on a District Project pays its whole bank in. The
        # mask carries every term the Royal Society's clause asks for.
        orders0 = torch.where(present & um[:, :, A_BS], torch.full_like(orders0, A_BS), orders0)
    A_GP = st.col("ACTIVATE_GP")
    if _live(A_GP):
        # standing where the charge may be spent: spend it. The mask carries
        # every legality term the person's own row asks for.
        orders0 = torch.where(present & um[:, :, A_GP], torch.full_like(orders0, A_GP), orders0)
    A_LQ = st.col("LAUNCH_INQUISITION")
    if _live(A_LQ):
        orders0 = torch.where(present & um[:, :, A_LQ], torch.full_like(orders0, A_LQ), orders0)
    A_HN = st.col("CONVERT_HEATHEN")
    if _live(A_HN):
        orders0 = torch.where(present & um[:, :, A_HN], torch.full_like(orders0, A_HN), orders0)
    A_HX = st.col("REMOVE_HERESY")
    if _live(A_HX):
        orders0 = torch.where(present & um[:, :, A_HX], torch.full_like(orders0, A_HX), orders0)
    A_CN = st.col("CONDEMN_0")
    if _live(A_CN, 6):
        cn = um[:, :, A_CN:A_CN + 6]
        hit = present & cn.any(dim=2)
        orders0 = torch.where(hit, A_CN + cn.float().argmax(dim=2), orders0)
    A_PM = st.col("PROMOTE_0")
    if _live(A_PM, st.promo_cols):
        pm = um[:, :, A_PM:A_PM + st.promo_cols]
        hasp = present & pm.any(dim=2)
        # a promotion heals 50 and ends the turn, so it outranks every other
        # verb the unit could have taken. WHICH row it takes alternates by
        # seat and turn: the tree is only worth reaching if the driver walks
        # more than one branch of it.
        cols = torch.arange(st.promo_cols, device=um.device)
        deep = ((seat + turn) % 2) == 1
        key = torch.where(pm, cols, torch.full_like(cols, -1)) if deep \
            else torch.where(pm, cols, torch.full_like(cols, 1 << 20))
        pick = key.amax(dim=2) if deep else key.amin(dim=2)
        orders0 = torch.where(hasp, A_PM + pick, orders0)
    A_AS = st.col("AIR_STRIKE_0")
    A_RB = st.col("REBASE_0")
    _as_live = _live(A_AS, st.air_strike_cols)
    if A_AS >= 0 and um.shape[2] >= A_AS + st.air_strike_cols \
            and (_as_live or _live(A_RB, st.air_rebase_cols)):
        _as = um[:, :, A_AS:A_AS + st.air_strike_cols]
        if _as_live:
            orders0 = torch.where(present & _as.any(dim=2),
                                  A_AS + _as.float().argmax(dim=2), orders0)
        if A_RB >= 0 and um.shape[2] >= A_RB + st.air_rebase_cols:
            # an aircraft with nothing to hit MOVES BASE — otherwise the whole
            # air force sits on the aerodrome it was built in and the rebase
            # head is never reached.
            _rb = um[:, :, A_RB:A_RB + st.air_rebase_cols]
            _rk = torch.arange(st.air_rebase_cols, device=um.device)
            _rot = (seat + turn) % max(st.air_rebase_cols, 1)
            _key = torch.where(_rb, (_rk - _rot) % max(st.air_rebase_cols, 1),
                               torch.full_like(_rk, 1 << 20))
            orders0 = torch.where(present & ~_as.any(dim=2) & _rb.any(dim=2),
                                  A_RB + _key.amin(dim=2), orders0)

    A_SM = st.col("SPY_MISSION_0")
    A_ST = st.col("SPY_TRAVEL_0")
    _sm_live = _live(A_SM, st.spy_missions)
    _st_live = _live(A_ST, st.spy_travel_cols)
    if A_SM >= 0 and um.shape[2] >= A_SM + st.spy_missions and (_sm_live or _st_live):
        _sm = um[:, :, A_SM:A_SM + st.spy_missions]
        # counter-espionage RE-ARMS itself, so a spy that takes it never moves
        # again: prefer the jump whenever nothing else is on offer where it
        # stands, and rotate the mission pick so the catalog is walked rather
        # than one row of it hammered.
        _off = _sm.clone()
        _off[:, :, st.spy_counterspy] = False
        _go = present & ~_off.any(dim=2)
        _took = torch.zeros_like(present)
        if A_ST >= 0 and um.shape[2] >= A_ST + st.spy_travel_cols and _st_live:
            _st = um[:, :, A_ST:A_ST + st.spy_travel_cols]
            _tk = torch.arange(st.spy_travel_cols, device=um.device)
            _trot = (seat + turn) % max(st.spy_travel_cols, 1)
            _tkey = torch.where(_st, (_tk - _trot) % max(st.spy_travel_cols, 1),
                                torch.full_like(_tk, 1 << 20))
            _took = _go & _st.any(dim=2)
            orders0 = torch.where(_took, A_ST + _tkey.amin(dim=2), orders0)
        if _sm_live:
            _mk = torch.arange(st.spy_missions, device=um.device)
            _mrot = (seat + turn) % max(st.spy_missions, 1)
            _mkey = torch.where(_sm, (_mk - _mrot) % max(st.spy_missions, 1),
                                torch.full_like(_mk, 1 << 20))
            orders0 = torch.where(present & ~_took & _sm.any(dim=2),
                                  A_SM + _mkey.amin(dim=2), orders0)

    if bool(on_job.any()):
        # BY NAME, never by column number: the BUILD_* verbs are a RUN in the
        # middle of the action table, so an inserted verb walks a hardcoded
        # range onto the wrong column. `_A_IMP` is that run, roster-ordered.
        rep_ok = um[:, :, st.a_repair]
        # A 20% charge into a district beats an improvement, and laying road is
        # the fallback when nothing else is placeable here.
        # HARVEST and the wonder charge sit AHEAD of the improvement run:
        # both are one-off lumps on the tile underfoot, and taking them
        # first is what makes either verb reachable at all — the gate
        # cannot compare an arm no driver orders.
        # ...and only the columns some game actually holds: a dead column can
        # never be the FIRST legal one, so dropping it moves no pick — and the
        # improvement run is most of this list and mostly locked.
        bcols = [c for c in ([c for c in (st.col("FINISH_DISTRICT"),) if c >= 0]
                             + [c for c in (st.col("HARVEST"),) if c >= 0]
                             + [c for c in (st.col("WONDER_CHARGE"),) if c >= 0]
                             + [c for c in st.a_imp if c >= 0]
                             + [c for c in (st.col("BUILD_ROAD"),) if c >= 0]
                             + [c for c in (st.col("BUILD_RAILROAD"),) if c >= 0])
                 if _live(c)]
        bmask = torch.stack([um[:, :, c] for c in bcols], dim=2) if bcols else None
        pick_b = torch.full_like(orders0, -1)
        if bmask is not None:
            hasb = bmask.any(dim=2)
            firstb = bmask.float().argmax(dim=2)
            colt = torch.tensor(bcols, device=um.device)
            pick_b = torch.where(hasb, colt[firstb], pick_b)
        chosen = torch.where(rep_ok, torch.full_like(orders0, st.a_repair), pick_b)
        take_b = on_job & (chosen >= 0)
        orders0 = torch.where(take_b, chosen, orders0)
    return orders0, job_t, spread_t, settle_t, tiles, view["at_war"], war


def _seat_envoys(nobs: list, device):
    """The ENVOY verb, seat-generic: the scripted greedy sequence — spend the
    BANK, neediest re-ranked after every pick. Conversion influence->bank is
    an eager RULE at the CS phase for EVERY seat (real Civ 6 grants the envoy
    the moment the meter fills), so this verb is bank-only and reads the
    observation's `envoy` group alone. Zero draws. Returns [B, K] CS indices
    (-1 pad) or None."""
    held = _obs_dense(nobs, "envoy", "held", device)
    S = held.shape[1]
    if S <= 0:
        return None
    avail_e = _obs_group(nobs, "envoy", device)["avail"]
    met_live_e = held >= 0
    mine6_e = held.clamp(min=0).double() / 6.0
    picks_e = []
    for _ke in range(6):
        can_e = met_live_e.any(dim=1) & (avail_e > 0)
        if not bool(can_e.any()):
            break
        blk_e = {"cs": torch.stack([met_live_e.double(), mine6_e, torch.zeros_like(mine6_e)], dim=2)}
        p_e = ladder.pick_envoy(blk_e, met_live_e)
        p_e = torch.where(can_e, p_e, torch.full_like(p_e, -1))
        if not bool((p_e >= 0).any()):
            break
        picks_e.append(p_e)
        hit_e = p_e >= 0
        avail_e = torch.where(hit_e, avail_e - 1, avail_e)
        mine6_e = mine6_e + torch.nn.functional.one_hot(p_e.clamp(min=0), S).double() * hit_e.unsqueeze(1).double() / 6.0
    return torch.stack(picks_e, dim=1) if picks_e else None


def _war_kind_of(war: torch.Tensor, kinds: torch.Tensor) -> torch.Tensor:
    """[B] long — the kind the war column `war` declares under, read off the
    observation's per-major table `kinds` [B, n_majors - 1]; -1 on a sue, a
    minor or no column."""
    n_opp = kinds.shape[1]
    w = war.to(torch.long)
    on = (w >= 0) & (w < n_opp)
    if n_opp == 0 or not bool(on.any()):
        return torch.full_like(w, -1)
    pick = kinds.gather(1, w.clamp(min=0, max=n_opp - 1).unsqueeze(1)).squeeze(1)
    return torch.where(on, pick, torch.full_like(pick, -1))


def _war_ctx(blocks: dict) -> dict:
    ctx, cv = blocks["ctx"], blocks["civ"]
    return {
        "cs_envoys": blocks["cs"][:, :, 1],
        "opp_str": cv[:, :, 3],
        "prox": cv[:, :, 4].long(),
        "gang": cv[:, :, 5] > 0.5,
        "has_cities": cv[:, :, 6] > 0.5,
        "own_str": ctx[:, 5],
        "aggression": ctx[:, 6],
        "peace_turns": ctx[:, 7].long(),
    }


def _decide_citizens(st, nobs: list):
    """The CITIZEN-ASSIGNMENT verbs, once per city each: pin one citizen into
    the first district that seats one, and one onto the first RESOURCE plot the
    city can work. Everything else stays with the automatic rule. Read off the
    observation's `cities` rows; returns (spec, lock): spec = (centre [B, C],
    pins [B, C, nD]) on the rows' array axis, `spec_keep` where nothing is
    pinned, and lock [B, C] the plot each city flips, -1 for none — each None
    when no game has one."""
    device = st.device
    B = len(nobs)
    C = max(1, max(len(o["cities"]) for o in nobs))
    nD = max((len(c["specSlots"]) for o in nobs for c in o["cities"]), default=0)
    centre = [[-1] * C for _ in range(B)]
    pins = [[[st.spec_keep] * nD for _ in range(C)] for _ in range(B)]
    lock = [[-1] * C for _ in range(B)]
    any_pin = any_lock = False
    for b, o in enumerate(nobs):
        for k, c in enumerate(o["cities"]):
            centre[b][k] = c["centre"]
            if c["pop"] >= ladder.SPEC_PIN_POP and not any(p >= 0 for p in c["specPin"]):
                d = next((d for d, s in enumerate(c["specSlots"]) if s > 0), None)
                if d is not None:
                    pins[b][k][d] = 1
                    any_pin = True
            # a city that already holds a pinned plot is left alone
            work = c["workTiles"]
            if not any(lk for _t, _r, lk in work):
                t = next((t for t, r, _lk in work if r > 0), None)  # ascending: the lowest
                if t is not None:
                    lock[b][k] = t
                    any_lock = True
    spec = None
    if any_pin:
        spec = (torch.tensor(centre, dtype=torch.long, device=device),
                torch.tensor(pins, dtype=torch.long, device=device))
    return spec, (torch.tensor(lock, dtype=torch.long, device=device) if any_lock else None)


def _decide_swap(nobs: list, device):
    """The TILE SWAP, our own scripted rule: a city with MORE citizens than
    plots it may work takes ONE plot from a sibling that has plots to spare
    and is not working (or pinning) it. The observation lists the plots the
    engine's predicate allows (`swapFrom`); the first city in array order
    with one, its lowest tile, wins, and a seat swaps at most once a turn.
    Zero draws. Returns [B, 1, 2] (claimant's centre, tile), -1 where a game
    has none, or None on a quiet turn."""
    picks = []
    for o in nobs:
        cs = o["cities"]
        spare = {c["centre"] for c in cs if len(c["workTiles"]) > c["pop"]}
        best = None
        for c in cs:
            if c["pop"] <= len(c["workTiles"]):
                continue
            best = next(([c["centre"], t] for t, frm, worked, locked in c["swapFrom"]
                         if frm in spare and not worked and not locked), None)
            if best is not None:
                break
        picks.append(best)
    if all(p is None for p in picks):
        return None
    return torch.tensor([p or [-1, -1] for p in picks], dtype=torch.long, device=device).unsqueeze(1)


def _decide_vote(nobs: list, row: int, device):
    """The WORLD CONGRESS ballot for the session the coming step would run,
    off the observation's `congress` group. The ladder votes its own
    interest: its preference on each slate resolution, free; and on the
    Diplomatic Victory resolution it backs itself or blocks the leader, with
    every point of favor it has. Slot 3 is the SPECIAL session — join every
    emergency it is not the target of. Returns [B, 4, 3] — [outcome, target,
    extra votes] per slot — or None on a quiet turn."""
    cg = _obs_group(nobs, "congress", device)
    slate = _obs_dense(nobs, "congress", "slate", device)
    special = cg["special"]
    if not bool((slate >= 0).any()) and not bool(cg["dv"].any()) and not bool(special.any()):
        return None
    pref_o = _obs_dense(nobs, "congress", "pref_outcome", device)
    pref_t = _obs_dense(nobs, "congress", "pref_target", device)
    B = len(nobs)
    out = torch.full((B, 4, 3), -1, dtype=torch.long, device=device)
    zero = torch.zeros(B, dtype=torch.long, device=device)
    # THE SPECIAL SESSION: the ladder joins every emergency it is not the
    # target of, which is also what a seat with no ballot does.
    for f in range(3):
        out[:, 3, f] = torch.where(special, zero, out[:, 3, f])
    for slot in (0, 1):
        m = slate[:, slot] >= 0
        out[:, slot, 0] = torch.where(m, pref_o[:, slot], out[:, slot, 0])
        out[:, slot, 1] = torch.where(m, pref_t[:, slot], out[:, slot, 1])
        out[:, slot, 2] = torch.where(m, zero, out[:, slot, 2])
    lead = cg["leader"]
    ok = cg["dv"] & (lead >= 0)
    if bool(ok.any()):
        # ALL of it: the curve runs out of favor before it runs out of rungs,
        # so favor/step + 1 is an upper bound on what the bank can buy.
        want = torch.div(cg["favor"], cg["vote_step"].clamp(min=1), rounding_mode="floor") + 1
        out[:, 2, 0] = torch.where(ok, (lead != row).long(), out[:, 2, 0])
        out[:, 2, 1] = torch.where(ok, lead.clamp(min=0), out[:, 2, 1])
        out[:, 2, 2] = torch.where(ok, want, out[:, 2, 2])
    return out if bool((out[:, :, 0] >= 0).any()) else None


def _decide_route(route: dict):
    """The route verb: TAKE the observation's candidate whenever one exists
    — the old eager rule's pacing, now a policy choice on the wire."""
    frm, dst = route["from"], route["dest"]
    if not bool((frm >= 0).any()):
        return None
    return (frm, dst)


def _decide_buys(bctx: dict):
    """Every purchase of the turn from the observation's `buy` group. City
    references stay CENTRE TILES, the wire's vocabulary."""
    buy_kind = ladder.pick_purchase(bctx["can_building"], bctx["settler_ok"], bctx["unit_ok"], bctx["tile_ok"])
    # A DISTRICT bought outright sits under the four standing rungs and over
    # patronage: it is the most expensive thing on the ladder and only a
    # governor with the promotion offers it at all.
    buy_kind = torch.where((buy_kind == -1) & bctx["dist_g_ok"], torch.full_like(buy_kind, 5), buy_kind)
    # GOLD patronage is the LOWEST rung — only when nothing else buys.
    buy_kind = torch.where((buy_kind == -1) & bctx["pat_g_ok"], torch.full_like(buy_kind, 4), buy_kind)
    buy_a = torch.where(buy_kind == 3, bctx["tile"], bctx["bldg_city"])
    buy_a = torch.where(buy_kind == 4, bctx["pat_g_cls"], buy_a)
    buy_a = torch.where(buy_kind == 5, bctx["dist_g_tile"], buy_a)
    buy_b = torch.where(buy_kind == 3, bctx["tile_city"], bctx["bldg"])
    buy_b = torch.where(buy_kind == 5, bctx["dist_g_row"], buy_b)
    worship_ok, relig_kind = ladder.pick_faith(
        bctx["worship_ok"], bctx["missionary_ok"], bctx["apostle_ok"], bctx["inquisitor_ok"],
        bctx["monk_ok"])
    neg_w = torch.full_like(bctx["worship_city"], -1)
    relig_c = torch.where(
        relig_kind == 5, bctx["missionary_city"],
        torch.where(relig_kind == 6, bctx["apostle_city"],
                    torch.where(relig_kind == 11, bctx["inquisitor_city"],
                                torch.where(relig_kind == 14, bctx["monk_city"], neg_w))))
    monu_kind = ladder.pick_monu(bctx["monu_builder_ok"], bctx["monu_settler_ok"])
    monu_c = torch.where(monu_kind >= 0, bctx["spawn_city"], torch.full_like(bctx["spawn_city"], -1))
    nat_ok, nat_c = bctx["nat_ok"], bctx["nat_city"]
    nat_kind = torch.where(nat_ok, torch.full_like(monu_kind, 10), torch.full_like(monu_kind, -1))
    band_c = torch.where(bctx["band_ok"], bctx["band_city"], torch.full_like(bctx["band_city"], -1))
    # FAITH patronage: its own once-per-turn slot, never the same turn as
    # the gold arm — one claim per turn keeps both engines' appliers aligned.
    pat = torch.where(bctx["pat_f_ok"] & (buy_kind != 4), bctx["pat_f_cls"],
                      torch.full_like(bctx["pat_f_cls"], -1))
    # the FAITH district is its own slot beside the faith civilians, never the
    # gold arm's — one currency each, both spendable in the same turn.
    _dfn = torch.full_like(bctx["dist_f_tile"], -1)
    dist_f = (torch.where(bctx["dist_f_ok"], bctx["dist_f_tile"], _dfn),
              torch.where(bctx["dist_f_ok"], bctx["dist_f_row"], _dfn))
    return ((buy_kind, buy_a, buy_b),
            torch.where(worship_ok, bctx["worship_city"], neg_w),
            (relig_kind, relig_c),
            torch.where(bctx["levy_ok"], bctx["levy_cs"], torch.full_like(bctx["levy_cs"], -1)),
            (monu_kind, monu_c),
            (nat_kind, nat_c),
            (bctx["cls_city"], bctx["cls_bldg"]),
            (bctx["ucls_city"], bctx["ucls_unit"]),
            pat,
            band_c,
            dist_f)


def _geo_t(geos: list, field: str, device) -> torch.Tensor:
    """One field of the per-game diplomatic tables as a [B, ...] long tensor."""
    return torch.tensor([g[field] for g in geos], dtype=torch.long, device=device)


def _geo_civic(st, geos: list, civic: int) -> torch.Tensor:
    """[B, n] bool — which major seats hold the civic, all False where the
    civic is -1 (the catalog has none)."""
    m = torch.zeros(len(geos), st.n_majors, dtype=torch.bool)
    if civic >= 0:
        for b, g in enumerate(geos):
            for r, held in enumerate(g["civics"]):
                m[b, r] = civic in held
    return m.to(st.device)


def decide_geo(st, geos: list, seeds=None):
    """The five DIPLOMATIC want-masks and the deal tables, every seat at once,
    off `geos` (one diplomatic table per game, `neutral.geo_obs`).

    TWO STYLES, drawn once per (game seed, seat) and fixed for the game, the
    research draw's discipline: a DIPLOMAT courts — friendship, then the
    alliance friendship unlocks, then open borders and a gift — and everyone
    else keeps to the grudge it already had. Held apart on purpose: a table
    where every seat both courts and denounces settles into one behaviour, and
    a table where everyone befriends everyone has no war left in it."""
    B, dev = len(geos), st.device
    nrow = st.n_majors
    den = torch.zeros(B, nrow, nrow, dtype=torch.bool, device=dev)
    ally = torch.zeros_like(den)
    ally_ty = torch.full((B, nrow, nrow), -1, dtype=torch.long, device=dev)
    frd = torch.zeros_like(den)
    bord = torch.zeros_like(den)
    gift = torch.zeros(B, ladder.GW_KINDS, nrow, nrow, dtype=torch.bool, device=dev)
    deleg = torch.zeros_like(den)
    _di = st.deal_items
    off = torch.full((B, nrow, 1 + 2 * _di * 3), -1, dtype=torch.long, device=dev)
    acc = torch.zeros_like(den)
    if nrow < 2:
        return den, frd, ally, bord, gift, deleg, off, acc, ally_ty
    g = {f: _geo_t(geos, f, dev) for f in (
        "alive", "cities", "strength", "treasury", "war", "denounce", "friend_turns", "ally_turns",
        "borders_turns", "delegation", "grievance", "proximity", "great_works")}
    alive_row = (g["alive"] > 0) & (g["cities"] > 0)
    rstr = g["strength"]
    prox_max = st.dow_proximity
    prox = g["proximity"]
    war, dn = g["war"] > 0, g["denounce"] > 0
    friend, ally_t, borders = g["friend_turns"], g["ally_turns"], g["borders_turns"]

    def _diplo_row(r: int) -> torch.Tensor:
        pin = _seat_style(r)["diplo"]
        if pin is not None:
            return torch.full((B,), bool(pin), dtype=torch.bool, device=dev)
        if seeds is None:
            return torch.zeros(B, dtype=torch.bool, device=dev)
        return _policy_rng(dev, seeds, 0, r, 5) < ladder.DIPLO_SHARE

    diplo = torch.stack([_diplo_row(r) for r in range(nrow)], dim=1)
    ob_civic = _geo_civic(st, geos, st.open_borders_civic)
    al_civic = _geo_civic(st, geos, st.alliance_civic)
    emb_civic = _geo_civic(st, geos, st.embassy_civic if st.embassy_civic < st.NC else -1)
    gw = g["great_works"]
    for a in range(nrow):
        for b in range(nrow):
            if a == b:
                continue
            pair = alive_row[:, a] & alive_row[:, b] & ~war[:, a, b]
            quiet = pair & ~dn[:, a, b] & ~dn[:, b, a]
            den[:, a, b] = (
                pair & ~diplo[:, a] & ~dn[:, a, b]
                & (friend[:, a, b] == 0) & (ally_t[:, a, b] == 0)
                & (prox[:, a, b] <= prox_max) & (rstr[:, a] > rstr[:, b])
            )
            frd[:, a, b] = (
                quiet & diplo[:, a] & (friend[:, a, b] == 0)
                & (prox[:, a, b] <= prox_max)
                & (g["grievance"][:, a, b] == 0)
            )
            ally[:, a, b] = (
                quiet & diplo[:, a] & al_civic[:, a]
                & (friend[:, a, b] > 0) & (ally_t[:, a, b] == 0)
            )
            # the TYPE is a per-(game, pair) style - stable across renewals
            ally_ty[:, a, b] = (
                (_policy_rng(dev, seeds, 0, min(a, b) * nrow + max(a, b), 9) * 5).long().clamp(min=0, max=4)
                if seeds is not None else torch.zeros(B, dtype=torch.long, device=dev))
            # Granted to whoever this seat already trusts, and by a diplomat to
            # any quiet neighbour — the grant is one-way, so it costs the
            # grantor nothing but the passage.
            bord[:, a, b] = (
                quiet & ob_civic[:, a] & (borders[:, a, b] == 0)
                & (diplo[:, a] | (friend[:, a, b] > 0) | (ally_t[:, a, b] > 0))
            )
            # A gift goes to a FRIEND, and only down the gradient: the richer
            # holder of that kind gives, which settles rather than ping-pongs.
            # A mission is cheap, permanent and pays visibility, so a seat
            # sends one to every quiet rival it has none with and can afford.
            _cost = torch.where(emb_civic[:, a], st.embassy_cost, st.delegation_cost)
            deleg[:, a, b] = (quiet & (g["delegation"][:, a, b] == 0)
                              & (g["treasury"][:, a] >= _cost))
            trusted = (friend[:, a, b] > 0) | (ally_t[:, a, b] > 0)
            for kind in range(ladder.GW_KINDS):
                gift[:, kind, a, b] = quiet & diplo[:, a] & trusted & (gw[:, a, kind] > gw[:, b, kind])
    _deal_turn(st, geos, g, off, acc, alive_row, rstr, prox, prox_max)
    return den, frd, ally, bord, gift, deleg, off, acc, ally_ty


# The driver's own PRICES. No source publishes what the AI thinks a deal is
# worth, so a valuation belongs here and nowhere near the engine: the applier
# validates every item, and these numbers only decide what gets proposed.
DEAL_TRIBUTE = 50      # gold a losing side puts on a peace table
DEAL_SPY_PRICE = 100   # what a captor asks to let a prisoner go
DEAL_RES_LOT = 10      # the lot size of a strategic surplus
DEAL_RES_PRICE = 50
DEAL_RES_SPARE = 20    # a stockpile is SURPLUS above this
DEAL_FAVOR_LOT = 5
DEAL_FAVOR_PRICE = 20
DEAL_FAVOR_SPARE = 10
DEAL_BORDERS_PRICE = 20
DEAL_AID_GIFT = 50      # what a member of an Aid Request sends its target


def _deal_turn(st, geos: list, g: dict, off, acc, alive_row, rstr, prox, prox_max) -> None:
    """WHAT EACH SEAT PUTS ON THE TABLE, and what it takes off one.

    One offer per seat per turn, to the lowest-numbered rival that qualifies,
    and one rule behind it: sell what you have most of and ask gold for it —
    except at war, where the only thing worth proposing is peace."""
    B, dev, nrow = len(geos), st.device, st.n_majors
    _di = st.deal_items
    kd = st.deal_kind
    k_gold = kd["GOLD"]
    stockpile = _geo_t(geos, "stockpile", dev)                         # [B, n, strategic]
    ns = stockpile.shape[2]
    war_min = st.war_min_turns
    war, dn = g["war"] > 0, g["denounce"] > 0
    treasury = g["treasury"]
    war_turns = _geo_t(geos, "war_turns", dev)
    offer_left = _geo_t(geos, "offer_left", dev)
    offer_ask = _geo_t(geos, "offer_ask", dev).reshape(B, nrow, nrow, _di, 3)
    spies_held = _geo_t(geos, "spies_held", dev)
    joint_open = _geo_t(geos, "joint_open", dev) > 0
    favor = _geo_t(geos, "favor", dev)
    comp_kind, comp_target = _geo_t(geos, "comp_kind", dev), _geo_t(geos, "comp_target", dev)
    comp_member = _geo_t(geos, "comp_member", dev) > 0
    jw_civic = _geo_civic(st, geos, st.joint_war_civic)
    ob_civic = _geo_civic(st, geos, st.open_borders_civic)
    taken = torch.zeros(B, nrow, dtype=torch.bool, device=dev)

    def _put(a: int, b: int, live, give, ask) -> None:
        """Write one seat's offer, first qualifying rival wins."""
        sel = live & ~taken[:, a]
        if not bool(sel.any()):
            return
        taken[:, a] |= sel
        off[:, a, 0] = torch.where(sel, torch.full_like(off[:, a, 0], b), off[:, a, 0])
        for s, it in enumerate(give):
            for c in range(3):
                off[:, a, 1 + s * 3 + c] = torch.where(sel, it[c], off[:, a, 1 + s * 3 + c])
        for s, it in enumerate(ask):
            for c in range(3):
                off[:, a, 1 + _di * 3 + s * 3 + c] = torch.where(
                    sel, it[c], off[:, a, 1 + _di * 3 + s * 3 + c])

    def _lit(v) -> torch.Tensor:
        return v if torch.is_tensor(v) else torch.full((B,), int(v), dtype=torch.long, device=dev)

    def _item(kind: int, a=0, b=0):
        return (_lit(kind), _lit(a), _lit(b))

    for a in range(nrow):
        for b in range(nrow):
            if a == b:
                continue
            pair = alive_row[:, a] & alive_row[:, b]
            gold = treasury[:, a]
            # AT WAR: the only table worth setting is the one that ends it, and
            # the weaker side is the one that pays to end it.
            losing = (pair & war[:, a, b] & (war_turns[:, a, b] >= war_min)
                      & (rstr[:, a] < rstr[:, b]) & (gold >= DEAL_TRIBUTE))
            _put(a, b, losing, [_item(k_gold, DEAL_TRIBUTE)], [])
            quiet = (pair & ~war[:, a, b] & ~dn[:, a, b]
                     & ~dn[:, b, a] & (offer_left[:, a, b] == 0))
            # AID: while an Aid Request runs, a member with a purse to spare
            # gifts the victim gold — the only one-sided table on the list
            if st.comp_aid >= 0:
                aid = ((comp_kind == st.comp_aid) & (comp_target == b)
                       & comp_member[:, a] & (gold >= DEAL_AID_GIFT * 2))
                _put(a, b, quiet & aid, [_item(k_gold, DEAL_AID_GIFT)], [])
            # A JOINT WAR: a seat with Foreign Trade asks a partner who shares
            # its grudge — both have denounced a third major neither is bound
            # to — to declare on it together (CIV6 DIPLOACTION_JOINT_WAR)
            if st.joint_war_civic >= 0:
                for x in range(nrow):
                    if x in (a, b):
                        continue
                    grudge = (quiet & alive_row[:, x] & jw_civic[:, a]
                              & dn[:, a, x] & dn[:, b, x]
                              & joint_open[:, a, x] & joint_open[:, b, x])
                    _put(a, b, grudge, [_item(kd["JOINT_WAR"], x)], [])
            # A PRISONER goes home for a price.
            _put(a, b, quiet & (spies_held[:, b, a] > 0),
                 [_item(kd["SPY"])], [_item(k_gold, DEAL_SPY_PRICE)])
            # A STRATEGIC SURPLUS is a lot with a price on it.
            if ns > 0:
                stock = stockpile[:, a]
                spare = stock > DEAL_RES_SPARE
                best = stock.argmax(dim=1)
                _put(a, b, quiet & spare.any(dim=1),
                     [(_lit(kd["RESOURCE"]), best, _lit(DEAL_RES_LOT))],
                     [_item(k_gold, DEAL_RES_PRICE)])
            # SPARE FAVOR, and finally the passage a diplomat sells cheap.
            _put(a, b, quiet & (favor[:, a] > DEAL_FAVOR_SPARE),
                 [_item(kd["FAVOR"], DEAL_FAVOR_LOT)],
                 [_item(k_gold, DEAL_FAVOR_PRICE)])
            _put(a, b, quiet & ob_civic[:, a] & (g["borders_turns"][:, a, b] == 0)
                 & (prox[:, a, b] <= prox_max),
                 [_item(kd["OPEN_BORDERS"])], [_item(k_gold, DEAL_BORDERS_PRICE)])

    # ...and what a seat takes off the table. A peace deal is always worth
    # answering; anything else has to cost less than half the purse.
    for a in range(nrow):
        for b in range(nrow):
            if a == b:
                continue
            standing = alive_row[:, a] & alive_row[:, b] & (offer_left[:, b, a] > 0)
            if not bool(standing.any()):
                continue
            ask = offer_ask[:, b, a]
            owed = torch.zeros(B, dtype=torch.long, device=dev)
            for s in range(_di):
                owed = owed + torch.where(ask[:, s, 0] == k_gold,
                                          ask[:, s, 1].clamp(min=0), torch.zeros_like(owed))
            afford = treasury[:, a] >= owed * 2
            acc[:, a, b] = standing & (war[:, a, b] | afford)


def _district_tiles(st, prod: torch.Tensor, sites: dict):
    """[B, C, nS] the tile each city (array order, `prod`'s axis) would put
    each district column on, or None when this world has no district columns.

    The placement CHOICE, which is policy and belongs here: a scan per engine
    would have to agree forever. Only the column a city actually picked is
    filled — every other entry stays -1, and the apply refuses a district
    column whose tile is -1. The plots and their adjacency are the
    observation's (`_obs_cities`' `sites`).
    """
    nS = len(st.scaffold) if st.districts_on else 0
    if nS == 0:
        return None
    B, C = prod.shape
    out = torch.full((B, C, nS), -1, dtype=torch.long, device=prod.device)
    # WHICH (city, district) pairs anybody picked, in ONE transfer
    si_all = prod - st.district_base
    sel = (si_all >= 0) & (si_all < nS)
    if not bool(sel.any()):
        return out
    pairs = sorted({(int(k), int(s)) for (_b, k), s
                    in zip(sel.nonzero(as_tuple=False).tolist(), si_all[sel].tolist())})
    for k, si in pairs:
        col = st.district_base + si
        want = prod[:, k] == col
        per_game = [sites.get((b, k, col), []) for b in range(B)]
        # the planes only need to span the listed plots: the rank is (adjacency,
        # then the LOWEST tile), whatever the width
        w = 1 + max((t for ps in per_game for t, _a in ps), default=0)
        elig = torch.zeros(B, w, dtype=torch.bool)
        adj = torch.zeros(B, w, dtype=torch.float64)
        for b, ps in enumerate(per_game):
            for t, a in ps:
                elig[b, t] = True
                adj[b, t] = a
        t = ladder.pick_district_tile(elig, adj).to(prod.device)
        out[:, k, si] = torch.where(want, t, out[:, k, si])
    return out


def _maybe_form_tier(st, row: int, mask: torch.Tensor, prod: torch.Tensor,
                     seeds, turn) -> torch.Tensor:
    """Sometimes train the corps instead of the unit — and rarely the army.

    A formation column the driver never picks is a verb the gate never
    reaches; the applier re-validates every clause, so a swap the city cannot
    honour is refused there like any other fuzzed decision."""
    if seeds is None or mask.shape[2] <= st.form_base:
        return prod
    is_u = (prod >= st.unit_base) & (prod < st.unit_base + st.NU)
    if not bool(is_u.any()):
        return prod
    r = _policy_rng(st.device, seeds, turn, row, 7)
    hit = is_u & (r < ladder.FORM_SHARE).unsqueeze(1)
    if not bool(hit.any()):
        return prod
    corps = torch.where(is_u, st.form_base + prod - st.unit_base, prod)
    army = corps + st.NU
    lastc = mask.shape[2] - 1
    can_a = mask.gather(2, army.clamp(min=0, max=lastc).unsqueeze(2)).squeeze(2)
    can_c = mask.gather(2, corps.clamp(min=0, max=lastc).unsqueeze(2)).squeeze(2)
    # the army is the rarer, richer order; the corps is the fallback
    deep = can_a & (r < ladder.FORM_SHARE * 0.3).unsqueeze(1)
    pick = torch.where(deep, army, corps)
    return torch.where(hit & (deep | can_c), pick, prod)


def _decide_gp_pass(nobs: list, row: int, seeds, turn, device) -> torch.Tensor | None:
    """Sometimes PASS on a claimable Great Person. Free variation like the
    reorder: the applier re-validates every clause, and a verb nothing ever
    chooses is a verb the gate never reaches. The offers are the
    observation's `gp` group."""
    if seeds is None or not nobs[0]["gp"]["offer"]:
        return None
    offer = _obs_dense(nobs, "gp", "offer", device)
    elig = ((offer >= 0) & (_obs_dense(nobs, "gp", "passed_by", device) < 0)
            & (_obs_dense(nobs, "gp", "points", device) >= _obs_dense(nobs, "gp", "price", device)))
    if not bool(elig.any()):
        return None
    r = _policy_rng(device, seeds, turn, row, 8)
    hit = elig.any(dim=1) & (r < ladder.GP_PASS_SHARE)
    if not bool(hit.any()):
        return None
    pick = elig.long().argmax(dim=1)
    return torch.where(hit, pick, torch.full_like(pick, -1))


def tables(st) -> tuple:
    """(roster, classes) — the unit roster and the production classes the
    ladder picks over, off the static value. Static per game: the caller
    builds them once and hands them to every `decide_seat`."""
    nS = len(st.scaffold)
    return (ladder.unit_roster(st.units),
            ladder.prod_classes(st.NB, st.NU, nS, st.n_wonders if st.districts_on else 0,
                                st.n_projects if st.districts_on else 0))


# Every decision a seat takes in a turn, by name: `decide_seat` answers all of
# them but `seq`, which `plan_units` answers. `core.records` hands them on as
# one positional record in this order — a reader that hard-codes a slot rots
# the moment a column is INSERTED, so read by name
# (`DECIDE_FIELDS.index(...)`) and assert the length.
DECIDE_FIELDS = (
    "prod", "dtile", "tech", "civic", "war", "war_kind", "env_seq", "seq",
    "buy", "worship", "relig", "levy", "monu", "nat", "cls", "ucls", "pat",
    "band", "dist", "route", "nuke", "spec", "lock", "swap", "vote", "gp_pass",
    "policies",
)


def decide_seat(st, row: int, nobs: list, roster: dict, classes: dict, seeds=None) -> dict:
    """Seat `row`'s turn decisions, every DECIDE_FIELDS entry but the unit
    plan, keyed by name. Writes nothing. `nobs` is the seat's neutral
    observation, one dict per game (shared/decide.schema.json). `prod` is
    (centre [B, C], column [B, C]) over the observation's cities in array
    order, and `dtile` [B, C, nS] rides the same axis, as do `spec`
    (centre [B, C], pins [B, C, nD]) and `lock` [B, C]. `seeds` keys the
    driver's draws per game; without them nothing is drawn."""
    dev = st.device
    B = len(nobs)
    turn, t = _turns(nobs)
    # PRODUCTION on the observation's city axis — array order, every city
    # named by its centre; the record resolves each centre to its slot
    cities = _obs_cities(nobs, st.prod_w, dev)
    blocks = _blocks(st, nobs)
    style = _seat_style(row)
    prod = ladder.pick_production(cities["mask"], classes, roster, _prod_ctx(st, blocks, cities, row, turn),
                                  tier_order=style["tier_order"])
    prod = _maybe_form_tier(st, row, cities["mask"], prod, seeds, t)
    dtile = _district_tiles(st, prod, cities["sites"])
    # turn 0 keeps the draw PERSISTENT: a seat's style is fixed for the game.
    if style["deep"] is not None:
        deep = torch.full((B,), bool(style["deep"]), dtype=torch.bool, device=st.device)
    else:
        deep = (_policy_rng(st.device, seeds, 0, row, 4) < ladder.DEEP_SHARE
                if seeds is not None else None)
    # RESEARCH off the observation's prices: an open item carries its whole
    # effective cost, a shut one -1
    tech_cost = _obs_dense(nobs, "research", "tech_cost", dev)
    civic_cost = _obs_dense(nobs, "research", "civic_cost", dev)
    tech = (ladder.pick_research(tech_cost, tech_cost >= 0, deep)
            if bool((tech_cost >= 0).any()) else None)
    civic = (ladder.pick_research(civic_cost, civic_cost >= 0, deep)
             if bool((civic_cost >= 0).any()) else None)
    # the SLOTTED CARDS — a decision every turn the seat has a government;
    # None when no card is on offer, which the wire reads as "no decision"
    policies = None
    pol_open = _obs_members(nobs, "policy", "unlocked", st.npol, dev)
    if bool(pol_open.any()):
        # the seat's CARD STYLE: pinned by its style preset, else one persistent
        # draw per game (turn 0, salt 10) — a coherent player, not a coin per turn
        if style["cards"] is not None:
            cstyle = torch.full((B,), ladder.CARD_STYLE_NAMES.index(style["cards"]), dtype=torch.long, device=st.device)
        elif seeds is not None:
            cstyle = ladder.card_style_of(_policy_rng(st.device, seeds, 0, row, 10))
        else:
            cstyle = None
        policies = ladder.pick_policies(pol_open, _obs_dense(nobs, "policy", "slots", dev), st.pol_kind,
                                        legacy=st.pol_legacy, style=cstyle, dark=st.pol_dark)
    war = None
    war_kind = None
    if seeds is not None:
        rng_w = {
            "dow": _policy_rng(st.device, seeds, t, row, 1),
            "peace": _policy_rng(st.device, seeds, t, row, 2),
            "raid": _policy_rng(st.device, seeds, t, row, 3),
        }
        n_tgt = int(nobs[0]["war"]["targets"])
        war_mask = torch.cat([_obs_members(nobs, "war", "declare", n_tgt, dev),
                              _obs_members(nobs, "war", "sue", n_tgt, dev)], dim=1)
        war = ladder.pick_war(war_mask, _war_ctx(blocks), rng_w, style=style)
        # THE KIND the column declares under, off the observation's table —
        # the engine's own validator built it (the cheapest casus belli held,
        # or the leader's buffed kind under the style), so the record can
        # never name a kind the applier refuses.
        kinds = _obs_dense(nobs, "war", "kind_own" if style["war_kind"] == "own" else "kind_default", dev)
        war_kind = _war_kind_of(war, kinds)
    env_seq = None
    if seeds is not None:
        env_seq = _seat_envoys(nobs, dev)
    buy, worship, relig, levy, monu, nat, cls, ucls, pat, band, dist = _decide_buys(_obs_group(nobs, "buy", st.device))
    route = _decide_route(_obs_group(nobs, "route", st.device))
    # THE SILO LAUNCH: take the observation's candidate whenever one exists,
    # exactly as the route verb does.
    _nk = _obs_group(nobs, "nuke", st.device)
    nuke = (_nk["device"], _nk["tile"])
    spec, lock = _decide_citizens(st, nobs)
    swap = _decide_swap(nobs, dev)
    vote = _decide_vote(nobs, row, dev)
    gp_pass = _decide_gp_pass(nobs, row, seeds, t, dev)
    return {"prod": (cities["centre"], prod), "dtile": dtile, "tech": tech, "civic": civic, "war": war,
            "war_kind": war_kind, "env_seq": env_seq, "buy": buy, "worship": worship,
            "relig": relig, "levy": levy, "monu": monu, "nat": nat, "cls": cls, "ucls": ucls,
            "pat": pat, "band": band, "dist": dist, "route": route, "nuke": nuke, "spec": spec,
            "lock": lock, "swap": swap, "vote": vote, "gp_pass": gp_pass, "policies": policies}


def plan_units(st, row: int, nobs: list, max_steps: int = 4) -> torch.Tensor:
    """[B, N, K] — the seat's unit orders, one rank per step a unit takes.

    The draw order: the driver PLANS, the PHASE executes. Applying steps
    pre-step to re-observe would consume combat draws at a different stream
    position than TS's in-phase replay — same totals, different rolls per
    battle. Rank 0 comes from the real observation; later ranks are planned
    VIRTUALLY for MOVE rows only, chaining pair_dist toward the unit's own war
    target (or home) with the march's own key (d*8+dir) and NO state mutation.
    Non-move verbs end the turn at rank 0, exactly like the scripted walkers.
    The phase executes the stash at the walkers' position and RE-VALIDATES
    every rank: an illegal later step refuses, never substitutes."""
    orders0, job_t, spread_t, settle_t, cur, at_war_rows, war = _seat_unit_orders(st, row, nobs)
    B2, N2 = orders0.shape
    ranks = [orders0]
    # the march targets are chosen ONCE, off the rank-0 positions, and the
    # later ranks walk toward them; recomputing per rank would let a unit
    # re-aim mid-plan at somebody the phase has not seen it approach.
    vplan_tgts = None
    for _k in range(1, max_steps):
        prev = ranks[-1]
        moving = (prev >= 0) & (prev < 6)
        if not bool(moving.any()):
            break
        nb_prev = st.neigh[cur.clamp(min=0)]
        cur = torch.where(moving, nb_prev.gather(2, prev.clamp(min=0, max=5).unsqueeze(2)).squeeze(2), cur)
        nxt = torch.full_like(prev, -1)
        nb_now = st.neigh[cur.clamp(min=0)]          # [B, N, 6]
        # war rows: toward the recorded war target; peace rows: toward home,
        # respecting the stop radius. Distances are read-only pair_dist plans;
        # terrain/occupancy legality is the PHASE's re-validation problem.
        if vplan_tgts is None:
            tgt_b, hi_b, hcty_b = _march_targets(st, war, cur.clamp(min=0))
            vplan_tgts = torch.where(hi_b | hcty_b, tgt_b,
                                     torch.full((B2, N2), -1, dtype=torch.long, device=st.device))
        tgts = vplan_tgts
        # the destination is the same elementwise fall-through for every slot,
        # so it is taken for the whole plane at once — and the slots that end
        # up with one to walk to come out of a single reduction instead of two
        # host syncs a slot.
        dest_all = torch.where(at_war_rows & (tgts >= 0), tgts, torch.full_like(tgts, -1))
        dest_all = torch.where((dest_all < 0) & (job_t >= 0), job_t, dest_all)
        dest_all = torch.where((dest_all < 0) & (spread_t >= 0), spread_t, dest_all)
        dest_all = torch.where((dest_all < 0) & (settle_t >= 0), settle_t, dest_all)
        ok_all = moving & (dest_all >= 0)
        for n in _acting_slots(ok_all):
            dest = dest_all[:, n]
            ok_rows = ok_all[:, n]
            d_cur = st.pair_dist[cur[:, n].clamp(min=0), dest.clamp(min=0)].to(torch.long)
            d_nb = st.pair_dist[nb_now[:, n].clamp(min=0), dest.clamp(min=0).unsqueeze(1)].to(torch.long)
            closer = (nb_now[:, n] >= 0) & (d_nb < d_cur.unsqueeze(1))
            key = torch.where(closer, d_nb * 8 + torch.arange(6, device=st.device), torch.full_like(d_nb, 10 ** 9))
            best = key.argmin(dim=1)
            has_step = closer.any(dim=1) & ok_rows
            nxt[:, n] = torch.where(has_step, best, nxt[:, n])
        ranks.append(nxt)
        if not bool((nxt >= 0).any()):
            ranks.pop()
            break
    return torch.stack(ranks, dim=2) if len(ranks) > 1 else ranks[0].unsqueeze(2)
