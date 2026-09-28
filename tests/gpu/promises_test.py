"""The PROMISES on the GPU — `tests/cpu/seats/promises.test.ts`'s twin.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    $env:PYTHONUTF8='1'; python tests/gpu/promises_test.py

Sourced from the install (`DiplomaticActions_XP2`, the four
`DIPLOACTION_KEEP_PROMISE_*` rows): FavorCost 30, GrievancesForRefusal 25,
GrievancesPerIncursion 25; "All Deals, Demands, and Promises last for 30
turns"; a broken promise generates 100 Grievances; the War of Retribution
(`RequiresBrokenPromise`) is open against "a player who has broken a promise
to you within the past 30 turns".

Every poke builds a BatchSim from a fixture, clears the diplomatic table and
drives the engine's own surfaces: `apply_geo` + `_geo_agreements` (the
record's applier), `_promise_incursion` (the one body every incursion site
calls), `_deal_phase` (the clock) and `_war_kinds_allowed` (the casus belli).
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def every_seat_diplomacy(sim) -> None:
    """Every major's diplomacy in turn order, each at its own block's tail
    (`_seat_turn`), then the phase's end: the keeps are for this turn alone."""
    for r in range(sim.n_majors):
        sim._geo_agreements(r)
    sim._driven_geo["keep_promise"].clear()

SPY, CONVERT, DIG, SETTLE = 0, 1, 2, 3
RETRIBUTION = 9  # WAR_KINDS code

_BASE: dict = {}


def build(rules, path):
    key = str(path)
    if key not in _BASE:
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
        sim.seat_promise.zero_()
        sim.seat_promise_broken.zero_()
        sim.civ_diplo_favor[:, :nrow] = 100
        _BASE[key] = (sim, sim.snapshot())
    sim, snap = _BASE[key]
    sim.restore(snap)
    return sim


def mask(sim, cells) -> torch.Tensor:
    m = torch.zeros(sim.B, sim.n_majors, len(sim._promises), dtype=torch.bool, device=sim.device)
    for j, k in cells:
        m[:, j, k] = True
    return m


def settle(sim, asks: dict, keeps: dict) -> None:
    """One turn at the table through the record's applier."""
    for row, cells in asks.items():
        sim.apply_geo(row, ask_promise=mask(sim, cells))
    for row, cells in keeps.items():
        sim.apply_geo(row, keep_promise=mask(sim, cells))
    every_seat_diplomacy(sim)


def n1(sim, v: int = 1) -> torch.Tensor:
    return torch.full((sim.B,), v, dtype=torch.long, device=sim.device)


def poke_rows(rules, path):
    """a. The install rows reach the engine."""
    sim = build(rules, path)
    assert sim._promises == [(30, 25, 25)] * 4, sim._promises
    # the promise's 30 turns online through GameSpeed_Durations ONLINE_HALF;
    # the broken window's 30 unscaled
    assert (sim._promise_turns, sim._promise_broken_griev, sim._retribution_turns) == (20, 100, 30)
    assert (sim._promise_broken_mult, sim._settle_promise_reach) == (200, 3)
    assert sim.n_majors >= 3, "the scene wants three majors"
    print("  a rows OK")


def poke_ask_keep_refuse(rules, path):
    """b. A kept promise costs the asker its favor and runs its term (30 turns
    at Standard speed, 20 online); a
    refusal refunds it and earns GrievancesForRefusal; an ask the asker
    cannot pay, one already standing, and one at war are refused outright."""
    sim = build(rules, path)
    settle(sim, {0: [(1, SPY)], 2: [(1, DIG)]}, {1: [(0, SPY)]})
    assert float(sim.civ_diplo_favor[0, 0]) == 70.0, "the asker pays FavorCost"
    assert int(sim.seat_promise[0, 0, 1, SPY]) == sim._promise_turns, "the kept promise runs its term"
    assert int(sim.seat_promise[0, 1, 0, SPY]) == 0, "the ledger is directed"
    assert int(sim.civ_grievance[0, 0, 1]) == 0
    assert float(sim.civ_diplo_favor[0, 2]) == 100.0, "a refusal refunds the favor"
    assert int(sim.seat_promise[0, 2, 1, DIG]) == -sim._promise_turns, "the refusal stands its term"
    assert int(sim.civ_grievance[0, 2, 1]) == 25 and int(sim.civ_grievance[0, 1, 2]) == -25
    # standing already: a second ask of the kind is refused before it is paid
    settle(sim, {0: [(1, SPY)]}, {1: [(0, SPY)]})
    assert float(sim.civ_diplo_favor[0, 0]) == 70.0 and int(sim.seat_promise[0, 0, 1, SPY]) == sim._promise_turns
    # an empty purse
    sim.civ_diplo_favor[0, 0] = 29
    settle(sim, {0: [(2, CONVERT)]}, {2: [(0, CONVERT)]})
    assert int(sim.seat_promise[0, 0, 2, CONVERT]) == 0, "an ask the asker cannot pay"
    # at war
    sim.civ_diplo_favor[0, 0] = 100
    sim.war[0, 0, 2] = sim.war[0, 2, 0] = True
    settle(sim, {0: [(2, CONVERT)]}, {2: [(0, CONVERT)]})
    assert int(sim.seat_promise[0, 0, 2, CONVERT]) == 0, "an ask made at war"
    # a keep with no ask standing makes nothing
    sim.war[0, 0, 2] = sim.war[0, 2, 0] = False
    settle(sim, {}, {2: [(0, CONVERT)]})
    assert int(sim.seat_promise[0, 0, 2, CONVERT]) == 0, "a keep with no ask"
    print("  b ask / keep / refuse OK")


