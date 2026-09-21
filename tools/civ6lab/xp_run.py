"""Is experience gain a roll?

GlobalParameters ships only FIXED experience amounts and not a single range:
EXPERIENCE_COMBAT_RANGED 1, EXPERIENCE_NOT_COMBAT_RANGED 2,
EXPERIENCE_COMBAT_ATTACKER_BONUS 1, EXPERIENCE_KILL_BONUS 2,
EXPERIENCE_DISTRICT_VS_UNIT 2, EXPERIENCE_CITY_CAPTURED 10,
EXPERIENCE_ACTIVATE_GOODY_HUT 5, EXPERIENCE_REVEAL_NATURAL_WONDER 10,
EXPERIENCE_MAXIMUM_ONE_COMBAT 8 (Expansion2 overrides Base's 10). That is a
catalogue of constants, but it does not prove the ENGINE does not draw.

A unit may attack once per turn, so this places N identical crossbowmen and
fires each one once at its own seed against an identical, fresh defender. The
damage therefore differs between rounds while the event does not. If the
experience banked is the same integer every time, the award is a function of
the event, not of a draw -- and the preview's EXPERIENCE_CHANGE predicted it.

    python xp_run.py <seed> [seed ...]
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

ATT_X, ATT_Y = 38, 16
DEF_X, DEF_Y, WAR = 37, 16, 1

M = 1 << 32


def u_of(seed):
    return (((1103515245 * (seed % M) + 12345) % M) >> 17) / 32768


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def xp_of(uid):
    out = lua("GameCore_Tuner", rf"{D}\xp_read.lua",
              {"ZPLAYER": 0, "ZX": ATT_X, "ZY": ATT_Y})
    m = re.search(rf'"id":{uid},"t":"[^"]*","at":"[^"]*","hp":(\d+),"xp":(-?\d+),"level":(-?\d+)', out)
    return (int(m.group(2)), int(m.group(3))) if m else (None, None)


def def_hp():
    out = lua("GameCore_Tuner", rf"{D}\xp_read.lua",
              {"ZPLAYER": WAR, "ZX": DEF_X, "ZY": DEF_Y})
    m = re.search(r'"t":"UNIT_WARRIOR","at":"%d:%d","hp":(\d+)' % (DEF_X, DEF_Y), out)
    return int(m.group(1)) if m else None


seeds = [int(x) for x in sys.argv[1:]]
scene = lua("GameCore_Tuner", rf"{D}\xp_scene.lua",
            {"ZN": len(seeds), "ZATT": "UNIT_CROSSBOWMAN", "ZAX": ATT_X, "ZAY": ATT_Y,
             "ZDEF": "UNIT_WARRIOR", "ZDX": DEF_X, "ZDY": DEF_Y, "ZWAR": WAR})
ids = [int(x) for x in re.findall(r'\{"id":(\d+),"xp":', scene)]
print(json.dumps({"kind": "xpscene", "attackers": len(ids),
                  "canEarnXP": '"canEarnXP":true' in scene}))

for uid, seed in zip(ids, seeds):
    # a fresh, undamaged defender for every round, so the event is identical
    lua("GameCore_Tuner", rf"{D}\xp_scene.lua",
        {"ZN": 0, "ZATT": "UNIT_NONE", "ZAX": ATT_X, "ZAY": ATT_Y,
         "ZDEF": "UNIT_WARRIOR", "ZDX": DEF_X, "ZDY": DEF_Y, "ZWAR": WAR})
    hp0 = def_hp()
    xp0, lv0 = xp_of(uid)
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    shot = lua("InGame", rf"{D}\xp_attack.lua", {"ZAU": uid, "ZTX": DEF_X, "ZTY": DEF_Y})
    hp1 = def_hp()
    for _ in range(15):
        if hp1 != hp0:
            break
        hp1 = def_hp()
    xp1, lv1 = xp_of(uid)
    pxp = re.search(r'"ATTACKER":\{"xp":(-?\d+),"damageTo":(-?\d+),"strength":(-?\d+)\}', shot)
    row = {"kind": "xprun", "unit": uid, "seed": seed, "u": round(u_of(seed), 5),
           "fired": '"fired":true' in shot,
           "previewXP": int(pxp.group(1)) if pxp else None,
           "previewDamage": int(pxp.group(2)) if pxp else None,
           "defHPbefore": hp0, "defHPafter": hp1,
           "damageDealt": None if hp0 is None or hp1 is None else hp0 - hp1,
           "xpBefore": xp0, "xpAfter": xp1,
           "xpGain": None if xp0 is None or xp1 is None else xp1 - xp0}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
