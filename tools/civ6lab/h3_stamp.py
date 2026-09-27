"""H-3: what StampContinents' 43 draws decide. From a ledger (h3_ledger.py)
the stream state just before each call of a native is known; this prints
the draws the native takes and scores shuffle rules of the 43 Continents rows
against the continent types the map dump carries.

    python tools/civ6lab/h3_stamp.py runs/h3_session_<stamp>.jsonl [--native TerrainBuilder.StampContinents]
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib

M32 = 0xFFFFFFFF
A, C = 1103515245, 12345


def step(s: int) -> int:
    return (A * s + C) & M32


def advance(s: int, n: int) -> int:
    for _ in range(n):
        s = step(s)
    return s


def positions(rows: list, native: str) -> list[int]:
    """the stream position before each call of `native` in a ledger"""
    out = []
    run = 0
    inblock = 0
    for kind, label, n, _d in rows:
        if kind == "native":
            if label.startswith(native):
                out.append(run + inblock)
            inblock += n or 0
        elif kind in ("lua", "block", "tail", "gap"):
            run += n or 0
            if kind == "block":
                inblock = 0
    return out


def draws(s: int, ranges) -> list[int]:
    out = []
    for r in ranges:
        s = step(s)
        out.append(((s >> 16) * (int(r) & 0xFFFF)) >> 16)
    return out


def shuffles(s: int, n: int = 43) -> dict[str, list[int]]:
    """candidate permutations of range(n) from n draws at state s"""
    res = {}
    # forward Fisher-Yates, j = i + get(n - i)
    a, t = list(range(n)), s
    for i in range(n):
        t = step(t)
        j = i + (((t >> 16) * (n - i)) >> 16)
        a[i], a[j] = a[j], a[i]
    res["fy_forward"] = a
    # backward Fisher-Yates, i = n-1..0, j = get(i + 1)
    a, t = list(range(n)), s
    for i in range(n - 1, -1, -1):
        t = step(t)
        j = ((t >> 16) * (i + 1)) >> 16
        a[i], a[j] = a[j], a[i]
    res["fy_backward"] = a
    # naive: swap(a[i], a[get(n)])
    a, t = list(range(n)), s
    for i in range(n):
        t = step(t)
        j = ((t >> 16) * n) >> 16
        a[i], a[j] = a[j], a[i]
    res["naive"] = a
    # ascending i, j = get(i + 1)
    a, t = list(range(n)), s
    for i in range(n):
        t = step(t)
        j = ((t >> 16) * (i + 1)) >> 16
        a[i], a[j] = a[j], a[i]
    res["up_i1"] = a
    # draw-without-replacement: pick get(len(pool)) from the pool
    pool, t, a = list(range(n)), s, []
    for i in range(n):
        t = step(t)
        j = ((t >> 16) * len(pool)) >> 16
        a.append(pool.pop(j))
    res["pick_pool"] = a
    # pick from the pool, swap-with-last removal
    pool, t, a = list(range(n)), s, []
    for i in range(n):
        t = step(t)
        j = ((t >> 16) * len(pool)) >> 16
        a.append(pool[j])
        pool[j] = pool[-1]
        pool.pop()
    res["pick_swaplast"] = a
    # sort by a random key get(n) / get(32768), stable
    for rng in (n, 32768, 65536):
        t, keys = s, []
        for i in range(n):
            t = step(t)
            keys.append(((t >> 16) * (rng & 0xFFFF)) >> 16 if rng != 65536 else t >> 16)
        res[f"sortkey_{rng}"] = sorted(range(n), key=lambda i: keys[i])
    return res


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("sessions", nargs="+")
    p.add_argument("--native", default="TerrainBuilder.StampContinents")
    p.add_argument("--count", type=int, default=43)
    a = p.parse_args()
    for sess in a.sessions:
        rec = json.loads(pathlib.Path(sess).read_text(encoding="utf-8").splitlines()[0])
        rows = json.loads(pathlib.Path(sess).with_name(pathlib.Path(sess).stem + "_ledger.json").read_text(encoding="utf-8"))
        dump = json.loads(pathlib.Path(rec["map_dump"]).read_text(encoding="utf-8"))
        cont = collections.Counter(int(pl.split(".")[5]) for row in dump["rows"] for pl in row)
        cont.pop(-1, None)
        seed = rec["map_seed"] & M32
        pos = positions(rows, a.native)
        print(sess, "seed", rec["map_seed"], "continents", dict(cont), a.native, "at", pos[:4])
        s = advance(seed, pos[0])
        print("   raw 16-bit draws:", draws(s, [65536] * a.count)[:10], "...")
        print("   get(43) each    :", draws(s, [43] * a.count))
        for name, perm in shuffles(s).items():
            where = {c: perm.index(c) for c in cont}
            print(f"   {name:14s} first {perm[:6]} last {perm[-3:]} index of the map's continent(s) {where}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
