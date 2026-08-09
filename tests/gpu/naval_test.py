"""Naval + embarkation self-test — the gate-UNREACHABLE surfaces.

    npm run seed && npm run export        # (once) writes seeder/worlds/  (naval catalog)
    python gpu/naval_test.py

The scripted parity rollout reaches almost none of the naval combat surface:
seat 0 builds no ships and the civ galley policy rarely fights. These pokes pin
those semantics the same way space_race_test / war_test do: build a BatchSim
from a fixture, force the state in-memory, then drive the EXACT engine twin
(_apply_unit_actions, _barbarian_phase pcstk, _seat_phase rcstk, _spawn_p,
_flank_support) and assert TS-mirroring behaviour.

Covered here (all gate-unreachable):
  1. GALLEY naval melee — batter + CAPTURE a coastal civ city.
  2. GALLEY naval melee — CAPTURE a coastal city-state.
  3. QUADRIREME range-1 bombard — a civ UNIT (no retaliation, no advance).
  4. QUADRIREME range-1 bombard — a civ CITY (HP floors at 1, never captures).
  5. SEAT-0 naval — spawn on WATER (_spawn_p naval probe) + attack; plus
     the MOVE-verb limit: the controlled MOVE verb cannot step a ship onto
     water, because its apply reads the land `passable` plane, not wpass.
  6. OCEAN gate — a naval mover's spawn probe is blocked over OCEAN pre-
     CARTOGRAPHY, allowed post- (and COAST is ungated). (Embarked OCEAN gating
     is the TS twin in tests/cpu/units/naval-embark.test.ts.)
  7. City walls strike (pcstk / rcstk) — a ship IS struck (tile-agnostic scan)
     and an EMBARKED target takes the flat-CS override (proven by a two-run
     damage comparison: lower def ⇒ strictly more damage on the same RNG).
  8. Embarked civilian CAPTURE — POOL-END invariant + keeps-embarked.
  9. Flank/support — a NAVAL ally counts; the same ally EMBARKED counts 0.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


# ------------------------------------------------------------------ helpers ---
def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def idx(rules, name: str) -> int:
    return [u["id"] for u in rules.units].index(name)


def clear_tile(sim, t: int) -> None:
    """Remove any unit/marker occupancy at tile t (0-batch)."""
    # clear the MERGED planes: p_/v_/u_ are DERIVED read-only views, so a
    # subscript write to one lands in a temporary and is silently discarded.
    sim.occ_mil[0, t] = -1
    sim.occ_civ[0, t] = -1


def place_pmil(sim, t: int, type_idx: int, hp: int = 100, emb: bool = False) -> int:
    slot = int(sim.p_next[0])
    sim.p_alive[0, slot] = True
    sim.p_type[0, slot] = type_idx
    sim.p_tile[0, slot] = t
    sim.p_hp[0, slot] = hp
    sim.p_charges[0, slot] = 0
    sim.p_fortify[0, slot] = 0
    sim.p_emb[0, slot] = emb
    sim.occ_mil[0, t] = slot
    sim.p_next[0] += 1
    return slot


def place_rmil(sim, r: int, t: int, type_idx: int, hp: int = 100, emb: bool = False) -> int:
    slot = int(sim.v_next[0])
    sim.v_alive[0, slot] = True
    sim.v_civ[0, slot] = r
    sim.v_type[0, slot] = type_idx
    sim.v_tile[0, slot] = t
    sim.v_hp[0, slot] = hp
    sim.v_charges[0, slot] = 0
    sim.v_fortify[0, slot] = 0
    sim.v_emb[0, slot] = emb
    sim.occ_mil[0, t] = slot + sim.POOL_LO["v"]
    sim.v_next[0] += 1
    return slot


def place_rciv(sim, r: int, t: int, type_idx: int, hp: int = 100, emb: bool = False) -> int:
    slot = int(sim.v_next[0])
    sim.v_alive[0, slot] = True
    sim.v_civ[0, slot] = r
    sim.v_type[0, slot] = type_idx
    sim.v_tile[0, slot] = t
    sim.v_hp[0, slot] = hp
    sim.v_charges[0, slot] = 0
    sim.v_fortify[0, slot] = 0
    sim.v_emb[0, slot] = emb
    sim.occ_civ[0, t] = slot + sim.POOL_LO["v"]
    sim.v_next[0] += 1
    return slot


def dir_to(sim, frm: int, to: int) -> int:
    nb = sim.neigh[frm]
    for d in range(6):
        if int(nb[d]) == to:
            return d
    return -1


def order(sim, slot: int, code: int) -> torch.Tensor:
    ua = torch.full((1, sim.p_alive.shape[1]), -1, dtype=torch.long)
    ua[0, slot] = code
    return ua


def is_center(sim, t: int) -> bool:
    """True iff tile t IS a seat-0 city / civ-city / city-state CENTER
    (territory tiles around a center are NOT centers)."""
    if int(sim.center_at[0, t]) >= 0 or int(sim.rc_at[0, t]) >= 0:
        return True
    s = int(sim.cs_at[0, t])
    return s >= 0 and int(sim.cs_center[0, s]) == t


def empty_neighbor(sim, ctr: int) -> int:
    """First on-map neighbour of ctr with no unit occupant and that is not
    itself a city/CS/civ-city CENTER (territory is allowed — we stand on it,
    then force it to water)."""
    nb = sim.neigh[ctr]
    for d in range(6):
        t = int(nb[d])
        if t < 0:
            continue
        if (
            int(sim.pmil_at[0, t]) < 0 and int(sim.pciv_at[0, t]) < 0
            and int(sim.vmil_at[0, t]) < 0 and int(sim.vciv_at[0, t]) < 0
            and int(sim.barb_at[0, t]) < 0 and not is_center(sim, t)
        ):
            return t
    return -1


def force_water(sim, t: int, ocean: bool = False) -> None:
    """Force tile t to enterable water (COAST by default, OCEAN if ocean=True):
    on the naval `wpass` plane and OFF the land `passable` plane, like real water."""
    sim.wpass[0, t] = True
    sim.ocean_tile[0, t] = bool(ocean)
    sim.passable[0, t] = False


def first_civ_city(sim):
    idxs = sim.rc_alive[0].nonzero()
    assert len(idxs), "no civ city on this seed/turn"
    r, j = int(idxs[0, 0]), int(idxs[0, 1])
    return r, j, int(sim.rc_center[0, r, j])


def neutralize_barbs(sim) -> None:
    sim.u_alive[:] = False
    _pl = sim.occ_mil  # clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["u"]) & (_pl < sim.POOL_HI["u"])] = -1
    sim.n_camps[:] = sim.max_camps
    sim.camp_tile[:] = -1


def clear_all_civ_units(sim) -> None:
    sim.v_alive[:] = False
    _pl = sim.occ_mil  # clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["v"]) & (_pl < sim.POOL_HI["v"])] = -1
    _pl = sim.occ_civ  # clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["v"]) & (_pl < sim.POOL_HI["v"])] = -1


# ------------------------------------------------------------------ pokes -----
def poke_galley_city(rules, path, GALLEY):
    """1. A GALLEY on a water tile adjacent to a coastal civ city batters it
    (siege → _p_attack_civ_city) and CAPTURES it at 0 HP — naval melee
    takes coastal cities from the sea, through the existing combat path."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # the center must hold no unit (else the melee hits the occupant / civilian)
    clear_tile(sim, ctr)
    wt = empty_neighbor(sim, ctr)
    assert wt >= 0, "no free neighbour of the civ city center"
    force_water(sim, wt)  # the galley attacks FROM water (coastal city)
    slot = place_pmil(sim, wt, GALLEY)
    assert bool(sim.unit_naval[GALLEY]) and bool(sim.wpass[0, wt]), "galley must be naval, on water"
    d = dir_to(sim, wt, ctr)
    assert d >= 0
    sim.best_melee[0] = 40  # seat 0 needs a real melee CS so the city takes damage
    sim.rc_outer_hp[0, r, j] = 0  # observe the inner HP directly
    hp0 = int(sim.rc_hp[0, r, j])
    sim._apply_unit_actions(order(sim, slot, 6 + d))
    assert int(sim.rc_hp[0, r, j]) < hp0, "the galley did not batter the coastal city"

    # capture: grind to the brink, one more naval melee -> the city changes seat
    assert bool((~sim.alive[0]).any()), "no free seat-0 city slot for the capture"
    sim.rc_hp[0, r, j] = 1
    sim.rc_outer_hp[0, r, j] = 0
    sim.p_hp[0, slot] = 100  # heal the ship (counter fire earlier)
    ncity0 = int(sim.alive[0].sum())
    sim._apply_unit_actions(order(sim, slot, 6 + d))
    assert not bool(sim.rc_alive[0, r, j]), "coastal city at 1 HP not captured by the galley"
    assert int(sim.alive[0].sum()) == ncity0 + 1, "capture must found a seat-0 city"
    c_new = int(sim.center_at[0, ctr])
    assert c_new >= 0 and bool(sim.alive[0, c_new]), "captured center must map to the new city"
    assert int(sim.owner[0, ctr]) == c_new, "captured center tile must transfer to seat 0"
    print(f"  1 galley captures a coastal city OK (hp {hp0}->batter->1->captured, city {c_new})")


