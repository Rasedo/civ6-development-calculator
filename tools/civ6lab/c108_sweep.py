"""civ6lab c108_sweep — C-108, the Trader's path and eligibility pair by pair.
Load --save, write the full-state dump of the loaded turn (`h1/dump.py snap`:
the map, cities, districts, revealed plots, techs; its catalog beside it),
then run `c108_sweep.lua` for every living player as origin (every origin
city against every other city: CanStartRoute, GetTradeRoutePath's plots and
portal arrays, met / at war) and once for the constructed trading posts.

    python tools/civ6lab/c108_sweep.py --host 127.0.0.5 --save lab4_t225 --tag t225

Writes runs/c108_<tag>_<stamp>.jsonl (the sweep) and
runs/c108_<tag>_<stamp>.dump.jsonl (+ .cat.json, the dump), which
`cpu/harness/tradePathLab.ts` scores. The instance is closed at the end.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "h1"))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402
import game  # noqa: E402
import dump  # noqa: E402

LIVING = "for p = 0, 62 do local q = Players[p] if q ~= nil and q:IsAlive() and q:GetCities():GetCount() > 0 then print(p) end end"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.5")
    ap.add_argument("--save", default="lab4_t225")
    ap.add_argument("--tag", default="t225")
    ap.add_argument("--keep", action="store_true", help="leave the instance running")
    a = ap.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stem = lab.RUNS / f"c108_{a.tag}_{stamp}"
    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    if dump.main(["--host", a.host, "--deadline", "600", "snap", "--out", str(stem) + ".dump.jsonl"]) != 0:
        raise SystemExit("dump snap failed")
    code = (HERE / "c108_sweep.lua").read_text(encoding="utf-8").replace("ZTAG", a.tag)
    t = Tuner(a.host).connect()
    players = [int(x) for x in t.run(lab.IG, LIVING) if x.strip().isdigit()]
    n = 0
    with open(str(stem) + ".jsonl", "w", encoding="utf-8", newline="\n") as fh:
        for p in [-1] + players:
            for line in t.run(lab.IG, code.replace("ZP", str(p)), timeout=600.0):
                if line.startswith("{"):
                    json.loads(line)
                    fh.write(line + "\n")
                    n += 1
            print(f"player {p}: {n} rows so far", flush=True)
    t.close()
    print(f"wrote {stem}.jsonl ({n} rows) and {stem}.dump.jsonl", flush=True)
    if not a.keep:
        game.main(["--host", a.host, "close"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
