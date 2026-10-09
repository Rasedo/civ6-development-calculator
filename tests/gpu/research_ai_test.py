"""The research AI on the GPU (`gpu/core/sim_research.py`): the value in
24.8 fixed point, the walk of the prerequisites, the propagation and the
choice — the same numbers the TS vitest pins
(tests/cpu/minors/research-ai.test.ts).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/research_ai_test.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import load_rules, fixture_paths
from core.simbase import FIXTURES
from warmup import warm_base, opened


def build(rules):
    path = fixture_paths()[0]
    sim = warm_base(str(path), lambda: opened(rules, path, 3))
    assert sim.S > 0, "fixture has no city-state"
    return sim


def tech_index() -> dict:
    raw = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    return {t["id"]: i for i, t in enumerate(raw["techs"])}


def test_value(rules) -> None:
    """`techValue`: a yield a turn from landing to the horizon"""
    sim = build(rules)
    ti = tech_index()
    nt = sim.citystate_techs.shape[2]
    sim.game_era[0] = 0

    def value(tid: str, n: int) -> int:
        turns = torch.zeros(sim.B, nt, dtype=torch.long, device=sim.device)
        turns[0, ti[tid]] = n
        return int(sim._rai_value(turns)[0, ti[tid]])

    assert value("POTTERY", 12) == 20056, "the row's own 5, a building's share, a wonder's"
    assert value("ASTROLOGY", 25) == 11713, "a district's share at its pseudo-yield"
    assert value("WRITING", 37) == 4159
    assert value("SHIPBUILDING", 4) == 48958, "EmbarkAll adds 5"
    assert value("MINING", 50) == 35, "at the horizon one discounted turn"
    assert value("MINING", 51) == -9999 * 256, "past it -9999"
    sim.game_era[0] = 2
    assert value("POTTERY", 12) == 50905, "an older era's row counts once per era between, plus one"
    assert value("MINING", 1) == 77233
    print("  research value OK")


def test_analysis_and_choice(rules) -> None:
    """`researchAnalysis` / `researchChoice` on a minor holding Pottery,
    Animal Husbandry and Mining at 5 Science a turn"""
    sim = build(rules)
    ti = tech_index()
    s = 0
    sim.game_era[0] = 0
    sim.citystate_techs[0, s].zero_()
    for t in ("POTTERY", "ANIMAL_HUSBANDRY", "MINING"):
        sim.citystate_techs[0, s, ti[t]] = True
    sim.citystate_cur_tech[0, s] = -1
    sim.citystate_tech_goal[0, s] = -1
    sim.citystate_tech_prog[0, s] = 0
    sim.citystate_tech_ovf[0, s] = 0
    sim.citystate_tech_retain[0, s].zero_()
    sci = torch.full((sim.B,), 5.0, dtype=torch.float64, device=sim.device)
    turns, nxt, base, score, owned = sim._rai_analysis(s, sci)

    def e(tid):
        i = ti[tid]
        return int(turns[0, i]), int(nxt[0, i]), int(base[0, i]), int(score[0, i])

    assert e("WRITING")[:2] == (5, ti["WRITING"])
    assert e("CURRENCY")[:2] == (20, ti["WRITING"]), "the next step is the last prerequisite added"
    assert e("MATHEMATICS")[:2] == (44, ti["WRITING"])
    assert e("APPRENTICESHIP")[:3] == (76, ti["ARCHERY"], -9999 * 256), "past the horizon"
    assert e("EDUCATION")[0] == -1 and e("EDUCATION")[2] == 0, "a third level adding rows: out of reach"
    assert e("POTTERY")[0] == -1 and bool(owned[0, ti["POTTERY"]])
    m = e("MATHEMATICS")
    assert m[3] == m[2] + e("CURRENCY")[2] + e("WRITING")[2], "the prerequisites' own values one and two levels up"
    # the choice: the best row's next step, the row as the goal
    go = torch.zeros(sim.B, dtype=torch.bool, device=sim.device)
    go[0] = True
    key = torch.full((sim.B,), -1, dtype=torch.long, device=sim.device)
    pick, goal = sim._rai_choice(s, go, (turns, nxt, base, score, owned), key)
    sc = torch.where(owned[0], torch.full_like(score[0], -(1 << 40)), score[0])
    order = sorted(range(len(sc)), key=lambda i: int(sim._tech_rank[i]))
    best = max(order, key=lambda i: (int(sc[i]), -order.index(i)))
    assert int(goal[0]) == best and int(pick[0]) == int(nxt[0, best]), "the goal and its next step"
    print("  research analysis and choice OK")


def main() -> None:
    rules = load_rules()
    print(f"research_ai_test on {fixture_paths()[0].name}:")
    test_value(rules)
    test_analysis_and_choice(rules)
    print("RESEARCH AI OK")


if __name__ == "__main__":
    main()
