"""H-3: h3_tectonics.py with the ridge bias switched off — how much of the
map check the directional bias carries.

    python tools/civ6lab/h3_tectonics_nobias.py runs/h3_session_<stamp>.jsonl
"""
from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import h3_ridgemodel  # noqa: E402
import h3_tectonics  # noqa: E402

h3_ridgemodel.bias = lambda s, x, y: 0

if __name__ == "__main__":
    sys.exit(h3_tectonics.main())
