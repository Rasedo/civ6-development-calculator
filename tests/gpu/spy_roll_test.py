"""THE SPY MISSION ROLL — the GPU half (tests/cpu/espionage/mission-roll.test.ts
is the TS twin).

    python tests/gpu/spy_roll_test.py

C-16, measured in the live game on 2026-09-13: every mission is ONE 3d6 roll
R against T = BaseProbability - k, six bands by margin, and the UI's tables
are floor(p x 256)/256 of those bands. This lane pins `_mission_outcome` and
`_mission_threshold` against the two tables the lab wrote down.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def table(sim, t: int) -> list[int]:
    counts = [0] * 6
    for a in range(1, 7):
        for b in range(1, 7):
            for c in range(1, 7):
                counts[sim._mission_outcome(a + b + c, t)] += 1
    assert sum(counts) == 216
    return [(n * 256) // 216 for n in counts]


def main() -> None:
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64))
    assert (sim._spy_roll_dice, sim._spy_roll_faces, sim._spy_roll_level_base) == (3, 6, 2)
    t = 11
    want = [sim.M_SUCCESS_UNDETECTED, sim.M_SUCCESS_MUST_ESCAPE, sim.M_SUCCESS_MUST_ESCAPE,
            sim.M_FAIL_UNDETECTED, sim.M_FAIL_MUST_ESCAPE, sim.M_FAIL_MUST_ESCAPE,
            sim.M_CAPTURED, sim.M_CAPTURED, sim.M_KILLED]
    got = [sim._mission_outcome(r, t) for r in (t + 2, t + 1, t, t - 1, t - 2, t - 3, t - 4, t - 5, t - 6)]
    assert got == want, f"the margin ranks the bands {want}, got {got}"
    # a fresh Recruit reads k = 2: base 13 (Siphon Funds) is 66/61/32/54/29/11 of 256
    assert sim._mission_threshold(sim._spy_m_siphon, 0) == 11
    assert table(sim, 11) == [66, 61, 32, 54, 29, 11], table(sim, 11)
    # ... and base 16 (Recruit Partisans) is 11/29/24/61/61/66
    assert sim._mission_threshold(sim._spy_m_partisans, 0) == 14
    assert table(sim, 14) == [11, 29, 24, 61, 61, 66], table(sim, 14)
    # Gain Sources' +2 levels read k = 4
    assert sim._mission_threshold(sim._spy_m_siphon, sim._spy_sources_levels) == 9
    # the roll draws exactly SPY_ROLL_DICE times from the game's own stream
    before = int(sim.rng_state[0])
    r = sim._mission_roll(0)
    assert 3 <= r <= 18
    one = torch.zeros(sim.B, dtype=torch.bool)
    one[0] = True
    sim.rng_state[0] = before
    again = sum(int(sim._next_random(one)[0] * 6) + 1 for _ in range(3))
    assert again == r, f"the roll is not three floor(r x 6) + 1 draws in order ({r} vs {again})"
    print("  SPY ROLL OK — 3d6 vs base - (2 + level), the two published tables reproduced")


if __name__ == "__main__":
    main()
