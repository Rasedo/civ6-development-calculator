"""The war KINDS on the GPU — `tests/cpu/seats/war-kinds.test.ts`'s twin.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    $env:PYTHONUTF8='1'; python tests/gpu/war_kinds_test.py

Sourced from the install (Base DiplomaticActions.xml as Expansion1 updates
it, Expansion1_Leaders.xml's DiplomaticYieldSource modifiers, the LOC text
of each casus belli): every `DIPLOACTION_DECLARE_*_WAR` row carries a civic,
a denouncement age and one requirement column, and three warmonger percents;
Chandragupta declares the Territorial War at Military Training and Robert
the Bruce the Liberation War at Defensive Tactics; the declarer's buffs run
`TurnsActive` 10; Religious alliance 3 gives "Bonus Religious Pressure in
cities with no followers of your ally's Religion" (20).

Every poke builds a BatchSim from a fixture, forces the scene in-memory and
drives the engine's own surfaces: `_war_kinds_allowed` (the validator the
record, the observation's default and the driver's pick all call),
`_declare_war_major` (the one body every declaration runs), the buff
readers the composers call, and `_spread_religious_pressure`. Since the
fixture's civilizations are a DRAW, a scene that assumes a leader SEATS it.
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

SURPRISE, FORMAL, LIBERATION, RECONQUEST, TERRITORIAL, GOLDEN = 0, 1, 3, 4, 7, 8  # WAR_KINDS codes


def lead(sim, row: int, leader: str | None) -> None:
    """Seat a LEADER on a row (or none): `row_leader` is the pair index,
    `row_civ` its civilization."""
    if leader is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        li = sim._pair_leader.index(leader)
        sim.row_leader[0, row] = li
        sim.row_civ[0, row] = sim._pair_civ[li]
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1


def build(rules, path):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    nrow = sim.n_majors
    sim.war[:, :nrow, :nrow] = False
    sim.sync_war()
    sim.war_turns[:, :nrow, :nrow] = 0
    sim.seat_warkind[:, :nrow, :nrow] = 0
    sim.seat_denounced[:, :nrow, :nrow] = -1
    sim.seat_friend_turns[:, :nrow, :nrow] = 0
    sim.seat_ally_turns[:, :nrow, :nrow] = 0
    sim.treaty_turns[:, :nrow, :nrow] = 0
    sim.civ_grievance.zero_()
    return sim


def one(sim) -> torch.Tensor:
    return torch.ones(sim.B, dtype=torch.bool, device=sim.device)


def kind_vec(sim, k: int) -> torch.Tensor:
    return torch.full((sim.B,), k, dtype=torch.long, device=sim.device)


def poke_civic_gate(rules, path):
    """a. The civic gate refuses a kind before its civic; the roster override
    lets the leader declare early; a refused kind refuses the WAR."""
    sim = build(rules, path)
    assert sim.seat_warkind.dtype == torch.int8, "the kind plane is a signed byte"
    assert sim.n_majors >= 3, "the scene wants three majors"
    t = int(sim.turn)
    civic_lib = sim._war_kinds[LIBERATION][0]
    ovr = next(r[6] for r in sim._war_buff_rows if r[2] == LIBERATION)
    assert civic_lib >= 0 and ovr >= 0 and ovr != civic_lib
    # row 1 holds a city founded by row 2, row 0's friend; row 0 denounced row 1 five turns ago
    assert bool(sim.city_alive[0, 1, 0]), "row 1 needs a living first city"
    sim.city_founder[0, 1, 0] = 2
    sim.seat_friend_turns[0, 0, 2] = sim.seat_friend_turns[0, 2, 0] = 10
    sim.seat_denounced[0, 0, 1] = t - int(sim._war_kinds[LIBERATION][1])
    lead(sim, 0, None)
    sim.civ_civics[0, 0, civic_lib] = False
    sim.civ_civics[0, 0, ovr] = True
    allowed = sim._war_kinds_allowed(0, 1)[0]
    assert bool(allowed[SURPRISE]) and bool(allowed[FORMAL]), "the surprise and formal wars are open"
    assert not bool(allowed[LIBERATION]), "a plain seat lacks Diplomatic Service"
    sim._declare_war_major(0, 1, one(sim), kind_vec(sim, LIBERATION))
    assert not bool(sim.war[0, 0, 1]), "a refused kind refuses the war, it never falls back"
    # CIV6 (TRAIT_LIBERATION_WAR_PREREQ_OVERRIDE, CIVIC_DEFENSIVE_TACTICS)
    lead(sim, 0, "ROBERT_THE_BRUCE")
    assert bool(sim._war_kinds_allowed(0, 1)[0, LIBERATION]), "Bruce declares it at Defensive Tactics"
    # ...and the plain seat with the kind's own civic
    lead(sim, 0, None)
    sim.civ_civics[0, 0, civic_lib] = True
    assert bool(sim._war_kinds_allowed(0, 1)[0, LIBERATION])
    # the requirement is the FRIEND's city
    sim.seat_friend_turns[0, 0, 2] = sim.seat_friend_turns[0, 2, 0] = 0
    assert not bool(sim._war_kinds_allowed(0, 1)[0, LIBERATION]), "no friend, no Liberation War"
    sim.seat_friend_turns[0, 0, 2] = sim.seat_friend_turns[0, 2, 0] = 10
    g0 = float(sim.civ_grievance[0, 1, 0])
    sim._declare_war_major(0, 1, one(sim), kind_vec(sim, LIBERATION))
    assert bool(sim.war[0, 0, 1]) and bool(sim.war[0, 1, 0])
    assert int(sim.seat_warkind[0, 0, 1]) == LIBERATION + 1 and int(sim.seat_warkind[0, 1, 0]) == -(LIBERATION + 1), \
        "the declarer's cell is positive, the target's negative"
    assert int(sim._war_kind_code(0, 1)[0]) == LIBERATION and int(sim._war_kind_code(1, 0)[0]) == LIBERATION
    assert bool(sim._war_formal(0, 1)), "every kind but the Surprise war is in the FORMALWAR group"
    assert float(sim.civ_grievance[0, 1, 0]) - g0 == 0, "LIBERATION_WAR WarmongerPercent 0"
    sim._make_peace(0, 1, one(sim))
    assert int(sim.seat_warkind[0, 0, 1]) == 0 and int(sim.seat_warkind[0, 1, 0]) == 0, "peace clears the kind"

    # CIV6 (TRAIT_TERRITORIAL_WAR_PREREQ_OVERRIDE, CIVIC_MILITARY_TRAINING):
    # the civic gate alone, the adjacency condition aside
    civic_ter = sim._war_kinds[TERRITORIAL][0]
    ovr_t = next(r[6] for r in sim._war_buff_rows if r[2] == TERRITORIAL)
    sim.civ_civics[0, 0, civic_ter] = False
    sim.civ_civics[0, 0, ovr_t] = True
    lead(sim, 0, None)
    assert not bool(sim._war_kind_civic_ok(0, TERRITORIAL)[0])
    lead(sim, 0, "CHANDRAGUPTA")
    assert bool(sim._war_kind_civic_ok(0, TERRITORIAL)[0]), "Chandragupta declares it at Military Training"
    print("  a civic gate + override OK (refused kind refuses the war; Bruce/Chandragupta early)")


def poke_default_kind(rules, path):
    """b. The denouncement may stand in EITHER direction; the default kind is
    the cheapest casus belli held; a record without a kind takes it."""
    sim = build(rules, path)
    t = int(sim.turn)
    lead(sim, 0, None)
    assert int(sim._default_war_kind(sim._war_kinds_allowed(0, 1))[0]) == SURPRISE
    # CIV6 (Formal War): "a player that Denounced you or that you have Denounced"
    sim.seat_denounced[0, 1, 0] = t - sim._formal_war_min
    assert bool(sim._war_kinds_allowed(0, 1)[0, FORMAL])
    assert int(sim._default_war_kind(sim._war_kinds_allowed(0, 1))[0]) == FORMAL
    # the To Arms! dedicant's war is a quarter of the formal price
    sim.civ_age[0, 0] = 2
    sim.ded_picks[0, 0, 0] = sim._ded_to_arms
    assert int(sim._default_war_kind(sim._war_kinds_allowed(0, 1))[0]) == GOLDEN
    # a city of row 0's own held by row 1 opens the free Reconquest war
    sim.city_founder[0, 1, 0] = 0
    sim.civ_civics[0, 0, sim._war_kinds[RECONQUEST][0]] = True
    assert int(sim._default_war_kind(sim._war_kinds_allowed(0, 1))[0]) == RECONQUEST
    # the driver's pick is the validator's own default
    col = torch.zeros(sim.B, dtype=torch.long, device=sim.device)  # column 0 of row 0 = row 1
    assert sim.war_targets(0)[0] == 1
    assert int(sim._war_kind_pick(0, col)[0]) == RECONQUEST
    g0 = float(sim.civ_grievance[0, 1, 0])
    sim._declare_war_major(0, 1, one(sim))  # no kind named: the default
    assert int(sim._war_kind_code(0, 1)[0]) == RECONQUEST
    assert float(sim.civ_grievance[0, 1, 0]) - g0 == 0, "RECONQUEST_WAR WarmongerPercent 0"
    print("  b default kind OK (either-direction denouncement; cheapest casus belli; the pick)")


def poke_buff_clock(rules, path):
    """c. The 10-turn buff pays on the turn of the declaration and not on the
    eleventh, to the DECLARER alone, through the composers' readers."""
    sim = build(rules, path)
    t = int(sim.turn)
    lead(sim, 0, "ROBERT_THE_BRUCE")
    sim.city_founder[0, 1, 0] = 2
    sim.seat_friend_turns[0, 0, 2] = sim.seat_friend_turns[0, 2, 0] = 10
    sim.seat_denounced[0, 0, 1] = t - int(sim._war_kinds[LIBERATION][1])
    sim.civ_civics[0, 0, next(r[6] for r in sim._war_buff_rows if r[2] == LIBERATION)] = True
    assert int(sim._war_buff_prod_pct(0)[0]) == 0
    seats = torch.tensor([[0, 1]], dtype=torch.long)
    sim._declare_war_major(0, 1, one(sim), kind_vec(sim, LIBERATION))
    assert bool(sim._war_buff_live(0, LIBERATION)[0])
    assert not bool(sim._war_buff_live(1, LIBERATION)[0]), "the TARGET earns nothing"
    # CIV6 (TRAIT_LIBERATION_WAR_PRODUCTION Amount 100, TRAIT_LIBERATION_WAR_MOVEMENT Amount 2)
    assert int(sim._war_buff_prod_pct(0)[0]) == 100
    assert sim._seat_war_buff(seats, 2).tolist() == [[2, 0]]
    assert sim._seat_war_buff(seats, 1).tolist() == [[0, 0]], "Bannockburn carries no strength"
    # the tenth turn still pays, the eleventh does not
    sim.war_turns[0, 0, 1] = sim.war_turns[0, 1, 0] = sim._war_buff_turns - 1
    assert int(sim._war_buff_prod_pct(0)[0]) == 100
    sim.war_turns[0, 0, 1] = sim.war_turns[0, 1, 0] = sim._war_buff_turns
    assert int(sim._war_buff_prod_pct(0)[0]) == 0
    assert sim._seat_war_buff(seats, 2).tolist() == [[0, 0]]

    # CIV6 (TRAIT_TERRITORIAL_WAR_COMBAT Amount 5, ReligiousOnly false): the
    # strength lands in `_roster_cs` for a combat unit and nowhere for a civilian
    sim2 = build(rules, path)
    lead(sim2, 0, "CHANDRAGUPTA")
    warrior = next(i for i, u in enumerate(sim2.rules.units) if u["id"] == "WARRIOR")
    settler = sim2._settler_idx
    utype = torch.tensor([[warrior, settler, warrior]], dtype=torch.long)
    seat3 = torch.tensor([[0, 0, 1]], dtype=torch.long)
    tile = sim2.city_center[0, 0, 0].reshape(1, 1).expand(1, 3).clone()
    foe = torch.tensor([[1, 1, 0]], dtype=torch.long)
    hp = torch.full((1, 3), 100, dtype=torch.long)
    before = sim2._roster_cs(seat3, utype, tile, foe, hp, False)
    sim2.war[0, 0, 1] = sim2.war[0, 1, 0] = True
    sim2._stamp_war_kind(0, 1, kind_vec(sim2, TERRITORIAL), one(sim2))
    after = sim2._roster_cs(seat3, utype, tile, foe, hp, False)
    assert (after - before).tolist() == [[5, 0, 0]], f"+5 on the declarer's combat unit only, got {(after - before).tolist()}"
    assert sim2._seat_war_buff(seat3, 2).tolist() == [[2, 2, 0]], "+2 Movement on every unit of the declarer"
    sim2.war_turns[0, 0, 1] = sim2.war_turns[0, 1, 0] = sim2._war_buff_turns
    assert (sim2._roster_cs(seat3, utype, tile, foe, hp, False) - before).tolist() == [[0, 0, 0]]
    print("  c buff clock OK (turn 1 pays, turn 11 does not; declarer only; production/moves/strength)")


