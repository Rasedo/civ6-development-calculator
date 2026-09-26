"""H-3: Fractal.Create / CreateRifts / BuildRidges grids with the map
generator's state pinned on both sides.

    python tools/civ6lab/h3_fractal.py --host 127.0.0.3 [--set duel|grains|flags|all]

Each case runs in GameCore_Tuner (an in-game map-generation API):
    pin (4 x GetRandomNumber(32768)) -> Fractal.Create(...) -> pin -> [BuildRidges -> pin]
and dumps GetHeight(x, y) for every plot of the fractal's own grid and
GetHeight(p) for p = 0..100. The pins give the exact LCG state before the
call and the number of draws it consumed. One JSON line per case to
runs/h3_fractal_<stamp>.jsonl; the grids are the data a CvFractal fit reads.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner  # noqa: E402
from h3_fit import find_state, step  # noqa: E402

GC = "GameCore_Tuner"

LUA = r"""
local function pin()
  local t = {}
  for i = 1, 4 do t[i] = tostring(TerrainBuilder.GetRandomNumber(32768, "civ6lab pin")) end
  return table.concat(t, ",")
end
local W, H, GRAIN, XE, YE = ZW, ZH, ZGRAIN, ZXE, ZYE
local flags = ZFLAGS
print("P0 " .. pin())
local f
if ZRIFT > 0 then
  local rf = Fractal.Create(W, H, ZRIFT, {}, XE, YE)
  print("P1 " .. pin())
  f = Fractal.CreateRifts(W, H, GRAIN, flags, rf, XE, YE)
else
  f = Fractal.Create(W, H, GRAIN, flags, XE, YE)
