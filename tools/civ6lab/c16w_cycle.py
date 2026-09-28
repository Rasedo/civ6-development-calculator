"""C-16-S1 (lab, host 4): seat 0's spies against ONE city guarded by an AI
seat's counterspy that the AI would otherwise reassign. Per turn:

1. seat 0 local: gold set, `c16w_turn.lua` (buy up to --cap, travel to the
   target city, start --op on the guarded district), `unblock.lua` until no
   blocker is named (each escape prompt answered and logged with route,
   level and pursuer);
2. seat 0's end of turn requested; the moment the defender --dp's turn reads
   active (GameCore `IsTurnActive`, polled every 20 ms) it is made local
   (`SetLocalPlayerAndObserver`), so its AI never plays it: its counterspy is
   read and, if off its post, posted again (`c16w_def.lua`); the defender
   ends its turn as a human would; seat 0 is made local again;
3. the turn change is awaited (`lab.wait_turn`), and `spy_history.lua` logs
   the completed missions.

Everything appends to --log (`escape_fit.py` reads it). One deadline per call.

    python tools/civ6lab/c16w_cycle.py --log tools/civ6lab/runs/escape_cs_c16w_guard3.log --turns 3 --setup
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import lab  # noqa: E402
import c16w_run  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG
LUA_GRAB = """
if Players[ZOWNER]:IsTurnActive() then
  PlayerManager.SetLocalPlayerAndObserver(ZOWNER)
  print("grabbed")
else
  print("wait")
end
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
    p.add_argument("--post", help="the plot the defender's counterspy guards (default: --district)")
    p.add_argument("--gold", type=int, default=50000)
    p.add_argument("--wait", type=float, default=120.0)
    p.add_argument("--deadline", type=float, default=178.0)
    p.add_argument("--lazy", action="store_true",
                   help="grab the defender only on a turn its post read off (the seat-0 defender line)")
    a = p.parse_args(argv)
    h4.guard(a.deadline, "c16w_cycle")
    fh = open(a.log, "a", encoding="utf-8", newline="\n")

    def log(s: str) -> None:
        fh.write(s + "\n")
        fh.flush()

    cx, cy = a.city.split(":")
    dx, dy = a.district.split(":")
    dp, did = a.defender.split(":")
    t = h4.connect(a.host)
    turn_lua = (HERE / "c16w_turn.lua").read_text(encoding="utf-8")
    for k, v in (("ZOP", a.op), ("ZCAP", str(a.cap)), ("ZCX", cx), ("ZCY", cy), ("ZDX", dx), ("ZDY", dy),
                 ("ZDP", dp), ("ZDEF", did)):
        turn_lua = turn_lua.replace(k, v)
    hist_lua = (HERE / "spy_history.lua").read_text(encoding="utf-8")
    unblock = lab._seat(lab.UNBLOCK.read_text(encoding="utf-8"), 0)
    blocker = lab._seat(lab.LUA_BLOCKER, 0)
    unblock_d = lab._seat(lab.UNBLOCK.read_text(encoding="utf-8"), int(a.defender.split(":")[0]))
    blocker_d = lab._seat(lab.LUA_BLOCKER, int(a.defender.split(":")[0]))
    gcfix = lab._seat((HERE / "c16n_gcfix.lua").read_text(encoding="utf-8"), int(a.defender.split(":")[0]))
    px, py = (a.post or a.district).split(":")
    defl = (HERE / "c16w_def.lua").read_text(encoding="utf-8").replace("ZID", did).replace("ZDX", px).replace("ZDY", py)
    grab = LUA_GRAB.replace("ZOWNER", dp)
    if a.setup:
        log(f"################ c16w cycle seat 0 op {a.op} cap {a.cap} extra {a.extra} city {a.city} district {a.district} post {a.post or a.district} defender {a.defender}")
        log(t.run(GC, c16w_run.SETUP.replace("ZEXTRA", str(a.extra)))[-1])
    for _ in range(a.turns):
        t0 = lab.turn(t)
        t.run(GC, f"Players[0]:GetTreasury():SetGoldBalance({a.gold})")
        posted = False
        for ln in t.run(IG, turn_lua, timeout=40):
            log(ln)
            if ln.startswith("defender ") and "UNITOPERATION_SPY_COUNTERSPY" in ln:
                posted = True
        seen: set[str] = set()
        for _ in range(12):
            name = t.run(IG, blocker)[-1].split()[-1]
            if name == "none" or (name in seen and name != "ENDTURN_BLOCKING_SPY_CHOOSE_ESCAPE_ROUTE"):
                break
            seen.add(name)
            log("    unblock: " + t.run(IG, unblock, timeout=30)[-1])
        for cause in lab.diagnose(t, 0):
            if cause[0] == "popup":
                log(f"    popup {cause[1]} -> {lab.handle(t, 0, cause)}")
        t.run(IG, lab.LUA_ENDTURN)
        got = False
        end = time.monotonic() + (0 if a.lazy and posted else 60)
        while time.monotonic() < end:
            if t.run(GC, grab)[-1] == "grabbed":
                got = True
                break
            if lab.turn(t) != t0:
                break
            time.sleep(0.02)
        if got:
            try:
                # the UI state follows the switch a moment later: nothing is
                # asked or ended as the grabbed seat before it reads local
                for _ in range(50):
                    if t.run(IG, "print(Game.GetLocalPlayer())")[-1] == dp:
                        break
                    time.sleep(0.1)
                d0 = t.run(IG, defl.replace("ZMODE", "read"))[-1]
                log(f"    grabbed p{dp}: {d0}")
                if "UNITOPERATION_SPY_COUNTERSPY" not in d0 and "nospy" not in d0:
                    log("    repost: " + t.run(IG, defl.replace("ZMODE", "post"))[-1])
                    time.sleep(1.0)
                    log("    after: " + t.run(IG, defl.replace("ZMODE", "read"))[-1])
                # the grabbed seat answers its own blockers (a civic, a
                # research) or its end of turn is refused and the turn stands
                log("    " + t.run(GC, gcfix)[-1])
                seen_d: set[str] = set()
                for _ in range(8):
                    name = t.run(IG, blocker_d)[-1].split()[-1]
                    if name == "none" or name in seen_d:
                        break
                    seen_d.add(name)
                    log(f"    p{dp} unblock: " + t.run(IG, unblock_d, timeout=30)[-1])
                t.run(IG, lab.LUA_ENDTURN)
                time.sleep(0.5)
            finally:
                t.run(GC, "PlayerManager.SetLocalPlayerAndObserver(0)")
        elif a.lazy and posted:
            log(f"    post standing; p{dp} not grabbed")
        else:
            log(f"    no grab of p{dp} this turn")
        tn = lab.wait_turn(t, t0, 0, a.wait, log, first=3.0)
        for ln in t.run(IG, hist_lua, timeout=40):
            if ln.startswith(("mission ", "tally ", "turn ")):
                log(ln)
        print(f"turn {tn} grabbed={got}", flush=True)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
