"""C-74-S2: the drought's start rule, tested on every drought of the Duel
games — the ones that found a plot AND the ones that did not (StartLocation
-1): a rule survives only if its candidate set is empty on every no-plot
drought and holds the start plot on every placed one.

    python tools/civ6lab/c74s2_drought_rules.py [tag glob]

A rule is a conjunction of clauses on the plot (Plains / Grassland, flat or
with hills; no feature; no district; no improvement; no fresh water; within
3 of a city centre; owned) and on its six neighbours (at least k of them pass
the same plot clauses). The whole-map read (`dmap`) is taken on the read
after the start; the drought changes no terrain, feature or owner.
"""
from __future__ import annotations

import collections
import itertools
import json
import pathlib
import re
import sys

RUNS = pathlib.Path(__file__).parent / "runs"


def cube(x, y):
    return x - (y - (y & 1)) // 2, y


def hexdist(a, b):
    q1, r1 = cube(*a)
    q2, r2 = cube(*b)
    return (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) // 2


def neighbours(W, H):
    idx = {cube(i % W, i // W): i for i in range(W * H)}
    nb = {}
    for i in range(W * H):
        q, r = cube(i % W, i // W)
        nb[i] = [idx[(q + dq, r + dr)] for dq, dr in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1))
                 if (q + dq, r + dr) in idx]
    return nb


def load(pat):
    cases = []
    for f in sorted(RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")):
        tag = re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
        seen = set()
        cities = {}
        rows = [json.loads(ln) for ln in open(f, encoding="utf-8") if ln.startswith("{")]
        for r in rows:
            if r["kind"] == "cities":
                cities[r["turn"]] = r["c"]
        for r in rows:
            if r["kind"] != "dmap":
                continue
            for key in ("evPrev", "evNow"):
                e = r.get(key)
                if not (isinstance(e, dict) and "DROUGHT" in str(e.get("type"))):
                    continue
                k = (e["StartTurn"], e.get("StartLocation"))
                if k in seen or e["StartTurn"] not in (r["turn"], r["turn"] - 1):
                    continue
                seen.add(k)
                cases.append((tag, e, r, cities.get(r["turn"], [])))
    return cases


CLAUSES = ("hills ok", "no district", "no improvement", "no fresh water", "within 3 of a centre", "owned")


def main() -> int:
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    cases = load(pat)
    nbc = {}
    res = collections.defaultdict(lambda: [0, 0, []])
    for tag, e, r, cs in cases:
        W, H = r["grid"]
        nb = nbc.setdefault((W, H), neighbours(W, H))
        terr = {i: n for i, n in r["terrains"]}
        plots = {p[0]: p for p in r["plots"]}
        centres = [(c[2], c[3]) for c in cs]
        near3 = {i for i in plots if any(hexdist((i % W, i // W), c) <= 3 for c in centres)}
        s = e.get("StartLocation")
        placed = s is not None and s >= 0
        for mask in itertools.product((False, True), repeat=len(CLAUSES)):
            on = dict(zip(CLAUSES, mask))
            flat = {"TERRAIN_PLAINS", "TERRAIN_GRASS"}
            ok_t = {i for i, n in terr.items() if n in flat or (on["hills ok"] and n in ("TERRAIN_PLAINS_HILLS", "TERRAIN_GRASS_HILLS"))}

            def good(p):
                if p is None or p[3] not in ok_t or p[4] >= 0:
                    return False
                if on["no district"] and p[7] >= 0:
                    return False
                if on["no improvement"] and p[5] >= 0:
                    return False
                if on["no fresh water"] and p[9] is True:
                    return False
                if on["owned"] and p[1] < 0:
                    return False
                return True
            base = [i for i, p in plots.items() if good(p) and (not on["within 3 of a centre"] or i in near3)]
            cnt = {i: sum(1 for j in nb[i] if good(plots.get(j))) for i in base}
            for k in range(0, 7):
                cand = [i for i in base if cnt[i] >= k]
                ok = (s in cand) if placed else (not cand)
                name = " + ".join(c for c in CLAUSES if on[c]) or "plain"
                name = f"{name}; >= {k} good neighbours"
                x = res[name]
                x[0 if ok else 1] += 1
                if not ok and len(x[2]) < 4:
                    x[2].append((tag[-5:], e["StartTurn"], s, len(cand)))
    placed = sum(1 for c in cases if (c[1].get("StartLocation") if c[1].get("StartLocation") is not None else -1) >= 0)
    print(f"{len(cases)} droughts, {placed} placed")
    ranked = sorted(res.items(), key=lambda kv: (kv[1][1], kv[0]))
    want = sys.argv[2] if len(sys.argv) > 2 else None
    shown = [kv for kv in ranked if want is None or want in kv[0]]
    for name, (ok, bad, ex) in shown[:25]:
        print(f"   holds {ok:>3} fails {bad:>3}  {name}  {ex}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
