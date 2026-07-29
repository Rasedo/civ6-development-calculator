"""B-20 (#73) RELICS self-test — the GPU twin of tests/relics.test.ts.

Real Civ 6 counts a Relic as a Great Work held in a TEMPLE's single slot,
paying +4 Faith and +8 Tourism (the densest tourism source in the game). A
relic is created when an Apostle killed in theological combat carried the
MARTYR promotion; promotions are unmodeled and `theologicalCombat` is
deliberately zero-draw, so every APOSTLE killed there martyrs — a recorded
overstatement (see the RELIC_* comment in src/data/greatPeople.ts).

MEASURED reachable, unlike most of B-20's other residuals: 26 relics are held
at t250 across 4 of the 24 scripted seeds, lifting the tourism ceiling from 7
visiting tourists to 12. So scripted parity really does exercise the grant, and
both rFaith and rTourism are compared trace columns. This lane pins what the
gate cannot isolate: the exported constants, the placement rules and the
_MUTABLE round-trip.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)

    # --- 1) sourced constants, and the building really is the TEMPLE --------
    assert sim._relic_slots == 1, f"a Temple holds ONE relic, got {sim._relic_slots}"
    assert sim._relic_faith == 4, f"a relic pays 4 faith, got {sim._relic_faith}"
    assert sim._relic_tour == 8, f"a relic pays 8 tourism, got {sim._relic_tour}"
    names = [b["id"] for b in rj["buildings"]]
    assert sim._relic_bidx >= 0, "relicBidx must be exported"
    assert names[sim._relic_bidx] == "TEMPLE", f"relic slot building is {names[sim._relic_bidx]}, want TEMPLE"

    # --- 2) _MUTABLE registration + snapshot/restore ------------------------
    for f in ("relics", "rc_relics"):
        assert f in _MUTABLE, f"{f} must be registered in _MUTABLE"
    sim.relics[:, 0] = 1
    snap = sim.snapshot()
    sim.relics[:, 0] = 0
    sim.restore(snap)
    assert int(sim.relics[0, 0]) == 1, "relics must survive snapshot/restore"
    sim.relics[:, 0] = 0

    # --- 3) placement: LOWEST city holding a temple with a free slot --------
    b = sim._relic_bidx
    sim.relics.zero_()
    sim.buildings[:, :, b] = False
    sim.alive[:, :] = True
    sim.buildings[:, 1, b] = True  # only city 1 has a temple
    sim.buildings[:, 2, b] = True  # ... and city 2
    rows = torch.zeros(1, dtype=torch.long)
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.relics[0, 0]) == 0, "a city with no temple must be skipped"
    assert int(sim.relics[0, 1]) == 1, "the LOWEST temple city takes the relic"
    assert int(sim.relics[0, 2]) == 0, "later temple cities are untouched"

    # a FULL slot is skipped for the next city
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.relics[0, 1]) == 1, "a full slot must not overfill"
    assert int(sim.relics[0, 2]) == 1, "the next open temple takes it"

    # no open slot anywhere -> the relic is LOST (no crash, no overfill)
    before = int(sim.relics.sum())
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.relics.sum()) == before, "a relic with no slot must be dropped, not stuffed"

    # a DEAD city is not a home
    sim.relics.zero_()
    sim.alive[:, 1] = False
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.relics[0, 1]) == 0, "a dead city must never hold a relic"
    assert int(sim.relics[0, 2]) == 1, "placement falls through to the next live temple city"

    # --- 4) the tourism term actually counts relics ------------------------
    s2 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    era = s2._civ_era(s2.techs, s2.civics)
    base = s2._tourism_of(s2.gw_writing, s2.gw_art, s2.gw_music, s2.alive, s2.owner >= 0, era)
    s2.alive[:, 0] = True
    s2.relics.zero_()
    s2.relics[:, 0] = 2
    with_relics = s2._tourism_of(s2.gw_writing, s2.gw_art, s2.gw_music, s2.alive, s2.owner >= 0, era, s2.relics)
    assert int(with_relics[0] - base[0]) == 2 * s2._relic_tour, (
        f"two relics must add {2 * s2._relic_tour} tourism, got {int(with_relics[0] - base[0])}"
    )
    # ... and a DEAD city's relics pay nothing (the #71 alive-mask lesson)
    s2.alive[:, 0] = False
    dead = s2._tourism_of(s2.gw_writing, s2.gw_art, s2.gw_music, s2.alive, s2.owner >= 0, era, s2.relics)
    assert int(dead[0] - base[0]) == 0, "a lost city must stop paying relic tourism"

    # --- 5) #79: the works SURVIVE a transfer and a slot compaction ---------
    # Both bugs this pins were invisible to every existing lane and to scripted
    # parity; they surfaced only in the 24-seed replay, as a 2.85 rGScore gap
    # (one relic = 4 faith x 0.95 amenity x 0.75 score weight). Real Civ 6: the
    # victor gains the Great Works held in a captured city.
    #   a. _transfer_rc_to_rc zeroed rc_gw_writing/music on the RECEIVING slot
    #      and never touched rc_gw_art/rc_relics, so the new city inherited
    #      whatever the REUSED slot index still held from a dead occupant.
    #   b. _RC_SLOT_FIELDS listed writing and music but not art or relics, so a
    #      compaction left those two behind at the old index.
    s3 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    if s3.R >= 2 and int(s3.rc_alive[0, 0].sum()) >= 1:
        j = int(s3.rc_alive[0, 0].nonzero()[0])
        s3.rc_relics[0, 0, j] = 1
        s3.rc_gw_art[0, 0, j] = 2
        s3.rc_gw_writing[0, 0, j] = 3
        s3.rc_gw_music[0, 0, j] = 1
        # plant a ghost in the slot the receiver will land on, so "carried"
        # cannot be confused with "inherited the reused slot's leftovers"
        occ = s3.rc_alive[0, 1].nonzero().flatten()
        dest = int(occ.max()) + 1 if len(occ) else 0
        if dest < s3.RC:
            s3.rc_relics[0, 1, dest] = 7
            s3.rc_gw_art[0, 1, dest] = 7
            s3._transfer_rc_to_rc(0, 0, j, 1)
            assert int(s3.rc_relics[0, 1, dest]) == 1, (
                f"the flipped city must carry its ONE relic, got {int(s3.rc_relics[0, 1, dest])} "
                "(7 means the receiving slot kept a dead city's ghost)"
            )
            assert int(s3.rc_gw_art[0, 1, dest]) == 2, "art must ride the transfer"
            assert int(s3.rc_gw_writing[0, 1, dest]) == 3, "writing must ride the transfer"
            assert int(s3.rc_gw_music[0, 1, dest]) == 1, "music must ride the transfer"
            assert int(s3.rc_relics[0, 0, j]) == 0, "the dead source slot must not keep a relic"
            assert int(s3.rc_gw_art[0, 0, j]) == 0, "the dead source slot must not keep art"
            print("  #79a works+relics ride the rc->rc transfer, source slot cleared OK")

    # b. compaction must permute ALL FOUR planes with their city.
    s4 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    for nm in ("rc_gw_writing", "rc_gw_art", "rc_gw_music", "rc_relics", "rc_artifacts"):
        assert nm in s4._RC_SLOT_FIELDS, f"{nm} missing from _RC_SLOT_FIELDS — compaction drops it"
    # SCAN for a rival holding two cities rather than assuming fixture 0 does
    # (the watermill_test lesson: a poke that silently skips proves nothing).
    # Rivals start on a single capital, so STEP until one has settled a second
    # city — checking at t0 finds nothing and would skip the case entirely.
    r_pick = -1
    for p in paths[:4]:
        s4 = BatchSim([load_fixture(p)], rules, device="cpu", dtype=torch.float64)
        for _ in range(60):
            s4.step()
            for r in range(s4.R):
                if int(s4.rc_alive[0, r].sum()) >= 2:
                    r_pick = r
                    break
            if r_pick >= 0:
                break
        if r_pick >= 0:
            break
    assert r_pick >= 0, "no fixture reaches a rival with two cities — cannot exercise compaction"
    if True:
        live = s4.rc_alive[0, r_pick].nonzero().flatten().tolist()
        lo, hi = live[0], live[1]
        s4.rc_relics[0, r_pick, hi] = 5
        s4.rc_gw_art[0, r_pick, hi] = 4
        keep_id = int(s4.rc_id[0, r_pick, hi])
        s4.rc_alive[0, r_pick, lo] = False  # kill the lower slot -> `hi` compacts down
        s4._reclaim_rc()
        where = (s4.rc_alive[0, r_pick] & (s4.rc_id[0, r_pick] == keep_id)).nonzero().flatten()
        assert len(where) == 1, "the surviving city vanished from the registry"
        k = int(where[0])
        assert int(s4.rc_relics[0, r_pick, k]) == 5, (
            f"the relic must follow its city through compaction (slot {hi}->{k}), "
            f"got {int(s4.rc_relics[0, r_pick, k])}"
        )
        assert int(s4.rc_gw_art[0, r_pick, k]) == 4, "art must follow its city through compaction"
        print("  #79b all four work planes ride the slot compaction OK")

    print("relics OK — constants, placement, dead-city masking, tourism term, _MUTABLE, #79 transfer+compaction")


if __name__ == "__main__":
    main()
