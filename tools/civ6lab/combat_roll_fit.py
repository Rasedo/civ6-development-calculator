"""Turn seeded shots into a measured combat multiplier.

The generator is known exactly, so from (seedBefore, seedAfter) the number of
draws a shot consumed can be counted by stepping the LCG, and every drawn value
is then known. Civ 6's published formula is
    damage = 30 * e^(0.04 * strengthDifference) * randomBetween(80%, 120%)
which both engines ship; this checks the random half against the real stream.
"""
import math

M = 1 << 32
A, C = 1103515245, 12345


def u32(x):
    return x % M


def s32(x):
    x %= M
    return x - M if x >= (1 << 31) else x


def step(s):
    return u32(A * u32(s) + C)


def draws_between(before, after, limit=12):
    """How many LCG steps from `before` to `after`, and the 15-bit value each."""
    s = u32(before)
    vals = []
    for n in range(1, limit + 1):
        s = step(s)
        vals.append(s >> 17)
        if s == u32(after):
            return n, vals
    return None, vals


# (seed, damage) with the defender at FULL health; the seed-1 row is dropped
# because that shot hit a defender still at 66 HP from the previous test and a
# wounded unit fights weaker.
SHOTS = [(1000, 34, -291337727), (5000, 30, -1456738015), (100000, 25, 929776217),
         (777777, 34, -307840746), (31337, 28, 2075544814), (999999, 33, -395798772)]
DIRTY = [(1, 64, 1103527590)]

print("== how many draws does one ranged attack consume? ==")
for seed, dmg, after in SHOTS + DIRTY:
    n, vals = draws_between(seed, after)
    print(f"  seed {seed:>7}  damage {dmg:>3}  draws {n}  first15 {vals[0] if vals else '-'}")

print("\n== the multiplier implied by each shot, if damage = base * (0.8 + 0.4u) ==")
rows = []
for seed, dmg, after in SHOTS:
    n, vals = draws_between(seed, after)
    if not n:
        continue
    u = vals[0] / 32768.0
    rows.append((seed, dmg, u, n))
for seed, dmg, u, n in sorted(rows, key=lambda r: r[2]):
    print(f"  u={u:.4f}  damage {dmg:>3}   (draws {n})")

if rows:
    us = [r[2] for r in rows]
    ds = [r[1] for r in rows]
    n = len(rows)
    mu, md = sum(us) / n, sum(ds) / n
    cov = sum((u - mu) * (d - md) for u, d in zip(us, ds))
    var = sum((u - mu) ** 2 for u in us)
    slope = cov / var if var else float("nan")
    inter = md - slope * mu
    print(f"\n  least squares: damage = {inter:.2f} + {slope:.2f} * u")
    print(f"  implied base (damage at u=0.5) = {inter + slope * 0.5:.2f}")
    print(f"  implied spread = {slope / (inter + slope * 0.5) * 100:.1f}% of base across u in [0,1)")
    print("  (the published rule is 80%..120%, i.e. a spread of 40% of base)")
