"""The six `suz`-coded suzerain RULES fire on the GPU exactly as sourced.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/suzerain_rules_test.py

Each rule is poked directly at its body with hand-set suzerainty (envoys +
`citystate_suz_code`), asserting the same sourced numbers the TS vitest pins:
Kabul x2 attack XP, Preslav +5 cavalry-on-hills CS, Mexico City +3 regional
reach, Anshan works science, Kumasi per-specialty route yields, Jerusalem
Holy-Site pressure sources.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(3):
        sim.step()
    return sim


def hold(sim, row: int, code: int, s: int = 0) -> None:
    """Make `row` the strict suzerain of CS `s`, carrying rule `code`."""
    sim.seat_citystate_envoys[0, :, s] = 0
    sim.seat_citystate_envoys[0, row, s] = 3
    sim.citystate_suz_code[0, s] = code
    sim._eff_version += 1


def drop(sim, s: int = 0) -> None:
    sim.seat_citystate_envoys[0, :, s] = 0
    sim._eff_version += 1


def main() -> None:
    sim = build()
    assert sim.S > 0, "fixture has no city-states"
    assert min(sim._suz_c_xp, sim._suz_c_hill, sim._suz_c_reach,
               sim._suz_c_works, sim._suz_c_route, sim._suz_c_holy) >= 0, "a suz code is missing from the rules"

    # ---- the suzerain-holding predicate, incl. the strict contest ----------
    hold(sim, 0, sim._suz_c_xp)
    assert bool(sim._suz_effect(0, sim._suz_c_xp)[0])
    assert not bool(sim._suz_effect(0, sim._suz_c_hill)[0])
    assert not bool(sim._suz_effect(1, sim._suz_c_xp)[0])
    sim.seat_citystate_envoys[0, 1, 0] = 3  # a tie leaves no suzerain
    sim._eff_version += 1
    assert not bool(sim._suz_effect(0, sim._suz_c_xp)[0])
    print("suz predicate ok")

    # ---- Kabul: x2 XP for the battle initiator -----------------------------
    hold(sim, 0, sim._suz_c_xp)
    mults = [int(sim._suz_xp_mult(torch.tensor([s]))[0]) for s in (0, 1, 200)]
    assert mults == [sim._suz_xp_mult_k, 1, 1], mults
    print("kabul ok")

    # ---- Preslav: +5 CS for cavalry fighting on hills ----------------------
    hold(sim, 0, sim._suz_c_hill)
    cav_idx = int(sim._type_cavalry.long().argmax())
    assert bool(sim._type_cavalry[cav_idx])
    foot_idx = int((~sim._type_cavalry).long().argmax())
    hill_t = int(sim.hills[0].long().argmax())
    assert bool(sim.hills[0, hill_t])
    flat_t = int((~sim.hills[0]).long().argmax())
    one = lambda ty, ti: int(sim._cav_hill_cs(torch.tensor([0]), torch.tensor([ty]), torch.tensor([ti]))[0])
    assert one(cav_idx, hill_t) == sim._suz_hill_cs
    assert one(cav_idx, flat_t) == 0
    assert one(foot_idx, hill_t) == 0
    assert int(sim._cav_hill_cs(torch.tensor([1]), torch.tensor([cav_idx]), torch.tensor([hill_t]))[0]) == 0
    drop(sim)
    assert one(cav_idx, hill_t) == 0
    print("preslav ok")

    # ---- Anshan: science per Great Work of Writing / Relic / Artifact ------
    col = int(sim.city_alive[0, 0].long().argmax())
    assert bool(sim.city_alive[0, 0, col])
    sim.city_gw_writing[0, 0, col] = 2
    sim.city_relics[0, 0, col] = 1
    sim.city_artifacts[0, 0, col] = 3
    sim._eff_version += 1
    # SAME suzerainty both reads (the flat channel and the envoy thresholds
    # move the walk too) — only the CODE differs.
    hold(sim, 0, sim._suz_c_works)
    with_s = float(sim._seat_city_yields_all(0)[2].sum())
    hold(sim, 0, sim._suz_c_xp)  # a yield-inert code
    without = float(sim._seat_city_yields_all(0)[2].sum())
    # the walk scales non-food output by the city's amenity tier, so the
    # sourced 8 arrives multiplied by that city's own factor
    yf = float(sim._seat_amenity(0)[2][0, col])
    want = (sim._suz_writing_sci * 2 + sim._suz_relic_sci * (1 + 3)) * yf
    got = with_s - without
    assert abs(got - want) < 1e-9, (got, want)
    sim.city_gw_writing[0, 0, col] = 0
    sim.city_relics[0, 0, col] = 0
    sim.city_artifacts[0, 0, col] = 0
    sim._eff_version += 1
    print("anshan ok")

    # ---- Kumasi: route culture+gold per ORIGIN specialty district ----------
    spec_d = int(sim._is_specialty.long().argmax())
    assert bool(sim._is_specialty[spec_d])
    free_t = next(t for t in range(sim.T)
                  if int(sim.tile_seat[0, t]) == 0 and t != int(sim.city_center[0, 0, col]))
    sim.city_dist_tile[0, 0, col, spec_d] = free_t
    sim.district_complete[0, free_t] = True
    sim.seat_routes[0, 0, 0, 0] = sim.city_id[0, 0, col]
    sim.seat_routes[0, 0, 0, 1] = -2  # CS 0, the -(2+idx) encoding
    sim._eff_version += 1
    hold(sim, 0, sim._suz_c_route)
    inc = sim._seat_route_income(0)
    assert inc is not None
    cul_s, gold_s = float(inc[0, col, 4]), float(inc[0, col, 2])
    drop(sim)
    inc0 = sim._seat_route_income(0)
    assert inc0 is not None
    cul_0, gold_0 = float(inc0[0, col, 4]), float(inc0[0, col, 2])
    assert abs((cul_s - cul_0) - sim._suz_route_cul * 1) < 1e-9, (cul_s, cul_0)
    assert abs((gold_s - gold_0) - sim._suz_route_gold * 1) < 1e-9, (gold_s, gold_0)
    sim.seat_routes[0, 0, 0, :] = -1
    sim._eff_version += 1
    print("kumasi ok")

    # ---- Jerusalem: completed-Holy-Site cities exert like the Holy City ----
    hs_d = sim._hs_idx
    assert hs_d >= 0
    tgt_row = 1
    tcol = int(sim.city_alive[0, tgt_row].long().argmax())
    assert bool(sim.city_alive[0, tgt_row, tcol])
    tgt_c = int(sim.city_center[0, tgt_row, tcol])
    rng = int(sim._pressure_range)
    # the Holy City sits OUT of range of the target; a synthetic second city
    # of row 0 sits WITHIN range and carries the completed Holy Site.
    far_t = next(t for t in range(sim.T) if int(sim.pair_dist[t, tgt_c]) > rng)
    sim.holy_tile[0, 0] = far_t
    src_c = next(t for t in range(sim.T)
                 if 0 < int(sim.pair_dist[t, tgt_c]) <= rng and t != far_t
                 and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0)
    hs_t = next(t for t in range(sim.T) if t not in (src_c, far_t, free_t, tgt_c))
    jcol = next(c for c in range(sim.RC) if not bool(sim.city_alive[0, 0, c]))
    sim.city_alive[0, 0, jcol] = True
    sim.city_center[0, 0, jcol] = src_c
    sim.city_dist_tile[0, 0, jcol, hs_d] = hs_t
    sim.district_complete[0, hs_t] = True
    sim._eff_version += 1
    hold(sim, 0, sim._suz_c_holy)
    before = int(sim.city_pressure[0, tgt_row, tcol, 0])
    sim._spread_religious_pressure()
    with_s = int(sim.city_pressure[0, tgt_row, tcol, 0]) - before
    assert with_s == 1, with_s  # ONE source: the HS city (the Holy City is out of range)
    # pillage darkens the site
    sim.district_pillaged[0, hs_t] = True
    sim._eff_version += 1
    before = int(sim.city_pressure[0, tgt_row, tcol, 0])
    sim._spread_religious_pressure()
    assert int(sim.city_pressure[0, tgt_row, tcol, 0]) == before
    sim.district_pillaged[0, hs_t] = False
    drop(sim)
    before = int(sim.city_pressure[0, tgt_row, tcol, 0])
    sim._spread_religious_pressure()
    assert int(sim.city_pressure[0, tgt_row, tcol, 0]) == before  # no suzerain -> no source
    print("jerusalem ok")

    # ---- Mexico City: districts reach 3 farther ----------------------------
    assert sim._reg_bidx, "no regional building in the catalog"
    n = sim._reg_bidx[0]
    d_req = int(sim._b_req_district[n])
    sim.city_bldg[0, 0, col, n] = True
    sim.city_dist_tile[0, 0, col, d_req] = free_t
    base = sim._regional_range
    recv = next((t for t in range(sim.T)
                 if base < int(sim.pair_dist[free_t, t]) <= base + sim._suz_reach_bonus
                 and bool(sim.passable[0, t])), -1)
    assert recv >= 0, "no tile in the stretched ring"
    col2 = next(c for c in range(sim.RC) if c != col and not bool(sim.city_alive[0, 0, c]))
    sim.city_alive[0, 0, col2] = True
    sim.city_center[0, 0, col2] = recv
    sim._eff_version += 1
    hold(sim, 0, sim._suz_c_reach)
    reg = sim._seat_regional(0)
    assert reg is not None
    with_s = float(reg[0][0, col2].abs().sum()) + float(reg[1][0, col2])
    drop(sim)
    reg0 = sim._seat_regional(0)
    without = 0.0 if reg0 is None else float(reg0[0][0, col2].abs().sum()) + float(reg0[1][0, col2])
    assert with_s > 0 and without == 0, (with_s, without)
    print("mexico city ok")

    print("SUZERAIN RULES OK — all six coded perks fire, and only for the strict suzerain")


if __name__ == "__main__":
    main()
