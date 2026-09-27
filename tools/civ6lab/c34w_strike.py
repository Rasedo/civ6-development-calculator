"""C-34 (lab, host 4): an interception's XP, war weariness and draw order, by
seed accounting. Per seed: heal the bomber and every unit on and around the
target, restore the bomber's moves, set the generator's seed (GameCore), read
every watched unit's damage and XP, take the preview (`air_preview.lua`),
request the AIR_ATTACK, poll until the damage lands, read again, and count the
draws the strike consumed (the seed after, stepped from the seed set). Every
city's war-weariness amenity loss for both seats is read before the first and
after the last trial. One jsonl under runs/, one wall-clock deadline.

    python tools/civ6lab/c34w_strike.py --bomber 0:4653065 --at 36:44 --patrol 6:11206670 --seeds 1001,2002
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = "GameCore_Tuner", "InGame"

# the watched set: the bomber, the patrol, every unit within 1 of the target
LUA_WATCH = """
local o = {"ZBOMBER", "ZPATROL"}
for dx = -2, 2 do for dy = -2, 2 do
  local q = Map.GetPlot(ZX + dx, ZY + dy)
  if q ~= nil and Map.GetPlotDistance(ZX, ZY, q:GetX(), q:GetY()) <= 1 then
    for _, u in ipairs(Units.GetUnitsInPlot(q) or {}) do o[#o + 1] = u:GetOwner() .. ":" .. u:GetID() end
  end
end end
print(table.concat(o, ","))
"""

LUA_PREP = """
local function U(p, id) return Players[p]:GetUnits():FindID(id) end
for p, id in string.gmatch("ZWATCH", "(%d+):(%d+)") do
  local u = U(tonumber(p), tonumber(id))
  if u ~= nil then u:SetDamage(0) end
end
local b = U(ZBP, ZBID)
UnitManager.RestoreMovement(b)
UnitManager.RestoreUnitAttacks(b)
Game.SetRandomSeed(ZSEED)
print("seed " .. Game.GetRandomSeed())
"""

# damage and XP of every watched unit, and the seed (GameCore)
LUA_READ = """
local o = {}
for p, id in string.gmatch("ZWATCH", "(%d+):(%d+)") do
  local u = Players[tonumber(p)]:GetUnits():FindID(tonumber(id))
  if u == nil then o[#o + 1] = '"' .. p .. ':' .. id .. '":null'
  else
    local okx, xp = pcall(function() return u:GetExperience():GetExperiencePoints() end)
    o[#o + 1] = '"' .. p .. ':' .. id .. '":{"type":"' .. GameInfo.Units[u:GetType()].UnitType .. '","dmg":' .. u:GetDamage()
      .. ',"x":' .. u:GetX() .. ',"y":' .. u:GetY() .. ',"xp":' .. (okx and tostring(xp) or ('"err:' .. tostring(xp) .. '"')) .. '}'
  end
end
print('{"units":{' .. table.concat(o, ",") .. '},"seed":' .. Game.GetRandomSeed() .. '}')
"""

# every city of the seats: the war-weariness amenity loss (InGame)
LUA_WW = """
local o = {}
for p in string.gmatch("ZSEATS", "(%d+)") do
  for _, c in Players[tonumber(p)]:GetCities():Members() do
    local ok, v = pcall(function() return c:GetGrowth():GetAmenitiesLostFromWarWeariness() end)
    o[#o + 1] = '"' .. p .. ':' .. c:GetID() .. '":' .. (ok and tostring(v) or '"err"')
  end
end
print('{"kind":"ww","turn":' .. Game.GetCurrentGameTurn() .. ',"cities":{' .. table.concat(o, ",") .. '}}')
"""

LUA_FIRE = """
local u = Players[ZBP]:GetUnits():FindID(ZBID)
local p = {[UnitOperationTypes.PARAM_X] = ZX, [UnitOperationTypes.PARAM_Y] = ZY}
local can = UnitManager.CanStartOperation(u, UnitOperationTypes.AIR_ATTACK, nil, p)
if can then UnitManager.RequestOperation(u, UnitOperationTypes.AIR_ATTACK, p) end
print("can " .. tostring(can))
"""


def step(s: int) -> int:
    return (1103515245 * s + 12345) & 0xFFFFFFFF


def draws_between(s0: int, s1: int, cap: int = 64) -> int | None:
    s = s0 & 0xFFFFFFFF
    for n in range(cap + 1):
        if s == s1 & 0xFFFFFFFF:
            return n
        s = step(s)
    return None


def draw_values(seed: int, n: int, rng: int) -> list[int]:
    s, out = seed & 0xFFFFFFFF, []
    for _ in range(n):
        s = step(s)
        out.append(((s >> 17) * (rng & 0xFFFF)) >> 15)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.4")
    ap.add_argument("--bomber", default="0:4653065")
    ap.add_argument("--patrol", default="6:11206670")
    ap.add_argument("--at", default="36:44")
    ap.add_argument("--seeds", default="1001,2002,3003")
    ap.add_argument("--seats", default="0,6")
    ap.add_argument("--tag", default="")
    ap.add_argument("--no-preview", action="store_true")
    ap.add_argument("--deadline", type=float, default=175.0)
    a = ap.parse_args(argv)
    h4.guard(a.deadline, "c34w_strike")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = HERE / "runs" / f"c34w_strike_{a.tag or 'x'}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(r: dict) -> None:
        fh.write(json.dumps({"tag": a.tag, **r}, ensure_ascii=False) + "\n")
        fh.flush()

    bp, bid = a.bomber.split(":")
    x, y = a.at.split(":")
    t = h4.connect(a.host)
    watch = t.run(GC, LUA_WATCH.replace("ZBOMBER", a.bomber).replace("ZPATROL", a.patrol)
                  .replace("ZX", x).replace("ZY", y))[-1]
    watch = ",".join(dict.fromkeys(watch.split(",")))
    rec({"kind": "watch", "units": watch})
    ww0 = json.loads(t.run(IG, LUA_WW.replace("ZSEATS", a.seats))[-1])
    rec({**ww0, "when": "before"})
    pv_src = (HERE / "air_preview.lua").read_text(encoding="utf-8")
    for s in (int(v) for v in a.seeds.split(",")):
        sub = lambda lua: (lua.replace("ZWATCH", watch).replace("ZBP", bp).replace("ZBID", bid)  # noqa: E731
                           .replace("ZSEED", str(s)).replace("ZX", x).replace("ZY", y))
        t.run(GC, sub(LUA_PREP))
        before = json.loads(t.run(GC, sub(LUA_READ))[-1])
        preview = []
        if not a.no_preview:
            pv = pv_src
            for k, v in (("ZA", a.bomber), ("ZPLOTS", a.at), ("ZMODE", "normal"), ("ZCT", "1184946373"),
                         ("ZTAG", f"{a.tag}_seed{s}")):
                pv = pv.replace(k, v)
            preview = [json.loads(p) for p in t.run(IG, pv, timeout=60) if p.startswith("{")]
            # the preview must not draw
            chk = json.loads(t.run(GC, sub(LUA_READ))[-1])
            if chk["seed"] != before["seed"]:
                print("  the preview moved the seed", before["seed"], "->", chk["seed"])
                before = chk
        fired = t.run(IG, sub(LUA_FIRE))
        after = before
        for _ in range(30):
            time.sleep(0.5)
            after = json.loads(t.run(GC, sub(LUA_READ))[-1])
            if after["units"] != before["units"]:
                time.sleep(1.5)
                after = json.loads(t.run(GC, sub(LUA_READ))[-1])
                break
        n = draws_between(before["seed"], after["seed"])
        r = {"kind": "strike", "seed": s, "seedBefore": before["seed"], "fired": fired, "before": before["units"],
             "after": after["units"], "seedAfter": after["seed"], "draws": n,
             "d12": draw_values(before["seed"], n or 0, 12), "d100": draw_values(before["seed"], n or 0, 100),
             "preview": preview}
        rec(r)
        delta = {k: (None if after["units"].get(k) is None else
                     {"dmg": after["units"][k]["dmg"], "xp": f"{v['xp']}->{after['units'][k]['xp']}"})
                 for k, v in before["units"].items() if v is not None and after["units"].get(k) != v}
        pr = preview[0] if preview else {}

        def blk(name: str) -> str:
            b = pr.get(name)
            if not isinstance(b, dict) or b.get("ID", {}).get("player", -1) == -1:
                return "-"
            return f"S{b.get('COMBAT_STRENGTH')} to{b.get('DAMAGE_TO')} from{b.get('DAMAGE_FROM')} xp{b.get('EXPERIENCE_CHANGE')}"
        print(f"seed {s}: {fired} draws={n} d12={r['d12']} changed={delta}")
        print(f"   preview ATT {blk('ATTACKER')} | DEF {blk('DEFENDER')} | INT {blk('INTERCEPTOR')} | AA {blk('ANTI_AIR')}")
    ww1 = json.loads(t.run(IG, LUA_WW.replace("ZSEATS", a.seats))[-1])
    rec({**ww1, "when": "after"})
    print("ww before", ww0["cities"])
    print("ww after ", ww1["cities"])
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
