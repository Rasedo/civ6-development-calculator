"""H-3: the range reduction of TerrainBuilder.GetRandomNumber, one range at a
time, with the state pinned on both sides.

    python tools/civ6lab/h3_ranges.py --host 127.0.0.3 [--ranges 7,65535,...] [--random K]

The drawn sequence is [F F F F  r1  F F F F  r2  F F F F ...] with F = 32768:
every F group fixes the LCG state exactly (h3_fit.find_state), so each test
range sits between two known states — how many steps it consumed, and the
state it drew from. For each drawn test value the candidate reductions are
scored:
    hi15   ((s >> 17) * r16) >> 15      (the sync generator, README)
    hi16   ((s >> 16) * r) >> 16
    mod16  (s >> 16) % r
    mod15  (s >> 17) % r
    mulhi  (s * r) >> 32
One JSONL line per test range to runs/h3_ranges_<stamp>.jsonl.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import random
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner  # noqa: E402
from h3_fit import M32, find_state, step  # noqa: E402

GC = "GameCore_Tuner"
F = 32768
G = 4


def reductions(s: int, r: int) -> dict[str, int | None]:
    r16 = r & 0xFFFF
    ru = r & M32
    return {
        "hi15": ((s >> 17) * r16) >> 15,
        "hi16": ((s >> 16) * ru) >> 16 & M32 if ru else None,
        "hi16_32": (((s >> 16) * ru) & M32) >> 16 if ru else None,
        "hi16_r16": ((s >> 16) * r16) >> 16,
        "mod16": (s >> 16) % ru if ru else None,
        "mod15": (s >> 17) % ru if ru else None,
        "mulhi": (s * ru) >> 32,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--ranges", default="")
    p.add_argument("--random", type=int, default=0, help="add K random ranges in [1, 70000]")
    p.add_argument("--tag", default="")
    a = p.parse_args()
    tests = [int(x) for x in a.ranges.split(",") if x.strip()]
    rnd = random.Random(time.time())
    tests += [rnd.randint(1, 70000) for _ in range(a.random)]
    seq = [F] * G
    for r in tests:
        seq += [r] + [F] * G
    t = Tuner(a.host).connect()
    lua = ("local R = {" + ",".join(map(str, seq)) + "}\nlocal o = {}\n"
           "for i = 1, #R do o[#o+1] = tostring(TerrainBuilder.GetRandomNumber(R[i], 'civ6lab h3')) end\n"
           "print('D ' .. table.concat(o, ' '))")
    lines = t.run(GC, lua, timeout=60)
    t.close()
    got = [int(x) for x in next(ln for ln in lines if ln.startswith("D ")).split()[1:]]
    # the state after the LAST F of each group
    groups = []
    for k in range(len(tests) + 1):
        base = k * (G + 1)
        d = got[base: base + G]
        st = find_state(d, 1103515245, 12345)
        if len(st) != 1:
            groups.append(None)
            continue
        s = st[0]
        for _ in range(G - 1):
            s = step(s)
        groups.append(s)
    recs = []
    score = collections.Counter()
    for i, r in enumerate(tests):
        s_prev = groups[i]
        s_next_first = None
        # the state after the next group's FIRST F: find it from the next group
        if groups[i + 1] is not None:
            s_next_first = groups[i + 1]
            for _ in range(G - 1):
                s_next_first = (s_next_first - 12345) * pow(1103515245, -1, 1 << 32) & M32
        value = got[i * (G + 1) + G]
        steps = None
        if s_prev is not None and s_next_first is not None:
            s = s_prev
            for n in range(0, 8):
                if step(s) == s_next_first:
                    steps = n
                    break
                s = step(s)
        rec = {"range": r, "value": value, "steps": steps}
        if steps == 1:
            s_used = step(s_prev)
            red = reductions(s_used, r)
            rec["state"] = s_used
            rec["fits"] = [k for k, v in red.items() if v == value]
            for k in rec["fits"]:
                score[k] += 1
        recs.append(rec)
        print(json.dumps(rec))
    print("tests", len(tests), "one-step", sum(1 for x in recs if x["steps"] == 1), "fits", dict(score))
    out = HERE / "runs" / f"h3_ranges_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.jsonl"
    with out.open("w", encoding="utf-8") as f:
        for rec in recs:
            rec["tag"] = a.tag
            f.write(json.dumps(rec) + "\n")
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
