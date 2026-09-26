"""civ6lab spy_loop — ASK 14: the escape roll's scale, from spies BOUGHT in a
city (a socket-spawned spy crashes the game when its escape ends in capture).

    python tools/civ6lab/spy_loop.py --host 127.0.0.1 --save lab4_t100 --turns 60

Loads the save, grants the seat the four spy civics (and --extra copies of
their grant), sets its gold, then each turn: `spy_turn.lua` (buy a
spy up to --cap, send idle ones to foreign major cities, start --op on the
city centre, take the Technologist promotion), then ends the turn through
`lab.advance` in the endturn mode — `unblock.lua` answers every escape
prompt with a route the city offers, rotated by the spy's id, and the answer
is logged — and reads the mission history (`spy_history.lua`). At the target
`--at-end` exits to the main menu (default), closes the instance or stays.
Everything lands in one log under runs/; `escape_fit.py <log>` reads it.
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
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
    p.add_argument("--at-end", choices=game.AT_END, default="menu",
                   help="at the target: exit to the main menu, close the instance, or stay")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"escape_{a.save}_{stamp}.log"
    fh = open(path, "w", encoding="utf-8")

    def log(s: str) -> None:
        fh.write(s + "\n")
        fh.flush()

    if game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
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
        # each blocker is answered as it comes (each escape is its own
        # prompt), and the end of turn requested again after each answer
        tn = lab.advance(t, "endturn", lp, a.wait, log)
        for ln in t.run(IG, hist_lua, timeout=60):
            if ln.startswith(("mission ", "tally ", "turn ")):
                log(ln)
        print(f"{a.save} turn {tn}", flush=True)
    # the seat holds its turn at the target until `finish` acts
    print("   ", game.finish(t, a.host, a.at_end), flush=True)
    if a.at_end != "close":
        t.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
