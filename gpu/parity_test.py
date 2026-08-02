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

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES

import stamp
import drive  # #70: the file-driven gate

def columns(sim, rj: dict) -> tuple[list[str], torch.Tensor]:
    """Column names and per-column tolerances, from ONE source per engine.

    #51/S0.1: names and tolerances are no longer maintained here. TS ships its
    four column tables in `rules.trace` (scripts/gpu-trace.ts) and this expands
    them against the fixture's own dimensions; the engine builds the same list
    in BatchSim.trace_columns(). The two are asserted IDENTICAL before a single
    value is compared, and tolerance is applied BY NAME — so adding a column to
    one engine and not the other fails loudly here instead of silently shifting
    every later column's tolerance (the old hand-maintained `atol` literal drifted
    from its own comment: it claimed HEAD was 24, then 25, while it was 28).

    Integer state must match exactly. Float accumulators (encoded ×1000) get a
    ±2 milli-unit budget: IEEE addition isn't associative, so batched sums can
    differ from the TS engine's sequential adds by ~1 ulp — which occasionally
    crosses the rounding boundary. Real logic bugs DRIFT (grow turn over turn);
    the drift check below catches those regardless.
    """
    tr = rj["trace"]
    cols: list[str] = []
    atol: list[float] = []

    def add(prefix: str, table: list[dict]) -> None:
        for e in table:
            cols.append(f"{prefix}{e['name']}")
            atol.append(float(e["tol"]))

    add("", tr["head"])
    for s in range(sim.S):
        add(f"cs{s}.", tr["perCs"])
    for r in range(sim.R):
        add(f"r{r}.", tr["perRival"])
    for c in range(sim.C):
        add(f"c{c}.", tr["perCity"])
    # #51/S0.2: per-rival-city, width fixed by the exporter (not sim.RC) so both
    # engines cover the same slots; both sides assert no rival exceeds it.
    for r in range(sim.R):
        for k in range(int(tr["rivalCityMax"])):
            add(f"r{r}c{k}.", tr["perRivalCity"])

    gpu_cols = sim.trace_columns()
    if cols != gpu_cols:
        if len(cols) != len(gpu_cols):
            raise AssertionError(
                f"trace WIDTH disagrees: rules.trace expands to {len(cols)} columns, "
                f"BatchSim.trace_columns() gives {len(gpu_cols)} — a column was added to one engine only"
            )
        bad = [(i, a, b) for i, (a, b) in enumerate(zip(cols, gpu_cols)) if a != b]
        raise AssertionError(f"trace NAMES disagree at {len(bad)} column(s); first 5: {bad[:5]}")
    return cols, torch.tensor(atol, dtype=torch.float64)


def main() -> int:
    rules = load_rules()
    # #51/S8.2b: refuse to compare against fixtures this source did not build.
    # A stale set reads exactly like an engine divergence — that is how task
    # #58 and probe-hygiene rule 5 both came about.
    stamp.check(FIXTURES)
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        return 1
    fixtures = [load_fixture(p) for p in paths]
    sim = BatchSim(fixtures, rules, device="cpu", dtype=torch.float64)
    rj = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    cols, atol = columns(sim, rj)
    float_cols = [i for i, a in enumerate(atol.tolist()) if a > 0]

    n_turns = len(fixtures[0]["trace"])
    # D-17: stack every fixture's trace ONCE up front — [B, n_turns, ncols].
    # Traces are uniform (one export batch: same turn count and column count
    # per fixture); torch.tensor raises on ragged input, the loud failure we
    # want if that ever stops holding.
    want_all = torch.tensor([f["trace"] for f in fixtures], dtype=torch.float64)
    # #70: when the action file is present the rivals on BOTH sides replay it
    # instead of deciding. That makes this gate compare the RULES with the policy
    # removed from the comparison — today it compares two engines each running
    # their own copy of the rival ladder, so it can only catch a divergence when
    # the two TRANSCRIPTIONS disagree, never when they agree and are both wrong.
    act_path = FIXTURES / "rival_actions.json"
    driven = None
    # DRIVEN mode is an EXPLICIT opt-in (CIV6_DRIVEN=1), not presence-detection:
    # the battery's parity lane must stay on the SCRIPTED gate while the driven
    # hunt is mid-flight, or the whole tree's green couples to the hunt's
    # residue — which is exactly what happened the first time the battery ran
    # with the file sitting in gpu/fixtures.
    import os as _os
    if act_path.exists() and _os.environ.get("CIV6_DRIVEN"):
        blob = json.loads(act_path.read_text(encoding="utf-8"))
        driven = blob["seeds"]
        seed_order = [f["seed"] for f in fixtures]
        for r in range(sim.R):
            drive.take_seat(sim, r)
        print(f"DRIVEN: replaying rival_actions.json (schema v{blob['schema']}) on both engines")

    failures = 0
    worst = torch.zeros(len(cols), dtype=torch.float64)
    for t in range(n_turns):
        if driven is not None:
            drive.apply_turn(sim, seed_order, driven, t)
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
