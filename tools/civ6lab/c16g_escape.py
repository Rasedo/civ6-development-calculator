"""C-16 (lab 5g): the escape's three outcomes against a grid of readings, from
`c16n_cycle.py` logs (pairing by `c16n_fit.read`).

One 3d6 R per escape: escaped at R >= v, captured at v - 2 <= R <= v - 1,
killed below; v = v0 - L (+ 4 when the police guessed the spy's route,
+ c when the pursuer is a counterspy), L the level the route line prints.
The police guess: `w` weights each offered route 5 - TravelTime, `u` uniform,
`0` never right. Prints logL per (guess model, v0, c), best first, and the
counts per pursuer.

    python tools/civ6lab/c16g_escape.py tools/civ6lab/runs/escape_cs_c16g_*.log
"""
from __future__ import annotations

import math
import sys
from collections import Counter

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
import c16n_fit as f  # noqa: E402

ROUTES2 = ["DISTRICT_CITY_CENTER", "DISTRICT_COMMERCIAL_HUB"]


def p_out(v: int) -> tuple[float, float, float]:
    esc = f.ge(v)
    cap = f.ge(v - 2) - esc
    return esc, cap, 1 - esc - cap


def guess_p(model: str, e: dict) -> float:
    offered = ROUTES2 if e["n"] == 2 else ROUTES2[:1]
    if model == "0":
        return 0.0
    if model == "u":
        return 1 / len(offered)
    return (5 - f.TRAVEL[e["route"]]) / sum(5 - f.TRAVEL[d] for d in offered)


def main(paths: list[str]) -> None:
    missions, starts, arm_at, routes = f.read(paths)
    rows = []
    for (name, ct, _), kv in missions.items():
        rows.append(dict(name=name, ct=ct, out=f.CODE[int(kv["InitialResult"])], esc=int(kv.get("EscapeResult", -1))))
    seen, esc = set(), []
    for rt in routes:
        key = (rt["id"], rt["name"], rt["turn"])
        if key in seen:
            continue
        seen.add(key)
        c = [r for r in rows if r["name"] == rt["name"] and r["out"] in (1, 3) and r["ct"] <= rt["turn"] <= r["ct"] + 3]
        if not c or c[-1]["esc"] < 0:
            continue
        res = c[-1]["esc"]
        esc.append(dict(rt, res=0 if res == 2 else 1 if res == 1 else 2, cs=rt["pursuer"] != "police"))
    for cs in (False, True):
        k = Counter((e["res"], e["level"], e["n"]) for e in esc if e["cs"] == cs)
        print(f"pursuer {'counterspy' if cs else 'police'}: {len(k) and sum(k.values())} escapes; "
              f"(outcome 0 esc / 1 cap / 2 killed, level, routes): {dict(sorted(k.items()))}")
    for cs_only in (False, True):
        sub = [e for e in esc if e["cs"] == cs_only]
        res = []
        for model in ("w", "u", "0"):
            for v0 in range(8, 15):
                for c in range(0, 7) if cs_only else (0,):
                    ll = 0.0
                    for e in sub:
                        g = guess_p(model, e)
                        v = v0 - e["level"] + c
                        pr = [g * a + (1 - g) * b for a, b in zip(p_out(v + 4), p_out(v))]
                        ll += math.log(max(pr[e["res"]], 1e-12))
                    res.append((ll, model, v0, c))
        res.sort(reverse=True)
        print(f"== {'counterspy' if cs_only else 'police'} pursuer, {len(sub)} escapes: best readings (logL, guess, v0, c)")
        for r in res[:10]:
            print(f"   {r[0]:.2f} guess={r[1]} v0={r[2]} c={r[3]}")
    # joint: one v0 and guess model for both pursuers, c on the counterspy's alone
    print(f"== joint, {len(esc)} escapes: per counterspy term c the best (guess, v0)")
    for c in range(0, 7):
        best = None
        for model in ("w", "u", "0"):
            for v0 in range(8, 15):
                ll = 0.0
                for e in esc:
                    g = guess_p(model, e)
                    v = v0 - e["level"] + (c if e["cs"] else 0)
                    pr = [g * a + (1 - g) * b for a, b in zip(p_out(v + 4), p_out(v))]
                    ll += math.log(max(pr[e["res"]], 1e-12))
                best = max(best or (ll, model, v0), (ll, model, v0))
        print(f"   c={c}: logL {best[0]:.2f} guess={best[1]} v0={best[2]}")


if __name__ == "__main__":
    main(sys.argv[1:])
