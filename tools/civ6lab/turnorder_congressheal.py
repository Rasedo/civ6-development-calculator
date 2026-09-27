"""Turn order: the World Congress against the end-of-turn heal.

    python tools/civ6lab/turnorder_congressheal.py <record.jsonl> [...]

Over the GC rows of each game turn, from the barbarians' (63)
EV.PlayerTurnDeactivated to EV.TurnEnd (the end window; the C-93 witness puts
both the session and the heal before GE.OnGameTurnEnded synchronously), it
lists in PUBLISHED order the session's favor changes (EV.FavorChanged with a
reason other than -1, the per-turn favor) and the heals (an
EV.UnitDamageChanged or EV.DistrictDamageChanged whose new damage is below the
old). Events are queued in the order they happen, so a turn where every
session favor change is published before the first heal reads "congress
first". The tally counts turns by order.
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
        end = False
        seq = []
        for r in rs:
            ev, a = r["ev"], r["args"]
            if ev == "EV.PlayerTurnDeactivated" and a and a[0] == "63":
                end = True
                continue
            if ev == "EV.TurnEnd":
                end = False
            if not end:
                continue
            if ev == "EV.FavorChanged" and len(a) >= 3 and a[2] != "-1":
                seq.append(("F", a[0], a[1], a[2]))
            elif ev == "EV.UnitDamageChanged" and len(a) >= 4 and float(a[2]) < float(a[3]):
                seq.append(("H", "unit", a[0], a[1]))
            elif ev == "EV.DistrictDamageChanged" and len(a) >= 5 and float(a[3]) < float(a[4]):
                seq.append(("H", "district", a[0], a[1]))
            elif ev == "GE.OnGameTurnEnded":
                seq.append(("G", "OnGameTurnEnded", "", ""))
        kinds = "".join(k for k, *_ in seq)
        f_idx = [i for i, s in enumerate(seq) if s[0] == "F"]
        h_idx = [i for i, s in enumerate(seq) if s[0] == "H"]
        if f_idx and h_idx:
            order = "congress_first" if max(f_idx) < min(h_idx) else ("heal_first" if max(h_idx) < min(f_idx) else "mixed")
        else:
            order = "only_" + ("congress" if f_idx else "heal" if h_idx else "none")
        tally[order] += 1
        reasons = collections.Counter(s[3] for s in seq if s[0] == "F")
        print(f"t{t} {order:<15} {kinds} favor_reasons={dict(reasons)}")
    print("--- turns by order:", dict(tally))


if __name__ == "__main__":
    main()
