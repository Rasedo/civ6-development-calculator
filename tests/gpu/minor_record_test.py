"""The minor's own record on the GPU: the RESOLVED suzerain, the research
walk, the border that closes with Early Empire, Containment's doubled envoy,
and a city-state that can be converted.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_record_test.py

Each is poked at its own body against the same sourced rules the TS vitest
pins (tests/cpu/minors/minor-record.test.ts).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build(rules):
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules,
                              device="cpu", dtype=torch.float64))
    for _ in range(3):
        sim.step()
    assert sim.S > 0, "fixture has no city-state"
    return sim


def test_resolved_suzerain(rules) -> None:
    """`resolveSuzerain`'s twin: at least suzerainEnvoys, STRICTLY more than
    every other seat, a tie leaves nobody."""
    sim = build(rules)
    suz_min = int(sim.rules.citystate.get("suzerainEnvoys", 3))
    env = sim.seat_citystate_envoys
    env[0, :, 0] = 0
    sim._cs_resolve_suzerain()
    assert int(sim.citystate_suzerain[0, 0]) == -1, "an empty record has no suzerain"

    env[0, 0, 0] = suz_min - 1
    sim._cs_resolve_suzerain()
    assert int(sim.citystate_suzerain[0, 0]) == -1, "one short of the bar holds nothing"

    env[0, 0, 0] = suz_min
    sim._cs_resolve_suzerain()
    assert int(sim.citystate_suzerain[0, 0]) == 0, "the bar, uncontested, holds it"
    assert bool(sim._suzerain_mask(0)[0, 0]), "the live contest agrees"

    if sim.n_majors > 1:
        env[0, 1, 0] = suz_min
        sim._cs_resolve_suzerain()
        assert int(sim.citystate_suzerain[0, 0]) == -1, "a TIE leaves nobody"
        assert not bool(sim._suzerain_mask(0)[0, 0]) and not bool(sim._suzerain_mask(1)[0, 0])
        env[0, 1, 0] = suz_min + 1
        sim._cs_resolve_suzerain()
        assert int(sim.citystate_suzerain[0, 0]) == 1, "the strict lead takes it"
    print("  resolved suzerain OK: the bar, the strict lead, the tie")


def test_minor_research(rules) -> None:
    """CIV6 (City-state): a minor "develops scientifically and culturally...
    it will apparently research certain techs" — POPULATION a turn into each
    pot, the cheapest available row completing at most once per pot."""
    sim = build(rules)
    sim.citystate_techs[0, 0].zero_()
    sim.citystate_civics[0, 0].zero_()
    sim.citystate_tech_prog[0, 0] = 0
    sim.citystate_civic_prog[0, 0] = 0
    pop = int(sim.citystate_pop[0, 0])
    assert pop > 0, "a live minor has population"
    cost = sim.rules_dev.t_cost
    avail = sim._available_mask(sim.citystate_techs[0:1, 0], sim._prereq_t)[0]
    cheapest = int(torch.where(avail, cost.to(sim.device),
                               torch.full_like(cost.to(sim.device), float("inf"))).argmin())
    sim._city_state_phase()
    assert float(sim.citystate_tech_prog[0, 0]) == float(pop), "the pot takes POPULATION"
    assert int(sim.citystate_techs[0, 0].sum()) == 0, "and nothing completes below the price"
    turns = int(float(cost[cheapest]) // pop) + 2
    for _ in range(turns):
        sim._city_state_phase()
    assert bool(sim.citystate_techs[0, 0, cheapest]), "the cheapest available row lands first"
    assert int(sim.citystate_civics[0, 0].sum()) > 0, "the civic pot walks its own row"
    print(f"  minor research OK: {pop}/turn, cheapest row {cheapest} at cost {float(cost[cheapest]):.0f}")


def test_minor_border(rules) -> None:
    """CIV6 (Borders): a city-state's ground closes on ITS Early Empire, and
    "Open Borders is granted to players that have reached Suzerain status"."""
    sim = build(rules)
    obc = sim._open_borders_civic
    assert obc >= 0, "no open-borders civic exported"
    own = (sim.tile_seat[0] == 100).nonzero(as_tuple=True)[0]
    assert len(own) > 0, "city-state 0 owns no tile"
    t = torch.tensor([[int(own[0])]], dtype=torch.long, device=sim.device)

    sim.citystate_civics[0, 0, obc] = False
    sim.seat_citystate_envoys[0, :, 0] = 0
    sim._cs_resolve_suzerain()
    assert not bool(sim._border_closed(t, 0)[0, 0]), "open ground before the civic"

    sim.citystate_civics[0, 0, obc] = True
    assert bool(sim._border_closed(t, 0)[0, 0]), "Early Empire closes it"

    suz_min = int(sim.rules.citystate.get("suzerainEnvoys", 3))
    sim.seat_citystate_envoys[0, 0, 0] = suz_min
    sim._cs_resolve_suzerain()
    assert not bool(sim._border_closed(t, 0)[0, 0]), "the SUZERAIN is granted passage"

    if sim.n_majors > 1:
        assert bool(sim._border_closed(t, 1)[0, 0]), "a rival still refuses"
        cs_row = int(sim._seat_row[100])
        sim.war[0, 1, cs_row] = sim.war[0, cs_row, 1] = True
        sim.sync_war()
        assert not bool(sim._border_closed(t, 1)[0, 0]), "a war opens what the civic closed"
        sim.war[0, 1, cs_row] = sim.war[0, cs_row, 1] = False
        sim.sync_war()

    # "Traders ignore borders", and religious units too — the Inquisitor apart
    tr = torch.tensor([[sim._trader_idx]], dtype=torch.long, device=sim.device)
    assert not bool(sim._border_closed(t, 1 % sim.n_majors, tr)[0, 0]) or sim.n_majors == 1
    if sim._inquisitor_idx >= 0 and sim.n_majors > 1:
        iq = torch.tensor([[sim._inquisitor_idx]], dtype=torch.long, device=sim.device)
        assert bool(sim._border_closed(t, 1, iq)[0, 0]), "the Inquisitor is the exception"
    print("  minor border OK: the civic, the suzerain's passage, the war, the exempt classes")


def test_containment(rules) -> None:
    """CIV6 (Containment): "Each Envoy you send to a city-state counts as two,
    if its Suzerain has a different government than you" — the CHANNEL, poked
    at the modifier the send reads."""
    sim = build(rules)
    if not sim._gov_has_effects:
        print("  containment SKIPPED: no government effects in this catalog")
        return
    assert hasattr(sim, "_pol_envoy2"), "the policy column is not exported"
    assert int(sim._pol_envoy2.sum()) >= 1, "no card carries the envoy-doubling effect"
    fx = sim._gov_mods(0)[12]
    assert "envoy2" in fx, "the modifier channel is missing"
    assert fx["envoy2"].dtype == torch.bool and fx["envoy2"].shape[0] == sim.B
    print(f"  containment OK: {int(sim._pol_envoy2.sum())} card(s) carry it, the channel reads bool")


def test_minor_conversion(rules) -> None:
    """B-59r: a minor's city row takes pressure like any other, so a
    city-state CAN be converted — `city_pressure` reaches the minor rows."""
    sim = build(rules)
    m0 = sim._CITY_MINOR0
    assert sim.city_pressure.shape[1] > m0, "no minor row in the pressure plane"
    sim.city_pressure[0, m0 + 0, 0].zero_()
    sim.city_pressure[0, m0 + 0, 0, 0] = 500
    got = sim._followed_religion(sim.city_pressure[0:1, m0 + 0, 0])
    assert int(got[0]) == 0, f"the minor row follows the religion pressing it: {int(got[0])}"
    print("  minor conversion OK: the minor city row carries pressure and a majority")


def main() -> None:
    rules = load_rules()
    print(f"minor_record_test on {fixture_paths()[0].name}:")
    test_resolved_suzerain(rules)
    test_minor_research(rules)
    test_minor_border(rules)
    test_containment(rules)
    test_minor_conversion(rules)
    print("MINOR RECORD OK")


if __name__ == "__main__":
    main()
