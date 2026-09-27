"""H-3: search per-seed layouts with conditional draws: B base draws; after
base i an extra draw is taken when base j's value (j <= i) passes a test.

    python tools/civ6lab/h3_seedrule4.py DUMP [DUMP ...] [--first]
"""
from __future__ import annotations

import itertools
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_seedrule import clean_seeds  # noqa: E402
from h3_seedrule3 import tests, ok  # noqa: E402


def parse(ex, nbase, conds):
    """conds: {after_base_i: (j, test)}; the draws: base values, and extra
    draws; True when the whole list is consumed exactly"""
    pos = 0
    base = []
    for i in range(nbase):
        if pos >= len(ex):
            return False
        base.append(ex[pos])
        pos += 1
        for (ai, j, t) in conds:
            if ai == i and ok(base[j], *t):
                pos += 1
    return pos == len(ex)


def main() -> int:
    seeds = clean_seeds([x for x in sys.argv[1:] if not x.startswith("--")])
    if "--first" in sys.argv:
        seeds = [s for s in seeds if s[1]]
    exs = [ex for _, _, ex in seeds if len(ex) <= 5]
    print("seeds", len(exs))
    T = tests()
    best = []
    nbase = 3
    slots = [(i, j) for i in range(nbase) for j in range(i + 1)]
    # the extra draws sit after base i and test base j; allow the extra draw
    # itself to count as the next base's input as well (not modelled)
    for (s1, s2) in itertools.combinations_with_replacement(slots, 2):
        for t1 in T:
            # prefilter: seeds with exactly 3 extras must fail t1 on base s1[1]
            for t2 in T:
                n = sum(parse(ex, nbase, [(s1[0], s1[1], t1), (s2[0], s2[1], t2)]) for ex in exs)
                if n >= len(exs) - 4:
                    best.append((n, s1, t1, s2, t2))
    best.sort(key=lambda b: -b[0])
    for b in best[:20]:
        print(b)
    print("hits", len(best))
    return 0


if __name__ == "__main__":
    sys.exit(main())
