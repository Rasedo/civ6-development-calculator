'''C2a seat-surface self-test: the seat parameter routes seat 0 to the
exact player paths (bit-identical obs/masks/rewards vs the default-arg
calls on twin sims), the schema stays fixed, and rival seats fail loudly
until C2b lands.'''

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchEnv, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))[:4]
    fixtures = [load_fixture(p) for p in paths]
    a = BatchEnv(fixtures, rules, device="cpu", dtype=torch.float64)
    b = BatchEnv(fixtures, rules, device="cpu", dtype=torch.float64)
    oa = a.reset()
    ob = b.reset()
    assert torch.equal(oa, ob), "reset obs must match across twin envs"
    for t in range(30):
        ma = a.masks()
        mb = b.masks(seat=0)
        for k in ma:
            assert torch.equal(ma[k], mb[k]), f"mask {k} differs at t{t}"
        assert torch.equal(a.unit_features(), b.unit_features(seat=0)), f"unit features differ at t{t}"
        oa, ra, da = a.step()
        ob, rb, db = b.step(seat=0)
        assert torch.equal(oa, ob) and torch.equal(ra, rb) and da == db, f"step outputs differ at t{t}"
    # C2b: seat 1 renders the SAME schema from rival tensors, its masks
    # drive legal control, and rival-score rewards flow
    o1 = a.observe(seat=1)
    assert o1.shape == oa.shape, "seat-1 obs must match the seat-0 schema"
    assert not torch.isnan(o1).any()
    g = torch.Generator().manual_seed(3)
    for _ in range(20):
        m = a.masks(seat=1)
        B, C, W = m["production"].shape
        pa = torch.full((B, C), -1, dtype=torch.long)
        for b in range(B):
            for j in range(C):
                row = m["production"][b, j]
                if row.any():
                    opts = row.nonzero(as_tuple=True)[0]
                    pa[b, j] = opts[torch.randint(len(opts), (1,), generator=g)]
        ta = torch.full((B,), -1, dtype=torch.long)
        ca = torch.full((B,), -1, dtype=torch.long)
        for b in range(B):
            if m["tech"][b].any():
                o = m["tech"][b].nonzero(as_tuple=True)[0]
                ta[b] = o[torch.randint(len(o), (1,), generator=g)]
            if m["civic"][b].any():
                o = m["civic"][b].nonzero(as_tuple=True)[0]
                ca[b] = o[torch.randint(len(o), (1,), generator=g)]
        obs1, rew1, done1 = a.step(production=pa, tech=ta, civic=ca, seat=1)
        assert obs1.shape == oa.shape and not torch.isnan(obs1).any() and not torch.isnan(rew1).any()
    print("C2 SEAT SURFACE OK")


if __name__ == "__main__":
    main()
