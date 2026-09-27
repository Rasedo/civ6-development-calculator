"""H-3: controlled StampContinents experiments (civ6lab_mapprobe_stamp.lua).

    python tools/civ6lab/h3_stampprobe.py write [--set NAME]   # shapes -> Maps/civ6lab_stampshapes.lua
    python tools/civ6lab/h3_stampprobe.py install              # h3_xp2copy + copy the mod into the user Mods folder
    python tools/civ6lab/h3_stampprobe.py uninstall            # delete the installed copy
    python tools/civ6lab/h3_stampprobe.py where                # the mod rows Mods.sqlite holds
    python tools/civ6lab/h3_stampprobe.py read runs/h3_session_<stamp>.jsonl   # records -> runs/h3_stampx_<stamp>.json

A shape is a function (x, y) -> terrain index or None (Ocean), made per map
width; the record keeps the land (0/1 per plot) and the continent per plot,
so h3_stampfit.py reads it like the exp records.
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
MOD = HERE / "h3_mapprobe_mod"
MOD_ID = "e6d8f6ba-a2bf-4f6b-ba4b-f5446f403033"
USER_MODS = pathlib.Path(os.environ["USERPROFILE"]) / "Documents" / "My Games" / "Sid Meier's Civilization VI" / "Mods"
INSTALLED = USER_MODS / "civ6lab_mapprobe"
SIZES = {60: 38, 74: 46, 84: 54, 44: 26, 96: 60, 106: 66}

G, M = 0, 2  # grassland, grassland mountain


def rect(x0, x1, y0, y1, t=G):
    return lambda x, y: t if x0 <= x < x1 and y0 <= y < y1 else None


def union(*fs):
    def f(x, y):
        for g in fs:
            v = g(x, y)
            if v is not None:
                return v
        return None
    return f


def shapes_basic(w: int, h: int) -> list[tuple[str, object]]:
    """strips, squares and bodies whose split is read against width,
    length, parity and the end they sit at"""
    out = []
    cx, cy = w // 2, h // 2
    top, bot = h - 4, 3
    # tall strips: widths 2..16 (full height), at two x parities
    for wd in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16):
        out.append((f"tall_w{wd}", rect(cx - wd // 2, cx - wd // 2 + wd, bot, top)))
    for wd in (8, 12):
        out.append((f"tall_w{wd}_x1", rect(cx - wd // 2 + 1, cx - wd // 2 + wd + 1, bot, top)))
        out.append((f"tall_w{wd}_y1", rect(cx - wd // 2, cx - wd // 2 + wd, bot + 1, top)))
        out.append((f"tall_w{wd}_short", rect(cx - wd // 2, cx - wd // 2 + wd, bot, bot + (top - bot) // 2)))
    # wide strips: heights 2..14
    for ht in (2, 3, 4, 5, 6, 7, 8, 10, 12, 14):
        out.append((f"wide_h{ht}", rect(5, w - 5, cy - ht // 2, cy - ht // 2 + ht)))
    for ht in (6, 10):
        out.append((f"wide_h{ht}_y1", rect(5, w - 5, cy - ht // 2 + 1, cy - ht // 2 + ht + 1)))
        out.append((f"wide_h{ht}_short", rect(5, 5 + (w - 10) // 2, cy - ht // 2, cy - ht // 2 + ht)))
    # squares (in plots)
    for s in (6, 10, 14, 18, 22, 26):
        if s < h - 6:
            out.append((f"sq{s}", rect(cx - s // 2, cx - s // 2 + s, cy - s // 2, cy - s // 2 + s)))
    # a tall strip with a square head at the north / at the south
    out.append(("tall8_headN", union(rect(cx - 4, cx + 4, bot, top), rect(cx - 8, cx + 8, top - 16, top))))
    out.append(("tall8_headS", union(rect(cx - 4, cx + 4, bot, top), rect(cx - 8, cx + 8, bot, bot + 16))))
    # dumbbells: two squares and a bridge
    out.append(("dumbbell_eq", union(rect(6, 20, cy - 7, cy + 7), rect(w - 20, w - 6, cy - 7, cy + 7),
                                     rect(20, w - 20, cy - 1, cy + 1))))
    out.append(("dumbbell_bigW", union(rect(6, 26, cy - 10, cy + 10), rect(w - 20, w - 6, cy - 7, cy + 7),
                                       rect(26, w - 20, cy - 1, cy + 1))))
    # two separate equal and unequal squares
    out.append(("two_sq_eq", union(rect(6, 20, cy - 7, cy + 7), rect(w - 20, w - 6, cy - 7, cy + 7))))
    out.append(("two_sq_bigE", union(rect(6, 20, cy - 7, cy + 7), rect(w - 26, w - 6, cy - 10, cy + 10))))
    return out


def shapes_multi(w: int, h: int) -> list[tuple[str, object]]:
    """rectangles of several aspects; two and three separate squares of
    chosen sides (west to east); a 20-square beside a small square of side
    s: which land takes how many continents, and in which order"""
    out = []
    cx, cy = w // 2, h // 2
    for rw in (12, 18, 24, 30, 36):
        for rh in (12, 18, 24):
            if rh < h - 8 and rw < w - 8:
                out.append((f"rect{rw}x{rh}", rect(cx - rw // 2, cx - rw // 2 + rw, cy - rh // 2, cy - rh // 2 + rh)))

    def row(sides, gap=6):
        xs, x = [], 4
        for s in sides:
            xs.append(x)
            x += s + gap
        return union(*[rect(x0, x0 + s, cy - s // 2, cy - s // 2 + s) for x0, s in zip(xs, sides)])

    for sides in ((10, 14), (14, 10), (12, 12), (10, 20), (20, 10), (14, 18), (18, 14), (12, 12, 12), (16, 12, 8),
                  (8, 12, 16)):
        if sum(sides) + 6 * len(sides) + 4 < w - 4 and max(sides) < h - 6:
            out.append(("sq_" + "_".join(map(str, sides)), row(sides)))
    for s in (4, 6, 8, 10, 12, 14):
        out.append((f"big20_small{s}", row((20, s), gap=8)))
        out.append((f"small{s}_big20", row((s, 20), gap=8)))
    return out


L_ = 15  # coast terrain: a lake inside land


def shapes_dll(w: int, h: int) -> list[tuple[str, object]]:
    """the DLL rule's corners: mountains inside a land area (a plot with 5+
    of its neighbours in the area joins the split's mask), lakes, a mountain
    block as its own area, a C-shaped island whose centroid is water, a
    mountain bridge"""
    out = []
    cx, cy = w // 2, h // 2
    body = rect(cx - 12, cx + 12, cy - 8, cy + 8)

    def with_cells(base, cells, t):
        def f(x, y):
            if (x, y) in cells:
                return t
            return base(x, y)
        return f

    out.append(("mtn1", with_cells(body, {(cx, cy)}, M)))
    out.append(("mtn2", with_cells(body, {(cx, cy), (cx + 1, cy)}, M)))
    out.append(("mtn4", with_cells(body, {(cx, cy), (cx + 1, cy), (cx, cy + 1), (cx + 1, cy + 1)}, M)))
    out.append(("mtnline", with_cells(body, {(cx - 3 + k, cy + 2) for k in range(7)}, M)))
    out.append(("mtnedge", with_cells(body, {(cx - 12 + k, cy - 8) for k in range(24)}, M)))
    out.append(("mtnoff", with_cells(body, {(cx - 6, cy - 3), (cx + 5, cy + 4), (cx - 9, cy + 5)}, M)))
    out.append(("lake1", with_cells(body, {(cx, cy)}, L_)))
    out.append(("lake3", with_cells(body, {(cx, cy), (cx + 1, cy), (cx, cy + 1)}, L_)))
    out.append(("mtnblock", union(rect(4, 24, cy - 6, cy + 6), rect(w - 20, w - 8, cy - 6, cy + 6, M))))
    out.append(("mtnblock_big", union(rect(4, 18, cy - 5, cy + 5), rect(w - 26, w - 6, cy - 9, cy + 9, M))))

    def cshape(x0, y0, s):
        def f(x, y):
            if not (x0 <= x < x0 + s and y0 <= y < y0 + s):
                return None
            inner = x0 + 2 <= x < x0 + s and y0 + 2 <= y < y0 + s - 2
            return None if inner else G
        return f
    out.append(("cisland", union(rect(4, 22, cy - 8, cy + 8), rect(w - 24, w - 6, cy - 8, cy + 8),
                                 cshape(cx - 5, 2, 10))))
    out.append(("cisland_n", union(rect(4, 22, cy - 8, cy + 8), rect(w - 24, w - 6, cy - 8, cy + 8),
                                   cshape(cx - 4, h - 12, 9), rect(cx - 1, cx + 1, 3, 5))))
    out.append(("mtnbridge", union(rect(4, cx - 3, cy - 6, cy + 6), rect(cx + 3, w - 4, cy - 6, cy + 6),
                                   rect(cx - 3, cx + 3, cy - 1, cy + 1, M))))
    out.append(("rect_odd", rect(cx - 10, cx + 11, cy - 7, cy + 6)))
    out.append(("ring", union(rect(cx - 12, cx + 12, cy - 9, cy - 5), rect(cx - 12, cx + 12, cy + 5, cy + 9),
                              rect(cx - 12, cx - 8, cy - 9, cy + 9), rect(cx + 8, cx + 12, cy - 9, cy + 9))))
    out.append(("lshape", union(rect(cx - 14, cx + 14, cy - 9, cy - 3), rect(cx - 14, cx - 8, cy - 9, cy + 10))))
    out.append(("tshape", union(rect(cx - 15, cx + 15, cy + 3, cy + 9), rect(cx - 3, cx + 3, cy - 10, cy + 9))))
    return out


SETS = {"basic": shapes_basic, "multi": shapes_multi, "dll": shapes_dll}


def lua_rle(vals: list[int]) -> str:
    out, cur, n = [], None, 0
    for v in vals:
        if v == cur:
            n += 1
        else:
            if cur is not None:
                out.append(f"{cur}*{n}")
            cur, n = v, 1
    if cur is not None:
        out.append(f"{cur}*{n}")
    return ",".join(out)


def cmd_write(set_name: str) -> int:
    lines = ["-- written by tools/civ6lab/h3_stampprobe.py; STAMP_SHAPES[w] = { {name, rle}, ... }",
             "STAMP_SHAPES = {}"]
    count = 0
    for w, h in sorted(SIZES.items()):
        entries = []
        for name, f in SETS[set_name](w, h):
            vals = []
            for y in range(h):
                for x in range(w):
                    v = f(x, y)
                    vals.append(-1 if v is None else v)
            entries.append(f'  {{"{name}", "{lua_rle(vals)}"}},')
            count += 1
        lines.append(f"STAMP_SHAPES[{w}] = {{")
        lines += entries
        lines.append("}")
    (MOD / "Maps" / "civ6lab_stampshapes.lua").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{count} shapes over {len(SIZES)} widths -> {MOD / 'Maps' / 'civ6lab_stampshapes.lua'}")
    return 0


def cmd_install() -> int:
    subprocess.run([sys.executable, str(HERE / "h3_xp2copy.py")], check=True, capture_output=True)
    if INSTALLED.exists():
        shutil.rmtree(INSTALLED)
    shutil.copytree(MOD, INSTALLED)
    print("installed", INSTALLED, len(list(INSTALLED.rglob("*"))), "entries")
    return 0


def cmd_uninstall() -> int:
    if INSTALLED.exists():
        shutil.rmtree(INSTALLED)
        print("removed", INSTALLED)
    else:
        print("nothing installed at", INSTALLED)
    return 0


def cmd_where() -> int:
    db = pathlib.Path(os.environ["LOCALAPPDATA"]) / "Firaxis Games" / "Sid Meier's Civilization VI" / "Mods.sqlite"
    c = sqlite3.connect(str(db))
    tables = [r[0] for r in c.execute("select name from sqlite_master where type='table'")]
    print("tables", tables)
    for t in tables:
        cols = [r[1] for r in c.execute(f"pragma table_info({t})")]
        for col in cols:
            try:
                rows = list(c.execute(f"select * from {t} where cast({col} as text) like '%civ6lab%' limit 3"))
            except sqlite3.Error:
                continue
            for r in rows:
                print(t, col, r)
    return 0


def cmd_read(path: str, set_name: str) -> int:
    rec = [json.loads(ln) for ln in pathlib.Path(path).read_text(encoding="utf-8").splitlines() if ln][0]
    xs = rec["probe"].get("x", [])
    grid = next(e for e in xs if e.startswith("grid|")).split("|")[1]
    w, h = map(int, grid.split(","))
    shapes = dict(SETS[set_name](w, h))
    out = {"session": path, "grid": [w, h], "map_seed": rec["map_seed"], "stamps": []}
    for e in xs:
        parts = e.split("|")
        if parts[0] != "sx":
            if parts[0] in ("phaseA", "real"):
                print(e)
            continue
        name, cont = parts[1], parts[2]
        f = shapes[name]
        land = [0 if f(i % w, i // w) is not None else 1 for i in range(w * h)]
        ter = [16 if f(i % w, i // w) is None else f(i % w, i // w) for i in range(w * h)]
        out["stamps"].append({"name": name, "land": lua_rle(land), "terrain": lua_rle(ter), "cont": cont,
                              "err": parts[3] if len(parts) > 3 else None})
    dst = HERE / "runs" / ("h3_stampx_" + pathlib.Path(path).stem.split("_", 2)[-1] + ".json")
    dst.write_text(json.dumps(out), encoding="utf-8")
    print(len(out["stamps"]), "stamps ->", dst)
    return 0


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    set_name = sys.argv[sys.argv.index("--set") + 1] if "--set" in sys.argv else "basic"
    if cmd == "write":
        return cmd_write(set_name)
    if cmd == "install":
        return cmd_install()
    if cmd == "uninstall":
        return cmd_uninstall()
    if cmd == "where":
        return cmd_where()
    if cmd == "read":
        return cmd_read(sys.argv[2], set_name)
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
