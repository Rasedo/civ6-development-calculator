"""THE GREAT PEOPLE CENSUS — the GPU half.

    npm run export                          # writes seeder/worlds/
    python tests/gpu/gp_census_test.py

Every person's layered install rows (`tools/civ6lab/gp_census.py`) read
against `GP_ABILITY`; the TS twin is tests/cpu/units/gp-census.test.ts. The
scripted rollout claims few of these people, so each clause is forced here
and the exact twin is driven:

  sites      a City Center person (-2 on the wire), a Harbor admiral, a
             luxury tile anyone's or no one's, an open Relic slot anywhere,
             and the plot a unit grant needs free of military units
  grants     a hull granted inland lands on the nearest water; Hanno's
             strongest unlocked naval melee chassis with +2 Movement; the
             Trader Marco Polo raises in his city
  channels   production toward one promotion class, Coal and Oil every
             turn, a building's own yield (Hypatia; Watt's regional
             Factory), Hildegard's mirrored adjacency, Ibn Khaldun's
             happiness percent, the Governor Title, the Bank's two slots,
             Mimar Sinan's Industrial Zone culture bomb, and the route
             clauses (foreign-route Gold both ways, Todar Mal, Rockefeller,
             Ibn Fadlan)
  own sites  Galileo beside a Mountain, Darwin and Janaki on or beside a
             wonder or a Rainforest, the wonder engineers on the wonder's own
             plot, James of St. George's missing Castle, Mary Leakey's
             Artifact city and its triple Tourism, James Young's Oil, Sun
             Tzu's Work of Writing, Eisenhower's military units
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths, FIXTURES
from core.neutral import gp_site_plane
from warmup import clear_works, opened, warm_base

B0, ROW = 0, 0
GWO_RELIC = 7


def fresh(rules, path):
    return warm_base(str(path), lambda: opened(rules, path, 8))


class Poke:
    def __init__(self, sim, R: dict) -> None:
        self.sim = sim
        self.R = R
        self.uidx = {u["id"]: i for i, u in enumerate(R["units"])}
        self.bidx = {b["id"]: i for i, b in enumerate(R["buildings"])}
        self.dcat = {d["id"]: i for i, d in enumerate(sim.districts_cat)}
        self.ones = torch.ones(sim.B, dtype=torch.bool)

    def fx(self, name: str) -> int:
        return self.sim._GPFX[name]

    def perm(self, name: str) -> int:
        return self.sim._GP_PERM0 + self.sim._gp_perm_names.index(name)

    def cperm(self, name: str) -> int:
        return self.sim._GP_CPERM0 + self.sim._gp_city_perm_names.index(name)

    def person(self, want: dict, only: int | None = None) -> tuple[int, int]:
        """the (class, queue position) whose row carries exactly these
        columns — of class `only` where named"""
        sim = self.sim
        for cls in range(sim._gp_effects.shape[0]):
            if only is not None and cls != only:
                continue
            for at in range(int(sim._gp_roster[cls])):
                row = sim._gp_effects[cls, at]
                if all(float(row[c]) == v for c, v in want.items()):
                    return cls, at
        raise AssertionError(f"no person carries {want}")

    def stand(self, cls: int, at: int, tile: int) -> tuple[torch.Tensor, torch.Tensor]:
        """the person stood ON `tile` (slot [B, 1], tile [B, 1])"""
        sim = self.sim
        t = torch.full((sim.B,), tile, dtype=torch.long)
        born = sim._spawn_unit(ROW, self.ones.clone(), t, int(sim._gp_class_unit[cls]),
                               charges=torch.ones(sim.B, dtype=torch.long),
                               gp_at=torch.full((sim.B,), at, dtype=torch.long))
        assert bool(born.all()), "the person did not spawn"
        slot = getattr(sim, sim.POOL_NEXT["major"]) - 1 + sim.POOL_LO["major"]
        rows = torch.arange(sim.B)
        sim._occ_clear(rows, sim.unit_tile[rows, slot], slot)
        sim.unit_tile[rows, slot] = tile
        sim._occ_set(rows, t, slot)
        return slot.reshape(sim.B, 1), t.reshape(sim.B, 1)

    def ok(self, st: tuple[torch.Tensor, torch.Tensor]) -> bool:
        return bool(self.sim._gp_site_ok(ROW, st[0], st[1])[B0, 0])

    def site_ok(self, cls: int, at: int, tile: int) -> bool:
        return self.ok(self.stand(cls, at, tile))

    def spend(self, cls: int, at: int, tile: int) -> None:
        sc, tc = self.stand(cls, at, tile)
        self.sim._gp_apply(ROW, self.ones.clone(), sc.squeeze(1), tc.squeeze(1))
        self.sim._eff_version += 1

    def own_bare(self, row: int = ROW, j: int = 0, avoid=()) -> int:
        sim = self.sim
        c = int(sim.city_center[B0, row, j])
        taken = set(sim.unit_tile[B0][sim.unit_alive[B0]].tolist())
        for t in range(sim.T):
            if (int(sim.tile_seat[B0, t]) == row and int(sim.city_slot_at(row)[B0, t]) == j
                    and int(sim.district[B0, t]) < 0 and int(sim.built_wonder[B0, t]) < 0
                    and bool(sim.passable[B0, t]) and not bool(sim.water[B0, t])
                    and int(sim.res_id[B0, t]) < 0 and int(sim.centre_slot_at[B0, t]) < 0
                    and t != c and t not in taken and t not in avoid):
                return t
        raise AssertionError("no bare owned plot")

    def put_district(self, name: str, row: int = ROW, j: int = 0, tile: int | None = None) -> int:
        sim = self.sim
        di = self.dcat[name]
        t = self.own_bare(row, j) if tile is None else tile
        sim.district[B0, t] = di
        sim.district_complete[B0, t] = True
        sim.district_pillaged[B0, t] = False
        sim.city_dist_tile[B0, row, j, di] = t
        sim._tile_owner_ver += 1
        sim._eff_version += 1
        return t

    def tech(self, tid: str, row: int = ROW) -> None:
        i = [t["id"] for t in self.R["techs"]].index(tid)
        self.sim.civ_techs[:, row, i] = True
        self.sim._eff_version += 1

    def walk(self, row: int = ROW) -> torch.Tensor:
        sim = self.sim
        sim._eff_version += 1
        sim._bldg_version += 1
        return sim._seat_city_walk(row, amen_yf=sim._seat_amenity(row)[2])


def test_sites(rules, path, R) -> None:
    p = Poke(fresh(rules, path), R)
    sim = p.sim
    cap = int(sim.city_center[B0, ROW, 0])
    sud = p.person({p.cperm("loyalty"): 6.0}, only=int(R["seats"]["generalClassIdx"]))
    assert int(sim._gp_site_district[sud]) == -2, "the City Center is -2 on the wire"
    assert not p.site_ok(*sud, p.own_bare()), "a City Center person is not spent on a bare plot"
    assert p.site_ok(*sud, cap), "...and is on the seat's own centre"
    p.spend(*sud, cap)
    assert float(sim.city_gp_perm[B0, ROW, 0, sim._gp_city_perm_names.index("loyalty")]) == 6.0
    print("  1 City Center OK — Sudirman on the capital's centre, +6 Loyalty there")

    nelson_site = [(c, a) for c in range(sim._gp_site.shape[0]) for a in range(int(sim._gp_roster[c]))
                   if int(sim._gp_site_district[c, a]) == p.dcat["HARBOR"] and int(sim._gp_site[c, a]) == 0]
    assert nelson_site, "a Harbor admiral is spent on a Harbor"
    c, a = nelson_site[0]
    assert int(sim._gp_site[c, a]) == 0, "a row naming its district is a district site"
    assert not p.site_ok(c, a, p.own_bare())
    assert p.site_ok(c, a, p.put_district("HARBOR"))
    print("  2 Harbor OK — the admirals naming one wait for it")

    mag = p.person({p.fx("luxuryCopies"): 1.0, p.fx("gold"): float(sim.rules.scale_by_game_speed(
        torch.tensor([300.0], dtype=torch.float64))[0])})
    taken = set(sim.unit_tile[B0][sim.unit_alive[B0]].tolist())
    wild = next(t for t in range(sim.T) if int(sim.tile_seat[B0, t]) < 0 and bool(sim.passable[B0, t])
                and not bool(sim.water[B0, t]) and t not in taken)
    assert not p.site_ok(*mag, wild)
    sim.lux_id[B0, wild] = 0
    assert p.site_ok(*mag, wild), "a luxury on no one's ground is Magellan's site"
    gold0 = float(sim.civ_treasury[B0, ROW])
    n0 = int(sim.civ_gp_lux_n[B0, ROW])
    p.spend(*mag, wild)
    assert float(sim.civ_treasury[B0, ROW]) == gold0 + float(sim._gp_effects[mag[0], mag[1], p.fx("gold")])
    assert int(sim.civ_gp_lux_n[B0, ROW]) == n0 + 1
    print("  3 Magellan OK — a luxury tile owned or not, one copy, the scaled 300 Gold")

    joan = p.person({p.fx("grantRelic"): 1.0})
    assert int(sim._gp_site[joan]) == 9
    wk = R["seats"]["greatWorks"]["objKind"].index(0)
    full = lambda v: torch.full((sim.B,), v, dtype=torch.long)  # noqa: E731
    sim._gw_place(ROW, p.ones.clone(), full(0), full(wk), full(0), full(-1), full(ROW))
    tile = p.own_bare()
    if bool((sim._gw_room(ROW, GWO_RELIC) & sim.city_alive[:, ROW, :sim.RC]).any(dim=1)[B0]):
        raise AssertionError("the scene needs no open Relic slot to start")
    assert not p.site_ok(*joan, tile), "no open Relic slot: Jeanne waits"
    sim.city_bldg[B0, ROW, 0, p.bidx["TEMPLE"]] = True
    sim._bldg_version += 1
    assert p.site_ok(*joan, tile), "an open Relic slot anywhere: spent where she stands"
    p.spend(*joan, tile)
    assert int((sim.city_gw_obj[B0, ROW, 0] == GWO_RELIC).sum()) == 1, "the Relic lands in the Temple"
    print("  4 Jeanne d'Arc OK — waits for a Relic slot, then fills it")

    mac = p.person({p.perm("oilPerTurn"): 1.0, p.fx("unitIdx"): float(p.uidx["TANK"])})
    assert bool(sim._gp_no_military[mac])
    t = p.own_bare()
    st = p.stand(*mac, t)
    assert p.ok(st)
    w = sim._spawn_unit(ROW, p.ones.clone(), torch.full((sim.B,), t, dtype=torch.long), p.uidx["WARRIOR"])
    assert bool(w.all()) and int(sim.military_at[B0, t]) >= 0
    assert not p.ok(st), "a military unit on the plot: the grant waits"
    print("  5 no military unit OK — MacArthur waits for a free plot")


def test_grants(rules, path, R) -> None:
    p = Poke(fresh(rules, path), R)
    sim = p.sim
    # ROME: no unique stands in for the Privateer or the Caravel
    ci = sim._civ_ids.index("ROME")
    sim.row_civ[:, ROW] = ci
    sim.row_leader[:, ROW] = next(i for i, c in enumerate(sim._pair_civ) if c == ci)
    drake = p.person({p.fx("unitIdx"): float(p.uidx["PRIVATEER"]), p.fx("unitPromotions"): 1.0})
    near_water = lambda t: any(n >= 0 and bool(sim.water[B0, n]) for n in sim.neigh[t].tolist())  # noqa: E731
    taken = set(sim.unit_tile[B0][sim.unit_alive[B0]].tolist())
    inland = next(t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == ROW and not bool(sim.water[B0, t])
                  and bool(sim.passable[B0, t]) and not near_water(t) and t not in taken
                  and int(sim.district[B0, t]) < 0)
    p.spend(*drake, inland)
    slot = int(sim.unit_next[B0]) - 1
    assert int(sim.unit_type[B0, slot]) == p.uidx["PRIVATEER"], "Drake's Privateer is granted inland too"
    at = int(sim.unit_tile[B0, slot])
    assert bool(sim.water[B0, at]), "...on water"
    d = sim.pair_dist[inland].long()
    ok = sim._spot_free(torch.arange(sim.T).unsqueeze(0).expand(sim.B, -1), ROW,
                        naval_mask=p.ones.clone(), cart=sim._row_ocean_open_naval(ROW),
                        utype=torch.full((sim.B,), p.uidx["PRIVATEER"], dtype=torch.long))
    ok[B0, at] = True  # the tile it took is free no longer
    best = int(torch.where(ok[B0], d, torch.full_like(d, 1 << 20)).min())
    assert int(d[at]) == best, f"the NEAREST water: {int(d[at])} vs {best}"
    print(f"  1 inland grant OK — the Privateer stands {int(d[at])} plots off, on the nearest water")

    hanno = p.person({p.fx("unitMpBonus"): 2.0})
    coast = next(t for t in range(sim.T) if bool(sim.wpass[B0, t]) and not bool(sim.ocean_tile[B0, t])
                 and int(sim.military_at[B0, t]) < 0 and int(sim.civilian_at[B0, t]) < 0)
    p.tech("SAILING")
    p.tech("CARTOGRAPHY")
    p.spend(*hanno, coast)
    slot = int(sim.unit_next[B0]) - 1
    assert int(sim.unit_type[B0, slot]) == p.uidx["CARAVEL"], \
        f"the strongest unlocked naval melee: {R['units'][int(sim.unit_type[B0, slot])]['id']}"
    assert int(sim.unit_mp_bonus[B0, slot]) == 2
    print("  2 Hanno OK — a Caravel with +2 Movement for life")

    polo = p.person({p.fx("cityUnitIdx"): float(p.uidx["TRADER"]), p.perm("tradeCapacity"): 1.0,
                     p.fx("unitIdx"): -1.0})
    hub = p.put_district("COMMERCIAL_HUB")
    tr0 = int(((sim.unit_type[B0] == p.uidx["TRADER"]) & sim.unit_alive[B0]).sum())
    p.spend(*polo, hub)
    tr = ((sim.unit_type[B0] == p.uidx["TRADER"]) & sim.unit_alive[B0]).nonzero().flatten().tolist()
    assert len(tr) == tr0 + 1, "a Trader is raised"
    cap = int(sim.city_center[B0, ROW, 0])
    assert int(sim.pair_dist[cap, int(sim.unit_tile[B0, tr[-1]])]) <= 1, "...in the city, not on the Hub"
    fk = sim._gp_city_perm_names.index("foreignRouteGold")
    assert float(sim.city_gp_perm[B0, ROW, 0, fk]) == 2.0
    print("  3 Marco Polo OK — a Trader at the centre, +2 Gold each way on foreign routes")


def test_channels(rules, path, R) -> None:
    p = Poke(fresh(rules, path), R)
    sim = p.sim
    cur = torch.full((sim.B, 1), sim.UNIT_BASE + p.uidx["QUADRIREME"], dtype=torch.long)
    gal = torch.full((sim.B, 1), sim.UNIT_BASE + p.uidx["GALLEY"], dtype=torch.long)
    q0, g0 = float(sim._gp_prod_pct(ROW, cur)[B0, 0]), float(sim._gp_prod_pct(ROW, gal)[B0, 0])
    k = sim._gp_perm_names.index("navalRangedProdPct")
    sim.civ_gp_perm[:, ROW, k] = 20.0
    assert abs(float(sim._gp_prod_pct(ROW, cur)[B0, 0]) - (q0 + 0.2)) < 1e-12
    assert float(sim._gp_prod_pct(ROW, gal)[B0, 0]) == g0
    print("  1 promotion class OK — +20% toward Naval Ranged, nothing toward the Galley")

    coal_s = next(s for k2, s in sim._gp_free_extraction if sim._gp_perm_names[k2] == "coalPerTurn")
    oil_s = next(s for k2, s in sim._gp_free_extraction if sim._gp_perm_names[k2] == "oilPerTurn")
    sim._seat_accrue_stockpile(ROW)
    c0, o0 = int(sim.civ_stockpile[B0, ROW, coal_s]), int(sim.civ_stockpile[B0, ROW, oil_s])
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("coalPerTurn")] = 2.0
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("oilPerTurn")] = 1.0
    sim.city_gp_perm[:, ROW, 0, sim._gp_city_perm_names.index("oilPerTurn")] = 3.0
    sim._seat_accrue_stockpile(ROW)
    assert int(sim.civ_stockpile[B0, ROW, coal_s]) == c0 + 2
    assert int(sim.civ_stockpile[B0, ROW, oil_s]) == o0 + 1 + 3
    print("  2 free extraction OK — Coal and Oil every turn, the city-borne Oil too")

    p.put_district("CAMPUS")
    sim.city_bldg[B0, ROW, 0, p.bidx["LIBRARY"]] = True
    s0 = float(p.walk()[B0, 0, 3])
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("libraryScience")] = 1.0
    s1 = float(p.walk()[B0, 0, 3])
    yf = float(sim._seat_amenity(ROW)[2][B0, 0])
    assert abs(s1 - s0 - 1.0 * yf) < 1e-9, f"Hypatia's +1 on the Library: {s0} -> {s1} (tier {yf})"
    p.put_district("INDUSTRIAL_ZONE")
    sim.city_bldg[B0, ROW, 0, p.bidx["FACTORY"]] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    r0 = float(sim._seat_regional(ROW)[0][B0, 0, 1])
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("factoryProduction")] = 2.0
    sim._eff_version += 1
    assert float(sim._seat_regional(ROW)[0][B0, 0, 1]) == r0 + 2, "Watt's +2 rides the Factory's reach"
    print("  3 building yields OK — Hypatia's Library, Watt's regional Factory")

    # Hildegard: a Holy Site where its adjacency is not 0
    hs = p.dcat["HOLY_SITE"]
    adj = sim._district_adj_seat(ROW, hs)[B0]
    cand = [t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == ROW and int(sim.city_slot_at(ROW)[B0, t]) == 0
            and int(sim.district[B0, t]) < 0 and int(sim.centre_slot_at[B0, t]) < 0 and bool(sim.passable[B0, t])
            and not bool(sim.water[B0, t]) and float(adj[t]) > 0]
    if cand:
        t = p.put_district("HOLY_SITE", tile=cand[0])
        w0 = p.walk()[B0, 0]
        sim.tile_gp_perm[B0, t, sim._gp_tile_perm_names.index("faithAdjScience")] = 1
        w1 = p.walk()[B0, 0]
        yf = float(sim._seat_amenity(ROW)[2][B0, 0])
        assert abs(float(w1[3] - w0[3]) - float(sim._district_adj_seat(ROW, hs)[B0, t]) * yf) < 1e-9
        print("  4 Hildegard OK — the Holy Site's Faith adjacency paid again as Science")
    else:
        print("  4 Hildegard: no Holy Site plot with adjacency on this fixture — the TS twin pins it")

    # Ibn Khaldun: a percent at the Happy / Ecstatic tier
    ak = sim._gp_city_perm_names.index("amenities")
    sim.city_gp_perm[:, ROW, 0, ak] = 20.0
    tier = int(sim._seat_amenity(ROW)[0][B0, 0])
    assert tier == sim._gp_ecstatic_tier, f"20 amenities make the capital Ecstatic: tier {tier}"
    e0 = p.walk()[B0, 0].clone()
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("happyYieldPct")] = 2.0
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("ecstaticYieldPct")] = 4.0
    e1 = p.walk()[B0, 0]
    assert float(e1[0]) == float(e0[0]), "Food takes none of it"
    assert abs(float(e1[4]) - float(e0[4]) * 1.04) < 1e-9, "+4% Culture at Ecstatic"
    print("  5 Ibn Khaldun OK — +4% on the non-Food yields of an Ecstatic city")

    # the Governor Title; Giovanni's Bank
    irene = p.person({p.fx("governorTitles"): 1.0})
    t0 = int(sim.civ_granted_titles[B0, ROW])
    p.spend(*irene, p.own_bare())
    assert int(sim.civ_granted_titles[B0, ROW]) == t0 + 1
    wk = R["seats"]["greatWorks"]["objKind"].index(0)
    full = lambda v: torch.full((sim.B,), v, dtype=torch.long)  # noqa: E731
    while bool(sim._gw_room(ROW, wk)[B0, 0]):
        sim._gw_place(ROW, p.ones.clone(), full(0), full(wk), full(0), full(-1), full(ROW))
    sim.city_bldg[B0, ROW, 0, p.bidx["BANK"]] = True
    sim._bldg_version += 1
    assert not bool(sim._gw_room(ROW, wk)[B0, 0]), "a Bank alone holds nothing"
    sim.city_gp_perm[:, ROW, 0, sim._gp_city_perm_names.index("bankGwSlots")] = 2.0
    assert bool(sim._gw_room(ROW, wk)[B0, 0]), "Giovanni's Bank takes a Work of Writing"
    print("  6 Governor Title and the Bank OK")


def test_routes(rules, path, R) -> None:
    p = Poke(fresh(rules, path), R)
    sim = p.sim
    assert bool(sim.city_alive[B0, 1, 0]), "the fixture's second seat needs a city"
    fk = sim._gp_city_perm_names.index("foreignRouteGold")
    # seat 1's route into seat 0's capital
    k = int((sim.seat_routes[B0, 1, :, 0] < 0).nonzero()[0])
    sim.seat_routes[B0, 1, k, 0] = sim.city_id[B0, 1, 0]
    sim.seat_routes[B0, 1, k, 1] = -1
    sim.seat_route_dseat[B0, 1, k] = ROW
    sim.seat_route_dcity[B0, 1, k] = sim.city_id[B0, ROW, 0]
    sim._eff_version += 1

    def gold(row: int) -> float:
        sim._eff_version += 1
        inc = sim._seat_route_income(row)
        return 0.0 if inc is None else float(inc[B0, 0, 2])

    in0, out0 = gold(ROW), gold(1)
    sim.city_gp_perm[:, ROW, 0, fk] = 2.0
    assert gold(ROW) == in0 + 2, "the city receives +2 Gold from the foreign route in"
    assert gold(1) == out0 + 2, "...and provides +2 Gold to it"
    print("  1 foreign-route Gold OK — both ends")

    # John Rockefeller: +2 per strategic kind the destination has improved
    kinds = int(sim._city_improved_res_kinds(ROW, 2)[B0, 0])
    o1 = gold(1)
    sim.civ_gp_perm[:, 1, sim._gp_perm_names.index("strategicRouteGold")] = 2.0
    assert gold(1) == o1 + 2 * kinds, f"Rockefeller: {kinds} kinds improved at the destination"
    # Raja Todar Mal: +0.5 per specialty district at a domestic destination
    k1 = int((sim.seat_routes[B0, ROW, :, 0] < 0).nonzero()[0])
    sim.seat_routes[B0, ROW, k1, 0] = sim.city_id[B0, ROW, 0]
    sim.seat_routes[B0, ROW, k1, 1] = sim.city_id[B0, ROW, 0]
    p.put_district("CAMPUS")
    p.put_district("HOLY_SITE")
    d0 = gold(ROW)
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("domesticRouteGoldPerSpecialty")] = 0.5
    assert gold(ROW) == d0 + 0.5 * 2, "Todar Mal: two specialty districts at the destination"
    print(f"  2 Rockefeller and Todar Mal OK — {kinds} strategic kinds, two specialty districts")

    # Ibn Fadlan: a route to a city-state
    if sim.S > 0 and bool(sim.citystate_alive[B0, 0]):
        k0 = int((sim.seat_routes[B0, ROW, :, 0] < 0).nonzero()[0])
        sim.seat_routes[B0, ROW, k0, 0] = sim.city_id[B0, ROW, 0]
        sim.seat_routes[B0, ROW, k0, 1] = -2
        sim._eff_version += 1
        inc = sim._seat_route_income(ROW)
        f0 = float(inc[B0, 0, 5])
        sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("csRouteFaith")] = 2.0
        sim._eff_version += 1
        assert float(sim._seat_route_income(ROW)[B0, 0, 5]) == f0 + 2, "Ibn Fadlan's +2 Faith"
        print("  3 Ibn Fadlan OK — +2 Faith on a route to a city-state")


def test_culture_bomb(rules, path, R) -> None:
    p = Poke(fresh(rules, path), R)
    sim = p.sim
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("izCultureBomb")] = 1.0
    cap = int(sim.city_center[B0, ROW, 0])
    edge = next(t for t in range(sim.T) if int(sim.tile_seat[B0, t]) == ROW
                and int(sim.city_slot_at(ROW)[B0, t]) == 0 and int(sim.district[B0, t]) < 0
                and int(sim.centre_slot_at[B0, t]) < 0 and not bool(sim.water[B0, t])
                and bool(sim.passable[B0, t]) and int(sim.pair_dist[cap, t]) <= 2
                and any(n >= 0 and int(sim.tile_seat[B0, n]) < 0 for n in sim.neigh[t].tolist()))
    wild = [n for n in sim.neigh[edge].tolist() if n >= 0 and int(sim.tile_seat[B0, n]) < 0]
    iz = p.dcat["INDUSTRIAL_ZONE"]
    sim.district[B0, edge] = iz
    sim.city_dist_tile[B0, ROW, 0, iz] = edge
    # the completion body itself (`_district_completed`)
    made = torch.zeros(sim.B, dtype=torch.bool)
    made[B0] = True
    sim._district_completed(ROW, torch.zeros(sim.B, dtype=torch.long),
                            torch.full((sim.B,), edge, dtype=torch.long), made)
    for n in wild:
        assert int(sim.tile_seat[B0, n]) == ROW, f"plot {n} beside the new Industrial Zone is claimed"
    print(f"  1 Mimar Sinan OK — {len(wild)} plots claimed around the Industrial Zone")


def test_action_sites(rules, path, R) -> None:
    """the Action* columns that name a site of their own, and the clauses
    that ride them — `gp-census.test.ts`'s last block, poked the same way"""
    p = Poke(fresh(rules, path), R)
    sim = p.sim
    sp = lambda v: float(sim.rules.scale_by_game_speed(torch.tensor([float(v)], dtype=torch.float64))[0])  # noqa: E731
    full = lambda v: torch.full((sim.B,), v, dtype=torch.long)  # noqa: E731
    SITES = {"nearMountain": 10, "nearNaturalWonder": 11, "nearRainforest": 12, "incompleteWonder": 13,
             "centreWithout": 14, "districtArtifact": 15}

    # a plot nobody owns, free, with no Mountain, wonder or Rainforest on or around it
    taken = set(sim.unit_tile[B0][sim.unit_alive[B0]].tolist())
    rain = (sim.feat_id[B0] == sim._rainforest_fid) & ~sim.feat_stripped[B0]
    bad = sim.tile_mountain[B0] | sim.nwonder[B0] | rain

    def clear(t: int) -> bool:
        nb = sim.neigh[t].tolist()
        return all(n >= 0 and not bool(bad[n]) for n in nb) and not bool(bad[t])

    wild = next(t for t in range(sim.T) if int(sim.tile_seat[B0, t]) < 0 and bool(sim.passable[B0, t])
                and not bool(sim.water[B0, t]) and t not in taken and clear(t))
    nb0 = int(sim.neigh[wild][0])
    gal = p.person({p.fx("perAdjSource"): 0.0})
    assert int(sim._gp_site[gal]) == SITES["nearMountain"]
    assert not p.site_ok(*gal, wild)
    sim.tile_mountain[B0, nb0] = True
    assert p.site_ok(*gal, wild), "a plot beside a Mountain, owned by nobody, is Galileo's site"
    sci0 = float(sim.civ_tech_prog[B0, ROW])
    p.spend(*gal, wild)
    assert float(sim.civ_tech_prog[B0, ROW]) == sci0 + sp(250)
    sim.tile_mountain[B0, nb0] = False
    dar = p.person({p.fx("perAdjSource"): 1.0})
    assert int(sim._gp_site[dar]) == SITES["nearNaturalWonder"]
    assert not p.site_ok(*dar, wild)
    sim.nwonder[B0, nb0] = True
    assert p.site_ok(*dar, wild)
    sim.nwonder[B0, nb0] = False
    jan = p.person({p.fx("perAdjSource"): 2.0})
    assert int(sim._gp_site[jan]) == SITES["nearRainforest"]
    assert not p.site_ok(*jan, wild)
    f0, s0 = int(sim.feat_id[B0, wild]), bool(sim.feat_stripped[B0, wild])
    sim.feat_id[B0, wild] = sim._rainforest_fid
    sim.feat_stripped[B0, wild] = False
    assert p.site_ok(*jan, wild), "a Rainforest underfoot is Janaki Ammal's site"
    sim.feat_id[B0, wild], sim.feat_stripped[B0, wild] = f0, s0
    print("  1 Galileo / Darwin / Janaki OK — beside a Mountain, on or beside a wonder or a Rainforest")

    # the wonder engineers: the plot the capital raises its wonder on
    sim = p.sim = fresh(rules, path)
    plot = p.own_bare()
    wi = 0
    sim.built_wonder[B0, plot] = wi
    sim.built_wonder_complete[B0, plot] = False
    sim.city_current[B0, ROW, 0, 0] = sim.WONDER_BASE + wi
    sim.city_qtile[B0, ROW, 0, 0] = plot
    sim.city_cost[B0, ROW, 0, 0] = 5000.0
    sim.city_progress[B0, ROW, 0, 0] = 0.0
    iz = p.put_district("INDUSTRIAL_ZONE")
    isi = p.person({p.fx("wonderProduction"): 215.0})
    assert int(sim._gp_site[isi]) == SITES["incompleteWonder"]
    assert not p.site_ok(*isi, iz), "the Industrial Zone is no site of a wonder engineer"
    assert p.site_ok(*isi, plot)
    p.spend(*isi, plot)
    assert float(sim.city_progress[B0, ROW, 0, 0]) == sp(215), "Isidore's 215 lands in the wonder"
    shah = p.person({p.fx("wonderBuyout"): 1.0})
    sim.civ_treasury[B0, ROW] = 300.0
    before = float(sim.city_progress[B0, ROW, 0, 0])
    p.spend(*shah, plot)
    assert float(sim.city_progress[B0, ROW, 0, 0]) == before + 150.0 and float(sim.civ_treasury[B0, ROW]) == 0.0
    sim.built_wonder_complete[B0, plot] = True
    assert not p.site_ok(*isi, plot), "a finished wonder is no site"
    print("  2 wonder engineers OK — spent on the wonder's own plot, paid into it")

    # James of St. George: a City Center whose city holds no Castle
    sim = p.sim = fresh(rules, path)
    cap = int(sim.city_center[B0, ROW, 0])
    jam = next((c, a) for c in range(sim._gp_site.shape[0]) for a in range(int(sim._gp_roster[c]))
               if int(sim._gp_site[c, a]) == SITES["centreWithout"])
    castle = p.bidx["MEDIEVAL_WALLS"]
    assert int(sim._gp_site_district[jam]) == castle, "the site's argument is the missing building"
    sim.city_bldg[B0, ROW, 0, castle] = False
    assert p.site_ok(*jam, cap)
    plane = gp_site_plane(sim, ROW, SITES["centreWithout"], castle)[B0]
    assert cap in plane.nonzero().flatten().tolist()
    p.spend(*jam, cap)
    assert bool(sim.city_bldg[B0, ROW, 0, castle]) and bool(sim.city_bldg[B0, ROW, 0, p.bidx["ANCIENT_WALLS"]])
    assert not p.site_ok(*jam, cap), "a city holding its Castle is no site"
    assert cap not in gp_site_plane(sim, ROW, SITES["centreWithout"], castle)[B0].nonzero().flatten().tolist()
    print("  3 James of St. George OK — walls and Castle, then the centre is no site")

    # Mary Leakey: a Theater Square whose city holds an Artifact; the Artifact's Tourism triples
    sim = p.sim = fresh(rules, path)
    ts = p.put_district("THEATER_SQUARE")
    lea = p.person({p.fx("artifactScience"): sp(350)})
    assert int(sim._gp_site[lea]) == SITES["districtArtifact"]
    clear_works(sim)
    assert not p.site_ok(*lea, ts)
    assert bool(sim._gw_place(ROW, p.ones.clone(), full(0), full(4), full(0), full(1), full(ROW))[B0])
    assert p.site_ok(*lea, ts)
    t0 = int(sim._gw_tourism_general(ROW, None, None)[B0, 0])
    sci0 = float(sim.civ_tech_prog[B0, ROW])
    p.spend(*lea, ts)
    assert float(sim.civ_tech_prog[B0, ROW]) == sci0 + sp(350)
    assert float(sim._gp_perm(ROW, "artifactTourismPct")[B0]) == 200.0
    assert int(sim._gw_tourism_general(ROW, None, None)[B0, 0]) == t0 + 2 * int(sim._gw_obj_tourism[4])
    print("  4 Mary Leakey OK — waits for an Artifact, then triples its Tourism")

    # James Young: Oil seen before its technology
    sim = p.sim = fresh(rules, path)
    pk, oil = sim._gp_resource_reveal[0]
    assert sim._gp_perm_names[pk] == "oilVisible"
    t = p.own_bare()
    r0 = int(sim.res_id[B0, t])
    sim.res_id[B0, t] = oil
    sim._eff_version += 1
    if bool(sim._res_hidden(ROW)[B0, t]):
        you = p.person({p.perm("oilVisible"): 1.0})
        p.spend(*you, p.put_district("CAMPUS"))
        assert not bool(sim._res_hidden(ROW)[B0, t]), "James Young's Oil is seen"
        assert bool(sim._res_hidden(1)[B0, t]) or bool(sim._seat_techs(1)[B0, int(sim._res_reveal_tech[oil])])
        print("  5 James Young OK — Oil seen before Refining")
    else:
        print("  5 James Young: the row already sees Oil on this fixture — the TS twin pins it")
    sim.res_id[B0, t] = r0

    # Sun Tzu: his Work of Writing, in the seat's city he stands in, while it has room
    sim = p.sim = fresh(rules, path)
    sun = p.person({p.fx("greatWorkKind"): 0.0}, only=int(R["seats"]["generalClassIdx"]))
    assert int(sim._gp_site[sun]) == 2, "Sun Tzu's charge is the Great Work arm"
    clear_works(sim)
    assert not p.site_ok(*sun, wild), "nobody's plot is no site"
    home = p.own_bare()
    assert p.site_ok(*sun, home)
    p.spend(*sun, home)
    assert int((sim.city_gw_obj[B0, ROW, 0] == 5).sum()) == 1, "one Work of Writing in the city"
    while bool(sim._gw_room(ROW, 5)[B0, 0]):
        sim._gw_place(ROW, p.ones.clone(), full(0), full(5), full(0), full(-1), full(ROW))
    assert not p.site_ok(*sun, p.own_bare()), "no room: no charge"
    print("  6 Sun Tzu OK — his Work of Writing where the city has room")

    # Eisenhower: military units only
    sim = p.sim = fresh(rules, path)
    cur = lambda u: torch.full((sim.B, 1), sim.UNIT_BASE + p.uidx[u], dtype=torch.long)  # noqa: E731
    settler = torch.full((sim.B, 1), sim.SETTLER, dtype=torch.long)
    w0, b0, s0 = (float(sim._gp_prod_pct(ROW, c)[B0, 0]) for c in (cur("WARRIOR"), cur("BUILDER"), settler))
    sim.civ_gp_perm[:, ROW, sim._gp_perm_names.index("militaryProdPct")] = 5.0
    assert abs(float(sim._gp_prod_pct(ROW, cur("WARRIOR"))[B0, 0]) - (w0 + 0.05)) < 1e-12
    assert float(sim._gp_prod_pct(ROW, cur("BUILDER"))[B0, 0]) == b0
    assert float(sim._gp_prod_pct(ROW, settler)[B0, 0]) == s0
    print("  7 Eisenhower OK — +5% toward a Warrior, nothing toward a Builder or a Settler")


def main() -> None:
    rules = load_rules()
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))

    def roomy(path) -> bool:
        """the pokes stand people on six of the capital's bare plots"""
        p = Poke(fresh(rules, path), R)
        for _ in range(6):
            try:
                t = p.own_bare()
            except AssertionError:
                return False
            p.sim.district[B0, t] = 0  # a marker: the next plot is another one
        return True

    path = next((q for q in fixture_paths() if roomy(q)), None)
    assert path is not None, "no fixture's capital owns six bare plots"
    print(f"gp_census on {path.name}")
    sim = fresh(rules, path)
    if not sim.districts_on:
        print("gp_census: districts off on this fixture — nothing to poke")
        return
    test_sites(rules, path, R)
    test_grants(rules, path, R)
    test_channels(rules, path, R)
    test_routes(rules, path, R)
    test_culture_bomb(rules, path, R)
    test_action_sites(rules, path, R)
    print("BATTERY OK gp_census")


if __name__ == "__main__":
    main()
