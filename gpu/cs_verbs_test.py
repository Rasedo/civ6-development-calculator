"""AUDIT A-12 (B8-L) self-test: RIVAL city-state verbs — levy + quests.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/cs_verbs_test.py

Two rival-seat CS mechanics land in this round, both driven from the rival
phase (engine.py `_rival_phase` levy block + `_rival_quest_phase`, TS twins
`rivalPhase`'s levy branch + issueRivalQuest/rivalQuestSatisfied):

  * RIVAL LEVY — an AT-WAR rival suzerain of a militaristic CS spawns
    levyUnits units of the 2-step ladder at the CS center, paying
    levyGoldCost, on a per-CS cooldown SHARED across seats (cs_last_levy).
  * RIVAL QUESTS (zero-draw) — one deterministic quest per (rival, CS):
    the FIRST SATISFIABLE of [clearCamp, buildDistrict, sendTradeRoute],
    NO RNG; completion pays +questEnvoys to that rival's cs_r_envoys.

The 24×250 gate exercises both organically (6 levies / 24 quest completions
across the seeds), but can't isolate the branch logic — each threshold, the
shared cooldown, the deterministic order, and the ZERO-DRAW guarantee are
pinned here on a single-batch CPU sim with the state forced by hand.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES

R = 0        # the rival under test
OTHER = 1    # the other rival (forced inert)


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def v_next(sim) -> int:
    return int(sim.v_next[0])


def active_mask(sim) -> torch.Tensor:
    return sim.r_alive[:, R] & (sim.rc_alive[:, R].sum(dim=1) > 0)


def clear_queues(sim) -> None:
    """No queue item can complete this phase (isolates the buy/levy block)."""
    for r in (R, OTHER):
        sim.rc_current[:, r] = -1
        sim.rc_progress[:, r] = 0.0
        sim.rc_cost[:, r] = 0.0


def make_suzerain_mil(sim, s: int, envoys: int = 5) -> None:
    """Force CS slot `s` militaristic + alive, met by R, with R holding the
    strict suzerain envoy majority (player 0, other rival 0)."""
    mil = int(sim.rules.cs["militaristicIdx"])
    sim.cs_type[0, s] = mil
    sim.cs_alive[0, s] = True
    sim.cs_r_met[0, R, s] = True
    sim.cs_r_envoys[0, R, s] = envoys
    sim.cs_r_envoys[0, OTHER, s] = 0
    sim.cs_envoys[0, s] = 0


def empty_land_tiles(sim, k: int) -> list[int]:
    """k passable land tiles with nothing/nobody on them (inject military far
    from any spawn probe so it perturbs nothing but the quota count)."""
    free = (
        sim.passable[0]
        & (sim.rv_at[0] < 0) & (sim.rvciv_at[0] < 0) & (sim.barb_at[0] < 0)
        & (sim.pmil_at[0] < 0) & (sim.pciv_at[0] < 0) & (sim.rvcity_at[0] < 0)
        & (sim.cs_at[0] < 0) & (sim.owner[0] < 0) & (sim.rival_at[0] < 0)
    ).nonzero(as_tuple=True)[0].tolist()
    assert len(free) >= k, "not enough empty land tiles to inject"
    return free[:k]


def mil_count(sim, r: int) -> int:
    t = sim.v_type[0].clamp(min=0, max=sim.NU - 1)
    return int((sim.v_alive[0] & (sim.v_civ[0] == r) & (sim._p_combat[t] > 0)).sum())


def meet_quota(sim, r: int) -> None:
    """Inject WARRIORs (far away) until r's military hits the #56 H1 quota, so
    the A-5r gold-buy unit branch (warrior ×mult = 96 < levy 120) can't fire
    and drain the treasury before the levy runs."""
    quota = 2 * int(sim.rc_alive[0, r].sum())
    need = max(0, quota - mil_count(sim, r))
    if need == 0:
        return
    for t in empty_land_tiles(sim, need):
        slot = int(sim.v_next[0])
        sim.v_alive[0, slot] = True
        sim.v_civ[0, slot] = r
        sim.v_type[0, slot] = sim._warrior_idx
        sim.v_tile[0, slot] = t
        sim.v_hp[0, slot] = 100
        sim.v_charges[0, slot] = 0
        sim.v_fortify[0, slot] = 0
        sim.occ_mil[0, t] = slot + sim.POOL_LO["v"]
        sim.v_next[0] += 1


def count_levy(sim, vn0: int, s: int, warr: int) -> int:
    """New WARRIOR-type R units in the pool since vn0 — the levy's signature.
    #55 S4: POSITION is deliberately NOT asserted — the levy block precedes
    R's war-acts in the same phase, so levied units can legally WAR-MARCH off
    the CS ring before the poke reads them (seen: spawn 270 -> tile 272 in one
    phase). Isolation comes from the prep instead: queues cleared and the
    gold-buy unit branch quota-blocked, so every new R unit IS a levy spawn."""
    n = 0
    for slot in range(vn0, int(sim.v_next[0])):
        if int(sim.v_type[0, slot]) == warr and int(sim.v_civ[0, slot]) == R:
            n += 1
    return n


def prep_levy(sim, s: int, envoys: int = 5) -> None:
    """Isolate the levy: R at war + suzerain of a militaristic CS, the OTHER
    rival inert (peace, no gold), queues cleared, R's unit quota met."""
    clear_queues(sim)
    sim.r_atwar[0, R] = True
    sim.r_atwar[0, OTHER] = False
    sim.sync_war()  # #51/S4.3: pokes write the legacy stores
    sim.r_treasury[0, OTHER] = 0.0  # the shared v_next pool must not grow from OTHER's buys
    make_suzerain_mil(sim, s, envoys)
    meet_quota(sim, R)


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    path = paths[0]
    print(f"cs_verbs_test on {path.name}")

    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert int(sim.rc_alive[0, R].sum()) >= 1, "rival 0 has no cities after 25 turns"
    assert sim.S >= 1, "fixture has no city-states"
    base = sim.snapshot()

    # #71 FLAG 4 (RIVAL_TILE_BUY_LIVE): the tile-purchase rung runs inside the
    # gold ladder BEFORE the levy, so with it live it drains a treasury this
    # test deliberately sets to EXACTLY the levy price (the affordability edge
    # these cases are about). Held off for this lane; flag 4 has its own
    # coverage in the parity gate.
    sim._tile_buy_live = False

    cd = int(sim.rules.cs["levyCooldown"])
    cost = float(sim.rules.cs["levyGoldCost"])
    n_units = int(sim.rules.cs["levyUnits"])
    warr = sim._warrior_idx
    T = int(sim.turn)
    S0 = 0  # the CS slot under test

    # ============================ RIVAL LEVY ============================
    # -- L1: FIRE — at war, suzerain of a militaristic CS, affordable -------
    sim.restore(base)
    prep_levy(sim, S0)
    sim.r_treasury[0, R] = cost  # exactly the levy price
    vn0 = v_next(sim)
    sim._rival_phase()
    assert int(sim.cs_last_levy[0, S0]) == T, f"L1 levy: cs_last_levy not stamped ({int(sim.cs_last_levy[0, S0])} != {T})"
    assert count_levy(sim, vn0, S0, warr) == n_units, f"L1 levy: expected {n_units} WARRIOR at CS center, got {count_levy(sim, vn0, S0, warr)}"
    print(f"  L1 levy FIRES OK ({n_units} WARRIOR at CS center, cooldown stamped)")

    # -- L2: NOT-AT-WAR gate ------------------------------------------------
    sim.restore(base)
    prep_levy(sim, S0)
    sim.r_atwar[0, R] = False
    sim.sync_war()  # #51/S4.3: pokes write the legacy stores
    sim.r_treasury[0, R] = cost
    sim._rival_phase()
    assert int(sim.cs_last_levy[0, S0]) != T, "L2: a peaceful rival levied"
    print("  L2 not-at-war gate OK (no levy at peace)")

    # -- L3: NOT-SUZERAIN gate (only 2 envoys) ------------------------------
    sim.restore(base)
    prep_levy(sim, S0, envoys=2)  # below suzerainEnvoys
    sim.r_treasury[0, R] = cost
    sim._rival_phase()
    assert int(sim.cs_last_levy[0, S0]) != T, "L3: a non-suzerain rival levied"
    print("  L3 not-suzerain gate OK (2 envoys < suzerain minimum)")

    # -- L4: AFFORDABILITY gate (one milli-unit short) ----------------------
    sim.restore(base)
    prep_levy(sim, S0)
    sim.r_treasury[0, R] = cost - 0.001
    sim._rival_phase()
    assert int(sim.cs_last_levy[0, S0]) != T, "L4: levied below the gold cost"
    print("  L4 affordability gate OK (no levy one milli-unit below cost)")

    # -- L5: COOLDOWN gate + SHARED across seats ----------------------------
    # a recent levy (this-turn − (cd−1)) blocks; exactly cd turns ago is ready.
    sim.restore(base)
    prep_levy(sim, S0)
    sim.r_treasury[0, R] = cost
    sim.cs_last_levy[0, S0] = T - (cd - 1)  # one turn short of ready
    vn0 = v_next(sim)
    sim._rival_phase()
    assert int(sim.cs_last_levy[0, S0]) == T - (cd - 1), "L5 cooldown: levied while on cooldown"
    assert count_levy(sim, vn0, S0, warr) == 0, "L5 cooldown: WARRIORs spawned at the CS while on cooldown"
    print(f"  L5 cooldown gate OK (blocked at {cd - 1} turns since levy; shared cs_last_levy)")

    # ready twin: exactly cd turns ago → levy fires again (shared clock resets)
    sim.restore(base)
    prep_levy(sim, S0)
    sim.r_treasury[0, R] = cost
    sim.cs_last_levy[0, S0] = T - cd
    sim._rival_phase()
    assert int(sim.cs_last_levy[0, S0]) == T, "L5 ready: no levy exactly at cooldown expiry"
    print(f"  L5 ready twin OK (levy fires at exactly {cd} turns since last)")

    # ============================ RIVAL QUESTS =========================
    # -- Q1: ISSUE buildDistrict (deterministic, no camp, not owned) --------
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)  # met + alive; district-type env irrelevant here
    sim.cs_r_quest[0, R, S0] = 0
    sim.cs_r_quest_issued[0, R, S0] = 0  # cooldown long passed (turn ≥ questCooldown)
    # no barb camp near this CS → clearCamp not offered; buildDistrict first.
    sim.camp_tile[:] = -1
    di = int(sim._cs_didx[0, S0])
    # ensure R does NOT already own the CS-type district complete (wipe registry row)
    sim.rc_dist_tile[0, R, :, di] = -1
    rng0 = sim.rng_state.clone()
    sim._rival_quest_phase(R, active_mask(sim))
    assert int(sim.cs_r_quest[0, R, S0]) == 3, f"Q1: expected buildDistrict (3), got {int(sim.cs_r_quest[0, R, S0])}"
    assert torch.equal(sim.rng_state, rng0), "Q1: the quest phase drew RNG (must be zero-draw)"
    print("  Q1 ISSUE buildDistrict OK (deterministic, zero-draw)")

    # -- Q2: ISSUE clearCamp takes precedence when a camp is in range -------
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)
    sim.cs_r_quest[0, R, S0] = 0
    sim.cs_r_quest_issued[0, R, S0] = 0
    # plant a camp adjacent to the CS center (within range 6)
    ctr = int(sim.cs_center[0, S0])
    near_tile = int(sim.neigh[ctr][0])
    sim.camp_tile[:] = -1
    sim.camp_tile[0, 0] = near_tile
    rng0 = sim.rng_state.clone()
    sim._rival_quest_phase(R, active_mask(sim))
    assert int(sim.cs_r_quest[0, R, S0]) == 1, f"Q2: expected clearCamp (1), got {int(sim.cs_r_quest[0, R, S0])}"
    assert int(sim.cs_r_quest_camp[0, R, S0]) == near_tile, "Q2: clearCamp recorded the wrong camp tile"
    assert torch.equal(sim.rng_state, rng0), "Q2: clearCamp issue drew RNG"
    print("  Q2 ISSUE clearCamp precedence OK (nearest camp recorded, zero-draw)")

    # -- Q3: RESOLVE clearCamp → +1 envoy, quest cleared --------------------
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)
    ctr = int(sim.cs_center[0, S0])
    near_tile = int(sim.neigh[ctr][0])
    sim.cs_r_quest[0, R, S0] = 1
    sim.cs_r_quest_camp[0, R, S0] = near_tile
    sim.cs_r_quest_issued[0, R, S0] = T  # fresh — resolution is cooldown-independent
    sim.camp_tile[:] = -1  # the camp is GONE → satisfied
    env0 = int(sim.cs_r_envoys[0, R, S0])
    q_env = int(sim.rules.cs["questEnvoys"])
    rng0 = sim.rng_state.clone()
    sim._rival_quest_phase(R, active_mask(sim))
    assert int(sim.cs_r_quest[0, R, S0]) == 0, "Q3: satisfied clearCamp not cleared"
    assert int(sim.cs_r_envoys[0, R, S0]) == env0 + q_env, "Q3: questEnvoys not paid to the rival"
    assert torch.equal(sim.rng_state, rng0), "Q3: resolution drew RNG"
    print(f"  Q3 RESOLVE clearCamp OK (+{q_env} envoy to R, quest cleared, zero-draw)")

    # -- Q4: RESOLVE buildDistrict → +1 envoy when R owns the CS district ---
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)
    di = int(sim._cs_didx[0, S0])
    # grant R a COMPLETE district of the CS type in its first alive city
    j = int(sim.rc_alive[0, R].long().argmax())
    dtile = int(sim.rc_center[0, R, j])  # any owned tile; mark complete
    sim.rc_dist_tile[0, R, j, di] = dtile
    sim.district_complete[0, dtile] = True
    sim.district_pillaged[0, dtile] = False
    sim.cs_r_quest[0, R, S0] = 3
    sim.cs_r_quest_issued[0, R, S0] = T
    env0 = int(sim.cs_r_envoys[0, R, S0])
    rng0 = sim.rng_state.clone()
    sim._rival_quest_phase(R, active_mask(sim))
    assert int(sim.cs_r_quest[0, R, S0]) == 0, "Q4: satisfied buildDistrict not cleared"
    assert int(sim.cs_r_envoys[0, R, S0]) == env0 + q_env, "Q4: questEnvoys not paid"
    assert torch.equal(sim.rng_state, rng0), "Q4: buildDistrict resolution drew RNG"
    print(f"  Q4 RESOLVE buildDistrict OK (+{q_env} envoy on owned district, zero-draw)")

    # -- Q5: unmet CS never gets a rival quest ------------------------------
    sim.restore(base)
    s1 = 0
    sim.cs_alive[0, s1] = True
    sim.cs_r_met[0, R, s1] = False  # not met
    sim.cs_r_quest[0, R, s1] = 0
    sim.cs_r_quest_issued[0, R, s1] = 0
    sim._rival_quest_phase(R, active_mask(sim))
    assert int(sim.cs_r_quest[0, R, s1]) == 0, "Q5: an unmet CS issued a rival quest"
    print("  Q5 unmet-CS gate OK (no quest without contact)")

    print("CS VERBS (A-12 rival levy + quests) OK")


if __name__ == "__main__":
    main()
