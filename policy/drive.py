from __future__ import annotations

import json
from pathlib import Path

import torch

import ladder
from core import simbase

# The NEUTRAL OBSERVATION's field spec (names, kinds, meanings), shared with
# every engine that emits it.
_SCHEMA = json.loads((Path(__file__).resolve().parents[1] / "shared" / "decide.schema.json")
                     .read_text(encoding="utf-8"))


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


def _prod_ctx(blocks: dict, cities: dict, sim, seat: int) -> dict:
    """The per-seat counters no mask can express, read from the OBSERVATION —
    the ctx block (ladder.CTX_FIELDS) and the `cities` rows — rather than off
    sim tensors, so a TS client rendering the same observation feeds the
    ladder identically. city_cap stays rules-side: static data is not
    state."""
    ctx = blocks["ctx"]
    n_cities = ctx[:, 0].long()
    # ONE city cap for every seat — the ladder's maxCities heuristic. (The
    # seat-0 arm this replaced read a `sim.C` that was itself
    # `rules.seats.maxCities`, so the fork never carried a difference; the
    # storage rename left the name dangling and the branch pointless.)
    style = _seat_style(seat)
    cap = (int(sim.rules.seats.get("maxCities", 6)) if style["city_cap"] is None
           else int(style["city_cap"]))
    nS = len(sim._scaffold) if sim.districts_on else 0
    # WHICH district to place is a decision, and the driver rotates it so
    # the whole scaffold is reached rather than only its head; a style's
    # dist_pref pins the rotation START to a named district, keeping the
    # legal fallthrough.
    rot = ((seat + sim.turn) % nS) if nS else None
    if nS and style["dist_pref"] is not None:
        si = next((k for k, (di, *_r) in enumerate(sim._scaffold)
                   if sim.districts_cat[di].get("id") == style["dist_pref"]), None)
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


def _blocks(env, sim, row: int, obs: torch.Tensor | None = None) -> dict:
    if obs is None:
        obs = env.observe(row)
    # tech/civic widths come off the live tensors — there is no NT/NC scalar,
    # and hardcoding one here would be the second copy that always drifts.
    return ladder.split(obs, sim.S, sim.n_majors - 1, sim.RC, sim.civ_techs.shape[2], sim.civ_civics.shape[2])


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


def _policy_rng(sim, seeds: list, turn: int, row: int, salt: int) -> torch.Tensor:
    return torch.tensor(
        [_policy_rand(int(s_), turn, row, salt) for s_ in seeds],
        dtype=torch.float64, device=sim.device,
    )



def _seat_units(sim, seat: int):
    smap = sim._seat_slot_map(seat)
    sc = smap.clamp(min=0)
    return (smap, smap >= 0,
            sim.unit_tile.gather(1, sc), sim.unit_type.gather(1, sc), sim.unit_charges.gather(1, sc))


def _acting_slots(rows_all: torch.Tensor) -> list:
    """The unit SLOTS any game acts in, from one reduction and one transfer.

    Every per-slot walk below asked `bool(x.any())` twice a slot — two host
    syncs each, for a roster that is mostly empty. The slot map is prefix-dense
    (`_seat_slot_map` ranks the living), so the `break` those loops carried and
    this filter cover exactly the same slots."""
    return [n for n, v in enumerate(rows_all.any(dim=0).tolist()) if v]


