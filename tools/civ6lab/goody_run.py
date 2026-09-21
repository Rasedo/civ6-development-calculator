"""A battery of seeded tribal-village pops.

Each pop: plant a hut beside a unit that still has moves, set the rng state,
walk onto it, then read what changed and what the state became. The generator
is known, so the draws each pop consumed — and their values — follow from the
two states, which is what turns a reward into a decoded draw.
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

M = 1 << 32
A, C = 1103515245, 12345


def u32(x):
    return x % M


def step(s):
    return u32(A * u32(s) + C)


def account(before, after, limit=40):
    s, vals = u32(before), []
    for n in range(1, limit + 1):
        s = step(s)
        vals.append(s >> 17)
        if s == u32(after):
            return n, vals[:n]
    return None, []


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120,
                          encoding="utf-8", errors="replace").stdout.strip()


def grab(txt, key, cast=str):
    m = re.search(rf'"{key}":"?(-?[\w.: ]+?)"?[,}}]', txt)
    return cast(m.group(1)) if m else None


SEEDS = [7, 4242, 60001, 123123, 900001, 31, 500500, 8888]
rows = []
for seed in SEEDS:
    plant = lua("GameCore_Tuner", rf"{D}\goody_setup.lua", {"ZTAG": "plant", "ZPLANT": 1})
    if '"error"' in plant:
        print(json.dumps({"kind": "goody-battery", "seed": seed, "error": plant}))
        continue
    mover = grab(plant, "mover")
    hut = grab(plant, "hutPlot")
    g0, f0, u0 = grab(plant, "gold"), grab(plant, "faith"), grab(plant, "units")
    hx, hy = hut.split(":")
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    lua("InGame", rf"{D}\goody_pop.lua", {"ZUNIT": mover, "ZX": hx, "ZY": hy})
    after = lua("GameCore_Tuner", rf"{D}\goody_read.lua",
                {"ZX": hx, "ZY": hy, "ZUNIT": mover, "ZTAG": "after"})
    seed_after = grab(after, "seed", int)
    n, vals = account(seed, seed_after) if seed_after is not None else (None, [])
    row = {"kind": "goody-battery", "seed": seed, "hut": hut, "draws": n,
           "u": [round(v / 32768, 5) for v in vals],
           "goldBefore": g0, "goldAfter": grab(after, "gold"),
           "faithBefore": f0, "faithAfter": grab(after, "faith"),
           "unitsBefore": u0, "unitsAfter": grab(after, "units"),
           "hist": grab(after, "hist"),
           "hutGone": grab(after, "hutImprovement") == "none"}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")
