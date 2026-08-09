"""THE DRIVER: the seam between the ladder and the engine. One policy module
decides for a seat; the engine only applies what it is told.

The engine hands out an OBSERVATION and a set of legality MASKS,
`policy/ladder.py` returns ACTIONS, and the engine applies them. No policy sits
on the engine side of that line.

WHAT DRIVING A SEAT MEANS, concretely:
  * `take_seat` sets `controlled[:, r]`, which makes the engine's scripted
    picker skip civ r entirely — research auto-pick, the production ladder and
    the unit AI all stand down.
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
    # nothing TS-facing leaks. Seat 0 is a seat like any other here, except
    # that its city cap is the world's physical slot count rather than the
    # ladder's stop-expanding heuristic.
    is_cap = sim.is_cap if seat == 0 else sim.civ_city_is_cap[:, seat - 1]
    n_cities = ctx[:, 0].long()
    cap = sim.C if seat == 0 else int(sim.rules.seats.get("maxCities", 6))
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


def take_seat(sim, r: int) -> None:
    """Hand civ `r` (seat r+1) to the ladder for the rest of the run."""
    sim.controlled[:, r] = True


def _blocks(env, sim, r: int) -> dict:
    """The seat's OBSERVATION, sliced into the blocks the ladder reads.

    Goes through `env.observe(seat)` and `ladder.split` rather than reaching into
    engine tensors — the observation is the seat's whole view of the world, and
    a policy that peeks past it is not a policy that a net could replace.
    """
    obs = env.observe(r + 1)  # env._seat_civ's inverse: seat k>0 is civ k-1
    # tech/civic widths come off the live tensors — there is no NT/NC scalar,
    # and hardcoding one here would be the second copy that always drifts.
    return ladder.split(obs, sim.S, sim.R, sim.C, sim.civ_only_techs.shape[2], sim.civ_only_civics.shape[2])


#: ACTION FILE SCHEMA v2 — THE FILE IS THE INTERFACE.
#:
#: Both engines parse this, so it records DECISIONS, never derived state: a
#: replay must be able to reproduce the run without re-deriving anything the
#: policy knew. Per turn, per driven seat:
#:     {"turn": t, "r<civ>": {
#:         "production": [[centreTile, col], ...]  one pair per city that acts
#:         "tech": col | None       None = no pick
#:         "civic": col | None
#:         "units": [[N], ...]      one entry per unit STEP this turn, since a
#:                                  unit may act several times
#:     }}
#: plus the optional fields the extractors below document (war, envoys, buy,
#: buyFaith, levy, and the geo intents). Codes are the MASK layouts
#: (`seat_masks`, `seat_unit_mask`), one layout for every seat, so the same
#: file can drive any of them.
#: The CITY AXIS is keyed by CENTRE TILE, not index: the recorder reads cities
#: by GPU slot and TS applies by founding-order array position, and the two
#: diverge exactly when compaction or capture reorders slots — match cities by
#: centre, never by slot. The UNITS axis stays positional: the engines
#: deliberately mirror unit order (TS splices captured units to the END because
#: the GPU appends; deaths drop identically from both).
SCHEMA_VERSION = 2


_M32 = 0xFFFFFFFF


def _policy_rand(seed: int, turn: int, r: int, salt: int) -> float:
    """ONE mulberry32 draw from the DRIVER's policy stream, keyed on (game
    seed, turn, civ, salt). Deterministic — the same engine always
    re-records the same file — and fully separate from the engines' shared
    rule stream, whose draw-count parity a policy decision must not move."""
    a = (seed * 2654435761 ^ turn * 40503 ^ r * 97 ^ salt * 1013904223) & _M32
    a = (a + 0x6D2B79F5) & _M32
    t = ((a ^ (a >> 15)) * (1 | a)) & _M32
    t = (((t + (((t ^ (t >> 7)) * (61 | t)) & _M32)) & _M32) ^ t) & _M32
    return ((t ^ (t >> 14)) & _M32) / 4294967296.0


def _policy_rng(sim, seeds: list, turn: int, r: int, salt: int) -> torch.Tensor:
    return torch.tensor(
        [_policy_rand(int(s_), turn, r, salt) for s_ in seeds],
        dtype=torch.float64, device=sim.device,
    )



def _seat_units(sim, seat: int):
    """(slot_map, present, tiles, types, charges) for ANY seat — seat 0 reads
    its own pool directly (identity rows over p_*); seats k >= 1 gather
    through seat_slot_map."""
    if seat >= 1:
        smap = sim.seat_slot_map(seat - 1)
        sc = smap.clamp(min=0)
        return (smap, smap >= 0,
                sim.civ_unit_tile.gather(1, sc), sim.civ_unit_type.gather(1, sc), sim.civ_unit_charges.gather(1, sc))
    B, N = sim.seat0_unit_tile.shape
    smap = torch.arange(N, device=sim.device).unsqueeze(0).expand(B, N)
    return smap, sim.seat0_unit_alive, sim.seat0_unit_tile, sim.seat0_unit_type, sim.seat0_unit_charges


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
            if seat >= 1:
                break  # compacted slot-map rows are contiguous
            continue  # raw p-pool rows have HOLES (a dead slot before a live one)
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
    # seat 0 has no religion-founding plane, so the spread verb is
    # structurally empty for it.
    if seat == 0:
        return out
    done = sim.civ_only_religion_done[:, seat - 1]
    if not bool(done.any()):
        return out
    g = seat
    T = sim.T
    acc = torch.zeros(B, T, dtype=torch.long, device=sim.device)
    acc.scatter_add_(1, sim.site.clamp(min=0), (sim.alive & (sim.city_followed[:, 0, :sim.C] != g)).long())
    if sim.R > 0:
        acc.scatter_add_(
            1, sim.civ_city_center.clamp(min=0).reshape(B, -1),
            (sim.civ_city_alive & (sim.city_followed[:, 1:1 + sim.R, :sim.RC] != g)).long().reshape(B, -1),
        )
    tm = acc > 0
    if not bool(tm.any()):
        return out
    arangeT = torch.arange(T, device=sim.device)
    for n in range(N):
        pres = present[:, n]
        if not bool(pres.any()):
            if seat >= 1:
                break  # compacted slot-map rows are contiguous
            continue  # raw p-pool rows have HOLES (the _builder_jobs twin)
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
    ride the seat's slot layout (_seat_units): raw p-pool slots for seat 0
    (step()'s _apply_unit_actions indexing), the compacted slot map for seats
    >= 1 (the phase executor's indexing).

    The BUILDER verb: a civilian with charges standing ON its job takes the
    job column — REPAIR first (the scripted order), else the lowest legal
    BUILD column. The MASK is the legality body; the best-GAIN ranking within
    multi-option bare tiles is a RECORDED RESIDUAL (lowest column for now).
    Rows not on their job get walked there by the caller's rank planner
    (seats >= 1) or re-planned next turn (seat 0, single-rank like the
    scripted walker's own single-step gait).
    """
    um = sim.unit_action_mask() if seat == 0 else sim.seat_unit_mask(seat - 1)
    uo = sim.unit_obs() if seat == 0 else sim.seat_unit_obs(seat - 1)
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
    influence fork; the pool router below is the only seat-shaped line. Zero
    draws. Returns [B, K] CS indices (-1 pad) or None."""
    if sim.S <= 0:
        return None
    if seat == 0:
        avail_e = sim.envoys_avail.clone()
        met_live_e = sim.citystate_met[:, : sim.S] & sim.citystate_alive[:, : sim.S]
        mine6_e = sim.citystate_envoys[:, : sim.S].double() / 6.0
    else:
        avail_e = sim.civ_only_envoys_avail[:, seat - 1].clone()
        met_live_e = sim.civ_only_citystate_met[:, seat - 1, : sim.S] & sim.citystate_alive[:, : sim.S]
        mine6_e = sim.civ_only_citystate_envoys[:, seat - 1, : sim.S].double() / 6.0
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
    """The DoW policy's inputs, read from the OBSERVATION's ctx block —
    env._ctx_block renders the scripted war-declaration site's own formulas
    (strengths, closest city pair, the warmonger-gang term, aggression), so
    the policy consumes only what a client observation carries."""
    ctx = blocks["ctx"]
    return {
        "has_cities": ctx[:, 12] > 0.5,
        "peace_turns": ctx[:, 10].long(),
        "prox": ctx[:, 7].long(),
        "civ_only_str": ctx[:, 6],
        "p_str": ctx[:, 5],
        "gang": ctx[:, 8] > 0.5,
        "aggression": ctx[:, 9],
    }


def _buy_ctx(sim, r: int) -> dict:
    """The purchase candidates, read from the engines' ONE legality bodies
    (sim._seat_buy_candidates for the building, kind 0;
    sim._seat_buy_unit_candidates for the unit, kind 2 — both the scripted
    gold rungs' own scans). settler_ok mirrors the settler rung's own gate
    (city cap + price, no reserve). The unit quota compares decide-time
    planes: live + queued military < 2x alive cities."""
    active = sim.civ_only_alive[:, r] & (sim.civ_city_alive[:, r].sum(dim=1) > 0)
    jj, bb, can_b, price, _ = sim._seat_buy_candidates(r, active)
    rr = sim.rules.seats
    n_cities = sim.civ_city_alive[:, r].sum(dim=1)
    _sq = (sim.civ_city_alive[:, r] & (sim.civ_city_current[:, r] == 0)).sum(dim=1)
    sett_cost = (rr.get("settlerBase", 48) + rr.get("settlerPer", 18)
                 * (n_cities - 1 + sim._civ_only_settlers_of(r) + _sq).clamp(min=0).double()) * sim.rules.gold_purchase_mult
    # the buy SPAWNS a unit at the capital (else first city), which must have
    # the pop to pay — the TS driver's tripwire mirrors this exactly.
    _cap_is = sim.civ_city_is_cap[:, r]
    _spawn_slot = torch.where(_cap_is.any(dim=1), _cap_is.long().argmax(dim=1), sim.civ_city_alive[:, r].long().argmax(dim=1))
    _spawn_pop = sim.civ_city_pop[:, r].gather(1, _spawn_slot.unsqueeze(1)).squeeze(1)
    settler_ok = active & (_spawn_pop >= 2) & sim._afford(sim.civ_only_treasury[:, r], sett_cost)
    cand_u = sim._seat_buy_unit_candidates(r, sim._seat_trainable_units(r))
    vt_all = sim.civ_unit_type.clamp(min=0, max=sim.NU - 1)
    mil_live = sim.civ_unit_alive & (sim.civ_unit_civ == r) & (sim._type_combat[vt_all] > 0)
    qcur = sim.civ_city_current[:, r]
    q_ty = (qcur - 1).clamp(min=0, max=sim.NU - 1)
    q_mil = (qcur >= 1) & (qcur <= sim.NU) & (sim._type_combat[q_ty] > 0)
    n_mil = mil_live.sum(dim=1) + q_mil.sum(dim=1)
    unit_ok = active & (n_mil < 2 * n_cities) & cand_u.any(dim=1)
    # kind 3, the TILE candidate — first slot in order with a border
    # candidate, best border key, ABORT on unaffordable (the engines' one
    # legality body _seat_tile_buy_candidate).
    tile_j, tile_t, _tile_cost, tile_ok = sim._seat_tile_buy_candidate(r, active)
    # kinds 4-6, the FAITH candidates (worship / missionary / apostle), each
    # with its first-eligible slot from the shared body.
    w_ok, w_j, m_ok, m_j, a_ok, a_j = sim._seat_faith_buy_candidates(r, active)
    # kind 7, the LEVY candidate — the RULE half from the shared body; AT-WAR
    # is the policy gate and it joins HERE (the scripted block's own
    # condition), not in the engines' re-validation.
    levy_ok, levy_cs = sim._seat_levy_candidate(r, active)
    levy_ok = levy_ok & sim.civ_only_atwar[:, r]
    return {"jj": jj, "bb": bb, "can_building": can_b, "price": price,
            "settler_ok": settler_ok, "unit_ok": unit_ok,
            "tile_ok": tile_ok, "tile": tile_t, "tile_j": tile_j,
            "worship_ok": w_ok, "worship_j": w_j,
            "missionary_ok": m_ok, "missionary_j": m_j,
            "apostle_ok": a_ok, "apostle_j": a_j,
            "levy_ok": levy_ok, "levy_cs": levy_cs}


def _geo_turn(sim):
    """The GEOPOLITICS decisions for the WHOLE turn — the three scans
    (denounce, then alliance, then the civ↔civ declarations, plus the peace
    pairs), computed ONCE per turn because the declare scan couples civs
    (one new war per civ per turn, both sides). Zero-draw and
    deterministic; everything here is POLICY — proximity and strength
    thresholds, the gang bypass, war-weariness pacing, id-order scanning —
    and the engine arms re-validate only the RULES. Returns (denounce
    [B,R,R] bool, ally [B,R,R] bool from the lower index, civ_pair_war [B,R] long
    target, peace [B,R,R] bool from the lower index)."""
    B, R, dev = sim.B, sim.R, sim.device
    den = torch.zeros(B, R, R, dtype=torch.bool, device=dev)
    ally = torch.zeros_like(den)
    peace = torch.zeros_like(den)
    war = torch.full((B, R), -1, dtype=torch.long, device=dev)
    if R < 2:
        return den, ally, war, peace
    rr = sim.rules.seats
    n_c = sim.civ_city_alive.sum(dim=2)
    alive_civ = sim.civ_only_alive[:, :R] & (n_c > 0)  # [B, R]
    rstr = sim._civ_pair_strengths()
    prox_max = int(rr.get("dowProximity", 9))
    prox = {}
    for a in range(R):
        for b in range(R):
            if a != b:
                prox[a, b] = sim._civ_pair_proximity(a, b)
    # DENOUNCE: every eligible directed pair — a nearer, weaker-scoring civ
    # not yet at war (the declare family's gates at the WEAKER strength bar,
    # so the stamp reliably precedes the war).
    for a in range(R):
        for b in range(R):
            if a == b:
                continue
            den[:, a, b] = (
                alive_civ[:, a] & alive_civ[:, b]
                & (sim.civ_pair_denounced[:, a, b] < 0) & ~sim.civ_pair_war[:, a, b]
                & (prox[a, b] <= prox_max) & (rstr[:, a] > rstr[:, b])
            )
    # ALLIANCE (lower-index proposal): peace-era pairs with no grudge — the
    # stored stamps AND this turn's fresh denouncements — and no grievances.
    if int(sim.turn) >= sim._civ_pair_ally_min_peace:
        for a in range(R):
            for b in range(a + 1, R):
                ally[:, a, b] = (
                    alive_civ[:, a] & alive_civ[:, b]
                    & ~sim.civ_pair_war[:, a, b] & ~sim.civ_pair_allied[:, a, b]
                    & (sim.civ_pair_denounced[:, a, b] < 0) & (sim.civ_pair_denounced[:, b, a] < 0)
                    & ~den[:, a, b] & ~den[:, b, a]
                    & (sim.civ_only_warmonger[:, a] <= 0) & (sim.civ_only_warmonger[:, b] <= 0)
                )
    # DECLARE: aggressor index asc, first eligible target asc, ONE new war
    # per civ per turn (both sides); the gang bypass (a warmonger target
    # needs no strength edge); the target's anti-thrash war-weariness gate;
    # the alliance state as the arms will see it (fresh grudges break, fresh
    # alliances form, before the declare arm runs).
    ww = torch.stack([sim._ww_max(r + 1) for r in range(R)], dim=1)
    ratio = float(rr.get("dowStrengthRatio", 1.3))
    ww_cap = int(rr.get("dowWwMax", 6))
    peace_ww = int(rr.get("peaceWw", 10))
    allied_eff = sim.civ_pair_allied[:, :R, :R].clone()
    brk = den | den.transpose(1, 2)
    allied_eff = (allied_eff & ~brk) | ally | ally.transpose(1, 2)
    used = torch.zeros(B, R, dtype=torch.bool, device=dev)
    for a in range(R):
        aggr_ok = alive_civ[:, a] & (ww[:, a] < ww_cap) & ~used[:, a]
        if not bool(aggr_ok.any()):
            continue
        for b in range(R):
            if a == b:
                continue
            declare = (
                aggr_ok & alive_civ[:, b] & ~used[:, b]
                & ~sim.civ_pair_war[:, a, b] & (prox[a, b] <= prox_max)
                & ((rstr[:, a] > rstr[:, b] * ratio) | (sim.civ_only_warmonger[:, b] >= sim._wm_gang))
                & (ww[:, b] <= peace_ww)
                & ~allied_eff[:, a, b]
            )
            if bool(declare.any()):
                war[:, a] = torch.where(declare, torch.full_like(war[:, a], b), war[:, a])
                used[:, a] = used[:, a] | declare
                used[:, b] = used[:, b] | declare
                aggr_ok = aggr_ok & ~declare
    # PEACE (lower-index pair): a warring pair sues out once EITHER side's
    # war-weariness is past the threshold — read from the PRE-TURN state,
    # like the sue verb: a decision decides from its observation.
    for a in range(R):
        for b in range(a + 1, R):
            peace[:, a, b] = sim.civ_pair_war[:, a, b] & ((ww[:, a] > peace_ww) | (ww[:, b] > peace_ww))
    return den, ally, war, peace


def geo_decide_and_apply(sim):
    """Decide the turn's geopolitics once, stash every civ's intents on
    the sim (the engine arms consume them at their pass positions), and
    return the tensors for wire extraction (_extract_geo per seat row)."""
    den, ally, war, peace = _geo_turn(sim)
    for r in range(sim.R):
        sim.apply_geo(r, denounce=den[:, r], ally=ally[:, r], civ_pair_war=war[:, r], civ_pair_peace=peace[:, r])
    return den, ally, war, peace


def _extract_geo(geo, r: int, b: int) -> dict:
    """Civ r's geo record fields for batch row b — CIV-index targets, absent
    keys = no intent (the wire's optional-field convention)."""
    den, ally, war, peace = geo
    out = {}
    dl = den[b, r].nonzero(as_tuple=True)[0].tolist()
    if dl:
        out["denounce"] = dl
    al = ally[b, r].nonzero(as_tuple=True)[0].tolist()
    if al:
        out["ally"] = al
    if int(war[b, r]) >= 0:
        out["geoWar"] = int(war[b, r])
    pl = peace[b, r].nonzero(as_tuple=True)[0].tolist()
    if pl:
        out["geoPeace"] = pl
    return out


def decide_and_apply(env, sim, r: int, roster: dict, classes: dict, max_steps: int = 4) -> dict:
    """One turn's decisions for one driven seat, returned in the action-file
    schema so a replay can reproduce them exactly. B=1 callers only — the
    batched recorder extracts every row via `_extract_record`."""
    prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy = _decide_turn(env, sim, r, roster, classes, max_steps)
    return _extract_record(sim, r, prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy, 0)


def _decide_turn(env, sim, r: int, roster: dict, classes: dict, max_steps: int = 4, seeds=None, turn=None):
    """The BATCHED decision core — masks, ladder picks, the virtual planner,
    the draw-free applies and the useq stash. Returns the per-verb decision
    tensors; extraction is the caller's per-row problem."""
    # lite=True skips the purchase-column legality scan — the ladder has no
    # purchase class (`prod_classes` never names those columns), so the
    # driver never reads them. Same width, identical base + wonder/project
    # columns, purchases zeroed; contract asserted in pref_apply_test.
    m = sim.seat_masks(r, lite=True)
    blocks = _blocks(env, sim, r)
    prod = ladder.pick_production(m["production"], classes, roster, _prod_ctx(blocks, sim, r + 1))
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
            "dow": _policy_rng(sim, seeds, turn, r, 1),
            "peace": _policy_rng(sim, seeds, turn, r, 2),
        }
        war = ladder.pick_war(m["war"], _war_ctx(blocks), rng_w)
    env_seq = None
    if seeds is not None and turn is not None and sim.S > 0:
        env_seq = _seat_envoys(sim, r + 1)
    # the PURCHASE verbs — priority over the candidates from the engines' one
    # legality bodies; the engine stashes and consumes each intent at its own
    # phase sub-position, re-validating there. The gold buy is ONE kind per
    # turn (kind 3's a/b = tile, slot); the faith buys and the levy ride
    # beside it (separate currencies / the diplomacy action).
    bctx = _buy_ctx(sim, r)
    buy_kind = ladder.pick_purchase(bctx["can_building"], bctx["settler_ok"], bctx["unit_ok"], bctx["tile_ok"])
    buy_a = torch.where(buy_kind == 3, bctx["tile"], bctx["jj"])
    buy_b = torch.where(buy_kind == 3, bctx["tile_j"], bctx["bb"])
    buy = (buy_kind, buy_a, buy_b)
    worship_ok, relig_kind = ladder.pick_faith(bctx["worship_ok"], bctx["missionary_ok"], bctx["apostle_ok"])
    neg_w = torch.full_like(bctx["worship_j"], -1)
    worship = torch.where(worship_ok, bctx["worship_j"], neg_w)
    relig_j = torch.where(relig_kind == 5, bctx["missionary_j"],
                          torch.where(relig_kind == 6, bctx["apostle_j"], neg_w))
    relig = (relig_kind, relig_j)
    levy = torch.where(bctx["levy_ok"], bctx["levy_cs"], torch.full_like(bctx["levy_cs"], -1))
    sim.apply_seat_actions(r, production=prod, tech=tech, civic=civic, war=war, envoys=env_seq,
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
    orders0, job_t, spread_t, um, uo = _seat_unit_orders(sim, r + 1)
    B2, N2 = orders0.shape
    ranks = [orders0]
    smap = sim.seat_slot_map(r)
    cur = sim.civ_unit_tile.gather(1, smap.clamp(min=0))
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
        if wt is None or wt.get("r") != r:
            hp_r = sim.civ_only_atwar[:, r]
            ac = torch.full((B2,), r, dtype=torch.long, device=sim.device)
            tgts = torch.full((B2, N2), -1, dtype=torch.long, device=sim.device)
            for n in range(N2):
                if not bool((smap[:, n] >= 0).any()):
                    break
                tgt_n, hi, hpc, hrc = sim._war_march_target(sim.civ_unit_tile.gather(1, smap.clamp(min=0))[:, n].clamp(min=0), ac, hp_r)
                has = (hi | hpc | hrc)
                tgts[:, n] = torch.where(has, tgt_n, tgts[:, n])
            sim._vplan_wt = {"r": r, "tgts": tgts}
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
    sim._driven_useq[r] = seq
    return prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy


def _extract_record(sim, r: int, prod, tech, civic, war, env_seq, seq, buy, worship, relig, levy, b: int) -> dict:
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
    _ctr = sim.civ_city_center[b, r]
    _alive_c = sim.civ_city_alive[b, r]
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
    # the war-head column (0 = declare on seat 0, R = sue for peace), or
    # None. OPTIONAL field: a missing key reads as None.
    _w = None if war is None or int(war[b]) < 0 else int(war[b])
    # this row's envoy assignment sequence (CS indices), possibly empty.
    _e = [] if env_seq is None else [int(x) for x in env_seq[b].tolist() if int(x) >= 0]
    rec = {"production": prod_pairs, "tech": _t, "civic": _c, "war": _w, "envoys": _e, "units": rows}
    # the BUY intent, CENTRE-KEYED like production — [0, centreTile,
    # buildingIdx] for a building purchase. OPTIONAL field: absent = none.
    if buy is not None and int(buy[0][b]) == 0:
        _bj = int(buy[1][b])
        if 0 <= _bj < int(sim.civ_city_center.shape[2]) and bool(sim.civ_city_alive[b, r, _bj]):
            rec["buy"] = [0, int(sim.civ_city_center[b, r, _bj]), int(buy[2][b])]
    elif buy is not None and int(buy[0][b]) == 1:
        rec["buy"] = [1, -1, -1]  # SETTLER: no city key, the site scan decides
    elif buy is not None and int(buy[0][b]) == 2:
        rec["buy"] = [2, -1, -1]  # UNIT: the strongest-affordable scan decides
    elif buy is not None and int(buy[0][b]) == 3:
        # TILE: [3, tileIndex, centreTile] — the city keyed by CENTRE like
        # kind 0 (a/b at decide time are tile, slot).
        _tj = int(buy[2][b])
        if 0 <= _tj < int(sim.civ_city_center.shape[2]) and bool(sim.civ_city_alive[b, r, _tj]):
            rec["buy"] = [3, int(buy[1][b]), int(sim.civ_city_center[b, r, _tj])]
    # kinds 4-6, the FAITH purchases — [kind, centreTile] entries in apply
    # order (worship first, then the one religious unit). OPTIONAL field:
    # absent = no faith purchase this turn.
    bf = []
    if worship is not None:
        _wj = int(worship[b])
        if 0 <= _wj < int(sim.civ_city_center.shape[2]) and bool(sim.civ_city_alive[b, r, _wj]):
            bf.append([4, int(sim.civ_city_center[b, r, _wj])])
    if relig is not None and int(relig[0][b]) in (5, 6):
        _rj = int(relig[1][b])
        if 0 <= _rj < int(sim.civ_city_center.shape[2]) and bool(sim.civ_city_alive[b, r, _rj]):
            bf.append([int(relig[0][b]), int(sim.civ_city_center[b, r, _rj])])
    if bf:
        rec["buyFaith"] = bf
    # kind 7, the LEVY — the CS index (the shared CS vocabulary, like the
    # envoy sequence). OPTIONAL field: absent = no levy this turn.
    if levy is not None and int(levy[b]) >= 0:
        rec["levy"] = int(levy[b])
    return rec


def replay_seat(sim, r: int, rec: dict) -> None:
    """Apply ONE recorded turn for seat `r` without consulting the ladder.

    This is the half of the interface the TS engine has to implement. It must
    touch no policy at all — if a replay needs to ask the ladder anything, the
    file is not a complete record of the decisions and TS could never reproduce
    the run from it.
    """
    dev = sim.device
    # [centreTile, col] pairs -> per-slot columns via THIS sim's centres.
    prod = torch.full((sim.B, sim.RC), -1, dtype=torch.long, device=dev)
    for centre, col in rec["production"]:
        hit = (sim.civ_city_center[:, r] == int(centre)) & sim.civ_city_alive[:, r]
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
        for j in range(int(sim.civ_city_center.shape[2])):
            m = (sim.civ_city_center[:, r, j] == int(_bv[1])) & sim.civ_city_alive[:, r, j]
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
        for j in range(int(sim.civ_city_center.shape[2])):
            m3 = (sim.civ_city_center[:, r, j] == int(_bv[2])) & sim.civ_city_alive[:, r, j]
            hitj = torch.where(m3, torch.full_like(hitj, j), hitj)
        kind3 = torch.where(hitj >= 0, torch.full_like(hitj, 3), torch.full_like(hitj, -1))
        buy = (kind3, torch.full((sim.B,), int(_bv[1]), dtype=torch.long, device=dev), hitj)

    def _centre_slot(centre: int) -> torch.Tensor:
        hj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(int(sim.civ_city_center.shape[2])):
            mm = (sim.civ_city_center[:, r, j] == centre) & sim.civ_city_alive[:, r, j]
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
    sim.apply_seat_actions(r, production=prod, tech=tech, civic=civic, war=war, envoys=env_seq,
                           buy=buy, worship=worship, relig=relig, levy=levy)
    # the GEOPOLITICS intents (civ-index targets) stash for the phase's own
    # pass positions.
    def _geo_mask(idxs) -> torch.Tensor:
        m = torch.zeros(sim.B, sim.R, dtype=torch.bool, device=dev)
        for j in idxs:
            if 0 <= int(j) < sim.R:
                m[:, int(j)] = True
        return m

    geo_kwargs = {}
    if rec.get("denounce"):
        geo_kwargs["denounce"] = _geo_mask(rec["denounce"])
    if rec.get("ally"):
        geo_kwargs["ally"] = _geo_mask(rec["ally"])
    if rec.get("geoWar") is not None:
        geo_kwargs["civ_pair_war"] = torch.full((sim.B,), int(rec["geoWar"]), dtype=torch.long, device=dev)
    if rec.get("geoPeace"):
        geo_kwargs["civ_pair_peace"] = _geo_mask(rec["geoPeace"])
    if geo_kwargs:
        sim.apply_geo(r, **geo_kwargs)
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
        sim._driven_useq[r] = torch.stack(ranks, dim=2)


def replay(env, log: list, seats=None) -> None:
    """Re-run a recorded game from the action file alone. No ladder, no picker."""
    sim = env.sim
    seats = list(range(sim.R)) if seats is None else list(seats)
    for r in seats:
        take_seat(sim, r)
    for turn_rec in log:
        for r in seats:
            key = f"r{r}"
            if key in turn_rec:
                replay_seat(sim, r, turn_rec[key])
        sim.step()


def drive(env, turns: int, seats=None, record: Path | None = None) -> list:
    """Run `turns` turns with `seats` (default: every civ) driven by the ladder.

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
    seats = list(range(sim.R)) if seats is None else list(seats)
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((Path(__file__).resolve().parent.parent / "seeder" / "worlds" / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for r in seats:
        take_seat(sim, r)
    logs = [[] for _ in range(B)]
    # the policy stream keys on the GAME seed — the caller passes them
    # (BatchEnv keeps no fixture list). Absent -> per-row index fallback,
    # deterministic but seed-blind; the recording surfaces always pass them.
    game_seeds = list(seeds) if seeds is not None else list(range(B))
    for t in range(turns):
        per_seat = {r: _decide_turn(env, sim, r, roster, classes, seeds=game_seeds, turn=t) for r in seats}
        for b in range(B):
            turn_rec = {"turn": t}
            for r in seats:
                turn_rec[f"r{r}"] = _extract_record(sim, r, *per_seat[r], b)
            logs[b].append(turn_rec)
        sim.step()
    return logs
