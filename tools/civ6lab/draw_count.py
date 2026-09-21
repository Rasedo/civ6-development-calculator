"""How many random draws does an ICBM-class launch consume?

The generator is known exactly (state' = (1103515245*s + 12345) mod 2^32), so
the number of draws between two observed states is recoverable: step the LCG
from the seed that was SET until the state the game reports afterwards turns up.

This separates three stories for the silo's stop:
  * 0 draws  -> the stop is not a roll at all; it is a rule.
  * 1 draw   -> something IS rolled, and with the seed known the drawn value can
                be computed and checked against the outcome.
  * n draws  -> the launch consumes a stream and the interception is buried in it.

    python draw_count.py <guard UNIT_TYPE or NONE> <seed> [seed ...]
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

AIM_X, AIM_Y, WAR = 36, 15, 1
SILO_X, SILO_Y = 37, 17
TILES = {"ZG1X": 37, "ZG1Y": 14, "ZG2X": 36, "ZG2Y": 16,
         "ZG3X": 35, "ZG3Y": 15, "ZG4X": 37, "ZG4Y": 16}

M = 1 << 32
A, C = 1103515245, 12345
MAXSTEPS = 400


def steps_between(s0, s1):
    s = s0 % M
    for n in range(MAXSTEPS + 1):
        if s == s1 % M:
            return n
        s = (A * s + C) % M
    return None


def draw(state, rng):
    """the value GetRandNum(rng) returns from this state, per rng_fit.py"""
    nxt = (A * (state % M) + C) % M
    r16 = rng % 65536
    if r16 == 0:
        return 0
    return ((nxt >> 17) * r16) >> 15


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def seed_now():
    m = re.search(r'"seed":(-?\d+)', lua("GameCore_Tuner", rf"{D}\rng_seed.lua",
                                         {"ZSET": 0, "ZSEED": 0}))
    return int(m.group(1)) % M if m else None


GUARD = sys.argv[1]
for seed in [int(x) for x in sys.argv[2:]]:
    lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
        dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR,
              "ZUNIT": "UNIT_MOBILE_SAM" if GUARD == "NONE" else GUARD,
              "ZN": 0 if GUARD == "NONE" else 1, "ZMARKER": "UNIT_WARRIOR"}, **TILES))
    lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
        {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 40, "ZDELIVER": "UNIT_BOMBER"})
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    s_before = seed_now()
    lua("InGame", rf"{D}\silo_launch.lua",
        {"ZSX": SILO_X, "ZSY": SILO_Y, "ZTX": AIM_X, "ZTY": AIM_Y,
         "ZWMD": "WMD_NUCLEAR_DEVICE", "ZFIRE": 1})
    s_after = seed_now()
    check = lua("GameCore_Tuner", rf"{D}\blast_check.lua", {"ZAX": AIM_X, "ZAY": AIM_Y})
    fallout = re.search(r'"aimFallout":(\d+)', check)
    row = {"kind": "drawcount", "guard": GUARD, "seed": seed,
           "seedBefore": s_before, "seedAfter": s_after,
           "draws": steps_between(s_before, s_after),
           "firstDraw100": draw(s_before, 100),
           "firstDraw2": draw(s_before, 2),
           "detonated": bool(fallout and int(fallout.group(1)) > 0)}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
