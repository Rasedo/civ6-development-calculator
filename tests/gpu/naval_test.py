"""Naval + embarkation self-test — the gate-UNREACHABLE surfaces.

    npm run seed && npm run export        # (once) writes seeder/worlds/  (naval catalog)
    python gpu/naval_test.py

The scripted parity rollout reaches almost none of the naval combat surface:
seat 0 builds no ships and the civ galley policy rarely fights. These pokes pin
those semantics the same way space_race_test / war_test do: build a BatchSim
from a fixture, force the state in-memory, then drive the EXACT engine twin
(_apply_seat_unit_actions, the shared city strike (cstk), _spawn_unit,
_flank_support) and assert TS-mirroring behaviour.

Covered here (all gate-unreachable):
  1. GALLEY naval melee — batter + CAPTURE a coastal civ city.
  2. GALLEY naval melee — CAPTURE a coastal city-state.
  3. QUADRIREME range-1 bombard — a civ UNIT (no retaliation, no advance).
  4. QUADRIREME range-1 bombard — a civ CITY (HP floors at 1, never captures).
  5. SEAT-0 naval — spawn on WATER (_spawn_unit naval probe) + attack; plus
     the MOVE-verb limit: the controlled MOVE verb cannot step a ship onto
     water, because its apply reads the land `passable` plane, not wpass.
  6. OCEAN gate — a naval mover's spawn probe is blocked over OCEAN pre-
     CARTOGRAPHY, allowed post- (and COAST is ungated). (Embarked OCEAN gating
     is the TS twin in tests/cpu/units/naval-embark.test.ts.)
  7. City walls strike (cstk) — a ship IS struck (tile-agnostic scan)
     and an EMBARKED target takes the flat-CS override (proven by a two-run
     damage comparison: lower def ⇒ strictly more damage on the same RNG).
  8. Embarked civilian CAPTURE — POOL-END invariant + keeps-embarked.
  9. Flank/support — a NAVAL ally counts; the same ally EMBARKED counts 0.
 12. STEALTH — hidden at 2 and 3, seen adjacent, seen by Reveal Stealth as far
     as the chassis sees, and revealed for the turn it fires.
 13. The raider's two zone-of-control abilities — ignored, and not exerted.
 14. A ring that exerts no zone of control is no siege: the city heals.
 15. A dead or captured PASSENGER leaves its own occupancy plane.
 16. The CANAL's passage — a hull's one step ashore, and nothing else's.
 17. The chassis water is ground to — no embark, no tech, its own pool.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


# ------------------------------------------------------------------ helpers ---
def build(rules, path):
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def idx(rules, name: str) -> int:
    return [u["id"] for u in rules.units].index(name)


def clear_tile(sim, t: int) -> None:
    """Remove any unit/marker occupancy at tile t (0-batch)."""
    # clear the MERGED planes: p_/v_/u_ are DERIVED read-only views, so a
    # subscript write to one lands in a temporary and is silently discarded.
    sim.military_at[0, t] = -1
    sim.civilian_at[0, t] = -1
    sim.embarked_at[0, t] = -1





def place_mil(sim, seat: int, t: int, type_idx: int, hp: int = 100, emb: bool = False) -> int:
    """Park `seat`'s MILITARY unit on tile t. ONE window holds every major
    seat's units, so the seat write is what separates them — a slot left
    unwritten reads as the dead-slot seed, not as seat 0."""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = type_idx
    sim.major_unit_tile[0, slot] = t
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_charges[0, slot] = 0
    sim.major_unit_fortify[0, slot] = 0
    sim.major_unit_emb[0, slot] = emb
    (sim.embarked_at if emb else sim.military_at)[0, t] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def place_civilian(sim, seat: int, t: int, type_idx: int, hp: int = 100, emb: bool = False) -> int:
    """The same, on the CIVILIAN occupancy plane."""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = type_idx
    sim.major_unit_tile[0, slot] = t
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_charges[0, slot] = 0
    sim.major_unit_fortify[0, slot] = 0
    sim.major_unit_emb[0, slot] = emb
    (sim.embarked_at if emb else sim.civilian_at)[0, t] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def dir_to(sim, frm: int, to: int) -> int:
    nb = sim.neigh[frm]
    for d in range(6):
        if int(nb[d]) == to:
            return d
    return -1


def order(sim, slot: int, code: int, row: int = 0) -> torch.Tensor:
    """A one-unit order row. The applier indexes HEAD ROWS — this seat's
    living units in slot order — not pool slots, so the poke names the rank
    the merged slot maps to."""
    smap = sim._seat_slot_map(row)
    ua = torch.full((1, smap.shape[1]), -1, dtype=torch.long)
    ua[0, int((smap[0] == slot).nonzero(as_tuple=True)[0][0])] = code
    return ua


def is_center(sim, t: int) -> bool:
    """True iff tile t IS a seat-0 city / civ-city / city-state CENTER
    (territory tiles around a center are NOT centers)."""
    if int(sim.centre_slot_at[0, t]) >= 0:
        return True
    s = int(sim.citystate_at[0, t])
    return s >= 0 and int(sim.citystate_center[0, s]) == t


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
            int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0
            and not is_center(sim, t)
        ):
            return t
    return -1


def free_neighbor(sim, t: int, skip: int) -> int:
    """First unoccupied non-centre neighbour of t other than `skip`."""
    for d in range(6):
        n = int(sim.neigh[t][d])
        if n < 0 or n == skip or is_center(sim, n):
            continue
        if int(sim.military_at[0, n]) < 0 and int(sim.civilian_at[0, n]) < 0:
            return n
    return -1


def force_water(sim, t: int, ocean: bool = False) -> None:
    """Force tile t to enterable water (COAST by default, OCEAN if ocean=True):
    on the naval `wpass` plane and OFF the land `passable` plane, like real water."""
    sim.water[0, t] = True
    sim.wpass[0, t] = True
    sim.ocean_tile[0, t] = bool(ocean)
    sim.passable[0, t] = False


def first_civ_city(sim):
    idxs = sim.city_alive[0, 1:sim.n_majors].nonzero()
    assert len(idxs), "no civ city on this seed/turn"
    r, j = int(idxs[0, 0]), int(idxs[0, 1])
    return r, j, int(sim.city_center[0, r + 1, j])


def neutralize_barbs(sim) -> None:
    sim.barb_unit_alive[:] = False
    _pl = sim.military_at  # clear only this window's entries
    _pl[(_pl >= sim.POOL_LO["barb"]) & (_pl < sim.POOL_HI["barb"])] = -1
    sim.n_camps[:] = sim.max_camps
    sim.camp_tile[:] = -1


def clear_all_major_units(sim) -> None:
    """Empty the shared major window — every seat's units, not one seat's."""
    sim.major_unit_alive[:] = False
    for _pl in (sim.military_at, sim.civilian_at, sim.embarked_at):
        _pl[(_pl >= sim.POOL_LO["major"]) & (_pl < sim.POOL_HI["major"])] = -1


# ------------------------------------------------------------------ pokes -----
def poke_galley_city(rules, path, GALLEY):
    """1. A GALLEY on a water tile adjacent to a coastal civ city batters it
    (siege → _melee_city) and CAPTURES it at 0 HP — naval melee
    takes coastal cities from the sea, through the existing combat path."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # the center must hold no unit (else the melee hits the occupant / civilian)
    clear_tile(sim, ctr)
    wt = empty_neighbor(sim, ctr)
    assert wt >= 0, "no free neighbour of the civ city center"
    force_water(sim, wt)  # the galley attacks FROM water (coastal city)
    slot = place_mil(sim, 0, wt, GALLEY)
    assert bool(sim.unit_naval[GALLEY]) and bool(sim.wpass[0, wt]), "galley must be naval, on water"
    d = dir_to(sim, wt, ctr)
    assert d >= 0
    sim.civ_best_melee[0, 0] = 40  # seat 0 needs a real melee CS so the city takes damage
    sim.city_outer_hp[0, r + 1, j] = 0  # observe the inner HP directly
    hp0 = int(sim.city_hp[0, r + 1, j])
    sim._apply_seat_unit_actions(0, order(sim, slot, 6 + d))
    assert int(sim.city_hp[0, r + 1, j]) < hp0, "the galley did not batter the coastal city"

    # capture: grind to the brink, one more naval melee -> the city changes seat
    assert bool((~sim.city_alive[0, 0]).any()), "no free seat-0 city slot for the capture"
    sim.city_hp[0, r + 1, j] = 1
    sim.city_outer_hp[0, r + 1, j] = 0
    sim.major_unit_hp[0, slot] = 100  # heal the ship (counter fire earlier)
    ncity0 = int(sim.city_alive[0, 0].sum())
    sim._apply_seat_unit_actions(0, order(sim, slot, 6 + d))
    assert not bool(sim.city_alive[0, r + 1, j]), "coastal city at 1 HP not captured by the galley"
    assert int(sim.city_alive[0, 0].sum()) == ncity0 + 1, "capture must found a seat-0 city"
    c_new = int(sim.centre_slot_at[0, ctr])
    assert c_new >= 0 and bool(sim.city_alive[0, 0, c_new]), "captured center must map to the new city"
    assert int(sim.city_slot_at(0)[0, ctr]) == c_new, "captured center tile must transfer to seat 0"
    print(f"  1 galley captures a coastal city OK (hp {hp0}->batter->1->captured, city {c_new})")


