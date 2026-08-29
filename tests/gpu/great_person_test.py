"""A GREAT PERSON IS PLACED AND USED.

    python tests/gpu/great_person_test.py

CIV6 ("Activating Great People"): a Great Person arrives as a UNIT, walks to a
site its own ability names, and spends a charge there. Most classes activate on
their class's completed district; a General or an Admiral activates anywhere;
the three Great Work classes need a city with a free slot of their kind.

The scripted rollout claims Admirals and Merchants and little else, so nearly
every arm below is out of the gate's reach. These pokes force the state in
memory and drive `_seat_unit_mask` / `_apply_seat_unit_actions` — the entry
points `policy/drive.py` uses.

Covered here:
  1. the catalog: one chassis per class, a site code in range for every
     person, at least one charge, and a dense row whose width is the fx names
     plus the two permanent runs.
  2. the site predicate, arm by arm: all six codes, each poked onto ground
     that satisfies it and ground that does not.
  3. the mask column: ACTIVATE_GP is offered exactly where `_gp_site_ok`
     says, and never to a charge-less person.
  4. the spend: the science lump lands, the charge goes, the person leaves,
     and `civ_gp_used` counts it.
  5. the permanent runs: a `perm` column reaches `_gp_perm`, a `cityPerm`
     column reaches the city the charge was spent in.
  6. exhaustiveness: every site code selects an arm — a legal column that
     landed in no arm would silently no-op.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

ROW = 1  # a civ row: the pokes below are seat-generic, so any row proves them


def fresh(rules, path, turns=25):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def rank_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[0]
    return int((smap == slot).nonzero(as_tuple=True)[0][0])


def mask_of(sim, row, slot):
    return sim._seat_unit_mask(row)[0, rank_of(sim, row, slot)]


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, slot)] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def make_person(sim, row, cls, at, tile):
    """Stand one of `row`'s live units up as class `cls`'s `at`-th person."""
    lo = sim.POOL_LO["major"]
    for v in range(sim.major_unit_alive.shape[1]):
        if not bool(sim.major_unit_alive[0, v]) or int(sim.major_unit_seat[0, v]) != row:
            continue
        here = int(sim.major_unit_tile[0, v])
        if int(sim.military_at[0, here]) == v + lo:
            sim.military_at[0, here] = -1
        if int(sim.civilian_at[0, here]) == v + lo:
            sim.civilian_at[0, here] = -1
        ty = int(sim._gp_class_unit[cls])
        assert ty >= 0, f"class {cls} has no chassis in this roster"
        sim.major_unit_type[0, v] = ty
        sim.major_unit_tile[0, v] = tile
        sim.major_unit_hp[0, v] = 100
        sim.major_unit_mp[0, v] = float(sim._type_moves[ty])
        sim.major_unit_charges[0, v] = int(sim._gp_charges[cls, at])
        sim.major_unit_gp_at[0, v] = at
        sim.civilian_at[0, tile] = v + lo
        sim._gen_ver += 1
        return v
    raise AssertionError(f"row {row} holds no live unit to stand up")


def site_ok(sim, row, slot):
    sc = torch.tensor([[slot]], dtype=torch.long)
    tc = sim.unit_tile.gather(1, sc)
    return bool(sim._gp_site_ok(row, sc, tc)[0, 0])


def own_bare(sim, row, avoid=()):
    """An owned tile with no district, no city centre, no luxury."""
    for t in range(sim.T):
        if t in avoid or int(sim.tile_seat[0, t]) != row:
            continue
        if int(sim.district[0, t]) >= 0 or int(sim.centre_slot_at[0, t]) >= 0:
            continue
        if int(sim.lux_id[0, t]) >= 0 or not bool(sim.passable[0, t]):
            continue
        if int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0:
            continue
        return t
    raise AssertionError(f"row {row} owns no bare tile")


def give_district(sim, row, t, didx):
    """A completed, unpillaged district of `didx` on an owned tile."""
    sim.tile_seat[0, t] = row
    sim.district[0, t] = didx
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    sim.pillaged[0, t] = False
    sim._eff_version += 1
    sim._gen_ver += 1


# ------------------------------------------------------------------- 1 catalog
def poke_catalog(rules, path):
    sim = fresh(rules, path, turns=1)
    n_cls = int(sim._gp_class_unit.numel())
    assert n_cls > 0, "no Great Person classes in the roster"
    chassis = [int(x) for x in sim._gp_class_unit.tolist()]
    live = [u for u in chassis if u >= 0]
    assert len(set(live)) == len(live), f"two classes share one chassis: {chassis}"
    assert len(live) == n_cls, f"a class has no unit chassis: {chassis}"
    # every chassis resolves BACK to its class — the reverse map the site
    # predicate reads.
    back = sim._gp_cls_of(torch.tensor(live, dtype=torch.long))
    assert [int(x) for x in back.tolist()] == [chassis.index(u) for u in live], \
        "the chassis -> class map does not invert"
    n_sites = 6  # GP_SITES' width; the site predicate stacks exactly this many arms
    for c in range(n_cls):
        n = int(sim._gp_roster[c])
        for a in range(n):
            s = int(sim._gp_site[c, a])
            assert 0 <= s < n_sites, f"class {c} person {a} names site {s}"
            assert int(sim._gp_charges[c, a]) >= 1, f"class {c} person {a} carries no charge"
    want = len(sim._gp_fx_names) + len(sim._gp_perm_names) + len(sim._gp_city_perm_names)
    assert sim._gp_effects.shape[2] == want, \
        f"the dense row is {sim._gp_effects.shape[2]} wide, the names ask for {want}"
    assert sim._GP_PERM0 == len(sim._gp_fx_names)
    assert sim._GP_CPERM0 == sim._GP_PERM0 + len(sim._gp_perm_names)
    print(f"  1 catalog OK — {n_cls} classes, {sim._gp_effects.shape[1]} deep, row {want} wide")


# ------------------------------------------------------------- 2 the six arms
def poke_sites(rules, path):
    sim = fresh(rules, path)
    cls = 0
    at = 0
    bare = own_bare(sim, ROW)
    v = make_person(sim, ROW, cls, at, bare)

    # 0 — the class's own completed district
    sim._gp_site[cls, at] = 0
    didx = max(0, int(sim._gp_class_district[cls]))
    sim._gp_site_district[cls, at] = didx
    assert not site_ok(sim, ROW, v), "bare ground satisfied the district site"
    give_district(sim, ROW, bare, didx)
    assert site_ok(sim, ROW, v), "a completed own district refused the district site"
    sim.district_complete[0, bare] = False
    assert not site_ok(sim, ROW, v), "an UNFINISHED district satisfied the district site"
    sim.district_complete[0, bare] = True
    sim.district_pillaged[0, bare] = True
    assert not site_ok(sim, ROW, v), "a PILLAGED district satisfied the district site"
    sim.pillaged[0, bare] = False

    # 1 — anywhere
    sim._gp_site[cls, at] = 1
    sim.district[0, bare] = -1
    sim._eff_version += 1
    assert site_ok(sim, ROW, v), "the anywhere site refused bare ground"

    # 3 — inside a minor's territory
    sim._gp_site[cls, at] = 3
    assert not site_ok(sim, ROW, v), "own ground satisfied the city-state site"
    sim.tile_seat[0, bare] = 100
    sim._eff_version += 1
    assert site_ok(sim, ROW, v), "a minor's tile refused the city-state site"
    sim.tile_seat[0, bare] = ROW
    sim._eff_version += 1

    # 4 — an owned tile carrying a luxury
    sim._gp_site[cls, at] = 4
    assert not site_ok(sim, ROW, v), "a luxury-less tile satisfied the luxury site"
    lux = int((sim.lux_id[0] >= 0).long().argmax()) if bool((sim.lux_id[0] >= 0).any()) else -1
    assert lux >= 0, "the map carries no luxury at all"
    sim.lux_id[0, bare] = sim.lux_id[0, lux]
    sim._eff_version += 1
    assert site_ok(sim, ROW, v), "an owned luxury tile refused the luxury site"
    sim.lux_id[0, bare] = -1
    sim._eff_version += 1

    # 5 — unclaimed ground next to this seat's territory
    sim._gp_site[cls, at] = 5
    assert not site_ok(sim, ROW, v), "OWN ground satisfied the adjacent-unclaimed site"
    sim.tile_seat[0, bare] = -1
    sim._eff_version += 1
    nb = [int(x) for x in sim.neigh[bare].tolist() if int(x) >= 0]
    assert any(int(sim.tile_seat[0, n]) == ROW for n in nb), \
        "the poked tile has no own neighbour to be adjacent to"
    assert site_ok(sim, ROW, v), "unclaimed ground beside own land refused the adjacent site"
    for n in nb:
        sim.tile_seat[0, n] = -1
    sim._eff_version += 1
    assert not site_ok(sim, ROW, v), "unclaimed ground with NO own neighbour satisfied it"
    print("  2 sites OK — district / anywhere / city-state / luxury / adjacent arms")


def poke_gw_site(rules, path):
    """2b — the Great Work arm needs a free slot of the class's own kind."""
    sim = fresh(rules, path)
    kind = next((k for k, c in enumerate(sim._gw_cls) if c >= 0), -1)
    assert kind >= 0, "no Great Work class in the roster"
    cls = sim._gw_cls[kind]
    at = 0
    ctr = int(sim.city_center[0, ROW, 0])
    assert ctr >= 0, "row has no city"
    v = make_person(sim, ROW, cls, at, ctr)
    sim._gp_site[cls, at] = 2
    used = (sim.city_gw_writing, sim.city_gw_art, sim.city_gw_music)[kind]
    bcol = sim._gw_bidx[kind]
    assert bcol >= 0, f"kind {kind} has no slot building in this roster"
    sim.city_bldg[0, ROW, 0, bcol] = True
    sim._eff_version += 1
    cap = int(sim._gw_capacity(ROW, kind)[0, 0])
    assert cap > 0, f"the slot building left kind {kind} at capacity {cap}"
    used[0, ROW, 0] = 0
    sim._eff_version += 1
    assert site_ok(sim, ROW, v), "a city with a free slot refused the Great Work site"
    used[0, ROW, 0] = cap
    sim._eff_version += 1
    assert not site_ok(sim, ROW, v), "a FULL city satisfied the Great Work site"
    print(f"  2b great-work site OK — class {cls}, kind {kind}, capacity {cap}")


