"""THE DRIVER: the seam between the ladder and the engine. One policy module
decides for a seat; the engine only applies what it is told.

The engine hands out an OBSERVATION and a set of legality MASKS,
`policy/ladder.py` returns ACTIONS, and the engine applies them. No policy sits
on the engine side of that line.

WHAT DRIVING A SEAT MEANS, concretely:
  * `take_seat` sets `seat_ext[:, row]`, the column every wire-driven arm
    gates on. Every major row carries it from world construction — the
    decision server is the only driver either engine has — so this is a
    statement of intent for a seat taken mid-run, not a switch that turns
    some built-in AI off. There is no built-in AI left to turn off.
  * every turn, for each driven seat: read masks + observation, call the ladder,
    write the actions back through the ordinary apply paths —
    `apply_seat_actions` for production/tech/civic/war/purchases (with a
    preference order when one is supplied) and `apply_seat_unit_sequence` for
    the movement ranks.

WHAT IS HERE: `take_seat` and `_blocks` (the observation, sliced); the per-verb
context builders (`_prod_ctx`, `_war_ctx`, `_buy_ctx`) and the seat-generic unit
verbs; `_geo_turn` / `geo_decide_and_apply`, the whole turn's geopolitics at
once; `_decide_turn` and `_extract_record`, one turn's decisions and the record
they write; `replay_seat` / `replay` / `apply_turn`, that record applied without
consulting the ladder; and `drive` / `drive_batched`, the run surfaces.

UNIT STEPS ARE PLANNED, NOT RE-OBSERVED. `seat_unit_obs` is 1-HOP — it carries
each neighbour's distance to home and nothing further — so the ladder cannot see
where its own second step would land. Rank 0 is the ladder's pick off the real
observation; later MOVE ranks are planned here along `pair_dist`, and the phase
re-validates every rank. A net that wants to commit several steps at once can
fill the sequence directly; the action space supports both.
"""
from __future__ import annotations

import json
from pathlib import Path

import torch

