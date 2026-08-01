"""C3c-ii melee self-test (needs gpu/fixtures_o4 — export with
`npx vite-node scripts/export-gpu.ts 24 100 5 3 gpu/fixtures_o4`).

1. A 4-seat random FFA runs the horizon: schema-invariant NaN-free obs,
   legal masks each seat, relative rewards zero-sum EXACTLY.
2. O=2 melee over the CONTRACT fixtures equals DuelEnv step-for-step on
   twin worlds (same actions -> bit-equal rewards): the generalization
   adds seats, not arithmetic.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import load_rules, load_fixture, FIXTURES
from civ6gpu.duel import DuelEnv
from civ6gpu.melee import MeleeEnv

O4 = Path(__file__).resolve().parent.parent / "fixtures_o4"  # #51/S8.5


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
    if not O4.exists():
        print("SKIP: gpu/fixtures_o4 missing (export with rivals=3 first)")
        return
    rules4 = load_rules(O4 / "rules.json")
    fixtures4 = [load_fixture(p) for p in sorted(O4.glob("seed*.json"))[:2]]
    ffa = MeleeEnv(fixtures4, rules4, device="cpu", dtype=torch.float64, horizon=30, reward="relative", seats=4)
    obs = ffa.reset()
    assert obs.shape[1] == 4
    g = torch.Generator().manual_seed(23)
    for _ in range(30):
        ms = ffa.masks()
        acts = [sample(m, g) for m in ms]
        obs, rew, done = ffa.step(acts)
        assert not torch.isnan(obs).any() and not torch.isnan(rew).any()
        zs = float(rew.sum(dim=1).abs().max())
        assert zs < 1e-9, f"relative FFA rewards must be zero-sum (got {zs})"
    assert done
    print("4-seat FFA: 30 turns, zero-sum exact")

    rules = load_rules()
    fixtures = [load_fixture(p) for p in sorted(FIXTURES.glob("seed*.json"))[:2]]
    mel = MeleeEnv(fixtures, rules, device="cpu", dtype=torch.float64, horizon=20, reward="dense", seats=2)
    du = DuelEnv(fixtures, rules, device="cpu", dtype=torch.float64, horizon=20, reward="dense")
    mel.reset()
    du.reset()
    for t in range(20):
        g2 = torch.Generator().manual_seed(500 + t)
        a0 = sample(mel.masks()[0], g2)
        g3 = torch.Generator().manual_seed(900 + t)
        a1 = sample(mel.masks()[1], g3)
        _, rm, _ = mel.step([a0, a1])
        g2b = torch.Generator().manual_seed(500 + t)
        b0 = sample(du.masks()[0], g2b)
        g3b = torch.Generator().manual_seed(900 + t)
        b1 = sample(du.masks()[1], g3b)
        _, rd, _ = du.step(seat0=b0, seat1=b1)
        assert torch.equal(rm, rd), f"O=2 melee must equal DuelEnv at t{t}"
    print("O=2 melee == DuelEnv bit-for-bit")
    print("C3c MELEE OK")


if __name__ == "__main__":
    main()
