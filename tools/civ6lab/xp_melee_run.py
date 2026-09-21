"""Does a unit bank a DRAWN amount of experience, or a fixed one?

A melee attack executes from the socket as MOVE_TO onto the defender's plot
(a RANGE_ATTACK on a freshly created unit is refused, so melee is the channel).
A unit attacks once per turn, so N attackers are placed around ONE defender and
each attacks at its own seed against a defender restored to full health, which
varies the DAMAGE while holding the event fixed.

Prediction, from GlobalParameters and the preview: every attacker banks the
same integer, and it equals the preview's ATTACKER EXPERIENCE_CHANGE.

    python xp_melee_run.py <seed> [seed ...]
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

DEF_X, DEF_Y, WAR = 37, 13, 1
# six tiles around 37:13 that a land unit of player 0 can stand on, one attacker
# each, because two land units of one player cannot share a plot
SPOTS = [(38, 13), (36, 13), (37, 12), (38, 12), (36, 12), (38, 14)]

M = 1 << 32


def u_of(seed):
    return (((1103515245 * (seed % M) + 12345) % M) >> 17) / 32768


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def read(player, x, y):
    return lua("GameCore_Tuner", rf"{D}\xp_read.lua", {"ZPLAYER": player, "ZX": x, "ZY": y})


def unit_row(txt, uid):
    m = re.search(rf'"id":{uid},"t":"[^"]*","at":"([^"]*)","hp":(\d+),"xp":(-?\d+)', txt)
    return (m.group(1), int(m.group(2)), int(m.group(3))) if m else (None, None, None)


def def_row():
    m = re.search(r'"t":"UNIT_WARRIOR","at":"%d:%d","hp":(\d+),"xp":(-?\d+)' % (DEF_X, DEF_Y),
                  read(WAR, DEF_X, DEF_Y))
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


seeds = [int(x) for x in sys.argv[1:]][:len(SPOTS)]
attackers = []
for (sx, sy), seed in zip(SPOTS, seeds):
    out = lua("GameCore_Tuner", rf"{D}\xp_spawn.lua",
              {"ZPLAYER": 0, "ZUNIT": "UNIT_WARRIOR", "ZX": sx, "ZY": sy})
    m = re.search(r'"id":(-?\d+)', out)
    if m and int(m.group(1)) > 0:
        attackers.append((int(m.group(1)), sx, sy, seed))
print(json.dumps({"kind": "xpmeleescene", "attackers": len(attackers)}))

for uid, sx, sy, seed in attackers:
    # restore the defender so every round is the same event
    lua("GameCore_Tuner", rf"{D}\xp_scene.lua",
        {"ZN": 0, "ZATT": "UNIT_NONE", "ZAX": sx, "ZAY": sy,
         "ZDEF": "UNIT_WARRIOR", "ZDX": DEF_X, "ZDY": DEF_Y, "ZWAR": WAR})
    hp0, _ = def_row()
    _, _, xp0 = unit_row(read(0, sx, sy), uid)
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    shot = lua("InGame", rf"{D}\xp_melee.lua", {"ZAU": uid, "ZTX": DEF_X, "ZTY": DEF_Y})
    hp1 = hp0
    for _ in range(25):
        hp1, _ = def_row()
        if hp1 != hp0:
            break
    txt = read(0, sx, sy)
    at1, ahp1, xp1 = unit_row(txt, uid)
    pre = re.search(r'"ATTACKER":\{"xp":(-?\d+),"damageTo":(-?\d+),"damageFrom":(-?\d+)', shot)
    row = {"kind": "xpmelee", "unit": uid, "from": f"{sx}:{sy}", "seed": seed,
           "u": round(u_of(seed), 5), "fired": '"fired":true' in shot,
           "previewXP": int(pre.group(1)) if pre else None,
           "previewDamageToDefender": int(pre.group(2)) if pre else None,
           "defHPbefore": hp0, "defHPafter": hp1,
           "damageDealt": None if hp0 is None or hp1 is None else hp0 - hp1,
           "attackerHPafter": ahp1, "attackerAt": at1,
           "xpBefore": xp0, "xpAfter": xp1,
           "xpGain": None if xp0 is None or xp1 is None else xp1 - xp0}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
