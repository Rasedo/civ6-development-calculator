"""C-74: the drought's start plot as GameCore_XP2_Release.dll codes it
("Pick Drought Start Plot" 0x287e80: every map plot scored by 0x28ff20;
valid by 0x28aa00 = every plot of the inner hex that `Hexes` 7 fills — the
plot and its six neighbours — passing the drought predicate 0x28eb60:
no feature, byte +0x37 of the plot 0 (read here as: no river), not water
and not beside an ocean-sized water body (0x82a10, OCEAN_MIN_WATER_SIZE 10,
lakes excepted), terrain in the row's RandomEvent_Terrains (Plains /
Grassland and their hills), not already under an event (0x28de40);
weight = 1 + min(hex distance to the nearest live event's current plot,
Spacing 15) (0x28ce90); ONE weighted draw over the map — no city anchor),
tested on the Duel games' droughts (the dmap reads, as c74s2_drought_rules).

    python tools/civ6lab/dll_drought.py [tag glob]

A placed drought must start on a candidate; a drought that found no plot
(StartLocation -1) must have none. Water is a plot the dmap (land plots)
does not list; the ocean-size test is read two ways (any water / none).
"""
from __future__ import annotations

import collections
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import c74s2_drought_rules as R  # noqa: E402

PG = ("TERRAIN_PLAINS", "TERRAIN_GRASS", "TERRAIN_PLAINS_HILLS", "TERRAIN_GRASS_HILLS")


def main() -> int:
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    nbc = {}
    for variant in ("no river, not beside water", "no river", "not beside water", "neither"):
        tally = collections.Counter()
        sizes = []
        for tag, e, r, cs in R.load(pat):
            W, H = r["grid"]
            nb = nbc.setdefault((W, H), R.neighbours(W, H))
            terr = {i: n for i, n in r["terrains"]}
            plots = {p[0]: p for p in r["plots"]}

            def ok(i):
                p = plots.get(i)
                if p is None or terr.get(p[3]) not in PG or p[4] >= 0:
                    return False
                if "no river" in variant and p[8]:
                    return False
                if "beside water" in variant and "no river, not" in variant or variant == "not beside water":
                    if any(j not in plots for j in nb[i]) or len(nb[i]) < 6:
                        return False
                return True
            cand = [i for i in plots if len(nb[i]) == 6 and ok(i) and all(ok(j) for j in nb[i])]
            start = e.get("StartLocation", -1)
            if start is None or start < 0:
                tally["no-plot droughts"] += 1
                tally["no-plot with no candidate"] += not cand
            else:
                tally["placed"] += 1
                tally["placed on a candidate"] += start in cand
                sizes.append(len(cand))
        print(f"{variant}: placed on a candidate {tally['placed on a candidate']}/{tally['placed']};"
              f" no-plot droughts with no candidate {tally['no-plot with no candidate']}/{tally['no-plot droughts']};"
              f" candidates at the placed ones {sorted(sizes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
