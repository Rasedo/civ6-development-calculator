"""Summarise `trade_path.lua` records: one line per (tag, origin, destination)
with the path's length and terrain counts, portals, CanStartRoute and the
origin-side yields from the route, the path and modifiers (food, production,
gold, science, culture, faith).

    python tools/civ6lab/trade_summary.py tools/civ6lab/runs/trade_path_X.jsonl [--only-paths]
"""
from __future__ import annotations

import json
import sys


def main() -> int:
    only = "--only-paths" in sys.argv
    for p in [a for a in sys.argv[1:] if not a.startswith("--")]:
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("kind") != "tradepath":
                continue
            if only and not r.get("n"):
                continue
            c = r.get("counts", {})
            print(f"{r.get('tag')} {r['o']}->{r['d']} {r['dname'].replace('LOC_CITY_NAME_', '')}@{r['dxy']} n={r.get('n')}"
                  f" O={c.get('ocean')} c={c.get('coast')} L={c.get('lake')} l={c.get('land')} M={c.get('mountain')}"
                  f" rail={c.get('rail')} portals={len(r.get('portalEntrances', []))} can={r.get('canStart')}"
                  f" oRoute={r.get('originRoute')} oPath={r.get('originPath')} oMods={r.get('originMods')}"
                  f" dRoute={r.get('destRoute')} dPath={r.get('destPath')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
