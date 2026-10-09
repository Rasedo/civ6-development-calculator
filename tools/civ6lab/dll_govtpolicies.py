"""C-97: the majors' government and policy-card choice as GameCore_XP2_Release.dll
codes it (0x625d70, on a completed civic; the scores 0x621eb0 / 0x7b26b0),
replayed on the game's own scores (AI_GovtPolicies.csv beside every H-1
recording).

    python tools/civ6lab/dll_govtpolicies.py [--runs GLOB] [--list same|prev] [--miss]

The choice, per slot of the government in order (0x625d70): the slot's card
scores its listed value (-1.0 with none, or when its card is obsolete,
0x39e050); every policy in database order whose listed score is ABOVE the
running best and that the slot admits (CanSlot 0x393400: the card's civic
held, the slot type its own or a Wildcard, the card not slotted elsewhere)
and is not obsolete becomes the best; a best other than the slot's card is
slotted (civics command type 0). A completed civic whose list has no card
above 0 slots nothing (the +0x700 request). The list is the one the AI's
last turn scored (`--list prev`, the default) or the one logged the same
turn (`--list same`); only cards scoring above 0 are logged, so a card the
log omits reads 0.

A government change (the log's line, 0x7b0330's pick) rebuilds the slots
first (dll_readings "C-94: the slot rebuild"): the old cards sorted by their
PrereqCivic's Cost, highest first, are laid back into the new slots of their
own type while more than one new slot stands empty.

Reported: the events, the slot lines matched, the events matched whole, and
each miss with the scores it read (--miss). The 29 duels of 20261007: 1,170
of 1,284 events whole, 6,589 / 6,734 slot lines (81 events set aside); 18 games
miss, nearly always the log's military card (Levee en Masse 29, Logistics
16, Force Modernization 12) where the check fills a Wildcard: the slots a
wonder adds, which the check lays as the government's rows.
"""
from __future__ import annotations

import argparse
import collections
import glob
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "install"))
from xml_check import Install  # noqa: E402

# the recordings live in the checkout (a worktree under .claude/worktrees reads its parent's)
RUNS = next((p for p in (HERE / "runs", HERE.parents[4] / "tools" / "civ6lab" / "runs")
             if any(p.glob("h1_duelw11*_20261007T232459Z.logs"))), HERE / "runs")


def load_db():
    inst = Install()
    rows = lambda t: [c for c, _ in inst.tables.get(t, ())]  # noqa: E731
    pols = [c for c in rows("Policies") if "PolicyType" in c]
    order = [c["PolicyType"] for c in pols]
    slot = {c["PolicyType"]: c.get("GovernmentSlotType") for c in pols}
    civic = {c["PolicyType"]: c.get("PrereqCivic") for c in pols}
    cost = {c["CivicType"]: int(c.get("Cost", 0)) for c in rows("Civics") if "CivicType" in c}
    obsolete = collections.defaultdict(list)
    for c in rows("ObsoletePolicies"):
        if "PolicyType" in c and c.get("ObsoletePolicy"):
            obsolete[c["PolicyType"]].append(c["ObsoletePolicy"])
    gslots = collections.defaultdict(list)
    for c in rows("Government_SlotCounts"):
        if "GovernmentType" in c:
            gslots[c["GovernmentType"]] += [c["GovernmentSlotType"]] * int(c.get("NumSlots", 1))
    excl = {c["PolicyType"]: c["GovernmentType"] for c in rows("Policy_GovernmentExclusives_XP2") if "PolicyType" in c}
    dark = {c["PolicyType"]: c.get("RequiresDarkAge") == "true" for c in rows("Policies_XP1") if "PolicyType" in c}
    return order, slot, civic, cost, obsolete, gslots, excl, dark


def admits(slot_type, card_slot):
    return card_slot == slot_type or slot_type == "SLOT_WILDCARD"


