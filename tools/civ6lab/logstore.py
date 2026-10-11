"""The game's logs of a recording as ONE SQLite file.

    python tools/civ6lab/logstore.py build <stem>|--all [--force]
    python tools/civ6lab/logstore.py query <stem> "<sql>"

A recording `runs/<stem>.jsonl` has the game's CSV logs in `<stem>.logs/`
(fleet.py's `save_logs`); `build` writes `runs/<stem>.logs.sqlite` from them
(`<stem>` is the stem, the dump, or the `.logs` folder). `--all` builds every
recording whose store is missing or older than its logs.

Layout:
* one table per log, named as the file (`AI_Tactical`, `RandCalls`, ...):
  `line` (the file's line number, the header line 1) as the key, then a
  column per header cell, named from the header (lower case, `_` for any
  other character, `c<i>` for an empty name, `n<name>` for a numeric one,
  `_2` on a repeat); a first header cell naming the turn becomes `turn`, a
  second naming the player `player`, both INTEGER and indexed. Cells are
  stripped and typed (integer, real, else text; an empty cell NULL). A row
  wider than the header keeps its leading cells in the columns and the raw
  text after the header's width in `rest` (AI_CityBuild's yield cells,
  AI_Diplomacy's per-player cells, AI_Planning's spots).
* a `.txt` log is a table with one `text` column per line.
* AI_CityBuild's PLOT ANALYSIS LOG blocks (a `turn, player, city, PLOT
  ANALYSIS LOG` line, then per plot a `turn,player,,x y, info...` line and
  its value rows `,,,FAMILY, v, v, ...`) are normalised; the block's header
  line stays in `AI_CityBuild`, its plot and value lines do not:
    AI_CityBuild_plot(id, block, seq, turn, player, city, x, y, info)
      `block` the header's `line`, `seq` the plot's place in the block
      (0 the first, the city centre);
    AI_CityBuild_family(id, name)  DISTRICTS, IMPROVEMENTS, BUILDINGS, ...;
    AI_CityBuild_plot_row(plot, family, n)  a value row and its item count;
    AI_CityBuild_plot_value(plot, family, item, value)  every item whose
      logged value is not exactly -9999.00 — an item below the row's `n`
      that has no line here was logged -9999.00 (not valued). `item` counts
      the row's non-empty cells.
    view AI_CityBuild_plot_analysis(turn, player, city, x, y, seq, family,
      item, value) over the stored values.
* `meta(log, bytes, mtime_ns, rows)` per source file.

Readers: Python `sqlite3` (`open_store`), the TS harness through Node's
`node:sqlite` (`cpu/harness/logStore.ts`).
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sqlite3
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
# the recordings live in the main checkout's runs/ (a worktree has none)
RUNS = next((p / "runs" for p in (HERE, HERE.parents[4] / "tools" / "civ6lab" if len(HERE.parents) > 4 else HERE)
             if any((p / "runs").glob("*.logs"))), HERE / "runs")

NUM_INT = re.compile(r"^[+-]?\d+$")
NUM_REAL = re.compile(r"^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$")
PLOT_LINE = re.compile(r"^(\d+),(\d+),,(\d+) (\d+),(.*)$")
NONE = "-9999.00"


def store_path(stem: str) -> pathlib.Path:
    """`<stem>` (a stem, a dump path, or its .logs folder) -> its store"""
    p = pathlib.Path(stem)
    name = p.name
    for suf in (".jsonl", ".logs.sqlite", ".logs"):
        if name.endswith(suf):
            name = name[: -len(suf)]
            break
    folder = p.parent if p.parent != pathlib.Path(".") else RUNS
    return folder / f"{name}.logs.sqlite"


def logs_dir(stem: str) -> pathlib.Path:
    s = store_path(stem)
    return s.with_name(s.name[: -len(".sqlite")])


def open_store(stem: str) -> sqlite3.Connection:
    """The recording's store, read-only (built first if missing or stale)."""
    path = store_path(stem)
    if stale(stem):
        build(stem)
    return sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)


def stale(stem: str) -> bool:
    path = store_path(stem)
    folder = logs_dir(stem)
    if not path.exists():
        return folder.is_dir()
    built = path.stat().st_mtime_ns
    return any(f.stat().st_mtime_ns > built for f in folder.iterdir())


def cell(v: str):
    v = v.strip()
    if v == "":
        return None
    if NUM_INT.match(v):
        return int(v)
    if NUM_REAL.match(v):
        return float(v)
    return v


