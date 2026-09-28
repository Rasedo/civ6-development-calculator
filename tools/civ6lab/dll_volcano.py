"""C-74: what wakes a volcano, as GameCore_XP2_Release.dll codes it
(Game_RandomEvents "Active Volcano Roll" 0x335040, run each turn before the
event draw from 0x338710; the choice 0xa20f20 / 0xa212d0; N 0x339020; the
volcano set's virtuals: 0x50 = 0xa1d310 the active percent over the
volcanoes AND the volcanic wonders, 0x58 = 0xa1d130 the active volcanoes,
0x68(b) = 0xa1d2b0 the volcanoes, only those whose field +8 is not -1 when
b), replayed on the Duel games' per-turn volcano reads (runs/c74s2_turn_*).

    python tools/civ6lab/dll_volcano.py [tag glob, default c74s2_duel*]

The rule, ONE roll per turn for the whole map:
  V = the volcanoes, E = those with field +8 set (read here two ways: every
      volcano, or the OWNED ones, +8 being the owner), A = the active ones,
      pct = 100 (A + active wonders) // (V + wonders);
  N = the game's last turn - its start turn (else the speed's GameSpeed_Turns
      total: Online 250, Standard 500; else 500); D = N // (2 V);
  no roll unless E > 0;
  pct < PercentVolcanoesActive (MODERATE 70): if (70 - pct) x E >= 200,
      D = D // ((70 - pct) x E // 100); with rand(D) == 0 ONE dormant
      volcano of E, drawn uniformly ("Choose Active Volcano Roll"), wakes;
  pct >= 70 and A > 0: with rand(D) == 0 ONE active volcano goes dormant
      ("Choose Inactive Volcano Roll").
"""
from __future__ import annotations

import collections
import math
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import c74s2_boost as B  # noqa: E402

TARGET = 70


def chance(n: int, v: int, e: int, a: int, dormant_e: int, nw: int, nwa: int) -> tuple[str, float]:
    if e <= 0 or v <= 0:
        return "none", 0.0
    pct = 100 * (a + nwa) // (v + nw)
    d = n // (2 * v)
    if pct < TARGET:
        if dormant_e <= 0:
            return "none", 0.0
        x = (TARGET - pct) * e
        if x >= 200:
            d = d // (x // 100)
        return "wake", 1 / max(d, 1)
    return ("sleep", 1 / max(d, 1)) if a > 0 else ("none", 0.0)


def load(pat: str):
    tags = sorted({re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
                   for f in B.RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")})
    games = []
    for tag in tags:
        turns, _ = B.load(tag)
        seq = []
        for t in sorted(turns):
            allv = turns[t].get("volc", {}).get("v", [])
            vs = {v[0]: (bool(v[1]), v[3]) for v in allv if not v[4]}
            nw = {}
            for v in allv:
                if v[4]:
                    key = v[5] if len(v) > 5 else "nw"
                    nw[key] = nw.get(key, False) or bool(v[1])
            if vs:
                seq.append((t, vs, len(nw), sum(nw.values())))
        games.append((tag, seq))
    return games


def main() -> int:
    games = load(sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*")
    for owned in (False, True):
        for n in (250, 500):
            ll = 0.0
            tally = collections.Counter()
            for tag, seq in games:
                for (t0, s0, nw0, nwa0), (t1, s1, _, _) in zip(seq, seq[1:]):
                    if t1 != t0 + 1 or set(s0) != set(s1):
                        continue
                    elig = [k for k, (act, own) in s0.items() if (own >= 0 or not owned)]
                    a = sum(act for act, _ in s0.values())
                    dormant_e = sum(1 for k in elig if not s0[k][0])
                    mode, p = chance(n, len(s0), len(elig), a, dormant_e, nw0, nwa0)
                    woke = [k for k in s0 if not s0[k][0] and s1[k][0]]
                    slept = [k for k in s0 if s0[k][0] and not s1[k][0]]
                    tally[(mode, "turns")] += 1
                    tally[(mode, "exp")] += p
                    tally[(mode, "woke")] += len(woke)
                    tally[(mode, "slept")] += len(slept)
                    tally["woke unowned"] += sum(1 for k in woke if s0[k][1] < 0)
                    ll += math.log(max(p if (woke or slept) else 1 - p, 1e-9))
            print(f"{'owned only' if owned else 'every volcano'} N {n}: logL {ll:.1f}; " + "; ".join(
                f"{m} {tally[(m, 'turns')]} turns exp {tally[(m, 'exp')]:.1f} woke {tally[(m, 'woke')]}"
                f" slept {tally[(m, 'slept')]}" for m in ("wake", "sleep", "none"))
                + f"; wakes of an unowned volcano {tally['woke unowned']}")
    for tag, seq in games:
        if seq:
            print(f"  {tag}: {len(seq[0][1])} volcanoes, {seq[0][2]} volcanic wonders, turns {seq[0][0]}..{seq[-1][0]},"
                  f" active at end {sum(a for a, _ in seq[-1][1].values())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
