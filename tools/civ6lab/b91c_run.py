"""B-91 colonization at population >= 2: one arm per load.

    python tools/civ6lab/b91c_run.py --host 127.0.0.4 --arm on_pop --save lab4_t150 --p 1 --x 37 --y 17

Arms: `add` (Colonization added to --p's religion) x `mod` (the Exploration
golden age's +population off the home continent attached). The seat is made
local (SetLocalPlayerAndObserver), its Settler founds, the city is read until
it stands (b91s3_city.lua), the seat is switched back to 0. Appends to
runs/b91c_colonization.jsonl.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import pair_run  # noqa: E402
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent
REC = HERE / "runs" / "b91c_colonization.jsonl"


def js(t, state, file, tokens):
    out = pair_run.run_lua(t, state, pair_run.snippet(file, None, tokens), timeout=40)
    return out["json"] if out["json"] else out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--save", default="lab4_t150")
    p.add_argument("--arm", required=True)
    p.add_argument("--add", type=int, default=1)
    p.add_argument("--mod", type=int, default=1)
    p.add_argument("--p", type=int, default=1)
    p.add_argument("--x", type=int, default=37)
    p.add_argument("--y", type=int, default=17)
    p.add_argument("--noload", action="store_true")
    a = p.parse_args()
    h4.guard(170, "b91c arm " + a.arm)
    if not a.noload:
        ns = argparse.Namespace(host=a.host, name=a.save, deadline=150, t0=time.monotonic())
        if h4.cmd_load(ns) != 0:
            print("load failed")
            return 1
    t = h4.connect(a.host)
    tok = {"ZP": str(a.p), "ZX": str(a.x), "ZY": str(a.y), "ZADD": str(a.add), "ZMOD": str(a.mod), "ZTAG": a.arm}
    rec = {"arm": a.arm, "save": a.save, "add": a.add, "mod": a.mod, "p": a.p, "x": a.x, "y": a.y}
    rec["rig"] = js(t, "GameCore", "b91c_rig.lua", tok)
    t.run(game.GC, f"PlayerManager.SetLocalPlayerAndObserver({a.p})")
    time.sleep(2.0)
    rec["found"] = js(t, "InGame", "b91c_found.lua", tok)
    reads = []
    end = time.monotonic() + 30
    while time.monotonic() < end:
        time.sleep(1.5)
        r = js(t, "InGame", "b91s3_city.lua", tok)
        if isinstance(r, list) and r and r[0].get("found"):
            reads.append(r[0])
            if len(reads) >= 2:
                break
    rec["city"] = reads
    t.run(game.GC, "PlayerManager.SetLocalPlayerAndObserver(0)")
    rec["local_after"] = t.run(game.IG, "print(Game.GetLocalPlayer())")
    t.close()
    with REC.open("a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(json.dumps(rec, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
