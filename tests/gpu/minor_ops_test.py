"""THE CITY-STATES' OPERATIONS ON A WORLD, GPU twin (`gpu/core/sim_minorops.py`
over the minor's turn): the openings of seed9001 and seed9235 (the turns the
pins hold) — each major's capital founded on its settler's plot, nothing
else ordered; per turn per
city-state its operations as the census reads them (the pool, the pick, each
operation's target, rally, backup, strengths and teams), the camps its
knowledge base holds, its army records, its contracts, its event slots, its
threat and its units' plots, against the pins the TS twin
tests/cpu/minors/minor-ops.test.ts holds (minor-ops-pins.json).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_ops_test.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from core import load_rules, statecompare  # noqa: E402
from core.simbase import FIXTURES  # noqa: E402
from warmup import opened  # noqa: E402

PINS = json.loads((ROOT / "tests/cpu/minors/minor-ops-pins.json").read_text(encoding="utf-8"))


def same(a, b) -> bool:
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))
    return a == b


def unit_plots(sim, b: int, s: int) -> list[int]:
    """the minor's units as plot x 1000 + pool slot (999 unslotted), sorted"""
    lo, hi = sim.POOL_LO["major"], sim.POOL_HI["major"]
    out = []
    for g in range(lo, hi):
        if bool(sim.unit_alive[b, g]) and int(sim.unit_seat[b, g]) == 100 + s:
            p = int(sim.unit_pslot[b, g])
            out.append(int(sim.unit_tile[b, g]) * 1000 + (p if p >= 0 else 999))
    return sorted(out)


def main() -> int:
    rules = load_rules()
    man = statecompare.load_manifest()
    for world, turns in PINS.items():
        sim = opened(rules, FIXTURES / f"{world}.json", 0)
        for t, want in enumerate(turns):
            sim.step()
            got = statecompare.group_dump(sim, 0, "cityState", man)
            for key, fields in want.items():
                row = got.get(int(key))
                assert row is not None, f"{world} turn {t + 1}: city-state {key} missing"
                for f, v in fields.items():
                    g = unit_plots(sim, 0, int(key)) if f == "unitPlots" else row[f]
                    assert same(v, g), f"{world} turn {t + 1}: city-state {key} {f}: TS {v}, GPU {g}"
        print(f"  the city-states' operations OK — {len(turns)} turns of {world}, every minor's operations as pinned")
    print("BATTERY OK minor_ops")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
