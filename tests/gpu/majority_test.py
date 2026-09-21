"""A city's MAJORITY religion — the GPU twin of `followersOf` / `followedReligionOf`,
pinned on the live-game rows of lab 2 scene E (followers are pop × pressure share by
largest remainder; the majority is the group with the most followers, ties by
pressure, at least half the citizens; the unconverted winning = none). The rows pass
the UNCONVERTED pressure the game reported (an accumulator the live game keeps —
300 at pop 2 after a shrink — where this engine derives 50 × pop).

    python tests/gpu/majority_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402

CATH, PROT, BUD = 0, 1, 2


def main() -> None:
    rules = load_rules()
    sim = BatchSim([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64)
    assert int(sim._atheism_per_pop) == 50

    def T(x, dtype=torch.long):
        return torch.tensor([x], dtype=dtype)

    def followers(pres, pop, none=None):
        f, _ = sim._followers_of(T(pres), T(pop), None if none is None else T(none))
        return f[0].tolist()

    def majority(pres, pop, none=None):
        return int(sim._followed_religion(T(pres), T(pop), None if none is None else T(none))[0])

    # followers — the largest-remainder allocation
    assert followers([212, 641, 940], 9, 400) == [1, 2, 4, 2], followers([212, 641, 940], 9, 400)
    assert followers([220], 6, 300) == [3, 3]
    assert followers([359, 710], 3, 300) == [1, 1, 1]
    assert followers([100], 2) == [1, 1], "100 vs the engine's 100: the remainder tie goes to the lower id"
    assert followers([100], 0) == [0, 0]
    print("  1 followers OK — NGAZARGAMU 1/2/4/2, STAVANGER 3/3 and 1/1/1")

    # the majority
    assert majority([212, 641, 940], 9, 400) == -1, "BUD leads on both counts and fails the half-gate"
    assert majority([220], 6, 300) == -1, "a 3-3 tie with the unconverted goes to their pressure"
    assert majority([0, 880], 2, 300) == PROT
    assert majority([359, 710], 3, 300) == -1, "the pressure winner is a religion, yet 2 x 1 < 3"
    assert majority([579, 532], 2, 0) == CATH
    assert majority([434, 752], 2, 0) == PROT, "the decider: the tie goes to the higher pressure, not the lower id"
    assert majority([0, 0, 300], 1) == BUD
    assert majority([300], 0) == -1
    assert majority([100], 2) == CATH and majority([90], 2) == -1, "1-1 against the engine's 100: pressure, then the lower id"
    print("  2 majority OK — the measured rows, the decider included")

    # a batch of rows answers each row on its own, and through a leading city axis
    pres = torch.tensor([[212, 641, 940], [0, 880, 0], [434, 752, 0]], dtype=torch.long)
    pop = torch.tensor([9, 2, 2], dtype=torch.long)
    none = torch.tensor([400, 300, 0], dtype=torch.long)
    assert sim._followed_religion(pres, pop, none).tolist() == [-1, PROT, PROT]
    assert sim._followed_religion(pres.unsqueeze(0), pop.unsqueeze(0), none.unsqueeze(0)).tolist() == [[-1, PROT, PROT]]
    assert sim._followed_religion(pres, pop).tolist() == [-1, PROT, PROT], "the engine's own unconverted term agrees on these rows"
    print("  3 batched shapes OK")
    print("BATTERY OK majority")


if __name__ == "__main__":
    main()
