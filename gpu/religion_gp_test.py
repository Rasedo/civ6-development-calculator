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

    # snapshot/restore round-trips the (unchanged-shape) GP tensors
    snap = sim.snapshot()
    sim.gp_earned[:, 7] = 0
    sim.restore(snap)
    assert int(sim.gp_earned[0, 7]) >= 1, "gp_earned not preserved across snapshot"

    print("SLICE-Q RELIGION+GP OK")


if __name__ == "__main__":
    main()
