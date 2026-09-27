"""civ6lab c60t_grant_run — C-60, where a Free City's grant stands. Load
--save, stand a seat-0 unit on every plot of --block ("x:y;x:y", the first land
type `Create` accepts; water plots the first naval type), burn --burn
GameCore draws, then end turns (endturn mode) until --until, reading after
each turn every Free Cities unit (id, type, class, plot, distance from the
city at --city) and whether each blocker still stands; before every later
turn ends, a plot whose blocker is gone is filled again and a standing
blocker healed. Units whose id was not
there at the load are marked new. One jsonl under runs/
(`c60t_grant_<tag>_<stamp>.jsonl`).

    python tools/civ6lab/c60t_grant_run.py --host 127.0.0.4 --block "69:20" --until 252 --tag b6920
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import lab  # noqa: E402
import h4  # noqa: E402

LUA_BLOCK = """
local LAND = {"UNIT_MODERN_ARMOR", "UNIT_TANK", "UNIT_INFANTRY", "UNIT_MUSKETMAN", "UNIT_SWORDSMAN"}
local SEA = {"UNIT_DESTROYER", "UNIT_IRONCLAD", "UNIT_FRIGATE", "UNIT_GALLEY"}
for x, y in string.gmatch("ZBLOCK", "(%d+):(%d+)") do
  local q = Map.GetPlot(tonumber(x), tonumber(y))
  local made = "none"
  local mine = nil
  for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do if u:GetOwner() == 0 then mine = u end end
  if mine ~= nil then
    mine:SetDamage(0)
    made = "held"
  end
  for _, name in ipairs(mine == nil and (q:IsWater() and SEA or LAND) or {}) do
    local u = Players[0]:GetUnits():Create(GameInfo.Units[name].Index, q:GetX(), q:GetY())
    if u ~= nil then made = name .. ":" .. u:GetID() break end
  end
  print(string.format('{"kind":"block","x":%s,"y":%s,"made":"%s","units":%d}', x, y, made, q:GetUnitCount()))
end
"""

LUA_READ = """
local c = CityManager.GetCityAt(ZCX, ZCY)
print(string.format('{"kind":"city","turn":%d,"owner":%d}', Game.GetCurrentGameTurn(), c and c:GetOwner() or -1))
for _, u in Players[62]:GetUnits():Members() do
  local d = GameInfo.Units[u:GetType()]
  print(string.format('{"kind":"p62","turn":%d,"id":%d,"type":"%s","class":"%s","x":%d,"y":%d,"idx":%d,"dist":%d}',
    Game.GetCurrentGameTurn(), u:GetID(), d.UnitType, tostring(d.FormationClass), u:GetX(), u:GetY(),
    Map.GetPlotIndex(u:GetX(), u:GetY()), Map.GetPlotDistance(ZCX, ZCY, u:GetX(), u:GetY())))
