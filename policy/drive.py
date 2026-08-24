from __future__ import annotations

import json
from pathlib import Path

import torch

import ladder
from core import simbase


def _prod_ctx(blocks: dict, sim, seat: int) -> dict:
    """The per-seat counters no mask can express, read from the OBSERVATION's
    ctx block (ladder.CTX_FIELDS) rather than off sim tensors — the values
    are the scripted sites' own, rendered by env._ctx_block, so a TS client
    rendering the same observation feeds the ladder identically. city_cap
    stays rules-side: static data is not state."""
    ctx = blocks["ctx"]
    emp = blocks["empire"]
    # is_capital must be MASK-ALIGNED (the masks' city axis is SLOT order)
    # while the obs city block is LIVING-ORDER — the two axes differ once a
    # city dies. Until the serve obs dict carries a per-city identity (centre
    # tile) to re-map with, this one flag reads the slot-ordered plane
    # directly; the wire itself stays centre-keyed (the record schema), so
    # nothing TS-facing leaks. `seat` IS the row of the merged city block, so
    # this reads one plane for everybody.
    is_cap = sim.city_is_cap[:, seat]
    n_cities = ctx[:, 0].long()
    # ONE city cap for every seat — the ladder's maxCities heuristic. (The
    # seat-0 arm this replaced read a `sim.C` that was itself
    # `rules.seats.maxCities`, so the fork never carried a difference; the
    # storage rename left the name dangling and the branch pointless.)
    cap = int(sim.rules.seats.get("maxCities", 6))
    nS = len(sim._scaffold) if sim.districts_on else 0
    return {
        # WHICH district to place is a decision, and the driver rotates it so
        # the whole scaffold is reached rather than only its head.
        "dist_rot": ((seat + sim.turn) % nS) if nS else None,
        "settler_queued": emp[:, 6] > 0.5,  # raw queued-settler count
        "is_capital": is_cap,  # the wonder tier's capital heuristic (city col 9)
        "melee": ctx[:, 2].long(),
        "ranged": ctx[:, 3].long(),
        "unit_count": ctx[:, 1].long(),
        "unit_cap": ctx[:, 4].long(),
        "n_cities": n_cities,
        "city_cap": torch.full_like(n_cities, cap),
    }


def take_seat(sim, row: int) -> None:
    sim.seat_ext[:, row] = True


def _blocks(env, sim, row: int, obs: torch.Tensor | None = None) -> dict:
    if obs is None:
        obs = env.observe(row)
    # tech/civic widths come off the live tensors — there is no NT/NC scalar,
    # and hardcoding one here would be the second copy that always drifts.
    return ladder.split(obs, sim.S, sim.n_majors - 1, sim.RC, sim.civ_techs.shape[2], sim.civ_civics.shape[2])


#: ACTION FILE SCHEMA v3 — THE FILE IS THE INTERFACE.
#:
#: Both engines parse this, so it records DECISIONS, never derived state: a
#: replay must be able to reproduce the run without re-deriving anything the
#: policy knew. Per turn, per driven seat:
#:     {"turn": t, "s<seatRow>": {
#:         "production": [[centreTile, col], ...]  one entry per city that acts;
#:                                  a DISTRICT column carries a third element,
#:                                  the TILE to build it on, because WHERE a
#:                                  district goes is a decision and neither
#:                                  engine may pick it (v3)
#:         "tech": col | None       None = no pick
#:         "civic": col | None
#:         "units": [[N], ...]      one entry per unit STEP this turn, since a
#:                                  unit may act several times
#:     }}
#: plus the optional fields the extractors below document (war, envoys, buy,
#: buyFaith, levy, and the geo intents). Codes are the MASK layouts
#: (`seat_masks`, `_seat_unit_mask`), one layout for every seat, so the same
#: file can drive any of them.
#: The CITY AXIS is keyed by CENTRE TILE, not index: the recorder reads cities
#: by GPU slot and TS applies by founding-order array position, and the two
#: diverge exactly when compaction or capture reorders slots — match cities by
#: centre, never by slot. The UNITS axis stays positional: the engines
#: deliberately mirror unit order (TS splices captured units to the END because
#: the GPU appends; deaths drop identically from both).
SCHEMA_VERSION = 3


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


