"""H-3: align a civ6lab_mapprobe log (h3_session.py --probe) against the
LCG stream from the map seed.

    python tools/civ6lab/h3_probelog.py runs/h3_session_<stamp>.jsonl [--line N]

The log is a list of entries: `P<tag>=a,b,c,d` (four GetRandomNumber(32768)
pins), `r:v:reason-id` (one Lua call), `M=...` (math.random). Pins fix the
state exactly, so each segment between two pins has a known step count N and
a known list of L Lua draws; N - L draws were taken by native code. A segment
with N == L is checked value by value; with N > L the one-gap placements that
fit every value are listed. The first pin is placed against the map seed.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_fit import M32, distance, find_state, step  # noqa: E402


def mapdraw(s_after: int, r: int) -> int:
    return ((s_after >> 16) * (int(r) & 0xFFFF)) >> 16


def parse(log: list[str]):
    for e in log:
        if e.startswith("P"):
            tag, _, vals = e[1:].rpartition("=")
            yield ("pin", tag, [int(x) for x in vals.split(",")])
        elif e.startswith("M="):
            yield ("math", e[2:], None)
        else:
            r, v, rid = e.split(":")
            yield ("lua", int(rid), (float(r), int(float(v))))


def analyse(rec: dict) -> dict:
    seed = rec["map_seed"] & M32
    reasons = {int(k): v for k, v in rec["probe"]["reasons"].items()}
    ents = list(parse(rec["probe"]["log"]))
    out = {"segments": [], "math_random": [e[1] for e in ents if e[0] == "math"]}
    s = seed  # the state before the next draw
    pending: list[tuple[int, int, int]] = []  # (rid, r, v) since the last pin
    prev_tag = "SEED"
    total_lua = collections.Counter()
    for kind, a, b in ents:
        if kind == "lua":
            pending.append((a, b[0], b[1]))
            total_lua[reasons.get(a, str(a))] += 1
            continue
        if kind != "pin":
            continue
        st = find_state(b, 1103515245, 12345)
        if len(st) != 1:
            out["segments"].append({"from": prev_tag, "to": a, "error": f"pin states {len(st)}"})
            break
        s1 = st[0]
        n = distance(s, s1, 1103515245, 12345, 1 << 31)
        steps = None if n is None else n - 1  # draws between the last known state and the pin
        seg = {"from": prev_tag, "to": a, "steps": steps, "lua": len(pending),
               "native": None if steps is None else steps - len(pending)}
        if steps is not None:
            k = steps - len(pending)
            # prefix: lua draw i taken at step i; suffix: at step i + k
            states = []
            x = s
            for _ in range(steps):
                x = step(x)
                states.append(x)
            pre = [mapdraw(states[i], r) == v for i, (_, r, v) in enumerate(pending)] if k >= 0 else []
            suf = [mapdraw(states[i + k], r) == v for i, (_, r, v) in enumerate(pending)] if k >= 0 else []
            fits = []
            if k >= 0:
                ok_pre = [True]
                for p in pre:
                    ok_pre.append(ok_pre[-1] and p)
                ok_suf = [True] * (len(pending) + 1)
                for i in range(len(pending) - 1, -1, -1):
                    ok_suf[i] = ok_suf[i + 1] and suf[i]
                fits = [j for j in range(len(pending) + 1) if ok_pre[j] and ok_suf[j]]
            seg["values_all_match_no_gap"] = (k == 0 and all(pre))
            if k > 0:
                seg["one_gap_positions"] = fits[:20]
                seg["one_gap_n"] = len(fits)
                if fits:
                    j = fits[0]
                    seg["gap_after"] = reasons.get(pending[j - 1][0]) if j > 0 else "(segment start)"
                    seg["gap_before"] = reasons.get(pending[j][0]) if j < len(pending) else "(segment end)"
            seg["lua_reasons"] = dict(collections.Counter(reasons.get(p[0], str(p[0])) for p in pending))
        out["segments"].append(seg)
        s = s1
        for _ in range(3):
            s = step(s)
        pending = []
        prev_tag = a
    out["lua_by_reason"] = dict(total_lua.most_common())
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--line", type=int, default=-1, help="the game line (default: every line with a probe)")
    a = p.parse_args()
    recs = [json.loads(ln) for ln in pathlib.Path(a.session).read_text(encoding="utf-8").splitlines() if ln.strip()]
    if a.line >= 0:
        recs = [recs[a.line]]
    for rec in recs:
        if "probe" not in rec:
            continue
        res = analyse(rec)
        print(f"== {rec['tag']} seed {rec['map_seed']} log entries {len(rec['probe']['log'])}")
        print("math.random:", res["math_random"])
        for seg in res["segments"]:
            print(json.dumps({k: v for k, v in seg.items() if k != "lua_reasons"}))
        out = pathlib.Path(a.session).with_name(pathlib.Path(a.session).stem + f"_{rec['tag']}_align.json")
        out.write_text(json.dumps(res, indent=1), encoding="utf-8")
        print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
