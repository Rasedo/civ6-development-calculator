"""THE LUXURY ON THE TABLE — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/luxury_deal_test.py

The TS twin is tests/cpu/seats/luxury-deals.test.ts.

CIV6 (Trade, Demand, and Discuss): the screen trades "Strategic and Luxury
Resources", and resources "are temporary, and once the deal has run its
course you will get them back". Proven here:
  * a LUXURY item crosses on accept: the receiver holds the copy and the
    giver one fewer (`_lux_holdings`), for `_deal_turns` turns of
    `_deal_phase`, and then it is back with the giver;
  * a one-copy giver loses the amenity round that copy paid;
  * the item is payable only from a copy the giver can still trade — none,
    one already out, or one a deal brought in is refused.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import warm_base, opened


def fresh(rules, path):
    return warm_base(str(path), lambda: opened(rules, path))


def scene(rules, path, copies: int):
    """Row 0 works `copies` improved plots of one luxury no other row holds."""
    sim = fresh(rules, path)
    b = 0
    held = torch.stack([sim._lux_holdings(r)[0][b] for r in range(sim.n_majors)]).sum(dim=0)
    lux = int((held == 0).long().argmax())
    assert int(held[lux]) == 0
    mine = [t for t in range(sim.T) if int(sim.tile_seat[b, t]) == 0
            and int(sim.res_id[b, t]) < 0 and int(sim.lux_id[b, t]) < 0]
    assert len(mine) >= copies, "row 0 owns too little bare ground"
    for t in mine[:copies]:
        sim.lux_id[b, t] = lux
        sim.lux_req[b, t] = 1
        sim.improvement[b, t] = 1
        sim.pillaged[b, t] = False
    sim.war[b, 0, 1] = sim.war[b, 1, 0] = False
    return sim, lux


def table(sim, lux: int, a: int = 0, to: int = 1) -> torch.Tensor:
    di = sim._deal_items
    give = torch.full((sim.B, di, 3), -1, dtype=torch.long)
    ask = give.clone()
    give[:, 0] = torch.tensor([sim._deal_k_lux, lux, 1])
    on = torch.ones(sim.B, dtype=torch.bool)
    sim._deal_offer(a, to, on, give, ask, on)
    return sim._accept_deal(a, to, on)


def amen(sim, row: int) -> float:
    cols = sim.RC
    have = torch.zeros(sim.B, cols, dtype=torch.float64)
    need = torch.full((sim.B, cols), 6.0, dtype=torch.float64)
    return float(sim._luxury_amenities(row, have, need)[0].sum())


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    b = 0

    # --- 1) the copy crosses for the term -------------------------------------
    sim, lux = scene(rules, path, 2)
    before = amen(sim, 1)
    assert bool(table(sim, lux)[b]), "the luxury deal did not clear"
    assert int(sim.deal_term_left[b, 0, 1]) == sim._deal_turns
    h1, s1 = sim._lux_holdings(1)
    h0, s0 = sim._lux_holdings(0)
    assert (int(h1[b, lux]), int(s1[b, lux])) == (1, 0), (int(h1[b, lux]), int(s1[b, lux]))
    assert (int(h0[b, lux]), int(s0[b, lux])) == (1, 1), (int(h0[b, lux]), int(s0[b, lux]))
    assert amen(sim, 1) == before + 1, f"the receiver's copy paid nothing ({before} -> {amen(sim, 1)})"
    for _ in range(sim._deal_turns):
        sim._deal_phase()
    assert int(sim.deal_term_left[b, 0, 1]) == 0
    assert int(sim._lux_holdings(1)[0][b, lux]) == 0, "the copy outlived its term"
    assert int(sim._lux_holdings(0)[1][b, lux]) == 2, "the copy did not come home"
    print("  1 a luxury copy crosses for the term and comes home")

    # --- 2) a one-copy giver loses its round ----------------------------------
    sim, lux = scene(rules, path, 1)
    before = amen(sim, 0)
    assert bool(table(sim, lux)[b])
    assert int(sim._lux_holdings(0)[0][b, lux]) == 0
    assert amen(sim, 0) == before - 1, f"the giver kept its round ({before} -> {amen(sim, 0)})"
    print("  2 a one-copy giver loses the amenity its copy paid")

    # --- 3) payable only from a spare copy ------------------------------------
    sim, lux = scene(rules, path, 1)
    va = torch.full((sim.B,), lux, dtype=torch.long)
    one = torch.ones(sim.B, dtype=torch.long)
    k = sim._deal_k_lux
    assert not bool(sim._deal_kind_ok(k, 1, 0, va, one)[b]), "a seat with no copy may give one"
    assert not bool(sim._deal_kind_ok(k, 0, 1, torch.full_like(va, -1), one)[b])
    assert not bool(sim._deal_kind_ok(k, 0, 1, torch.full_like(va, sim._n_lux), one)[b])
    assert bool(sim._deal_kind_ok(k, 0, 1, va, one)[b])
    assert bool(table(sim, lux)[b])
    assert not bool(sim._deal_kind_ok(k, 0, 1, va, one)[b]), "the one copy is out, yet payable"
    assert not bool(sim._deal_kind_ok(k, 1, 0, va, one)[b]), "a received copy is payable on"
    print("  3 the item is payable only from a copy the giver can still trade")
    print("luxury deal OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
