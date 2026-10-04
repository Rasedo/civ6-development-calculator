"""H-3: Continents' ApplyTectonics hills and mountains from the model, set
against the game's finished map. The stream position of the tectonics block
(hills and mountains Fractal.Create, then their BuildRidges) comes from the
map's draw ledger (h3_ledger.py); from there the model builds both fractals
(h3_cvfractal + h3_ridgemodel, draw count checked against the ledger), takes
the thresholds by GetHeight(percent) and classifies every plot as
ApplyTectonics' main loop does. Then each finished land plot's class (flat,
hills, mountain from its terrain) is compared with the class computed at the
plot itself and at the plot one index before it (ApplyTectonics indexes
plotTypes 1-based, y * iW + x + 1, where the terrain pass reads 0-based).

    python tools/civ6lab/h3_tectonics.py runs/h3_session_<stamp>.jsonl
"""
from __future__ import annotations

import collections
import itertools
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Fractal, Rng, height_from_percent  # noqa: E402
from h3_ridgemodel import build_ridges  # noqa: E402

M32 = 0xFFFFFFFF
A, C = 1103515245, 12345


def advance(s: int, n: int) -> int:
    # s_n = A^n s + C (A^n - 1)/(A - 1), by square-and-multiply on the affine map
    a, c = 1, 0
    ma, mc = A, C
    while n:
        if n & 1:
            a, c = (ma * a) & M32, (ma * c + mc) & M32
        ma, mc = (ma * ma) & M32, (ma * mc + mc) & M32
        n >>= 1
    return (a * s + c) & M32


def tectonics_start(ledger_rows) -> tuple[int, int, float, list[str]]:
    run = 0
    pending = []
    for kind, label, n, _detail in ledger_rows:
        if kind == "native":
            pending.append(label)
            continue
        if kind == "block" and any("hills Fractal:BuildRidges" in p for p in pending):
            plates = float(next(p for p in pending if "hills Fractal:BuildRidges" in p)
                           .split("BuildRidges(")[1].split(",")[0])
            return run, n, plates, pending
        if kind in ("lua", "block", "tail", "gap") and n is not None:
            run += n
        if kind != "native":
            pending = [] if kind == "block" else pending
    raise SystemExit("no tectonics block in the ledger")


