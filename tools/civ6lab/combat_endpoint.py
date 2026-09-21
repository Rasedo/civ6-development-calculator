"""An out-of-sample test of the combat multiplier, at the extremes.

Six earlier shots spanned u = 0.22..0.93 and fitted base = 28.6 under the
published damage = base * (0.8 + 0.4u). Both ENDS of that multiplier are
therefore extrapolated. This picks seeds whose first draw sits near u = 0 and
u = 1, states the prediction of each rival form BEFORE firing, and fires.

    published  0.8 + 0.4u   at u~0 -> 0.800 * base
    rival      0.9 + 0.2u   at u~0 -> 0.900 * base   (a +/-10% spread)

At base 28.6 those are 23 and 26 damage — three apart, so one shot separates
them.
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

M = 1 << 32
A = 1103515245


def step(s):
    return (A * (s % M) + 12345) % M


def u_of(seed):
    return (step(seed) >> 17) / 32768


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def grab(txt, key, cast=str):
    m = re.search(rf'"{key}":"?(-?[\w.:]+?)"?[,}}]', txt)
    return cast(m.group(1)) if m else None


# seeds whose FIRST draw lands near each end, found by scanning
lo = min(range(1, 200000), key=lambda s: u_of(s))
hi = max(range(1, 200000), key=lambda s: u_of(s))
mid = min(range(1, 200000), key=lambda s: abs(u_of(s) - 0.5))
TARGETS = [(lo, u_of(lo)), (hi, u_of(hi)), (mid, u_of(mid))]

print("== predictions, stated before firing ==")
for seed, u in TARGETS:
    print(f"  seed {seed:>6}  u={u:.5f}   published(0.8+0.4u) -> {round(28.6*(0.8+0.4*u))}"
          f"   rival(0.9+0.2u) -> {round(28.6*(0.9+0.2*u))}")

war = lua("GameCore_Tuner", rf"{D}\declare_war.lua", {"ZP": 1})
setup = lua("GameCore_Tuner", rf"{D}\combat_roll_setup.lua",
            {"ZAX": 34, "ZAY": 15, "ZDX": 33, "ZDY": 15, "ZDEF": 1})
print("\n" + setup)
att, dfd = grab(setup, "attacker", int), grab(setup, "defender", int)
if not att or not dfd:
    sys.exit("no combat pair")

rows = []
for seed, u in TARGETS:
    fleet = lua("GameCore_Tuner", rf"{D}\combat_roll_fleet.lua",
                {"ZDX": 33, "ZDY": 15, "ZN": 1})
    m = re.search(r'"id":(\d+)', fleet)
    shooter = int(m.group(1)) if m else att
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    lua("InGame", rf"{D}\combat_roll_shot.lua",
        {"ZATT": shooter, "ZDEF": dfd, "ZDOWNER": 1, "ZSEED": seed, "ZDX": 33, "ZDY": 15})
    read = lua("GameCore_Tuner", rf"{D}\combat_roll_read.lua",
               {"ZATT": shooter, "ZDEF": dfd, "ZDOWNER": 1, "ZHEAL": 1})
    dmg = grab(read, "defenderDamage", int)
    row = {"kind": "combat-endpoint", "seed": seed, "u": round(u, 5), "damage": dmg,
           "predPublished": round(28.6 * (0.8 + 0.4 * u)),
           "predRival": round(28.6 * (0.9 + 0.2 * u))}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

good = [r for r in rows if r["damage"] == r["predPublished"]]
rival = [r for r in rows if r["damage"] == r["predRival"]]
print(f"\npublished form hit {len(good)}/{len(rows)}; rival form hit {len(rival)}/{len(rows)}")
