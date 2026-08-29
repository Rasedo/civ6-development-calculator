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
    base = sim._spy_mission_turns_base
    assert int(sim._spy_mission_turns(row, sim._spy_m_unrest)[0]) == base
    sim.civ_age[0, row] = 2
    sim.ded_picks[0, row, 0] = sim._ded_bodyguard
    cut = max(1, (base * sim._bodyguard_num) // sim._bodyguard_den)
    assert int(sim._spy_mission_turns(row, sim._spy_m_unrest)[0]) == cut
    assert int(sim._spy_mission_turns(row, sim._spy_m_counterspy)[0]) == base, \
        "a defensive post keeps the full clock"
    sim.civ_age[0, row] = 0
    sim.ded_picks[0, row, 0] = -1

    # -- 8: counter-espionage stands its post -------------------------------
    sim.unit_tile[0, v] = ctr_m
    sim._gen_ver += 1
    order(sim, row, v, sim._A_SPY_MISSION + sim._spy_m_counterspy)
    assert int(sim.unit_spy_mission[0, v]) == sim._spy_m_counterspy
    for _ in range(base):
        sim._tick_spies(row)
    assert int(sim.unit_spy_mission[0, v]) == sim._spy_m_counterspy, "it re-arms"
    assert int(sim.unit_spy_turns[0, v]) == base

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

    print("BATTERY spy OK")


if __name__ == "__main__":
    main()
