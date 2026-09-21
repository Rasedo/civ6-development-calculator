"""Is the FRACTIONAL support actually applied, or only carried and then floored?

frac_support.py showed three 50 HP supporters read "+2, +5, +7" -- trunc(2.5),
trunc(5.0), trunc(7.5) -- so the per-unit term 5 * health/100 is a fraction on
the backend. That does not yet say whether the DAMAGE uses 2.5 or 2.

One supporter, health swept, separates them: 40 HP gives exactly +2 and 60 HP
exactly +3, so if a 50 HP supporter's damage equals the 40 HP damage the engine
floors before use, and if it lands strictly between the two it does not.

    python frac_support2.py
"""
import json
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


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


for hp in (20, 33, 40, 50, 60, 70, 80, 90, 100):
    reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
                dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR,
                      "ZUNIT": "UNIT_MOBILE_SAM", "ZN": 2,
                      "ZMARKER": "UNIT_WARRIOR"}, **TILES))
    ids = [int(x) for x in re.findall(r'"id":(\d+)', reset)]
    lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
        {"ZPLAYER": WAR, "ZUNIT": ids[1], "ZHP": hp})
    setup = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
                {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 1, "ZSTOCK": 40})
    m = re.findall(r'\{"id":(\d+),"x":39,"y":16,"moves":10\}', setup)
    if not m:
        print(json.dumps({"error": "no bomber", "hp": hp}))
        continue
    read = lua("InGame", rf"{D}\aa_strength.lua",
               {"ZAU": int(m[-1]), "ZX": AIM_X, "ZY": AIM_Y})
    line = next((l for l in read.splitlines() if '"ANTI_AIR"' in l), "")
    dmg = re.search(r'"damageFrom":(-?\d+)', line)
    texts = re.search(r'"texts":"([^"]*)"', line)
    txt = texts.group(1) if texts else ""
    shown = re.search(r"\+(\d+)\s+\S+\s+\u041f\u0412\u041e", txt)
    row = {"kind": "fracsup2", "supporterHP": hp, "exact": round(5 * hp / 100, 3),
           "shownSupport": int(shown.group(1)) if shown else None,
           "damageFrom": int(dmg.group(1)) if dmg else None}
    print(json.dumps(row, ensure_ascii=False))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
