"""C-74-S3: a disaster's BUILDING_PILLAGED on a city-state's district, and the
repair. Reads a pair_run `c74s3_minor_pillage` record (`c74s3_minors.lua`
before the turn and after each): per arm and city-state, every building and
district whose pillage state differs from the control's at the same turn,
turn by turn, beside the city's production item and progress and treasury.

    python tools/civ6lab/c74s3_minor_fit.py tools/civ6lab/runs/c74s3_minor_pillage_<stamp>.jsonl
"""
from __future__ import annotations

import json
import sys


def states(rec: dict) -> dict[int, dict[tuple, dict]]:
    """turn -> (p, city id) -> the city record."""
    out: dict[int, dict[tuple, dict]] = {}
    seq = [rec["pre"][0]["json"]] + [e["reads"][0]["json"] for e in rec["each"]]
    for js in seq:
        for c in js:
            if c.get("kind") == "city":
                out.setdefault(c["turn"], {})[(c["p"], c["id"])] = c
    return out


def main(path: str) -> int:
    recs = [json.loads(l) for l in open(path, encoding="utf-8")]
    ctl = next(r for r in recs if r["arm"] == "control")
    cs = states(ctl)
    for r in recs:
        if r["arm"] == "control":
            continue
        print("==", r["arm"], "apply:", [(j.get("call"), j.get("x"), j.get("y")) for j in r["gc"]["json"]])
        ev = r["gc"]["json"][0].get("events") if r["gc"]["json"] else None
        print("   event record:", json.dumps(ev)[:400])
        st = states(r)
        for turn in sorted(st):
            for key, c in sorted(st[turn].items()):
                base = cs.get(turn, {}).get(key)
                pil = [b for b in c["buildings"] if b[1] is True]
                dpil = [d[0] for d in c["districts"] if d[6] is True]
                bctl = [b for b in (base or {}).get("buildings", []) if b[1] is True]
                if pil or dpil or bctl:
                    print(f"   t{turn} p{c['p']} {c['name'][14:]:12s} pillaged={[b[0] for b in pil]} districts={dpil}"
                          f" prod={c['prod']}:{c['prodProgress']} gold={c.get('gold')}"
                          f" | control pillaged={[b[0] for b in bctl]} prod={(base or {}).get('prod')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
