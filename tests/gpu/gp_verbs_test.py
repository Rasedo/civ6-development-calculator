"""The Great Person VERB clauses — gate-unreachable.

    python tests/gpu/gp_verbs_test.py

Three persons whose page clause is a verb, forced here and driven through the
exact twin (`_gp_site_ok` for the site, `_gp_apply` for the spend):

  Raffles      the city-state whose land he stands on — one this seat is
               Suzerain of — joins the empire, and the row's +10 Loyalty per
               turn lands on THAT city (`_capture_city_state`, then the
               per-city run rebound by `_gp_verbs`)
  Boudica      every barbarian unit within 1 changes sides, in ring order
               (`_convert_ring`, Heathen Conversion's body)
  Tupac Amaru  a Musketman in each district of the ENEMY city whose land
               the general stands on, City Center included, in tile order
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from core.simbase import BARB_SEAT
from warmup import settle_all

B0 = 0


def build(rules, path, steps: int = 8):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(steps):
        sim.step()
    return sim


def main() -> None:
    rules = load_rules()
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    uidx = {u["id"]: i for i, u in enumerate(R["units"])}
    sim = build(rules, fixture_paths()[0])
    ones = torch.ones(sim.B, dtype=torch.bool)
    fx = sim._GPFX

    def find_person(want: dict) -> tuple[int, int]:
        for cls in range(sim._gp_effects.shape[0]):
            for at in range(int(sim._gp_roster[cls])):
                row = sim._gp_effects[cls, at]
                if all(float(row[c]) == v for c, v in want.items()):
                    return cls, at
        raise AssertionError(f"no person carries {want}")

    def stand(cls: int, at: int, tile: int) -> torch.Tensor:
        """the person stood up at `tile` (the probe may bump it; the slot is
        what `_gp_site_ok` and `_gp_apply` take) — returns the merged slot [B]"""
        u = int(sim._gp_class_unit[cls])
        t = torch.full((sim.B,), tile, dtype=torch.long)
        born = sim._spawn_unit(0, ones.clone(), t, u,
                               charges=torch.ones(sim.B, dtype=torch.long),
                               gp_at=torch.full((sim.B,), at, dtype=torch.long))
        assert bool(born.all()), "the person did not spawn"
        slot = getattr(sim, sim.POOL_NEXT["major"]) - 1 + sim.POOL_LO["major"]
        return slot

    def site_ok(slot: torch.Tensor, tile: int) -> bool:
        t = torch.full((sim.B, 1), tile, dtype=torch.long)
        return bool(sim._gp_site_ok(0, slot.unsqueeze(1), t)[B0, 0])

    def spend(slot: torch.Tensor, tile: int) -> None:
        sim._gp_apply(0, ones.clone(), slot, torch.full((sim.B,), tile, dtype=torch.long))
        sim._eff_version += 1

    # ---- 1. Raffles: the suzerained city-state joins the empire
    assert sim.S >= 1, "the fixture seats city-states"
    s_cs = 0
    assert bool(sim.citystate_alive[B0, s_cs])
    c_t = int(sim.citystate_center[B0, s_cs])
    raffles = find_person({fx["absorbCityState"]: 1.0})
    slot_r = stand(*raffles, c_t)
    sim.seat_citystate_envoys[B0, :, s_cs] = 0
    sim._cs_resolve_suzerain()
    assert not site_ok(slot_r, c_t), "Raffles needs the SUZERAIN's ground, not any minor's"
    sim.seat_citystate_envoys[B0, 0, s_cs] = int(rules.citystate.get("suzerainEnvoys", 3))
    sim._cs_resolve_suzerain()
    assert site_ok(slot_r, c_t), "seat 0 is Suzerain: the site is legal"
    cities0 = int(sim.city_alive[B0, 0].sum())
    spend(slot_r, c_t)
    assert not bool(sim.citystate_alive[B0, s_cs]), "the minor is gone"
    assert int(sim.city_alive[B0, 0].sum()) == cities0 + 1, "seat 0 gained the city"
    col = int(sim.centre_slot_at[B0, c_t])
    assert col >= 0 and int(sim.tile_seat[B0, c_t]) == 0 and bool(sim.city_alive[B0, 0, col])
    loy = sim._gp_city_perm_names.index("loyalty")
    assert float(sim.city_gp_perm[B0, 0, col, loy]) == 10.0, "the +10 Loyalty per turn lands on the ABSORBED city"
    print(f"  1 Raffles OK — city-state {s_cs} absorbed into column {col}, loyalty perm 10")

    # ---- 2. Boudica: the ring changes sides, in ring order
    # a bare passable plot of seat 0 with two passable neighbours for the barbarians
    plot = None
    for t in range(sim.T):
        if int(sim.tile_seat[B0, t]) != 0 or not bool(sim.passable[B0, t]) or int(sim.district[B0, t]) >= 0:
            continue
        if int(sim.military_at[B0, t]) >= 0 or int(sim.civilian_at[B0, t]) >= 0:
            continue
        nbs = [int(n) for n in sim.neigh[t].tolist() if n >= 0 and bool(sim.passable[B0, n])
               and int(sim.military_at[B0, n]) < 0 and int(sim.district[B0, n]) < 0]
        if len(nbs) >= 2:
            plot = (t, nbs[:2])
            break
    assert plot is not None, "no plot with two free neighbours"
    t_b, (n1, n2) = plot
    boudica = find_person({fx["convertBarbarians"]: 1.0})
    slot_b = stand(*boudica, t_b)
    assert not site_ok(slot_b, t_b), "no barbarian beside her: no site"
    war = uidx["WARRIOR"]
    for n in (n1, n2):
        sim._spawn_barb(ones.clone(), torch.full((sim.B,), n, dtype=torch.long), war)
    assert site_ok(slot_b, t_b), "two barbarians beside her: the site is legal"
    nxt0 = int(getattr(sim, sim.POOL_NEXT["major"])[B0])
    barbs0 = int(sim.barb_unit_alive[B0].sum())
    spend(slot_b, t_b)
    assert int(sim.barb_unit_alive[B0].sum()) == barbs0 - 2, "both barbarians left the barbarian pool"
    nxt1 = int(getattr(sim, sim.POOL_NEXT["major"])[B0])
    assert nxt1 == nxt0 + 2, "both appended to the major pool"
    lo = sim.POOL_LO["major"]
    for k, n in ((nxt0, n1), (nxt0 + 1, n2)):
        sl = lo + k
        assert bool(sim.unit_alive[B0, sl]) and int(sim.unit_seat[B0, sl]) == 0, "the convert is seat 0's"
        assert int(sim.unit_tile[B0, sl]) in (n1, n2) and int(sim.unit_mp[B0, sl]) == 0
    print("  2 Boudica OK — two adjacent barbarians converted, appended in ring order, no moves left")

    # ---- 3. Tupac Amaru: a Musketman in each district of the enemy city
    assert sim.n_majors >= 2
    r2 = 1
    assert bool(sim.city_alive[B0, r2, 0]), "seat 1 has a capital"
    e_t = int(sim.city_center[B0, r2, 0])
    # a tile of seat 1's capital that is not the centre
    ground = next(t for t in range(sim.T)
                  if int(sim.tile_seat[B0, t]) == r2 and t != e_t and bool(sim.passable[B0, t])
                  and int(sim.city_slot_at(r2)[B0, t]) == 0)
    tupac = find_person({fx["unitEachDistrict"]: float(uidx["MUSKETMAN"])})
    slot_t = stand(*tupac, ground)
    sim.war[B0, 0, r2] = False
    sim.war[B0, r2, 0] = False
    assert not site_ok(slot_t, ground), "at peace: another seat's land is not ENEMY land"
    sim.war[B0, 0, r2] = True
    sim.war[B0, r2, 0] = True
    assert site_ok(slot_t, ground), "at war: the site is legal"
    tiles = sim._enemy_district_tiles(B0, ground)
    assert e_t in tiles, "the City Center is a district too"
    musket = uidx["MUSKETMAN"]
    mine = lambda: int(((sim.unit_type[B0] == musket) & sim.unit_alive[B0] & (sim.unit_seat[B0] == 0)).sum())  # noqa: E731
    m0 = mine()
    spend(slot_t, ground)
    m1 = mine()
    assert m1 - m0 == len(tiles), f"one Musketman per district tile ({len(tiles)}), read {m1 - m0}"
    print(f"  3 Tupac Amaru OK — {len(tiles)} district tile(s), {m1 - m0} Musketmen for seat 0")
    print("gp_verbs OK")


if __name__ == "__main__":
    main()