# ------------------------------------------------------------- 3 the mask column
def poke_mask(rules, path):
    sim = fresh(rules, path)
    assert sim._A_GP >= 0, "the action enum carries no ACTIVATE_GP column"
    cls, at = 0, 0
    bare = own_bare(sim, ROW)
    v = make_person(sim, ROW, cls, at, bare)
    sim._gp_site[cls, at] = 1  # anywhere
    assert bool(mask_of(sim, ROW, v)[sim._A_GP]), "the mask withheld a legal spend"
    sim.major_unit_charges[0, v] = 0
    sim._gen_ver += 1
    assert not bool(mask_of(sim, ROW, v)[sim._A_GP]), "a spent person was still offered the column"
    sim.major_unit_charges[0, v] = 1
    sim.major_unit_gp_at[0, v] = -1
    sim._gen_ver += 1
    assert not bool(mask_of(sim, ROW, v)[sim._A_GP]), "a unit with no queue position was offered it"
    print("  3 mask OK — offered exactly where the site predicate holds")


# ------------------------------------------------------------------ 4 the spend
def poke_spend(rules, path):
    sim = fresh(rules, path)
    cls, at = 0, 0
    k = sim._GPFX.get("science", -1)
    assert k >= 0, "the fx row names no science column"
    sim._gp_site[cls, at] = 1
    sim._gp_charges[cls, at] = 1
    sim._gp_effects[cls, at, :] = 0
    sim._gp_effects[cls, at, k] = 250
    sim._gp_any_fx = True
    bare = own_bare(sim, ROW)
    v = make_person(sim, ROW, cls, at, bare)
    sci0 = float(sim.civ_tech_prog[0, ROW])
    used0 = int(sim.civ_gp_used[0, ROW])
    order(sim, ROW, v, sim._A_GP)
    assert float(sim.civ_tech_prog[0, ROW]) == sci0 + 250, \
        f"the science lump did not land ({sci0} -> {float(sim.civ_tech_prog[0, ROW])})"
    assert int(sim.civ_gp_used[0, ROW]) == used0 + 1, "the spend was not counted"
    assert not bool(sim.major_unit_alive[0, v]), "a one-charge person survived its own spend"
    print("  4 spend OK — lump paid, charge spent, person gone, count kept")


