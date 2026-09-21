"""Is a MISSILE SILO launch interceptable, and is the stop a roll or certain?

B3 was recorded unreachable because the earlier attempt passed PARAM_X/PARAM_Y.
The shipped UI (WorldInput.lua ICBMStrike) uses PARAM_X0/Y0 for the SILO plot
and PARAM_X1/Y1 for the target, on CityManager.RequestCommand against
Cities.GetPlotPurchaseCity(siloPlot). With those the command starts.

One round = rebuild the scene (one Mobile SAM adjacent to the aim, a fresh
marker on it, the aim's fallout cleared), seed the generator, fire, then read
the warhead stock (the launch test) and the aim plot (the DETONATION test:
fallout on the aim and a dead marker mean it landed).

    python silo_battery.py <seed> [seed ...]
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


def u_of(seed):
    return (((1103515245 * (seed % M) + 12345) % M) >> 17) / 32768


def lua(state, fname, sets):
    cmd = [sys.executable, LAB, "lua", "--state", state, "--file", fname]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                          encoding="utf-8", errors="replace").stdout.strip()


def stock():
    out = lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
              {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 0, "ZDELIVER": "UNIT_BOMBER"})
    m = re.search(r'"nuclear":(\d+)', out)
    return int(m.group(1)) if m else None


guards = int(sys.argv[1])
args = sys.argv[2:]
GUARD = "UNIT_MOBILE_SAM"
if args and args[0].startswith("UNIT_"):
    GUARD = args.pop(0)
for seed in [int(x) for x in args]:
    lua("GameCore_Tuner", rf"{D}\intercept_stack.lua",
        dict({"ZAX": AIM_X, "ZAY": AIM_Y, "ZWAR": WAR, "ZUNIT": GUARD,
              "ZN": guards, "ZMARKER": "UNIT_WARRIOR"}, **TILES))
    before = stock()
    if before is not None and before < 5:
        lua("GameCore_Tuner", rf"{D}\pop_setup2.lua",
            {"ZBX": 39, "ZBY": 16, "ZN": 0, "ZSTOCK": 40, "ZDELIVER": "UNIT_BOMBER"})
        before = stock()
    lua("GameCore_Tuner", rf"{D}\rng_seed.lua", {"ZSET": 1, "ZSEED": seed})
    fire = lua("InGame", rf"{D}\silo_launch.lua",
               {"ZSX": SILO_X, "ZSY": SILO_Y, "ZTX": AIM_X, "ZTY": AIM_Y,
                "ZWMD": "WMD_NUCLEAR_DEVICE", "ZFIRE": 1})
    after = stock()
    check = lua("GameCore_Tuner", rf"{D}\blast_check.lua", {"ZAX": AIM_X, "ZAY": AIM_Y})
    fallout = re.search(r'"aimFallout":(\d+)', check)
    sam = re.search(r'"t":"UNIT_MOBILE_SAM","at":"(\d+:\d+)","hp":(\d+)', check)
    row = {"kind": "silo", "guards": guards, "guardType": GUARD, "seed": seed, "u": round(u_of(seed), 5),
           "stockBefore": before, "stockAfter": after,
           "launched": before is not None and after is not None and after < before,
           "aimFallout": int(fallout.group(1)) if fallout else None,
           "detonated": bool(fallout and int(fallout.group(1)) > 0),
           "samHP": int(sam.group(2)) if sam else None,
           "canStart": '"canStart":true' in fire}
    print(json.dumps(row))
    with open(RUN, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
