"""A DISEMBARK PAYS NO RIVER CHARGE — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/disembark_river_test.py

The TS twin is tests/cpu/map/disembark-river.test.ts.

A river is an EDGE between two LAND tiles, so a unit stepping off the water
crosses none. `stepUnit` says it by construction — `riverCharge` rides the
NON-transition arm alone — but the twin folded the charge into the single
`land_cost` it used for BOTH arms, so a disembark onto a river tile cost
4 MP here and 1 MP on TS. That stranded a unit on the water for a turn and,
at seed 9235 t191, cost a whole theological combat (A-1r).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
ROW = 0


def build() -> BatchSim:
    return settle_all(BatchSim([load_fixture(fixture_paths()[0])], load_rules(),
                               device="cpu", dtype=torch.float64))


def _shore_pair(sim):
    """A land tile with a WATER neighbour, and the direction between them."""
    for t in range(sim.T):
        if bool(sim.water[B0, t]) or not bool(sim.passable[B0, t]):
            continue
        if int(sim.district[B0, t]) >= 0 or int(sim.centre_slot_at[B0, t]) >= 0:
            continue
        for d, n in enumerate(sim.neigh[t].tolist()):
            if n >= 0 and bool(sim.wpass[B0, n]) and not bool(sim.tile_submerged[B0, n]):
                # a HARBOR or a coastal centre docks the transition free, which
                # would hide the very charge this lane measures
                if int(sim.district[B0, n]) == sim._harbor_didx:
                    continue
                return t, int(n), d
    raise AssertionError("no shore pair in this fixture")


def _land_military(sim) -> int:
    """A LAND military chassis — the mover must match the `is_civ` the step
    is told, or the transition is measured on the wrong class."""
    for u in range(sim.NU):
        if (not bool(sim.unit_naval[u]) and not bool(sim._type_civilian[u])
                and not bool(sim.unit_water_walk[u]) and not bool(sim._type_air[u])):
            return u
    raise AssertionError("no land military chassis in the roster")


def test_disembark_ignores_the_river(rules=None, path=None) -> None:
    sim = build()
    land, sea, d_land_to_sea = _shore_pair(sim)
    back = sim.neigh[sea].tolist().index(land)

    # put a river on the edge the unit steps ACROSS, from both sides
    sim.river_mask[B0, land] |= (1 << d_land_to_sea)
    sim.river_mask[B0, sea] |= (1 << back)

    slot = int((~sim.major_unit_alive[B0]).nonzero().flatten()[0])
    gs = slot + sim.POOL_LO["major"]
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = ROW
    sim.major_unit_type[B0, slot] = _land_military(sim)
    sim.major_unit_tile[B0, slot] = sea
    sim.major_unit_emb[B0, slot] = True
    sim.major_unit_hp[B0, slot] = 100
    sim._occ_set(torch.tensor([B0]), torch.tensor([sea]), torch.tensor([gs]))

    utype = int(sim.unit_type[B0, gs])
    terr = int(sim._mp_scale) + int(
        sim._road_terms(torch.tensor([sea]), torch.tensor([land]),
                        torch.zeros(1, dtype=torch.long),
                        torch.tensor([utype]), torch.zeros(1, dtype=torch.long))[0][0])
    cost = terr + int(sim._embark_transition_mp)

    # EXACTLY the disembark's cost and not a point more: were the river
    # charged too, this would fall short and the unit would sit on the water
    sim.unit_mp[B0, gs] = cost
    sim.unit_mp_full[B0, gs] = cost
    ok = torch.zeros(sim.B, dtype=torch.bool)
    ok[B0] = True
    moved = sim._step_verb(
        ok, torch.full((sim.B,), gs, dtype=torch.long),
        torch.full((sim.B,), sea, dtype=torch.long),
        torch.full((sim.B,), land, dtype=torch.long),
        torch.full((sim.B,), back, dtype=torch.long),
        ROW, torch.zeros(sim.B, dtype=torch.bool))
    assert bool(moved[B0]), (
        f"the disembark was refused at mp {cost} — the river edge was charged "
        "on a step that crosses no river")
    assert int(sim.unit_tile[B0, gs]) == land, "the unit did not come ashore"
    assert not bool(sim.unit_emb[B0, gs]), "the unit stayed embarked ashore"
    print("  1 the disembark OK — terrain plus the transition, no river charge")


def test_a_land_step_still_pays_it(rules=None, path=None) -> None:
    """The negative control: between two LAND tiles the charge still applies,
    so the fix removed the term from ONE arm and not from the rule."""
    sim = build()
    land, sea, d_land_to_sea = _shore_pair(sim)
    # a land neighbour of `land`, across a river edge
    pair = [(d, int(n)) for d, n in enumerate(sim.neigh[land].tolist())
            if n >= 0 and not bool(sim.water[B0, n]) and bool(sim.passable[B0, n])
            and int(sim.district[B0, n]) < 0 and int(sim.centre_slot_at[B0, n]) < 0]
    assert pair, "no land neighbour to cross a river to"
    d_to, other = pair[0]
    sim.river_mask[B0, land] |= (1 << d_to)
    sim.river_mask[B0, other] |= (1 << sim.neigh[other].tolist().index(land))

    slot = int((~sim.major_unit_alive[B0]).nonzero().flatten()[0])
    gs = slot + sim.POOL_LO["major"]
    sim.major_unit_alive[B0, slot] = True
    sim.major_unit_seat[B0, slot] = ROW
    sim.major_unit_type[B0, slot] = _land_military(sim)
    sim.major_unit_tile[B0, slot] = land
    sim.major_unit_emb[B0, slot] = False
    sim.major_unit_hp[B0, slot] = 100
    sim._occ_set(torch.tensor([B0]), torch.tensor([land]), torch.tensor([gs]))

    utype = int(sim.unit_type[B0, gs])
    terr = int(sim._mp_scale) + int(
        sim._road_terms(torch.tensor([land]), torch.tensor([other]),
                        torch.zeros(1, dtype=torch.long),
                        torch.tensor([utype]), torch.zeros(1, dtype=torch.long))[0][0])
    # terrain alone is NOT enough where a river runs, and `full` must exceed it
    # too or the one-free-step allowance would carry the unit regardless
    sim.unit_mp[B0, gs] = terr
    sim.unit_mp_full[B0, gs] = terr + 1
    ok = torch.zeros(sim.B, dtype=torch.bool)
    ok[B0] = True
    moved = sim._step_verb(
        ok, torch.full((sim.B,), gs, dtype=torch.long),
        torch.full((sim.B,), land, dtype=torch.long),
        torch.full((sim.B,), other, dtype=torch.long),
        torch.full((sim.B,), d_to, dtype=torch.long),
        ROW, torch.zeros(sim.B, dtype=torch.bool))
    assert not bool(moved[B0]), "a land step across a river stopped paying the charge"
    print("  2 the land step OK — the river is still charged between two land tiles")


def main() -> int:
    test_disembark_ignores_the_river()
    test_a_land_step_still_pays_it()
    print("BATTERY OK disembark_river")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
