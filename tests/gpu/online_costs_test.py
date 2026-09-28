"""THE CITY STEP AS THE HARNESS MEASURED IT — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/online_costs_test.py

The TS twin is tests/cpu/city/online-costs.test.ts (and the cost pins in
tests/cpu/game.test.ts / tests/cpu/map/borders.test.ts). The game's numbers
are runs/h1_duelw1103 / 1104:
  1. the growth threshold at the online speed, floor((15 + 8(p-1) +
     (p-1)^1.5) / 2): 7, 12, 16, 22, 27, 33, 38 ... 57
  2. the border cost, floor((10 + (6n)^1.3) / 2), n from 0: 5, 10, 17, 26 ... 120
  3. culture after growth: a column whose population moved is read again
  4. improvement housing: the shares sum over the city and pay the floor
  5. the floodplains: the desert row Food 2, the grassland and plains rows
     nothing, all three kept under a district; the Great Barrier Reef 3F 2S
  6. the Great Wall: its own Gold 2, and its adjacency rows wait on TECHS
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, fixture_paths, load_fixture, load_rules
from warmup import settle_all, warm_base

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text(encoding="utf-8"))
TECHS = [t["id"] for t in RULES["techs"]]
IMPS = RULES["improvements"]["ids"]
FEATS = json.loads(fixture_paths()[0].with_name(
    fixture_paths()[0].name.replace(".json", ".world.json")).read_text(encoding="utf-8"))["catalogs"]["features"]


def fresh(rules, path) -> BatchSim:
    def make() -> BatchSim:
        return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    return warm_base((str(path), "online_costs"), make)


def test_costs(sim) -> None:
    need = sim._growth_needed(torch.tensor([1, 2, 3, 4, 5, 6, 7, 10]))
    assert need.tolist() == [7, 12, 16, 22, 27, 33, 38, 57], need.tolist()
    cost = sim._border_cost(torch.tensor([0, 1, 2, 3, 4, 5, 7, 8, 10, 11]))
    assert cost.tolist() == [5, 10, 17, 26, 36, 46, 69, 81, 107, 120], cost.tolist()
    # the seat walk's own `need` is the same composer
    need_w = sim._seat_city_stats(0, record=False)[2][B0, 0]
    assert float(need_w) == float(sim._growth_needed(sim.city_pop[B0:B0 + 1, 0, 0])[0])
    print("  1-2 growth and border costs OK")


def test_culture_after_growth(sim) -> None:
    row, j = 0, 0
    cul = sim._seat_city_stats(row, record=False)[0][:, j, 4].clone()
    pop0 = sim.city_pop[:, row, j].clone()
    same = sim._culture_after_growth(row, j, pop0, cul)
    assert torch.equal(same, cul), "a column that did not grow was read again"
    sim.city_pop[:, row, j] += 1
    again = sim._culture_after_growth(row, j, pop0, cul)
    fresh_read = sim._seat_city_stats(row, record=False)[0][:, j, 4]
    assert float(again[B0]) == float(fresh_read[B0]), (float(again[B0]), float(fresh_read[B0]))
    assert float(again[B0]) > float(cul[B0]), "the new citizen paid no culture"
    sim.city_pop[:, row, j] -= 1
    print("  3 culture after growth OK")


def test_housing(sim) -> None:
    row = 0
    ctr = int(sim.city_center[B0, row, 0])
    cid = int(sim.city_id[B0, row, 0])
    own = [int(x) for x in sim.neigh[ctr].tolist()
           if x >= 0 and int(sim.tile_seat[B0, x]) == row and int(sim.tile_city[B0, x]) == cid]
    assert len(own) >= 3, "the capital holds too few plots"
    for t in own:
        sim.improvement[B0, t] = -1
    sim._eff_version += 1
    base = float(sim._seat_housing(row)[1][B0, 0])
    farm, pasture = IMPS.index("FARM"), IMPS.index("PASTURE")
    sim.improvement[B0, own[0]] = farm
    sim._eff_version += 1
    assert float(sim._seat_housing(row)[1][B0, 0]) == base, "one half paid housing"
    sim.improvement[B0, own[1]] = pasture
    sim._eff_version += 1
    assert float(sim._seat_housing(row)[1][B0, 0]) == base + 1, "a Farm and a Pasture pay 1"
    sim.improvement[B0, own[2]] = farm
    sim._eff_version += 1
    assert float(sim._seat_housing(row)[1][B0, 0]) == base + 1, "three halves pay 1"
    print("  4 whole improvement housing OK")


def test_floodplains(sim) -> None:
    cat_y = RULES["improvements"]["featCatalogY"]
    fp, fg, fpl = FEATS.index("FLOODPLAINS"), FEATS.index("FLOODPLAINS_GRASSLAND"), FEATS.index("FLOODPLAINS_PLAINS")
    assert cat_y[fp] == [2, 0, 0, 0, 0, 0], cat_y[fp]
    assert cat_y[fg] == [0] * 6 and cat_y[fpl] == [0] * 6
    assert cat_y[FEATS.index("GREAT_BARRIER_REEF")] == [3, 0, 0, 2, 0, 0]
    assert [bool(x) for x in sim._fp_feat[[fp, fg, fpl]]] == [True, True, True]
    assert int(sim._fp_feat.sum()) == 3, "a fourth feature reads as floodplains"
    assert [int(RULES["improvements"]["featDef"][f]) for f in (fp, fg, fpl)] == [-2, -2, -2]
    # a district leaves the grassland floodplains under it (`paveGround`)
    t = next(i for i in range(sim.T) if not bool(sim.water[B0, i]) and int(sim.feat_id[B0, i]) < 0)
    sim.feat_id[B0, t] = fg
    rows = torch.tensor([B0])
    sim._pave_plot(rows, torch.tensor([t]))
    assert int(sim.feat_id[B0, t]) == fg and not bool(sim.feat_stripped[B0, t]), "the floodplains was paved"
    print("  5 the floodplains and the Reef OK")


def test_great_wall(sim) -> None:
    gw = next(r for r in RULES["improvements"]["rows"] if r["id"] == "GREAT_WALL")
    assert gw["yields"][2] == 2, f"the segment own Gold: {gw['yields']}"
    adj = gw["adj"]
    masonry, castles = TECHS.index("MASONRY"), TECHS.index("CASTLES")
    assert [int(r["rt"]) for r in adj] == [masonry, castles], [r["rt"] for r in adj]
    assert all(int(r["rc"]) < 0 for r in adj), "a Great Wall row waits on a civic"
    mek = next(r for r in RULES["improvements"]["rows"] if r["id"] == "MEKEWAP")["adj"]
    assert any(int(r["rt"]) == TECHS.index("CARTOGRAPHY") for r in mek), "the Mekewap's luxury row waits on a civic"
    # two adjacent segments pay each other per the techs held
    row = 0
    ctr = int(sim.city_center[B0, row, 0])
    a = next(int(x) for x in sim.neigh[ctr].tolist() if x >= 0 and not bool(sim.water[B0, x]))
    b = next(int(x) for x in sim.neigh[a].tolist() if x >= 0 and x != ctr and not bool(sim.water[B0, x]))
    k = IMPS.index("GREAT_WALL")
    sim.improvement[B0, a] = k
    sim.improvement[B0, b] = k
    sim.pillaged[B0, a] = False
    sim.pillaged[B0, b] = False
    for tech, want in (((), (0, 0)), ((masonry,), (2, 0)), ((masonry, castles), (2, 2))):
        sim.civ_techs[B0, row, masonry] = False
        sim.civ_techs[B0, row, castles] = False
        for x in tech:
            sim.civ_techs[B0, row, x] = True
        sim._eff_version += 1
        out = sim._imp_adjacency(row)
        got = (0, 0) if out is None else (int(out[B0, a, 2]), int(out[B0, a, 4]))
        assert got == want, f"techs {tech}: got {got}, want {want}"
    print("  6 the Great Wall OK")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    for scene in (test_costs, test_culture_after_growth, test_housing, test_floodplains, test_great_wall):
        scene(fresh(rules, path))
    print("ONLINE COSTS OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
