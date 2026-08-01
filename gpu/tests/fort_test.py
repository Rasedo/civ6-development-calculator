"""AUDIT B-27 (#78) — the FORT poke lane.

    python gpu/fort_test.py

Civilopedia: "Occupying unit receives +4 Defense Strength". Built by a MILITARY
ENGINEER only (prereq Siege Tactics; the engineer itself needs Military
Engineering).

WHY THIS LANE EXISTS. Gate reachability is MEASURED AT ZERO — across 6 seeds x
250 turns no Military Engineer is ever produced and no fort is ever placed — so
scripted parity says nothing about this mechanic. The lane writes the tile
planes directly instead of waiting for a seed to build one.

It asserts the two things the implementation can get wrong:
  a. the bonus is exactly +4 and STACKS with terrain rather than replacing it;
  b. it is LIVE, i.e. read from `improvement` at combat time rather than baked
     into the static `tdef` plane — a fort is built, pillaged and replaced
     mid-game, and the chop/found paths rewrite `tdef` from hills alone, which
     would silently erase a baked-in bonus.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        raise SystemExit(1)
    sim = BatchSim([load_fixture(str(paths[0]))], rules, device="cpu", dtype=torch.float64)
    assert sim.FORT >= 0, "FORT must be in the exported improvement roster"

    # a flat tile with no feature, so base terrain defence is 0, and a hills one
    flat = (~sim.hills[0] & (sim.tdef[0] == 0)).nonzero().flatten()
    hilly = (sim.hills[0] & (sim.tdef[0] == 3)).nonzero().flatten()
    assert len(flat) and len(hilly), "need one flat and one hills tile to test against"
    f, h = int(flat[0]), int(hilly[0])

    idx = torch.tensor([f, h], device=sim.device)
    b = torch.zeros(2, dtype=torch.long, device=sim.device)
    before = sim._tdef_i(b, idx).tolist()
    assert before == [0, 3], f"expected base defence [0, 3], got {before}"

    sim.improvement[0, f] = sim.FORT
    sim.improvement[0, h] = sim.FORT
    after = sim._tdef_i(b, idx).tolist()
    assert after == [4, 7], f"fort defence must be base+4 -> [4, 7], got {after}"
    print(f"  a fort +4 OK (flat 0 -> 4, hills 3 -> 7 — stacks, does not replace)")

    # the gather-indexed twin must agree with the advanced-indexed one. It takes
    # ONE tile per batch row ([B]), so with B=1 each tile is checked separately.
    g = [int(sim._tdef_g(torch.tensor([x], device=sim.device))[0]) for x in (f, h)]
    assert g == after, f"_tdef_g {g} disagrees with _tdef_i {after}"
    print("  b both index forms agree (gather twin == advanced-index twin)")

    # LIVE, not baked: the static plane is untouched, so a chop/found rewrite of
    # `tdef` cannot erase the bonus.
    assert sim.tdef[0, f].item() == 0 and sim.tdef[0, h].item() == 3, (
        "the fort bonus must NOT be written into the static tdef plane"
    )
    sim.improvement[0, f] = -1
    assert int(sim._tdef_i(b, idx)[0]) == 0, "removing the fort must remove the bonus"
    print("  c live read OK (static tdef untouched; removing the fort removes the bonus)")

    print("fort_test OK — #78 B-27: fort +4 defence, stacking, live off `improvement`")


if __name__ == "__main__":
    main()
