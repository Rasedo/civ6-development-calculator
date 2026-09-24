"""civ6lab ladder_sweep — load each named save and run one InGame reader on
it, nothing poked; one log under runs/ named after the reader. The default
reader is `ladder_read.lua` (every city's amenity balance beside the tier
the game reports); `freecity_amenity.lua --set ZALL=0` reads the Free
Cities' amenity sources.

    python tools/civ6lab/ladder_sweep.py --host 127.0.0.2 obs1_t100 obs1_t150 ...
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import lab  # noqa: E402
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.2")
    p.add_argument("--lua", default="ladder_read.lua", help="the InGame reader run on each save")
    p.add_argument("--set", action="append", default=[], metavar="TOKEN=VALUE")
    p.add_argument("saves", nargs="+")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"{pathlib.Path(a.lua).stem}_{stamp}.log"
    lua = (HERE / a.lua).read_text(encoding="utf-8")
    for kv in a.set:
        k, v = kv.split("=", 1)
        lua = lua.replace(k, v)
    with open(path, "w", encoding="utf-8") as fh:
        for save in a.saves:
            try:
                game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=save, wait=600.0))
                t = Tuner(a.host).connect()
                fh.write(f"save {save}\n")
                for ln in t.run(lab.IG, lua, timeout=60):
                    fh.write(ln + "\n")
                fh.flush()
                t.close()
                print(save, "done", flush=True)
            except (TunerError, SystemExit) as e:
                print(save, "FAILED", e, flush=True)
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