def run_game(path, db, which, miss, out):
    order, pslot, pcivic, ccost, obsolete, gslots, excl, dark = db
    lines = []
    for ln in open(path, encoding="utf-8", errors="replace").readlines()[1:]:
        p = [x.strip() for x in ln.split(",")]
        lines.append((int(p[0]), int(p[1]), p[2], p[3] if len(p) > 3 else "", p[4:]))
    # the scores each (turn, player) logged
    scores = collections.defaultdict(dict)
    for t, pl, act, name, rest in lines:
        if act == "Policies":
            scores[(t, pl)][name] = float(rest[0])
    i = 0
    state = {}  # player -> {civics, slots [(type, card)], gov}
    while i < len(lines):
        t, pl, act, name, rest = lines[i]
        if act != "Completed Civic":
            i += 1
            continue
        st = state.setdefault(pl, {"civics": set(), "slots": [(s, None) for s in gslots["GOVERNMENT_CHIEFDOM"]],
                                   "gov": "GOVERNMENT_CHIEFDOM"})
        st["civics"].add(name)
        j = i + 1
        gov = None
        if j < len(lines) and lines[j][2] == "Government Change":
            gov = lines[j][3]
            j += 1
        logged = []
        while j < len(lines) and lines[j][2] == "Slot Policy" and lines[j][1] == pl:
            logged.append(lines[j][3])
            j += 1
        # the score list the choice read
        if which == "same":
            sc = scores.get((t, pl), {})
        else:
            prev = [k for k in scores if k[1] == pl and k[0] < t]
            sc = scores[max(prev)] if prev else {}
        if gov:
            saved = [(s, c) for s, c in st["slots"] if c]
            saved.sort(key=lambda e: (0, -ccost.get(pcivic[e[1]], 0)) if pcivic.get(e[1]) else (1, 0))
            new = [[s, None] for s in gslots[gov]]
            for k, slot in enumerate(new):
                if sum(1 for x in new if x[1] is None) <= 1:
                    break
                for m, (s, c) in enumerate(saved):
                    if s == slot[0]:
                        slot[1] = c
                        saved.pop(m)
                        break
            st["slots"] = [tuple(x) for x in new]
            st["gov"] = gov
        slotted = {c for _, c in st["slots"] if c}
        held = st["civics"]

        def obs(c):
            return any(pcivic.get(o) in held for o in obsolete.get(c, ()))

        if not logged:
            out["noslot"] += 1
            i = j
            continue
        if len(logged) != len(st["slots"]):
            # a slot the government's rows do not give (a wonder's, a
            # civic's): its type is not in the log, so the event is set aside
            out["extra"] += 1
            st["slots"] = [(st["slots"][k][0] if k < len(st["slots"]) else "SLOT_WILDCARD", c)
                           for k, c in enumerate(logged)]
            i = j
            continue
        res = []
        for k, (stype, cur) in enumerate(st["slots"]):
            best = cur
            bs = -1.0 if (cur is None or obs(cur)) else sc.get(cur, 0.0)
            if cur is not None and obs(cur):
                best = None
            for c in order:
                v = sc.get(c, 0.0) if pcivic.get(c) in held else (sc.get(c) if dark.get(c) else None)
                if v is None or v <= bs:
                    continue
                if not admits(stype, pslot.get(c)) or c in slotted or obs(c) or excl.get(c, st["gov"]) != st["gov"]:
                    continue
                best, bs = c, v
            if best != cur:
                if cur:
                    slotted.discard(cur)
                if best:
                    slotted.add(best)
            st["slots"][k] = (stype, best)
            res.append(best)
        ok = [a == b for a, b in zip(res, logged)]
        out["events"] += 1
        out["lines"] += len(logged)
        out["hit"] += sum(ok)
        out["whole"] += all(ok) and len(res) == len(logged)
        if not (all(ok) and len(res) == len(logged)):
            if out["first"] is None:
                out["first"] = f"{path.parent.name[:13]} t{t}"
            if miss:
                print(f"  MISS {path.parent.name[:13]} t{t} p{pl} {st['gov']} {name}: ours {res} log {logged}")
                print("       scores", {k: v for k, v in sc.items() if pcivic.get(k) in held})
        # the log's own slots stand from here on
        st["slots"] = [(s, logged[k] if k < len(logged) else None) for k, (s, _) in enumerate(st["slots"])]
        i = j


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default="h1_duelw11*_20261007T232459Z.logs")
    ap.add_argument("--list", default="prev", choices=["prev", "same"])
    ap.add_argument("--miss", action="store_true")
    a = ap.parse_args()
    db = load_db()
    out = collections.Counter()
    out["first"] = None
    for d in sorted(glob.glob(str(RUNS / a.runs))):
        f = pathlib.Path(d) / "AI_GovtPolicies.csv"
        if f.exists():
            run_game(f, db, a.list, a.miss, out)
    print(f"events {out['events']} (slotting nothing {out['noslot']}, a slot count the rows miss {out['extra']}); "
          f"slot lines matched {out['hit']} / {out['lines']}; events matched whole {out['whole']} / {out['events']}; "
          f"first miss {out['first']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