def poke_galley_cs(rules, path, GALLEY):
    """2. A GALLEY on water adjacent to a city-state CENTER captures it
    (citystate_hit → _capture_city_state) — naval melee takes coastal CS too."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    live = sim.citystate_alive[0].nonzero(as_tuple=True)[0]
    assert len(live), "no city-state on this seed"
    s = int(live[0])
    # a city-state is a separate seat you must DECLARE on, and the GPU enforces
    # it
    # that (the pair cell `war[b, row, cs_row]` is the whole fact, mirroring
    # TS's `cityStateTarget`). This poke
    # sieges, so it must be at war first; there is no declare VERB on the GPU,
    # so set the plane directly.
    sim.war[0, 0, sim.row_of(100 + s)] = sim.war[0, sim.row_of(100 + s), 0] = True
    ctr = int(sim.citystate_center[0, s])
    clear_tile(sim, ctr)
    wt = empty_neighbor(sim, ctr)
    assert wt >= 0
    force_water(sim, wt)
    slot = place_mil(sim, 0, wt, GALLEY)
    d = dir_to(sim, wt, ctr)
    assert d >= 0
    # remove any barbarian within 2 of the center that could land the kill first
    near = sim.pair_dist[ctr] <= 2
    for u in (sim.barb_unit_alive[0] & near[sim.barb_unit_tile[0].clamp(min=0)]).nonzero(as_tuple=True)[0].tolist():
        t_ = int(sim.barb_unit_tile[0, u])
        sim.barb_unit_alive[0, u] = False
        if int(sim.barb_at[0, t_]) == u:
            sim.military_at[0, t_] = -1
    sim.citystate_hp[0, s] = 1
    assert bool((~sim.city_alive[0, 0]).any()), "no free seat-0 city slot for the CS capture"
    pop_before = int(sim.citystate_pop[0, s])
    ncity0 = int(sim.city_alive[0, 0].sum())
    sim._apply_seat_unit_actions(0, order(sim, slot, 6 + d))
    assert not bool(sim.citystate_alive[0, s]), "CS at 1 HP not captured by the galley"
    assert int(sim.city_alive[0, 0].sum()) >= ncity0 + 1, "CS capture must found a seat-0 city"
    c_new = int(sim.centre_slot_at[0, ctr])
    assert c_new >= 0 and int(sim.city_slot_at(0)[0, ctr]) == c_new, "captured CS center must transfer"
    assert int(sim.city_pop[0, 0, c_new]) == max(1, (pop_before * 3) // 4), "captured pop x0.75 (min 1)"
    print(f"  2 galley captures a city-state OK (pop {pop_before}->{int(sim.city_pop[0, 0, c_new])}, city {c_new})")


def poke_quadrireme_unit(rules, path, QUAD, WARRIOR):
    """3. A QUADRIREME (rangedStrength 25, range 1) on water bombards an
    adjacent civ unit — one roll, NO retaliation, NO advance (civ_only_att path)."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert float(sim._type_ranged_strength[QUAD]) > 0 and bool(sim.unit_naval[QUAD]), "quadrireme must be a naval ranged unit"
    r, j, ctr = first_civ_city(sim)
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # a defender tile + an adjacent water tile for the ship (both cleared/empty)
    dt = empty_neighbor(sim, ctr)
    assert dt >= 0
    clear_tile(sim, dt)
    vslot = place_mil(sim, r + 1, dt, WARRIOR)
    wt = empty_neighbor(sim, dt)
    assert wt >= 0 and wt != dt
    force_water(sim, wt)
    qslot = place_mil(sim, 0, wt, QUAD)
    d = dir_to(sim, wt, dt)
    assert d >= 0
    vhp0, php0, tile0 = int(sim.major_unit_hp[0, vslot]), int(sim.major_unit_hp[0, qslot]), int(sim.major_unit_tile[0, qslot])
    sim._apply_seat_unit_actions(0, order(sim, qslot, 6 + d))
    assert int(sim.major_unit_hp[0, vslot]) < vhp0, "bombard dealt no damage to the civ unit"
    assert int(sim.major_unit_hp[0, qslot]) == php0, "ranged bombard must take NO retaliation"
    assert int(sim.major_unit_tile[0, qslot]) == tile0, "ranged bombard must NOT advance"
    print(f"  3 quadrireme bombards a unit OK (civ hp {vhp0}->{int(sim.major_unit_hp[0, vslot])}, ship unharmed, no advance)")


