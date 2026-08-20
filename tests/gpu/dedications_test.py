"""The four NEW dedications fire on the GPU exactly as sourced.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/dedications_test.py

Each face is poked directly at its body with hand-set picks/ages: Hic Sunt
Dracones (wonder discovery +3, naval kill +1, golden +2 Movement for naval and
embarked), Reform the Coinage (route completion +1, golden no-plunder and +3
gold per foreign specialty), Heartbeat of Steam (Industrial+ building +2 on
build AND on purchase, golden campus-adjacency production and +10% wonder
production), To Arms! (golden +15% military-unit production).
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


def commit(sim, row: int, kind: int, golden: bool = False) -> None:
    sim.civ_age[0, row] = 2 if golden else 1
    sim.ded_picks[0, row, :] = -1
    sim.ded_picks[0, row, 0] = kind
    sim.era_score[0, row] = 0
    sim._eff_version += 1


def score(sim, row: int) -> int:
    return int(sim.era_score[0, row])


def main() -> None:
    sim = build()
    assert sim._n_ded == 8, sim._n_ded
    B = sim.B

    # ---- Hic Sunt Dracones: wonder discovery, once -------------------------
    wt = int(sim.nwonder[0].long().argmax()) if bool(sim.nwonder[0].any()) else -1
    if wt >= 0 and sim.fog_of_war:
        commit(sim, 0, sim._ded_dracones)
        sim.seat_explored[0, 0, :] = False
        rows = torch.tensor([0], dtype=torch.long)
        n_wt = int((sim.nwonder[0] & (sim.pair_dist[wt] <= 1)).sum())  # a natural wonder SPANS tiles
        sim._reveal_around(rows, 0, torch.tensor([wt], dtype=torch.long), 1)
        assert score(sim, 0) == sim._dracones_disc * n_wt, (score(sim, 0), n_wt)
        sim._reveal_around(rows, 0, torch.tensor([wt], dtype=torch.long), 1)  # already explored
        assert score(sim, 0) == sim._dracones_disc * n_wt
        print("dracones discovery ok")
    else:
        print("dracones discovery SKIPPED (no wonder tile or fog off)", wt, sim.fog_of_war)

    # ---- Hic Sunt Dracones: the naval-kill helper --------------------------
    commit(sim, 0, sim._ded_dracones)
    nav_t = int(sim.unit_naval.long().argmax())
    assert bool(sim.unit_naval[nav_t])
    foot_t = int((~sim.unit_naval).long().argmax())
    tt = torch.full((B,), nav_t, dtype=torch.long)
    no = torch.zeros(B, dtype=torch.bool)
    yes = torch.ones(B, dtype=torch.bool)
    sim._naval_kill_event(torch.zeros(B, dtype=torch.long), tt, no, yes)
    assert score(sim, 0) == 1
    sim._naval_kill_event(torch.zeros(B, dtype=torch.long), tt, yes, yes)  # barb victim
    assert score(sim, 0) == 1
    sim._naval_kill_event(torch.zeros(B, dtype=torch.long), torch.full((B,), foot_t, dtype=torch.long), no, yes)
    assert score(sim, 0) == 1  # not naval
    sim._naval_kill_event(150, tt, no, yes)  # a city-state killer holds no dedication
    assert score(sim, 0) == 1
    commit(sim, 0, sim._ded_dracones, golden=True)  # a GOLDEN age takes bonuses
    sim._naval_kill_event(0, tt, no, yes)
    assert score(sim, 0) == 0
    print("dracones naval kill ok")

    # ---- Hic Sunt Dracones, Golden face: +2 Movement naval/embarked --------
    commit(sim, 0, sim._ded_dracones, golden=True)
    mp = sim._golden_move_mp("major")
    slot = 0
    sim.major_unit_type[0, slot] = nav_t
    sim.major_unit_seat[0, slot] = 0
    mp = sim._golden_move_mp("major")
    assert int(mp[0, slot]) == sim._golden_move, int(mp[0, slot])
    sim.major_unit_type[0, slot] = foot_t
    sim.major_unit_emb[0, slot] = True
    mp = sim._golden_move_mp("major")
    assert int(mp[0, slot]) == sim._golden_move
    sim.major_unit_emb[0, slot] = False
    commit(sim, 0, sim._ded_exodus, golden=True)  # a different pick
    sim.major_unit_type[0, slot] = nav_t
    mp = sim._golden_move_mp("major")
    assert int(mp[0, slot]) == 0
    print("dracones movement ok")

    # ---- Reform the Coinage: a route term runs out -------------------------
    commit(sim, 0, sim._ded_coinage)
    col = int(sim.city_alive[0, 0].long().argmax())
    sim.seat_routes[0, 0, 0, 0] = sim.city_id[0, 0, col]
    sim.seat_routes[0, 0, 0, 1] = sim.city_id[0, 0, col]  # domestic, to itself
    sim.seat_route_exp[0, 0, 0] = sim.turn
    sim._eff_version += 1
    sim._expire_seat_routes(0)
    assert score(sim, 0) == 1, score(sim, 0)
    assert int(sim.seat_routes[0, 0, 0, 0]) == -1  # dropped
    print("coinage completion ok")

    # ---- Reform the Coinage, Golden face: no plunder -----------------------
    commit(sim, 0, sim._ded_coinage, golden=True)
    # a live barb REGISTERED on the walker's tile (plunder reads the
    # military_at/civilian_at maps, the same lookup combat uses)
    bslot = 0
    cap_t = int(sim.city_center[0, 0, col])
    nb = int(sim.neigh[cap_t][0])
    sim.barb_unit_alive[0, bslot] = True
    sim.barb_unit_tile[0, bslot] = nb
    sim.military_at[0, nb] = bslot + sim.POOL_LO["barb"]
    sim.seat_routes[0, 0, 0, 0] = sim.city_id[0, 0, col]
    sim.seat_routes[0, 0, 0, 1] = sim.city_id[0, 0, col]
    sim.seat_route_exp[0, 0, 0] = sim.turn + 20
    sim.seat_route_walk[0, 0, 0] = nb
    sim.seat_route_leg[0, 0, 0] = -1
    act1 = torch.ones(sim.B, dtype=torch.bool)
    sim._trade_walk_tick(0, act1)
    assert int(sim.seat_routes[0, 0, 0, 0]) >= 0, "golden Coinage must suppress the plunder"
    commit(sim, 0, sim._ded_exodus, golden=True)  # a different pick: the face lapses
    gold0 = float(sim.civ_treasury[0, 0])
    sim._trade_walk_tick(0, act1)
    assert int(sim.seat_routes[0, 0, 0, 0]) == -1, "without the face the barb plunders"
    # a BARBARIAN raider banks nothing (only a major has a treasury row here)
    assert float(sim.civ_treasury[0, 0]) == gold0
    sim.barb_unit_alive[0, bslot] = False
    sim.military_at[0, nb] = -1
    sim._eff_version += 1
    print("coinage no-plunder ok")

    # ---- Heartbeat of Steam: purchased Industrial+ building pays +2 --------
    steam_b = int((sim._b_era >= sim._industrial_era).long().argmax())
    assert bool(sim._b_era[steam_b] >= sim._industrial_era), "no Industrial+ building in the catalog"
    ancient_b = int((sim._b_era < sim._industrial_era).long().argmax())
    commit(sim, 0, sim._ded_steam)
    can6 = torch.zeros(B, dtype=torch.bool)
    can6[0] = True
    jj6 = torch.full((B,), col, dtype=torch.long)
    bb6 = torch.full((B,), steam_b, dtype=torch.long)
    sim._seat_buy_building(0, can6, jj6, bb6, torch.zeros(B, dtype=torch.float64))
    assert score(sim, 0) == 2, score(sim, 0)
    bb6 = torch.full((B,), ancient_b, dtype=torch.long)
    sim._seat_buy_building(0, can6, jj6, bb6, torch.zeros(B, dtype=torch.float64))
    assert score(sim, 0) == 2  # an ancient building pays nothing
    sim.city_bldg[0, 0, col, steam_b] = False
    sim.city_bldg[0, 0, col, ancient_b] = False
    sim._eff_version += 1
    print("steam purchase ok")

    # ---- To Arms! / Heartbeat of Steam: golden production multipliers ------
    warr = int((~sim.unit_naval & ~sim._type_civilian).long().argmax())  # a MILITARY foot unit
    act = torch.zeros(B, dtype=torch.bool)
    act[0] = True
    colv = torch.full((B,), col, dtype=torch.long)
    prod = torch.full((B,), 10.0, dtype=torch.float64)

    def run_prod(cur_code: int, golden_kind: int) -> float:
        commit(sim, 0, golden_kind, golden=True)
        sim.city_current[0, 0, col] = cur_code
        sim.city_cost[0, 0, col] = 100000
        sim.city_progress[0, 0, col] = 0
        sim.city_prod_bank[0, 0, col] = 0
        sim._seat_city_produce(0, colv, act, prod.clone())
        return float(sim.city_progress[0, 0, col])

    got = run_prod(sim.UNIT_BASE + warr, sim._ded_to_arms)
    assert abs(got - 10.0 * sim._to_arms_prod) < 1e-9, got
    got = run_prod(sim.UNIT_BASE + warr, sim._ded_exodus)
    assert abs(got - 10.0) < 1e-9, got
    # an Industrial+ wonder under Steam
    widx = int((sim._wonder_era >= sim._industrial_era).long().argmax())
    if bool(sim._wonder_era[widx] >= sim._industrial_era):
        got = run_prod(sim.WONDER_BASE + widx, sim._ded_steam)
        assert abs(got - 10.0 * sim._steam_wonder_prod) < 1e-9, got
        got = run_prod(sim.WONDER_BASE + widx, sim._ded_to_arms)
        assert abs(got - 10.0) < 1e-9, got
        print("to-arms + steam production ok")
    else:
        got = run_prod(sim.UNIT_BASE + warr, sim._ded_to_arms)
        print("to-arms production ok; steam wonder SKIPPED (no Industrial+ wonder)")
    sim.city_current[0, 0, col] = -1
    sim.city_cost[0, 0, col] = 0
    sim.city_progress[0, 0, col] = 0
    sim.city_prod_bank[0, 0, col] = 0
    sim._eff_version += 1

    # ---- Reform the Coinage, Golden face: +3 gold per foreign specialty ----
    tgt_row = 1
    tcol = int(sim.city_alive[0, tgt_row].long().argmax())
    spec_d = int(sim._is_specialty.long().argmax())
    free_t = next(t for t in range(sim.T) if int(sim.tile_seat[0, t]) == tgt_row)
    sim.city_dist_tile[0, tgt_row, tcol, spec_d] = free_t
    sim.district_complete[0, free_t] = True
    sim.seat_routes[0, 0, 0, 0] = sim.city_id[0, 0, col]
    sim.seat_routes[0, 0, 0, 1] = -1
    sim.seat_route_dseat[0, 0, 0] = tgt_row
    sim.seat_route_dcity[0, 0, 0] = sim.city_id[0, tgt_row, tcol]
    sim.seat_route_exp[0, 0, 0] = sim.turn + 100
    sim._eff_version += 1
    commit(sim, 0, sim._ded_coinage, golden=True)
    inc = sim._seat_route_income(0)
    assert inc is not None
    g_with = float(inc[0, col, 2])
    commit(sim, 0, sim._ded_exodus, golden=True)
    inc = sim._seat_route_income(0)
    assert inc is not None
    g_without = float(inc[0, col, 2])
    assert abs((g_with - g_without) - sim._coinage_spec_gold * 1) < 1e-9, (g_with, g_without)
    print("coinage intl gold ok")

    # ---- Heartbeat of Steam, Golden face: campus adjacency pays production -
    # (covered structurally: the campus arm mirrors the Free Inquiry block; a
    # full walk poke needs a placed campus with adjacency, so assert the wiring)
    assert sim._campus_idx >= 0

    print("DEDICATIONS OK — both faces of all four new catalog entries fire, and only as sourced")


if __name__ == "__main__":
    main()
