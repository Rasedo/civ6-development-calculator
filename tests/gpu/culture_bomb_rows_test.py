"""THE ROSTER'S CULTURE BOMB — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/culture_bomb_rows_test.py

The TS twin is tests/cpu/seats/harvest-rows.test.ts.

CIV6 (EFFECT_ADD_CULTURE_BOMB_TRIGGER): completing a named IMPROVEMENT or
DISTRICT claims the neighbouring tiles. Both engines already bombed off a
district's completion (the Congress, the Preserve); these are the roster's
own two carriers — the Maori's Fishing Boats and the Netherlands' Harbour
(C-53). No gate lane seats either civilization, so this is the only evidence
the rows reach the bomb at all.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
ROOT = Path(__file__).resolve().parent.parent.parent
RULES = json.loads((ROOT / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]


def fresh(rules, path) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    return settle_all(sim)


def _seat_civ(sim, row: int, civ: int) -> None:
    """Seat one roster row, or clear it (`civ=-1`) for the BASELINE."""
    sim.row_civ[B0, row] = civ
    sim.row_leader[B0, row] = sim._pair_civ.index(civ) if civ >= 0 else -1
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def test_rows_reach_the_wire(rules, path) -> None:
    """One improvement carrier and one district carrier, and never both on a
    row — the two appliers branch on exactly that."""
    sim = fresh(rules, path)
    rows = sim._culture_bomb_rows
    assert len(rows) == 2, f"the roster names two culture-bomb carriers, wire has {len(rows)}"
    imp = [r for r in rows if r[2] >= 0]
    dist = [r for r in rows if r[3] >= 0]
    assert len(imp) == 1, "no improvement carrier on the wire"
    assert len(dist) == 1, "no district carrier on the wire"
    for _c, _l, _i, _d in rows:
        assert (_i >= 0) != (_d >= 0), f"row ({_c},{_l},{_i},{_d}) names both or neither"
        assert _c >= 0 or _l >= 0, "a carrier row names no civilization and no leader"
    print("  1 the wire OK — one improvement carrier, one district carrier")


def _bomb_scene(sim, row: int, civ: int):
    """The row's first city, an ADJACENT tile it does not own, and a builder
    standing on that tile with every unlock."""
    _seat_civ(sim, row, civ)
    ctr = int(sim.city_center[B0, row, 0])
    # an in-ring tile with a neighbour nobody holds, so the bomb has something
    # to claim
    for cand in (int(x) for x in sim.neigh[ctr].tolist() if x >= 0):
        free = [int(n) for n in sim.neigh[cand].tolist()
                if n >= 0 and int(sim.tile_seat[B0, n]) < 0]
        if free:
            break
    else:
        raise AssertionError("no tile beside the centre has an unowned neighbour")
    sim.tile_seat[B0, cand] = row
    sim.tile_city[B0, cand] = int(sim.city_id[B0, row, 0])
    sim.improvement[B0, cand] = -1
    sim.district[B0, cand] = -1
    sim.res_id[B0, cand] = -1
    sim.res_imp[B0, cand] = -1
    sim.civ_techs[B0, row, :] = True
    sim.civ_civics[B0, row, :] = True
    sim._tile_owner_ver += 1
    sim._eff_version += 1

    one = torch.ones(sim.B, dtype=torch.bool)
    sim._spawn_unit(row, one, torch.full((sim.B,), cand, dtype=torch.long),
                    torch.full((sim.B,), UNITS.index("BUILDER"), dtype=torch.long))
    smap = sim._seat_slot_map(row)
    sc = smap[B0].clamp(min=0)
    live = ((smap[B0] >= 0) & (sim.unit_tile[B0, sc] == cand)
            & (sim.unit_type[B0, sc] == UNITS.index("BUILDER")))
    slot = int(live.nonzero().flatten()[-1])
    sim.unit_mp[B0, int(smap[B0, slot])] = sim._mp_scale
    return cand, slot, free


def _shape_for(sim, at: int, k: int) -> None:
    """Shape the plot so improvement `k` is placeable on it. The carrier is
    FISHING_BOATS today, which the mask reaches through the RESOURCE branch
    (`res_imp == k`), so a bare water tile is not enough."""
    named = [i for i in range(int(sim._res_harvest_imp.numel()))
             if int(sim._res_harvest_imp[i]) == k]
    if sim._imp_water[k] or named:
        sim.water[B0, at] = True
        sim.wpass[B0, at] = True
        sim.tile_submerged[B0, at] = False
        sim.coastal_water[B0, at] = True
    if named:
        # the resource branch: the plot must carry a resource that names this
        # improvement, which is what a Fishing Boats plot always is
        sim.res_imp[B0, at] = k
        sim.res_id[B0, at] = named[0]
        sim.res_cat[B0, at] = 1
        sim.res_priority[B0, at] = 1
        sim.res_stripped[B0, at] = False
    sim._eff_version += 1


def test_the_improvement_bomb(rules, path) -> None:
    """The Maori's Fishing Boats: building the named improvement claims the
    neighbours. The row's own improvement is whatever the wire says, so the
    scene shapes the ground to suit it rather than assuming water."""
    sim = fresh(rules, path)
    row = 1
    imp_row = next(r for r in sim._culture_bomb_rows if r[2] >= 0)
    civ, _leader, k, _d = imp_row
    assert civ >= 0, "the improvement carrier names no civilization"
    at, slot, free = _bomb_scene(sim, row, civ)

    _shape_for(sim, at, k)
    smap = sim._seat_slot_map(row)
    col = sim._A_IMP[k]
    assert col >= 0, "the carrier improvement has no BUILD column"
    assert bool(sim._seat_unit_mask(row)[B0, slot, col]),         "the shaped plot offered no BUILD column — the scene proves nothing"
    before = [int(sim.tile_seat[B0, n]) for n in free]
    act = torch.full(smap.shape, -1, dtype=torch.long)
    act[B0, slot] = col
    sim._apply_seat_unit_actions(row, act)
    assert int(sim.improvement[B0, at]) == k, "the improvement did not complete"
    after = [int(sim.tile_seat[B0, n]) for n in free]
    assert any(a == row and b != row for a, b in zip(after, before)), \
        f"the bomb claimed nothing: {before} -> {after}"
    print("  2 the improvement bomb OK — the neighbours changed hands")


def test_a_plain_seat_does_not_bomb(rules, path) -> None:
    """The same improvement, on a seat the roster does not name, claims
    nothing — a bomb that fires for everyone is not a unique."""
    sim = fresh(rules, path)
    row = 1
    imp_row = next(r for r in sim._culture_bomb_rows if r[2] >= 0)
    _civ, _leader, k, _d = imp_row
    at, slot, free = _bomb_scene(sim, row, _civ)
    # ...and now take the civilization away
    sim.row_civ[B0, row] = -1
    sim.row_leader[B0, row] = -1
    sim._eff_version += 1
    _shape_for(sim, at, k)
    smap = sim._seat_slot_map(row)
    col = sim._A_IMP[k]
    assert bool(sim._seat_unit_mask(row)[B0, slot, col]),         "the shaped plot offered no BUILD column — the scene proves nothing"
    before = [int(sim.tile_seat[B0, n]) for n in free]
    act = torch.full(smap.shape, -1, dtype=torch.long)
    act[B0, slot] = col
    sim._apply_seat_unit_actions(row, act)
    after = [int(sim.tile_seat[B0, n]) for n in free]
    assert before == after, f"a plain seat bombed anyway: {before} -> {after}"
    print("  3 the plain seat OK — no row, no bomb")


def _district_bomb(sim, row: int, civ: int, di: int) -> tuple[list[int], list[int]]:
    """Queue district `di` on an owned tile beside the row's first city, pay
    for it, and complete it — answering the neighbours' owners before and
    after. `di` is the DISTRICT catalog index; the queue code is a
    `_scaffold` slot, which is a different number."""
    _seat_civ(sim, row, civ)
    j = 0
    ctr = int(sim.city_center[B0, row, j])
    for at in (int(x) for x in sim.neigh[ctr].tolist() if x >= 0):
        free = [int(n) for n in sim.neigh[at].tolist()
                if n >= 0 and int(sim.tile_seat[B0, n]) < 0]
        if free:
            break
    else:
        raise AssertionError("no tile beside the centre has an unowned neighbour")
    sim.tile_seat[B0, at] = row
    sim.tile_city[B0, at] = int(sim.city_id[B0, row, j])
    sim.improvement[B0, at] = -1
    sim._tile_owner_ver += 1

    # the queue code is a `_scaffold` SLOT, never the catalog index — the
    # slot's own first field is what names the district
    si = next(i for i, row_t in enumerate(sim._scaffold) if int(row_t[0]) == di)
    sim.city_current[B0, row, j, 0] = sim.DISTRICT_BASE + si
    sim.city_dist_tile[B0, row, j, di] = at
    # the queue's OWN tile plane is what the completion reads (`qt0`)
    sim.city_qtile[B0, row, j, 0] = at
    sim.district[B0, at] = di
    sim.district_complete[B0, at] = False
    sim.city_progress[B0, row, j, 0] = 0.0
    sim._eff_version += 1

    before = [int(sim.tile_seat[B0, n]) for n in free]
    # one turn with enough hammers to finish whatever it costs
    huge = torch.full((sim.B,), 1e6, dtype=sim.dtype)
    sim._seat_city_produce(row, torch.tensor([j]), torch.tensor([True]), huge)
    assert bool(sim.district_complete[B0, at]), "the district never completed"
    after = [int(sim.tile_seat[B0, n]) for n in free]
    return before, after


def test_the_district_bomb(rules, path) -> None:
    """The Netherlands' Harbour: the roster's DISTRICT carrier, beside the
    Congress's bomb and the Preserve's unowned-only one."""
    sim = fresh(rules, path)
    row = 1
    civ, _leader, _i, di = next(r for r in sim._culture_bomb_rows if r[3] >= 0)
    assert civ >= 0, "the district carrier names no civilization"
    before, after = _district_bomb(sim, row, civ, di)
    assert any(a == row and b != row for a, b in zip(after, before)),         f"the district bomb claimed nothing: {before} -> {after}"
    print("  4 the district bomb OK — the neighbours changed hands")


def test_a_plain_seat_district_does_not_bomb(rules, path) -> None:
    """The same district on a seat the roster does not name claims nothing.
    `_seat_civ(-1)` is a seat with NO roster row, so no other rule can be
    paying for the claim either."""
    sim = fresh(rules, path)
    row = 1
    _civ, _leader, _i, di = next(r for r in sim._culture_bomb_rows if r[3] >= 0)
    before, after = _district_bomb(sim, row, -1, di)
    assert before == after, f"a plain seat bombed anyway: {before} -> {after}"
    print("  5 the plain seat OK — no row, no district bomb")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_rows_reach_the_wire(rules, path)
    test_the_improvement_bomb(rules, path)
    test_a_plain_seat_does_not_bomb(rules, path)
    test_the_district_bomb(rules, path)
    test_a_plain_seat_district_does_not_bomb(rules, path)
    print("BATTERY OK culture_bomb_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
