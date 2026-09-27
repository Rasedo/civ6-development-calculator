"""C-34 (lab, host 4): the interception's draw order and the strike after it,
fitted on the `c34w_strike_*` records. Each strike carries the seed before and
the draws it consumed (range 12). Tests:

* the interception's two draws: which one sets the bomber's damage and which
  the interceptor's, at the damage law round((24 + r) * 1.04^(S_int - S_bomber))
  with the strengths the preview shows (interceptor COMBAT_STRENGTH +
  STRENGTH_MODIFIER against the bomber's Combat + its modifier);
* the strike on the ground unit (the third draw): the damage law at
  Delta0 - (bomber damage)/10, Delta0 fitted, against the same law at full
  health (no wound term).

    python tools/civ6lab/c34w_fit.py tools/civ6lab/runs/c34w_strike_*.jsonl
"""
from __future__ import annotations

import glob
import json
import sys


def dmg(r: int, delta: float) -> int:
    return min(100, int((24 + r) * 1.04 ** delta + 0.5))


def main() -> None:
    files = sys.argv[1:] or sorted(glob.glob("tools/civ6lab/runs/c34w_strike_*.jsonl"))
    rows = []
    for f in files:
        for ln in open(f, encoding="utf-8"):
            r = json.loads(ln)
            if r.get("kind") == "strike" and r.get("draws"):
                rows.append(r)
    inter = []
    strike = []
    for r in rows:
        pv = r["preview"][0] if r["preview"] else {}
        it = pv.get("INTERCEPTOR", {})
        if it.get("ID", {}).get("player", -1) == -1:
            continue
        b = r["before"]
        bomber = next(k for k in b if k.startswith("0:"))
        fighter = next(k for k in b if b[k] and b[k]["type"] == "UNIT_FIGHTER")
        ground = [k for k in b if b[k] and k not in (bomber, fighter) and b[k]["type"] != "UNIT_FIGHTER"
                  and (r["after"].get(k) or {}).get("dmg", 0) != b[k]["dmg"]]
        # the bomber fights the interceptor at its Combat 85 with the attacker's modifier
        s_int = it["COMBAT_STRENGTH"] + it["STRENGTH_MODIFIER"]
        s_bomb = 85 + pv["ATTACKER"]["STRENGTH_MODIFIER"] if pv["ATTACKER"]["COMBAT_STRENGTH"] == 85 else None
        bd = r["after"][bomber]["dmg"]
        fd = r["after"][fighter]["dmg"]
        inter.append((r["tag"], r["seed"], r["d12"], bd, fd, s_int, s_bomb))
        for g in ground:
            strike.append((r["tag"], r["seed"], r["d12"], bd, r["after"][g]["dmg"]))
    print("interception rows:", len(inter))
    for delta in (26, 26.5, 26.9, 27, 27.5):
        a = sum(dmg(d[0], delta) == bd and dmg(d[1], -delta) == fd for _, _, d, bd, fd, _, _ in inter)
        b = sum(dmg(d[1], delta) == bd and dmg(d[0], -delta) == fd for _, _, d, bd, fd, _, _ in inter)
        print(f"  delta {delta}: draw1->bomber, draw2->interceptor {a}/{len(inter)};"
              f"  draw1->interceptor, draw2->bomber {b}/{len(inter)}")
    for row in inter:
        print("   ", row)
    print("strike rows (third draw):", len(strike))
    best = []
    for d10 in range(-100, 101):
        d0 = d10 / 10
        wound = sum(dmg(d[2], d0 - bd / 10) == gd for _, _, d, bd, gd in strike)
        flat = sum(dmg(d[2], d0) == gd for _, _, d, bd, gd in strike)
        best.append((wound, flat, d0))
    w = max(best)
    f = max(best, key=lambda x: (x[1], x[0]))
    print(f"  wound term dmg/10: best {w[0]}/{len(strike)} at Delta0 {w[2]} "
          f"(Delta0 range {[b[2] for b in best if b[0] == w[0]][0]}..{[b[2] for b in best if b[0] == w[0]][-1]})")
    print(f"  no wound term:     best {f[1]}/{len(strike)} at Delta0 {f[2]}")
    for row in strike:
        print("   ", row)


if __name__ == "__main__":
    main()
