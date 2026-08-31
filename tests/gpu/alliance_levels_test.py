"""THE TYPED ALLIANCE — types, points, levels, and the fifteen-effect table.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/alliance_levels_test.py

CIV6 (Alliance): a pair holds ONE alliance of a chosen type; points accrue
every turn (1, +0.25 per trading direction — quarter-points on the wire) and
levels land at 80 / 240 on Standard. The effects are cumulative per level.

Proven here:
  * the formation stamps the TYPE beside the clock; expiry clears the type
    and keeps the points; the tick banks 4 quarter-points plus the routes;
  * `_alliance_levels_of` walks 1 -> 2 -> 3 at 320 / 960 quarter-points;
  * the sender and receiver route halves pay the typed yield;
  * Military 1 (+5 vs common enemies) and Religious 2 (+10 theological)
    answer per pair, and never for the ally itself;
  * Military 2 folds the two explored maps together;
  * Religious 1 zeroes the ally's religious pressure; Religious 3 pays
    +1 Faith per citizen following the ally's religion;
  * Research 2 boosts the lowest mutual unresearched tech on the cadence;
    Research 3 and Cultural 3 read the ally's stored output rates;
  * Cultural 2 pays +1 GPP on class districts in routed cities;
  * Economic 2 pays envoy points per ally-suzerained minor and Economic 3
    shares the named suzerain bonus.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
RESEARCH, CULTURAL, ECONOMIC, MILITARY, RELIGIOUS = 0, 1, 2, 3, 4


def build(rules, path) -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(4):
        sim.step()
    return sim


def ally_pair(sim, a: int, b: int, ty: int, qp: int = 0) -> None:
    for x, y in ((a, b), (b, a)):
        sim.seat_ally_turns[B0, x, y] = 30
        sim.seat_alliance_type[B0, x, y] = ty
        sim.seat_alliance_pts[B0, x, y] = qp
    sim._eff_version += 1


def craft_intl_route(sim, a: int, b: int, k: int = 0) -> None:
    """One live route: `a`'s first city -> `b`'s first city."""
    oid = int(sim.city_id[B0, a, 0])
    did = int(sim.city_id[B0, b, 0])
    sim.seat_routes[B0, a, k, 0] = oid
    sim.seat_routes[B0, a, k, 1] = -1_000_000  # never an own-city id: the leg is not domestic
    sim.seat_route_dseat[B0, a, k] = b
    sim.seat_route_dcity[B0, a, k] = did
    sim.seat_route_exp[B0, a, k] = int(sim.turn) + 50
    sim.seat_route_born[B0, a, k] = int(sim.turn)
    sim._seat_route_cache = None


def test_formation_and_expiry(rules, path) -> None:
    sim = build(rules, path)
    civ = int(sim._alliance_civic)
    sim.seat_friend_turns[B0, 0, 1] = 10
    sim.seat_friend_turns[B0, 1, 0] = 10
    if civ >= 0:
        sim.civ_civics[B0, 0, civ] = True
    want = torch.zeros(sim.B, sim.n_majors, dtype=torch.bool)
    want[B0, 1] = True
    ty = torch.full((sim.B, sim.n_majors), -1, dtype=torch.long)
    ty[B0, 1] = MILITARY
    sim.apply_geo(0, ally=want, ally_type=ty)
    sim._geo_agreements()
    assert int(sim.seat_ally_turns[B0, 0, 1]) == int(sim._agreement_turns), "the clock did not start"
    assert int(sim.seat_alliance_type[B0, 0, 1]) == MILITARY, "the type was not stamped"
    assert int(sim.seat_alliance_type[B0, 1, 0]) == MILITARY, "the type is not symmetric"

    # expiry: the type dies with the clock, the points stay
    sim.seat_ally_turns[B0, 0, 1] = 1
    sim.seat_ally_turns[B0, 1, 0] = 1
    pts0 = int(sim.seat_alliance_pts[B0, 0, 1])
    sim.step()
    assert int(sim.seat_ally_turns[B0, 0, 1]) == 0, "the clock did not run out"
    assert int(sim.seat_alliance_type[B0, 0, 1]) == -1, "expiry kept the type"
    assert int(sim.seat_alliance_pts[B0, 0, 1]) > pts0, "the last turn banked no points"
    print("  1 formation OK — type stamped both cells, expiry clears it, points stay")


def test_points_and_levels(rules, path) -> None:
    sim = build(rules, path)
    ally_pair(sim, 0, 1, RESEARCH, qp=0)
    # expected quarter-points: 4 + 1 per live trading direction
    to_b = bool((sim.seat_route_dseat[B0, 0] == 1).any())
    from_b = bool((sim.seat_route_dseat[B0, 1] == 0).any())
    want = int(sim._al_qp_turn) + int(sim._al_qp_route) * (int(to_b) + int(from_b))
    sim.step()
    assert int(sim.seat_alliance_pts[B0, 0, 1]) == want, \
        f"the tick banked {int(sim.seat_alliance_pts[B0, 0, 1])} qp, wanted {want}"
    assert int(sim.seat_alliance_pts[B0, 1, 0]) == want, "the points are not symmetric"

    for qp, lvl in ((0, 1), (int(sim._al_l2_qp), 2), (int(sim._al_l3_qp), 3)):
        ally_pair(sim, 0, 1, RESEARCH, qp=qp)
        assert int(sim._alliance_levels_of(0)[B0, 1]) == lvl, (qp, lvl)
    sim.seat_ally_turns[B0, 0, 1] = 0
    assert int(sim._alliance_levels_of(0)[B0, 1]) == 0, "a lapsed alliance still reports a level"
    print("  2 points OK — the tick's quarter-points and the 320/960 ladder")


def test_route_halves(rules, path) -> None:
    # ECONOMIC sender half: +4 gold on the paying leg
    deltas = {}
    for arm in (False, True):
        sim = build(rules, path)
        craft_intl_route(sim, 0, 1)
        if arm:
            ally_pair(sim, 0, 1, ECONOMIC)
        t0 = float(sim.civ_treasury[B0, 0])
        sim.step()
        deltas[arm] = float(sim.civ_treasury[B0, 0]) - t0
    want = float(sim._al_route_to[ECONOMIC])
    got = deltas[True] - deltas[False]
    # the sender half rides the city walk, so the city's happiness multiplier
    # scales it; the serve gate pins the exact figure cross-engine
    assert want - 1e-6 <= got <= want * 1.3 + 1e-6, \
        f"the sender half paid {got}, wanted ~{want}"

    # RESEARCH receiver half: the ally's route INTO me pays +1 science
    deltas = {}
    for arm in (False, True):
        sim = build(rules, path)
        craft_intl_route(sim, 1, 0)
        if arm:
            ally_pair(sim, 0, 1, RESEARCH)
        t0 = float(sim.civ_tech_prog[B0, 0]) + float(sim.civ_techs[B0, 0].sum())
        sim.step()
        # a completion spends progress; count techs too so the delta is stable
        deltas[arm] = (float(sim.civ_tech_prog[B0, 0]) - t0, float(sim.civ_techs[B0, 0].sum()))
    assert deltas[True][1] == deltas[False][1], "a tech completion muddied the receiver probe"
    got = deltas[True][0] - deltas[False][0]
    want = float(sim._al_route_from[RESEARCH])
    assert abs(got - want) < 1e-6, f"the receiver half paid {got}, wanted {want}"
    print("  3 routes OK — sender +4 gold, receiver +1 science")


def test_combat_terms(rules, path) -> None:
    sim = build(rules, path)
    NM = sim.n_majors
    if NM < 3:
        print("  4 combat SKIPPED — fewer than three majors")
        return
    ally_pair(sim, 0, 1, MILITARY)
    foe = 2
    rf = int(sim._seat_row[foe])
    sim.war[B0, 0, rf] = True
    sim.war[B0, rf, 0] = True
    own = torch.zeros(sim.B, dtype=torch.long)
    ft = torch.full((sim.B,), foe, dtype=torch.long)
    assert float(sim._ally_war_cs(own, ft)[B0]) == 0.0, "+5 landed though the ally is at peace"
    sim.war[B0, 1, rf] = True
    sim.war[B0, rf, 1] = True
    assert float(sim._ally_war_cs(own, ft)[B0]) == float(sim._al_m1_cs), "+5 missing vs the common enemy"
    assert float(sim._ally_war_cs(own, torch.ones(sim.B, dtype=torch.long))[B0]) == 0.0, \
        "+5 landed against the ally itself"

    ally_pair(sim, 0, 1, RELIGIOUS, qp=int(sim._al_l2_qp))
    assert float(sim._ally_theo_cs(own, ft)[B0]) == float(sim._al_rel2_theo_cs), \
        "the theological +10 is missing"
    assert float(sim._ally_theo_cs(own, torch.ones(sim.B, dtype=torch.long))[B0]) == 0.0, \
        "the theological +10 landed against the ally's own religion"
    ally_pair(sim, 0, 1, RELIGIOUS, qp=0)
    assert float(sim._ally_theo_cs(own, ft)[B0]) == 0.0, "the theological +10 ignored its level gate"
    print("  4 combat OK — Military 1 and Religious 2, never against the ally")


def test_shared_visibility(rules, path) -> None:
    sim = build(rules, path)
    ally_pair(sim, 0, 1, MILITARY, qp=int(sim._al_l2_qp))
    a0 = sim.seat_explored[B0, 0].clone()
    b0 = sim.seat_explored[B0, 1].clone()
    sim.step()
    u = a0 | b0
    assert bool((sim.seat_explored[B0, 0] & u).eq(u).all()), "row 0 did not receive the ally's map"
    assert bool((sim.seat_explored[B0, 1] & u).eq(u).all()), "row 1 did not receive the ally's map"
    print("  5 visibility OK — the explored maps fold together at level 2")


def test_religious_pressure_and_faith(rules, path) -> None:
    sim = build(rules, path)
    # both seats found a religion at their capitals
    sim.holy_tile[B0, 0] = int(sim.city_center[B0, 0, 0])
    # the rival's Holy City lands ON the probed capital, so range is moot
    sim.holy_tile[B0, 1] = int(sim.city_center[B0, 0, 0])
    for g in (0, 1):
        sim.civ_religion_done[B0, g] = True
    base = sim.city_pressure.clone()
    sim._spread_religious_pressure()
    without = int(sim.city_pressure[B0, 0, 0, 1])
    sim.city_pressure.copy_(base)
    ally_pair(sim, 0, 1, RELIGIOUS)
    sim._spread_religious_pressure()
    with_a = int(sim.city_pressure[B0, 0, 0, 1])
    if without == 0:
        print("  6 pressure SKIPPED — the capitals sit out of pressure range on this fixture")
    else:
        assert with_a == 0, "the ally's religion still presses"
        print("  6 pressure OK — the ally's religion falls silent")

    # Religious 3: +1 Faith per citizen following the ally's religion
    deltas = {}
    for arm in (False, True):
        s2 = build(rules, path)
        s2.city_followed[B0, 0, 0] = 1
        if arm:
            ally_pair(s2, 0, 1, RELIGIOUS, qp=int(s2._al_l3_qp))
        f0 = float(s2.civ_faith[B0, 0])
        pop = int(s2.city_pop[B0, 0, 0])
        s2.step()
        deltas[arm] = float(s2.civ_faith[B0, 0]) - f0
    got = deltas[True] - deltas[False]
    assert abs(got - pop * float(s2._al_rel3_faith_pop)) < 1e-6, \
        f"Religious 3 paid {got}, wanted {pop}"
    print("  7 faith OK — +1 per citizen under the ally's religion")


def test_research_cadence_and_rates(rules, path) -> None:
    sim = build(rules, path)
    ally_pair(sim, 0, 1, RESEARCH, qp=int(sim._al_l2_qp))
    n = int(sim._al_r2_boost_turns)
    sim.turn = n  # the tick reads the pre-increment turn, the congress alignment
    both = (~sim.civ_techs[B0, 0] & ~sim.civ_techs[B0, 1])
    pick = int(both.long().argmax())
    b0 = bool(sim.civ_tech_boosted[B0, 0, pick])
    b1 = bool(sim.civ_tech_boosted[B0, 1, pick])
    sim.step()
    assert not (b0 or b1), "the probe tech was boosted before the cadence"
    assert bool(sim.civ_tech_boosted[B0, 0, pick]) and bool(sim.civ_tech_boosted[B0, 1, pick]), \
        "the shared boost did not land on the lowest mutual tech"

    # Research 3 reads the ally's stored science rate under co-research
    deltas = {}
    for arm in (False, True):
        s2 = build(rules, path)
        curt = int(s2.civ_cur_tech[B0, 0])
        if curt < 0:
            curt = int((~s2.civ_techs[B0, 0]).long().argmax())
            s2.civ_cur_tech[B0, 0] = curt
        s2.civ_techs[B0, 1, curt] = True
        s2.civ_sci_rate[B0, 1] = 100.0
        s2.civ_tech_prog[B0, 0] = -10_000.0  # no completion can muddy the delta
        if arm:
            ally_pair(s2, 0, 1, RESEARCH, qp=int(s2._al_l3_qp))
        t0 = float(s2.civ_tech_prog[B0, 0]) + float(s2.civ_techs[B0, 0].sum())
        s2.step()
        deltas[arm] = (float(s2.civ_tech_prog[B0, 0]) - t0, float(s2.civ_techs[B0, 0].sum()))
    assert deltas[True][1] == deltas[False][1], "a tech completion muddied the rate probe"
    got = deltas[True][0] - deltas[False][0]
    want = float(s2._al_r3_sci_pct) * 100.0
    assert abs(got - want) < 1e-6, f"Research 3 paid {got}, wanted {want}"
    print("  8 research OK — the 20-turn boost and the +10% co-research read")


def test_cultural_dividends(rules, path) -> None:
    # Cultural 2: +1 GPP per class district in a routed city, by direct call
    sim = build(rules, path)
    cls = next((c for c in range(sim._gp_nc) if int(sim._gp_class_district[c]) >= 0), -1)
    if cls < 0:
        print("  9 culture SKIPPED — no class names a district")
        return
    dv = int(sim._gp_class_district[cls])
    own = (sim.tile_seat[B0] == 0) & (sim.district[B0] < 0)
    t = int(own.long().argmax())
    sim.city_dist_tile[B0, 0, 0, dv] = t
    sim.district[B0, t] = dv
    sim.district_complete[B0, t] = True
    craft_intl_route(sim, 0, 1)
    act = torch.ones(sim.B, dtype=torch.bool)
    g0 = float(sim.civ_gpp[B0, 0, cls])
    sim._advance_great_people(0, act)
    base = float(sim.civ_gpp[B0, 0, cls]) - g0
    ally_pair(sim, 0, 1, CULTURAL, qp=int(sim._al_l2_qp))
    g0 = float(sim.civ_gpp[B0, 0, cls])
    sim._advance_great_people(0, act)
    got = float(sim.civ_gpp[B0, 0, cls]) - g0 - base
    want = float(sim._al_c2_gpp) * float(sim._congress_gpp_factor(cls)[B0])
    assert abs(got - want) < 1e-6, f"Cultural 2 paid {got}, wanted {want}"

    # Cultural 3: +10% of the ally's culture rate, +20% of its tourism rate
    deltas = {}
    for arm in (False, True):
        s2 = build(rules, path)
        s2.civ_cul_rate[B0, 1] = 50.0
        s2.civ_tour_rate[B0, 1] = 40
        if arm:
            ally_pair(s2, 0, 1, CULTURAL, qp=int(s2._al_l3_qp))
        c0 = float(s2.civ_civic_prog[B0, 0]) + float(s2.civ_civics[B0, 0].sum())
        u0 = float(s2.civ_tourism[B0, 0])
        s2.step()
        deltas[arm] = (float(s2.civ_civic_prog[B0, 0]) - c0, float(s2.civ_civics[B0, 0].sum()),
                       float(s2.civ_tourism[B0, 0]) - u0)
    assert deltas[True][1] == deltas[False][1], "a civic completion muddied the culture probe"
    gc = deltas[True][0] - deltas[False][0]
    gt = deltas[True][2] - deltas[False][2]
    assert abs(gc - 5.0) < 1e-6, f"Cultural 3 culture paid {gc}, wanted 5"
    assert abs(gt - 8.0) < 1e-6, f"Cultural 3 tourism paid {gt}, wanted 8"
    print("  9 culture OK — the GPP dividend and both percentage reads")


def test_economic_dividends(rules, path) -> None:
    sim = build(rules, path)
    if sim.S == 0:
        print(" 10 economic SKIPPED — no city-states on this fixture")
        return
    # seat 1 suzerains cs 0
    suz_min = int(sim.rules.citystate.get("suzerainEnvoys", 3))
    deltas = {}
    for arm in (False, True):
        s2 = build(rules, path)
        s2.seat_citystate_envoys[B0, 1, 0] = suz_min
        s2.seat_citystate_met[B0, 0, 0] = True
        if arm:
            ally_pair(s2, 0, 1, ECONOMIC, qp=int(s2._al_l2_qp))
        i0 = float(s2.civ_influence[B0, 0]) + 100.0 * float(s2.civ_envoys_avail[B0, 0])
        s2.step()
        deltas[arm] = (float(s2.civ_influence[B0, 0]) + 100.0 * float(s2.civ_envoys_avail[B0, 0])) - i0
    got = deltas[True] - deltas[False]
    assert abs(got - float(sim._al_e2_influence)) < 1e-6, \
        f"Economic 2 paid {got} envoy points, wanted {float(sim._al_e2_influence)}"

    # Economic 3: the named suzerain bonus is shared at level 3
    sim.seat_citystate_envoys[B0, 1, 0] = suz_min
    code = int(sim.citystate_suz_code[B0, 0])
    if code < 0:
        print(" 10 economic OK — envoy points; share probe skipped (cs 0 names no coded perk)")
        return
    sim._eff_version += 1
    assert not bool(sim._suz_effect(0, code)[B0]), "the perk leaked without the alliance"
    ally_pair(sim, 0, 1, ECONOMIC, qp=int(sim._al_l3_qp))
    assert bool(sim._suz_effect(0, code)[B0]), "Economic 3 did not share the perk"
    ally_pair(sim, 0, 1, ECONOMIC, qp=0)
    assert not bool(sim._suz_effect(0, code)[B0]), "the share ignored its level gate"
    print(" 10 economic OK — envoy points per ally minor, and the shared perk at level 3")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_formation_and_expiry(rules, path)
    test_points_and_levels(rules, path)
    test_route_halves(rules, path)
    test_combat_terms(rules, path)
    test_shared_visibility(rules, path)
    test_religious_pressure_and_faith(rules, path)
    test_research_cadence_and_rates(rules, path)
    test_cultural_dividends(rules, path)
    test_economic_dividends(rules, path)
    print("BATTERY OK alliance_levels")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
