"""A RELEASED SPY IS THE SPY THAT WAS CAUGHT (C-16) — the GPU half.

    python tests/gpu/spy_release_level_test.py

The TS twin lives in tests/cpu/seats/deals.test.ts ("a captured spy goes
home at the level it was caught at").

CIV6: a captured spy is "imprisoned, but not killed", and a DEAL_SPY trade
returns it "immediately ... to the original owner's Capital". No source
publishes the level it returns at; the best reading (STYLIZED, owner ruling
2026-09-04) is that the SAME spy comes home, so the cell holds levels —
`seat_spy_held [B, pw, pw, level]` counts by level — and the released spy is
spawned at the level it was caught at. When one captor holds several, the
HIGHEST goes first: the real deal names a spy, this model ranks them.

  1. a cell holding a level-1 and a level-3 spy: the first trade brings the
     level-3 spy home, the cell keeps the level-1 one.
  2. the second trade brings the level-1 spy home and empties the cell.
  3. the count readers still see the cell as a COUNT (capacity, the deal's
     legality), and the compare renders the levels descending.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from core.statecompare import _spy_held_count, _spy_held_levels
from geopolitics_test import controlled_pair, deal, clear_pairs


def released(sim, owner: int, captor: int) -> int:
    """trade one spy back; returns the merged slot it came home in."""
    slot = int(sim.unit_next[0]) + sim.POOL_LO["major"]
    before = int(sim._spies_of(owner).sum())
    deal(sim, captor, owner, [[sim._deal_k_spy, 0, 0]], [[sim._deal_k_gold, 100, 0]])
    assert int(sim._spies_of(owner).sum()) == before + 1, "no spy came home"
    assert int(sim.unit_type[0, slot]) == sim._spy_idx, "the unit that came home is not a spy"
    return slot


def main() -> int:
    sim, _ja, _jb = controlled_pair(load_rules(), fixture_paths()[0], extra_for_a=False)
    a, b = 1, 2
    clear_pairs(sim)
    sim.civ_treasury[:] = 1000.0
    assert sim.seat_spy_held.shape[3] == sim._spy_max_level + 1, "the cell has no level axis"
    sim.seat_spy_held[0, a, b, 1] = 1
    sim.seat_spy_held[0, a, b, 3] = 1
    assert int(sim._spies_held_of(a)) == 2, "the count reader does not sum the level buckets"
    assert _spy_held_count(sim, 0, [a]) == [[b, 2]], _spy_held_count(sim, 0, [a])
    assert _spy_held_levels(sim, 0, [a]) == [[b, 3, 1]], _spy_held_levels(sim, 0, [a])
    print("  0 the scene OK — a level-1 and a level-3 spy in the same cell")

    s1 = released(sim, a, b)
    assert int(sim.unit_spy_level[0, s1]) == 3, f"the first spy home is level {int(sim.unit_spy_level[0, s1])}, want 3"
    assert sim.seat_spy_held[0, a, b].tolist() == [0, 1, 0, 0], sim.seat_spy_held[0, a, b].tolist()
    print("  1 the first trade OK — the level-3 spy comes home, the level-1 one stays")

    sim.civ_treasury[:] = 1000.0
    s2 = released(sim, a, b)
    assert int(sim.unit_spy_level[0, s2]) == 1, f"the second spy home is level {int(sim.unit_spy_level[0, s2])}, want 1"
    assert int(sim.seat_spy_held[0, a, b].sum()) == 0, "the cell is not empty"
    assert int(sim._spies_held_of(a)) == 0
    print("  2 the second trade OK — the level-1 spy comes home, the cell is empty")
    print("BATTERY OK spy_release_level")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
