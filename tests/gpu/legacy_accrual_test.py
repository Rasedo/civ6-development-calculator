"""THE GOVERNMENT LEGACY ACCRUAL — the GPU half (C-63).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/legacy_accrual_test.py

The TS twin is tests/cpu/culture/legacy-accrual.test.ts.

CIV6 (MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS): a government accrues
+Increment% against its own BonusType every Interval turns it is held. The
install never spells this "legacy" — it spells it ACCUMULATING, which is why
an earlier sourcing pass read `Governments`, `GovernmentBonusNames` and
`BonusRate` and concluded the threshold was not in any XML table.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
ROW = 0

# Governments.xml, MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS arguments.
WANT = {
    "OLIGARCHY": ("combatExperience", 5),
    "MONARCHY": ("envoys", 10),
    "DEMOCRACY": ("districtProjects", 10),
    "FASCISM": ("unitProduction", 10),
    "CLASSICAL_REPUBLIC": ("greatPeople", 15),
    "MERCHANT_REPUBLIC": ("goldPurchases", 15),
    "THEOCRACY": ("faithPurchases", 15),
    "AUTOCRACY": ("wonderConstruction", 20),
    "COMMUNISM": ("overallProduction", 20),
}
# the wire's GOV_BONUS_TYPES order, cpu/data/policies.ts
TYPES = ["wonderConstruction", "combatExperience", "greatPeople", "envoys",
         "faithPurchases", "goldPurchases", "unitProduction",
         "overallProduction", "districtProjects"]


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def gov_index(rules, gid: str) -> int:
    return [g["id"] for g in rules.governments].index(gid)


def test_the_wire(rules, path) -> None:
    sim = build(path)
    n = 0
    for gid, (typ, interval) in WANT.items():
        g = gov_index(rules, gid)
        assert int(sim._gov_bonus_type[g]) == TYPES.index(typ), f"{gid} accumulates the wrong thing"
        assert int(sim._gov_bonus_int[g]) == interval, f"{gid} interval is {int(sim._gov_bonus_int[g])}, install says {interval}"
        assert int(sim._gov_bonus_inc[g]) == 1, f"{gid} increment is not 1"
        n += 1
    assert n == 9, f"nine accumulating rows expected, checked {n}"
    ch = gov_index(rules, "CHIEFDOM")
    assert int(sim._gov_bonus_type[ch]) == -1, "the Chiefdom accumulates something"
    assert int((sim._gov_bonus_type >= 0).sum()) == 9, "more than nine governments accumulate"
    print("  1 the wire OK — nine accumulating rows, the Chiefdom none")


def test_the_clock_is_its_own_plane(rules, path) -> None:
    sim = build(path)
    assert sim.civ_gov_turns.shape == (sim.B, sim.n_majors, sim._ngov), \
        f"the clock is {tuple(sim.civ_gov_turns.shape)}, not [B, seats, governments]"
    assert sim.civ_gov_turns.dtype == torch.long
    from core.simbase import _MUTABLE
    assert "civ_gov_turns" in _MUTABLE, "the clock is not restorable state"
    print("  2 the clock OK — one column per government, per seat, per game")


def test_it_ticks_once_a_turn_in_one_government(rules, path) -> None:
    """The mask and the clock are written on the same line under the same
    condition. `|=` is idempotent, so only the counter can show a gating
    difference — which is the whole reason to assert on it here.

    A bare `sim.step()` founds nothing and reaches no seat tail (both engines
    are decision-free without a record), so this lane DRIVES the world: an
    earlier version of it stepped three turns, saw every clock at zero and
    passed without testing anything.
    """
    from warmup import developed
    turns = 30
    sim = developed(rules, path, turns=turns)
    total = 0
    for row in range(sim.n_majors):
        held = int(sim.civ_gov_held[B0, row])
        clock = sim.civ_gov_turns[B0, row].tolist()
        total += sum(clock)
        assert sum(clock) <= turns,             f"seat {row} banked {sum(clock)} government-turns in {turns} turns"
        for g, t in enumerate(clock):
            if t > 0:
                assert (held >> g) & 1,                     f"seat {row} clocked government {g} that the mask does not hold"
        for g in range(sim._ngov):
            if (held >> g) & 1:
                assert clock[g] > 0,                     f"seat {row} holds government {g} with a clock of zero"
    assert total > 0, "REACHABILITY: no seat accrued a single government-turn"
    print(f"  3 the tick OK — {total} government-turns banked over {turns} driven turns, "
          f"mask and clock agree on every seat")


def test_the_accrual_floors(rules, path) -> None:
    sim = build(path)
    auto = gov_index(rules, "AUTOCRACY")
    olig = gov_index(rules, "OLIGARCHY")
    for turns, want in ((0, 0), (19, 0), (20, 1), (39, 1), (40, 2)):
        sim.civ_gov_turns[B0, ROW, auto] = turns
        got = int(sim._legacy_pct(ROW, auto)[B0])
        assert got == want, f"{turns} turns of Autocracy paid {got}%, expected {want}%"
    sim.civ_gov_turns[B0, ROW, olig] = 20
    got = int(sim._legacy_pct(ROW, olig)[B0])
    assert got == 4, f"20 turns of Oligarchy paid {got}%, expected 4% (interval 5)"
    ch = gov_index(rules, "CHIEFDOM")
    sim.civ_gov_turns[B0, ROW, ch] = 500
    assert int(sim._legacy_pct(ROW, ch)[B0]) == 0, "the Chiefdom paid something"
    print("  4 the accrual OK — floored, per-government interval, Chiefdom zero")


def test_america_halves_the_interval(rules, path) -> None:
    """CIV6 (Founding Fathers): "Earn all Government legacy bonuses in half
    the usual time" — nine BonusRate 100 rows, one per government."""
    sim = build(path)
    rows = sim._legacy_rate_rows
    assert len(rows) == 9, f"nine rate rows expected, wire has {len(rows)}"
    assert {r[2] for r in rows} == {gov_index(rules, g) for g in WANT}, \
        "the rate rows do not name the nine accumulating governments"
    assert all(r[3] == 100 for r in rows), "a rate row is not BonusRate 100"
    civ = rows[0][0]
    assert civ >= 0, "the carrier names no civilization"

    auto = gov_index(rules, "AUTOCRACY")
    # a seat the roster does not name pays the base interval...
    sim.row_civ[B0, ROW] = -1
    sim.row_leader[B0, ROW] = -1
    sim._eff_version += 1
    sim._gen_ver += 1
    sim.civ_gov_turns[B0, ROW, auto] = 10
    assert int(sim._legacy_pct(ROW, auto)[B0]) == 0, "a plain seat earned at America's rate"
    # ...and the carrier earns at twice the rate
    sim.row_civ[B0, ROW] = civ
    sim.row_leader[B0, ROW] = -1
    sim._eff_version += 1
    sim._gen_ver += 1
    assert int(sim._legacy_pct(ROW, auto)[B0]) == 1, "the carrier did not halve the interval"
    sim.civ_gov_turns[B0, ROW, auto] = 20
    assert int(sim._legacy_pct(ROW, auto)[B0]) == 2, "the carrier's second increment is late"
    print("  5 the rate OK — half the interval for the carrier, base for everyone else")


