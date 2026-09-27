"""B-D-S3: the policy-unlock price against the tech count, one tech at a time.

Load a save, play `--turns` Autoplay turns to a turn where the seats in
`--players` have just completed a civic (the price at its 50 x k top), then
per step grant (or remove) ONE tech per seat (`bds3_step.lua`, GameCore) and
read `GetCostToUnlockPolicies` (`policy_cost.lua`, InGame) — the tech count
is read one call later, as `HasTech` lags a grant by one tuner call. Two
orders separate "k is a function of the COUNT" from "k weighs the techs":
`--order cheap` grants the cheapest missing tech first, `dear` the dearest.

    python tools/civ6lab/bds3_ladder.py --host 127.0.0.2 --save lab4_t150 --turns 2,3 \
        --players 3,4,7 --order cheap --up 25 --down 10
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402
from pair_run import run_lua, snippet  # noqa: E402


def read(t: Tuner, players: set[int]) -> list[dict]:
    out = run_lua(t, lab.IG, snippet("policy_cost.lua", None, {}))
    return [x for x in out["json"] if x.get("p") in players]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--save", default="lab4_t150")
    ap.add_argument("--turns", default="2", help="Autoplay turns before a ladder; a comma list runs one ladder per value")
    ap.add_argument("--players", default="3,4,7")
    ap.add_argument("--order", choices=("cheap", "dear"), default="cheap")
    ap.add_argument("--up", type=int, default=25, help="grant steps")
    ap.add_argument("--down", type=int, default=10, help="removal steps after reloading")
    a = ap.parse_args(argv)
    players = {int(x) for x in a.players.split(",")}
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"bds3_ladder_{a.order}_{stamp}.jsonl"
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for (direction, steps), nturns in [(d, int(n)) for d in ((1, a.up), (-1, a.down)) for n in a.turns.split(",")]:
            if steps <= 0:
                continue
            if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
                raise SystemExit("load failed")
            t = Tuner(a.host).connect()
            lp = lab.local_player(t)
            for _ in range(nturns):
                lab.advance(t, "autoplay", lp, 900.0)
            tokens = {"ZPLAYERS": a.players, "ZDIR": str(direction), "ZORDER": a.order}
            fh.write(json.dumps({"kind": "base", "dir": direction, "turn": lab.turn(t), "read": read(t, players)}) + "\n")
            for i in range(steps):
                moved = run_lua(t, lab.GC, snippet("bds3_step.lua", None, tokens))["json"]
                cost = read(t, players)
                again = read(t, players)  # the tech count settles one call later
                fh.write(json.dumps({"kind": "step", "dir": direction, "i": i, "moved": moved,
                                     "read": cost, "read2": again}) + "\n")
                fh.flush()
                print(direction, i, [(m.get("p"), m.get("tech")) for m in moved],
                      [(x["p"], x["cost"], x["techs"]) for x in again], flush=True)
            t.close()
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
