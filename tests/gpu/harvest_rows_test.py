"""THE HARVEST — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/harvest_rows_test.py

The TS twin is tests/cpu/seats/harvest-rows.test.ts.

CIV6 (Resource_Harvests): a Builder takes a resource off the tile for a
one-off lump. TS harvests with `tile.resource = null`, so the twin must take
the WHOLE resource off the tile — every baked flag that reads the tile's
resource has its resource-free value in `_nr_planes` (C-52).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths, simbase
from warmup import settle_all

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]


def fresh(rules, path) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    return settle_all(sim)


def test_column(rules, path) -> None:
    """The verb APPENDS: it must be the last column, or every hardcoded one
    below it addresses a different verb."""
    sim = fresh(rules, path)
    assert sim._A_HARVEST >= 0, "the action table carries no HARVEST"
    assert sim._A_HARVEST == len(sim._act_names) - 1, (
        "HARVEST must be the LAST column, found "
        f"{sim._A_HARVEST} of {len(sim._act_names)}")
    print("  1 the column OK — HARVEST appended last at", sim._A_HARVEST)


def test_catalog(rules, path) -> None:
    """The three harvest columns, straight off the install's table."""
    sim = fresh(rules, path)
    n = int(sim._res_harvest_y.numel())
    assert n == int(sim._res_harvest_amt.numel()) == int(sim._res_harvest_imp.numel())
    live = (sim._res_harvest_y >= 0).nonzero().flatten().tolist()
    assert len(live) == 10, f"the install lists ten harvestable rows, wire has {len(live)}"
    for r in live:
        amt = int(sim._res_harvest_amt[r])
        assert amt in (20, 40), f"resource {r} harvests {amt}, not the table 20/40"
        assert int(sim._res_harvest_imp[r]) >= 0, f"resource {r} names no improvement"
        # 40 is the GOLD rate; every 20 is a Food or Production row
        assert (amt == 40) == (int(sim._res_harvest_y[r]) == 2), f"resource {r} pays off-rate"
    print("  2 the catalog OK —", len(live), "harvestable rows, gold at double")


def _standing_builder(sim, row: int, at: int) -> int:
    """Spawn a builder on `at` and answer its COMPACTED slot in the seat map
    — the raw pool index is a different number, and the mask reads the map."""
    one = torch.ones(sim.B, dtype=torch.bool)
    sim._spawn_unit(row, one, torch.full((sim.B,), at, dtype=torch.long),
                    torch.full((sim.B,), UNITS.index("BUILDER"), dtype=torch.long))
    smap = sim._seat_slot_map(row)
    sc = smap[B0].clamp(min=0)
    live = ((smap[B0] >= 0)
            & (sim.unit_tile[B0, sc] == at)
            & (sim.unit_type[B0, sc] == UNITS.index("BUILDER")))
    hit = live.nonzero().flatten().tolist()
    assert hit, "the spawned builder is in no seat slot"
    # a spawned unit has no movement, and the order applier silences a unit
    # with none
    sim.unit_mp[B0, int(smap[B0, hit[-1]])] = sim._mp_scale
    return hit[-1]


def _wheat_tile(sim, row: int) -> int:
    """An owned tile beside the row's first city, carrying WHEAT."""
    ctr = int(sim.city_center[B0, row, 0])
    at = next(int(x) for x in sim.neigh[ctr].tolist() if x >= 0)
    wheat = next(r for r in range(int(sim._res_harvest_y.numel()))
                 if int(sim._res_harvest_y[r]) == 0 and int(sim._res_harvest_amt[r]) == 20)
    sim.res_id[B0, at] = wheat
    sim.res_cat[B0, at] = 1
    sim.res_priority[B0, at] = 1
    sim.res_stripped[B0, at] = False
    sim.improvement[B0, at] = -1
    sim.tile_seat[B0, at] = row
    sim.tile_city[B0, at] = int(sim.city_id[B0, row, 0])
    sim.civ_techs[B0, row, :] = True
    sim.civ_civics[B0, row, :] = True
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    return at


def _harvest(sim, row: int, slot: int) -> None:
    smap = sim._seat_slot_map(row)
    act = torch.full(smap.shape, -1, dtype=torch.long)
    act[B0, slot] = sim._A_HARVEST
    sim._apply_seat_unit_actions(row, act)


def test_mask(rules, path) -> None:
    """The mask offers the verb only on the row's OWN unstripped tile."""
    sim = fresh(rules, path)
    row = 1
    at = _wheat_tile(sim, row)
    slot = _standing_builder(sim, row, at)
    assert bool(sim._seat_unit_mask(row)[B0, slot, sim._A_HARVEST]), \
        "an owned WHEAT tile under a charged builder offered no HARVEST"

    # a tile the row does NOT own is refused
    sim.tile_seat[B0, at] = row + 1
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(row)[B0, slot, sim._A_HARVEST]), \
        "a foreign tile still offered HARVEST"
    sim.tile_seat[B0, at] = row
    sim._tile_owner_ver += 1

    # ...and so is one already stripped
    sim.res_stripped[B0, at] = True
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(row)[B0, slot, sim._A_HARVEST]), \
        "a stripped tile still offered HARVEST"
    print("  3 the mask OK — own tile, unstripped, charged builder")


