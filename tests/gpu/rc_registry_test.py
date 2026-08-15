"""Civ district/wonder placement rule + the machine-checked registry invariant.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    $env:PYTHONUTF8='1'; python tests/gpu/rc_registry_test.py

A civ district (and wonder) may only be placed on a tile whose registry entry
(tile_city) is THIS city (civ_city_id) — not merely a tile owned by the civ. A
sibling's registered tile is NOT a valid site. These pokes drive the engine
twin (_place_district) and the env-gated consistency scan
(_check_rc_registry_invariant) that the forced-compaction gate also exercises.

Covered:
  a. PLACEMENT RULE: with the whole work radius owned by the civ but registered
     to a SIBLING, _place_district REFUSES; flip the one candidate's
     registry to THIS city and it places, and the paved tile registers back to
     this rc (civ_city_dist_tile <-> tile_city).
  b. NEVER PICKS A SIBLING TILE: with a sibling-registered tile of MAXIMAL
     adjacency and a lower-adjacency own-registered tile both eligible, the
     picker chooses the OWN tile (the sibling tile is invisible to elig).
  c. INVARIANT SCAN: after a real 18-turn rollout the scan passes; a hand-forged
     sibling reference in civ_city_dist_tile makes it RAISE (forward check); a dangling
     reference into un-owned land makes it RAISE (backward check); repair passes.
  d. CAPTURE-LUXURY HANDOVER: a conquered civ city's improved luxury re-owns to
     the capturing seat-0 city through the ownership ring and feeds that seat's
     empire amenity pool (_luxury_amenities) the same turn.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype))
    for _ in range(steps):
        sim.step()
    return sim


def scaffold_p0(sim):
    """First scaffold district with placement code 0 (plain best-adjacency) that
    the live capital does NOT already own — so a place can be observed."""
    for (di, _ut, _uc, plc) in sim._scaffold:
        if plc == 0 and int(sim.city_dist_tile[0, 1, 0, di]) < 0:
            return di
    raise AssertionError("no placement-0 scaffold district free on the capital")


def radius3_usable(sim, center, exclude=()):
    """On-map tiles within radius 3 of center that _place_district's elig
    would accept BUT for ownership: d_usable, empty (district/wonder/civ centre/
    improvement all clear), not the center."""
    ds = sim.pair_dist[center]
    out = []
    for t in range(sim.T):
        if t == center or t in exclude:
            continue
        if int(ds[t]) < 1 or int(ds[t]) > 3:
            continue
        if not bool(sim.d_usable[0, t]):
            continue
        if int(sim.district[0, t]) >= 0 or int(sim.built_wonder[0, t]) >= 0:
            continue
        if int(sim.centre_slot_at[0, t]) >= 0 or int(sim.improvement[0, t]) >= 0:
            continue
        out.append(t)
    return out


def poke_placement_rule(rules, path):
    """a. The whole work radius is civ-owned but registered to a SIBLING ->
    _place_district must place NOTHING. Flip the one candidate's registry
    to THIS city -> it places, and the paved tile registers back
    (civ_city_dist_tile == tile, tile_city[tile] == civ_city_id)."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.city_alive[0, r + 1, j]), "capital slot must be alive"
    di = scaffold_p0(sim)
    center = int(sim.city_center[0, r + 1, j])
    own_id = int(sim.city_id[0, r + 1, j])
    sib_id = own_id + 9999  # a value no real registration carries

    cands = radius3_usable(sim, center)
    assert cands, "no usable radius-3 tile to exercise the placement rule"

    # Clear civ ownership across the whole work radius, then plant EXACTLY one
    # eligible tile owned by the civ but registered to a sibling.
    ds = sim.pair_dist[center]
    in_radius = (ds <= 3)
    sim.tile_seat[0, in_radius] = -1
    sim._tile_owner_ver += 1
    T = cands[0]
    sim.tile_seat[0, T] = r + 1
    sim.tile_city[0, T] = sib_id

    placed = sim._place_district(r + 1, j, di, torch.tensor([True]), 0, torch.tensor([T]))
    assert not bool(placed[0]), "district placed on a SIBLING-registered tile"
    assert int(sim.district[0, T]) < 0, "sibling tile was paved despite the refusal"
    assert int(sim.city_dist_tile[0, r + 1, j, di]) < 0, "registry gained a sibling tile"

    # Now register the same tile to THIS city -> placement succeeds and is coherent.
    sim.tile_city[0, T] = own_id
    placed2 = sim._place_district(r + 1, j, di, torch.tensor([True]), 0, torch.tensor([T]))
    assert bool(placed2[0]), "district refused its OWN registered tile"
    assert int(sim.district[0, T]) == di, "own tile not paved"
    assert int(sim.city_dist_tile[0, r + 1, j, di]) == T, "registry did not record the paved tile"
    assert int(sim.tile_city[0, T]) == own_id, "paved tile does not register back to this rc"
    print(f"  a placement rule OK (sibling tile {T} refused; own-registered tile paved, di={di})")


