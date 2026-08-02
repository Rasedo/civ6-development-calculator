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
SCHEMA_VERSION = 1


def decide_and_apply(env, sim, r: int, roster: dict, classes: dict, max_steps: int = 4) -> dict:
    """One turn's decisions for one driven seat, returned in the action-file
    schema so a replay can reproduce them exactly."""
    m = sim.rival_masks(r)
    blocks = _blocks(env, sim, r)
    prod = ladder.pick_production(m["production"], classes, roster, _prod_ctx(sim, r))
    tech = ladder.pick_research(blocks, m["tech"], "tech") if bool(m["tech"].any()) else None
    civic = ladder.pick_research(blocks, m["civic"], "civic") if bool(m["civic"].any()) else None
    sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic)

    # units: re-observe per step, because the observation is 1-hop
    steps = []
    for _ in range(max_steps):
        um = sim.rival_unit_mask(r)
        if not bool(um.any()):
            break
        uo = sim.rival_unit_obs(r)
        orders = ladder.pick_unit_orders(um, uo)
        if not bool((orders >= 0).any()):
            break
        sim.apply_rival_unit_sequence(r, orders.unsqueeze(2))
        steps.append(orders.tolist())
        if not bool((sim.rival_unit_mask(r)[:, :, :6]).any()):
            break
    # schema v1 says FLAT per-city/per-step lists; the driver records at B=1
    # and tolist() keeps the batch dim, which cost one driven-parity red per
    # engine before the consumers unwrapped. Flatten at the SOURCE too so a
    # regenerated file is schema-true; consumers keep their defensive unwraps.
    return {
        "production": prod[0].tolist() if prod.shape[0] == 1 else prod.tolist(),
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
    prod = torch.tensor(rec["production"], dtype=torch.long, device=dev)
    tech = None if rec["tech"] is None else torch.tensor(rec["tech"], dtype=torch.long, device=dev)
    civic = None if rec["civic"] is None else torch.tensor(rec["civic"], dtype=torch.long, device=dev)
    sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic)
    for step in rec["units"]:
        orders = torch.tensor(step, dtype=torch.long, device=dev)
        sim.apply_rival_unit_sequence(r, orders.unsqueeze(2))


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
                pr = rec["production"]
                if pr and isinstance(pr[0], list):
                    pr = pr[0]  # the recorder ran at B=1: tolist() kept the batch dim
                prod[b, : min(len(pr), C)] = torch.tensor(pr[:C], dtype=torch.long, device=sim.device)
                if rec.get("tech") is not None:
                    tech[b] = int(rec["tech"][0] if isinstance(rec["tech"], list) else rec["tech"])
                if rec.get("civic") is not None:
                    civic[b] = int(rec["civic"][0] if isinstance(rec["civic"], list) else rec["civic"])
                n_steps = max(n_steps, len(rec.get("units", [])))
            sim.apply_rival_actions(r, production=prod, tech=tech, civic=civic)
            for k in range(n_steps):
                N = sim.rival_slot_map(r).shape[1]
                orders = torch.full((B, N), -1, dtype=torch.long, device=sim.device)
                for b, rec in enumerate(recs):
                    if not rec:
                        continue
                    us = rec.get("units", [])
                    if k < len(us):
                        row = us[k][0] if (us[k] and isinstance(us[k][0], list)) else us[k]
                        orders[b, : min(len(row), N)] = torch.tensor(row[:N], dtype=torch.long, device=sim.device)
                sim.apply_rival_unit_sequence(r, orders.unsqueeze(2))
