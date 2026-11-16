"""What the aiport tools share: where the recordings and the bars live, a
recording's files by seed, and the scored rows of a log.

A scored row is one line the harness prints for a missed comparison
(`AISCORE_MISSES=1`, `cpu/harness/aiScore.ts`):

    SCORE <kind> t<turn> <subject> X[c] <ours> // <game>

`c` marks a player whose memory was clean as the turn opened. A bar
directory (`.claude/scratchpad/aiscore/p<N>m/`) and a window directory
(`<wt>/.claude/scratchpad/win/<tag>/`) hold the same three files per seed:
`ai<seed>.log` (the run's output, the rows in it), `ai<seed>.json` and
`ai<seed>.md` (the harness's `--aiscore` report: counts, no rows).
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROW = re.compile(r"^SCORE (\S+) t(\d+) (.*?) ([X=])(c?) (.*?) ?// ?(.*)$")
# the third table's kinds (the game's intermediate state, `aiUnits.ts`)
THIRD = re.compile(r"^(plan\.|targets|kb\.|unit\.table)")


def main_root() -> pathlib.Path:
    """the main checkout: the tree that holds the recordings (a worktree
    under `.claude/worktrees/` has none)"""
    for p in HERE.parents:
        if p.name == "worktrees" and p.parent.name == ".claude":
            return p.parent.parent
    return HERE.parents[1]


MAIN = main_root()
RUNS = MAIN / "tools" / "civ6lab" / "runs"
SCRATCH = MAIN / ".claude" / "scratchpad"
BARS = SCRATCH / "aiscore"


def stem_of(seed: str) -> str:
    """a seed's recording stem (`duels1157_20261115T...`), from
    recordings_all.txt; the newest dump of the seed where the list has none"""
    listed = SCRATCH / "recordings_all.txt"
    if listed.exists():
        for line in listed.read_text(encoding="utf-8").splitlines():
            if re.match(rf"^duel[a-z]*{seed}_", line.strip()):
                return line.strip()
    found = sorted(p.name[3:-6] for p in RUNS.glob(f"h1_duel*{seed}_*Z.jsonl"))
    if not found:
        raise SystemExit(f"no recording of seed {seed} in {listed} or {RUNS}")
    return found[-1]


def files_of(seed: str) -> dict:
    """the recording's files: dump, aimem, aiunits, cat, logs (the folder),
    store (the logs' sqlite)"""
    base = RUNS / f"h1_{stem_of(seed)}"
    return {"stem": base.name, "dump": base.with_name(base.name + ".jsonl"), "aimem": base.with_name(base.name + ".aimem.jsonl"),
            "aiunits": base.with_name(base.name + ".aiunits.jsonl"), "cat": base.with_name(base.name + ".cat.json"),
            "logs": base.with_name(base.name + ".logs"), "store": base.with_name(base.name + ".logs.sqlite")}


def newest_bar(seed: str | None = None) -> pathlib.Path | None:
    """the newest aimem bar (`p<N>m`), the newest holding the seed's report
    where a seed is named"""
    bars = sorted((d for d in BARS.glob("p[0-9]*m") if d.is_dir()), key=lambda d: int(re.sub(r"\D", "", d.name) or 0), reverse=True)
    for d in bars:
        if seed is None or (d / f"ai{seed}.json").exists():
            return d
    return None


class Row:
    """one scored row"""
    __slots__ = ("seed", "kind", "turn", "subject", "equal", "clean", "ours", "game", "line")

    def __init__(self, seed: str, m: re.Match, line: str):
        self.seed, self.kind, self.turn, self.subject = seed, m.group(1), int(m.group(2)), m.group(3)
        self.equal, self.clean, self.ours, self.game, self.line = m.group(4) == "=", m.group(5) == "c", m.group(6), m.group(7), line

    @property
    def player(self) -> int | None:
        """the player the row is of: `p<N>` or a unit key `<N>:<id>` at the
        subject's head; a Free City's build row names its city alone"""
        m = re.match(r"p(\d+)\b", self.subject) or re.match(r"(\d+):\d+\b", self.subject)
        if m:
            return int(m.group(1))
        return 62 if self.kind.startswith("freeCities.") else None

    @property
    def unit(self) -> int | None:
        m = re.match(r"\d+:(\d+)\b", self.subject) or re.match(r"p\d+ u(\d+)\b", self.subject) \
            or (re.match(r"\d+:(\d+)\b", self.ours) if self.kind == "unit.upgrade" else None)
        return int(m.group(1)) if m else None


def player_class(p: int | None) -> str:
    if p is None:
        return "?"
    return "barbarians" if p == 63 else "free cities" if p == 62 else "major" if p < 2 else "city-state"


def seed_of(path: pathlib.Path) -> str:
    """a log's seed: the digits of `ai<seed>.log`, else the first run of
    four digits in its name"""
    m = re.match(r"ai(\d+)\.", path.name) or re.search(r"(\d{4})", path.name)
    return m.group(1) if m else path.stem


def logs_of(src: str) -> list[pathlib.Path]:
    """a source's row logs: a directory's `ai<seed>.log` files (a bar, a
    window), else its other `.log` / `.err` files; a file itself; an
    `--aiscore <out>` stem's `<out>.log` or `<out>.err`"""
    p = pathlib.Path(src)
    if p.is_dir():
        logs = sorted(p.glob("ai*.log")) or sorted(f for f in p.iterdir() if f.suffix in (".log", ".err", ".rows"))
        if not logs:
            raise SystemExit(f"{p}: no ai<seed>.log, .log, .err or .rows file")
        return logs
    if p.is_file() and p.suffix != ".json" and p.suffix != ".md":
        return [p]
    stem = p.with_suffix("") if p.suffix in (".json", ".md") else p
    for suf in (".log", ".err", ".rows"):
        f = stem.with_name(stem.name + suf)
        if f.exists():
            return [f]
    raise SystemExit(f"{src}: no rows. The harness prints them on stderr under AISCORE_MISSES=1: keep its output as "
                     f"{stem.name}.log beside {stem.name}.json (tools/aiport/window.py does)")


def read_rows(src: str, missed_only: bool = True) -> list[Row]:
    out: list[Row] = []
    for log in logs_of(src):
        seed = seed_of(log)
        with open(log, encoding="utf-8", errors="replace") as f:
            for line in f:
                if not line.startswith("SCORE "):
                    continue
                line = line.rstrip("\r\n")
                m = ROW.match(line)
                if m and not (missed_only and m.group(4) == "="):
                    out.append(Row(seed, m, line))
    return out


def scored_turns(src: str, seed: str) -> tuple[int, int] | None:
    """the turns a source scored for a seed (its report's `turns`), None
    without a report"""
    p = pathlib.Path(src)
    for f in ([p / f"ai{seed}.json"] if p.is_dir() else [p.with_suffix(".json"), p.with_name(p.name + ".json")]):
        if f.exists():
            try:
                t = json.loads(f.read_text(encoding="utf-8")).get("turns") or []
            except ValueError:
                return None
            return (int(t[0]) - 1, int(t[-1]) - 1) if t else None
    return None


def spans(turns, gap: int = 1) -> str:
    """turns as spans: `198-203,210` (turns `gap` apart or closer joined)"""
    ts = sorted(set(turns))
    if not ts:
        return ""
    out, a, b = [], ts[0], ts[0]
    for t in ts[1:]:
        if t <= b + gap:
            b = t
        else:
            out.append((a, b))
            a = b = t
    out.append((a, b))
    return ",".join(f"{x}" if x == y else f"{x}-{y}" for x, y in out)


def turn_range(text: str | None) -> tuple[int, int]:
    """`A-B`, `A-`, `-B` or `A` as a closed turn range"""
    if not text:
        return (-10**9, 10**9)
    m = re.match(r"^(\d*)(-?)(\d*)$", text)
    if not m or not (m.group(1) or m.group(3)):
        raise SystemExit(f"turns: {text} is not A-B")
    a = int(m.group(1)) if m.group(1) else -10**9
    b = int(m.group(3)) if m.group(3) else (10**9 if m.group(2) else a)
    return (a, b)


def utf8() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
