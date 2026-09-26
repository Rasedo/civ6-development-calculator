"""civ6lab b86s1_run — B-86-S1, where the lost Nuclear emergency's -1 lands.
On the game as it stands (an emergency against --target running, e.g. the
`b86s0_nuclear_t244` save): each turn the target city --keep is kept alive
(its centre's garrison and outer pools healed to 0 damage and every unit of
the target within 2 healed, GameCore), then one turn passes. Once the
emergency's TurnsLeft is at most --read-from, and for --after turns after it
has left the table, `b86s1_read.lua` (the emergency row and every major-city
pressure source within 9 of every city) goes to one jsonl under runs/.
--rig R refills and heals seat-0 units on every free plot within R of the
kept city each turn (`c60s3_rig.lua`), and --advance endturn (the default)
keeps the seat's AI from walking them away.

    python tools/civ6lab/b86s1_run.py --host 127.0.0.3 --keep 36,46 --rig 2 --read-from 3 --after 3
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

HERE = pathlib.Path(__file__).parent
HEAL = """
local c = CityManager.GetCityAt(ZX, ZY)
if c == nil or c:GetOwner() ~= ZTARGET then print("lost " .. tostring(c and c:GetOwner())) return end
local d = c:GetDistricts():GetDistrictByType(GameInfo.Districts["DISTRICT_CITY_CENTER"].Index)
d:SetDamage(DefenseTypes.DISTRICT_GARRISON, 0)
d:SetDamage(DefenseTypes.DISTRICT_OUTER, 0)
local n = 0
for _, u in Players[ZTARGET]:GetUnits():Members() do
  if u:GetX() >= 0 and Map.GetPlotDistance(ZX, ZY, u:GetX(), u:GetY()) <= 2 and u:GetDamage() > 0 then u:SetDamage(0); n = n + 1 end
end
print("kept, units healed " .. n)
"""
LEFT = """
local t = Game.GetEmergencyManager():GetEmergencyInfoTable(ZTARGET)
for _, e in pairs(t or {}) do
  if tostring(e.NameText) == "LOC_EMERGENCY_NAME_NUCLEAR" then print(tostring(e.TurnsLeft) .. " " .. tostring(e.bSuccess)) return end
end
print("none")
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--target", type=int, default=0)
    p.add_argument("--keep", default="36,46")
    p.add_argument("--read-from", type=int, default=3)
    p.add_argument("--after", type=int, default=3)
    p.add_argument("--max-turns", type=int, default=60)
    p.add_argument("--advance", choices=("autoplay", "endturn"), default="endturn",
                   help="endturn keeps the seat's AI from walking the rig away")
    p.add_argument("--rig", type=int, default=0,
                   help="fill every free plot within R of the kept city with seat-0 units and heal them, each turn (c60s3_rig.lua)")
    a = p.parse_args(argv)
    x, y = a.keep.split(",")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"emergency_loyalty_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    heal = HEAL.replace("ZX", x).replace("ZY", y).replace("ZTARGET", str(a.target))
    rig = ((HERE / "c60s3_rig.lua").read_text(encoding="utf-8").replace("ZMODE", "rig")
           .replace("ZX", x).replace("ZY", y).replace("ZR", str(a.rig)))
    left_lua = LEFT.replace("ZTARGET", str(a.target))
    reader = (HERE / "b86s1_read.lua").read_text(encoding="utf-8").replace("ZTARGET", str(a.target))
    after = None
    for _ in range(a.max_turns):
        left = t.run(lab.IG, left_lua)[-1]
        kept = t.run(lab.GC, heal)[-1]
        if a.rig > 0 and not kept.startswith("lost"):
            made = sum(1 for ln in t.run(lab.GC, rig, timeout=60) if "\"made\":\"UNIT_" in ln)
            kept += f", rig refilled {made}"
        tn = lab.turn(t)
        print(f"t{tn} emergency {left} | {kept}", flush=True)
        if left == "none":
            after = (after or 0) + 1
        if left == "none" or int(left.split()[0]) <= a.read_from:
            for ln in t.run(lab.IG, reader, timeout=120):
                fh.write(ln + "\n")
            fh.flush()
        if after is not None and after > a.after:
            break
        lab.advance(t, a.advance, lp, 300.0, lambda s: None)
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
