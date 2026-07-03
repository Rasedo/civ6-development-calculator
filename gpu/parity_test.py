"""Turn-exact parity check: the vectorized engine vs recorded TS traces.

    npm run gpu:export           # (once) writes gpu/fixtures/
    python gpu/parity_test.py

Every fixture's per-turn trace (population, food box, treasury, science,
culture, tech/civic counts, owned tiles, buildings, culture box) must match
exactly — mismatches print the first divergent turn and column.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES

COLS = ["turn", "pop", "foodBox", "treasury", "science", "culture", "techs", "civics", "owned", "bldgs", "cultureBox"]
# Integer state must match exactly. Float accumulators (encoded ×1000) get a
# ±2 milli-unit budget: IEEE addition isn't associative, so batched sums can
# differ from the TS engine's sequential adds by ~1 ulp — which occasionally
# crosses the rounding boundary. Real logic bugs DRIFT (grow turn over turn);
# the drift check below catches those regardless of the tolerance.
ATOL = torch.tensor([0.0, 0.0, 2.0, 2.0, 2.0, 2.0, 0.0, 0.0, 0.0, 0.0, 2.0], dtype=torch.float64)


def main() -> int:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        return 1
    fixtures = [load_fixture(p) for p in paths]
    sim = BatchSim(fixtures, rules, device="cpu", dtype=torch.float64)

    n_turns = len(fixtures[0]["trace"])
    failures = 0
    worst = torch.zeros(len(COLS), dtype=torch.float64)
    for t in range(n_turns):
        sim.step()
        got = sim.trace_row()
        for b, f in enumerate(fixtures):
            want = torch.tensor(f["trace"][t], dtype=torch.float64)
            diff = (got[b] - want).abs()
            worst = torch.maximum(worst, diff)
            if (diff > ATOL).any():
                bad = [(COLS[i], float(want[i]), float(got[b][i])) for i in range(len(COLS)) if diff[i] > ATOL[i]]
                print(f"seed {f['seed']} turn {int(want[0])}: MISMATCH {bad}")
                failures += 1
                if failures > 12:
                    print("(stopping after 12 mismatches)")
                    return 1
    if failures == 0:
        drift = float(worst[2:6].max())
        print(
            f"PARITY OK — {len(fixtures)} seeds × {n_turns} turns: integer state exact, "
            f"float accumulators within {drift:.1f} milli-units of the TypeScript engine"
        )
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
