"""The silo/submarine stop is the ORDINARY combat roll after all.

The steelman broke the "stopped outright" reading: a 1 HP Anti-Air Gun let 20
of 20 silo launches through, a full-health one let exactly the lowest draw
through, and the leak rate climbed smoothly as the interceptor was wounded.
Fitting those 46 rounds gives the bomber channel's own law with one new
constant -- the warhead defends at a FIXED 72 instead of a delivering unit's
Combat:

    damage    = round( (24 + GetRandNum(12)) * 1.04^(S_att - 72) )
    cancelled <=> damage > 50

This battery pre-registers the prediction and fires it. The seeds are chosen so
the draw n = GetRandNum(12) takes EVERY value 0..11 exactly once, so the round
that flips from leak to stop is pinned rather than sampled.

    python icbm_law.py <guard UNIT_TYPE> <hp> [channel: silo|sub]
"""
import json
import math
import re
import subprocess
import sys  # noqa: E402 -- AIM override reads argv at import time

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

AIM_X, AIM_Y, WAR = 36, 15, 1
if len(sys.argv) > 6:
    AIM_X, AIM_Y = int(sys.argv[5]), int(sys.argv[6])
SILO_X, SILO_Y = 37, 17
TILES = {"ZG1X": 37, "ZG1Y": 14, "ZG2X": 36, "ZG2Y": 16,
         "ZG3X": 35, "ZG3Y": 15, "ZG4X": 37, "ZG4Y": 16}

M = 1 << 32
A, C = 1103515245, 12345
WARHEAD_DEFENCE = 72.0
BASE, EXTRA, RATE, THRESHOLD = 24, 12, 0.04, 50

AA_BASE = {"UNIT_ANTIAIR_GUN": 90, "UNIT_MOBILE_SAM": 100, "UNIT_DESTROYER": 90,
           "UNIT_BATTLESHIP": 90, "UNIT_MISSILE_CRUISER": 110,
           "UNIT_BRAZILIAN_MINAS_GERAES": 95, "UNIT_GIANT_DEATH_ROBOT": 130}


def top15(seed):
    return ((A * (seed % M) + C) % M) >> 17


def draw(seed, rng):
    r16 = rng % 65536
    return 0 if r16 == 0 else (top15(seed) * r16) >> 15


def seed_for(target, rng, start=1):
    s = start
    while s < start + 5_000_000:
        if draw(s, rng) == target:
            return s
        s += 1
    return None


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


GUARD = sys.argv[1]
HP = int(sys.argv[2])
CHANNEL = sys.argv[3] if len(sys.argv) > 3 else "silo"
WMD = sys.argv[4] if len(sys.argv) > 4 else "WMD_NUCLEAR_DEVICE"

s_att = AA_BASE[GUARD] - 10 * (1 - HP / 100)
mult = math.exp(RATE and math.log(1 + RATE) * (s_att - WARHEAD_DEFENCE))

rows, start = [], 1
for n in range(EXTRA):
    seed = seed_for(n, EXTRA, start)
    start = seed + 1
    predicted_damage = math.floor((BASE + n) * mult + 0.5)
    predicted_cancel = predicted_damage > THRESHOLD

    # aa_cover places the marker and exactly ONE guard at distance 1, picking a
    # legal tile itself, so the aim plot can be moved without hand-naming tiles
    reset = lua("GameCore_Tuner", rf"{D}\aa_cover.lua",
                {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": GUARD,
                 "ZD": 1, "ZMARKER": "UNIT_WARRIOR", "ZWATER": 0})
    gid = int(re.search(r'"id":(-?\d+)', reset).group(1))
    if gid > 0 and HP < 100:
        lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
            {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": HP})
    lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
        {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 40, "ZDELIVER": "UNIT_BOMBER"})
    # the submarine must exist BEFORE the seed is set: Units:Create consumes
    # draws of its own, which would silently offset the n this battery pins
    sid = None
    if CHANNEL == "sub":
        sub = lua("GameCore_Tuner", rf"{D}\sub_launch.lua",
                  {"ZX": 35, "ZY": 17, "ZSTOCK": 40})
        sid = int(re.search(r'"id":(-?\d+)', sub).group(1))
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    if CHANNEL == "sub":
        lua("InGame", rf"{D}\sub_fire.lua", {"ZAU": sid, "ZTX": AIM_X, "ZTY": AIM_Y})
    else:
        lua("InGame", rf"{D}\silo_launch.lua",
            {"ZSX": SILO_X, "ZSY": SILO_Y, "ZTX": AIM_X, "ZTY": AIM_Y,
             "ZWMD": WMD, "ZFIRE": 1})
    det = False
    for _ in range(25):
        check = lua("GameCore_Tuner", rf"{D}\blast_check.lua", {"ZAX": AIM_X, "ZAY": AIM_Y})
        m = re.search(r'"aimFallout":(\d+)', check)
        if m and int(m.group(1)) > 0:
            det = True
            break
        if f'"t":"{GUARD}"' not in check:
            break
    row = {"kind": "icbmlaw", "guard": GUARD, "hp": HP, "channel": CHANNEL, "wmd": WMD,
           "sAtt": round(s_att, 2), "n": n, "seed": seed,
           "predictedDamage": predicted_damage, "predictedCancel": predicted_cancel,
           "detonated": det, "ok": predicted_cancel == (not det)}
    rows.append(row)
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")

hits = sum(1 for r in rows if r["ok"])
print(json.dumps({"kind": "icbmlaw-summary", "guard": GUARD, "hp": HP,
                  "sAtt": round(s_att, 2), "rounds": len(rows), "correct": hits,
                  "flipAt": next((r["n"] for r in rows if r["predictedCancel"]), None)}))
