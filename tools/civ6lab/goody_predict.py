"""Pick seeds that should land in a NAMED goody-hut category, to turn the fit
into a prediction.

Fitted from eight pops: draw 1 selects the category as floor(u * 6) over the six
equal-weight GoodyHuts rows in XML order
    0 CULTURE  1 GOLD  2 FAITH  3 MILITARY  4 SCIENCE  5 SURVIVORS
and draw 2 selects the subtype against the cumulative 15/30/55 weights
    [0,15) LARGE   [15,45) MEDIUM   [45,100) SMALL
Faith and gold are the two categories whose payout is directly readable, so a
seed aimed at FAITH is the cleanest test of the mapping.
"""
M = 1 << 32
A, C = 1103515245, 12345
CATS = ["CULTURE", "GOLD", "FAITH", "MILITARY", "SCIENCE", "SURVIVORS"]
SUB = [(15, "LARGE"), (45, "MEDIUM"), (100, "SMALL")]


def step(s):
    return (A * (s % M) + 12345) % M


def first_two(seed):
    s1 = step(seed)
    s2 = step(s1)
    return (s1 >> 17) / 32768, (s2 >> 17) / 32768


def sub_of(u2):
    v = int(u2 * 100)
    for hi, name in SUB:
        if v < hi:
            return name
    return "SMALL"


want = {"FAITH": [], "GOLD": [], "CULTURE": []}
seed = 1
while any(len(v) < 3 for v in want.values()) and seed < 400000:
    u1, u2 = first_two(seed)
    cat = CATS[min(int(u1 * 6), 5)]
    if cat in want and len(want[cat]) < 3:
        want[cat].append((seed, round(u1, 5), round(u2, 5), sub_of(u2)))
    seed += 997

for cat, rows in want.items():
    for seed, u1, u2, sub in rows:
        print(f"seed {seed:>7}  u1={u1:<8} -> {cat:<9}  u2={u2:<8} -> {sub}")
