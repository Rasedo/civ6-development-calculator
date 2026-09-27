"""Turn order: does a unit attacked this turn heal at this turn's end?

    python tools/civ6lab/turnorder_heal.py <record.jsonl> [...]

Over the GC rows of each game turn: the end-of-turn heal is every
EV.UnitDamageChanged whose new damage is below the old one, published after
the last player's EV.PlayerTurnDeactivated and before EV.TurnEnd. For every
unit that was a DEFENDER in a GE.OnCombatOccurred this turn (args: attacker
player, attacker unit, defender player, defender unit), it reports whether the
unit moved (EV.UnitMoved), attacked (an attacker in GE.OnCombatOccurred) this
turn, and whether it healed at the turn's end — and the same for units that
were never in combat but were damaged at the turn's start (the control).
"""
from __future__ import annotations

import collections
import json
import sys


def main() -> None:
    rows = []
    for p in sys.argv[1:]:
        rows += [json.loads(l) for l in open(p, encoding="utf-8")]
    rows = [r for r in rows if r.get("state") == "GC"]
    by_turn: dict[int, list] = collections.defaultdict(list)
    for r in rows:
        if isinstance(r["turn"], int):
            by_turn[r["turn"]].append(r)
    tally = collections.Counter()
    for t, rs in sorted(by_turn.items()):
        defended, attacked_with, moved, healed, hurt = set(), set(), set(), {}, {}
        phase_end = False
        for r in rs:
            ev, a = r["ev"], r["args"]
            if ev == "EV.PlayerTurnDeactivated" and a and a[0] == "63":
                phase_end = True
            if ev == "EV.TurnEnd":
                phase_end = False
            if ev == "GE.OnCombatOccurred" and len(a) >= 4:
                if a[1] != "-1":
                    attacked_with.add((a[0], a[1]))
                if a[3] != "-1":
                    defended.add((a[2], a[3]))
            if ev == "EV.UnitMoved" and len(a) >= 2:
                moved.add((a[0], a[1]))
            if ev == "EV.UnitDamageChanged" and len(a) >= 4:
                key = (a[0], a[1])
                new, old = float(a[2]), float(a[3])
                if new < old and phase_end:
                    healed[key] = old - new
                elif new > old:
                    hurt[key] = hurt.get(key, 0) + new - old
        for u in sorted(defended):
            kind = "defender" + ("+attacked" if u in attacked_with else "") + ("+moved" if u in moved else "")
            h = healed.get(u)
            tally[(kind, h is not None)] += 1
            print(f"t{t} p{u[0]} u{u[1]} {kind:<28} healed_at_end={h}")
    print("--- (kind, healed at the end of the turn it was attacked): count")
    for k, n in sorted(tally.items()):
        print(f"   {k[0]:<28} healed={k[1]}: {n}")


if __name__ == "__main__":
    main()
