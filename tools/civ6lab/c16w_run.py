"""C-16-S1 (lab, host 4): seat 0's spies against ONE guarded city, a few
turns per call. Each turn: the seat's gold is set, `c16w_turn.lua` (buy up to
--cap, travel to the target city, start --op on the guarded district, read the
defender's post), the turn ends through `lab.advance` (endturn; `unblock.lua`
answers each escape prompt and logs route, level and pursuer), and
`spy_history.lua` logs the completed missions. `--setup` grants the four spy
civics and --extra CIVIC_GRANT_SPY copies first. Everything appends to --log
(`escape_fit.py` reads it). One wall-clock deadline per call.

    python tools/civ6lab/c16w_run.py --log tools/civ6lab/runs/escape_cs_c16w_X.log --turns 3 --setup
"""
from __future__ import annotations

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG

SETUP = """
local pl = Players[0]
local c = pl:GetCulture()
for _, n in ipairs({"CIVIC_DIPLOMATIC_SERVICE", "CIVIC_NATIONALISM", "CIVIC_IDEOLOGY", "CIVIC_COLD_WAR"}) do
  c:SetCivic(GameInfo.Civics[n].Index, true)
end
for i = 1, ZEXTRA do pl:AttachModifierByID("CIVIC_GRANT_SPY") end
print("setup: four spy civics granted, " .. ZEXTRA .. " extra grants")
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--log", required=True)
    p.add_argument("--turns", type=int, default=3)
    p.add_argument("--setup", action="store_true")
    p.add_argument("--extra", type=int, default=8)
    p.add_argument("--cap", type=int, default=12)
    p.add_argument("--op", default="UNITOPERATION_SPY_SIPHON_FUNDS")
    p.add_argument("--city", default="54:11")
    p.add_argument("--district", default="54:10")
    p.add_argument("--defender", default="1:7471106")
    p.add_argument("--gold", type=int, default=50000)
    p.add_argument("--wait", type=float, default=140.0)
    p.add_argument("--deadline", type=float, default=178.0)
    a = p.parse_args(argv)
    h4.guard(a.deadline, "c16w_run")
    fh = open(a.log, "a", encoding="utf-8", newline="\n")

    def log(s: str) -> None:
        fh.write(s + "\n")
        fh.flush()

    cx, cy = a.city.split(":")
    dx, dy = a.district.split(":")
    dp, did = a.defender.split(":")
    t = h4.connect(a.host)
    lp = 0
    turn_lua = (HERE / "c16w_turn.lua").read_text(encoding="utf-8")
    for k, v in (("ZOP", a.op), ("ZCAP", str(a.cap)), ("ZCX", cx), ("ZCY", cy), ("ZDX", dx), ("ZDY", dy),
                 ("ZDP", dp), ("ZDEF", did)):
        turn_lua = turn_lua.replace(k, v)
    hist_lua = (HERE / "spy_history.lua").read_text(encoding="utf-8")
    if a.setup:
        log(f"################ c16w seat 0 op {a.op} cap {a.cap} extra {a.extra} city {a.city} district {a.district} defender {a.defender}")
        log(t.run(GC, SETUP.replace("ZEXTRA", str(a.extra)))[-1])
    for _ in range(a.turns):
        t.run(GC, f"Players[0]:GetTreasury():SetGoldBalance({a.gold})")
        for ln in t.run(IG, turn_lua, timeout=40):
            log(ln)
            if ln.startswith(("defender", "turn ")):
                print(ln, flush=True)
        tn = lab.advance(t, "endturn", lp, a.wait, log)
        for ln in t.run(IG, hist_lua, timeout=40):
            if ln.startswith(("mission ", "tally ", "turn ")):
                log(ln)
        print(f"turn {tn}", flush=True)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
