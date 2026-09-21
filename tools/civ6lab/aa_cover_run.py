"""How many tiles does each anti-air unit cover?

ABILITY_ANTI_AIR_COVER is attached to units by the CLASS_ANTI_AIR tag and
carries NO radius of its own, so the radius is not in the database and has to be
measured. Exactly one interceptor is placed at exactly distance d from the aim
plot with nothing else of that player within 4, and the preview's ANTI_AIR block
answers whether it covers the tile: a block naming that unit means it does.

Deterministic, so one read per cell is the whole measurement.

    python aa_cover_run.py
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

UNITS = [("UNIT_ANTIAIR_GUN", 0), ("UNIT_MOBILE_SAM", 0),
         ("UNIT_GIANT_DEATH_ROBOT", 0), ("UNIT_DESTROYER", 1),
         ("UNIT_BATTLESHIP", 1), ("UNIT_MISSILE_CRUISER", 1),
         ("UNIT_BRAZILIAN_MINAS_GERAES", 1)]


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


for unit, water in UNITS:
    row = {"kind": "aacover", "unit": unit, "water": bool(water)}
    for d in (1, 2, 3):
        place = lua("GameCore_Tuner", rf"{D}\aa_cover.lua",
                    {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": unit,
                     "ZD": d, "ZMARKER": "UNIT_WARRIOR", "ZWATER": water})
        if '"placed":true' not in place:
            row[f"d{d}"] = "no legal tile"
            continue
        gid = int(re.search(r'"id":(-?\d+)', place).group(1))
        at = re.search(r'"at":"([^"]*)"', place).group(1)
        setup = lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
                    {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 1, "ZSTOCK": 40,
                     "ZDELIVER": "UNIT_BOMBER"})
        ids = re.findall(r'\{"id":(\d+),"x":39,"y":16,"combat":85,"moves":10\}', setup)
        if not ids:
            row[f"d{d}"] = "no bomber"
            continue
        read = lua("InGame", rf"{D}\aa_strength.lua",
                   {"ZAU": int(ids[-1]), "ZX": AIM_X, "ZY": AIM_Y})
        block = next((l for l in read.splitlines() if '"ANTI_AIR"' in l), "")
        chosen = re.search(r'"unit":(-?\d+)', block)
        dmg = re.search(r'"damageFrom":(-?\d+)', block)
        stre = re.search(r'"strength":(-?\d+)', block)
        covers = bool(chosen and int(chosen.group(1)) == gid)
        row[f"d{d}"] = {"at": at, "covers": covers,
                        "strength": int(stre.group(1)) if stre else None,
                        "damage": int(dmg.group(1)) if dmg else None}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
