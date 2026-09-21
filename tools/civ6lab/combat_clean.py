"""A clean endpoint test: freeze everything except the seed.

The first attempt was confounded — archers were spawned BETWEEN shots, and each
new unit adjacent to the defender adds a support/flanking bonus, which moves the
strength difference the multiplier is applied to. Here nothing is spawned after
the first shot: three archers that already exist fire in turn, the defender is
healed to full between shots, and only the rng state changes.

Rival forms, fitted on the u~0 shot and tested at u~0.5 and u~1:
    published  damage = base * (0.8 + 0.4u)      ratio(u=1)/(u=0) = 1.500
    rival      damage = base * (0.9 + 0.2u)      ratio                = 1.222
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"
DEFENDER, DOWNER, DX, DY = 983053, 1, 33, 15

M = 1 << 32
A = 1103515245


def u_of(seed):
    return (((A * (seed % M) + 12345) % M) >> 17) / 32768


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def grab(txt, key, cast=str):
    m = re.search(rf'"{key}":"?(-?[\w.:]+?)"?[,}}]', txt)
    return cast(m.group(1)) if m else None


# archers that exist already and have not fired; no new spawns from here on
shooters = [int(sys.argv[i]) for i in range(1, len(sys.argv))]
SEEDS = [26579, 1695, 23189]          # u ~ 0.000, 0.500, 1.000

rows = []
for shooter, seed in zip(shooters, SEEDS):
    lua("GameCore_Tuner", rf"{D}\combat_roll_read.lua",
        {"ZATT": shooter, "ZDEF": DEFENDER, "ZDOWNER": DOWNER, "ZHEAL": 1})
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    shot = lua("InGame", rf"{D}\combat_roll_shot.lua",
               {"ZATT": shooter, "ZDEF": DEFENDER, "ZDOWNER": DOWNER,
                "ZSEED": seed, "ZDX": DX, "ZDY": DY})
    if '"fired":true' not in shot:
        print(json.dumps({"seed": seed, "shooter": shooter, "skipped": shot}))
        continue
    read = ""
    for _ in range(6):                       # the strike resolves a tick later
        read = lua("GameCore_Tuner", rf"{D}\combat_roll_read.lua",
                   {"ZATT": shooter, "ZDEF": DEFENDER, "ZDOWNER": DOWNER, "ZHEAL": 0})
        if grab(read, "defenderDamage", int):
            break
    row = {"kind": "combat-clean", "seed": seed, "u": round(u_of(seed), 5),
           "shooter": shooter, "damage": grab(read, "defenderDamage", int)}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

if len(rows) >= 2:
    lo = min(rows, key=lambda r: r["u"])
    hi = max(rows, key=lambda r: r["u"])
    if lo["damage"] and hi["damage"]:
        ratio = hi["damage"] / lo["damage"]
        print(f"\nu={lo['u']} -> {lo['damage']}   u={hi['u']} -> {hi['damage']}   ratio {ratio:.3f}")
        print("  published 0.8+0.4u predicts 1.500 ; rival 0.9+0.2u predicts 1.222")
        band = (hi["damage"] - .5) / (lo["damage"] + .5), (hi["damage"] + .5) / (lo["damage"] - .5)
        print(f"  integer rounding puts the true ratio in [{band[0]:.3f}, {band[1]:.3f}]")
