"""H-3: print a dumped case's grids and the raw LCG outputs its native call drew.

    python tools/civ6lab/h3_show.py runs/h3_ridges_<...>.jsonl NAME [--grid R] [--draws P2]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_fractal import state_after  # noqa: E402
from h3_fit import step  # noqa: E402


def load(path: str, name: str) -> dict:
    for ln in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
        r = json.loads(ln)
        if r["name"] == name:
            return r
    raise KeyError(name)


def raw_after(rec: dict, pin: str, n: int) -> list[int]:
    """the n raw 16-bit outputs (s' >> 16) following pin `pin`"""
    s = state_after(rec["pins"][pin])
    out = []
    for _ in range(n):
        s = step(s)
        out.append(s >> 16)
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dump")
    p.add_argument("name")
    p.add_argument("--grid", default="ridged_grid")
    p.add_argument("--draws", default="P2")
    p.add_argument("--n", type=int, default=0)
    p.add_argument("--ranges", default="", help="comma list: print (raw * r) >> 16 per range")
    a = p.parse_args()
    r = load(a.dump, a.name)
    g = r.get(a.grid)
    if g:
        for y in range(len(g) - 1, -1, -1):
            print(f"{y:3d} " + " ".join(f"{v:3d}" for v in g[y]))
    n = a.n or 40
    raws = raw_after(r, a.draws, n)
    print("raw16:", raws)
    for rg in [int(x) for x in a.ranges.split(",") if x]:
        print(f"r{rg}:", [(x * rg) >> 16 for x in raws])
    return 0


if __name__ == "__main__":
    sys.exit(main())
