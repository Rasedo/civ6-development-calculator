"""THE APPLIER READS OWNERSHIP LIVE, RANK BY RANK (AUDIT A-5).

    python tests/gpu/applier_live_ownership_test.py

TS replays a seat's unit orders one unit at a time against LIVE state
(`applySeatUnitOrders`): a Settler founding at rank k writes `ownerSeat` on
the centre and its ring, and a Builder at rank k+1 reads that ownership when
its improvement verb asks "is this tile mine". The GPU's
`_apply_seat_unit_actions` once took `own_tile = tile_seat == row` ONCE before
its rank loop, so the Builder was refused the ground its own seat had just
claimed. Two scenes, one seat turn each:

  1. Settler at the LOWER rank founds, Builder at the HIGHER rank farms a
     tile the founding claimed — the Farm must land.
  2. The same two units with the ranks SWAPPED — the Builder acts first, on
     ground nobody owns yet, and is refused; the founding then claims it.
     Sequence order is a FACT on both engines, so this half pins that the
     fix re-reads per rank rather than pre-claiming.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from warmup import settle_all  # noqa: E402


def fresh(rules, path, turns=30):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def live_units(sim, row):
    return [v for v in range(sim.major_unit_alive.shape[1])
            if bool(sim.major_unit_alive[0, v]) and int(sim.major_unit_seat[0, v]) == row]


def spawn(sim, row, ty, tile):
    """the engine's own spawn (it APPENDS, so slot order is creation order —
    the rank order the applier walks); returns the new unit's pool slot."""
    before = set(live_units(sim, row))
    ok = sim._spawn_unit(row, torch.ones(sim.B, dtype=torch.bool),
                         torch.full((sim.B,), tile, dtype=torch.long), ty)
    assert bool(ok[0]), f"spawn of type {ty} at {tile} refused"
    new = sorted(set(live_units(sim, row)) - before)
    assert len(new) == 1, f"spawn added {len(new)} units"
    v = new[0]
    sim.major_unit_mp[0, v] = float(sim._type_moves[ty])
    sim.major_unit_charges[0, v] = int(sim._type_charges[ty])
    sim._gen_ver += 1
    return v


def kill(sim, row, v):
    lo = sim.POOL_LO["major"]
    here = int(sim.major_unit_tile[0, v])
    sim._occ_clear(torch.tensor([0]), torch.tensor([here]), torch.tensor([v + lo]))
    sim.major_unit_alive[0, v] = False
    sim._gen_ver += 1


def rank_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[0]
    return int((smap == slot).nonzero(as_tuple=True)[0][0])


def clear_tile(sim, t):
    sim.improvement[0, t] = -1
    sim.district[0, t] = -1
    sim.built_wonder[0, t] = -1
    sim.pillaged[0, t] = False
    sim.feat_stripped[0, t] = True
    sim.road[0, t] = False
    sim._eff_version += 1


def bare_land(sim, t) -> bool:
    return (int(sim.tile_seat[0, t]) < 0 and not bool(sim.water[0, t]) and bool(sim.passable[0, t])
            and not bool(sim.hills[0, t]) and int(sim.res_imp[0, t]) < 0
            and int(sim.centre_slot_at[0, t]) < 0 and int(sim.district[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and int(sim.military_at[0, t]) < 0
            and int(sim.civilian_at[0, t]) < 0 and int(sim.support_at[0, t]) < 0)


def scene(rules, path, settler_first: bool):
    """Return (sim, row, centre, farm tile, settler slot, builder slot) with
    both units standing; the one SPAWNED first holds the lower slot, which is
    the lower rank."""
    row = 1
    sim = fresh(rules, path)
    SET, BLD = sim._settler_idx, sim._builder_idx
    assert SET >= 0 and BLD >= 0 and sim._A_FOUND >= 0, "the roster lacks a settler, a builder or the FOUND verb"
    # a NEUTRAL flat plot the founding accepts, with a neutral flat neighbour
    # a Farm may stand on
    for t in range(sim.T):
        if not bare_land(sim, t):
            continue
        nbs = [n for n in sim.neigh[t].tolist() if n >= 0 and bare_land(sim, n)]
        if not nbs:
            continue
        clear_tile(sim, t)
        probe = spawn(sim, row, SET, t)
        found_ok = bool(sim._seat_unit_mask(row)[0, rank_of(sim, row, probe)][sim._A_FOUND])
        kill(sim, row, probe)
        if not found_ok:
            continue
        for n in nbs:
            clear_tile(sim, n)
            # the FARM's own ground plane (`_farm_ground`: the exporter's flat
            # farm terrains) — the generic ground clause is not the Farm's
            if not bool(sim.farm_flat[0, n]):
                continue
            if settler_first:
                s_slot = spawn(sim, row, SET, t)
                b_slot = spawn(sim, row, BLD, n)
            else:
                b_slot = spawn(sim, row, BLD, n)
                s_slot = spawn(sim, row, SET, t)
            return sim, row, t, n, s_slot, b_slot
    raise AssertionError("no neutral plot on this fixture founds a city beside a farmable neighbour")


def run(rules, path, settler_first: bool):
    sim, row, centre, farm, s_slot, b_slot = scene(rules, path, settler_first)
    assert int(sim.tile_seat[0, farm]) < 0, "the farm tile must start UNOWNED"
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, s_slot)] = sim._A_FOUND
    acts[0, rank_of(sim, row, b_slot)] = sim._A_IMP[sim.FARM]
    assert (rank_of(sim, row, s_slot) < rank_of(sim, row, b_slot)) == settler_first, "the ranks are not in the order the scene asked"
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)
    assert int(sim.centre_slot_at[0, centre]) >= 0, "the founding did not happen"
    assert int(sim.tile_seat[0, farm]) == row, "the founding did not claim the farm tile"
    return sim, farm


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]

    sim, farm = run(rules, path, settler_first=True)
    assert int(sim.improvement[0, farm]) == sim.FARM, (
        "A-5: the Builder at the later rank was refused the tile its own seat's "
        "founding claimed one rank earlier — ownership was read once, before the loop")
    print("  1 settler then builder OK — the Farm lands on ground claimed this same turn")

    sim, farm = run(rules, path, settler_first=False)
    assert int(sim.improvement[0, farm]) < 0, (
        "the Builder at the EARLIER rank improved ground nobody owned yet — the "
        "applier pre-claimed instead of reading per rank")
    print("  2 builder then settler OK — refused on neutral ground, claimed after")
    print("APPLIER LIVE OWNERSHIP OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
