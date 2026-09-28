"""C-16 / C-2 (lab, host 4): seat 0's spies against one city of an AI seat
whose counterspy is held on its post by grabbing that seat EVERY turn, the
grab made synchronous by `c16n_hook.lua` (GameEvents.PlayerTurnStarted makes
the seat local before its AI acts when its LAB_GRAB property is 1 — the
20 ms poll of `c16w_cycle.py` misses an early-game AI turn). Per turn:

1. seat 0: gold set; with --missions, `c16w_turn.lua` (buy up to --cap,
   travel to the target city, start --op on --district); `c2n_watch.lua`
   (the promises seat 0 has made to the defender, its grievances, the
   grievance log); every AI session answered --answer (POSITIVE makes an
   asked promise); `unblock.lua` until no blocker is named;
2. the defender's LAB_GRAB set, seat 0's end of turn requested; once the
   defender reads local: its counterspy read and re-posted on --post when
   off it; `c16n_gcfix.lua` (research / civic set from GameCore, and with
   --hold their progress reset so none completes); its blockers answered;
   its end of turn requested and awaited; seat 0 made local again;
3. the turn change awaited; `spy_history.lua` logs the completed missions.

Everything appends to --log (`c16w_mission_fit.py` / `escape_fit.py` read it;
the `c2 ` lines are C-2's). One deadline per call.

    python tools/civ6lab/c16n_cycle.py --log tools/civ6lab/runs/escape_cs_c16n_l1hub.log --turns 3 \
        --city 66:27 --district 66:28 --post 66:28 --defender 1:262146 --missions --hold
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import lab  # noqa: E402
import promise_loop  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG

LUA_DEF_GC = """
local u = Players[ZDP]:GetUnits():FindID(ZDEF)
if u == nil then print("defender gone") return end
local e = u:GetExperience()
print(string.format("defender %d at %d:%d xp %d canPromote %s", ZDEF, u:GetX(), u:GetY(), e:GetExperiencePoints(), tostring(e:CanPromote())))
"""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--log", required=True)
    p.add_argument("--turns", type=int, default=3)
    p.add_argument("--setup", action="store_true", help="grant seat 0 --extra spy capacity and install the hook")
    p.add_argument("--hook", action="store_true", help="install the hook (once per load)")
    p.add_argument("--extra", type=int, default=8)
    p.add_argument("--cap", type=int, default=12)
    p.add_argument("--op", default="UNITOPERATION_SPY_SIPHON_FUNDS")
    p.add_argument("--city", required=True)
    p.add_argument("--district", required=True)
    p.add_argument("--post", help="the plot the counterspy guards; 'none' leaves it unposted")
    p.add_argument("--defender", required=True)
    p.add_argument("--missions", action="store_true")
    p.add_argument("--hold", action="store_true")
    p.add_argument("--answer", choices=("POSITIVE", "NEGATIVE"), default="POSITIVE")
    p.add_argument("--gold", type=int, default=50000)
    p.add_argument("--wait", type=float, default=100.0)
    p.add_argument("--deadline", type=float, default=178.0)
    a = p.parse_args(argv)
    h4.guard(a.deadline, "c16n_cycle")
    fh = open(a.log, "a", encoding="utf-8", newline="\n")

    def log(s: str) -> None:
        fh.write(s + "\n")
        fh.flush()

    cx, cy = a.city.split(":")
    dx, dy = a.district.split(":")
    dp, did = a.defender.split(":")
    post = a.post or a.district
    px, py = post.split(":") if post != "none" else ("-1", "-1")
    t = h4.connect(a.host)
    turn_lua = (HERE / "c16w_turn.lua").read_text(encoding="utf-8")
    for k, v in (("ZOP", a.op), ("ZCAP", str(a.cap)), ("ZCX", cx), ("ZCY", cy), ("ZDX", dx), ("ZDY", dy),
                 ("ZDP", dp), ("ZDEF", did)):
        turn_lua = turn_lua.replace(k, v)
    hist_lua = (HERE / "spy_history.lua").read_text(encoding="utf-8")
    watch = (HERE / "c2n_watch.lua").read_text(encoding="utf-8").replace("ZA", "0").replace("ZB", dp)
    accept = promise_loop.LUA_ACCEPT.replace("ZANSWER", a.answer).replace("ZSEAT", "0")
    unblock0 = lab._seat(lab.UNBLOCK.read_text(encoding="utf-8"), 0)
    blocker0 = lab._seat(lab.LUA_BLOCKER, 0)
    unblock_d = lab._seat(lab.UNBLOCK.read_text(encoding="utf-8"), int(dp))
    blocker_d = lab._seat(lab.LUA_BLOCKER, int(dp))
    gcfix = lab._seat((HERE / "c16n_gcfix.lua").read_text(encoding="utf-8"), int(dp)).replace("ZHOLD", "1" if a.hold else "0")
    defl = (HERE / "c16w_def.lua").read_text(encoding="utf-8").replace("ZID", did).replace("ZDX", px).replace("ZDY", py)
    def_gc = LUA_DEF_GC.replace("ZDP", dp).replace("ZDEF", did)
    if a.setup:
        log(f"################ c16n cycle op {a.op} cap {a.cap} city {a.city} district {a.district} post {post} "
            f"defender {a.defender} missions {a.missions} hold {a.hold} answer {a.answer}")
        for n in ("CIVIC_DIPLOMATIC_SERVICE", "CIVIC_NATIONALISM", "CIVIC_IDEOLOGY", "CIVIC_COLD_WAR"):
            t.run(GC, f'Players[0]:GetCulture():SetCivic(GameInfo.Civics["{n}"].Index, true)')
        t.run(GC, f'for i = 1, {a.extra} do Players[0]:AttachModifierByID("CIVIC_GRANT_SPY") end')
    if a.setup or a.hook:
        log(t.run(GC, (HERE / "c16n_hook.lua").read_text(encoding="utf-8").replace("ZP", dp))[-1])
    for _ in range(a.turns):
        t0 = lab.turn(t)
        t.run(GC, f"Players[0]:GetTreasury():SetGoldBalance({a.gold})")
        if a.missions:
            for ln in t.run(IG, turn_lua, timeout=40):
                log(ln)
        else:
            log(t.run(GC, def_gc)[-1])
        log(t.run(IG, watch.replace("ZSINCE", str(t0 - 1)))[-1])
        for ln in t.run(IG, accept):
            log("    " + ln)
        seen: set[str] = set()
        for _ in range(12):
            name = t.run(IG, blocker0)[-1].split()[-1]
            if name == "none" or (name in seen and name != "ENDTURN_BLOCKING_SPY_CHOOSE_ESCAPE_ROUTE"):
                break
            seen.add(name)
            log("    unblock: " + t.run(IG, unblock0, timeout=30)[-1])
        for cause in lab.diagnose(t, 0):
            if cause[0] == "popup":
                log(f"    popup {cause[1]} -> {lab.handle(t, 0, cause)}")
        t.run(GC, f'Players[{dp}]:SetProperty("LAB_GRAB", 1)')
        t.run(IG, lab.LUA_ENDTURN)
        got = False
        end = time.monotonic() + 60
        while time.monotonic() < end:
            if t.run(IG, "print(Game.GetLocalPlayer())")[-1] == dp:
                got = True
                break
            if lab.turn(t) != t0:
                break
            time.sleep(0.1)
        if got:
            try:
                d0 = t.run(IG, defl.replace("ZMODE", "read"))[-1]
                log(f"    grabbed p{dp}: {d0}")
                if post != "none" and not (f"at {px}:{py}" in d0 and "UNITOPERATION_SPY_COUNTERSPY" in d0) and "nospy" not in d0:
                    log("    repost: " + t.run(IG, defl.replace("ZMODE", "post"))[-1])
                    time.sleep(1.0)
                    log("    after: " + t.run(IG, defl.replace("ZMODE", "read"))[-1])
                log("    " + t.run(GC, gcfix)[-1])
                seen_d: set[str] = set()
                for _ in range(8):
                    name = t.run(IG, blocker_d)[-1].split()[-1]
                    if name == "none" or name in seen_d:
                        break
                    seen_d.add(name)
                    log(f"    p{dp} unblock: " + t.run(IG, unblock_d, timeout=30)[-1])
                t.run(IG, lab.LUA_ENDTURN)
                end = time.monotonic() + 20
                while time.monotonic() < end:
                    if t.run(GC, f"print(Players[{dp}]:IsTurnActive())")[-1] != "true":
                        break
                    time.sleep(0.25)
                else:
                    log(f"    p{dp} turn still active; blocker " + t.run(IG, blocker_d)[-1].split()[-1])
            finally:
                t.run(GC, "PlayerManager.SetLocalPlayerAndObserver(0)")
        else:
            log(f"    no grab of p{dp} this turn")
        tn = lab.wait_turn(t, t0, 0, a.wait, log, first=3.0, session_lua=accept)
        for ln in t.run(IG, hist_lua, timeout=40):
            if ln.startswith(("mission ", "tally ", "turn ")):
                log(ln)
        print(f"turn {tn} grabbed={got}", flush=True)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
