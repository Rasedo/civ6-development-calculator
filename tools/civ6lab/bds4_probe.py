"""B-D-S4: the policy price against techs AND civics held, one change at a
time, at the price's top (s = 0) and on its fall.

Load `--save`, play `--turns` Autoplay turns, then run the `--plan`: a
comma list of `<kind><dir><order>x<n>` phases, e.g. `tech-cheapx10` (remove
the ten cheapest techs held, one per step), `civic+cheapx8` (grant the eight
cheapest civics missing). Per step: `bds4_step.lua` (GameCore: the counts and
cost sums held before the step, then the change) and the price
(`policy_cost.lua`, InGame). A last `bds4_step.lua` with ZDIR=0 reads the
final counts. Record: runs/bds4_probe_<stamp>.jsonl.

    python tools/civ6lab/bds4_probe.py --host 127.0.0.2 --turns 2 --players 3,4,7 \
        --plan tech-cheapx10,civic+cheapx6,civic-cheapx6
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402
from pair_run import run_lua, snippet  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--save", default="lab4_t150")
    ap.add_argument("--turns", type=int, default=2)
    ap.add_argument("--players", default="3,4,7")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--tag", default="")
    a = ap.parse_args(argv)
    players = {int(x) for x in a.players.split(",")}
    phases = []
    for ph in a.plan.split(","):
        m = re.fullmatch(r"(tech|civic)([+-])(cheap|dear)x(\d+)", ph)
        if not m:
            raise SystemExit(f"bad phase {ph!r}")
        phases.append((m.group(1), 1 if m.group(2) == "+" else -1, m.group(3), int(m.group(4))))
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"bds4_probe{a.tag}_{stamp}.jsonl"
    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit("load failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    for _ in range(a.turns):
        lab.advance(t, "autoplay", lp, 900.0)
    turn = lab.turn(t)

    def price() -> list[dict]:
        return [x for x in run_lua(t, lab.IG, snippet("policy_cost.lua", None, {}))["json"] if x.get("p") in players]

    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"kind": "base", "turn": turn, "price": price()}) + "\n")
        i = 0
        for kind, d, order, n in phases:
            for _ in range(n):
                tok = {"ZPLAYERS": a.players, "ZDIR": str(d), "ZKIND": kind, "ZORDER": order}
                step = run_lua(t, lab.GC, snippet("bds4_step.lua", None, tok))["json"]
                pr = price()
                fh.write(json.dumps({"kind": "step", "i": i, "phase": f"{kind}{d:+d}{order}", "step": step, "price": pr}) + "\n")
                fh.flush()
                print(i, kind, d, [(s["p"], s.get("moved"), s["T"], s["C"]) for s in step],
                      [(x["p"], x["cost"]) for x in pr], flush=True)
                i += 1
        final = run_lua(t, lab.GC, snippet("bds4_step.lua", None, {"ZPLAYERS": a.players, "ZDIR": "0",
                                                                     "ZKIND": "tech", "ZORDER": "cheap"}))["json"]
        fh.write(json.dumps({"kind": "final", "step": final, "price": price()}) + "\n")
    t.close()
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
