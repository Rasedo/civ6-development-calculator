"""Read an interception cell without firing.

Places the named interceptors on named tiles beside an aim plot and reads
CombatManager.SimulateAttackInto(bomber, CombatTypes.AIR, aim) for:
  the chosen interceptor's BASE anti-air strength, the support text, the
  expected damage to the bomber, and WHICH unit was chosen.

    python aa_cell_read.py <aimX> <aimY> <UNIT_TYPE> <count> <t1x> <t1y> [t2x t2y ...]
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"
WAR = 1
MARKER = "UNIT_WARRIOR"


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


aim_x, aim_y = int(sys.argv[1]), int(sys.argv[2])
unit = sys.argv[3]
if "--naval-marker" in sys.argv:
    MARKER = "UNIT_DESTROYER"
    sys.argv.remove("--naval-marker")
count = int(sys.argv[4])
coords = [int(x) for x in sys.argv[5:]]
tiles = {}
for i in range(4):
    if 2 * i + 1 < len(coords):
        tiles[f"ZG{i+1}X"], tiles[f"ZG{i+1}Y"] = coords[2 * i], coords[2 * i + 1]
    else:
        tiles.setdefault(f"ZG{i+1}X", aim_x)
        tiles.setdefault(f"ZG{i+1}Y", aim_y)

reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
            dict({"ZAX": aim_x, "ZAY": aim_y, "ZWAR": WAR, "ZUNIT": unit, "ZN": count, "ZMARKER": MARKER}, **tiles))
made = re.findall(r'"made":(\w+)', reset)
setup = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
            {"ZBX": 39, "ZBY": 16, "ZN": 1, "ZSTOCK": 40})
ids = re.findall(r'\{"id":(\d+),"x":39,"y":16,"moves":10\}', setup)
if not ids:
    print(json.dumps({"error": "no bomber", "setup": setup[:200]}))
    sys.exit(1)
out = lua("InGame", rf"{D}\aa_strength.lua", {"ZAU": ids[-1], "ZX": aim_x, "ZY": aim_y})
m = re.search(r'"block":"ANTI_AIR","strength":(-?[\d.]+),"damageFrom":(-?[\d.]+)', out)
mu = re.search(r'"block":"ANTI_AIR".*?"unit":(-?\d+),"at":"([\d:]+)"', out)
mt = re.search(r'"block":"ANTI_AIR".*?"texts":"([^"]*)"', out)
row = {"kind": "aa-cell", "aim": f"{aim_x}:{aim_y}", "interceptor": unit, "count": count,
       "spawned": made,
       "baseAA": float(m.group(1)) if m else None,
       "expectedDamage": float(m.group(2)) if m else None,
       "chosenAt": mu.group(2) if mu else None,
       "support": mt.group(1) if mt else None}
print(json.dumps(row, ensure_ascii=False))
with open(RUN, "a", encoding="utf-8") as fh:
    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
