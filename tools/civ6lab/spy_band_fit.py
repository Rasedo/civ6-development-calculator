"""Is the espionage roll 3d6, as session 1 fitted?

UnitManager.GetResultProbability hands back six band probabilities per mission.
They are exact binary fractions in 1/256 and they sum to ~253/256, not 1 —
which is the signature of a fixed-point representation with truncation, not of
a distribution with 256 outcomes.

This checks them against 3d6 tail probabilities: if each band is
floor(p_3d6 * 256) / 256, the 3d6 model is confirmed and the missing 3/256 is
just six truncations.
"""
from itertools import product

# measured with a fresh level-1 spy, no promotions, no counterspy
# base -> {band: probability}
MEAS = {
    13: {"SUCCESS_UNDETECTED": 0.2578125, "SUCCESS_MUST_ESCAPE": 0.23828125,
         "FAIL_UNDETECTED": 0.125, "FAIL_MUST_ESCAPE": 0.2109375,
         "CAPTURED": 0.11328125, "KILLED": 0.04296875},
    14: {"SUCCESS_UNDETECTED": 0.16015625, "SUCCESS_MUST_ESCAPE": 0.2109375,
         "FAIL_UNDETECTED": 0.125, "FAIL_MUST_ESCAPE": 0.23828125,
         "CAPTURED": 0.1640625, "KILLED": 0.08984375},
    15: {"SUCCESS_UNDETECTED": 0.08984375, "SUCCESS_MUST_ESCAPE": 0.1640625,
         "FAIL_UNDETECTED": 0.11328125, "FAIL_MUST_ESCAPE": 0.25,
         "CAPTURED": 0.2109375, "KILLED": 0.16015625},
    16: {"SUCCESS_UNDETECTED": 0.04296875, "SUCCESS_MUST_ESCAPE": 0.11328125,
         "FAIL_UNDETECTED": 0.09375, "FAIL_MUST_ESCAPE": 0.23828125,
         "CAPTURED": 0.23828125, "KILLED": 0.2578125},
}

# 3d6 distribution
pmf = {}
for a, b, c in product(range(1, 7), repeat=3):
    pmf[a + b + c] = pmf.get(a + b + c, 0) + 1
TOT = 216


def tail_ge(t):
    return sum(n for s, n in pmf.items() if s >= t) / TOT


print("== every measured band as a count out of 256 ==")
for base, bands in sorted(MEAS.items()):
    counts = {k: round(v * 256) for k, v in bands.items()}
    print(f"  base {base}: " + "  ".join(f"{k.split('_')[0][:4]}{'U' if k.endswith('UNDETECTED') else 'E' if 'ESCAPE' in k else ''}"
                                         f"={c}" for k, c in counts.items())
          + f"   sum={sum(counts.values())}/256")

print("\n== does each band equal floor(3d6 tail * 256)/256 for SOME margin? ==")
for base, bands in sorted(MEAS.items()):
    print(f"  base {base}")
    for name, p in sorted(bands.items(), key=lambda kv: -kv[1]):
        hit = None
        for t in range(3, 22):
            for f in (tail_ge(t), 1 - tail_ge(t), pmf.get(t, 0) / TOT):
                if int(f * 256) / 256 == p:
                    hit = (t, round(f, 5))
                    break
            if hit:
                break
        print(f"    {name:<22} {p:.8f} = {round(p*256):>3}/256   "
              + (f"matches floor(256 * {hit[1]}) from a 3d6 threshold at {hit[0]}" if hit else "NO 3d6 match"))

print("\n== the decisive one: cumulative success vs the 3d6 tail ==")
for base, bands in sorted(MEAS.items()):
    succ = bands["SUCCESS_UNDETECTED"] + bands["SUCCESS_MUST_ESCAPE"]
    best = min(range(3, 22), key=lambda t: abs(tail_ge(t) - succ))
    print(f"  base {base}: measured success {succ:.5f}   nearest 3d6 tail P(X>={best}) = {tail_ge(best):.5f}"
          f"   delta {abs(tail_ge(best)-succ):.5f}")
