"""Test the anti-air hypothesis of nuclear interception.

Hypothesis (community accounts + the single draw a guarded strike consumes):
a Mobile SAM adjacent to the aim plot makes ONE anti-air attack on the
delivering bomber, damage rolled the ordinary way
    damage = round(base * (0.8 + 0.4u))
and the strike fails only if the bomber ends below 50% HP. So:

    intercepted  <=>  damage > 50   (a bomber has 100 HP)

which makes interception a threshold on the SAME uniform draw the rest of
combat uses, not a percentage roll of its own.

Each round rebuilds the scene, spawns a FRESH bomber (so HP starts at 100),
sets the state to a chosen seed, fires, and then reads the bomber's HP, the
aim plot's fallout and the number of draws consumed.
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

AIM_X, AIM_Y, WAR = 36, 15, 1
GX, GY = 37, 14
UNIT = "UNIT_MOBILE_SAM"
BASE_X, BASE_Y = 39, 16

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


def bomber_hp(txt):
    m = re.search(r'"bomber":\{[^}]*"hp":(-?\d+)', txt)
    return int(m.group(1)) if m else None


SEEDS = [int(x) for x in sys.argv[1:]] or [13459, 1017, 16761, 32166, 20992, 2034, 26240]
rows = []
for seed in SEEDS:
    lua("GameCore_Tuner", rf"{D}\intercept_reset.lua",
        {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": UNIT, "ZGX": GX, "ZGY": GY})
    reset = lua("GameCore_Tuner", rf"{D}\intercept_reset.lua",
                {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": UNIT, "ZGX": GX, "ZGY": GY})
    guard = grab(reset, "guard", int)
    # a fresh bomber every round, so HP starts at 100 and moves are full
    setup = lua("GameCore_Tuner", rf"{D}\pop_setup.lua",
                {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 4, "ZSTOCK": 40})
    before_stock = grab(setup, "thermo", int)
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    shot = lua("InGame", rf"{D}\nuke_one.lua",
               {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": "WMD_THERMONUCLEAR_DEVICE",
                "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": 0})
    bomber = grab(shot, "bomber", int)
    if not bomber or '"fired":true' not in shot:
        print(json.dumps({"seed": seed, "error": "not fired", "shot": shot[:160]}))
        continue
    out = ""
    for _ in range(30):
        out = lua("GameCore_Tuner", rf"{D}\intercept_bomber.lua",
                  {"ZBOMBER": bomber, "ZGUARD": guard, "ZWAR": WAR,
                   "ZAX": AIM_X, "ZAY": AIM_Y})
        if grab(out, "thermo", int) != before_stock:
            break
    hp = bomber_hp(out)
    row = {"kind": "intercept-law", "seed": seed, "u": round(u_of(seed), 5),
           "landed": grab(out, "landed") == "true", "bomberHP": hp,
           "bomberDamage": None if hp is None else 100 - hp,
           "draws": draws_between(seed, grab(out, "seed", int) or 0),
           "stockBefore": before_stock, "stockAfter": grab(out, "thermo", int)}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

done = [r for r in rows if r["stockAfter"] != r["stockBefore"] and r["bomberDamage"] is not None]
print(f"\n{len(done)} strikes executed")
for r in sorted(done, key=lambda r: r["u"]):
    print(f"  u={r['u']:.4f}  bomber took {r['bomberDamage']:>3}  "
          f"{'LANDED' if r['landed'] else 'intercepted'}  draws={r['draws']}")
if done:
    print("\n  hypothesis: intercepted <=> bomber damage > 50")
    ok = all((r["bomberDamage"] > 50) != r["landed"] for r in done)
    print(f"  holds on every row: {ok}")
