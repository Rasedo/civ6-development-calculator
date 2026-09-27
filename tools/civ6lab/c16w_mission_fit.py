"""C-16-S1 (lab, host 4): the MISSION roll against a guarded district, from
`c16w_cycle.py` logs. Each completed mission (`spy_history.lua`'s lines,
deduplicated by spy and completion turn) is one 3d6 read in six bands
(tools/civ6lab/README: margin d = R - T, T = BaseProbability - 2 for a
fresh spy); the counterspy's post at the completion turn is read from the
log's `defender` line of that turn. Fits a threshold shift s for the guarded
missions against the install's `EnemyProbChange` / `EnemyLevelProbChange`
(Siphon Funds: 3 and 1 per level) and against no term.

    python tools/civ6lab/c16w_mission_fit.py tools/civ6lab/runs/escape_cs_c16w_guard3b.log
"""
from __future__ import annotations

import itertools
import math
import re
import sys

P = [0.0] * 19
for r in itertools.product(range(1, 7), repeat=3):
    P[sum(r)] += 1 / 216
# EspionageResultTypes as the history prints them (escape_fit.py's decoding)
CODE = {5: 0, 4: 1, 3: 2, 2: 3, 1: 4, 0: 5, 6: 5}
NAMES = ["success undetected", "success must escape", "fail undetected", "fail must escape", "captured", "killed"]


def bands(t: int) -> list[float]:
    b = [0.0] * 6
    for r in range(3, 19):
        d = r - t
        i = 0 if d >= 2 else 1 if d >= 0 else 2 if d == -1 else 3 if d >= -3 else 4 if d >= -5 else 5
        b[i] += P[r]
    return b


def main() -> None:
    missions: dict[tuple[str, int], dict] = {}
    post: dict[int, bool] = {}
    pending = None
    for path in sys.argv[1:]:
        for ln in open(path, encoding="utf-8"):
            if ln.startswith("defender"):
                pending = "UNITOPERATION_SPY_COUNTERSPY" in ln
            m = re.match(r"turn (\d+) spies \d+ started", ln)
            if m and pending is not None:
                post[int(m.group(1))] = pending
                pending = None
            if ln.startswith("mission "):
                kv = dict(x.split("=", 1) for x in ln[8:].split() if "=" in x)
                missions[(kv["Name"], int(kv["CompletionTurn"]))] = kv
    rows = []
    for (name, ct), kv in sorted(missions.items(), key=lambda kv: kv[0][1]):
        # the post as read at the start of the completion turn's predecessor
        # (the mission resolves while that turn ends)
        on = post.get(ct - 1, post.get(ct))
        rows.append((ct, name, CODE[int(kv["InitialResult"])], int(kv["LevelAfter"]), on))
    for label, sel in (("post standing", lambda r: r[4] is True), ("post off", lambda r: r[4] is False),
                       ("unknown", lambda r: r[4] is None)):
        rs = [r for r in rows if sel(r)]
        if not rs:
            continue
        obs = [sum(r[2] == i for r in rs) for i in range(6)]
        print(f"== {label}: {len(rs)} missions, bands {dict(zip(NAMES, obs))}")
        for s in range(0, 9):
            b = bands(11 + s)
            ll = sum(o * math.log(max(p, 1e-12)) for o, p in zip(obs, b))
            print(f"   shift {s}: expected {[round(x * len(rs), 1) for x in b]}  logL {ll:.2f}")
    for r in rows:
        print("   ", r[0], r[1], NAMES[r[2]], "levelAfter", r[3], "post", r[4])


if __name__ == "__main__":
    main()