def poke_quadrireme_city(rules, path, QUAD):
    """4. A QUADRIREME bombards an adjacent coastal city — HP drops but FLOORS
    at 1 (civ_only_sieg: ranged never captures; melee finishes)."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    clear_tile(sim, ctr)
    wt = empty_neighbor(sim, ctr)
    assert wt >= 0
    force_water(sim, wt)
    qslot = place_mil(sim, 0, wt, QUAD)
    d = dir_to(sim, wt, ctr)
    assert d >= 0
    # a wounded-but-alive city takes damage
    sim.city_hp[0, r + 1, j] = 100
    hp0 = int(sim.city_hp[0, r + 1, j])
    sim._apply_seat_unit_actions(0, order(sim, qslot, 6 + d))
    assert int(sim.city_hp[0, r + 1, j]) < hp0, "bombard dealt no damage to the city"
    assert bool(sim.city_alive[0, r + 1, j]), "a ranged bombard must never capture"
    # at 1 HP the floor holds — the city survives and stays at 1
    sim.city_hp[0, r + 1, j] = 1
    sim._apply_seat_unit_actions(0, order(sim, qslot, 6 + d))
    assert int(sim.city_hp[0, r + 1, j]) == 1, "ranged bombard must floor city HP at 1"
    assert bool(sim.city_alive[0, r + 1, j]), "floored city must remain alive (no ranged capture)"
    print(f"  4 quadrireme bombards a city OK (hp {hp0}->{int(sim.city_hp[0, r + 1, j]) if False else '..'}->floored at 1, no capture)")


def poke_seat0_naval(rules, path, GALLEY, WARRIOR):
    """5. Seat-0 naval end-to-end (forced, since seat 0 builds no ships on its
    own): a GALLEY SPAWNS on the nearest free WATER tile, then attacks. Plus the
    MOVE-verb limit — the controlled MOVE verb reads the land `passable` plane
    (no wpass), so it cannot step a ship onto water."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # spawn: an anchor land tile with exactly one free WATER neighbour -> the
    # naval probe skips the (land) anchor and lands the ship on the water tile.
    anchor = empty_neighbor(sim, ctr)  # a free land-ish neighbour of the city
    assert anchor >= 0 and not bool(sim.wpass[0, anchor]), "anchor must be a non-water free tile"
    wt = empty_neighbor(sim, anchor)
    assert wt >= 0 and wt != anchor
    force_water(sim, wt)
    n0 = int(sim.unit_next[0])
    sim._spawn_unit(0, torch.tensor([True]), torch.tensor([anchor]), torch.tensor([GALLEY]))
    assert int(sim.unit_next[0]) == n0 + 1, "seat-0 galley failed to spawn"
    gslot = n0
    assert bool(sim.wpass[0, int(sim.major_unit_tile[0, gslot])]), "naval unit must spawn on WATER"
    assert not bool(sim.major_unit_emb[0, gslot]), "a naval unit is never 'embarked'"
    assert bool(sim.unit_naval[sim.major_unit_type[0, gslot]]), "spawned unit is the galley"

    # attack: put an at-war civ-seat unit next to the spawned ship, batter it.
    gt = int(sim.major_unit_tile[0, gslot])
    dt = empty_neighbor(sim, gt)
    assert dt >= 0
    clear_tile(sim, dt)
    vslot = place_mil(sim, r + 1, dt, WARRIOR)
    sim.civ_best_melee[0, 0] = 40
    da = dir_to(sim, gt, dt)
    assert da >= 0
    vhp0 = int(sim.major_unit_hp[0, vslot])
    sim._apply_seat_unit_actions(0, order(sim, gslot, 6 + da))
    assert int(sim.major_unit_hp[0, vslot]) < vhp0, "seat-0 galley dealt no melee damage"

    # the controlled MOVE verb cannot move a ship onto water.
    gt2 = int(sim.major_unit_tile[0, gslot])
    wt2 = empty_neighbor(sim, gt2)
    assert wt2 >= 0
    force_water(sim, wt2)
    assert not bool(sim.passable[0, wt2]), "water is not on the land `passable` plane"
    dm = dir_to(sim, gt2, wt2)
    assert dm >= 0
    before = int(sim.major_unit_tile[0, gslot])
    sim._apply_seat_unit_actions(0, order(sim, gslot, dm))  # a MOVE order (0..5)
    assert int(sim.major_unit_tile[0, gslot]) == before, (
       "RL/controlled move stepped a ship onto water — the residual (seat-0 naval "
        "water-move columns) is unexpectedly LIVE; TS findPath is the naval-aware path"
    )
    print("  5 seat-0 naval OK (spawn-on-water + attack; RL water-move is the documented residual)")


def poke_ocean_gate(rules, path, GALLEY):
    """6. OCEAN gate for a naval mover (the _spawn_unit naval probe shares the
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
    sim.civ_techs[0, 0, cart] = False
    n0 = int(sim.unit_next[0])
    sim._spawn_unit(0, torch.tensor([True]), torch.tensor([anchor]), torch.tensor([GALLEY]))
    assert int(sim.unit_next[0]) == n0, "ship spawned on OCEAN without CARTOGRAPHY"

    # post-CARTOGRAPHY: the ocean spot opens -> the ship lands there.
    sim.civ_techs[0, 0, cart] = True
    sim._spawn_unit(0, torch.tensor([True]), torch.tensor([anchor]), torch.tensor([GALLEY]))
    assert int(sim.unit_next[0]) == n0 + 1, "ship failed to spawn on OCEAN with CARTOGRAPHY"
    assert int(sim.major_unit_tile[0, n0]) == ot, "the ship must land on the (now-enterable) ocean tile"

    # COAST is ungated: a fresh coast candidate spawns with CARTOGRAPHY absent.
    sim2 = build(rules, path)
    for _ in range(25):
        sim2.step()
    r2, j2, ctr2 = first_civ_city(sim2)
    anchor2 = empty_neighbor(sim2, ctr2)
    ct = empty_neighbor(sim2, anchor2)
    assert anchor2 >= 0 and ct >= 0
    force_water(sim2, ct, ocean=False)  # COAST
    sim2.civ_techs[0, 0, cart] = False
    m0 = int(sim2.unit_next[0])
    sim2._spawn_unit(0, torch.tensor([True]), torch.tensor([anchor2]), torch.tensor([GALLEY]))
    assert int(sim2.unit_next[0]) == m0 + 1, "COAST spawn must NOT need CARTOGRAPHY"
    print("  6 OCEAN gate OK (pre-CART blocked, post-CART allowed; COAST ungated)")


def poke_walls_seat0(rules, path, GALLEY, WARRIOR):
    """7a. A seat-0 city's ANCIENT_WALLS strike (cstk, the shared per-city
    body): a naval unit IS struck (tile-agnostic scan), and an EMBARKED target
    takes the flat-CS override. Override proved by a two-run damage compare on
    one RNG."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert sim._walls_bidx >= 0
    assert bool(sim.city_alive[0, 0, 0]), "seat-0 capital must be alive"
    c, ctr = 0, int(sim.city_center[0, 0, 0])
    sim.city_bldg[0, 0, c, sim._walls_bidx] = True
    # CIV6: the strike is the Outer Defense's, and dies with it
    sim.city_outer_hp[0, 0, c] = sim._walls_hp
    r = 0
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose

    # -- ship struck: isolate the wall strike (no barbarian / other-seat confounds).
    neutralize_barbs(sim)
    clear_all_major_units(sim)
    tt = empty_neighbor(sim, ctr)  # dist 1 -> always the nearest target
    assert tt >= 0
    gslot = place_mil(sim, r + 1, tt, GALLEY)  # a civ-seat galley in range
    sim.civ_best_melee[0, 0] = 40
    base = sim.snapshot()
    sim._seat_city_fire_and_heal(0, torch.zeros(sim.B, dtype=torch.long), sim.city_alive[:, 0, 0])
    assert int(sim.major_unit_hp[0, gslot]) < 100, "seat-0 city walls did not strike the ship"

    # -- embarked override: a civ-seat WARRIOR at the same tile, embarked vs grounded.
    sim.restore(base)
    clear_all_major_units(sim)
    wslot = place_mil(sim, r + 1, tt, WARRIOR, emb=True)
    sim.civ_best_melee[0, 0] = 20  # keep the hit sub-lethal so we can read the damage
    snap = sim.snapshot()
    sim._seat_city_fire_and_heal(0, torch.zeros(sim.B, dtype=torch.long), sim.city_alive[:, 0, 0])
    emb_dmg = 100 - int(sim.major_unit_hp[0, wslot])
    sim.restore(snap)
    sim.major_unit_emb[0, wslot] = False  # same warrior, grounded (combat 20 + terrain)
    sim._seat_city_fire_and_heal(0, torch.zeros(sim.B, dtype=torch.long), sim.city_alive[:, 0, 0])
    gnd_dmg = 100 - int(sim.major_unit_hp[0, wslot])
    assert emb_dmg > gnd_dmg, f"embarked flat-CS override not applied at cstk (emb {emb_dmg} <= gnd {gnd_dmg})"
    print(f"  7a seat-0 cstk OK (ship struck; embarked override: dmg {emb_dmg} > grounded {gnd_dmg})")


