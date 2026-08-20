"""THE WORLD CONGRESS BALLOT — the vote as a wire decision.

    python tests/gpu/congress_vote_test.py

CIV 6 (Gathering Storm, wiki "World Congress (Civ6)"): "For each Regular
session resolution, every civilization will first choose one of the two
outcomes. If there are multiple possible targets within that outcome, the
civilization will then choose a single target." Extra votes cost favor up a
curve that restarts per resolution — "it is thus wise to spend Diplomatic
Favor on other resolutions if they are also important" — and the refunds are
100% for a losing outcome, 50% for the winning outcome on a losing target.

The gate reaches a session about five times a game, always with the ladder's
own ballot. This lane pins what a DIFFERENT ballot does: the override, the
favor curve, the two refund tiers, and the Diplomatic Victory resolution's
+/-2 landing on the winning TARGET rather than on the leader.
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
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    # Every major needs a city to be a voter, and the session gate needs an
    # era: the eras themselves are exercised by the driven gate, so open them
    # here and pin the VOTE.
    sim._congress_min_era = -1
    sim._congress_dv_min = -1
    assert sim.n_majors >= 2, "the tally needs more than one voter"
    for row in range(sim.n_majors):
        assert bool(sim.city_alive[0, row].any()), f"seat {row} holds no city"
    return sim


def session(sim, turn: int) -> None:
    """Run one Regular Session at `turn`, exactly as the turn tail would."""
    sim.turn = turn
    sim._world_congress()


def main() -> None:
    sim = build()
    iv = sim._congress_interval
    assert iv > 0, "the congress interval is off in this fixture"
    NR = len(sim._congress_res)
    assert NR, "no resolution in the catalog"

    # --- 1) THE SLATE a ballot addresses ------------------------------------
    fires, res0, res1, dv = sim._congress_upcoming(iv)
    assert bool(fires[0]), "a session must fire on an interval turn"
    assert int(res0[0]) >= 0, "the slate's first slot must name a resolution"
    quiet, _, _, _ = sim._congress_upcoming(iv + 1)
    assert not bool(quiet[0]), "no session on an off-interval turn"
    print(f"  the slate at turn {iv}: slots {int(res0[0])}, {int(res1[0])}; dv={bool(dv[0])}")

    # The Diplomatic Victory resolution runs in the same session and pours
    # every seat's whole bank into it, which would eat the refunds below. It
    # gets its own section at the end.
    sim._congress_dv_min = 99

    # --- 2) A BALLOT OVERRIDES THE AI LINE ----------------------------------
    # One seat names a target its own preference would not pick, and buys
    # enough votes that its target wins the plurality outright.
    r = int(res0[0])
    kind = sim._congress_res[r]["t"]
    size = sim._congress_space(kind)
    assert size >= 2, "this resolution has only one target — nothing to override"
    voter = 0
    pref = int(sim._congress_pref(kind, voter)[0])
    other = (pref + 1) % size
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = 0
    sim.civ_diplo_favor[:, voter] = 10 * (1 + 2 + 3 + 4 + 5)  # five extra votes
    sim.civ_congress_vote[0, voter, 0] = torch.tensor([0, other, 5])
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 0]) == r, "slot 0 did not stand the slate's resolution"
    assert int(sim.congress_active[0, 0, 2]) == other, (
        f"the bought ballot lost: target {int(sim.congress_active[0, 0, 2])}, wanted {other}"
    )
    assert int(sim.civ_diplo_favor[0, voter]) == 0, "the winning combo takes the whole spend"
    assert not bool((sim.civ_congress_vote[0] >= 0).any()), "the ballot must clear after the session"
    print(f"  five bought votes carried target {other} over the AI's {pref}")

    # --- 3) THE CURVE: what the bank cannot clear, it does not buy ----------
    sim.civ_diplo_favor[:, voter] = 10 + 20 + 5   # three rungs cost 10+20+30
    got, spent = sim._congress_buy(voter, torch.ones(sim.B, dtype=torch.bool),
                                  torch.full((sim.B,), 9, dtype=torch.long))
    assert int(got[0]) == 2, f"a 35-favor bank buys two extra votes, got {int(got[0])}"
    assert int(spent[0]) == 30, f"two rungs cost 10+20, spent {int(spent[0])}"
    assert int(sim.civ_diplo_favor[0, voter]) == 5, "the remainder stays in the bank"
    got2, _ = sim._congress_buy(voter, torch.ones(sim.B, dtype=torch.bool),
                               torch.zeros(sim.B, dtype=torch.long))
    assert int(got2[0]) == 0, "a ballot that asks for nothing spends nothing"
    print("  the 10k curve stops at the rung the bank cannot clear")

    # --- 4) THE REFUND TIERS ------------------------------------------------
    # A seat on the LOSING outcome gets everything back; a seat on the winning
    # outcome with a losing target gets half.
    sim.congress_active[:] = -1
    bank = 10 + 20 + 30
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = bank
        sim.civ_congress_vote[0, row, 0] = torch.tensor([0, 0, 3])
    loser = sim.n_majors - 1
    sim.civ_congress_vote[0, loser, 0] = torch.tensor([1, 0, 3])   # outcome B, alone
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 1]) == 0, "outcome A had the votes and must win"
    assert int(sim.civ_diplo_favor[0, loser]) == bank, (
        f"a losing OUTCOME is refunded in full, got {int(sim.civ_diplo_favor[0, loser])}"
    )
    sim.congress_active[:] = -1
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = bank
        sim.civ_congress_vote[0, row, 0] = torch.tensor([0, 0, 3])
    near = sim.n_majors - 1
    sim.civ_congress_vote[0, near, 0] = torch.tensor([0, min(1, size - 1), 1])
    sim.civ_diplo_favor[:, near] = 10
    session(sim, iv)
    assert int(sim.congress_active[0, 0, 2]) == 0, "the crowd's target must win"
    assert int(sim.civ_diplo_favor[0, near]) == 5, (
        f"the winning outcome on a losing target keeps half, got {int(sim.civ_diplo_favor[0, near])}"
    )
    print("  a losing outcome is refunded whole; a losing target keeps half")

    # --- 5) THE DIPLOMATIC VICTORY resolution pays the WINNING TARGET -------
    # Everyone votes A on seat 1 — who is NOT the DVP leader. The +2 must
    # follow the target the tally produced, not the leader.
    sim._congress_dv_min = -1
    sim._congress_res = []   # the DV resolution alone, so its points are readable
    for row in range(sim.n_majors):
        sim.civ_diplo_favor[:, row] = 0
        sim.civ_diplo_points[:, row] = 0
        sim.civ_congress_vote[0, row, 2] = torch.tensor([0, 1, 0])
    sim.civ_diplo_points[:, 0] = 5   # seat 0 leads
    lead = sim._congress_leader(torch.ones(sim.B, dtype=torch.bool))
    assert int(lead[0]) == 0, f"seat 0 should lead on points, got {int(lead[0])}"
    before = int(sim.civ_diplo_points[0, 1])
    session(sim, iv)
    after = int(sim.civ_diplo_points[0, 1])
    # +1 for voting the winning combo, +2 for being the winning target
    assert after == before + sim._dvp_per_res + sim._congress_dv_delta, (
        f"seat 1 should take {sim._dvp_per_res}+{sim._congress_dv_delta}, went {before} -> {after}"
    )
    assert int(sim.civ_diplo_points[0, 0]) == 5 + sim._dvp_per_res, (
        "the leader voted the winning combo too and takes only the resolution point"
    )
    print("  the +/-2 lands on the winning TARGET, not on the leader")

    print("CONGRESS VOTE OK — the slate, the override, the curve, both refunds and the DV target")


if __name__ == "__main__":
    main()