def poke_galley_cs(rules, path, GALLEY):
    """2. A GALLEY on water adjacent to a city-state CENTER captures it
    (cs_hit → _capture_city_state) — naval melee takes coastal CS too."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    live = sim.cs_alive[0].nonzero(as_tuple=True)[0]
    assert len(live), "no city-state on this seed"
    s = int(live[0])
    # a city-state is a separate seat you must DECLARE on, and the GPU enforces
    # it (`cs_here` carries `cs_atwar`, mirroring TS's csTarget). This poke
    # sieges, so it must be at war first; there is no declare VERB on the GPU,
    # so set the plane directly.
    sim.cs_atwar[0, s] = True
    ctr = int(sim.cs_center[0, s])
    clear_tile(sim, ctr)
    wt = empty_neighbor(sim, ctr)
    assert wt >= 0
    force_water(sim, wt)
    slot = place_pmil(sim, wt, GALLEY)
    d = dir_to(sim, wt, ctr)
    assert d >= 0
    # remove any barbarian within 2 of the center that could land the kill first
    near = sim.pair_dist[ctr] <= 2
    for u in (sim.u_alive[0] & near[sim.u_tile[0].clamp(min=0)]).nonzero(as_tuple=True)[0].tolist():
        t_ = int(sim.u_tile[0, u])
        sim.u_alive[0, u] = False
        if int(sim.barb_at[0, t_]) == u:
            sim.occ_mil[0, t_] = -1
    sim.cs_hp[0, s] = 1
    assert bool((~sim.alive[0]).any()), "no free seat-0 city slot for the CS capture"
    pop_before = int(sim.cs_pop[0, s])
    ncity0 = int(sim.alive[0].sum())
    sim._apply_unit_actions(order(sim, slot, 6 + d))
    assert not bool(sim.cs_alive[0, s]), "CS at 1 HP not captured by the galley"
    assert int(sim.alive[0].sum()) >= ncity0 + 1, "CS capture must found a seat-0 city"
    c_new = int(sim.center_at[0, ctr])
    assert c_new >= 0 and int(sim.owner[0, ctr]) == c_new, "captured CS center must transfer"
    assert int(sim.pop[0, c_new]) == max(1, (pop_before * 3) // 4), "captured pop x0.75 (min 1)"
    print(f"  2 galley captures a city-state OK (pop {pop_before}->{int(sim.pop[0, c_new])}, city {c_new})")


def poke_quadrireme_unit(rules, path, QUAD, WARRIOR):
    """3. A QUADRIREME (rangedStrength 25, range 1) on water bombards an
    adjacent civ unit — one roll, NO retaliation, NO advance (r_att path)."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert sim._rl_ranged_active, "ranged head must be active for a bombard"
    assert float(sim._p_rng_str[QUAD]) > 0 and bool(sim.unit_naval[QUAD]), "quadrireme must be a naval ranged unit"
    r, j, ctr = first_civ_city(sim)
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # a defender tile + an adjacent water tile for the ship (both cleared/empty)
    dt = empty_neighbor(sim, ctr)
    assert dt >= 0
    clear_tile(sim, dt)
    vslot = place_rmil(sim, r, dt, WARRIOR)
    wt = empty_neighbor(sim, dt)
    assert wt >= 0 and wt != dt
    force_water(sim, wt)
    qslot = place_pmil(sim, wt, QUAD)
    d = dir_to(sim, wt, dt)
    assert d >= 0
    vhp0, php0, tile0 = int(sim.v_hp[0, vslot]), int(sim.p_hp[0, qslot]), int(sim.p_tile[0, qslot])
    sim._apply_unit_actions(order(sim, qslot, 6 + d))
    assert int(sim.v_hp[0, vslot]) < vhp0, "bombard dealt no damage to the civ unit"
    assert int(sim.p_hp[0, qslot]) == php0, "ranged bombard must take NO retaliation"
    assert int(sim.p_tile[0, qslot]) == tile0, "ranged bombard must NOT advance"
    print(f"  3 quadrireme bombards a unit OK (civ hp {vhp0}->{int(sim.v_hp[0, vslot])}, ship unharmed, no advance)")


