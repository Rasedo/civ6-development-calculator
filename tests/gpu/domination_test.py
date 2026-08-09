"""Domination self-test: the GPU `_domination()` reduction mirrors TS
`dominationWinner` (tests/cpu/victory/domination.test.ts). The gate never
triggers a domination — no seat holds every capital there — so parity alone
cannot validate the semantics. This lane hand-pokes ownership of the capital
tiles (seat 0's site[0] + each civ's rc_center[:,:,0]) and asserts the winner.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/domination_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def dom(sim) -> int:
    return int(sim._domination()[0])


def main() -> int:
    rules = load_rules()
    # resolve the fixture by POSITION: the lane only needs "some 2-civ
    # fixture", so a seed-set change cannot break it.
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run seed && npm run export` first")
        return 1
    path = paths[6] if len(paths) > 6 else paths[0]
    sim = build(rules, path)
    if sim.R < 2:
        print(f"SKIP domination — fixture has {sim.R} civs, need >=2")
        return 0

    pcap = int(sim.site[0, 0])
    rcaps = [int(sim.rc_center[0, r, 0]) for r in range(sim.R)]

    # 1. Split at founding — seat 0 holds its own, each civ holds theirs -> -1.
    assert dom(sim) == -1, f"split capitals should be -1, got {dom(sim)}"

    # 2. Seat 0 holds every capital (every civ's captured) -> 0.
    s = build(rules, path)
    for ct in rcaps:
        s.centre_slot_at[0, ct] = 1  # a seat-0 city sits here now
        s.tile_seat[0, ct] = 0       # the centre's owner names the seat
    s._tile_owner_ver += 1           # direct plane pokes must invalidate the derived views
    assert dom(s) == 0, f"seat-0 domination should be 0, got {dom(s)}"

    # 3. Civ 0 holds every capital (seat 0's + civ 1's captured) -> civ id 1.
    s = build(rules, path)
    s.centre_slot_at[0, pcap] = 0
    s.tile_seat[0, pcap] = 1  # civ index 0 took seat 0's capital
    for r in range(1, sim.R):
        s.centre_slot_at[0, rcaps[r]] = 0
        s.tile_seat[0, rcaps[r]] = 1  # ...and every other civ capital
    s._tile_owner_ver += 1
    assert dom(s) == 1, f"civ-0 domination should be 1, got {dom(s)}"

    # 4. A razed capital (no city on the tile) blocks domination -> -1.
    s = build(rules, path)
    for ct in rcaps:
        s.centre_slot_at[0, ct] = 1
        s.tile_seat[0, ct] = 0  # seat 0 would otherwise hold all...
    s.centre_slot_at[0, rcaps[0]] = -1  # ...but civ 0's capital was razed
    s.tile_seat[0, rcaps[0]] = -1
    s._tile_owner_ver += 1
    assert dom(s) == -1, f"razed capital should block domination, got {dom(s)}"

    print("domination OK — split/-seat0/-civ/-razed all match dominationWinner")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