def poke_alliance_pressure(rules, path):
    """d. Religious alliance 3: the holder's religion presses 20% harder into
    a city where the ally's religion has no pressure at all."""
    sim = build(rules, path)
    assert bool(sim.city_alive[0, 2, 0]) and bool(sim.city_alive[0, 1, 0])
    # row 2's capital is the Holy City of row 0's religion (a captured Holy
    # City is legal) and presses ITSELF at x4; row 1 founded a religion too
    sim.holy_tile[0, 0] = sim.city_center[0, 2, 0]
    sim.holy_tile[0, 1] = sim.city_center[0, 1, 0]
    sim.city_followed[0, 2, 0] = 0
    sim.city_followed[0, 1, 0] = 1
    sim.city_pressure.zero_()
    sim._pressure_per_turn = 5  # one scene knob for both arms, so the floor shows
    snap = sim.snapshot()
    sim._spread_religious_pressure()
    plain = int(sim.city_pressure[0, 2, 0, 0])
    assert plain > 0, "the Holy City presses itself"

    sim.restore(snap)
    sim.seat_alliance_type[0, 0, 1] = sim.seat_alliance_type[0, 1, 0] = 4  # RELIGIOUS
    sim.seat_ally_turns[0, 0, 1] = sim.seat_ally_turns[0, 1, 0] = 10
    sim.seat_alliance_pts[0, 0, 1] = sim.seat_alliance_pts[0, 1, 0] = sim._al_l3_qp
    assert int(sim._allied_type(0, 4, 3)[0, 1]) == 1
    sim._spread_religious_pressure()
    boosted = int(sim.city_pressure[0, 2, 0, 0])
    want = plain * (100 + sim._al_rel3_pressure_pct) // 100
    assert boosted == want and boosted > plain, f"+20% floored: want {want}, got {boosted} (plain {plain})"

    # ...and not where the ally's religion already has pressure
    sim.restore(snap)
    sim.seat_alliance_type[0, 0, 1] = sim.seat_alliance_type[0, 1, 0] = 4
    sim.seat_ally_turns[0, 0, 1] = sim.seat_ally_turns[0, 1, 0] = 10
    sim.seat_alliance_pts[0, 0, 1] = sim.seat_alliance_pts[0, 1, 0] = sim._al_l3_qp
    sim.city_pressure[0, 2, 0, 1] = 1
    sim._spread_religious_pressure()
    assert int(sim.city_pressure[0, 2, 0, 0]) == plain, "a follower of the ally's religion ends the bonus"
    print(f"  d alliance pressure OK ({plain} -> {boosted} with the level-3 Religious ally)")


