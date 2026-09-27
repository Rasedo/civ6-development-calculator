"""H-3: Map.GetPlotXYWithRangeCheck's neighbourhood (AddGoodies reads it):
tools/civ6map/check.py run with each candidate in turn; the goody huts are
the map's improvements, so the report's improvement count tells them apart.

    python tools/civ6lab/h3_rangecheck.py --session runs/h3_session_<stamp>.jsonl [check.py args]

Candidates: "hex" the plot (x + dx, y + dy) when its hex distance from
(x, y) is at most r; "offset" (dx, dy) range-checked as a Civ 5 hex offset,
then applied as an offset; "axial" (dx, dy) an axial hex offset (Civ 5's
hex space, q = x - floor(y / 2)) range-checked the same way.
"""
from __future__ import annotations

import contextlib
import io
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent.parent))

from tools.civ6map import check, vm  # noqa: E402


def civ5_hexdist(dx: int, dy: int) -> int:
    if (dx >= 0) == (dy >= 0):
        return abs(dx) + abs(dy)
    return max(abs(dx), abs(dy))


def make(kind: str):
    def f(self, x, y, dx, dy, r):
        x, y, dx, dy, r = (int(v or 0) for v in (x, y, dx, dy, r))
        if abs(dx) > r or abs(dy) > r:
            return None
        if kind == "hex":
            p = self.w.plot(x + dx, y + dy)
            return None if p is None or self.w.distance(x, y, *self.w.xy(p)) > r else p
        if civ5_hexdist(dx, dy) > r:
            return None
        if kind == "offset":
            return self.w.plot(x + dx, y + dy)
        q, yy = x - (y >> 1) + dx, y + dy
        return self.w.plot(q + (yy >> 1), yy)
    return f


def main() -> int:
    for kind in ("hex", "offset", "axial"):
        vm.Api.Map_GetPlotXYWithRangeCheck = make(kind)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main()
        out = buf.getvalue()
        rep = json.loads(out[out.index("{\n"):])
        draws = [ln for ln in out.splitlines() if ln.startswith(("map seed", "Lua draws"))]
        print(kind, draws, "differ", rep["differ"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
