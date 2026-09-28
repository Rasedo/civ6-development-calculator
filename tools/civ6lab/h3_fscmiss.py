"""H-3: the plots where Map.FindSecondContinent(plot, r) disagrees with the
hex-distance rule (own continent set, another continent within hex distance
r, x wrapping), with the other-continent plots nearest them.

    python tools/civ6lab/h3_fscmiss.py runs/h3_session_<stamp>.jsonl [...]
"""
from __future__ import annotations

import sys

from h3_x import Session, unhex


def main() -> int:
    for path in sys.argv[1:]:
        s = Session(path)
        g, c = s.g, s.continent
        wat = s.bits("IsWater")
        for e in s.xs("fsc"):
            r = int(e[1])
            got = unhex(e[2], g.n)
            # variants: the plot must be land; the other continent's plot must be land too
            wrong = {"hex": 0, "own land": 0, "both land": 0}
            for i in range(g.n):
                others = [q for q in range(g.n) if c[q] != -1 and c[i] != -1 and c[q] != c[i] and g.dist(i, q) <= r]
                p_hex = bool(others)
                p_own = p_hex and not wat[i]
                p_both = not wat[i] and any(not wat[q] for q in others)
                wrong["hex"] += p_hex != got[i]
                wrong["own land"] += p_own != got[i]
                wrong["both land"] += p_both != got[i]
            print(path[-24:], f"r={r} true on {sum(got)}; wrong per rule {wrong}")
            if not wrong["own land"]:
                continue
            for i in range(g.n):
                if c[i] == -1:
                    pred = False
                    near = []
                else:
                    near = sorted((g.dist(i, q), g.xy(q), c[q]) for q in range(g.n)
                                  if c[q] != -1 and c[q] != c[i] and g.dist(i, q) <= r + 1)
                    pred = any(d <= r for d, _, _ in near)
                if pred != got[i]:
                    print(path[-24:], f"r={r} plot {g.xy(i)} cont {c[i]} game {got[i]} rule {pred}",
                          "others:", near[:6])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
