"""H-3: per row of the seed-relative hex grid, the dhx runs of +strength and
-strength residual cells for every biased seed (the sector edges).

    python tools/civ6lab/h3_biasedges.py DUMP [NAME ...]
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_biaszones import residuals  # noqa: E402
from h3_cvfractal import Rng  # noqa: E402
from h3_fractal import state_after  # noqa: E402
from h3_ridgemodel import place  # noqa: E402


def runs(vals):
    out, start, prev = [], None, None
    for v in sorted(vals):
        if start is None:
            start = prev = v
        elif v == prev + 1:
            prev = v
        else:
            out.append((start, prev))
            start = prev = v
    if start is not None:
        out.append((start, prev))
    return out


def main() -> int:
    dump, names = sys.argv[1], set(sys.argv[2:])
    for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        if rec["br"] != 1 or rec["bf"] != 0 or not rec["rflags"] or (names and rec["name"] not in names):
            continue
        fx, fy = 1 << rec["xe"], 1 << rec["ye"]
        seeds = place(Rng(state_after(rec["pins"]["P2"])), rec["plates"], fx, fy)
        for si, s in enumerate(seeds):
            if s["b2"] != 1:
                continue
            st = ((s["c2"] * 8) >> 16) - 4
            if st == 0:
                continue
            _, cells = residuals(rec, si)
            if len(cells) < 40:
                continue
            dr = (s["b1"] * 6) >> 16
            print(f"{rec['name']} seed {si} ({s['x']},{s['y']}) strength {st} dir {dr}")
            rows = {}
            for (x, y), r in cells.items():
                h = (x - (y >> 1)) - (s["x"] - (s["y"] >> 1))
                rows.setdefault(y - s["y"], {"+": [], "-": [], "0": [], "?": []})
                k = "+" if r == st else "-" if r == -st else "0" if r == 0 else "?"
                rows[y - s["y"]][k].append(h)
            for dy in sorted(rows, reverse=True):
                rw = rows[dy]
                print(f"  dy {dy:3d} y%2 {(s['y'] + dy) & 1}  + {runs(rw['+'])}  - {runs(rw['-'])}  0 {runs(rw['0'])}"
                      + (f"  ? {runs(rw['?'])}" if rw["?"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
