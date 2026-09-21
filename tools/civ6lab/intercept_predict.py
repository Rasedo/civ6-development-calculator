"""Pre-registered predictions for the interception law.

Fitted from two clean rounds (u=0.05 -> 43 damage, landed; u=0.48 -> 52,
intercepted), both giving the same anti-air base:

    damage      = round(52.4 * (0.8 + 0.4u))
    intercepted <=> damage > 50   <=>   u > 0.3854

Prints the seed, the predicted damage and the predicted outcome for a spread of
u, so the battery that follows is a test rather than a fit.
"""
M = 1 << 32
A = 1103515245
B = 52.4


def u_of(seed):
    return ((((A * (seed % M) + 12345) % M) >> 17)) / 32768


wants = [0.10, 0.20, 0.30, 0.36, 0.40, 0.45, 0.60, 0.80, 0.95]
best = {w: (None, 9) for w in wants}
for seed in range(1, 300000):
    u = u_of(seed)
    for w in wants:
        d = abs(u - w)
        if d < best[w][1]:
            best[w] = (seed, d)

seeds = []
print("seed        u      predicted damage   predicted outcome")
for w in wants:
    s = best[w][0]
    u = u_of(s)
    dmg = round(B * (0.8 + 0.4 * u))
    seeds.append(s)
    print(f"{s:>7}  {u:.5f}        {dmg:>3}          "
          f"{'INTERCEPTED' if dmg > 50 else 'lands'}")
print("\n" + " ".join(str(s) for s in seeds))