def poke_quadrireme_city(rules, path, QUAD):
    """4. A QUADRIREME bombards an adjacent coastal city — HP drops but FLOORS
    at 1 (r_sieg: ranged never captures; melee finishes)."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    clear_tile(sim, ctr)
    wt = empty_neighbor(sim, ctr)
    assert wt >= 0
    force_water(sim, wt)
    qslot = place_pmil(sim, wt, QUAD)
    d = dir_to(sim, wt, ctr)
    assert d >= 0
    # a wounded-but-alive city takes damage
    sim.rc_hp[0, r, j] = 100
    hp0 = int(sim.rc_hp[0, r, j])
    sim._apply_unit_actions(order(sim, qslot, 6 + d))
    assert int(sim.rc_hp[0, r, j]) < hp0, "bombard dealt no damage to the city"
    assert bool(sim.rc_alive[0, r, j]), "a ranged bombard must never capture"
    # at 1 HP the floor holds — the city survives and stays at 1
    sim.rc_hp[0, r, j] = 1
    sim._apply_unit_actions(order(sim, qslot, 6 + d))
    assert int(sim.rc_hp[0, r, j]) == 1, "ranged bombard must floor city HP at 1"
    assert bool(sim.rc_alive[0, r, j]), "floored city must remain alive (no ranged capture)"
    print(f"  4 quadrireme bombards a city OK (hp {hp0}->{int(sim.rc_hp[0, r, j]) if False else '..'}->floored at 1, no capture)")


def poke_seat0_naval(rules, path, GALLEY, WARRIOR):
    """5. Seat-0 naval end-to-end (forced, since seat 0 builds no ships on its
    own): a GALLEY SPAWNS on the nearest free WATER tile, then attacks. Plus the
    MOVE-verb limit — the controlled MOVE verb reads the land `passable` plane
    (no wpass), so it cannot step a ship onto water."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # spawn: an anchor land tile with exactly one free WATER neighbour -> the
    # naval probe skips the (land) anchor and lands the ship on the water tile.
    anchor = empty_neighbor(sim, ctr)  # a free land-ish neighbour of the city
    assert anchor >= 0 and not bool(sim.wpass[0, anchor]), "anchor must be a non-water free tile"
    wt = empty_neighbor(sim, anchor)
    assert wt >= 0 and wt != anchor
    force_water(sim, wt)
    n0 = int(sim.p_next[0])
    sim._spawn_p(torch.tensor([True]), torch.tensor([anchor]), torch.tensor([GALLEY]))
    assert int(sim.p_next[0]) == n0 + 1, "seat-0 galley failed to spawn"
    gslot = n0
    assert bool(sim.wpass[0, int(sim.p_tile[0, gslot])]), "naval unit must spawn on WATER"
    assert not bool(sim.p_emb[0, gslot]), "a naval unit is never 'embarked'"
    assert bool(sim.unit_naval[sim.p_type[0, gslot]]), "spawned unit is the galley"

    # attack: put an at-war civ-seat unit next to the spawned ship, batter it.
    gt = int(sim.p_tile[0, gslot])
    dt = empty_neighbor(sim, gt)
    assert dt >= 0
    clear_tile(sim, dt)
    vslot = place_rmil(sim, r, dt, WARRIOR)
    sim.best_melee[0] = 40
    da = dir_to(sim, gt, dt)
    assert da >= 0
    vhp0 = int(sim.v_hp[0, vslot])
    sim._apply_unit_actions(order(sim, gslot, 6 + da))
    assert int(sim.v_hp[0, vslot]) < vhp0, "seat-0 galley dealt no melee damage"

    # the controlled MOVE verb cannot move a ship onto water.
    gt2 = int(sim.p_tile[0, gslot])
    wt2 = empty_neighbor(sim, gt2)
    assert wt2 >= 0
    force_water(sim, wt2)
    assert not bool(sim.passable[0, wt2]), "water is not on the land `passable` plane"
    dm = dir_to(sim, gt2, wt2)
    assert dm >= 0
    before = int(sim.p_tile[0, gslot])
    sim._apply_unit_actions(order(sim, gslot, dm))  # a MOVE order (0..5)
    assert int(sim.p_tile[0, gslot]) == before, (
        "RL/controlled move stepped a ship onto water — the #50 residual (seat-0 naval "
        "water-move columns) is unexpectedly LIVE; TS findPath is the naval-aware path"
    )
    print("  5 seat-0 naval OK (spawn-on-water + attack; RL water-move is the documented #50 residual)")


