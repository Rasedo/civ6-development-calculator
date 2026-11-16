"""ROWS: the missed rows of a bar or a window, filtered and grouped, with
the turn spans each group runs over; or two sources compared.

    python tools/aiport/rows.py <src> [filters] [--by seed,kind,player,class,item,unit,sign,shape] [--top N] [--rows [N]]
    python tools/aiport/rows.py <src A> --cmp <src B> [filters] [--rows [N]]

<src>: a bar directory (`.claude/scratchpad/aiscore/p89m`, or just `p89m`),
a window directory (`<wt>/.claude/scratchpad/win/<tag>`), one log file, or
an `--aiscore <out>` stem whose output was kept as `<out>.log`.

Filters: --kind K[,K] (a `*` globs: `plan.*`), --seed S[,S], --player
P[,P] (a number, or barb, free, minor, major), --turns A-B, --subject TEXT
(a regular expression over the subject), --text TEXT (over the whole row),
--third (the third table's kinds alone), --all (every kind). With no
--kind the decision and memory kinds alone, as groups_p<N>.md counts them.

Group keys (--by, default kind,item,sign):
  seed, kind, player (p<N>), class (barbarians, free cities, major,
  city-state), unit (<player>:<id>), subject (whole),
  item   what the row is of: a score row's technology, civic or card; a
         move row's family; a unit row's type; a build row's city; a
         planning row's unit type and target class
  sign   ours against the game's: over / under / ours none / game none /
         unlogged for numbers; `A for B` for a move's family; else empty
  shape  the size of the difference: ours minus the game's for numbers;
         for lists the entries only one side holds (plots and ids
         squashed); for `only N:` rows the two counts
Each group: its rows, its seeds, then per seed and player the turn spans
(`1157/p3:t198-203`), the longest first. A cause usually shows as one item
off by one constant over one span on one player: `--by seed,player,item,shape`.

--cmp: rows A holds and B does not (gone), rows B holds and A does not
(new), by kind and by seed, over the seeds and the turns both scored (a
window against a bar is cut to the window's turns). --rows prints them.
"""
from __future__ import annotations

import argparse
import fnmatch
import pathlib
import re
from collections import Counter, defaultdict

import common
from common import Row, THIRD, player_class, spans

KEYS = ("seed", "kind", "player", "class", "item", "unit", "subject", "sign", "shape")
CLASS_WORDS = {"barb": "barbarians", "barbarians": "barbarians", "free": "free cities", "minor": "city-state", "cs": "city-state",
               "major": "major"}
NONE_AT = -9000


def num(s: str) -> float | None:
    try:
        return float(s)
    except ValueError:
        return None


def item_of(r: Row) -> str:
    k, s = r.kind, r.subject
    if k.endswith((".move.plot",)):
        m = re.search(r"\((.*)\)$", s)
        return m.group(1) if m else ""
    if k.startswith("plan."):
        m = re.match(r"p\d+ u\S+ (\S+)(?: > ([A-Z_]+)@)?", s)
        return (m.group(1) + (f" > {m.group(2)}" if m.group(2) else "")) if m else ""
    if k in ("builder.improve", "unit.trained", "unit.bought", "unit.promote", "barb.unit"):
        return re.sub(r"\d+(\.\d+)?", "#", r.ours)[:70]
    if k == "freeCities.build":
        return s
    parts = s.split(" ", 1)
    if re.match(r"(p\d+|\d+:\d+)$", parts[0]):
        return parts[1] if len(parts) > 1 else ""
    return s


def squash(e: str) -> str:
    """an entry with its plots and long numbers squashed"""
    return re.sub(r"\d{3,}", "#", re.sub(r"\d+:\d+", "@", e))


def entries(text: str) -> list[str]:
    if text in ("none", ""):
        return []
    return [x.strip() for x in (text.split(", ") if ", " in text or "|" in text else text.split(" ")) if x.strip()]


def only_counts(text: str) -> int:
    m = re.search(r" only (\d+):", text)
    return int(m.group(1)) if m else 0


def bucket(n: int) -> str:
    return "0" if n == 0 else "1" if n == 1 else "2-4" if n <= 4 else "5-15" if n <= 15 else "16+"


def sign_of(r: Row) -> str:
    a, b = num(r.ours), num(r.game)
    if r.game == "unlogged":
        return "unlogged"
    if r.kind.endswith(".move.plot"):
        return ""
    if a is not None and b is not None:
        if a <= NONE_AT < b:
            return "ours none"
        if b <= NONE_AT < a:
            return "game none"
        return "over" if a > b else "under"
    if r.kind.endswith(".move.family") or r.kind in ("cityState.build", "freeCities.build", "research.minor", "research.free", "civic.minor",
                                                      "civic.free", "research.minor.log", "research.free.log", "trade.route.minor"):
        return f"{r.ours} for {r.game}"
    return ""


