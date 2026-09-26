"""civ6lab b86s0_run — B-86-S0, does a nuclear strike raise the Nuclear
emergency. On the game as it stands (the strike already requested): read
every major's emergencies once, then pass --turns turns by Autoplay (the
seat's AI votes in any special session), reading after each. Per turn and
player, every emergency's EmergencyType (named through `GameInfo.EmergencyAlliances`
index), name, target, TurnsLeft, HasBegun, bSuccess and member ids go to one
jsonl under runs/; a Nuclear entry is printed when it appears.

    python tools/civ6lab/b86s0_run.py --host 127.0.0.3 --turns 15 --tag t225
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

READ = """
local turn = Game.GetCurrentGameTurn()
local em = Game.GetEmergencyManager()
local names = {}
pcall(function() for row in GameInfo.EmergencyAlliances() do names[row.Index] = row.EmergencyType end end)
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() and pl:IsMajor() then
    local ok, t = pcall(function() return em:GetEmergencyInfoTable(p) end)
    if not ok then print('{"turn":' .. turn .. ',"p":' .. p .. ',"err":true}') end
    for i, e in pairs(ok and t or {}) do
      local mem = {}
      for _, m in pairs(e.MemberIDs or {}) do mem[#mem + 1] = tostring(m) end
      print(string.format('{"turn":%d,"p":%d,"i":%s,"type":%s,"typeName":"%s","name":"%s","target":%s,"turnsLeft":%s,"begun":%s,"success":%s,"members":[%s]}',
        turn, p, tostring(i), tostring(e.EmergencyType), tostring(names[e.EmergencyType]), tostring(e.NameText):gsub('"', "'"),
        tostring(e.TargetID), tostring(e.TurnsLeft), tostring(e.HasBegun), tostring(e.bSuccess), table.concat(mem, ",")))
    end
  end
end
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--turns", type=int, default=15)
    p.add_argument("--tag", default="run")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"emergency_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    seen: set[str] = set()

    def read() -> None:
        for ln in t.run(lab.IG, READ, timeout=60):
            fh.write(ln + "\n")
            try:
                r = json.loads(ln)
            except json.JSONDecodeError:
                continue
            key = f"{r.get('typeName')}:{r.get('target')}"
            if key not in seen:
                seen.add(key)
                print(f"  t{r['turn']} new {key} begun {r.get('begun')} left {r.get('turnsLeft')} members {r.get('members')}", flush=True)
        fh.flush()

    read()
    for _ in range(a.turns):
        tn = lab.advance(t, "autoplay", lp, 300.0, lambda s: None)
        print(f"turn {tn}", flush=True)
        read()
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
