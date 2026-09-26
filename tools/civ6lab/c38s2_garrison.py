"""C-38-S2 rides along — B-95's garrison line: every centre preview with a unit
of the holder on the centre, the preview's garrison line against
(the unit's Combat - the preview's base) and the flat 10.

    python tools/civ6lab/c38s2_garrison.py
"""
import collections
import json
import pathlib
import re

RUNS = pathlib.Path(__file__).parent / "runs"
GARRISON = re.compile(r"^\+(\d+)\D.*\((.*)\)$")


def main():
    rows = []
    for f in sorted(RUNS.glob("c38s2_era_c38s2_era*_*.jsonl")):
        k = re.search(r"era(\d+)_", f.name).group(1)
        units = collections.defaultdict(list)
        for ln in open(f, encoding="utf-8"):
            if ln.startswith("{"):
                r = json.loads(ln)
                for u in r["units"]:
                    units[(r["turn"], u["x"], u["y"])].append((r["p"], u))
        for g in RUNS.glob(f"city_defense_preview_c38s2_era{k}_*.jsonl"):
            for ln in open(g, encoding="utf-8"):
                if not ln.startswith("{"):
                    continue
                r = json.loads(ln)
                here = [u for p, u in units.get((r["turn"], r["x"], r["y"]), []) if p == r["owner"]]
                mil = [u for u in here if (u["combat"] or 0) > 0]
                line = None
                for s in r.get("PREVIEW_TEXT_DEFENSES", []) or []:
                    if "гарнизон" in s or "garrison" in s.lower():
                        line = int(GARRISON.match(s).group(1)) if GARRISON.match(s) else s
                rows.append((k, r["turn"], r["owner"], r.get("base"), [(u["type"][5:], u["combat"], u["damage"]) for u in mil], line))
    agree = collections.Counter()
    for k, t, p, base, mil, line in rows:
        if not mil:
            agree[("no unit", line is None)] += 1
            continue
        best = max(c for _, c, _ in mil)
        pred = max(0, best - base) if isinstance(base, (int, float)) else None
        agree[("unit", "line == Combat - base" if (line or 0) == pred else "flat 10" if line == 10 else "other")] += 1
        if (line or 0) != pred:
            print("   mismatch", k, t, p, base, mil, line)
    for key, n in sorted(agree.items(), key=str):
        print(f"   {key}: {n}")
    print("\n   (era game, turn, owner, base, [(unit, Combat, damage)], line):")
    for r in rows:
        if r[4]:
            print("   ", r)


if __name__ == "__main__":
    main()
