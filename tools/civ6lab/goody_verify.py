"""Predict, then pop: three seeds aimed at FAITH and one at GOLD.

If draw 1 really selects the category as floor(u*6) over the six equal-weight
rows in XML order, then seeds 998 / 6980 / 12962 must pay FAITH (a readable
balance) and seed 5983 must pay GOLD (small). Anything else falsifies the fit.
"""
import json
import re
import subprocess
import sys

LAB = r"C:\civ6-development-calculator\tools\civ6lab\lab.py"
D = r"C:\civ6-development-calculator\tools\civ6lab"
RUN = r"C:\civ6-development-calculator\tools\civ6lab\runs\rng2_20260921T100000Z.jsonl"

PREDICTIONS = [(998, "FAITH", "SMALL"), (6980, "FAITH", "SMALL"),
               (12962, "FAITH", "SMALL"), (5983, "GOLD", "SMALL")]


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120,
                          encoding="utf-8", errors="replace").stdout.strip()


def grab(txt, key):
    m = re.search(rf'"{key}":"?(-?[\w.: ]+?)"?[,}}]', txt)
    return m.group(1) if m else None


rows = []
for seed, cat, sub in PREDICTIONS:
    plant = lua("GameCore_Tuner", rf"{D}\goody_setup.lua", {"ZTAG": "plant", "ZPLANT": 1})
    if '"error"' in plant:
        print(json.dumps({"seed": seed, "error": "no spot for a hut"}))
        continue
    mover, hut = grab(plant, "mover"), grab(plant, "hutPlot")
    g0, f0, u0 = grab(plant, "gold"), grab(plant, "faith"), grab(plant, "units")
    hx, hy = hut.split(":")
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    lua("InGame", rf"{D}\goody_pop.lua", {"ZUNIT": mover, "ZX": hx, "ZY": hy})
    after = lua("GameCore_Tuner", rf"{D}\goody_read.lua",
                {"ZX": hx, "ZY": hy, "ZUNIT": mover, "ZTAG": "verify"})
    g1, f1, u1 = grab(after, "gold"), grab(after, "faith"), grab(after, "units")
    dg = round(float(g1) - float(g0), 2) if g1 and g0 else None
    df = round(float(f1) - float(f0), 2) if f1 and f0 else None
    du = int(u1) - int(u0) if u1 and u0 else None
    got = "GOLD" if dg else ("FAITH" if df else ("UNIT" if du else "none-visible"))
    row = {"kind": "goody-verify", "seed": seed, "predicted": cat, "predictedSub": sub,
           "goldDelta": dg, "faithDelta": df, "unitDelta": du, "observed": got,
           "hutGone": grab(after, "hutImprovement") == "none"}
    rows.append(row)
    print(json.dumps(row))

with open(RUN, "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")

hits = [r for r in rows if r["observed"] == r["predicted"]]
print(f"\n{len(hits)}/{len(rows)} predictions hit")
