"""THE AIR FIGHTER, AIR BOMBER, NAVAL RAIDER AND NAVAL CARRIER TREES on the
GPU side.

Four classes arrive at once, and with them two new combat conditions
(`CS_DEF_VS_AIR`, `CS_DEF_VS_AA`), the promotion term inside the sortie, an
aircraft that finally banks XP, and two channels that pay outside a roll —
Loot's coastal gold and Tactical Maintenance's heal.

Every check below is poked into the same bodies `policy/drive.py` drives:
`_promo_cs`, `_air_strike_targets`, `_apply_seat_unit_actions`, `_heal_blocked`,
`_air_slots_at`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def fresh(rules, path, turns=30):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def a_city(sim, row):
    live = sim.city_alive[0, row].nonzero().flatten()
    assert live.numel(), f"row {row} holds no city"
    return int(live[0])


def aerodrome(sim, row, j):
    ctr = int(sim.city_center[0, row, j])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[0, t]) == row and int(sim.district[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and bool(sim.passable[0, t]) and t != ctr]
    assert free, "the city owns no free plot for an Aerodrome"
    t = free[0]
    sim.district[0, t] = sim._aerodrome_didx
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    sim.city_dist_tile[0, row, j, sim._aerodrome_didx] = t
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    return t


def retype(sim, row, ty, tile=None):
    for v in range(sim.major_unit_alive.shape[1]):
        if bool(sim.major_unit_alive[0, v]) and int(sim.major_unit_seat[0, v]) == row:
            here = int(sim.major_unit_tile[0, v])
            if sim.military_at[0, here] == v + sim.POOL_LO["major"]:
                sim.military_at[0, here] = -1
            if sim.civilian_at[0, here] == v + sim.POOL_LO["major"]:
                sim.civilian_at[0, here] = -1
            sim.major_unit_type[0, v] = ty
            sim.major_unit_mp[0, v] = float(sim._type_moves[ty])
            sim.major_unit_hp[0, v] = 100
            if tile is not None:
                sim.major_unit_tile[0, v] = tile
            sim._gen_ver += 1
            return v, int(sim.major_unit_tile[0, v])
    raise AssertionError(f"row {row} holds no live unit to retype")


def spawn(sim, row, ty, tile):
    was = set(sim.major_unit_alive[0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(1, dtype=torch.bool), torch.tensor([tile]),
                    torch.tensor([ty]))
    got = set(sim.major_unit_alive[0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, "the spawn found no slot"
    sim._gen_ver += 1
    return got.pop()


def grant_resource(sim, row, ty, avoid=()):
    sim.civ_stockpile[0, row] = 999
    res = next((r for u, r in sim._res_unit_pairs if u == ty), None)
    if res is None:
        return
    t = next(t for t in reversed(range(sim.T))
             if int(sim.tile_seat[0, t]) == row and t not in avoid)
    sim.res_id[0, t] = res
    sim.res_imp[0, t] = 3
    sim.improvement[0, t] = 3
    sim.pillaged[0, t] = False
    sim._eff_version += 1


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[0]
    rank = int((smap == slot).nonzero(as_tuple=True)[0][0])
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def a_type(sim, pred):
    for i in range(sim.NU):
        if pred(i):
            return i
    return -1


def col_with(rules, cls, kind, v=None, mask=None):
    """the COLUMN of `cls`'s list whose effect slot carries this kind (and,
    when asked, this value and target mask) — the wire's own answer, so no
    catalog position is hard-coded here."""
    c = rules.promo_classes.index(cls)
    k = rules.promo_kinds.index(kind)
    for j in range(int(rules.promo_rows[c])):
        for s in range(rules.promo_kind.shape[2]):
            if int(rules.promo_kind[c, j, s]) != k:
                continue
            if v is not None and int(rules.promo_v[c, j, s]) != v:
                continue
            if mask is not None and int(rules.promo_mask[c, j, s]) != mask:
                continue
            return j
    raise AssertionError(f"{cls} carries no {kind} row (v={v}, mask={mask})")


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    row, foe = 1, 0

    sim = fresh(rules, path)
    assert sim._any_air, "the roster fields no aircraft — every check below is vacuous"
    FIGHTER = a_type(sim, lambda i: int(sim._type_air[i]) == 1)
    BOMBER = a_type(sim, lambda i: int(sim._type_air[i]) == 2)
    RAIDER = a_type(sim, lambda i: bool(sim._type_raider[i]))
    HULL = a_type(sim, lambda i: int(sim._type_anti_air[i]) > 0 and bool(sim.unit_naval[i]))
    assert FIGHTER >= 0 and BOMBER >= 0 and RAIDER >= 0 and HULL >= 0

    CARRIER = a_type(sim, lambda i: int(sim._type_air_slots[i]) > 0 and bool(sim.unit_naval[i]))
    assert CARRIER >= 0, "the roster fields no carrier hull"

    # -- 1: the four classes reached the wire --------------------------------
    for cls in ("AIR_FIGHTER", "AIR_BOMBER", "NAVAL_RAIDER", "NAVAL_CARRIER"):
        c = rules.promo_classes.index(cls)
        assert int(rules.promo_rows[c]) == 7, f"{cls} holds {int(rules.promo_rows[c])} rows, not 7"
        for j in range(7):
            req = int(rules.promo_req[c, j])
            assert req < (1 << j), (
                f"{cls} column {j} requires a LATER column ({req:b}) — the branch is unreachable")
    for ty, cls in ((FIGHTER, "AIR_FIGHTER"), (BOMBER, "AIR_BOMBER"), (RAIDER, "NAVAL_RAIDER"),
                    (CARRIER, "NAVAL_CARRIER")):
        got = int(rules.u_promo_class[ty])
        assert got == rules.promo_classes.index(cls), (
            f"chassis {ty} promotes from {rules.promo_classes[got]}, not {cls}")
    print(f"  1 four trees on the wire OK ({len(rules.promo_classes)} classes, 7 rows each)")

    # -- 2: the two new conditions fire in their OWN roll and no other -------
    # CIV6 (Proximity Fuses): "+7 Combat Strength when defending vs. air
    # attacks"; (Cockpit Armor / Evasive Maneuvers): the same against anti-air.
    one = torch.ones(1, dtype=torch.bool)
    zero = ~one

    def cs(ty, cls, kind, **kw):
        p = torch.tensor([1 << col_with(rules, cls, kind)])
        return int(sim._promo_cs(torch.tensor([ty]), p, **kw)[0])

    SHIP_CLS = rules.promo_classes[int(rules.u_promo_class[HULL])]
    assert cs(HULL, SHIP_CLS, "CS_DEF_VS_AIR", attacking=zero, vs_air=one) == 7
    assert cs(HULL, SHIP_CLS, "CS_DEF_VS_AIR", attacking=zero) == 0
    assert cs(HULL, SHIP_CLS, "CS_DEF_VS_AIR", attacking=one, vs_air=one) == 0
    for ty, cls in ((FIGHTER, "AIR_FIGHTER"), (BOMBER, "AIR_BOMBER")):
        assert cs(ty, cls, "CS_DEF_VS_AA", attacking=zero, vs_anti_air=one) == 7
        assert cs(ty, cls, "CS_DEF_VS_AA", attacking=zero, vs_air=one) == 0
        assert cs(ty, cls, "CS_DEF_VS_AA", attacking=one, vs_anti_air=one) == 0
    # and the class terms read the NEW class bits
    tb = torch.tensor([1 << col_with(rules, "AIR_BOMBER", "CS_VS_CLASS_ANY", v=17)])
    hit = int(sim._promo_cs(torch.tensor([BOMBER]), tb, attacking=one,
                            foe_type=torch.tensor([RAIDER]))[0])
    assert hit == 17, f"CIV6 counts the raider among 'naval units' — read {hit}"
    print("  2 CS_DEF_VS_AIR / CS_DEF_VS_AA gate on their own roll, and the raider is naval OK")

    # -- 3: the RANGE rows widen the operational range -----------------------
    sim = fresh(rules, path)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    bs, _ = retype(sim, row, BOMBER, aero)
    grant_resource(sim, row, BOMBER)
    sim.war[0, row, foe] = True
    sim.war[0, foe, row] = True
    reach = int(sim._type_ranged_range[BOMBER])
    far = [t for t in range(sim.T)
           if reach < int(sim.pair_dist[aero, t]) <= reach + 2 and bool(sim.wpass[0, t])
           and int(sim.military_at[0, t]) < 0]
    assert far, "no water just outside the bomber's base range"
    hullslot = spawn(sim, foe, HULL, far[0])
    sim.unit_tile[0, hullslot] = far[0]
    sim.military_at[0, far[0]] = hullslot + sim.POOL_LO["major"]
    sim._gen_ver += 1
    sc, tc, ut = torch.tensor([[bs]]), torch.tensor([[aero]]), torch.tensor([[BOMBER]])
    assert far[0] not in sim._air_strike_targets(row, sc, tc, ut)[0, 0].tolist(), (
        "the hull is out of the bomber's own range to begin with")
    sim.unit_promos[0, bs] = 1 << col_with(rules, "AIR_BOMBER", "RANGE", v=2)
    sim._gen_ver += 1
    assert far[0] in sim._air_strike_targets(row, sc, tc, ut)[0, 0].tolist(), (
        "CIV6 (Long Range): '+2 Operational Range' did not reach the head")
    print(f"  3 RANGE widens the strike head OK (base {reach}, hull at "
          f"{int(sim.pair_dist[aero, far[0]])})")

    # -- 4: the sortie carries both trees, and pays both sides ---------------
    sim = fresh(rules, path)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    bs, _ = retype(sim, row, BOMBER, aero)
    grant_resource(sim, row, BOMBER)
    sim.war[0, row, foe] = True
    sim.war[0, foe, row] = True
    sea = [t for t in range(sim.T)
           if 0 < int(sim.pair_dist[aero, t]) <= reach and bool(sim.wpass[0, t])
           and int(sim.military_at[0, t]) < 0]
    assert sea, "no water in the bomber's operational range"
    hullslot = spawn(sim, foe, HULL, sea[0])
    sim.unit_tile[0, hullslot] = sea[0]
    sim.military_at[0, sea[0]] = hullslot + sim.POOL_LO["major"]
    sim._gen_ver += 1
    cols = sim._air_strike_targets(row, torch.tensor([[bs]]), torch.tensor([[aero]]),
                                   torch.tensor([[BOMBER]]))[0, 0].tolist()
    assert sea[0] in cols, f"a bomber answers naval units — {cols}"
    sim.major_unit_xp[0, bs] = 0
    sim.unit_xp[0, hullslot] = 0
    shp0, bhp0 = int(sim.unit_hp[0, hullslot]), int(sim.major_unit_hp[0, bs])
    order(sim, row, bs, sim._A_AIR_STRIKE + cols.index(sea[0]))
    assert int(sim.unit_hp[0, hullslot]) < shp0 and int(sim.major_unit_hp[0, bs]) < bhp0, (
        "the scene needs both sides to take a blow for the XP check to mean anything")
    # CIV6 (Experience): "every time a unit enters and survives combat ... it
    # will gain XP" — an aircraft is such a unit, which is what its own
    # promotion trees are for.
    assert int(sim.major_unit_xp[0, bs]) > 0, "the sortie paid the aircraft nothing"
    assert int(sim.unit_xp[0, hullslot]) > 0, "the sortie paid the defender nothing"
    print(f"  4 the sortie pays both sides OK (plane {int(sim.major_unit_xp[0, bs])} xp, "
          f"hull {int(sim.unit_xp[0, hullslot])} xp)")

    # -- 5: who may bank XP at all -------------------------------------------
    civ = a_type(sim, lambda i: bool(sim._type_civilian[i]))
    tys = torch.tensor([BOMBER, FIGHTER, civ])
    ok = sim._xp_eligible(tys).tolist()
    assert ok[0] and ok[1], "an aircraft banks XP"
    assert not ok[2], "a civilian never fights"
    if sim._spy_idx >= 0:
        assert not bool(sim._xp_eligible(torch.tensor([sim._spy_idx]))[0]), (
            "a Spy earns its levels through its missions, not through a roll")
    print("  5 xpEligible OK (air yes, civilian no, spy no)")

    # -- 6: SKY AND STARS -----------------------------------------------------
    # CIV6 (Sky and Stars, Golden face): "+100% XP earned for all Air Units."
    sim = fresh(rules, path)
    land = a_type(sim, lambda i: float(sim._type_combat[i]) > 0 and not bool(sim.unit_naval[i])
                  and int(sim._type_air[i]) == 0)
    seat = torch.tensor([row])

    def pct(ty):
        return int(sim._seat_xp_pct(torch.tensor([ty]), seat)[0])

    base_air, base_land = pct(BOMBER), pct(land)
    sim.civ_age[0, row] = 2
    sim.ded_picks[0, row, 0] = sim._ded_sky
    assert pct(BOMBER) - base_air == sim._sky_air_xp == 100, (
        f"the aircraft's golden half is {pct(BOMBER) - base_air}, not {sim._sky_air_xp}")
    assert pct(land) == base_land, "and the ground gets nothing from it"
    sim.civ_age[0, row] = 1
    assert pct(BOMBER) == base_air, "outside a Golden age it pays nothing"
    print(f"  6 Sky and Stars OK (+{sim._sky_air_xp}% air, +0 ground, +0 outside the age)")

    # -- 7: TACTICAL MAINTENANCE ---------------------------------------------
    # CIV6: "Can heal after attacking."
    sim = fresh(rules, path)
    bs, _ = retype(sim, row, BOMBER)
    sim.major_unit_mp[0, bs] = 0.0                       # the sortie spent the turn
    sim.major_unit_attacks[0, bs] = 0                    # and the attack with it
    assert bool(sim._heal_blocked("major")[0, bs]), "a spent turn silences the ordinary heal"
    sim.major_unit_promos[0, bs] = 1 << col_with(rules, "AIR_BOMBER", "HEAL_AFTER_ATTACK")
    assert not bool(sim._heal_blocked("major")[0, bs]), (
        "CIV6 (Tactical Maintenance): 'can heal after attacking'")
    sim.major_unit_attacks[0, bs] = int(sim._full_attacks("major")[0, bs])
    assert bool(sim._heal_blocked("major")[0, bs]), (
        "a plane that spent its turn WITHOUT attacking is still grounded")
    print("  7 Tactical Maintenance OK (heals after a strike, not after a rebase)")

    # -- 8: LOOT --------------------------------------------------------------
    # CIV6: "+50 Gold from coastal raids", flat and on top of the plunder row.
    def raid(loot: bool) -> int:
        s = fresh(rules, path)
        s.war[0, row, foe] = True
        s.war[0, foe, row] = True
        wet = [t for t in range(s.T)
               if bool(s.water[0, t]) and int(s.military_at[0, t]) < 0
               and any(int(n) >= 0 and not bool(s.water[0, int(n)]) for n in s.neigh[t])]
        assert wet, "the map offers no water tile beside land"
        here = wet[0]
        tgt = next(int(n) for n in s.neigh[here] if int(n) >= 0 and not bool(s.water[0, int(n)]))
        s.tile_seat[0, tgt] = foe
        s.improvement[0, tgt] = 0
        s.pillaged[0, tgt] = False
        s.district[0, tgt] = -1
        s._tile_owner_ver += 1
        s._eff_version += 1
        sl, _ = retype(s, row, RAIDER, here)
        s.major_unit_mp[0, sl] = 4.0
        s.military_at[0, here] = sl + s.POOL_LO["major"]
        if loot:
            s.major_unit_promos[0, sl] = 1 << col_with(rules, "NAVAL_RAIDER", "RAID_GOLD", v=50)
        s._gen_ver += 1
        s.civ_treasury[0, row] = 0
        order(s, row, sl, s._A_PILLAGE)
        assert bool(s.pillaged[0, tgt]), "the coastal raid did not fire"
        return int(s.civ_treasury[0, row])

    paid, bare = raid(True), raid(False)
    assert paid - bare == 50, f"Loot paid {paid - bare} gold, not 50"
    print(f"  8 Loot OK (+{paid - bare} gold on a coastal raid)")

    # -- 9: THE CARRIER DECK --------------------------------------------------
    # CIV6 (Flight Deck, Hangar Deck, Folding Wings): "+1 additional aircraft
    # slot" apiece, on the hull that floats them.
    s = fresh(rules, path)
    wet = [t for t in range(s.T) if bool(s.water[0, t]) and int(s.military_at[0, t]) < 0]
    assert wet, "the map offers no free water tile"
    here = wet[0]
    hs, _ = retype(s, row, CARRIER, here)
    s.military_at[0, here] = hs + s.POOL_LO["major"]
    s.major_unit_promos[0, hs] = 0
    s._gen_ver += 1
    deck0 = int(s._air_slots_at(row)[0, here])
    assert deck0 == int(s._type_air_slots[CARRIER]), (
        f"the bare hull bases {deck0}, not its chassis' {int(s._type_air_slots[CARRIER])}")
    cc = rules.promo_classes.index("NAVAL_CARRIER")
    kk = rules.promo_kinds.index("AIR_SLOTS")
    decks = [j for j in range(int(rules.promo_rows[cc]))
             if any(int(rules.promo_kind[cc, j, sx]) == kk
                    for sx in range(rules.promo_kind.shape[2]))]
    assert len(decks) == 3, f"the carrier tree holds {len(decks)} slot rows, not 3"
    for n, j in enumerate(decks, start=1):
        s.major_unit_promos[0, hs] |= 1 << j
        s._gen_ver += 1
        got = int(s._air_slots_at(row)[0, here])
        assert got == deck0 + n, f"{n} deck rows based {got}, not {deck0 + n}"
    assert int(s._air_slots_at(foe)[0, here]) == 0, "a hull bases its OWN seat alone"
    print(f"  9 the carrier deck OK ({deck0} -> {deck0 + 3} slots over three rows)")

    print("AIR PROMO OK — four trees, both new conditions, the sortie's XP, "
          "Sky and Stars, Tactical Maintenance, Loot and the carrier deck")


if __name__ == "__main__":
    main()
