"""The city-combat formulas, GPU side.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/city_perimeter_test.py

The TS twins are tests/cpu/units/city-combat.test.ts and
tests/cpu/religion/theological-combat.test.ts. The serve gate never reaches a
walled city under attack — the scripted rollout builds no Walls and fields no
Apostle pair — so this lane is the only proof these bodies agree with the pages
they came from:

  1. `_wound` is CIV6's `round(10 - HP/10)`: 30 HP loses 7, 1 HP loses 10.
  2. `_city_damage_split` reproduces all four bands City combat (Civ6) states,
     and takes -85% off a melee hit to the perimeter, -50% off a ranged one.
  3. `_ranged_city_penalty` charges land ranged -17 always and naval ranged
     only while a perimeter stands.
  4. A melee assault and a ranged bombardment both damage the perimeter AND
     the centre out of one roll, drawing no more than before.
  5. Theological combat rolls `_damage_roll` on the wounded religious-strength
     difference — two draws per fight, ahead of the martyr rolls.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build(rules, path, turns: int = 8):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def L(sim, x) -> torch.Tensor:
    return torch.tensor([x], dtype=torch.long, device=sim.device)


def test_wound(sim) -> None:
    hp = torch.tensor([100, 30, 1, 0], dtype=torch.long)
    got = sim._wound(hp).tolist()
    assert got == [0.0, 7.0, 10.0, 10.0], f"_wound = {got}, want [0, 7, 10, 10]"
    every = sim._wound(torch.arange(0, 101, dtype=torch.long))
    assert bool((every == every.round()).all()), "the wound penalty must land on integers"
    print("  wound OK: round(10 - HP/10) — 30 HP loses 7, 1 HP loses 10, always integral")


def test_split(sim) -> None:
    W = sim._walls_hp
    roll = L(sim, 30)
    bands = {
        W: 1,                       # intact: "1 damage only"
        int(0.8 * W): 8,            # "not more than 5-10 damage per attack"
        int(0.25 * W): 30,          # breached: full damage
        0: 30,                      # no perimeter at all
    }
    for outer, want in bands.items():
        _, centre = sim._city_damage_split(L(sim, outer), roll, "ranged")
        assert int(centre) == want, f"outer {outer}/{W}: centre {int(centre)}, want {want}"
    _, half = sim._city_damage_split(L(sim, W // 2), roll, "ranged")
    assert 8 < int(half) < 30, f"a half-down perimeter should reduce but not stop: {int(half)}"

    wall_m, _ = sim._city_damage_split(L(sim, W), L(sim, 40), "melee")
    wall_r, _ = sim._city_damage_split(L(sim, W), L(sim, 40), "ranged")
    assert int(wall_m) == 6, f"melee should take 15% of 40: {int(wall_m)}"
    assert int(wall_r) == 20, f"ranged should take 50% of 40: {int(wall_r)}"
    capped, _ = sim._city_damage_split(L(sim, 3), L(sim, 40), "ranged")
    assert int(capped) == 3, f"the perimeter share must cap at the pool: {int(capped)}"
    none, full = sim._city_damage_split(L(sim, 0), L(sim, 40), "melee")
    assert int(none) == 0 and int(full) == 40, "an unwalled city loses nothing to a pool it has not got"
    print(f"  split OK: 1 / 8 / reduced / full across the four bands, -85% melee and -50% ranged (walls {W})")


def test_ranged_penalty(sim) -> None:
    land = next(i for i in range(sim.NU)
                if float(sim._type_ranged_strength[i]) > 0 and not bool(sim.unit_naval[i]))
    naval = next((i for i in range(sim.NU)
                  if float(sim._type_ranged_strength[i]) > 0 and bool(sim.unit_naval[i])), -1)
    assert naval >= 0, "no naval ranged unit in the roster"
    for outer in (sim._walls_hp, 0):
        got = float(sim._ranged_city_penalty(L(sim, land), L(sim, outer))[0])
        assert got == sim._ranged_city_pen, f"land ranged owes the full penalty at outer {outer}: {got}"
    assert float(sim._ranged_city_penalty(L(sim, naval), L(sim, sim._walls_hp))[0]) == sim._ranged_city_pen
    assert float(sim._ranged_city_penalty(L(sim, naval), L(sim, 0))[0]) == 0.0
    print(f"  penalty OK: land ranged always -{int(sim._ranged_city_pen)}, naval ranged only against Walls")


def scene(rules, path, walls: bool):
    """A seat-0 city at war with civ row 1, one attacker adjacent to the centre.
    Returns (sim, slot, ctr)."""
    sim = build(rules, path)
    ctr = int(sim.city_center[0, 0, 0])
    assert ctr >= 0, "no seat-0 capital"
    _pl = sim.military_at[0]
    _pl[(_pl >= sim.POOL_LO["barb"]) & (_pl < sim.POOL_HI["barb"])] = -1
    sim.barb_unit_alive[0, :] = False
    sim.n_camps[0] = sim.max_camps[0]
    sim.city_bldg[0, 0, 0, sim._walls_bidx] = walls
    sim.city_outer_hp[0, 0, 0] = sim._walls_hp if walls else 0
    sim.city_hp[0, 0, 0] = 200
    free = ((sim.pair_dist[ctr].to(torch.long) == 1)
            & (sim.military_at[0] < 0) & sim.passable[0]).nonzero(as_tuple=True)[0]
    assert len(free) > 0, "no free adjacent tile for the attacker"
    tile = int(free[0])
    slot = int((~sim.major_unit_alive[0]).nonzero(as_tuple=True)[0][0])
    sim.military_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_seat[0, slot] = 1
    sim.major_unit_emb[0, slot] = False
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()
    return sim, slot, ctr


def test_assault(rules, path) -> None:
    # MELEE, walls up: the centre takes 1 and the perimeter takes the rest
    sim, slot, ctr = scene(rules, path, walls=True)
    ty = int(torch.tensor([c if (not bool(sim._type_civilian[i]) and float(sim._type_ranged_strength[i]) <= 0
                                 and not bool(sim.unit_naval[i])) else -1
                           for i, c in enumerate(sim._type_combat.tolist())]).argmax())
    sim.major_unit_type[0, slot] = ty
    before_rng = int(sim.rng_state[0])
    sim._melee_city(torch.tensor([True]), L(sim, ctr), "major", slot)
    assert int(sim.city_hp[0, 0, 0]) == 199, f"an intact perimeter must hold the centre to 1: {int(sim.city_hp[0, 0, 0])}"
    lost = sim._walls_hp - int(sim.city_outer_hp[0, 0, 0])
    assert 0 < lost < sim._walls_hp // 2, f"the perimeter took {lost} — the melee reduction is missing"
    assert int(sim.rng_state[0]) != before_rng, "the assault drew nothing"
    print(f"  melee OK: centre 200 -> 199, perimeter -{lost} out of the SAME roll")

    # MELEE, no walls: the whole roll lands on the centre
    sim2, slot2, ctr2 = scene(rules, path, walls=False)
    sim2.major_unit_type[0, slot2] = ty
    sim2._melee_city(torch.tensor([True]), L(sim2, ctr2), "major", slot2)
    assert int(sim2.city_hp[0, 0, 0]) < 190, "an unwalled centre must take the whole roll"
    assert int(sim2.city_outer_hp[0, 0, 0]) == 0
    print(f"  unwalled OK: centre 200 -> {int(sim2.city_hp[0, 0, 0])}")

    # RANGED: the bombardment reaches the perimeter too
    sim3, slot3, ctr3 = scene(rules, path, walls=True)
    rty = next(i for i in range(sim3.NU)
               if float(sim3._type_ranged_strength[i]) > 0 and not bool(sim3.unit_naval[i]))
    sim3.major_unit_type[0, slot3] = rty
    sim3._ranged_attack(torch.tensor([True]), L(sim3, ctr3), "major", slot3, 1)
    assert int(sim3.city_outer_hp[0, 0, 0]) < sim3._walls_hp, "a ranged hit never touched the perimeter"
    assert int(sim3.city_hp[0, 0, 0]) == 199, "a ranged hit through an intact perimeter must do 1"
    print(f"  ranged OK: perimeter {sim3._walls_hp} -> {int(sim3.city_outer_hp[0, 0, 0])}, centre 200 -> 199")


def test_theological(rules, path) -> None:
    sim = build(rules, path)
    assert sim._apostle_idx >= 0, "no APOSTLE in the roster"
    miss = sim._missionary_idx
    assert miss >= 0, "no MISSIONARY in the roster"
    free = [int(t) for t in range(sim.T)
            if bool(sim.passable[0, t]) and int(sim.civilian_at[0, t]) < 0 and int(sim.military_at[0, t]) < 0]
    a = next(t for t in free if any(int(n) in free and int(n) != t for n in sim.neigh[t].tolist() if n >= 0))
    b = next(int(n) for n in sim.neigh[a].tolist() if n >= 0 and int(n) in free)
    sa, sb = int(sim.unit_next[0]), int(sim.unit_next[0]) + 1
    sim.unit_next[0] += 2
    for slot, tile, seat, ty in ((sa, a, 0, sim._apostle_idx), (sb, b, 1, miss)):
        sim.major_unit_alive[0, slot] = True
        sim.major_unit_seat[0, slot] = seat
        sim.major_unit_type[0, slot] = ty
        sim.major_unit_tile[0, slot] = tile
        sim.major_unit_hp[0, slot] = 100
        sim.civilian_at[0, tile] = slot + sim.POOL_LO["major"]
    before = int(sim.rng_state[0])
    sim._theological_combat_phase()
    dealt = 100 - int(sim.major_unit_hp[0, sb])
    taken = 100 - int(sim.major_unit_hp[0, sa])
    # 110 vs 100: the Apostle's blow is 30*e^0.4*[0.8, 1.2], the reply the inverse
    assert 36 <= dealt <= 54, f"the Apostle's blow was {dealt}, outside 36-54"
    assert 16 <= taken <= 24, f"the Missionary's reply was {taken}, outside 16-24"
    assert int(sim.rng_state[0]) != before, "theological combat drew nothing"
    print(f"  theological OK: {dealt} dealt, {taken} taken — the exponential roll, not a linear constant")


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    print(f"city_perimeter_test on {path.name}:")
    sim = build(rules, path, turns=2)
    test_wound(sim)
    test_split(sim)
    test_ranged_penalty(sim)
    test_assault(rules, path)
    test_theological(rules, path)
    print("CITY PERIMETER OK")


if __name__ == "__main__":
    main()
