"""RELICS self-test — the GPU twin of tests/cpu/culture/relics.test.ts.

Real Civ 6 counts a Relic as a Great Work held in a TEMPLE's single slot
(GREATWORKSLOT_RELIC), paying +4 Faith and +8 Tourism — the densest tourism
source in the game. A relic is created when an Apostle killed in theological
combat carried the MARTYR promotion. A wonder holds relics too (Mont St.
Michel 2, St. Basil's 3), in its own slots beside the Temple's.

Scripted play does reach the grant, and both rFaith and rTourism are compared
trace columns, so this lane pins what the gate cannot isolate: the exported
table, the placement rules, the reserve and the _MUTABLE round-trip.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core import simbase
from core.engine import _MUTABLE
from warmup import plant_city, settle_all, hold_works, works_of, clear_works

RELIC = 7
PLANES = ("city_gw_obj", "city_gw_maker", "city_gw_era", "city_gw_seat", "city_worked")


def main() -> None:
    rules = load_rules()
    gw = rules.seats["greatWorks"]
    ids = [h["id"] for h in gw["holders"]]
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    B = sim.B

    # --- the table ---------------------------------------------------------
    H_TEMPLE = ids.index("TEMPLE")
    assert gw["holders"][H_TEMPLE]["slots"] == 1, "a Temple holds ONE relic"
    assert gw["objFaith"][RELIC] == 4 and gw["objTourism"][RELIC] == 8 and gw["objCulture"][RELIC] == 0
    b = sim._gw_holder_bidx[H_TEMPLE]
    assert b >= 0, "the Temple must name its building column"
    for p in PLANES:
        assert p in _MUTABLE, f"{p} must be registered in _MUTABLE"
    old = [n for n in ("city_relics", "city_artifacts", "city_gw_writing", "city_gw_art", "city_gw_music") if hasattr(sim, n) or n in _MUTABLE]
    assert not old, f"resurrected counters: {old}"

    # --- snapshot / restore ----------------------------------------------
    hold_works(sim, 0, 0, 0, RELIC, 1)
    snap = sim.snapshot()
    clear_works(sim)
    sim.restore(snap)
    assert works_of(sim, 0, 0, 0, [RELIC]) == 1, "relics must survive snapshot/restore"
    clear_works(sim)

    # the capital's own Palace slot takes a relic too; these scenes read the
    # Temple alone
    sim.city_is_cap[:, 0, :] = False
    sim._eff_version += 1

    # --- placement: lowest city with an open TEMPLE slot ------------------
    sim.city_bldg[:, 0, :, b] = False
    sim.city_alive[:, 0, :] = True
    sim.city_bldg[:, 0, 1, b] = True  # only city 1 has a temple
    sim.city_bldg[:, 0, 2, b] = True  # ... and city 2
    rows = torch.zeros(1, dtype=torch.long)
    seat0 = torch.zeros(1, dtype=torch.long)
    sim._grant_relic(rows, seat0)
    assert [works_of(sim, 0, 0, c, [RELIC]) for c in range(3)] == [0, 1, 0], "the LOWEST temple city takes the relic"
    sim._grant_relic(rows, seat0)
    assert [works_of(sim, 0, 0, c, [RELIC]) for c in range(3)] == [0, 1, 1], "a full slot must not overfill; the next open temple takes it"
    sim.civ_relic_reserve[:, 0] = 0
    sim._grant_relic(rows, seat0)
    assert [works_of(sim, 0, 0, c, [RELIC]) for c in range(3)] == [0, 1, 1], "a relic with no slot must not be stuffed"
    assert int(sim.civ_relic_reserve[0, 0]) == 1, "... it is HELD"
    clear_works(sim)
    sim.civ_relic_reserve[:, 0] = 0
    sim.city_alive[:, 0, 1] = False
    sim._grant_relic(rows, seat0)
    assert works_of(sim, 0, 0, 1, [RELIC]) == 0, "a dead city must never hold a relic"
    assert works_of(sim, 0, 0, 2, [RELIC]) == 1, "placement falls through to the next live temple city"

    # --- a wonder holds relics in a city with NO temple ------------------
    H_SB = ids.index("ST_BASILS_CATHEDRAL")
    wi = sim._gw_holder_widx[H_SB]
    nslot = gw["holders"][H_SB]["slots"]
    assert nslot == 3
    clear_works(sim)
    sim.city_bldg[:, 0, :, b] = False
    sim.city_alive[:, 0, :] = True
    sim.city_wonder[:, 0, :, :] = -1
    t0 = int(sim.city_center[0, 0, 0])
    sim.city_wonder[:, 0, 0, wi] = t0
    sim.built_wonder_complete[:, t0] = True
    sim._eff_version += 1
    assert bool(sim._gw_room(0, RELIC)[0, 0]), "a temple-less wonder city must hold a relic"
    for _ in range(nslot):
        sim._grant_relic(rows, seat0)
    assert works_of(sim, 0, 0, 0, [RELIC]) == nslot, f"the wonder's {nslot} slots must all fill"
    sb_slots = (sim._gw_slot_holder == H_SB).nonzero(as_tuple=True)[0].tolist()
    assert (sim.city_gw_obj[0, 0, 0] == RELIC).nonzero().flatten().tolist() == sb_slots, "in the wonder's OWN slots"
    assert not bool(sim._gw_room(0, RELIC)[0, 0]), "the wonder's capacity must still run out"
    sim.built_wonder_complete[:, t0] = False
    sim._eff_version += 1
    clear_works(sim)
    assert not bool(sim._gw_room(0, RELIC)[0, 0]), "an unfinished wonder must grant no slot"
    sim.built_wonder_complete[:, t0] = True
    sim.city_bldg[:, 0, 0, b] = True
    sim._eff_version += 1
    for _ in range(nslot + 1):
        sim._grant_relic(rows, seat0)
    assert works_of(sim, 0, 0, 0, [RELIC]) == nslot + 1, "temple slots must ADD to the wonder's"
    print(f"  wonder relic slots OK — {nslot} from St. Basil's, additive with the Temple")

    # --- the RESERVE: held when shut, drained first city first --------------
    s6 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    s6.city_is_cap[:, 0, :] = False
    s6.city_bldg[:, 0, :, b] = False        # no Temple anywhere
    s6.city_wonder[:, 0, :, :] = -1
    s6.city_alive[:, 0, :] = True
    s6.civ_relic_reserve[:, 0] = 0
    s6._eff_version += 1
    s6._grant_relic(rows, seat0)
    assert int(s6.civ_relic_reserve[0, 0]) == 1, "a relic with no slot must be HELD"
    assert works_of(s6, 0, 0, 0, [RELIC]) == 0, "nothing must be placed while every slot is shut"
    act = torch.ones(B, dtype=torch.bool)
    s6._drain_relic_reserve(0, act)
    assert int(s6.civ_relic_reserve[0, 0]) == 1, "the drain must not invent capacity"
    s6.civ_relic_reserve[:, 0] = 3
    s6.city_bldg[:, 0, 0, b] = True
    s6.city_bldg[:, 0, 1, b] = True
    s6._eff_version += 1
    s6._drain_relic_reserve(0, act)
    assert works_of(s6, 0, 0, 0, [RELIC]) == 1 and works_of(s6, 0, 0, 1, [RELIC]) == 1, "both open slots must fill"
    assert int(s6.civ_relic_reserve[0, 0]) == 1, "one relic must still be held"
    s6._drain_relic_reserve(0, torch.zeros(B, dtype=torch.bool))
    assert int(s6.civ_relic_reserve[0, 0]) == 1, "an inactive seat must not drain"
    assert "civ_relic_reserve" in _MUTABLE
    print("  relic reserve OK — held when shut, drained lowest city first, active-gated")

    # --- the religious tourism term ------------------------------------------
    s2 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    base = s2._tourism_religious_of(0)
    s2.city_alive[:, 0, 0] = True
    hold_works(s2, 0, 0, 0, RELIC, 2)
    with_relics = s2._tourism_religious_of(0)
    assert int(with_relics[0] - base[0]) == 2 * 8, f"two relics must add 16 tourism, got {int(with_relics[0] - base[0])}"
    _c, fai = s2._gw_yields(0)
    assert float(fai[0, 0]) == 8.0 and float(_c[0, 0]) == 0.0, "two relics pay 8 faith and no culture"
    s2.city_alive[:, 0, 0] = False
    dead = s2._tourism_religious_of(0)
    assert int(dead[0] - base[0]) == 0, "a lost city must stop paying relic tourism"

    # --- the transfer carries the works, provenance and all ------------------
    s3 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    if s3.n_majors >= 3 and int(s3.city_alive[0, 1].sum()) >= 1:
        j = int(s3.city_alive[0, 1].nonzero()[0])
        hold_works(s3, 0, 1, j, RELIC, 1)
        hold_works(s3, 0, 1, j, 0, 2, maker=2)
        hold_works(s3, 0, 1, j, 5, 3, maker=4)
        occ = s3.city_alive[0, 2].nonzero().flatten()
        dest = int(occ.max()) + 1 if len(occ) else 0
        if dest < s3.RC:
            hold_works(s3, 0, 2, dest, 0, 2)  # a dead slot's ghost
            before = [getattr(s3, p)[0, 1, j].clone() for p in PLANES]
            s3._transfer_city(0, 1, j, 2, conquest=False)
            for p, v in zip(PLANES, before):
                assert torch.equal(getattr(s3, p)[0, 2, dest], v), f"{p} must ride the transfer slot for slot"
                assert bool((getattr(s3, p)[0, 1, j] == -1).all()), f"the dead source slot must not keep {p}"
            print("  works ride the rc->rc transfer, source slot cleared OK")

    # --- compaction ----------------------------------------------------------
    s4 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for nm in PLANES:
        assert nm in simbase._MUTABLE and getattr(s4, nm).shape[2] == s4.RC, f"{nm} does not ride the derived city compaction"
    row = 1
    plant_city(s4, row)
    live = s4.city_alive[0, row].nonzero().flatten().tolist()
    assert len(live) >= 2, "plant_city must leave the row with two cities"
    lo, hi = live[0], live[1]
    hold_works(s4, 0, row, hi, RELIC, 2)
    hold_works(s4, 0, row, hi, 1, 3, maker=11)
    keep_id = int(s4.city_id[0, row, hi])
    # the worked-tile pick is a per-CITY fact and rides the same
    # permutation. A 24-seed serve lane caught it when it did not — one city
    # reported the pick of whichever city compaction had moved into its slot.
    s4.city_worked[0, row, hi, :3] = torch.tensor([11, 22, 33])
    s4.city_alive[0, row, lo] = False  # kill the lower slot -> `hi` compacts down
    s4._reclaim_cities()
    where = (s4.city_alive[0, row] & (s4.city_id[0, row] == keep_id)).nonzero().flatten()
    assert len(where) == 1, "the surviving city vanished from the registry"
    k = int(where[0])
    assert works_of(s4, 0, row, k, [RELIC]) == 2 and works_of(s4, 0, row, k, [1]) == 3, "the works must follow their city through compaction"
    assert s4.city_worked[0, row, k, :3].tolist() == [11, 22, 33], (
        "the worked-tile pick must follow its city through compaction")
    print("  the work planes ride the slot compaction OK")
    print("BATTERY OK relics")


if __name__ == "__main__":
    main()
