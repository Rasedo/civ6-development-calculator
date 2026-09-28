"""One seat's purse timeline from an H-1 dump: per record the balance, yield,
maintenance (units / buildings / districts), the city's bankruptcy amenity
loss, the wars, and the units (id:type@x,y dmg).

    python tools/civ6lab/h1c_line.py <dump.jsonl> <player> <t0> <t1>
"""
import json
import sys

path, pid, t0, t1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
cat = json.load(open(path.replace(".jsonl", ".cat.json"), encoding="utf-8"))
with open(path, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        t = d["turn"]
        if t < t0 or t > t1:
            continue
        p = next(p for p in d["players"] if p["id"] == pid)
        cs = [c for c in d["cities"] if c["owner"] == pid]
        bank = [c["amenityParts"][-1] for c in cs]
        us = [u for u in d["units"] if u["owner"] == pid]
        ul = " ".join(f"{u['id']}:{cat['units'][u['type']][5:]}@{u['x']},{u['y']}d{u.get('damage')}" for u in us)
        print(t, f"g{p['gold']:.2f} y{p['goldYield']:.2f} m{p['maintTotal']} (u{p.get('maintUnits')} b{p.get('maintBuildings')} d{p.get('maintDistricts')})",
              f"bk{bank} am{[c['amenities'] for c in cs]} wars{p['wars']} n{len(us)}", ul)