def column_names(header: list[str]) -> list[str]:
    out: list[str] = []
    for i, h in enumerate(header):
        n = re.sub(r"[^0-9a-z]+", "_", h.strip().lower()).strip("_")
        if i == 0 and "turn" in n:
            n = "turn"
        elif i == 1 and n in ("player", "playerindex"):
            n = "player"
        elif n == "":
            n = f"c{i}"
        elif n[0].isdigit():
            n = f"n{n}"
        if n in ("line", "rest"):
            n = f"{n}_"
        base, k = n, 2
        while n in out:
            n, k = f"{base}_{k}", k + 1
        out.append(n)
    return out


def split_at(line: str, width: int) -> tuple[list[str], str | None]:
    """The first `width` cells and the raw text past them (None if none)."""
    cells = line.split(",", width)
    if len(cells) > width:
        return cells[:width], cells[width]
    return cells, None


class Table:
    def __init__(self, db: sqlite3.Connection, name: str, header: list[str]):
        self.db, self.name = db, name
        self.cols = column_names(header)
        self.width = len(self.cols)
        decl = ", ".join(f'"{c}" INTEGER' if c in ("turn", "player") else f'"{c}"' for c in self.cols)
        db.execute(f'CREATE TABLE "{name}" (line INTEGER PRIMARY KEY, {decl}, rest TEXT)')
        self.sql = f'INSERT INTO "{name}" VALUES ({", ".join("?" * (self.width + 2))})'
        self.rows: list[tuple] = []
        self.count = 0

    def add(self, no: int, line: str) -> None:
        cells, rest = split_at(line, self.width)
        vals = [cell(c) for c in cells] + [None] * (self.width - len(cells))
        self.rows.append((no, *vals, rest))
        self.count += 1
        if len(self.rows) >= 50000:
            self.flush()

    def flush(self) -> None:
        if self.rows:
            self.db.executemany(self.sql, self.rows)
            self.rows = []

    def index(self) -> None:
        if "turn" in self.cols and "player" in self.cols:
            self.db.execute(f'CREATE INDEX "{self.name}_tp" ON "{self.name}"(turn, player)')
            self.db.execute(f'CREATE INDEX "{self.name}_p" ON "{self.name}"(player, turn)')
        elif "turn" in self.cols:
            self.db.execute(f'CREATE INDEX "{self.name}_t" ON "{self.name}"(turn)')


class PlotAnalysis:
    """AI_CityBuild's PLOT ANALYSIS LOG blocks, normalised."""

    def __init__(self, db: sqlite3.Connection):
        self.db = db
        db.executescript("""
            CREATE TABLE AI_CityBuild_plot (id INTEGER PRIMARY KEY, block INTEGER, seq INTEGER, turn INTEGER,
              player INTEGER, city TEXT, x INTEGER, y INTEGER, info TEXT);
            CREATE TABLE AI_CityBuild_family (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
            CREATE TABLE AI_CityBuild_plot_row (plot INTEGER, family INTEGER, n INTEGER,
              PRIMARY KEY (plot, family)) WITHOUT ROWID;
            CREATE TABLE AI_CityBuild_plot_value (plot INTEGER, family INTEGER, item INTEGER, value REAL,
              PRIMARY KEY (plot, family, item)) WITHOUT ROWID;
        """)
        self.families: dict[str, int] = {}
        self.block: tuple[int, int, int, str] | None = None  # line, turn, player, city
        self.seq = 0
        self.plot: int | None = None
        self.plots: list[tuple] = []
        self.prow: list[tuple] = []
        self.pval: list[tuple] = []

    def header(self, no: int, line: str) -> None:
        p = [c.strip() for c in line.split(",")]
        self.block = (no, int(p[0]), int(p[1]), p[2])
        self.seq = 0
        self.plot = None

    def plot_line(self, no: int, m: re.Match) -> None:
        assert self.block
        self.plot = no
        self.plots.append((no, self.block[0], self.seq, int(m[1]), int(m[2]), self.block[3], int(m[3]), int(m[4]),
                           m[5].strip()))
        self.seq += 1

    def values(self, line: str) -> None:
        cut = line.index(",", 3)
        name = line[3:cut]
        fam = self.families.get(name)
        if fam is None:
            fam = self.families[name] = len(self.families)
            self.db.execute("INSERT INTO AI_CityBuild_family VALUES (?, ?)", (fam, name))
        cells = [c.strip() for c in line[cut + 1:].split(",")]
        cells = [c for c in cells if c]
        self.prow.append((self.plot, fam, len(cells)))
        self.pval.extend((self.plot, fam, k, float(c)) for k, c in enumerate(cells) if c != NONE)
        if len(self.pval) > 200000:
            self.flush()

    def flush(self) -> None:
        self.db.executemany("INSERT INTO AI_CityBuild_plot VALUES (?,?,?,?,?,?,?,?,?)", self.plots)
        self.db.executemany("INSERT OR REPLACE INTO AI_CityBuild_plot_row VALUES (?,?,?)", self.prow)
        self.db.executemany("INSERT OR REPLACE INTO AI_CityBuild_plot_value VALUES (?,?,?,?)", self.pval)
        self.plots, self.prow, self.pval = [], [], []

    def finish(self) -> None:
        self.flush()
        self.db.executescript("""
            CREATE INDEX AI_CityBuild_plot_tp ON AI_CityBuild_plot(turn, player, city);
            CREATE INDEX AI_CityBuild_plot_p ON AI_CityBuild_plot(player, turn);
            CREATE VIEW AI_CityBuild_plot_analysis AS
              SELECT p.turn, p.player, p.city, p.x, p.y, p.seq, f.name AS family, v.item, v.value
              FROM AI_CityBuild_plot_value v JOIN AI_CityBuild_plot p ON p.id = v.plot
              JOIN AI_CityBuild_family f ON f.id = v.family;
        """)


