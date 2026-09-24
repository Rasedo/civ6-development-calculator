"""ASK 14: read an escape run log and test what the escape 'chance' is a
chance OUT OF.

Input: the `mission ...` lines `spy_history.lua` prints (one per completed
mission, fields k=v). A must-escape mission (InitialResult 3 or 4, i.e.
SUCCESS_MUST_ESCAPE / FAIL_MUST_ESCAPE) resolves to EscapeResult:
    2  FAIL_MUST_ESCAPE  -> the spy ESCAPED (the UI's own decode)
    5  KILLED
    1  CAPTURED
The route of each escape is the one `unblock.lua` answered the prompt with
(its `escape route ...` log line, joined by spy name and turn); a log with
no such line counts as "unlogged". A successful mission promotes the spy
first (LevelAfter one higher) but the level counts only once the promotion
is taken, so the level is the one the prompt line reads.
Takes one or more logs.

The install's terms are all LEVELS: ESPIONAGE_ESCAPE_BASE_CHANCE 10,
_LEVEL_BOOST +1 per spy level, _COUNTERSPY_LEVEL_MODIFIER -1 per counterspy
level (none here), _POLICE_CORRECT_MODIFIER -4 when the police guess the
route. Candidate readings, printed against the measured rate:
  percent     : escape = 10 + level percent            (~11-12%)
  3d6 >= T    : escape = P(3d6 >= 10 - level)          (level 1: 74%, level 2: 84%)
  3d6 <= T    : escape = P(3d6 <= 10 + level)          (level 1: 63%, level 2: 74%)
  with the police guessing the single available route every time, subtract
  4 from the level term in the dice readings (3d6 >= 14-level: 9%/16%;
  3d6 <= 6+level: 16%/26%).
"""
from __future__ import annotations

import itertools
import re
import sys
from collections import Counter

# EspionageResultTypes as the game numbers them, DERIVED from the first
# batch: the history's tally lines decode through the live enum, and the
# raw rows pair with them — every success row carries LevelAfter=2, so 4
# and 5 are the two success codes (3x SUCCESS_MUST_ESCAPE, 2x
# SUCCESS_UNDETECTED), 2 and 3 the failures (3x FAIL_MUST_ESCAPE, 2x
# FAIL_UNDETECTED), 1 the lone CAPTURED. KILLED never occurred in that batch;
# it is whichever code is left (0 or 6) and is read as such below.
RAW = {1: "CAPTURED", 2: "FAIL_MUST_ESCAPE", 3: "FAIL_UNDETECTED", 4: "SUCCESS_MUST_ESCAPE",
       5: "SUCCESS_UNDETECTED", 0: "KILLED", 6: "KILLED", -1: "NO_RESULT"}


def p3d6_ge(t: int) -> float:
    return sum(1 for r in itertools.product(range(1, 7), repeat=3) if sum(r) >= t) / 216


def p3d6_le(t: int) -> float:
    return sum(1 for r in itertools.product(range(1, 7), repeat=3) if sum(r) <= t) / 216


ROUTE = re.compile(r"escape route (DISTRICT_\w+) of (\d+) for spy (\d+) (\S+) level (\d+) turn (\d+)")


