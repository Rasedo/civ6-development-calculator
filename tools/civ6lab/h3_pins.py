"""H-3: where each civ6lab_mapprobe pin sits relative to the map seed.

    python tools/civ6lab/h3_pins.py runs/h3_probe_<...>.jsonl [--max 2^31]

For every pin: the step index of its first draw counted from RANDOM_SEED
(state = seed, first draw = step(seed)), or None past --max. Also prints the
Lua draws by reason and the first Lua draws after the entry pin.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_fit import M32, distance, find_state  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--max", type=int, default=1 << 31)
    p.add_argument("--pins", default="load,entry,exit")
    a = p.parse_args()
    want = set(a.pins.split(","))
    for ln in pathlib.Path(a.session).read_text(encoding="utf-8").splitlines():
        rec = json.loads(ln)
        seed = rec["map_seed"] & M32
        reasons = rec["probe"]["reasons"]
        print(f"== {rec['tag']} map seed {seed} game seed {rec.get('game_seed')}")
        log = rec["probe"]["log"]
        by = collections.Counter()
        after_entry = []
        seen_entry = False
        for e in log:
            if e.startswith("P"):
                tag, _, vals = e[1:].rpartition("=")
                if tag == "entry":
                    seen_entry = True
                if tag in want:
                    st = find_state([int(x) for x in vals.split(",")], 1103515245, 12345)
                    n = distance(seed, st[0], 1103515245, 12345, a.max) if len(st) == 1 else None
                    print(f"pin {tag}: first draw at step {n} (1 = the first draw from the seed)")
            elif not e.startswith("M="):
                r, v, rid = e.split(":")
                name = reasons.get(rid, reasons.get(int(rid), rid)) if isinstance(reasons, dict) else rid
                by[name] += 1
                if seen_entry and len(after_entry) < 12:
                    after_entry.append(f"{r}:{v} {name}")
        print("first Lua draws after entry:", after_entry)
        for k, v in by.most_common():
            print(f"  {v:6d}  {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
