"""AUDIT A-5r self-test: a SCRIPTED rival's per-turn gold purchase.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/rival_purchase_test.py

A-5r extends the A-5 rival gold-buy block (engine.py `_rival_phase`, its TS
twin `rivalPhase`) from buildings-only to the priority chain BUILDING >
SETTLER > UNIT — ONE purchase per civ per turn. This pokes the branch logic
the 24×250 scripted gate exercises organically but can't isolate: the
priority order, each threshold (settler under the city cap + affordable; the
strongest affordable military unit under the #56 H1 quota of 2× cities), and
the spawn-refund convention (a settler with no site / a unit with no free
spot pays nothing). Buys price at production cost × goldPurchaseMult with no
war-chest reserve (the controlled-head apply_rival_actions purchase spec);
the building branch keeps its peace-cost reserve.

The scenarios drive `_rival_phase()` directly on a single-batch CPU sim with
the rival forced to PEACE and its city queues cleared, so the ONLY structural
moves the phase can make are the three A-5 buys: v_next only advances on a
unit spawn, rc_alive only grows on a settler found, rc_bldg only gains on a
building buy.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES

R = 0  # rival 0


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def n_rc(sim) -> int:
    return int(sim.rc_alive[0, R].sum())


def n_bldg(sim) -> int:
    return int(sim.rc_bldg[0, R].sum())


def v_next(sim) -> int:
    return int(sim.v_next[0])


def mil_count(sim) -> int:
    t = sim.v_type[0].clamp(min=0, max=sim.NU - 1)
    return int((sim.v_alive[0] & (sim.v_civ[0] == R) & (sim._p_combat[t] > 0)).sum())


def cap_center(sim) -> int:
    cap = sim.rc_is_cap[0, R]
    slot = int(cap.long().argmax()) if bool(cap.any()) else int(sim.rc_alive[0, R].long().argmax())
    return int(sim.rc_center[0, R, slot])


def settler_price(sim) -> float:
    rr = sim.rules.rivals
    return (rr["settlerBase"] + rr["settlerPer"] * max(0, n_rc(sim) - 1)) * sim.rules.gold_purchase_mult


def unit_price(sim, idx: int) -> float:
    return float(sim._p_cost[idx]) * sim.rules.gold_purchase_mult


def prep_peace(sim) -> None:
    """Force the rival to PEACE and clear its city queues so no queue item
    can complete this phase — the only moves left are the A-5 buys."""
    sim.rc_current[:, R] = -1
    sim.rc_progress[:, R] = 0.0
    sim.rc_cost[:, R] = 0.0
    sim.r_atwar[:, R] = False


def empty_land_tiles(sim, k: int) -> list[int]:
    """k passable land tiles with nothing and nobody on them (for injecting
    military far from the capital so it perturbs no spawn probe)."""
    free = (
        sim.passable[0]
        & (sim.rv_at[0] < 0)
        & (sim.rvciv_at[0] < 0)
        & (sim.barb_at[0] < 0)
        & (sim.pmil_at[0] < 0)
        & (sim.pciv_at[0] < 0)
        & (sim.rvcity_at[0] < 0)
        & (sim.cs_at[0] < 0)
        & (sim.owner[0] < 0)
        & (sim.rival_at[0] < 0)
    ).nonzero(as_tuple=True)[0].tolist()
    assert len(free) >= k, "not enough empty land tiles to inject"
    return free[:k]


def inject_mil(sim, tiles: list[int], type_idx: int) -> None:
    """Append rival-R military units on the given empty tiles (the
    _spawn_rival field writes, minus the free-spot probe)."""
    for t in tiles:
        slot = int(sim.v_next[0])
        sim.v_alive[0, slot] = True
        sim.v_civ[0, slot] = R
        sim.v_type[0, slot] = type_idx
        sim.v_tile[0, slot] = t
        sim.v_hp[0, slot] = 100
        sim.v_charges[0, slot] = 0
        sim.v_fortify[0, slot] = 0
        sim.rv_at[0, t] = slot
        sim.v_next[0] += 1


def block_spawn(sim) -> None:
    """Occupy the capital center + every neighbor with an (inert-at-peace)
    player-military marker so _spawn_rival finds no free spot."""
    ctr = cap_center(sim)
    tiles = [ctr] + [int(n) for n in sim.neigh[ctr].tolist() if n >= 0]
    for t in tiles:
        sim.pmil_at[0, t] = 0  # ≥0 blocks the probe; the slot value is never read at peace


def research_tech(sim, key: str) -> int:
    return int(sim.rules.rivals["research"].get(key, -1))


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    path = paths[0]
    print(f"rival_purchase_test on {path.name}")

    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    assert n_rc(sim) >= 1, "rival 0 has no cities after 25 turns"
    base = sim.snapshot()

    warr = sim._warrior_idx
    sp_t, ho_t, ar_t = research_tech(sim, "spearTech"), research_tech(sim, "horseTech"), research_tech(sim, "archerTech")
    reserve = float(sim.rules.rivals.get("peaceGold0", 150))

    # -- 1: priority BUILDING > settler/unit + one-per-turn ----------------
    # remove MONUMENT (ungated CITY_CENTER building) from every rival city so
    # it is completable; rich treasury covers building, settler AND unit —
    # priority must pick the building alone.
    sim.restore(base)
    prep_peace(sim)
    bids = [b["id"] for b in json.loads((FIXTURES / "rules.json").read_text())["buildings"]]
    mon = bids.index("MONUMENT")
    assert int(sim.rules_dev.b_unlock[mon]) == -1 and int(sim.rules_dev.b_unlock_civic[mon]) == -1, "MONUMENT unexpectedly gated"
    sim.rc_bldg[0, R, :, mon] = False
    sim.r_treasury[0, R] = 10_000.0
    b0, c0, vn0 = n_bldg(sim), n_rc(sim), v_next(sim)
    sim._rival_phase()
    assert n_bldg(sim) == b0 + 1, f"building priority: expected +1 building, got {n_bldg(sim) - b0}"
    assert n_rc(sim) == c0, "building priority: a settler was founded too (not one-per-turn)"
    assert v_next(sim) == vn0, "building priority: a unit was bought too (not one-per-turn)"
    assert bool(sim.rc_bldg[0, R, :, mon].any()), "the bought building was not MONUMENT"
    print("  1 priority building > settler/unit OK (one purchase, MONUMENT)")

    # -- 2: SETTLER threshold + priority settler > unit --------------------
    # no building completable (all owned); room under the cap; treasury EXACTLY
    # the settler price. The settler must found and the unit must NOT fire.
    sim.restore(base)
    prep_peace(sim)
    sim.rc_bldg[0, R] = True
    assert n_rc(sim) < sim.rules.rivals["maxCities"], "rival already at city cap — pick an earlier turn"
    price_s = settler_price(sim)
    sim.r_treasury[0, R] = price_s
    c0, vn0 = n_rc(sim), v_next(sim)
    sim._rival_phase()
    assert n_rc(sim) == c0 + 1, "settler at price: no city founded"
    assert v_next(sim) == vn0, "settler priority: a unit was bought too (not one-per-turn)"
    print(f"  2 settler buy OK at {price_s:.0f} gold (founds, blocks the unit branch)")

    # just below the price: settler unaffordable → no found (threshold)
    sim.restore(base)
    prep_peace(sim)
    sim.rc_bldg[0, R] = True
    sim.r_treasury[0, R] = settler_price(sim) - 1.0
    c0 = n_rc(sim)
    sim._rival_phase()
    assert n_rc(sim) == c0, "settler threshold: founded below the price"
    print("  2 settler threshold OK (no found one milli-unit below price)")

    # -- 3: strongest AFFORDABLE military unit (ranking + affordability) ----
    # all techs unlocked, no building, settler unaffordable (treasury < its
    # price), military below quota. The bought type tracks the treasury.
    cases = []
    if sim._r_horseman >= 0 and ho_t >= 0:
        cases.append((unit_price(sim, sim._r_horseman), sim._r_horseman, "HORSEMAN"))
    if sim._r_spearman >= 0 and sp_t >= 0:
        cases.append((unit_price(sim, sim._r_spearman), sim._r_spearman, "SPEARMAN"))
    cases.append((unit_price(sim, warr), warr, "WARRIOR"))
    for tre, want_idx, label in cases:
        sim.restore(base)
        prep_peace(sim)
        sim.rc_bldg[0, R] = True
        if sp_t >= 0:
            sim.r_techs[0, R, sp_t] = True
        if ar_t >= 0:
            sim.r_techs[0, R, ar_t] = True
        if ho_t >= 0:
            sim.r_techs[0, R, ho_t] = True
        # AUDIT B-9: resource-gated picks need strategic ACCESS — plant the
        # required resource + matching completed improvement on an owned tile
        # (restore() wipes it each iteration, so grant per-case).
        pairs = dict(sim._res_unit_pairs)
        if want_idx in pairs:
            res_idx = pairs[want_idx]
            src = (sim.res_id[0] == res_idx).nonzero(as_tuple=True)[0]
            own = (sim.rival_at[0] == R).nonzero(as_tuple=True)[0]
            assert len(own) > 0, f"{label}: no territory tile to grant access"
            if len(src) > 0:
                imp_idx = int(sim.res_imp[0, src[0]])
            else:
                # #55 S4: this fixture's map may carry NO tile of the resource
                # at all (the rid/rq planes are exporter-baked per map) — read
                # the resource's required improvement off any sibling fixture.
                imp_idx = -1
                for pp in sorted(FIXTURES.glob("seed*.json")):
                    for tt in json.loads(pp.read_text())["tiles"]:
                        if int(tt.get("rid", -1)) == res_idx and int(tt.get("rq", -1)) >= 0:
                            imp_idx = int(tt["rq"])
                            break
                    if imp_idx >= 0:
                        break
                assert imp_idx >= 0, f"{label}: resource {res_idx} absent from every fixture"
            t = own[0]
            sim.res_id[0, t] = res_idx
            sim.res_imp[0, t] = imp_idx
            sim.improvement[0, t] = imp_idx
            sim.pillaged[0, t] = False
        assert tre < settler_price(sim), f"{label} price {tre} not below the settler price — scenario invalid"
        assert mil_count(sim) < 2 * n_rc(sim), "military already at quota — pick an earlier turn"
        sim.r_treasury[0, R] = tre
        vn0 = v_next(sim)
        sim._rival_phase()
        assert v_next(sim) == vn0 + 1, f"{label}: no unit spawned at {tre:.0f} gold"
        got = int(sim.v_type[0, vn0])
        assert got == want_idx, f"{label}: strongest-affordable picked type {got}, want {want_idx}"
        print(f"  3 strongest-affordable OK: {tre:.0f} gold -> {label}")

    # -- 4: the #56 H1 quota gate (2× cities) ------------------------------
    # inject military up to the quota; the unit branch must NOT fire even
    # though gold, room and a clear spawn tile are all present.
    sim.restore(base)
    prep_peace(sim)
    sim.rc_bldg[0, R] = True
    quota = 2 * n_rc(sim)
    need = quota - mil_count(sim)
    assert need >= 0
    if need > 0:
        inject_mil(sim, empty_land_tiles(sim, need), warr)
    assert mil_count(sim) >= quota
    sim.r_treasury[0, R] = unit_price(sim, warr)  # affordable, but the quota is met
    vn0, c0 = v_next(sim), n_rc(sim)
    sim._rival_phase()
    assert v_next(sim) == vn0, "quota gate: bought a unit at/above 2× cities"
    assert c0 == n_rc(sim), "quota scenario unexpectedly founded a city"
    print(f"  4 quota gate OK (no buy at military == {quota} = 2× {n_rc(sim)} cities)")

    # -- 5: refund on no spawn spot ----------------------------------------
    # the unit branch fires but every spot around the capital is blocked; the
    # spawn refunds — no unit, no gold spent (vs the free-spot twin).
    sim.restore(base)
    prep_peace(sim)
    # #71 FLAG 4 (RIVAL_TILE_BUY_LIVE): the tile-purchase rung sits at the TAIL
    # of the gold ladder and fires only when NOTHING else was bought. A REFUNDED
    # unit purchase leaves `bought` false, so the refund arm would also buy a
    # tile and the two arms would no longer differ by exactly the unit price.
    # This assertion is about the UNIT ladder, so the tile rung is held off for
    # it (both arms alike); flag 4 has its own coverage in the parity gate.
    _tbl = sim._tile_buy_live
    sim._tile_buy_live = False
    sim.rc_bldg[0, R] = True
    sim.r_treasury[0, R] = unit_price(sim, warr)
    vn0 = v_next(sim)
    sim._rival_phase()  # free-spot twin: warrior spawns
    assert v_next(sim) == vn0 + 1, "refund control: warrior did not spawn with a free spot"
    treasury_spawn = float(sim.r_treasury[0, R])

    sim.restore(base)
    prep_peace(sim)
    sim.rc_bldg[0, R] = True
    sim.r_treasury[0, R] = unit_price(sim, warr)
    block_spawn(sim)
    vn0 = v_next(sim)
    sim._rival_phase()  # blocked twin: no spot -> refund
    assert v_next(sim) == vn0, "refund: a unit spawned despite every spot blocked"
    treasury_refund = float(sim.r_treasury[0, R])
    # WARRIOR upkeep is 0, so the refund keeps exactly its gold price
    assert abs((treasury_refund - treasury_spawn) - unit_price(sim, warr)) < 1e-6, (
        f"refund kept {treasury_refund - treasury_spawn} gold, want {unit_price(sim, warr)}"
    )

    sim._tile_buy_live = _tbl
    print(f"  5 refund-on-no-spot OK (kept {unit_price(sim, warr):.0f} gold, no spawn)")

    print("RIVAL PURCHASE (A-5r) OK")


if __name__ == "__main__":
    main()
