"""Pin the anti-air damage curve with NO support term in it.

The support rows came in about 1 damage low against
    damage = trunc(30 * e^(0.04 * (S_att - S_def)))
while the support-free rows (AA 90 -> 36, AA 100 -> 85 Bomber -> 54,
AA 100 -> 90 Jet Bomber -> 44) fit it exactly. Either the support term is not
5 * health/100, or the curve's constants are not exactly (30, 0.04).

SimulateAttackInto does not need the attacker to carry a warhead, so EVERY air
unit can be flown at the same lone interceptor. That sweeps S_def over a wide
range with nothing else moving, and the preview is deterministic (four repeat
reads agreed, and seeding the rng changed nothing), so each row is exact.

    python frac_curve.py
"""
import json
import math
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

AIM_X, AIM_Y, WAR = 36, 15, 1
BASE_X, BASE_Y = 39, 16
TILES = {"ZG1X": 37, "ZG1Y": 14, "ZG2X": 36, "ZG2Y": 16,
         "ZG3X": 35, "ZG3Y": 15, "ZG4X": 37, "ZG4Y": 16}

AIR = ["UNIT_BIPLANE", "UNIT_FIGHTER", "UNIT_JET_FIGHTER", "UNIT_BOMBER",
       "UNIT_JET_BOMBER", "UNIT_ZEPPELIN", "UNIT_GREAT_WAR_BOMBER",
       "UNIT_AMERICAN_P51", "UNIT_DEATH_ROBOT"]


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
    dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": "UNIT_MOBILE_SAM",
          "ZN": 1, "ZMARKER": "UNIT_WARRIOR"}, **TILES))

rows = []
for ut in AIR:
    setup = lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
                {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 1, "ZSTOCK": 40, "ZDELIVER": ut})
    if '"error"' in setup:
        continue
    combat = re.search(r'"combat":(\d+)', setup)
    ids = re.findall(r'"id":(\d+)', setup)
    if not ids or not combat:
        continue
    read = lua("InGame", rf"{D}\aa_strength.lua",
               {"ZAU": int(ids[-1]), "ZX": AIM_X, "ZY": AIM_Y})
    line = next((l for l in read.splitlines() if '"ANTI_AIR"' in l), "")
    dmg = re.search(r'"damageFrom":(-?\d+)', line)
    stre = re.search(r'"strength":(-?\d+)', line)
    if not dmg or not stre:
        print(json.dumps({"kind": "fraccurve", "unit": ut, "noblock": True}))
        continue
    row = {"kind": "fraccurve", "unit": ut, "defCombat": int(combat.group(1)),
           "attStrength": int(stre.group(1)), "damageFrom": int(dmg.group(1))}
    row["delta"] = row["attStrength"] - row["defCombat"]
    rows.append(row)
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")

# fit trunc(c * exp(k*delta)) over the rows, by interval intersection on c
print("--- fit ---")
best = None
for ki in range(300, 500):
    k = ki / 10000
    lo, hi = 0.0, 1e9
    for r in rows:
        if r["damageFrom"] >= 100:
            continue
        e = math.exp(k * r["delta"])
        lo = max(lo, r["damageFrom"] / e)
        hi = min(hi, (r["damageFrom"] + 1) / e)
    if lo < hi and (best is None or hi - lo > best[2] - best[1]):
        best = (k, lo, hi)
    if lo < hi:
        print(json.dumps({"k": k, "cLow": round(lo, 4), "cHigh": round(hi, 4)}))
print(json.dumps({"widest": best}))
