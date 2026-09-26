"""C-38-S2 (era half): the later-era starts, read at turns 1-3.

    python tools/civ6lab/c38s2_fit.py

Per start era (`runs/c38s2_era_c38s2_era<k>_*.jsonl`, `c38s2_era.lua`, and
`runs/city_defense_preview_c38s2_era<k>_*.jsonl`, the combat preview's terms),
per turn: every centre's preview BASE and DEFENSES lines for majors and
minors, the minors' units by type (against `BonusMinorStartingUnits` plus the
Settler and the Ancient pair), the majors' units, and the populations and
buildings the start grants; beside the install's `StartEras` row
(`StartingMeleeStrengthMajor` / `Minor`).
"""
import collections
import json
import pathlib
import re

RUNS = pathlib.Path(__file__).parent / "runs"
ERAS = ["ERA_ANCIENT", "ERA_CLASSICAL", "ERA_MEDIEVAL", "ERA_RENAISSANCE", "ERA_INDUSTRIAL", "ERA_MODERN",
        "ERA_ATOMIC", "ERA_INFORMATION"]
# Eras.xml StartEras: (StartingMeleeStrengthMajor, StartingMeleeStrengthMinor, StartingRangedMajor, StartingRangedMinor)
START = {"ERA_ANCIENT": (20, 25, 0, 0), "ERA_CLASSICAL": (35, 40, 0, 0), "ERA_MEDIEVAL": (35, 35, 25, 25),
         "ERA_RENAISSANCE": (50, 50, 40, 40), "ERA_INDUSTRIAL": (50, 50, 40, 40), "ERA_MODERN": (50, 50, 60, 60),
         "ERA_ATOMIC": (70, 70, 60, 60), "ERA_INFORMATION": (70, 70, 75, 75)}


def main():
    for k, era in enumerate(ERAS, 1):
        pl = list(RUNS.glob(f"c38s2_era_c38s2_era{k}_*.jsonl"))
        pv = list(RUNS.glob(f"city_defense_preview_c38s2_era{k}_*.jsonl"))
        if not pl:
            continue
        players = collections.defaultdict(dict)
        for f in pl:
            for ln in open(f, encoding="utf-8"):
                if ln.startswith("{"):
                    r = json.loads(ln)
                    players[r["turn"]][r["p"]] = r
        prev = collections.defaultdict(dict)
        for f in pv:
            for ln in open(f, encoding="utf-8"):
                if ln.startswith("{"):
                    r = json.loads(ln)
                    prev[r["turn"]][(r["x"], r["y"])] = r
        print(f"\n=== game {k}: {era}  StartEras (melee major, minor, ranged major, minor) = {START[era]}")
        for t in sorted(players):
            maj_units, min_units = collections.Counter(), collections.Counter()
            base = collections.Counter()
            lines = collections.Counter()
            pops = collections.Counter()
            blds = collections.Counter()
            for p, r in players[t].items():
                if p >= 62:
                    continue
                kind = "major" if r["major"] else "minor"
                for u in r["units"]:
                    (maj_units if r["major"] else min_units)[f"{u['type'][5:]}({u['combat']}/{u['ranged']})"] += 1
                for c in r["cities"]:
                    pr = prev[t].get((c["x"], c["y"]))
                    b = pr.get("base") if pr else None
                    base[(kind, b, c.get("def"))] += 1
                    if pr:
                        for ln in pr.get("PREVIEW_TEXT_DEFENSES", []) or []:
                            lines[(kind, ln)] += 1
                    pops[(kind, c["pop"])] += 1
                    blds[(kind, tuple(sorted(x[9:] for x in c["buildings"])))] += 1
            nmin = sum(1 for p, r in players[t].items() if p < 62 and not r["major"])
            print(f"  t{t}: {nmin} minors")
            print(f"     centre (holder, preview base, GetDefenseStrength): {dict(base)}")
            print(f"     defense lines: {dict(lines)}")
            print(f"     minors' units: {dict(min_units)}")
            print(f"     majors' units: {dict(maj_units)}")
            print(f"     populations: {dict(pops)}")
            print(f"     buildings: {dict(blds)}")


if __name__ == "__main__":
    main()
