"""H-3: tools/civ6map/check.py with Map.FindSecondContinent replaced by the
rule the fsc records fit (h3_fscmiss.py): true when the plot is LAND with a
continent and a LAND plot of another continent lies within hex distance r
(water plots carrying a continent, lakes, neither answer nor count).

    python tools/civ6lab/h3_fsccheck.py <check.py arguments>
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.civ6map import check  # noqa: E402
from tools.civ6map import world as W  # noqa: E402


def find_second_continent(self, i: int, rng) -> bool:
    c = self.continent[i]
    if c < 0 or self.is_water(i):
        return False
    return any(self.continent[p] not in (-1, c) and not self.is_water(p) for p in self.within(i, int(rng)))


W.World.find_second_continent = find_second_continent

if __name__ == "__main__":
    sys.argv = [str(ROOT / "tools/civ6map/check.py")] + sys.argv[1:]
    sys.exit(check.main())
