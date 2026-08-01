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


def decide_and_apply(env, sim, r: int, roster: dict, classes: dict, max_steps: int = 4) -> dict:
    """One turn's decisions for one driven seat. Returns a small action record —
    the beginnings of the action FILE that will let TS replay the same choices.
    """
    m = sim.rival_masks(r)
    blocks = _blocks(env, sim, r)
    prod = ladder.pick_production(m["production"], classes, roster, _prod_ctx(sim, r))
    tech = ladder.pick_research(blocks, m["tech"], "tech") if bool(m["tech"].any()) else None
    civic = ladder.pick_research(blocks, m["civic"], "civic") if bool(m["civic"].any()) else None
    sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic)

    # units: re-observe per step, because the observation is 1-hop
    for _ in range(max_steps):
        um = sim.rival_unit_mask(r)
        if not bool(um.any()):
            break
        uo = sim.rival_unit_obs(r)
        orders = ladder.pick_unit_orders(um, uo)
        if not bool((orders >= 0).any()):
            break
        sim.apply_rival_unit_sequence(r, orders.unsqueeze(2))
        if not bool((sim.rival_unit_mask(r)[:, :, :6]).any()):
            break
    return {"production": prod.tolist()}


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
