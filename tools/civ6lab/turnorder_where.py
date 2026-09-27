"""Turn order: in which phase of the turn each event name occurs.

    python tools/civ6lab/turnorder_where.py <record.jsonl> [...] [--ev EV.CityLoyaltyChanged ...]

Walks the GC rows and labels each event with its phase: `p<N>` inside player
N's turn (EV.RemotePlayerTurnBegin / GE.PlayerTurnStarted N .. that player's
EV.PlayerTurnDeactivated), `start<N>` inside player N's start-of-turn
processing (GE.PlayerTurnStarted .. GE.PlayerTurnStartComplete), `end` between
the last player's deactivation and EV.TurnEnd, `gap` from EV.TurnEnd to
EV.TurnBegin (the turn increment and the game's turn-start steps), `pre`
from EV.TurnBegin to the first player. Prints, per event name, the phase
counts, and whether the event's player (first argument) is the phase's
player. The EV rows are published in batches after the fact, so the phase
of an EV row is the phase its batch was published in.
"""
from __future__ import annotations

import collections
import json
import sys


def main() -> None:
    paths = [x for x in sys.argv[1:] if not x.startswith("--") and not x.startswith("EV.") and not x.startswith("GE.")]
    wanted = [x for x in sys.argv[1:] if x.startswith("EV.") or x.startswith("GE.")]
    table: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for path in paths:
        phase = "?"
        for ln in open(path, encoding="utf-8"):
            r = json.loads(ln)
            if r.get("state") != "GC":
                continue
            ev, a = r["ev"], r["args"]
            if ev in ("EV.RemotePlayerTurnBegin", "GE.PlayerTurnStarted"):
                phase = f"p{a[0]}" if ev == "EV.RemotePlayerTurnBegin" else f"start{a[0]}"
            elif ev == "GE.PlayerTurnStartComplete":
                phase = f"p{a[0]}"
            elif ev == "EV.PlayerTurnDeactivated":
                phase = "end"
            elif ev == "EV.TurnEnd":
                phase = "gap"
            elif ev == "EV.TurnBegin":
                phase = "pre"
            if wanted and ev not in wanted:
                continue
            own = ""
            if phase[:1] in ("p", "s") and a:
                pn = phase.lstrip("pstar")
                own = "own" if a[0] == pn else "other"
            key = phase if phase in ("end", "gap", "pre", "?") else ("start" if phase.startswith("start") else "turn") + "/" + own
            table[ev][key] += 1
    for ev in sorted(table):
        print(f"{ev:<44} " + "  ".join(f"{k}={v}" for k, v in sorted(table[ev].items())))


if __name__ == "__main__":
    main()