def main(paths: list[str]) -> int:
    rows = {}
    routes = {}
    for path in paths:
        for line in open(path, encoding="utf-8", errors="replace"):
            m = ROUTE.search(line)
            if m:
                routes.setdefault((path, m.group(4)), []).append(
                    (int(m.group(6)), int(m.group(3)), f"{m.group(1)} of {m.group(2)}", int(m.group(5))))
                continue
            # only the RAW history lines (they carry PlotIndex); the summary
            # lines some run scripts sed down lose fields and would double count
            if not line.startswith("mission ") or "PlotIndex=" not in line:
                continue
            d = dict(kv.split("=", 1) for kv in line.split()[1:] if "=" in kv)
            d["_log"] = path
            key = (path, d.get("Name"), d.get("CompletionTurn"), d.get("CityName"), d.get("PlotIndex"))
            rows[key] = d      # the last print of a mission wins (results fill in later)
    # A prompt is answered again on the following turn(s) until the game
    # clears it, and it comes up to a few turns after the mission's
    # CompletionTurn; the route is a function of the spy's id, so the repeats
    # agree. Collapse each spy's repeats into one prompt, then pair a name's
    # must-escape missions with its prompts in turn order.
    prompts = {}
    for key, evs in routes.items():
        out = []
        for turn, sid, route, lvl in sorted(evs):
            if out and out[-1][1] == sid and turn - out[-1][3] <= 1:
                out[-1][3] = turn
                continue
            out.append([turn, sid, route, turn, lvl])
        prompts[key] = out
    must = sorted((int(d.get("CompletionTurn", -1)), k) for k, d in rows.items()
                  if RAW.get(int(d.get("InitialResult", -1))) in ("SUCCESS_MUST_ESCAPE", "FAIL_MUST_ESCAPE"))
    route_of = {}
    for ct, k in must:
        d = rows[k]
        queue = prompts.get((d["_log"], d.get("Name")), [])
        while queue and queue[0][0] < ct:
            queue.pop(0)
        if queue:
            p = queue.pop(0)
            route_of[k] = (p[2], p[4], p[0] - ct)
    esc = Counter()
    by_level = {1: Counter(), 2: Counter(), 3: Counter(), 4: Counter()}
    by_route = {}
    by_lag = {}
    by_n = {}
    for k, d in rows.items():
        init = RAW.get(int(d.get("InitialResult", -1)), "?")
        res = RAW.get(int(d.get("EscapeResult", -1)), "?")
        if init not in ("SUCCESS_MUST_ESCAPE", "FAIL_MUST_ESCAPE"):
            continue
        # the level the spy HAS at the prompt (a promotion is only a level
        # once taken; LevelAfter counts it as soon as it is earned)
        route, lvl, lag = route_of.get(k, ("unlogged", int(d.get("LevelAfter", 1)), -1))
        out = {"FAIL_MUST_ESCAPE": "escaped", "CAPTURED": "captured", "KILLED": "killed", "NO_RESULT": "pending"}.get(res, res)
        esc[out] += 1
        by_level.setdefault(lvl, Counter())[out] += 1
        by_route.setdefault((route, lvl), Counter())[out] += 1
        by_lag.setdefault(min(lag, 3), Counter())[out] += 1
        by_n.setdefault(route.split(" of ")[-1] if " of " in route else "?", Counter())[out] += 1
    n = sum(v for k, v in esc.items() if k != "pending")
    print(f"missions parsed: {len(rows)}; must-escape: {sum(esc.values())}; resolved: {n}; pending: {esc['pending']}")
    print("outcomes:", dict(esc))
    for lvl, c in by_level.items():
        m = sum(v for k, v in c.items() if k != "pending")
        if m:
            print(f"  level {lvl}: escaped {c['escaped']}/{m} = {c['escaped']/m:.2f}  (captured {c['captured']}, killed {c['killed']})")
    if n:
        print(f"overall escaped {esc['escaped']}/{n} = {esc['escaped']/n:.2f}")
    print("by the prompt's lag after CompletionTurn (3 = 3 or more, -1 = unlogged):")
    for lag, c in sorted(by_lag.items()):
        m = sum(v for k, v in c.items() if k != "pending")
        if m:
            print(f"  lag {lag:2d}: escaped {c['escaped']}/{m} = {c['escaped']/m:.2f}  (captured {c['captured']}, killed {c['killed']})")
    print("by the number of routes the city offered (a uniform police guess predicts 1 - 1/n):")
    for n_, c in sorted(by_n.items()):
        m = sum(v for k, v in c.items() if k != "pending")
        if m:
            print(f"  {n_} route(s): escaped {c['escaped']}/{m} = {c['escaped']/m:.2f}"
                  f"  (captured {c['captured']}, killed {c['killed']})")
    print("by route and level:")
    for (route, lvl), c in sorted(by_route.items()):
        m = sum(v for k, v in c.items() if k != "pending")
        if m:
            print(f"  {route:31s} level {lvl}: escaped {c['escaped']}/{m} = {c['escaped']/m:.2f}"
                  f"  (captured {c['captured']}, killed {c['killed']})")
    print("\ncandidate readings (level 1 / level 2):")
    print(f"  percent 10+level              : {0.11:.2f} / {0.12:.2f}")
    print(f"  3d6 >= 10-level               : {p3d6_ge(9):.2f} / {p3d6_ge(8):.2f}")
    print(f"  3d6 <= 10+level               : {p3d6_le(11):.2f} / {p3d6_le(12):.2f}")
    print(f"  3d6 >= 10-level, police -4    : {p3d6_ge(13):.2f} / {p3d6_ge(12):.2f}")
    print(f"  3d6 <= 10+level, police -4    : {p3d6_le(7):.2f} / {p3d6_le(8):.2f}")
    print(f"  3d6 >= 10 flat                : {p3d6_ge(10):.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
