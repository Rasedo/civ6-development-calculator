"""A DIG SITE IS A SEEN RESOURCE to the next-plot scorer — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/dig_site_border_test.py

The TS twin is tests/cpu/city/dig-site-border.test.ts.

Resources.xml: RESOURCE_ANTIQUITY_SITE (PrereqCivic Natural History) and
RESOURCE_SHIPWRECK (PrereqCivic Cultural Heritage) are resources the player
sees once it holds the civic (`_seen_resource`, the border scorer's 'a
resource the player can see', 0x1aa7f0).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import load_rules, fixture_paths
from warmup import warm_base, opened


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    sim = warm_base(str(path), lambda: opened(rules, path))
    b, row = 0, 0
    bare = [t for t in range(sim.T) if int(sim.res_id[b, t]) < 0]
    wreck, site = bare[0], bare[1]
    sim.shipwreck[b, wreck] = True
    sim.antiquity[b, site] = True
    ship_c, anti_c = sim._shipwreck_civic, sim._antiquity_civic
    assert ship_c >= 0 and anti_c >= 0, "the catalog names neither revealing civic"
    sim.civ_civics[b, row, ship_c] = False
    sim.civ_civics[b, row, anti_c] = False
    seen = sim._seen_resource(row)
    assert not bool(seen[b, wreck]) and not bool(seen[b, site]), "a dig site seen before its civic"
    sim.civ_civics[b, row, ship_c] = True
    seen = sim._seen_resource(row)
    assert bool(seen[b, wreck]) and not bool(seen[b, site]), "Cultural Heritage reveals the Shipwreck alone"
    sim.civ_civics[b, row, anti_c] = True
    assert bool(sim._seen_resource(row)[b, site]), "Natural History reveals the Antiquity Site"
    print("  a dig site is seen once its civic is held")
    print("dig site border OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
