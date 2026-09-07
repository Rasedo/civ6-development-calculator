"""Great Works pokes — the GPU twin of tests/cpu/culture/great-works.test.ts.

Covers paths the scripted rollout reaches rarely (an AMPHITHEATER + an earned
WRITER inside 250t is uncommon; a MUSEUM even rarer):
  * exporter contract: the per-KIND class and work-count tables, the
    per-object yields (GS values), no gold anywhere;
  * the per-holder planes (`city_gw_obj/_maker/_era/_seat`, W wide) exist with
    matched shapes and round-trip through snapshot()/restore() (_MUTABLE);
  * `_gw_place_person`: a person's works fill the matching holder slot by
    slot, cap at the holder's count, and every work with no slot is one
    instant culture lump;
  * the per-work culture is LIVE and version-invalidated (linear per work,
    no gold), music paying double writing;
  * a WRITER earned through _advance_great_people slots nothing at the claim
    and everything at the spend;
  * _reclaim_cities carries a city's works with it through slot compaction;
  * a COMPLETE wonder holds works in a city with no matching building;
  * the Art Museum's theming rule: one object type, three different makers.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all, hold_works, works_of, clear_works

WRITING, MUSIC, ARTIFACT, RELIC = 5, 6, 4, 7
ART = (0, 1, 2, 3)


def holder(sim, gw, hid: str) -> int:
    return [h["id"] for h in gw["holders"]].index(hid)


def slots_of(sim, h: int) -> list[int]:
    return (sim._gw_slot_holder == h).nonzero(as_tuple=True)[0].tolist()


def person(sim, cls: int, at: int = 0):
    B = sim.B
    return (torch.full((B,), cls, dtype=torch.long), torch.full((B,), at, dtype=torch.long))


def main() -> None:
    rules = load_rules()
    rr = rules.seats
    gw = rr["greatWorks"]

    # --- exporter contract -------------------------------------------------
    wc, ac, mc = rr["gwClsByKind"]
    assert wc == 7 and mc == 8, f"WRITER/MUSICIAN class indices: {wc}/{mc}"
    assert rr["gwWorksByKind"] == [2, 3, 2], rr["gwWorksByKind"]
    # per-object culture / tourism (GS values), and no gold key at all — no
    # Great Work pays gold in Civ 6
    assert gw["objCulture"] == [3, 3, 3, 3, 3, 2, 4, 0], gw["objCulture"]
    assert gw["objTourism"] == [2, 2, 2, 2, 3, 2, 4, 8], gw["objTourism"]
    assert not any("gold" in k.lower() for k in list(gw) + [k for k in rr if k.startswith("gw")]), "a gw*Gold key would be a fidelity regression"
    for old in ("gwSlotsByKind", "gwBidxByKind", "gwCultureByKind", "artifactProvW", "relicSlots"):
        assert old not in rr, f"{old} died with the per-kind counters"

    paths = fixture_paths()
    assert paths, "no fixtures — run the exporter first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    B, RC, W = sim.B, sim.RC, sim.GW_W
    assert sim._gw_cls == [wc, ac, mc], sim._gw_cls
    amph, museum, broadcast = (sim._gw_holder_bidx[holder(sim, gw, h)] for h in ("AMPHITHEATER", "MUSEUM", "BROADCAST_CENTER"))
    assert min(amph, museum, broadcast) >= 0
    H_AMPH, H_MUS, H_BC = (holder(sim, gw, h) for h in ("AMPHITHEATER", "MUSEUM", "BROADCAST_CENTER"))

    # --- tensor shapes -----------------------------------------------------
    for p in ("city_gw_obj", "city_gw_maker", "city_gw_era", "city_gw_seat"):
        t = getattr(sim, p)
        assert t.shape == (B, sim.CITY_ROWS, RC, W), (p, t.shape)
        assert bool((t == -1).all()), f"fresh: {p} holds nothing"

    if not sim.districts_on:
        print("GREAT-WORKS OK (districts off — placement paths skipped)")
        return

    # the capital's own Palace slot comes FIRST in the table; these scenes read
    # the buildings alone
    def bare_capital(s):
        s.city_is_cap[:, 0, 0] = False
        s._eff_version += 1

    # --- a single Writer fills the two Amphitheater slots -------------------
    assert bool(sim.city_alive[:, 0, 0].all()), "fixture capital (city 0) must be alive"
    bare_capital(sim)
    sim.city_bldg[:, 0, 0, amph] = True
    civic0 = sim.civ_civic_prog[:, 0].clone()
    ver0 = sim._eff_version
    cval = torch.full((B,), 45.0, dtype=torch.float64)  # Li Bai's culture value
    col0 = torch.zeros(B, dtype=torch.long)
    one = torch.ones(B, dtype=torch.bool)
    sim._gw_place_person(0, one, col0, *person(sim, wc), cval)
    assert works_of(sim, 0, 0, 0, [WRITING]) == 2, "both works must slot into the Amphitheater"
    assert [int(x) for x in (sim.city_gw_obj[0, 0, 0] >= 0).nonzero().flatten()] == slots_of(sim, H_AMPH)
    assert bool((sim.civ_civic_prog[:, 0] == civic0).all()), "a fully-slotted Writer applies NO instant lump"
    assert sim._eff_version > ver0, "a slot write must bump _eff_version (yield-bearing state)"

    # --- overflow: a second Writer finds no open slot -> one lump per work --
    civic1 = sim.civ_civic_prog[:, 0].clone()
    sim._gw_place_person(0, one, col0, *person(sim, wc), cval)
    assert works_of(sim, 0, 0, 0, [WRITING]) == 2, "the holder stays capped at its two"
    assert bool((sim.civ_civic_prog[:, 0] - civic1 == 90.0).all()), "both overflow works -> 2 x 45 lump"

    # --- yield coupling: per-work culture, linear, and NO gold ------------
    clear_works(sim)
    _t0 = sim._city_totals()[0]
    base = _t0[:, 0, 4].clone()
    base_g = _t0[:, 0, 2].clone()
    hold_works(sim, 0, 0, 0, WRITING, 1)
    _t1 = sim._city_totals()[0]
    d1 = _t1[:, 0, 4] - base
    assert bool((d1 > 0).all()), "a slotted work must raise the city's culture yield"
    hold_works(sim, 0, 0, 0, WRITING, 1)
    d2 = sim._city_totals()[0][:, 0, 4] - base
    assert bool(((d2 - 2 * d1).abs() < 1e-9).all()), "the work yield must be linear (2 works = 2 x 1 work)"
    assert bool(((_t1[:, 0, 2] - base_g).abs() < 1e-9).all()), "a Great Work must pay NO gold"

    # --- a MUSIC work pays DOUBLE a writing work's culture (4 vs 2) --------
    clear_works(sim)
    hold_works(sim, 0, 0, 0, MUSIC, 1)
    dm = sim._city_totals()[0][:, 0, 4] - base
    assert bool(((dm - 2 * d1).abs() < 1e-9).all()), f"a music work must pay 2x a writing work ({float(dm[0])} vs {float(d1[0])})"

    # --- MUSIC uses the BROADCAST CENTER (one slot): a Musician's 2 works
    # always leave 1 overflowing; the Amphitheater and Museum are music-blind
    clear_works(sim)
    sim.city_bldg[:, 0, 0, amph] = True
    sim.city_bldg[:, 0, 0, museum] = True
    sim.city_bldg[:, 0, 0, broadcast] = False
    civic2 = sim.civ_civic_prog[:, 0].clone()
    c50 = torch.full((B,), 50.0, dtype=torch.float64)
    sim._gw_place_person(0, one, col0, *person(sim, mc), c50)
    assert works_of(sim, 0, 0, 0, [MUSIC]) == 0, "no BROADCAST CENTER -> music works do not slot"
    assert bool((sim.civ_civic_prog[:, 0] - civic2 == 100.0).all()), "music works overflow to the lump (2 x 50)"
    sim.city_bldg[:, 0, 0, broadcast] = True
    civic3 = sim.civ_civic_prog[:, 0].clone()
    sim._gw_place_person(0, one, col0, *person(sim, mc), c50)
    assert works_of(sim, 0, 0, 0, [MUSIC]) == 1, "the Broadcast Center holds exactly ONE music work"
    assert [int(x) for x in (sim.city_gw_obj[0, 0, 0] == MUSIC).nonzero().flatten()] == slots_of(sim, H_BC)
    assert bool((sim.civ_civic_prog[:, 0] - civic3 == 50.0).all()), "the second music work overflows to the lump"

    # --- ART uses the ART MUSEUM — 3 slots, and an Artist carries exactly 3
    clear_works(sim)
    sim.city_bldg[:, 0, 0, museum] = False
    civicA = sim.civ_civic_prog[:, 0].clone()
    c20 = torch.full((B,), 20.0, dtype=torch.float64)
    sim._gw_place_person(0, one, col0, *person(sim, ac, 2), c20)  # Donatello: three sculptures
    assert works_of(sim, 0, 0, 0, ART) == 0, "no ART MUSEUM -> art works do not slot"
    assert bool((sim.civ_civic_prog[:, 0] - civicA == 60.0).all()), "all 3 art works overflow (3 x 20)"
    sim.city_bldg[:, 0, 0, museum] = True
    civicB = sim.civ_civic_prog[:, 0].clone()
    sim._gw_place_person(0, one, col0, *person(sim, ac, 2), c20)
    assert works_of(sim, 0, 0, 0, [0]) == 3, "one Artist fills the Art Museum's 3 slots exactly, sculptures all"
    assert bool((sim.civ_civic_prog[:, 0] == civicB).all()), "a fully-slotted Artist applies no lump"
    assert sim.city_gw_maker[0, 0, 0, slots_of(sim, H_MUS)].tolist() == [2, 2, 2], "the maker rides the work"

    # --- end-to-end: a WRITER is EARNED as a unit and slots its works only
    # when the charge is spent -----------------------------------------------
    clear_works(sim)
    sim.city_bldg[:, 0, 0, amph] = True
    sim.city_is_cap[:, 0, 0] = True  # the recruit arrives at the capital; its Palace slot takes the first work
    sim._eff_version += 1
    civicE = sim.civ_civic_prog[:, 0].clone()
    earned0 = sim.gp_earned[:, wc].clone()
    live0 = sim.major_unit_alive[0].sum().item()
    sim.civ_gpp[:, 0, wc] = 100.0  # >= gpCost(0) = 60
    sim._advance_great_people(0, one)
    assert bool((sim.gp_earned[:, wc] == earned0 + 1).all()), "Writer not earned"
    assert sim.major_unit_alive[0].sum().item() == live0 + 1, "the claim did not spawn the Writer as a unit"
    assert works_of(sim, 0, 0, 0, [WRITING]) == 0, "the CLAIM slotted works; the SPEND does that now"
    assert bool((sim.civ_civic_prog[:, 0] == civicE).all()), "the claim paid a lump it no longer owes"
    guidx = int(sim._gp_class_unit[wc])
    mine = sim.major_unit_alive & (sim.major_unit_seat == 0) & (sim.major_unit_type == guidx) & (sim.major_unit_gp_at >= 0)
    assert bool(mine.any(dim=1).all()), "no Writer unit standing after the claim"
    sc_w = mine.long().argmax(dim=1)
    hc_w = sim.city_center[:, 0, 0].clamp(min=0)
    sim._gp_apply(0, one, sc_w, hc_w)
    assert works_of(sim, 0, 0, 0, [WRITING]) == 2, "the spent Writer's works did not slot"
    assert [int(x) for x in (sim.city_gw_obj[0, 0, 0] >= 0).nonzero().flatten()] == [slots_of(sim, holder(sim, gw, "PALACE"))[0], slots_of(sim, H_AMPH)[0]], "the Palace's slot first, then the Amphitheater's"
    assert bool((sim.civ_civic_prog[:, 0] == civicE).all()), "a fully-slotted Writer applied an instant culture lump"
    assert int(sim.city_gw_seat[0, 0, 0, slots_of(sim, H_AMPH)[0]]) == int(sim._ROW_SEAT[0]), "a created work names its seat"
    bare_capital(sim)

    # --- snapshot / restore round-trips the planes (_MUTABLE) -------------
    clear_works(sim)
    hold_works(sim, 0, 0, 0, WRITING, 2)
    snap = sim.snapshot()
    clear_works(sim)
    sim.restore(snap)
    assert works_of(sim, 0, 0, 0, [WRITING]) == 2, "gw planes not preserved across snapshot"

    # --- _reclaim_cities carries a city's works with its slot -------------
    if sim.n_majors > 1 and RC >= 2:
        clear_works(sim)
        sim.city_alive[0, 1, :] = False
        sim.city_alive[0, 1, 1] = True
        hold_works(sim, 0, 1, 1, WRITING, 2, maker=3)
        hold_works(sim, 0, 1, 1, MUSIC, 1)
        sim._reclaim_cities()
        assert works_of(sim, 0, 1, 0, [WRITING]) == 2 and works_of(sim, 0, 1, 0, [MUSIC]) == 1, "works must ride the slot permutation"
        assert works_of(sim, 0, 1, 1, [WRITING, MUSIC]) == 0, "the vacated slot must be empty"

    # --- a COMPLETE wonder holds works in a city with no matching building --
    s5 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    bare_capital(s5)
    H_GL = holder(s5, gw, "GREAT_LIBRARY")
    wi = s5._gw_holder_widx[H_GL]
    s5.city_alive[:, 0, :] = True
    s5.city_bldg[:, 0, :, amph] = False
    s5.city_wonder[:, 0, :, :] = -1
    t0 = int(s5.city_center[0, 0, 0])
    s5.city_wonder[:, 0, 0, wi] = t0
    s5.built_wonder_complete[:, t0] = False
    civ5 = s5.civ_civic_prog[:, 0].clone()
    s5._gw_place_person(0, one, col0, *person(s5, wc), cval)
    assert works_of(s5, 0, 0, 0, [WRITING]) == 0, "an unfinished wonder must hold no work"
    assert bool((s5.civ_civic_prog[:, 0] - civ5 == 90.0).all())
    s5.built_wonder_complete[:, t0] = True
    s5._eff_version += 1
    s5._gw_place_person(0, one, col0, *person(s5, wc), cval)
    assert works_of(s5, 0, 0, 0, [WRITING]) == 2, "the Great Library's two slots must take the Writer"
    assert [int(x) for x in (s5.city_gw_obj[0, 0, 0] >= 0).nonzero().flatten()] == slots_of(s5, H_GL)
    # ... and with the Amphitheater standing, the building's slots fill FIRST
    clear_works(s5)
    s5.city_bldg[:, 0, 0, amph] = True
    s5._gw_place_person(0, one, col0, *person(s5, wc), cval)
    assert [int(x) for x in (s5.city_gw_obj[0, 0, 0] >= 0).nonzero().flatten()] == slots_of(s5, H_AMPH)
    s5._gw_place_person(0, one, col0, *person(s5, wc), cval)
    assert works_of(s5, 0, 0, 0, [WRITING]) == 4
    print("  wonder holder OK — the Great Library's two, after the Amphitheater's")

    # --- ART MUSEUM THEMING: one object type, three different makers -------
    s6 = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    bare_capital(s6)
    s6.city_bldg[:, 0, :, museum] = False
    s6.city_bldg[:, 0, 0, museum] = True
    works = s6._gw_artist_objs
    assert works.shape[0] >= 20, "the exporter shipped no per-artist work table"
    # ONE artist fills the museum with their own three works — never themed
    s6._gw_place_person(0, one, col0, *person(s6, ac, 1), torch.zeros(B, dtype=torch.float64))  # Michelangelo
    ms = slots_of(s6, H_MUS)
    assert s6.city_gw_obj[0, 0, 0, ms].tolist() == works[1].tolist() == [3, 0, 0]
    assert s6.city_gw_maker[0, 0, 0, ms].tolist() == [1, 1, 1]
    assert not bool(s6._gw_themed(0)[0, 0, H_MUS]), "one artist's own works must not theme"
    # THREE artists, one type: Rublev (0), Michelangelo (1) and Bosch (3) all
    # open with a RELIGIOUS work
    clear_works(s6)
    for sl, a in zip(ms, (0, 1, 3)):
        s6.city_gw_obj[0, 0, 0, sl] = int(works[a, 0])
        s6.city_gw_maker[0, 0, 0, sl] = a
    s6._eff_version += 1
    assert bool(s6._gw_themed(0)[0, 0, H_MUS]), "same type, three artists must theme"
    cul, _f = s6._gw_yields(0)
    assert float(cul[0, 0]) == 3 * 3 * 2, "the themed museum doubles its works' culture"
    s6.city_gw_maker[0, 0, 0, ms[1]] = 0
    assert not bool(s6._gw_themed(0)[0, 0, H_MUS]), "a repeated artist must not theme"
    s6.city_gw_maker[0, 0, 0, ms[1]] = 1
    s6.city_gw_obj[0, 0, 0, ms[1]] = 0
    assert not bool(s6._gw_themed(0)[0, 0, H_MUS]), "a mismatched type must not theme"
    print("  art museum theming OK")

    print("GREAT-WORKS OK")


if __name__ == "__main__":
    main()