end
for dx = -4, 4 do
  for dy = -4, 4 do
    local q = Map.GetPlot(ZCX + dx, ZCY + dy)
    if q ~= nil and Map.GetPlotDistance(ZCX, ZCY, q:GetX(), q:GetY()) <= 3 and q:GetUnitCount() > 0 then
      local us = {}
      for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do us[#us + 1] = u:GetOwner() .. ":" .. GameInfo.Units[u:GetType()].UnitType end
      print(string.format('{"kind":"occ","turn":%d,"x":%d,"y":%d,"idx":%d,"units":"%s"}', Game.GetCurrentGameTurn(),
        q:GetX(), q:GetY(), q:GetIndex(), table.concat(us, ",")))
    end
  end
end
for x, y in string.gmatch("ZBLOCK", "(%d+):(%d+)") do
  local n0 = 0
  for _, u in ipairs(Units.GetUnitsInPlot(Map.GetPlot(tonumber(x), tonumber(y))) or {}) do
    if u:GetOwner() == 0 then n0 = n0 + 1 end
  end
  if n0 == 0 then print(string.format('{"kind":"blockgone","x":%s,"y":%s}', x, y)) end
end
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--save", default="lab4_t250")
    p.add_argument("--city", default="69:21")
    p.add_argument("--block", default="")
    p.add_argument("--burn", type=int, default=0, help="Game.GetRandNum draws burnt after the rig")
    p.add_argument("--tburn", type=int, default=0, help="TerrainBuilder.GetRandomNumber draws burnt after the rig")
    p.add_argument("--prelua", default="", help="GameCore Lua run once after the rig (e.g. an improvement set)")
    p.add_argument("--deadline", type=float, default=178.0)
    p.add_argument("--until", type=int, default=252)
    p.add_argument("--tag", default="arm")
    p.add_argument("--wait", type=float, default=120.0)
    a = p.parse_args(argv)
    cx, cy = a.city.split(":")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"c60t_grant_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(line: str) -> dict:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            r = {"raw": line}
        r = {"tag": a.tag, "block": a.block, "burn": a.burn, **r}
        fh.write(json.dumps(r) + "\n")
        fh.flush()
        return r

    h4.guard(a.deadline, "c60t_grant_run")
    ns = argparse.Namespace(host=a.host, name=a.save, deadline=a.deadline, t0=time.monotonic())
    if h4.load_start(ns) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    time.sleep(4.0)
    if h4.load_wait(ns) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} did not reach the game")
    t = h4.connect(a.host)
    lp = lab.local_player(t)
    if a.block:
        for ln in t.run(lab.GC, LUA_BLOCK.replace("ZBLOCK", a.block), timeout=60):
            rec(ln)
            print(ln, flush=True)
    if a.burn:
        for ln in t.run(lab.GC, f"for i = 1, {a.burn} do Game.GetRandNum(100, 'lab') end "
                                f"print('{{\"kind\":\"burn\",\"n\":{a.burn},\"seed\":' .. Game.GetRandomSeed() .. '}}')"):
            rec(ln)
    if a.prelua:
        for ln in t.run(lab.GC, a.prelua + '\nprint("prelua done")'):
            rec(json.dumps({"kind": "prelua", "code": a.prelua, "text": ln}))
    if a.tburn:
        for ln in t.run(lab.GC, f"for i = 1, {a.tburn} do TerrainBuilder.GetRandomNumber(100, 'lab') end "
                                f"print('{{\"kind\":\"tburn\",\"n\":{a.tburn}}}')"):
            rec(ln)
    # where the game PLACES each Free Cities unit, before that seat's turn moves it
    ev = (pathlib.Path(__file__).parent / "unit_events.lua").read_text(encoding="utf-8")
    ev = ev.replace("ZP", "-1").replace("ZSRC", "Events").replace("ZCLEAR", "1")
    t.run(lab.IG, "LAB_UNIT_ARMED = nil LAB_UNIT_LOG = {}")
    for ln in t.run(lab.IG, ev.replace("ZMODE", "arm")):
        rec(json.dumps({"kind": "events", "text": ln}))
    reader = LUA_READ.replace("ZCX", cx).replace("ZCY", cy).replace("ZBLOCK", a.block)
    known: set[int] = set()
    first = True
    first_turn = True
    while True:
        for ln in t.run(lab.IG, ev.replace("ZMODE", "read")):
            if ln.startswith("log"):
                continue
            tn, what, pl, uid, x, y = ln.split(":")
            rec(json.dumps({"kind": "event", "turn": int(tn), "event": what, "player": int(pl), "id": int(uid),
                            "x": int(x), "y": int(y)}))
            if what == "add" and pl == "62":
                print(f"  PLACED t{tn} {uid} at {x}:{y}", flush=True)
        for ln in t.run(lab.GC, reader, timeout=60):
            r = rec(ln)
            if r.get("kind") == "p62":
                if first:
                    known.add(r["id"])
                elif r["id"] not in known:
                    known.add(r["id"])
                    print(f"  NEW t{r['turn']} {r['id']} {r['type']} {r['class']} at {r['x']}:{r['y']} idx {r['idx']} d{r['dist']}",
                          flush=True)
                    fh.write(json.dumps({"tag": a.tag, "kind": "grant", **r}) + "\n")
            elif r.get("kind") in ("city", "blockgone"):
                print("  ", ln, flush=True)
        first = False
        if lab.turn(t) >= a.until:
            break
        if a.block and not first_turn:
            for ln in t.run(lab.GC, LUA_BLOCK.replace("ZBLOCK", a.block), timeout=60):
                r = rec(ln)
                if r.get("made") != "held":
                    print("  reblock", ln, flush=True)
        first_turn = False
        lab.advance(t, "endturn", lp, a.wait, lambda s: rec(json.dumps({"kind": "log", "text": s})),
                    one_more_turn=True)
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
