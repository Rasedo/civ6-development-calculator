"""Overview of an H-1 dump for the C-38 / C-60 scenes: per turn the minors'
and the Free Cities' gold, yield, maintenance, city count and units.

    python tools/civ6lab/h1c_scan.py runs/h1_duelw1103_*.jsonl [--every 10]
"""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def main():
    path = sys.argv[1]
    every = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    for d in load(path):
        t = d["turn"]
        free_cities = [c for c in d["cities"] if c["owner"] == 62]
        if t % every and not free_cities:
            continue
        row = []
        for p in d["players"]:
            if not (p["minor"] or p["free"]):
                continue
            n_units = sum(1 for u in d["units"] if u["owner"] == p["id"])
            n_c = sum(1 for c in d["cities"] if c["owner"] == p["id"])
            row.append(f"p{p['id']} c{n_c} u{n_units} g{p['gold']:.0f} y{p['goldYield']:.1f} m{p['maintTotal']}")
        print(t, " | ".join(row))


main()
