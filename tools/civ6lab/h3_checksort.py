"""H-3: tools/civ6map/check.py with Havok Script's table.sort as
h3_hksort.HKS_SORT_LUA gives it (in place of vm.HKS_SORT), to see how far
the generator now matches a recorded game.

    python tools/civ6lab/h3_checksort.py --session tools/civ6lab/runs/h3_session_<stamp>.jsonl [check.py args]
"""
from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import h3_hksort  # noqa: E402
from tools.civ6map import check, vm  # noqa: E402

vm.HKS_SORT = h3_hksort.HKS_SORT_LUA

if __name__ == "__main__":
    sys.exit(check.main())
