"""civ6lab b31rt_sweep — B-31r-S1, the plunder payout against the Trader's
place on its route. Load --save (a prep with the war declared and seat-0
units --units standing since an earlier turn), end --advance turns
(endturn), then for each of player --player's Traders --traders: read its
place on its route (`b31rt_trader.lua`: path length, index on the path,
yields), put one of the seat-0 units ON its plot (GameCore
`UnitManager.PlaceUnit`, moves restored), set the bank to 1000, request the
plunder (`b31r_plunder.lua`) and poll the bank; the generator's seed is read
around the request. One jsonl row per Trader under runs/
(`plunder_sweep_<tag>_<stamp>.jsonl`).

    python tools/civ6lab/b31rt_sweep.py --host 127.0.0.4 --save b31rt_prep_t101 --advance 1 \
        --units 2359297 2424839 2490376 2555918 2621446 --traders 1900555 3932178 --tag a1
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
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent
GOLD = "print(Players[0]:GetTreasury():GetGoldBalance())"
PLACE = """
local t = Players[ZP]:GetUnits():FindID(ZT)
local u = Players[0]:GetUnits():FindID(ZU)
if t == nil or u == nil then print("place missing t=" .. tostring(t ~= nil) .. " u=" .. tostring(u ~= nil)) return end
UnitManager.PlaceUnit(u, t:GetX(), t:GetY())
UnitManager.RestoreMovement(u)
Players[0]:GetTreasury():SetGoldBalance(1000)
print("place " .. u:GetX() .. ":" .. u:GetY() .. " trader " .. t:GetX() .. ":" .. t:GetY() .. " seed " .. Game.GetRandomSeed())
"""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--save", default="b31rt_prep_t101")
    ap.add_argument("--player", type=int, default=1)
    ap.add_argument("--advance", type=int, default=0)
    ap.add_argument("--units", nargs="+", type=int, required=True)
    ap.add_argument("--traders", nargs="+", type=int, required=True)
    ap.add_argument("--tag", default="sweep")
    a = ap.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"plunder_sweep_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")
    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    for _ in range(a.advance):
        lab.advance(t, "endturn", lp, 300.0, lambda s: None, one_more_turn=True)
    trader_lua = (HERE / "b31rt_trader.lua").read_text(encoding="utf-8").replace("ZP", str(a.player))
    plunder_lua = (HERE / "b31r_plunder.lua").read_text(encoding="utf-8")
    units = list(a.units)
    for tid in a.traders:
        info = json.loads(t.run(lab.IG, trader_lua.replace("ZT", str(tid)))[-1])
        row = {"tag": a.tag, "advance": a.advance, **info}
        if "error" in info or not units:
            fh.write(json.dumps(row) + "\n")
            print(json.dumps(row), flush=True)
            continue
        uid = units.pop(0)
        row["unit"] = uid
        row["place"] = t.run(lab.GC, PLACE.replace("ZP", str(a.player)).replace("ZT", str(tid)).replace("ZU", str(uid)))[-1]
        seed0 = t.run(lab.GC, "print(Game.GetRandomSeed())")[-1]
        before = float(t.run(lab.IG, GOLD)[-1])
        row["plunderLines"] = t.run(lab.IG, plunder_lua.replace("ZUID", str(uid)).replace("ZDO", "1"))
        after = before
        for _ in range(20):
            time.sleep(0.5)
            after = float(t.run(lab.IG, GOLD)[-1])
            if after != before:
                break
        row["seedBefore"], row["seedAfter"] = seed0, t.run(lab.GC, "print(Game.GetRandomSeed())")[-1]
        row["gain"] = round(after - before, 4)
        fh.write(json.dumps(row) + "\n")
        fh.flush()
        print(f"t{info['turn']} trader {tid} {info['origin'][14:]}->{info['dest'][14:]} at {info['at']}/{info['pathLen']}"
              f" toO {info['toOrigin']} toD {info['toDest']} oy {info['originYields']} gain {row['gain']}"
              f" seed {'moved' if row['seedBefore'] != row['seedAfter'] else 'same'}", flush=True)
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
