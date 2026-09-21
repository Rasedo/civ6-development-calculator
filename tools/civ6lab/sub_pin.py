"""Pin the SUBMARINE warhead's strength, without the terrain term.

Two things made the earlier submarine bracket (80.04, 80.56] soft:
  * both scenes were on tiles with a terrain bonus, so the answer carried the
    assumption that the tile term is exactly terrain + feature DefenseModifier;
  * the bracket width is set by the gap between two adjacent draws, widest at
    low n.

Both are fixed here. The aim is a BARE tile -- Grassland, no feature, defence
modifier 0 -- so the measured warhead defence IS the base with nothing to
subtract. And the interceptor's health is swept near full, which walks the flip
point into n = 10/11 where the draws are closest together (35/34 = 1.029, i.e.
0.74 strength points) and where "flips at 11" and "never flips" split the
candidate values sharply:

    hp 100 (S = 90.0):  flips at 11  <=>  B in (80.02, 80.65]
    hp  95 (S = 89.5):  flips at 11  <=>  B in (79.52, 80.15]

so hp 100 and hp 95 together separate B = 80.0 from B = 80.3 outright.

The health rule itself is no longer assumed: hp_calib.py read the bomber
preview at 16 healths and every step lands where S = 90 - c*(1 - hp/100) with
c in about [9.85, 10.15] puts it, which is +-0.06 at the healths used here.

    python sub_pin.py <aim_x> <aim_y> <hp> [hp ...]
"""
import json
import math
import os
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

SUB_X, SUB_Y, WAR = 35, 17, 1
GUARD, AA = "UNIT_ANTIAIR_GUN", 90
M = 1 << 32
A, C = 1103515245, 12345
LN104 = math.log(1.04)
CHANNEL = os.environ.get("CIV6_CHANNEL", "sub")
PROBE = [int(x) for x in os.environ.get("CIV6_PROBE", "8,9,10,11").split(",")]


def top15(seed):
    return ((A * (seed % M) + C) % M) >> 17


def draw(seed, rng):
    r16 = rng % 65536
    return 0 if r16 == 0 else (top15(seed) * r16) >> 15


def seed_for(target, rng, start=1):
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


AIM_X, AIM_Y = int(sys.argv[1]), int(sys.argv[2])
rows = []
for hp in [int(x) for x in sys.argv[3:]]:
    s_att = AA - 10 * (1 - hp / 100)
    outcomes = {}
    start = 1
    for n in PROBE:
        seed = seed_for(n, 12, start)
        start = seed + 1
        place = lua("GameCore_Tuner", rf"{D}\aa_cover.lua",
                    {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": GUARD,
                     "ZD": 1, "ZMARKER": "UNIT_WARRIOR", "ZWATER": 0})
        gid = int(re.search(r'"id":(-?\d+)', place).group(1))
        guard_at = re.search(r'"at":"([^"]*)"', place).group(1)
        if gid < 0:
            outcomes[n] = "noguard"
            continue
        if hp < 100:
            lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
                {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": hp})
        if CHANNEL == "silo":
            lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
                {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 40,
                 "ZDELIVER": "UNIT_BOMBER"})
            lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
            fire = lua("InGame", rf"{D}\silo_launch.lua",
                       {"ZSX": 37, "ZSY": 17, "ZTX": AIM_X, "ZTY": AIM_Y,
                        "ZWMD": "WMD_NUCLEAR_DEVICE", "ZFIRE": 1})
            ok = '"canStart":true' in fire
        else:
            sub = lua("GameCore_Tuner", rf"{D}\sub_launch.lua",
                      {"ZX": SUB_X, "ZY": SUB_Y, "ZSTOCK": 40})
            sid = int(re.search(r'"id":(-?\d+)', sub).group(1))
            lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
            fire = lua("InGame", rf"{D}\sub_fire.lua",
                       {"ZAU": sid, "ZTX": AIM_X, "ZTY": AIM_Y})
            ok = '"fired":true' in fire
        if not ok:
            outcomes[n] = "refused"
            continue
        det = False
        for _ in range(25):
            check = lua("GameCore_Tuner", rf"{D}\blast_check.lua",
                        {"ZAX": AIM_X, "ZAY": AIM_Y})
            m = re.search(r'"aimFallout":(\d+)', check)
            if m and int(m.group(1)) > 0:
                det = True
                break
            if f'"t":"{GUARD}"' not in check:
                break
        outcomes[n] = "landed" if det else "stopped"
    flip = next((n for n in PROBE if outcomes.get(n) == "stopped"), None)
    # round(x) > 50  <->  x >= 50.5
    b_lo = b_hi = None
    if flip is not None:
        prev = flip - 1
        b_hi = s_att - math.log(50.5 / (24 + flip)) / LN104
        if prev >= 0:
            b_lo = s_att - math.log(50.5 / (24 + prev)) / LN104
    elif all(v == "landed" for v in outcomes.values()):
        b_lo = s_att - math.log(50.5 / (24 + PROBE[-1])) / LN104
    row = {"kind": "subpin", "channel": CHANNEL, "aim": f"{AIM_X}:{AIM_Y}", "guardAt": guard_at,
           "hp": hp, "sAtt": round(s_att, 2), "outcomes": outcomes,
           "flipAt": flip,
           "baseBracket": [None if b_lo is None else round(b_lo, 3),
                           None if b_hi is None else round(b_hi, 3)]}
    rows.append(row)
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")

lo = max((r["baseBracket"][0] for r in rows if r["baseBracket"][0] is not None),
         default=None)
hi = min((r["baseBracket"][1] for r in rows if r["baseBracket"][1] is not None),
         default=None)
print(json.dumps({"kind": "subpin-summary", "aim": f"{AIM_X}:{AIM_Y}",
                  "intersection": [lo, hi],
                  "contains80": (lo is None or lo < 80) and (hi is None or 80 <= hi)}))
