"""C-74-S2: does the climate screen's chance use the temperature of an EARLIER
read? For each family and lag L (0..30 reads), the interval of N consistent
with every read when the warming factor takes T from the read L turns before
(once-per-map rows: storm, drought, fire, no boost; per-site rows: flood and
eruption with the per-(row, site) first-occurrence boost of 30%), and the
count of reads the best N misses.

    python tools/civ6lab/c74s2_lag.py [tag glob]
"""
import math
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import c74s2_boost as B  # noqa: E402


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    tags = sorted({re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
                   for f in B.RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")})
    tags = [t for t in tags if list(B.RUNS.glob(f"event_history_{t}_*.txt"))]
    data = [(t, *B.load(t)) for t in tags]
    for fam in ("storm", "drought", "fire", "flood", "erupt"):
        best = []
        for L in range(0, 31):
            reads = []
            for tag, turns, events in data:
                Ts = {t: turns[t]["t"]["climate"]["GetTemperatureChange"] for t in turns if "t" in turns[t]}
                for t in sorted(turns):
                    tr = turns[t]
                    if t < 2 or "t" not in tr or "rv" not in tr or "volc" not in tr:
                        continue
                    T = Ts.get(t - L, 0.0)
                    if not isinstance(T, (int, float)):
                        continue
                    y = tr["t"]["climate"][B.KEYS[fam]]
                    occ = set()
                    if fam in ("flood", "erupt"):
                        for st, row, loc in events:
                            if st < t and B.fam_of(row) == fam:
                                occ.add((row, B.site_of(fam, row, loc, tr)))
                    m = 0.0
                    for row, o, c, s in B.family_rows(fam, tr):
                        b = 1.0 if (fam not in ("flood", "erupt") or (row, s) in occ) else 1.3
                        m += o * b * (1 + c / 100 * T)
                    if m > 0:
                        reads.append((y, m))
            lo, hi = 0.0, math.inf
            for y, m in reads:
                lo, hi = max(lo, 100 * m / (y + 1)), min(hi, 100 * m / y if y else math.inf)
            # the misses at the best N on a grid
            grid = [n / 10 for n in range(int(150 * 10), int(1500 * 10), 5)]
            mb = min((sum(1 for y, m in reads if int(100 * m / N + 1e-9) != y), N) for N in grid)
            best.append((mb[0], L, mb[1], lo, hi, len(reads)))
        best.sort()
        print(f"{fam}:")
        for b in best[:5]:
            print(f"   lag {b[1]:>2}: misses {b[0]:>3}/{b[5]} at N {b[2]:.1f}; exact interval ({b[3]:.1f}, {b[4]:.1f}] {'EMPTY' if b[3] >= b[4] else ''}")


if __name__ == "__main__":
    main()
