"""A flood damages the DISTRICT on the floodplain, not just the improvement.

    python tests/gpu/flood_district_test.py

CIV 6 (Gathering Storm): floods damage improvements AND districts on the
floodplains tiles they cover, which is the whole reason a Dam is worth its
production. An unfinished district and a city CENTRE are left alone.

Disasters are off in most fixtures and the flood picks one tile out of every
floodplain on the map, so the driven gate reaches this at a rate no run can be
counted on for — the lane pokes the phase directly.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def floodplain(sim) -> int:
    tiles = [t for t in range(sim.T)
             if bool(sim.floodplain[0, t]) and int(sim.centre_slot_at[0, t]) < 0]
    assert tiles, "fixture has no non-centre floodplain tile"
    return tiles[0]


def flood_until(sim, done, cap: int = 600) -> int:
    n = 0
    while not done() and n < cap:
        sim._disaster_phase()
        n += 1
    return n


def main() -> None:
    sim = build()
    t = floodplain(sim)

    sim.district[0, t] = 0            # a COMPLETE district on the floodplain
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    n = flood_until(sim, lambda: bool(sim.district_pillaged[0, t]))
    assert bool(sim.district_pillaged[0, t]),         f"{n} disaster phases and the flooded district is still whole"
    print(f"  a complete district on a floodplain is pillaged (after {n} phases)")

    # ...and the same tile, with the district still BUILDING, survives every
    # flood. The silt proves the floods kept landing on it, so the negative is
    # about completeness and not about a tile the flood stopped picking.
    sim.district_pillaged[0, t] = False
    sim.district_complete[0, t] = False
    sim.fertility[0, t] = 0
    for _ in range(600):
        sim._disaster_phase()
    assert int(sim.fertility[0, t]) > 0, "the flood never reached the tile again"
    assert not bool(sim.district_pillaged[0, t]), "a district still building was pillaged"
    print("  an unfinished district is left alone")

    # A city CENTRE is outside this by construction: `district` never encodes
    # one, so the flood cannot find it.
    centres = [c for c in range(sim.T) if int(sim.centre_slot_at[0, c]) >= 0]
    assert centres, "no city centres — the invariant below is vacuous"
    for c in centres:
        assert int(sim.district[0, c]) < 0, "a centre leaked into the `district` plane"
    print(f"  {len(centres)} city centre(s) carry no district index, so no flood can pillage one")

    print("FLOOD DISTRICT OK — the flood takes the finished district and nothing else")


if __name__ == "__main__":
    main()
