"""H-3: read the game's per-draw random log (Logs/RandCalls.csv) and test the
known sync LCG against it.

    python tools/civ6lab/h3_randcalls.py <RandCalls.csv> [--head N] [--type sync|async|all]

The csv columns are `Game Turn, Range, Value, Seed, Type, Location`. For each
row it checks whether `Seed` is the state BEFORE or AFTER the draw by stepping
the LCG `s' = 1103515245 s + 12345 mod 2^32` and scoring `Value` against
`((s' >> 17) * r16) >> 15`, and whether consecutive rows chain.
"""
from __future__ import annotations

import argparse
import collections
import csv
import pathlib

M32 = 0xFFFFFFFF


def step(s: int) -> int:
    return (1103515245 * s + 12345) & M32


def draw_of(state_after: int, rng: int) -> int:
    r16 = rng & 0xFFFF
    return ((state_after >> 17) * r16) >> 15


def rows(path: pathlib.Path):
    with path.open(encoding="utf-8", errors="replace") as f:
        rd = csv.reader(f)
        next(rd)
        for r in rd:
            if len(r) < 6:
                continue
            yield {"turn": int(r[0]), "range": int(r[1]), "value": int(r[2]), "seed": int(r[3]) & M32,
                   "type": r[4].strip(), "loc": ",".join(r[5:]).strip()}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("csv")
    p.add_argument("--head", type=int, default=0)
    p.add_argument("--type", default="all")
    a = p.parse_args()
    rs = [r for r in rows(pathlib.Path(a.csv)) if a.type == "all" or r["type"] == a.type]
    if a.head:
        rs = rs[: a.head]
    score = collections.Counter()
    for i, r in enumerate(rs):
        pre = draw_of(step(r["seed"]), r["range"]) == r["value"]
        post = draw_of(r["seed"], r["range"]) == r["value"]
        chain = i + 1 < len(rs) and rs[i + 1]["type"] == r["type"] and step(r["seed"]) == rs[i + 1]["seed"]
        score[("seed_is_pre", pre)] += 1
        score[("seed_is_post", post)] += 1
        score[("chains_to_next", chain)] += 1
    print(f"rows {len(rs)}")
    for k, v in sorted(score.items()):
        print(k, v)
    types = collections.Counter(r["type"] for r in rs)
    print("types", dict(types))
    locs = collections.Counter(r["loc"] for r in rs)
    for loc, n in locs.most_common(40):
        print(f"{n:6d}  {loc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