def poke_ocean_gate(rules, path, GALLEY):
    """6. OCEAN gate for a naval mover (the _spawn_p naval probe shares the
    exact `wpass & (~ocean | cartography)` gate as the war-march water step):
    an OCEAN spot is refused pre-CARTOGRAPHY, allowed post-; COAST is ungated."""
    cart = None
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    cart = sim._cartography_tech
    assert cart >= 0, "CARTOGRAPHY tech must be exported"
    r, j, ctr = first_civ_city(sim)
    anchor = empty_neighbor(sim, ctr)
    assert anchor >= 0 and not bool(sim.wpass[0, anchor])
    # make EVERY neighbour of the anchor non-water except one forced OCEAN tile,
    # so the naval probe's only water candidate is the ocean tile.
    ot = -1
    nb = sim.neigh[anchor]
    for d in range(6):
        t = int(nb[d])
        if t < 0 or is_center(sim, t):
            continue  # never disturb a city center
        clear_tile(sim, t)
        if ot < 0:
            ot = t
            force_water(sim, t, ocean=True)  # the sole water candidate is OCEAN
        else:
            sim.wpass[0, t] = False
    sim.wpass[0, anchor] = False
    assert ot >= 0 and bool(sim.ocean_tile[0, ot])

    # pre-CARTOGRAPHY: the ocean spot is gated out -> no spawn.
    sim.techs[0, cart] = False
    n0 = int(sim.p_next[0])
    sim._spawn_p(torch.tensor([True]), torch.tensor([anchor]), torch.tensor([GALLEY]))
    assert int(sim.p_next[0]) == n0, "ship spawned on OCEAN without CARTOGRAPHY"

    # post-CARTOGRAPHY: the ocean spot opens -> the ship lands there.
    sim.techs[0, cart] = True
    sim._spawn_p(torch.tensor([True]), torch.tensor([anchor]), torch.tensor([GALLEY]))
    assert int(sim.p_next[0]) == n0 + 1, "ship failed to spawn on OCEAN with CARTOGRAPHY"
    assert int(sim.p_tile[0, n0]) == ot, "the ship must land on the (now-enterable) ocean tile"

    # COAST is ungated: a fresh coast candidate spawns with CARTOGRAPHY absent.
    sim2 = build(rules, path)
    for _ in range(25):
        sim2.step()
    r2, j2, ctr2 = first_civ_city(sim2)
    anchor2 = empty_neighbor(sim2, ctr2)
    ct = empty_neighbor(sim2, anchor2)
    assert anchor2 >= 0 and ct >= 0
    force_water(sim2, ct, ocean=False)  # COAST
    sim2.techs[0, cart] = False
    m0 = int(sim2.p_next[0])
    sim2._spawn_p(torch.tensor([True]), torch.tensor([anchor2]), torch.tensor([GALLEY]))
    assert int(sim2.p_next[0]) == m0 + 1, "COAST spawn must NOT need CARTOGRAPHY"
    print("  6 OCEAN gate OK (pre-CART blocked, post-CART allowed; COAST ungated)")


