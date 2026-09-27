"""C-60 (lab, host 4): a city-state's FIRST insolvent turn, one arm per call.
Loads --save, sets the minor --seat's bank to --gold, creates --units
(TYPE:N,...) for it on the nearest free land plots it owns or nobody owns,
reads every unit of the seat (id, type, plot, plot owner, the row's
Maintenance) and its treasury, arms a UnitRemovedFromMap listener
(`c60m_removed.lua`), burns --burn draws, ends --turns turns (endturn), and
after each reads the removals in order, the units and the treasury. One
jsonl per call (`bankrupt_minor2_<tag>_<stamp>.jsonl`), one deadline.

    python tools/civ6lab/c60m_run.py --seat 9 --units UNIT_MUSKETMAN:2 --tag p9_m2
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import lab  # noqa: E402
import c60t_minor_run  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG

LUA_UNITS = """
local pl = Players[ZSEAT]
local tr = pl:GetTreasury()
local cap = nil
for _, c in pl:GetCities():Members() do if cap == nil then cap = c end end
for _, u in pl:GetUnits():Members() do
  local d = GameInfo.Units[u:GetType()]
  local q = Map.GetPlot(u:GetX(), u:GetY())
  print(string.format('{"kind":"unit","turn":%d,"id":%d,"type":"%s","x":%d,"y":%d,"plotOwner":%d,"dist":%d,"maint":%d,"dmg":%d,"class":"%s"}',
    Game.GetCurrentGameTurn(), u:GetID(), d.UnitType, u:GetX(), u:GetY(), q and q:GetOwner() or -9,
    cap and Map.GetPlotDistance(cap:GetX(), cap:GetY(), u:GetX(), u:GetY()) or -1, d.Maintenance or -1, u:GetDamage(),
    tostring(d.FormationClass)))
end
print(string.format('{"kind":"treasury","turn":%d,"balance":%.3f,"goldYield":%.3f,"maintenance":%.3f}', Game.GetCurrentGameTurn(),
  tr:GetGoldBalance(), tr:GetGoldYield(), tr:GetTotalMaintenance()))
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--save", default="lab4_t100")
    p.add_argument("--seat", type=int, required=True)
    p.add_argument("--gold", type=int, default=0, help="the bank set before the turn; -1 leaves the game's own (and places no units)")
    p.add_argument("--units", default="")
    p.add_argument("--turns", type=int, default=1)
    p.add_argument("--burn", type=int, default=0)
    p.add_argument("--noload", action="store_true")
    p.add_argument("--tag", default="arm")
    p.add_argument("--wait", type=float, default=100.0)
    p.add_argument("--deadline", type=float, default=178.0)
    a = p.parse_args(argv)
    h4.guard(a.deadline, "c60m_run")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"bankrupt_minor2_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(obj) -> dict:
        r = obj if isinstance(obj, dict) else (json.loads(obj) if obj.startswith("{") else {"raw": obj})
        r = {"tag": a.tag, "seat": a.seat, "units_spec": a.units, "gold": a.gold, "burn": a.burn, **r}
        fh.write(json.dumps(r) + "\n")
        fh.flush()
        return r

    if not a.noload:
        ns = argparse.Namespace(host=a.host, name=a.save, deadline=a.deadline, t0=time.monotonic())
        if h4.load_start(ns) != 0:
            raise SystemExit("load failed")
        time.sleep(4.0)
        if h4.load_wait(ns) != 0:
            raise SystemExit("load did not reach the game")
    t = h4.connect(a.host)
    if a.gold >= 0:
        setup = (c60t_minor_run.LUA_SETUP.replace("ZGOLD", str(a.gold)).replace("ZUNITS", a.units or "UNIT_WARRIOR:0")
                 .replace("ZSEAT", str(a.seat)))
        for ln in t.run(GC, setup, timeout=60):
            rec(ln)
    rd = LUA_UNITS.replace("ZSEAT", str(a.seat))

    def read(label: str) -> list[dict]:
        rows = [rec({**json.loads(ln), "when": label}) for ln in t.run(GC, rd, timeout=30)]
        tr = rows[-1]
        units = [r for r in rows if r["kind"] == "unit"]
        upkeep = sum(r["maint"] for r in units)
        print(f"  [{label}] t{tr['turn']} bank {tr['balance']} yield {tr['goldYield']} maint {tr['maintenance']}"
              f" units {len(units)} (row upkeep {upkeep})", flush=True)
        return units

    before = read("setup")
    ev = (HERE / "c60m_removed.lua").read_text(encoding="utf-8").replace("ZSEAT", str(a.seat))
    rec({"kind": "events", "text": t.run(IG, ev.replace("ZMODE", "arm"))[-1]})
    # every player's unit placements, to see where a removed unit reappears
    ue = (HERE / "unit_events.lua").read_text(encoding="utf-8").replace("ZP", "-1").replace("ZSRC", "Events") \
        .replace("ZCLEAR", "1")
    t.run(IG, "LAB_UNIT_ARMED = nil LAB_UNIT_LOG = {}")
    rec({"kind": "unit_events", "text": t.run(IG, ue.replace("ZMODE", "arm"))[-1]})
    spots = {(r["x"], r["y"]) for r in before}
    if a.burn:
        rec(t.run(GC, f"for i = 1, {a.burn} do Game.GetRandNum(100, 'lab') end "
                      f"print('{{\"kind\":\"burnt\",\"seed\":' .. Game.GetRandomSeed() .. '}}')")[-1])
    ids = {r["id"]: r for r in before}
    for k in range(a.turns):
        lab.advance(t, "endturn", 0, a.wait, lambda s: rec({"kind": "log", "text": s}))
        out = t.run(IG, ev.replace("ZMODE", "read"))
        order = []
        for ln in out[1:]:
            tn, pl, uid = ln.split(":")
            order.append(int(uid))
            rec({"kind": "removed", "turn": int(tn), "player": int(pl), "id": int(uid),
                 "type": ids.get(int(uid), {}).get("type"), "maint": ids.get(int(uid), {}).get("maint")})
        for ln in t.run(IG, ue.replace("ZMODE", "read"), timeout=30)[1:]:
            tn, what, pl, uid, x, y = ln.split(":")
            if what == "add" and (int(x), int(y)) in spots:
                r = rec({"kind": "added_on_a_minor_unit_plot", "turn": int(tn), "player": int(pl), "id": int(uid),
                         "x": int(x), "y": int(y)})
                print(f"    added p{pl} {uid} at {x}:{y}", flush=True)
        after = read(f"turn{k + 1}")
        gone = [f"{ids[i]['type']}({ids[i]['maint']})" for i in order if i in ids]
        print(f"    removed in order: {gone}", flush=True)
        ids.update({r["id"]: r for r in after})
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
