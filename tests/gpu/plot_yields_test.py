"""THE ROSTER'S PLOT YIELD ROWS — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/plot_yields_test.py

The TS twin is tests/cpu/seats/plot-yields.test.ts.

CIV6 (EFFECT_ADJUST_PLOT_YIELD, the install's TraitModifiers): Mother
Russia's tundra, Laurier's Last Best West, Mali's mines, Mana's improved
Woods and Rainforest with its two civic steps, Mit'a's mountains — paid by
`_plot_yield_plane` inside `_seat_tile_add`, the seat's civilization or
leader alone, gated on the civic held and the world era.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
IMPS = RULES["improvements"]["ids"]
CIVICS = [c["id"] for c in RULES["civics"]]


def play(sim, row: int, name):
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


OPEN = ["DESERT", "PLAINS", "GRASSLAND", "TUNDRA"]  # `OPEN_TERRAINS`' order on the wire


def terr_idx(sim, name: str) -> int:
    """A terrain index off the wire: the open-terrain list, or Snow from
    Laurier's own rows (the wire carries no terrain id list)."""
    if name in OPEN:
        return int(RULES["uniques"]["openTerrains"][OPEN.index(name)])
    assert name == "SNOW"
    tundra = terr_idx(sim, "TUNDRA")
    laurier = [i for i, l in enumerate(RULES["uniques"]["leaders"]) if l == "LAURIER"][0]
    snow = {int(t) for t, ld in zip(sim._py_terr.tolist(), sim._py_leader.tolist()) if ld == laurier and int(t) != tundra}
    assert len(snow) == 1, snow
    return snow.pop()


def own_plot(sim, row: int) -> int:
    ok = (~sim.water[B0] & sim.passable[B0] & (sim.tile_seat[B0] == row) & (sim.centre_slot_at[B0] < 0)
          & (sim.district[B0] < 0) & (sim.improvement[B0] < 0) & ~sim.tile_mountain[B0])
    return int(ok.nonzero(as_tuple=True)[0][0])


def add(sim, row: int, t: int) -> list[float]:
    sim._eff_version += 1
    return sim._seat_tile_add(row)[B0, t].tolist()


def stamp(sim, t: int, *, terrain: str | None = None, hills: bool | None = None, imp: str | None = None,
          feat: int | None = None, mountain: bool | None = None) -> None:
    if terrain is not None:
        sim.terrain[B0, t] = terr_idx(sim, terrain)
    if hills is not None:
        sim.hills[B0, t] = hills
    if imp is not None:
        sim.improvement[B0, t] = IMPS.index(imp)
        sim.pillaged[B0, t] = False
    if feat is not None:
        sim.feat_id[B0, t] = feat
        sim.feat_stripped[B0, t] = False
    if mountain is not None:
        sim.tile_mountain[B0, t] = mountain
    sim._eff_version += 1


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert sim._plot_rows_any and int(sim._py_civ.numel()) == 31, "the 31 rows are not on the wire"
    who = (sim._py_civ >= 0) | (sim._py_leader >= 0)
    assert bool(who.all()), "a row names neither a civilization nor a leader"
    print("  1 wire OK — 31 rows")


def test_russia(rules, path) -> None:
    sim = fresh(rules, path)
    t = own_plot(sim, 0)
    stamp(sim, t, terrain="TUNDRA", hills=False)
    before = add(sim, 0, t)
    play(sim, 0, "RUSSIA")
    after = add(sim, 0, t)
    assert after[5] - before[5] == 1 and after[1] - before[1] == 1, (before, after)
    stamp(sim, t, hills=True)
    hill = add(sim, 0, t)
    assert hill[5] - before[5] == 1 and hill[1] - before[1] == 1, "the hills row"
    stamp(sim, t, terrain="GRASSLAND")
    assert add(sim, 0, t)[5] == before[5], "grassland paid Russia's tundra"
    assert add(sim, 1, t) == before, "the other seat holds nothing"
    print("  2 Mother Russia OK — tundra flat and hills, Faith and Production")


