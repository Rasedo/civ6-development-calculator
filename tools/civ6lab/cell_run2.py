"""Run one interception cell with a CHOSEN weapon.

    python cell_run2.py <UNIT_TYPE> <count> <seed> <WMD_TYPE> [hp1 ...]

Same rig as cell_run.py, but the weapon is a parameter so the nuclear device
can be tested against the thermonuclear at the SAME seed and scene — including
at a draw that crosses the 50-damage cancellation threshold, which a single
below-threshold round cannot test.
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


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def grab(txt, key, cast=str):
    m = re.search(rf'"{key}":"?(-?[\w.:]+?)"?[,}}]', txt)
    return cast(m.group(1)) if m else None


unit_type, count, seed, wmd = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
hps = [int(x) for x in sys.argv[5:]]
stock_key = "nuclear" if "NUCLEAR_DEVICE" in wmd else "thermo"

reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
            dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": unit_type,
                  "ZN": count, "ZMARKER": "UNIT_WARRIOR"}, **TILES))
ids = [int(x) for x in re.findall(r'"id":(\d+)', reset)]
for gid, hp in zip(ids, hps):
    lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua", {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": hp})

setup = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
            {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 3, "ZSTOCK": 40})
before = grab(setup, stock_key, int)
lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
shot = lua("InGame", rf"{D}\nuke_one.lua",
           {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": wmd,
            "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": 0})
bomber = grab(shot, "bomber", int)
if not bomber or '"fired":true' not in shot:
    print(json.dumps({"error": "not fired", "wmd": wmd, "seed": seed}))
    sys.exit(1)

out = ""
for _ in range(30):
    out = lua("GameCore_Tuner", rf"{D}\intercept_bomber.lua",
              {"ZBOMBER": bomber, "ZGUARD": ids[0], "ZWAR": WAR,
               "ZAX": AIM_X, "ZAY": AIM_Y})
    cur = grab(lua("GameCore_Tuner", rf"{D}\pop_queue.lua", {}), stock_key, int)
    if cur is None:
        cur = grab(out, "thermo", int)
    if cur != before:
        break
m = re.search(r'"bomber":\{[^}]*"hp":(-?\d+)', out)
hp_after = int(m.group(1)) if m else None
row = {"kind": "cell2", "interceptor": unit_type, "count": count, "hps": hps,
       "wmd": wmd, "seed": seed, "u": round(u_of(seed), 5),
       "bomberDamage": None if hp_after is None else 100 - hp_after,
       "landed": grab(out, "landed") == "true",
       "stockKey": stock_key, "stockBefore": before}
print(json.dumps(row))
with open(RUN, "a", encoding="utf-8") as fh:
    fh.write(json.dumps(row) + "\n")
