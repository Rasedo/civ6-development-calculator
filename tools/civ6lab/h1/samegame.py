"""H-1: whether two recordings of one seed play the same game.

    python tools/civ6lab/h1/samegame.py runs/h1_duelw1117_<a>.jsonl runs/h1_duelm1117_<b>.jsonl

Per turn record, every section both recordings carry (`seed`, `map`,
`players`, `cities`, `units`, `religions`, `congress`, `events`,
`greatPeople`, `parks`, `revealed`, `volcanoes`, `actions`, ...), compared
on what both hold: a dict on its common keys, a list item by item (its
length too), so a field one recorder version added is not a difference.
Then the draw logs (`<stem>.randcalls.csv`) draw by draw, and the AI memory
reads (`<stem>.aimem.jsonl`, their timing fields aside) read by read. Prints the first
differing turn per section, the first differing draw and its labels, and
the turns both hold.
"""
from __future__ import annotations

import json
import pathlib
import sys

SKIP = {"turnBefore", "turnAfter", "moved", "errors", "turnEnd", "starts", "witness", "startsMoved", "head"}


def load(path: pathlib.Path) -> dict[int, dict]:
    out = {}
    for ln in path.read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(ln)
        except ValueError:
            continue
        if not r.get("moved"):
            out.setdefault(r.get("turn"), r)
    return out


def diff(a, b, where: str = "") -> str | None:
    """the first path at which a and b differ on what both hold, else None"""
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) & set(b), key=str):
            d = diff(a[k], b[k], f"{where}.{k}")
            if d:
                return d
        return None
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return f"{where} length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            d = diff(x, y, f"{where}[{i}]")
            if d:
                return d
        return None
    return None if a == b else f"{where}: {json.dumps(a)[:80]} != {json.dumps(b)[:80]}"


def draws(path: pathlib.Path) -> list[list[str]]:
    if not path.exists():
        return []
    return [[c.strip() for c in ln.split(",")] for ln in path.read_text(encoding="utf-8", errors="replace").splitlines()[1:]]


def main(argv: list[str]) -> int:
    pa, pb = pathlib.Path(argv[0]), pathlib.Path(argv[1])
    a, b = load(pa), load(pb)
    turns = sorted(t for t in set(a) & set(b) if t is not None)
    print(f"turns: {len(a)} / {len(b)} records, {len(turns)} in both ({turns[0] if turns else None}..{turns[-1] if turns else None})")
    first: dict[str, tuple[int, str]] = {}
    for t in turns:
        for k in sorted((set(a[t]) & set(b[t])) - SKIP):
            if k in first:
                continue
            d = diff(a[t][k], b[t][k], k)
            if d:
                first[k] = (t, d)
    if not first:
        print("records: identical on every common section of every common turn")
    for k, (t, d) in sorted(first.items(), key=lambda x: x[1][0]):
        print(f"records: {k} first differs at turn {t}: {d}")
    da, db = draws(pa.with_suffix(".randcalls.csv")), draws(pb.with_suffix(".randcalls.csv"))
    if da and db:
        n = min(len(da), len(db))
        k = next((i for i in range(n) if da[i][:4] != db[i][:4]), None)
        if k is None:
            print(f"draws: {len(da)} / {len(db)}, the first {n} identical (turn, range, value, seed)")
        else:
            print(f"draws: {len(da)} / {len(db)}, first differing draw {k + 1} at turn {da[k][0]}: {da[k]} vs {db[k]}")
    ma, mb = pa.with_suffix(".aimem.jsonl"), pb.with_suffix(".aimem.jsonl")
    if ma.exists() and mb.exists():
        def reads(p: pathlib.Path) -> list[dict]:
            out = []
            for ln in p.read_text(encoding="utf-8").splitlines():
                r = json.loads(ln)
                for k in ("seq", "at", "ms"):
                    r.pop(k, None)
                out.append(r)
            return out
        ra, rb = reads(ma), reads(mb)
        k = next((i for i in range(min(len(ra), len(rb))) if ra[i] != rb[i]), None)
        if k is None:
            print(f"AI memory: {len(ra)} / {len(rb)} reads, the first {min(len(ra), len(rb))} identical")
        else:
            print(f"AI memory: {len(ra)} / {len(rb)} reads, first differing read {k + 1} "
                  f"(turn {ra[k].get('turn')}, {ra[k].get('site')} of player {ra[k].get('player')}): {diff(ra[k], rb[k])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