def test_laurier(rules, path) -> None:
    sim = fresh(rules, path)
    t = own_plot(sim, 0)
    stamp(sim, t, terrain="TUNDRA", hills=False, imp="MINE")
    before = add(sim, 0, t)
    play(sim, 0, "CANADA")
    assert sim._row_leads(0, "LAURIER").tolist() == [True]
    assert add(sim, 0, t)[1] - before[1] == 2, "a Mine on Tundra"
    stamp(sim, t, imp="FARM")
    b2 = add(sim, 1, t)
    assert add(sim, 0, t)[0] - b2[0] == 2, "a Farm on Tundra"
    sim.pillaged[B0, t] = True
    assert add(sim, 0, t)[0] == add(sim, 1, t)[0], "a pillaged Farm paid"
    sim.pillaged[B0, t] = False
    stamp(sim, t, terrain="SNOW", hills=True, imp="LUMBER_MILL")
    b3 = add(sim, 1, t)
    assert add(sim, 0, t)[1] - b3[1] == 2, "a Lumber Mill on Snow Hills"
    stamp(sim, t, terrain="GRASSLAND", hills=False)
    assert add(sim, 0, t)[1] == add(sim, 1, t)[1], "off the tundra"
    print("  3 Last Best West OK — +2 on the four improvements, tundra and snow")


def test_mali(rules, path) -> None:
    sim = fresh(rules, path)
    t = own_plot(sim, 0)
    stamp(sim, t, hills=True, imp="MINE")
    before = add(sim, 1, t)
    play(sim, 0, "MALI")
    after = add(sim, 0, t)
    assert after[1] - before[1] == -1 and after[2] - before[2] == 4, (before, after)
    print("  4 Songs of the Jeli OK — a Mine pays -1 Production, +4 Gold")


def test_maori(rules, path) -> None:
    sim = fresh(rules, path)
    t = own_plot(sim, 0)
    woods = int(sim._woods_feat)
    stamp(sim, t, feat=woods)
    play(sim, 0, "MAORI")
    bare = add(sim, 0, t)
    other = add(sim, 1, t)
    assert bare[1] == other[1], "an unimproved Woods paid Mana"
    stamp(sim, t, imp="LUMBER_MILL")
    other = add(sim, 1, t)
    assert add(sim, 0, t)[1] - other[1] == 1, "+1 on an improved Woods"
    sim.civ_civics[B0, 0, CIVICS.index("MERCANTILISM")] = True
    assert add(sim, 0, t)[1] - other[1] == 2, "+1 more at Mercantilism"
    sim.civ_civics[B0, 0, CIVICS.index("CONSERVATION")] = True
    assert add(sim, 0, t)[1] - other[1] == 4, "+2 more at Conservation"
    print("  5 Mana OK — improved Woods +1, +1 at Mercantilism, +2 at Conservation")


def test_inca(rules, path) -> None:
    sim = fresh(rules, path)
    play(sim, 0, "INCA")
    t = int((sim.tile_mountain[B0] & ~sim.passable[B0]).nonzero(as_tuple=True)[0][0])
    # CIV6 (Mit'a): a MOUNTAIN row rides its own plane, since the tile-add
    # mask refuses impassable ground — the TS twin is `tileYields`' mountain arm
    assert sim._plot_yield_plane(0)[B0, t].tolist()[1] == 0.0, "a mountain row rode the general plane"
    mtn = sim._mountain_yield_plane(0)[B0, t].tolist()
    assert mtn[1] >= 2, "the mountain row is not paid into its own plane"
    assert add(sim, 0, t)[1] == mtn[1], "the tile add lost the mountain's yield"
    play(sim, 0, "ROME")
    assert sim._mountain_yield_plane(0) is None or float(sim._mountain_yield_plane(0)[B0, t, 1]) == 0.0,         "a plain seat took the mountain's yield"
    print("  6 Mit'a OK — the mountain rows pay on their own plane, the Inca alone")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_russia(rules, path)
    test_laurier(rules, path)
    test_mali(rules, path)
    test_maori(rules, path)
    test_inca(rules, path)
    print("BATTERY OK plot_yields")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