import ladder


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
    return {
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
    """Hand seat `row` to the ladder for the rest of the run."""
    sim.seat_ext[:, row] = True


def _blocks(env, sim, row: int) -> dict:
    """The seat's OBSERVATION, sliced into the blocks the ladder reads.

    Goes through `env.observe(seat)` and `ladder.split` rather than reaching into
    engine tensors — the observation is the seat's whole view of the world, and
    a policy that peeks past it is not a policy that a net could replace.
    """
    obs = env.observe(row)
    # tech/civic widths come off the live tensors — there is no NT/NC scalar,
    # and hardcoding one here would be the second copy that always drifts.
    return ladder.split(obs, sim.S, sim.R, sim.RC, sim.civ_techs.shape[2], sim.civ_civics.shape[2])


#: ACTION FILE SCHEMA v2 — THE FILE IS THE INTERFACE.
#:
#: Both engines parse this, so it records DECISIONS, never derived state: a
#: replay must be able to reproduce the run without re-deriving anything the
#: policy knew. Per turn, per driven seat:
#:     {"turn": t, "s<seatRow>": {
#:         "production": [[centreTile, col], ...]  one pair per city that acts
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
SCHEMA_VERSION = 2


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
    """(slot_map, present, tiles, types, charges) for ANY seat — ONE slot
    map over the ONE shared unit window, ranked by `unit_seat`."""
    smap = sim._seat_slot_map(seat)
    sc = smap.clamp(min=0)
    return (smap, smap >= 0,
            sim.unit_tile.gather(1, sc), sim.unit_type.gather(1, sc), sim.unit_charges.gather(1, sc))


def _builder_jobs(sim, seat: int) -> torch.Tensor:
    """[B, N] job tile per slot row (-1 = none) for CIVILIAN rows with
    charges — the NEAREST _seat_job_mask tile, ties to the LOWEST tile index
    (the scripted walk's own key). One legality body for every seat; the
    pool router supplies the planes."""
    smap, present, tiles, types, charges = _seat_units(sim, seat)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if not sim.improvements_on:
        return out
    jobs = sim._seat_job_mask(seat)  # [B, T]
    if not bool(jobs.any()):
        return out
    arangeT = torch.arange(sim.T, device=sim.device)
    for n in range(N):
        pres = present[:, n]
        if not bool(pres.any()):
            break  # _seat_slot_map compacts EVERY row — no holes to skip past
        vt = types[:, n].clamp(min=0, max=sim.NU - 1)
        civ_row = (sim._type_charges[vt] > 0) & (charges[:, n] > 0)
        rows = pres & civ_row
        if not bool(rows.any()):
            continue
        here = tiles[:, n]
        d = sim.pair_dist[here.clamp(min=0)].to(torch.long)
        key = torch.where(jobs, d * sim.T + arangeT, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & jobs.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _spread_targets(sim, seat: int) -> torch.Tensor:
    """[B, N] spread-target CENTRE per slot row (-1 = none) for religious rows
    with charges — the NEAREST alive centre of ANY civ whose followed
    religion != g, ties lowest tile (the walker's own dist·(T+1)+centerIndex
    key). g IS the seat id (the religion plane's own convention: 0, then the
    civ seats)."""
    smap, present, tiles, types, charges = _seat_units(sim, seat)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    done = sim.civ_religion_done[:, seat]
    if not bool(done.any()):
        return out
    g = seat
    T = sim.T
    # ONE scan over every major row: a spread target is any live city whose
    # followed religion is not this seat's. `g` IS the row (the religion
    # plane's own convention), so no arm asks which seat is asking.
    nrow = 1 + sim.R
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
            break  # _seat_slot_map compacts EVERY row (the _builder_jobs twin)
        vt = types[:, n].clamp(min=0, max=sim.NU - 1)
        relig = torch.zeros_like(pres)
        if sim._missionary_idx >= 0:
            relig = relig | (vt == sim._missionary_idx)
        if getattr(sim, "_apostle_idx", -1) >= 0:
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


def _seat_unit_orders(sim, seat: int):
    """The RANK-0 unit policy, ONE text for every seat: the ladder's pick over
    the seat's own mask/obs, then the builder-job and spread overrides. Rows
    ride the seat's slot layout (`_seat_units`) — the ONE head layout every
    applier and every mask indexes by.

    The BUILDER verb: a civilian with charges standing ON its job takes the
    job column — REPAIR first (the scripted order), else the lowest legal
    BUILD column. The MASK is the legality body; the best-GAIN ranking within
    multi-option bare tiles is a RECORDED RESIDUAL (lowest column for now).
    Rows not on their job get walked there by the caller's rank planner
    (seats >= 1) or re-planned next turn (seat 0, single-rank like the
    scripted walker's own single-step gait).
    """
    um = sim._seat_unit_mask(seat)
    uo = sim.seat_unit_obs(seat)
    orders0 = ladder.pick_unit_orders(um, uo)
    job_t = _builder_jobs(sim, seat)
    spread_t = _spread_targets(sim, seat)
    _smap, present, tiles, _types, _charges = _seat_units(sim, seat)
    on_job = (job_t >= 0) & (tiles == job_t) & present
    # religious rows within 1 of their target SPREAD (HERE when standing on
    # it — own cities — else the direction of the centre).
    A_SP = getattr(sim, "_A_SPREAD", -1)
    if A_SP >= 0 and bool((spread_t >= 0).any()):
        d_sp = sim.pair_dist[tiles.clamp(min=0), spread_t.clamp(min=0)].to(torch.long)
        close = (spread_t >= 0) & present & (d_sp <= 1)
        if bool(close.any()):
            nbr = sim.neigh[tiles.clamp(min=0)]  # [B, N, 6]
            dir_hit = (nbr == spread_t.unsqueeze(2)) & (nbr >= 0)
            dcol = torch.where(
                tiles == spread_t,
                torch.zeros_like(spread_t),
                dir_hit.float().argmax(dim=2) + 1,
            )
            valid_dir = (tiles == spread_t) | dir_hit.any(dim=2)
            take_sp = close & valid_dir
            orders0 = torch.where(take_sp, A_SP + dcol, orders0)
    # the SETTLER verb: a settler FOUNDS where it stands whenever the
    # FOUND column is legal (the engine re-validates canFoundCity at apply,
    # so an illegal tile simply no-ops and the settler tries again after a
    # walk). Ranked ABOVE the builder-job override: a settler is never a
    # builder, so the two never contend.
    A_F = getattr(sim, "_A_FOUND", -1)
    if A_F >= 0 and getattr(sim, "_settler_idx", -1) >= 0:
        is_settler = present & (_types == sim._settler_idx)
        if bool(is_settler.any()) and um.shape[2] > A_F:
            take_f = is_settler & um[:, :, A_F]
            orders0 = torch.where(take_f, torch.full_like(orders0, A_F), orders0)
    if bool(on_job.any()):
        W_u = um.shape[2]
        rep_ok = um[:, :, 17] if W_u > 17 else torch.zeros_like(on_job)
        bcols = list(range(13, 16)) + list(range(18, min(getattr(sim, "_A_PILLAGE", 25), W_u)))
        bmask = torch.stack([um[:, :, c] for c in bcols], dim=2) if bcols else None
        pick_b = torch.full_like(orders0, -1)
        if bmask is not None:
            hasb = bmask.any(dim=2)
            firstb = bmask.float().argmax(dim=2)
            colt = torch.tensor(bcols, device=um.device)
            pick_b = torch.where(hasb, colt[firstb], pick_b)
        chosen = torch.where(rep_ok, torch.full_like(orders0, 17), pick_b)
        take_b = on_job & (chosen >= 0)
        orders0 = torch.where(take_b, chosen, orders0)
    return orders0, job_t, spread_t, um, uo


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
    for _ke in range(6):  # bank bound: accrual grants <=1/turn + quest grants
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
    return torch.stack(picks_e, dim=1) if picks_e else None  # [B, K]


def _war_ctx(blocks: dict) -> dict:
    """The DoW policy's inputs, read from the OBSERVATION — the engines render
    the scripted war-declaration site's own formulas (strengths, closest city
    pair, the warmonger-gang term, aggression), so the policy consumes only
    what a client observation carries.

    Two blocks, two shapes. The OPPONENT block is [B, R, PER_CIV], one column
    per other major in ascending seat order — the same order the war head
    uses, so column k here and column k of the mask name the same seat. The
    CTX block is the asker's own."""
    ctx, cv = blocks["ctx"], blocks["civ"]
    return {
        "opp_str": cv[:, :, 3],
        "prox": cv[:, :, 4].long(),
        "gang": cv[:, :, 5] > 0.5,
        "has_cities": cv[:, :, 6] > 0.5,
        "own_str": ctx[:, 5],
        "aggression": ctx[:, 6],
        "peace_turns": ctx[:, 7].long(),
    }


def _decide_buys(sim, row: int):
    """The PURCHASE verbs for seat row `row` — priority over the candidates
    the engines' one legality bodies produce. ONE decider for every seat: the
    engine stashes each intent and re-validates it at its own phase
    sub-position. The gold buy is ONE kind per turn (kind 3's a/b = tile,
    slot); the faith buys and the levy ride beside it (separate currencies /
    a diplomacy action). Returns (buy, worship, relig, levy) in the shapes
    `step` and `apply_seat_actions` take."""
    bctx = _buy_ctx(sim, row)
    buy_kind = ladder.pick_purchase(bctx["can_building"], bctx["settler_ok"], bctx["unit_ok"], bctx["tile_ok"])
    buy_a = torch.where(buy_kind == 3, bctx["tile"], bctx["jj"])
    buy_b = torch.where(buy_kind == 3, bctx["tile_j"], bctx["bb"])
    worship_ok, relig_kind = ladder.pick_faith(bctx["worship_ok"], bctx["missionary_ok"], bctx["apostle_ok"])
    neg_w = torch.full_like(bctx["worship_j"], -1)
    relig_j = torch.where(relig_kind == 5, bctx["missionary_j"],
                          torch.where(relig_kind == 6, bctx["apostle_j"], neg_w))
    return ((buy_kind, buy_a, buy_b),
            torch.where(worship_ok, bctx["worship_j"], neg_w),
            (relig_kind, relig_j),
            torch.where(bctx["levy_ok"], bctx["levy_cs"], torch.full_like(bctx["levy_cs"], -1)))


def _buy_ctx(sim, row: int) -> dict:
    """The purchase candidates for seat row `row`, read from the engines' ONE
    legality bodies (`_seat_buy_candidates` for the building, kind 0;
    `_seat_buy_unit_candidates` for the unit, kind 2 — the gold rungs' own
    scans). settler_ok mirrors the settler rung's own gate (pop + price, no
    reserve). The unit quota compares decide-time planes: live + queued
    military < 2x alive cities."""
    alive_row = sim.city_alive[:, row]
    n_cities = alive_row.sum(dim=1)
    active = sim.seat_ext[:, row] & (n_cities > 0) & sim.civ_alive[:, row]
    jj, bb, can_b, price, _ = sim._seat_buy_candidates(row, active)
    _sq = (alive_row & (sim.city_current[:, row] == sim.SETTLER)).sum(dim=1)
    sett_cost = (sim.rules.settler_base + sim.rules.settler_per_city
                 * (n_cities - 1 + sim._seat_settlers(row) + _sq).clamp(min=0).double()) * sim.rules.gold_purchase_mult
    # the buy SPAWNS a unit at the capital (else first city), which must have
    # the pop to pay — the TS driver's tripwire mirrors this exactly.
    _cap_is = sim.city_is_cap[:, row]
    _spawn_slot = torch.where(_cap_is.any(dim=1), _cap_is.long().argmax(dim=1), alive_row.long().argmax(dim=1))
    _spawn_pop = sim.city_pop[:, row].gather(1, _spawn_slot.unsqueeze(1)).squeeze(1)
    settler_ok = active & (_spawn_pop >= sim.rules.settler_pop_gate) & sim._afford(sim.civ_treasury[:, row], sett_cost)
    cand_u = sim._seat_buy_unit_candidates(row, sim._seat_trainable_units(row))
    unit_ok = active & (sim._seat_army_count(row) < 2 * n_cities) & cand_u.any(dim=1)
    # kind 3, the TILE candidate — first slot in order with a border
    # candidate, best border key, ABORT on unaffordable (the engines' one
    # legality body _seat_tile_buy_candidate).
    tile_j, tile_t, _tile_cost, tile_ok = sim._seat_tile_buy_candidate(row, active)
    # kinds 4-6, the FAITH candidates (worship / missionary / apostle), each
    # with its first-eligible slot from the shared body.
    w_ok, w_j, m_ok, m_j, a_ok, a_j = sim._seat_faith_buy_candidates(row, active)
    # kind 7, the LEVY candidate — the RULE half from the shared body; AT-WAR
    # is the policy gate and it joins HERE (the ladder's own condition), not
    # in the engines' re-validation.
    levy_ok, levy_cs = sim._seat_levy_candidate(row, active)
    # atWarWithAny, off the war matrix's own row — one expression for every
    # seat (the seat-0 arm this replaced was already the any(), and the civ
    # arm counted only the war with seat 0).
    levy_ok = levy_ok & sim.war[:, row, : 1 + sim.R].any(dim=1)
    return {"jj": jj, "bb": bb, "can_building": can_b, "price": price,
            "settler_ok": settler_ok, "unit_ok": unit_ok,
            "tile_ok": tile_ok, "tile": tile_t, "tile_j": tile_j,
            "worship_ok": w_ok, "worship_j": w_j,
            "missionary_ok": m_ok, "missionary_j": m_j,
            "apostle_ok": a_ok, "apostle_j": a_j,
            "levy_ok": levy_ok, "levy_cs": levy_cs}


def _geo_turn(sim):
    """The DENOUNCE and ALLIANCE decisions for the whole turn, over seat
    ROWS. Computed once because the alliance scan reads this turn's fresh
    grudges. Zero-draw and deterministic; everything here is POLICY —
    proximity and strength thresholds, row-order scanning — and the engine
    arm re-validates only the RULES. Returns (denounce [B,1+R,1+R] bool,
    ally [B,1+R,1+R] bool from the lower row).

    Declaring and suing are NOT here: they ride each seat's own war head
    through `ladder.pick_war`, the one entry."""
    B, dev = sim.B, sim.device
    nrow = 1 + sim.R
    den = torch.zeros(B, nrow, nrow, dtype=torch.bool, device=dev)
    ally = torch.zeros_like(den)
    if sim.R < 1:
        return den, ally
    rr = sim.rules.seats
    n_c = sim.city_alive[:, :nrow].sum(dim=2)
    alive_row = sim.civ_alive[:, :nrow] & (n_c > 0)  # [B, 1+R]
    rstr = sim._seat_strengths()
    prox_max = int(rr.get("dowProximity", 9))
    prox = {}
    for a in range(nrow):
        for b in range(nrow):
            if a != b:
                prox[a, b] = sim._seat_proximity(a, b)
    # DENOUNCE: every eligible directed pair — a nearer, weaker-scoring seat
    # not yet at war (the declare family's gates at the WEAKER strength bar,
    # so the stamp reliably precedes the war).
    for a in range(nrow):
        for b in range(nrow):
            if a == b:
                continue
            den[:, a, b] = (
                alive_row[:, a] & alive_row[:, b]
                & (sim.seat_denounced[:, a, b] < 0) & ~sim.war[:, a, b]
                & (prox[a, b] <= prox_max) & (rstr[:, a] > rstr[:, b])
            )
    # ALLIANCE (lower-row proposal): peace-era pairs with no grudge — the
    # stored stamps AND this turn's fresh denouncements — and no grievances.
    if int(sim.turn) >= sim._ally_min_peace:
        for a in range(nrow):
            for b in range(a + 1, nrow):
                ally[:, a, b] = (
                    alive_row[:, a] & alive_row[:, b]
                    & ~sim.war[:, a, b] & ~sim.seat_allied[:, a, b]
                    & (sim.seat_denounced[:, a, b] < 0) & (sim.seat_denounced[:, b, a] < 0)
                    & ~den[:, a, b] & ~den[:, b, a]
                    & (sim.civ_warmonger[:, a] <= 0) & (sim.civ_warmonger[:, b] <= 0)
                )
    return den, ally


def geo_decide_and_apply(sim):
    """Decide the turn's denounce/ally once, stash every row's intents on the
    sim (the engine arm consumes them at the phase top), and return the
    tensors for wire extraction (_extract_geo per seat row)."""
    den, ally = _geo_turn(sim)
    for row in range(1 + sim.R):
        sim.apply_geo(row, denounce=den[:, row], ally=ally[:, row])
    return den, ally


def _extract_geo(geo, row: int, b: int) -> dict:
    """Seat `row`'s geo record fields for batch row b. The TARGETS are
    ABSOLUTE SEATS — the planes are the war matrix's own rows.
    Absent keys = no intent (the wire's optional-field convention)."""
    den, ally = geo
    out = {}
    dl = den[b, row].nonzero(as_tuple=True)[0].tolist()
    if dl:
        out["denounce"] = dl
    al = ally[b, row].nonzero(as_tuple=True)[0].tolist()
    if al:
        out["ally"] = al
    return out


def decide_and_apply(env, sim, row: int, roster: dict, classes: dict, max_steps: int = 4) -> dict:
    """One turn's decisions for one driven seat, returned in the action-file
    schema so a replay can reproduce them exactly. B=1 callers only — the
    batched recorder extracts every row via `_extract_record`."""
    prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy = _decide_turn(env, sim, row, roster, classes, max_steps)
    return _extract_record(sim, row, prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy, 0)


def _decide_turn(env, sim, row: int, roster: dict, classes: dict, max_steps: int = 4, seeds=None, turn=None):
    """The BATCHED decision core — masks, ladder picks, the virtual planner,
    the draw-free applies and the useq stash. Returns the per-verb decision
    tensors; extraction is the caller's per-row problem."""
    m = sim.seat_masks(row)
    blocks = _blocks(env, sim, row)
    prod = ladder.pick_production(m["production"], classes, roster, _prod_ctx(blocks, sim, row))
    tech = ladder.pick_research(blocks, m["tech"], "tech") if bool(m["tech"].any()) else None
    civic = ladder.pick_research(blocks, m["civic"], "civic") if bool(m["civic"].any()) else None
    # the WAR verb: the ladder decides from the driver's own policy stream;
    # declare/peace apply PRE-STEP through the war head — the same position
    # the replay uses, so recorder and replayer share one within-turn
    # ordering (a declare turns THIS turn's walkers hostile on both engines).
    # Without seeds/turn (a raw B=1 decide_and_apply caller) the verb stands
    # down — the recording surfaces always pass them.
    war = None
    if seeds is not None and turn is not None:
        rng_w = {
            "dow": _policy_rng(sim, seeds, turn, row, 1),
            "peace": _policy_rng(sim, seeds, turn, row, 2),
        }
        war = ladder.pick_war(m["war"], _war_ctx(blocks), rng_w)
    env_seq = None
    if seeds is not None and turn is not None and sim.S > 0:
        env_seq = _seat_envoys(sim, row)
    # the PURCHASE verbs — priority over the candidates from the engines' one
    # legality bodies; the engine stashes and consumes each intent at its own
    # phase sub-position, re-validating there. The gold buy is ONE kind per
    # turn (kind 3's a/b = tile, slot); the faith buys and the levy ride
    # beside it (separate currencies / the diplomacy action).
    buy, worship, relig, levy = _decide_buys(sim, row)
    sim.apply_seat_actions(row, production=prod, tech=tech, civic=civic, war=war, envoys=env_seq,
                           buy=buy, worship=worship, relig=relig, levy=levy)

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
    orders0, job_t, spread_t, um, uo = _seat_unit_orders(sim, row)
    B2, N2 = orders0.shape
    ranks = [orders0]
    smap = sim._seat_slot_map(row)
    cur = sim.unit_tile.gather(1, smap.clamp(min=0))
    # per-row destination: the war target when at war, else the nearest own
    # centre (the same two rules the ladder's own branches follow)
    at_war_rows = uo[:, :, ladder.U_ATWAR] > 0
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
        wt = getattr(sim, "_vplan_wt", None)
        if wt is None or wt.get("row") != row:
            tgts = torch.full((B2, N2), -1, dtype=torch.long, device=sim.device)
            for n in range(N2):
                if not bool((smap[:, n] >= 0).any()):
                    break
                tgt_n, hi, hpc, hrc = sim._war_march_target(cur[:, n].clamp(min=0), row)
                has = (hi | hpc | hrc)
                tgts[:, n] = torch.where(has, tgt_n, tgts[:, n])
            sim._vplan_wt = {"row": row, "tgts": tgts}
        tgts = sim._vplan_wt["tgts"]
        # nearest own centre per row (peace drift target)
        for n in range(N2):
            rows_mv = moving[:, n]
            if not bool(rows_mv.any()):
                continue
            dest = torch.where(at_war_rows[:, n] & (tgts[:, n] >= 0), tgts[:, n], torch.full_like(tgts[:, n], -1))
            # a civilian's JOB is a walk destination like a war target —
            # real-MP multi-rank, re-planned each turn.
            dest = torch.where((dest < 0) & (job_t[:, n] >= 0), job_t[:, n], dest)
            # a religious unit's SPREAD target likewise.
            dest = torch.where((dest < 0) & (spread_t[:, n] >= 0), spread_t[:, n], dest)
            # peace: skip planning ranks beyond 0 (the drift re-plans next turn
            # anyway; multi-rank marching is a WAR behaviour in the walkers)
            ok_rows = rows_mv & (dest >= 0)
            if not bool(ok_rows.any()):
                continue
            d_cur = sim.pair_dist[cur[:, n].clamp(min=0), dest.clamp(min=0)].to(torch.long)
            d_nb = sim.pair_dist[nb_now[:, n].clamp(min=0), dest.clamp(min=0).unsqueeze(1)].to(torch.long)  # pair_dist is int16; the key sentinel overflows it
            closer = (nb_now[:, n] >= 0) & (d_nb < d_cur.unsqueeze(1))
            key = torch.where(closer, d_nb * 8 + torch.arange(6, device=sim.device), torch.full_like(d_nb, 10 ** 9))
            best = key.argmin(dim=1)
            has_step = closer.any(dim=1) & ok_rows
            nxt[:, n] = torch.where(has_step, best, nxt[:, n])
        ranks.append(nxt)
        if not bool((nxt >= 0).any()):
            ranks.pop()
            break
    sim._vplan_wt = None
    K2 = len(ranks)
    seq = torch.stack(ranks, dim=2) if K2 > 1 else ranks[0].unsqueeze(2)
    if not hasattr(sim, "_driven_useq") or sim._driven_useq is None:
        sim._driven_useq = {}
    sim._driven_useq[row] = seq
    return prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy


def _extract_record(sim, row: int, prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy, b: int) -> dict:
    """One batch row's record, in the action-file schema.

    Two per-row conventions:
    - tech/civic: a -1 pick (this game had nothing legal) records as None.
    - units: ranks are trimmed of TRAILING all-instruction-free rows, which is
      where the planner itself stops; a unit's own ranks are monotone, so no
      order ever follows a -1.
    """
    # production as [centreTile, col] PAIRS (see SCHEMA_VERSION); the centre
    # is the cross-engine city key.
    _pr = prod[b]
    _ctr = sim.city_center[b, row]
    _alive_c = sim.city_alive[b, row]
    prod_pairs = [
        [int(_ctr[j]), int(_pr[j])]
        for j in range(min(int(_pr.shape[0]), int(_ctr.shape[0])))
        if int(_pr[j]) >= 0 and bool(_alive_c[j])
    ]
    _t = None if tech is None or int(tech[b]) < 0 else int(tech[b])
    _c = None if civic is None or int(civic[b]) < 0 else int(civic[b])
    rows = [seq[b, :, k].tolist() for k in range(int(seq.shape[2]))]
    while len(rows) > 1 and all(x < 0 for x in rows[-1]):
        rows.pop()
    # the war-head column over `war_targets(row)` — the other majors in
    # ascending seat order: k declares on the k-th, R+k sues it. Or None;
    # OPTIONAL field, a missing key reads as None.
    _w = None if war is None or int(war[b]) < 0 else int(war[b])
    # this row's envoy assignment sequence (CS indices), possibly empty.
    _e = [] if env_seq is None else [int(x) for x in env_seq[b].tolist() if int(x) >= 0]
    rec = {"production": prod_pairs, "tech": _t, "civic": _c, "war": _w, "envoys": _e, "units": rows}
    rec.update(_buy_record_fields(sim, row, b, buy, worship, relig, levy))
    return rec


def _buy_record_fields(sim, row: int, b: int, buy, worship, relig, levy) -> dict:
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
            out["buy"] = [1, -1, -1]  # SETTLER: no city key, the spawn scan decides
        elif _k == 2:
            out["buy"] = [2, -1, -1]  # UNIT: the strongest-affordable scan decides
        elif _k == 3:
            # TILE: [3, tileIndex, centreTile] — the city keyed by CENTRE like
            # kind 0 (a/b at decide time are tile, slot).
            _c = _centre(int(buy[2][b]))
            if _c is not None:
                out["buy"] = [3, int(buy[1][b]), _c]
    # kinds 4-6, the FAITH purchases — [kind, centreTile] entries in apply
    # order (worship first, then the one religious unit).
    bf = []
    if worship is not None:
        _c = _centre(int(worship[b]))
        if _c is not None:
            bf.append([4, _c])
    if relig is not None and int(relig[0][b]) in (5, 6):
        _c = _centre(int(relig[1][b]))
        if _c is not None:
            bf.append([int(relig[0][b]), _c])
    if bf:
        out["buyFaith"] = bf
    # kind 7, the LEVY — the CS index (the shared CS vocabulary, like the
    # envoy sequence).
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
    # [centreTile, col] pairs -> per-slot columns via THIS sim's centres.
    prod = torch.full((sim.B, sim.RC), -1, dtype=torch.long, device=dev)
    for centre, col in rec["production"]:
        hit = (sim.city_center[:, row] == int(centre)) & sim.city_alive[:, row]
        prod = torch.where(hit, torch.full_like(prod, int(col)), prod)
    tech = None if rec["tech"] is None else torch.tensor(rec["tech"], dtype=torch.long, device=dev)
    civic = None if rec["civic"] is None else torch.tensor(rec["civic"], dtype=torch.long, device=dev)
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

    # kinds 4-6: [kind, centreTile] entries -> the worship slot and the one
    # religious-unit intent (the engine's own short-circuit keeps a malformed
    # double-entry harmless).
    worship = relig = None
    for _ent in rec.get("buyFaith") or []:
        _fk, _fc = int(_ent[0]), int(_ent[1])
        if _fk == 4:
            worship = _centre_slot(_fc)
        elif _fk in (5, 6):
            _rjt = _centre_slot(_fc)
            relig = (torch.where(_rjt >= 0, torch.full_like(_rjt, _fk), torch.full_like(_rjt, -1)), _rjt)
    # kind 7, the LEVY — the CS index rides verbatim.
    _lv = rec.get("levy")
    levy = None if _lv is None else torch.full((sim.B,), int(_lv), dtype=torch.long, device=dev)
    sim.apply_seat_actions(row, production=prod, tech=tech, civic=civic, war=war, envoys=env_seq,
                           buy=buy, worship=worship, relig=relig, levy=levy)
    # the DENOUNCE/ALLY intents stash for the phase-top arm. Targets are
    # ABSOLUTE SEATS, which for a major is its row; declaring and
    # suing rode `war` above, on the head.
    def _geo_mask(seats) -> torch.Tensor:
        m = torch.zeros(sim.B, 1 + sim.R, dtype=torch.bool, device=dev)
        for j in seats:
            if 0 <= int(j) <= sim.R:
                m[:, int(j)] = True
        return m

    geo_kwargs = {}
    if rec.get("denounce"):
        geo_kwargs["denounce"] = _geo_mask(rec["denounce"])
    if rec.get("ally"):
        geo_kwargs["ally"] = _geo_mask(rec["ally"])
    if geo_kwargs:
        sim.apply_geo(row, **geo_kwargs)
    # draw order: replay stashes exactly as the driver does; the PHASE
    # executes at the walkers' position, so recorder and replayer share one
    # draw order by construction.
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
    """Re-run a recorded game from the action file alone. No ladder, no picker."""
    sim = env.sim
    seats = list(range(1, 1 + sim.R)) if seats is None else list(seats)
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
    """Record EVERY batch row in one run — returns one log per row.

    The decision path is batched end to end, so one B-wide run produces B
    records for a single run's python dispatch instead of B serial B=1 runs.
    Row independence is the parity gate's own premise: replay_batched stacks
    per-seed records positionally.
    """
    sim = env.sim
    B = sim.B
    seats = list(range(1, 1 + sim.R)) if seats is None else list(seats)
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((Path(__file__).resolve().parent.parent / "seeder" / "worlds" / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for row in seats:
        take_seat(sim, row)
    logs = [[] for _ in range(B)]
    # the policy stream keys on the GAME seed — the caller passes them
    # (BatchEnv keeps no fixture list). Absent -> per-row index fallback,
    # deterministic but seed-blind; the recording surfaces always pass them.
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
