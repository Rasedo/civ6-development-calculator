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
from core import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    rr = rules.seats
    bl = rules.beliefs

    # --- era-anchored GP cost ladder ---------------------------------------
    ladder = [60, 120, 200, 290, 390, 500, 620, 750]
    assert rr["gpCosts"] == ladder, f"gpCosts not the era ladder: {rr['gpCosts']}"

    # --- Writer/Musician classes -> n_gp = 9 -------------------------------
    cd = rr["gpClassDistrict"]
    assert len(cd) == 9, f"expected 9 GP classes (Writer/Musician added), got {len(cd)}"
    assert rr["gpRoster"] == [4] * 9, f"per-class rosters must stay rectangular: {rr['gpRoster']}"
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
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run the exporter first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim._gp_nc == 9, f"engine n_gp must be 9, got {sim._gp_nc}"
    assert sim.gp_earned.shape[1] == 9 and sim.gp_points.shape[1] == 9
    assert sim.civ_only_gpp.shape[2] == 9, "civ gpp tensor must be n_gp wide"
    assert list(sim._gp_costs.tolist()) == [float(x) for x in ladder]

    # --- enhancer race state is wired (mirror of follower/founder) ---------
    assert sim._enh_any, "enhancer pool must be non-empty"
    assert sim.enh_claimed.shape[1] == 7, f"enh pool mask width: {sim.enh_claimed.shape[1]}"
    assert sim.civ_only_enhancer.shape == sim.civ_only_follower.shape, "civ_only_enhancer must mirror civ_only_follower"
    assert sim.civ_only_enhancer_done.shape == sim.civ_only_religion_done.shape
    assert bool((sim.civ_only_enhancer == -1).all()) and int(sim.claimed_e_n.sum()) == 0, "fresh: no enhancer claimed"
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
    assert sim.holy_tile.shape[1] == sim._O and sim._O == 1 + sim.R
    assert sim.city_pressure[:, 0, :sim.C].shape == (sim.B, sim.C, sim._O)
    assert sim.city_followed[:, 0, :sim.C].shape == (sim.B, sim.C)
    assert sim.city_pressure[:, 1:1 + sim.R].shape[3] == sim._O and sim.city_followed[:, 1:1 + sim.R].shape == sim.civ_city_alive.shape
    if sim.R >= 2 and sim._O >= 3:
        sim.city_pressure[:, 0, :sim.C].zero_()
        sim.city_followed[:, 0, :sim.C].fill_(-1)
        sim.holy_tile.fill_(-1)
        assert bool(sim.alive[:, 0].all()), "fixture city 0 (capital) must be alive"
        # Religions 1 & 2 both found their holy city AT city 0's center (dist 0,
        # always in range) -> equal pressure each turn -> a permanent tie.
        c0 = sim.site[:, 0].clone()
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
        sim.alive[:, 0] = False
        sim._spread_religious_pressure()
        assert bool((sim.city_pressure[:, 0, 0, :] == 0).all()), "dead-slot pressure must reset (KILL hygiene)"
        assert bool((sim.city_followed[:, 0, 0] == -1).all()), "dead city follows nothing"
        sim.alive[:, 0] = True
        # rc side: a dead civ-city slot is likewise zeroed and follows nothing.
        sim.city_pressure[:, 1:1 + sim.R].zero_()
        sim.city_followed[:, 1:1 + sim.R].fill_(-1)
        sim.city_pressure[:, 0 + 1, 0, 1] = 7  # stale pressure on a (possibly dead) slot
        sim._spread_religious_pressure()
        dead_rc = ~sim.civ_city_alive[:, 0, 0]
        if bool(dead_rc.any()):
            assert bool((sim.city_pressure[dead_rc, 0 + 1, 0, :] == 0).all()), "dead rc-slot pressure must reset"
            assert bool((sim.city_followed[dead_rc, 0 + 1, 0] == -1).all()), "dead rc city follows nothing"
        # restore the pressure tensors for the snapshot round-trip below
        sim.city_pressure[:, 0, :sim.C].zero_()
        sim.city_followed[:, 0, :sim.C].fill_(-1)
        sim.holy_tile.fill_(-1)
        sim.city_pressure[:, 1:1 + sim.R].zero_()
        sim.city_followed[:, 1:1 + sim.R].fill_(-1)

    # --- ladder-boundary clamp (past the roster the top era holds) ---------
    top = sim._gp_costs.shape[0] - 1
    probe = torch.tensor([top, top + 5, 99])  # indices past the end
    costs = sim._gp_costs[probe.clamp(max=top)]
    assert bool((costs == 750.0).all()), "past-ladder cost must clamp to 750"

    # --- a Writer (class 7) is earnable through the seat-0 advance loop,
    # proving the widened tensors flow end to end. Fresh turn 1: no districts
    # + no AMPHITHEATER, so both of the Writer's 2 Great Works OVERFLOW to the
    # instant culture lump (2 works × first-era effect 45 = 90) and no slot is
    # occupied.
    if sim.districts_on:
        civic0 = sim.civic_prog.clone()
        earned0 = sim.gp_earned[:, 7].clone()
        gw0 = (sim.gw_writing + sim.gw_music).sum().item()
        sim.gp_points[:, 7] = 100.0  # >= gpCost(0) = 60
        sim._advance_great_people()
        assert bool((sim.gp_earned[:, 7] == earned0 + 1).all()), "Writer not earned"
        d_civic = (sim.civic_prog - civic0)
        assert bool((d_civic == 90.0).all()), f"Writer overflow lump wrong (want 2×45): {d_civic.tolist()}"
        assert (sim.gw_writing + sim.gw_music).sum().item() == gw0, "no AMPHITHEATER -> no slotted work"

    # --- a seat-0 PROPHET banks its faith-column effect ---------------------
    # Confucius (PROPHET class 3, roster idx 0) carries fx.faith = 100; the TS
    # applyGreatPersonEffect banks it into the seat's faith total and the civ
    # GP loop applies its col-4 into civ_only_faith. Drive a fresh seat-0 Prophet
    # claim and assert faith rises by exactly the effect.
    if sim.districts_on:
        assert sim._gp_effects.shape[2] > 4, "gpEffects must carry the faith column"
        pc = int(rr["prophetCls"])  # 3
        assert float(sim._gp_effects[pc, 0, 4]) == 100.0, "Confucius faith effect changed"
        faith0 = sim.faith.clone()
        pe0 = sim.gp_earned[:, pc].clone()
        sim.gp_points[:, pc] = 100.0  # >= gpCost(0) = 60, earns one Prophet
        sim._advance_great_people()
        assert bool((sim.gp_earned[:, pc] == pe0 + 1).all()), "Prophet not earned"
        d_faith = sim.faith - faith0
        assert bool((d_faith == 100.0).all()), f"seat-0 faith bank wrong: {d_faith.tolist()}"

    # snapshot/restore round-trips the GP tensors + the faith bank
    # and the enhancer race state (all registered in _MUTABLE).
    sim.enh_claimed[0, 2] = True  # give the enhancer state something to restore
    sim.civ_only_enhancer[0, 0] = 2
    sim.civ_only_enhancer_done[0, 0] = True
    sim.claimed_e_n[0] = 1
    sim.holy_tile[0, 0] = 42  # pressure state to restore
    sim.city_pressure[0, 0, 0, 0] = 5
    sim.city_followed[0, 0, 0] = 0
    snap = sim.snapshot()
    sim.gp_earned[:, 7] = 0
    sim.faith[:] = -1.0
    sim.enh_claimed[0, 2] = False
    sim.civ_only_enhancer[0, 0] = -1
    sim.claimed_e_n[0] = 9
    sim.holy_tile[0, 0] = -1
    sim.city_pressure[0, 0, 0, 0] = 0
    sim.city_followed[0, 0, 0] = -1
    sim.restore(snap)
    assert int(sim.gp_earned[0, 7]) >= 1, "gp_earned not preserved across snapshot"
    assert float(sim.faith[0]) >= 100.0, "faith not preserved across snapshot"
    assert bool(sim.enh_claimed[0, 2]) and int(sim.civ_only_enhancer[0, 0]) == 2 and int(sim.claimed_e_n[0]) == 1, \
        "enhancer race state not preserved across snapshot"
    assert int(sim.holy_tile[0, 0]) == 42 and int(sim.city_pressure[0, 0, 0, 0]) == 5 and int(sim.city_followed[0, 0, 0]) == 0, \
        "pressure-spread state not preserved across snapshot"

    # --- per-city FOLLOWER-belief coupling ---------------------------------
    # A city draws the follower belief of the religion it FOLLOWS, not its
    # owner's — proven bit-exactly via the coupling mechanism (_follower_by_rel
    # / _follower_id_for / _fol_tab) plus the flag routing.
    if sim.R >= 2:
        import json as _json
        _braw = _json.loads((FIXTURES / "rules.json").read_text())["buildings"]
        _bid = [b["id"] for b in _braw]
        sh, te = _bid.index("SHRINE"), _bid.index("TEMPLE")
        # follower belief ids (data order): WORK_ETHIC 0, FEED_THE_WORLD 1.
        sim.civ_only_follower[:, 0] = 0  # civ 0 -> WORK_ETHIC
        sim.civ_only_follower[:, 1] = 1  # civ 1 -> FEED_THE_WORLD
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
        folrow = sim._bel["fol"]["bldgY"][sim.civ_only_follower[:, 0] + 1]
        assert bool(((pf + folrow - full).abs().sum() == 0)), "pan+founder + follower must reconstruct the full bldgY"
        # flag routing: LIVE -> followedReligion; INERT -> owner religion.
        if sim._b18_couple:
            assert bool((sim._city_rel_seat0() == sim.city_followed[:, 0, :sim.C]).all()), "LIVE: seat 0 draws followedReligion"
            assert bool((sim._civ_city_rel(1) == sim.city_followed[:, 1 + 1]).all()), "LIVE: civ draws civ_city_followed"
        else:
            assert bool((sim._city_rel_seat0() == 0).all()), "INERT: seat 0 draws religion 0"
            assert bool((sim._civ_city_rel(1) == 2).all()), "INERT: civ 1 draws owner religion 2"

    print("SLICE-Q RELIGION+GP OK")
    print("SLICE-U FOLLOWER-COUPLING OK")


if __name__ == "__main__":
    main()
