"""C-16-S1 (lab, host 4): make --p local, poll an InGame Lua file (with --set
tokens) every second until its output contains --until (or --polls run
out), optionally run --then once (another Lua file, same tokens), and make
seat 0 local again. Every line goes to stdout; one deadline.

    python tools/civ6lab/c16w_poll.py --p 1 --file tools/civ6lab/c16s1_defender.lua --set ZMODE=read --until own-targets\\ 5
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402

GC, IG = "GameCore_Tuner", "InGame"


def sub(path: str, sets: list[str]) -> str:
    code = pathlib.Path(path).read_text(encoding="utf-8")
    for kv in sets:
        k, v = kv.split("=", 1)
        code = code.replace(k, v)
    return code


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--p", type=int, required=True)
    ap.add_argument("--file", required=True)
    ap.add_argument("--set", action="append", default=[])
    ap.add_argument("--until", default="")
    ap.add_argument("--polls", type=int, default=40)
    ap.add_argument("--then", default="")
    ap.add_argument("--then-set", action="append", default=[])
    ap.add_argument("--stay", action="store_true", help="leave --p local")
    ap.add_argument("--deadline", type=float, default=120.0)
    a = ap.parse_args(argv)
    h4.guard(a.deadline, "c16w_poll")
    t = h4.connect(a.host)
    print("turn", t.run(GC, "print(Game.GetCurrentGameTurn())")[0], flush=True)
    t.run(GC, f"PlayerManager.SetLocalPlayerAndObserver({a.p})")
    try:
        code = sub(a.file, a.set)
        last: list[str] = []
        for i in range(a.polls):
            out = t.run(IG, code, timeout=20)
            if out != last:
                print(f"[poll {i}]", *out, sep="\n  ", flush=True)
                last = out
            if a.until and any(a.until in ln for ln in out):
                break
            time.sleep(1.0)
        if a.then:
            for ln in t.run(IG, sub(a.then, a.then_set), timeout=20):
                print("then:", ln, flush=True)
            time.sleep(1.5)
            for ln in t.run(IG, code, timeout=20):
                print("after:", ln, flush=True)
    finally:
        if not a.stay:
            t.run(GC, "PlayerManager.SetLocalPlayerAndObserver(0)")
        print("local", t.run(IG, "print(Game.GetLocalPlayer())")[0], "turn",
              t.run(GC, "print(Game.GetCurrentGameTurn())")[0], flush=True)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
