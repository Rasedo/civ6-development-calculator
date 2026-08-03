"""#70: THE LADDER DRIVES. One policy module decides for a seat; the engine only
applies what it is told.

This is the seam the whole #51 mandate exists to create. Before it, a rival's
decisions were made INSIDE the engine by `_rival_phase`, a transcription of
`rivals.ts` — two copies of one policy, drifting apart in ways no gate could see
(see #85's stale unit ladder, #86's optimistic districts). Here the engine hands
out an OBSERVATION and a set of legality MASKS, `gpu/ladder.py` returns ACTIONS,
and the engine applies them. Nothing about policy remains on the engine side of
that line.

WHAT DRIVING A SEAT MEANS, concretely:
  * `controlled[:, r] = True` makes the scripted picker skip rival r entirely —
    research auto-pick, the production ladder and the unit AI all stand down.
  * every turn, for each driven seat: read masks + observation, call the ladder,
    write the actions back through the ordinary apply paths.

The apply paths are the ones the earlier slices built and proved:
`apply_rival_actions` for production/tech/civic (with #87's preference order when
one is supplied) and `apply_rival_unit_sequence` for movement (#90's direction
sequence, so a driven unit walks its real MP instead of crawling one tile a
turn).

UNITS ARE RE-OBSERVED PER STEP. `rival_unit_obs` is 1-HOP — it carries each
neighbour's distance to home and nothing further — so the ladder cannot see where
its own second step would land. Rather than let it guess a path, the driver loops
while units still have movement, re-observing each time. A net that wants to
commit several steps at once can fill the sequence directly; the action space
supports both and this driver takes the honest option.
"""
from __future__ import annotations

import json
from pathlib import Path

import torch

import ladder


def _prod_ctx(blocks: dict, sim, r: int) -> dict:
    """#95 S1(a): the per-seat counters no mask can express (#84), read from
    the OBSERVATION's ctx block (ladder.CTX_FIELDS) instead of peeking at
    sim tensors — the values are the scripted sites' own, rendered by
    env._ctx_block, so a TS client rendering the same observation feeds the
    ladder identically. city_cap stays rules-side: static data is not
    state."""
    ctx = blocks["ctx"]
    emp = blocks["empire"]
    B = ctx.shape[0]
    # is_capital must be MASK-ALIGNED (rival_masks' city axis is SLOT order),
    # and the obs city block went LIVING-ORDER with catch 6 — the two axes
    # differ once a city dies. Until the serve obs dict carries a per-city
    # identity (centre tile) to re-map with, this one flag reads the
    # slot-ordered plane directly; the wire itself stays centre-keyed (the
    # record schema), so nothing TS-facing leaks.
    is_cap = sim.rc_is_cap[:, r]
    n_cities = ctx[:, 0].long()
    return {
        "settler_queued": emp[:, 6] > 0.5,  # raw queued-settler count
        "is_capital": is_cap,  # #88: the wonder tier's capital heuristic (city col 9)
        "melee": ctx[:, 2].long(),
        "ranged": ctx[:, 3].long(),
        "unit_count": ctx[:, 1].long(),
        "unit_cap": ctx[:, 4].long(),
        "n_cities": n_cities,
        "city_cap": torch.full_like(n_cities, int(sim.rules.rivals.get("maxCities", 6))),
    }


def take_seat(sim, r: int) -> None:
    """Hand rival `r` to the ladder for the rest of the run."""
    sim.controlled[:, r] = True


def _blocks(env, sim, r: int) -> dict:
    """The rival's OBSERVATION, sliced into the blocks the ladder reads.

    Goes through `env.observe(seat)` and `ladder.split` rather than reaching into
    engine tensors — the observation is the seat's whole view of the world, and
    a policy that peeks past it is not a policy that a net could replace.
    """
    obs = env.observe(r + 1)  # env._seat_rival's inverse: seat k>0 is rival k-1
    # tech/civic widths come off the live tensors — there is no NT/NC scalar,
    # and hardcoding one here would be the second copy that always drifts.
    return ladder.split(obs, sim.S, sim.R, sim.C, sim.r_techs.shape[2], sim.r_civics.shape[2])


