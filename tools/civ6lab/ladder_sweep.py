"""civ6lab ladder_sweep — C-60's positive ladder: load each named save and
read every city's amenity balance beside the tier the game reports
(`ladder_read.lua`, InGame), nothing poked. One log under runs/.

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
    p.add_argument("saves", nargs="+")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"ladder_{stamp}.log"
    lua = (HERE / "ladder_read.lua").read_text(encoding="utf-8")
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