def _charge_jobs(sim, seat: int, idx: int, jobs: torch.Tensor,
                 out: torch.Tensor, present, tiles, types, charges) -> torch.Tensor:
    """The nearest tile with work on it for every unit of type `idx` that still
    holds a charge, tile index breaking the tie."""
    if idx < 0 or not bool(jobs.any()):
        return out
    rows_all = present & (types.clamp(min=0, max=sim.NU - 1) == idx) & (charges > 0)
    arangeT = torch.arange(sim.T, device=sim.device)
    # a job TAKEN by an earlier slot is masked out for the later ones, so two
    # units of one type (on one tile, or with one nearest job) are not both
    # sent to the same tile; the plane is cloned because the caller's is a
    # cached mask
    jobs = jobs.clone()
    for n in _acting_slots(rows_all):
        rows = rows_all[:, n]
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(jobs, d * sim.T + arangeT, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & jobs.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
        if bool(has.any()):
            _hr = has.nonzero(as_tuple=True)[0]
            jobs[_hr, best[_hr]] = False
    return out


def _builder_jobs(sim, seat: int, units=None) -> torch.Tensor:
    smap, present, tiles, types, charges = _seat_units(sim, seat) if units is None else units
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if not sim.improvements_on:
        return out
    # BUILDERS take the improvement jobs — a missionary's charge is a spread,
    # not a build. The MILITARY ENGINEER walks to its own list instead: its
    # improvements, an unroaded tile, or a 20% charge waiting to be spent.
    # Each job mask is a map-wide scan, so ask for the unit first, exactly as
    # the engineer arm below already does.
    bidx = sim._builder_idx
    if bidx >= 0 and bool(((types == bidx) & present & (charges > 0)).any()):
        out = _charge_jobs(sim, seat, bidx, sim._seat_job_mask(seat),
                           out, present, tiles, types, charges)
    eidx = getattr(sim, "_eng_idx", -1)
    if eidx < 0 or not bool(((types == eidx) & present & (charges > 0)).any()):
        return out
    return _charge_jobs(sim, seat, eidx, sim._seat_engineer_job_mask(seat),
                        out, present, tiles, types, charges)


def _gp_site_plane(sim, seat: int, site: int, arg: int) -> torch.Tensor:
    """[B, T] — where a charge with this SITE code may be spent. The mask is
    the authority on legality; this is only what a Great Person walks toward,
    so it answers per site rather than per person."""
    own = sim.tile_seat == seat
    if site == 0:  # the class's own completed district
        if arg < 0:
            return torch.zeros_like(own)
        return own & (sim.district == arg) & sim.district_complete & ~sim.pillaged
    if site == 1:  # anywhere — nothing to walk to
        return torch.ones_like(own)
    if site == 2:  # a city with an open slot taking a work of this class's kind
        out = torch.zeros_like(own)
        col = sim.city_slot_at(seat)
        for kind in range(3):
            if sim._gw_cls[kind] < 0:
                continue
            free = sim._gw_room_kind(seat, kind) & sim.city_alive[:, seat]
            out = out | (own & (col >= 0) & free.gather(1, col.clamp(min=0)))
        return out
    if site == 3:  # inside any city-state's territory
        return (sim.tile_seat >= 100) & (sim.tile_seat < simbase.BARB_SEAT)
    if site == 4:  # an owned tile carrying a luxury
        return own & (sim.lux_id >= 0)
    if site == 6:  # a city-state's territory this seat is Suzerain of (Raffles)
        if sim.S == 0:
            return torch.zeros_like(own)
        cs = (sim.tile_seat >= 100) & (sim.tile_seat < simbase.BARB_SEAT)
        s = (sim.tile_seat - 100).clamp(min=0, max=sim.S - 1)
        return cs & sim._suzerain_mask(seat).gather(1, s)
    if site == 7:  # beside a barbarian unit (Boudica)
        bp = sim._barb_unit_plane()
        nb7 = sim.neigh
        near = (bp[:, nb7.clamp(min=0).reshape(-1)].reshape(own.shape[0], sim.T, 6)
                & (nb7 >= 0).unsqueeze(0)).any(dim=2)
        return near & sim.passable
    if site == 8:  # the territory of a seat at war with this one (Tupac Amaru)
        return sim._enemy_ground(seat, sim.tile_seat)
    # 5: unclaimed ground next to this seat's territory
    nb = sim.neigh
    adj = (own[:, nb.clamp(min=0).reshape(-1)].reshape(own.shape[0], sim.T, 6)
           & (nb >= 0).unsqueeze(0)).any(dim=2)
    return (sim.tile_seat < 0) & adj


def _gp_jobs(sim, seat: int, units=None) -> torch.Tensor:
    """[B, N] — the nearest tile each Great Person can spend its charge on,
    tile index breaking the tie. -1 for every other unit and for a person
    whose site exists nowhere yet."""
    smap, present, tiles, types, charges = _seat_units(sim, seat) if units is None else units
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if getattr(sim, "_A_GP", -1) < 0:
        return out
    sc = smap.clamp(min=0)
    cls = sim._gp_cls_of(types)
    at = sim.unit_gp_at.gather(1, sc)
    live = present & (cls >= 0) & (at >= 0) & (charges > 0)
    if not bool(live.any()):
        return out
    maxN = sim._gp_site.shape[1] - 1
    site = sim._gp_site[cls.clamp(min=0), at.clamp(min=0, max=maxN)]
    sdist = sim._gp_site_district[cls.clamp(min=0), at.clamp(min=0, max=maxN)]
    arangeT = torch.arange(sim.T, device=sim.device)
    planes: dict = {}
    for n in _acting_slots(live):
        rows = live[:, n]
        for key in {(int(a), int(b)) for a, b in zip(site[rows, n].tolist(), sdist[rows, n].tolist())}:
            if key[0] == 1:
                continue  # activates where it stands
            pl = planes.get(key)
            if pl is None:
                pl = _gp_site_plane(sim, seat, key[0], key[1])
                planes[key] = pl
            take = rows & (site[:, n] == key[0]) & (sdist[:, n] == key[1])
            if not bool(take.any()) or not bool(pl.any()):
                continue
            d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
            k = torch.where(pl, d * sim.T + arangeT, torch.full_like(d, 2 ** 30))
            best = k.argmin(dim=1)
            has = take & pl.gather(1, best.unsqueeze(1)).squeeze(1)
            out[:, n] = torch.where(has, best, out[:, n])
    return out


def _spread_targets(sim, seat: int, units=None) -> torch.Tensor:
    smap, present, tiles, types, charges = _seat_units(sim, seat) if units is None else units
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    done = sim.civ_religion_done[:, seat]
    if not bool(done.any()):
        return out
    # WHO could spread at all, before the map-wide follower scan below: a seat
    # with no missionary and no apostle answers -1 either way.
    vt_all = types.clamp(min=0, max=sim.NU - 1)
    relig_all = torch.zeros_like(present)
    if sim._missionary_idx >= 0:
        relig_all = relig_all | (vt_all == sim._missionary_idx)
    if sim._apostle_idx >= 0:
        relig_all = relig_all | (vt_all == sim._apostle_idx)
    rows_all = present & relig_all & (charges > 0) & done.unsqueeze(1)
    live_n = _acting_slots(rows_all)
    if not live_n:
        return out
    g = seat
    T = sim.T
    nrow = sim.n_majors
    acc = torch.zeros(B, T, dtype=torch.long, device=sim.device)
    acc.scatter_add_(
        1, sim.city_center[:, :nrow].clamp(min=0).reshape(B, -1),
        (sim.city_alive[:, :nrow] & (sim.city_followed[:, :nrow] != g)).long().reshape(B, -1),
    )
    tm = acc > 0
    if not bool(tm.any()):
        return out
    arangeT = torch.arange(T, device=sim.device)
    for n in live_n:
        rows = rows_all[:, n]
        here = tiles[:, n]
        d = sim.pair_dist[here.clamp(min=0)].to(torch.long)
        key = torch.where(tm, d * (T + 1) + arangeT, torch.full_like(d, 2 ** 40))
        best = key.argmin(dim=1)
        has = rows & tm.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _settle_targets(sim, seat: int, units=None):
    """([B, N] nearest-foundable tile per SETTLER row, [B, T] foundable plane)
    — canFoundCity's own terms over the whole map: unowned, settle_ok, bare of
    district and wonder, >= 4 from every live city (majors and city-states),
    and under the city cap. The plane feeds the FOUND override (found only
    where the apply would accept) and the target feeds the walk."""
    smap, present, tiles, types, charges = _seat_units(sim, seat) if units is None else units
    B, N = smap.shape
    dev = sim.device
    T = sim.T
    out = torch.full((B, N), -1, dtype=torch.long, device=dev)
    ok = torch.zeros(B, T, dtype=torch.bool, device=dev)
    if sim._settler_idx < 0 or sim._A_FOUND < 0:
        return out, ok
    is_settler = present & (types == sim._settler_idx)
    under_cap = sim.city_alive[:, seat].sum(dim=1) < int(sim.rules.seats.get("maxCities", 6))
    if not bool(is_settler.any()) or not bool(under_cap.any()):
        return out, ok
    nrow = sim.n_majors
    ctr = torch.cat((sim.city_center[:, :nrow].reshape(B, -1), sim.citystate_center), dim=1)
    live = torch.cat((sim.city_alive[:, :nrow].reshape(B, -1), sim.citystate_alive), dim=1)
    for b in range(B):
        if not bool(under_cap[b]):
            continue
        cb = ctr[b][live[b]]
        dmin = (sim.pair_dist[:, cb.clamp(min=0)].min(dim=1).values.to(torch.long)
                if int(live[b].sum()) else torch.full((T,), 999, dtype=torch.long, device=dev))
        ok[b] = (
            (sim.tile_seat[b] < 0) & sim.settle_ok[b]
            & (sim.district[b] < 0) & (sim.built_wonder[b] < 0) & (dmin >= 4)
        )
    if not bool(ok.any()):
        return out, ok
    arangeT = torch.arange(T, device=dev)
    for n in _acting_slots(is_settler):
        rows = is_settler[:, n]
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(ok, d * T + arangeT, torch.full_like(d, 2 ** 40))
        best = key.argmin(dim=1)
        has = rows & ok.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out, ok


def _dig_targets(sim, seat: int, units=None) -> torch.Tensor:
    """[B, N] — the nearest workable DIG for each Archaeologist that still
    holds a charge, or -1. Keyed like the builder's job (distance, then tile
    index), and gated on the same terms the EXCAVATE column asks: own or
    unclaimed ground, and a museum slot to land the find in."""
    smap, present, tiles, types, charges = _seat_units(sim, seat) if units is None else units
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if sim._archaeologist_idx < 0 or sim._A_EXCAVATE < 0:
        return out
    # THE UNITS FIRST. `_dig_here` and `_museum_room` are map-wide scans, and a
    # seat holding no archaeologist answers -1 whatever they say.
    rows_all = (present & (types.clamp(min=0, max=sim.NU - 1) == sim._archaeologist_idx)
                & (charges > 0))
    live_n = _acting_slots(rows_all)
    if not live_n:
        return out
    allt = torch.arange(sim.T, device=sim.device).reshape(1, -1).expand(B, -1)
    digs = sim._dig_here(seat, allt) & ((sim.tile_seat < 0) | (sim.tile_seat == seat))
    digs = digs & sim._museum_room(seat).unsqueeze(1)
    if not bool(digs.any()):
        return out
    for n in live_n:
        rows = rows_all[:, n]
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(digs, d * sim.T + allt, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & digs.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _park_targets(sim, seat: int, units=None) -> torch.Tensor:
    """[B, N] — the nearest tile that ANCHORS a legal National Park cluster,
    for each Naturalist, or -1. Same distance-then-index key as the dig."""
    smap, present, tiles, types, _charges = _seat_units(sim, seat) if units is None else units
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if sim._naturalist_idx < 0 or sim._A_PARK < 0:
        return out
    # the cluster legality below is a map-wide scan over every ring of four:
    # ask for the naturalist first, and a seat without one never runs it.
    # a charge in hand, like `_dig_targets` and `_charge_jobs` (vacuous for
    # the Naturalist since ParkCharges 1 consumes it at 0, kept so the three
    # walks share one shape)
    rows_all = (present & (types.clamp(min=0, max=sim.NU - 1) == sim._naturalist_idx)
                & (_charges > 0))
    live_n = _acting_slots(rows_all)
    if not live_n:
        return out
    allt = torch.arange(sim.T, device=sim.device).reshape(1, -1).expand(B, -1)
    anchors = sim._park_cluster_legal(seat, sim._park_cluster(allt)).any(dim=2)
    if not bool(anchors.any()):
        return out
    for n in live_n:
        rows = rows_all[:, n]
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(anchors, d * sim.T + allt, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & anchors.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _seat_unit_orders(sim, seat: int, job_t=None, spread_t=None):
    um = sim._seat_unit_mask(seat)
    uo = sim.seat_unit_obs(seat)
    orders0 = ladder.pick_unit_orders(um, uo, a_pillage=sim._A_PILLAGE, a_snipe=sim._A_SNIPE, a_snipe3=sim._A_SNIPE3)
    # ONE read of the seat's living units for the whole pass — every target
    # table below asked `_seat_units` for itself, which is a slot-map rebuild
    # (cumsum, nonzero, scatter) and three gathers apiece. Nothing between
    # here and the return mutates them.
    units = _seat_units(sim, seat)
    _smap, present, tiles, _types, _charges = units
    # the serve tripwire computes both target tables pre-decide at the same
    # state; passing them here skips the recomputation (pure reads either way)
    if job_t is None:
        job_t = _builder_jobs(sim, seat, units=units)
    if spread_t is None:
        spread_t = _spread_targets(sim, seat, units=units)
    settle_t, found_ok = _settle_targets(sim, seat, units=units)
    dig_t = _dig_targets(sim, seat, units=units)
    park_t = _park_targets(sim, seat, units=units)
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
    gp_t = _gp_jobs(sim, seat, units=units)
    tgt = torch.where(tgt >= 0, tgt, torch.where(dig_t >= 0, dig_t, park_t))
    tgt = torch.where(tgt >= 0, tgt, gp_t)
    walkers = present & (tgt >= 0) & (tiles != tgt)
    if bool(walkers.any()):
        nbr_all = sim.neigh[tclamp]  # [B, N, 6]
        nbr = nbr_all
        d_cur = sim.pair_dist[tclamp, tgt.clamp(min=0)].to(torch.long)
        d_nb = sim.pair_dist[nbr.clamp(min=0), tgt.clamp(min=0).unsqueeze(2)].to(torch.long)
        closer = um[:, :, 0:6] & (nbr >= 0) & (d_nb < d_cur.unsqueeze(2))
        w_key = torch.where(closer, d_nb * 8 + torch.arange(6, device=um.device), torch.full_like(d_nb, 2 ** 30))
        has_w = walkers & closer.any(dim=2)
        orders0 = torch.where(has_w, w_key.argmin(dim=2), orders0)
    # A TRIBAL VILLAGE within one step is worth taking, and it OUTRANKS the
    # walk: the driver may freely choose (the applier validates and TS
    # replays the same orders), so steering at one is free coverage of a
    # mechanic the scripted walk otherwise never reaches — 250 turns over a
    # village-carrying world claimed NOTHING without this.
    if bool(sim.tile_goody.any()):
        if nbr_all is None:
            nbr_all = sim.neigh[tclamp]
        gnb = nbr_all                                             # [B, N, 6]
        B_, N_ = tiles.shape
        ghut = sim.tile_goody.gather(1, gnb.reshape(B_, -1).clamp(min=0)).reshape(B_, N_, 6)
        ghut = ghut & (gnb >= 0) & um[:, :, 0:6]
        gtake = present & ghut.any(dim=2)
        if bool(gtake.any()):
            # the lowest legal direction, the engine's own tie-break
            orders0 = torch.where(gtake, ghut.long().argmax(dim=2), orders0)
    A_SP = sim._A_SPREAD
    if A_SP >= 0 and bool((spread_t >= 0).any()):
        d_sp = sim.pair_dist[tclamp, spread_t.clamp(min=0)].to(torch.long)
        close = (spread_t >= 0) & present & (d_sp <= 1)
        if bool(close.any()):
            if nbr_all is None:
                nbr_all = sim.neigh[tclamp]
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
    A_F = sim._A_FOUND
    if sim._settler_idx >= 0 and _live(A_F):
        is_settler = present & (_types == sim._settler_idx)
        if bool(is_settler.any()):
            # FOUND only where canFoundCity's own terms say yes: the mask
            # column is type-only and the APPLY validates the spot, so an
            # unconditional FOUND pins a settler on illegal ground to a
            # refused verb forever.
            take_f = is_settler & um[:, :, A_F] & found_ok.gather(1, tiles.clamp(min=0))
            orders0 = torch.where(take_f, torch.full_like(orders0, A_F), orders0)
    A_X = sim._A_EXCAVATE
    if _live(A_X):
        # standing ON the dig: work it. The mask carries every legality term,
        # so the pick is "the column is open", never a second opinion.
        take_x = present & (dig_t >= 0) & (tiles == dig_t) & um[:, :, A_X]
        orders0 = torch.where(take_x, torch.full_like(orders0, A_X), orders0)
    A_PK = sim._A_PARK
    if _live(A_PK):
        take_pk = present & um[:, :, A_PK]
        orders0 = torch.where(take_pk, torch.full_like(orders0, A_PK), orders0)
    A_FU = getattr(sim, "_A_FORM_UP", -1)
    if _live(A_FU, 6):
        # a unit with a target FIGHTS; one with nothing to hit and a twin of its
        # own chassis next door merges into it. Both civics sit in the Industrial
        # and Modern trees, so this is the only way a formation is ever reached.
        _fu = um[:, :, A_FU:A_FU + 6]
        _idle = ~um[:, :, 6:12].any(dim=2)
        orders0 = torch.where(present & _idle & _fu.any(dim=2),
                              A_FU + _fu.float().argmax(dim=2), orders0)
    A_BS = getattr(sim, "_A_BOOST", -1)
    if _live(A_BS):
        # a Builder standing on a District Project pays its whole bank in. The
        # mask carries every term the Royal Society's clause asks for.
        orders0 = torch.where(present & um[:, :, A_BS], torch.full_like(orders0, A_BS), orders0)
    A_GP = getattr(sim, "_A_GP", -1)
    if _live(A_GP):
        # standing where the charge may be spent: spend it. The mask carries
        # every legality term the person's own row asks for.
        orders0 = torch.where(present & um[:, :, A_GP], torch.full_like(orders0, A_GP), orders0)
    A_LQ = getattr(sim, "_A_INQUISITION", -1)
    if _live(A_LQ):
        orders0 = torch.where(present & um[:, :, A_LQ], torch.full_like(orders0, A_LQ), orders0)
    A_HN = getattr(sim, "_A_HEATHEN", -1)
    if _live(A_HN):
        orders0 = torch.where(present & um[:, :, A_HN], torch.full_like(orders0, A_HN), orders0)
    A_HX = getattr(sim, "_A_HERESY", -1)
    if _live(A_HX):
        orders0 = torch.where(present & um[:, :, A_HX], torch.full_like(orders0, A_HX), orders0)
    A_CN = getattr(sim, "_A_CONDEMN", -1)
    if _live(A_CN, 6):
        cn = um[:, :, A_CN:A_CN + 6]
        hit = present & cn.any(dim=2)
        orders0 = torch.where(hit, A_CN + cn.float().argmax(dim=2), orders0)
    A_PM = getattr(sim, "_A_PROMOTE", -1)
    if _live(A_PM, sim.rules.promo_cols):
        pm = um[:, :, A_PM:A_PM + sim.rules.promo_cols]
        hasp = present & pm.any(dim=2)
        # a promotion heals 50 and ends the turn, so it outranks every other
        # verb the unit could have taken. WHICH row it takes alternates by
        # seat and turn: the tree is only worth reaching if the driver walks
        # more than one branch of it.
        cols = torch.arange(sim.rules.promo_cols, device=um.device)
        deep = ((seat + sim.turn) % 2) == 1
        key = torch.where(pm, cols, torch.full_like(cols, -1)) if deep \
            else torch.where(pm, cols, torch.full_like(cols, 1 << 20))
        pick = key.amax(dim=2) if deep else key.amin(dim=2)
        orders0 = torch.where(hasp, A_PM + pick, orders0)
    A_AS = getattr(sim, "_A_AIR_STRIKE", -1)
    A_RB = getattr(sim, "_A_REBASE", -1)
    _as_live = _live(A_AS, sim._air_strike_cols)
    if A_AS >= 0 and um.shape[2] >= A_AS + sim._air_strike_cols \
            and (_as_live or _live(A_RB, sim._air_rebase_cols)):
        _as = um[:, :, A_AS:A_AS + sim._air_strike_cols]
        if _as_live:
            orders0 = torch.where(present & _as.any(dim=2),
                                  A_AS + _as.float().argmax(dim=2), orders0)
        if A_RB >= 0 and um.shape[2] >= A_RB + sim._air_rebase_cols:
            # an aircraft with nothing to hit MOVES BASE — otherwise the whole
            # air force sits on the aerodrome it was built in and the rebase
            # head is never reached.
            _rb = um[:, :, A_RB:A_RB + sim._air_rebase_cols]
            _rk = torch.arange(sim._air_rebase_cols, device=um.device)
            _rot = (seat + sim.turn) % max(sim._air_rebase_cols, 1)
            _key = torch.where(_rb, (_rk - _rot) % max(sim._air_rebase_cols, 1),
                               torch.full_like(_rk, 1 << 20))
            orders0 = torch.where(present & ~_as.any(dim=2) & _rb.any(dim=2),
                                  A_RB + _key.amin(dim=2), orders0)

    A_SM = getattr(sim, "_A_SPY_MISSION", -1)
    A_ST = getattr(sim, "_A_SPY_TRAVEL", -1)
    _sm_live = _live(A_SM, sim._n_spy_missions)
    _st_live = _live(A_ST, sim._spy_travel_cols)
    if A_SM >= 0 and um.shape[2] >= A_SM + sim._n_spy_missions and (_sm_live or _st_live):
        _sm = um[:, :, A_SM:A_SM + sim._n_spy_missions]
        # counter-espionage RE-ARMS itself, so a spy that takes it never moves
        # again: prefer the jump whenever nothing else is on offer where it
        # stands, and rotate the mission pick so the catalog is walked rather
        # than one row of it hammered.
        _off = _sm.clone()
        _off[:, :, sim._spy_m_counterspy] = False
        _go = present & ~_off.any(dim=2)
        _took = torch.zeros_like(present)
        if A_ST >= 0 and um.shape[2] >= A_ST + sim._spy_travel_cols and _st_live:
            _st = um[:, :, A_ST:A_ST + sim._spy_travel_cols]
            _tk = torch.arange(sim._spy_travel_cols, device=um.device)
            _trot = (seat + sim.turn) % max(sim._spy_travel_cols, 1)
            _tkey = torch.where(_st, (_tk - _trot) % max(sim._spy_travel_cols, 1),
                                torch.full_like(_tk, 1 << 20))
            _took = _go & _st.any(dim=2)
            orders0 = torch.where(_took, A_ST + _tkey.amin(dim=2), orders0)
        if _sm_live:
            _mk = torch.arange(sim._n_spy_missions, device=um.device)
            _mrot = (seat + sim.turn) % max(sim._n_spy_missions, 1)
            _mkey = torch.where(_sm, (_mk - _mrot) % max(sim._n_spy_missions, 1),
                                torch.full_like(_mk, 1 << 20))
            orders0 = torch.where(present & ~_took & _sm.any(dim=2),
                                  A_SM + _mkey.amin(dim=2), orders0)

    if bool(on_job.any()):
        # BY NAME, never by column number: the BUILD_* verbs are a RUN in the
        # middle of the action table, so an inserted verb walks a hardcoded
        # range onto the wrong column. `_A_IMP` is that run, roster-ordered.
        rep_ok = um[:, :, sim._A_REPAIR]
        # A 20% charge into a district beats an improvement, and laying road is
        # the fallback when nothing else is placeable here.
        # HARVEST and the wonder charge sit AHEAD of the improvement run:
        # both are one-off lumps on the tile underfoot, and taking them
        # first is what makes either verb reachable at all — the gate
        # cannot compare an arm no driver orders.
        # ...and only the columns some game actually holds: a dead column can
        # never be the FIRST legal one, so dropping it moves no pick — and the
        # improvement run is most of this list and mostly locked.
        bcols = [c for c in ([c for c in (getattr(sim, "_A_FINISH", -1),) if c >= 0]
                             + [c for c in (getattr(sim, "_A_HARVEST", -1),) if c >= 0]
                             + [c for c in (getattr(sim, "_A_WONDER_CHARGE", -1),) if c >= 0]
                             + [c for c in sim._A_IMP if c >= 0]
                             + [c for c in (getattr(sim, "_A_ROAD", -1),) if c >= 0]
                             + [c for c in (getattr(sim, "_A_RAIL", -1),) if c >= 0])
                 if _live(c)]
        bmask = torch.stack([um[:, :, c] for c in bcols], dim=2) if bcols else None
        pick_b = torch.full_like(orders0, -1)
        if bmask is not None:
            hasb = bmask.any(dim=2)
            firstb = bmask.float().argmax(dim=2)
            colt = torch.tensor(bcols, device=um.device)
            pick_b = torch.where(hasb, colt[firstb], pick_b)
        chosen = torch.where(rep_ok, torch.full_like(orders0, sim._A_REPAIR), pick_b)
        take_b = on_job & (chosen >= 0)
        orders0 = torch.where(take_b, chosen, orders0)
    return orders0, job_t, spread_t, settle_t, um, uo


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


def _decide_citizens(sim, row: int):
    """The CITIZEN-ASSIGNMENT verbs, once per city each: pin one citizen into
    the first district that seats one, and one onto the first RESOURCE plot the
    city can work. Everything else stays with the automatic rule."""
    B = sim.B
    alive = sim.city_alive[:, row]
    spec = None
    if len(sim.districts_cat):
        pin = sim.city_spec_pin[:, row]
        slots = sim._city_spec_slots(row)
        want = (
            (alive & (sim.city_pop[:, row] >= ladder.SPEC_PIN_POP) & ~(pin >= 0).any(dim=2)).unsqueeze(2)
            & (slots > 0)
        )
        first = want & (want.long().cumsum(dim=2) == 1)
        if bool(first.any()):
            spec = torch.where(first, torch.ones_like(pin), torch.full_like(pin, simbase.SPEC_KEEP))
    tiles, valid = sim._work_window(row)
    tf = tiles.clamp(min=0).reshape(B, -1)
    res = sim.res_priority.gather(1, tf).reshape_as(tiles) > 0
    held = sim.tile_locked.gather(1, tf).reshape_as(tiles)
    cand = valid & res & ~held & alive.unsqueeze(2) & ~(valid & held).any(dim=2).unsqueeze(2)
    key = torch.where(cand, tiles, torch.full_like(tiles, 10 ** 9))
    best = key.min(dim=2).values
    lock = torch.where(best < 10 ** 9, best, torch.full_like(best, -1))
    return spec, (lock if bool((lock >= 0).any()) else None)


def _decide_swap(sim, row: int):
    """The TILE SWAP, our own scripted rule: a city with MORE citizens than
    plots it may work takes ONE plot from a sibling that has plots to spare
    and is not working (or pinning) it. The lowest (city slot, tile) pair
    the engine's own predicate allows wins, and a seat swaps at most once a
    turn. Zero draws. Returns [B, 1, 2] (claimant's centre, tile), -1 where a
    game has none, or None on a quiet turn."""
    B, dev, T = sim.B, sim.device, sim.T
    alive = sim.city_alive[:, row]
    if not bool((alive.sum(dim=1) >= 2).any()):
        return None
    tiles, valid = sim._work_window(row)
    count = valid.sum(dim=2)
    pop = sim.city_pop[:, row]
    short = alive & (pop > count)
    spare = alive & (count > pop)
    if not bool((short.any(dim=1) & spare.any(dim=1)).any()):
        return None
    RC, M = tiles.shape[1], tiles.shape[2]
    tf = tiles.clamp(min=0).reshape(B, -1)
    owner = sim.tile_city.gather(1, tf).reshape(B, RC, M)
    ids = sim.city_id[:, row]
    owner_spare = ((ids.view(B, 1, 1, RC) == owner.unsqueeze(3))
                   & (alive & spare).view(B, 1, 1, RC)).any(dim=3)
    wk = sim.city_worked[:, row].reshape(B, -1)
    worked = torch.zeros(B, T + 1, dtype=torch.bool, device=dev)
    worked.scatter_(1, torch.where(wk >= 0, wk, torch.full_like(wk, T)), True)
    busy = (worked[:, :T] | sim.tile_locked).gather(1, tf).reshape(B, RC, M)
    jj = torch.arange(RC, device=dev).view(1, RC, 1).expand(B, RC, M)
    cand = short.unsqueeze(2) & (tiles >= 0) & owner_spare & ~busy
    if not bool(cand.any()):
        return None
    cand = cand & sim._swap_tile_ok(row, jj.reshape(B, -1), tiles.reshape(B, -1)).reshape(B, RC, M)
    key = torch.where(cand, jj * T + tiles, torch.full_like(tiles, 10 ** 9)).reshape(B, -1).min(dim=1).values
    has = key < 10 ** 9
    if not bool(has.any()):
        return None
    j = torch.where(has, key // T, torch.zeros_like(key))
    centre = torch.where(has, sim.city_center[:, row].gather(1, j.unsqueeze(1)).squeeze(1), torch.full_like(key, -1))
    tile = torch.where(has, key % T, torch.full_like(key, -1))
    return torch.stack([centre, tile], dim=1).unsqueeze(1)


def _decide_vote(sim, row: int):
    """The WORLD CONGRESS ballot for the session the coming step would run.
    The ladder votes its own interest: outcome A on the target it holds the
    most of, free; and on the Diplomatic Victory resolution it backs itself or
    blocks the leader, with every point of favor it has. Slot 3 is the SPECIAL
    session — join every emergency it is not the target of. Returns [B, 4, 3] —
    [outcome, target, extra votes] per slot — or None on a quiet turn."""
    fires, res0, res1, dv = sim._congress_upcoming(int(sim.turn) + 1)
    special = sim._special_upcoming(int(sim.turn) + 1)
    if not bool(fires.any()) and not bool(special.any()):
        return None
    B, dev = sim.B, sim.device
    out = torch.full((B, 4, 3), -1, dtype=torch.long, device=dev)
    zero = torch.zeros(B, dtype=torch.long, device=dev)
    # THE SPECIAL SESSION: the ladder joins every emergency it is not the
    # target of, which is also what a seat with no ballot does.
    out[:, 3, 0] = torch.where(special, zero, out[:, 3, 0])
    out[:, 3, 1] = torch.where(special, zero, out[:, 3, 1])
    out[:, 3, 2] = torch.where(special, zero, out[:, 3, 2])
    for slot, sel in ((0, res0), (1, res1)):
        for r in range(len(sim._congress_res)):
            m = fires & (sel == r)
            if not bool(m.any()):
                continue
            ai_o, ai_t = sim._congress_pref(r, row)
            out[:, slot, 0] = torch.where(m, ai_o, out[:, slot, 0])
            out[:, slot, 1] = torch.where(m, ai_t, out[:, slot, 1])
            out[:, slot, 2] = torch.where(m, zero, out[:, slot, 2])
    lead = sim._congress_leader(dv)
    ok = dv & (lead >= 0)
    if bool(ok.any()):
        # ALL of it: the curve runs out of favor before it runs out of rungs,
        # so favor/step + 1 is an upper bound on what the bank can buy.
        want = torch.div(sim.civ_diplo_favor[:, row], max(1, sim._congress_vstep),
                         rounding_mode="floor").long() + 1
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


def decide_geo(sim, seeds=None):
    """The five DIPLOMATIC want-masks, decided on the GPU and replayed by TS.

    TWO STYLES, drawn once per (game seed, seat) and fixed for the game, the
    research draw's discipline: a DIPLOMAT courts — friendship, then the
    alliance friendship unlocks, then open borders and a gift — and everyone
    else keeps to the grudge it already had. Held apart on purpose: a table
    where every seat both courts and denounces settles into one behaviour, and
    a table where everyone befriends everyone has no war left in it."""
    B, dev = sim.B, sim.device
    nrow = sim.n_majors
    den = torch.zeros(B, nrow, nrow, dtype=torch.bool, device=dev)
    ally = torch.zeros_like(den)
    ally_ty = torch.full((B, nrow, nrow), -1, dtype=torch.long, device=dev)
    frd = torch.zeros_like(den)
    bord = torch.zeros_like(den)
    gift = torch.zeros(B, ladder.GW_KINDS, nrow, nrow, dtype=torch.bool, device=dev)
    deleg = torch.zeros_like(den)
    _di = sim._deal_items
    off = torch.full((B, nrow, 1 + 2 * _di * 3), -1, dtype=torch.long, device=dev)
    acc = torch.zeros_like(den)
    if sim.n_majors < 2:
        return den, frd, ally, bord, gift, deleg, off, acc, ally_ty
    rr = sim.rules.seats
    n_c = sim.city_alive[:, :nrow].sum(dim=2)
    alive_row = sim.civ_alive[:, :nrow] & (n_c > 0)
    rstr = sim._seat_strengths()
    prox_max = int(rr.get("dowProximity", 9))
    prox = {}
    for a in range(nrow):
        for b in range(nrow):
            if a != b:
                prox[a, b] = sim._seat_proximity(a, b)
    def _diplo_row(r: int) -> torch.Tensor:
        pin = _seat_style(r)["diplo"]
        if pin is not None:
            return torch.full((B,), bool(pin), dtype=torch.bool, device=dev)
        if seeds is None:
            return torch.zeros(B, dtype=torch.bool, device=dev)
        return _policy_rng(sim, seeds, 0, r, 5) < ladder.DIPLO_SHARE

    diplo = torch.stack([_diplo_row(r) for r in range(nrow)], dim=1)
    ob_civic = (sim.civ_civics[:, :nrow, sim._open_borders_civic]
                if sim._open_borders_civic >= 0 else torch.zeros_like(alive_row))
    al_civic = (sim.civ_civics[:, :nrow, sim._alliance_civic]
                if sim._alliance_civic >= 0 else torch.zeros_like(alive_row))
    for a in range(nrow):
        for b in range(nrow):
            if a == b:
                continue
            pair = alive_row[:, a] & alive_row[:, b] & ~sim.war[:, a, b]
            quiet = pair & ~sim._denounce_active(a, b) & ~sim._denounce_active(b, a)
            den[:, a, b] = (
                pair & ~diplo[:, a] & ~sim._denounce_active(a, b)
                & (sim.seat_friend_turns[:, a, b] == 0) & (sim.seat_ally_turns[:, a, b] == 0)
                & (prox[a, b] <= prox_max) & (rstr[:, a] > rstr[:, b])
            )
            frd[:, a, b] = (
                quiet & diplo[:, a] & (sim.seat_friend_turns[:, a, b] == 0)
                & (prox[a, b] <= prox_max)
                & (sim._grievance_with(a, b) == 0)
            )
            ally[:, a, b] = (
                quiet & diplo[:, a] & al_civic[:, a]
                & (sim.seat_friend_turns[:, a, b] > 0) & (sim.seat_ally_turns[:, a, b] == 0)
            )
            # the TYPE is a per-(game, pair) style - stable across renewals
            ally_ty[:, a, b] = (
                (_policy_rng(sim, seeds, 0, min(a, b) * nrow + max(a, b), 9) * 5).long().clamp(min=0, max=4)
                if seeds is not None else torch.zeros(B, dtype=torch.long, device=dev))
            # Granted to whoever this seat already trusts, and by a diplomat to
            # any quiet neighbour — the grant is one-way, so it costs the
            # grantor nothing but the passage.
            bord[:, a, b] = (
                quiet & ob_civic[:, a] & (sim.seat_borders_turns[:, a, b] == 0)
                & (diplo[:, a] | (sim.seat_friend_turns[:, a, b] > 0)
                   | (sim.seat_ally_turns[:, a, b] > 0))
            )
            # A gift goes to a FRIEND, and only down the gradient: the richer
            # holder of that kind gives, which settles rather than ping-pongs.
            # A mission is cheap, permanent and pays visibility, so a seat
            # sends one to every quiet rival it has none with and can afford.
            _emb = (sim.civ_civics[:, a, sim._embassy_civic]
                    if 0 <= sim._embassy_civic < sim.civ_civics.shape[2]
                    else torch.zeros_like(quiet))
            _cost = torch.where(_emb, torch.full_like(sim.civ_treasury[:, a], sim._embassy_cost),
                                torch.full_like(sim.civ_treasury[:, a], sim._deleg_cost))
            deleg[:, a, b] = (quiet & (sim.seat_delegation[:, a, b] == 0)
                              & (sim.civ_treasury[:, a] >= _cost))
            trusted = (sim.seat_friend_turns[:, a, b] > 0) | (sim.seat_ally_turns[:, a, b] > 0)
            for kind in range(ladder.GW_KINDS):
                mine = (sim._gw_kind_count(a, kind) * sim.city_alive[:, a].long()).sum(dim=1)
                theirs = (sim._gw_kind_count(b, kind) * sim.city_alive[:, b].long()).sum(dim=1)
                gift[:, kind, a, b] = quiet & diplo[:, a] & trusted & (mine > theirs)
    _deal_turn(sim, off, acc, alive_row, rstr, prox, prox_max)
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


def _deal_turn(sim, off, acc, alive_row, rstr, prox, prox_max) -> None:
    """WHAT EACH SEAT PUTS ON THE TABLE, and what it takes off one.

    One offer per seat per turn, to the lowest-numbered rival that qualifies,
    and one rule behind it: sell what you have most of and ask gold for it —
    except at war, where the only thing worth proposing is peace."""
    B, dev, nrow = sim.B, sim.device, sim.n_majors
    _di = sim._deal_items
    ns = sim.civ_stockpile.shape[2]
    war_min = int(sim.rules.seats["warMinTurns"])
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
            gold = sim.civ_treasury[:, a]
            # AT WAR: the only table worth setting is the one that ends it, and
            # the weaker side is the one that pays to end it.
            losing = (pair & sim.war[:, a, b] & (sim.war_turns[:, a, b] >= war_min)
                      & (rstr[:, a] < rstr[:, b]) & (gold >= DEAL_TRIBUTE))
            _put(a, b, losing, [_item(sim._deal_k_gold, DEAL_TRIBUTE)], [])
            quiet = (pair & ~sim.war[:, a, b] & ~sim._denounce_active(a, b)
                     & ~sim._denounce_active(b, a) & (sim.deal_offer_left[:, a, b] == 0))
            # AID: while an Aid Request runs, a member with a purse to spare
            # gifts the victim gold — the only one-sided table on the list
            if sim._comp_aid >= 0:
                aid = ((sim.comp_kind == sim._comp_aid) & (sim.comp_target == b)
                       & sim.comp_member[:, a] & (gold >= DEAL_AID_GIFT * 2))
                _put(a, b, quiet & aid, [_item(sim._deal_k_gold, DEAL_AID_GIFT)], [])
            # A JOINT WAR: a seat with Foreign Trade asks a partner who shares
            # its grudge — both have denounced a third major neither is bound
            # to — to declare on it together (CIV6 DIPLOACTION_JOINT_WAR)
            if sim._joint_war_civic >= 0:
                for x in range(nrow):
                    if x in (a, b):
                        continue
                    grudge = (quiet & alive_row[:, x] & sim.civ_civics[:, a, sim._joint_war_civic]
                              & sim._denounce_active(a, x) & sim._denounce_active(b, x)
                              & sim._joint_war_open(a, x) & sim._joint_war_open(b, x))
                    _put(a, b, grudge, [_item(sim._deal_k_joint, x)], [])
            # A PRISONER goes home for a price.
            _put(a, b, quiet & (sim.seat_spy_held[:, b, a].sum(dim=1) > 0),
                 [_item(sim._deal_k_spy)], [_item(sim._deal_k_gold, DEAL_SPY_PRICE)])
            # A STRATEGIC SURPLUS is a lot with a price on it.
            if ns > 0:
                stock = sim.civ_stockpile[:, a]
                spare = stock > DEAL_RES_SPARE
                best = stock.argmax(dim=1)
                _put(a, b, quiet & spare.any(dim=1),
                     [(_lit(sim._deal_k_res), best, _lit(DEAL_RES_LOT))],
                     [_item(sim._deal_k_gold, DEAL_RES_PRICE)])
            # SPARE FAVOR, and finally the passage a diplomat sells cheap.
            _put(a, b, quiet & (sim.civ_diplo_favor[:, a] > DEAL_FAVOR_SPARE),
                 [_item(sim._deal_k_favor, DEAL_FAVOR_LOT)],
                 [_item(sim._deal_k_gold, DEAL_FAVOR_PRICE)])
            _ob = (sim.civ_civics[:, a, sim._open_borders_civic]
                   if sim._open_borders_civic >= 0 else torch.zeros_like(quiet))
            _put(a, b, quiet & _ob & (sim.seat_borders_turns[:, a, b] == 0)
                 & (prox[a, b] <= prox_max),
                 [_item(sim._deal_k_borders)], [_item(sim._deal_k_gold, DEAL_BORDERS_PRICE)])

    # ...and what a seat takes off the table. A peace deal is always worth
    # answering; anything else has to cost less than half the purse.
    for a in range(nrow):
        for b in range(nrow):
            if a == b:
                continue
            standing = alive_row[:, a] & alive_row[:, b] & (sim.deal_offer_left[:, b, a] > 0)
            if not bool(standing.any()):
                continue
            ask = sim.deal_offer_ask[:, b, a]
            owed = torch.zeros(B, dtype=torch.long, device=dev)
            for s in range(_di):
                owed = owed + torch.where(ask[:, s, 0] == sim._deal_k_gold,
                                          ask[:, s, 1].clamp(min=0), torch.zeros_like(owed))
            afford = sim.civ_treasury[:, a] >= (owed * 2).to(sim.civ_treasury.dtype)
            acc[:, a, b] = standing & (sim.war[:, a, b] | afford)


def _district_tiles(sim, prod: torch.Tensor, sites: dict):
    """[B, C, nS] the tile each city (array order, `prod`'s axis) would put
    each district column on, or None when this world has no district columns.

    The placement CHOICE, which is policy and belongs here: a scan per engine
    would have to agree forever. Only the column a city actually picked is
    filled — every other entry stays -1, and the apply refuses a district
    column whose tile is -1. The plots and their adjacency are the
    observation's (`_obs_cities`' `sites`).
    """
    nS = len(sim._scaffold) if sim.districts_on else 0
    if nS == 0:
        return None
    B, C = prod.shape
    out = torch.full((B, C, nS), -1, dtype=torch.long, device=prod.device)
    # WHICH (city, district) pairs anybody picked, in ONE transfer
    si_all = prod - sim.DISTRICT_BASE
    sel = (si_all >= 0) & (si_all < nS)
    if not bool(sel.any()):
        return out
    pairs = sorted({(int(k), int(s)) for (_b, k), s
                    in zip(sel.nonzero(as_tuple=False).tolist(), si_all[sel].tolist())})
    for k, si in pairs:
        col = sim.DISTRICT_BASE + si
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


def _maybe_form_tier(sim, row: int, mask: torch.Tensor, prod: torch.Tensor,
                     seeds, turn) -> torch.Tensor:
    """Sometimes train the corps instead of the unit — and rarely the army.

    A formation column the driver never picks is a verb the gate never
    reaches; the applier re-validates every clause, so a swap the city cannot
    honour is refused there like any other fuzzed decision."""
    if seeds is None or mask.shape[2] <= sim.FORM_BASE:
        return prod
    is_u = (prod >= sim.UNIT_BASE) & (prod < sim.UNIT_BASE + sim.NU)
    if not bool(is_u.any()):
        return prod
    r = _policy_rng(sim, seeds, turn or 0, row, 7)
    hit = is_u & (r < ladder.FORM_SHARE).unsqueeze(1)
    if not bool(hit.any()):
        return prod
    corps = torch.where(is_u, sim.FORM_BASE + prod - sim.UNIT_BASE, prod)
    army = corps + sim.NU
    lastc = mask.shape[2] - 1
    can_a = mask.gather(2, army.clamp(min=0, max=lastc).unsqueeze(2)).squeeze(2)
    can_c = mask.gather(2, corps.clamp(min=0, max=lastc).unsqueeze(2)).squeeze(2)
    # the army is the rarer, richer order; the corps is the fallback
    deep = can_a & (r < ladder.FORM_SHARE * 0.3).unsqueeze(1)
    pick = torch.where(deep, army, corps)
    return torch.where(hit & (deep | can_c), pick, prod)


def _decide_gp_pass(sim, row: int, seeds, turn) -> torch.Tensor | None:
    """Sometimes PASS on a claimable Great Person. Free variation like the
    reorder: the applier re-validates every clause, and a verb nothing ever
    chooses is a verb the gate never reaches."""
    if seeds is None or getattr(sim, "_gp_nc", 0) == 0:
        return None
    elig = ((sim.gp_offer >= 0) & (sim.gp_passed_by < 0)
            & (sim.civ_gpp[:, row].double() >= sim.gp_price))
    if not bool(elig.any()):
        return None
    r = _policy_rng(sim, seeds, turn or 0, row, 8)
    hit = elig.any(dim=1) & (r < ladder.GP_PASS_SHARE)
    if not bool(hit.any()):
        return None
    pick = elig.long().argmax(dim=1)
    return torch.where(hit, pick, torch.full_like(pick, -1))


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


def decide_seat(env, sim, row: int, nobs: list, roster: dict, classes: dict, seeds=None, turn=None,
                pre: dict | None = None) -> dict:
    """Seat `row`'s turn decisions, every DECIDE_FIELDS entry but the unit
    plan, keyed by name. Writes nothing. `nobs` is the seat's neutral
    observation, one dict per game (shared/decide.schema.json). `prod` is
    (centre [B, C], column [B, C]) over the observation's cities in array
    order, and `dtile` [B, C, nS] rides the same axis."""
    dev = sim.device
    # PRODUCTION on the observation's city axis — array order, every city
    # named by its centre; the record resolves each centre to its slot
    cities = _obs_cities(nobs, sim.PROD_W, dev)
    blocks = _blocks(env, sim, row, obs=None if pre is None else pre.get("obs"))
    style = _seat_style(row)
    prod = ladder.pick_production(cities["mask"], classes, roster, _prod_ctx(blocks, cities, sim, row),
                                  tier_order=style["tier_order"])
    prod = _maybe_form_tier(sim, row, cities["mask"], prod, seeds, turn)
    dtile = _district_tiles(sim, prod, cities["sites"])
    # turn 0 keeps the draw PERSISTENT: a seat's style is fixed for the game.
    if style["deep"] is not None:
        deep = torch.full((sim.B,), bool(style["deep"]), dtype=torch.bool, device=sim.device)
    else:
        deep = (_policy_rng(sim, seeds, 0, row, 4) < ladder.DEEP_SHARE
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
    pol_open = _obs_members(nobs, "policy", "unlocked", sim._npol, dev)
    if bool(pol_open.any()):
        # the seat's CARD STYLE: pinned by its style preset, else one persistent
        # draw per game (turn 0, salt 10) — a coherent player, not a coin per turn
        if style["cards"] is not None:
            cstyle = torch.full((sim.B,), ladder.CARD_STYLE_NAMES.index(style["cards"]), dtype=torch.long, device=sim.device)
        elif seeds is not None:
            cstyle = ladder.card_style_of(_policy_rng(sim, seeds, 0, row, 10))
        else:
            cstyle = None
        policies = ladder.pick_policies(pol_open, _obs_dense(nobs, "policy", "slots", dev), sim._pol_kind,
                                        legacy=sim._pol_legacy >= 0, style=cstyle,
                                        dark=sim._pol_dark_lo >= 0)
    war = None
    war_kind = None
    if seeds is not None and turn is not None:
        rng_w = {
            "dow": _policy_rng(sim, seeds, turn, row, 1),
            "peace": _policy_rng(sim, seeds, turn, row, 2),
            "raid": _policy_rng(sim, seeds, turn, row, 3),
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
    if seeds is not None and turn is not None:
        env_seq = _seat_envoys(nobs, dev)
    buy, worship, relig, levy, monu, nat, cls, ucls, pat, band, dist = _decide_buys(_obs_group(nobs, "buy", sim.device))
    route = _decide_route(_obs_group(nobs, "route", sim.device))
    # THE SILO LAUNCH: take the observation's candidate whenever one exists,
    # exactly as the route verb does.
    _nk = _obs_group(nobs, "nuke", sim.device)
    nuke = (_nk["device"], _nk["tile"])
    spec, lock = _decide_citizens(sim, row)
    swap = _decide_swap(sim, row)
    vote = _decide_vote(sim, row)
    gp_pass = _decide_gp_pass(sim, row, seeds, turn)
    return {"prod": (cities["centre"], prod), "dtile": dtile, "tech": tech, "civic": civic, "war": war,
            "war_kind": war_kind, "env_seq": env_seq, "buy": buy, "worship": worship,
            "relig": relig, "levy": levy, "monu": monu, "nat": nat, "cls": cls, "ucls": ucls,
            "pat": pat, "band": band, "dist": dist, "route": route, "nuke": nuke, "spec": spec,
            "lock": lock, "swap": swap, "vote": vote, "gp_pass": gp_pass, "policies": policies}


def plan_units(sim, row: int, max_steps: int = 4, pre: dict | None = None) -> torch.Tensor:
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
    orders0, job_t, spread_t, settle_t, um, uo = _seat_unit_orders(
        sim, row,
        job_t=None if pre is None else pre.get("jobs"),
        spread_t=None if pre is None else pre.get("spreads"))
    B2, N2 = orders0.shape
    ranks = [orders0]
    smap = sim._seat_slot_map(row)
    cur = sim.unit_tile.gather(1, smap.clamp(min=0))
    at_war_rows = uo[:, :, ladder.U_ATWAR] > 0
    # the march targets are chosen ONCE, off the rank-0 positions, and the
    # later ranks walk toward them; recomputing per rank would let a unit
    # re-aim mid-plan at somebody the phase has not seen it approach.
    vplan_tgts = None
    for _k in range(1, max_steps):
        prev = ranks[-1]
        moving = (prev >= 0) & (prev < 6)
        if not bool(moving.any()):
            break
        nb_prev = sim.neigh[cur.clamp(min=0)]
        cur = torch.where(moving, nb_prev.gather(2, prev.clamp(min=0, max=5).unsqueeze(2)).squeeze(2), cur)
        nxt = torch.full_like(prev, -1)
        nb_now = sim.neigh[cur.clamp(min=0)]          # [B, N, 6]
        # war rows: toward the recorded war target; peace rows: toward home,
        # respecting the stop radius. Distances are read-only pair_dist plans;
        # terrain/occupancy legality is the PHASE's re-validation problem.
        if vplan_tgts is None:
            tgt_b, hi_b, hcty_b = sim._war_march_targets(cur.clamp(min=0), row)
            vplan_tgts = torch.where(hi_b | hcty_b, tgt_b,
                                     torch.full((B2, N2), -1, dtype=torch.long, device=sim.device))
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
            d_cur = sim.pair_dist[cur[:, n].clamp(min=0), dest.clamp(min=0)].to(torch.long)
            d_nb = sim.pair_dist[nb_now[:, n].clamp(min=0), dest.clamp(min=0).unsqueeze(1)].to(torch.long)
            closer = (nb_now[:, n] >= 0) & (d_nb < d_cur.unsqueeze(1))
            key = torch.where(closer, d_nb * 8 + torch.arange(6, device=sim.device), torch.full_like(d_nb, 10 ** 9))
            best = key.argmin(dim=1)
            has_step = closer.any(dim=1) & ok_rows
            nxt[:, n] = torch.where(has_step, best, nxt[:, n])
        ranks.append(nxt)
        if not bool((nxt >= 0).any()):
            ranks.pop()
            break
    return torch.stack(ranks, dim=2) if len(ranks) > 1 else ranks[0].unsqueeze(2)
