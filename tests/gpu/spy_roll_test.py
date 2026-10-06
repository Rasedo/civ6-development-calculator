"""THE SPY MISSION ROLL — the GPU half (tests/cpu/espionage/mission-roll.test.ts
is the TS twin).

    python tests/gpu/spy_roll_test.py

Measured in the live game and read in the DLL ("Rolling Espionage Result"
0x52b2a0, the bands 0x52b8f0): every mission is ONE weighted draw over six
bands of 3d6 by margin against T = BaseProbability - k, and the UI's tables
are floor(p x 256)/256 of those bands. This lane pins `_mission_weights`,
`_mission_draw` and `_mission_threshold` against the two tables the lab wrote
down.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def table(sim, t: int) -> list[int]:
    """the game's published table for threshold t, outcome order (success
    undetected first): each band's share of 216 scaled floor(p x 256)"""
    w = sim._mission_weights(t)
    assert sum(w) == 216
    return [(n * 256) // 216 for n in reversed(w)]


def main() -> None:
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64))
    assert (sim._spy_roll_dice, sim._spy_roll_faces, sim._spy_roll_level_base) == (3, 6, 2)
    assert sim._dice_counts == [0, 0, 0, 1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1]
    # t = 11: killed 3..5, captured 6..7, fail-escape 8..9, fail-undetected
    # 10, success-escape 11..12, success-undetected 13..18 (0x52b8f0)
    assert sim._mission_weights(11) == [10, 25, 46, 27, 52, 56], sim._mission_weights(11)
    # each band held to its window: none certain, none impossible
    assert sim._mission_weights(40)[5] == 1 and sim._mission_weights(-20)[0] == 1
    # a fresh Recruit reads k = 2: base 13 (Siphon Funds) is 66/61/32/54/29/11 of 256
    assert sim._mission_threshold(sim._spy_m_siphon, 0) == 11
    assert table(sim, 11) == [66, 61, 32, 54, 29, 11], table(sim, 11)
    # ... and base 16 (Recruit Partisans) is 11/29/24/61/61/66
    assert sim._mission_threshold(sim._spy_m_partisans, 0) == 14
    assert table(sim, 14) == [11, 29, 24, 61, 61, 66], table(sim, 14)
    # Gain Sources' +2 levels read k = 4
    assert sim._mission_threshold(sim._spy_m_siphon, sim._spy_sources_levels) == 9
    # the roll is ONE weighted draw over the bands' counts, killed first
    for seed in (1, 77, 4242, 99991):
        sim.rng_state[0] = seed
        out = sim._mission_draw(0, 11)
        s1 = (seed * 1103515245 + 12345) & 0xFFFFFFFF
        assert int(sim.rng_state[0]) == s1, "one draw"
        v = ((s1 >> 16) * 216) >> 16
        acc, band = 0, -1
        for i, w in enumerate(sim._mission_weights(11)):
            acc += w
            if v < acc:
                band = i
                break
        assert out == 5 - band, (seed, out, band)
    # an escape: killed, caught, away by v (0x52b090)
    assert sim._escape_weights(10) == [35, 46, 135] and sim._escape_weights(21) == [216, 0, 0]
    print("  SPY ROLL OK — one weighted draw over the 3d6 bands, the two published tables reproduced")


if __name__ == "__main__":
    main()
