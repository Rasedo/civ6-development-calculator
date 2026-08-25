"""Religion + great-people depth pokes.

Covers paths the scripted rollout can't reach organically:
  * GP era-cost ladder + its past-the-end boundary (clamp holds the top era
    cost), driven through the seat-0 advance loop.
  * Writer/Musician classes: n_gp = 9, both share the Theater Square district
    index with the Artist (the three culture classes).
  * belief catalog counts (pantheons 25 / followers 9 / founders 8) and the
    Enhancer slot (pool 7 + its effect table).

Follows the occupancy_test pattern: load rules + a fixture, drive the
GPU BatchSim, assert on its internal tensors.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all


def main() -> None:
    rules = load_rules()
    rr = rules.seats
    bl = rules.beliefs

    # --- the ERA-KEYED price table -----------------------------------------
    # [person era][eras the world is behind them]; column 0 is the era base
    # (Classical 60, Medieval 120, Renaissance 240, Industrial 420, Modern 660,
    # Atomic 960, Information 1320) and Ancient/Future mirror their neighbour.
    ct = rr["gpCostTable"]
    assert len(ct) == 9 and all(len(row) == 9 for row in ct), f"cost table shape: {len(ct)}"
    assert [row[0] for row in ct] == [60, 60, 120, 240, 420, 660, 960, 1320, 1320],         f"era base costs: {[row[0] for row in ct]}"
    assert ct[4][2] == 1075, f"the page's own worked example (420 x 1.6^2): {ct[4][2]}"
    # the art classes and the Prophet do not scale
    assert rr["gpFlatCost"] == [0, 0, 0, 1, 1, 0, 0, 1, 1], f"flat-cost classes: {rr['gpFlatCost']}"

    # --- Writer/Musician classes -> n_gp = 9 -------------------------------
    cd = rr["gpClassDistrict"]
    assert len(cd) == 9, f"expected 9 GP classes (Writer/Musician added), got {len(cd)}"
    assert rr["gpRoster"] == [24, 21, 24, 16, 23, 23, 27, 29, 18],         f"the nine sourced rosters: {rr['gpRoster']}"
    # nobody is Ancient, the Artists start in the Renaissance, the Musicians in
    # the Industrial era, and the Prophets run out after the Renaissance.
    assert min(min(c) for c in rr["gpEra"]) == 1, "no Great Person is Ancient"
    assert rr["gpEra"][4][0] == 3 and rr["gpEra"][8][0] == 4, "Artist/Musician first eras"
    assert max(rr["gpEra"][3]) < 4, "Industrial: no more Great Prophets"
    for c, es in enumerate(rr["gpEra"]):
        assert es == sorted(es), f"class {c} roster must ascend by era"
    # GP_CLASSES order: SCIENTIST,ENGINEER,MERCHANT,PROPHET,ARTIST,ADMIRAL,
    # GENERAL,WRITER,MUSICIAN. The three culture classes share the Theater
    # Square district index; PROPHET keeps index 3 (prophetCls).
    assert cd[4] == cd[7] == cd[8], "Artist/Writer/Musician must share Theater Square"
    assert rr["prophetCls"] == 3, f"prophetCls must stay 3, got {rr['prophetCls']}"

    # --- belief catalog counts + Enhancer slot -----------------------------
    assert rr["pantheonPool"] == 25, f"pantheons: {rr['pantheonPool']}"
    assert rr["followerPool"] == 9, f"followers: {rr['followerPool']}"
    assert rr["founderPool"] == 8, f"founders: {rr['founderPool']}"
    assert rr["enhancerPool"] == 7, f"enhancers: {rr['enhancerPool']}"
    assert len(bl["pantheons"]) == 25 and len(bl["followers"]) == 9 and len(bl["founders"]) == 8
    # The enhancer effect table ships alongside the pool.
    assert len(bl.get("enhancers", [])) == 7, "enhancer effect rows missing from export"

    # --- GPU side: tensors auto-extend to n_gp = 9 -------------------------
    paths = fixture_paths()
    assert paths, "no fixtures — run the exporter first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    assert sim._gp_nc == 9, f"engine n_gp must be 9, got {sim._gp_nc}"
    assert sim.gp_earned.shape[1] == 9 and sim.civ_gpp.shape[2] == 9
    assert sim.civ_gpp.shape[2] == 9, "civ gpp tensor must be n_gp wide"
    assert [int(x) for x in sim._gp_cost_table[:, 0].tolist()] == [row[0] for row in ct]
    assert sim._gp_era.shape[1] == max(rr["gpRoster"]) and sim._gp_effects.shape[1] == sim._gp_era.shape[1]

    # --- enhancer race state is wired (mirror of follower/founder) ---------
    assert sim._enh_any, "enhancer pool must be non-empty"
    assert sim.enh_claimed.shape[1] == 7, f"enh pool mask width: {sim.enh_claimed.shape[1]}"
    assert sim.civ_enhancer[:, 1:].shape == sim.civ_follower[:, 1:].shape, "civ_only_enhancer must mirror civ_only_follower"
    assert sim.civ_enhancer_done[:, 1:].shape == sim.civ_religion_done[:, 1:].shape
    assert bool((sim.civ_enhancer[:, 1:] == -1).all()) and int(sim.claimed_e_n.sum()) == 0, "fresh: no enhancer claimed"
    # The k-th-open picker (the exact inline arithmetic of the enhancer claim):
    # with idx 1 & 4 pre-claimed the open ids are {0,2,3,5,6}; a draw giving
    # k = 2 selects the 3rd open id = idx 3.
    ec = sim.enh_claimed.clone()
    ec[0, 1] = True
    ec[0, 4] = True
    draw = torch.tensor([2.4 / 5.0], dtype=torch.float64)  # -> k = 2 (3rd open)
    n_open = (~ec).sum(dim=1)
    k = torch.floor(draw * n_open.to(torch.float64)).to(torch.long)
    cum = (~ec).long().cumsum(dim=1)
    sel = (~ec) & (cum == (k + 1).unsqueeze(1))
    assert int(sel.long().argmax(dim=1)[0]) == 3, "enhancer k-th-open pick wrong"

    # --- religious pressure spread (accumulate / tie / flip / KILL) --------
    assert sim.holy_tile.shape[1] == sim.n_majors and sim.n_majors == sim.n_majors
    assert sim.city_pressure[:, 0, :sim.RC].shape == (sim.B, sim.RC, sim.n_majors)
    assert sim.city_followed[:, 0, :sim.RC].shape == (sim.B, sim.RC)
    assert sim.city_pressure[:, 1:sim.n_majors].shape[3] == sim.n_majors and sim.city_followed[:, 1:sim.n_majors].shape == sim.city_alive[:, 1:sim.n_majors].shape
    if sim.n_majors >= 3 and sim.n_majors >= 3:
        sim.city_pressure[:, 0, :sim.RC].zero_()
        sim.city_followed[:, 0, :sim.RC].fill_(-1)
        sim.holy_tile.fill_(-1)
        assert bool(sim.city_alive[:, 0, 0].all()), "fixture city 0 (capital) must be alive"
        # Religions 1 & 2 both found their holy city AT city 0's center (dist 0,
        # always in range) -> equal pressure each turn -> a permanent tie.
        c0 = sim.city_center[:, 0, 0].clone()
        sim.holy_tile[:, 1] = c0
        sim.holy_tile[:, 2] = c0
        sim._spread_religious_pressure()
        assert bool((sim.city_pressure[:, 0, 0, 1] == 1).all()), "religion-1 +1 pressure"
        assert bool((sim.city_pressure[:, 0, 0, 2] == 1).all()), "religion-2 +1 pressure"
        assert bool((sim.city_followed[:, 0, 0] == 1).all()), "tie must resolve to the lower religion id"
        for _ in range(3):
            sim._spread_religious_pressure()
        assert bool((sim.city_pressure[:, 0, 0, 1] == 4).all()), "integer accumulation over turns"
        assert bool((sim.city_followed[:, 0, 0] == 1).all()), "still tied -> id 1"
        # Break the tie: religion 2 gains extra pressure -> majority flip to 2.
        sim.city_pressure[:, 0, 0, 2] += 5
        sim._spread_religious_pressure()  # r1 -> 5, r2 -> 10
        assert bool((sim.city_followed[:, 0, 0] == 2).all()), "majority pressure must flip to religion 2"
        # KILL hygiene: a razed city's pressure row is zeroed, follows nothing.
        sim.city_alive[:, 0, 0] = False
        sim._spread_religious_pressure()
        assert bool((sim.city_pressure[:, 0, 0, :] == 0).all()), "dead-slot pressure must reset (KILL hygiene)"
        assert bool((sim.city_followed[:, 0, 0] == -1).all()), "dead city follows nothing"
        sim.city_alive[:, 0, 0] = True
        # rc side: a dead civ-city slot is likewise zeroed and follows nothing.
        sim.city_pressure[:, 1:sim.n_majors].zero_()
        sim.city_followed[:, 1:sim.n_majors].fill_(-1)
        sim.city_pressure[:, 0 + 1, 0, 1] = 7  # stale pressure on a (possibly dead) slot
        sim._spread_religious_pressure()
        dead_rc = ~sim.city_alive[:, 1, 0]
        if bool(dead_rc.any()):
            assert bool((sim.city_pressure[dead_rc, 0 + 1, 0, :] == 0).all()), "dead rc-slot pressure must reset"
            assert bool((sim.city_followed[dead_rc, 0 + 1, 0] == -1).all()), "dead rc city follows nothing"
        # restore the pressure tensors for the snapshot round-trip below
        sim.city_pressure[:, 0, :sim.RC].zero_()
        sim.city_followed[:, 0, :sim.RC].fill_(-1)
        sim.holy_tile.fill_(-1)
        sim.city_pressure[:, 1:sim.n_majors].zero_()
        sim.city_followed[:, 1:sim.n_majors].fill_(-1)

    # --- the price a class pays depends on how far the WORLD is behind it ---
    # A SCIENTIST (class 0, which scales) at queue position 0 is Classical: at
    # an Ancient world era the difference is 1 and the price is 78, and once the
    # world reaches Classical it drops to the 60 base. A flat class ignores it.
    _we = sim._world_era()
    assert bool((_we == 0).all()), f"a fresh fixture must be Ancient: {_we.tolist()}"
    _at0 = torch.zeros(sim.B, dtype=torch.long, device=sim.device)
    assert bool((sim._gp_cost(0, _at0, _we) == 78.0).all()), "Classical Scientist, Ancient world"
    assert bool((sim._gp_cost(0, _at0, _we + 1) == 60.0).all()), "the world catches up"
    assert bool((sim._gp_cost(3, _at0, _we) == 60.0).all()), "the Prophet never scales"

    # --- the ERA GATE: a class whose roster the world has passed offers nobody
    _pc = int(rr["prophetCls"])
    assert int(sim._gp_era[_pc, : int(sim._gp_roster[_pc])].max()) < 4,         "Industrial: no more Great Prophets"
    sim.gp_offer[:, _pc] = -1
    sim.gp_claimed[:, _pc, :] = False
    sim.gp_earned[:, _pc] = 0
    _pro0 = sim.civ_prophets[:, 0].clone()
    _fa0 = sim.civ_faith[:, 0].clone()
    sim.civ_gpp[:, 0, _pc] = 100_000.0
    for _r in range(sim.n_majors):
        sim.civ_techs[:, _r, :] = True  # push the world era past the roster
        sim.civ_civics[:, _r, :] = True
    sim._advance_great_people(0, torch.ones(sim.B, dtype=torch.bool, device=sim.device))
    assert int(sim.gp_earned[0, _pc]) == 0 and int(sim.gp_offer[0, _pc]) == -2,         "an exhausted class must claim nobody, however fat the bank"
    assert float(sim.civ_faith[0, 0] - _fa0[0]) == 100_000.0,         "the dead bank must convert to faith 1:1"
    for _r in range(sim.n_majors):
        sim.civ_techs[:, _r, :] = False
        sim.civ_civics[:, _r, :] = False
    sim.civ_prophets[:, 0] = _pro0
    sim.civ_faith[:, 0] = _fa0
    sim.civ_gpp[:, 0, _pc] = 0.0
    # the probe froze every class's offer at the era-8 world — reset the
    # draw state so the claims below draw from the real pools again
    sim.gp_offer[:, :] = -1
    sim.gp_price[:, :] = 0.0
    sim.gp_claimed[:, :, :] = False

    # --- a Writer (class 7) is earnable through the seat-0 advance loop,
    # proving the widened tensors flow end to end. The CLAIM only stands the
    # person up as a unit: nothing is paid and no slot is taken until a charge
    # is spent. Fresh turn 1 with no AMPHITHEATER, so the spend overflows both
    # of the Writer's Great Works to the instant culture lump (2 x the
    # Classical 60 = 120).
    if sim.districts_on:
        civic0 = sim.civ_civic_prog[:, 0].clone()
        earned0 = sim.gp_earned[:, 7].clone()
        gw0 = (sim.city_gw_writing[:, 0] + sim.city_gw_music[:, 0]).sum().item()
        live0 = sim.major_unit_alive[0].sum().item()
        sim.civ_gpp[:, 0, 7] = 100.0  # >= the Writer's flat Classical 60
        sim._advance_great_people(0, torch.ones(sim.B, dtype=torch.bool, device=sim.device))
        assert bool((sim.gp_earned[:, 7] == earned0 + 1).all()), "Writer not earned"
        assert sim.major_unit_alive[0].sum().item() == live0 + 1, "the claim did not spawn the Writer as a unit"
        assert bool((sim.civ_civic_prog[:, 0] == civic0).all()), "the claim paid a lump it no longer owes"

        guidx = int(sim._gp_class_unit[7])
        mine = sim.major_unit_alive & (sim.major_unit_seat == 0) & (sim.major_unit_type == guidx) \
            & (sim.major_unit_gp_at >= 0)
        assert bool(mine.any(dim=1).all()), "no Writer unit standing after the claim"
        sc_w = mine.long().argmax(dim=1)
        hc_w = sim.city_center[:, 0, 0].clamp(min=0)
        sim._gp_apply(0, torch.ones(sim.B, dtype=torch.bool, device=sim.device), sc_w, hc_w)
        d_civic = (sim.civ_civic_prog[:, 0] - civic0)
        assert bool((d_civic == 120.0).all()), f"Writer overflow lump wrong (want 2x60): {d_civic.tolist()}"
        assert (sim.city_gw_writing[:, 0] + sim.city_gw_music[:, 0]).sum().item() == gw0, "no AMPHITHEATER -> no slotted work"

    # --- a seat-0 PROPHET banks its faith-column effect at the SPEND --------
    # Confucius (PROPHET class 3, roster idx 0) carries fx.faith; `_gp_apply`
    # banks it into the seat's faith total, and the claim before it only
    # stands the Prophet up as a unit.
    if sim.districts_on:
        assert sim._gp_effects.shape[2] > 4, "gpEffects must carry the faith column"
        pc = int(rr["prophetCls"])  # 3
        assert float(sim._gp_effects[pc, 0, 4]) == 60.0, "Confucius pays the Classical lump"
        faith0 = sim.civ_faith[:, 0].clone()
        pe0 = sim.gp_earned[:, pc].clone()
        # the draw is random within the era pool — claim the OTHER Classical
        # Prophets so it lands Confucius (roster idx 0), leaving the later
        # eras open so the class does not exhaust (and convert the leftover)
        sim.gp_offer[:, pc] = -1
        _nr_p = int(sim._gp_roster[pc])
        _cls_same = sim._gp_era[pc, :_nr_p] == sim._gp_era[pc, 0]
        _cls_same[0] = False
        sim.gp_claimed[:, pc, :_nr_p] |= _cls_same.reshape(1, -1)
        sim.civ_gpp[:, 0, pc] = 100.0  # >= the flat Classical 60, earns one Prophet
        sim._advance_great_people(0, torch.ones(sim.B, dtype=torch.bool, device=sim.device))
        assert bool((sim.gp_earned[:, pc] == pe0 + 1).all()), "Prophet not earned"
        assert bool((sim.civ_faith[:, 0] == faith0).all()), "the claim banked faith it no longer owes"
        puidx = int(sim._gp_class_unit[pc])
        pmine = sim.major_unit_alive & (sim.major_unit_seat == 0) & (sim.major_unit_type == puidx) \
            & (sim.major_unit_gp_at >= 0)
        assert bool(pmine.any(dim=1).all()), "no Prophet unit standing after the claim"
        sc_p = pmine.long().argmax(dim=1)
        hc_p = sim.city_center[:, 0, 0].clamp(min=0)
        sim._gp_apply(0, torch.ones(sim.B, dtype=torch.bool, device=sim.device), sc_p, hc_p)
        d_faith = sim.civ_faith[:, 0] - faith0
        assert bool((d_faith == 60.0).all()), f"seat-0 faith bank wrong: {d_faith.tolist()}"

    # snapshot/restore round-trips the GP tensors + the faith bank
    # and the enhancer race state (all registered in _MUTABLE).
    sim.enh_claimed[0, 2] = True  # give the enhancer state something to restore
    sim.civ_enhancer[0, 1] = 2
    sim.civ_enhancer_done[0, 1] = True
    sim.claimed_e_n[0] = 1
    sim.holy_tile[0, 0] = 42  # pressure state to restore
    sim.city_pressure[0, 0, 0, 0] = 5
    sim.city_followed[0, 0, 0] = 0
    _off7 = int(sim.gp_offer[0, 7])
    _pr7 = float(sim.gp_price[0, 7])
    snap = sim.snapshot()
    sim.gp_earned[:, 7] = 0
    sim.gp_claimed[:, 7, :] = False
    sim.gp_offer[:, 7] = -1
    sim.gp_price[:, 7] = 0.0
    sim.civ_faith[:, 0] = -1.0
    sim.enh_claimed[0, 2] = False
    sim.civ_enhancer[0, 1] = -1
    sim.claimed_e_n[0] = 9
    sim.holy_tile[0, 0] = -1
    sim.city_pressure[0, 0, 0, 0] = 0
    sim.city_followed[0, 0, 0] = -1
    sim.restore(snap)
    assert int(sim.gp_earned[0, 7]) >= 1, "gp_earned not preserved across snapshot"
    assert bool(sim.gp_claimed[0, 7].any()), "gp_claimed not preserved across snapshot"
    assert int(sim.gp_offer[0, 7]) == _off7 and float(sim.gp_price[0, 7]) == _pr7,         "gp_offer/gp_price not preserved across snapshot"
    assert float(sim.civ_faith[0, 0]) >= 60.0, "faith not preserved across snapshot"
    assert bool(sim.enh_claimed[0, 2]) and int(sim.civ_enhancer[0, 1]) == 2 and int(sim.claimed_e_n[0]) == 1, \
        "enhancer race state not preserved across snapshot"
    assert int(sim.holy_tile[0, 0]) == 42 and int(sim.city_pressure[0, 0, 0, 0]) == 5 and int(sim.city_followed[0, 0, 0]) == 0, \
        "pressure-spread state not preserved across snapshot"

    # --- per-city FOLLOWER-belief coupling ---------------------------------
    # A city draws the follower belief of the religion it FOLLOWS, not its
    # owner's — proven bit-exactly via the coupling mechanism (_follower_by_rel
    # / _follower_id_for / _fol_tab) plus the flag routing.
    if sim.n_majors >= 3:
        import json as _json
        _braw = _json.loads((FIXTURES / "rules.json").read_text())["buildings"]
        _bid = [b["id"] for b in _braw]
        sh, te = _bid.index("SHRINE"), _bid.index("TEMPLE")
        # follower belief ids (data order): WORK_ETHIC 0, FEED_THE_WORLD 1.
        sim.civ_follower[:, 1] = 0  # civ 0 -> WORK_ETHIC
        sim.civ_follower[:, 2] = 1  # civ 1 -> FEED_THE_WORLD
        fbr = sim._follower_by_rel()
        assert bool((fbr[:, 0] == -1).all()), "seat-0 religion (col 0) never founds in-gate -> no follower"
        assert bool((fbr[:, 1] == 0).all()) and bool((fbr[:, 2] == 1).all()), "religion id -> founding civ's follower"
        # A city following religion 2 (civ 1) draws civ 1's follower (1); a
        # city following religion 1 (civ 0) draws civ 0's follower (0); a
        # city following none draws nothing — the FOREIGN-draw claim.
        rel = torch.full((sim.B, 3), -1, dtype=torch.long)
        rel[:, 0] = 2
        rel[:, 1] = 1
        fid = sim._follower_id_for(rel)
        assert bool((fid[:, 0] == 1).all()), "following religion 2 -> civ 1's follower (FEED_THE_WORLD)"
        assert bool((fid[:, 1] == 0).all()), "following religion 1 -> civ 0's follower (WORK_ETHIC)"
        assert bool((fid[:, 2] == -1).all()), "following no religion -> no follower (pad)"
        we = sim._fol_tab("we", fid)  # [B, 3]
        assert bool((we[:, 0] == 0).all()), "FEED_THE_WORLD carries no Work Ethic"
        assert bool((we[:, 1] == 1.0).all()), "WORK_ETHIC follower -> we = 1"
        assert bool((we[:, 2] == 0).all()), "no follower -> pad row we = 0"
        by = sim._fol_tab("bldgY", fid)  # [B, 3, NB, 6]
        assert bool((by[:, 0, sh, 0] == 1.0).all()), "FEED_THE_WORLD SHRINE +1 food"
        assert bool((by[:, 0, te, 0] == 2.0).all()), "FEED_THE_WORLD TEMPLE +2 food"
        assert float(by[:, 1].abs().sum()) == 0.0, "WORK_ETHIC carries no building yields"
        # founder (Stewardship) stays per-civ: _bel_add_pf excludes the follower.
        pf = sim._bel_add_pf("bldgY", 0)  # [B, NB, 6]
        full = sim._bel_add("bldgY", 0)
        folrow = sim._bel["fol"]["bldgY"][sim.civ_follower[:, 1] + 1]
        assert bool(((pf + folrow - full).abs().sum() == 0)), "pan+founder + follower must reconstruct the full bldgY"
        # flag routing: LIVE -> followedReligion; INERT -> owner religion.
        if sim._b18_couple:
            assert bool((sim._city_rel(0) == sim.city_followed[:, 0, :sim.RC]).all()), "LIVE: seat 0 draws followedReligion"
            assert bool((sim._city_rel(2) == sim.city_followed[:, 1 + 1]).all()), "LIVE: civ draws civ_city_followed"
        else:
            assert bool((sim._city_rel(0) == 0).all()), "INERT: seat 0 draws religion 0"
            assert bool((sim._city_rel(2) == 2).all()), "INERT: civ 1 draws owner religion 2"

    print("SLICE-Q RELIGION+GP OK")
    print("SLICE-U FOLLOWER-COUPLING OK")


if __name__ == "__main__":
    main()
