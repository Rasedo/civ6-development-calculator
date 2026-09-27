"""Turn order: where named sync-draw reasons sit inside their game turn.

    python tools/civ6lab/turnorder_randpos.py <RandCalls.csv> "World Congress Resolutions" ["Storm Direction" ...]

For every complete turn of every segment (turnorder_randcalls.read), and each
named reason present in it: how many draws of OTHER reasons come after the
reason's last draw (0 = it closes the turn) and before its first draw (0 = it
opens the turn), and which reasons those are.
"""
from __future__ import annotations

import collections
import sys

sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
from turnorder_randcalls import by_turn, read  # noqa: E402


def main() -> None:
    path, names = sys.argv[1], sys.argv[2:]
    for name in names:
        closes = opens = n = 0
        after = collections.Counter()
        before = collections.Counter()
        for seg in read(path):
            turns = by_turn(seg)
            for t in list(turns)[1:-1]:
                rs = [r[4] for r in turns[t]]
                idx = [i for i, x in enumerate(rs) if x == name]
                if not idx:
                    continue
                n += 1
                tail = [x for x in rs[idx[-1] + 1:] if x != name]
                head = [x for x in rs[:idx[0]] if x != name]
                closes += not tail
                opens += not head
                after.update(set(tail))
                before.update(set(head))
        print(f"{name!r}: {n} turns; closes the turn in {closes}, opens it in {opens}")
        print("   reasons seen AFTER it (turns):", dict(after.most_common(8)))
        print("   reasons seen BEFORE it (turns):", dict(before.most_common(8)))


if __name__ == "__main__":
    main()
