"""Slice Q (#47) poke self-test — religion + great-people depth.

Covers paths the scripted rollout can't reach organically:
  * B-19 GP era-cost ladder + its past-the-end boundary (clamp holds the
    top era cost), driven through the player advance loop.
  * B-19 Writer/Musician classes: n_gp = 9, both share the Theater Square
    district index with the Artist (the three culture classes).
  * B-18/B-27 belief catalog counts (pantheons 25 / followers 9 /
    founders 8) and the Enhancer slot (pool 7 + inert effect table
    exported for the deferred GPU enhancer race).

Follows the occupancy_test pattern: load rules + a fixture, drive the
GPU BatchSim, assert on its internal tensors.
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
    bl = rules.beliefs

    # --- B-19: era-anchored GP cost ladder ---------------------------------
    ladder = [60, 120, 200, 290, 390, 500, 620, 750]
    assert rr["gpCosts"] == ladder, f"gpCosts not the era ladder: {rr['gpCosts']}"

    # --- B-19: Writer/Musician classes -> n_gp = 9 -------------------------
    cd = rr["gpClassDistrict"]
    assert len(cd) == 9, f"expected 9 GP classes (Writer/Musician added), got {len(cd)}"
    assert rr["gpRoster"] == [4] * 9, f"per-class rosters must stay rectangular: {rr['gpRoster']}"
    # GP_CLASSES order: SCIENTIST,ENGINEER,MERCHANT,PROPHET,ARTIST,ADMIRAL,
    # GENERAL,WRITER,MUSICIAN. The three culture classes share the Theater
    # Square district index; PROPHET keeps index 3 (prophetCls).
    assert cd[4] == cd[7] == cd[8], "Artist/Writer/Musician must share Theater Square"
    assert rr["prophetCls"] == 3, f"prophetCls must stay 3, got {rr['prophetCls']}"

    # --- B-18/B-27: belief catalog counts + Enhancer slot ------------------
    assert rr["pantheonPool"] == 25, f"pantheons: {rr['pantheonPool']}"
    assert rr["followerPool"] == 9, f"followers: {rr['followerPool']}"
    assert rr["founderPool"] == 8, f"founders: {rr['founderPool']}"
    assert rr["enhancerPool"] == 7, f"enhancers: {rr['enhancerPool']}"
    assert len(bl["pantheons"]) == 25 and len(bl["followers"]) == 9 and len(bl["founders"]) == 8
    # Enhancer effect table is exported (all inert) for the deferred race.
    assert len(bl.get("enhancers", [])) == 7, "enhancer effect rows missing from export"

    # --- GPU side: tensors auto-extend to n_gp = 9 -------------------------
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run the exporter first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    assert sim._gp_nc == 9, f"engine n_gp must be 9, got {sim._gp_nc}"
    assert sim.gp_earned.shape[1] == 9 and sim.player_gp_points.shape[1] == 9
    assert sim.r_gpp.shape[2] == 9, "rival gpp tensor must be n_gp wide"
    assert list(sim._gp_costs.tolist()) == [float(x) for x in ladder]

    # --- B-18: enhancer race state is wired (mirror of follower/founder) ----
    assert sim._enh_any, "enhancer pool must be non-empty"
    assert sim.enh_claimed.shape[1] == 7, f"enh pool mask width: {sim.enh_claimed.shape[1]}"
    assert sim.r_enhancer.shape == sim.r_follower.shape, "r_enhancer must mirror r_follower"
    assert sim.r_enhancer_done.shape == sim.r_religion_done.shape
    assert bool((sim.r_enhancer == -1).all()) and int(sim.claimed_e_n.sum()) == 0, "fresh: no enhancer claimed"
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

    # --- B-18: religious pressure spread (accumulate / tie / flip / KILL) ---
    assert sim.holy_tile.shape[1] == sim._O and sim._O == 1 + sim.R
    assert sim.city_pressure.shape == (sim.B, sim.C, sim._O)
    assert sim.city_followed.shape == (sim.B, sim.C)
    assert sim.rc_pressure.shape[3] == sim._O and sim.rc_followed.shape == sim.rc_alive.shape
    if sim.R >= 2 and sim._O >= 3:
        sim.city_pressure.zero_()
        sim.city_followed.fill_(-1)
        sim.holy_tile.fill_(-1)
        assert bool(sim.alive[:, 0].all()), "fixture city 0 (capital) must be alive"
        # Religions 1 & 2 both found their holy city AT city 0's center (dist 0,
        # always in range) -> equal pressure each turn -> a permanent tie.
        c0 = sim.site[:, 0].clone()
        sim.holy_tile[:, 1] = c0
        sim.holy_tile[:, 2] = c0
        sim._spread_religious_pressure()
        assert bool((sim.city_pressure[:, 0, 1] == 1).all()), "religion-1 +1 pressure"
        assert bool((sim.city_pressure[:, 0, 2] == 1).all()), "religion-2 +1 pressure"
        assert bool((sim.city_followed[:, 0] == 1).all()), "tie must resolve to the lower religion id"
        for _ in range(3):
            sim._spread_religious_pressure()
        assert bool((sim.city_pressure[:, 0, 1] == 4).all()), "integer accumulation over turns"
        assert bool((sim.city_followed[:, 0] == 1).all()), "still tied -> id 1"
        # Break the tie: religion 2 gains extra pressure -> majority flip to 2.
        sim.city_pressure[:, 0, 2] += 5
        sim._spread_religious_pressure()  # r1 -> 5, r2 -> 10
        assert bool((sim.city_followed[:, 0] == 2).all()), "majority pressure must flip to religion 2"
        # KILL hygiene: a razed city's pressure row is zeroed, follows nothing.
        sim.alive[:, 0] = False
        sim._spread_religious_pressure()
        assert bool((sim.city_pressure[:, 0, :] == 0).all()), "dead-slot pressure must reset (KILL hygiene)"
        assert bool((sim.city_followed[:, 0] == -1).all()), "dead city follows nothing"
        sim.alive[:, 0] = True
        # rc side: a dead rival-city slot is likewise zeroed and follows nothing.
        sim.rc_pressure.zero_()
        sim.rc_followed.fill_(-1)
        sim.rc_pressure[:, 0, 0, 1] = 7  # stale pressure on a (possibly dead) slot
        sim._spread_religious_pressure()
        dead_rc = ~sim.rc_alive[:, 0, 0]
        if bool(dead_rc.any()):
            assert bool((sim.rc_pressure[dead_rc, 0, 0, :] == 0).all()), "dead rc-slot pressure must reset"
            assert bool((sim.rc_followed[dead_rc, 0, 0] == -1).all()), "dead rc city follows nothing"
        # restore the pressure tensors for the snapshot round-trip below
        sim.city_pressure.zero_()
        sim.city_followed.fill_(-1)
        sim.holy_tile.fill_(-1)
        sim.rc_pressure.zero_()
        sim.rc_followed.fill_(-1)

    # --- B-19: ladder-boundary clamp (past the roster the top era holds) ---
    top = sim._gp_costs.shape[0] - 1
    probe = torch.tensor([top, top + 5, 99])  # indices past the end
    costs = sim._gp_costs[probe.clamp(max=top)]
    assert bool((costs == 750.0).all()), "past-ladder cost must clamp to 750"

    # --- B-19 behavior: a Writer (class 7) is earnable through the player
    # advance loop (culture -> current civic), proving the widened tensors
    # flow end to end. Fresh turn 1: no districts, so only the injected class
    # can earn; civic_prog rises by exactly the Writer's first-era effect.
    if sim.districts_on:
        civic0 = sim.civic_prog.clone()
        earned0 = sim.gp_earned[:, 7].clone()
        sim.player_gp_points[:, 7] = 100.0  # >= gpCost(0) = 60
        sim._advance_player_great_people()
        assert bool((sim.gp_earned[:, 7] == earned0 + 1).all()), "Writer not earned"
        d_civic = (sim.civic_prog - civic0)
        assert bool((d_civic == 45.0).all()), f"Writer culture lump wrong: {d_civic.tolist()}"

    # --- G-2: a player-earned PROPHET banks its faith-column effect ---------
    # Confucius (PROPHET class 3, roster idx 0) carries fx.faith = 100; TS
    # applyGreatPersonEffect banks it into state.faithTotal and the rival GP
    # loop applies its col-4 into r_faith, but the player GP loop dropped it.
    # Drive a fresh player Prophet claim and assert player_faith rises by
    # exactly the effect (regression guard against the col-4 omission).
    if sim.districts_on:
        assert sim._gp_effects.shape[2] > 4, "gpEffects must carry the faith column"
        pc = int(rr["prophetCls"])  # 3
        assert float(sim._gp_effects[pc, 0, 4]) == 100.0, "Confucius faith effect changed"
        faith0 = sim.player_faith.clone()
        pe0 = sim.gp_earned[:, pc].clone()
        sim.player_gp_points[:, pc] = 100.0  # >= gpCost(0) = 60, earns one Prophet
        sim._advance_player_great_people()
        assert bool((sim.gp_earned[:, pc] == pe0 + 1).all()), "Prophet not earned"
        d_faith = sim.player_faith - faith0
        assert bool((d_faith == 100.0).all()), f"player faith bank wrong: {d_faith.tolist()}"

    # snapshot/restore round-trips the GP tensors + the G-2 player_faith bank
    # and the B-18 enhancer race state (all registered in _MUTABLE).
    sim.enh_claimed[0, 2] = True  # give the enhancer state something to restore
    sim.r_enhancer[0, 0] = 2
    sim.r_enhancer_done[0, 0] = True
    sim.claimed_e_n[0] = 1
    sim.holy_tile[0, 0] = 42  # B-18 pressure state to restore
    sim.city_pressure[0, 0, 0] = 5
    sim.city_followed[0, 0] = 0
    snap = sim.snapshot()
    sim.gp_earned[:, 7] = 0
    sim.player_faith[:] = -1.0
    sim.enh_claimed[0, 2] = False
    sim.r_enhancer[0, 0] = -1
    sim.claimed_e_n[0] = 9
    sim.holy_tile[0, 0] = -1
    sim.city_pressure[0, 0, 0] = 0
    sim.city_followed[0, 0] = -1
    sim.restore(snap)
    assert int(sim.gp_earned[0, 7]) >= 1, "gp_earned not preserved across snapshot"
    assert float(sim.player_faith[0]) >= 100.0, "player_faith not preserved across snapshot"
    assert bool(sim.enh_claimed[0, 2]) and int(sim.r_enhancer[0, 0]) == 2 and int(sim.claimed_e_n[0]) == 1, \
        "enhancer race state not preserved across snapshot"
    assert int(sim.holy_tile[0, 0]) == 42 and int(sim.city_pressure[0, 0, 0]) == 5 and int(sim.city_followed[0, 0]) == 0, \
        "pressure-spread state not preserved across snapshot"

    print("SLICE-Q RELIGION+GP OK")


if __name__ == "__main__":
    main()
