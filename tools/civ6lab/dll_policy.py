"""B-D: the policy-unlock price as GameCore_XP2_Release.dll codes it
(PlayerCulture::GetCostToUnlockPolicies 0x398e70, the escalation 0x5267a0
type 1, the progress 0x399810 civics / 0x4c9cf0 techs), scored on every
lab read of the price (bds3 ladders, bds4 probe, bds2 control).

    python tools/civ6lab/dll_policy.py [--nt 77 --nc 61] [--scan] [--miss]

The rule:
  0 when the government has an empty policy slot (0x398e94 loop) or the
    culture's no-cost flag is set;
  p = max(100 C // NC, 100 T // NT)   (C, T the civics and techs held of
    the NC, NT the game offers; integer percent, truncated);
  E(x) = x + ((x * GAME_COST_ESCALATION // 100) - x) * p // 100
         (GAME_COST_ESCALATION 1000; C truncating divisions);
  price = max(E(CivicUnlockMaxCost) - s * E(CivicUnlockPerTurnDrop),
              E(CivicUnlockMinCost))
    (Online 50 / 5 / 10; s = the game turn - the turn of the last civic - 1,
    as the lab's s counts it);
  halved when GOVERNMENT_UNLOCK_WITH_FAITH (false);
  price -= price % PURCHASE_DIVISOR (5): rounded DOWN to a multiple of 5.
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, HERE.as_posix())
from bds3_fit import ladders  # noqa: E402
from bds4_kt import LAST_CIVIC, RUNS, s_of  # noqa: E402

ESC = 1000
# bds4_probe's civic+1 phase: on some seats the grant stamps this turn as the
# last civic (s = -1: the price
# jumps by E(drop)); the other seats keep their s. Per seat, read off the fit
# (each seat fits under one reading on every row).
GRANT_RESETS = {1: True, 4: True, 5: True, 7: True, 2: False, 3: False, 6: False}
MAX, DROP, MIN = 50, 5, 10


def tdiv(a: int, b: int) -> int:
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def esc(x: int, p: int) -> int:
    return x + tdiv((tdiv(x * ESC, 100) - x) * p, 100)


def price(T: int, C: int, s: int, nt: int, nc: int) -> int:
    p = max(tdiv(100 * C, nc), tdiv(100 * T, nt))
    v = max(esc(MAX, p) - s * esc(DROP, p), esc(MIN, p))
    return v - v % 5


def reads():
    """(T, C, s, price, source) for every price read with a known s"""
    out = []
    for path in sorted(glob.glob(str(RUNS / "bds3_ladder_*.jsonl"))):
        for (_, d, turn, p), seq in ladders([path]).items():
            s = s_of(p, turn)
            for t, cost, c, tech in seq:
                out.append((t, c, s, cost, f"ladder{d:+d} t{turn} p{p}"))
    for path in sorted(glob.glob(str(RUNS / "bds4_probe_*.jsonl"))):
        recs = [json.loads(l) for l in open(path, encoding="utf-8")]
        turn = recs[0]["turn"]
        for x in recs[0]["price"]:
            if x["p"] in LAST_CIVIC:
                out.append((x["techs"], x["civics"], s_of(x["p"], turn), x["cost"], f"probe-base t{turn} p{x['p']}"))
        steps = [r for r in recs if r["kind"] in ("step", "final")]
        granted = set()  # a civic granted mid-turn stamps the current turn: s = -1
        for a, b in zip(steps, steps[1:]):
            after = {st["p"]: (st["T"], st["C"]) for st in b["step"]}
            if a["phase"].startswith("civic+1"):
                granted |= {st["p"] for st in a["step"] if st.get("call") is True}
            for x in a["price"]:
                if x["p"] in after and x["p"] in LAST_CIVIC:
                    s = s_of(x["p"], turn)
                    if x["p"] in granted and GRANT_RESETS.get(x["p"]):
                        s = -1
                    out.append((*after[x["p"]], s, x["cost"], f"probe t{turn} p{x['p']} {a['phase']}"))
    for path in sorted(glob.glob(str(RUNS / "bds2_policy_*.jsonl"))):
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            for x in r.get("price", []) if isinstance(r.get("price"), list) else []:
                if x.get("kind") == "policy" and x["p"] in LAST_CIVIC and x["turn"] >= 145:
                    try:
                        s = s_of(x["p"], x["turn"])
                    except ValueError:
                        continue
                    out.append((x["techs"], x["civics"], s, x["cost"], f"bds2 t{x['turn']} p{x['p']}"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--nt", type=int, default=77)
    ap.add_argument("--nc", type=int, default=61)
    ap.add_argument("--scan", action="store_true")
    ap.add_argument("--miss", action="store_true")
    a = ap.parse_args()
    rows = [r for r in reads() if r[3] > 0]
    print(len(rows), "reads with a price > 0;", len({r[:4] for r in rows}), "distinct (T, C, s, price)")
    if a.scan:
        res = []
        for nt in range(60, 95):
            for nc in range(45, 75):
                res.append((sum(price(t, c, s, nt, nc) == v for t, c, s, v, _ in rows), nt, nc))
        print("best (fit, NT, NC):", sorted(res, reverse=True)[:8])
    ok = [r for r in rows if price(r[0], r[1], r[2], a.nt, a.nc) == r[3]]
    print(f"NT {a.nt} NC {a.nc}: {len(ok)}/{len(rows)} reads exact")
    by_src = collections.Counter(r[4].split()[0] for r in rows)
    ok_src = collections.Counter(r[4].split()[0] for r in ok)
    print("  by source:", {k: f"{ok_src[k]}/{v}" for k, v in by_src.items()})
    if a.miss:
        for t, c, s, v, src in rows:
            pr = price(t, c, s, a.nt, a.nc)
            if pr != v:
                print(f"   miss {src}: T{t} C{c} s{s} read {v} rule {pr}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
