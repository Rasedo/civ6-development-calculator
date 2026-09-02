"""ESPIONAGE: capacity, the jump, the mission heads and what each one does.

A Spy holds NEITHER occupancy plane — it jumps between city centres and works
out of a district of whatever city it stands on. Every check below drives
`_seat_unit_mask` / `_apply_seat_unit_actions`, the entry points
`policy/drive.py` uses, so a rule only the applier knows cannot hide.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def fresh(rules, path, turns=30):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def a_city(sim, row):
    live = sim.city_alive[0, row].nonzero().flatten()
    assert live.numel(), f"row {row} holds no city"
    return int(live[0])


def give_district(sim, row, j, di):
    """A COMPLETE district of type `di` on a free plot the city owns."""
    ctr = int(sim.city_center[0, row, j])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[0, t]) == row and int(sim.district[0, t]) < 0
            and int(sim.built_wonder[0, t]) < 0 and bool(sim.passable[0, t]) and t != ctr]
    assert free, "the city owns no free plot"
    t = free[0]
    sim.district[0, t] = di
    sim.district_complete[0, t] = True
    sim.district_pillaged[0, t] = False
    sim.city_dist_tile[0, row, j, di] = t
    sim._eff_version += 1
    sim._tile_owner_ver += 1
    return t


def spawn_spy(sim, row, tile):
    was = set(sim.major_unit_alive[0].nonzero().flatten().tolist())
    sim._spawn_unit(row, torch.ones(1, dtype=torch.bool), torch.tensor([tile]),
                    torch.tensor([sim._spy_idx]))
    got = set(sim.major_unit_alive[0].nonzero().flatten().tolist()) - was
    assert len(got) == 1, "the spawn found no slot"
    sim._gen_ver += 1
    return got.pop()


def rank_of(sim, row, slot):
    smap = sim._seat_slot_map(row)[0]
    return int((smap == slot).nonzero(as_tuple=True)[0][0])


def order(sim, row, slot, col):
    smap = sim._seat_slot_map(row)[0]
    acts = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    acts[0, rank_of(sim, row, slot)] = col
    sim.seat_ext[0, row] = True
    sim._apply_seat_unit_actions(row, acts)


def mask_row(sim, row, slot):
    m = sim._seat_unit_mask(row)
    return m[0, rank_of(sim, row, slot)]


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    row, foe = 1, 2

    sim = fresh(rules, path)
    assert sim._spy_idx >= 0, "the roster fields no Spy — every check below is vacuous"
    assert sim._A_SPY_TRAVEL >= 0 and sim._A_SPY_MISSION >= 0
    mine, theirs = a_city(sim, row), a_city(sim, foe)
    ctr_m = int(sim.city_center[0, row, mine])
    ctr_t = int(sim.city_center[0, foe, theirs])

    # -- 1: capacity ---------------------------------------------------------
    for c in sim._spy_cap_civics:
        sim.civ_civics[0, row, c] = False
    for t in sim._spy_cap_techs:
        sim.civ_techs[0, row, t] = False
    assert int(sim._spy_capacity(row)[0]) == 0
    assert not bool(sim._can_train_spy(row)[0])
    sim.civ_civics[0, row, sim._spy_cap_civics[0]] = True
    assert int(sim._spy_capacity(row)[0]) == 1
    assert bool(sim._can_train_spy(row)[0]), "one source must buy one Spy"

    v = spawn_spy(sim, row, ctr_m)
    assert not bool(sim._can_train_spy(row)[0]), "the fielded Spy fills the capacity"
    # ...and every further source raises it by exactly one
    sim.civ_civics[0, row, sim._spy_cap_civics[1]] = True
    assert int(sim._spy_capacity(row)[0]) == 2
    assert bool(sim._can_train_spy(row)[0])
    # CIV6 (Spy): "Cannot be purchased with Gold."
    assert bool(sim._type_no_gold[sim._spy_idx])

    # -- 2: it holds no plot -------------------------------------------------
    assert int(sim.civilian_at[0, ctr_m]) != v + sim.POOL_LO["major"]
    assert int(sim.military_at[0, ctr_m]) != v + sim.POOL_LO["major"]
    assert int(sim.major_unit_tile[0, v]) == ctr_m, "the Spy stands where it was put"
    v2 = spawn_spy(sim, row, ctr_m)
    assert int(sim.major_unit_tile[0, v2]) == ctr_m, "a second Spy shares the plot"
    sim.major_unit_alive[0, v2] = False
    sim._gen_ver += 1

    # -- 3: the jump ---------------------------------------------------------
    def dests():
        return sim._spy_destinations(
            row, torch.tensor([[v]]), torch.tensor([[ctr_m]]),
            torch.tensor([[sim._spy_idx]]))[0, 0].tolist()

    # CIV6: "any city you have REVEALED" — an unseen centre is not a destination
    assert not bool(sim.seat_explored[0, row, ctr_t])
    assert ctr_t not in dests()
    sim.seat_explored[0, row, ctr_t] = True
    cols = dests()
    assert ctr_t in cols, "a revealed foreign centre is a destination"
    assert ctr_m not in cols, "its own tile never is"
    # CIV6: "provided you don't have an Alliance with that civilization"
    sim.seat_ally_turns[0, row, foe] = 5
    assert ctr_t not in dests()
    sim.seat_ally_turns[0, row, foe] = 0

    k = dests().index(ctr_t)
    want = int(sim._spy_travel_turns(torch.tensor([ctr_m]), torch.tensor([ctr_t]))[0])
    order(sim, row, v, sim._A_SPY_TRAVEL + k)
    assert int(sim.unit_spy_mission[0, v]) == sim._spy_travelling
    assert int(sim.unit_spy_turns[0, v]) == want
    assert int(sim.unit_spy_target[0, v]) == ctr_t
    for _ in range(want):
        sim._tick_spies(row)
    assert int(sim.unit_tile[0, v]) == ctr_t, "the Spy lands on arrival"
    assert int(sim.unit_spy_mission[0, v]) == sim._spy_idle
    assert int(sim.unit_spy_target[0, v]) == -1

    # -- 4: what a city offers ----------------------------------------------
    mm = mask_row(sim, row, v)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert bool(mm[sim._spy_m_sources]), "an away mission is offered abroad"
    assert not bool(mm[sim._spy_m_counterspy]), "an at-home mission is not"
    assert not bool(mm[sim._spy_m_sabotage]), "no Industrial Zone, no Sabotage"

    iz = give_district(sim, foe, theirs, sim._iz_idx)
    mm = mask_row(sim, row, v)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert bool(mm[sim._spy_m_sabotage])
    sim.district_pillaged[0, iz] = True
    sim._eff_version += 1
    mm = mask_row(sim, row, v)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert not bool(mm[sim._spy_m_sabotage]), "a DARK district offers nothing"
    sim.district_pillaged[0, iz] = False
    sim._eff_version += 1

    # ...and the at-home column comes back at home
    sim.unit_tile[0, v] = ctr_m
    sim._gen_ver += 1
    mm = mask_row(sim, row, v)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert bool(mm[sim._spy_m_counterspy])
    assert not bool(mm[sim._spy_m_sources])

    # -- 5: Great Work Heist waits for a work -------------------------------
    sim.unit_tile[0, v] = ctr_t
    sim._gen_ver += 1
    hk = sim._heist_kind(torch.tensor([[foe]]), torch.tensor([[theirs]]))
    assert int(hk[0, 0]) == -1, "an empty city offers nothing to steal"
    sim.city_gw_music[0, foe, theirs] = 1
    assert int(sim._heist_kind(torch.tensor([[foe]]), torch.tensor([[theirs]]))[0, 0]) == 2
    sim.city_gw_writing[0, foe, theirs] = 1
    # CIV6: "Works of Writing will be displayed first ... Music last"
    assert int(sim._heist_kind(torch.tensor([[foe]]), torch.tensor([[theirs]]))[0, 0]) == 0
    sim.city_gw_writing[0, foe, theirs] = 0
    sim.city_gw_music[0, foe, theirs] = 0

    # -- 6: Steal Tech Boost waits for a tech the thief lacks ----------------
    sim.civ_techs[0, foe] = sim.civ_techs[0, row].clone()
    sim.civ_tech_boosted[0, row] = False
    assert int(sim._steal_first(row)[0, foe]) == -1, "no gap, no theft"
    gap = int((~sim.civ_techs[0, row]).long().argmax())
    sim.civ_techs[0, foe, gap] = True
    assert int(sim._steal_first(row)[0, foe]) == gap
    sim.civ_tech_boosted[0, row, gap] = True
    assert int(sim._steal_first(row)[0, foe]) == -1, "a BOOST already held is no gap"
    sim.civ_tech_boosted[0, row, gap] = False

    # -- 7: the clock and the Bodyguard cut ---------------------------------
    # CIV6 (Spy): the chassis' mission table — 8 turns for an operation, 16 for
    # the counterspy post, and each rolling mission names its own success rate.
    base = sim._spy_missions[sim._spy_m_unrest]["turns"]
    post = sim._spy_missions[sim._spy_m_counterspy]["turns"]
    assert (base, post) == (8, 16), f"the table reads {base}/{post}, not 8/16"
    for _mi, _md in enumerate(sim._spy_missions):
        _rolls = not _md["certain"] and _mi != sim._spy_m_counterspy
        assert (_md["successPct"] > 0) == _rolls, (
            f"mission {_mi} publishes {_md['successPct']}% and rolls={_rolls}")
    assert sim._spy_missions[sim._spy_m_partisans]["successPct"] == 10
    assert sim._spy_missions[sim._spy_m_siphon]["successPct"] == 56
    assert int(sim._spy_mission_turns(row, sim._spy_m_unrest)[0]) == base
    sim.civ_age[0, row] = 2
    sim.ded_picks[0, row, 0] = sim._ded_bodyguard
    cut = max(1, (base * sim._bodyguard_num) // sim._bodyguard_den)
    assert int(sim._spy_mission_turns(row, sim._spy_m_unrest)[0]) == cut
    assert int(sim._spy_mission_turns(row, sim._spy_m_counterspy)[0]) == post, \
        "a defensive post keeps the full clock"
    sim.civ_age[0, row] = 0
    sim.ded_picks[0, row, 0] = -1

    # -- 8: counter-espionage stands its post -------------------------------
    sim.unit_tile[0, v] = ctr_m
    sim._gen_ver += 1
    order(sim, row, v, sim._A_SPY_MISSION + sim._spy_m_counterspy)
    assert int(sim.unit_spy_mission[0, v]) == sim._spy_m_counterspy
    for _ in range(post):
        sim._tick_spies(row)
    assert int(sim.unit_spy_mission[0, v]) == sim._spy_m_counterspy, "it re-arms"
    assert int(sim.unit_spy_turns[0, v]) == post

    # -- 9: Gain Sources arms the seat-keyed clock, and it decays ------------
    sim.unit_tile[0, v] = ctr_t
    sim.unit_spy_mission[0, v] = sim._spy_idle
    sim._gen_ver += 1
    order(sim, row, v, sim._A_SPY_MISSION + sim._spy_m_sources)
    for _ in range(base):
        sim._tick_spies(row)
    assert int(sim.city_spy_sources[0, foe, theirs, row]) == sim._spy_sources_turns
    assert int(sim.city_spy_sources[0, foe, theirs, foe]) == 0, "the clock is per SEAT"
    sim._tick_spy_effects(foe)
    assert int(sim.city_spy_sources[0, foe, theirs, row]) == sim._spy_sources_turns - 1

    # -- 10: a neutralized governor leaves the city, and the clock is HIS ----
    sim.civ_civics[0, foe] = True  # every title the ladder can hand out
    sim._governor_phase(foe)
    gi = int(sim._governor_at(foe)[0, theirs])
    assert gi >= 0, "the holder's only city is governor-seated"
    sim.neutralize_governor(0, foe, gi, sim._spy_gov_turns)
    assert int(sim._governor_at(foe)[0, theirs]) < 0, "a neutralized governor holds no city"
    mm = mask_row(sim, row, v)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert not bool(mm[sim._spy_m_governor]), "no governor, no Neutralize Governor"
    sim._governor_tick(foe)
    assert int(sim.civ_gov_out[0, foe, gi]) == sim._spy_gov_turns - 1
    sim.civ_gov_out[0, foe, gi] = 0

    # -- 11: Sabotage darkens the district it names -------------------------
    sim.unit_spy_mission[0, v] = sim._spy_idle
    sim._gen_ver += 1
    order(sim, row, v, sim._A_SPY_MISSION + sim._spy_m_sabotage)
    assert int(sim.unit_spy_mission[0, v]) == sim._spy_m_sabotage
    sim.rng_state[0] = 7  # a draw that clears the success bar
    for _ in range(int(sim.unit_spy_turns[0, v])):
        sim._tick_spies(row)
    assert bool(sim.district_pillaged[0, iz]), "a successful Sabotage darkens the Zone"
    assert int(sim.unit_spy_level[0, v]) == 1, "an offensive success levels the Spy"

    # -- 12: the rebels are ANTI-CAVALRY of the world era --------------------
    ch = sim._partisan_chassis()
    assert int(ch[0]) >= 0 and bool(sim._type_anticav[int(ch[0])])
    assert int(sim._type_era[int(ch[0])]) <= int(sim._world_era()[0])

    # -- 13: the counterspy that makes the catch earns the level -------------
    # CIV6 (Spies and Espionage): a spy "may gain levels from successful
    # offensive operations, or capturing an enemy Spy". Both odds are PINNED
    # rather than rolled — the mission cannot succeed and the catch cannot
    # miss — so the poke reads the award, not the dice.
    _pct0, _cap0 = sim._spy_missions[sim._spy_m_sabotage]["successPct"], sim._spy_capture_pct
    _per0 = sim._spy_success_per_level
    _rt0 = [r["basePct"] for r in sim._spy_escape_routes]
    sim._spy_missions[sim._spy_m_sabotage]["successPct"] = 0
    sim._spy_success_per_level = 0   # ...so no LEVEL can lift the pinned rate
    sim._spy_capture_pct = 100
    for _r in sim._spy_escape_routes:
        _r["basePct"] = -1000        # ...and no route can save the spy
    w = spawn_spy(sim, row, ctr_t)
    guard = spawn_spy(sim, foe, ctr_t)
    sim.unit_spy_mission[0, guard] = sim._spy_m_counterspy
    sim.unit_spy_level[0, guard] = 0
    sim.district_pillaged[0, iz] = False
    sim._gen_ver += 1
    order(sim, row, w, sim._A_SPY_MISSION + sim._spy_m_sabotage)
    assert int(sim.unit_spy_mission[0, w]) == sim._spy_m_sabotage
    for _ in range(int(sim.unit_spy_turns[0, w])):
        sim._tick_spies(row)
    assert not bool(sim.unit_alive[0, w]), "the pinned catch did not fire"
    assert not bool(sim.district_pillaged[0, iz]), "a pinned FAILURE wrecked the Zone"
    assert int(sim.unit_spy_level[0, guard]) == 1, "the captor earned nothing"
    sim._spy_missions[sim._spy_m_sabotage]["successPct"] = _pct0
    sim._spy_success_per_level = _per0
    sim._spy_capture_pct = _cap0
    for _r, _b in zip(sim._spy_escape_routes, _rt0):
        _r["basePct"] = _b

    # -- 14: the espionage promotion pool -----------------------------------
    # CIV6 (Spy): the seventeen promotions are one flat pool with no
    # prerequisites, and the spy is "able to choose one of three promotions
    # each time they gain a level, ... chosen at random from the pool".
    rd = sim.rules_dev
    ec = list(rd.promo_classes).index("ESPIONAGE")
    assert int(rd.u_promo_class[sim._spy_idx]) == ec, "the Spy promotes from another class"
    assert int(rd.promo_rows[ec]) == 17
    assert int(rd.promo_cols) >= 17, "the PROMOTE head cannot offer the whole pool"
    assert int(rd.promo_req[ec].abs().sum()) == 0, "an Espionage row asks a prerequisite"

    def pcol(kind, bit=0):
        """the ONE column of the pool carrying this effect, by what it does."""
        k = sim._pk[kind]
        hit = [j for j in range(int(rd.promo_rows[ec]))
               if any(int(rd.promo_kind[ec, j, s]) == k
                      and (not bit or int(rd.promo_mask[ec, j, s]) == bit)
                      for s in range(rd.promo_kind.shape[2]))]
        assert len(hit) == 1, f"{kind} names {len(hit)} columns, expected one"
        return hit[0]

    x = spawn_spy(sim, row, ctr_m)
    # CIV6 (Demolitions): "Sabotage Production as if 2 levels more experienced"
    # — the row names the ONE operation it lifts.
    m_sab, m_src = sim._spy_m_sabotage, sim._spy_m_sources
    sim.unit_promos[0, x] = 1 << pcol("SPY_OP_LEVEL", 1 << m_sab)
    assert sim._spy_op_levels(0, x, m_sab) == 2
    assert sim._spy_op_levels(0, x, m_src) == 0, "the masked read answered for another mission"

    # CIV6 (Linguist): "Time to complete all missions reduced by 25%."
    sc = torch.tensor([x])
    post = int(sim._spy_mission_turns(row, sim._spy_m_counterspy)[0])
    assert int(sim._spy_mission_turns(row, sim._spy_m_counterspy, sc)[0]) == post
    sim.unit_promos[0, x] = 1 << pcol("SPY_OP_SPEED")
    assert int(sim._spy_mission_turns(row, sim._spy_m_counterspy, sc)[0]) == (post * 75) // 100

    # CIV6 (Disguise): "Takes no time to establish presence in an enemy city."
    hit = torch.ones(1, dtype=torch.bool)
    dest = torch.tensor([ctr_t])
    sim.unit_promos[0, x] = 0
    sim._begin_travel(row, hit, sc, dest)
    assert int(sim.unit_spy_mission[0, x]) == sim._spy_travelling
    assert int(sim.unit_spy_turns[0, x]) > 0 and int(sim.unit_tile[0, x]) == ctr_m
    sim.unit_spy_mission[0, x] = sim._spy_idle
    sim.unit_promos[0, x] = 1 << pcol("SPY_NO_ESTABLISH")
    sim._begin_travel(row, hit, sc, dest)
    assert int(sim.unit_tile[0, x]) == ctr_t, "the disguised Spy is still travelling"
    assert int(sim.unit_spy_mission[0, x]) == sim._spy_idle
    assert int(sim.unit_spy_turns[0, x]) == 0 and int(sim.unit_spy_target[0, x]) == -1

    # CIV6 (Quartermaster): "If this Spy is in home territory, all your Spies
    # operate at +1 level"; (Polygraph): enemy spies "operate at 1 level below
    # usual" in the holder's own lands.
    sim.unit_promos[0, x] = 1 << pcol("SPY_HOME_ALLY_LEVEL")
    assert sim._quartermaster_levels(0, row) == 0, "the Spy abroad pays its own side nothing"
    sim.unit_tile[0, x] = ctr_m
    sim._gen_ver += 1
    assert sim._quartermaster_levels(0, row) == 1
    was = sim._counter_levels(0, foe, theirs)
    y = spawn_spy(sim, foe, ctr_t)
    sim.unit_promos[0, y] = 1 << pcol("SPY_HOME_ENEMY_LEVEL")
    assert sim._counter_levels(0, foe, theirs) == was + 1

    # the level hands the spy three DISTINCT columns and no more
    sim.unit_promos[0, x] = 0
    sim.unit_promo_offer[0, x] = 0
    sim.unit_spy_level[0, x] = 0
    sim._level_up_spy(0, x)
    assert int(sim.unit_spy_level[0, x]) == 1
    off = int(sim.unit_promo_offer[0, x])
    assert bin(off).count("1") == sim._promo_offer_n == 3
    assert off >> int(rd.promo_rows[ec]) == 0, "the draw offered a column the pool lacks"
    assert int(sim.unit_xp[0, x]) == int(sim._xp_to_next(sim.unit_level[0, x:x + 1])[0])

    # -- 15: the Espionage Pact reaches the spy -----------------------------
    # CIV6: "A: All Spies function +2 levels higher for the Target Operation. /
    # B: Target Operation is unavailable."
    ri = sim._congress_at["ESPIONAGE_PACT"]
    ki = sim._spy_offensive.index(sim._spy_m_siphon)
    other = sim._spy_offensive.index(sim._spy_m_unrest)
    sim.congress_active[:] = -1
    sim.congress_active[0, 0] = torch.tensor([ri, 0, ki])
    assert sim._congress_pact_levels(0, sim._spy_m_siphon) == sim._c_pact_levels
    assert sim._congress_pact_levels(0, sim._spy_m_unrest) == 0
    assert int(sim._congress_pact_ban()[0]) == -1
    sim.congress_active[0, 0, 1] = 1
    assert sim._congress_pact_levels(0, sim._spy_m_siphon) == 0
    assert int(sim._congress_pact_ban()[0]) == sim._spy_m_siphon
    # the ban reaches the mask the applier reads
    sim.unit_tile[0, x] = ctr_t
    sim.unit_spy_mission[0, x] = sim._spy_idle
    sim.unit_promos[0, x] = 0
    sim._gen_ver += 1
    give_district(sim, foe, theirs, sim._spy_missions[sim._spy_m_siphon]["district"])
    mm = mask_row(sim, row, x)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert not bool(mm[sim._spy_m_siphon]), "the banned operation is still offered"
    sim.congress_active[0, 0, 2] = other
    mm = mask_row(sim, row, x)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert bool(mm[sim._spy_m_siphon]), "the ban reached an operation it did not name"
    # the AI line takes the gift, on the operation its own spies are running
    sim.congress_active[:] = -1
    o_p, t_p = sim._congress_pref(ri, row)
    assert int(o_p[0]) == 0 and int(t_p[0]) == 0, "a seat with no working spy names row 0"
    sim.unit_spy_mission[0, x] = sim._spy_m_unrest
    o_p, t_p = sim._congress_pref(ri, row)
    assert int(o_p[0]) == 0 and int(t_p[0]) == other, "the ballot did not name the live op"

    # -- 16: the listening post stands its own post -------------------------
    # CIV6 (Diplomatic Visibility): the level is live only while the mission
    # runs, so the post renews the way the counterspy does — on a clock the
    # promotion that shortens every mission also shortens.
    sim.unit_tile[0, x] = ctr_t
    sim.unit_spy_mission[0, x] = sim._spy_idle
    sim.unit_promos[0, x] = 0
    sim._gen_ver += 1
    order(sim, row, x, sim._A_SPY_MISSION + sim._spy_m_listening)
    assert int(sim.unit_spy_mission[0, x]) == sim._spy_m_listening
    for _ in range(int(sim.unit_spy_turns[0, x])):
        sim._tick_spies(row)
    assert int(sim.unit_spy_mission[0, x]) == sim._spy_m_listening, "the post went idle"
    full = int(sim._spy_mission_turns(row, sim._spy_m_listening)[0])
    assert int(sim.unit_spy_turns[0, x]) == full
    sim.unit_promos[0, x] = 1 << pcol("SPY_OP_SPEED")
    for _ in range(int(sim.unit_spy_turns[0, x])):
        sim._tick_spies(row)
    assert int(sim.unit_spy_turns[0, x]) == (full * 75) // 100, "the re-post ignored the promotion"

    # -- 17: the ESCAPE SEQUENCE — the fastest standing route, then home ----
    # CIV6 (Espionage): a discovered spy "will need to escape from the target
    # city" — by Airplane (an Aerodrome, 1 turn), Boat (a Harbor, 2), Vehicle
    # (a Commercial Hub, 3) or on Foot (always, 4), a survivor reappearing in
    # the CAPITAL. The gates and the times are sourced; the base rates are
    # model values under the sourced "faster = more dangerous" ordering.
    _pf = sim._spy_missions[sim._spy_m_unrest]["successPct"]
    _pl, _pc = sim._spy_success_per_level, sim._spy_capture_pct
    _rb = [r["basePct"] for r in sim._spy_escape_routes]
    sim._spy_missions[sim._spy_m_unrest]["successPct"] = 0
    sim._spy_success_per_level = 0
    for _r in sim._spy_escape_routes:
        _r["basePct"] = 1000  # every escape succeeds
    assert sim._spy_escape_routes[0]["turns"] == 1 and sim._spy_escape_routes[-1]["turns"] == 4
    aero_di = sim._spy_escape_routes[0]["district"]
    assert aero_di >= 0
    aero = give_district(sim, foe, theirs, aero_di)
    cap_slot = int(sim.city_is_cap[0, row].long().argmax()) \
        if bool(sim.city_is_cap[0, row].any()) else int(sim.city_alive[0, row].long().argmax())
    cap_ctr = int(sim.city_center[0, row, cap_slot])
    w17 = spawn_spy(sim, row, ctr_t)
    sim.unit_spy_mission[0, w17] = sim._spy_m_unrest
    sim.unit_spy_turns[0, w17] = 1
    sim._tick_spies(row)
    assert int(sim.unit_spy_mission[0, w17]) == sim._spy_travelling, "the survivor is not riding home"
    assert int(sim.unit_spy_target[0, w17]) == cap_ctr, "the ride is not bound for the CAPITAL"
    assert int(sim.unit_spy_turns[0, w17]) == 1, "the Airplane is not the 1-turn ride"
    sim._tick_spies(row)
    assert int(sim.unit_tile[0, w17]) == cap_ctr and int(sim.unit_spy_mission[0, w17]) == sim._spy_idle
    sim.unit_alive[0, w17] = False
    # every route district dark, the same failure walks out on FOOT
    _dark17 = [aero]
    for _r in sim._spy_escape_routes:
        if _r["district"] >= 0:
            _dt = int(sim.city_dist_tile[0, foe, theirs, _r["district"]])
            if _dt >= 0 and _dt != aero and not bool(sim.district_pillaged[0, _dt]):
                _dark17.append(_dt)
    for _dt in _dark17:
        sim.district_pillaged[0, _dt] = True
    sim._eff_version += 1
    w17b = spawn_spy(sim, row, ctr_t)
    sim.unit_spy_mission[0, w17b] = sim._spy_m_unrest
    sim.unit_spy_turns[0, w17b] = 1
    sim._tick_spies(row)
    assert int(sim.unit_spy_turns[0, w17b]) == 4, "FOOT is not the 4-turn walk"
    sim.unit_alive[0, w17b] = False
    print("  17 escape OK — air out in one turn, foot in four, both to the capital")

    # -- 18: a lost escape splits the career: the cell, or the grave --------
    for _r in sim._spy_escape_routes:
        _r["basePct"] = -1000
    sim._spy_capture_pct = 100
    held0 = int(sim.seat_spy_held[0, row, foe])
    w18 = spawn_spy(sim, row, ctr_t)
    sim.unit_spy_mission[0, w18] = sim._spy_m_unrest
    sim.unit_spy_turns[0, w18] = 1
    sim._tick_spies(row)
    assert not bool(sim.unit_alive[0, w18]) and int(sim.seat_spy_held[0, row, foe]) == held0 + 1
    sim._spy_capture_pct = 0
    w18b = spawn_spy(sim, row, ctr_t)
    sim.unit_spy_mission[0, w18b] = sim._spy_m_unrest
    sim.unit_spy_turns[0, w18b] = 1
    sim._tick_spies(row)
    assert not bool(sim.unit_alive[0, w18b]) and int(sim.seat_spy_held[0, row, foe]) == held0 + 1
    sim.seat_spy_held[0, row, foe] = held0
    print("  18 split OK — the cell at 100, the grave at 0")

    # -- 19: ACE DRIVER moves the escape and nothing else -------------------
    # CIV6 (Ace Driver): "If caught on a mission, have a much higher chance of
    # escape (+4 levels)" — with the per-level worth pinned huge, the promoted
    # spy always makes it and the bare one never does.
    sim._spy_success_per_level = 1000
    # the Gain Sources clock would lift the MISSION roll too — clear it so
    # the failure is certain and only the escape carries a level
    sim.city_spy_sources[0, foe, theirs, row] = 0
    ace_bit = 1 << pcol("SPY_ESCAPE_LEVEL")
    w19 = spawn_spy(sim, row, ctr_t)
    sim.unit_promos[0, w19] = ace_bit
    sim.unit_spy_mission[0, w19] = sim._spy_m_unrest
    sim.unit_spy_turns[0, w19] = 1
    sim._tick_spies(row)
    assert int(sim.unit_spy_mission[0, w19]) == sim._spy_travelling, "Ace Driver did not lift the escape"
    sim.unit_alive[0, w19] = False
    sim._spy_success_per_level = 0
    sim._spy_missions[sim._spy_m_unrest]["successPct"] = _pf
    sim._spy_capture_pct = _pc
    for _r, _b in zip(sim._spy_escape_routes, _rb):
        _r["basePct"] = _b
    sim._spy_success_per_level = _pl
    for _dt in _dark17:
        sim.district_pillaged[0, _dt] = False
    sim._eff_version += 1
    print("  19 ace OK — the promotion rides the escape roll's own level term")

    # -- 20: FABRICATE SCANDAL — the minor, the gate, the strip -------------
    # CIV6: performed "in a City-State that you are not Suzerain over"; on
    # success "all other players lose a number of Envoys determined by the
    # Spy's level" — MODEL-mapped as base + 1 per effective level.
    s20 = int((sim.citystate_alive[0] & (sim.citystate_center[0] >= 0)).long().argmax())
    assert bool(sim.citystate_alive[0, s20])
    cst = int(sim.citystate_center[0, s20])
    sim.seat_explored[0, row, cst] = True
    w20 = spawn_spy(sim, row, ctr_m)
    sim.unit_tile[0, w20] = cst
    sim._gen_ver += 1
    mm20 = mask_row(sim, row, w20)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert bool(mm20[sim._spy_m_scandal]), "the scandal is dark at a rival minor"
    assert not bool(mm20[sim._spy_m_unrest]), "a major's mission lit at a minor"
    suz0 = int(sim.citystate_suzerain[0, s20])
    sim.citystate_suzerain[0, s20] = row
    mm20 = mask_row(sim, row, w20)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert not bool(mm20[sim._spy_m_scandal]), "the scandal lit at the seat's OWN minor"
    sim.citystate_suzerain[0, s20] = suz0
    env0 = [int(sim.seat_citystate_envoys[0, o, s20]) for o in range(sim.n_majors)]
    for o in range(sim.n_majors):
        sim.seat_citystate_envoys[0, o, s20] = 5
    _ps = sim._spy_missions[sim._spy_m_scandal]["successPct"]
    sim._spy_missions[sim._spy_m_scandal]["successPct"] = 1000
    sim.unit_spy_level[0, w20] = 0
    sim.unit_spy_mission[0, w20] = sim._spy_m_scandal
    sim.unit_spy_turns[0, w20] = 1
    sim._tick_spies(row)
    k20 = sim._spy_scandal_base
    for o in range(sim.n_majors):
        want = 5 if o == row else max(0, 5 - k20)
        assert int(sim.seat_citystate_envoys[0, o, s20]) == want, (o, want)
    assert int(sim.unit_spy_level[0, w20]) == 1, "an offensive success levels the Spy"
    sim._spy_missions[sim._spy_m_scandal]["successPct"] = _ps
    for o in range(sim.n_majors):
        sim.seat_citystate_envoys[0, o, s20] = env0[o]
    sim._cs_resolve_suzerain()
    sim.unit_alive[0, w20] = False
    print("  20 scandal OK — the gate, the strip, and the level it pays")

    # -- 21: no two own spies run the same mission in the same city ---------
    # CIV6 (Espionage): "a single city may contain more than one Spy, but no
    # two Spies may perform the same Mission in the same city."
    wa = spawn_spy(sim, row, ctr_t)
    wb = spawn_spy(sim, row, ctr_t)
    sim.unit_spy_mission[0, wa] = sim._spy_m_unrest
    sim._gen_ver += 1
    mm21 = mask_row(sim, row, wb)[sim._A_SPY_MISSION:sim._A_SPY_MISSION + sim._n_spy_missions]
    assert not bool(mm21[sim._spy_m_unrest]), "the second spy doubled the mission"
    assert bool(mm21[sim._spy_m_sources]), "an unrelated mission went dark with it"
    sim.unit_alive[0, wa] = False
    sim.unit_alive[0, wb] = False
    print("  21 same-mission OK — one mission, one spy, per city")

    print("BATTERY spy OK")


if __name__ == "__main__":
    main()
