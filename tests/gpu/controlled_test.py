"""Controlled-civ self-test.

The `controlled [B, R]` mask hands a civ's DECISIONS to an external
writer while every mechanic keeps running: the scripted picker, research
auto-pick and unit AI must skip controlled civs; choices written
directly into civ_city_current / civ_only_cur_tech must persist, progress, and
complete through the ordinary machinery. Poked directly — no organic
controller drives a seat here.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    for _ in range(25):
        sim.step()

    r = 0
    assert bool(sim.civ_city_alive[0, r, 0]), "civ 0 capital must exist by t25"
    sim.controlled[0, r] = True

    # 1. research: clear the current pick; auto-pick must NOT refill it
    sim.civ_only_cur_tech[0, r] = -1
    prog0 = float(sim.civ_only_tech_prog[0, r])
    sim.step()
    assert int(sim.civ_only_cur_tech[0, r]) == -1, "auto-pick must skip a controlled civ"
    assert float(sim.civ_only_tech_prog[0, r]) >= prog0, "progress must still BANK while undecided (manual-mode mirror)"

    # 2. write a tech pick; the advance must honor it
    avail = sim._available_mask(sim.civ_only_techs[:, r], sim._prereq_t)[0]
    pick = int(avail.nonzero(as_tuple=True)[0][0])
    sim.civ_only_cur_tech[0, r] = pick
    sim.step()
    assert int(sim.civ_only_cur_tech[0, r]) == pick or bool(sim.civ_only_techs[0, r, pick]), "written tech pick must persist or complete"

    # 3. production: idle a city, confirm the picker leaves it idle
    j = 0
    sim.civ_city_current[0, r, j] = -1
    sim.civ_city_progress[0, r, j] = 0.0
    sim.civ_city_cost[0, r, j] = 0.0
    sim.step()
    assert int(sim.civ_city_current[0, r, j]) == -1, "picker must not queue for a controlled civ"

    # 4. write a WARRIOR queue item; the completion machinery must run it.
    #    Park the civ's OTHER cities idle first so the +1 isolates THIS
    #    written item — a controlled city keeps COMPLETING items queued while
    #    it was scripted, and the fixture holds near-done sibling unit queues
    #    (a global +1 would over-constrain the trajectory).
    w = sim._warrior_idx
    sim.civ_city_current[0, r, :] = -1
    sim.civ_only_treasury[0, r] = 0.0  # no gold unit/settler buy to inflate the count
    sim.civ_city_current[0, r, j] = sim.UNIT_BASE + w
    sim.civ_city_cost[0, r, j] = float(sim._type_cost[w])
    sim.civ_city_progress[0, r, j] = float(sim._type_cost[w]) - 0.5  # one turn from done
    units_before = int((sim.major_unit_alive[0] & ((sim.major_unit_seat[0] - 1) == r)).sum())
    sim.step()
    done = int(sim.civ_city_current[0, r, j]) == -1
    units_after = int((sim.major_unit_alive[0] & ((sim.major_unit_seat[0] - 1) == r)).sum())
    assert done and units_after == units_before + 1, "written queue item must complete and spawn through the ordinary machinery"

    # 5. the OTHER civ stays fully scripted (its queue keeps working)
    other = 1 if sim.R > 1 else 0
    if other != r:
        busy = int((sim.civ_city_current[0, other] >= 0).sum())
        assert busy > 0, "the scripted civ must keep queueing"

    # 6. mask-driven random control runs indefinitely and legally — every
    # sampled action comes from seat_masks and must be honored
    sim2 = BatchSim([load_fixture(paths[1])], rules, device="cpu", dtype=torch.float64)
    for _ in range(30):
        sim2.step()
    sim2.controlled[0, 0] = True
    g = torch.Generator().manual_seed(7)
    for _ in range(40):
        m = sim2.seat_masks(0)
        pa = torch.full((1, sim2.RC), -1, dtype=torch.long)
        for j in range(sim2.RC):
            row = m["production"][0, j]
            if row.any():
                opts = row.nonzero(as_tuple=True)[0]
                pa[0, j] = opts[torch.randint(len(opts), (1,), generator=g)]
        ta = torch.full((1,), -1, dtype=torch.long)
        if m["tech"][0].any():
            opts = m["tech"][0].nonzero(as_tuple=True)[0]
            ta[0] = opts[torch.randint(len(opts), (1,), generator=g)]
        ca = torch.full((1,), -1, dtype=torch.long)
        if m["civic"][0].any():
            opts = m["civic"][0].nonzero(as_tuple=True)[0]
            ca[0] = opts[torch.randint(len(opts), (1,), generator=g)]
        sim2.apply_seat_actions(0, production=pa, tech=ta, civic=ca)
        sim2._consume_driven_picks(0)
        sim2.step()
    assert bool(sim2.civ_city_alive[0, 0].any()), "controlled civ must survive random play"
    assert float(sim2.empire_score()[0]) > 0, "world must keep scoring"

    # --- the driver plane covers EVERY seat, seat 0 included ----------------
    # `seat_ext` is one column per seat — "who drives this seat" — so a net can
    # attach to seat 0 and the built-in AI stays selectable for a civ.
    # `controlled` is the civ slice of it.
    assert sim2.seat_ext.shape == (sim2.B, sim2.NS), (
        f"seat_ext must span the absolute seat space, got {tuple(sim2.seat_ext.shape)}"
    )
    assert sim2.controlled.data_ptr() == sim2.seat_ext[:, 1:].data_ptr(), (
        "controlled must be the CIV SLICE of seat_ext, not a second tensor"
    )
    sim2.seat_ext.zero_()                          # this sim already drives a civ
    sim2.seat_ext[0, 0] = True                     # seat 0 is externally driven
    assert not bool(sim2.controlled[0].any()), "seat 0 must not leak into the civ slice"
    sim2.seat_ext[0, 1] = True
    assert bool(sim2.controlled[0, 0]), "civ 0 IS seat_ext column 1"
    _snap = sim2.snapshot()
    sim2.seat_ext.zero_()
    sim2.restore(_snap)
    assert bool(sim2.seat_ext[0, 0]) and bool(sim2.seat_ext[0, 1]), (
        "the driver plane must round-trip through snapshot/restore"
    )
    sim2.seat_ext.zero_()
    print("  #51/S8.0 driver plane OK (seat 0 has a slot; controlled is its civ slice)")

    print("C2b CONTROLLED-CIV OK")


if __name__ == "__main__":
    main()
