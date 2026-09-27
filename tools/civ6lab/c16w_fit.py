"""C-16-S1 (lab, host 4): the escapes of `c16w_cycle.py` logs split by the
pursuer the prompt named (the police, or the counterspy by name), the route
answered and the spy's level, each against the shipped model and the
counterspy reading:

  police       escape iff 3d6 <= 10 + L (- 4 when the police guess the route),
               the guess uniform over the n offered routes
  counterspy   the same with - c for a level-c counterspy
               (ESPIONAGE_ESCAPE_COUNTERSPY_LEVEL_MODIFIER -1 per level)

A must-escape mission pairs with its prompt by the spy's name and the turn
(the prompt's turn = CompletionTurn). EscapeResult 2 = escaped, 1 = captured,
0 / 6 = killed (escape_fit.py's decoding).

    python tools/civ6lab/c16w_fit.py --counterspy-level 3 tools/civ6lab/runs/escape_cs_c16w_guard3b.log
"""
from __future__ import annotations

import argparse
import itertools
import math
import re
from collections import defaultdict

ROUTE = re.compile(r"escape route (DISTRICT_\w+) of (\d+) for spy (\d+) (\S+) level (\d+) turn (\d+) city .* pursuer (.+)$")


def p_le(t: int) -> float:
    return sum(1 for r in itertools.product(range(1, 7), repeat=3) if sum(r) <= t) / 216


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--counterspy-level", type=int, default=3)
    ap.add_argument("logs", nargs="+")
    a = ap.parse_args()
    missions: dict[tuple[str, int], dict] = {}
    prompts = []
    for path in a.logs:
        for ln in open(path, encoding="utf-8"):
            ln = ln.rstrip("\n")
            m = ROUTE.search(ln)
            if m:
                prompts.append({"route": m.group(1), "n": int(m.group(2)), "id": int(m.group(3)), "name": m.group(4),
                                "level": int(m.group(5)), "turn": int(m.group(6)), "pursuer": m.group(7).strip()})
            elif ln.startswith("mission "):
                kv = dict(x.split("=", 1) for x in ln[8:].split() if "=" in x)
                key = (kv.get("Name"), int(kv.get("CompletionTurn", -1)))
                missions[key] = kv
    seen = set()
    rows = []
    for p in prompts:
        key = (p["name"], p["turn"])
        if key in seen:
            continue
        seen.add(key)
        m = missions.get(key)
        er = int(m["EscapeResult"]) if m else None
        out = {2: "escaped", 1: "captured", 0: "killed", 6: "killed"}.get(er, "unresolved")
        rows.append({**p, "out": out})
    c = a.counterspy_level
    cells = defaultdict(list)
    for r in rows:
        who = "police" if r["pursuer"] == "police" else "counterspy"
        cells[(who, r["route"], r["level"], r["n"])].append(r["out"])
        cells[(who, "ALL", r["level"], r["n"])].append(r["out"])
    print(f"prompts {len(rows)}")
    for (who, route, lv, n), outs in sorted(cells.items()):
        k = sum(o == "escaped" for o in outs)
        res = [o for o in outs if o != "unresolved"]
        mod = 0 if who == "police" else c
        right, wrong = p_le(10 + lv - mod - 4), p_le(10 + lv - mod)
        pred = right / n + wrong * (n - 1) / n
        pol = p_le(10 + lv - 4) / n + p_le(10 + lv) * (n - 1) / n
        ll = ""
        if res and route == "ALL":
            kk = sum(o == "escaped" for o in res)
            lm = kk * math.log(pred) + (len(res) - kk) * math.log(1 - pred)
            lp = kk * math.log(pol) + (len(res) - kk) * math.log(1 - pol)
            ll = f"  logL(term {mod}) - logL(no term) = {lm - lp:+.2f}"
        print(f"  {who:10s} {route:24s} level {lv} routes {n}: escaped {k}/{len(res)}"
              f" ({dict((o, outs.count(o)) for o in set(outs))})  predicted with -{mod}: {pred:.3f}, police model {pol:.3f}{ll}")
    for r in rows:
        print("   ", r["turn"], r["name"], "L" + str(r["level"]), r["route"], "pursuer", r["pursuer"], "->", r["out"])


if __name__ == "__main__":
    main()
