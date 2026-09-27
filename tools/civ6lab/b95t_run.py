"""civ6lab b95t_run — B-95, the centre base's "ever built". Does a city
centre's base follow the strongest melee the player has EVER fielded?

Load --save; read the combat preview's base for every city of --player
(`city_defense_preview.lua`); give the player one --unit (--how create: GameCore
`Create` on a free land plot of its own away from its cities; --how buy: the
local seat buys it in its capital with gold, `CityCommandTypes.PURCHASE`,
after every tech is granted; --how tech: the techs alone, nothing bought);
read; then --delete removes it
(`UnitManager.Kill`) and reads; then end --turns turns (endturn) reading the
base after each. One jsonl under runs/ (`b95t_<tag>_<stamp>.jsonl`).

    python tools/civ6lab/b95t_run.py --host 127.0.0.4 --save lab4_t150 --player 1 \
        --unit UNIT_MECHANIZED_INFANTRY --how create --delete --turns 2 --tag p1_mech_del
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

LUA_CREATE = """
local pl = Players[ZP]
local cities = {}
for _, c in pl:GetCities():Members() do cities[#cities + 1] = c end
local best = nil
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  if q:GetOwner() == ZP and not q:IsWater() and not q:IsMountain() and not q:IsImpassable() and q:GetUnitCount() == 0
     and q:GetDistrictType() < 0 then
    local near = 99
    for _, c in ipairs(cities) do near = math.min(near, Map.GetPlotDistance(c:GetX(), c:GetY(), q:GetX(), q:GetY())) end
    if near >= 2 and (best == nil or near < best[2]) then best = {q, near} end
  end
end
if best == nil then print('{"kind":"made","error":"noplot"}') return end
local u = pl:GetUnits():Create(GameInfo.Units["ZUNIT"].Index, best[1]:GetX(), best[1]:GetY())
print(string.format('{"kind":"made","how":"create","unit":"ZUNIT","id":%d,"x":%d,"y":%d}', u and u:GetID() or -1,
  best[1]:GetX(), best[1]:GetY()))
"""

LUA_TECH = """
local pl = Players[ZP]
local n = 0
for t in GameInfo.Technologies() do
  if not pl:GetTechs():HasTech(t.Index) then pl:GetTechs():SetTech(t.Index, true); n = n + 1 end
end
pl:GetTreasury():ChangeGoldBalance(5000)
-- a military unit on the centre blocks buying another one there
local c = pl:GetCities():GetCapitalCity()
local cleared = 0
for _, u in pl:GetUnits():Members() do
  local row = GameInfo.Units[u:GetType()]
  if u:GetX() == c:GetX() and u:GetY() == c:GetY() and row.FormationClass == "FORMATION_CLASS_LAND_COMBAT" then
    UnitManager.Kill(u); cleared = cleared + 1
  end
end
print('{"kind":"tech","granted":' .. n .. ',"centreCleared":' .. cleared .. '}')
"""

LUA_BUY = """
local pl = Players[ZP]
local c = pl:GetCities():GetCapitalCity()
local row = GameInfo.Units["ZUNIT"]
local p = {[CityCommandTypes.PARAM_UNIT_TYPE] = row.Hash, [CityCommandTypes.PARAM_MILITARY_FORMATION_TYPE] = MilitaryFormationTypes.STANDARD_MILITARY_FORMATION,
  [CityCommandTypes.PARAM_YIELD_TYPE] = GameInfo.Yields["YIELD_GOLD"].Index}
local can = CityManager.CanStartCommand(c, CityCommandTypes.PURCHASE, p)
if can then CityManager.RequestCommand(c, CityCommandTypes.PURCHASE, p) end
print('{"kind":"buy","can":' .. tostring(can) .. '}')
"""

LUA_FIND = """
local o = {}
for _, u in Players[ZP]:GetUnits():Members() do
  if GameInfo.Units[u:GetType()].UnitType == "ZUNIT" then o[#o + 1] = u:GetID() .. "@" .. u:GetX() .. ":" .. u:GetY() end
end
print(table.concat(o, " "))
"""

LUA_KILL = """
local u = Players[ZP]:GetUnits():FindID(ZID)
if u ~= nil then UnitManager.Kill(u) end
print('{"kind":"killed","id":ZID,"gone":' .. tostring(Players[ZP]:GetUnits():FindID(ZID) == nil) .. '}')
"""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--save", default="lab4_t150")
    ap.add_argument("--player", type=int, required=True)
    ap.add_argument("--unit", required=True)
    ap.add_argument("--how", choices=("create", "buy", "tech"), default="create")
    ap.add_argument("--delete", action="store_true")
    ap.add_argument("--turns", type=int, default=2)
    ap.add_argument("--tag", default="arm")
    ap.add_argument("--wait", type=float, default=300.0)
    a = ap.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"b95t_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(obj: dict) -> None:
        fh.write(json.dumps({"tag": a.tag, "player": a.player, "unit": a.unit, **obj}) + "\n")
        fh.flush()

    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    preview = (HERE / "city_defense_preview.lua").read_text(encoding="utf-8").replace("ZMAX", "-1")

    def read(step: str) -> None:
        bases = []
        for ln in t.run(lab.IG, preview, timeout=120):
            if not ln.startswith("{"):
                continue
            r = json.loads(ln)
            if r.get("owner") != a.player:
                continue
            rec({"kind": "preview", "step": step, **r})
            bases.append(f"{r.get('city', '')[14:]}={r.get('base')}")
        print(f"  [{step}] t{lab.turn(t)} bases {' '.join(bases)}", flush=True)

    read("before")
    sub = lambda s: s.replace("ZP", str(a.player)).replace("ZUNIT", a.unit)  # noqa: E731
    if a.how == "create":
        out = t.run(lab.GC, sub(LUA_CREATE), timeout=60)
    else:
        out = t.run(lab.GC, sub(LUA_TECH))
        if a.how == "buy":
            out += t.run(lab.IG, sub(LUA_BUY))
            time.sleep(2.0)
    for ln in out:
        print("  ", ln)
        if ln.startswith("{"):
            rec(json.loads(ln))
    found = t.run(lab.GC, sub(LUA_FIND))[-1]
    rec({"kind": "found", "units": found})
    print("   units of the type:", found)
    read("made")
    if a.delete and found:
        for tok in found.split():
            uid = tok.split("@")[0]
            ln = t.run(lab.GC, sub(LUA_KILL).replace("ZID", uid))[-1]
            rec(json.loads(ln))
            print("  ", ln)
        read("deleted")
    for _ in range(a.turns):
        lab.advance(t, "endturn", lp, a.wait, lambda s: rec({"kind": "log", "text": s}), one_more_turn=True)
        read("turn")
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
