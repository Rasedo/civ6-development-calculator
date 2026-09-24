"""civ6lab spy_loop — ASK 14: the escape roll's scale, from spies BOUGHT in a
city (a socket-spawned spy crashes the game when its escape ends in capture).

    python tools/civ6lab/spy_loop.py --host 127.0.0.1 --save lab4_t100 --turns 60

Loads the save, grants the seat the four spy civics (and --extra copies of
their grant), sets its gold, then each turn: `spy_turn.lua` (buy a
spy up to --cap, send idle ones to foreign major cities, start --op on the
city centre, take the Technologist promotion), then ends the turn through
`unblock.lua` — which answers every escape prompt with a route the city
offers, rotated by the spy's id, and logs it — and reads the mission history
(`spy_history.lua`). Everything lands in one log under runs/;
`escape_fit.py <log>` reads it.
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import lab  # noqa: E402
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent
GC, IG = lab.GC, lab.IG

# the seat's spy capacity: the four civics that carry CIVIC_GRANT_SPY
# (Civics.xml), plus ZEXTRA more copies of that grant attached directly
SETUP = """
local pl = Players[ZSEAT]
local c = pl:GetCulture()
for _, n in ipairs({"CIVIC_DIPLOMATIC_SERVICE", "CIVIC_NATIONALISM", "CIVIC_IDEOLOGY", "CIVIC_COLD_WAR"}) do
  c:SetCivic(GameInfo.Civics[n].Index, true)
end
for i = 1, ZEXTRA do pl:AttachModifierByID("CIVIC_GRANT_SPY") end
print("setup: four spy civics granted, " .. ZEXTRA .. " extra grants")
"""


def end_turn(t: Tuner, log, wait: float) -> int:
    """Resolve blockers one at a time (each escape is its own prompt) until
    the turn passes."""
    t0 = lab.turn(t)
    unblock = lab.UNBLOCK.read_text(encoding="utf-8")
    deadline = time.monotonic() + wait
    last = 0.0
    while time.monotonic() < deadline:
        if time.monotonic() - last > 3:
            last = time.monotonic()
            try:
                out = t.run(IG, unblock, timeout=30)[-1]
                log(out)
            except TunerError as e:
                log(f"unblock error {e}")
            lab.commemorate_if_blocked(t)
            for msg in lab.unstick(t):
                log(f"unstuck: {msg}")
        time.sleep(0.25)
        try:
            tn = lab.turn(t)
        except TunerError:
            continue
        if tn > t0:
            return tn
    raise TunerError(f"turn did not advance past {t0} within {wait}s")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--save", required=True)
    p.add_argument("--turns", type=int, default=60)
    p.add_argument("--cap", type=int, default=12)
    p.add_argument("--op", default="UNITOPERATION_SPY_FOMENT_UNREST")
    p.add_argument("--gold", type=int, default=50000)
    p.add_argument("--extra", type=int, default=0, help="extra CIVIC_GRANT_SPY copies attached")
    p.add_argument("--wait", type=float, default=300.0)
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"escape_{a.save}_{stamp}.log"
    fh = open(path, "w", encoding="utf-8")

    def log(s: str) -> None:
        fh.write(s + "\n")
        fh.flush()

    game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0))
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    turn_lua = (HERE / "spy_turn.lua").read_text(encoding="utf-8").replace("ZOP", a.op).replace("ZCAP", str(a.cap))
    hist_lua = (HERE / "spy_history.lua").read_text(encoding="utf-8")
    log(f"################ save {a.save} seat {lp} op {a.op} cap {a.cap} extra {a.extra}")
    log(t.run(GC, SETUP.replace("ZSEAT", str(lp)).replace("ZEXTRA", str(a.extra)))[-1])
    for _ in range(a.turns):
        t.run(GC, f"Players[{lp}]:GetTreasury():SetGoldBalance({a.gold})")
        for ln in t.run(IG, turn_lua, timeout=60):
            log(ln)
        tn = end_turn(t, log, a.wait)
        for ln in t.run(IG, hist_lua, timeout=60):
            if ln.startswith(("mission ", "tally ", "turn ")):
                log(ln)
        print(f"{a.save} turn {tn}", flush=True)
    t.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
