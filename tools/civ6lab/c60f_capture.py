"""civ6lab c60f_capture — C-60, the grants' fate on a fall. On the game as it
stands (load it first with `h4.py load`), optionally pass --pre turns by
endturn (the grant lands), read the Free Cities seat (`c60f_read.lua`),
then seat 0 takes the Free City at --city by force: the centre's outer pool
set to its maximum and the garrison pool one short (GameCore
`SetDamage`), any unit on the centre destroyed (recorded), a seat-0
--unit created on --from, an attack move onto the centre (`capture_move.lua`)
and Keep (`capture_keep.lua`); the seat read again, then --post turns by
endturn, read after each. One jsonl under runs/ (`c60f_capture_<tag>_<stamp>.jsonl`).

    python tools/civ6lab/c60f_capture.py --host 127.0.0.4 --city 69:21 --from 68:21 --pre 2 --post 2 --tag t250
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

HERE = pathlib.Path(__file__).parent

LUA_RIG = """
local c = Cities.GetCityInPlot(ZCX, ZCY)
if c == nil then print('{"kind":"rig","err":"nocity"}') return end
local d0 = Players[0]:GetDiplomacy()
if not d0:IsAtWarWith(c:GetOwner()) then pcall(function() d0:DeclareWarOn(c:GetOwner(), WarTypes.SURPRISE_WAR, true) end) end
local cc = c:GetDistricts():GetDistrictByType(GameInfo.Districts["DISTRICT_CITY_CENTER"].Index)
local ok1 = pcall(function() cc:SetDamage(DefenseTypes.DISTRICT_OUTER, cc:GetMaxDamage(DefenseTypes.DISTRICT_OUTER)) end)
local ok2 = pcall(function() cc:SetDamage(DefenseTypes.DISTRICT_GARRISON, cc:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON) - 1) end)
print(string.format('{"kind":"rig","war":%s,"outer":%d,"outerMax":%d,"garrison":%d,"garrisonMax":%d,"ok":"%s/%s"}',
  tostring(d0:IsAtWarWith(c:GetOwner())), cc:GetDamage(DefenseTypes.DISTRICT_OUTER), cc:GetMaxDamage(DefenseTypes.DISTRICT_OUTER),
  cc:GetDamage(DefenseTypes.DISTRICT_GARRISON), cc:GetMaxDamage(DefenseTypes.DISTRICT_GARRISON), tostring(ok1), tostring(ok2)))
for _, u in ipairs(Units.GetUnitsInPlot(Map.GetPlot(ZCX, ZCY)) or {}) do
  print(string.format('{"kind":"centreUnit","owner":%d,"id":%d,"type":"%s"}', u:GetOwner(), u:GetID(), GameInfo.Units[u:GetType()].UnitType))
  if u:GetOwner() ~= 0 then Players[u:GetOwner()]:GetUnits():Destroy(u) end
end
local made = nil
for _, name in ipairs({"ZUNIT", "UNIT_INFANTRY", "UNIT_MUSKETMAN", "UNIT_SWORDSMAN"}) do
  local u = Players[0]:GetUnits():Create(GameInfo.Units[name].Index, ZFX, ZFY)
  if u ~= nil then made = u break end
end
if made == nil then print('{"kind":"attacker","id":-1}') else
  print(string.format('{"kind":"attacker","id":%d,"type":"%s","x":%d,"y":%d}', made:GetID(), GameInfo.Units[made:GetType()].UnitType, made:GetX(), made:GetY()))
end
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--city", default="69:21")
    p.add_argument("--from", dest="frm", default="68:21")
    p.add_argument("--unit", default="UNIT_MODERN_ARMOR")
    p.add_argument("--pre", type=int, default=0)
    p.add_argument("--post", type=int, default=2)
    p.add_argument("--tag", default="arm")
    p.add_argument("--nocapture", action="store_true", help="only the --pre turns and the reads")
    p.add_argument("--prelua", default="", help="GameCore Lua run once before the --pre turns")
    p.add_argument("--deadline", type=float, default=178.0)
    p.add_argument("--wait", type=float, default=100.0)
    a = p.parse_args(argv)
    cx, cy = a.city.split(":")
    fx, fy = a.frm.split(":")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"c60f_capture_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(line: str, **extra) -> dict:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            r = {"raw": line}
        r = {"scene": a.tag, **extra, **r}
        fh.write(json.dumps(r) + "\n")
        fh.flush()
        return r

    h4.guard(a.deadline, "c60f_capture")
    t = h4.connect(a.host)
    lp = lab.local_player(t)
    reader = (HERE / "c60f_read.lua").read_text(encoding="utf-8").replace("ZCX", cx).replace("ZCY", cy)

    def read(tag: str) -> None:
        for ln in t.run(lab.GC, reader.replace("ZTAG", tag), timeout=60):
            r = rec(ln)
            if r.get("kind") in ("p62", "seat", "city", "fcity") or (r.get("kind") == "near" and r.get("owner") in (0, 62)):
                print("  ", ln, flush=True)

    def step(tag: str) -> None:
        tn = lab.advance(t, "endturn", lp, a.wait, lambda s: rec(json.dumps({"kind": "log", "text": s})), one_more_turn=True)
        print(f"turn {tn}", flush=True)
        read(tag)

    if a.prelua:
        for ln in t.run(lab.GC, a.prelua + '\nprint("prelua done")', timeout=60):
            rec(json.dumps({"kind": "prelua", "code": a.prelua, "text": ln}))
            print("  prelua", ln, flush=True)
    read("start")
    for i in range(a.pre):
        step(f"pre{i + 1}")
    if a.nocapture:
        t.close()
        fh.close()
        print("->", path.name)
        return 0
    for _ in range(30):
        act = t.run(lab.IG, "print(tostring(Players[0]:IsTurnActive()))", timeout=30)
        if act and act[-1] == "true":
            break
        time.sleep(2.0)
    rec(json.dumps({"kind": "turnActive", "text": act[-1] if act else ""}))
    print("  turn active:", act, flush=True)
    rig = LUA_RIG.replace("ZCX", cx).replace("ZCY", cy).replace("ZFX", fx).replace("ZFY", fy).replace("ZUNIT", a.unit)
    uid = -1
    for ln in t.run(lab.GC, rig, timeout=60):
        r = rec(ln)
        print("  ", ln, flush=True)
        if r.get("kind") == "attacker":
            uid = r["id"]
    if True:
        mv = (HERE / "c60f_move.lua").read_text(encoding="utf-8").replace("ZFX", fx).replace("ZFY", fy)
        mv = mv.replace("ZUID", str(uid)).replace("ZCX", cx).replace("ZCY", cy)
        for attempt in range(4):
            lines = t.run(lab.IG, mv, timeout=60)
            for ln in lines:
                rec(json.dumps({"kind": "move", "attempt": attempt, "text": ln}))
                print("  ", ln, flush=True)
            if not any("nounit" in ln for ln in lines):
                break
            time.sleep(3.0)
        keep = (HERE / "capture_keep.lua").read_text(encoding="utf-8").replace("ZCX", cx).replace("ZCY", cy)
        for ln in t.run(lab.IG, keep, timeout=60):
            rec(json.dumps({"kind": "keep", "text": ln}))
            print("  ", ln, flush=True)
    read("captured")
    for i in range(a.post):
        step(f"post{i + 1}")
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
