"""civ6lab garrison_scale — B-95: the centre's garrison line against the
garrison's health and strength.

    python tools/civ6lab/garrison_scale.py --host 127.0.0.1 --save lab4_t150 --player 1 \
        --units UNIT_WARRIOR,UNIT_MUSKETMAN,UNIT_INFANTRY --damages 0,10,25,50,75,90

Per unit type: place it on the player's capital (GameCore
`UnitManager.InitUnit`, after clearing the centre's own land military), then
per damage step set its damage (`UnitManager` `ChangeDamage` / the unit's
`SetDamage`, whichever exists) and read the combat preview's DEFENSES lines
in InGame (`garrison_scale.lua`). One JSON line per step:
runs/garrison_scale_<stamp>.jsonl.
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

HERE = pathlib.Path(__file__).parent

LUA_PLACE = """
local pl = Players[ZP]
local c = pl:GetCities():GetCapitalCity()
for _, u in pl:GetUnits():Members() do
  if u:GetX() == c:GetX() and u:GetY() == c:GetY() and GameInfo.Units[u:GetType()].FormationClass == "FORMATION_CLASS_LAND_COMBAT" then
    UnitManager.Kill(u)
  end
end
local u = UnitManager.InitUnit(ZP, "ZUNIT", c:GetX(), c:GetY())
print(u and "placed" or "failed")
"""

LUA_DAMAGE = """
local pl = Players[ZP]
local c = pl:GetCities():GetCapitalCity()
for _, u in pl:GetUnits():Members() do
  if u:GetX() == c:GetX() and u:GetY() == c:GetY() and GameInfo.Units[u:GetType()].FormationClass == "FORMATION_CLASS_LAND_COMBAT" then
    local ok = pcall(function() u:SetDamage(ZDMG) end)
    if not ok then ok = pcall(function() u:ChangeDamage(ZDMG - u:GetDamage()) end) end
    print("damage " .. u:GetDamage() .. " " .. tostring(ok))
  end
end
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--save", default="lab4_t150")
    p.add_argument("--player", type=int, default=1)
    p.add_argument("--units", default="UNIT_WARRIOR,UNIT_MUSKETMAN,UNIT_INFANTRY")
    p.add_argument("--damages", default="0,10,25,50,75,90")
    a = p.parse_args(argv)
    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} failed")
    t = Tuner(a.host).connect()
    read = (HERE / "garrison_scale.lua").read_text(encoding="utf-8").replace("ZP", str(a.player))
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"garrison_scale_{stamp}.jsonl"
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for unit in a.units.split(","):
            print(unit, t.run(lab.GC, LUA_PLACE.replace("ZP", str(a.player)).replace("ZUNIT", unit))[-1], flush=True)
            for dmg in a.damages.split(","):
                print("   ", t.run(lab.GC, LUA_DAMAGE.replace("ZP", str(a.player)).replace("ZDMG", dmg))[-1], flush=True)
                line = t.run(lab.IG, read)[-1]
                rec = json.loads(line)
                rec.update({"save": a.save, "player": a.player, "setDamage": int(dmg)})
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                print("   ", json.dumps(rec, ensure_ascii=False), flush=True)
    print("->", out.name)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
