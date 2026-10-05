"""C-20: the Trader's path and range as GameCore_XP2_Release.dll codes them
(XP2 Trade_Movement.cpp; the pathfinder's callbacks 0x558900 (node init),
0x558970 (step cost), 0x558db0 (node valid), 0x5579b0 (range left); the
context 0x558ba0), checked on the lab's recorded paths
(`runs/trade_sweep_20260926T.jsonl`: every route the game paths from every
major's cities at lab4_t225, each plot a token; `runs/trade_path_*`: the
plots with coordinates, terrain class, route and district).

THE RANGE (0x5579b0), fixed point 1/256, per edge from -> to:
    r = the from-node's range left (the origin node starts at
        TRADE_ROUTE_BASE_RANGE 15 + the player's +0x1b0 modifier)
    a land<->water switch (0x558300: from land and to water, or the reverse;
        a City Centre's plot answers neither land nor water, so a step onto or
        off one is no switch; any other plot answers its ground, a Harbor
        water) caps r at 1 before the step
    a from-plot holding a TradeEmbark district (City Centre, Harbor, Royal
        Navy Dockyard, Cothon; Districts byte +0xe1 bit 7) of the ORIGIN city
        or of a city holding the player's trading post RE-FUELS r to
        TRADE_ROUTE_LAND_RANGE_REFUEL 15 (+0x2d0) when the next plot is land,
        TRADE_ROUTE_WATER_RANGE_REFUEL 30 (+0x330, Portugal's row) when it is
        water; the destination's district refuels to 3
    left = r - 1; an edge leaving less than 0 is no edge.
  So the range is a budget walked along the path, not a hex distance between
  the ends: 15 steps from the origin, topped up at each own-post city.

THE COST (0x558970), per step, in 1/100ths of a move:
    100
    + 10000 for a land<->water switch the range callback did not refuel
      (0x558a08, the context's refuelled flag +0x1cc): runs/h1_duelw1108,
      Rome's Trader to Shenyang walks 618 -> its Harbor 617 -> Ocean at t182
      (every way to sea pays one switch) and the 21-plot coast path through
      Antium's centre at t212 once Antium stands (no switch)
    + 0 onto a city centre, or a mountain with a tunnel (portal)
    + 10 on a route of the best route type (the highest PlacementValue:
         Railroad), + 50 on any other route
    + 50 on water with no route
    + 100 x the plot's movement cost on land with no route (impassable: no edge)

THE NODES (0x558db0): impassable plots and mountains without a tunnel are
closed; a major (CIVILIZATION_LEVEL_FULL_CIV) walks only plots it has
REVEALED; water is closed to a player whose Trader cannot embark (0x553680);
a foreign city centre of a player flagged in the context's per-player table
(0x3dcec0: the at-war test) is closed; a plot with a Danger feature
(Features.DangerValue > 0: the burning forests / jungles, the Bermuda
Triangle) is closed except as the destination; a land<->water edge needs a
TradeEmbark district on one of its two plots (any owner).

The path is the pathfinder's least-cost path under that cost within that
range, not a greedy step.

This check walks the recorded paths with the range rule. The paths with a
CanStartTradeRoute answer (`runs/trade_path_*`) are walked with the origin's
refuel alone (their posts are not recorded): every startable path must fit.
The sweep's paths carry the origin player's ACTIVE posts ('t') but no
CanStart answer, and GetTradeRoutePath answers from the trade manager's path
cache for pairs CanStartTradeRoute refuses too (10 of the 54 recorded paths),
so its pure-land legs longer than 15 are listed, not scored.

    python tools/civ6lab/dll_tradepath.py
"""
from __future__ import annotations

import collections
import json
import pathlib

RUNS = pathlib.Path(__file__).parent / "runs"
BASE, LAND_REFUEL, WATER_REFUEL = 15, 15, 30


def water(tok: str) -> bool:
    return tok.startswith("w")


def walk(tokens: list[str]) -> tuple[bool, list[tuple[str, int]]]:
    """(ok, legs): legs are (domain, steps) between refuels. City centres
    are neutral for the switch (their plot answers neither land nor water); a
    Harbor answers its water; a centre refuels when it is the origin or
    carries the origin player's active post ('t')."""
    rem = BASE
    legs: list[tuple[str, int]] = []
    leg_dom, leg_n = "land", 0
    ok = True
    for i in range(len(tokens) - 1):
        a, b = tokens[i], tokens[i + 1]
        r = rem
        switch = "C" not in a and "C" not in b and (water(a) != water(b))
        if switch and r > 1:
            r = 1
        if "C" in a and (i == 0 or "t" in a):
            if leg_n:
                legs.append((leg_dom, leg_n))
            r = WATER_REFUEL if water(b) else LAND_REFUEL
            leg_dom, leg_n = ("water" if water(b) else "land"), 0
        rem = r - 1
        leg_n += 1
        if rem < 0:
            ok = False
    legs.append((leg_dom, leg_n))
    return ok, legs


def token(p: str) -> str:
    """a trade_path plot "x:y:K/ROUTE/DISTRICT" as a sweep token"""
    k = p.split(":")[2].split("/")
    t = "w" if k[0] in ("c", "O") else "l"
    embark = any(d in k for d in ("HARBOR", "ROYAL_NAVY_DOCKYARD", "COTHON"))
    return t + ("C" if "CITY_CENTER" in k else "H" if embark else "")


def main() -> None:
    seen = set()
    fit = {True: [0, 0], False: [0, 0]}
    for f in sorted(RUNS.glob("trade_path_*.jsonl")):
        for ln in open(f, encoding="utf-8"):
            r = json.loads(ln)
            if not r["path"]:
                continue
            key = (r["o"], r["d"], tuple(r["path"]))
            if key in seen:
                continue
            seen.add(key)
            ok, _ = walk([token(p) for p in r["path"]])
            fit[r["canStart"] == "true"][0 if ok else 1] += 1
    print(f"trade_path records, distinct paths: startable {fit[True][0]} fit the budget, {fit[True][1]} do not; "
          f"refused {fit[False][0]} fit, {fit[False][1]} do not")
    rows = [json.loads(ln) for ln in open(RUNS / "trade_sweep_20260926T.jsonl", encoding="utf-8")]
    bad = []
    longest = collections.Counter()
    top = {"land": 0, "water": 0}
    for r in rows:
        toks = r["s"].split()
        ok, legs = walk(toks)
        if not ok:
            bad.append(r)
        for dom, n in legs:
            longest[(dom, n)] += 1
            top[dom] = max(top[dom], n)
    print(f"sweep: {len(rows)} recorded paths; {len(bad)} break the DLL range budget "
          f"(15 from the origin, refuel 15 land / 30 water at the origin and active-post centres; "
          f"harbours unrecorded, so water legs are not scored)")
    for dom in ("land", "water"):
        hist = sorted((n, c) for (d, n), c in longest.items() if d == dom)
        print(f"  {dom} legs between refuels: longest {top[dom]}; the top of the spread "
              f"{[f'{n}:{c}' for n, c in hist[-6:]]}")
    for r in bad[:8]:
        print("   ", r["o"], "->", r["d"], r["n"], r["s"][:160])
    # the engines' leg: a hex distance of 15 (30 when both ends are maritime) between the
    # ends of each chain leg; the recorded paths' own lengths per leg show what that misses
    over = sum(1 for (d, n), c in longest.items() if d == "land" and n > 15 for _ in range(c))
    print(f"  land legs longer than 15 steps: {over} (the budget forbids any)")


if __name__ == "__main__":
    main()
