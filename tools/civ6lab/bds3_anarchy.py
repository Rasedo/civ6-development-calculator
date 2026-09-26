"""B-D-S3: Anarchy's length, read from the game.

    python tools/civ6lab/bds3_anarchy.py --host 127.0.0.2 --save lab4_t150 --plan GOVERNMENT_X,GOVERNMENT_Y,GOVERNMENT_X --turns 14

Loads the save, unlocks every government for the human seat (GameCore
`UnlockGovernment`), then walks the plan: each step opens the change window
(`SetCivicCompletedThisTurn(true)`), reads `GetAnarchyTurns(g)` for every
government, requests the change as the government screen does
(`RequestChangeGovernment(hash)`, InGame), and ends turns with the seat's own
end-turn (no Autoplay: the AI would pick its own government) until the seat
is out of Anarchy, reading every turn. One JSON line per read:
runs/bds3_anarchy_<stamp>.jsonl.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
PREFIX = (HERE / "lab_json.lua").read_text(encoding="utf-8") + "\n"
READ = PREFIX + (HERE / "bds3_anarchy_read.lua").read_text(encoding="utf-8")

UNLOCK = PREFIX + """
local cu = Players[ZP]:GetCulture()
local out = {}
for g in GameInfo.Governments() do out[g.GovernmentType] = P(function() cu:UnlockGovernment(g.Index) return true end) end
OUT({kind = "unlock", p = ZP, res = out})
"""
OPEN = PREFIX + """
local cu = Players[ZP]:GetCulture()
OUT({kind = "open", p = ZP, call = P(function() cu:SetCivicCompletedThisTurn(true) return true end)})
"""
CHANGE = PREFIX + """
local cu = Players[ZP]:GetCulture()
local g = GameInfo.Governments["ZGOV"]
OUT({kind = "change", p = ZP, gov = "ZGOV", idx = g.Index,
  anarchyTurns = P(function() return cu:GetAnarchyTurns(g.Index) end),
  canChangeAtAll = P(function() return cu:CanChangeGovernmentAtAll() end),
  civicDone = P(function() return cu:CivicCompletedThisTurn() end),
  changeMade = P(function() return cu:GovernmentChangeMade() end),
  request = P(function() return cu:RequestChangeGovernment(g.Hash) end),
  after = {gov = P(function() return cu:GetCurrentGovernment() end), inAnarchy = P(function() return cu:IsInAnarchy() end),
    anarchyEnd = P(function() return cu:GetAnarchyEndTurn() end)}})
"""


def js(lines: list[str]) -> list:
    out = []
    for ln in lines:
        if ln.startswith("{"):
            try:
                out.append(json.loads(ln))
            except json.JSONDecodeError:
                out.append({"raw": ln})
        else:
            out.append({"raw": ln})
    return out


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--save", default="lab4_t150")
    p.add_argument("--plan", required=True)
    p.add_argument("--turns", type=int, default=12, help="most turns to wait per step")
    p.add_argument("--no-load", action="store_true")
    a = p.parse_args(argv)
    if not a.no_load and game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit("load failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"bds3_anarchy_{stamp}.jsonl"
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        def rec(step: str, state: str, lua: str) -> list:
            r = js(t.run(state, lua.replace("ZP", str(lp)), timeout=60))
            fh.write(json.dumps({"step": step, "turn": lab.turn(t), "state": state, "out": r}) + "\n")
            fh.flush()
            return r
        rec("unlock", lab.GC, UNLOCK)
        rec("read0", lab.IG, READ)
        for i, gov in enumerate(a.plan.split(",")):
            rec(f"open{i}", lab.GC, OPEN)
            rec(f"pre{i}", lab.IG, READ)
            ch = rec(f"change{i}:{gov}", lab.IG, CHANGE.replace("ZGOV", gov))
            print(i, gov, json.dumps(ch)[:400], flush=True)
            for k in range(a.turns):
                lab.advance(t, "endturn", lp, 600.0)
                r = rec(f"wait{i}", lab.IG, READ)
                me = [x for x in r if x.get("p") == lp]
                if me:
                    print(f"   turn {lab.turn(t)} gov {me[0]['gov']} anarchy {me[0]['inAnarchy']} end {me[0]['anarchyEnd']}", flush=True)
                if me and me[0]["inAnarchy"] is False and k >= 1:
                    break
    t.close()
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
