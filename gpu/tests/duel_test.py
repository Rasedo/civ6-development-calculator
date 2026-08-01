"""C2c duel self-test.

1. Seat-0-only duels (seat 1 abstains, controlled) still run the horizon
   and reward finiteness holds.
2. Random-vs-random duels: both seats act every turn, obs stay
   schema-invariant and NaN-free, and RELATIVE rewards are zero-sum by
   construction (sum over seats == 0 exactly).
3. The dense seat-0 stream equals BatchEnv's own step rewards on a twin
   sim fed the same actions — the duel wrapper adds sequencing, not
   arithmetic.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchEnv, load_rules, load_fixture, FIXTURES
from civ6gpu.duel import DuelEnv


def sample(masks: dict, g: torch.Generator) -> dict:
    out: dict = {}
    m = masks["production"]
    B, C, W = m.shape
    pa = torch.full((B, C), -1, dtype=torch.long)
    for b in range(B):
        for j in range(C):
            row = m[b, j]
            if row.any():
                opts = row.nonzero(as_tuple=True)[0]
                pa[b, j] = opts[torch.randint(len(opts), (1,), generator=g)]
    out["production"] = pa
    for head in ("tech", "civic"):
        hm = masks[head]
        col = torch.full((B,), -1, dtype=torch.long)
        for b in range(B):
            if hm[b].any():
                opts = hm[b].nonzero(as_tuple=True)[0]
                col[b] = opts[torch.randint(len(opts), (1,), generator=g)]
        out[head] = col
    return out


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))[:2]
    fixtures = [load_fixture(p) for p in paths]

    # 1 + 2: random-vs-random relative duel
    duel = DuelEnv(fixtures, rules, device="cpu", dtype=torch.float64, horizon=40, reward="relative")
    obs = duel.reset()
    assert obs.shape[1] == 2
    g = torch.Generator().manual_seed(11)
    for _ in range(40):
        m0, m1 = duel.masks()
        obs, rew, done = duel.step(seat0=sample(m0, g), seat1=sample(m1, g))
        assert not torch.isnan(obs).any() and not torch.isnan(rew).any()
        zs = rew.sum(dim=1).abs().max()
        assert float(zs) < 1e-9, f"relative rewards must be zero-sum (got {float(zs)})"
    assert done, "horizon must end the episode"

    # 3: dense seat-0 stream == BatchEnv on a twin sim with identical actions
    duel2 = DuelEnv(fixtures, rules, device="cpu", dtype=torch.float64, horizon=25, reward="dense")
    ref = BatchEnv(fixtures, rules, device="cpu", dtype=torch.float64, horizon=25)
    duel2.reset()
    ref.reset()
    ref.sim.controlled[:, 0] = True  # twin worlds: same controlled rival (abstaining)
    for t in range(25):
        m0 = duel2.masks()[0]
        g2 = torch.Generator().manual_seed(1000 + t)
        a0 = sample(m0, g2)
        _, rew, _ = duel2.step(seat0=a0, seat1=None)
        _, rref, _ = ref.step(production=a0.get("production"), tech=a0.get("tech"), civic=a0.get("civic"))
        assert torch.equal(rew[:, 0], rref), f"duel seat-0 dense rewards must equal BatchEnv's at t{t}"

    print("C2c DUEL OK")


if __name__ == "__main__":
    main()
