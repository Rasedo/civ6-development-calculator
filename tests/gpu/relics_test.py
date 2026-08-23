"""RELICS self-test — the GPU twin of tests/cpu/culture/relics.test.ts.

Real Civ 6 counts a Relic as a Great Work held in a TEMPLE's single slot,
paying +4 Faith and +8 Tourism (the densest tourism source in the game). A
relic is created when an Apostle killed in theological combat carried the
MARTYR promotion, one of the nine it chose from at purchase. A wonder can hold
relics too (`RELIC_WONDER_SLOTS`), additive with the Temple's.

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
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core import simbase, FIXTURES
from core.engine import _MUTABLE
from warmup import plant_city, settle_all


def main() -> None:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))

    # --- 1) sourced constants, and the building really is the TEMPLE --------
    assert sim._relic_slots == 1, f"a Temple holds ONE relic, got {sim._relic_slots}"
    assert sim._relic_faith == 4, f"a relic pays 4 faith, got {sim._relic_faith}"
    assert sim._relic_tour == 8, f"a relic pays 8 tourism, got {sim._relic_tour}"
    names = [b["id"] for b in rj["buildings"]]
    assert sim._relic_bidx >= 0, "relicBidx must be exported"
    assert names[sim._relic_bidx] == "TEMPLE", f"relic slot building is {names[sim._relic_bidx]}, want TEMPLE"

    # --- 2) _MUTABLE registration + snapshot/restore ------------------------
    # ONE `city_relics` plane, addressed by row. The seat-0 and civ family
    # views are gone: a second name for a fact is what let a fork look
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

    # --- 3b) a WONDER adds relic slots, and holds them with no Temple ------
    # CIV6: St. Basil's Cathedral +3 Relic slots, Mont St. Michel 2. The
    # capacity is the Temple's slots PLUS every complete wonder the city holds,
    # which is the `placeRelic` expression.
    wrelic = sim._wond_relic.tolist()
    assert sum(wrelic) > 0, "no wonder exports a relic slot — RELIC_WONDER_SLOTS never reached the wire"
    wi = int(torch.tensor(wrelic).argmax())
    nslot = wrelic[wi]
    sim.city_relics[:, 0].zero_()
    sim.city_bldg[:, 0, :, b] = False
    sim.city_alive[:, 0, :] = True
    sim.city_wonder[:, 0, :, :] = -1
    # city 0 holds the wonder and NO temple; park it on a tile marked complete
    t0 = int(sim.city_center[0, 0, 0])
    sim.city_wonder[:, 0, 0, wi] = t0
    sim.built_wonder_complete[:, t0] = True
    cap = sim._relic_cap()
    assert int(cap[0, 0, 0]) == nslot, f"a temple-less wonder city must hold {nslot}, got {int(cap[0, 0, 0])}"
    for _ in range(nslot):
        sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.city_relics[0, 0, 0]) == nslot, (
        f"the wonder's {nslot} slots must all fill, got {int(sim.city_relics[0, 0, 0])}"
    )
    before = int(sim.city_relics[:, 0].sum())
    sim._grant_relic(rows, torch.zeros(1, dtype=torch.long))
    assert int(sim.city_relics[:, 0].sum()) == before, "the wonder's capacity must still run out"
    # ... and an INCOMPLETE wonder grants nothing
    sim.built_wonder_complete[:, t0] = False
    assert int(sim._relic_cap()[0, 0, 0]) == 0, "an unfinished wonder must grant no slot"
    # ... and a TEMPLE stacks on top of it
    sim.built_wonder_complete[:, t0] = True
    sim.city_bldg[:, 0, 0, b] = True
    assert int(sim._relic_cap()[0, 0, 0]) == nslot + sim._relic_slots, "temple slots must ADD to the wonder's"
    print(f"  wonder relic slots OK — {nslot} from wonder {wi}, additive with the Temple")

    # --- 3c) a homeless relic is HELD, and drains when a slot opens --------
    # CIV6: a Relic with no open slot waits in reserve rather than vanishing.
    s6 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    s6.city_relics[:, 0].zero_()
    s6.city_bldg[:, 0, :, b] = False        # no Temple anywhere
    s6.city_wonder[:, 0, :, :] = -1
    s6.city_alive[:, 0, :] = True
    s6.civ_relic_reserve[:, 0] = 0
    r0 = torch.zeros(1, dtype=torch.long)
    s6._grant_relic(r0, torch.zeros(1, dtype=torch.long))
    assert int(s6.civ_relic_reserve[0, 0]) == 1, (
        f"a relic with no slot must be HELD, reserve is {int(s6.civ_relic_reserve[0, 0])}"
    )
    assert int(s6.city_relics[0, 0].sum()) == 0, "nothing must be placed while every slot is shut"
    # a shut seat drains nothing
    act = torch.ones(s6.B, dtype=torch.bool)
    s6._drain_relic_reserve(0, act)
    assert int(s6.civ_relic_reserve[0, 0]) == 1, "the drain must not invent capacity"
    # two Temples open -> the reserve empties lowest city first
    s6.civ_relic_reserve[:, 0] = 3
    s6.city_bldg[:, 0, 0, b] = True
    s6.city_bldg[:, 0, 1, b] = True
    s6._drain_relic_reserve(0, act)
    assert int(s6.city_relics[0, 0, 0]) == 1 and int(s6.city_relics[0, 0, 1]) == 1, (
        f"both open slots must fill, got {s6.city_relics[0, 0, :2].tolist()}"
    )
    assert int(s6.civ_relic_reserve[0, 0]) == 1, (
        f"one relic must still be held, reserve is {int(s6.civ_relic_reserve[0, 0])}"
    )
    # an INACTIVE row is skipped entirely
    s6._drain_relic_reserve(0, torch.zeros(s6.B, dtype=torch.bool))
    assert int(s6.civ_relic_reserve[0, 0]) == 1, "an inactive seat must not drain"
    assert "civ_relic_reserve" in _MUTABLE, "civ_relic_reserve must be registered in _MUTABLE"
    print("  relic reserve OK — held when shut, drained lowest city first, active-gated")

    # --- 4) the RELIGIOUS tourism term actually counts relics ---------------
    # relics live in the religious bank (`_tourism_religious_of`), the half a
    # rival's Enlightenment can halve at the culture-victory read.
    s2 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    base = s2._tourism_religious_of(0)
    s2.city_alive[:, 0, 0] = True
    s2.city_relics[:, 0].zero_()
    s2.city_relics[:, 0, 0] = 2
    with_relics = s2._tourism_religious_of(0)
    assert int(with_relics[0] - base[0]) == 2 * s2._relic_tour, (
        f"two relics must add {2 * s2._relic_tour} tourism, got {int(with_relics[0] - base[0])}"
    )
    # ... and a DEAD city's relics pay nothing
    s2.city_alive[:, 0, 0] = False
    dead = s2._tourism_religious_of(0)
    assert int(dead[0] - base[0]) == 0, "a lost city must stop paying relic tourism"

    # --- 5) the works SURVIVE a transfer and a slot compaction --------------
    # Real Civ 6: the victor gains the Great Works held in a captured city.
    #   a. _transfer_city must clear EVERY work plane on the receiving slot
    #      and carry the source's across, or the new city inherits whatever the
    #      REUSED slot index still holds from a dead occupant.
    #   b. the derived compaction must ride every work plane, or one leaves
    #      one behind at the old index.
    s3 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    if s3.n_majors >= 3 and int(s3.city_alive[0, 1].sum()) >= 1:
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
            print("  works+relics ride the rc->rc transfer, source slot cleared OK")

    # b. compaction must permute ALL FOUR planes with their city — the ride
    # list is DERIVED from _MUTABLE by geometry, so membership there is the bar.
    s4 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for nm in ("city_gw_writing", "city_gw_art", "city_gw_music", "city_relics", "city_artifacts"):
        assert nm in simbase._MUTABLE and getattr(s4, nm).shape[2] == s4.RC,             f"{nm} does not ride the derived city compaction"
    # A civ holding two cities, through the engine's own FOUND verb — no seed
    # gamble, no bare stepping (a stepped world never develops on its own).
    row = 1
    plant_city(s4, row)
    live = s4.city_alive[0, row].nonzero().flatten().tolist()
    assert len(live) >= 2, "plant_city must leave the row with two cities"
    lo, hi = live[0], live[1]
    s4.city_relics[0, row, hi] = 5
    s4.city_gw_art[0, row, hi] = 4
    keep_id = int(s4.city_id[0, row, hi])
    s4.city_alive[0, row, lo] = False  # kill the lower slot -> `hi` compacts down
    s4._reclaim_cities()
    where = (s4.city_alive[0, row] & (s4.city_id[0, row] == keep_id)).nonzero().flatten()
    assert len(where) == 1, "the surviving city vanished from the registry"
    k = int(where[0])
    assert int(s4.city_relics[0, row, k]) == 5, (
        f"the relic must follow its city through compaction (slot {hi}->{k}), "
        f"got {int(s4.city_relics[0, row, k])}"
    )
    assert int(s4.city_gw_art[0, row, k]) == 4, "art must follow its city through compaction"
    print("  all four work planes ride the slot compaction OK")

    print("relics OK — constants, placement, wonder slots, dead-city masking, tourism term, _MUTABLE, transfer+compaction")


if __name__ == "__main__":
    main()
