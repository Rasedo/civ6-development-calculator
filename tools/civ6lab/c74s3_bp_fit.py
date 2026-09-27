"""C-74-S3: how many of a district's buildings one storm hit pillages. Reads a
pair_run `c74s3_bldg_pillage` record (several tornadoes applied in one load,
`c74s3_minors.lua` with ZALL=1 read after them) and prints, per arm and per
struck district, the district's pillage state and each of its buildings
(pillaged or standing) against the control.

    python tools/civ6lab/c74s3_bp_fit.py tools/civ6lab/runs/c74s3_bldg_pillage_<stamp>.jsonl
"""
from __future__ import annotations

import json
import sys

# the district each building belongs to, from the install's Buildings rows
DISTRICT_OF: dict[str, str] = {}


def load_districts() -> None:
    import re
    base = r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VI"
    for f in (base + r"\Base\Assets\Gameplay\Data\Buildings.xml",
              base + r"\DLC\Expansion1\Data\Expansion1_Buildings.xml",
              base + r"\DLC\Expansion2\Data\Expansion2_Buildings.xml"):
        try:
            text = open(f, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in re.finditer(r'<Row BuildingType="(BUILDING_[A-Z_0-9]+)"[^>]*?PrereqDistrict="(DISTRICT_[A-Z_]+)"', text):
            DISTRICT_OF[m.group(1)] = m.group(2)


def cities(rec: dict) -> dict[tuple, dict]:
    return {(c["x"], c["y"]): c for c in rec["pre"][0]["json"] if c.get("kind") == "city"}


def main(path: str) -> int:
    load_districts()
    recs = [json.loads(l) for l in open(path, encoding="utf-8")]
    ctl = cities(next(r for r in recs if r["arm"] == "control"))
    for r in recs:
        if r["arm"] == "control":
            continue
        targets = [(j["x"], j["y"], j.get("ev")) for blk in [r["gc"]] + r["steps"] for j in blk.get("json", [])]
        print("==", r["arm"], "burn", r.get("burn"))
        cs = cities(r)
        for x, y, ev in targets:
            for key, c in cs.items():
                for d in c["districts"]:
                    if d[1] == x and d[2] == y:
                        mine = [b for b in c["buildings"] if DISTRICT_OF.get(b[0]) == d[0]]
                        before = {b[0]: b[1] for b in ctl.get(key, {}).get("buildings", [])}
                        print(f"   {ev[13:]:16s} ({x},{y}) p{c['p']} {c['name'][14:]:10s} {d[0][9:]:12s}"
                              f" district pillaged={d[6]} | " +
                              ", ".join(f"{b[0][9:]}{'*' if b[1] is True else ''}{'(was*)' if before.get(b[0]) is True else ''}" for b in mine))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
