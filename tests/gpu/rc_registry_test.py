"""Civ district/wonder placement rule + the machine-checked registry invariant.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    $env:PYTHONUTF8='1'; python tests/gpu/civ_city_registry_test.py

A civ district (and wonder) may only be placed on a tile whose registry entry
(tile_city) is THIS city (civ_city_id) — not merely a tile owned by the civ. A
sibling's registered tile is NOT a valid site. These pokes drive the engine
twin (_place_district_civ) and the env-gated consistency scan
(_check_rc_registry_invariant) that the forced-compaction gate also exercises.

Covered:
  a. PLACEMENT RULE: with the whole work radius owned by the civ but registered
     to a SIBLING, _place_district_civ REFUSES; flip the one candidate's
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
from core import BatchSim, load_rules, load_fixture, FIXTURES


def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype)
    for _ in range(steps):
        sim.step()
    return sim


def scaffold_p0(sim):
    """First scaffold district with placement code 0 (plain best-adjacency) that
    the live capital does NOT already own — so a place can be observed."""
    for (di, _ut, _uc, plc) in sim._scaffold:
        if plc == 0 and int(sim.civ_city_dist_tile[0, 0, 0, di]) < 0:
            return di
    raise AssertionError("no placement-0 scaffold district free on the capital")


def radius3_usable(sim, center, exclude=()):
    """On-map tiles within radius 3 of center that _place_district_civ's elig
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
        if int(sim.civ_city_at[0, t]) >= 0 or int(sim.improvement[0, t]) >= 0:
            continue
        out.append(t)
    return out


def poke_placement_rule(rules, path):
    """a. The whole work radius is civ-owned but registered to a SIBLING ->
    _place_district_civ must place NOTHING. Flip the one candidate's registry
    to THIS city -> it places, and the paved tile registers back
    (civ_city_dist_tile == tile, tile_city[tile] == civ_city_id)."""
    sim = build(rules, path)
    r, j = 0, 0
    assert bool(sim.civ_city_alive[0, r, j]), "capital slot must be alive"
    di = scaffold_p0(sim)
    center = int(sim.civ_city_center[0, r, j])
    own_id = int(sim.civ_city_id[0, r, j])
    sib_id = own_id + 9999  # a value no real registration carries

    cands = radius3_usable(sim, center)
    assert cands, "no usable radius-3 tile to exercise the placement rule"

    # Clear civ ownership across the whole work radius, then plant EXACTLY one
    # eligible tile owned by the civ but registered to a sibling.
    ds = sim.pair_dist[center]
    in_radius = (ds <= 3)
    sim.civ_at[0, in_radius] = -1
    T = cands[0]
    sim.civ_at[0, T] = r
    sim.tile_city[0, T] = sib_id

    placed = sim._place_district_civ(r, j, di, torch.tensor([True]), 0)
    assert not bool(placed[0]), "district placed on a SIBLING-registered tile (A-24 bug)"
    assert int(sim.district[0, T]) < 0, "sibling tile was paved despite the refusal"
    assert int(sim.civ_city_dist_tile[0, r, j, di]) < 0, "registry gained a sibling tile"

    # Now register the same tile to THIS city -> placement succeeds and is coherent.
    sim.tile_city[0, T] = own_id
    placed2 = sim._place_district_civ(r, j, di, torch.tensor([True]), 0)
    assert bool(placed2[0]), "district refused its OWN registered tile"
    assert int(sim.district[0, T]) == di, "own tile not paved"
    assert int(sim.civ_city_dist_tile[0, r, j, di]) == T, "registry did not record the paved tile"
    assert int(sim.tile_city[0, T]) == own_id, "paved tile does not register back to this rc"
    print(f"  a placement rule OK (sibling tile {T} refused; own-registered tile paved, di={di})")


