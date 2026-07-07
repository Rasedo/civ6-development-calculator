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
    try:
        a.observe(seat=1)
        raise SystemExit("seat 1 must raise until C2b")
    except NotImplementedError:
        pass
    print("C2a SEAT SURFACE OK")


if __name__ == "__main__":
    main()
