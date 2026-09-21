"""Can an interceptor be USED UP inside one turn?

Every battery so far rebuilt the scene between rounds, so every strike met a
FRESH interceptor. The owner's question is whether a delivery channel whose
launcher cannot be shot down -- a silo, a submarine -- can ever get a warhead
through. If Civ 6 allows one interception per unit per turn, the answer is
"fire twice", and nothing about the interceptor's strength matters.

The scene is built ONCE here and then fired at repeatedly without rebuilding.
The landing test is the AIM PLOT'S FALLOUT, not the warhead stock: the stock
read raced the queue and produced false "did not launch" rows before.

    python once_per_turn.py <channel: silo|bomber> <guard UNIT_TYPE> <rounds>

The aim plot's fallout is cleared before each round so that only the round's
own detonation can set it.
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
SILO_X, SILO_Y = 37, 17
TILES = {"ZG1X": 37, "ZG1Y": 14, "ZG2X": 36, "ZG2Y": 16,
         "ZG3X": 35, "ZG3Y": 15, "ZG4X": 37, "ZG4Y": 16}


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def scene():
    out = lua("GameCore_Tuner", rf"{D}\blast_check.lua", {"ZAX": AIM_X, "ZAY": AIM_Y})
    fallout = re.search(r'"aimFallout":(\d+)', out)
    guard = re.search(rf'"owner":{WAR},"id":(\d+),"t":"{GUARD}","at":"([^"]*)","hp":(\d+)', out)
    return {"aimFallout": int(fallout.group(1)) if fallout else None,
            "guardID": int(guard.group(1)) if guard else None,
            "guardAt": guard.group(2) if guard else None,
            "guardHP": int(guard.group(3)) if guard else None}


def guard_xp():
    out = lua("GameCore_Tuner", rf"{D}\xp_read.lua",
              {"ZPLAYER": WAR, "ZX": AIM_X, "ZY": AIM_Y})
    m = re.search(rf'"t":"{GUARD}","at":"[^"]*","hp":(\d+),"xp":(-?\d+),"level":(-?\d+)', out)
    return (int(m.group(2)), int(m.group(3))) if m else (None, None)


CHANNEL, GUARD, ROUNDS = sys.argv[1], sys.argv[2], int(sys.argv[3])
NGUARDS = int(sys.argv[4]) if len(sys.argv) > 4 else 1

lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
    dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": GUARD,
          "ZN": NGUARDS, "ZMARKER": "UNIT_WARRIOR"}, **TILES))
lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
    {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 0, "ZSTOCK": 40, "ZDELIVER": "UNIT_BOMBER"})

for n in range(1, ROUNDS + 1):
    # clear ONLY the aim plot's fallout, leaving the interceptor exactly as the
    # previous round left it -- that is the whole point of this battery
    lua("GameCore_Tuner", rf"{D}\clear_aim.lua",
        {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZMARKER": "UNIT_WARRIOR"})
    pre = scene()
    xp0, lv0 = guard_xp()
    if CHANNEL == "silo":
        lua("InGame", rf"{D}\silo_launch.lua",
            {"ZSX": SILO_X, "ZSY": SILO_Y, "ZTX": AIM_X, "ZTY": AIM_Y,
             "ZWMD": "WMD_NUCLEAR_DEVICE", "ZFIRE": 1})
    else:
        setup = lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
                    {"ZBX": BASE_X, "ZBY": BASE_Y, "ZN": 1, "ZSTOCK": 40,
                     "ZDELIVER": "UNIT_BOMBER"})
        del setup
        lua("InGame", rf"{D}\nuke_one.lua",
            {"ZCX": AIM_X, "ZCY": AIM_Y, "ZD": 0, "ZWMD": "WMD_NUCLEAR_DEVICE",
             "ZBX": BASE_X, "ZBY": BASE_Y, "ZSKIP": 0})
    post = pre
    for _ in range(25):
        post = scene()
        if post["aimFallout"] or post["guardHP"] != pre["guardHP"] or post["guardID"] is None:
            break
    xp1, lv1 = guard_xp()
    row = {"kind": "onceperturn", "channel": CHANNEL, "guard": GUARD, "guards": NGUARDS, "round": n,
           "guardBefore": pre["guardHP"], "guardAfter": post["guardHP"],
           "guardXPbefore": xp0, "guardXPafter": xp1,
           "xpGain": None if xp0 is None or xp1 is None else xp1 - xp0,
           "detonated": bool(post["aimFallout"])}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
    if row["detonated"]:
        print(json.dumps({"note": "a warhead LANDED on round %d -- the interceptor "
                                  "did not stop it" % n}))
        break
