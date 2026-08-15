"""Great Works pokes.

Covers paths the scripted rollout reaches rarely (an AMPHITHEATER + an earned
WRITER inside 250t is uncommon; MUSEUM even rarer):
  * exporter contract: the per-KIND tables — gwClsByKind / gwBidxByKind /
    gwSlotsByKind / gwWorksByKind / gwCultureByKind, on the REAL Civ 6 mapping
    (Amphitheater 2, Art Museum 3, Broadcast Center 1);
  * per-city tensors (gw_writing/gw_art/gw_music + the rc_ twins) exist
    with matched shapes and round-trip through snapshot()/restore() (_MUTABLE);
  * _place_works(row, ...): deterministic lowest-city then
    lowest-slot fill into the matching building, cap at that kind's slots,
    overflow charges degrade to the instant culture lump;
  * the per-work culture/turn building-tier yield is LIVE and
    version-invalidated (adding a work raises the city's culture yield,
    linearly per work);
  * WRITER/MUSICIAN earned through _advance_great_people apply NO instant
    civic lump when a slot exists;
  * _reclaim_cities carries a city's works with it through slot compaction.

Follows the religion_gp_test pattern: load rules + a fixture, drive the GPU
BatchSim, assert on its internal tensors.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    rr = rules.seats

    # --- exporter contract -------------------------------------------------
    wc, ac, mc = rr["gwClsByKind"]
    assert wc == 7 and mc == 8, f"WRITER/MUSICIAN class indices: {wc}/{mc}"
    amph, museum, broadcast = rr["gwBidxByKind"]
    assert amph >= 0, "AMPHITHEATER must exist in the building catalog (writing slots)"
    assert museum >= 0, "MUSEUM must exist in the building catalog (music slots)"
    assert amph != museum, "writing and music must use distinct building columns"
    # the REAL Civ 6 slot/work counts, per kind.
    assert rr["gwSlotsByKind"] == [2, 3, 1], rr["gwSlotsByKind"]
    assert rr["gwWorksByKind"] == [2, 3, 2], rr["gwWorksByKind"]
    assert rr["gwTourismByKind"] == [2, 2, 4], rr["gwTourismByKind"]
    # per-KIND culture (real GS values): no uniform per-work key, and no gold
    # key at all — no Great Work pays gold in Civ 6.
    assert "gwWorkCulture" not in rr, "the uniform per-work culture key must be gone"
    assert rr["gwCultureByKind"] == [2, 2, 4], rr["gwCultureByKind"]
    assert not any("gold" in k.lower() for k in rr if k.startswith("gw")), \
        "no Great Work pays gold — a gw*Gold key would be a fidelity regression"

    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run the exporter first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    B, C, RC = sim.B, sim.RC, sim.RC
    assert sim._gw_cls == [wc, ac, mc], sim._gw_cls
    assert sim._gw_bidx == [amph, museum, broadcast]

    # --- tensor shapes -----------------------------------------------------
    assert sim.city_gw_writing[:, 0].shape == (B, C) and sim.city_gw_art[:, 0].shape == (B, C) and sim.city_gw_music[:, 0].shape == (B, C)
    assert sim.city_gw_writing[:, 1:sim.n_majors].shape == sim.city_alive[:, 1:sim.n_majors].shape
    assert sim.city_gw_music[:, 1:sim.n_majors].shape == sim.city_alive[:, 1:sim.n_majors].shape
    assert sim.city_gw_art[:, 1:sim.n_majors].shape == sim.city_alive[:, 1:sim.n_majors].shape
    assert bool((sim.city_gw_writing[:, 0] == 0).all()) and bool((sim.city_gw_writing[:, 1:sim.n_majors] == 0).all()), "fresh: no works"

    if not sim.districts_on:
        print("GREAT-WORKS OK (districts off — placement paths skipped)")
        return

    # --- _place_works row 0: single Writer fills 2 Amphitheater slots ------
    assert bool(sim.city_alive[:, 0, 0].all()), "fixture capital (city 0) must be alive"
    sim.city_gw_writing[:, 0].zero_(); sim.city_gw_art[:, 0].zero_(); sim.city_gw_music[:, 0].zero_()
    sim.city_bldg[:, 0, 0, amph] = True  # capital gets an Amphitheater
    civic0 = sim.civ_civic_prog[:, 0].clone()
    ver0 = sim._eff_version
    cval = torch.full((B,), 45.0, dtype=torch.float64)  # Li Bai's culture value
    sim._place_works(0, torch.ones(B, dtype=torch.bool), cval, 0)
    assert bool((sim.city_gw_writing[:, 0, 0] == 2).all()), "both works must slot into the Amphitheater"
    assert bool((sim.civ_civic_prog[:, 0] == civic0).all()), "a fully-slotted Writer applies NO instant lump"
    assert sim._eff_version > ver0, "a slot write must bump _eff_version (yield-bearing state)"

    # --- overflow: a second Writer finds no open slot -> instant lump -------
    civic1 = sim.civ_civic_prog[:, 0].clone()
    sim._place_works(0, torch.ones(B, dtype=torch.bool), cval, 0)
    assert bool((sim.city_gw_writing[:, 0, 0] == 2).all()), "slots stay capped at gwSlots (2)"
    assert bool((sim.civ_civic_prog[:, 0] - civic1 == 90.0).all()), "both overflow charges -> 2 x 45 lump"

    # --- deterministic order: lowest city first, then the next -------------
    if C >= 2 and bool(sim.city_alive[:, 0, 1].all()):
        sim.city_gw_writing[:, 0].zero_()
        sim.city_bldg[:, 0, 0, amph] = True
        sim.city_bldg[:, 0, 1, amph] = True
        # First Writer -> all 2 into the LOWER column (array order, #110).
        lo, hi = 0, 1
        sim._place_works(0, torch.ones(B, dtype=torch.bool), cval, 0)
        assert bool((sim.city_gw_writing[:, 0, lo] == 2).all()), "the lowest-column city fills first"
        assert bool((sim.city_gw_writing[:, 0, hi] == 0).all()), "the higher-column city stays empty"
        # Second Writer -> spills into the higher column.
        sim._place_works(0, torch.ones(B, dtype=torch.bool), cval, 0)
        assert bool((sim.city_gw_writing[:, 0, hi] == 2).all()), "overflow spills to the next city"
        sim.city_bldg[:, 0, 1, amph] = False

    # --- yield coupling: per-work culture, linear, and NO gold ------------
    sim.city_gw_writing[:, 0].zero_(); sim.city_gw_art[:, 0].zero_(); sim.city_gw_music[:, 0].zero_()
    sim.city_bldg[:, 0, 0, amph] = True
    _t0 = sim._city_totals()[0]
    base = _t0[:, 0, 4].clone()  # capital culture yield, 0 works
    base_g = _t0[:, 0, 2].clone()  # capital gold yield, 0 works
    sim.city_gw_writing[:, 0, 0] = 1; sim._eff_version += 1
    _t1 = sim._city_totals()[0]
    one = _t1[:, 0, 4].clone(); one_g = _t1[:, 0, 2].clone()
    sim.city_gw_writing[:, 0, 0] = 2; sim._eff_version += 1
    two = sim._city_totals()[0][:, 0, 4].clone()
    d1 = one - base; d2 = two - base
    assert bool((d1 > 0).all()), "a slotted work must raise the city's culture yield"
    assert bool(((d2 - 2 * d1).abs() < 1e-9).all()), "the work yield must be linear (2 works = 2 x 1 work)"
    assert bool(((one_g - base_g).abs() < 1e-9).all()), "a Great Work must pay NO gold"

    # --- a MUSIC work pays DOUBLE a writing work's culture (4 vs 2).
    # Both kinds land at the same buildings-bucket position, so the amenity /
    # government factors cancel in the ratio — a factor-independent assertion.
    sim.city_gw_writing[:, 0].zero_(); sim.city_gw_art[:, 0].zero_(); sim.city_gw_music[:, 0].zero_()
    sim.city_bldg[:, 0, 0, museum] = True
    sim._eff_version += 1
    _m0 = sim._city_totals()[0]
    mbase, mbase_g = _m0[:, 0, 4].clone(), _m0[:, 0, 2].clone()
    sim.city_gw_music[:, 0, 0] = 1; sim._eff_version += 1
    _m1 = sim._city_totals()[0]
    dm, dm_g = _m1[:, 0, 4].clone() - mbase, _m1[:, 0, 2].clone() - mbase_g
    assert bool(((dm - 2 * d1).abs() < 1e-9).all()), \
        f"a music work must pay 2x a writing work ({float(dm[0])} vs {float(d1[0])})"
    assert bool((dm_g.abs() < 1e-9).all()), "a MUSIC work must pay no gold either"
    sim.city_bldg[:, 0, 0, museum] = False
    sim.city_gw_music[:, 0].zero_(); sim._eff_version += 1

    # --- MUSIC uses the BROADCAST CENTER, its real Civ 6 home, and that
    # building has exactly ONE slot — so a Musician's 2 works always leave 1
    # overflowing. The Amphitheater and the Art Museum are both music-blind.
    sim.city_gw_writing[:, 0].zero_(); sim.city_gw_art[:, 0].zero_(); sim.city_gw_music[:, 0].zero_()
    sim.city_bldg[:, 0, 0, amph] = True
    sim.city_bldg[:, 0, 0, museum] = True
    sim.city_bldg[:, 0, 0, broadcast] = False
    civic2 = sim.civ_civic_prog[:, 0].clone()
    sim._place_works(0, torch.ones(B, dtype=torch.bool), torch.full((B,), 50.0, dtype=torch.float64), 2)
    assert bool((sim.city_gw_music[:, 0, 0] == 0).all()), "no BROADCAST CENTER -> music works do not slot"
    assert bool((sim.civ_civic_prog[:, 0] - civic2 == 100.0).all()), "music works overflow to the lump (2 x 50)"
    sim.city_bldg[:, 0, 0, broadcast] = True
    civic3 = sim.civ_civic_prog[:, 0].clone()
    sim._place_works(0, torch.ones(B, dtype=torch.bool), torch.full((B,), 50.0, dtype=torch.float64), 2)
    assert bool((sim.city_gw_music[:, 0, 0] == 1).all()), "the Broadcast Center holds exactly ONE music work"
    assert bool((sim.civ_civic_prog[:, 0] - civic3 == 50.0).all()), "the second music work overflows to the lump"

    # --- ART uses the ART MUSEUM — 3 slots, and an Artist carries exactly
    # 3 works, so one Artist fills a Museum with nothing left over.
    sim.city_gw_writing[:, 0].zero_(); sim.city_gw_art[:, 0].zero_(); sim.city_gw_music[:, 0].zero_()
    sim.city_bldg[:, 0, 0, museum] = False
    civicA = sim.civ_civic_prog[:, 0].clone()
    sim._place_works(0, torch.ones(B, dtype=torch.bool), torch.full((B,), 20.0, dtype=torch.float64), 1)
    assert bool((sim.city_gw_art[:, 0, 0] == 0).all()), "no ART MUSEUM -> art works do not slot"
    assert bool((sim.civ_civic_prog[:, 0] - civicA == 60.0).all()), "all 3 art works overflow (3 x 20)"
    sim.city_bldg[:, 0, 0, museum] = True
    civicB = sim.civ_civic_prog[:, 0].clone()
    sim._place_works(0, torch.ones(B, dtype=torch.bool), torch.full((B,), 20.0, dtype=torch.float64), 1)
    assert bool((sim.city_gw_art[:, 0, 0] == 3).all()), "one Artist fills the Art Museum's 3 slots exactly"
    assert bool((sim.civ_civic_prog[:, 0] == civicB).all()), "a fully-slotted Artist applies no lump"

    # --- end-to-end: a WRITER earned through the advance loop slots, no lump -
    sim.city_gw_writing[:, 0].zero_(); sim.city_gw_art[:, 0].zero_(); sim.city_gw_music[:, 0].zero_()
    sim.city_bldg[:, 0, 0, amph] = True
    civicE = sim.civ_civic_prog[:, 0].clone()
    earned0 = sim.gp_earned[:, wc].clone()
    sim.civ_gpp[:, 0, wc] = 100.0  # >= gpCost(0) = 60
    sim._advance_great_people(0, torch.ones(sim.B, dtype=torch.bool, device=sim.device))
    assert bool((sim.gp_earned[:, wc] == earned0 + 1).all()), "Writer not earned"
    assert bool((sim.city_gw_writing[:, 0, 0] == 2).all()), "earned Writer's works slot into the Amphitheater"
    assert bool((sim.civ_civic_prog[:, 0] == civicE).all()), "a slotted earned Writer applies NO instant culture lump"

    # --- civ-seat placement: _place_civ_works fills rc slots + overflows ---
    if sim.n_majors > 1 and bool(sim.city_alive[:, 1, 0].any()):
        r = 0
        live = sim.city_alive[:, r + 1, 0]
        sim.city_gw_writing[:, 1:sim.n_majors].zero_(); sim.city_gw_art[:, 1:sim.n_majors].zero_(); sim.city_gw_music[:, 1:sim.n_majors].zero_()
        sim.city_bldg[:, r + 1, 0, amph] = True
        rc0 = sim.civ_civic_prog[:, r + 1].clone()
        sim._place_works(r + 1, torch.ones(B, dtype=torch.bool), torch.full((B,), 45.0, dtype=torch.float64), 0)
        assert bool((sim.city_gw_writing[live, r + 1, 0] == 2).all()), "civ Writer slots into its Amphitheater"
        assert bool(((sim.civ_civic_prog[:, r + 1] - rc0)[live] == 0).all()), "a slotted civ Writer applies no lump"
        # A dead rc slot cannot slot -> the whole person overflows to a lump.
        if bool((~live).any()):
            assert bool(((sim.civ_civic_prog[:, r + 1] - rc0)[~live] == 90.0).all()), "no live slot -> civ overflow lump"

    # --- snapshot / restore round-trips the Great-Works tensors (_MUTABLE) --
    sim.city_gw_writing[0, 0, 0] = 2
    sim.city_gw_music[0, 1, 0] = 1 if sim.n_majors > 1 else 0
    snap = sim.snapshot()
    sim.city_gw_writing[0, 0, 0] = 0
    sim.city_gw_music[0, 1, 0] = 0
    sim.restore(snap)
    assert int(sim.city_gw_writing[0, 0, 0]) == 2, "gw_writing not preserved across snapshot"
    if sim.n_majors > 1:
        assert int(sim.city_gw_music[0, 1, 0]) == 1, "civ_city_gw_music not preserved across snapshot"

    # --- _reclaim_cities carries a city's works with its slot -------------------
    if sim.n_majors > 1 and RC >= 2:
        # Make slot 1 the only live city (slot 0 dead) with a known work count,
        # then compact: the living city must move to slot 0 carrying its works.
        sim.city_gw_writing[:, 1:sim.n_majors].zero_(); sim.city_gw_art[:, 1:sim.n_majors].zero_(); sim.city_gw_music[:, 1:sim.n_majors].zero_()
        sim.city_alive[0, 1, :] = False
        sim.city_alive[0, 1, 1] = True
        sim.city_gw_writing[0, 1, 1] = 2
        sim.city_gw_music[0, 1, 1] = 1
        sim._reclaim_cities()
        assert int(sim.city_gw_writing[0, 1, 0]) == 2, "works must ride the slot permutation (writing)"
        assert int(sim.city_gw_music[0, 1, 0]) == 1, "works must ride the slot permutation (music)"

    print("GREAT-WORKS OK")


if __name__ == "__main__":
    main()
