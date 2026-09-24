"""civ6lab near_probe — ask 18, one distance: place a Settler for seat 0
exactly --d from seat --p's nearest city (`settle_near_scene.lua`), found
the city (`pop_foundcity.lua`), then pass --turns turns with
`promise_loop.py` and log the promise and the grievances.

    python tools/civ6lab/near_probe.py --host 127.0.0.2 --p 1 --d 9
"""
from __future__ import annotations

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402
import promise_loop  # noqa: E402

HERE = pathlib.Path(__file__).parent


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.2")
    p.add_argument("--p", type=int, default=1)
    p.add_argument("--d", type=int, required=True)
    p.add_argument("--skip", type=int, default=0)
    p.add_argument("--turns", type=int, default=3)
    a = p.parse_args(argv)
    t = Tuner(a.host).connect()
    scene = (HERE / "settle_near_scene.lua").read_text(encoding="utf-8")
    out = t.run(lab.GC, scene.replace("ZD", str(a.d)).replace("ZP", str(a.p)).replace("ZSKIP", str(a.skip)), timeout=60)[-1]
    print(f"turn {lab.turn(t)} d={a.d}:", out, flush=True)
    if out.startswith("site"):
        _, x, y = out.split()
        found = (HERE / "pop_foundcity.lua").read_text(encoding="utf-8").replace("ZX", x).replace("ZY", y)
        print("   ", t.run(lab.IG, found)[-1], flush=True)
    t.close()
    return promise_loop.main(["--host", a.host, "--turns", str(a.turns), "--tag", f"near{a.d}"])


if __name__ == "__main__":
    sys.exit(main())