def main() -> int:
    session = pathlib.Path(sys.argv[1])
    rec = [json.loads(ln) for ln in session.read_text(encoding="utf-8").splitlines() if ln][0]
    rows = json.loads(session.with_name(session.stem + "_ledger.json").read_text(encoding="utf-8"))
    pos, k, plates, pending = tectonics_start(rows)
    dump = json.loads(pathlib.Path(rec["map_dump"]).read_text(encoding="utf-8"))
    W, H = dump["grid"]
    world_age = next(int(float(e.split(":")[1])) for e in rec["probe"]["log"]
                     if ":" in e and not e.startswith(("<", ">"))) + 2
    print(f"map seed {rec['map_seed']} grid {W}x{H} world age {world_age} plates {plates} "
          f"tectonics block at draw {pos} ({k} draws)")
    rng = Rng(advance(int(rec["map_seed"]) & M32, pos))
    flags = {"FRAC_WRAP_X"}
    hills = Fractal(W, H, 3, rng, flags, -1, -1)
    mtns = Fractal(W, H, 3, rng, flags, -1, -1)
    build_ridges(hills, rng, plates, flags, 10, 5)
    build_ridges(mtns, rng, plates, flags, 10, 5)
    print(f"model draws {rng.n} ledger {k} -> {'EXACT' if rng.n == k else 'MISMATCH'}")
    adj = world_age
    extra = 5
    hb1, ht1, hb2, ht2 = (height_from_percent(hills, p) for p in (28 - adj, 28 + adj, 72 - adj, 72 + adj))
    near = height_from_percent(mtns, 91 - adj * 2 - extra)
    mthr = height_from_percent(mtns, 97 - adj - extra)
    passthr = height_from_percent(hills, 91 - adj * 2 - extra)

    def cls(x, y):
        m, h = mtns.height(x, y), hills.height(x, y)
        if m >= mthr:
            return "M" if h < passthr else "H"
        if m >= near:
            return "H"
        return "H" if (hb1 <= h <= ht1 or hb2 <= h <= ht2) else "F"

    final = {}
    for y, row in enumerate(dump["rows"]):
        for x, cell in enumerate(row):
            t = int(cell.split(".")[0])
            final[(x, y)] = "W" if t >= 15 else "FHM"[t % 3]
    for name, off in (("same plot", 0), ("index - 1", 1)):
        conf = collections.Counter()
        bad = []
        for y in range(H):
            for x in range(W):
                if final[(x, y)] == "W":
                    continue
                j = y * W + x - off
                if j < 0:
                    continue
                px, py = j % W, j // W
                c = cls(px, py)
                conf[(c, final[(x, y)])] += 1
                if c != final[(x, y)]:
                    bad.append(((x, y), c, final[(x, y)]))
        tot = sum(conf.values())
        ok = sum(v for (a, b), v in conf.items() if a == b)
        print(f"{name}: {ok}/{tot} land plots agree; (model, game) {dict(sorted(conf.items()))}")

    # the rest of GeneratePlotTypes on the Lua's own indices: P[j] is plot j's
    # land/ocean (the finished map's water taken as ocean), ApplyTectonics
    # writes Q[i] = class of plot i - 1 where P[i] is land
    N = W * H
    # water not connected to the ocean rows is a lake: land when the plot
    # types were made (AddLakes comes after)
    seen = set()
    stack = [j for j in range(W) if final[(j, 0)] == "W"]
    while stack:
        j = stack.pop()
        if j in seen:
            continue
        seen.add(j)
        stack += [n for n in neighbours(j % W, j // W, W, H) if final[(n % W, n // W)] == "W" and n not in seen]
    lakes = [(j % W, j // W) for j in range(N) if final[(j % W, j // W)] == "W" and j not in seen]
    print("lake plots", lakes)
    def replay(ocean):
        Q = {j: ("W" if final[(j % W, j // W)] == "W" and (j in seen or (j % W, j // W) in ocean) else "L") for j in range(N)}
        for x in range(W):
            for y in range(H):
                i = y * W + x + 1
                if i < N and Q[i] != "W":
                    Q[i] = cls(x, y)
        s = advance(int(rec["map_seed"]) & M32, pos + k)
        rng2 = Rng(s)
        coastal = 0
        for x in range(W):
            for y in range(H):
                i = y * W + x + 1
                if i < N and Q[i] == "M" and Q[i] != "W" and any(Q[n] == "W" for n in neighbours(x, y, W, H)):
                    coastal += 1
                    if rng2.get(10) < 9:
                        Q[i] = "H"
        land = [j for x in range(W) for y in range(H) for j in [y * W + x] if Q[j] != "W"]
        mtn = sum(Q[j] == "M" for j in land)
        idx = [j for j in land if Q[j] != "M"]
        ratio = 8 + world_age * 3
        new = max(0, len(land) // ratio - mtn)
        copy = list(idx)
        shuffled = []
        for left in range(len(copy), 0, -1):
            shuffled.append(copy.pop(rng2.get(left)))
        placed = 0
        for j in shuffled:
            x, y = j % W, j // W
            nb = neighbours(x, y, W, H, keep_none=True)
            if Q[j] not in ("W", "M") and all(n is not None and Q[n] not in ("W", "M") for n in nb):
                Q[j] = "M"
                placed += 1
            if placed > new:
                break
        return coastal, idx, placed, Q

    target = dict((part.rsplit(" x", 1)[0], int(part.rsplit(" x", 1)[1]))
                  for part in rows_lua_counts(rows, pos).split(", "))
    fits = []
    for r in range(0, 4):
        for sub in itertools.combinations(lakes, r):
            c, ix, pl, _ = replay(set(sub))
            if target.get("Coastal Mountain Removal", 0) == c and target.get("Shuffling table entry - Lua") == len(ix):
                fits.append(sub)
        if fits:
            break
    print("lake plots that were ocean in the plot types (fits):", fits)
    coastal, idx, placed, Q = replay(set(fits[0]) if fits else set())
    print(f"coastal mountain draws {coastal}, shuffle draws {len(idx)}, lonely mountains {placed} "
          f"(ledger: {rows_lua_counts(rows, pos)})")
    conf = collections.Counter()
    bad = []
    for j in range(N):
        x, y = j % W, j // W
        if final[(x, y)] == "W":
            continue
        conf[(Q[j], final[(x, y)])] += 1
        if Q[j] != final[(x, y)]:
            bad.append(((x, y), Q[j], final[(x, y)], dump["rows"][y][x]))
    ok = sum(v for (a, b), v in conf.items() if a == b)
    print(f"after coastal removal and lonely mountains: {ok}/{sum(conf.values())} land plots agree; "
          f"(model, game) {dict(sorted(conf.items()))}")
    for b in bad:
        print("   ", b)
    return 0


def neighbours(x, y, W, H, keep_none=False):
    """Civ 6's adjacent plots NE, E, SE, SW, W, NW (odd rows shifted right,
    x wraps, y does not) as 0-based plot indices"""
    if y & 1:
        d = ((1, 1), (1, 0), (1, -1), (0, -1), (-1, 0), (0, 1))
    else:
        d = ((0, 1), (1, 0), (0, -1), (-1, -1), (-1, 0), (-1, 1))
    out = []
    for dx, dy in d:
        nx, ny = (x + dx) % W, y + dy
        if 0 <= ny < H:
            out.append(ny * W + nx)
        elif keep_none:
            out.append(None)
    return out


def rows_lua_counts(rows, pos):
    run = 0
    for kind, label, n, _d in rows:
        if kind in ("lua", "block", "tail", "gap") and n is not None:
            if run > pos and kind == "lua":
                return label
            run += n
    return None


if __name__ == "__main__":
    sys.exit(main())
