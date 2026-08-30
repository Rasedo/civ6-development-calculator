"""AIR UNITS: bases, slots, the strike heads and what a lost base does.

An aircraft is the one class that holds NEITHER occupancy plane — it sits
inside a base, strikes from it and re-bases rather than walking. Every rule
below therefore has to be asserted on the pool directly: a lane that only
watched `military_at` would read an air force as an empty map.

Poked straight into `_seat_unit_mask` / `_apply_seat_unit_actions`, the same
entry points `policy/drive.py` uses.
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


def aerodrome(sim, row, j, complete=True):
    """Give the city a COMPLETE Aerodrome and return its tile."""
    ctr = int(sim.city_center[0, row, j])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[0, t]) == row and int(sim.district[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and bool(sim.passable[0, t]) and t != ctr]
    assert free, "the city owns no free plot for an Aerodrome"
    t = free[0]
    sim.district[0, t] = sim._aerodrome_didx
    sim.district_complete[0, t] = complete
    sim.district_pillaged[0, t] = False
    sim.city_dist_tile[0, row, j, sim._aerodrome_didx] = t
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    return t


def retype(sim, row, ty, tile=None):
    """Retype a live row-`row` unit into `ty` and stand it where asked, so the
    lane never waits for a fixture to field a chassis of its own. Every call
    returns the SAME unit — a second chassis comes from `spawn`."""
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


def grant_resource(sim, row, ty, avoid=()):
    """An owned, improved, unpillaged source of whatever `ty` asks for, plus
    the bank to pay with — the resource arm is not what this lane measures."""
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


def spawn(sim, row, ty, tile):
    """A fresh row-`row` unit of `ty` standing on `tile`, for the checks that
    need a second chassis the fixture does not field."""
    was = set(sim.major_unit_alive[0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(1, dtype=torch.bool), torch.tensor([tile]),
                    torch.tensor([ty]))
    got = set(sim.major_unit_alive[0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, "the spawn found no slot"
    sim._gen_ver += 1
    return got.pop()


def rank_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[0]
    return int((smap == slot).nonzero(as_tuple=True)[0][0])


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, slot)] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def a_type(sim, pred):
    for i in range(sim.NU):
        if pred(i):
            return i
    return -1


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    row = 1

    sim = fresh(rules, path)
    assert sim._any_air, "the roster fields no aircraft — every check below is vacuous"
    FIGHTER = a_type(sim, lambda i: int(sim._type_air[i]) == 1)
    BOMBER = a_type(sim, lambda i: int(sim._type_air[i]) == 2)
    CARRIER = a_type(sim, lambda i: int(sim._type_air_slots[i]) > 0)
    assert FIGHTER >= 0 and BOMBER >= 0 and CARRIER >= 0

    # -- 1: what a tile BASES ----------------------------------------------
    j = a_city(sim, row)
    ctr = int(sim.city_center[0, row, j])
    aero = aerodrome(sim, row, j)
    slots = sim._air_slots_at(row)[0]
    assert int(slots[ctr]) == sim._city_centre_air_slots, (
        f"a City Center bases {sim._city_centre_air_slots}, read {int(slots[ctr])}")
    assert int(slots[aero]) == sim._aerodrome_air_slots, (
        f"an Aerodrome bases {sim._aerodrome_air_slots}, read {int(slots[aero])}")
    hangars = (sim._b_air_slots > 0).nonzero().flatten()
    assert hangars.numel() >= 2, "the catalog carries no Aerodrome buildings"
    for b in hangars.tolist():
        sim.city_bldg[0, row, j, b] = True
    sim._eff_version += 1
    grown = int(sim._air_slots_at(row)[0, aero])
    assert grown == sim._aerodrome_air_slots + int(sim._b_air_slots[hangars].sum()), (
        f"CIV6: an Aerodrome 'can reach 4 slots after constructing the Hangar and "
        f"the Airport' — read {grown}")
    sim.district_pillaged[0, aero] = True
    sim._eff_version += 1
    assert int(sim._air_slots_at(row)[0, aero]) == 0, "a wrecked base bases nothing"
    print(f"  1 slots OK (centre {sim._city_centre_air_slots}, aerodrome {sim._aerodrome_air_slots} -> {grown}, pillaged 0)")

    # -- 2: the TRAINING gate, and where a plane lands ----------------------
    sim = fresh(rules, path)
    j = a_city(sim, row)
    for t in range(sim.NU):
        rt = int(sim._type_tech[t])
        rc = int(sim._type_civic[t])
        if rt >= 0:
            sim.civ_techs[0, row, rt] = True
        if rc >= 0:
            sim.civ_civics[0, row, rc] = True
    grant_resource(sim, row, FIGHTER)
    assert not bool(sim._trainable_units(row)[0, j, FIGHTER]), (
        "CIV6: aircraft 'can only be built in a city with an Aerodrome'")
    aero = aerodrome(sim, row, j)
    assert bool(sim._trainable_units(row)[0, j, FIGHTER]), "an Aerodrome opens the column"
    ctr = int(sim.city_center[0, row, j])
    one = torch.ones(1, dtype=torch.bool)
    ty = torch.tensor([FIGHTER])

    def build_one():
        at = sim._air_spawn_at(row, ty, torch.tensor([j]), torch.tensor([ctr]))
        was = set(sim.major_unit_alive[0].nonzero().flatten().tolist())
        sim._spawn_unit(row, one, at, ty)
        got = set(sim.major_unit_alive[0].nonzero().flatten().tolist()) - was
        assert len(got) == 1, "the spawn found no slot"
        sim._gen_ver += 1
        return got.pop()

    v = build_one()
    assert int(sim.major_unit_tile[0, v]) == aero, (
        "CIV6: 'newly built aircraft will spawn in the Aerodrome'")
    assert int(sim.military_at[0, aero]) != v + sim.POOL_LO["major"], (
        "an aircraft holds NO military slot — the tile must stay open")
    assert int(sim.civilian_at[0, aero]) != v + sim.POOL_LO["major"], (
        "and no civilian slot either")
    for _ in range(sim._aerodrome_air_slots - 1):
        build_one()
    assert int(sim._air_at(row)[0, aero]) == sim._aerodrome_air_slots, (
        "the base should now be full")
    assert not bool(sim._trainable_units(row)[0, j, FIGHTER]), (
        "CIV6: a plane spawns in the Aerodrome only 'as long as it still has empty slots'")
    assert int(sim._air_spawn_at(row, ty, torch.tensor([j]), torch.tensor([ctr]))[0]) == ctr, (
        "with the Aerodrome full, `airTrainTile` falls back to the centre")
    print(f"  2 training gated on the Aerodrome, spawn lands on it, full base closes the column OK")

    # -- 3: the STRIKE head, fighter vs bomber ------------------------------
    sim = fresh(rules, path)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    foe = next(r for r in range(sim.n_majors) if r != row)
    sim.war[0, row, foe] = True
    sim.war[0, foe, row] = True
    fs, _ = retype(sim, row, FIGHTER, aero)
    ring = [t for t in range(sim.T)
            if 0 < int(sim.pair_dist[aero, t]) <= int(sim._type_ranged_range[FIGHTER])
            and int(sim.district[0, t]) < 0 and bool(sim.passable[0, t])
            and not bool(sim.water[0, t])]
    assert len(ring) >= 2, "the base has no dry land in operational range"
    mark = ring[0]
    # a LAND gunner: the first Anti-Air chassis in the roster floats, and a
    # fighter declines ships by rule, so picking on antiAir alone measures
    # nothing.
    gunner = a_type(sim, lambda i: int(sim._type_anti_air[i]) > 0
                    and not bool(sim.unit_naval[i]) and int(sim._type_air[i]) == 0)
    assert gunner >= 0, "the roster carries no land Anti-Air Strength"
    es, _ = retype(sim, foe, gunner, mark)
    sim.military_at[0, mark] = es + sim.POOL_LO["major"]
    sim._gen_ver += 1
    cols = sim._air_strike_targets(row, torch.tensor([[fs]]), torch.tensor([[aero]]),
                                   torch.tensor([[FIGHTER]]))[0, 0]
    assert mark in cols.tolist(), f"a FIGHTER answers land units — {mark} is not in {cols.tolist()}"
    bcols = sim._air_strike_targets(row, torch.tensor([[fs]]), torch.tensor([[aero]]),
                                    torch.tensor([[BOMBER]]))[0, 0]
    assert mark not in bcols.tolist(), (
        "CIV6: a bomber's damage is 'effective against cities and naval units but "
        "not against land units'")
    live = [int(t) for t in cols.tolist() if t >= 0]
    assert live == sorted(live), "the head must read TILE-INDEX ascending on both engines"
    print(f"  3 strike head OK (fighter offers {len(live)} tile(s), bomber declines the land target)")

    # -- 4: the sortie, and who answers it ----------------------------------
    k = cols.tolist().index(mark)
    hp0 = int(sim.major_unit_hp[0, es])
    ahp0 = int(sim.major_unit_hp[0, fs])
    order(sim, row, fs, sim._A_AIR_STRIKE + k)
    assert int(sim.major_unit_hp[0, es]) < hp0, (
        f"DISPATCH DEAD: the strike left the target at {int(sim.major_unit_hp[0, es])} hp")
    # CIV6 (Anti-Air Gun): "Provides cover from air attacks up to 1 hex away
    # from the weapon" — the hex it stands on is inside that.
    assert int(sim.major_unit_hp[0, fs]) < ahp0, (
        "the parked weapon did not answer over its own hex")
    assert float(sim.major_unit_mp[0, fs]) == 0.0, "and the sortie is the turn"
    print(f"  4 AIR_STRIKE OK ({hp0} -> {int(sim.major_unit_hp[0, es])} hp, "
          f"the weapon answers for {ahp0 - int(sim.major_unit_hp[0, fs])})")

    # -- 4c: how far that cover reaches --------------------------------------
    def cover_at(gun_dist):
        """a strike at `mark` with the weapon `gun_dist` hexes off it; None
        parks no weapon at all. Returns the damage the aircraft took."""
        s = fresh(rules, path)
        jj = a_city(s, row)
        ae = aerodrome(s, row, jj)
        s.war[0, row, foe] = True
        s.war[0, foe, row] = True
        f2, _ = retype(s, row, FIGHTER, ae)
        ring2 = [tt for tt in range(s.T)
                 if 0 < int(s.pair_dist[ae, tt]) <= int(s._type_ranged_range[FIGHTER])
                 and int(s.district[0, tt]) < 0 and bool(s.passable[0, tt])
                 and not bool(s.water[0, tt])]
        m2 = ring2[0]
        soft = a_type(s, lambda i: float(s._type_combat[i]) > 0 and int(s._type_anti_air[i]) == 0
                      and not bool(s.unit_naval[i]) and int(s._type_air[i]) == 0)
        e2 = spawn(s, foe, soft, m2)
        s.unit_tile[0, e2] = m2
        s.military_at[0, m2] = e2 + s.POOL_LO["major"]
        if gun_dist is not None:
            at = next(tt for tt in range(s.T) if int(s.pair_dist[m2, tt]) == gun_dist
                      and int(s.civilian_at[0, tt]) < 0)
            gn = spawn(s, foe, gunner, at)
            s.unit_tile[0, gn] = at
            s.civilian_at[0, at] = gn + s.POOL_LO["major"]
        s._gen_ver += 1
        c2 = s._air_strike_targets(row, torch.tensor([[f2]]), torch.tensor([[ae]]),
                                   torch.tensor([[FIGHTER]]))[0, 0].tolist()
        assert m2 in c2, "the soft target left the strike head"
        before = int(s.major_unit_hp[0, f2])
        order(s, row, f2, s._A_AIR_STRIKE + c2.index(m2))
        return before - int(s.major_unit_hp[0, f2])

    assert cover_at(None) == 0, "nothing answers a strike no weapon covers"
    assert cover_at(1) > 0, "CIV6: cover reaches 'up to 1 hex away from the weapon'"
    assert cover_at(3) == 0, "and no further"
    print("  4c cover OK (none 0, one hex answers, three hexes silent)")

    # -- 4b: the one exception the source names — an anti-air SHIP ----------
    sim = fresh(rules, path)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    bs, _ = retype(sim, row, BOMBER, aero)
    grant_resource(sim, row, BOMBER)
    sim.war[0, row, foe] = True
    sim.war[0, foe, row] = True
    gunship = a_type(sim, lambda i: int(sim._type_anti_air[i]) > 0 and bool(sim.unit_naval[i]))
    assert gunship >= 0, "the roster carries no anti-air hull"
    reach = int(sim._type_ranged_range[BOMBER])
    sea = [t for t in range(sim.T)
           if 0 < int(sim.pair_dist[aero, t]) <= reach and bool(sim.wpass[0, t])
           and int(sim.military_at[0, t]) < 0]
    assert sea, "no water in the bomber's operational range"
    ship = spawn(sim, foe, gunship, sea[0])
    sim.unit_tile[0, ship] = sea[0]
    sim.military_at[0, sea[0]] = ship + sim.POOL_LO["major"]
    sim._gen_ver += 1
    bcols = sim._air_strike_targets(row, torch.tensor([[bs]]), torch.tensor([[aero]]),
                                    torch.tensor([[BOMBER]]))[0, 0].tolist()
    assert sea[0] in bcols, f"CIV6: a bomber answers naval units — {bcols}"
    shp0, bhp0 = int(sim.unit_hp[0, ship]), int(sim.major_unit_hp[0, bs])
    order(sim, row, bs, sim._A_AIR_STRIKE + bcols.index(sea[0]))
    assert int(sim.unit_hp[0, ship]) < shp0, "the bomber hit the hull"
    assert int(sim.major_unit_hp[0, bs]) < bhp0, (
        "CIV6: 'the only exceptions are SHIPS with the Anti-Air Strength stat'")
    print(f"  4b the anti-air HULL answers ({bhp0 - int(sim.major_unit_hp[0, bs])} back)")

    # -- 5: REBASE ----------------------------------------------------------
    sim = fresh(rules, path)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    ctr = int(sim.city_center[0, row, j])
    fs, _ = retype(sim, row, FIGHTER, ctr)
    reach = 2 * int(sim._type_moves[FIGHTER])
    rb = sim._rebase_targets(row, torch.tensor([[fs]]), torch.tensor([[ctr]]),
                             torch.tensor([[FIGHTER]]))[0, 0].tolist()
    assert aero in rb, f"an own Aerodrome with room is a base — {rb}"
    assert all(0 < int(sim.pair_dist[ctr, t]) <= reach for t in rb if t >= 0), (
        "CIV6: 'the maximum re-base distance is twice the Moves of that air unit'")
    order(sim, row, fs, sim._A_REBASE + rb.index(aero))
    assert int(sim.major_unit_tile[0, fs]) == aero, "DISPATCH DEAD: REBASE did not move the plane"
    assert float(sim.major_unit_mp[0, fs]) == 0.0, "and it costs the turn"
    print(f"  5 REBASE OK ({ctr} -> {aero}, {len([t for t in rb if t >= 0])} base(s) offered)")

    # -- 6: a lost base ------------------------------------------------------
    sim = fresh(rules, path)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    ctr = int(sim.city_center[0, row, j])
    fs, _ = retype(sim, row, FIGHTER, aero)
    sim.district_pillaged[0, aero] = True
    sim._eff_version += 1
    sim._air_scatter_from(torch.tensor([0]), torch.tensor([aero]))
    assert bool(sim.major_unit_alive[0, fs]) and int(sim.major_unit_tile[0, fs]) == ctr, (
        "CIV6: a pillaged airbase makes its aircraft 'scatter to nearby valid bases "
        f"instead of being destroyed' — read tile {int(sim.major_unit_tile[0, fs])}")
    # the centre holds its one plane now, so the next refugee has nowhere to go
    fs_b = spawn(sim, row, FIGHTER, aero)
    sim._air_scatter_from(torch.tensor([0]), torch.tensor([aero]))
    assert not bool(sim.major_unit_alive[0, fs_b]), (
        "CIV6: 'if there are no nearby valid bases, the aircraft will be destroyed'")

    sim = fresh(rules, path)
    sea = next(t for t in range(sim.T) if bool(sim.water[0, t]))
    cs, _ = retype(sim, row, CARRIER, sea)
    sim.military_at[0, sea] = cs + sim.POOL_LO["major"]
    fs2 = spawn(sim, row, FIGHTER, sea)
    assert int(sim._air_slots_at(row)[0, sea]) == int(sim._type_air_slots[CARRIER]), (
        "CIV6: an Aircraft Carrier 'starts with 2' slots, wherever it floats")
    sim.major_unit_alive[0, cs] = False
    sim._dig_at(torch.tensor([0]), torch.tensor([sea]), torch.tensor([row]))
    assert not bool(sim.major_unit_alive[0, fs2]), (
        "CIV6: 'should your Aircraft Carrier be destroyed, your aircraft stationed "
        "within will be destroyed'")
    print("  6 pillage scatters, a base with no room destroys, a sunk carrier takes its planes OK")

    # -- 7: the carrier CARRIES ----------------------------------------------
    sim = fresh(rules, path)
    sea = next(t for t in range(sim.T)
               if bool(sim.water[0, t]) and any(bool(sim.water[0, int(n)])
                                                for n in sim.neigh[t] if int(n) >= 0))
    dest = next(int(n) for n in sim.neigh[sea] if int(n) >= 0 and bool(sim.water[0, int(n)]))
    cs, _ = retype(sim, row, CARRIER, sea)
    fs3 = spawn(sim, row, FIGHTER, sea)
    sim._air_carry_with(torch.ones(1, dtype=torch.bool), torch.tensor([cs]),
                        torch.tensor([sea]), torch.tensor([dest]))
    assert int(sim.major_unit_tile[0, fs3]) == dest, (
        f"a moving carrier takes its based aircraft along — read {int(sim.major_unit_tile[0, fs3])}")
    print(f"  7 a moving carrier carries its aircraft OK ({sea} -> {dest})")

    print("AIR OK — bases, slots, both heads, the sortie and every way a base is lost")


if __name__ == "__main__":
    main()