def poke_never_picks_sibling(rules, path):
    """b. A sibling-registered tile beside an own-registered one: the sibling
    never enters ELIG, so no adjacency it carries can win it — and naming it on
    the wire is refused outright."""
    sim = build(rules, path)
    r, j = 0, 0
    di = scaffold_p0(sim)
    center = int(sim.city_center[0, r + 1, j])
    own_id = int(sim.city_id[0, r + 1, j])
    sib_id = own_id + 9999

    cands = radius3_usable(sim, center)
    assert len(cands) >= 2, "need two usable radius-3 tiles"
    ds = sim.pair_dist[center]
    sim.tile_seat[0, ds <= 3] = -1
    sim._tile_owner_ver += 1
    T_sib, T_own = cands[0], cands[1]
    for t in (T_sib, T_own):
        sim.tile_seat[0, t] = r + 1
    sim.tile_city[0, T_sib] = sib_id
    sim.tile_city[0, T_own] = own_id

    elig = sim._district_elig(r + 1, j, di, 0)[0]
    assert not bool(elig[T_sib]), "a sibling-registered tile is ELIGIBLE — adjacency could win it"
    assert bool(elig[T_own]), "the own-registered tile must be eligible"
    refused = sim._place_district(r + 1, j, di, torch.tensor([True]), 0, torch.tensor([T_sib]))
    assert not bool(refused[0]), "the wire named a sibling tile and the engine took it"
    placed = sim._place_district(r + 1, j, di, torch.tensor([True]), 0, torch.tensor([T_own]))
    assert bool(placed[0]), "the engine refused its OWN registered tile"
    chosen = int(sim.city_dist_tile[0, r + 1, j, di])
    assert chosen == T_own, f"registry recorded {chosen}, not the named tile {T_own}"
    assert int(sim.tile_city[0, chosen]) == own_id, "chosen tile registers to a sibling"
    print(f"  b never-picks-sibling OK (sibling {T_sib} ineligible and refused; own {T_own} paved)")


def poke_invariant_scan(rules, path):
    """c. _check_rc_registry_invariant: passes on a real rollout; RAISES on a
    forged sibling reference (forward) and on a dangling un-owned reference
    (backward); passes again after repair."""
    sim = build(rules, path)
    sim._civ_city_reg_check = True
    # positive: a real trajectory is coherent
    sim._check_rc_registry_invariant()

    # find a live rc with a district reference to corrupt; if the young game has
    # none yet, plant ONE coherent reference (own-registered) and confirm the
    # scan still passes before corrupting it.
    r = j = di = None
    for rr in range(1, sim.n_majors):
        for jj in sim.city_alive[0, rr].nonzero(as_tuple=True)[0].tolist():
            row = sim.city_dist_tile[0, rr, jj]
            hit = (row >= 0).nonzero(as_tuple=True)[0]
            if len(hit):
                r, j, di = rr, jj, int(hit[0])
                break
        if r is not None:
            break
    if r is None:
        r, j = 0, 0
        assert bool(sim.city_alive[0, r + 1, j]), "capital slot must be alive"
        di = scaffold_p0(sim)
        center = int(sim.city_center[0, r + 1, j])
        T = radius3_usable(sim, center)[0]
        sim.tile_seat[0, T] = r + 1
        sim.tile_city[0, T] = int(sim.city_id[0, r + 1, j])
        sim.district[0, T] = di
        sim.city_dist_tile[0, r + 1, j, di] = T
        sim._check_rc_registry_invariant()  # planted reference is coherent
    tile = int(sim.city_dist_tile[0, r + 1, j, di])
    good_id = int(sim.tile_city[0, tile])

    # forward violation: the tile now registers to a sibling
    sim.tile_city[0, tile] = good_id + 9999
    raised = False
    try:
        sim._check_rc_registry_invariant()
    except AssertionError:
        raised = True
    assert raised, "scan missed a forward (sibling-registered) incoherence"
    sim.tile_city[0, tile] = good_id
    sim._check_rc_registry_invariant()  # repaired

    # backward violation: the tile is no longer owned by any civ
    good_at = (int(sim.tile_seat[0, tile]) - 1)
    sim.tile_seat[0, tile] = -1
    raised = False
    try:
        sim._check_rc_registry_invariant()
    except AssertionError:
        raised = True
    assert raised, "scan missed a backward (un-owned) incoherence"
    sim.tile_seat[0, tile] = good_at + 1
    sim._check_rc_registry_invariant()  # repaired
    print(f"  c invariant scan OK (positive pass; forward+backward raise; repair passes; rc {r},{j} di {di})")


