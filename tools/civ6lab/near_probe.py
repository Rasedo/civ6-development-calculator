"""civ6lab near_probe — ask 18, one distance: place a Settler for seat 0
exactly --d from seat --p's nearest city (`settle_near_scene.lua`), found
the city (`pop_foundcity.lua`), then hand over to `promise_loop.py`, which
reads the promise, the grievances and the grievance log in the turn of the
founding and after each of --turns turns.

    python tools/civ6lab/near_probe.py --host 127.0.0.2 --p 1 --d 9
    python tools/civ6lab/near_probe.py --host 127.0.0.3 --site 50,11 --advance endturn --turns 1 --tag c2s1_b1

`--site X,Y` places the Settler on a site `c2s1_sites.lua` chose by BORDER
distance instead of the city-distance scan.
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
    p.add_argument("--d", type=int, help="city distance to --p's nearest city (settle_near_scene.lua)")
    p.add_argument("--site", help="X,Y: the Settler placed there instead (c2s1_sites.lua lists sites by border distance)")
    p.add_argument("--tag", help="the promise_loop tag (default near<d> / site<x>_<y>)")
    p.add_argument("--skip", type=int, default=0)
    p.add_argument("--turns", type=int, default=3)
    p.add_argument("--answer", choices=("POSITIVE", "NEGATIVE"), default="POSITIVE")
    p.add_argument("--advance", choices=("autoplay", "endturn"), default="autoplay",
                   help="how promise_loop passes each turn")
    a = p.parse_args(argv)
    if (a.d is None) == (a.site is None):
        p.error("give exactly one of --d and --site")
    t = Tuner(a.host).connect()
    if a.site:
        sx, sy = (int(v) for v in a.site.split(","))
        t.run(lab.GC, f'UnitManager.InitUnit(0, "UNIT_SETTLER", {sx}, {sy})')
        out = f"site {sx} {sy}"
        tag = a.tag or f"site{sx}_{sy}"
    else:
        scene = (HERE / "settle_near_scene.lua").read_text(encoding="utf-8")
        out = t.run(lab.GC, scene.replace("ZD", str(a.d)).replace("ZP", str(a.p)).replace("ZSKIP", str(a.skip)), timeout=60)[-1]
        tag = a.tag or f"near{a.d}"
    print(f"turn {lab.turn(t)} d={a.d} site={a.site}:", out, flush=True)
    if out.startswith("site"):
        _, x, y = out.split()
        found = (HERE / "pop_foundcity.lua").read_text(encoding="utf-8").replace("ZX", x).replace("ZY", y)
        print("   ", t.run(lab.IG, found)[-1], flush=True)
    t.close()
    return promise_loop.main(["--host", a.host, "--turns", str(a.turns), "--tag", tag,
                              "--advance", a.advance, "--answer", a.answer])


if __name__ == "__main__":
    sys.exit(main())
