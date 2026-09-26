"""C-74-S2: per drought, how many plots meet the start condition every placed
drought met — featureless Plains / Grassland (flat or hills; a district plot
counts) with all six neighbours the same, within 3 of a city centre — and
whether the drought was placed; placement rate by candidate count.

    python tools/civ6lab/c74s2_drought_cands.py [tag glob]
"""
import collections
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import c74s2_drought_rules as R  # noqa: E402

PG = ("TERRAIN_PLAINS", "TERRAIN_GRASS", "TERRAIN_PLAINS_HILLS", "TERRAIN_GRASS_HILLS")


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    by = collections.defaultdict(lambda: [0, 0])
    nbc = {}
    for tag, e, r, cs in R.load(pat):
        W, H = r["grid"]
        nb = nbc.setdefault((W, H), R.neighbours(W, H))
        terr = {i: n for i, n in r["terrains"]}
        plots = {p[0]: p for p in r["plots"]}
        good = {i for i, p in plots.items() if terr.get(p[3]) in PG and p[4] < 0}
        centres = [(c[2], c[3]) for c in cs]
        cand = [i for i in good if len(nb[i]) == 6 and all(j in good for j in nb[i])
                and any(R.hexdist((i % W, i // W), c) <= 3 for c in centres)]
        s = e.get("StartLocation")
        placed = s is not None and s >= 0
        k = len(cand)
        by[min(k, 5)][0 if placed else 1] += 1
        print(f"{tag} t{e['StartTurn']} {e['type'][13:]:<16} placed {str(placed):<5} start {s} candidates {k} {sorted(cand)[:8]}"
              + ("" if not placed or s in cand else "  START NOT A CANDIDATE"))
    print("\ncandidates (5 = 5+): [placed, not placed]")
    for k in sorted(by):
        print(f"   {k}: {by[k]}")


if __name__ == "__main__":
    main()
