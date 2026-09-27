"""C-1: the nuclear accident's draws, by seed accounting (no load; the caller
loads `reactor_base` first).

    python tools/civ6lab/c1d_run.py --host 127.0.0.4 --k 0 --event RANDOM_EVENT_NUCLEAR_ACCIDENT_MINOR \
        --prep repair --seeds 1001 1002 --tag c1d

Per seed: c1d_fire.lua (prepare, set seed, ApplyEvent, seed back); the draws
between the two seeds are counted by stepping the game's LCG, and each draw's
value on the ranges 100 and 36 (a d100 roll, a 20..50 band) is listed. Appends
to runs/c1d_draws.jsonl.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import pair_run  # noqa: E402

HERE = pathlib.Path(__file__).parent
REC = HERE / "runs" / "c1d_draws.jsonl"
M, A, C = 1 << 32, 1103515245, 12345


def to_u(s: int) -> int:
    return s % M


def draws(s0: int, s1: int, cap: int = 2000) -> list[int] | None:
    s, out = to_u(s0), []
    t = to_u(s1)
    for _ in range(cap + 1):
        if s == t:
            return out
        s = (A * s + C) % M
        out.append(s)
    return None


def val(state: int, rng: int) -> int:
    return ((state >> 17) * rng) >> 15


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--k", type=int, default=0)
    p.add_argument("--event", required=True)
    p.add_argument("--prep", default="repair")
    p.add_argument("--seeds", type=int, nargs="+", required=True)
    p.add_argument("--tag", default="c1d")
    a = p.parse_args()
    h4.guard(160, "c1d")
    t = h4.connect(a.host)
    for seed in a.seeds:
        tok = {"ZK": str(a.k), "ZEVENT": a.event, "ZPREP": a.prep, "ZSEED": str(seed)}
        out = pair_run.run_lua(t, "GameCore", pair_run.snippet("c1d_fire.lua", None, tok), timeout=60)
        if not out["json"]:
            print("ERR", out)
            continue
        r = out["json"][0]
        d = draws(seed, int(r["seed1"]))
        r["ndraws"] = None if d is None else len(d)
        r["d100"] = None if d is None else [val(s, 100) for s in d]
        r["tag"] = a.tag
        with REC.open("a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
        b, af = r["before"], r["after"]
        chg = {k: (b[k], af[k]) for k in af if b.get(k) != af.get(k)}
        print(f"k{a.k} {a.event.split('_')[-1]} {a.prep} seed {seed}: draws {r['ndraws']} d100 {r['d100']} changed {chg}")
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
