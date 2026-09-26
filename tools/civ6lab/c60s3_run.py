"""civ6lab c60s3_run — C-60-S3, a Free City grant with no free tile. Load
--save, fill every plot within --rings of the Free City at --city with seat-0
units (`c60s3_rig.lua`; --rings 0 is the control: nothing placed), then end
--turns turns in the endturn mode (no AI plays the seat, so the blockers stay
put), reading the city's owner, every Free Cities unit and every unit within
the rig's reach (`c60s3_rig.lua` read) after the rig and after each turn;
--rerig T... fills and heals the rig again on those turns before they end.
One jsonl under runs/.

    python tools/civ6lab/c60s3_run.py --host 127.0.0.3 --rings 1 --turns 8
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


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--save", default="lab4_t250")
    p.add_argument("--city", default="69,21")
    p.add_argument("--rings", type=int, default=1)
    p.add_argument("--turns", type=int, default=8)
    p.add_argument("--wait", type=float, default=300.0)
    p.add_argument("--rerig", type=int, nargs="*", default=[],
                   help="turns on which the rig is filled and healed again before the turn ends")
    a = p.parse_args(argv)
    x, y = a.city.split(",")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"c60s3_r{a.rings}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")
    lua = (HERE / "c60s3_rig.lua").read_text(encoding="utf-8").replace("ZX", x).replace("ZY", y)

    def rec(line: str) -> None:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            r = {"raw": line}
        fh.write(json.dumps({"rings": a.rings, **r}) + "\n")
        fh.flush()

    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    if a.rings > 0:
        for ln in t.run(lab.GC, lua.replace("ZMODE", "rig").replace("ZR", str(a.rings)), timeout=60):
            rec(ln)
            print(ln, flush=True)
    reach = str(max(a.rings, 2))

    def read() -> None:
        for ln in t.run(lab.GC, lua.replace("ZMODE", "read").replace("ZR", reach), timeout=60):
            rec(ln)
            if '"p62"' in ln or '"city"' in ln:
                print("   ", ln, flush=True)

    read()
    for _ in range(a.turns):
        if a.rings > 0 and lab.turn(t) in a.rerig:
            for ln in t.run(lab.GC, lua.replace("ZMODE", "rig").replace("ZR", str(a.rings)), timeout=60):
                rec(ln)
        tn = lab.advance(t, "endturn", lp, a.wait, lambda s: rec(json.dumps({"kind": "log", "text": s})))
        print(f"turn {tn}", flush=True)
        read()
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
