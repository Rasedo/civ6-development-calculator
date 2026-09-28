"""C-38 / C-60: classify every unit a minor loses between two H-1 records.

    python tools/civ6lab/h1c_losses.py <dump.jsonl> [...] [--out runs/c38h1_losses.jsonl]

A loss is
  upgrade  - a unit of another type born on the same plot the same step;
  levy     - a unit of the same type standing on the same plot next record
             under another owner;
  hurt     - damaged at the last record, or an enemy unit within 1 of it
             next record (combat is the likely cause);
  charges  - a Builder or Trader (used up, or the route's end);
  other    - the rest (the candidates for a disband or the AI's own delete).
Each 'other' prints the seat's bank, yield, maintenance and the shortfall
S = maint - floor(yield) - floor(bank) at the step's start, the unit's age
rank (0 = newest id standing), and the unit's upkeep read as the drop in
the seat's unit maintenance.
"""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def hexdist(a, b, w):
    def cube(x, y):
        q = x - (y - (y & 1)) // 2
        return q, y
    ax, ay = a
    bx, by = b
    best = 99
    for dx in (0, w, -w):
        q1, r1 = cube(ax, ay)
        q2, r2 = cube(bx + dx, by)
        dq, dr = q1 - q2, r1 - r2
        best = min(best, (abs(dq) + abs(dr) + abs(dq + dr)) // 2)
    return best


def main():
    paths = [a for a in sys.argv[1:] if a.endswith(".jsonl") and "--out" not in a]
    out = None
    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]
        paths = [p for p in paths if p != out_path]
        out = open(out_path, "w", encoding="utf-8", newline="\n")
    for path in paths:
        cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
        uname = cat["units"]
        prev = None
        for d in load(path):
            if prev is None or d["turn"] != prev["turn"] + 1:
                prev = d
                continue
            w = d["head"]["W"]
            pp = {p["id"]: p for p in prev["players"]}
            for p in d["players"]:
                if not (p["minor"] or p["free"]) or p["id"] not in pp:
                    continue
                a = pp[p["id"]]
                pid = p["id"]
                u0 = {u["id"]: u for u in prev["units"] if u["owner"] == pid}
                u1 = {u["id"]: u for u in d["units"] if u["owner"] == pid}
                born = [u for i, u in u1.items() if i not in u0]
                ids_desc = sorted(u0, reverse=True)
                enemies = [u for u in d["units"] if u["owner"] in (a["wars"] or [])]
                lost = [u for i, u in u0.items() if i not in u1]
                dmaint = (a.get("maintUnits") or 0) - (p.get("maintUnits") or 0)
                for u in lost:
                    name = uname[u["type"]]
                    kind = "other"
                    if any(b["x"] == u["x"] and b["y"] == u["y"] and b["type"] != u["type"] for b in born):
                        kind = "upgrade"
                    elif any(v["owner"] != pid and v["type"] == u["type"] and v["x"] == u["x"] and v["y"] == u["y"]
                             for v in d["units"]):
                        kind = "levy"
                    elif (u.get("damage") or 0) > 0 or any(hexdist((e["x"], e["y"]), (u["x"], u["y"]), w) <= 2 for e in enemies):
                        kind = "hurt"
                    elif name in ("UNIT_BUILDER", "UNIT_TRADER"):
                        kind = "charges"
                    S = (a["maintTotal"] or 0) - int(a["goldYield"] or 0) - int(a["gold"] or 0)
                    row = {"file": path.split("/")[-1][:30], "player": pid, "t": prev["turn"], "kind": kind,
                           "unit": name, "id": u["id"], "x": u["x"], "y": u["y"], "damage": u.get("damage"),
                           "bank": a["gold"], "yield": a["goldYield"], "maint": a["maintTotal"],
                           "maintUnits0": a.get("maintUnits"), "maintUnits1": p.get("maintUnits"), "S": S,
                           "ageRank": ids_desc.index(u["id"]), "nUnits": len(u0), "nLost": len(lost),
                           "wars": a["wars"], "bank1": p["gold"]}
                    if out:
                        out.write(json.dumps(row) + "\n")
                    if kind == "other":
                        print(row["file"][9:13], pid, prev["turn"], name, f"bank {a['gold']:.1f} y {a['goldYield']:.1f} m {a['maintTotal']}",
                              f"S {S} rank {row['ageRank']}/{len(u0)} lost {len(lost)} dMu {dmaint} bank1 {p['gold']:.1f}")
            prev = d


if __name__ == "__main__":
    main()