def poke_walls_civ(rules, path, GALLEY, WARRIOR):
    """7b. A civ-seat city's ANCIENT_WALLS strike (cstk, the same body): a seat-0
    ship IS struck and an EMBARKED seat-0 target takes the flat-CS override.
    Isolation: one at-war civ seat with a walled city and ZERO units/queue, all
    other seats at peace, all barbarians cleared — only the strike can touch major_unit_hp."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r, j, ctr = first_civ_city(sim)
    # make civ seat r the ONLY aggressor; strip its army/economy so nothing else fires
    sim.war[:, 0, 1:sim.n_majors] = sim.war[:, 1:sim.n_majors, 0] = False
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    clear_all_major_units(sim)
    sim.barb_unit_alive[:] = False
    _pl = sim.military_at  # clear only this window's entries
    _pl[(_pl >= sim.POOL_LO["barb"]) & (_pl < sim.POOL_HI["barb"])] = -1
    sim.city_bldg[0, r + 1, j, sim._walls_bidx] = True
    sim.city_outer_hp[0, r + 1, j] = sim._walls_hp  # the perimeter the strike comes from
    sim.city_current[0, r + 1] = -1
    sim.city_progress[0, r + 1] = 0.0
    sim.city_cost[0, r + 1] = 1.0e9  # a galley-policy queue can never complete this phase
    sim.civ_treasury[0, r + 1] = 0.0

    # -- ship struck.
    tt = empty_neighbor(sim, ctr)
    assert tt >= 0
    gslot = place_mil(sim, 0, tt, GALLEY)
    sim.civ_best_melee[0, r + 1] = 40
    base = sim.snapshot()
    sim._seat_phase()
    assert int(sim.major_unit_hp[0, gslot]) < 100, "civ city walls did not strike the seat-0 ship"

    # -- embarked override (two-run compare on one RNG).
    sim.restore(base)
    # drop the ship, put a seat-0 WARRIOR on the same tile
    sim.military_at[0, tt] = -1
    sim.major_unit_alive[0, gslot] = False
    wslot = place_mil(sim, 0, tt, WARRIOR, emb=True)
    sim.civ_best_melee[0, r + 1] = 20
    snap = sim.snapshot()
    sim._seat_phase()
    emb_dmg = 100 - int(sim.major_unit_hp[0, wslot])
    sim.restore(snap)
    sim.major_unit_emb[0, wslot] = False
    sim._seat_phase()
    gnd_dmg = 100 - int(sim.major_unit_hp[0, wslot])
    assert emb_dmg > gnd_dmg, f"embarked flat-CS override not applied at cstk (emb {emb_dmg} <= gnd {gnd_dmg})"
    print(f"  7b civ cstk OK (ship struck; embarked override: dmg {emb_dmg} > grounded {gnd_dmg})")


def poke_embarked_capture(rules, path, WARRIOR, BUILDER):
    """8. Capturing an EMBARKED civ-seat civilian: the captured unit appends at
    the seat-0 POOL END (unit_next) and KEEPS embarked under its new seat (civk).
    """
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r = 0
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # a land tile for the seat-0 warrior + an adjacent (water) tile for the
    # embarked civ-seat builder.
    r2, j, ctr = first_civ_city(sim)
    land = empty_neighbor(sim, ctr)
    assert land >= 0
    clear_tile(sim, land)
    wslot = place_mil(sim, 0, land, WARRIOR)
    bt = empty_neighbor(sim, land)
    assert bt >= 0 and bt != land
    force_water(sim, bt)
    bslot = place_civilian(sim, r + 1, bt, BUILDER, emb=True)
    # a TAIL seat-0 unit AFTER the builder so pool-end is observable
    tail = empty_neighbor(sim, land)
    tail = tail if (tail >= 0 and tail != bt) else land  # any valid tile; reuse if scarce
    # find a genuinely different free tile for the tail
    for cand in range(sim.T):
        if int(sim.military_at[0, cand]) < 0 and int(sim.civilian_at[0, cand]) < 0 and bool(sim.passable[0, cand]) and cand not in (land, bt):
            tail = cand
            break
    tail_slot = place_mil(sim, 0, tail, WARRIOR)
    old_next = int(sim.unit_next[0])
    d = dir_to(sim, land, bt)
    assert d >= 0
    sim._apply_seat_unit_actions(0, order(sim, wslot, 6 + d))
    cap = old_next  # captured unit appends at the pool end
    assert bool(sim.major_unit_alive[0, cap]), "captured builder not appended to the seat-0 pool"
    assert int(sim.major_unit_type[0, cap]) == BUILDER, "captured unit is the builder"
    assert bool(sim.major_unit_emb[0, cap]), "captured civilian must KEEP embarked under the new owner"
    assert cap > tail_slot, "capture must append at POOL END (after the pre-existing tail)"
    assert not bool(sim.major_unit_alive[0, bslot]), "the civ builder must despawn on capture"
    assert int(sim.embarked_at[0, bt]) == cap, "an embarked captive holds the PASSENGER plane as a seat-0 unit"
    print(f"  8 embarked-civilian capture OK (pool-end slot {cap} > tail {tail_slot}, keeps embarked)")


def poke_flank_support(rules, path, GALLEY):
    """9. Flank/support (_flank_support): a NAVAL unit counts for flanking (a
    seat-0 ship) and for support (a civ-seat ship); the SAME unit EMBARKED
    counts 0."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    r = 0
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    sim.sync_war()  # a poke writes one cell; close the war matrix under transpose
    # an isolated defender tile whose six neighbours are on-map and empty.
    dt = -1
    for t in range(sim.T):
        nb = sim.neigh[t]
        if any(int(nb[d]) < 0 for d in range(6)):
            continue
        if int(sim.centre_slot_at[0, t]) >= 0:
            continue
        ok = True
        for d in range(6):
            n = int(nb[d])
            if any(int(m[0, n]) >= 0 for m in (sim.military_at, sim.civilian_at, sim.centre_slot_at, sim.citystate_at)):
                ok = False
                break
        if ok:
            dt = t
            break
    assert dt >= 0, "no isolated tile for the flank/support scenario"
    n_sup = int(sim.neigh[dt][0])  # a naval ALLY of the civ-seat defender (support)
    n_flk = int(sim.neigh[dt][1])  # a ship the seat-0 ATTACKER owns (flank)
    ally = place_mil(sim, r + 1, n_sup, GALLEY)      # galley on the defender's own seat
    mine = place_mil(sim, 0, n_flk, GALLEY)          # seat-0 galley

    dtile = torch.tensor([dt]); dseat = torch.tensor([r + 1])
    noatk = torch.tensor([-1]); aseat = torch.tensor([0])
    assert sim._flank_support_civic >= 0, "the rules must name the flank/support civic"

    # CIV6: both bonuses "are unlocked only after researching Military Tradition"
    sim.civ_civics[0, :, sim._flank_support_civic] = False
    f_off, s_off = sim._flank_support(dtile, dseat, noatk, aseat)
    assert int(f_off) == 0 and int(s_off) == 0, "no Military Tradition, no flanking and no support"
    sim.civ_civics[0, :, sim._flank_support_civic] = True

    flank0, sup0 = sim._flank_support(dtile, dseat, noatk, aseat)
    assert int(sup0) >= 1, "a civ naval ally must count for support"
    assert int(flank0) >= 1, "a naval unit the ATTACKER owns must count for flanking"

    # "The attacker itself does not count" — by UNIT, not by tile. A religious
    # attacker shares its tile with a military unit that flanks like any other,
    # so only the attacker's own occupancy index drops out.
    self_slot = torch.tensor([mine + sim.POOL_LO["major"]])
    flank_self, _ = sim._flank_support(dtile, dseat, self_slot, aseat)
    assert int(flank0) - int(flank_self) == 1, "the attacker itself must not flank"

    # CIV6: "embarked land units do not provide Flanking", but they "provide
    # Support like normal" — the one rule where the two part company.
    sim.major_unit_emb[0, ally] = True
    sim.major_unit_emb[0, mine] = True
    flank1, sup1 = sim._flank_support(dtile, dseat, noatk, aseat)
    assert int(sup1) == int(sup0), "an embarked ally must still support"
    assert int(flank0) - int(flank1) == 1, "an embarked unit must stop flanking"

    # CIV6: "units across a River from the targeted enemy do not provide Flanking"
    sim.major_unit_emb[0, mine] = False
    was_river = int(sim.river_mask[0, dt])
    sim.river_mask[0, dt] = 0b111111
    flank2, _ = sim._flank_support(dtile, dseat, noatk, aseat)
    assert int(flank2) == 0, "a river on every edge must leave no flanker"
    sim.river_mask[0, dt] = was_river
    print(f"  9 flank/support OK (flank {int(flank0)}/support {int(sup0)}; embarked -> {int(flank1)}/{int(sup1)}, river -> 0)")


