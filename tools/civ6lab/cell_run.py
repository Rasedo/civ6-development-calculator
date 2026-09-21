"""Run one cell of the interception matrix.

    python cell_run.py <UNIT_TYPE> <count> <seed> [hp1 hp2 ...]

Rebuilds the scene with `count` interceptors of one type on named tiles, wounds
them to the given HPs if any are supplied, spawns a fresh bomber, fires one
thermonuclear from a chosen seed, and reports the damage the bomber took, the
outcome and the draws consumed.
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

M = 1 << 32
A = 1103515245


def step(s):
    return (A * (s % M) + 12345) % M


def u_of(seed):
    return (step(seed) >> 17) / 32768


def draws_between(before, after, limit=60):
    s = before % M
    for n in range(1, limit + 1):
        s = step(s)
        if s == after % M:
            return n
    return None


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def grab(txt, key, cast=str):
    m = re.search(rf'"{key}":"?(-?[\w.:]+?)"?[,}}]', txt)
    return cast(m.group(1)) if m else None


unit_type = sys.argv[1] if len(sys.argv) > 1 else "UNIT_MOBILE_SAM"
count = int(sys.argv[2]) if len(sys.argv) > 2 else 1
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 13459
hps = [int(x) for x in sys.argv[4:]]

reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
            dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR,
                  "ZUNIT": unit_type, "ZN": count}, **TILES))
ids = [int(x) for x in re.findall(r'"id":(\d+)', reset)]
if len(ids) < count:
    print(json.dumps({"cell": unit_type, "error": "guards not created", "reset": reset}))
    sys.exit(1)
for guard_id, hp in zip(ids, hps):
    lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
        {"ZPLAYER": WAR, "ZUNIT": guard_id, "ZHP": hp})

setup = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
            {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 3, "ZSTOCK": 40})
before = grab(setup, "thermo", int)
lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
shot = lua("InGame", rf"{D}\nuke_one.lua",
           {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": "WMD_THERMONUCLEAR_DEVICE",
            "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": 0})
bomber = grab(shot, "bomber", int)
if not bomber or '"fired":true' not in shot:
    print(json.dumps({"cell": unit_type, "error": "not fired"}))
    sys.exit(1)

out = ""
for _ in range(30):
    out = lua("GameCore_Tuner", rf"{D}\intercept_bomber.lua",
              {"ZBOMBER": bomber, "ZGUARD": ids[0], "ZWAR": WAR,
               "ZAX": AIM_X, "ZAY": AIM_Y})
    if grab(out, "thermo", int) != before:
        break
m = re.search(r'"bomber":\{[^}]*"hp":(-?\d+)', out)
hp_after = int(m.group(1)) if m else None
row = {"kind": "cell", "interceptor": unit_type, "count": count, "hps": hps,
       "seed": seed, "u": round(u_of(seed), 5),
       "bomberDamage": None if hp_after is None else 100 - hp_after,
       "landed": grab(out, "landed") == "true",
       "draws": draws_between(seed, grab(out, "seed", int) or 0),
       "executed": grab(out, "thermo", int) != before}
print(json.dumps(row))
with open(RUN, "a", encoding="utf-8") as fh:
    fh.write(json.dumps(row) + "\n")
