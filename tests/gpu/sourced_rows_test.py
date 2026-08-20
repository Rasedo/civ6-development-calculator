"""THE ROWS THAT CARRIED AN AUTHORED MAGNITUDE until their real text was read.

    python tests/gpu/sourced_rows_test.py

CIV 6:
  Monument (R&F/GS)  "+1 Loyalty. +1 Culture. +1 additional Culture if city
                     is at maximum Loyalty." (the flat +2 Culture is VANILLA)
  Lighthouse         "+1 Food. +1 Food in Coast and Lake tiles controlled by
                     the city. +1 Gold. +1 Housing."
  Military Engineer  "It can only be built in a city that has an Encampment
                     with an Armory."

The serve gate reaches a Monument on every seed and a Lighthouse on coastal
ones, so parity covers the arithmetic; what it does NOT cover is the
CONDITION on each — a city one point below maximum loyalty, a landlocked
Lighthouse, an Armory-less city holding the tech. That is this lane's bar.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(8):
        sim.step()
    return sim


def walk(sim, row: int) -> torch.Tensor:
    """[B, RC, 6] — the per-city yield walk, with the amenity factor the seat
    phase would hand it."""
    return sim._seat_city_walk(row, amen_yf=sim._seat_amenity(row)[2])


def bidx(name: str) -> int:
    """The building catalog is exported as a LIST; its position is the wire
    index every plane uses."""
    import json
    r = json.load(open(Path(__file__).resolve().parent.parent.parent
                       / "seeder" / "worlds" / "rules.json", encoding="utf-8"))
    for i, b in enumerate(r["buildings"]):
        if b["id"] == name:
            return i
    raise AssertionError(f"no {name} in the building catalog")


def main() -> None:
    sim = build()
    rd = sim.rules
    row, col = 0, 0
    assert bool(sim.city_alive[0, row, col]), "seat 0 holds no city"

    # --- the catalog flags, which the wire carries -------------------------
    mon, lh = bidx("MONUMENT"), bidx("LIGHTHOUSE")
    assert bool(rd.b_maxloy_culture[mon]), "the Monument lost its max-loyalty clause"
    assert float(rd.b_loyalty[mon]) == 1.0, "the Monument's +1 Loyalty is not in the catalog"
    assert float(rd.b_yields[mon][4]) == 1.0, "the Monument still pays the VANILLA +2 culture"
    assert bool(rd.b_coastfood[lh]), "the Lighthouse lost its coast-tile food"
    assert not bool(rd.b_coastfood[mon]) and not bool(rd.b_maxloy_culture[lh]), "the flags crossed rows"
    assert sim._coast_food_terr, "no terrain carries the Lighthouse food"
    print("  the three flags ride the wire, on the rows that own them")

    # --- the Monument's loyalty, and its conditional culture ---------------
    b = torch.zeros(1, dtype=torch.long)
    c = torch.zeros(1, dtype=torch.long)
    sim.city_bldg[0, row, col, :] = False
    assert float(sim._building_loyalty(row, b, c)[0]) == 0.0
    sim.city_bldg[0, row, col, mon] = True
    assert float(sim._building_loyalty(row, b, c)[0]) == 1.0, "the Monument pays no loyalty"

    # The city walk's culture carries the empire's culture MULTIPLIER, so the
    # extra point is measured against the Monument's own flat point rather
    # than against 1: both cross the same multiplier.
    sim.city_loyalty[0, row, col] = sim._loyalty_max - 1
    sim.city_bldg[0, row, col, mon] = False
    sim._eff_version += 1
    c0 = walk(sim, row)[0, col, 4].item()
    sim.city_bldg[0, row, col, mon] = True
    sim._eff_version += 1
    c1 = walk(sim, row)[0, col, 4].item()
    sim.city_loyalty[0, row, col] = sim._loyalty_max
    sim._eff_version += 1
    c2 = walk(sim, row)[0, col, 4].item()
    assert c1 > c0, "the Monument paid no culture at all"
    assert abs((c2 - c1) - (c1 - c0)) < 1e-9, (
        f"the max-loyalty point is {c2 - c1}, not the flat point {c1 - c0}")
    print("  the Monument pays +1 loyalty, and its extra culture only at the maximum")

    # --- the Lighthouse, per Coast/Lake tile the city works ----------------
    sim2 = build()
    ctr = int(sim2.city_center[0, row, col])
    ring = [int(t) for t in sim2.neigh[ctr] if int(t) >= 0]
    assert len(ring) >= 2, "the centre has no ring"
    wet = sim2._coast_food_terr[0]
    for t in ring[:2]:
        sim2.terrain[0, t] = wet
        sim2.tile_seat[0, t] = row
        sim2.tile_city[0, t] = int(sim2.city_id[0, row, col])
        sim2.district[0, t] = -1
    sim2.city_pop[0, row, col] = 2
    sim2._eff_version += 1
    sim2.city_bldg[0, row, col, :] = False
    before = walk(sim2, row)[0, col, 0].item()
    sim2.city_bldg[0, row, col, lh] = True
    sim2._eff_version += 1
    after = walk(sim2, row)[0, col, 0].item()
    flat = float(rd.b_yields[lh][0])
    # the flat row yield plus one per WORKED wet tile; the walk chooses which
    # tiles are worked, so the gain must sit between the flat term and flat+2
    assert after - before >= flat, "the Lighthouse paid less than its own row"
    assert after - before <= flat + 2 + 1e-9, "the Lighthouse paid more than its worked wet tiles"
    print(f"  the Lighthouse pays its row plus {after - before - flat:.0f} worked Coast/Lake tiles")

    # a LANDLOCKED Lighthouse pays only its row
    sim3 = build()
    dry = [t for t in range(sim3.T) if int(sim3.terrain[0, t]) not in sim3._coast_food_terr]
    assert dry
    for t in [int(x) for x in sim3.neigh[int(sim3.city_center[0, row, col])] if int(x) >= 0]:
        sim3.terrain[0, t] = sim3.terrain[0, dry[0]]
    sim3.city_bldg[0, row, col, :] = False
    sim3._eff_version += 1
    b0 = walk(sim3, row)[0, col, 0].item()
    sim3.city_bldg[0, row, col, lh] = True
    sim3._eff_version += 1
    b1 = walk(sim3, row)[0, col, 0].item()
    assert abs((b1 - b0) - flat) < 1e-9, "a landlocked Lighthouse still paid a tile bonus"
    print("  a Lighthouse with no Coast or Lake in the window pays only its row")

    # --- the Military Engineer's Armory ------------------------------------
    sim4 = build()
    me = next((i for i, u in enumerate(sim4.rules.units) if u["id"] == "MILITARY_ENGINEER"), -1)
    assert me >= 0, "no Military Engineer in the roster"
    armory = int(sim4._type_req_bldg[me])
    assert armory == bidx("ARMORY"), "the Engineer names no Armory"
    per_city = sim4._type_civic_slot_ok(row, True)
    sim4.city_bldg[0, row, col, armory] = False
    assert not bool(sim4._type_civic_slot_ok(row, True)[0, col, me]), "no Armory, yet trainable"
    sim4.city_bldg[0, row, col, armory] = True
    assert bool(sim4._type_civic_slot_ok(row, True)[0, col, me]), "an Armory did not open the column"
    # and the gate is the ENGINEER's alone
    other = next(i for i in range(len(sim4.rules.units)) if int(sim4._type_req_bldg[i]) < 0)
    sim4.city_bldg[0, row, col, armory] = False
    assert bool(per_city[0, col, other]) == bool(sim4._type_civic_slot_ok(row, True)[0, col, other]), \
        "the Armory gate leaked onto another unit"
    print("  the Military Engineer needs its Armory, and nothing else does")

    print("SOURCED ROWS OK — the Monument's loyalty and its conditional culture, the "
          "Lighthouse's Coast/Lake food, and the Engineer's Armory")


if __name__ == "__main__":
    main()
