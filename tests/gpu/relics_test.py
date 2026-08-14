"""RELICS self-test — the GPU twin of tests/cpu/culture/relics.test.ts.

Real Civ 6 counts a Relic as a Great Work held in a TEMPLE's single slot,
paying +4 Faith and +8 Tourism (the densest tourism source in the game). A
relic is created when an Apostle killed in theological combat carried the
MARTYR promotion; promotions are unmodeled and `theologicalCombat` is
deliberately zero-draw, so every APOSTLE killed there martyrs — a recorded
overstatement (see the RELIC_* comment in cpu/data/greatPeople.ts).

Scripted play does reach the grant, and both rFaith and rTourism are compared
trace columns, so this lane pins what the gate cannot isolate: the exported
constants, the placement rules and the _MUTABLE round-trip.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES
from core.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)

    # --- 1) sourced constants, and the building really is the TEMPLE --------
    assert sim._relic_slots == 1, f"a Temple holds ONE relic, got {sim._relic_slots}"
    assert sim._relic_faith == 4, f"a relic pays 4 faith, got {sim._relic_faith}"
    assert sim._relic_tour == 8, f"a relic pays 8 tourism, got {sim._relic_tour}"
    names = [b["id"] for b in rj["buildings"]]
    assert sim._relic_bidx >= 0, "relicBidx must be exported"
    assert names[sim._relic_bidx] == "TEMPLE", f"relic slot building is {names[sim._relic_bidx]}, want TEMPLE"

    # --- 2) _MUTABLE registration + snapshot/restore ------------------------
    # ONE `city_relics` plane, addressed by row. The seat-0 and civ family
    # views are gone (#111): a second name for a fact is what let a fork look
    # like two different expressions, so their absence is the assertion.
    assert "city_relics" in _MUTABLE, "city_relics must be registered in _MUTABLE"
    for f in ("relics", "civ_city_relics"):
        assert not hasattr(sim, f), f"{f} is a resurrected view of city_relics — address the row"
        assert f not in _MUTABLE, f"{f} is not a plane"
    sim.city_relics[:, 0, 0] = 1
    snap = sim.snapshot()
    sim.city_relics[:, 0, 0] = 0
    sim.restore(snap)
    assert int(sim.city_relics[0, 0, 0]) == 1, "relics must survive snapshot/restore"
    sim.city_relics[:, 0, 0] = 0

    # --- 3) placement: LOWEST city holding a temple with a free slot --------
    b = sim._relic_bidx
    sim.city_relics[:, 0].zero_()
    sim.city_bldg[:, 0, :, b] = False
    sim.city_alive[:, 0, :] = True
    sim.city_bldg[:, 0, 1, b] = True  # only city 1 has a temple
    sim.city_bldg[:, 0, 2, b] = True  # ... and city 2
    rows = torch.zeros(1, dtype=torch.long)
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.city_relics[0, 0, 0]) == 0, "a city with no temple must be skipped"
    assert int(sim.city_relics[0, 0, 1]) == 1, "the LOWEST temple city takes the relic"
    assert int(sim.city_relics[0, 0, 2]) == 0, "later temple cities are untouched"

    # a FULL slot is skipped for the next city
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.city_relics[0, 0, 1]) == 1, "a full slot must not overfill"
    assert int(sim.city_relics[0, 0, 2]) == 1, "the next open temple takes it"

    # no open slot anywhere -> the relic is LOST (no crash, no overfill)
    before = int(sim.city_relics[:, 0].sum())
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.city_relics[:, 0].sum()) == before, "a relic with no slot must be dropped, not stuffed"

    # a DEAD city is not a home
    sim.city_relics[:, 0].zero_()
    sim.city_alive[:, 0, 1] = False
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.city_relics[0, 0, 1]) == 0, "a dead city must never hold a relic"
    assert int(sim.city_relics[0, 0, 2]) == 1, "placement falls through to the next live temple city"

    # --- 4) the tourism term actually counts relics ------------------------
    s2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    era = s2._civ_era(s2.civ_techs[:, 0], s2.civ_civics[:, 0])
    base = s2._tourism_of(s2.city_gw_writing[:, 0], s2.city_gw_art[:, 0], s2.city_gw_music[:, 0], s2.city_alive[:, 0], s2.owner >= 0, era)
    s2.city_alive[:, 0, 0] = True
    s2.city_relics[:, 0].zero_()
    s2.city_relics[:, 0, 0] = 2
    with_relics = s2._tourism_of(s2.city_gw_writing[:, 0], s2.city_gw_art[:, 0], s2.city_gw_music[:, 0], s2.city_alive[:, 0], s2.owner >= 0, era, s2.city_relics[:, 0])
    assert int(with_relics[0] - base[0]) == 2 * s2._relic_tour, (
        f"two relics must add {2 * s2._relic_tour} tourism, got {int(with_relics[0] - base[0])}"
    )
    # ... and a DEAD city's relics pay nothing
    s2.city_alive[:, 0, 0] = False
    dead = s2._tourism_of(s2.city_gw_writing[:, 0], s2.city_gw_art[:, 0], s2.city_gw_music[:, 0], s2.city_alive[:, 0], s2.owner >= 0, era, s2.city_relics[:, 0])
    assert int(dead[0] - base[0]) == 0, "a lost city must stop paying relic tourism"

    # --- 5) the works SURVIVE a transfer and a slot compaction --------------
    # Real Civ 6: the victor gains the Great Works held in a captured city.
    #   a. _transfer_city must clear EVERY work plane on the receiving slot
    #      and carry the source's across, or the new city inherits whatever the
    #      REUSED slot index still holds from a dead occupant.
    #   b. _CITY_SLOT_FIELDS must name every work plane, or a compaction leaves
    #      one behind at the old index.
    s3 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    if s3.R >= 2 and int(s3.city_alive[0, 1].sum()) >= 1:
        j = int(s3.city_alive[0, 1].nonzero()[0])
        s3.city_relics[0, 1, j] = 1
        s3.city_gw_art[0, 1, j] = 2
        s3.city_gw_writing[0, 1, j] = 3
        s3.city_gw_music[0, 1, j] = 1
        # plant a ghost in the slot the receiver will land on, so "carried"
        # cannot be confused with "inherited the reused slot's leftovers"
        occ = s3.city_alive[0, 2].nonzero().flatten()
        dest = int(occ.max()) + 1 if len(occ) else 0
        if dest < s3.RC:
            s3.city_relics[0, 2, dest] = 7
            s3.city_gw_art[0, 2, dest] = 7
            s3._transfer_city(0, 1, j, 2, conquest=False)
            assert int(s3.city_relics[0, 2, dest]) == 1, (
                f"the flipped city must carry its ONE relic, got {int(s3.city_relics[0, 2, dest])} "
                "(7 means the receiving slot kept a dead city's ghost)"
            )
            assert int(s3.city_gw_art[0, 2, dest]) == 2, "art must ride the transfer"
            assert int(s3.city_gw_writing[0, 2, dest]) == 3, "writing must ride the transfer"
            assert int(s3.city_gw_music[0, 2, dest]) == 1, "music must ride the transfer"
            assert int(s3.city_relics[0, 1, j]) == 0, "the dead source slot must not keep a relic"
            assert int(s3.city_gw_art[0, 1, j]) == 0, "the dead source slot must not keep art"
            print("  #79a works+relics ride the rc->rc transfer, source slot cleared OK")

    # b. compaction must permute ALL FOUR planes with their city.
    s4 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    for nm in ("city_gw_writing", "city_gw_art", "city_gw_music", "city_relics", "city_artifacts"):
        assert nm in s4._CITY_SLOT_FIELDS, f"{nm} missing from _CITY_SLOT_FIELDS — compaction drops it"
    # SCAN for a civ holding two cities rather than assuming fixture 0 does —
    # a poke that silently skips proves nothing. Civs start on a single
    # capital, so STEP until one has settled a second city; checking at t0
    # finds nothing and would skip the case entirely.
    civ_only_pick = -1
    for p in paths[:4]:
        s4 = BatchSim([load_fixture(p)], rules, device="cpu", dtype=torch.float64)
        for _ in range(60):
            s4.step()
            for r in range(s4.R):
                if int(s4.city_alive[0, r + 1].sum()) >= 2:
                    civ_only_pick = r
                    break
            if civ_only_pick >= 0:
                break
        if civ_only_pick >= 0:
            break
    assert civ_only_pick >= 0, "no fixture reaches a civ with two cities — cannot exercise compaction"
    if True:
        live = s4.city_alive[0, civ_only_pick + 1].nonzero().flatten().tolist()
        lo, hi = live[0], live[1]
        s4.city_relics[0, civ_only_pick + 1, hi] = 5
        s4.city_gw_art[0, civ_only_pick + 1, hi] = 4
        keep_id = int(s4.city_id[0, civ_only_pick + 1, hi])
        s4.city_alive[0, civ_only_pick + 1, lo] = False  # kill the lower slot -> `hi` compacts down
        s4._reclaim_cities()
        where = (s4.city_alive[0, civ_only_pick + 1] & (s4.city_id[0, civ_only_pick + 1] == keep_id)).nonzero().flatten()
        assert len(where) == 1, "the surviving city vanished from the registry"
        k = int(where[0])
        assert int(s4.city_relics[0, civ_only_pick + 1, k]) == 5, (
            f"the relic must follow its city through compaction (slot {hi}->{k}), "
            f"got {int(s4.city_relics[0, civ_only_pick + 1, k])}"
        )
        assert int(s4.city_gw_art[0, civ_only_pick + 1, k]) == 4, "art must follow its city through compaction"
        print("  #79b all four work planes ride the slot compaction OK")

    print("relics OK — constants, placement, dead-city masking, tourism term, _MUTABLE, #79 transfer+compaction")


if __name__ == "__main__":
    main()