#: ACTION FILE SCHEMA v1 (#70, "THE FILE IS THE INTERFACE").
#:
#: Both engines will parse this forever, so it records DECISIONS, never derived
#: state: a replay must be able to reproduce the run without re-deriving
#: anything the policy knew. Per turn, per driven seat:
#:     {"turn": t, "seats": {"<r>": {
#:         "production": [C]        per-city column, -1 = nothing
#:         "tech": [B] | None       column, -1 = no pick
#:         "civic": [B] | None
#:         "units": [[N], ...]      one entry per unit STEP this turn, because
#:                                  #90 lets a unit act several times and the
#:                                  driver re-observes between steps
#:     }}}
#: Codes are the MASK layouts (`rival_masks`, `rival_unit_mask`), which are the
#: player head layouts — so the same file can drive either seat, which is the
#: whole point of #51.
#: v2 (#70 signature A): the CITY AXIS is keyed by CENTRE TILE, not index.
#: The recorder read cities by GPU slot; TS applies by founding-order array
#: position; the two diverge exactly when compaction or capture reorders
#: slots — the probe-hygiene rule ("match cities by centre, never slot")
#: applied to the file format itself. `production` is now [[centreTile, col],
#: ...] pairs, one per city that acts. The UNITS axis stays positional: the
#: engines deliberately mirror unit order (TS splices captured units to the
#: END because the GPU appends; deaths drop identically from both).
SCHEMA_VERSION = 2


_M32 = 0xFFFFFFFF


def _policy_rand(seed: int, turn: int, r: int, salt: int) -> float:
    """#93: ONE mulberry32 draw from the DRIVER's policy stream, keyed on
    (game seed, turn, rival, salt). Deterministic — the same engine always
    re-records the same file — and fully separate from the engines' shared
    rule stream, whose draw-count parity must not move when a policy is
    ported out."""
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


def _builder_jobs(sim, r: int) -> torch.Tensor:
    """#93 slice 7b: [B, N] job tile per slot row (-1 = none) for CIVILIAN
    rows with charges — the NEAREST _rival_job_mask tile, ties to the LOWEST
    tile index (the scripted walk's own key). One legality body: the job
    predicate is the engine's, never re-derived."""
    smap = sim.rival_slot_map(r)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if not sim.improvements_on:
        return out
    jobs = sim._rival_job_mask(r)  # [B, T]
    if not bool(jobs.any()):
        return out
    arangeT = torch.arange(sim.T, device=sim.device)
    for n in range(N):
        sl = smap[:, n]
        pres = sl >= 0
        if not bool(pres.any()):
            break
        vt = sim.v_type.gather(1, sl.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=sim.NU - 1)
        civ_row = (sim._p_charges[vt] > 0) & (sim.v_charges.gather(1, sl.clamp(min=0).unsqueeze(1)).squeeze(1) > 0)
        rows = pres & civ_row
        if not bool(rows.any()):
            continue
        here = sim.v_tile.gather(1, sl.clamp(min=0).unsqueeze(1)).squeeze(1)
        d = sim.pair_dist[here.clamp(min=0)].to(torch.long)  # [B, T]
        key = torch.where(jobs, d * sim.T + arangeT, torch.full_like(d, 2 ** 30))
        best = key.argmin(dim=1)
        has = rows & jobs.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _spread_targets(sim, r: int) -> torch.Tensor:
    """#93 slice 8: [B, N] spread-target CENTRE per slot row (-1 = none) for
    religious rows with charges — the NEAREST alive centre of ANY civ whose
    followed religion != g, ties lowest tile (the walker's own
    dist·(T+1)+centerIndex key)."""
    smap = sim.rival_slot_map(r)
    B, N = smap.shape
    out = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
    if not bool(sim.r_religion_done[:, r].any()):
        return out
    g = r + 1
    T = sim.T
    acc = torch.zeros(B, T, dtype=torch.long, device=sim.device)
    acc.scatter_add_(1, sim.site.clamp(min=0), (sim.alive & (sim.city_followed != g)).long())
    if sim.R > 0:
        acc.scatter_add_(
            1, sim.rc_center.clamp(min=0).reshape(B, -1),
            (sim.rc_alive & (sim.rc_followed != g)).long().reshape(B, -1),
        )
    tm = acc > 0
    if not bool(tm.any()):
        return out
    arangeT = torch.arange(T, device=sim.device)
    for n in range(N):
        sl = smap[:, n]
        pres = sl >= 0
        if not bool(pres.any()):
            break
        vt = sim.v_type.gather(1, sl.clamp(min=0).unsqueeze(1)).squeeze(1).clamp(min=0, max=sim.NU - 1)
        relig = torch.zeros_like(pres)
        if sim._missionary_idx >= 0:
            relig = relig | (vt == sim._missionary_idx)
        if getattr(sim, "_apostle_idx", -1) >= 0:
            relig = relig | (vt == sim._apostle_idx)
        rows = pres & relig & (sim.v_charges.gather(1, sl.clamp(min=0).unsqueeze(1)).squeeze(1) > 0) & sim.r_religion_done[:, r]
        if not bool(rows.any()):
            continue
        here = sim.v_tile.gather(1, sl.clamp(min=0).unsqueeze(1)).squeeze(1)
        d = sim.pair_dist[here.clamp(min=0)].to(torch.long)
        key = torch.where(tm, d * (T + 1) + arangeT, torch.full_like(d, 2 ** 40))
        best = key.argmin(dim=1)
        has = rows & tm.gather(1, best.unsqueeze(1)).squeeze(1)
        out[:, n] = torch.where(has, best, out[:, n])
    return out


