"""A peace treaty BINDS — the declare column stays shut for its whole term.

    python tests/gpu/peace_treaty_test.py

CIV 6: once peace is made neither side may declare on the other again for ten
turns. The pair clock `treaty_turns` carries it; this lane asserts all three
places it has to be honoured — the MASK must not offer the column, the APPLY
must refuse it if a policy takes it anyway, and the seat tail must count it
down exactly once per pair per turn.

The scripted gate never runs a seat back to war on an opponent it just settled
with, so the whole rule is poke-covered.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def war_column(sim, row: int, k: int) -> torch.Tensor:
    """A [B] verb vector holding column `k` for game 0 and nothing elsewhere."""
    w = torch.full((sim.B,), -1, dtype=torch.long)
    w[0] = k
    return w


def main() -> None:
    sim = build()
    assert sim.n_majors >= 2, "the treaty is a PAIR fact — this fixture has one major"
    row, tgt = 0, 1
    k = sim.war_targets(row).index(tgt)
    n_tgt = len(sim.war_targets(row))   # the head is [declare per target, sue per target]
    term = int(sim.rules.seats["peaceTreatyTurns"])
    active = torch.zeros(sim.B, dtype=torch.bool)
    active[0] = True

    # A war old enough to settle, and a treasury that can pay for it.
    sim.war[0, row, tgt] = sim.war[0, tgt, row] = True
    sim.sync_war()
    sim.war_turns[0, row, tgt] = sim.war_turns[0, tgt, row] = int(sim.rules.seats["warMinTurns"]) + 5
    sim.civ_treasury[0, row] = 5000.0

    sim._apply_war_column(row, war_column(sim, row, n_tgt + k))  # SUE for peace
    assert not bool(sim.war[0, row, tgt]), "the peace verb did not end the war — the scene is inert"
    assert int(sim.treaty_turns[0, row, tgt]) == term, (
        f"peace left treaty_turns at {int(sim.treaty_turns[0, row, tgt])}, expected {term}")
    assert int(sim.treaty_turns[0, tgt, row]) == term, "the treaty matrix is not symmetric"
    print(f"  peace stamps a {term}-turn treaty on both cells")

    # (1) the MASK must not offer the declare column...
    assert not bool(sim._seat_war_mask(row)[0, k]), "the mask offers a declare the treaty forbids"
    assert not bool(sim._seat_war_mask(tgt)[0, sim.war_targets(tgt).index(row)]), \
        "the mask offers the BOUND side a declare"
    # (2) ...and the apply must refuse it even when a policy takes it anyway.
    sim._apply_war_column(row, war_column(sim, row, k))
    assert not bool(sim.war[0, row, tgt]), "a bound seat declared war — _apply_war_column ignored the treaty"
    print("  mask and apply both refuse the declare while it binds")

    # (3) ONE countdown per pair per turn, at the pair's LOWER row's tail.
    sim._seat_war_peace_tail(tgt, active)  # the HIGHER row must not touch it
    assert int(sim.treaty_turns[0, row, tgt]) == term, "the higher row ticked a pair it does not own"
    for i in range(term):
        sim._seat_war_peace_tail(row, active)
        left = int(sim.treaty_turns[0, row, tgt])
        assert left == term - i - 1, f"tick {i + 1}: treaty_turns is {left}, expected {term - i - 1}"
        assert int(sim.treaty_turns[0, tgt, row]) == left, "the countdown broke the matrix's symmetry"
    sim._seat_war_peace_tail(row, active)
    assert int(sim.treaty_turns[0, row, tgt]) == 0, "the countdown ran past zero"
    print(f"  the term counts down once per turn at the lower row and floors at 0")

    # ...and the column comes back, so every assertion above is about the treaty.
    assert bool(sim._seat_war_mask(row)[0, k]), "the mask never reopened — the scene proves nothing"
    sim._apply_war_column(row, war_column(sim, row, k))
    assert bool(sim.war[0, row, tgt]), "the declare did not land once the treaty expired"
    print("  the declare lands again the turn it expires")

    print("PEACE TREATY OK — mask, apply and countdown all honour the term")


if __name__ == "__main__":
    main()
