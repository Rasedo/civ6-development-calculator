"""GV-5 bankruptcy self-test: the GPU _bankrupt_disband() must mirror the TS
rule (tests/bankruptcy.test.ts) — an insolvent treasury disbands ONE player
unit per turn, the priciest (tie -> lowest slot = oldest, matching TS's lowest
id). Inert at the gate (play stays gold-positive by t100), so this poke hand-
sets the unit roster + treasury and asserts the disband.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/bankruptcy_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def setup(sim, types, tiles, treasury):
    """Wipe the player roster and plant a known set at slots 0.. (spawn order)."""
    sim.p_alive[0, :] = False
    sim.pmil_at[0, :] = -1
    sim.pciv_at[0, :] = -1
    for i, (ty, ti) in enumerate(zip(types, tiles)):
        sim.p_alive[0, i] = True
        sim.p_type[0, i] = ty
        sim.p_tile[0, i] = ti
        sim.pmil_at[0, ti] = i
    sim.treasury[0] = treasury


def main() -> int:
    rules = load_rules()
    # #78: was hard-coded to seed9079.json, which a SEED_OVERRIDES entry
    # replaced (the corrected combat strengths wipe 9079's player before t250).
    # Resolve by POSITION — this lane only needs "some fixture" — so a future
    # override cannot break it again. Same fix as domination_test.
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        return 1
    path = paths[6] if len(paths) > 6 else paths[0]
    ru = rules.units

    def uidx(name):
        return next(i for i, u in enumerate(ru) if u["id"] == name)

    H, S, W = uidx("HORSEMAN"), uidx("SPEARMAN"), uidx("WARRIOR")
    assert ru[H]["maintenance"] == 2 and ru[S]["maintenance"] == 1 and ru[W]["maintenance"] == 0, \
        "test assumes HORSEMAN=2 / SPEARMAN=1 / WARRIOR=0 upkeep"

    # 1. Priciest + tie -> lowest slot: two HORSEMEN (slots 0,2) + a SPEARMAN;
    #    slot 0 (oldest horseman) goes, and ONLY one this turn.
    sim = build(rules, path)
    setup(sim, [H, S, H], [100, 101, 102], -4.0)
    sim._bankrupt_disband()
    assert not bool(sim.p_alive[0, 0]), "slot 0 (priciest, oldest) should disband"
    assert bool(sim.p_alive[0, 1]) and bool(sim.p_alive[0, 2]), "exactly one per turn"
    assert int(sim.pmil_at[0, 100]) == -1, "disbanded unit's occupancy cleared"

    # 2. Solvent -> nothing disbands.
    sim = build(rules, path)
    setup(sim, [H, S], [100, 101], 50.0)
    sim._bankrupt_disband()
    assert bool(sim.p_alive[0, 0]) and bool(sim.p_alive[0, 1]), "solvent keeps all"

    # 3. Only free units, deep in the red -> nothing disbands (0-upkeep is never a victim).
    sim = build(rules, path)
    setup(sim, [W, W], [100, 101], -50.0)
    sim._bankrupt_disband()
    assert bool(sim.p_alive[0, 0]) and bool(sim.p_alive[0, 1]), "0-upkeep units are kept"

    print("bankruptcy OK — priciest/tie-lowest-slot/solvent/free all match TS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
