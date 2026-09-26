"""civ6lab volcano_own — C-41-S1: an eruption's damage rows on OWNED and
UNOWNED ring plots, read in the same turn.

    python tools/civ6lab/volcano_own.py --host 127.0.0.1 --repeats 3

On the loaded save, for every volcano and each severity, `--repeats` times:
reset the ring to its first-seen baseline (`volcano_scene`'s reset: features,
resources, Volcanic Soil lifted), lay a Farm on every flat bare land plot and
a Mine on every bare hill UNDER THE PLOT'S OWN OWNER (-1 when unowned), fire
the eruption, and read the ring at once (no turn passes; the eruptions run
on one continuing random stream, so repeats are independent). Per ring plot:
owner, city, feature, resource and its class, improvement and its pillage,
district and its pillage, before and now, and the InGame yields now.
One JSONL row per ring plot per eruption: runs/volcano_own_<stamp>.jsonl.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402
import volcano_scene as vs  # noqa: E402

GC, IG = lab.GC, lab.IG

LUA_RING = """
local vx, vy = VX, VY
for d = 0, 5 do
  local p = Map.GetAdjacentPlot(vx, vy, d)
  if p then
    local f, r, im, di = p:GetFeatureType(), p:GetResourceType(), p:GetImprovementType(), p:GetDistrictType()
    local cls = r >= 0 and GameInfo.Resources[r].ResourceClassType or "-"
    local dp = "false"
    if di >= 0 then
      local ok, v = pcall(function() return CityManager.GetDistrictAt(p):IsPillaged() end)
      dp = ok and tostring(v) or "\\"err\\""
    end
    local iown = "null"
    if im >= 0 then
      local ok, v = pcall(function() return p:GetImprovementOwner() end)
      iown = (ok and type(v) == "number") and tostring(v) or "\\"err\\""
    end
    print("{\\"i\\":" .. p:GetIndex() .. ",\\"water\\":" .. tostring(p:IsWater()) .. ",\\"hills\\":" .. tostring(p:IsHills())
      .. ",\\"mountain\\":" .. tostring(p:IsMountain()) .. ",\\"owner\\":" .. p:GetOwner()
      .. ",\\"f\\":\\"" .. (f >= 0 and GameInfo.Features[f].FeatureType or "-") .. "\\""
      .. ",\\"r\\":\\"" .. (r >= 0 and GameInfo.Resources[r].ResourceType or "-") .. "\\",\\"rc\\":\\"" .. cls .. "\\""
      .. ",\\"im\\":\\"" .. (im >= 0 and GameInfo.Improvements[im].ImprovementType or "-") .. "\\""
      .. ",\\"pil\\":" .. tostring(im >= 0 and p:IsImprovementPillaged())
      .. ",\\"iown\\":" .. iown
      .. ",\\"d\\":\\"" .. (di >= 0 and GameInfo.Districts[di].DistrictType or "-") .. "\\""
      .. ",\\"dpil\\":" .. dp .. "}")
  end
end
"""

LUA_YIELDS = """
local out = {}
for d = 0, 5 do
  local p = Map.GetAdjacentPlot(VX, VY, d)
  if p then
    local ys = {}
    for y = 0, 5 do ys[#ys + 1] = tostring(p:GetYield(y)) end
    out[#out + 1] = p:GetIndex() .. ":" .. table.concat(ys, ",")
  end
end
print(table.concat(out, " "))
"""

LUA_RESET = """
local p = Map.GetPlotByIndex(PI)
local f = "BF"
TerrainBuilder.SetFeatureType(p, f ~= "-" and GameInfo.Features[f].Index or -1)
local r = "BR"
if r ~= "-" then ResourceBuilder.SetResourceType(p, GameInfo.Resources[r].Index, 1)
else ResourceBuilder.SetResourceType(p, -1) end
ImprovementBuilder.SetImprovementType(p, -1)
local imp = "IMP"
if imp ~= "-" then ImprovementBuilder.SetImprovementType(p, GameInfo.Improvements[imp].Index, IOWN) end
print("ok")
"""


def ring(t: Tuner, vx: int, vy: int) -> list[dict]:
    return [json.loads(x) for x in t.run(GC, LUA_RING.replace("VX", str(vx)).replace("VY", str(vy)))
            if x.startswith("{")]


def yields(t: Tuner, vx: int, vy: int) -> dict[int, list[str]]:
    out = t.run(IG, LUA_YIELDS.replace("VX", str(vx)).replace("VY", str(vy)))
    res = {}
    for tok in (out[-1] if out else "").split():
        i, ys = tok.split(":")
        res[int(i)] = ys.split(",")
    return res


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--repeats", type=int, default=3)
    p.add_argument("--imp-owner", choices=("plot", "swap"), default="plot",
                   help="lay each improvement under the plot's owner, or swapped: none on an owned plot, "
                        "player 0 on an unowned one")
    p.add_argument("--wetlands", action="store_true",
                   help="set Marsh on every second bare flat plot and Oasis on every third, instead of an improvement")
    a = p.parse_args(argv)
    iown = "p:GetOwner()" if a.imp_owner == "plot" else "(p:GetOwner() >= 0 and -1 or 0)"
    t = Tuner(a.host).connect()
    erupt = (pathlib.Path(__file__).parent / "volcano_erupt.lua").read_text(encoding="utf-8")
    volcanoes = [tuple(map(int, ln.split())) for ln in t.run(GC, vs.LUA_LIST) if ln.strip()]
    print(f"{len(volcanoes)} volcanoes", flush=True)
    base = {v: ring(t, *v) for v in volcanoes}
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"volcano_own_{stamp}.jsonl"
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for rep in range(a.repeats):
            for sev in vs.SEVERITIES:
                for v in volcanoes:
                    for k, pl in enumerate(base[v]):
                        if pl["water"] or pl["mountain"] or pl["d"] != "-":
                            continue
                        f = "-" if pl["f"] == "FEATURE_VOLCANIC_SOIL" else pl["f"]
                        imp = "-"
                        if f == "-" and pl["r"] == "-":
                            imp = "IMPROVEMENT_MINE" if pl["hills"] else "IMPROVEMENT_FARM"
                            if a.wetlands and not pl["hills"] and k % 3 == 0:
                                f, imp = "FEATURE_OASIS", "-"
                            elif a.wetlands and not pl["hills"] and k % 2 == 0:
                                f, imp = "FEATURE_MARSH", "-"
                        t.run(GC, LUA_RESET.replace("PI", str(pl["i"])).replace("BF", f)
                              .replace("BR", pl["r"]).replace("IMP", imp).replace("IOWN", iown))
                    before = {x["i"]: x for x in ring(t, *v)}
                    yb = yields(t, *v)
                    res = t.run(GC, erupt.replace("EVENT", sev).replace("VX", str(v[0])).replace("VY", str(v[1])))
                    now = {x["i"]: x for x in ring(t, *v)}
                    yn = yields(t, *v)
                    for i, b in before.items():
                        fh.write(json.dumps({"rep": rep, "sev": sev, "volcano": v, "applied": res[-1] if res else "",
                                             "before": b, "now": now.get(i), "yBefore": yb.get(i),
                                             "yNow": yn.get(i)}) + "\n")
                    fh.flush()
                    owned = sum(1 for b in before.values() if b["owner"] >= 0 and not b["water"])
                    print(f"{rep} {sev.split('_')[-1]} at {v}: ring {len(before)}, owned {owned}", flush=True)
    print("->", out.name)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
