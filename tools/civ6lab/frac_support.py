"""Is a combat-strength contribution held as a fraction on the backend?

COMBAT_ANTI_AIR_SUPPORT_BONUS_MODIFIER = 5 and D5 already showed a HALF-DEAD
supporter contributes +2, not +5 -- i.e. the bonus scales with the supporter's
health, and 5 * 0.5 = 2.5 came back as "2". That single reading cannot say
whether the engine truncated the term or only its display.

Stack the supporters and the two answers separate:
    each term truncated    k supporters at 50 HP give +2k
    one float sum          k supporters at 50 HP give +2.5k  (truncated once)
At k = 4 that is +8 vs +10, a damage ratio of e^(0.04*2) = 1.083.

Nothing is fired: SimulateAttackInto's ANTI_AIR/DAMAGE_FROM is deterministic,
so every row here is a read, not a draw.

    python frac_support.py
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


rows = []
for hp in (100, 50):
    for n in (1, 2, 3, 4):
        reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
                    dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR,
                          "ZUNIT": "UNIT_MOBILE_SAM", "ZN": n,
                          "ZMARKER": "UNIT_WARRIOR"}, **TILES))
        ids = [int(x) for x in re.findall(r'"id":(\d+)', reset)]
        # the FIRST guard stays whole: it is the one that fires. Every other
        # guard is wounded, so only the SUPPORT terms carry a fraction.
        for gid in ids[1:]:
            lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
                {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": hp})
        setup = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
                    {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 1, "ZSTOCK": 40})
        m = re.findall(r'\{"id":(\d+),"x":39,"y":16,"moves":10\}', setup)
        if not m:
            print(json.dumps({"error": "no bomber", "n": n, "hp": hp}))
            continue
        bomber = int(m[-1])
        read = lua("InGame", rf"{D}\aa_strength.lua",
                   {"ZAU": bomber, "ZX": AIM_X, "ZY": AIM_Y})
        line = next((l for l in read.splitlines() if '"ANTI_AIR"' in l), "")
        dmg = re.search(r'"damageFrom":(-?\d+)', line)
        stre = re.search(r'"strength":(-?\d+)', line)
        texts = re.search(r'"texts":"([^"]*)"', line)
        row = {"kind": "fracsup", "supporters": n - 1, "supporterHP": hp,
               "strength": int(stre.group(1)) if stre else None,
               "damageFrom": int(dmg.group(1)) if dmg else None,
               "texts": texts.group(1) if texts else ""}
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))
        with open(RUN, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
