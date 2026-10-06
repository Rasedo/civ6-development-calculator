"""A SEAT'S OWN READING OF AN ADJACENT FEATURE — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/feature_appeal_test.py

The TS twin is tests/cpu/city/feature-appeal.test.ts.

CIV6 (Amazon, TRAIT_AMAZON_RAINFOREST_EXTRA_APPEAL): "Rainforest tiles provide
+1 Appeal to adjacent tiles, instead of the usual -1." The install writes it as
EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER on FEATURE_JUNGLE with Amount 2 — exactly
the swing from -1 to +1. Rules_Appeal reads it off the city holding the
rainforest, so it rides `_appeal_lend_plane`: what each tile lends its
neighbours through its own city.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all, warm_base, opened

B0 = 0
ROW = 0


# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load and a settle. `_STATIC` names the state these pokes
# write that `snapshot`/`restore` does not carry (it is not in `_MUTABLE`), so
# the helper puts it back by hand as well.
_STATIC = ("row_civ", "row_leader")


def build(path) -> BatchSim:
    return warm_base(str(path), lambda: opened(load_rules(), path), _STATIC)


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


def _owned(sim, b: int, row: int) -> torch.Tensor:
    return (sim.tile_seat[b] == row) & (sim.city_slot_at(row)[b] >= 0)


def _owned_tile(sim, row: int, need: int = 3) -> int:
    """A tile this row owns with at least `need` neighbours the row owns too —
    a rainforest lends only through its own city."""
    own = _owned(sim, B0, row)
    for t in own.nonzero().flatten().tolist():
        nb = [int(x) for x in sim.neigh[t].tolist() if x >= 0]
        if sum(bool(own[x]) for x in nb) >= need:
            return t
    raise AssertionError("this row owns no tile with enough owned neighbours")


def _paint(sim, tile: int, n: int, fi: int, b: int = B0) -> None:
    """Give `tile` exactly `n` OWNED neighbours carrying feature `fi`."""
    own = _owned(sim, b, ROW)
    k = 0
    for t in [int(x) for x in sim.neigh[tile].tolist() if x >= 0]:
        sim.feat_id[b, t] = fi if (own[t] and k < n) else -1
        sim.improvement[b, t] = -1
        k += int(bool(own[t]))
    sim._eff_version += 1


def _lent(sim, tile: int, b: int = B0) -> float:
    """What `tile`'s neighbours lend it through their own cities."""
    plane = sim._appeal_lend_plane()
    return float(sum(plane[b, int(x)] for x in sim.neigh[tile].tolist() if x >= 0))


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
    bare = float(plain._tile_appeal()[B0, t])

    sim = build(path)
    _seat(sim, ROW, sim._civ_ids[_c])
    t2 = _owned_tile(sim, ROW)
    _paint(sim, t2, 2, fi)
    amazon = float(sim._tile_appeal()[B0, t2])

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
        got.append(_lent(sim, t))
    assert got[1] - got[0] == amt, f"one rainforest paid {got[1] - got[0]}"
    assert got[2] - got[0] == 3 * amt, f"three rainforests paid {got[2] - got[0]}"
    print("  3 the count OK — it scales, and zero pays zero")


def test_an_unowned_rainforest_and_a_plain_seat_lend_none(rules, path) -> None:
    _c, _l, fi, amt = build(path)._feature_appeal_rows[0]
    sim = build(path)
    _seat(sim, ROW, sim._civ_ids[_c])
    free = (sim.tile_seat[B0] < 0).nonzero().flatten()
    assert free.numel(), "every tile is owned"
    t = int(free[0])
    sim.feat_id[B0, t] = fi
    sim._eff_version += 1
    assert float(sim._appeal_lend_plane()[B0, t]) == 0.0, "an unowned rainforest lent"

    plain = build(path)
    _seat(plain, ROW, None)
    t2 = _owned_tile(plain, ROW)
    _paint(plain, t2, 3, fi)
    assert _lent(plain, t2) == 0.0, "a plain seat's rainforest lent"
    print("  4 the gates OK — an unowned rainforest and a plain seat lend none")


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
    t = _owned_tile(wide, ROW)
    for b in (0, 1):
        _paint(wide, t, 2, fi, b)
    assert _lent(wide, t, 0) == 2 * amt, f"the seated game got {_lent(wide, t, 0)}"
    assert _lent(wide, t, 1) == 0.0, "a game that seats nobody was paid the clause"
    print("  5 the batch OK — the clause is per game, not per batch")


def test_a_chopped_rainforest_no_longer_counts(rules, path) -> None:
    """`feat_id` keeps a chopped tile's old id; the strip flag is what makes
    the count the live `n.feature` read TS does (seed 9014 t198: a Preserve
    tile's stripped rainforest paid Brazil +2 appeal next door)."""
    _c, _l, fi, amt = build(path)._feature_appeal_rows[0]
    sim = build(path)
    _seat(sim, ROW, sim._civ_ids[_c])
    t = _owned_tile(sim, ROW)
    _paint(sim, t, 2, fi)
    both = _lent(sim, t)
    painted = [int(x) for x in sim.neigh[t].tolist() if x >= 0 and int(sim.feat_id[B0, int(x)]) == fi]
    sim.feat_stripped[B0, painted[0]] = True
    sim._eff_version += 1
    one = _lent(sim, t)
    assert both - one == amt, f"a chopped rainforest still paid: {both} -> {one}"
    print("  6 the chop OK — a stripped rainforest stops counting")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_each_adjacent_rainforest_swings_by_two(rules, path)
    test_it_scales_with_the_count_and_pays_nothing_at_zero(rules, path)
    test_an_unowned_rainforest_and_a_plain_seat_lend_none(rules, path)
    test_the_clause_is_per_game(rules, path)
    test_a_chopped_rainforest_no_longer_counts(rules, path)
    print("BATTERY OK feature_appeal")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
