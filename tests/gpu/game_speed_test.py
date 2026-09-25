"""THE ONLINE GAME SPEED — the GPU half.

    npm run export                          # writes seeder/worlds/
    python tests/gpu/game_speed_test.py

CIV6 (GameSpeeds.xml, GAMESPEED_ONLINE): `CostMultiplier` 50, and the game's
250 turns are the online `GameSpeed_Turns` rows' sum. `Rules.scale_by_game_speed`
is `scaleByGameSpeed`'s twin — a Standard-speed figure `× CostMultiplier / 100`,
truncated, as the lab read every odd cost (runs/purchase_20260920T181359Z.jsonl):
a cost, a progression step, and an amount the install types `ScaleByGameSpeed`.
The TS twin is tests/cpu/city/game-speed.test.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths, FIXTURES
from great_person_test import fresh, make_person, order

ROW = 1  # a civ row; every poke below is seat-generic


def test_the_speed(rules) -> None:
    """the wire's speed is the install's row, and the helper truncates"""
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    assert rules.game_speed == 50 / 100, f"game speed {rules.game_speed}"
    assert rules.turn_limit == 35 + 30 + 20 + 20 + 30 + 25 + 60 + 30, f"turn limit {rules.turn_limit}"
    sp = rules.scale_by_game_speed
    # xmlCost -> the city's production cost, lab 2 scene G
    for xml, lab in ((35, 17), (75, 37), (225, 112), (65, 32), (81, 40), (27, 13), (80, 40)):
        assert sp(xml) == lab, f"{xml} -> {sp(xml)}, the lab read {lab}"
        got = sp(torch.tensor([float(xml)], dtype=torch.float64))
        assert float(got[0]) == lab, f"tensor {xml} -> {float(got[0])}"
    units = {u["id"]: u for u in R["units"]}
    for uid, lab in (("SLINGER", 17), ("SPY", 112), ("MISSIONARY", 37), ("GALLEY", 32)):
        assert int(units[uid]["cost"]) == lab, f"{uid} ships {units[uid]['cost']}, the lab read {lab}"
    # the Builder's and the Settler's own rows: Cost + CostProgressionParam1,
    # each at the speed
    assert (rules.builder_base, rules.builder_per) == (sp(50), sp(4))
    assert (rules.settler_base, rules.settler_per_city) == (sp(80), sp(30))
    # a worship building: its own Cost 190 at the faith rate
    assert rules.worship_faith_cost == sp(190) * rules.faith_purchase_mult
    assert int(R["scenario"]["spaceLyTarget"]) == sp(50)
    print("  1 the speed OK — CostMultiplier 50, 250 turns, odd costs truncated")


def test_builder_cost(rules, path) -> None:
    """`builderCost`: 25 + 2 per builder trained, straight off the wire"""
    sim = fresh(rules, path)
    sp = rules.scale_by_game_speed
    n = torch.tensor([0, 1, 5], dtype=torch.long)
    got = [float(x) for x in sim._builder_cost(n)]
    assert got == [float(sp(50) + sp(4) * k) for k in (0, 1, 5)], got
    print("  2 builder cost OK —", got)


def test_wonder_grant(rules, path) -> None:
    """CIV6 (Imhotep): 350 into an Ancient or Classical wonder, 175 into a
    later one, both typed ScaleByGameSpeed — the payout scales the grant
    WHOLE, so the doubled one is 175, not twice 87."""
    sp = rules.scale_by_game_speed
    for early in (True, False):
        sim = fresh(rules, path)
        cls, at = 0, 0
        kp = sim._GPFX["wonderProduction"]
        kd = sim._GPFX["wonderEraDouble"]
        sim._gp_site[cls, at] = 1
        sim._gp_charges[cls, at] = 1
        sim._gp_effects[cls, at, :] = 0
        sim._gp_effects[cls, at, kp] = 175
        sim._gp_effects[cls, at, kd] = 1
        eras = sim._wonder_era.tolist()
        wi = next(i for i, e in enumerate(eras) if (e <= 1) == early)
        ctr = int(sim.city_center[0, ROW, 0])
        assert ctr >= 0, "row has no city to spend in"
        sim.city_current[0, ROW, 0, 0] = sim.WONDER_BASE + wi
        sim.city_cost[0, ROW, 0, 0] = 5000.0
        sim.city_progress[0, ROW, 0, 0] = 0.0
        v = make_person(sim, ROW, cls, at, ctr)
        order(sim, ROW, v, sim._A_GP)
        want = sp(350) if early else sp(175)
        got = float(sim.city_progress[0, ROW, 0, 0])
        assert got == float(want), f"{'early' if early else 'later'} wonder took {got}, wanted {want}"
    print("  3 wonder grant OK —", sp(350), "into an early wonder,", sp(175), "into a later one")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    p = paths[0]
    print(f"game_speed_test on {p.name}")
    test_the_speed(rules)
    test_builder_cost(rules, p)
    test_wonder_grant(rules, p)
    print("GAME SPEED OK")


if __name__ == "__main__":
    main()
