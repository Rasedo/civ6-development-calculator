"""Steelman the claim that a silo launch cannot beat an adjacent interceptor.

The claim is unusual -- an outright stop, with no roll -- so it deserves the
strongest attempt to break it:

  * the WEAKEST interceptor the socket can build. Units_XP2 puts the floor at
    AntiAirCombat 90 (Anti-Air Gun, Destroyer, Battleship, unteched GDR), and
    1 HP costs a further 10 * (1 - hp/100) = 9.9, measured: a 1 HP Destroyer's
    expected damage reads 25, exactly round(30 * 1.04^-4.9). That is 80.1, and
    it is the floor -- COMBAT_STRENGTH_REDUCTION_INSUFFICIENT_FUEL = 20 needs
    upkeep to be CHARGED at turn end, which a mid-turn socket cannot induce.
  * the draw itself. A silo launch consumes EXACTLY ONE random draw when an
    interceptor is adjacent and NONE when it is not, so something is rolled.
    The generator is known, so the drawn value is computable from the seed
    before the shot -- and this battery picks seeds that SPREAD that value over
    its whole range instead of leaving it to chance.

If the stop were "intercept iff draw < C" on any range, a high draw would leak.

    python steelman.py <guard UNIT_TYPE> <hp> <rounds>
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


def top15(seed):
    return ((A * (seed % M) + C) % M) >> 17


def draw(seed, rng):
    r16 = rng % 65536
    return 0 if r16 == 0 else (top15(seed) * r16) >> 15


def seed_for(target, rng=100, start=1):
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


GUARD, HP, ROUNDS = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
targets = [round(i * 99 / (ROUNDS - 1)) for i in range(ROUNDS)] if ROUNDS > 1 else [99]
start = 1
rows = []
for t in targets:
    seed = seed_for(t, 100, start)
    start = seed + 1
    reset = lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
                dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": GUARD,
                      "ZN": 1, "ZMARKER": "UNIT_WARRIOR"}, **TILES))
    ids = [int(x) for x in re.findall(r'"id":(\d+)', reset)]
    gid = ids[-1] if ids else None
    if gid and HP < 100:
        lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
            {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": HP})
    lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
        {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 40, "ZDELIVER": "UNIT_BOMBER"})
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    lua("InGame", rf"{D}\silo_launch.lua",
        {"ZSX": SILO_X, "ZSY": SILO_Y, "ZTX": AIM_X, "ZTY": AIM_Y,
         "ZWMD": "WMD_NUCLEAR_DEVICE", "ZFIRE": 1})
    det = False
    for _ in range(25):
        check = lua("GameCore_Tuner", rf"{D}\blast_check.lua", {"ZAX": AIM_X, "ZAY": AIM_Y})
        m = re.search(r'"aimFallout":(\d+)', check)
        if m and int(m.group(1)) > 0:
            det = True
            break
        if f'"t":"{GUARD}"' not in check:
            break
    row = {"kind": "steelman", "guard": GUARD, "hp": HP, "seed": seed,
           "draw100": draw(seed, 100), "draw2": draw(seed, 2),
           "draw1000": draw(seed, 1000), "u": round(top15(seed) / 32768, 5),
           "detonated": det}
    rows.append(row)
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")

leaked = [r for r in rows if r["detonated"]]
print(json.dumps({"kind": "steelman-summary", "guard": GUARD, "hp": HP,
                  "rounds": len(rows), "leaked": len(leaked),
                  "draw100Range": [min(r["draw100"] for r in rows),
                                   max(r["draw100"] for r in rows)]}))
