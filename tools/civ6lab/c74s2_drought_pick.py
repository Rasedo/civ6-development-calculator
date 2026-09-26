"""C-74-S2: does a placed drought start on its city's best plot? For each
placed drought: its named city (the nearest centre), every plot within 3 of
that centre, and a score = the featureless Plains / Grassland (flat or
hills) plots within radius r of the plot (itself included, r = 1, 2); the
start's rank among the city's plots. A drought that found no plot is listed
with its best candidate score per city.

    python tools/civ6lab/c74s2_drought_pick.py [tag glob]
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import c74s2_drought_rules as R  # noqa: E402

PG = ("TERRAIN_PLAINS", "TERRAIN_GRASS", "TERRAIN_PLAINS_HILLS", "TERRAIN_GRASS_HILLS")


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    for tag, e, r, cs in R.load(pat):
        s = e.get("StartLocation")
        if s is None or s < 0:
            continue
        W, H = r["grid"]
        terr = {i: n for i, n in r["terrains"]}
        plots = {p[0]: p for p in r["plots"]}
        sxy = (s % W, s // W)
        near = sorted((R.hexdist(sxy, (c[2], c[3])), c) for c in cs)
        c = near[0][1]
        cxy = (c[2], c[3])
        good = {i for i, p in plots.items() if terr.get(p[3]) in PG and p[4] < 0}
        mine = [i for i in plots if R.hexdist((i % W, i // W), cxy) <= 3]
        out = []
        for rad in (1, 2):
            score = {i: sum(1 for j in good if R.hexdist((i % W, i // W), (j % W, j // W)) <= rad) for i in mine}
            srt = sorted(score.values(), reverse=True)
            rank = 1 + sum(1 for v in score.values() if v > score[s]) if s in score else None
            out.append(f"r{rad}: start {score.get(s)} best {srt[0]} rank {rank}/{len(mine)}")
        print(f"{tag} t{e['StartTurn']} {e['type'][13:]} start {s} d{near[0][0]} city {cxy} owner {c[0]}  " + "; ".join(out))


if __name__ == "__main__":
    main()
