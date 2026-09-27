"""H-3: tools/civ6map/continents.py (the StampContinents partition the
generator runs) scored plot for plot on every recorded stamp: the
controlled shapes (exp records and the stamp probe's h3_stampx files, with
the shape's terrain where recorded) and the natural maps with the stamp's
own terrain.

    python tools/civ6lab/h3_stampscore.py [records ...]
"""
from __future__ import annotations

import collections
import glob
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent.parent))

from h3_stampfit import EXP, load_cases  # noqa: E402
from h3_x import unrle  # noqa: E402
from tools.civ6map import continents  # noqa: E402

KIND = {None: continents.OCEAN, "L": continents.LAND, "M": continents.MOUNTAIN, "K": continents.LAKE}


def main() -> int:
    paths = sys.argv[1:] or (sorted(glob.glob(str(HERE / "runs" / "h3_stampx_*.json")))
                             + [str(HERE / "runs" / p) for p in EXP]
                             + [str(HERE / "runs" / pathlib.PurePosixPath(p).name)
                                for p in (HERE / "runs" / "h3_natives_all.txt").read_text().split()])
    cases = load_cases(paths)
    ter = {}
    for p in paths:
        if pathlib.Path(p).name.startswith("h3_stampx_"):
            for e in json.loads(pathlib.Path(p).read_text(encoding="utf-8"))["stamps"]:
                if "terrain" in e:
                    ter[(pathlib.Path(p).stem[-7:], e["name"])] = unrle(e["terrain"])
    tot = collections.Counter()
    for c in cases:
        if c["off"] is None:
            continue
        t = ter.get((c["src"], c["name"]))
        cls = ([None if v == 16 else "K" if v == 15 else "M" if v % 3 == 2 else "L" for v in t] if t
               else c["cls"])
        g = c["g"]
        pred = continents.partition(g.w, g.h, True, [KIND[k] for k in cls], c["n"])
        bad = [i for i in range(g.n) if pred[i] != c["part"][i]]
        grp = "natural" if c["name"] == "natural" else "controlled"
        tot[grp, "stamps"] += 1
        tot[grp, "exact"] += not bad
        tot[grp, "plots"] += g.n
        tot[grp, "plots_ok"] += g.n - len(bad)
        if bad:
            print(f"MISS {c['src']} {c['name']}: {len(bad)} plots, e.g. "
                  f"{[(i % g.w, i // g.w, pred[i], c['part'][i]) for i in bad[:5]]}")
    for grp in ("controlled", "natural"):
        print(grp, {k[1]: v for k, v in tot.items() if k[0] == grp})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