def poke_walls_pcstk(rules, path, GALLEY, WARRIOR):
    """7a. Seat-0 city ANCIENT_WALLS strike (pcstk, in _barbarian_phase): a
    naval unit IS struck (tile-agnostic scan), and an EMBARKED target takes the
    flat-CS override. Override proved by a two-run damage compare on one RNG."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert sim._walls_bidx >= 0
    assert bool(sim.alive[0, 0]), "seat-0 capital must be alive"
    c, ctr = 0, int(sim.site[0, 0])
    sim.buildings[0, c, sim._walls_bidx] = True
    r = 0
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose

    # -- ship struck: isolate the wall strike (no barbarian / other-seat confounds).
    neutralize_barbs(sim)
    clear_all_civ_units(sim)
    tt = empty_neighbor(sim, ctr)  # dist 1 -> always the nearest target
    assert tt >= 0
    gslot = place_rmil(sim, r, tt, GALLEY)  # a civ-seat galley in range
    sim.best_melee[0] = 40
    base = sim.snapshot()
    sim._barbarian_phase()
    assert int(sim.v_hp[0, gslot]) < 100, "seat-0 city walls did not strike the ship"

    # -- embarked override: a civ-seat WARRIOR at the same tile, embarked vs grounded.
    sim.restore(base)
    clear_all_civ_units(sim)
    wslot = place_rmil(sim, r, tt, WARRIOR, emb=True)
    sim.best_melee[0] = 20  # keep the hit sub-lethal so we can read the damage
    snap = sim.snapshot()
    sim._barbarian_phase()
    emb_dmg = 100 - int(sim.v_hp[0, wslot])
    sim.restore(snap)
    sim.v_emb[0, wslot] = False  # same warrior, grounded (combat 20 + terrain)
    sim._barbarian_phase()
    gnd_dmg = 100 - int(sim.v_hp[0, wslot])
    assert emb_dmg > gnd_dmg, f"embarked flat-CS override not applied at pcstk (emb {emb_dmg} <= gnd {gnd_dmg})"
    print(f"  7a pcstk OK (ship struck; embarked override: dmg {emb_dmg} > grounded {gnd_dmg})")


def poke_walls_rcstk(rules, path, GALLEY, WARRIOR):
    """7b. Civ-seat city ANCIENT_WALLS strike (rcstk, in _seat_phase): a seat-0
    ship IS struck and an EMBARKED seat-0 target takes the flat-CS override.
    Isolation: one at-war civ seat with a walled city and ZERO units/queue, all
    other seats at peace, all barbarians cleared — only rcstk can touch p_hp."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    # make civ seat r the ONLY aggressor; strip its army/economy so nothing else fires
    sim.r_atwar[:] = False
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    clear_all_civ_units(sim)
    sim.u_alive[:] = False
    _pl = sim.occ_mil  # clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["u"]) & (_pl < sim.POOL_HI["u"])] = -1
    sim.rc_bldg[0, r, j, sim._walls_bidx] = True
    sim.rc_current[0, r] = -1
    sim.rc_progress[0, r] = 0.0
    sim.rc_cost[0, r] = 1.0e9  # a galley-policy queue can never complete this phase
    sim.r_treasury[0, r] = 0.0

    # -- ship struck.
    tt = empty_neighbor(sim, ctr)
    assert tt >= 0
    gslot = place_pmil(sim, tt, GALLEY)
    sim.r_best_melee[0, r] = 40
    base = sim.snapshot()
    sim._seat_phase()
    assert int(sim.p_hp[0, gslot]) < 100, "civ city walls did not strike the seat-0 ship"

    # -- embarked override (two-run compare on one RNG).
    sim.restore(base)
    # drop the ship, put a seat-0 WARRIOR on the same tile
    sim.occ_mil[0, tt] = -1
    sim.p_alive[0, gslot] = False
    wslot = place_pmil(sim, tt, WARRIOR, emb=True)
    sim.r_best_melee[0, r] = 20
    snap = sim.snapshot()
    sim._seat_phase()
    emb_dmg = 100 - int(sim.p_hp[0, wslot])
    sim.restore(snap)
    sim.p_emb[0, wslot] = False
    sim._seat_phase()
    gnd_dmg = 100 - int(sim.p_hp[0, wslot])
    assert emb_dmg > gnd_dmg, f"embarked flat-CS override not applied at rcstk (emb {emb_dmg} <= gnd {gnd_dmg})"
    print(f"  7b rcstk OK (ship struck; embarked override: dmg {emb_dmg} > grounded {gnd_dmg})")


