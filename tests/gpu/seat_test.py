'''Seat-surface self-test: every call names its seat, the observation schema
is one shape for every seat, a seat's masks drive legal control, and a civ
seat renders that schema from its OWN state.'''

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import BatchEnv, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()[:4]
    fixtures = [load_fixture(p) for p in paths]
    a = BatchEnv(fixtures, rules, device="cpu", dtype=torch.float64)
    a.reset()
    for _ in range(30):
        a.step(seat=0)
    # every seat renders the SAME schema from its own row, and its unit
    # features are finite
    oa = a.observe(0)
    for row in range(a.sim.n_majors):
        o = a.observe(row)
        assert o.shape == oa.shape, f"seat-{row} obs must match the one schema"
        assert not torch.isnan(o).any() and not torch.isnan(a.unit_features(row)).any()
    # seat 1's masks drive legal control, and civ-score rewards flow
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
    from core.env import BatchEnv as _BE
    e2 = _BE([load_fixture(fixture_paths()[0])], rules, device="cpu", dtype=torch.float64)
    s2 = e2.sim
    settle_all(s2)  # the city block renders LIVING cities — an unsettled world has none
    for _ in range(60):
        s2.step()
    # read the block widths from the ONE layout definition — a literal here
    # would silently point at the wrong field whenever a block grows.
    import ladder as _lay
    _base = _lay.EMP + _lay.PER_CS * s2.S + _lay.PER_CIV * (s2.n_majors - 1)
    for name, plane, col, scale in (
        ("treasury", s2.civ_treasury[:, 1:], 8, 200.0),
        ("influence", s2.civ_influence[:, 1:], 10, 100.0),
        ("envoysAvail", s2.civ_envoys_avail[:, 1:], 9, 5.0),
    ):
        plane[0, 0] = 0.0
        lo = float(e2.observe(1)[0, col])
        plane[0, 0] = scale                      # exactly one unit of its scale
        hi = float(e2.observe(1)[0, col])
        assert abs(lo) < 1e-9 and abs(hi - 1.0) < 1e-9, (
            f"civ obs field {col} ({name}) must READ its plane: {lo} -> {hi}"
        )
    s2.city_loyalty[0, 1, 0] = 42.0
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
    print("  civ observation reads live state (treasury/influence/"
          "envoys/loyalty/settlers) OK")

    print("C2 SEAT SURFACE OK")


if __name__ == "__main__":
    main()
