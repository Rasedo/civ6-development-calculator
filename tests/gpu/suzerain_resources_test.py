"""THE SUZERAIN'S RESOURCES — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/suzerain_resources_test.py

The TS twin is tests/cpu/minors/suzerain-resources.test.ts.

CIV6 (LOC_CITY_STATES_SUZERAIN_DIPLOMATIC_BONUS): "Gain ownership of all the
city-state's resources." Proven here:
  * an improved, unpillaged luxury on a suzerained minor's ground is a spare
    copy of the suzerain's (`_lux_holdings`) and a round in
    `_luxury_amenities`; short of suzerainty, unimproved or pillaged it is
    nothing;
  * the minor keeps its own copy;
  * an improved strategic source on that ground pays the suzerain the
    resource's per-turn number in `_seat_accrue_stockpile`.
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


def suzerain(sim, b: int, row: int, n: int) -> None:
    sim.seat_citystate_envoys[b, :, 0] = 0
    sim.seat_citystate_envoys[b, row, 0] = n
    sim._eff_version += 1


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    b, row = 0, 0
    suz_n = int(rules.citystate["suzerainEnvoys"])

    # --- 1) a luxury on the minor's ground ------------------------------------
    sim = fresh(rules, path)
    assert sim.S >= 1 and sim._n_lux > 0
    ground = [t for t in range(sim.T) if int(sim.tile_seat[b, t]) == 100]
    assert len(ground) >= 2, "minor 0 owns too little ground"
    held0 = sim._lux_holdings(row)[0][b]
    lux = int((held0 == 0).long().argmax())
    assert int(held0[lux]) == 0, "the seat already holds every luxury"
    imp = 1
    t = next(x for x in ground if int(sim.res_id[b, x]) < 0 and int(sim.lux_id[b, x]) < 0)
    sim.lux_id[b, t] = lux
    sim.lux_req[b, t] = imp
    cols = sim.RC
    have = torch.zeros(sim.B, cols, dtype=torch.float64)
    need = torch.full((sim.B, cols), 6.0, dtype=torch.float64)
    suzerain(sim, b, row, suz_n)
    before = float(sim._luxury_amenities(row, have, need).sum())
    assert int(sim._lux_holdings(row)[1][b, lux]) == 0, "an unimproved plot pays a copy"
    sim.improvement[b, t] = imp
    sim.pillaged[b, t] = False
    held, spare = sim._lux_holdings(row)
    assert int(spare[b, lux]) == 1 and int(held[b, lux]) == 1, (int(spare[b, lux]), int(held[b, lux]))
    after = float(sim._luxury_amenities(row, have, need).sum())
    assert after > before, f"the suzerain's copy paid nothing ({before} -> {after})"
    # the minor keeps its own (minor 0 is the row after the majors)
    assert int(sim._lux_holdings(sim.n_majors)[1][b, lux]) == 1, "the minor lost its own copy"
    sim.pillaged[b, t] = True
    assert int(sim._lux_holdings(row)[1][b, lux]) == 0, "a pillaged plot pays a copy"
    sim.pillaged[b, t] = False
    suzerain(sim, b, row, suz_n - 1)
    assert int(sim._lux_holdings(row)[1][b, lux]) == 0, "short of suzerainty the copy still pays"
    print(f"  1 the suzerain holds the minor's improved luxury ({before} -> {after})")

    # --- 2) a strategic source on the minor's ground --------------------------
    sim = fresh(rules, path)
    assert sim._n_strategic > 0
    k = 0
    rid, rate = sim._strat_rid[k], sim._strat_rate[k]
    t = next(x for x in ground if int(sim.res_id[b, x]) < 0 and int(sim.lux_id[b, x]) < 0)
    sim.res_id[b, t] = rid
    sim.res_imp[b, t] = 1
    sim.improvement[b, t] = 1
    sim.pillaged[b, t] = False
    rt = int(sim._res_reveal_tech[rid])
    if rt >= 0:
        sim.civ_techs[b, row, rt] = True
    suzerain(sim, b, row, suz_n)
    sim.civ_stockpile[b, row].zero_()
    sim._seat_accrue_stockpile(row)
    got = int(sim.civ_stockpile[b, row, k])
    sim.civ_stockpile[b, row].zero_()
    suzerain(sim, b, row, suz_n - 1)
    sim._seat_accrue_stockpile(row)
    base = int(sim.civ_stockpile[b, row, k])
    assert got - base == rate, f"the suzerain's source paid {got - base}, wanted {rate}"
    print(f"  2 the suzerain banks the minor's improved source ({rate} a turn)")
    print("suzerain resources OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