def poke_incursion(rules, path):
    """c. A refusal standing earns GrievancesPerIncursion per incursion; a
    kept promise BREAKS — 100 Grievances, the promise ends, the War of
    Retribution opens for the asker only; the promise then stands broken,
    unaskable, each further incursion at 25 x 200%."""
    sim = build(rules, path)
    settle(sim, {0: [(1, SPY)], 2: [(1, CONVERT)]}, {1: [(0, SPY)]})
    sim._promise_incursion(2, 1, CONVERT, n1(sim, 2))
    assert int(sim.civ_grievance[0, 2, 1]) == 25 + 50, "refused and continued: 25 each"
    assert not bool(sim.seat_promise_broken[0, 2, 1].any())
    sim._promise_incursion(0, 1, DIG, n1(sim))
    assert int(sim.civ_grievance[0, 0, 1]) == 0, "nothing standing, nothing owed"
    assert not bool(sim._war_condition(0, 1, 8)[0])
    sim._promise_incursion(0, 1, SPY, n1(sim, 3))
    assert int(sim.seat_promise[0, 0, 1, SPY]) == 0, "a broken promise ends"
    assert int(sim.civ_grievance[0, 0, 1]) == 100, "Promise Broken: 100"
    assert sim.seat_promise_broken[0, 0, 1].tolist() == [sim._retribution_turns, 0, 0, 0], \
        "the break's window is its kind's"
    assert bool(sim._war_condition(0, 1, 8)[0]) and not bool(sim._war_condition(1, 0, 8)[0])
    # the kind still asks its civic and a five-turn denouncement
    civic = sim._war_kinds[RETRIBUTION][0]
    sim.civ_civics[0, 0, civic] = True
    assert not bool(sim._war_kinds_allowed(0, 1)[0, RETRIBUTION]), "no denouncement yet"
    sim.seat_denounced[0, 0, 1] = int(sim.turn) - 5
    assert bool(sim._war_kinds_allowed(0, 1)[0, RETRIBUTION]), "the War of Retribution is open"
    assert not bool(sim._promise_askable(0, 1, SPY)[0]), "a broken promise cannot be asked again"
    sim._promise_incursion(0, 1, SPY, n1(sim, 2))
    assert int(sim.civ_grievance[0, 0, 1]) == 100 + 2 * 50, "broken and continued: 50 each"
    # another kind between the pair is untouched by the break
    settle(sim, {0: [(1, DIG)]}, {})
    sim._promise_incursion(0, 1, DIG, n1(sim))
    assert int(sim.civ_grievance[0, 0, 1]) == 100 + 2 * 50 + 25 + 25
    print("  c incursion / break / retribution OK")


def poke_clock(rules, path):
    """d. The promises, the refusals and the window run toward 0; the broken
    window outlasts the promise's term."""
    sim = build(rules, path)
    settle(sim, {0: [(1, SPY), (2, CONVERT)]}, {1: [(0, SPY)]})
    term = sim._promise_turns
    window = sim._retribution_turns
    assert window > term
    assert int(sim.seat_promise[0, 0, 2, CONVERT]) == -term, "each ask of a record is settled on its own"
    sim._promise_incursion(0, 1, SPY, n1(sim))
    settle(sim, {0: [(1, DIG)]}, {1: [(0, DIG)]})
    sim._deal_phase()
    assert int(sim.seat_promise[0, 0, 1, DIG]) == term - 1
    assert int(sim.seat_promise[0, 0, 2, CONVERT]) == -(term - 1)
    assert int(sim.seat_promise_broken[0, 0, 1, SPY]) == window - 1
    for _ in range(term - 1):
        sim._deal_phase()
    assert not bool(sim.seat_promise.any())
    assert int(sim.seat_promise_broken[0, 0, 1, SPY]) == window - term
    assert bool(sim._war_condition(0, 1, 8)[0]), "the window still open"
    for _ in range(window - term):
        sim._deal_phase()
    assert not bool(sim.seat_promise_broken.any())
    assert not bool(sim._war_condition(0, 1, 8)[0]), "the window closed"
    print("  d clock OK")


