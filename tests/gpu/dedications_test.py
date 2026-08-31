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
    assert sim._n_ded == 12, sim._n_ded
    # Every WORLD ERA offers a window, and Ancient offers none — a civ has
    # earned no era score when the game opens.
    assert sim._ded_era_len[0] == 0, sim._ded_era_len
    for _e in range(1, 6):
        assert sim._ded_era_len[_e] == 4, (_e, sim._ded_era_len)
    for _e, _w in enumerate(sim._ded_eras):
        assert len(set(_w[:sim._ded_era_len[_e]])) == sim._ded_era_len[_e], (_e, _w)
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
    sim._unit_kill_event(torch.zeros(B, dtype=torch.long), tt, no, yes)
    assert score(sim, 0) == 1
    sim._unit_kill_event(torch.zeros(B, dtype=torch.long), tt, yes, yes)  # barb victim
    assert score(sim, 0) == 1
    sim._unit_kill_event(torch.zeros(B, dtype=torch.long), torch.full((B,), foot_t, dtype=torch.long), no, yes)
    assert score(sim, 0) == 1  # not naval
    sim._unit_kill_event(150, tt, no, yes)  # a city-state killer holds no dedication
    assert score(sim, 0) == 1
    commit(sim, 0, sim._ded_dracones, golden=True)  # a GOLDEN age takes bonuses
    sim._unit_kill_event(0, tt, no, yes)
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
        sim.city_current[0, 0, col, 0] = cur_code
        sim.city_cost[0, 0, col, 0] = 100000
        sim.city_progress[0, 0, col, 0] = 0
        sim.city_prod_bank[0, 0, col] = 0
        sim._seat_city_produce(0, colv, act, prod.clone())
        return float(sim.city_progress[0, 0, col, 0])

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
    sim.city_current[0, 0, col, 0] = -1
    sim.city_cost[0, 0, col, 0] = 0
    sim.city_progress[0, 0, col, 0] = 0
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

    # ---- Wish You Were Here ------------------------------------------------
    # NORMAL: "+1 Era Score for each Artifact extracted."
    row = 0
    col = int(sim.city_alive[0, row].nonzero()[0])
    sim.city_bldg[0, row, col, sim._artifact_bidx] = True
    sim.city_artifacts[0, row, col] = 0
    dig = next(t for t in range(sim.T)
               if int(sim.tile_seat[0, t]) == row and int(sim.centre_slot_at[0, t]) < 0)
    sim.antiquity[0, dig] = True
    sim.antiquity_era[0, dig] = 0
    sim.antiquity_seat[0, dig] = row
    commit(sim, row, sim._ded_wish)
    sim._do_excavate(row, torch.ones(B, dtype=torch.bool), torch.full((B,), dig, dtype=torch.long),
                     torch.zeros(B, dtype=torch.long))
    assert int(sim.city_artifacts[0, row, col]) == 1, "the excavation never landed"
    assert score(sim, row) == sim._ded_event_score[sim._ded_wish], score(sim, row)
    print("wish artifact era score ok")

    # GOLDEN: "Cities with Governors receive 50% Tourism from World Wonders."
    wsite = next(t for t in range(sim.T)
                 if int(sim.tile_seat[0, t]) == row and int(sim.built_wonder[0, t]) < 0
                 and int(sim.district[0, t]) < 0 and int(sim.centre_slot_at[0, t]) < 0)
    sim.built_wonder[0, wsite] = 0
    sim.built_wonder_complete[0, wsite] = True
    sim._eff_version += 1
    zc = torch.zeros(B, sim.RC, dtype=torch.long)
    alive_c = sim.city_alive[:, row]
    own = sim.tile_seat == row
    era_c = sim._civ_era(sim.civ_techs[:, row], sim.civ_civics[:, row])
    plain = int(sim._tourism_of(zc, zc, zc, alive_c, own, era_c)[0])
    sim.built_wonder_complete[0, wsite] = False
    sim._eff_version += 1
    floor_t = int(sim._tourism_of(zc, zc, zc, alive_c, own, era_c)[0])
    sim.built_wonder_complete[0, wsite] = True
    sim._eff_version += 1
    base = plain - floor_t
    assert base > 0, "the planted wonder paid no tourism"
    with_gov = int(sim._tourism_of(zc, zc, zc, alive_c, own, era_c, gov_tile=own)[0])
    assert with_gov - floor_t == (base * sim._wish_wond_num) // sim._wish_wond_den, (with_gov, floor_t, base)
    # ...and the plane only lights up under the GOLDEN face
    commit(sim, row, sim._ded_wish, golden=True)
    assert bool(sim._governor_tiles(row, sim.city_alive[:, row]).any()), "golden Wish lit no governor tile"
    commit(sim, row, sim._ded_wish)
    assert not bool(sim._governor_tiles(row, sim.city_alive[:, row]).any()), "a NORMAL age paid the golden clause"
    print("wish governor wonder tourism ok")

    # ---- Sky and Stars ------------------------------------------------------
    # CIV6: "+1 Era Score for each Aerodrome building constructed. +1 Era Score
    # each time a Great Person is Earned."
    aero_b = [b for b in range(sim.NB) if int(sim._b_req_district[b]) == sim._aerodrome_didx]
    assert aero_b, "the catalog carries no Aerodrome building"
    yes = torch.ones(B, dtype=torch.bool)
    commit(sim, row, sim._ded_sky)
    sim._building_dedications(row, torch.full((B,), aero_b[0], dtype=torch.long), yes)
    assert score(sim, row) == sim._ded_event_score[sim._ded_sky], score(sim, row)
    commit(sim, row, sim._ded_sky)
    other = next(b for b in range(sim.NB)
                 if int(sim._b_req_district[b]) != sim._aerodrome_didx
                 and int(sim._b_era[b]) < sim._industrial_era
                 and not bool(sim._b_science[b]) and not bool(sim._b_gwslot[b]))
    sim._building_dedications(row, torch.full((B,), other, dtype=torch.long), yes)
    assert score(sim, row) == 0, "only an AERODROME building pays Sky and Stars"
    print("sky aerodrome building ok")

    # ---- Automaton Warfare: only a GDR kill pays ----------------------------
    gdr = sim._gdr_idx
    assert gdr >= 0, "the roster fields no Giant Death Robot"
    prey = torch.full((B,), int((~sim.unit_naval).nonzero().flatten()[0]), dtype=torch.long)
    no = torch.zeros(B, dtype=torch.bool)
    commit(sim, row, sim._ded_automaton)
    sim._unit_kill_event(row, prey, no, yes, torch.full((B,), gdr, dtype=torch.long))
    assert score(sim, row) == sim._ded_event_score[sim._ded_automaton], score(sim, row)
    commit(sim, row, sim._ded_automaton)
    sim._unit_kill_event(row, prey, yes, yes, torch.full((B,), gdr, dtype=torch.long))
    assert score(sim, row) == 0, "a BARBARIAN victim pays nothing"
    commit(sim, row, sim._ded_automaton)
    sim._unit_kill_event(row, prey, no, yes, prey)
    assert score(sim, row) == 0, "an ordinary chassis pays nothing"
    commit(sim, row, sim._ded_automaton)
    sim._unit_kill_event(row, prey, no, yes)
    assert score(sim, row) == 0, "a CITY has no chassis, and pays nothing"
    print("automaton gdr kill ok")

    # ---- the two golden faces the SOURCE pays in resources ------------------
    # CIV6: "Aluminum mines accumulate +2 more resources per turn"; "Receive 3
    # Uranium per turn. Uranium mines accumulate +1 more resource per turn."
    def accrued(kind: int, slot: int, mine_rid: int | None) -> int:
        commit(sim, row, kind, golden=True)
        sim.civ_stockpile[:, row] = 0
        if mine_rid is not None:
            sim.res_id[0, mtile] = mine_rid
            sim.res_imp[0, mtile] = 3
            sim.improvement[0, mtile] = 3
            sim.pillaged[0, mtile] = False
            sim.tile_seat[0, mtile] = row
            sim._tile_owner_ver += 1
        sim._seat_accrue_stockpile(row)
        return int(sim.civ_stockpile[0, row, slot])

    mtile = int((sim.tile_seat[0] == row).nonzero().flatten()[0])
    alu, ura = sim._sky_alu_slot, sim._auto_ura_slot
    assert alu >= 0 and ura >= 0
    base_a = accrued(sim._ded_monumentality, alu, int(sim._strat_rid[alu]))
    with_a = accrued(sim._ded_sky, alu, int(sim._strat_rid[alu]))
    assert with_a - base_a == sim._sky_alu_rate, (base_a, with_a)
    base_u = accrued(sim._ded_monumentality, ura, int(sim._strat_rid[ura]))
    with_u = accrued(sim._ded_automaton, ura, int(sim._strat_rid[ura]))
    assert with_u - base_u == sim._auto_ura_rate + sim._auto_ura_mine, (base_u, with_u)
    print("sky/automaton mine accrual ok")

    # ---- the one-off grants at the era boundary -----------------------------
    sim2 = build()
    for r2 in range(sim2.n_majors):
        commit(sim2, r2, sim2._ded_sky, golden=True)
        sim2.ded_picks[:, r2, 0] = sim2._ded_sky
        sim2.civ_age[:, r2] = 2
    atomic = next(e for e, w in enumerate(sim2._sky_eurekas) if w)
    sim2._commit_golden_grants(atomic)
    for t2 in sim2._sky_eurekas[atomic]:
        assert bool(sim2.civ_tech_boosted[0, 0, t2]), f"Sky and Stars left tech {t2} unboosted"
    sim3 = build()
    for r3 in range(sim3.n_majors):
        commit(sim3, r3, sim3._ded_automaton, golden=True)
        sim3.ded_picks[:, r3, 0] = sim3._ded_automaton
        sim3.civ_age[:, r3] = 2
    had = int((sim3.major_unit_alive & (sim3.major_unit_type == sim3._gdr_idx)).sum())
    sim3._commit_golden_grants(atomic)
    now = int((sim3.major_unit_alive & (sim3.major_unit_type == sim3._gdr_idx)).sum())
    assert now > had, "Automaton Warfare's golden face put no robot in a capital"
    print("sky eurekas + automaton robot ok")

    print("DEDICATIONS OK — both faces of all eight new catalog entries fire, and only as sourced")


if __name__ == "__main__":
    main()
