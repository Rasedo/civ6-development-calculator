"""C-16 (lab 5g): which resolutions take the counterspy off its post, from a
`c16n_cycle.py` log of a posted arm. A mission completing on turn T resolves
in the turn processing before T, against the post the grab of T - 1 left; the
grab of T reads whether the post still stands (`grabbed p1: def: ... op`).
Prints, per outcome band of the resolved missions, how often the post was
read off at the next grab, and the turns with no resolution.

    python tools/civ6lab/c16g_postoff.py tools/civ6lab/runs/escape_cs_c16g_l1hub.log
"""
from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
import c16n_fit as f  # noqa: E402

TURN = re.compile(r"^turn (\d+) spies \d+ started")
GRAB = re.compile(r"grabbed p\d+: def: spy \d+ at -?\d+:-?\d+ level \d+ xp \d+ promos \S* ?op (\S+)")


def main(path: str) -> None:
    missions, _, _, _ = f.read([path])
    on_at = {}
    cur = None
    for ln in open(path, encoding="utf-8", errors="replace"):
        m = TURN.match(ln)
        if m:
            cur = int(m.group(1))
            continue
        m = GRAB.search(ln)
        if m and cur is not None and cur not in on_at:
            on_at[cur] = "COUNTERSPY" in m.group(1)
    by_turn = defaultdict(list)
    for (name, ct, _), kv in missions.items():
        by_turn[ct].append(f.NAMES[f.CODE[int(kv["InitialResult"])]])
    first = min(on_at)
    tally = Counter()
    for ct in sorted(on_at):
        if ct - 1 < first or not on_at.get(ct - 1, False):
            continue  # the post did not stand when this turn's missions resolved
        outs = by_turn.get(ct, [])
        key = "+".join(sorted(outs)) if outs else "no resolution"
        tally[(key, "off" if not on_at[ct] else "on")] += 1
    for (key, state), n in sorted(tally.items()):
        print(f"{key:40s} post {state} at the next grab: {n}")


if __name__ == "__main__":
    main(sys.argv[1])
