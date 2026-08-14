"""Civ-seat city-state verbs — levy + quests.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/citystate_verbs_test.py

Both mechanics run from the civ phase (the `_seat_phase` levy block +
`_seat_quest_phase`, TS twins `seatPhase`'s levy branch + `issueQuest` /
`questSatisfied`):

  * CIV LEVY — an AT-WAR civ suzerain of a militaristic CS spawns
    levyUnits units of the 2-step ladder at the CS center, paying
    levyGoldCost, on a per-CS cooldown SHARED across seats (citystate_last_levy).
  * CIV QUESTS (zero-draw) — one deterministic quest per (civ, CS):
    the FIRST SATISFIABLE of [clearCamp, buildDistrict, sendTradeRoute],
    NO RNG; completion pays +questEnvoys to that civ's civ_only_citystate_envoys.

The scripted gate exercises both organically but can't isolate the branch
logic — each threshold, the shared cooldown, the deterministic order, and the
ZERO-DRAW guarantee are pinned here on a single-batch CPU sim with the state
forced by hand.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES

R = 0        # the civ under test
OTHER = 1    # the other civ (forced inert)


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def civ_unit_next(sim) -> int:
    return int(sim.civ_unit_next[0])


def active_mask(sim) -> torch.Tensor:
    return sim.civ_only_alive[:, R] & (sim.civ_city_alive[:, R].sum(dim=1) > 0)


def clear_queues(sim) -> None:
    """No queue item can complete this phase (isolates the buy/levy block)."""
    for r in (R, OTHER):
        sim.civ_city_current[:, r] = -1
        sim.civ_city_progress[:, r] = 0.0
        sim.civ_city_cost[:, r] = 0.0


def make_suzerain_mil(sim, s: int, envoys: int = 5) -> None:
    """Force CS slot `s` militaristic + alive, met by R, with R holding the
    strict suzerain envoy majority (seat 0 at 0 envoys, the other civ at 0)."""
    mil = int(sim.rules.citystate["militaristicIdx"])
    sim.citystate_type[0, s] = mil
    sim.citystate_alive[0, s] = True
    sim.civ_only_citystate_met[0, R, s] = True
    sim.civ_only_citystate_envoys[0, R, s] = envoys
    sim.civ_only_citystate_envoys[0, OTHER, s] = 0
    sim.citystate_envoys[0, s] = 0


def empty_land_tiles(sim, k: int) -> list[int]:
    """k passable land tiles with nothing/nobody on them (inject military far
    from any spawn probe so it perturbs nothing but the quota count)."""
    free = (
        sim.passable[0]
        & (sim.civ_military_at[0] < 0) & (sim.civ_civilian_at[0] < 0) & (sim.barb_at[0] < 0)
        & (sim.pmil_at[0] < 0) & (sim.pciv_at[0] < 0) & (sim.civ_city_at[0] < 0)
        & (sim.citystate_at[0] < 0) & (sim.owner[0] < 0) & (sim.civ_at[0] < 0)
    ).nonzero(as_tuple=True)[0].tolist()
    assert len(free) >= k, "not enough empty land tiles to inject"
    return free[:k]


def mil_count(sim, r: int) -> int:
    t = sim.civ_unit_type[0].clamp(min=0, max=sim.NU - 1)
    return int((sim.civ_unit_alive[0] & ((sim.civ_unit_seat[0] - 1) == r) & (sim._type_combat[t] > 0)).sum())


def meet_quota(sim, r: int) -> None:
    """Inject WARRIORs (far away) until r's military hits the 2×-cities quota,
    so the gold-buy unit branch (warrior ×mult = 96 < levy 120) can't fire and
    drain the treasury before the levy runs."""
    quota = 2 * int(sim.civ_city_alive[0, r].sum())
    need = max(0, quota - mil_count(sim, r))
    if need == 0:
        return
    for t in empty_land_tiles(sim, need):
        slot = int(sim.civ_unit_next[0])
        sim.civ_unit_alive[0, slot] = True
        sim.civ_unit_seat[0, slot] = r + 1
        sim.civ_unit_type[0, slot] = sim._warrior_idx
        sim.civ_unit_tile[0, slot] = t
        sim.civ_unit_hp[0, slot] = 100
        sim.civ_unit_charges[0, slot] = 0
        sim.civ_unit_fortify[0, slot] = 0
        sim.military_at[0, t] = slot + sim.POOL_LO["civ"]
        sim.civ_unit_next[0] += 1


def count_levy(sim, vn0: int, s: int, warr: int) -> int:
    """New WARRIOR-type R units in the pool since vn0 — the levy's signature.
    POSITION is deliberately NOT asserted: the levy block precedes R's war-acts
    in the same phase, so levied units can legally WAR-MARCH off the CS ring
    before the poke reads them. Isolation comes from the prep instead — queues
    cleared and the gold-buy unit branch quota-blocked, so every new R unit IS
    a levy spawn."""
    n = 0
    for slot in range(vn0, int(sim.civ_unit_next[0])):
        if int(sim.civ_unit_type[0, slot]) == warr and int((sim.civ_unit_seat[0, slot] - 1)) == R:
            n += 1
    return n


def prep_levy(sim, s: int, envoys: int = 5) -> None:
    """Isolate the levy: R at war + suzerain of a militaristic CS, the OTHER
    civ inert (peace, no gold), queues cleared, R's unit quota met."""
    clear_queues(sim)
    sim.civ_only_atwar[0, R] = True
    sim.civ_only_atwar[0, OTHER] = False
    sim.sync_war()  # a poke must write the legacy stores too
    sim.civ_only_treasury[0, OTHER] = 0.0  # the shared civ_unit_next pool must not grow from OTHER's buys
    make_suzerain_mil(sim, s, envoys)
    meet_quota(sim, R)


