"""A CITY-STATE'S PLOT PER ENVOY — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/envoy_tiles_test.py

The TS twin is tests/cpu/minors/envoy-tiles.test.ts.

CIV6 (`CivilizationLevels.CanAnnexTilesWithReceivedInfluence`, TRUE for
CITY_STATE and FALSE for every other class of player): a minor takes ground
from the influence SPENT ON IT. Measured on one minor over fifteen readings
on a single turn, so nothing but the envoys moved — exactly +1 owned plot per
envoy received, `plots = envoys + 6`, no cap through sixteen, and the suzerain
contest does not change the slope.

No gate lane drives this (a minor takes no decision of its own and the envoy
verb is a major's), so these scenes are the whole GPU-side evidence:
  1. the column: `_row_annex_influence` is the install's row per ROW SPACE,
     TRUE for a minor alone, and disjoint from `_row_annex_culture`
  2. the slope: 0 -> 3 takes three plots, 3 -> 4 takes one more, and
     sixteen envoys take sixteen plots with no cap
  3. the PICK: every plot the claim takes is the argmin of `_seat_border_key`
     under live masks, and that key's clause order is `pickBorderTile`'s own
     sort — distance ascending, resource priority descending, yield sum
     descending, tile index ascending
  4. the refusals: a plot a major already holds is never taken, and a removed
     envoy takes no ground back
  5. the games: in a batch of two, the claim lands only in the game whose
     envoy write landed (`addEnvoys` runs inside one game)
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import warm_base, opened

B0 = 0

# THE WARMED BASE, ONE PER FIXTURE. A scene pays a `restore` — milliseconds —
# instead of a fixture load, a settle and three steps. Every plane these pokes
# write (tile_seat, tile_city, city_acquired, seat_citystate_envoys) is in
# `_MUTABLE`, so the restore is the whole of it.


def build(rules):
    path = fixture_paths()[0]
    sim = warm_base(str(path), lambda: opened(rules, path, 3))
    assert sim.S > 0, "fixture has no city-state"
    return sim


def a_minor(sim) -> int:
    """A live minor with a centre — the same pick the other minor pokes use."""
    s = int((sim.citystate_alive[B0] & (sim.citystate_center[B0] >= 0)).long().argmax())
    assert bool(sim.citystate_alive[B0, s]), "the fixture seats no live city-state"
    return s


def plots(sim, s: int, b: int = B0) -> int:
    return int((sim.tile_seat[b] == 100 + s).sum())


def every(sim) -> torch.Tensor:
    """The claim's game mask with every game's envoy write landed."""
    return torch.ones(sim.B, dtype=torch.bool, device=sim.device)


def set_envoys(sim, s: int, n: int) -> None:
    """The RAW store, all of it on one seat — the count the rule reads."""
    sim.seat_citystate_envoys[B0, :, s] = 0
    sim.seat_citystate_envoys[B0, 0, s] = n


def candidates(sim, s: int):
    """The claim's candidate list, its key and its two live masks — the same
    four `_minor_envoy_tiles` walks, read back for an independent check."""
    row = sim._CITY_MINOR0 + s
    col = torch.zeros(sim.B, dtype=torch.long, device=sim.device)
    bidx = sim._bidx
    center = sim.city_center[bidx, row, col]
    cid = sim.city_id[bidx, row, col]
    tiles, tc, nbs, key0 = sim._seat_border_key(row, center)
    ok = ((tiles >= 0) & sim._seat_tile_unclaimed(tc)
          & sim._seat_tile_adj_city(row, cid, tc, nbs))
    key = sim._seat_border_cost(row, center, tiles, tc, nbs, key0) * 1e5 + tiles.double()
    return tiles[B0], key[B0], ok[B0], int(center[B0])


# ---------------------------------------------------------------------------
def test_column(rules) -> None:
    sim = build(rules)
    lvl = {d["level"]: d for d in sim.rules.civ_levels}
    assert lvl["CITY_STATE"]["canAnnexTilesWithReceivedInfluence"] is True
    for other in ("FULL_CIV", "FREE_CITIES", "TRIBE"):
        assert lvl[other]["canAnnexTilesWithReceivedInfluence"] is False, other
    # every row space carries its own class's answer, and the two annex
    # columns never both hold: a minor claims on envoys, a full civ on Culture
    for r in range(sim.NS):
        want = sim._row_level[r]
        assert bool(sim._row_annex_influence[r]) is bool(
            lvl[want]["canAnnexTilesWithReceivedInfluence"]), (r, want)
        assert not (bool(sim._row_annex_influence[r]) and bool(sim._row_annex_culture[r])), r
    print("  1 column OK — CanAnnexTilesWithReceivedInfluence is the minor's alone")


def test_slope(rules) -> None:
    sim = build(rules)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    base_p, base_a = plots(sim, s), int(sim.city_acquired[B0, row, 0])

    set_envoys(sim, s, base_a + 3)
    sim._minor_envoy_tiles(every(sim))
    assert plots(sim, s) == base_p + 3, f"0 -> 3 envoys took {plots(sim, s) - base_p} plots"
    assert int(sim.city_acquired[B0, row, 0]) == base_a + 3, "the ledger did not follow"

    set_envoys(sim, s, base_a + 4)
    sim._minor_envoy_tiles(every(sim))
    assert plots(sim, s) == base_p + 4, "3 -> 4 envoys took more or less than one plot"

    # idempotent: the count, not a delta — a second call with no new envoy
    # claims nothing
    sim._minor_envoy_tiles(every(sim))
    assert plots(sim, s) == base_p + 4, "the claim fired twice on one envoy"

    # no cap through sixteen, and the suzerain contest changes no slope
    suz_min = int(sim.rules.citystate.get("suzerainEnvoys", 3))
    set_envoys(sim, s, base_a + 16)
    sim._minor_envoy_tiles(every(sim))
    sim._cs_resolve_suzerain()
    assert plots(sim, s) == base_p + 16, f"sixteen envoys took {plots(sim, s) - base_p} plots"
    assert int(sim.citystate_suzerain[B0, s]) == 0, "sixteen envoys from one seat hold no suzerainty"

    # ...and a TIE, which leaves nobody suzerain, pays exactly the same four
    sim2 = build(rules)
    s2 = a_minor(sim2)
    row2 = sim2._CITY_MINOR0 + s2
    b_p, b_a = plots(sim2, s2), int(sim2.city_acquired[B0, row2, 0])
    sim2.seat_citystate_envoys[B0, :, s2] = 0
    half = (b_a + 4) // 2
    sim2.seat_citystate_envoys[B0, 0, s2] = half
    sim2.seat_citystate_envoys[B0, min(1, sim2.n_majors - 1), s2] = (b_a + 4) - half
    sim2._cs_resolve_suzerain()
    sim2._minor_envoy_tiles(every(sim2))
    assert plots(sim2, s2) == b_p + 4, "a split record pays a different slope"
    if sim2.n_majors > 1 and half * 2 == b_a + 4 and half >= suz_min:
        assert int(sim2.citystate_suzerain[B0, s2]) == -1, "a tie left a suzerain"
    print(f"  2 slope OK — +1 plot per envoy to sixteen (base {base_p} plots)")


def test_pick(rules) -> None:
    """Every plot the claim takes is one of the SHARED key's lowest-cost
    ties, and the key orders the candidates by `borderPlotCost`, then tile
    index."""
    sim = build(rules)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    base_a = int(sim.city_acquired[B0, row, 0])

    # --- the key's ORDER against borderPlotCost recomputed here, term by
    #     term, from the planes (the yield term read back from the key)
    tiles, key0, ok, centre = candidates(sim, s)
    sel = ok.nonzero(as_tuple=True)[0]
    assert len(sel) >= 4, "the minor has fewer than four free plots in reach"
    tt = tiles[sel]
    P = rules.plot_influence
    hid = sim._res_hidden(row)[B0]
    live = sim._res_live()[B0]

    def seen(t: int) -> bool:
        return bool(live[t]) and not bool(hid[t])

    def cost(t: int) -> int:
        d = int(sim.pair_dist[centre, t])
        c = d * P["distanceMultiplier"] * 2
        if seen(t):
            c += P["resourceCost"] if d <= 3 else 0
        else:
            c += P["waterCost"] * int(sim.water[B0, t]) + (P["ringCost"] if d > 3 else 0)
        if int(sim.improvement[B0, t]) >= 0 or bool(sim.tile_goody[B0, t]):
            c += P["improvementCost"]
        c += P["nwCost"] * int(sim.nwonder[B0, t])
        near = False
        for n in sim.neigh[t].tolist():
            if n < 0 or int(sim.tile_seat[B0, n]) >= 0:
                continue
            c -= int(seen(n)) + int(sim.nwonder[B0, n])
            near |= bool(sim.nwonder[B0, n]) and int(sim.pair_dist[centre, n]) <= 3
        return c - int(near)

    k = key0[sel]
    y_milli = (k - tt.to(torch.float64)) / 1e5 - torch.tensor([cost(int(t)) * 1000 for t in tt], dtype=torch.float64)
    assert bool((y_milli <= 0).all()), "the yield term pays a plot's cost UP"
    ts_order = sorted(range(len(sel)), key=lambda i: (cost(int(tt[i])) * 1000 + float(y_milli[i]), int(tt[i])))
    gpu_order = sorted(range(len(sel)), key=lambda i: float(k[i]))
    assert [int(tt[i]) for i in ts_order] == [int(tt[i]) for i in gpu_order], (
        "the key does not sort by borderPlotCost, then tile index")

    # --- the CLAIM, one plot at a time: each lands on one of the lowest-cost
    #     ties (`drawBorderPlot`): a claimed plot is owned, and its
    #     neighbours come into reach.
    want = []
    for n in range(1, 6):
        tiles, key0, ok, centre = candidates(sim, s)
        sel = ok.nonzero(as_tuple=True)[0]
        assert len(sel) > 0, "nothing in reach"
        cost = torch.floor(key0[sel] / 1e5)
        ties = set(int(t) for t in tiles[sel][cost == cost.min()])
        set_envoys(sim, s, base_a + n)
        sim._minor_envoy_tiles(every(sim))
        got = [t for t in ties if int(sim.tile_seat[B0, t]) == 100 + s]
        assert len(got) == 1, f"claim {n} took none of the lowest-cost ties {sorted(ties)}"
        assert int(sim.tile_city[B0, got[0]]) == -1, "a minor's plot carries no city id"
        want.append(got[0])
    assert len(set(want)) == 5, "the claim took one plot twice"
    print(f"  3 pick OK — five claims, each among the border key's lowest-cost ties {want}")


def test_refusals(rules) -> None:
    sim = build(rules)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    base_p, base_a = plots(sim, s), int(sim.city_acquired[B0, row, 0])

    # a plot a MAJOR already holds is not taken — the border rule's own
    # `tileClaimed` refusal, on the four plots the claim would reach first
    tiles, key0, ok, _ = candidates(sim, s)
    sel = ok.nonzero(as_tuple=True)[0]
    order = sorted(sel.tolist(), key=lambda i: float(key0[i]))[:4]
    taken = [int(tiles[i]) for i in order]
    for t in taken:
        sim.tile_seat[B0, t] = int(sim._ROW_SEAT[0])
        sim.tile_city[B0, t] = 0
    sim._tile_owner_ver += 1
    sim._claim_version += 1
    set_envoys(sim, s, base_a + 4)
    sim._minor_envoy_tiles(every(sim))
    for t in taken:
        assert int(sim.tile_seat[B0, t]) == int(sim._ROW_SEAT[0]), f"plot {t} was taken off a major"
    assert plots(sim, s) == base_p + 4, "the refused plots cost the minor its ground"

    # a REMOVED envoy takes no ground back, and buys nothing until the count
    # passes its own mark
    sim2 = build(rules)
    s2 = a_minor(sim2)
    row2 = sim2._CITY_MINOR0 + s2
    p0, a0 = plots(sim2, s2), int(sim2.city_acquired[B0, row2, 0])
    set_envoys(sim2, s2, a0 + 4)
    sim2._minor_envoy_tiles(every(sim2))
    assert plots(sim2, s2) == p0 + 4
    set_envoys(sim2, s2, a0 + 1)          # a spy's Fabricate Scandal
    sim2._minor_envoy_tiles(every(sim2))
    assert plots(sim2, s2) == p0 + 4, "a removed envoy took ground back"
    set_envoys(sim2, s2, a0 + 5)          # one past the mark
    sim2._minor_envoy_tiles(every(sim2))
    assert plots(sim2, s2) == p0 + 5, "the count past its mark bought no plot"

    # a DEAD minor receives nothing
    sim2.citystate_alive[B0, s2] = False
    set_envoys(sim2, s2, a0 + 9)
    sim2._minor_envoy_tiles(every(sim2))
    assert plots(sim2, s2) == p0 + 5, "a dead minor claimed ground"
    print("  4 refusals OK — a major's plot, a removed envoy and a dead minor all take nothing")


def test_games(rules) -> None:
    """The claim runs in the games whose envoy write landed and nowhere else:
    TS calls `receiveEnvoyTiles` from `addEnvoys` inside ONE game, so a minor
    whose count is ahead of its ledger in a game with no write claims nothing
    until its own game next adds an envoy. Two identical games, both pending."""
    from core import BatchSim, load_fixture
    from warmup import settle_all
    path = fixture_paths()[0]
    sim = settle_all(BatchSim([load_fixture(path)] * 2, rules, device="cpu", dtype=torch.float64), 3)
    s = a_minor(sim)
    row = sim._CITY_MINOR0 + s
    p0 = [plots(sim, s, b) for b in range(2)]
    a0 = [int(sim.city_acquired[b, row, 0]) for b in range(2)]
    for b in range(2):
        sim.seat_citystate_envoys[b, :, s] = 0
        sim.seat_citystate_envoys[b, 0, s] = a0[b] + 2
    sim._minor_envoy_tiles(torch.tensor([True, False]))
    assert plots(sim, s, 0) == p0[0] + 2, "the landed game claimed nothing"
    assert plots(sim, s, 1) == p0[1], "a game with no envoy write claimed ground"
    assert int(sim.city_acquired[1, row, 0]) == a0[1], "a game with no envoy write moved its ledger"
    sim._minor_envoy_tiles(torch.tensor([False, True]))
    assert plots(sim, s, 0) == p0[0] + 2, "the first game claimed twice"
    assert plots(sim, s, 1) == p0[1] + 2, "the second game's own write claimed nothing"
    print("  5 games OK — the claim lands only in the games whose envoy write landed")


def main() -> None:
    rules = load_rules()
    print(f"envoy_tiles_test on {fixture_paths()[0].name}:")
    test_column(rules)
    test_slope(rules)
    test_pick(rules)
    test_refusals(rules)
    test_games(rules)
    print("BATTERY OK envoy_tiles")


if __name__ == "__main__":
    main()
