"""THE PRESSURE-SCALE PROBE (C-46) — what each reading DOES, measured.

    python tools/gpu/pressure_probe.py                # 8 fixtures x 250 turns
    python tools/gpu/pressure_probe.py --seeds 4 --turns 120

OWNER RULING 2026-09-04: C-46 is not decided from my summary of two readings
but from their measured consequences. The install publishes the pressure
TERMS and never the rule that combines them; two readings fit and differ by
two orders of magnitude. This tool drives the same games under each and
reports what happens to religious CONVERSION — how many cities convert, how
fast, and whether a missionary's lump or a won theological battle can hold
against the per-turn stream or is washed out by it.

Why the readings are expressed as SWING sizes: a city follows the argmax of
its accumulated pressure, and an argmax is scale-invariant. Multiplying every
source by 100 changes nothing. What the scale DECIDES is the ratio between
the per-turn stream and the one-shot swings, so that is what each column
sets, holding the stream at the engine's 1 per source per turn:

  A  engine as shipped   lump 10   theological 15   condemn 7
  B  install swings      lump 200  theological 250  condemn 125  (stream 1)
  C  install swings + a POPULATION-scaled stream (reading (b)'s pop term,
     coefficient 1 per citizen — the coefficient the install never states,
     shown at 1 so the owner can see its direction, not as a proposal)

Everything else is the engine as it stands; nothing here is a change to it.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "gpu"))
sys.path.insert(0, str(ROOT / "policy"))
from core import load_rules, load_fixture, fixture_paths  # noqa: E402
from core.env import BatchEnv  # noqa: E402
import drive  # noqa: E402

READINGS = {
    "A engine":  dict(lump=10,  theo=15.0,  condemn=7,   pop_stream=False),
    "B install": dict(lump=200, theo=250.0, condemn=125, pop_stream=False),
    "C install+pop": dict(lump=200, theo=250.0, condemn=125, pop_stream=True),
}
REVERT_WINDOW = 10


def apply_reading(sim, r: dict) -> None:
    sim._enh["mlump"] = torch.full_like(sim._enh["mlump"], int(r["lump"]))
    sim._theo_swing = float(r["theo"])
    sim._condemn_swing = int(r["condemn"])
    if r["pop_stream"]:
        orig = sim._spread_religious_pressure

        def scaled():
            nsc = sim.city_followed.shape[1]
            before = sim.city_pressure[:, :nsc].clone()
            orig()
            delta = sim.city_pressure[:, :nsc] - before
            pop = sim.city_pop[:, :nsc].clamp(min=1).long().unsqueeze(3)
            sim.city_pressure[:, :nsc] = before + delta * pop
            tot = sim.city_pressure[:, :nsc].sum(dim=3)
            best = sim.city_pressure[:, :nsc].argmax(dim=3)
            sim.city_followed[:, :nsc] = torch.where(tot > 0, best, torch.full_like(best, -1))

        sim._spread_religious_pressure = scaled


def run_one(path: Path, r: dict, turns: int) -> dict:
    rules = load_rules()
    env = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    sim = env.sim
    apply_reading(sim, r)
    nm = sim.n_majors
    prev = sim.city_followed[0, :nm].clone()
    conversions: list[tuple[int, int, int, int]] = []   # (turn, row, col, religion)
    live_at: dict[tuple[int, int], tuple[int, int]] = {}  # (row,col) -> (religion, since)
    holds: list[int] = []
    reverts = 0
    first = None
    for t in range(1, turns + 1):
        drive.drive_batched(env, 1, list(range(nm)))
        cur = sim.city_followed[0, :nm]
        changed = (cur != prev) & (cur >= 0)
        for row, col in changed.nonzero().tolist():
            rel = int(cur[row, col])
            conversions.append((t, row, col, rel))
            if first is None:
                first = t
            key = (row, col)
            if key in live_at:
                old_rel, since = live_at[key]
                held = t - since
                holds.append(held)
                if held <= REVERT_WINDOW:
                    reverts += 1
            live_at[key] = (rel, t)
        prev = cur.clone()
    ever = len({(r_, c_) for _, r_, c_, _ in conversions})
    return {
        "conversions": len(conversions),
        "cities_ever_converted": ever,
        "reconversions": len(holds),
        "reverted_within_10": reverts,
        "median_hold": statistics.median(holds) if holds else None,
        "first_conversion_turn": first,
        "cities": int(sim.city_alive[0, :nm].sum()),
        # a probe that drives a world where nobody FOUNDS a religion measures
        # nothing whatever the reading; say so on every line
        "religions_founded": int((sim.holy_tile[0] >= 0).sum()),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=8)
    ap.add_argument("--turns", type=int, default=250)
    ap.add_argument("--only", default=None, help="comma-separated reading keys")
    a = ap.parse_args()
    paths = fixture_paths()[: a.seeds]
    keys = [k for k in READINGS if not a.only or k.split()[0] in a.only.split(",")]
    out: dict[str, list[dict]] = {}
    t0 = time.time()
    for k in keys:
        out[k] = []
        for p in paths:
            res = run_one(p, READINGS[k], a.turns)
            res["seed"] = int(p.stem[4:])
            out[k].append(res)
            print(f"  {k:14s} seed {res['seed']}  conv {res['conversions']:3d}  cities {res['cities_ever_converted']:2d}/{res['cities']:2d}"
                  f"  reconv {res['reconversions']:3d}  reverted<=10 {res['reverted_within_10']:3d}"
                  f"  hold~{res['median_hold']}  first t{res['first_conversion_turn']}  founded {res['religions_founded']}", flush=True)
    print()
    print(f"{'reading':14s} {'conv/game':>9s} {'cities':>8s} {'reconv':>7s} {'revert<=10':>10s} {'hold~':>6s} {'first':>6s}")
    for k in keys:
        rows = out[k]
        n = len(rows)
        conv = sum(r["conversions"] for r in rows) / n
        cities = sum(r["cities_ever_converted"] for r in rows) / n
        rec = sum(r["reconversions"] for r in rows) / n
        rev = sum(r["reverted_within_10"] for r in rows) / n
        holds = [r["median_hold"] for r in rows if r["median_hold"] is not None]
        firsts = [r["first_conversion_turn"] for r in rows if r["first_conversion_turn"] is not None]
        print(f"{k:14s} {conv:9.1f} {cities:8.1f} {rec:7.1f} {rev:10.1f} "
              f"{(statistics.median(holds) if holds else float('nan')):6.1f} "
              f"{(statistics.median(firsts) if firsts else float('nan')):6.1f}")
    dst = ROOT / ".claude" / "scratchpad" / "pressure_probe.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps({"turns": a.turns, "readings": READINGS, "results": out}, indent=1), encoding="utf-8")
    print(f"\n{len(paths)} fixtures x {a.turns} turns x {len(keys)} readings in {time.time() - t0:.0f}s -> {dst.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