def poke_amphibious(rules, path, WARRIOR, ARCHER):
    """10. THE AMPHIBIOUS ATTACK. CIV6 (Combat): "Embarked units with melee
    attacks may attack targets on land when adjacent to it, but they will
    suffer the amphibious attack CS penalty", and they "may not attack any
    other unit in the water, including other embarked units". A Cliff refuses
    the attack outright rather than softening it, and the victor comes ashore.
    """
    def scene(emb: bool = True, utype: int | None = None, cliff: bool = False):
        sim = build(rules, path)
        for _ in range(25):
            sim.step()
        sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
        sim.sync_war()
        _r, _j, ctr = first_civ_city(sim)
        land = empty_neighbor(sim, ctr)
        assert land >= 0
        clear_tile(sim, land)
        sea = free_neighbor(sim, land, ctr)
        assert sea >= 0
        force_water(sim, sea)
        if cliff:
            sim.cliff_mask[0, land] = 0b111111
        dslot = place_mil(sim, 1, land, WARRIOR)
        aslot = place_mil(sim, 0, sea, WARRIOR if utype is None else utype, emb=emb)
        sim.major_unit_mp[0, aslot] = 2
        sim.major_unit_mp_full[0, aslot] = 2
        return sim, aslot, dslot, land, sea

    def col(sim, slot: int, frm: int, to: int) -> bool:
        rw = int((sim._seat_slot_map(0)[0] == slot).nonzero(as_tuple=True)[0][0])
        d = dir_to(sim, frm, to)
        assert d >= 0, "tiles must be adjacent"
        return bool(sim._seat_unit_mask(0)[0, rw, 6 + d])

    sim, aslot, dslot, land, sea = scene()
    assert col(sim, aslot, sea, land), "an embarked melee unit must be offered the shore"
    sim._apply_seat_unit_actions(0, order(sim, aslot, 6 + dir_to(sim, sea, land)))
    wet = 100 - int(sim.major_unit_hp[0, dslot])
    assert wet > 0, "the amphibious attack must reach the defender"

    # the SAME exchange, one term apart: identical fixture, identical 25 steps,
    # identical tiles and roll keys, the attacker afloat vs standing.
    dry_sim, a2, d2, l2, s2 = scene(emb=False)
    dry_sim._apply_seat_unit_actions(0, order(dry_sim, a2, 6 + dir_to(dry_sim, s2, l2)))
    dry = 100 - int(dry_sim.major_unit_hp[0, d2])
    pen = sim._amphibious_attack_cs
    assert dry > wet, f"the -{pen} amphibious penalty must cost damage: afloat {wet}, ashore {dry}"

    adv_sim, a3, d3, l3, s3 = scene()
    adv_sim.major_unit_hp[0, d3] = 1
    adv_sim._apply_seat_unit_actions(0, order(adv_sim, a3, 6 + dir_to(adv_sim, s3, l3)))
    assert not bool(adv_sim.major_unit_alive[0, d3]), "the defender must die"
    assert int(adv_sim.major_unit_tile[0, a3]) == l3, "the victor advances into the tile"
    assert not bool(adv_sim.major_unit_emb[0, a3]), "and comes ashore doing it"

    cliff_sim, a4, _d4, l4, s4 = scene(cliff=True)
    assert not col(cliff_sim, a4, s4, l4), "a Cliff must close the shore entirely"

    wet_sim, a5, _d5, l5, s5 = scene()
    afloat = free_neighbor(wet_sim, s5, l5)
    assert afloat >= 0
    force_water(wet_sim, afloat)
    place_mil(wet_sim, 1, afloat, WARRIOR, emb=True)
    assert not col(wet_sim, a5, s5, afloat), "nothing in the water is ever a target"

    arch_sim, a6, _d6, _l6, _s6 = scene(utype=ARCHER)
    rw6 = int((arch_sim._seat_slot_map(0)[0] == a6).nonzero(as_tuple=True)[0][0])
    assert not bool(arch_sim._seat_unit_mask(0)[0, rw6, 6:12].any()), \
        "an embarked RANGED unit has no attack at all"
    print(f"  10 amphibious OK (afloat {wet} vs ashore {dry} damage, -{pen} CS; "
          "cliff/water/ranged all refused, victor disembarks)")