def _war_ctx(blocks: dict) -> dict:
    """#93/#95 S1(a): the DoW policy's inputs, read from the OBSERVATION's
    ctx block — env._ctx_block renders the scripted war-declaration site's
    own formulas (strengths, closest city pair, the B-22 gang term,
    aggression), so the policy consumes only what a client observation
    carries."""
    ctx = blocks["ctx"]
    return {
        "has_cities": ctx[:, 12] > 0.5,
        "peace_turns": ctx[:, 10].long(),
        "prox": ctx[:, 7].long(),
        "r_str": ctx[:, 6],
        "p_str": ctx[:, 5],
        "gang": ctx[:, 8] > 0.5,
        "aggression": ctx[:, 9],
    }


def _buy_ctx(sim, r: int) -> dict:
    """A-5r: the purchase candidates, read from the engines' ONE legality
    body (sim._rival_buy_candidates — the scripted gold block's own scan,
    extracted in 732eb6a). v1 stages the BUILDING branch onto the wire;
    the settler/unit branches stay scripted on BOTH sides (symmetric,
    gate-safe) until their candidate halves are extracted the same way."""
    active = sim.r_alive[:, r] & (sim.rc_alive[:, r].sum(dim=1) > 0)
    jj, bb, can_b, price, _ = sim._rival_buy_candidates(r, active)
    z = torch.zeros_like(can_b)
    return {"jj": jj, "bb": bb, "can_building": can_b, "price": price,
            "settler_ok": z, "unit_ok": z}


def decide_and_apply(env, sim, r: int, roster: dict, classes: dict, max_steps: int = 4) -> dict:
    """One turn's decisions for one driven seat, returned in the action-file
    schema so a replay can reproduce them exactly. B=1 callers only — the
    batched recorder extracts every row via `_extract_record`."""
    prod, tech, civic, war, env_seq, seq, buy = _decide_turn(env, sim, r, roster, classes, max_steps)
    return _extract_record(sim, r, prod, tech, civic, war, env_seq, seq, buy, 0)


