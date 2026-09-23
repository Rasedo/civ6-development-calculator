"""STAVE_CHURCH_SEA_RESOURCE_REQUIREMENTS on the GPU engine — the twin of
tests/cpu/city/sea-resource-visible.test.ts.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/sea_resource_visible_test.py

CIV6 (Buildings.xml): the set is REQUIRES_PLOT_HAS_VISIBLE_RESOURCE +
REQUIRES_PLOT_HAS_COAST, and two live modifiers ride it — the Stave Church's
+1 Production and the Aquarium's +1 Science. Checks, on Norway's capital
with every Coast neighbour carrying one strategic:
  A. the Aquarium's clause pays nothing while the row cannot see the
     strategic (`_res_hidden`) and +1 Science per tile once it can, for any
     civilization (a base row's clause);
  B. the Stave Church's Production the same way, for Norway alone;
  C. the Aquarium's Reef clause: +1 Science per Reef tile.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, fixture_paths  # noqa: E402
from engineer_test import clear_tile  # noqa: E402
from uniques_infra_test import fresh, play  # noqa: E402


def bump(sim) -> None:
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    sim = fresh(rules, path)
    row = 2  # Norway
    bids = [b["id"] for b in rules.buildings]
    aq, tb = bids.index("AQUARIUM"), sim._temple_bidx
    ctr = int(sim.city_center[0, row, 0])
    coast = [int(x) for x in sim.neigh[ctr].tolist() if x >= 0 and int(sim.terrain[0, x]) == sim._coast_terr
             and int(sim.tile_seat[0, x]) == row]
    if not coast:
        # an inland capital: turn the bare land neighbours into Coast tiles
        for x in sim.neigh[ctr].tolist():
            x = int(x)
            if x >= 0 and int(sim.tile_seat[0, x]) == row and not bool(sim.water[0, x]) and int(sim.district[0, x]) < 0:
                clear_tile(sim, x)
                sim.terrain[0, x] = sim._coast_terr
                sim.water[0, x] = True
                sim.hills[0, x] = False
                coast.append(x)
    assert coast, "the scene wants a Coast tile beside Norway's capital"
    rid = next(r for r in range(len(sim._res_reveal_tech)) if int(sim._res_reveal_tech[r]) >= 0)
    tech = int(sim._res_reveal_tech[rid])
    for x in coast:
        sim.res_id[0, x] = rid
        sim.res_stripped[0, x] = False
    sim.city_pop[0, row, 0] = 30  # every owned tile worked
    bump(sim)

    def clause(bi: int, k: int) -> float:
        """what building `bi` adds to the capital's yield `k`, the rest held."""
        one = torch.ones_like(sim._seat_amenity(row)[2])
        sim.city_bldg[0, row, 0, bi] = False
        bump(sim)
        y0 = float(sim._seat_city_walk(row, amen_yf=one)[0, 0, k])
        sim.city_bldg[0, row, 0, bi] = True
        bump(sim)
        y1 = float(sim._seat_city_walk(row, amen_yf=one)[0, 0, k])
        sim.city_bldg[0, row, 0, bi] = False
        bump(sim)
        return y1 - y0

    SCI, PROD = 3, 1
    n = float(len(coast))
    # -- A: the Aquarium ----------------------------------------------------
    sim.civ_techs[:, row, tech] = False
    bump(sim)
    assert bool(sim._res_hidden(row)[0, coast[0]]), "the planted strategic is not hidden before its tech"
    assert clause(aq, SCI) == 0.0, "the Aquarium paid Science on a strategic its row cannot see"
    sim.civ_techs[:, row, tech] = True
    bump(sim)
    assert clause(aq, SCI) == n, f"one Science per SEEN coastal resource tile ({clause(aq, SCI)} vs {n})"
    play(sim, row, None)
    bump(sim)
    assert clause(aq, SCI) == n, "a base row's clause pays every civilization"
    play(sim, row, "NORWAY")
    bump(sim)
    print(f"  A Aquarium OK (hidden 0, seen +{n})")

    # -- B: the Stave Church ------------------------------------------------
    sim.civ_techs[:, row, tech] = False
    bump(sim)
    assert clause(tb, PROD) == 0.0, "the Stave Church paid Production on a strategic its row cannot see"
    sim.civ_techs[:, row, tech] = True
    bump(sim)
    assert clause(tb, PROD) == n, f"one Production per SEEN coastal resource tile ({clause(tb, PROD)} vs {n})"
    print(f"  B Stave Church OK (hidden 0, seen +{n})")

    # -- C: the Reef --------------------------------------------------------
    fid = int(rules.buildings[aq]["plotFeat"])
    assert fid >= 0, "the Aquarium carries its Reef clause on the wire"
    for x in coast:
        sim.res_id[0, x] = -1
        sim.feat_id[0, x] = fid
        sim.feat_stripped[0, x] = False
    bump(sim)
    assert clause(aq, SCI) == n, f"one Science per Reef tile ({clause(aq, SCI)} vs {n})"
    print(f"  C Reef OK (+{n})")
    print("BATTERY OK sea_resource_visible")


if __name__ == "__main__":
    main()
