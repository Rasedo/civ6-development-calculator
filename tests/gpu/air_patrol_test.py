"""AIR COMBAT'S SECOND HALF on the GPU side: the patrol, the interception,
Priority Target and the order a sortie resolves in — the twin of
`tests/cpu/units/air-patrol.test.ts`. The Civilopedia's Air Combat chapters
(`LOC_PEDIA_CONCEPTS_PAGE_AIRCOMBAT_3..5`) are the source every check quotes.

No seed trains an aircraft, so this lane is what reaches the rules. Every
check is poked into the bodies `policy/drive.py` drives: `_seat_unit_mask`,
`_deploy_targets`, `_priority_targets`, `_apply_seat_unit_actions`,
`_interceptor_scan`, `_heal_blocked`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
import drive
from core import load_rules, fixture_paths, neutral
from warmup import warm_base, opened


def fresh(rules, path, turns=30):
    """ONE warmed engine per (fixture, warmup); every scene restores it."""
    return warm_base((str(path), turns), lambda: opened(rules, path, turns))


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


def spawn(sim, row, ty, tile):
    """a fresh row-`row` unit of `ty` standing on `tile` exactly (the spawn's
    own free-spot search is moved past), in whatever plane its class holds."""
    was = set(sim.major_unit_alive[0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(1, dtype=torch.bool), torch.tensor([tile]),
                    torch.tensor([ty]))
    got = set(sim.major_unit_alive[0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, "the spawn found no slot"
    v = got.pop()
    at = int(sim.unit_tile[0, v])
    if at != tile:
        r, s = torch.tensor([0]), torch.tensor([v])
        if int(sim._type_air[ty]) == 0:
            sim._occ_clear(r, torch.tensor([at]), s)
        sim.unit_tile[0, v] = tile
        if int(sim._type_air[ty]) == 0:
            sim._occ_set(r, torch.tensor([tile]), s)
    sim._gen_ver += 1
    return v


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[0]
    rank = int((smap == slot).nonzero(as_tuple=True)[0][0])
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def mask_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[0]
    rank = int((smap == slot).nonzero(as_tuple=True)[0][0])
    return sim._seat_unit_mask(row)[0, rank]


def a_type(sim, pred):
    for i in range(sim.NU):
        if pred(i):
            return i
    return -1


def bare_land(sim, near, lo, hi, avoid=()):
    """dry, passable, unoccupied, district-free tiles `lo..hi` hexes from
    `near`, tile index ascending"""
    return [t for t in range(sim.T)
            if lo <= int(sim.pair_dist[near, t]) <= hi and bool(sim.passable[0, t])
            and not bool(sim.water[0, t]) and int(sim.district[0, t]) < 0
            and int(sim.centre_slot_at[0, t]) < 0 and int(sim.built_wonder[0, t]) < 0
            and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0
            and int(sim.support_at[0, t]) < 0 and t not in avoid]


def at_war(sim, a, b):
    sim.war[0, a, b] = True
    sim.war[0, b, a] = True


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    row, foe = 1, 0

    sim = fresh(rules, path)
    assert sim._any_air, "the roster fields no aircraft — every check below is vacuous"
    fighters = [i for i in range(sim.NU) if int(sim._type_air[i]) == 1]
    FIGHTER = min(fighters, key=lambda i: (int(sim._type_combat[i]), i))
    JET = max(fighters, key=lambda i: (int(sim._type_combat[i]), -i))
    assert int(sim._type_combat[JET]) > int(sim._type_combat[FIGHTER])
    BOMBER = a_type(sim, lambda i: int(sim._type_air[i]) == 2)
    GUNNER = a_type(sim, lambda i: int(sim._type_anti_air[i]) > 0 and not bool(sim.unit_naval[i])
                    and int(sim._type_air[i]) == 0 and bool(sim._type_support[i]))
    HULL = a_type(sim, lambda i: int(sim._type_anti_air[i]) > 0 and bool(sim.unit_naval[i]))
    SHIP = a_type(sim, lambda i: bool(sim.unit_naval[i]) and int(sim._type_anti_air[i]) == 0
                  and int(sim._type_combat[i]) > 0 and int(sim._type_air_slots[i]) == 0)
    SOFT = a_type(sim, lambda i: int(sim._type_combat[i]) > 0 and int(sim._type_anti_air[i]) == 0
                  and not bool(sim.unit_naval[i]) and int(sim._type_air[i]) == 0
                  and not bool(sim._type_support[i]) and not bool(sim._type_civilian[i]))
    MEDIC = a_type(sim, lambda i: bool(sim._type_support[i]) and int(sim._type_anti_air[i]) == 0
                   and int(sim._type_air[i]) == 0)
    assert min(FIGHTER, BOMBER, GUNNER, HULL, SHIP, SOFT, MEDIC) >= 0
    # CIV6 (Patrols): "its effective intercept range (currently 1 hex
    # radius)"; (Interceptions): "adding +5 to the strength of the main
    # interceptor"
    assert sim._intercept_range == 1 and sim._intercept_support_cs == 5

    # -- 1: DEPLOY and RETURN TO BASE ---------------------------------------
    j = a_city(sim, row)
    ctr = int(sim.city_center[0, row, j])
    aero = aerodrome(sim, row, j)
    fs = spawn(sim, row, FIGHTER, aero)
    bs = spawn(sim, row, BOMBER, aero)
    heads = sim._deploy_targets(row, torch.tensor([[fs, bs]]), torch.tensor([[aero, aero]]),
                                torch.tensor([[FIGHTER, BOMBER]]))[0]
    live = [int(t) for t in heads[0].tolist() if t >= 0]
    assert ctr in live and aero in live, f"the seat's own districts are offered — {live}"
    assert live == sorted(live), "the head reads tile-index ascending"
    reach = int(sim._type_moves[FIGHTER])
    assert all(int(sim.pair_dist[aero, t]) <= reach for t in live), (
        "CIV6: 'deployed to a valid hex within their Movement range from a friendly air base'")
    assert all(int(t) < 0 for t in heads[1].tolist()), (
        "CIV6: 'Heavy Bomber aircraft cannot deploy on Patrols'")
    m = mask_of(sim, row, fs)
    assert bool(m[sim._A_DEPLOY + live.index(ctr)]) and not bool(m[sim._A_RETURN])
    order(sim, row, fs, sim._A_DEPLOY + live.index(ctr))
    assert int(sim.unit_patrol[0, fs]) == ctr, "DISPATCH DEAD: DEPLOY set no patrol"
    assert int(sim.unit_tile[0, fs]) == aero, "the base keeps its slot"
    assert int(sim.unit_mp[0, fs]) == 0, "the deployment spends the turn"
    sim.unit_mp[0, fs] = sim.unit_mp_full[0, fs]
    assert bool(mask_of(sim, row, fs)[sim._A_RETURN]), "a patrol may return to base"
    order(sim, row, fs, sim._A_RETURN)
    assert int(sim.unit_patrol[0, fs]) == -1, "DISPATCH DEAD: RETURN_TO_BASE"
    assert int(sim.unit_mp[0, fs]) == int(sim.unit_mp_full[0, fs]), "and it costs no movement"
    print(f"  1 DEPLOY / RETURN_TO_BASE OK ({len(live)} hex(es) offered, the bomber none)")

    # -- 2: the heal ---------------------------------------------------------
    # CIV6 (Patrols): aircraft heal "when stationed"; (Ground Crews) "Heal
    # while patrolling or deployed".
    crews = next(k for k in range(int(rules.promo_rows[rules.promo_classes.index("AIR_FIGHTER")]))
                 if any(int(rules.promo_kind[rules.promo_classes.index("AIR_FIGHTER"), k, s])
                        == rules.promo_kinds.index("HEAL_AFTER_ACTION")
                        for s in range(rules.promo_kind.shape[2])))
    assert not bool(sim._heal_blocked("major")[0, fs]), "a rested plane at its base heals"
    sim.unit_patrol[0, fs] = ctr
    assert bool(sim._heal_blocked("major")[0, fs]), "a patrol does not heal"
    sim.unit_promos[0, fs] = 1 << crews
    assert not bool(sim._heal_blocked("major")[0, fs]), "unless it holds Ground Crews"
    sim.unit_promos[0, fs] = 0
    sim.unit_patrol[0, fs] = -1
    print("  2 the patrol's heal OK (barred, Ground Crews lifts it)")

    # -- 3: who intercepts ---------------------------------------------------
    sim = fresh(rules, path)
    at_war(sim, row, foe)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    fctr = int(sim.city_center[0, foe, a_city(sim, foe)])
    fs = spawn(sim, row, FIGHTER, aero)
    mark = bare_land(sim, aero, 1, int(sim._type_ranged_range[FIGHTER]))[0]
    seat = torch.tensor([row])
    tg = torch.tensor([mark])
    stationed = spawn(sim, foe, FIGHTER, fctr)
    assert not bool(sim._interceptor_scan(seat, tg)[1][0]), "a stationed fighter does not intercept"
    near = [t for t in range(sim.T) if int(sim.pair_dist[mark, t]) == 1]
    far = [t for t in range(sim.T) if int(sim.pair_dist[mark, t]) == 3]
    sim.unit_patrol[0, stationed] = far[0]
    assert not bool(sim._interceptor_scan(seat, tg)[1][0]), "nor a patrol out of range"
    sim.unit_patrol[0, stationed] = near[0]
    slot, has, n = sim._interceptor_scan(seat, tg)
    assert bool(has[0]) and int(slot[0]) == stationed and int(n[0]) == 1
    strong = spawn(sim, foe, JET, fctr)
    sim.unit_patrol[0, strong] = mark
    slot, has, n = sim._interceptor_scan(seat, tg)
    assert int(slot[0]) == strong and int(n[0]) == 2, (
        "CIV6: 'the highest strength aircraft is chosen to intercept'")
    mine = spawn(sim, row, FIGHTER, aero)
    sim.unit_patrol[0, mine] = mark
    assert int(sim._interceptor_scan(seat, tg)[2][0]) == 2, "an own patrol is no answer"
    print("  3 interception scan OK (range, stationed, strongest, own seat)")

    # -- 4: a fighter turned back, a bomber flying on -----------------------
    sim = fresh(rules, path)
    at_war(sim, row, foe)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    fctr = int(sim.city_center[0, foe, a_city(sim, foe)])
    fs = spawn(sim, row, FIGHTER, aero)
    mark = bare_land(sim, aero, 1, int(sim._type_ranged_range[FIGHTER]))[0]
    es = spawn(sim, foe, SOFT, mark)
    ip = spawn(sim, foe, FIGHTER, fctr)
    sim.unit_patrol[0, ip] = mark
    cols = sim._air_strike_targets(row, torch.tensor([[fs]]), torch.tensor([[aero]]),
                                   torch.tensor([[FIGHTER]]))[0, 0].tolist()
    assert mark in cols
    order(sim, row, fs, sim._A_AIR_STRIKE + cols.index(mark))
    assert bool(sim.unit_alive[0, fs]) and int(sim.unit_hp[0, fs]) < 100, "the patrol fired"
    assert int(sim.unit_hp[0, es]) == 100, (
        "CIV6: an intercepted fighter 'will not attack the ground target'")
    assert int(sim.unit_mp[0, fs]) == 0 and int(sim.unit_attacks[0, fs]) == 0, (
        "and its sortie is spent")

    def bomber_run(n_patrols):
        """a bomber striking a ship under `n_patrols` foe patrols: (the
        bomber's damage, the ship's damage)"""
        s = fresh(rules, path)
        at_war(s, row, foe)
        jj = a_city(s, row)
        ae = aerodrome(s, row, jj)
        fc = int(s.city_center[0, foe, a_city(s, foe)])
        b = spawn(s, row, BOMBER, ae)
        sea = [t for t in range(s.T)
               if 0 < int(s.pair_dist[ae, t]) <= int(s._type_ranged_range[BOMBER])
               and bool(s.wpass[0, t]) and int(s.military_at[0, t]) < 0]
        assert sea, "no water in the bomber's operational range"
        sh = spawn(s, foe, SHIP, sea[0])
        for _ in range(n_patrols):
            p = spawn(s, foe, FIGHTER, fc)
            s.unit_patrol[0, p] = sea[0]
        bc = s._air_strike_targets(row, torch.tensor([[b]]), torch.tensor([[ae]]),
                                   torch.tensor([[BOMBER]]))[0, 0].tolist()
        assert sea[0] in bc, f"CIV6: a bomber answers naval units — {bc}"
        r0 = s.rng_state.clone()
        order(s, row, b, s._A_AIR_STRIKE + bc.index(sea[0]))
        taken = 100 - int(s.unit_hp[0, b])
        # the interception is the sortie's first roll: the interceptor's
        # strength against an aircraft plus +5 per backer, against the
        # bomber's Ranged Strength (the TS lane pins the same number)
        s.rng_state.copy_(r0)
        diff = (int(s._type_combat[FIGHTER]) + s._intercept_support_cs * (n_patrols - 1)
                - int(s._type_ranged_strength[BOMBER]))
        want = int(s._damage_roll(torch.ones(1, dtype=torch.bool), torch.tensor([diff]), k="pin")[0])
        assert taken == want, f"the interception dealt {taken}, the body says {want} (diff {diff})"
        return taken, 100 - int(s.unit_hp[0, sh])

    one_b, one_s = bomber_run(1)
    assert one_b > 0 and one_s > 0, "CIV6: 'Bombers do not have this restriction'"
    three_b, _ = bomber_run(3)
    assert three_b > one_b, (
        f"CIV6: each other patrol adds +5 — one patrol dealt {one_b}, three {three_b}")
    print(f"  4 fighter turned back, bomber flies on OK (+5 backing: {one_b} -> {three_b})")

    # -- 5: the answers come first ------------------------------------------
    sim = fresh(rules, path)
    at_war(sim, row, foe)
    j = a_city(sim, row)
    aero = aerodrome(sim, row, j)
    bs = spawn(sim, row, BOMBER, aero)
    sim.unit_hp[0, bs] = 1
    sea = [t for t in range(sim.T)
           if 0 < int(sim.pair_dist[aero, t]) <= int(sim._type_ranged_range[BOMBER])
           and bool(sim.wpass[0, t]) and int(sim.military_at[0, t]) < 0]
    hull = spawn(sim, foe, HULL, sea[0])
    bc = sim._air_strike_targets(row, torch.tensor([[bs]]), torch.tensor([[aero]]),
                                 torch.tensor([[BOMBER]]))[0, 0].tolist()
    order(sim, row, bs, sim._A_AIR_STRIKE + bc.index(sea[0]))
    assert not bool(sim.unit_alive[0, bs]), "the hull's answer downed the bomber"
    assert int(sim.unit_hp[0, hull]) == 100, (
        "CIV6: 'if the attacking bomber survives, combat is then resolved with the original target'")
    print("  5 the answers come first OK (a bomber shot down never strikes)")

    # -- 6: a bomber striking a CITY meets the cover ------------------------
    sim = fresh(rules, path)
    at_war(sim, row, foe)
    fj = a_city(sim, foe)
    fctr = int(sim.city_center[0, foe, fj])
    perch = [t for t in range(sim.T) if int(sim.pair_dist[fctr, t]) == 3]
    bs = spawn(sim, row, BOMBER, perch[0])
    gun_at = bare_land(sim, fctr, 1, 1)
    assert gun_at, "the foe centre has no free neighbour for a gun"
    spawn(sim, foe, GUNNER, gun_at[0])
    bc = sim._air_strike_targets(row, torch.tensor([[bs]]), torch.tensor([[perch[0]]]),
                                 torch.tensor([[BOMBER]]))[0, 0].tolist()
    assert fctr in bc, "a bomber answers a hostile centre"
    hp0 = int(sim.city_hp[0, foe, fj])
    order(sim, row, bs, sim._A_AIR_STRIKE + bc.index(fctr))
    assert int(sim.unit_hp[0, bs]) < 100, "the gun beside the city answered the bomber"
    assert int(sim.city_hp[0, foe, fj]) < hp0, "and the bomber struck the city"
    print(f"  6 a city strike meets the cover OK (bomber took {100 - int(sim.unit_hp[0, bs])})")

    # -- 7: the bomb's 50% after the answers --------------------------------
    def bomb(gun):
        s = fresh(rules, path)
        at_war(s, row, foe)
        fc = int(s.city_center[0, foe, a_city(s, foe)])
        t = next(t for t in bare_land(s, fc, 1, 3) if int(s.tile_seat[0, t]) == foe)
        s.improvement[0, t] = 0
        s.pillaged[0, t] = False
        s._eff_version += 1
        perch2 = [p for p in range(s.T) if int(s.pair_dist[t, p]) == 3]
        b = spawn(s, row, BOMBER, perch2[0])
        s.unit_hp[0, b] = 60
        if gun:
            spawn(s, foe, GUNNER, bare_land(s, t, 1, 1)[0])
        pc = s._air_pillage_targets(row, torch.tensor([[b]]), torch.tensor([[perch2[0]]]),
                                    torch.tensor([[BOMBER]]))[0, 0].tolist()
        assert t in pc, "the improvement is offered to the bomb"
        order(s, row, b, s._A_AIR_PILLAGE + pc.index(t))
        return bool(s.pillaged[0, t]), int(s.unit_hp[0, b]), int(s.unit_mp[0, b])

    assert bomb(False)[0], "an unanswered bomb wrecks"
    wrecked, hp, mp = bomb(True)
    assert hp <= 50 and not wrecked and mp == 0, (
        "CIV6: 'at 50% health or higher after resolving any damage taken from ... anti-air'")
    print(f"  7 the bomb's 50% after the answers OK (hp {hp}, nothing wrecked)")

    # -- 8: PRIORITY TARGET --------------------------------------------------
    def priority(prio):
        s = fresh(rules, path)
        at_war(s, row, foe)
        jj = a_city(s, row)
        ae = aerodrome(s, row, jj)
        f = spawn(s, row, FIGHTER, ae)
        t = bare_land(s, ae, 1, int(s._type_ranged_range[FIGHTER]))[0]
        guard = spawn(s, foe, SOFT, t)
        med = spawn(s, foe, MEDIC, t)
        pt = s._priority_targets(row, torch.tensor([[f]]), torch.tensor([[ae]]),
                                 torch.tensor([[FIGHTER]]))[0, 0].tolist()
        assert t in pt, f"the Support unit's tile is a priority target — {pt}"
        assert bool(mask_of(s, row, f)[s._A_PRIORITY + pt.index(t)])
        if prio:
            order(s, row, f, s._A_PRIORITY + pt.index(t))
        else:
            ac = s._air_strike_targets(row, torch.tensor([[f]]), torch.tensor([[ae]]),
                                       torch.tensor([[FIGHTER]]))[0, 0].tolist()
            order(s, row, f, s._A_AIR_STRIKE + ac.index(t))
        return int(s.unit_hp[0, guard]), int(s.unit_hp[0, med]), bool(s.unit_alive[0, med])

    g_hp, m_hp, m_alive = priority(True)
    assert g_hp == 100 and (m_hp < 100 or not m_alive), (
        "CIV6: Priority Target attacks 'Support class units directly, without first having to "
        "eliminate the enemy combat unit placed in the same location'")
    g_hp, m_hp, _ = priority(False)
    assert g_hp < 100 and m_hp == 100, "the plain strike takes the combat unit"
    print("  8 PRIORITY TARGET OK (the Support unit struck past its guard)")

    # -- 9: an order other than the patrol ends it --------------------------
    sim = fresh(rules, path)
    at_war(sim, row, foe)
    j = a_city(sim, row)
    ctr = int(sim.city_center[0, row, j])
    aero = aerodrome(sim, row, j)
    fs = spawn(sim, row, FIGHTER, aero)
    mark = bare_land(sim, aero, 1, int(sim._type_ranged_range[FIGHTER]))[0]
    spawn(sim, foe, SOFT, mark)
    sim.unit_patrol[0, fs] = aero
    cols = sim._air_strike_targets(row, torch.tensor([[fs]]), torch.tensor([[aero]]),
                                   torch.tensor([[FIGHTER]]))[0, 0].tolist()
    order(sim, row, fs, sim._A_AIR_STRIKE + cols.index(mark))
    assert int(sim.unit_patrol[0, fs]) == -1, "a strike ends the patrol"
    f2 = spawn(sim, row, FIGHTER, ctr)
    sim.unit_patrol[0, f2] = ctr
    rb = sim._rebase_targets(row, torch.tensor([[f2]]), torch.tensor([[ctr]]),
                             torch.tensor([[FIGHTER]]))[0, 0].tolist()
    order(sim, row, f2, sim._A_REBASE + rb.index(aero))
    assert int(sim.unit_patrol[0, f2]) == -1 and int(sim.unit_tile[0, f2]) == aero, (
        "a rebase ends the patrol")
    print("  9 a strike and a rebase end the patrol OK")

    # -- 10: the driver's rule ------------------------------------------------
    # at war, a stationed fighter with nothing to hit goes on patrol; at peace
    # a patrol comes home
    def drive_order(war_on, patrolling):
        s = fresh(rules, path)
        for a in range(s.n_majors):
            for b in range(s.n_majors):
                s.war[0, a, b] = False
        if war_on:
            at_war(s, row, foe)
        jj = a_city(s, row)
        ae = aerodrome(s, row, jj)
        f = spawn(s, row, FIGHTER, ae)
        if patrolling:
            s.unit_patrol[0, f] = ae
        # nothing hostile within the fighter's reach, so neither strike head
        # opens and the rule under test is the one that decides
        reach = int(s._type_ranged_range[FIGHTER])
        for v in range(s.UNIT_MAX):
            if (bool(s.unit_alive[0, v]) and int(s.unit_seat[0, v]) != row
                    and int(s.pair_dist[ae, int(s.unit_tile[0, v])]) <= reach):
                if int(s._type_air[int(s.unit_type[0, v])]) == 0:
                    s._occ_clear(torch.tensor([0]), torch.tensor([int(s.unit_tile[0, v])]), torch.tensor([v]))
                s.unit_alive[0, v] = False
        s._gen_ver += 1
        st = neutral.static_for(s)
        nobs = neutral.seat_obs(s, row)
        orders = drive._seat_unit_orders(st, row, nobs)[0][0]
        smap = s._seat_slot_map(row)[0]
        return int(orders[int((smap == f).nonzero(as_tuple=True)[0][0])]), s

    got, s = drive_order(True, False)
    assert s._A_DEPLOY <= got < s._A_DEPLOY + s._air_deploy_cols, (
        f"at war a stationed fighter with nothing to hit deploys — ordered column {got}")
    got, s = drive_order(True, True)
    assert not (s._A_REBASE <= got < s._A_REBASE + s._air_rebase_cols) and got != s._A_RETURN, (
        f"at war a patrol holds its hex — ordered column {got}")
    got, s = drive_order(False, True)
    assert got == s._A_RETURN, f"at peace a patrol comes home — ordered column {got}"
    print("  10 the driver deploys at war and brings the patrol home at peace OK")

    print("AIR PATROL OK — deploy, return, the patrol's heal, interception, the order of a sortie, "
          "the bomb's 50%, Priority Target")


if __name__ == "__main__":
    main()