def poke_embarked_support(rules, path, WARRIOR, GALLEY):
    """11. CIV6 (Flanking and Support): "Embarked land units do not benefit from
    Support against attacks of enemy naval units" — so an escort still counts
    for them against everything else, on top of the normalized embarked CS."""
    def scene(escorted: bool, naval: bool) -> int:
        sim = build(rules, path)
        for _ in range(25):
            sim.step()
        sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
        sim.sync_war()
        sim.civ_civics[:, :, sim._flank_support_civic] = True
        _r, _j, ctr = first_civ_city(sim)
        land = empty_neighbor(sim, ctr)
        assert land >= 0
        clear_tile(sim, land)
        sea = free_neighbor(sim, land, ctr)
        assert sea >= 0
        force_water(sim, sea)
        dslot = place_mil(sim, 1, sea, WARRIOR, emb=True)
        spare = [
            n for n in (int(x) for x in sim.neigh[sea].tolist())
            if n >= 0 and n != land and not is_center(sim, n)
            and int(sim.military_at[0, n]) < 0 and int(sim.civilian_at[0, n]) < 0
        ]
        atile = land
        if naval:
            atile = spare.pop(0)
            force_water(sim, atile)
        if escorted:
            esc = spare.pop(0)
            force_water(sim, esc)
            place_mil(sim, 1, esc, WARRIOR, emb=True)
        aslot = place_mil(sim, 0, atile, GALLEY if naval else WARRIOR)
        sim.major_unit_mp[0, aslot] = 2
        sim.major_unit_mp_full[0, aslot] = 2
        sim._apply_seat_unit_actions(0, order(sim, aslot, 6 + dir_to(sim, atile, sea)))
        assert bool(sim.major_unit_alive[0, dslot]), "the poke needs a surviving defender"
        return 100 - int(sim.major_unit_hp[0, dslot])

    lone = scene(False, False)
    held = scene(True, False)
    assert lone > held > 0, f"an escort must blunt a LAND attack: alone {lone}, escorted {held}"
    lone_n = scene(False, True)
    held_n = scene(True, True)
    assert held_n == lone_n > 0, f"a NAVAL attack ignores it: alone {lone_n}, escorted {held_n}"
    print(f"  11 embarked support OK (land attack {lone}->{held} with an escort; "
          f"naval attack {lone_n} either way)")


def _lane(sim, a: int, d: int) -> int:
    """a WATER tile exactly `d` hexes from `a`, forced enterable and empty."""
    cand = (sim.pair_dist[a] == d).nonzero().flatten().tolist()
    assert cand, f"no tile at distance {d}"
    t = int(cand[0])
    force_water(sim, t)
    clear_tile(sim, t)
    return t


def _lone_war(sim) -> None:
    """seat 0 and seat 1 at war, every other unit and camp off the board."""
    neutralize_barbs(sim)
    clear_all_major_units(sim)
    sim.war[:, 0, 1:sim.n_majors] = sim.war[:, 1:sim.n_majors, 0] = False
    sim.war[0, 0, 1] = sim.war[0, 1, 0] = True
    sim.sync_war()


def poke_stealth(rules, path, PRIVATEER, FRIGATE, DESTROYER, SCOUT):
    """12. CIV6 (Unit): a stealth unit is "invisible to non-adjacent units",
    REVEAL STEALTH sees one "within their Sight range", and one that attacks
    "will become visible for a turn". `unitVisibleTo` is the TS twin."""
    sim = build(rules, path)
    _lone_war(sim)
    a = _lane(sim, int(sim.city_center[0, 0, 0]), 5)
    raider = place_mil(sim, 1, a, PRIVATEER) + sim.POOL_LO["major"]

    def hidden() -> bool:
        h = bool(sim._stealth_hidden(0)[0, a])
        seen_slot = int(sim._visible_military_at(0)[0, a])
        assert (seen_slot < 0) == h, "the hidden plane and the masked plane disagree"
        return h

    assert hidden(), "a raider nobody stands near is not hidden"

    # an ordinary hull two hexes off sees nothing; one hex off sees everything
    far = _lane(sim, a, 2)
    eye = place_mil(sim, 0, far, FRIGATE)
    assert hidden(), "a FRIGATE at 2 revealed a stealth hull"
    near = _lane(sim, a, 1)
    sim.military_at[0, far] = -1
    sim.major_unit_tile[0, eye] = near
    sim.military_at[0, near] = eye + sim.POOL_LO["major"]
    assert not hidden(), "an ADJACENT unit did not reveal the stealth hull"

    # Reveal Stealth reaches as far as the chassis sees: a Destroyer at 3 does,
    # a Frigate at 3 does not.
    sim.military_at[0, near] = -1
    three = _lane(sim, a, 3)
    sim.major_unit_tile[0, eye] = three
    sim.military_at[0, three] = eye + sim.POOL_LO["major"]
    assert hidden(), "a FRIGATE at 3 revealed a stealth hull"
    sim.major_unit_type[0, eye] = DESTROYER
    assert not hidden(), "Reveal Stealth at sight 3 missed the hull"
    sim.major_unit_type[0, eye] = SCOUT
    assert hidden(), "a Scout's sight 2 reached 3 hexes"

    # its own seat always sees it, and so does everyone once it fires
    assert not bool(sim._stealth_hidden(1)[0, a]), "a seat cannot see its own raider"
    sim.unit_revealed_turn[0, raider] = sim.turn
    assert not hidden(), "the attack stamp did not reveal the hull"
    sim.unit_revealed_turn[0, raider] = sim.turn - 1
    assert hidden(), "the reveal outlived its turn"

    assert int(sim._unit_sight(torch.tensor([DESTROYER]), torch.zeros(1, dtype=torch.long))[0]) == 3
    assert int(sim._unit_sight(torch.tensor([FRIGATE]), torch.zeros(1, dtype=torch.long))[0]) == 2
    print("  12 stealth OK (hidden at 2/3, seen adjacent, Destroyer 3 / Scout 2, attack reveals for a turn)")


