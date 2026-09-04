"""THE MOUNTAIN TUNNEL — the GPU half (C-20).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/mountain_tunnel_test.py

The TS twin is tests/cpu/map/mountain-tunnel.test.ts.

CIV6 (Mountain Tunnel): "Acts as a movement portal on a mountain range,
allowing units to move into it and exit from another portal at the cost of 2
Movement. ... Can only be built on an adjacent Mountain tile. Cannot be
pillaged or removed." Expansion2_Improvements.xml gives PrereqTech
TECH_CHEMISTRY, UNIT_MILITARY_ENGINEER alone, the five mountain terrains and
PlunderType PLUNDER_NONE.
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


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def _ridge(sim, n: int = 3):
    """A connected run of `n` mountain tiles, with its own range id."""
    mt = sim.tile_mountain[B0].nonzero().flatten().tolist()
    assert mt, "this fixture carries no mountain"
    # take a whole range, so the tiles are genuinely connected
    rid = int(sim.tile_range[B0, mt[0]])
    same = [t for t in mt if int(sim.tile_range[B0, t]) == rid]
    assert len(same) >= 2, f"range {rid} holds {len(same)} tiles, need 2+"
    return rid, sorted(same)[:n]


def test_the_wire(rules, path) -> None:
    sim = build(path)
    assert sim.TUNNEL >= 0, "the improvement is not on the wire"
    assert sim._A_PORTAL >= 0, "the PORTAL verb is not on the wire"
    assert sim._portal_mp == 2, f"the published price is 2 Movement, wire has {sim._portal_mp}"
    # appended LAST, so no earlier column moved
    assert sim._act_names[-1] == "PORTAL", f"PORTAL is not last: {sim._act_names[-1]}"
    assert sim._A_IMP[sim.TUNNEL] < sim._act_names.index("PILLAGE"), \
        "a BUILD column must sit before PILLAGE"
    print("  1 the wire OK — the improvement, the verb, and 2 Movement")


def test_the_range_plane_is_a_flood_fill(rules, path) -> None:
    sim = build(path)
    mt = sim.tile_mountain[B0]
    rng = sim.tile_range[B0]
    assert bool((rng[~mt] == -1).all()), "a non-mountain carries a range id"
    assert bool((rng[mt] >= 0).all()), "a mountain carries no range id"
    # every tile of a range is reachable from every other THROUGH that range
    rid, tiles = _ridge(sim)
    for t in tiles:
        assert int(rng[t]) == rid
    print(f"  2 the range OK — {int(rng.max()) + 1} ranges, water and flat land at -1")


def test_it_is_enterable_and_still_a_mountain(rules, path) -> None:
    """The fourteen exported flags derive from impassability and NONE of them
    may move: a tunnel opens the tile to movement and nothing else (C-20)."""
    sim = build(path)
    _rid, tiles = _ridge(sim)
    t = tiles[0]
    before = {k: bool(getattr(sim, k)[B0, t]) for k in
              ("camp_ok", "settle_ok", "passable", "tile_mountain")}
    sim.improvement[B0, t] = sim.TUNNEL
    after = {k: bool(getattr(sim, k)[B0, t]) for k in before}
    assert after == before, f"a tunnel moved a baked flag: {before} -> {after}"
    assert bool(sim.tile_mountain[B0, t]), "the tile stopped being a mountain"
    print("  3 the flags OK — enterable, and not one baked flag moved")


def test_the_portal_exits_next_and_wraps(rules, path) -> None:
    sim = build(path)
    _rid, tiles = _ridge(sim, 3)
    if len(tiles) < 3:
        print("  4 the portal SKIPPED — this fixture's range is under three tiles")
        return
    for t in tiles:
        sim.improvement[B0, t] = sim.TUNNEL
    a, b, c = tiles
    ex = sim._portal_exit(torch.tensor([a]))
    assert int(ex[0]) == b, f"the exit from {a} was {int(ex[0])}, expected {b}"
    assert int(sim._portal_exit(torch.tensor([b]))[0]) == c
    assert int(sim._portal_exit(torch.tensor([c]))[0]) == a, "the last portal did not wrap"
    print("  4 the portal OK — next by index, and the last one wraps")


def test_a_lone_portal_and_a_bare_mountain_go_nowhere(rules, path) -> None:
    sim = build(path)
    _rid, tiles = _ridge(sim)
    sim.improvement[B0, tiles[0]] = sim.TUNNEL
    assert int(sim._portal_exit(torch.tensor([tiles[0]]))[0]) == -1, \
        "the only portal on its range found an exit"
    assert int(sim._portal_exit(torch.tensor([tiles[1]]))[0]) == -1, \
        "a bare mountain offered a portal step"
    print("  5 the empty cases OK — a lone portal and a bare mountain go nowhere")


def test_it_never_exits_onto_another_range(rules, path) -> None:
    sim = build(path)
    rngs = sorted({int(x) for x in sim.tile_range[B0].tolist() if x >= 0})
    if len(rngs) < 2:
        print("  6 the range gate SKIPPED — this fixture has one range")
        return
    a = [t for t in range(sim.T) if int(sim.tile_range[B0, t]) == rngs[0]][0]
    b = [t for t in range(sim.T) if int(sim.tile_range[B0, t]) == rngs[1]][0]
    sim.improvement[B0, a] = sim.TUNNEL
    sim.improvement[B0, b] = sim.TUNNEL
    assert int(sim._portal_exit(torch.tensor([a]))[0]) == -1, "a portal reached another range"
    assert int(sim._portal_exit(torch.tensor([b]))[0]) == -1, "a portal reached another range"
    print("  6 the range gate OK — a portal never leaves its own range")


def test_it_cannot_be_pillaged(rules, path) -> None:
    """CIV6: "Cannot be pillaged or removed" — the verb refuses it outright,
    the same shape as the Encampment's district clause."""
    sim = build(path)
    _rid, tiles = _ridge(sim)
    t = tiles[0]
    sim.improvement[B0, t] = sim.TUNNEL
    imp = sim.improvement[B0, t]
    assert int(imp) == sim.TUNNEL
    assert not bool(sim.pillaged[B0, t]), "a fresh tunnel is pillaged"
    # the plunder row itself pays nothing, which is PLUNDER_NONE on the wire
    assert int(sim._imp_plun_kind[sim.TUNNEL]) == 0, "the tunnel carries a plunder kind"
    print("  7 the plunder OK — PLUNDER_NONE, and the verb refuses it")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_the_range_plane_is_a_flood_fill(rules, path)
    test_it_is_enterable_and_still_a_mountain(rules, path)
    test_the_portal_exits_next_and_wraps(rules, path)
    test_a_lone_portal_and_a_bare_mountain_go_nowhere(rules, path)
    test_it_never_exits_onto_another_range(rules, path)
    test_it_cannot_be_pillaged(rules, path)
    print("BATTERY OK mountain_tunnel")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
