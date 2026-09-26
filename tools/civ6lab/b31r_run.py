"""civ6lab b31r_run — B-31r-S1, what a plundered route pays. On the game as
it stands: each turn, for each of seat 0's units --units, `b31r_turn.lua`
moves it onto the nearest enemy Trader within --reach, then
`b31r_plunder.lua` requests the plunder (the bank set to 1000 first, so the
turn's own income cannot hide in it), and the bank is polled until it
moves (the command lands on the game's clock) — then one endturn. One jsonl
row per attempt under runs/ (the trader, its plot and water, the era, the
gold / faith / science / culture before and after, and the routes that vanished
with a paying plunder — `b31r_traders.lua` before and after, the route cut —
and the game's generator seed around the request, which moves only if the
plunder draws).

    python tools/civ6lab/b31r_run.py --host 127.0.0.3 --units 3080210 3145745 --turns 4 --tag t150
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
PURSE = ('local pl = Players[0]; local t = pl:GetTechs(); local k = pl:GetCulture(); '
         'print(pl:GetTreasury():GetGoldBalance() .. " " .. pl:GetReligion():GetFaithBalance() .. " " '
         '.. t:GetResearchProgress(t:GetResearchingTech()) .. " " .. k:GetCulturalProgress(k:GetProgressingCivic()) '
         '.. " " .. Game.GetEras():GetCurrentEra())')


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--units", nargs="+", type=int, required=True)
    p.add_argument("--reach", type=int, default=2)
    p.add_argument("--turns", type=int, default=3)
    p.add_argument("--tag", default="run")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"plunder_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    turn_lua = (HERE / "b31r_turn.lua").read_text(encoding="utf-8")
    plunder_lua = (HERE / "b31r_plunder.lua").read_text(encoding="utf-8")
    traders_lua = (HERE / "b31r_traders.lua").read_text(encoding="utf-8")

    def purse() -> list[float]:
        return [float(v) for v in t.run(lab.IG, PURSE)[-1].split()]

    for k in range(a.turns):
        for uid in a.units:
            out = t.run(lab.IG, turn_lua.replace("ZUID", str(uid)).replace("ZREACH", str(a.reach)))[-1]
            r = json.loads(out)
            if r.get("state") in ("on", "moved"):
                time.sleep(1.5)
                routes_before = {ln for ln in t.run(lab.IG, traders_lua, timeout=60) if ln.startswith("route ")}
                t.run(lab.GC, "Players[0]:GetTreasury():SetGoldBalance(1000)")
                before = purse()
                seed0 = t.run(lab.GC, "print(Game.GetRandomSeed())")[-1]
                lines = t.run(lab.IG, plunder_lua.replace("ZUID", str(uid)).replace("ZDO", "1"))
                r["plunderLines"] = lines
                after = before
                for _ in range(20):
                    time.sleep(0.5)
                    after = purse()
                    if after[0] != before[0]:
                        break
                r["purseBefore"], r["purseAfter"] = before, after
                r["seedBefore"], r["seedAfter"] = seed0, t.run(lab.GC, "print(Game.GetRandomSeed())")[-1]
                r["gain"] = [round(y - x, 4) for x, y in zip(before, after)]
                if r["gain"][0] != 0:
                    time.sleep(1.0)
                    routes_after = {ln for ln in t.run(lab.IG, traders_lua, timeout=60) if ln.startswith("route ")}
                    r["routesGone"] = sorted(ln.split(" ", 2)[2] for ln in routes_before - routes_after)
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(json.dumps({k2: r.get(k2) for k2 in ("turn", "unit", "state", "trader", "owner", "water", "gain", "routesGone")}), flush=True)
        if k < a.turns - 1:
            lab.advance(t, "endturn", lp, 300.0, lambda s: None)
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
