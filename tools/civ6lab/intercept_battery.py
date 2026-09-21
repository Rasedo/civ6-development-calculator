"""Measure the interception roll: is it certain, and what does it consult?

Each round: rebuild the scene (fresh guard and marker, fallout cleared), set the
rng state to a chosen seed, fire ONE thermonuclear at the aim plot, wait for the
warhead to leave the stock, then read whether the blast landed and how many
draws the strike consumed.

Because the generator is known, the value the roll would have seen is known too,
so an outcome that is a deterministic function of the seed shows up as a clean
threshold in u.
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


SEEDS = [int(x) for x in sys.argv[1:]] or [11, 90210, 424242, 7777, 31415]
rows = []
for i, seed in enumerate(SEEDS):
    reset = lua("GameCore_Tuner", rf"{D}\intercept_reset.lua",
                {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": "UNIT_MOBILE_SAM"})
    marker, guard = grab(reset, "marker", int), grab(reset, "guard", int)
    if not guard or guard < 0:
        print(json.dumps({"seed": seed, "error": "no guard", "reset": reset}))
        continue
    before = grab(lua("GameCore_Tuner", rf"{D}\intercept_outcome.lua",
                      {"ZAX": AIM_X, "ZAY": AIM_Y, "ZMARKER": marker,
                       "ZGUARD": guard, "ZWAR": WAR}), "thermo", int)
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    lua("InGame", rf"{D}\nuke_one.lua",
        {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": "WMD_THERMONUCLEAR_DEVICE",
         "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": 0})
    out = ""
    for _ in range(30):
        out = lua("GameCore_Tuner", rf"{D}\intercept_outcome.lua",
                  {"ZAX": AIM_X, "ZAY": AIM_Y, "ZMARKER": marker,
                   "ZGUARD": guard, "ZWAR": WAR})
        if grab(out, "thermo", int) != before:
            break
    seed_after = grab(lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 0, "ZSEED": 0}), "seed", int)
    row = {"kind": "intercept-roll", "seed": seed, "u": round(u_of(seed), 5),
           "landed": grab(out, "landed") == "true",
           "draws": draws_between(seed, seed_after),
           "stockBefore": before, "stockAfter": grab(out, "thermo", int)}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

done = [r for r in rows if r["stockAfter"] != r["stockBefore"]]
land = [r for r in done if r["landed"]]
print(f"\n{len(done)} strikes executed: {len(land)} landed, {len(done)-len(land)} intercepted")
if done:
    print("  by u:  " + "  ".join(f"{r['u']:.3f}{'L' if r['landed'] else 'I'}"
                                  for r in sorted(done, key=lambda r: r['u'])))
