"""The stacking rule: what does a SECOND adjacent interceptor do?

With one Mobile SAM on a fixed tile the anti-air base is ~52.9, so
    damage = round(52.9 * (0.8 + 0.4u))
and a strike is stopped only when that exceeds 50. Seed 13459 (u = 0.050) gives
43 damage and LANDS with one SAM — so it is the seed that separates the rules:

    additive (each interceptor attacks)  -> ~86 damage, intercepted, 2 draws
    only one interceptor ever fires      ->  43 damage, lands,       1 draw

The same seed is fired at 1, 2 and 3 interceptors.
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
TILES = {"ZG1X": 37, "ZG1Y": 14, "ZG2X": 35, "ZG2Y": 14, "ZG3X": 36, "ZG3Y": 16}
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 13459

M = 1 << 32
A = 1103515245


def step(s):
    return (A * (s % M) + 12345) % M


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


def bomber_hp(txt):
    m = re.search(r'"bomber":\{[^}]*"hp":(-?\d+)', txt)
    return int(m.group(1)) if m else None


rows = []
for n in (1, 2, 3):
    reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
                dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR,
                      "ZUNIT": "UNIT_MOBILE_SAM", "ZN": n}, **TILES))
    guard = grab(reset, "id", int)
    setup = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
                {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 4, "ZSTOCK": 40})
    before = grab(setup, "thermo", int)
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": SEED})
    shot = lua("InGame", rf"{D}\nuke_one.lua",
               {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": "WMD_THERMONUCLEAR_DEVICE",
                "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": 0})
    bomber = grab(shot, "bomber", int)
    if not bomber or '"fired":true' not in shot:
        print(json.dumps({"guards": n, "error": "not fired"}))
        continue
    out = ""
    for _ in range(30):
        out = lua("GameCore_Tuner", rf"{D}\intercept_bomber.lua",
                  {"ZBOMBER": bomber, "ZGUARD": guard, "ZWAR": WAR,
                   "ZAX": AIM_X, "ZAY": AIM_Y})
        if grab(out, "thermo", int) != before:
            break
    hp = bomber_hp(out)
    row = {"kind": "intercept-stack", "guards": n, "seed": SEED,
           "bomberHP": hp, "bomberDamage": None if hp is None else 100 - hp,
           "landed": grab(out, "landed") == "true",
           "draws": draws_between(SEED, grab(out, "seed", int) or 0),
           "executed": grab(out, "thermo", int) != before}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

print("\n  guards  damage  draws  outcome")
for r in rows:
    if r["executed"]:
        print(f"    {r['guards']}      {r['bomberDamage']:>4}     {r['draws']}    "
              f"{'LANDED' if r['landed'] else 'intercepted'}")
