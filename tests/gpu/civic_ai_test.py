"""The civics AI on the GPU (`gpu/core/sim_civics.py`): the value in 24.8
fixed point, the walk of the prerequisites, the propagation and the choice —
the same numbers the TS vitest pins (tests/cpu/minors/civic-ai.test.ts).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/civic_ai_test.py
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


def civic_index() -> dict:
    raw = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    return {c["id"]: i for i, c in enumerate(raw["civics"])}


def test_value(rules) -> None:
    """`civicValue`: the civic's own 5 from landing to the horizon at 4%, the
    policy floor; runs/h1_duelw1124 t1 logs Code of Laws 85.2 at 10 turns"""
    sim = build(rules)
    ci = civic_index()
    nc = sim.citystate_civics.shape[2]
    sim.game_era[0] = 0

    def value(cid: str, n: int) -> int:
        turns = torch.zeros(sim.B, nc, dtype=torch.long, device=sim.device)
        turns[0, ci[cid]] = n
        return int(sim._cai_value(0, turns)[0, ci[cid]])

    assert value("CODE_OF_LAWS", 10) == 21819, "the own 5 and the policy floor"
    assert value("CRAFTSMANSHIP", 30) == 9848
    assert value("CODE_OF_LAWS", 49) == 5411
    assert value("CODE_OF_LAWS", 50) == -9999 * 256, "at the horizon -9999"
    sim.game_era[0] = 1
    assert value("CRAFTSMANSHIP", 1) == 56608, "an older era's civic counts once per era between, plus one"
    print("  civic value OK")


def _minor(sim, ci, s: int, held: tuple) -> None:
    sim.game_era[0] = 0
    sim.citystate_civics[0, s].zero_()
    for c in held:
        sim.citystate_civics[0, s, ci[c]] = True
    sim.citystate_cur_civic[0, s] = -1
    sim.citystate_civic_prog[0, s] = 0
    sim.citystate_civic_ovf[0, s] = 0
    sim.citystate_civic_retain[0, s].zero_()


def test_analysis_and_choice(rules) -> None:
    """`civicAnalysis` / `civicChoice` on a minor at 5 Culture a turn"""
    sim = build(rules)
    ci = civic_index()
    s = 0
    cul = torch.full((sim.B,), 5.0, dtype=torch.float64, device=sim.device)
    _minor(sim, ci, s, ("CODE_OF_LAWS", "CRAFTSMANSHIP"))
    turns, nxt, base, score, owned = sim._cai_analysis(s, cul)

    def e(cid):
        i = ci[cid]
        return int(turns[0, i]), int(nxt[0, i]), int(base[0, i]), int(score[0, i])

    assert e("MILITARY_TRADITION")[1] == ci["MILITARY_TRADITION"]
    assert e("MILITARY_TRAINING")[1] == ci["STATE_WORKFORCE"], "the next step is the last prerequisite added"
    assert e("MILITARY_TRAINING")[0] > e("MILITARY_TRADITION")[0] + e("GAMES_AND_RECREATION")[0]
    assert e("CODE_OF_LAWS")[0] == -1 and bool(owned[0, ci["CODE_OF_LAWS"]]) and e("CODE_OF_LAWS")[3] == 0
    parts = sum(max(0, e(c)[2]) for c in ("MILITARY_TRAINING", "MILITARY_TRADITION", "GAMES_AND_RECREATION", "STATE_WORKFORCE"))
    assert e("MILITARY_TRAINING")[3] == parts, "the row's own value and its prerequisites', a negative one counting nothing"
    go = torch.zeros(sim.B, dtype=torch.bool, device=sim.device)
    go[0] = True
    none = torch.full((sim.B,), -1, dtype=torch.long, device=sim.device)
    # the choice: the best row's next step
    _minor(sim, ci, s, ("CODE_OF_LAWS",))
    ent = sim._cai_analysis(s, cul)
    t0, n0, _b0, s0, o0 = (x[0] for x in ent)
    reach = [i for i in range(len(t0)) if not bool(o0[i]) and int(t0[i]) > 0]
    order = sorted(reach, key=lambda i: int(sim._civic_rank[i]))
    best = max(order, key=lambda i: (int(s0[i]), -order.index(i)))
    assert int(sim._cai_choice(s, go, ent, none)[0]) == int(n0[best]), "the best row's next step"
    # a completion: the rows leading through the completed civic passed over
    _minor(sim, ci, s, ())
    ent = sim._cai_analysis(s, cul)
    sim.citystate_civics[0, s, ci["CODE_OF_LAWS"]] = True
    key = torch.full((sim.B,), ci["CODE_OF_LAWS"], dtype=torch.long, device=sim.device)
    pick = int(sim._cai_choice(s, go, ent, key)[0])
    assert pick >= 0 and pick != ci["CODE_OF_LAWS"], "the completed civic's dependents passed over"
    # the draw where the best row's next step is not researchable
    t1, n1, b1, s1, o1 = (x.clone() for x in ent)
    keep = ci["CRAFTSMANSHIP"]
    others = torch.arange(t1.shape[1], device=sim.device) != keep
    o1[:, others] = True
    t1[:, others] = -1
    before = sim.rng_state.clone()
    pick = int(sim._cai_choice(s, go, (t1, n1, b1, s1, o1), none)[0])
    assert pick in (ci["CRAFTSMANSHIP"], ci["FOREIGN_TRADE"]), "one draw over Craftsmanship and Foreign Trade"
    assert not torch.equal(before[0], sim.rng_state[0]), "the draw is taken"
    print("  civic analysis and choice OK")


def main() -> None:
    rules = load_rules()
    print(f"civic_ai_test on {fixture_paths()[0].name}:")
    test_value(rules)
    test_analysis_and_choice(rules)
    print("CIVIC AI OK")


if __name__ == "__main__":
    main()