def stash_levy(sim, s: int) -> None:
    """The levy is a wire DECISION — stash the kind-7 intent the driver would
    emit for R (the engine arm re-validates militaristic/suzerain/cooldown/
    afford on its own; at-war is the DRIVER's policy gate)."""
    sim.controlled[0, R] = True
    sim._driven_levy = {R: torch.full((sim.B,), s, dtype=torch.long, device=sim.device)}


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"citystate_verbs_test on {path.name}")

    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert int(sim.civ_city_alive[0, R].sum()) >= 1, "civ 0 has no cities after 25 turns"
    assert sim.S >= 1, "fixture has no city-states"
    base = sim.snapshot()

    # The tile rung and the levy are DRIVEN-only: nothing scripted can drain a
    # treasury set to EXACTLY the levy price, and each levy case below stashes
    # its own kind-7 intent.

    cd = int(sim.rules.citystate["levyCooldown"])
    cost = float(sim.rules.citystate["levyGoldCost"])
    n_units = int(sim.rules.citystate["levyUnits"])
    warr = sim._warrior_idx
    T = int(sim.turn)
    S0 = 0  # the CS slot under test

    # ============================ CIV LEVY ============================
    # -- L1: FIRE — at war, suzerain of a militaristic CS, affordable -------
    sim.restore(base)
    prep_levy(sim, S0)
    stash_levy(sim, S0)
    sim.civ_only_treasury[0, R] = cost  # exactly the levy price
    vn0 = civ_unit_next(sim)
    sim._seat_phase()
    assert int(sim.citystate_last_levy[0, S0]) == T, f"L1 levy: citystate_last_levy not stamped ({int(sim.citystate_last_levy[0, S0])} != {T})"
    assert count_levy(sim, vn0, S0, warr) == n_units, f"L1 levy: expected {n_units} WARRIOR at CS center, got {count_levy(sim, vn0, S0, warr)}"
    print(f"  L1 levy FIRES OK ({n_units} WARRIOR at CS center, cooldown stamped)")

    # -- L2: at-war is the DRIVER's policy gate, NOT a rule -----------------
    # TS levyUnits has no war test, so a stashed intent executes at peace on
    # both engines (refusal parity); the driver simply never emits one.
    sim.restore(base)
    prep_levy(sim, S0)
    sim.civ_only_atwar[0, R] = False
    sim.sync_war()  # a poke must write the legacy stores too
    stash_levy(sim, S0)
    sim.civ_only_treasury[0, R] = cost
    sim._seat_phase()
    assert int(sim.citystate_last_levy[0, S0]) == T, "L2: the engine arm refused a stashed levy at peace (at-war is not a rule)"
    print("  L2 at-peace intent OK (the engine executes; at-war gating is the driver's)")

    # -- L3: NOT-SUZERAIN gate (only 2 envoys) ------------------------------
    sim.restore(base)
    prep_levy(sim, S0, envoys=2)  # below suzerainEnvoys
    stash_levy(sim, S0)
    sim.civ_only_treasury[0, R] = cost
    sim._seat_phase()
    assert int(sim.citystate_last_levy[0, S0]) != T, "L3: a non-suzerain civ levied"
    print("  L3 not-suzerain gate OK (2 envoys < suzerain minimum)")

    # -- L4: AFFORDABILITY gate (one milli-unit short) ----------------------
    sim.restore(base)
    prep_levy(sim, S0)
    stash_levy(sim, S0)
    sim.civ_only_treasury[0, R] = cost - 0.001
    sim._seat_phase()
    assert int(sim.citystate_last_levy[0, S0]) != T, "L4: levied below the gold cost"
    print("  L4 affordability gate OK (no levy one milli-unit below cost)")

    # -- L5: COOLDOWN gate + SHARED across seats ----------------------------
    # a recent levy (this-turn − (cd−1)) blocks; exactly cd turns ago is ready.
    sim.restore(base)
    prep_levy(sim, S0)
    stash_levy(sim, S0)
    sim.civ_only_treasury[0, R] = cost
    sim.citystate_last_levy[0, S0] = T - (cd - 1)  # one turn short of ready
    vn0 = civ_unit_next(sim)
    sim._seat_phase()
    assert int(sim.citystate_last_levy[0, S0]) == T - (cd - 1), "L5 cooldown: levied while on cooldown"
    assert count_levy(sim, vn0, S0, warr) == 0, "L5 cooldown: WARRIORs spawned at the CS while on cooldown"
    print(f"  L5 cooldown gate OK (blocked at {cd - 1} turns since levy; shared citystate_last_levy)")

    # ready twin: exactly cd turns ago → levy fires again (shared clock resets)
    sim.restore(base)
    prep_levy(sim, S0)
    stash_levy(sim, S0)
    sim.civ_only_treasury[0, R] = cost
    sim.citystate_last_levy[0, S0] = T - cd
    sim._seat_phase()
    assert int(sim.citystate_last_levy[0, S0]) == T, "L5 ready: no levy exactly at cooldown expiry"
    print(f"  L5 ready twin OK (levy fires at exactly {cd} turns since last)")

    # ============================ CIV QUESTS =========================
    # -- Q1: ISSUE buildDistrict (deterministic, no camp, not owned) --------
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)  # met + alive; district-type env irrelevant here
    sim.civ_only_citystate_quest[0, R, S0] = 0
    sim.civ_only_citystate_quest_issued[0, R, S0] = 0  # cooldown long passed (turn ≥ questCooldown)
    # no barb camp near this CS → clearCamp not offered; buildDistrict first.
    sim.camp_tile[:] = -1
    di = int(sim._citystate_didx[0, S0])
    # ensure R does NOT already own the CS-type district complete (wipe registry row)
    sim.civ_city_dist_tile[0, R, :, di] = -1
    rng0 = sim.rng_state.clone()
    sim._seat_quest_phase(R + 1, active_mask(sim))  # seat ROW: civ R is row R+1
    assert int(sim.civ_only_citystate_quest[0, R, S0]) == 3, f"Q1: expected buildDistrict (3), got {int(sim.civ_only_citystate_quest[0, R, S0])}"
    assert torch.equal(sim.rng_state, rng0), "Q1: the quest phase drew RNG (must be zero-draw)"
    print("  Q1 ISSUE buildDistrict OK (deterministic, zero-draw)")

    # -- Q2: ISSUE clearCamp takes precedence when a camp is in range -------
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)
    sim.civ_only_citystate_quest[0, R, S0] = 0
    sim.civ_only_citystate_quest_issued[0, R, S0] = 0
    # plant a camp adjacent to the CS center (within range 6)
    ctr = int(sim.citystate_center[0, S0])
    near_tile = int(sim.neigh[ctr][0])
    sim.camp_tile[:] = -1
    sim.camp_tile[0, 0] = near_tile
    rng0 = sim.rng_state.clone()
    sim._seat_quest_phase(R + 1, active_mask(sim))  # seat ROW: civ R is row R+1
    assert int(sim.civ_only_citystate_quest[0, R, S0]) == 1, f"Q2: expected clearCamp (1), got {int(sim.civ_only_citystate_quest[0, R, S0])}"
    assert int(sim.civ_only_citystate_quest_camp[0, R, S0]) == near_tile, "Q2: clearCamp recorded the wrong camp tile"
    assert torch.equal(sim.rng_state, rng0), "Q2: clearCamp issue drew RNG"
    print("  Q2 ISSUE clearCamp precedence OK (nearest camp recorded, zero-draw)")

    # -- Q3: RESOLVE clearCamp → +1 envoy, quest cleared --------------------
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)
    ctr = int(sim.citystate_center[0, S0])
    near_tile = int(sim.neigh[ctr][0])
    sim.civ_only_citystate_quest[0, R, S0] = 1
    sim.civ_only_citystate_quest_camp[0, R, S0] = near_tile
    sim.civ_only_citystate_quest_issued[0, R, S0] = T  # fresh — resolution is cooldown-independent
    sim.camp_tile[:] = -1  # the camp is GONE → satisfied
    env0 = int(sim.civ_only_citystate_envoys[0, R, S0])
    q_env = int(sim.rules.citystate["questEnvoys"])
    rng0 = sim.rng_state.clone()
    sim._seat_quest_phase(R + 1, active_mask(sim))  # seat ROW: civ R is row R+1
    assert int(sim.civ_only_citystate_quest[0, R, S0]) == 0, "Q3: satisfied clearCamp not cleared"
    assert int(sim.civ_only_citystate_envoys[0, R, S0]) == env0 + q_env, "Q3: questEnvoys not paid to the civ"
    assert torch.equal(sim.rng_state, rng0), "Q3: resolution drew RNG"
    print(f"  Q3 RESOLVE clearCamp OK (+{q_env} envoy to R, quest cleared, zero-draw)")

    # -- Q4: RESOLVE buildDistrict → +1 envoy when R owns the CS district ---
    sim.restore(base)
    make_suzerain_mil(sim, S0, envoys=3)
    di = int(sim._citystate_didx[0, S0])
    # grant R a COMPLETE district of the CS type in its first alive city
    j = int(sim.civ_city_alive[0, R].long().argmax())
    dtile = int(sim.civ_city_center[0, R, j])  # any owned tile; mark complete
    sim.civ_city_dist_tile[0, R, j, di] = dtile
    sim.district_complete[0, dtile] = True
    sim.district_pillaged[0, dtile] = False
    sim.civ_only_citystate_quest[0, R, S0] = 3
    sim.civ_only_citystate_quest_issued[0, R, S0] = T
    env0 = int(sim.civ_only_citystate_envoys[0, R, S0])
    rng0 = sim.rng_state.clone()
    sim._seat_quest_phase(R + 1, active_mask(sim))  # seat ROW: civ R is row R+1
    assert int(sim.civ_only_citystate_quest[0, R, S0]) == 0, "Q4: satisfied buildDistrict not cleared"
    assert int(sim.civ_only_citystate_envoys[0, R, S0]) == env0 + q_env, "Q4: questEnvoys not paid"
    assert torch.equal(sim.rng_state, rng0), "Q4: buildDistrict resolution drew RNG"
    print(f"  Q4 RESOLVE buildDistrict OK (+{q_env} envoy on owned district, zero-draw)")

    # -- Q5: unmet CS never gets a civ quest ------------------------------
    sim.restore(base)
    s1 = 0
    sim.citystate_alive[0, s1] = True
    sim.civ_only_citystate_met[0, R, s1] = False  # not met
    sim.civ_only_citystate_quest[0, R, s1] = 0
    sim.civ_only_citystate_quest_issued[0, R, s1] = 0
    sim._seat_quest_phase(R + 1, active_mask(sim))  # seat ROW: civ R is row R+1
    assert int(sim.civ_only_citystate_quest[0, R, s1]) == 0, "Q5: an unmet CS issued a civ quest"
    print("  Q5 unmet-CS gate OK (no quest without contact)")

    print("CS VERBS (A-12 civ levy + quests) OK")


if __name__ == "__main__":
    main()
