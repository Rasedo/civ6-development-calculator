"""C-16 (lab, host 4): the counterspy's mission term and the escape, from
`c16n_cycle.py` logs, arm by arm.

A mission (`spy_history.lua`'s `mission` lines; the last print of each wins,
since the escape result fills in later) is one 3d6 R read in six bands of
d = R - guard - T, T = BaseProbability 13 - 2 - (level - 1), the level the
spy read on the turn it STARTED the mission (its `spy ... level L ... start`
line). The arm is the defender's post at the start of the completion turn's
predecessor (its `defender ... at X:Y level L op OP` line): the post plot, or
`none` when no counterspy operation stands. For each arm the guard shift s is
fitted (logL per s = 0..8).

The escapes: every `escape route` line (`unblock.lua`: route, routes on
offer, spy id, name, level, turn, pursuer) paired with the mission's
EscapeResult (2 escaped, 1 captured, 0/6 killed). Printed per arm and route
count with the two readings of the DLL's level field (GetLevel, or GetLevel
- 1), v = 10 - (field - 1), escaped at 3d6 >= v, + 4 on a right police
guess, the police weight 5 - TravelTime.

    python tools/civ6lab/c16n_fit.py tools/civ6lab/runs/escape_cs_c16n_l1hub.log [...]
"""
from __future__ import annotations

import itertools
import math
import re
import sys
from collections import defaultdict

P = [0.0] * 19
for r in itertools.product(range(1, 7), repeat=3):
    P[sum(r)] += 1 / 216
CODE = {5: 0, 4: 1, 3: 2, 2: 3, 1: 4, 0: 5, 6: 5}
NAMES = ["succ-undet", "succ-esc", "fail-undet", "fail-esc", "captured", "killed"]
TRAVEL = {"DISTRICT_CITY_CENTER": 1, "DISTRICT_COMMERCIAL_HUB": 2, "DISTRICT_HARBOR": 3, "DISTRICT_AERODROME": 4}

START = re.compile(r"^spy (\d+) (\S+) level (\d+) at (-?\d+):(-?\d+) start")
SUMMARY = re.compile(r"^turn (\d+) spies \d+ started")
DEF = re.compile(r"^defender (\d+) at (-?\d+):(-?\d+) level (\d+) op (\S+)")
GRAB = re.compile(r"(?:grabbed p\d+|after): def: spy (\d+) at (-?\d+):(-?\d+) level (\d+) xp \d+ promos \S* ?op (\S+)")
ROUTE = re.compile(r"escape route (DISTRICT_\w+) of (\d+) for spy (\d+) (\S+) level (\d+) turn (\d+) city \S+ \S+ at \S+ pursuer (.+)$")


def band(d: int) -> int:
    return 0 if d >= 2 else 1 if d >= 0 else 2 if d == -1 else 3 if d >= -3 else 4 if d >= -5 else 5


def band_probs(t: int) -> list[float]:
    b = [0.0] * 6
    for r in range(3, 19):
        b[band(r - t)] += P[r]
    return b


def ge(v: int) -> float:
    return sum(P[r] for r in range(max(3, v), 19))


def read(paths):
    missions = {}
    starts = defaultdict(list)       # name -> [(turn, level)]
    arm_at = {}                      # turn -> arm
    routes = []
    for path in paths:
        buf, dline, cur = [], None, None
        for ln in open(path, encoding="utf-8", errors="replace"):
            ln = ln.rstrip("\n")
            # the defender's post as the grab left it: the state the turn's
            # missions resolve against (overrides the turn-start read)
            m = GRAB.search(ln)
            if m and cur is not None:
                on = "COUNTERSPY" in m.group(5)
                arm_at[cur] = (f"{m.group(2)}:{m.group(3)}" if on else "none", int(m.group(4)))
                continue
            if "no grab of p" in ln and cur is not None:
                arm_at[cur] = ("unhooked", -1)
                continue
            m = START.match(ln)
            if m:
                buf.append((m.group(2), int(m.group(3))))
                continue
            m = DEF.match(ln)
            if m:
                dline = m
                continue
            m = SUMMARY.match(ln)
            if m:
                tn = int(m.group(1))
                cur = tn
                for name, lv in buf:
                    starts[name].append((tn, lv))
                buf = []
                if dline is not None:
                    on = "COUNTERSPY" in dline.group(5)
                    arm_at[tn] = (f"{dline.group(2)}:{dline.group(3)}" if on else "none", int(dline.group(4)))
                    dline = None
                continue
            m = ROUTE.search(ln)
            if m:
                routes.append(dict(route=m.group(1), n=int(m.group(2)), id=m.group(3), name=m.group(4),
                                   level=int(m.group(5)), turn=int(m.group(6)), pursuer=m.group(7).strip()))
                continue
            if ln.startswith("mission ") and "PlotIndex=" in ln:
                kv = dict(x.split("=", 1) for x in ln[8:].split() if "=" in x)
                missions[(kv["Name"], int(kv["CompletionTurn"]), kv["PlotIndex"])] = kv
    return missions, starts, arm_at, routes


