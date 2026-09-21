"""Fit the anti-air preview damage curve to the support-free sweep.

Every row below is a read of CombatManager.SimulateAttackInto's ANTI_AIR
DAMAGE_FROM with exactly ONE interceptor adjacent and nothing else on the
board, so the only quantity moving is delta = S_att - S_def. Three different
interceptors (AntiAirCombat 90, 100 and 130) and six air units agree wherever
they share a delta, so the reading is a function of delta alone.

Interval arithmetic, not least squares: a rounding rule turns each observed
integer into an interval for c*exp(k*delta), and a (c, k) pair survives only
if EVERY row's interval holds. The printed band is the exact feasible set.
"""
import json
import math

# delta -> observed DAMAGE_FROM (uncapped rows only)
ROWS = [(-20, 14), (-15, 17), (-10, 20), (-5, 25), (0, 30), (5, 36),
        (10, 44), (15, 54), (20, 66), (25, 80), (30, 97)]

for rule, lo_off, hi_off in (("floor", 0.0, 1.0), ("round", -0.5, 0.5)):
    band = []
    for ki in range(3400, 4400):
        k = ki / 100000
        lo, hi = 0.0, 1e9
        for delta, d in ROWS:
            e = math.exp(k * delta)
            lo = max(lo, (d + lo_off) / e)
            hi = min(hi, (d + hi_off) / e)
        if lo < hi:
            band.append((k, lo, hi))
    if not band:
        print(json.dumps({"rule": rule, "feasible": False}))
        continue
    print(json.dumps({"rule": rule, "feasible": True,
                      "kLow": band[0][0], "kHigh": band[-1][0],
                      "widest": max(band, key=lambda b: b[2] - b[1])}))
    mid = band[len(band) // 2]
    k = mid[0]
    c = (mid[1] + mid[2]) / 2
    pred = []
    for delta, d in ROWS:
        v = c * math.exp(k * delta)
        p = math.floor(v) if rule == "floor" else math.floor(v + 0.5)
        pred.append({"delta": delta, "obs": d, "raw": round(v, 3), "pred": p, "ok": p == d})
    print(json.dumps({"rule": rule, "c": round(c, 4), "k": k, "rows": pred}))

# is the exact shipped pair (30, 0.04) compatible with any rounding rule?
for rule in ("floor", "round", "ceil"):
    bad = []
    for delta, d in ROWS:
        v = 30 * math.exp(0.04 * delta)
        p = {"floor": math.floor(v), "round": math.floor(v + 0.5), "ceil": math.ceil(v)}[rule]
        if p != d:
            bad.append({"delta": delta, "obs": d, "pred": p, "raw": round(v, 2)})
    print(json.dumps({"shipped_30_0.04": rule, "misses": bad}))
