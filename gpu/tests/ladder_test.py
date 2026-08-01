"""#51/S8.3 — the ladder contract: ONE policy, every seat, actions out.

This lane exists because the ladder is leaving the parity gate's protection.
Once decisions live outside both engines, nothing compares the ladder against a
second implementation any more — that is the POINT (it stops being written
twice) but it means the observation contract and the action shapes need their
own guard.

What is asserted, and why each would otherwise fail silently:
  * the observation SPLITS by the shared layout — a width change on either
    engine breaks the slice rather than quietly shifting every field;
  * the SAME policy accepts seat 0 and a rival and returns the same shapes —
    the moment those diverge, "one ladder for every seat" is untrue;
  * lowest-index tie-break — a policy that breaks ties differently produces a
    different game, and a recorded action file would stop replaying;
  * the ladder actually ADVANCES the world, not just type-checks.
"""
from __future__ import annotations

import pathlib
import sys

import torch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from civ6gpu import load_rules, load_fixture, FIXTURES  # noqa: E402
from civ6gpu.env import BatchEnv  # noqa: E402
import ladder  # noqa: E402
import stamp  # noqa: E402


def main() -> None:
    stamp.check(FIXTURES)
    rules = load_rules()
    p = sorted(FIXTURES.glob("seed*.json"))[0]
    env = BatchEnv([load_fixture(p)], rules, device="cpu", dtype=torch.float64)
    s = env.sim
    layout = {"cs": s.S, "rivals": s.R, "cities": s.C,
              "techs": s.techs.shape[1], "civics": s.civics.shape[1]}
    width = (ladder.EMP + ladder.PER_CS * s.S + ladder.PER_RIVAL * s.R
             + ladder.PER_CITY * s.C + ladder.ESCALATORS
             + s.techs.shape[1] + s.civics.shape[1])

    shapes = {}
    for seat in (0, 1):
        obs = env.observe(seat)
        assert obs.shape[1] == width, (
            f"seat {seat} observation is {obs.shape[1]} wide, layout says {width} — "
            "the shared layout and an engine renderer have drifted"
        )
        blocks = ladder.split(obs, s.S, s.R, s.C, s.techs.shape[1], s.civics.shape[1])
        assert blocks["city"].shape == (s.B, s.C, ladder.PER_CITY)
        acts = ladder.decide(obs, env.masks(seat), layout)
        shapes[seat] = {k: tuple(v.shape) for k, v in acts.items()}
    assert shapes[0] == shapes[1], (
        f"one policy must serve every seat identically: {shapes[0]} vs {shapes[1]}"
    )
    print(f"  a one policy, both seats, obs {width} wide, actions {sorted(shapes[0])} OK")

    m = torch.tensor([[False, True, True], [False, False, False]])
    got = ladder.first_legal(m)
    assert got.tolist() == [1, -1], f"lowest-legal tie-break broke: {got.tolist()}"
    print("  b lowest-index tie-break OK (and -1 when no option is legal)")

    t0, sc0 = int(s.turn), float(s.empire_score()[0])
    for _ in range(20):
        a = ladder.decide(env.observe(0), env.masks(0), layout)
        env.step(production=a["production"], tech=a["tech"], civic=a["civic"], seat=0)
    assert int(s.turn) >= t0 + 20, "the ladder must advance the world"
    assert float(s.empire_score()[0]) > sc0, "a driven empire should grow"
    print(f"  c ladder drove 20 turns (score {sc0:.1f} -> {float(s.empire_score()[0]):.1f}) OK")

    # --- the ENVOY verb, ported from rivals.ts ------------------------------
    # "greedy assignment (neediest met CS by OWN envoys, ties lowest id)".
    # Pinned here because a WRONG pick is still a LEGAL pick: it produces a
    # different game rather than an error, and every recorded action file stops
    # replaying. Nothing else compares the ladder against the rule it ported.
    b = {"cs": torch.tensor([[[1.0, 0.5, 0.0],    # met, 3 envoys
                              [1.0, 0.0, 0.0],    # met, 0 envoys  <- neediest
                              [0.0, 0.0, 0.0]]])} # NOT met
    m = torch.tensor([[True, True, True]])
    assert int(ladder.pick_envoy(b, m)[0]) == 1, "neediest MET city-state wins"
    b2 = {"cs": torch.tensor([[[1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 0.0]]])}
    assert int(ladder.pick_envoy(b2, m)[0]) == 0, "ties break to the LOWEST index"
    b3 = {"cs": torch.tensor([[[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]])}
    assert int(ladder.pick_envoy(b3, m)[0]) == -1, "no MET city-state -> no action"
    m4 = torch.tensor([[False, True, True]])
    b4 = {"cs": torch.tensor([[[1.0, 0.0, 0.0], [1.0, 0.5, 0.0], [0.0, 0.0, 0.0]]])}
    assert int(ladder.pick_envoy(b4, m4)[0]) == 1, "the MASK still gates legality"
    print("  d envoy verb OK (neediest met, lowest-index ties, mask-gated)")

    # --- the RESEARCH verb, ported from rivals.ts ---------------------------
    # "sort available by effectiveResearchCostIn, take the first"; JS sort is
    # STABLE, so equal costs keep catalog order = lowest index wins.
    bb = {"costTech": torch.tensor([[0.080, 0.030, 0.100]]),
          "costCivic": torch.tensor([[0.050, 0.050]])}
    mm = torch.tensor([[True, True, True]])
    assert int(ladder.pick_research(bb, mm, "tech")[0]) == 1, "cheapest EFFECTIVE cost wins"
    # THE CASE THAT FORCED THE WIDENING: a BOOSTED 100 beats an unboosted 80.
    # If the observation carried base cost (or a boost flag the policy had to
    # apply itself) this picks the wrong item — index 0 rather than index 2.
    boosted = {"costTech": torch.tensor([[0.080, 0.090, 0.050]])}   # idx2 = 100 boosted
    assert int(ladder.pick_research(boosted, mm, "tech")[0]) == 2, (
        "a boosted expensive tech must beat a cheap unboosted one"
    )
    tie = {"costTech": torch.tensor([[0.030, 0.030, 0.030]])}
    assert int(ladder.pick_research(tie, mm, "tech")[0]) == 0, "ties break LOWEST index"
    gated = torch.tensor([[False, False, True]])
    assert int(ladder.pick_research(tie, gated, "tech")[0]) == 2, "the MASK gates legality"
    none = torch.tensor([[False, False, False]])
    assert int(ladder.pick_research(tie, none, "tech")[0]) == -1, "nothing legal -> no action"
    print("  e research verb OK (effective cost, boosted beats cheap, ties low, mask-gated)")

    # --- the PRODUCTION verb, ported from rivals.ts -------------------------
    # The ladder is a chain of tryQueueRivalX calls, each false when nothing of
    # that kind is legal: settler -> district -> building -> ... -> army. That
    # reduces to FIRST LEGAL CLASS in priority order, lowest index within.
    NB, NU, nS = 4, 3, 2
    cls = ladder.prod_classes(NB, NU, nS)
    W = NB + 2 + NU + nS
    def mk(idxs):
        m = torch.zeros(1, 1, W, dtype=torch.bool)
        for i in idxs:
            m[0, 0, i] = True
        return m
    # settler outranks a district, which outranks a building
    assert int(ladder.pick_production(mk([0, NB, cls["district"][0]]), cls)[0, 0]) == NB
    # the capital gate lives in the MASK, not here: an ungated settler column
    # simply is not legal, and the ladder falls through to the district.
    assert int(ladder.pick_production(mk([0, cls["district"][0]]), cls)[0, 0]) == cls["district"][0]
    # district outranks building
    assert int(ladder.pick_production(mk([0, cls["district"][0]]), cls)[0, 0]) == cls["district"][0]
    # building outranks a unit
    assert int(ladder.pick_production(mk([1, cls["unit"][0]]), cls)[0, 0]) == 1
    # lowest index within a class
    assert int(ladder.pick_production(mk([2, 1]), cls)[0, 0]) == 1
    # nothing legal -> queue nothing
    assert int(ladder.pick_production(mk([]), cls)[0, 0]) == -1
    print("  f production verb OK (class priority, no capital gate, "
          "lowest-index within class)")

    print("LADDER CONTRACT OK")


if __name__ == "__main__":
    main()