def shape_of(r: Row) -> str:
    a, b = num(r.ours), num(r.game)
    if a is not None and b is not None:
        if a <= NONE_AT or b <= NONE_AT:
            return sign_of(r)
        d = round(a - b, 2)
        return f"{d:+g}"
    if " only " in r.ours or " only " in r.game or re.match(r"n\d+", r.ours):
        return f"ours only {bucket(only_counts(r.ours))} / game only {bucket(only_counts(r.game))}"
    if r.kind == "plan.blow":
        o, g = r.ours.split(), r.game.split()
        return "differs: " + " ".join(re.sub(r"-?\d+", "", x) for x, y in zip(o, g) if x != y)
    eo, eg = Counter(entries(r.ours)), Counter(entries(r.game))
    if sum(eo.values()) + sum(eg.values()) > 2:
        mine, theirs = sorted((eo - eg).elements()), sorted((eg - eo).elements())
        if len(mine) + len(theirs) <= 3:
            return f"ours+ {'; '.join(squash(x) for x in mine) or '-'} | game+ {'; '.join(squash(x) for x in theirs) or '-'}"
        return f"ours+{len(mine)} game+{len(theirs)}"
    return f"{squash(r.ours)[:50]} // {squash(r.game)[:50]}"


def key_part(r: Row, k: str) -> str:
    if k == "seed":
        return r.seed
    if k == "kind":
        return r.kind
    if k == "player":
        return f"p{r.player}" if r.player is not None else "p?"
    if k == "class":
        return player_class(r.player)
    if k == "item":
        return item_of(r)
    if k == "unit":
        return f"{r.player}:{r.unit}" if r.unit is not None else ""
    if k == "subject":
        return r.subject
    if k == "sign":
        return sign_of(r)
    return shape_of(r)


def source(src: str) -> str:
    """a bar named by its folder alone"""
    return src if pathlib.Path(src).exists() or not (common.BARS / src).is_dir() else str(common.BARS / src)


def wanted(a) -> callable:
    kinds = a.kind.split(",") if a.kind else None
    seeds = set(a.seed.split(",")) if a.seed else None
    players, classes = set(), set()
    for p in (a.player.split(",") if a.player else []):
        if p.lstrip("p").isdigit():
            players.add(int(p.lstrip("p")))
        elif p in CLASS_WORDS:
            classes.add(CLASS_WORDS[p])
        else:
            raise SystemExit(f"--player {p}: a number, barb, free, minor or major")
    lo, hi = common.turn_range(a.turns)
    subj = re.compile(a.subject) if a.subject else None
    text = re.compile(a.text) if a.text else None

    def ok(r: Row) -> bool:
        if kinds:
            if not any(fnmatch.fnmatchcase(r.kind, k) for k in kinds):
                return False
        elif not a.all and bool(THIRD.match(r.kind)) != a.third:
            return False
        if seeds and r.seed not in seeds:
            return False
        if (players or classes) and r.player not in players and player_class(r.player) not in classes:
            return False
        if not lo <= r.turn <= hi:
            return False
        if subj and not subj.search(r.subject):
            return False
        return not (text and not text.search(r.line))
    return ok


def group(rows: list[Row], by: list[str], top: int, show: int | None) -> None:
    groups: dict[tuple, list[Row]] = defaultdict(list)
    for r in rows:
        groups[tuple(key_part(r, k) for k in by)].append(r)
    print(f"{len(rows)} rows, {len(groups)} groups by {','.join(by)}, {len({r.seed for r in rows})} seeds")
    print(f"{'rows':>5} {'seeds':>5}  {' | '.join(by)}  ||  seed/player:turn spans")
    for key, rs in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:top]:
        per: dict[tuple, list[int]] = defaultdict(list)
        for r in rs:
            per[(r.seed, r.player)].append(r.turn)
        where = sorted(per.items(), key=lambda kv: (-len(kv[1]), kv[0][0]))
        shown = " ".join(f"{s}/p{p}:t{spans(ts)}({len(ts)})" for (s, p), ts in where[:5]) + (f" +{len(where) - 5} more" if len(where) > 5 else "")
        print(f"{len(rs):>5} {len({r.seed for r in rs}):>5}  {' | '.join(k if k else '-' for k in key)}  ||  {shown}")
        if show is not None:
            for r in sorted(rs, key=lambda r: (r.seed, r.turn))[:show or None]:
                print(f"        {r.seed} {r.line[6:300]}")


