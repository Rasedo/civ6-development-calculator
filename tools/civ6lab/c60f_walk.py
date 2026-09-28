"""The ring walk the engines ship (`hexRingWalk`): ring r of a centre in
odd-r offset coordinates, from its W corner along the NE, E, SE, SW, W and
NW legs. Prints the order and, given a ring read (`c60f_ring.lua` jsonl) and
the plots held at the grant (x:y;...), the predicted plot.

    python tools/civ6lab/c60f_walk.py 20 32 2 --ring runs/c60f_ring_mex_t203.jsonl --held "19:33;20:33"
"""
import argparse
import json


def to_cube(x, y):
    q = x - (y - (y & 1)) // 2
    return q, y


def to_off(q, r):
    return q + (r - (r & 1)) // 2, r


DIRS = {"E": (1, 0), "W": (-1, 0), "NE": (1, -1), "NW": (0, -1), "SE": (0, 1), "SW": (-1, 1)}


def ring(cx, cy, n):
    q, r = to_cube(cx, cy)
    q += DIRS["W"][0] * n
    r += DIRS["W"][1] * n
    out = []
    for leg in ("NE", "E", "SE", "SW", "W", "NW"):
        for _ in range(n):
            out.append(to_off(q, r))
            q += DIRS[leg][0]
            r += DIRS[leg][1]
    return out


p = argparse.ArgumentParser()
p.add_argument("x", type=int)
p.add_argument("y", type=int)
p.add_argument("n", type=int)
p.add_argument("--ring", default="")
p.add_argument("--held", default="")
a = p.parse_args()
order = ring(a.x, a.y, a.n)
print("order", order)
if a.ring:
    info = {}
    for line in open(a.ring, encoding="utf-8"):
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if r.get("kind") == "ring":
            info[(r["x"], r["y"])] = r
    held = {tuple(int(v) for v in s.split(":")) for s in a.held.split(";") if s}
    for xy in order:
        r = info.get(xy)
        usable = r is not None and not r["water"] and not r["mountain"] and not r["impassable"] and r["district"] < 0
        print(xy, "usable" if usable else "no", "held" if xy in held else "")
    pick = next((xy for xy in order if xy not in held and info.get(xy) and not info[xy]["water"]
                 and not info[xy]["mountain"] and not info[xy]["impassable"] and info[xy]["district"] < 0), None)
    print("predicted", pick)
