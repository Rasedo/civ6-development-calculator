"""C-34-S1 / B-86-S2: real air strikes tied to their previews by seed
accounting. Per trial: heal the bomber and every watched unit, restore the
bomber's moves and attacks, set the generator's seed (GameCore), take the
preview (`air_preview.lua`), request the strike (AIR_ATTACK operation, or the
PRIORITY_TARGET command), poll until the damage lands, read every watched
unit and the seed after. The generator's first draws for the seed are
printed beside the outcome (README: state' = 1103515245*state + 12345 mod
2^32, draw = ((state' >> 17) * range) >> 15), so each damage can be matched
to a draw of range 12.

    python tools/civ6lab/c34_strike.py --host 127.0.0.2 --bomber 0:4653065 --at 36:44 \
        --watch 6:10944527,6:11010055 --mode normal --seeds 1001,2002,3003 --out tools/civ6lab/runs/air_strike_X.jsonl
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = "GameCore_Tuner", "InGame"

LUA_PREP = """
local function U(p, id) return Players[p]:GetUnits():FindID(id) end
local b = U(%s, %s)
b:SetDamage(0)
UnitManager.RestoreMovement(b)
UnitManager.RestoreUnitAttacks(b)
for p, id in string.gmatch("%s", "(%%d+):(%%d+)") do
  local u = U(tonumber(p), tonumber(id))
  if u ~= nil then u:SetDamage(0) end
end
Game.SetRandomSeed(%d)
print("seed " .. Game.GetRandomSeed())
"""

LUA_READ = """
local function U(p, id) return Players[p]:GetUnits():FindID(id) end
local o = {}
for p, id in string.gmatch("%s", "(%%d+):(%%d+)") do
  local u = U(tonumber(p), tonumber(id))
  if u == nil then o[#o + 1] = p .. ":" .. id .. "=gone"
  else o[#o + 1] = p .. ":" .. id .. "=" .. u:GetDamage() .. "@" .. u:GetX() .. ":" .. u:GetY() end
end
print(table.concat(o, " ") .. " seed=" .. Game.GetRandomSeed())
"""

LUA_FIRE = {
    "normal": """
local u = Players[%s]:GetUnits():FindID(%s)
local p = {[UnitOperationTypes.PARAM_X] = %s, [UnitOperationTypes.PARAM_Y] = %s}
local can = UnitManager.CanStartOperation(u, UnitOperationTypes.AIR_ATTACK, nil, p)
if can then UnitManager.RequestOperation(u, UnitOperationTypes.AIR_ATTACK, p) end
print("can " .. tostring(can))
""",
    "priority": """
local u = Players[%s]:GetUnits():FindID(%s)
local p = {[UnitCommandTypes.PARAM_X] = %s, [UnitCommandTypes.PARAM_Y] = %s}
local can = UnitManager.CanStartCommand(u, UnitCommandTypes.PRIORITY_TARGET, p)
if can then UnitManager.RequestCommand(u, UnitCommandTypes.PRIORITY_TARGET, p) end
print("can " .. tostring(can))
""",
}


def draws(seed: int, n: int, rng: int = 12) -> list[int]:
    s = seed & 0xFFFFFFFF
    out = []
    for _ in range(n):
        s = (1103515245 * s + 12345) & 0xFFFFFFFF
        out.append(((s >> 17) * (rng & 0xFFFF)) >> 15)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.2")
    ap.add_argument("--bomber", required=True)
    ap.add_argument("--at", required=True)
    ap.add_argument("--watch", required=True)
    ap.add_argument("--mode", choices=("normal", "priority"), default="normal")
    ap.add_argument("--seeds", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tag", default="")
    a = ap.parse_args()
    bp, bid = a.bomber.split(":")
    x, y = a.at.split(":")
    everyone = a.bomber + "," + a.watch
    t = Tuner(a.host).connect()
    preview_lua = (HERE / "air_preview.lua").read_text(encoding="utf-8")
    for s in (int(v) for v in a.seeds.split(",")):
        seed_line = t.run(GC, LUA_PREP % (bp, bid, a.watch, s))
        pv = preview_lua
        for k, v in (("ZA", a.bomber), ("ZPLOTS", a.at), ("ZMODE", a.mode), ("ZCT", "1184946373"),
                     ("ZTAG", f"{a.tag}_seed{s}")):
            pv = pv.replace(k, v)
        preview = t.run(IG, pv, timeout=60)
        before = t.run(GC, LUA_READ % everyone)[-1]
        fired = t.run(IG, LUA_FIRE[a.mode] % (bp, bid, x, y))
        after = before
        for _ in range(24):
            time.sleep(0.5)
            after = t.run(GC, LUA_READ % everyone)[-1]
            if after.split(" seed=")[0] != before.split(" seed=")[0]:
                time.sleep(1.0)
                after = t.run(GC, LUA_READ % everyone)[-1]
                break
        rec = {"kind": "airstrike", "tag": a.tag, "mode": a.mode, "bomber": a.bomber, "at": a.at, "seed": s,
               "seedSet": seed_line, "fired": fired, "before": before, "after": after,
               "draws12": draws(s, 6), "preview": [json.loads(p) for p in preview if p.startswith("{")]}
        with open(a.out, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        pr = rec["preview"][0] if rec["preview"] else {}

        def pd(block: str, field: str = "DAMAGE_TO"):
            b = pr.get(block)
            return b.get(field) if isinstance(b, dict) and b.get("ID", {}).get("player", -1) != -1 else None
        print(f"seed {s}: fired {fired} | before {before} | after {after} | draws12 {rec['draws12']} | preview "
              f"bomberDmg={pd('ATTACKER')} defDmg={pd('DEFENDER')} aaFrom={pd('ANTI_AIR', 'DAMAGE_FROM')}"
              f" intFrom={pd('INTERCEPTOR', 'DAMAGE_FROM')}")
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
