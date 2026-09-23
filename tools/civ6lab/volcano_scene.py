"""civ6lab volcano_scene — AUDIT C-41, what an eruption PAINTS, by severity.

    python tools/civ6lab/volcano_scene.py --host 127.0.0.2 --repeats 2

For every volcano on the map and each severity (GENTLE, CATASTROPHIC,
MEGACOLOSSAL), `--repeats` times:
  1. reset the volcano's ring (distance 1) to its first-seen baseline —
     features and resources restored, Volcanic Soil lifted — and lay a Farm on
     every flat featureless land plot and a Mine on every featureless hill, so
     the pillage-or-remove question has improvements to answer it;
  2. fire the named volcano's eruption (`volcano_erupt.lua`'s call);
  3. snapshot the ring right after, and again after one turn passes.
One JSONL row per ring plot per eruption under tools/civ6lab/runs/: the plot
before and after (feature, improvement, pillaged, resource) and the severity.
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

GC = lab.GC
SEVERITIES = ("RANDOM_EVENT_VOLCANO_GENTLE", "RANDOM_EVENT_VOLCANO_CATASTROPHIC",
              "RANDOM_EVENT_VOLCANO_MEGACOLOSSAL")

LUA_LIST = """
for z = 0, MapFeatureManager.GetNumVolcanoes() - 1 do end
for i = 0, Map.GetPlotCount() - 1 do
  local ok, v = pcall(function() return MapFeatureManager.IsVolcano(i) end)
  if ok and v then local p = Map.GetPlotByIndex(i); print(p:GetX() .. " " .. p:GetY()) end
end
"""

# the ring, one JSON object per plot
LUA_RING = """
local vx, vy = VX, VY
for d = 0, 5 do
  local p = Map.GetAdjacentPlot(vx, vy, d)
  if p then
    local f, r, im = p:GetFeatureType(), p:GetResourceType(), p:GetImprovementType()
    print("{\\"i\\":" .. p:GetIndex() .. ",\\"water\\":" .. tostring(p:IsWater()) .. ",\\"hills\\":" .. tostring(p:IsHills())
      .. ",\\"mountain\\":" .. tostring(p:IsMountain())
      .. ",\\"f\\":\\"" .. (f >= 0 and GameInfo.Features[f].FeatureType or "-") .. "\\""
      .. ",\\"r\\":\\"" .. (r >= 0 and GameInfo.Resources[r].ResourceType or "-") .. "\\""
      .. ",\\"im\\":\\"" .. (im >= 0 and GameInfo.Improvements[im].ImprovementType or "-") .. "\\""
      .. ",\\"pil\\":" .. tostring(im >= 0 and p:IsImprovementPillaged()) .. "}")
  end
end
"""

# restore one plot to its baseline and lay the test improvement
LUA_RESET = """
local p = Map.GetPlotByIndex(PI)
local f = "BF"
local fi = f ~= "-" and GameInfo.Features[f].Index or -1
TerrainBuilder.SetFeatureType(p, fi)
local r = "BR"
if r ~= "-" then ResourceBuilder.SetResourceType(p, GameInfo.Resources[r].Index, 1)
else ResourceBuilder.SetResourceType(p, -1) end
ImprovementBuilder.SetImprovementType(p, -1)
local imp = "IMP"
if imp ~= "-" then ImprovementBuilder.SetImprovementType(p, GameInfo.Improvements[imp].Index, -1) end
print("ok")
"""


def ring(t: Tuner, vx: int, vy: int) -> list[dict]:
    return [json.loads(x) for x in t.run(GC, LUA_RING.replace("VX", str(vx)).replace("VY", str(vy)))
            if x.startswith("{")]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.2")
    p.add_argument("--repeats", type=int, default=2)
    a = p.parse_args(argv)
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    erupt = (pathlib.Path(__file__).parent / "volcano_erupt.lua").read_text(encoding="utf-8")
    volcanoes = [tuple(map(int, ln.split())) for ln in t.run(GC, LUA_LIST) if ln.strip()]
    print(f"{len(volcanoes)} volcanoes", flush=True)
    base = {v: ring(t, *v) for v in volcanoes}
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"volcano_{stamp}.jsonl"
    n = 0
    with open(out, "w", encoding="utf-8") as fh:
        for rep in range(a.repeats):
            for sev in SEVERITIES:
                for v in volcanoes:
                    for pl in base[v]:
                        if pl["water"] or pl["mountain"]:
                            continue
                        f = "-" if pl["f"] == "FEATURE_VOLCANIC_SOIL" else pl["f"]
                        imp = "-"
                        if f == "-" and pl["r"] == "-":
                            imp = "IMPROVEMENT_MINE" if pl["hills"] else "IMPROVEMENT_FARM"
                        t.run(GC, LUA_RESET.replace("PI", str(pl["i"])).replace("BF", f)
                              .replace("BR", pl["r"]).replace("IMP", imp))
                    before = {x["i"]: x for x in ring(t, *v)}
                    res = t.run(GC, erupt.replace("EVENT", sev).replace("VX", str(v[0])).replace("VY", str(v[1])))
                    now = {x["i"]: x for x in ring(t, *v)}
                    lab.advance(t, "autoplay", lp, 300.0)
                    later = {x["i"]: x for x in ring(t, *v)}
                    for i, b in before.items():
                        fh.write(json.dumps({"rep": rep, "sev": sev, "volcano": v, "applied": res[-1] if res else "",
                                             "before": b, "now": now.get(i), "later": later.get(i)}) + "\n")
                    n += 1
                    painted = sum(1 for i, b in before.items()
                                  if (later.get(i) or {}).get("f") == "FEATURE_VOLCANIC_SOIL" and not b["water"])
                    print(f"{n}: {sev.split('_')[-1]} at {v}: painted {painted}/{len(before)}", flush=True)
    print("->", out.name)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
