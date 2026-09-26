"""civ6lab c38s3_run — C-38-S3, a city-state's purchase trigger by
intervention. Per arm: load --save, burn --burn draws off the game's shared
generator (every load of one save replays the same stream; a different burn
makes an independent repeat: both the map generator's and the game's own
`Game.GetRandNum` stream are advanced), set every city-state's bank to --gold and
strip its Builders (--arm builder) or set its military to --k units (--arm
military) with `c38s3_setup.lua`, then pass --turns turns by Autoplay,
reading `cs_watch.lua` (GameCore) and `minor_prod.lua` (InGame, the current
item's progress and cost) before the first turn and after each. One jsonl
per run under runs/, every line tagged with the arm; `c38s3_fit.py` reads
them.

    python tools/civ6lab/c38s3_run.py --host 127.0.0.3 --arm builder --gold 300 --burn 0
    python tools/civ6lab/c38s3_run.py --host 127.0.0.3 --arm military --k 4 --gold 300 --burn 17
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG
BURN = ('for i = 1, ZN do TerrainBuilder.GetRandomNumber(100, "lab burn"); Game.GetRandNum(100, "lab burn") end '
        'print("burned ZN, seed " .. Game.GetRandomSeed())')


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--save", default="lab4_t100")
    p.add_argument("--arm", choices=("builder", "military", "none"), required=True)
    p.add_argument("--gold", type=int, default=300)
    p.add_argument("--k", type=int, default=0, help="the military size (--arm military)")
    p.add_argument("--burn", type=int, default=0)
    p.add_argument("--turns", type=int, default=5)
    p.add_argument("--wait", type=float, default=300.0)
    p.add_argument("--noload", action="store_true", help="act on the game as it stands")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tag = {"arm": a.arm, "gold": a.gold, "k": a.k, "burn": a.burn, "save": a.save}
    path = lab.RUNS / f"c38s3_{a.arm}_g{a.gold}_k{a.k}_b{a.burn}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(kind: str, line: str) -> None:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            r = {"raw": line}
        fh.write(json.dumps({"rec": kind, **tag, **r}) + "\n")
        fh.flush()

    if not a.noload and game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    print(t.run(GC, BURN.replace("ZN", str(a.burn)), timeout=60)[-1], flush=True)
    setup = (HERE / "c38s3_setup.lua").read_text(encoding="utf-8")
    setup = setup.replace("ZGOLD", str(a.gold)).replace("ZARM", a.arm).replace("ZK", str(a.k))
    for ln in t.run(GC, setup, timeout=60):
        rec("setup", ln)
    watch = (HERE / "cs_watch.lua").read_text(encoding="utf-8")
    prod = (HERE / "minor_prod.lua").read_text(encoding="utf-8")

    def read() -> None:
        for ln in t.run(GC, watch, timeout=60):
            rec("cs", ln)
        for ln in t.run(IG, prod, timeout=60):
            rec("prod", ln)

    read()
    for _ in range(a.turns):
        tn = lab.advance(t, "autoplay", lp, a.wait, print)
        read()
        print(f"  turn {tn}", flush=True)
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
