"""H-3: for raw BuildRidges dumps, list each clean seed's extra draws (between
its (y, x) pair and the next seed's pair), as raw >> 8 (0..255).

    python tools/civ6lab/h3_seedextras.py DUMP [DUMP ...]
"""
from __future__ import annotations

import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_ridgefit import raws, r  # noqa: E402


def main() -> int:
    lens = collections.Counter()
    for dump in sys.argv[1:]:
        for ln in pathlib.Path(dump).read_text(encoding="utf-8").splitlines():
            rec = json.loads(ln)
            if "ridged_grid" not in rec or rec["w"] != 1 << rec["xe"] or rec["h"] != 1 << rec["ye"]:
                continue
            fx, fy = rec["w"], rec["h"]
            n = rec["draws"]["P2->P3"]
            if n > 2000:
                continue
            d = raws(rec, "P2", n)
            g = rec["ridged_grid"]
            zeros = {(x, y) for y in range(fy) for x in range(fx) if g[y][x] == 0}
            ks = [k for k in range(n - 1) if (r(d[k + 1], fx), r(d[k], fy)) in zeros]
            full = len(ks) == len(zeros)
            ks2 = ks + [n] if full else ks
            for a, b in zip(ks2, ks2[1:]):
                ex = [v >> 8 for v in d[a + 2:b]]
                lens[len(ex)] += 1
                pos = (r(d[a + 1], fx), r(d[a], fy))
                print(f"{rec['name']:>10} seed {pos} extras {len(ex)}: {ex}")
    print("extra counts", dict(lens))
    return 0


if __name__ == "__main__":
    sys.exit(main())
