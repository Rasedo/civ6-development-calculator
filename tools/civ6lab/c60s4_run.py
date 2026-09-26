"""civ6lab c60s4_run — C-60-S4, bankruptcy over the turns of insolvency.
Load --save, set seat 0's bank to --gold, create --units (TYPE:N,...) for
seat 0 on distinct free land plots nearest its capital (their maintenance is
the deficit), then end --turns turns in the endturn mode, reading
`c60s4_read.lua` (the bank, gold yield, maintenance, the blocker, every unit,
every city's amenities, need and loss to bankruptcy) after the setup and
after each turn. One jsonl under runs/.

    python tools/civ6lab/c60s4_run.py --host 127.0.0.3 --units UNIT_MUSKETMAN:4 --turns 10 --tag m5
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
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent

LUA_SETUP = """
local pl = Players[0]
pl:GetTreasury():SetGoldBalance(ZGOLD)
local cap = pl:GetCities():GetCapitalCity()
local cx, cy = cap:GetX(), cap:GetY()
local plots = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY())
  if d >= 1 and d <= 6 and not q:IsWater() and not q:IsMountain() and not q:IsImpassable()
     and q:GetUnitCount() == 0 and (q:GetOwner() == 0 or q:GetOwner() == -1) and q:GetDistrictType() < 0 then
    plots[#plots + 1] = {d, q:GetX(), q:GetY()}
  end
end
table.sort(plots, function(a, b) if a[1] ~= b[1] then return a[1] < b[1] end
  if a[2] ~= b[2] then return a[2] < b[2] end return a[3] < b[3] end)
local k = 1
for spec in string.gmatch("ZUNITS", "[^,]+") do
  local name, n = spec:match("([%w_]+):(%d+)")
  for i = 1, tonumber(n) do
    local made = nil
    while made == nil and k <= #plots do
      made = pl:GetUnits():Create(GameInfo.Units[name].Index, plots[k][2], plots[k][3])
      k = k + 1
    end
    print(string.format('{"kind":"made","type":"%s","id":%d,"x":%d,"y":%d}', name, made and made:GetID() or -1,
      made and made:GetX() or -1, made and made:GetY() or -1))
  end
end
print(string.format('{"kind":"bank","balance":%.2f}', pl:GetTreasury():GetGoldBalance()))
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--save", default="lab4_t100")
    p.add_argument("--gold", type=int, default=0)
    p.add_argument("--units", required=True, help="TYPE:N,TYPE:N")
    p.add_argument("--turns", type=int, default=10)
    p.add_argument("--tag", default="arm")
    p.add_argument("--wait", type=float, default=300.0)
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"bankrupt_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(line: str) -> None:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            r = {"raw": line}
        fh.write(json.dumps({"tag": a.tag, "units_spec": a.units, **r}) + "\n")
        fh.flush()

    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    for ln in t.run(lab.GC, LUA_SETUP.replace("ZGOLD", str(a.gold)).replace("ZUNITS", a.units), timeout=60):
        rec(ln)
    reader = (HERE / "c60s4_read.lua").read_text(encoding="utf-8").replace("ZSEAT", str(lp))

    def read() -> None:
        for ln in t.run(lab.IG, reader, timeout=60):
            rec(ln)
            if '"seat"' in ln:
                r = json.loads(ln)
                print(f"  t{r['turn']} bank {r['balance']} yield {r['goldYield']} maint {r['maintenance']} units {r['nUnits']}",
                      flush=True)
            elif '"city"' in ln:
                r = json.loads(ln)
                print(f"      {r['name'][14:]} amen {r['amenities']} need {r['need']} lost {r['lostBankruptcy']}", flush=True)

    read()
    for _ in range(a.turns):
        lab.advance(t, "endturn", lp, a.wait, lambda s: rec(json.dumps({"kind": "log", "text": s})))
        read()
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
