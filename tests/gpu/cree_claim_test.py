"""THE CREE TRADER'S TILE CLAIM, GPU side — `claimTileEnRoute`'s twin.

CIV6 (TRAIT_CIVILIZATION_CREE_TRADE_GAIN_TILES,
EFFECT_ADJUST_PLAYER_TRADE_GAIN_TILES_EN_ROUTE GainTileRadius 3): "Unclaimed
tiles within 3 tiles of a Cree City come under Cree control when a Trader
first moves into them." The radius is measured from the CITY.

The fixtures draw their trio, so a world without the Cree reaches nothing —
this lane seats the row by hand and drives `_claim_tile_en_route` directly,
which is the whole GPU reach until a Cree world is drawn.

Run: PYTHONIOENCODING=utf-8 python tests/gpu/cree_claim_test.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from warmup import settle_all  # noqa: E402
from core.simbase import NO_SEAT  # noqa: E402

B0 = 0
ROW = 0


def build(rules, path) -> BatchSim:
    """Every seat's capital FOUNDED — a t0 fixture seats settlers, and
    founding is an ORDER, so a bare step raises no city."""
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def main() -> int:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = build(rules, paths[0])
    print(f"cree_claim_test on {paths[0].name}")

    rows = sim._trade_gain_tile_rows
    assert rows, "the roster carries no TRADE_GAIN_TILE row"
    civ, leader, radius = rows[0]
    assert radius == 3, f"the install's GainTileRadius is 3, this table says {radius}"

    # seat the row on this game by hand: the drawn trio need not hold the Cree
    if civ >= 0:
        sim.row_civ[B0, ROW] = civ
    sim._eff_version += 1
    assert bool(sim._row_is(ROW, civ, leader)[B0]), "the row did not seat"

    assert bool(sim.city_alive[B0, ROW].any()), "the row holds no city after settling"
    j = int(sim.city_alive[B0, ROW].long().argmax())
    ctr = int(sim.city_center[B0, ROW, j])

    def unowned_at(dist: int) -> int:
        d = sim.pair_dist[ctr].long()
        cand = ((d == dist) & (sim.tile_seat[B0] == NO_SEAT)).nonzero().flatten()
        return int(cand[0]) if cand.numel() else -1

    near = unowned_at(radius)
    far = unowned_at(radius + 2)
    assert near >= 0, f"no unclaimed tile exactly {radius} from the centre"
    assert far >= 0, f"no unclaimed tile {radius + 2} from the centre"

    bb = torch.tensor([B0])
    moved = torch.ones(1, dtype=torch.bool)

    # 1 — inside the radius, unclaimed: it comes under Cree control
    sim._claim_tile_en_route(ROW, bb, torch.tensor([near]), moved)
    assert int(sim.tile_seat[B0, near]) == int(sim._ROW_SEAT[ROW]), (
        f"the tile {radius} out stayed at seat {int(sim.tile_seat[B0, near])}")
    print(f"  1 claim OK — tile {near} at distance {radius} came under control")

    # 2 — beyond it, nothing moves however far the course runs
    sim._claim_tile_en_route(ROW, bb, torch.tensor([far]), moved)
    assert int(sim.tile_seat[B0, far]) == NO_SEAT, "a tile beyond the radius was taken"
    print(f"  2 range OK — tile {far} at distance {radius + 2} was left alone")

    # 3 — an OWNED tile never changes hands
    sim2 = build(rules, paths[0])
    if civ >= 0:
        sim2.row_civ[B0, ROW] = civ
    sim2._eff_version += 1
    held = unowned_at(radius)
    sim2.tile_seat[B0, held] = 200  # the barbarian seat: anyone but this row
    sim2._claim_tile_en_route(ROW, bb, torch.tensor([held]), moved)
    assert int(sim2.tile_seat[B0, held]) == 200, "an owned tile changed hands"
    print("  3 ownership OK — a held tile is never taken")

    # 4 — a row that is NOT the Cree claims nothing
    sim3 = build(rules, paths[0])
    other = next((c for c in range(int(sim3.row_civ.max()) + 1) if c != civ), -1)
    if other >= 0:
        sim3.row_civ[B0, ROW] = other
        sim3._eff_version += 1
        t4 = unowned_at(radius)
        sim3._claim_tile_en_route(ROW, bb, torch.tensor([t4]), moved)
        assert int(sim3.tile_seat[B0, t4]) == NO_SEAT, "a non-Cree row claimed ground"
        print("  4 civilization OK — the clause pays nobody but the Cree")
    else:
        print("  4 civilization SKIPPED (the roster carries one civilization)")

    print("CREE CLAIM OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
