"""§F hunt tooling: find the first divergent CHECKPOINT for one game — the
JIT bracket finder. No re-simulation: both engines' raw checkpoints (written
during every normal gate run) are loaded and the EXISTING statelog emitters
run over them on demand.

    python gpu/ckptdiff.py --rng 2026006084

Prints per-checkpoint verdicts, the divergence bracket [last-good,
first-bad], and the exact resume commands for the fine hunt (statelog/CB/
probes over just the bracket instead of a full re-simulation).

Checkpoint files (transient, gitignored, overwritten each run):
  gpu/fixtures/ckpt/gpu_<firstRngOfBatch>_t<turn>.pt   (whole shard batch)
  gpu/fixtures/ckpt/ts_<rng>_t<turn>.json              (one game each)
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from statelog import gpu_state_lines

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

CKPT = FIXTURES / "ckpt"


def gpu_lines_at(meta_path: Path, rng: int) -> list[str]:
    meta = torch.load(meta_path, weights_only=False)
    fixtures = [load_fixture(Path(p)) for p in meta["paths"]]
    sim = BatchSim(fixtures, load_rules(), device="cpu", dtype=torch.float64)
    sim.restore(meta["snap"])
    b = meta["rngs"].index(rng)
    return gpu_state_lines(sim, b)


def ts_lines_at(path: Path) -> list[str]:
    out = subprocess.run(
        ["npx", "vite-node", "scripts/ckpt-lines.ts", str(path)],
        cwd=FIXTURES.parent.parent, capture_output=True, text=True,
        encoding="utf-8", errors="replace", shell=True,
    )
    if out.returncode != 0:
        raise SystemExit(f"ckpt-lines failed for {path}:\n{out.stderr[-800:]}")
    return [l for l in out.stdout.splitlines() if l.strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rng", type=int, required=True, help="the failing game's rng")
    args = ap.parse_args()

    ts_files = {}
    for f in CKPT.glob(f"ts_{args.rng}_t*.json"):
        ts_files[int(re.search(r"_t(\d+)\.json$", f.name).group(1))] = f
    gpu_files: dict[int, Path] = {}
    for f in CKPT.glob("gpu_*_t*.pt"):
        m = re.search(r"gpu_(\d+)_t(\d+)\.pt$", f.name)
        meta_rngs = torch.load(f, weights_only=False, map_location="cpu")["rngs"]
        if args.rng in meta_rngs:
            gpu_files[int(m.group(2))] = f
    turns = sorted(set(ts_files) & set(gpu_files))
    if not turns:
        raise SystemExit("no paired checkpoints for that rng — run the gate first (checkpoints are on by default)")

    last_good, first_bad = None, None
    for t in turns:
        g = set(gpu_lines_at(gpu_files[t], args.rng))
        s = set(ts_lines_at(ts_files[t]))
        if g == s:
            last_good = t
            print(f"t{t}: MATCH ({len(g)} lines)")
        else:
            first_bad = t
            only_g = sorted(g - s)[:4]
            only_s = sorted(s - g)[:4]
            print(f"t{t}: DIVERGED — {len(g - s)} GPU-only / {len(s - g)} TS-only lines, e.g.")
            for l in only_g:
                print(f"    GPU: {l}")
            for l in only_s:
                print(f"    TS : {l}")
            break

    if first_bad is None:
        print(f"\nall {len(turns)} checkpoints match — the divergence (if any) is after t{last_good} or intra-turn; resume with --log from t{last_good}")
    print(f"\nBRACKET: last good t{last_good}, first bad t{first_bad}")
    # +1: the label space runs 2..(turns+1) — one extra step covers the
    # bracket's far edge (the TS resume runs to its trace end regardless)
    span = (first_bad - last_good + 1) if (first_bad and last_good) else 30
    print("fine hunt (statelog over the bracket only):")
    print(f"  PYTHONUTF8=1 python gpu/rollout.py --shards 4 --resume-t {last_good} --turns {span} --log {args.rng} --ckpt 0")
    print(f"  CIV6_RESUME_T={last_good} CIV6_CKPT=0 CIV6_LOG={args.rng} npm run gpu:replay")
    print("  python gpu/logdiff.py")


if __name__ == "__main__":
    main()