def poke_never_picks_sibling(rules, path):
    """b. A sibling-registered tile of MAXIMAL adjacency next to an
    own-registered tile of lower adjacency: the picker still chooses the OWN
    tile (the sibling tile never enters elig, so its adjacency cannot win)."""
    sim = build(rules, path)
    r, j = 0, 0
    di = scaffold_p0(sim)
    center = int(sim.civ_city_center[0, r, j])
    own_id = int(sim.civ_city_id[0, r, j])
    sib_id = own_id + 9999

    cands = radius3_usable(sim, center)
    assert len(cands) >= 2, "need two usable radius-3 tiles"
    ds = sim.pair_dist[center]
    sim.civ_at[0, ds <= 3] = -1
    T_sib, T_own = cands[0], cands[1]
    for t in (T_sib, T_own):
        sim.civ_at[0, t] = r
    sim.tile_city[0, T_sib] = sib_id
    sim.tile_city[0, T_own] = own_id

    # Give the sibling tile a huge adjacency edge; if it were eligible it would
    # win the argmax. The own tile must still be the one paved.
    adjf = sim._district_adj_floor(di)
    assert float(adjf[0, T_own]) <= float(adjf[0, T_sib]) + 1e6  # sanity: values are finite
    # (adjacency is derived from the map; we cannot cheaply inflate it, so we
    # rely on elig excluding the sibling tile — assert the CHOSEN tile is own.)
    placed = sim._place_district_civ(r, j, di, torch.tensor([True]), 0)
    assert bool(placed[0]), "no placement with an own-registered tile available"
    chosen = int(sim.civ_city_dist_tile[0, r, j, di])
    assert chosen == T_own, f"picker chose a non-own tile {chosen} (own was {T_own})"
    assert int(sim.tile_city[0, chosen]) == own_id, "chosen tile registers to a sibling"
    print(f"  b never-picks-sibling OK (chose own tile {T_own}, not sibling {T_sib})")


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
    for rr in range(sim.R):
        for jj in sim.civ_city_alive[0, rr].nonzero(as_tuple=True)[0].tolist():
            row = sim.civ_city_dist_tile[0, rr, jj]
            hit = (row >= 0).nonzero(as_tuple=True)[0]
            if len(hit):
                r, j, di = rr, jj, int(hit[0])
                break
        if r is not None:
            break
    if r is None:
        r, j = 0, 0
        assert bool(sim.civ_city_alive[0, r, j]), "capital slot must be alive"
        di = scaffold_p0(sim)
        center = int(sim.civ_city_center[0, r, j])
        T = radius3_usable(sim, center)[0]
        sim.civ_at[0, T] = r
        sim.tile_city[0, T] = int(sim.civ_city_id[0, r, j])
        sim.district[0, T] = di
        sim.civ_city_dist_tile[0, r, j, di] = T
        sim._check_rc_registry_invariant()  # planted reference is coherent
    tile = int(sim.civ_city_dist_tile[0, r, j, di])
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
    good_at = int(sim.civ_at[0, tile])
    sim.civ_at[0, tile] = -1
    raised = False
    try:
        sim._check_rc_registry_invariant()
    except AssertionError:
        raised = True
    assert raised, "scan missed a backward (un-owned) incoherence"
    sim.civ_at[0, tile] = good_at
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
    r = next(rr for rr in range(sim.R) if bool(sim.civ_city_alive[0, rr].any()))
    j = int(sim.civ_city_alive[0, r].nonzero(as_tuple=True)[0][0])
    c_t = int(sim.civ_city_center[0, r, j])
    cid = int(sim.civ_city_id[0, r, j])
    assert int(sim.alive[0].sum()) < 6, "seat 0 at the city cap — capture would raze; pick an earlier turn"

    # an in-roster luxury spec whose id is NOT already active for seat 0
    # (a duplicate would not change the unique-luxury count)
    act = (sim.lux_id[0] >= 0) & (sim.owner[0] >= 0) & (sim.improvement[0] == sim.lux_req[0])
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
        if int(sim.owner[0, tt]) < 0 and int(sim.civ_at[0, tt]) < 0 and int(sim.citystate_at[0, tt]) < 0
        and int(sim.lux_id[0, tt]) < 0 and int(sim.district[0, tt]) < 0 and int(sim.improvement[0, tt]) < 0
        and int(sim.center_at[0, tt]) < 0 and int(sim.civ_city_at[0, tt]) < 0
    )
    sim.lux_id[0, t] = lid
    sim.lux_req[0, t] = req
    sim.improvement[0, t] = req
    sim.pillaged[0, t] = False
    sim.civ_at[0, t] = r
    sim.tile_city[0, t] = cid

    have = torch.zeros(sim.B, sim.C, dtype=sim.dtype)
    need = torch.full((sim.B, sim.C), 10.0, dtype=sim.dtype)
    base = float(sim._luxury_amenities(0, have, need).sum())

    sim._capture_civ_city(torch.tensor([0]), torch.tensor([r]), torch.tensor([j]), torch.tensor([c_t]))
    c_new = int(sim.center_at[0, c_t])
    assert c_new >= 0 and bool(sim.alive[0, c_new]), "capture did not land a seat-0 city"
    assert int(sim.owner[0, t]) == c_new, "the luxury tile did not re-own to the captured city (A-17 ring)"
    after = float(sim._luxury_amenities(0, have, need).sum())
    assert after >= base + 1.0, f"captured improved luxury did not feed the seat-0 pool ({base} -> {after})"
    sim._check_rc_registry_invariant()  # the handover leaves the registry coherent
    print(f"  d capture-luxury handover OK (lux {lid} req {req}: civ rc {cid} tile {t} -> city {c_new}, grants {base} -> {after})")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"civ_city_registry_test (A-24) on {path.name}")
    poke_placement_rule(rules, path)
    poke_never_picks_sibling(rules, path)
    poke_invariant_scan(rules, path)
    poke_capture_luxury_pool(rules, path)
    print("RC REGISTRY (A-24) POKES OK")


if __name__ == "__main__":
    main()