def poke_capture_luxury_pool(rules, path):
    """d. Capture a civ city holding an IMPROVED in-roster luxury on a tile
    registered to it; the tile must re-own to the new seat-0 city (ownership
    ring -> owner plane) and the luxury must join that seat's empire amenity
    pool. The out-of-roster class (lux_req -9: PEARLS/WHALES, whose
    FISHING_BOATS improvement is absent from the GPU catalog) is inert in BOTH
    engines, so the poke picks an in-roster spec."""
    sim = build(rules, path)
    r = next(rr for rr in range(sim.n_majors - 1) if bool(sim.city_alive[0, rr + 1].any()))
    j = int(sim.city_alive[0, r + 1].nonzero(as_tuple=True)[0][0])
    c_t = int(sim.city_center[0, r + 1, j])
    cid = int(sim.city_id[0, r + 1, j])
    assert int(sim.city_alive[0, 0].sum()) < 6, "seat 0 at the city cap — capture would raze; pick an earlier turn"

    # an in-roster luxury spec whose id is NOT already active for seat 0
    # (a duplicate would not change the unique-luxury count)
    act = (sim.lux_id[0] >= 0) & (sim.tile_seat[0] == 0) & (sim.improvement[0] == sim.lux_req[0])
    active_ids = set(sim.lux_id[0][act].tolist())
    src = next(
        (t for t in range(sim.T) if int(sim.lux_id[0, t]) >= 0 and int(sim.lux_req[0, t]) >= 0
         and int(sim.lux_id[0, t]) not in active_ids),
        -1,
    )
    assert src >= 0, "no in-roster luxury id free of seat-0 activation on this map"
    lid, req = int(sim.lux_id[0, src]), int(sim.lux_req[0, src])

    # plant it IMPROVED on a free tile registered to the civ city
    t = next(
        tt for tt in range(sim.T)
        if int(sim.tile_seat[0, tt]) < 0
        and int(sim.lux_id[0, tt]) < 0 and int(sim.district[0, tt]) < 0 and int(sim.improvement[0, tt]) < 0
        and int(sim.centre_slot_at[0, tt]) < 0
    )
    sim.lux_id[0, t] = lid
    sim.lux_req[0, t] = req
    sim.improvement[0, t] = req
    sim.pillaged[0, t] = False
    sim.tile_seat[0, t] = r + 1
    sim.tile_city[0, t] = cid

    have = torch.zeros(sim.B, sim.RC, dtype=sim.dtype)
    need = torch.full((sim.B, sim.RC), 10.0, dtype=sim.dtype)
    base = float(sim._luxury_amenities(0, have, need).sum())

    sim._transfer_city(0, r + 1, j, 0, conquest=True)  # civ r is block row r+1
    c_new = int(sim.centre_slot_at[0, c_t])
    assert c_new >= 0 and bool(sim.city_alive[0, 0, c_new]), "capture did not land a seat-0 city"
    assert int(sim.city_slot_at(0)[0, t]) == c_new, "the luxury tile did not re-own to the captured city (the ring)"
    after = float(sim._luxury_amenities(0, have, need).sum())
    assert after >= base + 1.0, f"captured improved luxury did not feed the seat-0 pool ({base} -> {after})"
    sim._check_rc_registry_invariant()  # the handover leaves the registry coherent
    print(f"  d capture-luxury handover OK (lux {lid} req {req}: civ rc {cid} tile {t} -> city {c_new}, grants {base} -> {after})")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"rc_registry_test on {path.name}")
    poke_placement_rule(rules, path)
    poke_never_picks_sibling(rules, path)
    poke_invariant_scan(rules, path)
    poke_capture_luxury_pool(rules, path)
    print("RC REGISTRY POKES OK")


if __name__ == "__main__":
    main()