def compare(a_src: str, b_src: str, ok, show: int | None) -> int:
    ra, rb = [r for r in common.read_rows(a_src) if ok(r)], [r for r in common.read_rows(b_src) if ok(r)]
    seeds_a = {common.seed_of(p) for p in common.logs_of(a_src)}
    seeds_b = {common.seed_of(p) for p in common.logs_of(b_src)}
    both = sorted(seeds_a & seeds_b)
    cut: dict[str, tuple[int, int]] = {}
    for s in both:
        ta, tb = common.scored_turns(a_src, s), common.scored_turns(b_src, s)
        lo = max(t[0] for t in (ta, tb) if t) if (ta or tb) else -10**9
        hi = min(t[1] for t in (ta, tb) if t) if (ta or tb) else 10**9
        cut[s] = (lo, hi)
    keep = lambda r: r.seed in cut and cut[r.seed][0] <= r.turn <= cut[r.seed][1]  # noqa: E731
    A, B = Counter(r.line for r in ra if keep(r)), Counter(r.line for r in rb if keep(r))
    by_line = {r.line: r for r in ra + rb}
    seed_of_line = lambda rows: {(r.seed, r.line) for r in rows if keep(r)}  # noqa: E731
    sa, sb = seed_of_line(ra), seed_of_line(rb)
    gone, new = sorted(sa - sb), sorted(sb - sa)
    print(f"A {a_src}: {sum(A.values())} rows; B {b_src}: {sum(B.values())} rows; {len(both)} seeds in both"
          + (f" ({', '.join(f'{s} t{lo}-{hi}' for s, (lo, hi) in cut.items())})" if len(both) <= 4 else "")
          + (f"; only in A: {len(seeds_a - seeds_b)} seeds, only in B: {len(seeds_b - seeds_a)}" if seeds_a ^ seeds_b else ""))
    print(f"gone {len(gone)} (A holds, B does not), new {len(new)} (B holds, A does not)")
    kinds = sorted({by_line[l].kind for _, l in gone + new} | {r.kind for r in ra + rb if keep(r)})
    ka, kb = Counter(r.kind for r in ra if keep(r)), Counter(r.kind for r in rb if keep(r))
    kg, kn = Counter(by_line[l].kind for _, l in gone), Counter(by_line[l].kind for _, l in new)
    print(f"{'kind':<24} {'A':>6} {'B':>6} {'gone':>6} {'new':>6}")
    for k in sorted(kinds, key=lambda k: (-(kg[k] + kn[k]), k)):
        if kg[k] or kn[k]:
            print(f"{k:<24} {ka[k]:>6} {kb[k]:>6} {kg[k]:>6} {kn[k]:>6}")
    same = [k for k in kinds if not kg[k] and not kn[k]]
    if same:
        print(f"unchanged: {', '.join(f'{k} {ka[k]}' for k in same)}")
    if len(both) > 1:
        sg, sn = Counter(s for s, _ in gone), Counter(s for s, _ in new)
        moved = sorted(set(sg) | set(sn), key=lambda s: -(sg[s] + sn[s]))
        print("seeds: " + ", ".join(f"{s} -{sg[s]} +{sn[s]}" for s in moved[:30]) + (f" +{len(moved) - 30} more" if len(moved) > 30 else ""))
    if show is not None:
        for tag, rows in (("-", gone), ("+", new)):
            for s, l in rows[:show or None]:
                print(f"  {tag} {s} {l[6:300]}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("--cmp", metavar="SRC_B")
    ap.add_argument("--kind")
    ap.add_argument("--seed")
    ap.add_argument("--player")
    ap.add_argument("--turns")
    ap.add_argument("--subject")
    ap.add_argument("--text")
    ap.add_argument("--third", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--by", default="kind,item,sign")
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("--rows", nargs="?", type=int, const=0, default=None, metavar="N", help="print the rows (N a group, all with no N)")
    a = ap.parse_args()
    common.utf8()
    ok = wanted(a)
    if a.cmp:
        return compare(source(a.src), source(a.cmp), ok, a.rows)
    by = [k.strip() for k in a.by.split(",") if k.strip()]
    for k in by:
        if k not in KEYS:
            raise SystemExit(f"--by {k}: one of {', '.join(KEYS)}")
    group([r for r in common.read_rows(source(a.src)) if ok(r)], by, a.top, a.rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
