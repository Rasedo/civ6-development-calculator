"""How many rng draws does popping a tribal village consume?

The generator is known, so stepping it from the seed that was set until it
matches the seed read afterwards counts the draws and recovers each value.
GoodyHuts.xml is a two-level weighted draw (category, then subtype), so the
expectation is 2 — any more means the reward itself rolls something.
"""
import sys

M = 1 << 32
A, C = 1103515245, 12345


def u32(x):
    return x % M


def step(s):
    return u32(A * u32(s) + C)


def account(before, after, limit=40):
    s = u32(before)
    vals = []
    for n in range(1, limit + 1):
        s = step(s)
        vals.append(s >> 17)          # the top-15-bit value each draw is folded from
        if s == u32(after):
            return n, vals
    return None, vals


OBS = [(555000, 2033392183)]
if len(sys.argv) > 2:
    OBS = [(int(sys.argv[1]), int(sys.argv[2]))]

for before, after in OBS:
    n, vals = account(before, after)
    if n is None:
        print(f"seed {before} -> {after}: more than 40 draws (or not this stream)")
    else:
        print(f"seed {before} -> {after}: {n} draws")
        for i, v in enumerate(vals[:n], 1):
            print(f"   draw {i}: top15 = {v:>6}   u = {v/32768:.5f}   "
                  f"(x6 -> {v*6//32768}, x100 -> {v*100//32768})")
