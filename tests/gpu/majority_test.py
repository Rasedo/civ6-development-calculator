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
sys.path.insert(0, str(Path(__file__).resolve().parent))

from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from civ_abilities_test import play, place, UNITS  # noqa: E402 — the roster seating and a unit

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

    # ── THE SEAT'S MAJORITY (GetReligionInMajorityOfCities): more than half of
    # the cities, the majority-less ones in the denominator — ONE composer
    # (`_seat_majority_religion`) for the four readers below
    B0, M = 0, sim.n_majors
    assert sim.S > 0, "the fixture seats no city-state"
    s0 = 0
    sim.city_alive[B0, 0, :3] = True
    sim.city_followed[B0, 0, :3] = torch.tensor([1, 1, -1])
    assert int(sim._dominant_religion()[B0, 0]) == 1
    sim.city_followed[B0, 0, 1] = -1                       # an in-place write moves the memo's stamp
    assert int(sim._dominant_religion()[B0, 0]) == -1, "1 of 3 is not a majority"
    sim.city_followed[B0, 0, :3] = torch.tensor([1, 0, -1])
    assert int(sim._dominant_religion()[B0, 0]) == -1, "1-1-none"
    sim.city_followed[B0, 0, :3] = torch.tensor([1, 1, -1])
    sim.citystate_pop[B0, s0] = 3
    sim.city_pressure[B0, M + s0, 0, :] = 0
    sim.city_pressure[B0, M + s0, 0, 1] = 400              # 2 followers of 1, 1 unconverted
    assert int(sim._minor_followed()[B0, s0]) == 1
    seats = torch.tensor([[0, 1, 100 + s0, 200, 300, -1]])
    assert sim._seat_majority_religion(seats)[B0].tolist() == [1, -1, 1, -1, -1, -1], \
        sim._seat_majority_religion(seats)[B0].tolist()
    sim.city_pressure[B0, M + s0, 0, 1] = 100              # 100 vs the engine's 150: the unconverted
    assert int(sim._seat_majority_religion(torch.tensor([[100 + s0]]))[B0, 0]) == -1
    print("  4 seat majority OK — a major's cities, a minor's one city, nobody for the barbarians and the Free row")

    # El Escorial: +5 against a player of ANOTHER majority religion
    play(sim, 0, "SPAIN")
    W = UNITS.index("WARRIOR")
    tile = int((~sim.water[B0]).long().argmax())
    sim.city_followed[B0, 0, :3] = torch.tensor([0, 0, -1])
    sim.city_alive[B0, 1, :3] = True
    sim.city_followed[B0, 1, :3] = torch.tensor([1, 1, -1])
    sim.city_pressure[B0, M + s0, 0, 1] = 400

    def cs(foe):
        return int(sim._roster_cs(torch.tensor([[0]]), torch.tensor([[W]]), torch.tensor([[tile]]),
                                  torch.tensor([[foe]]), torch.tensor([[100]]), False)[B0, 0])
    assert cs(1) == 5, cs(1)
    assert cs(100 + s0) == 5, "a minor of another religion"
    sim.city_pressure[B0, M + s0, 0, :] = 0
    sim.city_pressure[B0, M + s0, 0, 0] = 400
    assert cs(100 + s0) == 0, "the minor follows Spain's own"
    sim.city_followed[B0, 1, :3] = torch.tensor([0, 0, -1])
    assert cs(1) == 0, "the foe shares it"
    sim.city_followed[B0, 1, :3] = torch.tensor([1, 1, -1])
    sim.city_followed[B0, 0, 1] = -1
    assert cs(1) == 0, "Spain itself has none"
    sim.city_followed[B0, 0, 1] = 0
    play(sim, 0, "AMERICA")
    assert cs(1) == 0, "another leader"
    print("  5 El Escorial OK — +5 against a major or a minor of another religion, nothing when either side has none")

    # Tamar's duplicate token at the SEND
    play(sim, 0, "GEORGIA")
    sim.city_pressure[B0, M + s0, 0, :] = 0
    sim.city_pressure[B0, M + s0, 0, 0] = 400             # the minor follows Georgia's majority (0)
    sim.seat_ext[B0, 0] = True
    sim.citystate_alive[B0, s0] = True
    sim.seat_citystate_met[B0, 0, s0] = True
    active = torch.ones(sim.B, dtype=torch.bool)

    def send() -> int:
        sim.civ_envoys_avail[B0, 0] = 1
        before = int(sim.seat_citystate_envoys[B0, 0, s0])
        sim._driven_envoys[0] = torch.tensor([s0])
        sim._seat_record_apply(0, active)
        return int(sim.seat_citystate_envoys[B0, 0, s0]) - before
    base = send()   # the League's first-envoy double may ride the first one
    sim.city_pressure[B0, M + s0, 0, :] = 0
    sim.city_pressure[B0, M + s0, 0, 1] = 400
    assert send() == 1, "the minor follows another religion"
    sim.city_pressure[B0, M + s0, 0, :] = 0
    sim.city_pressure[B0, M + s0, 0, 0] = 400
    assert send() == 2, "the envoy counts as two"
    assert base >= 2
    sim.city_followed[B0, 0, 1] = -1
    assert send() == 1, "Georgia has no majority"
    sim.city_followed[B0, 0, 1] = 0
    play(sim, 0, "AMERICA")
    assert send() == 1, "another leader"
    print("  6 Tamar OK — one more envoy to a minor of Georgia's majority religion")

    # Mvemba's borrowed founder belief
    play(sim, 0, "KONGO")
    sim.civ_founder[B0, 1] = 0
    sim.civ_religion_done[B0, 1] = True
    sim.city_followed[B0, 0, :3] = torch.tensor([1, 1, -1])
    assert int(sim._eff_founder(1)[B0]) == 0, "the founder's own"
    assert int(sim._eff_founder(0)[B0]) == 0, "Mvemba borrows it"
    assert sim._bel_stamp() != sim._bel_version, "the belief memos read the majority's planes while Kongo plays"
    if sim._bel_any:
        assert sim._seat_has_beliefs(0), "the borrowed belief counts like a claim"
    sim.city_followed[B0, 0, 1] = -1
    assert int(sim._eff_founder(0)[B0]) == -1, "no majority, nothing borrowed"
    sim.city_followed[B0, 0, 1] = 1
    play(sim, 0, "AMERICA")
    assert int(sim._eff_founder(0)[B0]) == -1, "another leader follows without borrowing"
    assert sim._bel_stamp() == sim._bel_version
    print("  7 Mvemba OK — the majority religion's founder belief, refreshed by the plane's own write counter")

    # the Conquistador converts to the captor's MAJORITY, a religion it never founded
    play(sim, 0, "SPAIN")
    C = UNITS.index("CONQUISTADOR")
    assert bool(sim._type_capture_converts[C])
    ctr = tile
    sim.city_center[B0, 0, 0] = ctr
    sim.city_followed[B0, 0, :3] = torch.tensor([-1, 1, 1])
    place(sim, ctr, C, 0)
    assert not bool(sim.civ_religion_done[B0, 0])
    sim._conquistador_convert(B0, 0, ctr)
    assert int(sim.city_followed[B0, 0, 0]) == 1, int(sim.city_followed[B0, 0, 0])
    sim.city_followed[B0, 0, :3] = torch.tensor([-1, 1, -1])
    sim._conquistador_convert(B0, 0, ctr)
    assert int(sim.city_followed[B0, 0, 0]) == -1, "no majority converts nothing"
    print("  8 Conquistador OK — converts to the captor's majority, nothing without one")
    print("BATTERY OK majority")


if __name__ == "__main__":
    main()
