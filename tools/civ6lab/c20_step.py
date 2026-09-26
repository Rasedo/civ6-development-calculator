"""C-20-S1: one configuration of a route. Optionally lays a route type on a
list of plots (GameCore, WorldBuilder.MapManager():SetRouteType) or runs a
GameCore snippet, then reads `trade_path.lua` for the origin against the
destinations, appends the records under --tag and prints the summary.

    python tools/civ6lab/c20_step.py --host 127.0.0.2 --tag rail3 --origin 0:327683 --dest 14:65536 \
        --rail "35:46;34:46;33:45" --out tools/civ6lab/runs/trade_path_X.jsonl
"""
from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402

HERE = pathlib.Path(__file__).parent

LUA_ROUTE = """
local r = ZR
local n = 0
for x, y in string.gmatch("ZPLOTS", "(%d+):(%d+)") do
  local i = Map.GetPlotIndex(tonumber(x), tonumber(y))
  local ok = pcall(function() WorldBuilder.MapManager():SetRouteType(i, r, false) end)
  if ok and Map.GetPlotByIndex(i):GetRouteType() == r then n = n + 1 end
end
print("routes set " .. n)
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.2")
    ap.add_argument("--tag", required=True)
    ap.add_argument("--origin", required=True)
    ap.add_argument("--dest", required=True)
    ap.add_argument("--rail", default="", help="x:y;x:y plots to lay the route on")
    ap.add_argument("--route", default="ROUTE_RAILROAD")
    ap.add_argument("--gc", default="", help="a GameCore Lua file to run first")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    t = Tuner(a.host).connect()
    if a.rail:
        idx = "GameInfo.Routes['%s'].Index" % a.route
        print(" ".join(t.run("GameCore_Tuner", LUA_ROUTE.replace("ZR", idx).replace("ZPLOTS", a.rail))))
    if a.gc:
        print(" ".join(t.run("GameCore_Tuner", pathlib.Path(a.gc).read_text(encoding="utf-8"))))
    lua = (HERE / "trade_path.lua").read_text(encoding="utf-8")
    for k, v in (("ZO", a.origin), ("ZD", a.dest), ("ZTAG", a.tag)):
        lua = lua.replace(k, v)
    recs = t.run("InGame", lua, timeout=120)
    t.close()
    with open(a.out, "a", encoding="utf-8") as f:
        for ln in recs:
            f.write(ln + "\n")
    tmp = HERE / "runs" / "_c20_last.jsonl"
    tmp.write_text("\n".join(recs) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(HERE / "trade_summary.py"), str(tmp)], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
