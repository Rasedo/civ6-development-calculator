"""AUDIT G-1 self-test: rival-builder Δ-gains ride CURRENT research.

TS splits the builder decision's research inputs: VALIDITY comes from
rivalUnlocks (phase-top snapshot — the seed-9274-t100 catch recorded on
_rival_job_mask), but the Δ-gain ctx is modifiersFromResearch(
rival.research) built AT CALL TIME (rivals.ts rivalBuilderActions) —
after this turn's tech/civic completions, which run earlier in
rivalPhase. On the exact turn a farm-adjacency tech lands, TS ranks
with the new tier while a snapshot-gain model still ranks with the old
one and flips MINE-vs-FARM on a farmable hill (observed at seed 9196
t248 pre-fix). No organic fixture trajectory holds the completion turn
and the tile shape at once, so both halves are POKED directly (the
occupancy_test pattern):

  1. gains-are-current: farm-adj tech completed "this turn" (in current,
     not in the snapshot) must count toward FARM's gain -> FARM wins the
     catalog tie via the FARM > MINE opts order.
  2. validity-is-snapshot: hill-farms civic completed "this turn" must
     NOT make the hill farmable yet -> MINE is built (protects the
     seed-9274 catch against over-correcting to all-current).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def pick_tile(sim, banned: set[int]) -> int:
    """A bare rival-farmable/mineable hill: both options valid, no
    resource roster entry, no lumber, nothing on it, nobody on it."""
    cand = (
        sim.farm_hill[0]
        & sim.mine_ok[0]
        & ~sim.lumber_ok[0]
        & (sim.improvement[0] < 0)
        & (sim.district[0] < 0)
        & (sim.built_wonder[0] < 0)
        & (sim.rvcity_at[0] < 0)
        & (sim.res_imp[0] < 3)
        & ~sim.pillaged[0]
        & (sim.rv_at[0] < 0)
        & (sim.rvciv_at[0] < 0)
    ).nonzero(as_tuple=True)[0]
    for i in cand.tolist():
        if i not in banned:
            return i
    raise AssertionError("no farmable+mineable bare hill tile in fixture 0")


def add_builder(sim, r: int, t: int) -> int:
    slot = int(sim.v_next[0])
    sim.v_alive[0, slot] = True
    sim.v_civ[0, slot] = r
    sim.v_type[0, slot] = sim._builder_idx
    sim.v_tile[0, slot] = t
    sim.v_hp[0, slot] = 100
    sim.v_charges[0, slot] = 1
    sim.v_mp[0, slot] = sim._p_moves[sim._builder_idx]  # #51/S5.2b: a fresh unit is unspent
    sim.v_mp_full[0, slot] = sim.v_mp[0, slot]
    sim.v_fortify[0, slot] = 0
    sim.occ_civ[0, t] = slot + sim.POOL_LO["v"]
    sim.v_next[0] += 1
    return slot


def two_farm_neighbors(sim, t: int, used: set[int]) -> None:
    """Plant FARMs on two land neighbors (adjacency counts any neighbor
    farm, TS yields.ts; keep the poke on farmable land for honesty)."""
    nbs = [int(n) for n in sim.neigh[t].tolist() if n >= 0]
    farm_nbs = [n for n in nbs if bool((sim.farm_flat[0, n] | sim.farm_hill[0, n])) and n not in used]
    picked = (farm_nbs + [n for n in nbs if n not in used and n not in farm_nbs])[:2]
    assert len(picked) == 2, "tile has fewer than 2 usable neighbors"
    for n in picked:
        sim.improvement[0, n] = sim.FARM
        used.add(n)


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    r = 0

    # the catalog features this test needs (FEUDALISM twin tech, hill
    # farms civic, mine boosts) — bail loudly if the export drops them
    assert sim._farmadj_civic >= 0 and sim._farmadj_tech >= 0, "farm-adjacency effects missing from export"
    assert sim._hillfarms_civic >= 0, "hill-farms civic missing from export"
    assert sim.MINE >= 0 and sim._mine_unlock_tech >= 0, "MINE missing from export"
    assert sim._mine_boost_tech.numel() > 0, "mine boost techs missing from export"

    # research: everything ON in CURRENT (both mine boosts, both farm-adj
    # tiers, hill farms, mine unlock) — the scenarios carve snapshots out
    sim.r_techs[0, r, sim._mine_unlock_tech] = True
    for i in sim._mine_boost_tech.tolist():
        sim.r_techs[0, r, i] = True
    sim.r_techs[0, r, sim._farmadj_tech] = True
    sim.r_civics[0, r, sim._hillfarms_civic] = True
    sim.r_civics[0, r, sim._farmadj_civic] = True

    # the catalog arithmetic this test's tie rests on: with >=2 adjacent
    # farms, farm gain (food+tier2)·2 must TIE mine gain (prod+boosts)·2,
    # and lose the tie once tier drops to 1 (the snapshot side)
    wt = sim.rules_dev.focus_base
    mb = float(sim._mine_boost_amt.sum())
    farm_cur = (sim._farm_food + 2.0) * float(wt[0])
    farm_snap = (sim._farm_food + 1.0) * float(wt[0])
    mine_g = (sim._mine_prod + mb) * float(wt[1])
    assert farm_cur >= mine_g > farm_snap, (
        f"catalog drifted: farm_cur {farm_cur} / mine {mine_g} / farm_snap {farm_snap} "
        "no longer straddle the tie this test pokes — re-derive the scenario"
    )

    used: set[int] = set()

    # -- scenario 1: gains ride CURRENT research ------------------------
    # farm-adj TECH completed this turn: in current, absent in snapshot.
    # Old snapshot-gain model: farm (1+1)·2 = 4 < mine (1+2)·2 = 6 -> MINE.
    # TS (current mods): farm (1+2)·2 = 6 ties mine -> FARM (opts order).
    t1 = pick_tile(sim, used)
    used.add(t1)
    sim.rival_at[0, t1] = r
    two_farm_neighbors(sim, t1, used)
    add_builder(sim, r, t1)
    tk0 = sim.r_techs[:, r].clone()
    tk0[0, sim._farmadj_tech] = False
    cv0 = sim.r_civics[:, r].clone()
    active = torch.ones(sim.B, dtype=torch.bool)
    sim._rival_builder_actions(r, active, techs0=tk0, civics0=cv0)
    got1 = int(sim.improvement[0, t1])
    assert got1 == int(sim.FARM), (
        f"G-1: completion-turn gains must use CURRENT research (TS "
        f"modifiersFromResearch at call time) -> FARM, got {got1} "
        f"(MINE={int(sim.MINE)})"
    )

    # -- scenario 2: validity rides the SNAPSHOT ------------------------
    # hill-farms CIVIC completed this turn: farm invalid under cv0 even
    # though current civics allow it -> MINE (an all-current
    # over-correction would tie-pick FARM here).
    t2 = pick_tile(sim, used)
    used.add(t2)
    sim.rival_at[0, t2] = r
    two_farm_neighbors(sim, t2, used)
    add_builder(sim, r, t2)
    tk0b = sim.r_techs[:, r].clone()
    cv0b = sim.r_civics[:, r].clone()
    cv0b[0, sim._hillfarms_civic] = False
    sim._rival_builder_actions(r, active, techs0=tk0b, civics0=cv0b)
    got2 = int(sim.improvement[0, t2])
    assert got2 == int(sim.MINE), (
        f"G-1 guard: validity must stay on the phase-top snapshot (TS "
        f"rivalUnlocks, the seed-9274 catch) -> MINE, got {got2} "
        f"(FARM={int(sim.FARM)})"
    )

    print("BUILDER GAIN OK")


if __name__ == "__main__":
    main()
