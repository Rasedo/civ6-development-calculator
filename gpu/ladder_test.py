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

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
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
    layout = {"cs": s.S, "rivals": s.R, "cities": s.C}
    width = ladder.EMP + ladder.PER_CS * s.S + ladder.PER_RIVAL * s.R + ladder.PER_CITY * s.C

    shapes = {}
    for seat in (0, 1):
        obs = env.observe(seat)
        assert obs.shape[1] == width, (
            f"seat {seat} observation is {obs.shape[1]} wide, layout says {width} — "
            "the shared layout and an engine renderer have drifted"
        )
        blocks = ladder.split(obs, s.S, s.R, s.C)
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

    print("LADDER CONTRACT OK")


if __name__ == "__main__":
    main()
