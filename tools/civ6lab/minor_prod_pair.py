"""civ6lab minor_prod_pair — C-38: read `minor_prod.lua` on consecutive turns
of a running game (--reads of them) and print, per city-state city still on
the same item, the progress that landed next to the Production yield: the
ratio is the modifier the item received.

    python tools/civ6lab/minor_prod_pair.py --host 127.0.0.1 --reads 6
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--reads", type=int, default=6)
    a = p.parse_args(argv)
    lua = (HERE / "minor_prod.lua").read_text(encoding="utf-8")
    t = Tuner(a.host).connect()
    prev = None
    for _ in range(a.reads):
        rows = {(r["p"], r["city"]): r for r in (json.loads(x) for x in t.run(lab.IG, lua, timeout=60) if x.startswith("{"))}
        if prev:
            for k, r in rows.items():
                q = prev.get(k)
                if q and q["build"] == r["build"] and q["progress"] >= 0 and r["progress"] > q["progress"]:
                    d = r["progress"] - q["progress"]
                    print(f"t{q['turn']}->{r['turn']} p{k[0]} {r['build']}: +{d} on yield {q['yield']:.2f}"
                          f" -> x{d / q['yield'] if q['yield'] else 0:.3f}", flush=True)
        prev = rows
        # the game plays by itself; a screen that holds it is closed by cause
        lab.wait_turn(t, lab.turn(t), -1, 600.0)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
