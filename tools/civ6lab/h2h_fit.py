"""H-2 hold: summarise `h2h_step.py` records — the free-running baseline of a
single hold (`--hold-at`), the step run's skips, stillness, turn agreement and
timing, and whether the two games' signatures agree at a common held turn.

    python tools/civ6lab/h2h_fit.py runs/h2h_hold_A.jsonl runs/h2h_step_B.jsonl
"""
from __future__ import annotations

import json
import statistics as st
import sys


def load(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(ln) for ln in f if ln.strip()]


def main() -> int:
    a, b = load(sys.argv[1]), load(sys.argv[2])
    hold = next(d for d in a if d["kind"] == "hold")
    ch = hold["changes"]
    gaps = [y[0] - x[0] for x, y in zip(ch, ch[1:])]
    print(f"free run: turns {ch[0][1]} -> {ch[-1][1]}, mean {(ch[-1][0] - ch[0][0]) / (ch[-1][1] - ch[0][1]):.3f} s/turn,"
          f" median {st.median(gaps):.3f}; held {hold['held']} (wanted {hold['want']}), gc {hold['gc']} ig {hold['ig']}")
    s = [d for d in b if d["kind"] == "step"]
    r = [x["release_to_hold_s"] for x in s]
    rd = [x["read_s"] for x in s]
    print(f"steps {len(s)} (held {s[0]['held']} -> {s[-1]['next_held']}): skips {sum(x['skip'] for x in s)},"
          f" next == held + 1 {sum(x['next_held'] == x['held'] + 1 for x in s)},"
          f" still while held {sum(x['still'] for x in s)}, gc == ig == held {sum(x['gc'] == x['ig'] == x['held'] for x in s)}")
    print(f"release -> next hold: mean {st.mean(r):.3f} s, median {st.median(r):.3f}, max {max(r):.3f};"
          f" reads mean {st.mean(rd):.3f} s")
    common = [x for x in s if x["held"] == hold["held"]]
    if common:
        print(f"signature at {hold['held']} equal across the two games: {common[0]['sig'] == hold['sig']}")
        print("   free run:", hold["sig"])
        print("   stepped :", common[0]["sig"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