def poke_embarked_capture(rules, path, WARRIOR, BUILDER):
    """8. Capturing an EMBARKED civ-seat civilian: the captured unit appends at
    the seat-0 POOL END (p_next) and KEEPS embarked under its new seat (civk).
    """
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r = 0
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # a land tile for the seat-0 warrior + an adjacent (water) tile for the
    # embarked civ-seat builder.
    r2, j, ctr = first_civ_city(sim)
    land = empty_neighbor(sim, ctr)
    assert land >= 0
    clear_tile(sim, land)
    wslot = place_pmil(sim, land, WARRIOR)
    bt = empty_neighbor(sim, land)
    assert bt >= 0 and bt != land
    force_water(sim, bt)
    bslot = place_rciv(sim, r, bt, BUILDER, emb=True)
    # a TAIL seat-0 unit AFTER the builder so pool-end is observable
    tail = empty_neighbor(sim, land)
    tail = tail if (tail >= 0 and tail != bt) else land  # any valid tile; reuse if scarce
    # find a genuinely different free tile for the tail
    for cand in range(sim.T):
        if int(sim.pmil_at[0, cand]) < 0 and int(sim.pciv_at[0, cand]) < 0 and bool(sim.passable[0, cand]) and cand not in (land, bt):
            tail = cand
            break
    tail_slot = place_pmil(sim, tail, WARRIOR)
    old_next = int(sim.p_next[0])
    d = dir_to(sim, land, bt)
    assert d >= 0
    sim._apply_unit_actions(order(sim, wslot, 6 + d))
    cap = old_next  # captured unit appends at the pool end
    assert bool(sim.p_alive[0, cap]), "captured builder not appended to the seat-0 pool"
    assert int(sim.p_type[0, cap]) == BUILDER, "captured unit is the builder"
    assert bool(sim.p_emb[0, cap]), "captured civilian must KEEP embarked under the new owner"
    assert cap > tail_slot, "capture must append at POOL END (after the pre-existing tail)"
    assert not bool(sim.v_alive[0, bslot]), "the civ builder must despawn on capture"
    assert int(sim.pciv_at[0, bt]) == cap, "captured civilian occupies the tile as a seat-0 unit"
    print(f"  8 embarked-civilian capture OK (pool-end slot {cap} > tail {tail_slot}, keeps embarked)")