end
print("P2 " .. pin())
local function grid(tag)
  for y = 0, H - 1 do
    local row = {}
    for x = 0, W - 1 do row[#row + 1] = tostring(f:GetHeight(x, y)) end
    print(tag .. " " .. y .. " " .. table.concat(row, ","))
  end
  local pc = {}
  for p = 0, 100 do pc[#pc + 1] = tostring(f:GetHeight(p)) end
  print(tag .. "PCT " .. table.concat(pc, ","))
end
grid("G")
if ZPLATES > 0 then
  f:BuildRidges(ZPLATES, ZRFLAGS, ZBR, ZBF)
  print("P3 " .. pin())
  grid("R")
end
"""

LUA_METHODS = r"""
local f = Fractal.Create(8, 8, 2, {}, -1, -1)
local acc = {}
local function add(t) if type(t) == "table" then for k, v in pairs(t) do acc[#acc + 1] = tostring(k) .. ":" .. type(v) end end end
add(f)
local mt = getmetatable(f)
if type(mt) == "table" then add(mt); local ok, idx = pcall(function() return mt["__index"] end); if ok then add(idx) end end
table.sort(acc)
print("M " .. type(f) .. " " .. table.concat(acc, " "))
"""


def lua_flags(d: dict) -> str:
    return "{" + ", ".join(f"{k} = true" for k in d) + "}"


def cases(which: str) -> list[dict]:
    base = dict(w=44, h=26, grain=2, flags={}, xe=6, ye=5, rift=0, plates=0, rflags={}, br=1, bf=2)
    out = []
    if which in ("duel", "all"):
        # Continents on Duel, as InitFractal calls it: FRAC_POLAR, grains 1..7 with/without rifts, ridges
        for g in (1, 2, 3):
            out.append({**base, "name": f"continents_g{g}", "grain": g, "flags": {"FRAC_POLAR": 1}})
        out.append({**base, "name": "continents_g2_rift2", "grain": 2, "flags": {"FRAC_POLAR": 1}, "rift": 2})
        out.append({**base, "name": "continents_g2_ridges", "grain": 2, "flags": {"FRAC_POLAR": 1}, "plates": 4})
    if which in ("grains", "all"):
        for g in range(0, 8):
            out.append({**base, "name": f"plain_g{g}", "grain": g})
    if which in ("flags", "all"):
        for fl in ({"FRAC_WRAP_X": 1}, {"FRAC_WRAP_Y": 1}, {"FRAC_INVERT_HEIGHTS": 1},
                   {"FRAC_WRAP_X": 1, "FRAC_POLAR": 1}):
            out.append({**base, "name": "flags_" + "+".join(fl), "flags": fl})
        out.append({**base, "name": "exp_default", "xe": -1, "ye": -1})
        out.append({**base, "name": "small_8x8", "w": 8, "h": 8, "grain": 1, "xe": -1, "ye": -1})
    if which == "holdout":
        # sizes, exponents and flags the fit never saw
        out.append({**base, "name": "ho_std_polar_g2", "w": 84, "h": 54, "grain": 2, "flags": {"FRAC_POLAR": 1}})
        out.append({**base, "name": "ho_60x38_e5_4_g1_wrapx", "w": 60, "h": 38, "grain": 1, "xe": 5, "ye": 4,
                    "flags": {"FRAC_WRAP_X": 1}})
        out.append({**base, "name": "ho_30x20_e7_7_g4_inv", "w": 30, "h": 20, "grain": 4, "xe": 7, "ye": 7,
                    "flags": {"FRAC_INVERT_HEIGHTS": 1}})
        out.append({**base, "name": "ho_106x66_def_g3_wrapx_polar", "w": 106, "h": 66, "grain": 3, "xe": -1, "ye": -1,
                    "flags": {"FRAC_WRAP_X": 1, "FRAC_POLAR": 1}})
        out.append({**base, "name": "ho_44x26_g5_wrapxy", "grain": 5, "flags": {"FRAC_WRAP_X": 1, "FRAC_WRAP_Y": 1}})
    if which == "repeat":
        out.append({**base, "name": "plain_g2_a"})
        out.append({**base, "name": "plain_g2_b"})
    return out


def state_after(pin: list[int]) -> int | None:
    st = find_state(pin, 1103515245, 12345)
    if len(st) != 1:
        return None
    s = st[0]
    for _ in range(3):
        s = step(s)
    return s


def count_between(s_end_prev: int, pin_next: list[int], limit: int = 2_000_000) -> int | None:
    """draws between the end of one pin and the first draw of the next"""
    st = find_state(pin_next, 1103515245, 12345)
    if len(st) != 1:
        return None
    target = st[0]
    s = s_end_prev
    for n in range(limit):
        s = step(s)
        if s == target:
            return n
    return None


def run_case(t: Tuner, c: dict) -> dict:
    lua = LUA
    for k, v in (("ZW", c["w"]), ("ZH", c["h"]), ("ZGRAIN", c["grain"]), ("ZXE", c["xe"]), ("ZYE", c["ye"]),
                 ("ZRIFT", c["rift"]), ("ZPLATES", c["plates"]), ("ZBR", c["br"]), ("ZBF", c["bf"])):
        lua = lua.replace(k, str(v))
    lua = lua.replace("ZRFLAGS", lua_flags(c["rflags"])).replace("ZFLAGS", lua_flags(c["flags"]))
    lines = t.run(GC, lua, timeout=120)
    pins, grids, pct = {}, {"G": {}, "R": {}}, {}
    for ln in lines:
        k, _, rest = ln.partition(" ")
        if k in ("P0", "P1", "P2", "P3"):
            pins[k] = [int(x) for x in rest.split(",")]
        elif k in ("G", "R"):
            y, row = rest.split(" ", 1)
            grids[k][int(y)] = [int(float(x)) for x in row.split(",")]
        elif k in ("GPCT", "RPCT"):
            pct[k[0]] = [int(float(x)) for x in rest.split(",")]
    rec = {**c, "pins": pins}
    s0 = state_after(pins["P0"])
    rec["state_before"] = s0
    order = [k for k in ("P0", "P1", "P2", "P3") if k in pins]
    draws = {}
    for a, b in zip(order, order[1:]):
        sa = state_after(pins[a])
        draws[f"{a}->{b}"] = None if sa is None else count_between(sa, pins[b])
    rec["draws"] = draws
    rec["grid"] = [grids["G"][y] for y in sorted(grids["G"])]
    rec["pct"] = pct.get("G")
    if grids["R"]:
        rec["ridged_grid"] = [grids["R"][y] for y in sorted(grids["R"])]
        rec["ridged_pct"] = pct.get("R")
    return rec


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--set", default="all")
    a = p.parse_args()
    t = Tuner(a.host).connect()
    print(t.run(GC, LUA_METHODS)[-1])
    out = HERE / "runs" / f"h3_fractal_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.jsonl"
    for c in cases(a.set):
        rec = run_case(t, c)
        with out.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        g = rec["grid"]
        flat = [v for row in g for v in row]
        print(f"{c['name']}: state {rec['state_before']} draws {rec['draws']} "
              f"grid {len(g)}x{len(g[0]) if g else 0} min {min(flat)} max {max(flat)} pct[0,50,100] "
              f"{rec['pct'][0]},{rec['pct'][50]},{rec['pct'][100]}")
    t.close()
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
