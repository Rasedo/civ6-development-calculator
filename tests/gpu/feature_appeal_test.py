"""A SEAT'S OWN READING OF AN ADJACENT FEATURE — the GPU half (C-50).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/feature_appeal_test.py

The TS twin is tests/cpu/city/feature-appeal.test.ts.

CIV6 (Amazon, TRAIT_AMAZON_RAINFOREST_EXTRA_APPEAL): "Rainforest tiles provide
+1 Appeal to adjacent tiles, instead of the usual -1." The install writes it as
EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER on FEATURE_JUNGLE with Amount 2 — exactly
the swing from -1 to +1.

The term rides `_gp_appeal_plane`, which is already keyed by the tile's OWNER
and already threaded through every appeal consumer, so no per-row appeal cache
is needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
ROW = 0


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def _seat(sim, row: int, civ) -> None:
    if civ is None:
        sim.row_civ[B0, row] = -1
        sim.row_leader[B0, row] = -1
    else:
        ci = sim._civ_ids.index(civ)
        sim.row_civ[B0, row] = ci
        sim.row_leader[B0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1


def _owned_tile(sim, row: int) -> int:
    """A tile this row owns whose owning city is live — the plane pays only
    those, exactly as the TS resolver returns 0 for an unowned tile."""
    slot = sim.city_slot_at(row)
    live = (sim.tile_seat[B0] == row) & (slot[B0] >= 0)
    t = live.nonzero().flatten()
    assert t.numel(), "this row owns no tile with a live city"
    return int(t[0])


def _paint(sim, tile: int, n: int, fi: int) -> None:
    """Give `tile` exactly `n` neighbours carrying feature `fi`."""
    nb = [int(x) for x in sim.neigh[tile].tolist() if x >= 0]
    for i, t in enumerate(nb):
        sim.feat_id[B0, t] = fi if i < n else -1
    sim._eff_version += 1


def test_the_wire(rules, path) -> None:
    sim = build(path)
    rows = sim._feature_appeal_rows
    assert len(rows) == 1, f"one carrier expected, wire has {len(rows)}"
    _c, _l, fi, amt = rows[0]
    assert _c >= 0, "the carrier names no civilization"
    assert fi >= 0, "the carrier names no feature"
    # the swing from the usual -1 to +1 is exactly 2
    assert amt == 2, f"the install writes Amount 2, wire has {amt}"
    print("  1 the wire OK — one row, one feature, +2")


def test_each_adjacent_rainforest_swings_by_two(rules, path) -> None:
    _c, _l, fi, amt = build(path)._feature_appeal_rows[0]
    plain = build(path)
    _seat(plain, ROW, None)
    t = _owned_tile(plain, ROW)
    _paint(plain, t, 2, fi)
    bare = float(plain._gp_appeal_plane()[B0, t])

    sim = build(path)
    _seat(sim, ROW, sim._civ_ids[_c])
    t2 = _owned_tile(sim, ROW)
    _paint(sim, t2, 2, fi)
    amazon = float(sim._gp_appeal_plane()[B0, t2])

    assert amazon - bare == 2 * amt, \
        f"two adjacent rainforests moved appeal by {amazon - bare}, expected {2 * amt}"
    print(f"  2 the swing OK — two rainforests are worth {2 * amt} to the carrier")


def test_it_scales_with_the_count_and_pays_nothing_at_zero(rules, path) -> None:
    _c, _l, fi, amt = build(path)._feature_appeal_rows[0]
    got = []
    for n in (0, 1, 3):
        sim = build(path)
        _seat(sim, ROW, sim._civ_ids[_c])
        t = _owned_tile(sim, ROW)
        _paint(sim, t, n, fi)
        got.append(float(sim._gp_appeal_plane()[B0, t]))
    assert got[1] - got[0] == amt, f"one rainforest paid {got[1] - got[0]}"
    assert got[2] - got[0] == 3 * amt, f"three rainforests paid {got[2] - got[0]}"
    print("  3 the count OK — it scales, and zero pays zero")


def test_an_unowned_tile_and_a_plain_seat_take_none(rules, path) -> None:
    _c, _l, fi, amt = build(path)._feature_appeal_rows[0]
    sim = build(path)
    _seat(sim, ROW, sim._civ_ids[_c])
    free = (sim.tile_seat[B0] < 0).nonzero().flatten()
    assert free.numel(), "every tile is owned"
    t = int(free[0])
    _paint(sim, t, 3, fi)
    assert float(sim._gp_appeal_plane()[B0, t]) == 0.0, "an unowned tile was paid"

    plain = build(path)
    _seat(plain, ROW, None)
    t2 = _owned_tile(plain, ROW)
    _paint(plain, t2, 3, fi)
    assert float(plain._gp_appeal_plane()[B0, t2]) == 0.0, "a plain seat was paid"
    print("  4 the gates OK — an unowned tile and a plain seat take none")


def test_the_clause_is_per_game(rules, path) -> None:
    """A [B] roster mask reduced with .any() would pay EVERY game for what one
    game seats — the collapsed-roster-mask class."""
    wide = settle_all(BatchSim([load_fixture(path), load_fixture(path)],
                               load_rules(), device="cpu", dtype=torch.float64))
    assert wide.B > 1, "this lane needs a batch wider than one to mean anything"
    _c, _l, fi, amt = wide._feature_appeal_rows[0]
    ci = wide._civ_ids.index(wide._civ_ids[_c])
    wide.row_civ[0, ROW] = ci
    wide.row_leader[0, ROW] = wide._pair_civ.index(ci)
    wide.row_civ[1, ROW] = -1                       # game 1 seats nobody
    wide.row_leader[1, ROW] = -1
    wide._eff_version += 1
    wide._gen_ver += 1
    slot = wide.city_slot_at(ROW)
    live = (wide.tile_seat == ROW) & (slot >= 0)
    t = int((live[0] & live[1]).nonzero().flatten()[0])
    for b in (0, 1):
        nb = [int(x) for x in wide.neigh[t].tolist() if x >= 0]
        for i, tt in enumerate(nb):
            wide.feat_id[b, tt] = fi if i < 2 else -1
    wide._eff_version += 1
    ap = wide._gp_appeal_plane()
    assert float(ap[0, t]) == 2 * amt, f"the seated game got {float(ap[0, t])}"
    assert float(ap[1, t]) == 0.0, "a game that seats nobody was paid the clause"
    print("  5 the batch OK — the clause is per game, not per batch")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_each_adjacent_rainforest_swings_by_two(rules, path)
    test_it_scales_with_the_count_and_pays_nothing_at_zero(rules, path)
    test_an_unowned_tile_and_a_plain_seat_take_none(rules, path)
    test_the_clause_is_per_game(rules, path)
    print("BATTERY OK feature_appeal")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
