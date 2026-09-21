"""Calibrate an interceptor's effective strength against its health, WITHOUT
assuming the penalty rule.

Every submarine bracket so far leaned on S = AA - 10*(1 - hp/100). To pin the
submarine warhead's strength by sweeping the interceptor's health, that rule has
to be independently true, not assumed.

The bomber channel is the instrument: its preview is deterministic (seven seeds
gave identical output), it is NOT affected by the aim plot's terrain (54 at a +3
tile and 54 at a +6 tile), and the Bomber defends with its own Combat of 85. So

    DAMAGE_FROM = round( 30 * 1.04^(S - 85) )

and reading it at each health turns the damage back into a bracket on S. The
health values where the damage STEPS are what pin the rule: under
S = 90 - 10*(1 - hp/100) the ladder is 36/35/34/33/32/32/31 for
hp = 100/90/80/75/70/65/60.

    python hp_calib.py
"""
import json
import math
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

AIM_X, AIM_Y, WAR = 36, 15, 1
GUARD, AA, BOMBER_DEF = "UNIT_ANTIAIR_GUN", 90, 85
LN104 = math.log(1.04)
HPS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 40, 30, 20, 10, 1]


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def bomber_id():
    out = lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
              {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 40, "ZDELIVER": "UNIT_BOMBER"})
    ids = re.findall(r'\{"id":(\d+),"x":39,"y":16,"combat":85,"moves":10\}', out)
    return int(ids[0]) if ids else None


rows = []
for hp in HPS:
    place = lua("GameCore_Tuner", rf"{D}\aa_cover.lua",
                {"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": GUARD,
                 "ZD": 1, "ZMARKER": "UNIT_WARRIOR", "ZWATER": 0})
    gid = int(re.search(r'"id":(-?\d+)', place).group(1))
    if hp < 100:
        lua("GameCore_Tuner", rf"{D}\set_unit_damage.lua",
            {"ZPLAYER": WAR, "ZUNIT": gid, "ZHP": hp})
    bid = bomber_id()
    read = lua("InGame", rf"{D}\aa_strength.lua",
               {"ZAU": bid, "ZX": AIM_X, "ZY": AIM_Y})
    line = next((l for l in read.splitlines() if '"ANTI_AIR"' in l), "")
    m = re.search(r'"damageFrom":(-?\d+)', line)
    if not m:
        print(json.dumps({"hp": hp, "error": "no block"}))
        continue
    dmg = int(m.group(1))
    # round(30 * 1.04^(S-85)) == dmg  <->  30*1.04^(S-85) in [dmg-0.5, dmg+0.5)
    s_lo = BOMBER_DEF + math.log((dmg - 0.5) / 30) / LN104
    s_hi = BOMBER_DEF + math.log((dmg + 0.5) / 30) / LN104
    model = AA - 10 * (1 - hp / 100)
    row = {"kind": "hpcalib", "hp": hp, "damageFrom": dmg,
           "sBracket": [round(s_lo, 3), round(s_hi, 3)],
           "model": round(model, 2), "modelFits": s_lo <= model < s_hi}
    rows.append(row)
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")

bad = [r for r in rows if not r["modelFits"]]
print(json.dumps({"kind": "hpcalib-summary", "rows": len(rows),
                  "modelFitsAll": not bad, "misses": bad}))