def _decide_turn(env, sim, r: int, roster: dict, classes: dict, max_steps: int = 4, seeds=None, turn=None):
    """#94: the BATCHED decision core — masks, ladder picks, the virtual
    planner, the draw-free applies and the useq stash, exactly as
    decide_and_apply always ran them. Returns (prod, tech, civic, seq)
    tensors; extraction is the caller's per-row problem."""
    # lite=True skips the purchase-column legality scan — the ladder has no
    # purchase class (`prod_classes` never names those columns), so the
    # driver never reads them. Same width, identical base + wonder/project
    # columns, purchases zeroed; contract asserted in pref_apply_test.
    m = sim.rival_masks(r, lite=True)
    blocks = _blocks(env, sim, r)
    prod = ladder.pick_production(m["production"], classes, roster, _prod_ctx(blocks, sim, r))
    tech = ladder.pick_research(blocks, m["tech"], "tech") if bool(m["tech"].any()) else None
    civic = ladder.pick_research(blocks, m["civic"], "civic") if bool(m["civic"].any()) else None
    # #93 the WAR verb: the ladder decides from the driver's own policy
    # stream; declare/peace apply PRE-STEP through the existing war head —
    # the same position the replay uses, so recorder and replayer share one
    # within-turn ordering (a declare turns THIS turn's walkers hostile on
    # both engines). Without seeds/turn (a raw B=1 decide_and_apply caller)
    # the verb stands down — the recording surfaces always pass them.
    war = None
    if seeds is not None and turn is not None:
        rng_w = {
            "dow": _policy_rng(sim, seeds, turn, r, 1),
            "peace": _policy_rng(sim, seeds, turn, r, 2),
        }
        war = ladder.pick_war(m["war"], _war_ctx(blocks), rng_w)
    # #93 the ENVOY verb: simulate the scripted greedy sequence — spend the
    # BANK first (quest-granted envoys), then conversions while influence
    # affords — re-ranking neediest after every pick exactly as the two
    # while-loops did. Zero draws; pick_envoy is the round-8 ported policy.
    env_seq = None
    if seeds is not None and turn is not None and sim.S > 0:
        cost_e = float(sim.rules.cs.get("envoyCost", 100))
        infl_e = sim.r_influence[:, r].clone()
        avail_e = sim.r_envoys_avail[:, r].clone()
        met_live_e = sim.cs_r_met[:, r, : sim.S] & sim.cs_alive[:, : sim.S]
        mine6_e = sim.cs_r_envoys[:, r, : sim.S].double() / 6.0
        picks_e = []
        for _ke in range(6):  # bank (<=2 quest grants) + the conversion run
            can_e = met_live_e.any(dim=1) & ((avail_e > 0) | (infl_e >= cost_e))
            if not bool(can_e.any()):
                break
            blk_e = {"cs": torch.stack([met_live_e.double(), mine6_e, torch.zeros_like(mine6_e)], dim=2)}
            p_e = ladder.pick_envoy(blk_e, met_live_e)
            p_e = torch.where(can_e, p_e, torch.full_like(p_e, -1))
            if not bool((p_e >= 0).any()):
                break
            picks_e.append(p_e)
            hit_e = p_e >= 0
            bank_e = hit_e & (avail_e > 0)
            avail_e = torch.where(bank_e, avail_e - 1, avail_e)
            infl_e = torch.where(hit_e & ~bank_e, infl_e - cost_e, infl_e)
            mine6_e = mine6_e + torch.nn.functional.one_hot(p_e.clamp(min=0), sim.S).double() * hit_e.unsqueeze(1).double() / 6.0
        env_seq = torch.stack(picks_e, dim=1) if picks_e else None  # [B, K]
    # A-5r piece 3b: the PURCHASE verb — priority over the candidates from
    # the engines' one legality body; the engine stashes and consumes at
    # the gold block's own position, re-validating there.
    bctx = _buy_ctx(sim, r)
    buy_kind = ladder.pick_purchase(bctx["can_building"], bctx["settler_ok"], bctx["unit_ok"])
    buy = (buy_kind, bctx["jj"], bctx["bb"])
    sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic, war=war, envoys=env_seq, buy=buy)

    # units (#70 rng-order): the driver PLANS, the PHASE executes. Applying
    # steps pre-step to re-observe consumed combat draws at a different stream
    # position than TS's in-phase replay — same totals, different rolls per
    # battle (proven by the t38/t39 six-number probe). Rank 0 comes from the
    # real observation; later ranks are planned VIRTUALLY for MOVE rows only,
    # chaining pair_dist toward the unit's own war target (or home) with the
    # march's own key (d*8+dir) and NO state mutation. Non-move verbs end the
    # turn at rank 0, exactly like the scripted walkers. The phase executes the
    # stash at the walkers' position and RE-VALIDATES every rank (#90's
    # contract: an illegal later step refuses, never substitutes).
    um = sim.rival_unit_mask(r)
    uo = sim.rival_unit_obs(r)
    orders0 = ladder.pick_unit_orders(um, uo)
    # #93 slice 7b: the BUILDER verb. A civilian with charges standing ON its
    # job takes the job column — REPAIR first (the scripted order), else the
    # lowest legal BUILD column. The MASK is the legality body (#89); the
    # best-GAIN ranking within multi-option bare tiles is a RECORDED RESIDUAL
    # (lowest column for now — the builder spy tightens it like production's
    # 45%->99.4% arc). Rows not on their job get walked there by the planner.
    job_t = _builder_jobs(sim, r)
    spread_t = _spread_targets(sim, r)
    smap0 = sim.rival_slot_map(r)
    here0 = sim.v_tile.gather(1, smap0.clamp(min=0))
    on_job = (job_t >= 0) & (here0 == job_t) & (smap0 >= 0)
    # #93 slice 8: religious rows within 1 of their target SPREAD (HERE when
    # standing on it — own cities — else the direction of the centre).
    A_SP = getattr(sim, "_A_SPREAD", -1)
    if A_SP >= 0 and bool((spread_t >= 0).any()):
        here_sp = sim.v_tile.gather(1, smap0.clamp(min=0))
        d_sp = sim.pair_dist[here_sp.clamp(min=0), spread_t.clamp(min=0)].to(torch.long)
        close = (spread_t >= 0) & (smap0 >= 0) & (d_sp <= 1)
        if bool(close.any()):
            nbr = sim.neigh[here_sp.clamp(min=0)]  # [B, N, 6]
            dir_hit = (nbr == spread_t.unsqueeze(2)) & (nbr >= 0)
            dcol = torch.where(
                here_sp == spread_t,
                torch.zeros_like(spread_t),
                dir_hit.float().argmax(dim=2) + 1,
            )
            valid_dir = (here_sp == spread_t) | dir_hit.any(dim=2)
            take_sp = close & valid_dir
            orders0 = torch.where(take_sp, A_SP + dcol, orders0)
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
    B2, N2 = orders0.shape
    ranks = [orders0]
    cur = uo[:, :, 0].long() * 0  # placeholder; real tiles below
    smap = sim.rival_slot_map(r)
    cur = sim.v_tile.gather(1, smap.clamp(min=0))
    # per-row destination: the war target when at war, else the nearest own
    # centre (the same two rules the ladder's own branches follow)
    at_war_rows = uo[:, :, ladder.U_ATWAR] > 0
    d_home0 = uo[:, :, ladder.U_DHOME]
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
            hp_r = sim.r_atwar[:, r]
            ac = torch.full((B2,), r, dtype=torch.long, device=sim.device)
            tgts = torch.full((B2, N2), -1, dtype=torch.long, device=sim.device)
            for n in range(N2):
                if not bool((smap[:, n] >= 0).any()):
                    break
                tgt_n, hi, hpc, hrc = sim._war_march_target(sim.v_tile.gather(1, smap.clamp(min=0))[:, n].clamp(min=0), ac, hp_r)
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
            # #93 slice 7b: a civilian's JOB is a walk destination like a war
            # target — real-MP multi-rank, re-planned each turn.
            dest = torch.where((dest < 0) & (job_t[:, n] >= 0), job_t[:, n], dest)
            # #93 slice 8: a religious unit's SPREAD target likewise.
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
    return prod, tech, civic, war, env_seq, seq, buy


