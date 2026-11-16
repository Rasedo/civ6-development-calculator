"""FIRSTDIFF: where a kind's rows begin on a seed, and what the game did
that turn and the one before.

    python tools/aiport/firstdiff.py <seed> <kind> [--player P] [--subject TEXT] [--src <bar or window>] [--groups N] [--no-events] [--all]

From the source's rows of the seed and kind (default source: the newest
bar holding the seed; `--kind` globs as in rows.py), grouped by player and
item: each group's first turn, its spans and its difference there, the
earliest first. Then, for the earliest group (or the one --player /
--subject leave): its rows of the first turn and SHOW's `events` of that
player for the turn before and the turn itself — what changed as the row
began to differ.
"""
from __future__ import annotations

import argparse
import fnmatch
import re
from collections import defaultdict

import common
import rows as R
import show as S


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("seed")
    ap.add_argument("kind")
    ap.add_argument("--player", type=int)
    ap.add_argument("--subject")
    ap.add_argument("--src")
    ap.add_argument("--groups", type=int, default=12)
    ap.add_argument("--no-events", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--wide", type=int, default=300)
    a = ap.parse_args()
    common.utf8()
    src = R.source(a.src) if a.src else str(common.newest_bar(a.seed) or "")
    if not src:
        raise SystemExit(f"no bar holds seed {a.seed}: name --src")
    kinds = a.kind.split(",")
    subj = re.compile(a.subject) if a.subject else None
    rows = [r for r in common.read_rows(src) if r.seed == a.seed and any(fnmatch.fnmatchcase(r.kind, k) for k in kinds)
            and (a.player is None or r.player == a.player) and (not subj or subj.search(r.subject))]
    print(f"# {src}: seed {a.seed}, {a.kind}: {len(rows)} rows")
    if not rows:
        return 0
    groups: dict[tuple, list] = defaultdict(list)
    for r in rows:
        groups[(r.kind, r.player, R.item_of(r))].append(r)
    order = sorted(groups.items(), key=lambda kv: (min(r.turn for r in kv[1]), -len(kv[1])))
    print(f"{'first':>6} {'rows':>4}  kind | player | item  ||  spans  ||  the first row's ours // game")
    for (kind, player, item), rs in order[:a.groups]:
        first = min(rs, key=lambda r: r.turn)
        print(f"{'t' + str(first.turn):>6} {len(rs):>4}  {kind} | p{player} | {item or '-'}  ||  t{common.spans(r.turn for r in rs)}  ||  {first.ours[:60]} // {first.game[:60]}")
    if len(order) > a.groups:
        print(f"       ... {len(order) - a.groups} more groups (--groups N)")
    (kind, player, item), rs = order[0]
    t0 = min(r.turn for r in rs)
    print(f"\n== the earliest: {kind} p{player} {item or ''}: first differs at t{t0}, {len(rs)} rows over t{common.spans(r.turn for r in rs)}")
    for r in [r for r in rs if r.turn == t0][:8]:
        print(f"  {r.line[6:a.wide + 6]}")
    others = [r for r in rows if r.turn == t0 and r.player == player and (r.kind, R.item_of(r)) != (kind, item)]
    if others:
        print(f"  the player's other rows of these kinds at t{t0}: {len(others)}")
    if a.no_events or player is None:
        return 0
    for t in (t0 - 1, t0):
        if t < 1:
            continue
        print()
        g = S.Game(a.seed, t)
        ns = argparse.Namespace(player=player, unit=None, all=a.all, wide=a.wide, plot=None, city=None)
        S.what_events(g, ns)
    print(f"\nnext: python tools/aiport/show.py {a.seed} {t0} --player {player} --what <trees|contracts|kb|ops|units|planning|targets|danger|builds|research>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