def main(paths: list[str]) -> None:
    missions, starts, arm_at, routes = read(paths)
    rows = []
    for (name, ct, _), kv in sorted(missions.items(), key=lambda x: x[0][1]):
        st = [s for s in starts.get(name, []) if s[0] < ct]
        if not st:
            continue
        ts, lv = st[-1]
        arm = arm_at.get(ct - 1, arm_at.get(ct))
        rows.append(dict(name=name, ct=ct, ts=ts, lv=lv, arm=arm, out=CODE[int(kv["InitialResult"])],
                         esc=int(kv.get("EscapeResult", -1))))
    size = defaultdict(int)
    for r in rows:
        size[r["ct"]] += 1
    by = defaultdict(list)
    for r in rows:
        by[r["arm"]].append(r)
        # a mission that resolved alone in its turn: no earlier resolution of
        # the same turn can have moved the post
        if size[r["ct"]] == 1:
            by[(r["arm"], "alone")].append(r)
    for arm, rs in sorted(by.items(), key=lambda x: str(x[0])):
        obs = [sum(r["out"] == i for r in rs) for i in range(6)]
        lvls = sorted({r["lv"] for r in rs})
        print(f"== arm {arm}: {len(rs)} missions, attacker levels {lvls}, bands {dict(zip(NAMES, obs))}")
        best = None
        for s in range(0, 9):
            ll = sum(math.log(max(band_probs(11 + (r["lv"] - 1) + s)[r["out"]], 1e-12)) for r in rs)
            best = max(best or (ll, s), (ll, s))
            print(f"   shift {s}: logL {ll:.2f}")
        print(f"   best shift {best[1]}")
    # escapes: pair each route line (first per spy+turn) with a must-escape mission of that name
    seen = set()
    esc = []
    for rt in routes:
        key = (rt["id"], rt["name"])
        if key in seen:
            continue
        seen.add(key)
        cands = [r for r in rows if r["name"] == rt["name"] and r["out"] in (1, 3) and r["ct"] <= rt["turn"] <= r["ct"] + 3]
        if not cands:
            continue
        r = cands[-1]
        esc.append(dict(rt, arm=r["arm"], result=r["esc"]))
    grp = defaultdict(list)
    for e in esc:
        grp[(e["arm"], e["n"], e["pursuer"] != "police")].append(e)
    print("== escapes (result 2 escaped, 1 captured, 0/6 killed, -1 unresolved)")
    for (arm, n, cs), es in sorted(grp.items(), key=lambda x: str(x[0])):
        done = [e for e in es if e["result"] >= 0]
        k = sum(e["result"] == 2 for e in done)
        cap = sum(e["result"] == 1 for e in done)
        pred = {}
        for base in (1, 0):
            p = 0.0
            for e in done:
                w_own = 5 - TRAVEL[e["route"]]
                # n routes: centre + hub here; the police weight 5 - TravelTime
                tot = sum(5 - TRAVEL[d] for d in (["DISTRICT_CITY_CENTER", "DISTRICT_COMMERCIAL_HUB"] if n == 2 else ["DISTRICT_CITY_CENTER"]))
                pg = w_own / tot
                field = e["level"] if base == 1 else e["level"] - 1
                v = 10 - (field - 1)
                p += pg * ge(v + 4) + (1 - pg) * ge(v)
            pred[base] = p
        print(f"   arm {arm} routes {n} pursuer-counterspy {cs}: {len(done)} resolved ({len(es) - len(done)} open), "
              f"escaped {k}, captured {cap}, killed {len(done) - k - cap}; predicted escaped "
              f"field=GetLevel {pred[1]:.1f}, field=GetLevel-1 {pred[0]:.1f}")
        for e in done:
            print(f"      t{e['turn']} {e['name']} L{e['level']} {e['route']} -> {e['result']} ({e['pursuer']})")


if __name__ == "__main__":
    main(sys.argv[1:])
