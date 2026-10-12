"""THE CITY-STATES' CITY AI ON A WORLD, GPU twin (`gpu/core/sim_minorai.py`,
`_minor_build`): seed9001's opening — each major's capital founded on its
settler's plot, nothing else ordered — for 16 turns; per turn per
city-state its AI's state as the census reads it (the item in hand, its
progress, plot and kept progress, the overflow store, the turn and value it
was set, the threat, the savings, the event slots, the trees, the
contracts, the reservations, the hand and the serials, the treasury, the
Builders trained, the best melee strength, the Combat Desire), against the
pins the TS twin tests/cpu/minors/minor-ai.test.ts holds (minor-ai-pins.json).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/minor_ai_test.py
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

PINS = json.loads((ROOT / "tests/cpu/minors/minor-ai-pins.json").read_text(encoding="utf-8"))


def same(a, b) -> bool:
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))
    return a == b


def main() -> int:
    rules = load_rules()
    sim = opened(rules, FIXTURES / "seed9001.json", 0)
    man = statecompare.load_manifest()
    for t, want in enumerate(PINS):
        sim.step()
        got = statecompare.group_dump(sim, 0, "cityState", man)
        for key, fields in want.items():
            row = got.get(int(key))
            assert row is not None, f"turn {t + 1}: city-state {key} missing"
            for f, v in fields.items():
                assert same(v, row[f]), f"turn {t + 1}: city-state {key} {f}: TS {v}, GPU {row[f]}"
    print(f"  the city-states' city AI OK — {len(PINS)} turns of seed9001, every minor's AI state as pinned")
    print("BATTERY OK minor_ai")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
