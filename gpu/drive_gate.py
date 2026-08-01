"""#70 pass 2 of the two-pass export: run the LADDER over the gate's seeds and
write the action file both engines will replay.

THE CHICKEN AND EGG this resolves: the TS trace cannot be produced until the
actions exist, and the actions cannot be produced until there is an initial state
to run from. So:

    pass 1  `npm run gpu:export`      -> fixtures (initial state + rules)
    pass 2  THIS SCRIPT               -> gpu/fixtures/rival_actions.json
    pass 3  `npm run gpu:export`      -> the TS trace, REPLAYING those actions
    gate    parity                    -> GPU replay vs TS trace

Why this is a BETTER gate than the one it replaces: today parity compares two
engines each running their OWN copy of the rival policy, so it can only catch a
divergence when the two transcriptions disagree. Replaying IDENTICAL actions
compares the RULES with the policy removed from the comparison entirely — which
is what parity was always trying to measure and never quite could.

The file is keyed by seed, then turn, then rival, matching `GameState.rivalActions`
on the TS side so the exporter can hand it straight to `rivalPhase`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from civ6gpu import load_rules, load_fixture, FIXTURES  # noqa: E402
from civ6gpu.env import BatchEnv  # noqa: E402
import drive  # noqa: E402

#: NOT written into gpu/fixtures by default. The exporter replays this file when
#: it is present, so dropping it beside the fixtures switches the TS half of the
#: gate to file-driven while the GPU half still runs its scripted picker — a
#: mixed gate that goes red for the right reason but for no useful purpose.
#: Land it only together with the GPU-side switch in parity_test.
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else (FIXTURES / "rival_actions.json")


def main() -> int:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        return 1
    turns = int(sys.argv[1]) if len(sys.argv) > 1 else 250

    out: dict[str, dict] = {}
    for p in paths:
        fx = load_fixture(p)
        seed = str(fx["seed"])
        env = BatchEnv([fx], rules, device="cpu", dtype=torch.float64)
        log = drive.drive(env, turns)
        # re-key turn -> rival -> record, which is GameState.rivalActions' shape.
        # The driver's own log is a list because it is a RECORDING; the file is a
        # LOOKUP because a replay needs random access by turn.
        per_turn: dict[str, dict] = {}
        for t, rec in enumerate(log):
            seats = {}
            for k, v in rec.items():
                if k == "turn":
                    continue
                seats[k[1:]] = v          # "r0" -> "0"
            if seats:
                per_turn[str(t)] = seats
        out[seed] = per_turn
        print(f"  seed {seed}: {len(per_turn)} turns of actions")

    OUT.write_text(json.dumps({"schema": drive.SCHEMA_VERSION, "turns": turns, "seeds": out}), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