def test_the_rate_is_per_game(rules, path) -> None:
    """A [B] roster mask reduced with `.any()` would pay EVERY game for what
    one game seats — the collapsed-roster-mask class. Two games, one carrier."""
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0]),
                               load_fixture(fixture_paths()[1])],
                              load_rules(), device="cpu", dtype=torch.float64))
    auto = gov_index(rules, "AUTOCRACY")
    civ = sim._legacy_rate_rows[0][0]
    sim.row_civ[0, ROW] = civ
    sim.row_leader[0, ROW] = -1
    sim.row_civ[1, ROW] = -1
    sim.row_leader[1, ROW] = -1
    sim._eff_version += 1
    sim._gen_ver += 1
    sim.civ_gov_turns[:, ROW, auto] = 10
    got = sim._legacy_pct(ROW, auto)
    assert int(got[0]) == 1 and int(got[1]) == 0, \
        f"per-game rate failed: game 0 got {int(got[0])}%, game 1 got {int(got[1])}%"
    print("  6 the batch OK — only the game that seats the carrier earns faster")


def test_the_card_pays_its_bonus_type(rules, path) -> None:
    """C-73: a legacy card is worth its government's ACCUMULATED percentage
    against the one BonusType it names. The nine channels are corroborated
    twice — the install's Increment/Interval, and the community's reported
    percentages, which match those rows exactly."""
    sim = build(path)
    # the wire's index space, shared with cpu/data/policies.ts GOV_BONUS_TYPES
    assert (sim.GB_WONDER, sim.GB_COMBAT_XP, sim.GB_GREAT_PEOPLE, sim.GB_ENVOYS,
            sim.GB_FAITH_BUY, sim.GB_GOLD_BUY, sim.GB_UNIT_PROD,
            sim.GB_OVERALL_PROD, sim.GB_DISTRICT_PROJ) == tuple(range(9)),         "the bonus-type constants do not match the wire's order"
    for gid, want in (("AUTOCRACY", sim.GB_WONDER), ("OLIGARCHY", sim.GB_COMBAT_XP),
                      ("MONARCHY", sim.GB_ENVOYS), ("THEOCRACY", sim.GB_FAITH_BUY),
                      ("MERCHANT_REPUBLIC", sim.GB_GOLD_BUY), ("FASCISM", sim.GB_UNIT_PROD),
                      ("COMMUNISM", sim.GB_OVERALL_PROD), ("DEMOCRACY", sim.GB_DISTRICT_PROJ),
                      ("CLASSICAL_REPUBLIC", sim.GB_GREAT_PEOPLE)):
        g = gov_index(rules, gid)
        assert int(sim._gov_bonus_type[g]) == want, f"{gid} maps to the wrong channel"
    print("  7 the payout OK — nine BonusTypes, each on its own channel")


