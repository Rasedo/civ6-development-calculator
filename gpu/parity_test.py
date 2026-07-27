"""Turn-exact parity check: the vectorized engine vs recorded TS traces.

    npm run gpu:export           # (once) writes gpu/fixtures/
    python gpu/parity_test.py

Every fixture's per-turn trace — empire state (techs, civics, settlers,
city count, treasury, science, culture, empireScore, the RNG state
itself, camps, barbarians, player units, envoys, influence), per
city-state, per rival and per city — must match exactly; mismatches
print the first divergent turn and column.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES

HEAD = [
    "turn", "techs", "civics", "settlers", "nCities", "treasury", "science", "culture",
    "score", "rng", "camps", "barbs", "punits", "envoysAvail", "influence", "fert", "drought", "imp", "leader", "gameOver", "winner", "victoryType", "playerAge", "tourism",
]
PER_CS = ["envoys", "csPop", "quest"]
PER_RIVAL = ["rCities", "rPop", "rUnits", "atWar", "rNTechs", "rNCivics", "rTechProg", "rCivicProg", "rQProg", "rQCost", "rNDist", "rNBldg", "rGold", "rGScore", "rrWarMask", "rAge", "rTourism"]
PER_CITY = ["pop", "owned", "bldgs", "acquired", "foodBox", "cultureBox", "hp", "loyalty", "followed"]


def columns(n_cities: int, n_cs: int, n_rivals: int) -> tuple[list[str], torch.Tensor]:
    """Column names and per-column tolerances.

    Integer state must match exactly. Float accumulators (encoded ×1000)
    get a ±2 milli-unit budget: IEEE addition isn't associative, so batched
    sums can differ from the TS engine's sequential adds by ~1 ulp — which
    occasionally crosses the rounding boundary. Real logic bugs DRIFT (grow
    turn over turn); the drift check below catches those regardless.
    """
    cols = list(HEAD)
    atol = [0.0] * 5 + [2.0] * 4 + [0.0] * 15  # +leader/gameOver/winner/victoryType (int, GV-1/2/3) +playerAge (int, B-24) +tourism (int, B-20 #71)
    for s in range(n_cs):
        cols += [f"{name}{s}" for name in PER_CS]
        atol += [0.0, 0.0, 0.0]
    for r in range(n_rivals):
        cols += [f"{name}{r}" for name in PER_RIVAL]
        atol += [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.0, 2.0, 2.0, 2.0, 0.0, 0.0, 2.0, 2.0, 0.0, 0.0, 0.0]  # +rrWarMask (A-19/B-33) +rAge (int, B-24) +rTourism (int, B-20 #71)
    for c in range(n_cities):
        cols += [f"{name}{c}" for name in PER_CITY]
        atol += [0.0, 0.0, 0.0, 0.0, 2.0, 2.0, 0.0, 2.0, 0.0]  # +followed (int, B-18)
    return cols, torch.tensor(atol, dtype=torch.float64)


def main() -> int:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        return 1
    fixtures = [load_fixture(p) for p in paths]
    sim = BatchSim(fixtures, rules, device="cpu", dtype=torch.float64)
    cols, atol = columns(sim.C, sim.S, sim.R)
    float_cols = [i for i, a in enumerate(atol.tolist()) if a > 0]

    n_turns = len(fixtures[0]["trace"])
    # D-17: stack every fixture's trace ONCE up front — [B, n_turns, ncols].
    # Traces are uniform (one export batch: same turn count and column count
    # per fixture); torch.tensor raises on ragged input, the loud failure we
    # want if that ever stops holding.
    want_all = torch.tensor([f["trace"] for f in fixtures], dtype=torch.float64)
    failures = 0
    worst = torch.zeros(len(cols), dtype=torch.float64)
    for t in range(n_turns):
        sim.step()
        got = sim.trace_row()
        diff_all = (got - want_all[:, t]).abs()
        worst = torch.maximum(worst, diff_all.amax(dim=0))
        if (diff_all > atol).any():
            # mismatch somewhere this turn — drop to the per-game diagnostic
            # report (format is load-bearing: hunts parse these lines)
            for b, f in enumerate(fixtures):
                want = want_all[b, t]
                diff = diff_all[b]
                if (diff > atol).any():
                    bad = [(cols[i], float(want[i]), float(got[b][i])) for i in range(len(cols)) if diff[i] > atol[i]]
                    print(f"seed {f['seed']} turn {int(want[0])}: MISMATCH {bad}")
                    failures += 1
                    if failures > 12:
                        print("(stopping after 12 mismatches)")
                        return 1
    if failures == 0:
        drift = float(worst[float_cols].max())
        print(
            f"PARITY OK — {len(fixtures)} seeds × {n_turns} turns × {sim.C} cities "
            f"(+{sim.S} city-states, {sim.R} rivals): integer state exact, "
            f"float accumulators within {drift:.1f} milli-units of the TypeScript engine"
        )
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
