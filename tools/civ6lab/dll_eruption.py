"""C-41: an eruption's Volcanic Soil as GameCore_XP2_Release.dll codes it,
scored on the lab's forced eruptions (`runs/volcano_own_*.jsonl`: every ring
plot before and after, with its six yields).

The volcano's eruption (0xa22000) runs the damage pass 0xa1c1a0 FIRST, then
the soil pass 0xa219e0 ("Fertility Gain Chance"):

    for each RandomEvent_Yields row of the severity (XML order):
        for each of the 6 neighbours of the event's plot (NE, E, SE, SW, W, NW):
            skip an impassable plot (plot byte +0x3a bit 3: mountains),
                 a water plot, and a plot whose feature is neither Removable
                 (Woods, Rainforest, Marsh) nor the row's own (Volcanic Soil);
            ONE draw rand(100) < Percentage:
                ReplaceFeature (true on every eruption row) paints Volcanic Soil,
                and the row's yield gains +1 on the plot (0xa190d0).

So every row paints: a plot is painted when ANY row lands, and the
production / science rows land at their own Percentage on every eligible
plot, whether or not the food row did. The engines paint at the food row and
roll the other rows only on painted plots.

This check scores both models on bare, unimproved, district-free eligible
plots (the yields then move by the rows alone, less the replaced feature's
own yield): per severity the painted share and, among painted plots, the
share that gained food / production / science.

    python tools/civ6lab/dll_eruption.py [records...]
"""
from __future__ import annotations

import glob
import json
import math
import sys
from collections import defaultdict

ROWS = {  # Expansion2_RandomEvents.xml RandomEvent_Yields (food, production, science)
    "RANDOM_EVENT_VOLCANO_GENTLE": (35, 15, 0),
    "RANDOM_EVENT_VOLCANO_CATASTROPHIC": (50, 25, 10),
    "RANDOM_EVENT_VOLCANO_MEGACOLOSSAL": (75, 35, 15),
}
FEATURE_YIELD = {"FEATURE_FOREST": (0, 1), "FEATURE_JUNGLE": (1, 0), "FEATURE_MARSH": (1, 0)}  # (food, prod)
ELIGIBLE = {"-", "FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_VOLCANIC_SOIL"}


def predict(sev: str) -> dict[str, tuple[float, ...]]:
    f, p, s = (x / 100 for x in ROWS[sev])
    paint_dll = 1 - (1 - f) * (1 - p) * (1 - s)
    return {
        # painted share; P(food | painted), P(prod | painted), P(sci | painted)
        "dll": (paint_dll, f / paint_dll, p / paint_dll, s / paint_dll),
        "engines": (f, 1.0, p, s),
    }


def main() -> None:
    files = sys.argv[1:] or sorted(glob.glob("tools/civ6lab/runs/volcano_own_*.jsonl"))
    tally: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for fn in files:
        for ln in open(fn, encoding="utf-8"):
            r = json.loads(ln)
            b, n = r["before"], r["now"]
            if b["water"] or b["mountain"] or b["f"] not in ELIGIBLE or b["f"] == "FEATURE_VOLCANIC_SOIL":
                continue
            if b.get("im", "-") != "-" or b.get("d", "-") != "-":
                continue
            yb = [int(float(x)) for x in r["yBefore"]]
            yn = [int(float(x)) for x in r["yNow"]]
            painted = n["f"] == "FEATURE_VOLCANIC_SOIL"
            ff, fp = FEATURE_YIELD.get(b["f"], (0, 0)) if painted else (0, 0)
            dfood = yn[0] - yb[0] + ff
            dprod = yn[1] - yb[1] + fp
            dsci = yn[3] - yb[3]
            t = tally[r["sev"]]
            t["n"] += 1
            t["painted"] += painted
            if painted:
                t["food"] += dfood >= 1
                t["prod"] += dprod >= 1
                t["sci"] += dsci >= 1
            else:
                t["unpainted_gain"] += (dfood > 0) or (dprod > 0) or (dsci > 0)
    for sev in ROWS:
        t = tally[sev]
        if not t["n"]:
            continue
        pn = t["painted"]
        print(f"{sev}: {t['n']} eligible bare plots, painted {pn} ({pn / t['n']:.3f}); "
              f"of the painted: food {t['food']} ({t['food'] / max(pn, 1):.3f}), prod {t['prod']} "
              f"({t['prod'] / max(pn, 1):.3f}), sci {t['sci']} ({t['sci'] / max(pn, 1):.3f}); "
              f"unpainted plots with a gain {t['unpainted_gain']}")
        for model, (pp, pf, pr, ps) in predict(sev).items():
            ll = pn * math.log(pp) + (t["n"] - pn) * math.log(1 - pp)
            tally[model]["ll"] += ll
            print(f"    {model:>8} predicts painted {pp:.3f} (logL {ll:.1f}); of the painted food {pf:.3f} "
                  f"prod {pr:.3f} sci {ps:.3f}")
    print(f"painted-share logL over the three severities: dll {tally['dll']['ll']:.1f}, "
          f"engines {tally['engines']['ll']:.1f}")
    print("(the yield gains run below either model: the rings were re-erupted without a reset, so"
          " accrued fertility, its cap and its removal confound them; the paint is the clean read)")


if __name__ == "__main__":
    main()