def test_the_memo_sees_the_clock(rules, path) -> None:
    """The payout is an ACCRUAL, so `_gov_mods` answers differently on a turn
    when none of its other inputs move. A memo that cannot see the clock would
    freeze the bonus at whatever it was when the answer was first computed."""
    sim = build(path)
    _ = sim._gov_mods(ROW)                       # populate
    ent = sim._gov_pol_cache[ROW]
    assert len(ent) == 9, f"the memo entry carries {len(ent)} fields, expected 9 with the clock and the store"
    import torch as _t
    assert _t.equal(ent[6], sim.civ_gov_turns[:, ROW]), "the memo's 7th input is not the clock"
    print("  8 the memo OK — the clock is part of the key")


def test_a_legacy_card_is_reachable(rules, path) -> None:
    """C-75 CLOSED: the slotted cards are the driver's decision, and its
    LEGACY-FIRST style hands the wildcard slots to the unlocked legacy cards
    before anything else — so with every civic researched and every
    government held, a legacy card is slotted, the store accepts it, and the
    effects read it. The greedy style still slots none: that was the gap."""
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
    import ladder
    sim = build(path)
    if not sim._npol or not sim._ngov:
        raise AssertionError("no policy or government catalog to test")
    sim.civ_civics[:, ROW] = True
    sim.civ_gov_held[:, ROW] = (1 << sim._ngov) - 1
    sim._eff_version += 1
    mask = sim.seat_masks(ROW)["policies"]
    nslots = sim._seat_policy_slots(ROW)
    is_leg = sim._pol_legacy >= 0
    assert bool((mask & is_leg.unsqueeze(0)).any()), "no legacy card is even unlocked in the scene"
    greedy = ladder.pick_policies(mask, nslots, sim._pol_kind, legacy=is_leg,
                                  style=torch.full((sim.B,), ladder.CARDS_GREEDY, dtype=torch.long))
    assert not bool((greedy & is_leg.unsqueeze(0)).any()), "the greedy style slotted a legacy card — the gap C-75 recorded is not what it was"
    legacy = ladder.pick_policies(mask, nslots, sim._pol_kind, legacy=is_leg,
                                  style=torch.full((sim.B,), ladder.CARDS_LEGACY, dtype=torch.long))
    n_leg = int((legacy[0] & is_leg).sum())
    assert n_leg > 0, "the legacy-first style slotted no legacy card"
    assert n_leg <= int(nslots[0, 3]), "legacy cards beyond the wildcard slots"
    assert bool(sim._policy_set_ok(ROW, legacy)[0]), "the legacy-first set failed the validator"
    sim.seat_ext[:, ROW] = True
    sim.apply_seat_actions(ROW, policies=legacy)
    sim._seat_record_apply(ROW, torch.ones(sim.B, dtype=torch.bool))
    assert bool((sim._seat_slotted(ROW)[0] & is_leg).any()), "the effects do not see the stored legacy card"
    print(f"  9 the reachability OK — the legacy-first style slots {n_leg} legacy card(s); the greedy style none")