def poke_third_party(rules, path):
    """CIV6 (DIPLOACTION_THIRD_PARTY_WAR): "Join another player's war against
    a target civilization." InitiatorPrereqCivic CIVIC_FOREIGN_TRADE, NO
    denouncement column, 100 / 100 / 300. The other player is read as an ALLY
    (see `WarCondition` in warKinds.ts) — one predicate shared with Enkidu's
    discount, so the two cannot drift."""
    sim = build(rules, path)
    TP = len(sim._war_kinds) - 1
    civic, dturns, cond, p0, p1, p2 = sim._war_kinds[TP]
    assert (dturns, p0, p1, p2) == (-1, 100, 100, 300), sim._war_kinds[TP]
    assert civic >= 0, "the third-party row lost its civic gate"

    sim.civ_civics[:] = False
    sim.seat_ally_turns[:] = 0
    sim.war[:] = False
    assert not bool(sim._war_kinds_allowed(0, 1)[0, TP]), "open with nothing held"

    sim.civ_civics[:, 0, civic] = True
    assert not bool(sim._war_kinds_allowed(0, 1)[0, TP]), "the civic alone opened it"

    sim.seat_ally_turns[:, 0, 2] = 20
    sim.seat_ally_turns[:, 2, 0] = 20
    assert not bool(sim._war_kinds_allowed(0, 1)[0, TP]), "an ally at PEACE opened it"

    sim.war[:, 2, 1] = True
    sim.war[:, 1, 2] = True
    assert bool(sim._war_kinds_allowed(0, 1)[0, TP]), "the ally's war did not open it"
    # ...and it asks for no denouncement, which is the whole point: a FORMAL
    # war at the same price is shut here.
    assert not bool(sim._war_kinds_allowed(0, 1)[0, FORMAL]), "FORMAL opened without a denouncement"
    # the condition is ONE predicate, shared with Enkidu's discount
    assert bool(sim._ally_at_war_with(0, 1)[0]), "the shared predicate disagrees"
    sim.civ_civics[:, 0, civic] = False
    assert not bool(sim._war_kinds_allowed(0, 1)[0, TP]), "it survived losing its civic"
    print(f"  e third-party war OK (row {TP}, civic {civic}, no denouncement, {p0}/{p1}/{p2})")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    poke_civic_gate(rules, path)
    poke_default_kind(rules, path)
    poke_buff_clock(rules, path)
    poke_alliance_pressure(rules, path)
    poke_third_party(rules, path)
    print("BATTERY OK war_kinds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