def _extract_record(sim, r: int, prod, tech, civic, war, env_seq, seq, buy, b: int) -> dict:
    """One batch row's record, in the action-file schema.

    Per-row equivalences with the old B=1 writer:
    - tech/civic: the old writer emitted None when the whole-batch mask was
      empty; per-row, a -1 pick (this game had nothing legal) is the same
      fact and records as None.
    - units: ranks are trimmed of TRAILING all-hold rows (the B=1 planner
      stopped exactly there — `if not (nxt >= 0).any(): pop; break` — so a
      per-row trim reproduces what a solo recording of this game would have
      written; a unit's own ranks are monotone, orders never follow a -1).
    """
    # v2: production as [centreTile, col] PAIRS (see SCHEMA_VERSION); the
    # centre is the cross-engine city key.
    _pr = prod[b]
    _ctr = sim.rc_center[b, r]
    _alive_c = sim.rc_alive[b, r]
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
    # #93: the war-head column (0 = declare on the player, R = sue for
    # peace), or None. OPTIONAL field on schema v2 — readers that predate it
    # treat a missing key as None, so old files stay replayable.
    _w = None if war is None or int(war[b]) < 0 else int(war[b])
    # #93: this row's envoy assignment sequence (CS indices), possibly empty.
    _e = [] if env_seq is None else [int(x) for x in env_seq[b].tolist() if int(x) >= 0]
    rec = {"production": prod_pairs, "tech": _t, "civic": _c, "war": _w, "envoys": _e, "units": rows}
    # A-5r: the BUY intent, CENTRE-KEYED like production (v2 lesson) —
    # [0, centreTile, buildingIdx] for a building purchase; absent = none.
    # OPTIONAL field: readers that predate it ignore the key.
    if buy is not None and int(buy[0][b]) == 0:
        _bj = int(buy[1][b])
        if 0 <= _bj < int(sim.rc_center.shape[2]) and bool(sim.rc_alive[b, r, _bj]):
            rec["buy"] = [0, int(sim.rc_center[b, r, _bj]), int(buy[2][b])]
    return rec


