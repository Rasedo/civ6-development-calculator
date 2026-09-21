"""Does the LAUNCH DISTANCE change how hard a warhead is to shoot down?

The ICBM law needs a warhead defence D, measured as 72 for a silo and 77 for a
submarine. Distance is the obvious candidate for the difference and I had not
tested it, so: the silo stays where it is and the AIM moves, from 2 tiles away
to 12 (the nuclear device's ICBMStrikeRange).

The interceptor is held at a wounded Anti-Air Gun, S_att = 90 - 10*(1 - hp/100),
chosen so the flip between "lands" and "stopped" sits in the MIDDLE of the draw
range, where a change in D of even one point moves it. Each round pins the draw
n = GetRandNum(12) by choosing the seed, so the flip point is read directly
rather than sampled.

    P(stopped) is (# of n with round((24+n) * 1.04^(S-D)) > 50) / 12,
    so the flip point n* determines D:  (23+n*) * k <= 50 < (24+n*) * k.

    python dist_run.py <hp> <n_low> <n_high>
"""
import json
import math
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

SILO_X, SILO_Y, WAR = 37, 17, 1
GUARD = "UNIT_ANTIAIR_GUN"
AA = 90
# (distance from the silo, aim plot)
AIMS = [(2, 36, 15), (3, 35, 15), (4, 34, 15), (6, 32, 15), (8, 30, 15),
        (10, 29, 13), (12, 26, 15)]

M = 1 << 32
A, C = 1103515245, 12345
LN104 = math.log(1.04)


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


HP = int(sys.argv[1])
N_LO, N_HI = int(sys.argv[2]), int(sys.argv[3])
s_att = AA - 10 * (1 - HP / 100)

for dist, ax, ay in AIMS:
    outcomes = {}
    start = 1
    for n in range(N_LO, N_HI + 1):
        seed = seed_for(n, 12, start)
        start = seed + 1
        place = lua("GameCore_Tuner", rf"{D}\aa_cover.lua",
                    {"ZAX": ax, "ZAY": ay, "ZWAR": WAR, "ZUNIT": GUARD, "ZD": 1,
                     "ZMARKER": "UNIT_WARRIOR", "ZWATER": 0})
        if '"placed":true' not in place:
            outcomes[n] = "noguard"
            continue
        gid = int(re.search(r'"id":(-?\d+)', place).group(1))
        if HP < 100:
            lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
                {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": HP})
        lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
            {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 40, "ZDELIVER": "UNIT_BOMBER"})
        lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
        fire = lua("InGame", rf"{D}\silo_launch.lua",
                   {"ZSX": SILO_X, "ZSY": SILO_Y, "ZTX": ax, "ZTY": ay,
                    "ZWMD": "WMD_NUCLEAR_DEVICE", "ZFIRE": 1})
        if '"canStart":true' not in fire:
            outcomes[n] = "refused"
            continue
        det = False
        for _ in range(25):
            check = lua("GameCore_Tuner", rf"{D}\blast_check.lua", {"ZAX": ax, "ZAY": ay})
            m = re.search(r'"aimFallout":(\d+)', check)
            if m and int(m.group(1)) > 0:
                det = True
                break
            if f'"t":"{GUARD}"' not in check:
                break
        outcomes[n] = "landed" if det else "stopped"
    flip = next((n for n in range(N_LO, N_HI + 1) if outcomes.get(n) == "stopped"), None)
    d_lo = d_hi = None
    if flip is not None and flip > N_LO:
        # (23+flip)*k <= 50 < (24+flip)*k  ->  k in (50/(24+flip), 50/(23+flip)]
        d_lo = s_att - math.log(50 / (23 + flip)) / LN104
        d_hi = s_att - math.log(50 / (24 + flip)) / LN104
    row = {"kind": "distlaw", "siloDistance": dist, "aim": f"{ax}:{ay}",
           "guard": GUARD, "hp": HP, "sAtt": round(s_att, 2),
           "outcomes": outcomes, "flipAt": flip,
           "impliedD": None if d_lo is None else [round(d_lo, 2), round(d_hi, 2)]}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
