"""Find the interception rule for SUBMARINE-launched weapons.

The bomber rule is an anti-air attack on the delivering unit, cancelled when the
bomber drops below half health. A submarine launch behaves differently: the
launcher takes no damage at all, one draw is consumed, and the strike was
stopped at u = 0.05 where the bomber's strike got through. So this is a
probability roll on the draw, and the battery brackets its threshold.

Each round: rebuild the scene, spawn a fresh submarine at distance 2 (distance 1
is below the launcher's minimum range and offers no targets), set the seed,
fire, read whether the aim plot burned.
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"
AIM_X, AIM_Y, WAR = 35, 11, 1
SUB_X, SUB_Y = 34, 9

M = 1 << 32
A = 1103515245


def u_of(seed):
    return ((((A * (seed % M) + 12345) % M) >> 17)) / 32768


def lua(state, code=None, fname=None, sets=None):
    cmd = [sys.executable, LAB, "lua", "--state", state]
    if fname:
        cmd += ["--file", fname]
    else:
        cmd += [code]
    for k, v in (sets or {}).items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def grab(txt, key, cast=str):
    m = re.search(rf'"{key}":"?(-?[\w.:]+?)"?[,}}]', txt)
    return cast(m.group(1)) if m else None


READ = ("local fm=Game.GetFalloutManager() local q=Map.GetPlot(%d,%d) "
        "print('{\"nuclear\":'..Players[0]:GetWMDs():GetWeaponCount("
        "GameInfo.WMDs['WMD_NUCLEAR_DEVICE'].Index)..',\"aimFallout\":'.."
        "fm:GetFalloutTurnsRemaining(q:GetIndex())..'}')") % (AIM_X, AIM_Y)

SEEDS = [int(x) for x in sys.argv[1:]] or [1017, 1695, 25901, 39699]
rows = []
for seed in SEEDS:
    lua("GameCore_Tuner", fname=rf"{D}\intercept_stack.lua",
        sets={"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": "UNIT_MOBILE_SAM",
              "ZMARKER": "UNIT_WARRIOR", "ZN": 1, "ZG1X": 34, "ZG1Y": 11,
              "ZG2X": 35, "ZG2Y": 12, "ZG3X": 36, "ZG3Y": 12, "ZG4X": 34, "ZG4Y": 11})
    sub = lua("GameCore_Tuner", fname=rf"{D}\sub_launch.lua",
              sets={"ZX": SUB_X, "ZY": SUB_Y, "ZSTOCK": 12})
    sid = grab(sub, "id", int)
    before = int(grab(lua("GameCore_Tuner", code=READ), "nuclear", int))
    lua("GameCore_Tuner", fname=rf"{D}\rng_seed.lua", sets={"ZSET": 1, "ZSEED": seed})
    fire = lua("InGame", code=(
        "local u=nil for _,x in Players[0]:GetUnits():Members() do if x:GetID()==%d then u=x end end "
        "if u==nil then print('nosub') return end local p={} "
        "p[UnitOperationTypes.PARAM_X]=%d p[UnitOperationTypes.PARAM_Y]=%d "
        "p[UnitOperationTypes.PARAM_WMD_TYPE]=GameInfo.WMDs['WMD_NUCLEAR_DEVICE'].Index "
        "local okc,can=pcall(function() return UnitManager.CanStartOperation("
        "u,UnitOperationTypes.WMD_STRIKE,nil,p) end) local f=false "
        "if okc and can then f=pcall(function() UnitManager.RequestOperation("
        "u,UnitOperationTypes.WMD_STRIKE,p) end) end "
        "print('{\"can\":'..tostring(okc and can)..',\"fired\":'..tostring(f)..'}')")
        % (sid, AIM_X, AIM_Y))
    out = ""
    for _ in range(20):
        out = lua("GameCore_Tuner", code=READ)
        if int(grab(out, "nuclear", int)) != before:
            break
    executed = int(grab(out, "nuclear", int)) != before
    row = {"kind": "sub-roll", "seed": seed, "u": round(u_of(seed), 5),
           "executed": executed, "fired": '"fired":true' in fire,
           "landed": int(grab(out, "aimFallout", int)) > 0}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

done = [r for r in rows if r["executed"]]
print("\n  u        outcome")
for r in sorted(done, key=lambda r: r["u"]):
    print(f"  {r['u']:.4f}   {'LANDED' if r['landed'] else 'intercepted'}")
