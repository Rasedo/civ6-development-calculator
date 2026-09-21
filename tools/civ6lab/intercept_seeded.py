"""Does nuclear interception consult the RNG at all?

Eight strikes in the previous game showed interception 3/3, which only bounds
the probability below — 3 successes are unremarkable even at p = 0.5. The seed
settles it two ways at once:

  * if interception rolled, an intercepted strike would CONSUME draws; the state
    is read before and after each strike;
  * if it rolled, varying the seed would flip outcomes; each strike is fired
    from a different, widely separated seed.

A control strike with the SAM removed is fired last, so "nothing happened" is
never confused with "nothing was fired".
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

AIM_X, AIM_Y = 36, 15
BASE_X, BASE_Y = 39, 16
GUARD, MARKER, WAR = 1114127, 1179664, 1
SEEDS = [11, 90210, 424242, 7777, 31415]

M = 1 << 32
A = 1103515245


def step(s):
    return (A * (s % M) + 12345) % M


def draws_between(before, after, limit=60):
    s = (before % M)
    for n in range(1, limit + 1):
        s = step(s)
        if s == (after % M):
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


def stock():
    out = lua("GameCore_Tuner", rf"{D}\pop_queue.lua", {})
    return grab(out, "thermo", int)


rows = []
for i, seed in enumerate(SEEDS):
    before_stock = stock()
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    shot = lua("InGame", rf"{D}\nuke_one.lua",
               {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": "WMD_THERMONUCLEAR_DEVICE",
                "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": i})
    fired = '"fired":true' in shot
    after = None
    for _ in range(12):                      # the strike resolves on the game's clock
        after = lua("GameCore_Tuner", rf"{D}\nuke_intercept_read.lua",
                    {"ZAX": AIM_X, "ZAY": AIM_Y, "ZGUARD": GUARD, "ZMARKER": MARKER, "ZWAR": WAR})
        if stock() != before_stock:
            break
    seed_after = grab(lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 0, "ZSEED": 0}), "seed", int)
    row = {"kind": "intercept-seeded", "seed": seed, "fired": fired,
           "stockBefore": before_stock, "stockAfter": stock(),
           "seedAfter": seed_after, "drawsConsumed": draws_between(seed, seed_after),
           "markerAlive": '"marker":{' in after, "guardAlive": '"guard":{' in after,
           "aimFallout": grab(after, "aimFallout", int)}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

stopped = [r for r in rows if r["markerAlive"] and r["stockAfter"] != r["stockBefore"]]
print(f"\n{len(stopped)}/{len(rows)} strikes executed and were stopped")
zero = [r for r in stopped if r["drawsConsumed"] == 0]
print(f"{len(zero)}/{len(stopped)} of those consumed ZERO rng draws")
