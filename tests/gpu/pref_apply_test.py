"""Preference-order apply self-test.

`apply_seat_actions(production=...)` takes ONE code per city, so a pick that is
legal when the mask is taken and unplaceable by the time it applies leaves the
city IDLE — no crash, no parity red, and for RL the mask says legal, the net
picks it, the net gets nothing, and it learns to avoid a mechanic for a reason
absent from the game.

`production_pref` [B, RC, W] fixes that WITHOUT putting the ladder's priority
chain back inside the engine: the policy supplies a ranking, apply walks it
best-first and takes the first column that actually lands. The engine never
chooses — it only discovers which of the policy's own preferences the live state
accepts. A district column carries its TILE the same way, in
`production_tile`, and is refused when that tile stopped being eligible.

Nothing else in the battery passes `production_pref`, so these pokes are its
only coverage.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES

ACTIVE = torch.ones(1, dtype=torch.bool)  # the eliminated-actor gate: these seats hold cities


def fresh(rules, path, turns=25):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for _ in range(turns):
        sim.step()
    return sim


def main() -> None:
    rules = load_rules()
    path = sorted(FIXTURES.glob("seed*.json"))[0]
    sim = fresh(rules, path)
    r, j = 0, 0
    assert bool(sim.city_alive[0, r + 1, j]), "civ 0 capital must exist by t25"
    sim.seat_ext[0, r + 1] = True

    NB = sim.rules_dev.b_cost.shape[0]
    W = int(sim.seat_masks(r + 1)["production"].shape[2])
    D0 = NB + 2 + sim.NU          # first scaffold-district column
    NEG = float("-inf")

    def idle_city():
        sim.city_current[0, r + 1, j] = -1
        sim.city_progress[0, r + 1, j] = 0.0
        sim.city_cost[0, r + 1, j] = 0.0

    def pref(ranked):
        """ranked = columns best-first; everything else is -inf (ruled out)."""
        p = torch.full((1, sim.RC, W), NEG, dtype=torch.float64)
        for rank, col in enumerate(ranked):
            p[0, j, col] = float(len(ranked) - rank)
        return p

    # -- 1: the top choice LANDS -> it is taken, later ranks are ignored ----
    idle_city()
    m = sim.seat_masks(r + 1)["production"][0, j]
    legal_b = [c for c in range(NB) if bool(m[c])]
    assert legal_b, "no legal building in the capital at t25 — pick another turn"
    b0 = legal_b[0]
    b1 = legal_b[1] if len(legal_b) > 1 else b0
    sim.apply_seat_actions(r + 1, production_pref=pref([b0, b1]))
    sim._seat_record_apply(r + 1, ACTIVE)
    got = int(sim.city_current[0, r + 1, j])
    assert got == b0, f"top-ranked legal column must win, got {got}"
    print("  1 top-ranked legal column wins OK")

    # -- 2: the top choice cannot land, so the NEXT rank does --------------
    # An unplaceable district: strip every eligible tile by marking this city's
    # workable land as already districted, which is what the placement scan
    # rejects on. The district column stays legal in the mask we hand over.
    sim2 = fresh(rules, path)
    sim2.seat_ext[0, r + 1] = True
    sim2.city_current[0, r + 1, j] = -1
    sim2.city_progress[0, r + 1, j] = 0.0
    sim2.city_cost[0, r + 1, j] = 0.0
    ctr = int(sim2.city_center[0, r + 1, j])
    own = ((sim2.tile_city[0] == sim2.city_id[0, r + 1, j]) & (sim2.district[0] < 0)).nonzero(as_tuple=True)[0]
    for t in own.tolist():
        if t != ctr:
            sim2.district[0, t] = 0        # occupied -> no tile can take a new one
    sim2._eff_version += 1
    m2 = sim2.seat_masks(r + 1)["production"][0, j]
    legal_b2 = [c for c in range(NB) if bool(m2[c])]
    assert legal_b2, "no legal building for the fallback rank"
    d_col = D0                              # rank it FIRST even though it cannot land
    # Name a tile that WAS eligible and no longer is, so the fallthrough is
    # proven to come from the LEGALITY re-check and not from a missing tile.
    dt2 = torch.full((1, sim2.RC, len(sim2._scaffold)), -1, dtype=torch.long)
    dt2[0, j, 0] = next(t for t in own.tolist() if t != ctr)
    sim2.apply_seat_actions(r + 1, production_pref=pref([d_col, legal_b2[0]]), production_tile=dt2)
    sim2._seat_record_apply(r + 1, ACTIVE)
    got2 = int(sim2.city_current[0, r + 1, j])
    assert got2 != -1, "#87 REGRESSION: an unplaceable top pick left the city IDLE"
    assert got2 == legal_b2[0], f"fallback must be the policy's OWN next rank, got {got2}"
    print("  2 unplaceable top pick falls to the policy's next rank (not idle) OK")

    # -- 3: ranks run dry -> the city stays idle, nothing is invented -------
    sim3 = fresh(rules, path)
    sim3.seat_ext[0, r + 1] = True
    sim3.city_current[0, r + 1, j] = -1
    sim3.city_progress[0, r + 1, j] = 0.0
    sim3.city_cost[0, r + 1, j] = 0.0
    p_none = torch.full((1, sim3.RC, W), NEG, dtype=torch.float64)
    sim3.apply_seat_actions(r + 1, production_pref=p_none)
    sim3._seat_record_apply(r + 1, ACTIVE)
    assert int(sim3.city_current[0, r + 1, j]) == -1, "an all -inf ranking must queue NOTHING"
    print("  3 exhausted ranking queues nothing (the engine never invents a pick) OK")

    # --- 4: WONDER + PROJECT codes at the driven apply ----------------------
    # The driven gate does not reach these columns, so the dispatch is pinned
    # HERE: the code lands via the scripted pick's own helper bodies, and
    # one-per-world refuses CROSS-SEAT at apply time.
    sim5 = fresh(rules, path)
    r5, j5 = 0, 0
    sim5.seat_ext[0, r5 + 1] = True
    NB5 = sim5.rules_dev.b_cost.shape[0]
    nS5 = len(sim5._scaffold)
    w_lo5 = NB5 + 2 + sim5.NU + nS5  # prodLayout.wonderLo
    # force a legal (wi, tile) pair deterministically: find a wonder whose wok
    # bit is set on some r0-owned base_ok tile, then grant its unlock tech.
    base5 = sim5._wonder_base_ok(r5 + 1, j5)[0]  # absolute row: civ r is row r+1
    wi5 = None
    for _wi in range(sim5._wond_n):
        _wrow = sim5._wond_rows[_wi]
        if int(_wrow.get("ut", -1)) < 0 or int(_wrow.get("uc", -1)) >= 0:
            continue  # want a tech-gated, civic-free row we can grant
        if int(_wrow.get("adjD", -1)) != -1 or int(_wrow.get("adjR", -1)) >= 0:
            continue  # no adjacency arm to satisfy
        if bool((base5 & ((sim5.wok[0] >> _wi) & 1).bool()).any()):
            wi5 = _wi
            sim5.civ_techs[0, r5 + 1, int(_wrow["ut"])] = True
            break
    assert wi5 is not None, "#88: fixture has no forceable wonder candidate near r0c0"
    sim5.city_current[0, r5 + 1, j5] = -1  # these columns are idle-gated like every base column
    m5 = sim5.seat_masks(r5 + 1)["production"]
    assert bool(m5[0, j5, w_lo5 + wi5]), "#88: the granted wonder column must read legal"
    prod5 = torch.full((1, sim5.RC), -1, dtype=torch.long)
    prod5[0, j5] = w_lo5 + wi5
    sim5.apply_seat_actions(r5 + 1, production=prod5)
    sim5._seat_record_apply(r5 + 1, ACTIVE)
    code_w5 = sim5.WONDER_BASE + wi5
    assert int(sim5.city_current[0, r5 + 1, j5]) == code_w5, "wonder code must queue via the shared helper"
    assert int(sim5.city_wonder[0, r5 + 1, j5, wi5]) >= 0, "the pave must register the tile"
    assert bool((sim5.built_wonder[0] == wi5).any()), "built_wonder plane must carry the in-flight pave"
    # cross-seat one-per-world: a fresh sim where ANOTHER civ already paved it
    sim6 = fresh(rules, path)
    sim6.seat_ext[0, r5 + 1] = True
    sim6.civ_techs[0, r5 + 1, int(sim6._wond_rows[wi5]["ut"])] = True  # same grant — the CLAIM must be the only blocker
    sim6.city_current[0, r5 + 1, j5] = -1
    free6 = int((sim6.built_wonder[0] < 0).nonzero(as_tuple=True)[0][0])
    sim6.built_wonder[0, free6] = wi5  # any tile, any owner — wonderExists is global
    m6 = sim6.seat_masks(r5 + 1)["production"]
    assert not bool(m6[0, j5, w_lo5 + wi5]), "mask must read the claim"
    sim6.apply_seat_actions(r5 + 1, production=prod5)
    sim6._seat_record_apply(r5 + 1, ACTIVE)
    assert int(sim6.city_current[0, r5 + 1, j5]) != code_w5, "apply must REFUSE the claimed wonder (cross-seat)"
    # PROJECT: plant a completed district matching base project 0, then apply
    sim7 = fresh(rules, path)
    sim7.seat_ext[0, r5 + 1] = True
    prow7 = sim7._proj_rows[0]
    d_i7 = int(prow7["d"])
    ctr7 = int(sim7.city_center[0, r5 + 1, j5])
    dt7 = next(int(t) for t in range(sim7.T) if (int(sim7.tile_seat[0, t]) - 1) == r5 and int(sim7.district[0, t]) < 0 and t != ctr7 and int(sim7.built_wonder[0, t]) < 0)
    sim7.district[0, dt7] = d_i7
    sim7.district_complete[0, dt7] = True
    sim7.city_dist_tile[0, r5 + 1, j5, d_i7] = dt7
    sim7.city_current[0, r5 + 1, j5] = -1
    m7 = sim7.seat_masks(r5 + 1)["production"]
    p_lo7 = w_lo5 + sim7._wond_n
    assert bool(m7[0, j5, p_lo7]), "#88: base project 0 must be legal on its completed district"
    prod7 = torch.full((1, sim7.RC), -1, dtype=torch.long)
    prod7[0, j5] = p_lo7
    sim7.apply_seat_actions(r5 + 1, production=prod7)
    sim7._seat_record_apply(r5 + 1, ACTIVE)
    assert int(sim7.city_current[0, r5 + 1, j5]) == sim7.PROJECT_BASE + 0, "project code must queue"
    assert float(sim7.city_cost[0, r5 + 1, j5]) > 0, "project cost must lock"
    print("  4 #88 wonder queues via shared scan, one-per-world refuses cross-seat, project queues OK")

    # -- 5: ONE production mask — seat 0 reads the same body, same width ----
    # `production_mask()` IS `_seat_production_mask(0)`, so the seat-0 head and
    # a civ head are the same layout: a net trained on one drives the other, and
    # env.masks needs no padding between them.
    assert sim7.production_mask().shape[2] == W, (
        f"seat 0's production head is {sim7.production_mask().shape[2]} wide, civ heads are {W}"
    )
    assert torch.equal(sim7.production_mask(), sim7._seat_production_mask(0)), (
        "production_mask() must BE the row-generic body, not a second copy"
    )
    print("  5 one production mask: seat 0 and civ rows share the body and the width")

    print("PREF APPLY OK")


if __name__ == "__main__":
    main()
