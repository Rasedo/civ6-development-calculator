"""C-74-S2: the volcano activity clock at Duel, read every turn.

    python tools/civ6lab/c74s2_volc_fit.py [tag glob]

Per game and volcano: every change of IsActiveVolcano with the turn, the
first turn each major revealed the plot, its owner, the majors' eras and tech
counts and the world era at the change (the reader's "t" line carries them
from game 6 on), and the eruptions; pooled: the direction of every change and
the run lengths.
"""
import collections
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import c74s2_boost as B  # noqa: E402


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    tags = sorted({re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
                   for f in B.RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")})
    pool = collections.Counter()
    vturns = 0
    for tag in tags:
        turns, events = B.load(tag)
        seq = collections.defaultdict(list)
        rev = collections.defaultdict(dict)
        for t in sorted(turns):
            for v in turns[t].get("volc", {}).get("v", []):
                if v[4]:
                    continue
                seq[v[0]].append((t, v[1], v[3]))
                if len(v) > 6:
                    for p in v[6]:
                        rev[v[0]].setdefault(p, t)
        print(f"\n{tag}: {len(seq)} volcanoes")
        for plot, s in seq.items():
            vturns += len(s)
            ch = [(t, a) for (t, a, _), (_, b, _) in zip(s[1:], s) if a != b]
            first = s[0][1]
            erup = [st for st, row, loc in events if loc == plot]
            info = []
            for t, a in ch:
                pool["off->on" if a else "on->off"] += 1
                tt = turns[t]["t"]
                info.append((t, "on" if a else "off", tt.get("eras"), tt.get("techs"), tt.get("worldEra")))
            revmaj = {p: t for p, t in rev[plot].items() if p < 2}
            print(f"   volcano {plot}: at t{s[0][0]} {'active' if first else 'inactive'}; changes {info}; "
                  f"revealed by majors at {revmaj}; eruptions {erup}")
            pool["start active" if first else "start inactive"] += 1
            if not ch:
                pool["never changed"] += 1
    print(f"\npooled over {vturns} volcano-turns: {dict(pool)}")


if __name__ == "__main__":
    main()
