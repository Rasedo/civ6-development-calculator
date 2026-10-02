"""H-2 hold: check a stepped watch (`watch.py --observer --step`) from its
records — the result file's holds and skips, the turns its GameCore reader
(`h2h_sig.lua`) and InGame reader (`h2h_igturn.lua`) logged (each turn once,
consecutive, the two states agreeing), and the wall time per turn from the
watch log's `turn N at <epoch>` lines, against a free-running baseline
(`h2h_step.py --hold-at` record of the same seeds) over the same turns.

    python tools/civ6lab/h2h_watchfit.py --result runs/h2h_watch_step_result.json \\
        --log .claude/scratchpad/h2h_watch2.log --baseline runs/h2h_hold_A.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
import statistics as st


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--result", required=True)
    p.add_argument("--log", required=True)
    p.add_argument("--baseline")
    a = p.parse_args()
    res = json.load(open(a.result, encoding="utf-8"))
    print(f"watch: turns {res['start_turn']} -> {res['turn']} (target {res['target']}), end {res['end']},"
          f" step {res.get('step')}, holds {res.get('holds')}, skips {res.get('skips')}")
    gc = [int(re.match(r"turn (-?\d+)", ln).group(1))
          for ln in open(next(r for r in res["readers"] if "h2h_sig" in r), encoding="utf-8") if ln.startswith("turn ")]
    ig = [json.loads(ln)["ig_turn"] for ln in open(next(r for r in res["readers"] if "h2h_igturn" in r), encoding="utf-8")
          if ln.startswith("{")]
    gaps = [y - x for x, y in zip(gc, gc[1:])]
    print(f"GameCore reader: {len(gc)} reads, turns {gc[0]} -> {gc[-1]}, every gap 1: {all(g == 1 for g in gaps)}"
          f" (gaps other than 1: {[(x, y) for x, y in zip(gc, gc[1:]) if y - x != 1]})")
    print(f"InGame reader equal to GameCore reader on every read: {ig == gc}")
    stamps = {int(m.group(1)): float(m.group(2))
              for m in re.finditer(r"^turn (\d+) at ([\d.]+)", open(a.log, encoding="utf-8").read(), re.M)}
    ts = sorted(stamps)
    per = [stamps[b] - stamps[x] for x, b in zip(ts, ts[1:])]
    print(f"stepped wall: turns {ts[0]} -> {ts[-1]}, mean {(stamps[ts[-1]] - stamps[ts[0]]) / (ts[-1] - ts[0]):.3f} s/turn,"
          f" median {st.median(per):.3f}, max {max(per):.3f}")
    if a.baseline:
        hold = next(json.loads(ln) for ln in open(a.baseline, encoding="utf-8") if '"hold"' in ln)
        ch = {tn: w for w, tn in hold["changes"]}
        lo, hi = max(ts[0], min(ch)), min(ts[-1], max(ch))
        free = (ch[hi] - ch[lo]) / (hi - lo)
        step = (stamps[hi] - stamps[lo]) / (hi - lo)
        print(f"same turns {lo} -> {hi}: free run {free:.3f} s/turn, stepped {step:.3f} s/turn,"
              f" overhead {step - free:.3f} s/turn")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