# --------------------------------------------------------- 5 the permanent runs
def poke_perm(rules, path):
    sim = fresh(rules, path)
    cls, at = 0, 0
    assert sim._gp_perm_names, "no permanent per-seat channels exported"
    assert sim._gp_city_perm_names, "no permanent per-city channels exported"
    pname = sim._gp_perm_names[0]
    cname = sim._gp_city_perm_names[0]
    sim._gp_site[cls, at] = 1
    sim._gp_charges[cls, at] = 1
    sim._gp_effects[cls, at, :] = 0
    sim._gp_effects[cls, at, sim._GP_PERM0] = 7
    sim._gp_effects[cls, at, sim._GP_CPERM0] = 3
    sim._gp_any_fx = True
    ctr = int(sim.city_center[0, ROW, 0])
    assert ctr >= 0, "row has no city to spend in"
    v = make_person(sim, ROW, cls, at, ctr)
    p0 = float(sim._gp_perm(ROW, pname)[0])
    c0 = float(sim._gp_city_perm(ROW, cname)[0, 0])
    order(sim, ROW, v, sim._A_GP)
    assert float(sim._gp_perm(ROW, pname)[0]) == p0 + 7, f"{pname} did not take the permanent add"
    assert float(sim._gp_city_perm(ROW, cname)[0, 0]) == c0 + 3, \
        f"{cname} did not reach the city the charge was spent in"
    print(f"  5 permanent runs OK — {pname} +7 on the seat, {cname} +3 on the city")