def load_csv(db: sqlite3.Connection, path: pathlib.Path) -> int:
    name = re.sub(r"[^0-9A-Za-z_]+", "_", path.stem)
    with open(path, encoding="utf-8", errors="replace", newline="") as fh:
        text = fh.read()
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if path.suffix.lower() == ".txt":
        db.execute(f'CREATE TABLE "{name}" (line INTEGER PRIMARY KEY, text TEXT)')
        db.executemany(f'INSERT INTO "{name}" VALUES (?, ?)', ((i + 1, ln.rstrip("\r")) for i, ln in enumerate(lines)))
        return len(lines)
    if not lines:
        return 0
    table = Table(db, name, lines[0].rstrip("\r").split(","))
    plots = PlotAnalysis(db) if name == "AI_CityBuild" else None
    for i in range(1, len(lines)):
        line = lines[i].rstrip("\r")
        no = i + 1
        if plots is not None:
            if line.startswith(",,,"):
                if plots.plot is not None:
                    plots.values(line)
                    continue
            elif "PLOT ANALYSIS LOG" in line:
                plots.header(no, line)
            elif plots.block is not None and (m := PLOT_LINE.match(line)):
                plots.plot_line(no, m)
                continue
            else:
                plots.block, plots.plot = None, None
        table.add(no, line)
    table.flush()
    table.index()
    if plots is not None:
        plots.finish()
    return table.count


def build(stem: str) -> pathlib.Path:
    folder = logs_dir(stem)
    out = store_path(stem)
    if not folder.is_dir():
        raise SystemExit(f"no logs folder {folder}")
    tmp = out.with_name(out.name + ".tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=8192;")
    db.execute("CREATE TABLE meta (log TEXT PRIMARY KEY, bytes INTEGER, mtime_ns INTEGER, rows INTEGER)")
    for f in sorted(folder.iterdir()):
        if f.suffix.lower() not in (".csv", ".txt"):
            continue
        rows = load_csv(db, f)
        st = f.stat()
        db.execute("INSERT INTO meta VALUES (?, ?, ?, ?)", (f.name, st.st_size, st.st_mtime_ns, rows))
    db.commit()
    db.execute("VACUUM")
    db.close()
    tmp.replace(out)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("stem", nargs="?")
    b.add_argument("--all", action="store_true")
    b.add_argument("--force", action="store_true")
    q = sub.add_parser("query")
    q.add_argument("stem")
    q.add_argument("sql")
    a = ap.parse_args()
    if a.cmd == "build":
        stems = [str(d) for d in sorted(RUNS.glob("*.logs")) if d.is_dir()] if a.all else [a.stem]
        if not stems or stems == [None]:
            raise SystemExit("build <stem> or --all")
        for s in stems:
            if not a.force and not stale(s):
                continue
            t0 = time.time()
            out = build(s)
            src = sum(f.stat().st_size for f in logs_dir(s).iterdir())
            print(f"{out.name}: {src / 1e6:.1f} MB logs -> {out.stat().st_size / 1e6:.1f} MB in {time.time() - t0:.1f}s",
                  flush=True)
    else:
        db = open_store(a.stem)
        cur = db.execute(a.sql)
        print("\t".join(d[0] for d in cur.description or []))
        for row in cur:
            print("\t".join("" if v is None else str(v) for v in row))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