def replay_seat(sim, r: int, rec: dict) -> None:
    """Apply ONE recorded turn for seat `r` without consulting the ladder.

    This is the half of the interface the TS engine has to implement. It must
    touch no policy at all — if a replay needs to ask the ladder anything, the
    file is not a complete record of the decisions and TS could never reproduce
    the run from it.
    """
    dev = sim.device
    # v2: [centreTile, col] pairs -> per-slot columns via THIS sim's centres.
    prod = torch.full((sim.B, sim.RC), -1, dtype=torch.long, device=dev)
    for centre, col in rec["production"]:
        hit = (sim.rc_center[:, r] == int(centre)) & sim.rc_alive[:, r]
        prod = torch.where(hit, torch.full_like(prod, int(col)), prod)
    tech = None if rec["tech"] is None else torch.tensor(rec["tech"], dtype=torch.long, device=dev)
    civic = None if rec["civic"] is None else torch.tensor(rec["civic"], dtype=torch.long, device=dev)
    _wv = rec.get("war")
    war = None if _wv is None else torch.full((sim.B,), int(_wv), dtype=torch.long, device=dev)
    _ev = rec.get("envoys") or []
    env_seq = torch.tensor(_ev, dtype=torch.long, device=dev).reshape(1, -1).expand(sim.B, -1) if _ev else None
    # A-5r: parse the CENTRE-KEYED buy intent back to tensors (the v2 city
    # resolution — match by centre + alive, never by slot).
    _bv = rec.get("buy")
    buy = None
    if _bv is not None and int(_bv[0]) == 0:
        hitj = torch.full((sim.B,), -1, dtype=torch.long, device=dev)
        for j in range(int(sim.rc_center.shape[2])):
            m = (sim.rc_center[:, r, j] == int(_bv[1])) & sim.rc_alive[:, r, j]
            hitj = torch.where(m, torch.full_like(hitj, j), hitj)
        kind0 = torch.where(hitj >= 0, torch.zeros_like(hitj), torch.full_like(hitj, -1))
        buy = (kind0, hitj, torch.full((sim.B,), int(_bv[2]), dtype=torch.long, device=dev))
    sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic, war=war, envoys=env_seq, buy=buy)
    # #70 rng-order: replay stashes exactly as the driver does; the PHASE
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
    """Run `turns` turns with `seats` (default: every rival) driven by the ladder.

    THE FILE IS THE INTERFACE: when `record` is given the chosen actions are
    written out, which is what will let the TS engine replay the identical
    decisions instead of keeping its own copy of the policy.
    """
    assert env.sim.B == 1, "drive() is the B=1 surface; batches record via drive_batched()"
    log = drive_batched(env, turns, seats)[0]
    if record is not None:
        record.write_text(json.dumps(log), encoding="utf-8")
    return log


