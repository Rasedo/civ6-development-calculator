"""H-3: the game's pairs order (h3_pairs.lua run in a live Lua state) against
tools/civ6map/vm.py's prediction (the same Lua under lupa with HKS_PAIRS and
Api.hks_order), row for row.

    python tools/civ6lab/h3_pairscheck.py predict                  # vm.py's rows only
    python tools/civ6lab/h3_pairscheck.py run --host 127.0.0.3 [--state FrontEnd] # read the game, write runs/h3_pairs_<stamp>.json
    python tools/civ6lab/h3_pairscheck.py score runs/h3_pairs_<stamp>.json
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

LUA = (HERE / "h3_pairs.lua").read_text(encoding="utf-8")


LOWEST = "for q = 1, p do"
HIGHEST = "for q = p, 1, -1 do"


def predict(hks: bool = True, variant: str = "vm") -> list[str]:
    """vm: vm.py's HKS_PAIRS as it stands; highest: the same with next
    asked about the HIGHEST absent index in 1..p (Lua 5.1's next accepts an
    absent index only up to its array size, a power of two that may be
    below p)"""
    import lupa.lua51 as lua51
    from tools.civ6map import vm

    lua = lua51.LuaRuntime(unpack_returned_tuples=True)
    src = vm.HKS_PAIRS
    if variant == "highest":
        src = src.replace(LOWEST, HIGHEST)

    class N:
        pass
    n = N()
    n.lua = lua
    n.hks_order = vm.Api.hks_order.__get__(n)
    n._list = vm.Api._list.__get__(n)
    if hks:
        lua.compile(src)(n)
    out: list[str] = []
    lua.globals().print = lambda *a: out.append("\t".join(str(x) for x in a))
    lua.execute(LUA)
    return out


def rows(lines: list[str]) -> dict:
    d = {}
    for ln in lines:
        if ln.startswith("P|"):
            _, case, n, ln_, keys = ln.split("|", 4)
            d[(case, int(n))] = (int(ln_), keys)
    return d


def score(game_lines: list[str]) -> int:
    g, v, s = rows(game_lines), rows(predict(True)), rows(predict(False))
    h = rows(predict(True, "highest"))
    tot = collections.Counter()
    agree = collections.Counter()
    agree51 = collections.Counter()
    agreeh = collections.Counter()
    lenok = collections.Counter()
    miss = []
    for key in sorted(g):
        case = key[0]
        tot[case] += 1
        if v.get(key, (None, None))[1] == g[key][1]:
            agree[case] += 1
        else:
            miss.append((key, g[key], v.get(key)))
        if s.get(key, (None, None))[1] == g[key][1]:
            agree51[case] += 1
        if h.get(key, (None, None))[1] == g[key][1]:
            agreeh[case] += 1
        if v.get(key, (None,))[0] == g[key][0]:
            lenok[case] += 1
    print(f"{'case':<10} rows  vm.py  lua5.1  highest  #t(vm)")
    for c in sorted(tot):
        print(f"{c:<10} {tot[c]:>4} {agree[c]:>6} {agree51[c]:>7} {agreeh[c]:>8} {lenok[c]:>7}")
    print(f"{'ALL':<10} {sum(tot.values()):>4} {sum(agree.values()):>6} {sum(agree51.values()):>7} "
          f"{sum(agreeh.values()):>8} {sum(lenok.values()):>7}")
    for key, gg, vv in miss[:25]:
        print("MISS", key, "game #t", gg[0], gg[1], "| vm #t", vv and vv[0], vv and vv[1])
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["predict", "run", "score"])
    p.add_argument("file", nargs="?")
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--port", type=int, default=4318)
    p.add_argument("--state", action="append", default=[])
    a = p.parse_args()
    if a.cmd == "predict":
        for ln in predict():
            print(ln)
        return 0
    if a.cmd == "run":
        from tuner import Tuner
        rec = {}
        for st in a.state or ["FrontEnd"]:
            t = Tuner(a.host, a.port).connect()
            rec[st] = t.run(st, LUA, timeout=60)
            t.close()
            print(st, len(rec[st]), "lines, last", rec[st][-1:] )
        out = HERE / "runs" / f"h3_pairs_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.json"
        out.write_text(json.dumps(rec), encoding="utf-8")
        print("->", out)
        for st, lines in rec.items():
            print("==", st)
            score(lines)
        return 0
    rec = json.loads(pathlib.Path(a.file).read_text(encoding="utf-8"))
    for st, lines in rec.items():
        print("==", st)
        score(lines)
    return 0


if __name__ == "__main__":
    sys.exit(main())