def poke_raider_zoc(rules, path, PRIVATEER, SUBMARINE, FRIGATE):
    """13. CIV6: a naval raider "ignores enemy zone of control"; the two
    submarines additionally "do not exert zone of control"."""
    sim = build(rules, path)
    _lone_war(sim)
    post = _lane(sim, int(sim.city_center[0, 0, 0]), 5)
    dest = _lane(sim, post, 1)
    holder = place_mil(sim, 1, post, FRIGATE)

    def halted(mover: int) -> bool:
        return bool(sim._in_enemy_zoc(
            torch.full((sim.B,), dest, dtype=torch.long),
            0,
            torch.full((sim.B,), mover, dtype=torch.long))[0])

    assert halted(FRIGATE), "an ordinary hull walked through a zone of control"
    assert not halted(PRIVATEER), "the raider did not ignore the zone of control"
    sim.major_unit_type[0, holder] = SUBMARINE
    assert not halted(FRIGATE), "a submarine exerted a zone of control"
    print("  13 raider ZOC OK (ignored by the raider, not exerted by the submarine)")


def poke_submarine_siege(rules, path, FRIGATE, SUBMARINE):
    """14. The siege gate is ZONE OF CONTROL — "if the invading army manages to
    establish zone of control on all passable tiles surrounding the City
    Center" — so a ring that exerts none lets the city heal."""
    sim = build(rules, path)
    _lone_war(sim)
    ctr = int(sim.city_center[0, 0, 0])
    ring = []
    for d in range(6):
        t = int(sim.neigh[ctr, d])
        if t < 0:
            continue
        if not bool(sim.passable[0, t] or sim.wpass[0, t]):
            continue
        clear_tile(sim, t)
        ring.append(place_mil(sim, 1, t, FRIGATE))
    assert len(ring) >= 3, "no passable ring on this seed"

    col = torch.zeros(sim.B, dtype=torch.long)
    act = sim.city_alive[:, 0, 0]

    def heal_of(kind: int) -> int:
        for slot in ring:
            sim.major_unit_type[0, slot] = kind
        sim.city_hp[0, 0, 0] = 100
        snap = sim.snapshot()
        sim._seat_city_fire_and_heal(0, col, act)
        got = int(sim.city_hp[0, 0, 0]) - 100
        sim.restore(snap)
        return got

    besieged = heal_of(FRIGATE)
    free = heal_of(SUBMARINE)
    assert besieged == 0, f"a frigate ring did not besiege the city (healed {besieged})"
    assert free > 0, "a submarine ring besieged the city it exerts no control over"
    print(f"  14 submarine siege OK (frigate ring heals {besieged}, submarine ring heals {free})")

def rank_of(sim, slot: int, row: int = 0) -> int:
    smap = sim._seat_slot_map(row)
    return int((smap[0] == slot).nonzero(as_tuple=True)[0][0])


def shore_pair(sim, row: int = 0):
    """(water tile, free land tile of seat `row` beside it) — the two ends of
    a step a hull normally cannot take."""
    for w in range(sim.T):
        if not bool(sim.wpass[0, w]) or bool(sim.ocean_tile[0, w]):
            continue
        if int(sim.military_at[0, w]) >= 0 or is_center(sim, w):
            continue
        for d in range(6):
            n = int(sim.neigh[w][d])
            if n < 0 or is_center(sim, n) or int(sim.tile_seat[0, n]) != row:
                continue
            if (bool(sim.passable[0, n]) and int(sim.district[0, n]) < 0
                    and int(sim.military_at[0, n]) < 0 and int(sim.civilian_at[0, n]) < 0):
                return w, n
    raise AssertionError(f"seed holds no free shore plot for row {row}")


def poke_canal(rules, path, GALLEY, WARRIOR):
    """16. CIV6 (Canal): "Allows Naval units to pass through this tile." The
    passage is a HULL fact and nothing else — the ground stays land for the
    land plane, for the water plane, and for a pillaged district."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert sim._canal_didx >= 0, "the district catalog carries no Canal"
    neutralize_barbs(sim)
    w, land = shore_pair(sim)
    clear_tile(sim, w)
    g = place_mil(sim, 0, w, GALLEY)
    d = dir_to(sim, w, land)
    assert d >= 0
    rw = rank_of(sim, g)
    assert not bool(sim._seat_unit_mask(0)[0, rw, d]), "a hull has no step onto bare ground"
    sim.district[0, land] = sim._canal_didx
    sim.district_complete[0, land] = True
    sim._eff_version += 1
    sim._gen_ver += 1
    assert bool(sim._canal_pass()[0, land]), "a finished Canal carries the passage"
    assert not bool(sim.water[0, land]), "and the ground under it is still land"
    assert bool(sim._seat_unit_mask(0)[0, rw, d]), "the passage opens the hull's step"
    sim.district_pillaged[0, land] = True
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(0)[0, rw, d]), (
        "a pillaged district carries no effect, this one included")
    sim.district_pillaged[0, land] = False
    sim._eff_version += 1
    mp0 = float(sim.major_unit_mp[0, g])
    sim._apply_seat_unit_actions(0, order(sim, g, d))
    assert int(sim.major_unit_tile[0, g]) == land, "the hull did not take the passage"
    assert not bool(sim.major_unit_emb[0, g]), "a hull is never embarked, ashore least of all"
    assert abs(float(sim.major_unit_mp[0, g]) - (mp0 - sim._mp_scale)) < 1e-6, (
        "the passage costs the WATER step, not the ground's schedule")
    # ...and a land unit stands on the same plot, because it IS land
    land2 = free_neighbor(sim, land, w)
    assert land2 >= 0
    clear_tile(sim, land2)
    v = place_mil(sim, 0, land2, WARRIOR)
    assert bool(sim.passable[0, land]), "the Canal's ground never left the land plane"
    assert not bool(sim.wpass[0, land]), "nor did it join the water one"
    assert int(sim.major_unit_tile[0, v]) == land2
    print("  16 canal OK (the hull's step ashore, priced as water, and nobody else's rule)")


def poke_water_walk(rules, path, GDR):
    """17. CIV6 (Giant Death Robot): "Can move and fight in Ocean and Coast
    tiles as it would on land" — no embark, no seafaring tech, its own pool."""
    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert bool(sim.unit_water_walk[GDR]), "the robot's row carries no water walk"
    assert not bool(sim.unit_water_walk.sum() > 1), "only the robot walks water"
    neutralize_barbs(sim)
    w, land = shore_pair(sim)
    clear_tile(sim, w)
    clear_tile(sim, land)
    sim.civ_techs[0, 0, :] = False          # no SAILING, SHIPBUILDING or CARTOGRAPHY
    sim._gen_ver += 1
    u = place_mil(sim, 0, land, GDR)
    # the pool the engine GRANTS such a chassis, on land and at sea alike
    want = sim._mp_scale * float(sim._type_moves[GDR])
    assert abs(float(sim._full_mp("major")[0, u]) - want) < 1e-6, (
        "the robot's granted pool is its own roster figure")
    sim.major_unit_mp_full[0, u] = want
    sim.major_unit_mp[0, u] = want
    d = dir_to(sim, land, w)
    assert d >= 0
    rw = rank_of(sim, u)
    assert bool(sim._seat_unit_mask(0)[0, rw, d]), "water is ground to this chassis"
    mp0 = float(sim.major_unit_mp[0, u])
    sim._apply_seat_unit_actions(0, order(sim, u, d))
    assert int(sim.major_unit_tile[0, u]) == w, "the robot refused the sea"
    assert not bool(sim.major_unit_emb[0, u]), "it never embarks"
    assert abs(float(sim.major_unit_mp[0, u]) - (mp0 - sim._mp_scale)) < 1e-6, (
        "one plain point for the step, exactly as on land")
    assert abs(float(sim._full_mp("major")[0, u]) - want) < 1e-6, (
        "and it keeps its OWN pool out there, not an embarked one")
    # the OCEAN asks it for no Cartography either
    sim.ocean_tile[0, w] = True
    back = dir_to(sim, w, land)
    sim.major_unit_tile[0, u] = land
    sim.military_at[0, w] = -1
    sim.military_at[0, land] = u + sim.POOL_LO["major"]
    sim._gen_ver += 1
    assert bool(sim._seat_unit_mask(0)[0, rank_of(sim, u), d]), (
        "no seafaring tech gates a chassis water is ground to")
    assert back >= 0
    print("  17 water walk OK (no embark, no tech, its own pool, Coast and Ocean alike)")