# ------------------------------------------------------------ 6 exhaustive arms
def poke_arms(rules, path):
    """Every site code selects an arm. A code outside the stack would gather
    the clamped last arm instead of no-oping, which is why the range is
    asserted here rather than trusted."""
    sim = fresh(rules, path)
    cls, at = 0, 0
    bare = own_bare(sim, ROW)
    v = make_person(sim, ROW, cls, at, bare)
    seen = set()
    for s in range(6):
        sim._gp_site[cls, at] = s
        sim._gp_site_district[cls, at] = max(0, int(sim._gp_class_district[cls]))
        seen.add(site_ok(sim, ROW, v))
    assert seen == {True, False}, \
        "the six site codes all answered the same way — the arms are not being selected"
    print("  6 arms OK — the site code selects, it does not fall through")


# ------------------------------------------ 8 the grant onto a half-built one
def poke_grant_drops_queue(rules, path):
    """CIV6 (Isaac Newton): "Instantly builds a Library and University in this
    city" — which can be the very building the city is producing. No city holds
    two of one building, so the granted one comes off the production slot and
    the hammers already spent BANK. `dropQueuedBuilding` is the TS twin."""
    sim = fresh(rules, path)
    cls, at = 0, 0
    sim._gp_site[cls, at] = 1
    sim._gp_charges[cls, at] = 1
    sim._gp_effects[cls, at, :] = 0
    sim._gp_any_fx = True
    bidx = 0
    # the seat's first live city, producing building 0 with hammers on it
    col = int(sim.city_alive[bidx, ROW].long().argmax())
    assert bool(sim.city_alive[bidx, ROW, col]), "the row holds no live city"
    sim._gp_bldg[cls, at, :] = False
    sim._gp_bldg[cls, at, 0] = True
    sim.city_bldg[bidx, ROW, col, 0] = False
    sim.city_current[bidx, ROW, col] = 0
    sim.city_progress[bidx, ROW, col] = 37.0
    sim.city_cost[bidx, ROW, col] = 200.0
    sim.city_prod_bank[bidx, ROW, col] = 5.0
    ctr = int(sim.city_center[bidx, ROW, col])
    v = make_person(sim, ROW, cls, at, ctr)
    order(sim, ROW, v, sim._A_GP)
    assert bool(sim.city_bldg[bidx, ROW, col, 0]), "the grant did not land"
    assert int(sim.city_current[bidx, ROW, col]) == -1,         "the granted building stayed on the production slot"
    assert float(sim.city_prod_bank[bidx, ROW, col]) == 42.0,         f"the hammers burned instead of banking ({float(sim.city_prod_bank[bidx, ROW, col])})"
    assert float(sim.city_progress[bidx, ROW, col]) == 0.0, "the slot kept its progress"
    print("  8 grant drops the queue OK — slot cleared, 37 hammers banked onto the 5 already there")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"great_person_test on {p.name}")
    poke_catalog(rules, p)
    poke_sites(rules, p)
    poke_gw_site(rules, p)
    poke_mask(rules, p)
    poke_spend(rules, p)
    poke_perm(rules, p)
    poke_arms(rules, p)
    poke_grant_drops_queue(rules, p)
    print("GREAT_PERSON POKES OK")


if __name__ == "__main__":
    main()