def poke_flank_support(rules, path, GALLEY):
    """9. Flank/support (_flank_support): a NAVAL unit counts for flanking (a
    seat-0 ship) and for support (a civ-seat ship); the SAME unit EMBARKED
    counts 0."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r = 0
    sim.r_atwar[0, r] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # an isolated defender tile whose six neighbours are on-map and empty.
    dt = -1
    for t in range(sim.T):
        nb = sim.neigh[t]
        if any(int(nb[d]) < 0 for d in range(6)):
            continue
        if int(sim.center_at[0, t]) >= 0:
            continue
        ok = True
        for d in range(6):
            n = int(nb[d])
            if any(int(m[0, n]) >= 0 for m in (sim.pmil_at, sim.pciv_at, sim.vmil_at, sim.vciv_at, sim.barb_at, sim.center_at, sim.cs_at, sim.rc_at)):
                ok = False
                break
        if ok:
            dt = t
            break
    assert dt >= 0, "no isolated tile for the flank/support scenario"
    n_sup = int(sim.neigh[dt][0])  # a naval ALLY of the civ-seat defender (support)
    n_flk = int(sim.neigh[dt][1])  # a seat-0 ship HOSTILE to that defender (flank)
    ally = place_rmil(sim, r, n_sup, GALLEY)      # galley on the defender's own seat
    foe = place_pmil(sim, n_flk, GALLEY)          # seat-0 galley

    # _flank_support takes the defender's SEAT
    dtile = torch.tensor([dt]); dseat = torch.tensor([r + 1]); noatk = torch.tensor([-1])
    flank0, sup0 = sim._flank_support(dtile, dseat, noatk)
    assert int(sup0) >= 1, "a civ naval ally must count for support"
    assert int(flank0) >= 1, "a seat-0 naval unit must count for flanking"

    # embark BOTH — neither contributes now.
    sim.v_emb[0, ally] = True
    sim.p_emb[0, foe] = True
    flank1, sup1 = sim._flank_support(dtile, dseat, noatk)
    assert int(sup0) - int(sup1) == 1, "the naval ally embarked must drop support by exactly 1"
    assert int(flank0) - int(flank1) == 1, "the naval unit embarked must drop flanking by exactly 1"
    print(f"  9 B-7 flank/support OK (naval counts flank {int(flank0)}/support {int(sup0)}; embarked -> {int(flank1)}/{int(sup1)})")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"naval_test on {path.name}")
    GALLEY = idx(rules, "GALLEY")
    QUAD = idx(rules, "QUADRIREME")
    WARRIOR = idx(rules, "WARRIOR")
    BUILDER = idx(rules, "BUILDER")
    assert bool(load_rules().units), "no unit catalog"

    poke_galley_city(rules, path, GALLEY)
    poke_galley_cs(rules, path, GALLEY)
    poke_quadrireme_unit(rules, path, QUAD, WARRIOR)
    poke_quadrireme_city(rules, path, QUAD)
    poke_seat0_naval(rules, path, GALLEY, WARRIOR)
    poke_ocean_gate(rules, path, GALLEY)
    poke_walls_pcstk(rules, path, GALLEY, WARRIOR)
    poke_walls_rcstk(rules, path, GALLEY, WARRIOR)
    poke_embarked_capture(rules, path, WARRIOR, BUILDER)
    poke_flank_support(rules, path, GALLEY)
    print("NAVAL (B-6) POKES OK")


if __name__ == "__main__":
    main()
