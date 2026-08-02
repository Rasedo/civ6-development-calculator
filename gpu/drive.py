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


def _prod_ctx(sim, r: int) -> dict:
    """The per-seat counters no mask can express (#84), computed exactly as the
    engine's own picker computes them so the ladder sees what it saw."""
    n_cities = sim.rc_alive[:, r].sum(dim=1)
    qcur = sim.rc_current[:, r]
    n_live = (sim.v_alive & (sim.v_civ == r)).sum(dim=1)
    n_units = n_live + ((qcur >= 1) & (qcur <= sim.NU)).sum(dim=1)
    cap = n_cities * 2 + torch.where(sim.r_atwar[:, r], 3, 1)
    vt = sim.v_type.clamp(min=0, max=sim.NU - 1)
    rng_t = sim._p_rng_str > 0
    mil = sim.v_alive & (sim.v_civ == r) & (sim._p_combat[vt] > 0)
    n_rng = (mil & rng_t[vt]).sum(dim=1)
    n_mel = (mil & ~rng_t[vt]).sum(dim=1)
    q_ty = (qcur - 1).clamp(min=0, max=sim.NU - 1)
    q_mil = (qcur >= 1) & (qcur <= sim.NU) & (sim._p_combat[q_ty] > 0)
    n_rng = n_rng + (q_mil & rng_t[q_ty]).sum(dim=1)
    n_mel = n_mel + (q_mil & ~rng_t[q_ty]).sum(dim=1)
    return {
        "settler_queued": (qcur == 0).any(dim=1),
        "melee": n_mel,
        "ranged": n_rng,
        "unit_count": n_units,
        "unit_cap": cap,
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


def decide_and_apply(env, sim, r: int, roster: dict, classes: dict, max_steps: int = 4) -> dict:
    """One turn's decisions for one driven seat, returned in the action-file
    schema so a replay can reproduce them exactly."""
    m = sim.rival_masks(r)
    blocks = _blocks(env, sim, r)
    prod = ladder.pick_production(m["production"], classes, roster, _prod_ctx(sim, r))
    tech = ladder.pick_research(blocks, m["tech"], "tech") if bool(m["tech"].any()) else None
    civic = ladder.pick_research(blocks, m["civic"], "civic") if bool(m["civic"].any()) else None
    sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic)

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
    steps = [rk.tolist() for rk in ranks]
    # v2: production as [centreTile, col] PAIRS (see SCHEMA_VERSION). Recorded
    # at B=1; the centre is the cross-engine city key.
    _pr = prod[0] if prod.shape[0] == 1 else prod[0]
    _ctr = sim.rc_center[0, r]
    _alive_c = sim.rc_alive[0, r]
    prod_pairs = [
        [int(_ctr[j]), int(_pr[j])]
        for j in range(min(int(_pr.shape[0]), int(_ctr.shape[0])))
        if int(_pr[j]) >= 0 and bool(_alive_c[j])
    ]
    return {
        "production": prod_pairs,
        "tech": None if tech is None else (int(tech[0]) if tech.shape[0] == 1 else tech.tolist()),
        "civic": None if civic is None else (int(civic[0]) if civic.shape[0] == 1 else civic.tolist()),
        "units": [st[0] if (st and isinstance(st[0], list) and len(st) == 1) else st for st in steps],
    }


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
    sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic)
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
    sim = env.sim
    seats = list(range(sim.R)) if seats is None else list(seats)
    NB = sim.rules_dev.b_cost.shape[0]
    classes = ladder.prod_classes(NB, sim.NU, len(sim._scaffold))
    rj = json.loads((Path(__file__).resolve().parent / "fixtures" / "rules.json").read_text(encoding="utf-8"))
    roster = ladder.unit_roster(rj["units"])
    for r in seats:
        take_seat(sim, r)
    log = []
    for t in range(turns):
        turn_rec = {"turn": t}
        for r in seats:
            turn_rec[f"r{r}"] = decide_and_apply(env, sim, r, roster, classes)
        sim.step()
        log.append(turn_rec)
    if record is not None:
        record.write_text(json.dumps(log), encoding="utf-8")
    return log


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
                n_steps = max(n_steps, len(rec.get("units", [])))
            sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic)
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
