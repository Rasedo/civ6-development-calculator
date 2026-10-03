"""THE GURU — the GPU half.

    python tests/gpu/guru_test.py

The TS twin is tests/cpu/units/guru.test.ts.

CIV6 (Units.xml UNIT_GURU): faith-only behind a Temple, ReligiousStrength 90,
4 Movement, three ReligiousHealCharges. "May use a charge to heal itself and
all adjacent friendly religious units. May not initiate theological combat
with units of other Religions (but can defend)." One charge heals
COMBAT_HEAL_RELIGIOUS_CHARGE 40.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from inquisitor_test import ROW, build, free_tile, order, place, religious_city  # noqa: E402


def test_the_wire(sim) -> None:
    g = sim._guru_idx
    assert g >= 0, "no GURU in the roster"
    assert int(sim._rel_strength[g]) == 90, "ReligiousStrength 90"
    assert int(sim._type_charges[g]) == 3, "three ReligiousHealCharges"
    assert sim._guru_heal == 40, "COMBAT_HEAL_RELIGIOUS_CHARGE 40"
    assert sim._A_HEAL_RELIGIOUS >= 0, "no HEAL_RELIGIOUS column"
    print("  1 the wire OK — a faith unit of strength 90 with three heal charges")


def test_purchase(sim) -> None:
    sim.civ_faith[:, ROW] = 9999.0
    sim.city_bldg[:, ROW, 0, sim._temple_bidx] = False
    sim._eff_version += 1
    *_, g_ok, _g_j = sim._seat_faith_buy_candidates(ROW, torch.ones(sim.B, dtype=torch.bool))
    assert not bool(g_ok[0]), "a Guru offered with no Temple"
    sim.city_bldg[:, ROW, 0, sim._temple_bidx] = True
    sim._eff_version += 1
    *_, g_ok, g_j = sim._seat_faith_buy_candidates(ROW, torch.ones(sim.B, dtype=torch.bool))
    assert bool(g_ok[0]) and int(g_j[0]) == 0, "the Guru is not on offer in the Temple city"
    before = int(sim.unit_next[0])
    sim._stash_buy(ROW, relig=(torch.full((sim.B,), 18, dtype=torch.long), g_j))
    sim._seat_buy_ladder(ROW, torch.ones(sim.B, dtype=torch.bool), torch.zeros(sim.B, dtype=torch.long))
    assert int(sim.unit_next[0]) == before + 1, "no Guru spawned"
    assert int(sim.major_unit_type[0, before]) == sim._guru_idx, "the purchase spawned the wrong chassis"
    assert int(sim.major_unit_charges[0, before]) == 3, "the Guru did not land with its heal charges"
    *_, g2, _gj2 = sim._seat_faith_buy_candidates(ROW, torch.ones(sim.B, dtype=torch.bool))
    assert not bool(g2[0]), "a second Guru offered past the cap"
    sim.major_unit_alive[0, before] = False
    sim._vacate("major", torch.tensor([0]), torch.tensor([before]))
    print("  2 the purchase OK — faith and a Temple, and the cap holds")


def test_heal(sim) -> None:
    # every religious unit off the board, so the scene's are the only ones
    rel = sim._rel_strength[sim.major_unit_type[0].clamp(min=0, max=sim.NU - 1)] > 0
    for slot in (sim.major_unit_alive[0] & rel).nonzero().flatten().tolist():
        sim.major_unit_alive[0, slot] = False
        sim._vacate("major", torch.tensor([0]), torch.tensor([slot]))
    ctr = int(sim.city_center[0, ROW, 0])
    tg = free_tile(sim, ctr)
    tm = free_tile(sim, tg)
    g = place(sim, tg, sim._guru_idx, ROW, charges=3)
    m = place(sim, tm, sim._missionary_idx, ROW, charges=2)
    col = sim._A_HEAL_RELIGIOUS
    smap = sim._seat_slot_map(ROW)
    rank = int((smap[0] == g + sim.POOL_LO["major"]).long().argmax())
    assert not bool(sim._seat_unit_mask(ROW)[0, rank, col]), "a heal offered with nobody wounded"
    sim.major_unit_hp[0, g] = 30
    sim.major_unit_hp[0, m] = 80
    assert bool(sim._seat_unit_mask(ROW)[0, rank, col]), "the heal shut with the Guru wounded"
    order(sim, ROW, g, col)
    assert int(sim.major_unit_hp[0, g]) == 70, "the Guru did not heal itself 40"
    assert int(sim.major_unit_hp[0, m]) == 100, "the Missionary beside it did not heal to full"
    assert int(sim.major_unit_charges[0, g]) == 2, "the heal spent no charge"
    assert int(sim.major_unit_mp[0, g]) == 0, "the heal did not end the Guru's turn"
    sim.major_unit_mp[0, g] = 4
    sim.major_unit_charges[0, g] = 0
    assert not bool(sim._seat_unit_mask(ROW)[0, rank, col]), "a heal offered with no charge"
    print("  3 the heal OK — itself and its neighbour, 40 each to full, a charge and the turn")


def main() -> int:
    sim = build()
    religious_city(sim)
    test_the_wire(sim)
    test_purchase(sim)
    test_heal(sim)
    print("BATTERY OK guru")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
