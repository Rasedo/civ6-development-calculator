"""civ6lab c60f_bankrupt — C-60, the Free Cities' shortfall. On the game as
it stands (load it first with `h4.py load`): create --units (TYPE:N,...) for
the Free Cities (p62) on free land plots nearest --city, their upkeep the
deficit (the bank is NOT written: a written bank makes a city-state disband
at positive income, `runs/bankrupt_minor2_p9_*`), then end --turns turns in
the endturn mode, reading `c60s4_read.lua` for p62 (the bank, gold yield,
maintenance, every unit; per city amenities, need and the loss to
bankruptcy) after the setup and after each turn. One jsonl under runs/
(`bankrupt_free_<tag>_<stamp>.jsonl`).

    python tools/civ6lab/c60f_bankrupt.py --host 127.0.0.4 --city 69:21 --units UNIT_INFANTRY:4 --turns 6 --tag i4
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import lab  # noqa: E402
import h4  # noqa: E402

HERE = pathlib.Path(__file__).parent

LUA_SETUP = """
local pl = Players[62]
local cx, cy = ZCX, ZCY
local plots = {}
for i = 0, Map.GetPlotCount() - 1 do
  local q = Map.GetPlotByIndex(i)
  local d = Map.GetPlotDistance(cx, cy, q:GetX(), q:GetY())
  if d >= 1 and d <= 5 and not q:IsWater() and not q:IsMountain() and not q:IsImpassable()
     and q:GetUnitCount() == 0 and (q:GetOwner() == 62 or q:GetOwner() == -1) and q:GetDistrictType() < 0 then
    plots[#plots + 1] = {d, q:GetX(), q:GetY()}
  end
end
table.sort(plots, function(a, b) if a[1] ~= b[1] then return a[1] < b[1] end
  if a[2] ~= b[2] then return a[2] < b[2] end return a[3] < b[3] end)
local tr = pl:GetTreasury()
print(string.format('{"kind":"before","balance":%.2f,"goldYield":%.2f,"maintenance":%d}', tr:GetGoldBalance(), tr:GetGoldYield(), tr:GetTotalMaintenance()))
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
print(string.format('{"kind":"after","balance":%.2f,"goldYield":%.2f,"maintenance":%d}', tr:GetGoldBalance(), tr:GetGoldYield(), tr:GetTotalMaintenance()))
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--city", default="69:21")
    p.add_argument("--units", required=True, help="TYPE:N,TYPE:N")
    p.add_argument("--turns", type=int, default=6)
    p.add_argument("--tag", default="arm")
    p.add_argument("--wait", type=float, default=100.0)
    p.add_argument("--deadline", type=float, default=178.0)
    p.add_argument("--nosetup", action="store_true", help="carry on reading turns, no units made")
    a = p.parse_args(argv)
    cx, cy = a.city.split(":")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"bankrupt_free_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(line: str) -> dict:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            r = {"raw": line}
        r = {"tag": a.tag, "units_spec": a.units, **r}
        fh.write(json.dumps(r) + "\n")
        fh.flush()
        return r

    h4.guard(a.deadline, "c60f_bankrupt")
    t = h4.connect(a.host)
    lp = lab.local_player(t)
    if not a.nosetup:
        for ln in t.run(lab.GC, LUA_SETUP.replace("ZCX", cx).replace("ZCY", cy).replace("ZUNITS", a.units), timeout=60):
            rec(ln)
            print("  ", ln, flush=True)
    reader = (HERE / "c60s4_read.lua").read_text(encoding="utf-8").replace("ZSEAT", "62")
    ev = (HERE / "c60f_events.lua").read_text(encoding="utf-8").replace("ZP", "62")
    for ln in t.run(lab.IG, ev.replace("ZMODE", "arm"), timeout=30):
        rec(json.dumps({"kind": "events", "text": ln}))
        print("  ", ln, flush=True)

    def read() -> None:
        for ln in t.run(lab.IG, ev.replace("ZMODE", "read"), timeout=30):
            tn, what, pl, uid, extra = (ln.split(":", 4) + [""] * 5)[:5]
            rec(json.dumps({"kind": "uevent", "turn": tn, "event": what, "player": pl, "id": uid, "extra": extra}))
            if what in ("removed", "killed"):
                print("   EV", ln, flush=True)
        for ln in t.run(lab.IG, reader, timeout=60):
            r = rec(ln)
            if r.get("kind") == "seat":
                print(f"  t{r['turn']} bank {r['balance']} yield {r['goldYield']} maint {r['maintenance']} units {r['nUnits']} {r['units']}",
                      flush=True)
            elif r.get("kind") == "city":
                print(f"      {r.get('name')} amen {r.get('amenities')} need {r.get('need')} lost {r.get('lostBankruptcy')}", flush=True)

    read()
    for _ in range(a.turns):
        lab.advance(t, "endturn", lp, a.wait, lambda s: rec(json.dumps({"kind": "log", "text": s})), one_more_turn=True)
        read()
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
