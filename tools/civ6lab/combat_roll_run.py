"""Fire a battery of SEEDED ranged shots and record (seed, damage, seedAfter).

Each shot: set the rng state from GameCore, fire from InGame with a fresh
archer (a shot spends all of a unit's moves), then read the damage and the new
state. The stream is known exactly
    state' = (1103515245*state + 12345) mod 2^32,  draw = ((state'>>17)*r16)>>15
so the number of draws the shot consumed, and their values, follow from the
two states — which is what turns a damage number into a measured multiplier.
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng_20260921T090000Z.jsonl"

ARCHERS = [10158085, 10223625, 10289226, 10354724, 10420296, 10485831]
SEEDS = [1, 5000, 100000, 777777, 31337, 999999]
DEFENDER, DOWNER, DX, DY = 9830429, 1, 36, 25


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120,
                         encoding="utf-8", errors="replace").stdout
    return out.strip()


rows = []
for archer, seed in zip(ARCHERS, SEEDS):
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    shot = lua("InGame", rf"{D}\combat_roll_shot.lua",
               {"ZATT": archer, "ZDEF": DEFENDER, "ZDOWNER": DOWNER,
                "ZSEED": seed, "ZDX": DX, "ZDY": DY})
    read = lua("GameCore_Tuner", rf"{D}\combat_roll_read.lua",
               {"ZATT": archer, "ZDEF": DEFENDER, "ZDOWNER": DOWNER, "ZHEAL": 1})
    dmg = re.search(r'"defenderDamage":(\d+)', read)
    after = re.search(r'"seedAfter":(-?\d+)', read)
    row = {"seed": seed, "archer": archer,
           "damage": int(dmg.group(1)) if dmg else None,
           "seedAfter": int(after.group(1)) if after else None,
           "fired": '"fired":true' in shot}
    rows.append(row)
    print(json.dumps({"kind": "combat-roll", **row}))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps({"kind": "combat-roll", **r}) + "\n")
