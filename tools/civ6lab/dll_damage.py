"""The combat damage law as GameCore_XP2_Release.dll computes it (0x519090,
its struct filled by 0x519370 / 0x519440), scored on the lab's drawn
interceptions (`runs/c34w_strike_*.jsonl`: the seed's two draws on range 12,
the bomber's and the interceptor's damage after) against the engines'
round((24 + r) * 1.04^delta).

    damage = trunc((COMBAT_BASE_DAMAGE 24 + r) * expf(x) + 0.5), clamped to
             [COMBAT_MINIMUM_DAMAGE 1, COMBAT_MAX_HIT_POINTS 100]
    x      = (k * D) >> 8 read as 1/256ths, D the strength difference in
             1/256ths, k = the 1/256ths of COMBAT_POWER_SCALING 0.04 truncated:
             trunc(0.04 * 256) = 10, so x = 10 * delta / 256 = 0.0390625 * delta

so the per-point factor is e^0.0390625 = 1.03984, not 1.04: a fitted 1.04
curve sees delta * 0.0390625 / ln 1.04 = 0.99597 delta (26.89 at 27).

    python tools/civ6lab/dll_damage.py [records...]
"""
from __future__ import annotations

import glob
import json
import math
import struct
import sys

K256 = int(0.04 * 256)  # the float parameter cut to 8 fractional bits: 10


def f32(v: float) -> float:
    return struct.unpack("<f", struct.pack("<f", v))[0]


def dll_damage(r: int, delta: float) -> int:
    d256 = math.floor(delta * 256)
    x = (K256 * d256) >> 8
    e = f32(math.exp(f32((x & 0xFF) * 0.00390625 + (x >> 8))))
    v = int(f32(f32((24 + r) * e) + 0.5))
    return max(1, min(100, v))


def engine_damage(r: int, delta: float) -> int:
    return max(1, min(100, round((24 + r) * 1.04 ** delta)))


def main() -> None:
    files = sys.argv[1:] or sorted(glob.glob("tools/civ6lab/runs/c34w_strike_*.jsonl"))
    rows = []
    for f in files:
        for ln in open(f, encoding="utf-8"):
            r = json.loads(ln)
            if r.get("kind") != "strike" or not r.get("draws") or not r.get("preview"):
                continue
            pv = r["preview"][0]
            it = pv.get("INTERCEPTOR", {})
            if it.get("ID", {}).get("player", -1) == -1:
                continue
            # the interception's pair: the interceptor's Combat and modifier
            # against the bomber's Combat 85 less its 15 (the preview's pair
            # on every rig, 97 v 70; a preview aimed at a unit shows the
            # strike's own attacker modifier instead)
            delta = (it["COMBAT_STRENGTH"] + it["STRENGTH_MODIFIER"]) - 70
            b = r["before"]
            bomber = next(k for k in b if b[k] and b[k]["type"] == "UNIT_BOMBER")
            fighter = next(k for k in b if b[k] and b[k]["type"] == "UNIT_FIGHTER")
            bd = r["after"][bomber]["dmg"] if r["after"].get(bomber) else 100
            fd = (r["after"].get(fighter) or {"dmg": 100})["dmg"]
            rows.append((r["tag"], r["d12"][0], r["d12"][1], delta, bd, fd, it["DAMAGE_FROM"], it["DAMAGE_TO"]))
    for name, law in (("dll", dll_damage), ("engines 1.04", engine_damage)):
        ok = sum(min(100, law(r1, dl)) == bd and law(r2, -dl) == fd for _, r1, r2, dl, bd, fd, _, _ in rows)
        pv = sum(law(6, dl) == ad and law(6, -dl) == itd for _, _, _, dl, _, _, ad, itd in rows)
        print(f"{name:>13}: drawn interceptions {ok}/{len(rows)} (bomber and interceptor both); "
              f"previews (r = 6) {pv}/{len(rows)}")
    for tag, r1, r2, dl, bd, fd, _, _ in rows:
        print(f"   {tag:>8} r {r1:>2},{r2:>2} delta {dl:+} bomber {bd:>3} (dll {dll_damage(r1, dl):>3}, 1.04 "
              f"{engine_damage(r1, dl):>3})  interceptor {fd:>3} (dll {dll_damage(r2, -dl):>3}, 1.04 "
              f"{engine_damage(r2, -dl):>3})")
    # the ~0.1: where the laws part over the whole draw range
    diff = [(r, d) for r in range(12) for d in range(-60, 61) if dll_damage(r, d) != engine_damage(r, d)]
    print(f"(r, delta) cells in 0..11 x -60..60 where the laws differ: {len(diff)} of {12 * 121}")


if __name__ == "__main__":
    main()
