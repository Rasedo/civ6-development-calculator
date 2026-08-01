"""Diff the two Phase-1 state logs and print the FIRST divergent turn, field by field.

  python gpu/rollout.py --turns 300 --log <rng>   # writes gpu_statelog.txt
  npx vite-node scripts/replay-gpu.ts             # CIV6_LOG=<rng> writes ts_statelog.txt
  python gpu/logdiff.py                            # -> first divergence

Lines are grouped by turn and paired by their `<cat> <key>` prefix, so a value
change shows GPU vs TS side by side and a missing entity shows `(absent)`.
"""
import sys
from collections import defaultdict

G = sys.argv[1] if len(sys.argv) > 1 else "gpu/fixtures/gpu_statelog.txt"
T = sys.argv[2] if len(sys.argv) > 2 else "gpu/fixtures/ts_statelog.txt"


def load(path):
    turns = defaultdict(list)
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line:
            turns[int(line.split(" ", 1)[0])].append(line)
    return turns


def key(line):
    return line.split(" = ", 1)[0]


def val(line):
    return line.split(" = ", 1)[1] if " = " in line else ""


gpu, ts = load(G), load(T)
for turn in sorted(set(gpu) | set(ts)):
    g = {key(x): val(x) for x in gpu.get(turn, [])}
    s = {key(x): val(x) for x in ts.get(turn, [])}
    diffs = [k for k in sorted(set(g) | set(s)) if g.get(k) != s.get(k)]
    if not diffs:
        continue
    print(f"=== FIRST DIVERGENCE at turn {turn} ({len(diffs)} field(s)) ===")
    for k in diffs[:40]:
        print(f"  {k}")
        print(f"      GPU: {g.get(k, '(absent)')}")
        print(f"      TS : {s.get(k, '(absent)')}")
    if len(diffs) > 40:
        print(f"  ... +{len(diffs) - 40} more")
    sys.exit(0)
print("NO DIVERGENCE — state logs identical across all logged turns")
