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
    """a non-centre floodplain tile, OWNED by a seat that is not Egypt: the
    district rows refuse an unowned plot (the applier 0x336a50), and Egypt's
    ground takes no flood damage"""
    tiles = [t for t in range(sim.T)
             if bool(sim.floodplain[0, t]) and int(sim.centre_slot_at[0, t]) < 0]
    assert tiles, "fixture has no non-centre floodplain tile"
    t = tiles[0]
    if int(sim.tile_seat[0, t]) < 0:
        owner = next(s for s in range(sim.n_majors)
                     if not bool(sim._seat_plays(torch.tensor([s]), "EGYPT")[0]))
        sim.tile_seat[0, t] = owner
        sim._tile_owner_ver += 1
    return t


def main() -> None:
    sim = build()
    t = floodplain(sim)

    sim.district[0, t] = 0            # a COMPLETE district on the floodplain
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    # A moderate flood never pillages a district (its DISTRICT_PILLAGED row
    # is 0), so the floods are driven onto the tile at the top severity.
    hit = torch.zeros(sim.B, dtype=torch.bool)
    hit[0] = True
    at = torch.full((sim.B, 1), t, dtype=torch.long)  # a Floodplains list of `t` alone
    top = torch.full((sim.B,), len(sim._flood_damage) - 1, dtype=torch.long)
    n = 0
    while not bool(sim.district_pillaged[0, t]) and n < 200:
        sim._flood_river(hit, at, top, torch.full((sim.B,), -1, dtype=torch.long, device=sim.device))
        n += 1
    assert bool(sim.district_pillaged[0, t]), f"{n} top-severity floods and the district is still whole"
    print(f"  a complete district on a floodplain is pillaged (after {n} floods)")

    # ...and the same tile, with the district still BUILDING, survives every
    # flood. The flood is DRIVEN onto the tile and its count proves each one
    # landed, so the negative is about completeness and not about the walk.
    sim.district_pillaged[0, t] = False
    sim.district_complete[0, t] = False
    hit = torch.zeros(sim.B, dtype=torch.bool)
    hit[0] = True
    at = torch.full((sim.B, 1), t, dtype=torch.long)  # a Floodplains list of `t` alone
    # `t` made the home of flood river 0, so each flood counts on it
    sim._flood_home[0, t] = 0
    home = torch.zeros(sim.B, dtype=torch.long)
    before = int(sim.tile_flood_ct[0, t])
    for _ in range(200):
        sim._flood_river(hit, at, sim._flood_severity_draw(hit), home)
    assert int(sim.tile_flood_ct[0, t]) - before == 200, "the flood did not land on the tile every time"
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
