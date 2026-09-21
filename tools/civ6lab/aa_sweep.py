"""Read the anti-air strength the game will use, across scenes — no shots fired.

Each row rebuilds the interceptor scene and then asks
CombatManager.SimulateAttackInto(bomber, CombatTypes.AIR, aim) for the
ANTI_AIR / INTERCEPTOR blocks. The law inferred from damage says

    S_att = max over adjacent interceptors of [AA_base - 10*(1 - HP/100)]
            + 5 * sum over the OTHERS of (HP/100)

so the readings should be: 1 SAM 100, wounded SAM 95, 2 SAMs 105, 3 SAMs 110,
4 SAMs 115, SAM+gun 105, gun alone 90.
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"
AIM_X, AIM_Y, WAR = 36, 15, 1
TILES = {"ZG1X": 37, "ZG1Y": 14, "ZG2X": 36, "ZG2Y": 16,
         "ZG3X": 35, "ZG3Y": 15, "ZG4X": 37, "ZG4Y": 16}


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def bomber_id():
    out = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
              {"ZBX": 39, "ZBY": 16, "ZN": 1, "ZSTOCK": 40})
    ids = re.findall(r'\{"id":(\d+),"x":39,"y":16,"moves":10\}', out)
    return int(ids[-1]) if ids else None


CASES = [
    ("1 SAM full", "UNIT_MOBILE_SAM", 1, [], 100),
    ("1 SAM @50hp", "UNIT_MOBILE_SAM", 1, [50], 95),
    ("2 SAM full", "UNIT_MOBILE_SAM", 2, [], 105),
    ("3 SAM full", "UNIT_MOBILE_SAM", 3, [], 110),
    ("4 SAM full", "UNIT_MOBILE_SAM", 4, [], 115),
    ("1 AAgun full", "UNIT_ANTIAIR_GUN", 1, [], 90),
    ("2 AAgun full", "UNIT_ANTIAIR_GUN", 2, [], 95),
    ("SAM + SAM@50", "UNIT_MOBILE_SAM", 2, [100, 50], 102.5),
]

b = bomber_id()
if not b:
    sys.exit("no bomber")
rows = []
for label, unit, n, hps, predicted in CASES:
    reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
                dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": unit, "ZN": n}, **TILES))
    ids = [int(x) for x in re.findall(r'"id":(\d+)', reset)]
    for gid, hp in zip(ids, hps):
        lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
            {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": hp})
    out = lua("InGame", rf"{D}\aa_strength.lua", {"ZAU": b, "ZX": AIM_X, "ZY": AIM_Y})
    m = re.search(r'"block":"ANTI_AIR","strength":(-?[\d.]+),"damageFrom":(-?[\d.]+)', out)
    mu = re.search(r'"block":"ANTI_AIR".*?"unit":(-?\d+),"at":"([\d:]+)"', out)
    mt = re.search(r'"block":"ANTI_AIR".*?"texts":"([^"]*)"', out)
    row = {"kind": "aa-sweep", "case": label, "unit": unit, "count": n, "hps": hps,
           "predictedAA": predicted,
           "antiAirStrength": float(m.group(1)) if m else None,
           "expectedDamage": float(m.group(2)) if m else None,
           "chosenUnit": int(mu.group(1)) if mu else None,
           "chosenAt": mu.group(2) if mu else None,
           "modifiers": mt.group(1) if mt else None,
           "guards": ids}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

print("\n  case                predicted   read")
for r in rows:
    print(f"  {r['case']:<16} base {r['antiAirStrength']}  expDmg {r['expectedDamage']}  chosen {r['chosenAt']}  mods: {r['modifiers']}")
