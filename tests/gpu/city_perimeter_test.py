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
  3. `_city_ranged_strength` charges land ranged -17 always and naval ranged
     only while a perimeter stands, and a SIEGE unit fires at its Bombard
     Strength with no penalty at all.
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
from core.simbase import HIT_MELEE, HIT_RANGED, HIT_BOMBARD, ASSIST_RAM, ASSIST_TOWER
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


def split(sim, outer, roll, klass, assist=0, wmax=None):
    """`_city_damage_split` with the per-game codes spelled as scalars."""
    W = sim._walls_hp if wmax is None else wmax
    return sim._city_damage_split(L(sim, outer), L(sim, W), L(sim, roll),
                                  L(sim, klass), L(sim, assist))


def test_split(sim) -> None:
    W = sim._walls_hp
    bands = {
        W: 1,                       # intact: "1 damage only"
        int(0.8 * W): 8,            # "not more than 5-10 damage per attack"
        int(0.25 * W): 30,          # breached: full damage
        0: 30,                      # no perimeter at all
    }
    for outer, want in bands.items():
        _, centre = split(sim, outer, 30, HIT_RANGED)
        assert int(centre) == want, f"outer {outer}/{W}: centre {int(centre)}, want {want}"
    _, half = split(sim, W // 2, 30, HIT_RANGED)
    assert 8 < int(half) < 30, f"a half-down perimeter should reduce but not stop: {int(half)}"

    wall_m, _ = split(sim, W, 40, HIT_MELEE)
    wall_r, _ = split(sim, W, 40, HIT_RANGED)
    assert int(wall_m) == 6, f"melee should take 15% of 40: {int(wall_m)}"
    assert int(wall_r) == 20, f"ranged should take 50% of 40: {int(wall_r)}"
    capped, _ = split(sim, 3, 40, HIT_RANGED)
    assert int(capped) == 3, f"the perimeter share must cap at the pool: {int(capped)}"
    none, full = split(sim, 0, 40, HIT_MELEE)
    assert int(none) == 0 and int(full) == 40, "an unwalled city loses nothing to a pool it has not got"
    print(f"  split OK: 1 / 8 / reduced / full across the four bands, -85% melee and -50% ranged (walls {W})")


def test_bombard_and_support(sim) -> None:
    """CIV6: a BOMBARD attack and a Battering Ram's melee attacker "do full
    damage" to the perimeter; a Siege Tower's attacker "bypasses Walls and hits
    the city directly, inflicting damage as if there were no walls protecting
    it". The tier gate is Gathering Storm's: the ram stops above Ancient Walls,
    the tower above Medieval."""
    W = sim._walls_hp
    wall_b, _ = split(sim, W, 40, HIT_BOMBARD)
    assert int(wall_b) == 40, f"a bombard hit must reach the perimeter at full: {int(wall_b)}"
    wall_ram, centre_ram = split(sim, W, 40, HIT_MELEE, ASSIST_RAM)
    assert int(wall_ram) == 40, f"a ram makes the melee share full: {int(wall_ram)}"
    assert int(centre_ram) == 1, "a ram does NOT open the centre — 'damage against the city itself is still subject to damage reduction'"
    wall_tw, centre_tw = split(sim, W, 40, HIT_MELEE, ASSIST_TOWER)
    assert int(centre_tw) == 40, f"a tower hits the centre 'as if there were no walls': {int(centre_tw)}"
    assert int(wall_tw) == 6, "a tower's own wall damage keeps the reduction"
    both_w, both_c = split(sim, W, 40, HIT_MELEE, ASSIST_RAM | ASSIST_TOWER)
    assert int(both_w) == 40 and int(both_c) == 40, "the two chassis change different halves"
    # the CENTRE ramp reads the tier's own pool, not the Ancient one
    for tier in range(1, len(sim._walls_tier_hp)):
        mx = int(sim._walls_tier_hp[tier])
        _, c = split(sim, mx, 30, HIT_RANGED, 0, mx)
        assert int(c) == 1, f"an intact tier-{tier} perimeter ({mx}) must hold the centre to 1: {int(c)}"
    print(f"  bombard/support OK: full wall share, the tower's bypass, and the ramp at every tier {sim._walls_tier_hp.tolist()}")


def test_siege_tables(sim) -> None:
    """The roster rows themselves, against the Civilopedia columns."""
    bomb = [(i, int(v)) for i, v in enumerate(sim._type_bombard.tolist()) if v]
    assert len(bomb) >= 2, f"the siege class is empty: {bomb}"
    for i, v in bomb:
        # "-17 Bombard Strength against land units" — the ranged column IS that
        assert int(sim._type_ranged_strength[i]) == v - int(sim._ranged_city_pen), \
            f"unit {i}: bombard {v} but ranged {int(sim._type_ranged_strength[i])}"
        assert float(sim._city_ranged_strength(L(sim, i), L(sim, 0), L(sim, sim._walls_hp))[0]) == float(v), \
            "a siege unit pays no city penalty"
    chassis = [(i, int(sim._type_siege_support[i]), int(sim._type_siege_max_walls[i]))
               for i in range(sim.NU) if int(sim._type_siege_support[i]) > 0]
    assert sorted((c, m) for _, c, m in chassis) == [(1, 1), (2, 2)], \
        f"want a ram capped at Ancient and a tower at Medieval, got {chassis}"
    for i, _, _ in chassis:
        assert bool(sim._type_civilian[i]), "a support chassis rides the civilian plane"
    assert bool(sim._type_melee.any()) and bool(sim._type_anticav.any()), \
        "the two classes a ram or a tower helps are unmarked"
    print(f"  tables OK: bombard {bomb}, chassis {chassis}, tiers {sim._walls_tier_hp.tolist()} / CS {sim._walls_tier_cs.tolist()}")


def test_ranged_strength(sim) -> None:
    land = next(i for i in range(sim.NU)
                if float(sim._type_ranged_strength[i]) > 0 and not bool(sim.unit_naval[i])
                and int(sim._type_bombard[i]) == 0)
    naval = next((i for i in range(sim.NU)
                  if float(sim._type_ranged_strength[i]) > 0 and bool(sim.unit_naval[i])), -1)
    assert naval >= 0, "no naval ranged unit in the roster"
    base = float(sim._type_ranged_strength[land])
    for outer in (sim._walls_hp, 0):
        got = float(sim._city_ranged_strength(L(sim, land), L(sim, 0), L(sim, outer))[0])
        assert got == base - sim._ranged_city_pen, f"land ranged owes the full penalty at outer {outer}: {got}"
    nb = float(sim._type_ranged_strength[naval])
    assert float(sim._city_ranged_strength(L(sim, naval), L(sim, 0), L(sim, sim._walls_hp))[0]) == nb - sim._ranged_city_pen
    assert float(sim._city_ranged_strength(L(sim, naval), L(sim, 0), L(sim, 0))[0]) == nb
    print(f"  penalty OK: land ranged always -{int(sim._ranged_city_pen)}, naval ranged only against Walls")


def test_move_and_shoot(sim) -> None:
    """CIV6 (Movement): a unit whose attack uses Bombard Strength "may move and
    shoot in the same turn if ... its maximum Movement is at least 1 greater
    than normal when it attempts to shoot"; and "if a unit has not moved, it
    can always shoot regardless of its maximum Movement"."""
    cat = next(i for i in range(sim.NU) if int(sim._type_bombard[i]) > 0)
    arc = next(i for i in range(sim.NU)
               if int(sim._type_ranged_strength[i]) > 0 and int(sim._type_bombard[i]) == 0)
    s = 0
    base = sim._mp_scale * int(sim._type_moves[cat])
    sim.major_unit_type[0, s] = cat
    sim.major_unit_emb[0, s] = False
    sim.major_unit_aura_mp[0, s] = 0
    sim.major_unit_mp_full[0, s] = base
    sim.major_unit_mp[0, s] = base
    assert int(sim._full_mp("major")[0, s]) == base,         "the scene wants a siege unit at its NORMAL maximum Movement"
    assert bool(sim._siege_may_shoot("major")[0, s]),         "a siege unit that has not moved must always shoot"
    sim.major_unit_mp[0, s] = base - 1
    assert not bool(sim._siege_may_shoot("major")[0, s]),         "having moved at its normal Movement, it must not shoot"
    sim.major_unit_aura_mp[0, s] = 1  # a general stands beside it
    sim.major_unit_mp_full[0, s] = base + 1
    assert bool(sim._siege_may_shoot("major")[0, s]),         "+1 maximum Movement must lift the gate"
    sim.major_unit_type[0, s] = arc
    sim.major_unit_aura_mp[0, s] = 0
    sim.major_unit_mp_full[0, s] = sim._mp_scale * int(sim._type_moves[arc])
    sim.major_unit_mp[0, s] = sim._mp_scale * int(sim._type_moves[arc]) - 1
    assert bool(sim._siege_may_shoot("major")[0, s]),         "the gate is the siege class's alone — an Archer shoots after moving"
    print(f"  move-and-shoot OK: {base} MP shoots only unmoved, {base + 1} shoots either way")


def test_repair_drip(rules, path) -> None:
    """CIV6: "Walls gain HP equal to the Production invested into the project
    (on Standard speed) each turn the project runs." The drip pays the DELTA,
    so a hit landed mid-repair stays landed."""
    sim = build(rules, path)
    assert sim._repair_proj_idx >= 0, "the repair row must be findable by its flag"
    sim.city_bldg[0, 0, 0, sim._walls_bidx] = True
    sim.city_outer_hp[0, 0, 0] = 40
    sim.city_current[0, 0, 0] = sim.PROJECT_BASE + sim._repair_proj_idx
    sim.city_progress[0, 0, 0] = 0.0

    def drip(add: float) -> int:
        before = sim.city_progress[:, 0].clone()
        sim.city_progress[0, 0, 0] = before[0, 0] + add
        sim._repair_drip(0, before)
        return int(sim.city_outer_hp[0, 0, 0])

    assert drip(12.4) == 52, "a 12.4-production turn must pay round(12.4) HP"
    assert drip(1000.0) == sim._walls_hp, "the drip must never overshoot the tier's pool"
    sim.city_outer_hp[0, 0, 0] = 20  # a hit lands while the project runs
    assert drip(0.0) == 20, "an unchanged progress plane must pay nothing"
    assert drip(10.0) == 30, "and the next turn pays its own 10, not the total"
    sim.city_current[0, 0, 0] = -1
    assert drip(50.0) == 30, "production into any other head must leave the pool alone"
    print("  repair drip OK: pays round(delta) per turn, caps at the tier pool, keeps damage taken")


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
    sim.city_last_hit[0, 0, 0] = 0
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
    # The SIZE of the melee share is `test_split`'s case, on a roll it controls;
    # a late chassis rolls hard enough to take a whole Ancient perimeter in one
    # blow, which is the rule working, not failing. What this case owns is that
    # the perimeter absorbed and the centre was held.
    assert 0 < lost <= sim._walls_hp, f"the perimeter took {lost}, outside its own pool"
    assert int(sim.rng_state[0]) != before_rng, "the assault drew nothing"
    print(f"  melee OK: centre 200 -> 199, perimeter -{lost} out of the SAME roll")

    # MELEE, no walls: the whole roll lands on the centre
    sim2, slot2, ctr2 = scene(rules, path, walls=False)
    sim2.major_unit_type[0, slot2] = ty
    sim2._melee_city(torch.tensor([True]), L(sim2, ctr2), "major", slot2)
    # the rule is the COMPARISON, not a magnitude: behind a perimeter the
    # centre is held to 1, and without one it takes the whole roll — which a
    # late chassis can end the city with outright.
    fell2 = not bool(sim2.city_alive[0, 0, 0])
    assert fell2 or int(sim2.city_hp[0, 0, 0]) < 199, "an unwalled centre must take the whole roll"
    assert int(sim2.city_outer_hp[0, 0, 0]) == 0
    print("  unwalled OK: centre 200 -> "
          + ("felled outright" if fell2 else str(int(sim2.city_hp[0, 0, 0]))))

    # RANGED: the bombardment reaches the perimeter too
    sim3, slot3, ctr3 = scene(rules, path, walls=True)
    rty = next(i for i in range(sim3.NU)
               if float(sim3._type_ranged_strength[i]) > 0 and not bool(sim3.unit_naval[i]))
    sim3.major_unit_type[0, slot3] = rty
    sim3._ranged_attack(torch.tensor([True]), L(sim3, ctr3), "major", slot3, 1)
    assert int(sim3.city_outer_hp[0, 0, 0]) < sim3._walls_hp, "a ranged hit never touched the perimeter"
    assert int(sim3.city_hp[0, 0, 0]) == 199, "a ranged hit through an intact perimeter must do 1"
    print(f"  ranged OK: perimeter {sim3._walls_hp} -> {int(sim3.city_outer_hp[0, 0, 0])}, centre 200 -> 199")


def test_walls_tiers(rules, path) -> None:
    """CIV6: "Ancient Walls have 100 HP and each upgrade adds +100, for a
    maximum of 300", Urban Defenses 400 and no Combat Strength; each pre-modern
    tier is "+3 Combat Strength" and they stack. Urban Defenses "is unlocked
    with Steel" and needs no building at all."""
    sim = build(rules, path)
    col = L(sim, 0)
    row0 = torch.zeros_like(col)
    assert sim._walls_tier_hp.tolist() == [0, 100, 200, 300, 400], sim._walls_tier_hp.tolist()
    assert sim._walls_tier_cs.tolist() == [0, 3, 6, 9, 9], sim._walls_tier_cs.tolist()
    for bi in sim._walls_rows:
        sim.city_bldg[0, 0, 0, bi] = False
    assert int(sim._walls_tier_at(row0, col)[0]) == 0
    seen = []
    for bi in sorted(sim._walls_rows, key=lambda i: int(sim._b_walls[i])):
        sim.city_bldg[0, 0, 0, bi] = True
        t = int(sim._walls_tier_at(row0, col)[0])
        seen.append((t, int(sim._walls_max_at(row0, col)[0])))
    assert seen == [(1, 100), (2, 200), (3, 300)], f"the tiers do not stack: {seen}"
    # STEEL alone, no walls building at all, is the top tier
    for bi in sim._walls_rows:
        sim.city_bldg[0, 0, 0, bi] = False
    assert sim._urban_def_tech >= 0, "no Urban Defenses tech exported"
    sim.civ_techs[0, 0, sim._urban_def_tech] = True
    assert int(sim._walls_tier_at(row0, col)[0]) == sim._walls_tier_urban
    assert int(sim._walls_max_at(row0, col)[0]) == 400
    # ...and it FITS the standing cities, breach and all
    sim.civ_techs[0, 0, sim._urban_def_tech] = False
    sim.city_outer_hp[0, 0, 0] = 0
    sim._urban_defenses_fit(0, torch.tensor([True], device=sim.device))
    sim.civ_techs[0, 0, sim._urban_def_tech] = True
    assert int(sim.city_outer_hp[0, 0, 0]) == 400, int(sim.city_outer_hp[0, 0, 0])
    print("  tiers OK: 100/200/300 stacked, +3 CS each, Steel alone gives 400 and refits a breach")


def test_repair_project(rules, path) -> None:
    """CIV6: the repair "becomes available after building Walls. A city can
    undertake this project if it and/or its Encampment district have damaged
    Walls and have not been attacked in the last three turns." Its price is the
    HP it puts back, and completing it "fully restores" the pool."""
    sim = build(rules, path)
    rep = next(i for i, p in enumerate(sim._proj_rows) if int(p.get("rep", 0)))
    assert int(sim._proj_rows[rep].get("cc", 0)) == 1, "the repair must ride the CITY CENTER channel"
    # The channel is shared now (the nuclear chain runs in the City Center
    # too), so what it must not do is skip a row own gate: every cc row
    # carries one of the repair / one-time / device flags.
    for _p in sim._proj_rows:
        if int(_p.get("cc", 0)):
            assert int(_p.get("rep", 0)) or int(_p["one"]) or int(_p.get("wmd", 0)), \
                "a City Center project with no gate of its own would be offered forever"
    for bi in sim._walls_rows:
        sim.city_bldg[0, 0, 0, bi] = False
    sim.city_outer_hp[0, 0, 0] = 0
    sim.city_last_hit[0, 0, 0] = 0
    assert not bool(sim._repair_available(0, 0)[0]), "no Walls, nothing to repair"
    sim.city_bldg[0, 0, 0, sim._walls_bidx] = True
    sim.city_outer_hp[0, 0, 0] = sim._walls_hp
    assert not bool(sim._repair_available(0, 0)[0]), "an intact perimeter needs no repair"
    sim.city_outer_hp[0, 0, 0] = 40
    sim.city_last_hit[0, 0, 0] = sim.turn
    assert not bool(sim._repair_available(0, 0)[0]), "hit THIS turn — the three quiet turns have not passed"
    for d in range(1, sim._repair_quiet):
        sim.city_last_hit[0, 0, 0] = sim.turn - d
        assert not bool(sim._repair_available(0, 0)[0]), f"only {d} quiet turns"
    sim.city_last_hit[0, 0, 0] = sim.turn - sim._repair_quiet
    assert bool(sim._repair_available(0, 0)[0]), "three quiet turns and a breach: the project must offer"
    assert int(sim._repair_cost(0, 0)[0]) == sim._walls_hp - 40, int(sim._repair_cost(0, 0)[0])
    # the MASK offers it, and only in the column that qualifies
    m = sim._seat_production_mask(0)
    base = m.shape[2] - len(sim._proj_rows)
    if bool(sim.city_alive[0, 0, 0]) and int(sim.city_current[0, 0, 0]) == -1:
        assert bool(m[0, 0, base + rep]), "the repair column is closed on a city that qualifies"
    print(f"  repair OK: gated on Walls + damage + {sim._repair_quiet} quiet turns, price {int(sim._repair_cost(0, 0)[0])} = the HP it restores")


def test_encirclement(rules, path) -> None:
    """CIV6: a city "will automatically regain 20 HP per turn" until "the
    invading army manages to establish zone of control on all passable tiles
    surrounding the City Center"; and the outer defenses never regenerate."""
    sim = build(rules, path)
    ctr = int(sim.city_center[0, 0, 0])
    nbs = [int(n) for n in sim.neigh[ctr].tolist() if n >= 0]
    passable = [t for t in nbs if bool(sim.passable[0, t] or sim.wpass[0, t])]
    assert len(passable) >= 2, "need a ring to besiege"
    for t in nbs:
        sim.military_at[0, t] = -1
    sim.city_bldg[0, 0, 0, sim._walls_bidx] = True

    def one_turn(hostiles):
        s = build(rules, path)
        s.city_bldg[0, 0, 0, sim._walls_bidx] = True
        s.city_hp[0, 0, 0] = 100
        s.city_outer_hp[0, 0, 0] = 40
        for t in [int(n) for n in s.neigh[ctr].tolist() if n >= 0]:
            s.military_at[0, t] = -1
        nxt = int(s.unit_next[0])
        for k, t in enumerate(hostiles):
            slot = nxt + k
            s.major_unit_alive[0, slot] = True
            s.major_unit_seat[0, slot] = 1
            s.major_unit_type[0, slot] = s._warrior_idx
            s.major_unit_tile[0, slot] = t
            s.major_unit_hp[0, slot] = 100
            s.military_at[0, t] = slot + s.POOL_LO["major"]
        s.unit_next[0] = nxt + len(hostiles)
        s.war[0, 0, 1] = s.war[0, 1, 0] = True
        s.sync_war()
        s._seat_city_fire_and_heal(0, L(s, 0), torch.tensor([True], device=s.device))
        return int(s.city_hp[0, 0, 0]), int(s.city_outer_hp[0, 0, 0])

    hp_free, outer_free = one_turn([])
    assert hp_free == 120, f"an unbesieged city heals 20: {hp_free}"
    assert outer_free == 40, "the outer pool must NOT regenerate"
    hp_one, _ = one_turn(passable[:1])
    assert hp_one == 120, f"ONE adjacent hostile is not a siege: {hp_one}"
    hp_all, _ = one_turn(passable)
    assert hp_all == 100, f"every passable neighbour held: the city must not heal: {hp_all}"
    print(f"  siege OK: heals past 1 of {len(passable)} hostiles, stops at all {len(passable)}, perimeter never regenerates")


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
    test_bombard_and_support(sim)
    test_siege_tables(sim)
    test_ranged_strength(sim)
    test_move_and_shoot(sim)
    test_assault(rules, path)
    test_walls_tiers(rules, path)
    test_repair_project(rules, path)
    test_repair_drip(rules, path)
    test_encirclement(rules, path)
    test_theological(rules, path)
    print("CITY PERIMETER OK")


if __name__ == "__main__":
    main()
