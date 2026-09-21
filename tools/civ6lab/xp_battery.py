"""Two questions in one rig.

(1) Is experience gain a roll? GlobalParameters ships only fixed amounts, and the
    attack preview hands back an integer EXPERIENCE_CHANGE, but neither settles
    whether the ENGINE draws. Firing repeated bomber strikes at DIFFERENT seeds
    past the SAME interceptor varies the damage the interceptor deals while
    holding everything else fixed; if the experience it earns is identical every
    round, the award is a function of the event, not of a draw.

(2) Can an interceptor be USED UP? The scene is built ONCE and never rebuilt, so
    round 2 and round 3 meet an interceptor that has already fired this turn.
    If Civ 6 limits anti-air to one interception per turn, the later strikes get
    through -- which would be the way to beat an interceptor on a channel whose
    launcher cannot be shot down.

    python xp_battery.py <seed> [seed ...]
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


def u_of(seed):
    return (((1103515245 * (seed % M) + 12345) % M) >> 17) / 32768


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def sam_state():
    out = lua("GameCore_Tuner", rf"{D}\xp_read.lua",
              {"ZPLAYER": WAR, "ZX": AIM_X, "ZY": AIM_Y})
    m = re.search(r'"t":"UNIT_MOBILE_SAM","at":"[^"]*","hp":(\d+),"xp":(-?\d+),"level":(-?\d+)', out)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else (None, None, None)


def stock():
    out = lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
              {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 0, "ZSTOCK": 0, "ZDELIVER": "UNIT_BOMBER"})
    m = re.search(r'"nuclear":(\d+)', out)
    return int(m.group(1)) if m else None


# built ONCE: the interceptor persists across every round below
lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
    dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": "UNIT_MOBILE_SAM",
          "ZN": 1, "ZMARKER": "UNIT_WARRIOR"}, **TILES))

for n, seed in enumerate([int(x) for x in sys.argv[1:]], 1):
    hp0, xp0, lv0 = sam_state()
    setup = lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
                {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 1, "ZSTOCK": 40,
                 "ZDELIVER": "UNIT_BOMBER"})
    ids = re.findall(r'\{"id":(\d+),"x":39,"y":16,"combat":85,"moves":10\}', setup)
    if not ids:
        print(json.dumps({"error": "no bomber", "round": n}))
        break
    bomber = int(ids[-1])
    pre = lua("InGame", rf"{D}\aa_strength.lua",
              {"ZAU": bomber, "ZX": AIM_X, "ZY": AIM_Y})
    block = next((l for l in pre.splitlines() if '"ANTI_AIR"' in l), "")
    expect = re.search(r'"damageFrom":(-?\d+)', block)
    before = stock()
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    lua("InGame", rf"{D}\nuke_one.lua",
        {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": "WMD_NUCLEAR_DEVICE",
         "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": 0})
    after = before
    for _ in range(25):
        after = stock()
        if after != before:
            break
    hp1, xp1, lv1 = sam_state()
    check = lua("GameCore_Tuner", rf"{D}\blast_check.lua", {"ZAX": AIM_X, "ZAY": AIM_Y})
    fallout = re.search(r'"aimFallout":(\d+)', check)
    row = {"kind": "xp", "round": n, "seed": seed, "u": round(u_of(seed), 5),
           "previewDamage": int(expect.group(1)) if expect else None,
           "launched": before is not None and after != before,
           "detonated": bool(fallout and int(fallout.group(1)) > 0),
           "samHPbefore": hp0, "samHPafter": hp1,
           "samXPbefore": xp0, "samXPafter": xp1,
           "xpGain": None if xp0 is None or xp1 is None else xp1 - xp0,
           "samLevel": lv1, "samAlive": hp1 is not None}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