def test_strip_is_total(rules, path) -> None:
    """A harvest nulls the resource, so every baked flag that read it takes
    its resource-free value — not just the stripped bit."""
    sim = fresh(rules, path)
    row = 1
    at = _wheat_tile(sim, row)
    slot = _standing_builder(sim, row, at)
    before = {p: getattr(sim, p)[B0, at].clone() for p, _ in sim._nr_planes}

    _harvest(sim, row, slot)

    assert bool(sim.res_stripped[B0, at]), "the harvest left the tile unstripped"
    assert int(sim.res_id[B0, at]) == -1, "the resource id survived the harvest"
    assert int(sim.res_imp[B0, at]) == -1, \
        "the tile still insists on the resource improvement"
    moved = 0
    for p, bare in sim._nr_planes:
        now = getattr(sim, p)[B0, at]
        assert bool(torch.equal(now, bare[B0, at])), \
            f"{p} did not take its resource-free value"
        if not bool(torch.equal(now, before[p])):
            moved += 1
    assert moved >= 3, f"only {moved} planes moved — a WHEAT scene should move several"
    print("  4 the strip OK —", moved, "baked planes took their resource-free value")


def test_harvested_planes_are_mutable(rules, path) -> None:
    """Every plane the harvest writes must be in `_MUTABLE`, or a restore
    leaks a harvested tile into the next game on that lane."""
    sim = fresh(rules, path)
    missing = [p for p, _ in sim._nr_planes if p not in simbase._MUTABLE]
    assert not missing, f"the harvest writes planes outside _MUTABLE: {missing}"
    print("  5 the registry OK —", len(sim._nr_planes), "harvested planes restorable")


def test_pays_the_acting_seat(rules, path) -> None:
    """The lump lands on the ACTING row. The TS body read and paid seat 0 for
    as long as nothing called it, so this is the pin on that fix."""
    sim = fresh(rules, path)
    row = 1
    at = _wheat_tile(sim, row)
    slot = _standing_builder(sim, row, at)
    row0 = sim.city_growth[B0, 0].clone()
    before = float(sim.city_growth[B0, row, 0])

    _harvest(sim, row, slot)

    assert float(sim.city_growth[B0, row, 0]) > before, \
        "the acting row's city box took no food"
    assert bool(torch.equal(sim.city_growth[B0, 0], row0)), \
        "row 0 was paid for a harvest it did not make"
    print("  6 the payee OK — the acting row banked the lump, row 0 untouched")


def test_charge_is_spent(rules, path) -> None:
    sim = fresh(rules, path)
    row = 1
    at = _wheat_tile(sim, row)
    slot = _standing_builder(sim, row, at)
    raw = int(sim._seat_slot_map(row)[B0, slot])
    before = int(sim.unit_charges[B0, raw])
    _harvest(sim, row, slot)
    # a builder on its LAST charge is disbanded, so a dead slot reads zero
    after = int(sim.unit_charges[B0, raw]) if bool(sim.unit_alive[B0, raw]) else 0
    assert after in (before - 1, 0), \
        f"the harvest spent {before - after} charges, not one"
    print("  7 the charge OK — one charge per harvest")


def test_the_ban(rules, path) -> None:
    """CIV6 (Mana): "Resources cannot be harvested." The refusal shipped on
    TS while nothing called the verb, so it refused something no game could
    reach — this is the lane that makes it mean something."""
    sim = fresh(rules, path)
    row = 1
    banned = [c for c, name in enumerate(sim._civ_ids)
              if any(r[0] == c and r[2] == sim.BAN_HARVEST
                     for r in sim._seat_ban_rows)]
    assert banned, "no civilization in the roster bans the harvest"
    at = _wheat_tile(sim, row)
    slot = _standing_builder(sim, row, at)
    assert bool(sim._seat_unit_mask(row)[B0, slot, sim._A_HARVEST]),         "the plain scene must offer the verb, or the ban proves nothing"

    sim.row_civ[B0, row] = banned[0]
    sim.row_leader[B0, row] = sim._pair_civ.index(banned[0])
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(row)[B0, slot, sim._A_HARVEST]),         "the banned civilization was still offered the harvest"

    # the APPLIER carries the ban too: the driver may order an illegal verb
    # and only the applier stands between it and the yield
    before = sim.res_id[B0, at].clone()
    _harvest(sim, row, slot)
    assert bool(torch.equal(sim.res_id[B0, at], before)),         "the applier harvested for a civilization the ban refuses"
    print("  8 the ban OK — mask and applier both refuse it")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_column(rules, path)
    test_catalog(rules, path)
    test_mask(rules, path)
    test_strip_is_total(rules, path)
    test_harvested_planes_are_mutable(rules, path)
    test_pays_the_acting_seat(rules, path)
    test_charge_is_spent(rules, path)
    test_the_ban(rules, path)
    print("BATTERY OK harvest_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
