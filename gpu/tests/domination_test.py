"""GV-3 domination self-test: the GPU _domination() reduction must mirror TS
dominationWinner (tests/domination.test.ts). The gate never triggers a
domination (no civ holds all capitals by t100), so parity alone can't validate
the semantics — here we hand-poke ownership of the capital tiles (player
site[0] + each rival rc_center[:,:,0]) and assert the winner.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/domination_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def dom(sim) -> int:
    return int(sim._domination()[0])


def main() -> int:
    rules = load_rules()
    # #78: this lane used to hard-code seed9079.json and broke the moment a
    # SEED_OVERRIDES entry moved index 6 to another seed (the corrected combat
    # strengths wipe 9079's player before t250). Resolve the fixture by
    # POSITION instead — the lane only needs "some 2-rival fixture", not that
    # specific seed — so a future override cannot break it again.
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        return 1
    path = paths[6] if len(paths) > 6 else paths[0]
    sim = build(rules, path)
    if sim.R < 2:
        print(f"SKIP domination — fixture has {sim.R} rivals, need >=2")
        return 0

    pcap = int(sim.site[0, 0])
    rcaps = [int(sim.rc_center[0, r, 0]) for r in range(sim.R)]

    # 1. Split at founding — player holds its own, each rival holds theirs -> -1.
    assert dom(sim) == -1, f"split capitals should be -1, got {dom(sim)}"

    # 2. Player holds every capital (all rivals' captured) -> player (0).
    s = build(rules, path)
    for ct in rcaps:
        s.rvcity_at[0, ct] = -1
        s.center_at[0, ct] = 1  # a player city sits here now (>=0 is all _domination reads)
    assert dom(s) == 0, f"player domination should be 0, got {dom(s)}"

    # 3. Rival 0 holds every capital (player + rival 1 captured) -> civ id 1.
    s = build(rules, path)
    s.center_at[0, pcap] = -1
    s.rvcity_at[0, pcap] = 0  # rival index 0 took the player capital
    for r in range(1, sim.R):
        s.rvcity_at[0, rcaps[r]] = 0  # ...and every other rival capital
    assert dom(s) == 1, f"rival-0 domination should be 1, got {dom(s)}"

    # 4. A razed capital (no city on the tile) blocks domination -> -1.
    s = build(rules, path)
    for ct in rcaps:
        s.rvcity_at[0, ct] = -1
        s.center_at[0, ct] = 1  # player would otherwise hold all...
    s.center_at[0, rcaps[0]] = -1  # ...but rival 0's capital was razed
    s.rvcity_at[0, rcaps[0]] = -1
    assert dom(s) == -1, f"razed capital should block domination, got {dom(s)}"

    print("domination OK — split/-player/-rival/-razed all match dominationWinner")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