def test_the_purchase_discounts(rules, path) -> None:
    """C-73's last two channels: a stored Merchant Republic legacy takes its
    accrued percent off a GOLD purchase and nothing off faith; Theocracy's the
    other way. `_gold_price` / `_faith_price` are `goldPrice` / `faithPrice`'s
    twins, applied where every purchase is priced and paid."""
    import json as _json
    from core import FIXTURES as _FX
    pols = _json.loads((_FX / "rules.json").read_text(encoding="utf-8"))["policies"]
    for gov_id, turns, purse, other, want in (("MERCHANT_REPUBLIC", 30, "_gold_price", "_faith_price", 98.0),
                                             ("THEOCRACY", 45, "_faith_price", "_gold_price", 97.0)):
        sim = build(path)
        p_idx = next(i for i, p in enumerate(pols) if p["id"] == f"LEGACY_{gov_id}")
        g_idx = int(sim._pol_legacy[p_idx])
        assert g_idx >= 0, f"{gov_id}'s legacy card names no government"
        sim.civ_civics[:, ROW] = True
        sim.civ_gov_held[:, ROW] = (1 << sim._ngov) - 1
        sim.civ_gov_turns[:, ROW] = 0
        sim.civ_gov_turns[:, ROW, g_idx] = turns
        sim._eff_version += 1
        chosen = torch.zeros(sim.B, sim._npol, dtype=torch.bool)
        chosen[:, p_idx] = True
        sim.seat_ext[:, ROW] = True
        sim.apply_seat_actions(ROW, policies=chosen)
        sim._seat_record_apply(ROW, torch.ones(sim.B, dtype=torch.bool))
        assert bool(sim.civ_policies[0, ROW, p_idx]), f"the {gov_id} legacy card was not stored"
        hundred = torch.full((sim.B,), 100.0, dtype=torch.float64)
        got = float(getattr(sim, purse)(ROW, hundred)[0])
        assert abs(got - want) < 1e-9, f"{gov_id} at {turns} turns: 100 -> {got}, want {want}"
        assert float(getattr(sim, other)(ROW, hundred)[0]) == 100.0, f"{gov_id}'s legacy touched the other purse"
        # a [1, N] price row broadcasts per game too
        row2 = getattr(sim, purse)(ROW, torch.tensor([[100.0, 50.0]], dtype=torch.float64))
        assert row2.shape == (sim.B, 2) and abs(float(row2[0, 1]) - want / 2) < 1e-9, row2
    print("  10 the purchase discounts OK — Merchant Republic off gold, Theocracy off faith, at the accrued percent")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_the_clock_is_its_own_plane(rules, path)
    test_it_ticks_once_a_turn_in_one_government(rules, path)
    test_the_accrual_floors(rules, path)
    test_america_halves_the_interval(rules, path)
    test_the_rate_is_per_game(rules, path)
    test_the_card_pays_its_bonus_type(rules, path)
    test_the_memo_sees_the_clock(rules, path)
    test_a_legacy_card_is_reachable(rules, path)
    test_the_purchase_discounts(rules, path)
    print("BATTERY OK legacy_accrual")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