def poke_settle_promise(rules, path):
    """e. THE SETTLE PROMISE (`settleIncursion`): a founding within 3 of a
    rival's border costs nothing with no promise standing; after a refusal
    each costs 25; a kept promise breaks for 100 and each founding after
    costs 50; 4 from the border costs nothing. The founding itself pays it."""
    sim = build(rules, path)
    nrow = sim.n_majors

    def border(t: int, s: int) -> int:
        owned = sim.tile_seat[0] == s
        return int(sim.pair_dist[t][owned].min()) if bool(owned.any()) else 999

    at3 = next(t for t in range(sim.T) if int(sim.tile_seat[0, t]) < 0 and border(t, 1) == 3)
    at4 = next(t for t in range(sim.T) if int(sim.tile_seat[0, t]) < 0 and border(t, 1) == 4)
    everywhere = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    sim._settle_incursion(0, everywhere, n1(sim, at3))
    assert not bool(sim.civ_grievance.any()), "no promise standing, and the founding drew a grievance"
    # refused: the refusal's 25, then 25 a founding within 3
    settle(sim, {1: [(0, SETTLE)]}, {})
    assert int(sim.civ_grievance[0, 1, 0]) == 25
    sim._settle_incursion(0, everywhere, n1(sim, at4))
    assert int(sim.civ_grievance[0, 1, 0]) == 25, "4 from the border costs nothing"
    sim._settle_incursion(0, everywhere, n1(sim, at3))
    assert int(sim.civ_grievance[0, 1, 0]) == 50, "refused and continued: 25"
    # kept: the break's 100, then 50 a founding
    sim = build(rules, path)
    settle(sim, {1: [(0, SETTLE)]}, {0: [(1, SETTLE)]})
    assert int(sim.seat_promise[0, 1, 0, SETTLE]) == sim._promise_turns
    sim._settle_incursion(0, everywhere, n1(sim, at4))
    assert int(sim.civ_grievance[0, 1, 0]) == 0
    sim._settle_incursion(0, everywhere, n1(sim, at3))
    assert int(sim.civ_grievance[0, 1, 0]) == 100, "a kept promise breaks for 100"
    assert int(sim.seat_promise_broken[0, 1, 0, SETTLE]) == sim._retribution_turns
    sim._settle_incursion(0, everywhere, n1(sim, at3))
    assert int(sim.civ_grievance[0, 1, 0]) == 150, "broken and continued: 50"
    # the founding verb pays it: a legal site for seat 0 within 3 of a rival
    sim = build(rules, path)
    ask = {s: [(0, SETTLE)] for s in range(1, nrow)}
    settle(sim, ask, {0: [(s, SETTLE) for s in range(1, nrow)]})
    centres = torch.cat((sim.city_center[0, :nrow][sim.city_alive[0, :nrow]],
                         sim.citystate_center[0][sim.citystate_alive[0]]))

    def legal(t: int) -> bool:
        return (int(sim.tile_seat[0, t]) < 0 and bool(sim.settle_ok[0, t])
                and int(sim.district[0, t]) < 0 and int(sim.built_wonder[0, t]) < 0
                and int(sim.pair_dist[t][centres].min()) >= 4)

    site = next((t for t in range(sim.T)
                 if legal(t) and min(border(t, s) for s in range(1, nrow)) <= 3), None)
    if site is None:
        print("  e settle promise OK (no legal founding site within 3 of a rival on this fixture)")
        return
    rivals = [s for s in range(1, nrow) if border(site, s) <= 3]
    made = sim._found_city_at(0, everywhere, n1(sim, site))
    assert bool(made[0]), "the founding site was refused"
    for s in range(1, nrow):
        assert int(sim.civ_grievance[0, s, 0]) == (100 if s in rivals else 0), f"seat {s} after the founding"
    print("  e settle promise OK")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    poke_rows(rules, path)
    poke_ask_keep_refuse(rules, path)
    poke_incursion(rules, path)
    poke_clock(rules, path)
    poke_settle_promise(rules, path)
    print("BATTERY OK promises")
    return 0


if __name__ == "__main__":
    sys.exit(main())