def drive_batched(env, turns: int, seats=None, seeds=None) -> list:
    """#94: record EVERY batch row in one run — returns one log per row.

    The old gate ran 12 seeds as 12 serial B=1 runs; the engine's per-call
    python dispatch (83% of a step, #81) was paid twelve times for identical
    tensor work. The decision path is batched end to end, so one B=12 run
    produces the same twelve records for one run's dispatch cost. Row
    independence is the parity gate's own premise (replay_batched stacks
    per-seed records positionally), and the B=1-vs-B=12 identity of a
    recording is asserted by the drive lane.
    """
    sim = env.sim
    B = sim.B
    seats = list(range(sim.R)) if seats is None else list(seats)
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold), sim._wond_n if sim.districts_on else 0, len(sim._proj_rows) if sim.districts_on else 0)
    rj = json.loads((Path(__file__).resolve().parent / "fixtures" / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for r in seats:
        take_seat(sim, r)
    logs = [[] for _ in range(B)]
    # #93: the policy stream keys on the GAME seed — the caller passes them
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


def replay_batched(env, seeds: list, actions: dict, turns: int) -> None:
    """Replay a per-seed action file across a BATCHED sim.

    `gpu/drive_gate.py` records each seed at B=1 because the driver observes one
    game at a time, but the parity gate runs all seeds as one batch. So the
    per-seed records are STACKED into the [B, ...] tensors the apply paths take.

    Seeds keep their fixture order — `seeds[b]` is batch row b — because every
    comparison downstream is positional. Getting that wrong would misattribute
    one seed's decisions to another and show up as a diffuse parity failure with
    no single cause, which is the worst kind to diagnose.

    Turns a seed does not cover (a shorter recording) are left to -1, i.e. no
    instruction, rather than silently repeating the last action.
    """
    sim = env.sim
    B = sim.B
    assert len(seeds) == B, f"{len(seeds)} seeds for a batch of {B}"
    for r in range(sim.R):
        take_seat(sim, r)
    for t in range(turns):
        apply_turn(sim, seeds, actions, t)
        sim.step()


def apply_turn(sim, seeds: list, actions: dict, t: int) -> None:
    """Apply ONE recorded turn across the batch, WITHOUT stepping.

    Split out so the parity gate can drive its own loop: parity must apply the
    turn, step, and then read the trace row, and a helper that stepped for it
    would put the comparison a turn out of phase.
    """
    B = sim.B
    if True:
        for r in range(sim.R):
            recs = [actions.get(str(seeds[b]), {}).get(str(t), {}).get(str(r)) for b in range(B)]
            if not any(recs):
                continue
            C = sim.RC
            prod = torch.full((B, C), -1, dtype=torch.long, device=sim.device)
            tech = torch.full((B,), -1, dtype=torch.long, device=sim.device)
            civic = torch.full((B,), -1, dtype=torch.long, device=sim.device)
            war_b = torch.full((B,), -1, dtype=torch.long, device=sim.device)  # #93
            env_b = torch.full((B, 6), -1, dtype=torch.long, device=sim.device)  # #93 envoys
            n_steps = 0
            for b, rec in enumerate(recs):
                if not rec:
                    continue
                # v2: centre-keyed pairs resolve against THIS batch row's centres
                for centre, col in rec["production"]:
                    hits = (sim.rc_center[b, r] == int(centre)) & sim.rc_alive[b, r]
                    if bool(hits.any()):
                        prod[b, int(hits.nonzero(as_tuple=True)[0][0])] = int(col)
                if rec.get("tech") is not None:
                    tech[b] = int(rec["tech"][0] if isinstance(rec["tech"], list) else rec["tech"])
                if rec.get("civic") is not None:
                    civic[b] = int(rec["civic"][0] if isinstance(rec["civic"], list) else rec["civic"])
                if rec.get("war") is not None:
                    war_b[b] = int(rec["war"])
                for _ki, _cs in enumerate((rec.get("envoys") or [])[:6]):
                    env_b[b, _ki] = int(_cs)
                n_steps = max(n_steps, len(rec.get("units", [])))
            sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic, war=war_b, envoys=env_b)
            # #70 rng-order: unit acts DRAW, so they cannot run pre-step — the
            # phase consumes them at the walkers' own position (the engine's
            # _driven_useq hook). Production/tech/civic writes above are
            # draw-free and stay here. Stack every recorded step into one
            # [B, N, K] tensor; the phase walks ranks in order.
            N = sim.rival_slot_map(r).shape[1]
            K = max(1, n_steps)
            seq = torch.full((B, N, K), -1, dtype=torch.long, device=sim.device)
            for b, rec in enumerate(recs):
                if not rec:
                    continue
                us = rec.get("units", [])
                for k in range(min(len(us), K)):
                    row = us[k][0] if (us[k] and isinstance(us[k][0], list)) else us[k]
                    seq[b, : min(len(row), N), k] = torch.tensor(row[:N], dtype=torch.long, device=sim.device)
            if not hasattr(sim, "_driven_useq") or sim._driven_useq is None:
                sim._driven_useq = {}
            sim._driven_useq[r] = seq
