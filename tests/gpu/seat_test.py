'''Seat-surface self-test: the `seat` parameter routes seat 0 to exactly the
paths the default-arg calls take (bit-identical obs/masks/rewards on twin
sims), the observation schema is one shape for every seat, and a civ seat
renders that schema from its OWN state.'''

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import BatchEnv, load_rules, load_fixture, FIXTURES


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
    # seat 1 renders the SAME schema from civ tensors, its masks drive legal
    # control, and civ-score rewards flow
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
    # --- a civ's observation must READ its state, not zero it ---------------
    # `observe` has to take treasury, envoys, influence and loyalty off
    # the planes; a constant there is invisible to every gate, because parity
    # compares trace columns and an observation is not one. This lane is the
    # only thing standing between that renderer and silent drift.
    # `observeSeat` in cpu/core/observe.ts is the reference layout.
    import pathlib as _pl
    from core.env import BatchEnv as _BE
    _p = sorted(_pl.Path("seeder/worlds").glob("seed*.json"))[0]
    e2 = _BE([load_fixture(_p)], rules, device="cpu", dtype=torch.float64)
    s2 = e2.sim
    for _ in range(60):
        s2.step()
    # read the block widths from the ONE layout definition — a literal here
    # would silently point at the wrong field whenever a block grows.
    import ladder as _lay
    _base = _lay.EMP + _lay.PER_CS * s2.S + _lay.PER_CIV * s2.R
    for name, plane, col, scale in (
        ("treasury", s2.civ_only_treasury, 8, 200.0),
        ("influence", s2.civ_only_influence, 10, 100.0),
        ("envoysAvail", s2.civ_only_envoys_avail, 9, 5.0),
    ):
        plane[0, 0] = 0.0
        lo = float(e2.observe(1)[0, col])
        plane[0, 0] = scale                      # exactly one unit of its scale
        hi = float(e2.observe(1)[0, col])
        assert abs(lo) < 1e-9 and abs(hi - 1.0) < 1e-9, (
            f"civ obs field {col} ({name}) must READ its plane: {lo} -> {hi}"
        )
    s2.civ_city_loyalty[0, 0, 0] = 42.0
    assert abs(float(e2.observe(1)[0, _base + 7]) - 0.42) < 1e-9, (
        "civ per-city loyalty must READ civ_city_loyalty, not render a constant"
    )
    if s2._settler_idx >= 0:
        base5 = float(e2.observe(1)[0, 5])
        sl = int(s2.unit_next[0])
        s2.major_unit_alive[0, sl] = True
        s2.major_unit_seat[0, sl] = 1
        s2.major_unit_type[0, sl] = s2._settler_idx
        s2.unit_next[0] += 1
        assert abs(float(e2.observe(1)[0, 5]) - base5 - 1.0) < 1e-9, (
            "obs field 5 is the seat's LIVE settler count, derived from the pool"
        )
    print("  #51/S8.1c civ observation reads live state (treasury/influence/"
          "envoys/loyalty/settlers) OK")

    # The POST-HOC PROTAGONIST pick — a finished game reads from whichever
    # seat earned the horizon, so no single seat's fate invalidates a seed.
    e3 = BatchEnv([load_fixture(sorted(FIXTURES.glob("seed*.json"))[0])], rules,
                  device="cpu", dtype=torch.float64)
    s3 = e3.sim
    # (a) an explicit winner overrides every other consideration
    s3.winner[0] = 2
    assert int(s3.protagonist()[0]) == 2, "the winner must be the protagonist"
    s3.winner[0] = -1
    # (b) with no winner and NOBODY holding a city (a t0 world), the pick
    # falls back to the plain score leader — the same deterministic
    # first_argmax tie-break, so the two reads must agree exactly
    assert not bool(s3.alive[0].any()) and not bool(s3.civ_city_alive[0].any()), (
        "t0 fixture grew cities — re-derive this scenario"
    )
    assert int(s3.protagonist()[0]) == int(s3.leader()[0]), (
        "cityless world: protagonist must fall back to leader()"
    )
    # (c) seat 0 cityless while a civ holds a city: the pick fences on
    # holding a city, so the surviving civ wins REGARDLESS of raw score
    s3.civ_city_alive[0, 0, 0] = True
    assert int(s3.protagonist()[0]) == 1, (
        "a dead seat 0 must yield the protagonist to the surviving civ"
    )
    print("  #75 protagonist OK (winner first, city fence, leader fallback)")

    print("C2 SEAT SURFACE OK")


if __name__ == "__main__":
    main()
