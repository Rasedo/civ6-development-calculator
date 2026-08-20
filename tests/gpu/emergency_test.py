"""EMERGENCIES — the trigger, the special session, the forced war, the rewards.

    python tests/gpu/emergency_test.py

CIV 6 (Gathering Storm, wiki "Emergency (Civ6)"): an Emergency is a SPECIAL
SESSION of the World Congress. A sponsor among the affected pays 30 Diplomatic
Favor, "as long as the previous session - Regular or Special - took place 15
turns or prior", and "the Special Session occurs after the next turn". Passing
it puts every member at war with the target — an "effort of the international
community", so no Grievances — for 30 turns. Members who liberate the
contested city split 100 Favor each and keep a permanent bonus; a target that
survives to the deadline takes 200 Favor and a permanent bonus of its own.

The gate reaches the TRIGGER (a conquest raises the record) but never the
ladder above it: the sponsorship, the vote, the war, both deadlines and every
reward magnitude are this lane's bar.
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
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    sim = settle_all(BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    # The era gate is the Regular Session's business and the driven gate walks
    # it; open it here and pin the EMERGENCY.
    sim._congress_min_era = -1
    assert sim.n_majors >= 2, "an emergency needs a target and a member"
    for row in range(sim.n_majors):
        assert bool(sim.city_alive[0, row].any()), f"seat {row} holds no city"
    assert sim._emg_slots >= 2, "the slot table is too small to test its limit"
    sim.emg_kind[:] = -1
    sim.emg_target[:] = -1
    sim.emg_city[:] = -1
    sim.emg_phase[:] = -1
    sim.emg_act[:] = -1
    sim.emg_affected[:] = False
    sim.emg_member[:] = False
    sim.last_session_turn[:] = -1
    sim.war[:] = False
    return sim


def blank_votes(sim) -> torch.Tensor:
    return torch.full_like(sim.civ_congress_vote, -1)


def one(x) -> int:
    return int(x[0])


def raise_on(sim, city_id: int, target: int = 0, sponsor: int = 1, kind: int = -1) -> None:
    """The conquest twin: `target` holds `city_id`, `sponsor` is affected."""
    if kind < 0:
        kind = sim._emg_at["MILITARY"]
    aff = torch.zeros(sim.B, sim.n_majors, dtype=torch.bool)
    aff[:, sponsor] = True
    sim._raise_emergency(kind, torch.full((sim.B,), target, dtype=torch.long),
                         torch.full((sim.B,), city_id, dtype=torch.long), aff,
                         torch.ones(sim.B, dtype=torch.bool))


def main() -> None:
    sim = build()
    tgt, mem = 0, 1
    city = one(sim.city_id[:, tgt, 0])
    mil = sim._emg_at["MILITARY"]

    # --- 1. the record -----------------------------------------------------
    raise_on(sim, city)
    assert one(sim.emg_kind[:, 0]) == mil, "the outrage went unrecorded"
    assert one(sim.emg_target[:, 0]) == tgt
    assert one(sim.emg_city[:, 0]) == city
    assert one(sim.emg_phase[:, 0]) == 0, "a fresh record is not pending"
    assert one(sim.emg_act[:, 0]) == -1
    assert bool(sim.emg_affected[0, 0, mem]) and not bool(sim.emg_member[0, 0].any())
    raise_on(sim, city)
    assert one(sim.emg_kind[:, 1]) == -1, "the same outrage was recorded twice"
    raise_on(sim, city + 1)
    assert one(sim.emg_kind[:, 1]) == mil, "a second outrage found no slot"
    for extra in range(2, sim._emg_slots + 2):
        raise_on(sim, city + extra)
    assert int((sim.emg_kind[0] >= 0).sum()) == sim._emg_slots, "the slot table is not finite"
    sim._emg_clear(1, torch.ones(sim.B, dtype=torch.bool))
    for k in range(2, sim._emg_slots):
        sim._emg_clear(k, torch.ones(sim.B, dtype=torch.bool))
    assert int((sim.emg_kind[0] >= 0).sum()) == 1
    aff = torch.zeros(sim.B, sim.n_majors, dtype=torch.bool)
    sim._raise_emergency(mil, torch.zeros(sim.B, dtype=torch.long),
                         torch.full((sim.B,), city + 9, dtype=torch.long), aff,
                         torch.ones(sim.B, dtype=torch.bool))
    assert int((sim.emg_kind[0] >= 0).sum()) == 1, "a record with nobody affected was kept"
    print("  the trigger records once per outrage, needs someone affected, and the table is finite")

    # --- 2. the sponsorship, and the 15-turn quiet -------------------------
    votes = blank_votes(sim)
    sim.turn = 40
    sim.civ_diplo_favor[:, mem] = sim._special_cost - 1
    sim._special_sessions(votes)
    assert one(sim.emg_phase[:, 0]) == 0, "a seat that cannot pay called a session"

    sim.civ_diplo_favor[:, mem] = sim._special_cost + 5
    sim.last_session_turn[:] = 40 - (sim._special_gap - 1)
    sim._special_sessions(votes)
    assert one(sim.emg_phase[:, 0]) == 0, "a session inside the quiet window was called"
    assert float(sim.civ_diplo_favor[0, mem]) == sim._special_cost + 5, "a blocked call still charged"

    sim.last_session_turn[:] = 40 - sim._special_gap
    sim._special_sessions(votes)
    assert one(sim.emg_phase[:, 0]) == 1, "the quiet gap did not unblock the call"
    assert one(sim.emg_act[:, 0]) == 41, "the session did not sit the turn AFTER"
    assert float(sim.civ_diplo_favor[0, mem]) == 5, "the sponsor did not pay the 30"
    assert bool(sim._special_upcoming(41)[0]) and not bool(sim._special_upcoming(40)[0])
    print("  a sponsor pays the favor, the quiet window gates the call, the session sits next turn")

    # --- 3. the session, the members, the war ------------------------------
    sim.turn = 41
    sim._special_sessions(votes)
    assert one(sim.emg_phase[:, 0]) == 2, "the session did not pass on a tie"
    assert one(sim.emg_act[:, 0]) == 41 + sim._emg_rows[mil]["turns"], "the deadline is wrong"
    assert bool(sim.emg_member[0, 0, mem]), "the yes voter is not a member"
    assert not bool(sim.emg_member[0, 0, tgt]), "the target joined its own emergency"
    assert bool(sim.war[0, mem, tgt]) and bool(sim.war[0, tgt, mem]), "no war was forced"
    assert one(sim.last_session_turn) == 41, "the special session did not stamp the clock"
    assert int(sim.treaty_turns[0, mem, tgt]) == 0, "a treaty survived the emergency"
    print("  the session passes on a tie, the members go to war, the target never joins")

    # --- 4. while it runs ---------------------------------------------------
    a = torch.full((sim.B,), mem, dtype=torch.long)
    d = torch.full((sim.B,), tgt, dtype=torch.long)
    assert float(sim._emergency_pair_cs(a, d)[0]) == sim._emg_member_cs, "the member CS never landed"
    assert float(sim._emergency_pair_cs(d, a)[0]) == 0.0, "the target got the member's bonus"
    tg = sim._emg_member_targets(mem)
    assert bool(tg[0, tgt]) and not bool(tg[0, mem])

    slot = int((sim.major_unit_seat[0] == mem).nonzero()[0])
    ground = one(sim.tile_seat[:, sim.major_unit_tile[0, slot].clamp(min=0)])
    sim.tile_seat[0, sim.major_unit_tile[0, slot].clamp(min=0)] = tgt
    mp = sim._emergency_mp("major")
    assert int(mp[0, slot]) == sim._emg_member_mp, "a member gained no MP on the target's ground"
    sim.tile_seat[0, sim.major_unit_tile[0, slot].clamp(min=0)] = ground
    assert int(sim._emergency_mp("major")[0, slot]) == 0, "the MP followed the unit off the ground"

    loy = sim._emergency_loyalty(tgt)
    assert float(loy[0, 0]) == sim._emg_target_loyalty, "the target city gained no loyalty"
    assert float(sim._emergency_loyalty(mem).sum()) == 0.0, "a member's city gained the target's loyalty"
    print("  a member hits harder and moves faster on the target's ground; the target city digs in")

    # --- 5. the goal: the members take the city -----------------------------
    before = float(sim.civ_diplo_favor[0, mem])
    sim.city_alive[0, tgt, 0] = False
    sim.turn = 45
    sim._resolve_emergencies()
    assert one(sim.emg_kind[:, 0]) == -1, "the resolved record was not cleared"
    assert float(sim.civ_diplo_favor[0, mem]) == before + sim._emg_member_favor, "the members went unpaid"
    assert int(sim.civ_emg_heal[0, mem, tgt]) == 1, "the permanent heal was not banked"
    assert int(sim.civ_emg_strike[0, tgt, mem]) == 0, "the loser banked the winner's reward"
    here = torch.full((sim.B, 1), tgt, dtype=torch.long)
    seat = torch.full((sim.B, 1), mem, dtype=torch.long)
    assert int(sim._emergency_heal_mp("major", seat, here)[0, 0]) == sim._emg_member_heal
    assert int(sim._emergency_heal_mp("major", seat, here * 0 + mem)[0, 0]) == 0
    print("  liberating the city pays every member alike, and its bonus is permanent")

    # --- 6. the deadline: the target survives -------------------------------
    sim.city_alive[0, tgt, 0] = True
    sim.last_session_turn[:] = -1
    raise_on(sim, city)
    sim.turn = 60
    sim.civ_diplo_favor[:, mem] = 500.0
    sim._special_sessions(blank_votes(sim))
    sim.turn = 61
    sim._special_sessions(blank_votes(sim))
    assert one(sim.emg_phase[:, 0]) == 2, "the second emergency never ran"
    dead = one(sim.emg_act[:, 0])
    before_t = float(sim.civ_diplo_favor[0, tgt])
    sim.turn = dead - 1
    sim._resolve_emergencies()
    assert one(sim.emg_phase[:, 0]) == 2, "the emergency ended a turn early"
    sim.turn = dead
    sim._resolve_emergencies()
    assert one(sim.emg_kind[:, 0]) == -1, "the deadline did not end it"
    assert float(sim.civ_diplo_favor[0, tgt]) == before_t + sim._emg_target_favor, "the target went unpaid"
    assert int(sim.civ_emg_strike[0, tgt, mem]) == 1, "the permanent City Strike was not banked"
    assert float(sim._emergency_strike_cs(tgt, mem)[0]) == sim._emg_strike_cs
    assert float(sim._emergency_strike_cs(mem, tgt)[0]) == 0.0, "the member banked the target's reward"
    print("  surviving to the deadline pays the target, and its bonus is permanent too")

    # --- 7. voted down ------------------------------------------------------
    sim.last_session_turn[:] = -1
    sim.civ_diplo_favor[:, mem] = 500.0
    sim.war[:] = False
    raise_on(sim, city)
    sim.turn = 100
    sim._special_sessions(blank_votes(sim))
    sim.turn = 101
    down = blank_votes(sim)
    down[:, tgt, sim._special_slot, 0] = 1        # against
    down[:, tgt, sim._special_slot, 2] = 3        # and buying the weight to carry it
    sim.civ_diplo_favor[:, tgt] = 60.0
    sim._special_sessions(down)
    assert one(sim.emg_kind[:, 0]) == -1, "a voted-down emergency survived"
    assert not bool(sim.war[0, mem, tgt]), "a voted-down emergency still forced a war"
    assert float(sim.civ_diplo_favor[0, tgt]) == 0.0, "the winning side was refunded"
    print("  a target that buys the votes kills the emergency and keeps what it spent")

    # --- 8. the city-state rewards, and the observation order ---------------
    row = mem
    sim.civ_emg_envoy_gold[:, row] = 2
    envoys = int(sim.seat_citystate_envoys[0, row, : sim.S].sum()) if sim.S else 0
    assert float(sim._emergency_envoy_gold(row)[0]) == 2 * envoys * sim._emg_envoy_gold
    sim.civ_emg_route_gold[:, row] = 3
    assert float(sim._emergency_cs_route_gold(row)[0]) == 3 * sim._emg_cs_route_gold

    sim.emg_kind[:] = -1
    sim.emg_target[:] = -1
    sim.emg_city[:] = -1
    sim.emg_phase[:] = -1
    raise_on(sim, city + 5, target=tgt)
    raise_on(sim, city, target=tgt)
    kind, phase, is_me, member = sim._emergency_view(tgt)
    assert one(kind) == mil + 1 and one(phase) == 1, "the view does not render a pending record"
    assert one(is_me) == 1, "the target does not see itself"
    assert one(member) == 0
    # the LOWEST (kind, target, city) wins, whichever slot it landed in
    assert one(sim.emg_city[:, 0]) == city + 5 and one(sim.emg_city[:, 1]) == city
    _, _, is_me2, _ = sim._emergency_view(mem)
    assert one(is_me2) == 0, "a bystander reads itself as the target"
    print("  the envoy and minor-leg rewards read their counters; the view keys on the record")

    print("EMERGENCY OK — the trigger, the sponsorship, the quiet window, the session, the war, "
          "both outcomes, the permanent rewards and the observation key")


if __name__ == "__main__":
    main()