def _charge_jobs(sim, seat: int, idx: int, jobs: torch.Tensor,
                 out: torch.Tensor, present, tiles, types, charges) -> torch.Tensor:
    """The nearest tile with work on it for every unit of type `idx` that still
    holds a charge, tile index breaking the tie."""
    if idx < 0 or not bool(jobs.any()):
        return out
    arangeT = torch.arange(sim.T, device=sim.device)
    for n in range(out.shape[1]):
        pres = present[:, n]
        if not bool(pres.any()):
            break
        vt = types[:, n].clamp(min=0, max=sim.NU - 1)
        rows = pres & (vt == idx) & (charges[:, n] > 0)
        if not bool(rows.any()):
            continue
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(jobs, d * sim.T + arangeT, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & jobs.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _builder_jobs(sim, seat: int) -> torch.Tensor:
    smap, present, tiles, types, charges = _seat_units(sim, seat)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if not sim.improvements_on:
        return out
    # BUILDERS take the improvement jobs — a missionary's charge is a spread,
    # not a build. The MILITARY ENGINEER walks to its own list instead: its
    # improvements, an unroaded tile, or a 20% charge waiting to be spent.
    out = _charge_jobs(sim, seat, sim._builder_idx, sim._seat_job_mask(seat),
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
    if site == 2:  # a city with a free Great Work slot of this class's kind
        out = torch.zeros_like(own)
        col = sim.city_slot_at(seat)
        for kind in range(3):
            if sim._gw_cls[kind] < 0:
                continue
            used = (sim.city_gw_writing, sim.city_gw_art, sim.city_gw_music)[kind][:, seat]
            free = ((sim._gw_capacity(seat, kind) - used) > 0) & sim.city_alive[:, seat]
            out = out | (own & (col >= 0) & free.gather(1, col.clamp(min=0)))
        return out
    if site == 3:  # inside any city-state's territory
        return (sim.tile_seat >= 100) & (sim.tile_seat < simbase.BARB_SEAT)
    if site == 4:  # an owned tile carrying a luxury
        return own & (sim.lux_id >= 0)
    # 5: unclaimed ground next to this seat's territory
    nb = sim.neigh
    adj = (own[:, nb.clamp(min=0).reshape(-1)].reshape(own.shape[0], sim.T, 6)
           & (nb >= 0).unsqueeze(0)).any(dim=2)
    return (sim.tile_seat < 0) & adj


def _gp_jobs(sim, seat: int) -> torch.Tensor:
    """[B, N] — the nearest tile each Great Person can spend its charge on,
    tile index breaking the tie. -1 for every other unit and for a person
    whose site exists nowhere yet."""
    smap, present, tiles, types, charges = _seat_units(sim, seat)
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
    for n in range(N):
        rows = live[:, n]
        if not bool(rows.any()):
            continue
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


def _spread_targets(sim, seat: int) -> torch.Tensor:
    smap, present, tiles, types, charges = _seat_units(sim, seat)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    done = sim.civ_religion_done[:, seat]
    if not bool(done.any()):
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
    for n in range(N):
        pres = present[:, n]
        if not bool(pres.any()):
            break
        vt = types[:, n].clamp(min=0, max=sim.NU - 1)
        relig = torch.zeros_like(pres)
        if sim._missionary_idx >= 0:
            relig = relig | (vt == sim._missionary_idx)
        if sim._apostle_idx >= 0:
            relig = relig | (vt == sim._apostle_idx)
        rows = pres & relig & (charges[:, n] > 0) & done
        if not bool(rows.any()):
            continue
        here = tiles[:, n]
        d = sim.pair_dist[here.clamp(min=0)].to(torch.long)
        key = torch.where(tm, d * (T + 1) + arangeT, torch.full_like(d, 2 ** 40))
        best = key.argmin(dim=1)
        has = rows & tm.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _settle_targets(sim, seat: int):
    """([B, N] nearest-foundable tile per SETTLER row, [B, T] foundable plane)
    — canFoundCity's own terms over the whole map: unowned, settle_ok, bare of
    district and wonder, >= 4 from every live city (majors and city-states),
    and under the city cap. The plane feeds the FOUND override (found only
    where the apply would accept) and the target feeds the walk."""
    smap, present, tiles, types, charges = _seat_units(sim, seat)
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
    for n in range(N):
        if not bool(present[:, n].any()):
            break
        rows = is_settler[:, n]
        if not bool(rows.any()):
            continue
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(ok, d * T + arangeT, torch.full_like(d, 2 ** 40))
        best = key.argmin(dim=1)
        has = rows & ok.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out, ok


def _dig_targets(sim, seat: int) -> torch.Tensor:
    """[B, N] — the nearest workable DIG for each Archaeologist that still
    holds a charge, or -1. Keyed like the builder's job (distance, then tile
    index), and gated on the same terms the EXCAVATE column asks: own or
    unclaimed ground, and a museum slot to land the find in."""
    smap, present, tiles, types, charges = _seat_units(sim, seat)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if sim._archaeologist_idx < 0 or sim._A_EXCAVATE < 0:
        return out
    allt = torch.arange(sim.T, device=sim.device).reshape(1, -1).expand(B, -1)
    digs = sim._dig_here(seat, allt) & ((sim.tile_seat < 0) | (sim.tile_seat == seat))
    digs = digs & sim._museum_room(seat).unsqueeze(1)
    if not bool(digs.any()):
        return out
    for n in range(N):
        pres = present[:, n]
        if not bool(pres.any()):
            break
        vt = types[:, n].clamp(min=0, max=sim.NU - 1)
        rows = pres & (vt == sim._archaeologist_idx) & (charges[:, n] > 0)
        if not bool(rows.any()):
            continue
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(digs, d * sim.T + allt, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & digs.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _park_targets(sim, seat: int) -> torch.Tensor:
    """[B, N] — the nearest tile that ANCHORS a legal National Park cluster,
    for each Naturalist, or -1. Same distance-then-index key as the dig."""
    smap, present, tiles, types, _charges = _seat_units(sim, seat)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if sim._naturalist_idx < 0 or sim._A_PARK < 0:
        return out
    allt = torch.arange(sim.T, device=sim.device).reshape(1, -1).expand(B, -1)
    anchors = sim._park_cluster_legal(seat, sim._park_cluster(allt)).any(dim=2)
    if not bool(anchors.any()):
        return out
    for n in range(N):
        pres = present[:, n]
        if not bool(pres.any()):
            break
        vt = types[:, n].clamp(min=0, max=sim.NU - 1)
        rows = pres & (vt == sim._naturalist_idx)
        if not bool(rows.any()):
            continue
        d = sim.pair_dist[tiles[:, n].clamp(min=0)].to(torch.long)
        key = torch.where(anchors, d * sim.T + allt, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & anchors.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _seat_unit_orders(sim, seat: int, job_t=None, spread_t=None):
    um = sim._seat_unit_mask(seat)
    uo = sim.seat_unit_obs(seat)
    orders0 = ladder.pick_unit_orders(um, uo, a_pillage=sim._A_PILLAGE, a_snipe=sim._A_SNIPE)
    # the serve tripwire computes both target tables pre-decide at the same
    # state; passing them here skips the recomputation (pure reads either way)
    if job_t is None:
        job_t = _builder_jobs(sim, seat)
    if spread_t is None:
        spread_t = _spread_targets(sim, seat)
    settle_t, found_ok = _settle_targets(sim, seat)
    dig_t = _dig_targets(sim, seat)
    park_t = _park_targets(sim, seat)
    _smap, present, tiles, _types, _charges = _seat_units(sim, seat)
    on_job = (job_t >= 0) & (tiles == job_t) & present
    # Rank-0 WALK toward a civilian destination (job, spread or settle
    # target): the virtual planner extends MOVE rows only, so rank 0 must
    # itself step or the unit never leaves the city it spawned in.
    tgt = torch.where(job_t >= 0, job_t, torch.where(spread_t >= 0, spread_t, settle_t))
    gp_t = _gp_jobs(sim, seat)
    tgt = torch.where(tgt >= 0, tgt, torch.where(dig_t >= 0, dig_t, park_t))
    tgt = torch.where(tgt >= 0, tgt, gp_t)
    walkers = present & (tgt >= 0) & (tiles != tgt)
    if bool(walkers.any()):
        nbr = sim.neigh[tiles.clamp(min=0)]  # [B, N, 6]
        d_cur = sim.pair_dist[tiles.clamp(min=0), tgt.clamp(min=0)].to(torch.long)
        d_nb = sim.pair_dist[nbr.clamp(min=0), tgt.clamp(min=0).unsqueeze(2)].to(torch.long)
        closer = um[:, :, 0:6] & (nbr >= 0) & (d_nb < d_cur.unsqueeze(2))
        w_key = torch.where(closer, d_nb * 8 + torch.arange(6, device=um.device), torch.full_like(d_nb, 2 ** 30))
        has_w = walkers & closer.any(dim=2)
        orders0 = torch.where(has_w, w_key.argmin(dim=2), orders0)
    A_SP = sim._A_SPREAD
    if A_SP >= 0 and bool((spread_t >= 0).any()):
        d_sp = sim.pair_dist[tiles.clamp(min=0), spread_t.clamp(min=0)].to(torch.long)
        close = (spread_t >= 0) & present & (d_sp <= 1)
        if bool(close.any()):
            nbr = sim.neigh[tiles.clamp(min=0)]
            dir_hit = (nbr == spread_t.unsqueeze(2)) & (nbr >= 0)
            dcol = torch.where(
                tiles == spread_t,
                torch.zeros_like(spread_t),
                dir_hit.float().argmax(dim=2) + 1,
            )
            valid_dir = (tiles == spread_t) | dir_hit.any(dim=2)
            take_sp = close & valid_dir
            orders0 = torch.where(take_sp, A_SP + dcol, orders0)
    A_F = sim._A_FOUND
    if A_F >= 0 and sim._settler_idx >= 0:
        is_settler = present & (_types == sim._settler_idx)
        if bool(is_settler.any()) and um.shape[2] > A_F:
            # FOUND only where canFoundCity's own terms say yes: the mask
            # column is type-only and the APPLY validates the spot, so an
            # unconditional FOUND pins a settler on illegal ground to a
            # refused verb forever.
            take_f = is_settler & um[:, :, A_F] & found_ok.gather(1, tiles.clamp(min=0))
            orders0 = torch.where(take_f, torch.full_like(orders0, A_F), orders0)
    A_X = sim._A_EXCAVATE
    if A_X >= 0 and um.shape[2] > A_X:
        # standing ON the dig: work it. The mask carries every legality term,
        # so the pick is "the column is open", never a second opinion.
        take_x = present & (dig_t >= 0) & (tiles == dig_t) & um[:, :, A_X]
        orders0 = torch.where(take_x, torch.full_like(orders0, A_X), orders0)
    A_PK = sim._A_PARK
    if A_PK >= 0 and um.shape[2] > A_PK:
        take_pk = present & um[:, :, A_PK]
        orders0 = torch.where(take_pk, torch.full_like(orders0, A_PK), orders0)
    A_GP = getattr(sim, "_A_GP", -1)
    if A_GP >= 0 and um.shape[2] > A_GP:
        # standing where the charge may be spent: spend it. The mask carries
        # every legality term the person's own row asks for.
        orders0 = torch.where(present & um[:, :, A_GP], torch.full_like(orders0, A_GP), orders0)
    A_LQ = getattr(sim, "_A_INQUISITION", -1)
    if A_LQ >= 0 and um.shape[2] > A_LQ:
        orders0 = torch.where(present & um[:, :, A_LQ], torch.full_like(orders0, A_LQ), orders0)
    A_HN = getattr(sim, "_A_HEATHEN", -1)
    if A_HN >= 0 and um.shape[2] > A_HN:
        orders0 = torch.where(present & um[:, :, A_HN], torch.full_like(orders0, A_HN), orders0)
    A_HX = getattr(sim, "_A_HERESY", -1)
    if A_HX >= 0 and um.shape[2] > A_HX:
        orders0 = torch.where(present & um[:, :, A_HX], torch.full_like(orders0, A_HX), orders0)
    A_CN = getattr(sim, "_A_CONDEMN", -1)
    if A_CN >= 0 and um.shape[2] >= A_CN + 6:
        cn = um[:, :, A_CN:A_CN + 6]
        hit = present & cn.any(dim=2)
        orders0 = torch.where(hit, A_CN + cn.float().argmax(dim=2), orders0)
    A_PM = getattr(sim, "_A_PROMOTE", -1)
    if A_PM >= 0 and um.shape[2] >= A_PM + sim.rules.promo_cols:
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
    if A_AS >= 0 and um.shape[2] >= A_AS + sim._air_strike_cols:
        _as = um[:, :, A_AS:A_AS + sim._air_strike_cols]
        orders0 = torch.where(present & _as.any(dim=2),
                              A_AS + _as.float().argmax(dim=2), orders0)
        A_RB = getattr(sim, "_A_REBASE", -1)
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
    if A_SM >= 0 and um.shape[2] >= A_SM + sim._n_spy_missions:
        _sm = um[:, :, A_SM:A_SM + sim._n_spy_missions]
        # counter-espionage RE-ARMS itself, so a spy that takes it never moves
        # again: prefer the jump whenever nothing else is on offer where it
        # stands, and rotate the mission pick so the catalog is walked rather
        # than one row of it hammered.
        _off = _sm.clone()
        _off[:, :, sim._spy_m_counterspy] = False
        _go = present & ~_off.any(dim=2)
        _took = torch.zeros_like(present)
        if A_ST >= 0 and um.shape[2] >= A_ST + sim._spy_travel_cols:
            _st = um[:, :, A_ST:A_ST + sim._spy_travel_cols]
            _tk = torch.arange(sim._spy_travel_cols, device=um.device)
            _trot = (seat + sim.turn) % max(sim._spy_travel_cols, 1)
            _tkey = torch.where(_st, (_tk - _trot) % max(sim._spy_travel_cols, 1),
                                torch.full_like(_tk, 1 << 20))
            _took = _go & _st.any(dim=2)
            orders0 = torch.where(_took, A_ST + _tkey.amin(dim=2), orders0)
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
        bcols = ([c for c in (getattr(sim, "_A_FINISH", -1),) if c >= 0]
                 + [c for c in sim._A_IMP if c >= 0]
                 + [c for c in (getattr(sim, "_A_ROAD", -1),) if c >= 0])
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


def _seat_envoys(sim, seat: int):
    """The ENVOY verb, seat-generic: the scripted greedy sequence — spend the
    BANK, neediest re-ranked after every pick. Conversion influence->bank is
    an eager RULE at the CS phase for EVERY seat (real Civ 6 grants the envoy
    the moment the meter fills), so this verb is bank-only — ONE text, no
    influence fork and no seat-shaped line: `seat` IS the row of every plane
    it reads. Zero draws. Returns [B, K] CS indices (-1 pad) or None."""
    if sim.S <= 0:
        return None
    avail_e = sim.civ_envoys_avail[:, seat].clone()
    met_live_e = sim.seat_citystate_met[:, seat, : sim.S] & sim.citystate_alive[:, : sim.S]
    mine6_e = sim.seat_citystate_envoys[:, seat, : sim.S].double() / 6.0
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
        mine6_e = mine6_e + torch.nn.functional.one_hot(p_e.clamp(min=0), sim.S).double() * hit_e.unsqueeze(1).double() / 6.0
    return torch.stack(picks_e, dim=1) if picks_e else None


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


def _decide_route(sim, row: int, pre=None):
    """The route verb: TAKE the candidate whenever one exists — the old
    eager rule's pacing, now a policy choice on the wire. `pre` is the
    serve tripwire's precomputed candidate (frm [B], dst [B]); without it
    the sim's own `_seat_route_candidate` scan answers."""
    frm, dst = pre if pre is not None else sim._seat_route_candidate(row)
    if not bool((frm >= 0).any()):
        return None
    return (frm, dst)


def _decide_buys(sim, row: int, bctx: dict | None = None):
    if bctx is None:
        bctx = _buy_ctx(sim, row)
    buy_kind = ladder.pick_purchase(bctx["can_building"], bctx["settler_ok"], bctx["unit_ok"], bctx["tile_ok"])
    buy_a = torch.where(buy_kind == 3, bctx["tile"], bctx["jj"])
    buy_b = torch.where(buy_kind == 3, bctx["tile_j"], bctx["bb"])
    worship_ok, relig_kind = ladder.pick_faith(
        bctx["worship_ok"], bctx["missionary_ok"], bctx["apostle_ok"], bctx["inquisitor_ok"],
        bctx["monk_ok"])
    neg_w = torch.full_like(bctx["worship_j"], -1)
    relig_j = torch.where(
        relig_kind == 5, bctx["missionary_j"],
        torch.where(relig_kind == 6, bctx["apostle_j"],
                    torch.where(relig_kind == 11, bctx["inquisitor_j"],
                                torch.where(relig_kind == 14, bctx["monk_j"], neg_w))))
    monu_kind = ladder.pick_monu(bctx["monu_builder_ok"], bctx["monu_settler_ok"])
    monu_j = torch.where(monu_kind >= 0, bctx["spawn_slot"], torch.full_like(bctx["spawn_slot"], -1))
    nat_ok, nat_j = bctx["nat_ok"], bctx["nat_j"]
    nat_kind = torch.where(nat_ok, torch.full_like(monu_kind, 10), torch.full_like(monu_kind, -1))
    return ((buy_kind, buy_a, buy_b),
            torch.where(worship_ok, bctx["worship_j"], neg_w),
            (relig_kind, relig_j),
            torch.where(bctx["levy_ok"], bctx["levy_cs"], torch.full_like(bctx["levy_cs"], -1)),
            (monu_kind, monu_j),
            (nat_kind, nat_j),
            (bctx["cls_j"], bctx["cls_b"]),
            (bctx["ucls_j"], bctx["ucls_b"]))


def _buy_ctx(sim, row: int) -> dict:
    alive_row = sim.city_alive[:, row]
    n_cities = alive_row.sum(dim=1)
    active = sim.seat_ext[:, row] & (n_cities > 0) & sim.civ_alive[:, row]
    jj, bb, can_b, price, _ = sim._seat_buy_candidates(row, active)
    _sq = (alive_row & (sim.city_current[:, row] == sim.SETTLER)).sum(dim=1)
    sett_base = (sim.rules.settler_base + sim.rules.settler_per_city
                 * (n_cities - 1 + sim._seat_settlers(row) + _sq).clamp(min=0).double())
    mon_g = sim._golden_ded(row, sim._ded_monumentality)
    sett_cost = sett_base * sim.rules.gold_purchase_mult
    sett_cost = torch.where(mon_g, sett_cost * 0.7, sett_cost)
    # the buy SPAWNS a unit at the capital (else first city), which must have
    # the pop to pay — the TS driver's tripwire mirrors this exactly.
    _cap_is = sim.city_is_cap[:, row]
    _spawn_slot = torch.where(_cap_is.any(dim=1), _cap_is.long().argmax(dim=1), alive_row.long().argmax(dim=1))
    _spawn_pop = sim.city_pop[:, row].gather(1, _spawn_slot.unsqueeze(1)).squeeze(1)
    settler_ok = active & (_spawn_pop >= sim.rules.settler_pop_gate) & sim._afford(sim.civ_treasury[:, row], sett_cost)
    cand_u = sim._seat_buy_unit_candidates(row, sim._seat_trainable_units(row))
    unit_ok = active & (sim._seat_army_count(row) < 2 * n_cities) & cand_u.any(dim=1)
    tile_j, tile_t, _tile_cost, tile_ok = sim._seat_tile_buy_candidate(row, active)
    w_ok, w_j, m_ok, m_j, a_ok, a_j, q_ok, q_j, k_ok, k_j = sim._seat_faith_buy_candidates(row, active)
    nat_ok, nat_j = sim._seat_naturalist_candidate(row, active)
    # CIV6 (GS Civilopedia, Monumentality, Golden face): "May purchase civilian
    # units with Faith. Builders and Settlers are 30% cheaper to purchase with
    # Faith and Gold." FAITH_PURCHASE_MULT with the literal 0.7 LAST; the
    # POLICY gate (at most one live builder) is here, the rule is the applier's.
    monu_b_ok = torch.zeros_like(mon_g)
    if sim._builder_idx >= 0:
        n_bl = (sim.major_unit_alive & (sim.major_unit_seat == row) & (sim.major_unit_type == sim._builder_idx)).sum(dim=1)
        bl_cost = sim._builder_cost(sim.civ_builders_trained[:, row]).double() * sim.rules.faith_purchase_mult * 0.7
        monu_b_ok = active & mon_g & (n_bl < 1) & sim._afford(sim.civ_faith[:, row], bl_cost)
    monu_s_ok = active & mon_g & (_spawn_pop >= sim.rules.settler_pop_gate) \
        & sim._afford(sim.civ_faith[:, row], sett_base * sim.rules.faith_purchase_mult * 0.7)
    cls_ok, cls_j, cls_b = sim._seat_class_buy_candidate(row, active)
    ucls_ok, ucls_j, ucls_b = sim._seat_faith_unit_candidate(row, active)
    levy_ok, levy_cs = sim._seat_levy_candidate(row, active)
    levy_ok = levy_ok & sim.war[:, row, : sim.n_majors].any(dim=1)
    return {"jj": jj, "bb": bb, "can_building": can_b, "price": price,
            "settler_ok": settler_ok, "unit_ok": unit_ok,
            "tile_ok": tile_ok, "tile": tile_t, "tile_j": tile_j,
            "monu_builder_ok": monu_b_ok, "monu_settler_ok": monu_s_ok, "spawn_slot": _spawn_slot,
            "worship_ok": w_ok, "worship_j": w_j,
            "missionary_ok": m_ok, "missionary_j": m_j,
            "apostle_ok": a_ok, "apostle_j": a_j,
            "inquisitor_ok": q_ok, "inquisitor_j": q_j,
            "monk_ok": k_ok, "monk_j": k_j,
            "levy_ok": levy_ok, "levy_cs": levy_cs,
            "nat_ok": nat_ok, "nat_j": nat_j,
            "cls_ok": cls_ok, "cls_j": cls_j, "cls_b": cls_b,
            "ucls_ok": ucls_ok, "ucls_j": ucls_j, "ucls_b": ucls_b}


def _geo_turn(sim, seeds=None):
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
    frd = torch.zeros_like(den)
    bord = torch.zeros_like(den)
    gift = torch.zeros(B, ladder.GW_KINDS, nrow, nrow, dtype=torch.bool, device=dev)
    if sim.n_majors < 2:
        return den, frd, ally, bord, gift
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
    diplo = (torch.stack([_policy_rng(sim, seeds, 0, r, 5) for r in range(nrow)], dim=1)
             < ladder.DIPLO_SHARE
             if seeds is not None else torch.zeros(B, nrow, dtype=torch.bool, device=dev))
    ob_civic = (sim.civ_civics[:, :nrow, sim._open_borders_civic]
                if sim._open_borders_civic >= 0 else torch.zeros_like(alive_row))
    al_civic = (sim.civ_civics[:, :nrow, sim._alliance_civic]
                if sim._alliance_civic >= 0 else torch.zeros_like(alive_row))
    gw_planes = (sim.city_gw_writing, sim.city_gw_art, sim.city_gw_music)
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
            trusted = (sim.seat_friend_turns[:, a, b] > 0) | (sim.seat_ally_turns[:, a, b] > 0)
            for kind in range(ladder.GW_KINDS):
                held = gw_planes[kind]
                mine = (held[:, a] * sim.city_alive[:, a].long()).sum(dim=1)
                theirs = (held[:, b] * sim.city_alive[:, b].long()).sum(dim=1)
                gift[:, kind, a, b] = quiet & diplo[:, a] & trusted & (mine > theirs)
    return den, frd, ally, bord, gift


def geo_decide_and_apply(sim, seeds=None):
    geo = _geo_turn(sim, seeds)
    den, frd, ally, bord, gift = geo
    for row in range(sim.n_majors):
        sim.apply_geo(row, denounce=den[:, row], friend=frd[:, row], ally=ally[:, row],
                      borders=bord[:, row], gift=gift[:, :, row])
    return geo


def _extract_geo(geo, row: int, b: int) -> dict:
    den, frd, ally, bord, gift = geo
    out = {}
    for name, want in (("denounce", den), ("friend", frd), ("ally", ally), ("borders", bord)):
        tl = want[b, row].nonzero(as_tuple=True)[0].tolist()
        if tl:
            out[name] = tl
    gl = [[int(k), int(j)] for k, j in gift[b, :, row].nonzero(as_tuple=False).tolist()]
    if gl:
        out["gift"] = gl
    return out


def decide_and_apply(env, sim, row: int, roster: dict, classes: dict, max_steps: int = 4) -> dict:
    return _extract_record(sim, row, *_decide_turn(env, sim, row, roster, classes, max_steps), 0)


def _district_tiles(sim, row: int, prod: torch.Tensor):
    """[B, RC, nS] the tile each city would put each district column on, or
    None when this world has no district columns.

    The placement CHOICE, which is policy and belongs here: a scan per engine
    would have to agree forever. Only the column a city actually
    picked is filled — every other entry stays -1, and the apply refuses a
    district column whose tile is -1. A net driving `production_pref` must fill
    every column it wants reachable, through this same body.
    """
    nS = len(sim._scaffold) if sim.districts_on else 0
    if nS == 0:
        return None
    out = torch.full((sim.B, sim.RC, nS), -1, dtype=torch.long, device=sim.device)
    for j in range(min(int(prod.shape[1]), sim.RC)):
        a = prod[:, j]
        for si, (di, _ut, _uc, plc, _fc) in enumerate(sim._scaffold):
            want = a == sim.DISTRICT_BASE + si
            if not bool(want.any()):
                continue
            t = ladder.pick_district_tile(sim._district_elig(row, j, di, plc),
                                          sim.district_rank_adj(di, plc))
            out[:, j, si] = torch.where(want, t, out[:, j, si])
    return out


def _decide_turn(env, sim, row: int, roster: dict, classes: dict, max_steps: int = 4, seeds=None, turn=None, pre: dict | None = None):
    m = sim.seat_masks(row)
    blocks = _blocks(env, sim, row, obs=None if pre is None else pre.get("obs"))
    prod = ladder.pick_production(m["production"], classes, roster, _prod_ctx(blocks, sim, row))
    dtile = _district_tiles(sim, row, prod)
    # turn 0 keeps the draw PERSISTENT: a seat's style is fixed for the game.
    deep = (_policy_rng(sim, seeds, 0, row, 4) < ladder.DEEP_SHARE
            if seeds is not None else None)
    tech = ladder.pick_research(blocks, m["tech"], "tech", deep) if bool(m["tech"].any()) else None
    civic = ladder.pick_research(blocks, m["civic"], "civic", deep) if bool(m["civic"].any()) else None
    war = None
    if seeds is not None and turn is not None:
        rng_w = {
            "dow": _policy_rng(sim, seeds, turn, row, 1),
            "peace": _policy_rng(sim, seeds, turn, row, 2),
            "raid": _policy_rng(sim, seeds, turn, row, 3),
        }
        war = ladder.pick_war(m["war"], _war_ctx(blocks), rng_w)
    env_seq = None
    if seeds is not None and turn is not None and sim.S > 0:
        env_seq = _seat_envoys(sim, row)
    buy, worship, relig, levy, monu, nat, cls, ucls = _decide_buys(sim, row, bctx=None if pre is None else pre.get("bctx"))
    route = _decide_route(sim, row, pre=None if pre is None else pre.get("route"))
    spec, lock = _decide_citizens(sim, row)
    vote = _decide_vote(sim, row)
    # production_tile rides along or the drive and its own record diverge: a
    # district column without its tile is refused at the apply, while the
    # replay side passes the recorded tile and places it.
    sim.apply_seat_actions(row, production=prod, production_tile=dtile, tech=tech, civic=civic,
                           war=war, envoys=env_seq, buy=buy, worship=worship, relig=relig, levy=levy,
                           monu=monu, nat=nat, cls=cls, ucls=ucls, route=route, spec=spec, lock=lock, vote=vote)

    # units, and the draw order: the driver PLANS, the PHASE executes.
    # Applying steps pre-step to re-observe would consume combat draws at a
    # different stream position than TS's in-phase replay — same totals,
    # different rolls per battle. Rank 0 comes from the real observation;
    # later ranks are planned VIRTUALLY for MOVE rows only, chaining pair_dist
    # toward the unit's own war target (or home) with the march's own key
    # (d*8+dir) and NO state mutation. Non-move verbs end the turn at rank 0,
    # exactly like the scripted walkers. The phase executes the stash at the
    # walkers' position and RE-VALIDATES every rank: an illegal later step
    # refuses, never substitutes.
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
        for n in range(N2):
            rows_mv = moving[:, n]
            if not bool(rows_mv.any()):
                continue
            dest = torch.where(at_war_rows[:, n] & (tgts[:, n] >= 0), tgts[:, n], torch.full_like(tgts[:, n], -1))
            dest = torch.where((dest < 0) & (job_t[:, n] >= 0), job_t[:, n], dest)
            dest = torch.where((dest < 0) & (spread_t[:, n] >= 0), spread_t[:, n], dest)
            dest = torch.where((dest < 0) & (settle_t[:, n] >= 0), settle_t[:, n], dest)
            ok_rows = rows_mv & (dest >= 0)
            if not bool(ok_rows.any()):
                continue
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
    K2 = len(ranks)
    seq = torch.stack(ranks, dim=2) if K2 > 1 else ranks[0].unsqueeze(2)
    if not hasattr(sim, "_driven_useq") or sim._driven_useq is None:
        sim._driven_useq = {}
    sim._driven_useq[row] = seq
    return prod, dtile, tech, civic, war, env_seq, seq, buy, worship, relig, levy, monu, nat, cls, ucls, route, spec, lock, vote


def _extract_record(sim, row: int, prod, dtile, tech, civic, war, env_seq, seq, buy, worship, relig, levy, monu, nat, cls, ucls, route, spec, lock, vote, b: int) -> dict:
    _pr = prod[b]
    _ctr = sim.city_center[b, row]
    _alive_c = sim.city_alive[b, row]
    nS = 0 if dtile is None else int(dtile.shape[2])
    prod_pairs = []
    for j in range(min(int(_pr.shape[0]), int(_ctr.shape[0]))):
        col = int(_pr[j])
        if col < 0 or not bool(_alive_c[j]):
            continue
        pair = [int(_ctr[j]), col]
        si = col - sim.DISTRICT_BASE
        if 0 <= si < nS:
            pair.append(int(dtile[b, j, si]))  # a DISTRICT column names its tile
        prod_pairs.append(pair)
    _t = None if tech is None or int(tech[b]) < 0 else int(tech[b])
    _c = None if civic is None or int(civic[b]) < 0 else int(civic[b])
    rows = [seq[b, :, k].tolist() for k in range(int(seq.shape[2]))]
    while len(rows) > 1 and all(x < 0 for x in rows[-1]):
        rows.pop()
    _w = None if war is None or int(war[b]) < 0 else int(war[b])
    _e = [] if env_seq is None else [int(x) for x in env_seq[b].tolist() if int(x) >= 0]
    rec = {"production": prod_pairs, "tech": _t, "civic": _c, "war": _w, "envoys": _e, "units": rows}
    rec.update(_buy_record_fields(sim, row, b, buy, worship, relig, levy, monu, nat, cls, ucls))
    if route is not None and int(route[0][b]) >= 0:
        rec["route"] = [int(route[0][b]), int(route[1][b])]
    if spec is not None:
        pins = [[int(_ctr[j]), di, int(spec[b, j, di])]
                for j in range(int(spec.shape[1])) if bool(_alive_c[j])
                for di in range(int(spec.shape[2])) if int(spec[b, j, di]) > simbase.SPEC_KEEP]
        if pins:
            rec["specialists"] = pins
    if lock is not None:
        flips = [int(x) for x in lock[b].tolist() if int(x) >= 0]
        if flips:
            rec["lockTiles"] = flips
    if vote is not None:
        ballot = [[int(vote[b, k, f]) for f in range(3)] for k in range(vote.shape[1])]
        ballot = [e if e[0] >= 0 else None for e in ballot]
        if any(e is not None for e in ballot):
            rec["vote"] = ballot
    return rec


def _buy_record_fields(sim, row: int, b: int, buy, worship, relig, levy, monu=None, nat=None, cls=None, ucls=None) -> dict:
    """The GOLD/FAITH/LEVY half of a seat's record, for ANY seat row — every
    city reference is CENTRE-KEYED like production, because ids are
    engine-local and centres are the shared vocabulary. Every field is
    OPTIONAL: absent = no purchase of that kind this turn."""
    out: dict = {}
    RCn = int(sim.city_center.shape[2])

    def _centre(j: int) -> int | None:
        return int(sim.city_center[b, row, j]) if 0 <= j < RCn and bool(sim.city_alive[b, row, j]) else None

    if buy is not None:
        _k = int(buy[0][b])
        if _k == 0:
            _c = _centre(int(buy[1][b]))
            if _c is not None:
                out["buy"] = [0, _c, int(buy[2][b])]
        elif _k == 1:
            out["buy"] = [1, -1, -1]
        elif _k == 2:
            out["buy"] = [2, -1, -1]
        elif _k == 3:
            _c = _centre(int(buy[2][b]))
            if _c is not None:
                out["buy"] = [3, int(buy[1][b]), _c]
    bf = []
    if worship is not None:
        _c = _centre(int(worship[b]))
        if _c is not None:
            bf.append([4, _c])
    if relig is not None and int(relig[0][b]) in (5, 6, 11, 14):
        _c = _centre(int(relig[1][b]))
        if _c is not None:
            bf.append([int(relig[0][b]), _c])
    if monu is not None and int(monu[0][b]) in (8, 9):
        _c = _centre(int(monu[1][b]))
        if _c is not None:
            bf.append([int(monu[0][b]), _c])
    if nat is not None and int(nat[0][b]) == 10:
        _c = _centre(int(nat[1][b]))
        if _c is not None:
            bf.append([10, _c])
    if cls is not None and int(cls[1][b]) >= 0:
        _c = _centre(int(cls[0][b]))
        if _c is not None:
            bf.append([12, _c, int(cls[1][b])])
    if ucls is not None and int(ucls[1][b]) >= 0:
        _c = _centre(int(ucls[0][b]))
        if _c is not None:
            bf.append([13, _c, int(ucls[1][b])])
    if bf:
        out["buyFaith"] = bf
    if levy is not None and int(levy[b]) >= 0:
        out["levy"] = int(levy[b])
    return out


def replay_seat(sim, row: int, rec: dict) -> None:
    """Apply ONE recorded turn for seat `row` without consulting the ladder.

    This is the half of the interface the TS engine has to implement. It must
    touch no policy at all — if a replay needs to ask the ladder anything, the
    file is not a complete record of the decisions and TS could never reproduce
    the run from it.
    """
    dev = sim.device
    prod = torch.full((sim.B, sim.RC), -1, dtype=torch.long, device=dev)
    nS = len(sim._scaffold) if sim.districts_on else 0
    dtile = torch.full((sim.B, sim.RC, nS), -1, dtype=torch.long, device=dev) if nS else None
    for ent in rec["production"]:
        centre, col = int(ent[0]), int(ent[1])
        hit = (sim.city_center[:, row] == centre) & sim.city_alive[:, row]
        prod = torch.where(hit, torch.full_like(prod, col), prod)
        si = col - sim.DISTRICT_BASE
        if dtile is not None and 0 <= si < nS:
            # a district column carries its TILE as the pair's third element
            t = int(ent[2]) if len(ent) > 2 else -1
            dtile[:, :, si] = torch.where(hit, torch.full_like(dtile[:, :, si], t), dtile[:, :, si])
    # [B] like the war arm below — a bare torch.tensor(int) is 0-dim and the
    # record apply gathers on dim 1.
    tech = None if rec["tech"] is None else torch.full((sim.B,), int(rec["tech"]), dtype=torch.long, device=dev)
    civic = None if rec["civic"] is None else torch.full((sim.B,), int(rec["civic"]), dtype=torch.long, device=dev)
    _wv = rec.get("war")
    war = None if _wv is None else torch.full((sim.B,), int(_wv), dtype=torch.long, device=dev)
    _ev = rec.get("envoys") or []
    env_seq = torch.tensor(_ev, dtype=torch.long, device=dev).reshape(1, -1).expand(sim.B, -1) if _ev else None
    # parse the CENTRE-KEYED buy intent back to tensors (the city resolution
    # rule — match by centre + alive, never by slot).
    _bv = rec.get("buy")
    buy = None
    if _bv is not None and int(_bv[0]) == 0:
        hitj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(sim.RC):
            m = (sim.city_center[:, row, j] == int(_bv[1])) & sim.city_alive[:, row, j]
            hitj = torch.where(m, torch.full_like(hitj, j), hitj)
        kind0 = torch.where(hitj >= 0, torch.zeros_like(hitj), torch.full_like(hitj, -1))
        buy = (kind0, hitj, torch.full((sim.B,), int(_bv[2]), dtype=torch.long, device=dev))
    elif _bv is not None and int(_bv[0]) == 1:
        neg1 = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        buy = (torch.ones((sim.B,), dtype=torch.long, device=dev), neg1, neg1)
    elif _bv is not None and int(_bv[0]) == 2:
        neg1 = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        buy = (torch.full((sim.B,), 2, dtype=torch.long, device=dev), neg1, neg1)
    elif _bv is not None and int(_bv[0]) == 3:
        # TILE: [3, tileIndex, centreTile] -> (kind, tile, slot) by centre
        # resolution (match by centre + alive, never by slot).
        hitj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(sim.RC):
            m3 = (sim.city_center[:, row, j] == int(_bv[2])) & sim.city_alive[:, row, j]
            hitj = torch.where(m3, torch.full_like(hitj, j), hitj)
        kind3 = torch.where(hitj >= 0, torch.full_like(hitj, 3), torch.full_like(hitj, -1))
        buy = (kind3, torch.full((sim.B,), int(_bv[1]), dtype=torch.long, device=dev), hitj)

    def _centre_slot(centre: int) -> torch.Tensor:
        hj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(sim.RC):
            mm = (sim.city_center[:, row, j] == centre) & sim.city_alive[:, row, j]
            hj = torch.where(mm, torch.full_like(hj, j), hj)
        return hj

    worship = relig = monu = nat = cls = ucls = None
    for _ent in rec.get("buyFaith") or []:
        _fk, _fc = int(_ent[0]), int(_ent[1])
        if _fk in (12, 13):
            _cjt = _centre_slot(_fc)
            _pair = (_cjt, torch.where(_cjt >= 0, torch.full_like(_cjt, int(_ent[2])), torch.full_like(_cjt, -1)))
            if _fk == 12:
                cls = _pair
            else:
                ucls = _pair
            continue
        if _fk == 4:
            worship = _centre_slot(_fc)
        elif _fk in (5, 6, 11, 14):
            _rjt = _centre_slot(_fc)
            relig = (torch.where(_rjt >= 0, torch.full_like(_rjt, _fk), torch.full_like(_rjt, -1)), _rjt)
        elif _fk in (8, 9):
            _mjt = _centre_slot(_fc)
            monu = (torch.where(_mjt >= 0, torch.full_like(_mjt, _fk), torch.full_like(_mjt, -1)), _mjt)
        elif _fk == 10:
            _njt = _centre_slot(_fc)
            nat = (torch.where(_njt >= 0, torch.full_like(_njt, 10), torch.full_like(_njt, -1)), _njt)
    _lv = rec.get("levy")
    levy = None if _lv is None else torch.full((sim.B,), int(_lv), dtype=torch.long, device=dev)
    _rv = rec.get("route")
    route = None
    if _rv is not None:
        route = (torch.full((sim.B,), int(_rv[0]), dtype=torch.long, device=dev),
                 torch.full((sim.B,), int(_rv[1]), dtype=torch.long, device=dev))
    _sp = rec.get("specialists") or []
    spec = None
    if _sp:
        nD = sim.city_spec_pin.shape[3]
        spec = torch.full((sim.B, sim.RC, nD), simbase.SPEC_KEEP, dtype=torch.long, device=dev)
        for _c, _di, _n in _sp:
            _hj = _centre_slot(int(_c))
            _rw = (_hj >= 0).nonzero(as_tuple=True)[0]
            if len(_rw) and 0 <= int(_di) < nD:
                spec[_rw, _hj[_rw], int(_di)] = int(_n)
    _lk = rec.get("lockTiles") or []
    lock = (torch.tensor(_lk, dtype=torch.long, device=dev).reshape(1, -1).expand(sim.B, -1)
            if _lk else None)
    _vt = rec.get("vote") or []
    vote = None
    if any(e is not None for e in _vt):
        _kn = sim.civ_congress_vote.shape[2]
        vote = torch.full((sim.B, _kn, 3), -1, dtype=torch.long, device=dev)
        for _k, _ent in enumerate(_vt[:_kn]):
            if _ent is None:
                continue
            for _f in range(3):
                vote[:, _k, _f] = int(_ent[_f])
    sim.apply_seat_actions(row, production=prod, production_tile=dtile, tech=tech, civic=civic,
                           war=war, envoys=env_seq, buy=buy, worship=worship, relig=relig, levy=levy,
                           monu=monu, nat=nat, cls=cls, ucls=ucls, route=route, spec=spec, lock=lock, vote=vote)

    def _geo_mask(seats) -> torch.Tensor:
        m = torch.zeros(sim.B, sim.n_majors, dtype=torch.bool, device=dev)
        for j in seats:
            if 0 <= int(j) < sim.n_majors:
                m[:, int(j)] = True
        return m

    geo_kwargs = {}
    for _name in ("denounce", "friend", "ally", "borders"):
        if rec.get(_name):
            geo_kwargs[_name] = _geo_mask(rec[_name])
    if rec.get("gift"):
        _g = torch.zeros(sim.B, ladder.GW_KINDS, sim.n_majors, dtype=torch.bool, device=dev)
        for _k, _j in rec["gift"]:
            if 0 <= int(_k) < ladder.GW_KINDS and 0 <= int(_j) < sim.n_majors:
                _g[:, int(_k), int(_j)] = True
        geo_kwargs["gift"] = _g
    if geo_kwargs:
        sim.apply_geo(row, **geo_kwargs)
    ranks = []
    for step in rec["units"]:
        orders = torch.tensor(step, dtype=torch.long, device=dev)
        if orders.dim() == 1:
            orders = orders.unsqueeze(0)
        ranks.append(orders)
    if ranks:
        if not hasattr(sim, "_driven_useq") or sim._driven_useq is None:
            sim._driven_useq = {}
        sim._driven_useq[row] = torch.stack(ranks, dim=2)


def replay(env, log: list, seats=None) -> None:
    sim = env.sim
    seats = list(range(1, sim.n_majors)) if seats is None else list(seats)
    for row in seats:
        take_seat(sim, row)
    for turn_rec in log:
        for row in seats:
            key = f"s{row}"
            if key in turn_rec:
                replay_seat(sim, row, turn_rec[key])
        sim.step()


def drive(env, turns: int, seats=None, record: Path | None = None) -> list:
    """Run `turns` turns with `seats` (default: every civ row) driven by the ladder.

    THE FILE IS THE INTERFACE: when `record` is given the chosen actions are
    written out, which is what lets the TS engine replay the identical
    decisions instead of keeping its own copy of the policy.
    """
    assert env.sim.B == 1, "drive() is the B=1 surface; batches record via drive_batched()"
    log = drive_batched(env, turns, seats)[0]
    if record is not None:
        record.write_text(json.dumps(log), encoding="utf-8")
    return log


def drive_batched(env, turns: int, seats=None, seeds=None) -> list:
    sim = env.sim
    B = sim.B
    seats = list(range(1, sim.n_majors)) if seats is None else list(seats)
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((Path(__file__).resolve().parent.parent / "seeder" / "worlds" / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for row in seats:
        take_seat(sim, row)
    logs = [[] for _ in range(B)]
    game_seeds = list(seeds) if seeds is not None else list(range(B))
    for t in range(turns):
        per_seat = {row: _decide_turn(env, sim, row, roster, classes, seeds=game_seeds, turn=t) for row in seats}
        for b in range(B):
            turn_rec = {"turn": t}
            for row in seats:
                turn_rec[f"s{row}"] = _extract_record(sim, row, *per_seat[row], b)
            logs[b].append(turn_rec)
        sim.step()
    return logs
