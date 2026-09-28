"""C-16: the spy's escape as GameCore_XP2_Release.dll codes it
(Rules_Espionage ResolveEscape 0x52ce40 -> the outcome table 0x52b090 via
0x52aea0, the target 0x529ab0, the 3d6 counts at 0xf02c70), scored on the
escape logs (runs/escape_*.log; pairing as escape_fit.py does).

    python tools/civ6lab/dll_escape.py [runs/escape_*.log ...]

The rule:
  v = ESCAPE_BASE_CHANCE 10 - LEVEL_BOOST 1 x (level - 1) - the spy's escape
      boost + 4 when the police guess the route (POLICE_CORRECT -4 subtracted);
      the counterspy term (COUNTERSPY_LEVEL_MODIFIER x (its level - 1)) is
      coded but ResolveEscape passes NO counterspy (0x52cf77 xor r8d): dead.
  weights over the 3d6 counts: ESCAPED = P(3d6 >= v), CAPTURED = P(v-2 <=
      3d6 <= v-1), KILLED = P(3d6 <= v-3); ONE weighted draw ("Rolling
      Espionage Result"); a capture turns into a kill on one civ / district
      pairing (hashes 0xc2577075 / 0x8a32007d).
  The police guess one route uniformly (engines' reading, kept).
"""
from __future__ import annotations

import glob
import itertools
import math
import pathlib
import re
import sys
from collections import Counter

RUNS = pathlib.Path(__file__).parent / "runs"
ROUTE = re.compile(r"escape route (DISTRICT_\w+) of (\d+) for spy (\d+) (\S+) level (\d+) turn (\d+)")
RAW = {1: "captured", 2: "escaped", 0: "killed", 5: "killed", 6: "killed"}
DICE = Counter(sum(r) for r in itertools.product(range(1, 7), repeat=3))


def p_range(lo: int, hi: int) -> float:
    return sum(DICE[s] for s in range(max(3, lo), min(18, hi) + 1)) / 216


SHIFT = 1  # the DLL's level field minus the log's level (the log reads GetLevel)
# the police draw one offered route with weight max TravelTime (4) - its
# TravelTime + 1 ("Police Exit Covered", ArePoliceInPosition 0x528560)
TRAVEL = {"DISTRICT_CITY_CENTER": 4, "DISTRICT_COMMERCIAL_HUB": 3, "DISTRICT_HARBOR": 2, "DISTRICT_AERODROME": 1}


def w(d: str) -> int:
    return 5 - TRAVEL[d]


def p_guess(route: str, n: int, uniform: bool) -> float:
    if uniform or n == 1:
        return 1 / n
    others = [d for d in TRAVEL if d != route]
    # the other offered routes are not logged: average over the subsets of
    # the other escape districts of the right size
    subs = list(itertools.combinations(others[:3] if route != "DISTRICT_CITY_CENTER" else others[:2], n - 1))
    if route != "DISTRICT_CITY_CENTER":
        subs = [s for s in itertools.combinations(others, n - 1) if "DISTRICT_CITY_CENTER" in s] or subs
    return sum(w(route) / (w(route) + sum(w(o) for o in s)) for s in subs) / len(subs)


def outcome_p(level: int, guessed: bool, shift: int = 1) -> dict[str, float]:
    v = 10 - (level - shift) + (4 if guessed else 0)
    return {"escaped": p_range(v, 18), "captured": p_range(v - 2, v - 1), "killed": p_range(3, v - 3)}


def rows(paths):
    out = []
    for path in paths:
        prompts, missions = [], {}
        for line in open(path, encoding="utf-8", errors="replace"):
            m = ROUTE.search(line)
            if m:
                prompts.append((int(m.group(6)), m.group(4), int(m.group(2)), int(m.group(5)), m.group(1)))
            elif line.startswith("mission ") and "PlotIndex=" in line:
                d = dict(kv.split("=", 1) for kv in line.split()[1:] if "=" in kv)
                missions[(d.get("Name"), d.get("CompletionTurn"), d.get("CityName"), d.get("PlotIndex"))] = d
        must = sorted(((int(d.get("CompletionTurn", -1)), k, d) for k, d in missions.items()
                       if int(d.get("InitialResult", -1)) in (2, 4)), key=lambda x: x[0])
        queue = {}
        for turn, name, n, lvl, route in sorted(prompts):
            q = queue.setdefault(name, [])
            if q and turn - q[-1][2] <= 1:
                q[-1][2] = turn
                continue
            q.append([turn, (n, lvl, route), turn])
        for ct, k, d in must:
            q = queue.get(d.get("Name"), [])
            while q and q[0][0] < ct:
                q.pop(0)
            if not q:
                continue
            n, lvl, route = q.pop(0)[1]
            res = RAW.get(int(d.get("EscapeResult", -1)))
            if res:
                out.append((n, lvl, res, route))
    return out


def probs(n: int, lvl: int, route: str, shift: int, uniform: bool) -> dict[str, float]:
    pg = p_guess(route, n, uniform)
    g, ng = outcome_p(lvl, True, shift), outcome_p(lvl, False, shift)
    return {k: g[k] * pg + ng[k] * (1 - pg) for k in g}


def main(argv: list[str]) -> int:
    paths = argv or sorted(glob.glob(str(RUNS / "escape_*.log")))
    rs = rows(paths)
    obs = Counter(r[2] for r in rs)
    print(f"{len(rs)} escapes paired: observed {dict(obs)}")
    for shift in (1, 2):
        for uniform in (True, False):
            exp = Counter()
            ll = ll_flat = 0.0
            for n, lvl, res, route in rs:
                p = probs(n, lvl, route, shift, uniform)
                for k in p:
                    exp[k] += p[k]
                ll += math.log(max(p[res], 1e-12))
                esc = p["escaped"]
                flat = {"escaped": esc, "captured": (1 - esc) * 0.29, "killed": (1 - esc) * 0.71}
                ll_flat += math.log(max(flat[res], 1e-12))
            print(f"level field = log level {'+' if shift == 2 else ''}{'- 1' if shift == 2 else ''}"
                  f"{'' if shift == 2 else '(same)'}, police {'uniform' if uniform else 'TravelTime-weighted'}:"
                  f" expected E/C/K {exp['escaped']:.1f}/{exp['captured']:.1f}/{exp['killed']:.1f};"
                  f" logL DLL band {ll:.1f} (flat 29% capture {ll_flat:.1f})")
    shift, uniform = SHIFT, False
    by = {}
    for n, lvl, res, route in rs:
        by.setdefault((min(n, 2), route if n > 1 else "-", lvl), []).append(res)
    print(f"by cell, level field shift {shift}, TravelTime-weighted police:")
    for (n, route, lvl), rr in sorted(by.items()):
        c = Counter(rr)
        e = Counter()
        for res in rr:
            for k, v in probs(n if n == 1 else 2, lvl, route if route != "-" else "DISTRICT_CITY_CENTER", shift,
                              uniform).items():
                e[k] += v
        print(f"  routes {n}{'+' if n == 2 else ' '} {route[9:]:15s} level {lvl}: n={len(rr):3d} obs E/C/K"
              f" {c['escaped']}/{c['captured']}/{c['killed']}  DLL {e['escaped']:.1f}/{e['captured']:.1f}/{e['killed']:.1f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