def poke_passenger_death(rules, path, WARRIOR, BUILDER):
    """15. A dead or captured PASSENGER must leave its own plane. Every kill and
    capture is slot-keyed (`_occ_clear` / `_occ_set`), so a body that cleared
    the class it GUESSED left the tile occupied by a corpse <EM> which a city then
    struck again, turn after turn."""
    sim = build(rules, path)
    _lone_war(sim)
    ctr = int(sim.city_center[0, 0, 0])

    # -- the CITY STRIKE kills a lone embarked civilian.
    tt = -1
    for d in range(6):
        t = int(sim.neigh[ctr, d])
        if t >= 0 and t != ctr:
            tt = t
            break
    assert tt >= 0
    force_water(sim, tt)
    clear_tile(sim, tt)
    slot = place_civilian(sim, 1, tt, BUILDER, hp=1, emb=True)
    assert int(sim.embarked_at[0, tt]) == slot + sim.POOL_LO["major"], "the fixture put it on the wrong plane"
    sim.city_bldg[0, 0, 0, sim._walls_bidx] = True
    sim.city_outer_hp[0, 0, 0] = sim._walls_hp
    sim._seat_city_fire_and_heal(0, torch.zeros(sim.B, dtype=torch.long), sim.city_alive[:, 0, 0])
    assert not bool(sim.major_unit_alive[0, slot]), "the city strike did not kill the passenger"
    assert int(sim.embarked_at[0, tt]) < 0, "a dead passenger still holds its tile"

    # -- and a CAPTURE re-files the captive on the plane its class names.
    sim2 = build(rules, path)
    _lone_war(sim2)
    ctr2 = int(sim2.city_center[0, 0, 0])
    land = empty_neighbor(sim2, ctr2)
    assert land >= 0
    clear_tile(sim2, land)
    w = place_mil(sim2, 0, land, WARRIOR)
    bt = free_neighbor(sim2, land, ctr2)
    assert bt >= 0
    force_water(sim2, bt)
    clear_tile(sim2, bt)
    cap0 = place_civilian(sim2, 1, bt, BUILDER, emb=True)
    old_next = int(sim2.unit_next[0])
    d = dir_to(sim2, land, bt)
    assert d >= 0
    sim2._apply_seat_unit_actions(0, order(sim2, w, 6 + d))
    assert not bool(sim2.major_unit_alive[0, cap0]), "the captured builder must despawn"
    assert bool(sim2.major_unit_emb[0, old_next]), "the captive keeps embarked"
    assert int(sim2.embarked_at[0, bt]) == old_next + sim2.POOL_LO["major"], \
        "the captive must occupy the PASSENGER plane, not the civilian one"
    assert int(sim2.civilian_at[0, bt]) < 0, "the capture left the captive on the civilian plane"
    print("  15 passenger death/capture OK (both leave and re-enter the passenger plane)")

def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"naval_test on {path.name}")
    GALLEY = idx(rules, "GALLEY")
    QUAD = idx(rules, "QUADRIREME")
    WARRIOR = idx(rules, "WARRIOR")
    BUILDER = idx(rules, "BUILDER")
    ARCHER = idx(rules, "ARCHER")
    PRIVATEER = idx(rules, "PRIVATEER")
    SUBMARINE = idx(rules, "SUBMARINE")
    DESTROYER = idx(rules, "DESTROYER")
    FRIGATE = idx(rules, "FRIGATE")
    SCOUT = idx(rules, "SCOUT")
    assert bool(load_rules().units), "no unit catalog"

    poke_galley_city(rules, path, GALLEY)
    poke_galley_cs(rules, path, GALLEY)
    poke_quadrireme_unit(rules, path, QUAD, WARRIOR)
    poke_quadrireme_city(rules, path, QUAD)
    poke_seat0_naval(rules, path, GALLEY, WARRIOR)
    poke_ocean_gate(rules, path, GALLEY)
    poke_walls_seat0(rules, path, GALLEY, WARRIOR)
    poke_walls_civ(rules, path, GALLEY, WARRIOR)
    poke_embarked_capture(rules, path, WARRIOR, BUILDER)
    poke_flank_support(rules, path, GALLEY)
    poke_amphibious(rules, path, WARRIOR, ARCHER)
    poke_embarked_support(rules, path, WARRIOR, GALLEY)
    poke_stealth(rules, path, PRIVATEER, FRIGATE, DESTROYER, SCOUT)
    poke_raider_zoc(rules, path, PRIVATEER, SUBMARINE, FRIGATE)
    poke_submarine_siege(rules, path, FRIGATE, SUBMARINE)
    poke_passenger_death(rules, path, WARRIOR, BUILDER)
    poke_canal(rules, path, GALLEY, WARRIOR)
    poke_water_walk(rules, path, idx(rules, "GIANT_DEATH_ROBOT"))
    print("NAVAL POKES OK")


if __name__ == "__main__":
    main()
