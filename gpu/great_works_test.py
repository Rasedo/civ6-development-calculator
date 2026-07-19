"""Slice W (#63 / ROUND B7) poke self-test — B-20 Great Works.

Covers paths the scripted rollout reaches rarely (an AMPHITHEATER + an earned
WRITER inside 250t is uncommon; MUSEUM even rarer):
  * exporter contract: writerCls/musicianCls indices + the AMPHITHEATER/MUSEUM
    building columns + gwSlots / gwWorksPerPerson / gwWorkCulture;
  * new per-city tensors (gw_writing/gw_music, rc_gw_writing/rc_gw_music) exist
    with matched shapes and round-trip through snapshot()/restore() (_MUTABLE);
  * _place_player_works / _place_rival_works: deterministic lowest-city then
    lowest-slot fill into the matching building, cap at gwSlots per building,
    overflow charges degrade to the instant culture lump;
  * the +gwWorkCulture/turn building-tier yield is LIVE and version-invalidated
    (adding a work raises the city's culture yield, linearly per work);
  * WRITER/MUSICIAN earned through _advance_player_great_people apply NO instant
    civic lump when a slot exists (B-20 replaces the pre-B7 lump);
  * _reclaim_rc carries a city's works with it through slot compaction.

Follows the religion_gp_test pattern: load rules + a fixture, drive the GPU
BatchSim, assert on its internal tensors.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    rr = rules.rivals

    # --- exporter contract -------------------------------------------------
    wc, mc = rr["writerCls"], rr["musicianCls"]
    assert wc == 7 and mc == 8, f"WRITER/MUSICIAN class indices: {wc}/{mc}"
    amph, museum = rr["gwWritingBidx"], rr["gwMusicBidx"]
    assert amph >= 0, "AMPHITHEATER must exist in the building catalog (writing slots)"
    assert museum >= 0, "MUSEUM must exist in the building catalog (music slots)"
    assert amph != museum, "writing and music must use distinct building columns"
    assert rr["gwSlotsPerBuilding"] == 2 and rr["gwWorksPerPerson"] == 2
    assert rr["gwWorkCulture"] == 2

    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run the exporter first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    B, C, RC = sim.B, sim.C, sim.RC
    assert sim._writer_cls == 7 and sim._musician_cls == 8
    assert sim._gw_writing_bidx == amph and sim._gw_music_bidx == museum

    # --- tensor shapes -----------------------------------------------------
    assert sim.gw_writing.shape == (B, C) and sim.gw_music.shape == (B, C)
    assert sim.rc_gw_writing.shape == sim.rc_alive.shape
    assert sim.rc_gw_music.shape == sim.rc_alive.shape
    assert bool((sim.gw_writing == 0).all()) and bool((sim.rc_gw_writing == 0).all()), "fresh: no works"

    if not sim.districts_on:
        print("GREAT-WORKS OK (districts off — placement paths skipped)")
        return

    # --- _place_player_works: single Writer fills 2 Amphitheater slots ------
    assert bool(sim.alive[:, 0].all()), "fixture capital (city 0) must be alive"
    sim.gw_writing.zero_(); sim.gw_music.zero_()
    sim.buildings[:, 0, amph] = True  # capital gets an Amphitheater
    civic0 = sim.civic_prog.clone()
    ver0 = sim._eff_version
    cval = torch.full((B,), 45.0, dtype=torch.float64)  # Li Bai's culture value
    sim._place_player_works(torch.ones(B, dtype=torch.bool), cval, amph, True)
    assert bool((sim.gw_writing[:, 0] == 2).all()), "both works must slot into the Amphitheater"
    assert bool((sim.civic_prog == civic0).all()), "a fully-slotted Writer applies NO instant lump"
    assert sim._eff_version > ver0, "a slot write must bump _eff_version (yield-bearing state)"

    # --- overflow: a second Writer finds no open slot -> instant lump -------
    civic1 = sim.civic_prog.clone()
    sim._place_player_works(torch.ones(B, dtype=torch.bool), cval, amph, True)
    assert bool((sim.gw_writing[:, 0] == 2).all()), "slots stay capped at gwSlots (2)"
    assert bool((sim.civic_prog - civic1 == 90.0).all()), "both overflow charges -> 2 x 45 lump"

    # --- deterministic order: lowest city first, then the next -------------
    if C >= 2 and bool(sim.alive[:, 1].all()):
        sim.gw_writing.zero_()
        sim.buildings[:, 0, amph] = True
        sim.buildings[:, 1, amph] = True
        # First Writer -> all 2 into the LOWER city_seq (capital = seq 0).
        cap = int(sim.city_seq[0, 0]); nxt = int(sim.city_seq[0, 1])
        lo, hi = (0, 1) if cap < nxt else (1, 0)
        sim._place_player_works(torch.ones(B, dtype=torch.bool), cval, amph, True)
        assert bool((sim.gw_writing[:, lo] == 2).all()), "the lowest-seq city fills first"
        assert bool((sim.gw_writing[:, hi] == 0).all()), "the higher-seq city stays empty"
        # Second Writer -> spills into the higher-seq city.
        sim._place_player_works(torch.ones(B, dtype=torch.bool), cval, amph, True)
        assert bool((sim.gw_writing[:, hi] == 2).all()), "overflow spills to the next city"
        sim.buildings[:, 1, amph] = False

    # --- yield coupling: +gwWorkCulture/turn per work, linear -------------
    sim.gw_writing.zero_(); sim.gw_music.zero_()
    sim.buildings[:, 0, amph] = True
    base = sim._city_totals()[0][:, 0, 4].clone()  # capital culture yield, 0 works
    sim.gw_writing[:, 0] = 1; sim._eff_version += 1
    one = sim._city_totals()[0][:, 0, 4].clone()
    sim.gw_writing[:, 0] = 2; sim._eff_version += 1
    two = sim._city_totals()[0][:, 0, 4].clone()
    d1 = one - base; d2 = two - base
    assert bool((d1 > 0).all()), "a slotted work must raise the city's culture yield"
    assert bool(((d2 - 2 * d1).abs() < 1e-9).all()), "the work yield must be linear (2 works = 2 x 1 work)"

    # --- music uses the MUSEUM column (writing Amphitheater is music-blind) --
    sim.gw_writing.zero_(); sim.gw_music.zero_()
    sim.buildings[:, 0, amph] = True
    sim.buildings[:, 0, museum] = False
    civic2 = sim.civic_prog.clone()
    sim._place_player_works(torch.ones(B, dtype=torch.bool), torch.full((B,), 50.0, dtype=torch.float64), museum, False)
    assert bool((sim.gw_music[:, 0] == 0).all()), "no MUSEUM -> music works do not slot"
    assert bool((sim.civic_prog - civic2 == 100.0).all()), "music works overflow to the lump (2 x 50)"
    sim.buildings[:, 0, museum] = True
    civic3 = sim.civic_prog.clone()
    sim._place_player_works(torch.ones(B, dtype=torch.bool), torch.full((B,), 50.0, dtype=torch.float64), museum, False)
    assert bool((sim.gw_music[:, 0] == 2).all()), "with a MUSEUM, music works slot"
    assert bool((sim.civic_prog == civic3).all()), "fully-slotted music applies no lump"

    # --- end-to-end: a WRITER earned through the advance loop slots, no lump -
    sim.gw_writing.zero_(); sim.gw_music.zero_()
    sim.buildings[:, 0, amph] = True
    civicE = sim.civic_prog.clone()
    earned0 = sim.gp_earned[:, wc].clone()
    sim.player_gp_points[:, wc] = 100.0  # >= gpCost(0) = 60
    sim._advance_player_great_people()
    assert bool((sim.gp_earned[:, wc] == earned0 + 1).all()), "Writer not earned"
    assert bool((sim.gw_writing[:, 0] == 2).all()), "earned Writer's works slot into the Amphitheater"
    assert bool((sim.civic_prog == civicE).all()), "a slotted earned Writer applies NO instant culture lump"

    # --- rival placement: _place_rival_works fills rc slots + overflows -----
    if sim.R > 0 and bool(sim.rc_alive[:, 0, 0].any()):
        r = 0
        live = sim.rc_alive[:, r, 0]
        sim.rc_gw_writing.zero_(); sim.rc_gw_music.zero_()
        sim.rc_bldg[:, r, 0, amph] = True
        rc0 = sim.r_civic_prog[:, r].clone()
        sim._place_rival_works(r, torch.ones(B, dtype=torch.bool), torch.full((B,), 45.0, dtype=torch.float64), amph, True)
        assert bool((sim.rc_gw_writing[live, r, 0] == 2).all()), "rival Writer slots into its Amphitheater"
        assert bool(((sim.r_civic_prog[:, r] - rc0)[live] == 0).all()), "a slotted rival Writer applies no lump"
        # A dead rc slot cannot slot -> the whole person overflows to a lump.
        if bool((~live).any()):
            assert bool(((sim.r_civic_prog[:, r] - rc0)[~live] == 90.0).all()), "no live slot -> rival overflow lump"

    # --- snapshot / restore round-trips the Great-Works tensors (_MUTABLE) --
    sim.gw_writing[0, 0] = 2
    sim.rc_gw_music[0, 0, 0] = 1 if sim.R > 0 else 0
    snap = sim.snapshot()
    sim.gw_writing[0, 0] = 0
    sim.rc_gw_music[0, 0, 0] = 0
    sim.restore(snap)
    assert int(sim.gw_writing[0, 0]) == 2, "gw_writing not preserved across snapshot"
    if sim.R > 0:
        assert int(sim.rc_gw_music[0, 0, 0]) == 1, "rc_gw_music not preserved across snapshot"

    # --- _reclaim_rc carries a city's works with its slot -------------------
    if sim.R > 0 and RC >= 2:
        # Make slot 1 the only live city (slot 0 dead) with a known work count,
        # then compact: the living city must move to slot 0 carrying its works.
        sim.rc_gw_writing.zero_(); sim.rc_gw_music.zero_()
        sim.rc_alive[0, 0, :] = False
        sim.rc_alive[0, 0, 1] = True
        sim.rc_gw_writing[0, 0, 1] = 2
        sim.rc_gw_music[0, 0, 1] = 1
        sim._reclaim_rc()
        assert int(sim.rc_gw_writing[0, 0, 0]) == 2, "works must ride the slot permutation (writing)"
        assert int(sim.rc_gw_music[0, 0, 0]) == 1, "works must ride the slot permutation (music)"

    print("GREAT-WORKS OK")


if __name__ == "__main__":
    main()
