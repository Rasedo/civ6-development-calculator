"""H-3: the step-by-step draw ledger of one map, from a quiet probe record
(civ6lab_mapprobe_quiet.lua via h3_session.py --probe): the probe draws
nothing, so the map is the unprobed map and the stream runs from the map
seed. Every Lua draw is checked at its position; each block of native calls
between two Lua draws gets its draw count by aligning the Lua draws that
follow it, set beside the model's count (h3_cvfractal / h3_ridgemodel).

The probe cannot wrap Fractal:BuildRidges (the fractal's metatable is
protected), so the model inserts the calls Continents.lua makes: after the
continental fractal (CreateRifts, or Create with FRAC_POLAR at exps 6/5)
BuildRidges(PlateValue, {}, 1, 2); after the map's first two default-exp
fractals (ApplyTectonics' hills and mountains) BuildRidges(9 * adjust,
g_iFlags, 10, 5) on each, adjust 1.5 / 2.0 / 3.0 by world age < 3 / 3 / > 3.

    python tools/civ6lab/h3_ledger.py runs/h3_session_<stamp>.jsonl [--line 0] [--plate-value 3]
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from h3_cvfractal import Fractal, Rng  # noqa: E402
from h3_ridgemodel import place  # noqa: E402

M32 = 0xFFFFFFFF
A, C = 1103515245, 12345


def step(s: int) -> int:
    return (A * s + C) & M32


def advance(s: int, n: int) -> int:
    for _ in range(n):
        s = step(s)
    return s


def val(s_after: int, r: int) -> int:
    return ((s_after >> 16) * (int(r) & 0xFFFF)) >> 16


def parse_flags(s: str) -> set:
    s = s.strip("{}")
    return {kv.split("=")[0] for kv in s.split("|") if kv}


def split_args(a: str) -> list[str]:
    out, depth, cur = [], 0, ""
    for ch in a:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def fractal_count(name: str, args: list[str], s: int):
    w, h, g = int(args[0]), int(args[1]), int(args[2])
    flags = parse_flags(args[3])
    xe, ye = (int(args[4]), int(args[5])) if name == "Fractal.Create" else (int(args[5]), int(args[6]))
    rng = Rng(s)
    f = Fractal(w, h, g, rng, flags, xe, ye)
    return rng.n, (f.fx, f.fy), flags, (xe, ye)


def ridges_count(plates, rflags: set, fx: int, fy: int, s: int) -> int:
    rng = Rng(s)
    seeds = place(rng, plates, fx, fy)
    return rng.n + (fx * fy * len(seeds) if rflags else 0)


def parse(log: list[str], reasons: dict[int, str]):
    for e in log:
        if e.startswith("<"):
            m = re.match(r"<([\w.:]+)\((.*)\)$", e)
            yield ("open", m.group(1), m.group(2)) if m else ("open", e[1:], "")
        elif e.startswith(">"):
            name, _, facts = e[1:].partition(" ")
            yield ("close", name, facts)
        else:
            r, v, rid = e.split(":")
            yield ("lua", reasons.get(int(rid), rid), (float(r), int(float(v))))


# natives whose draw count is a constant (measured on the Duel ledgers)
FIXED = {
    "TerrainBuilder.StampContinents": 43,
    "TerrainBuilder.GetInlandCorner": 4,
    "AreaBuilder.Recalculate": 0,
    "TerrainBuilder.AnalyzeChokepoints": 0,
    "TerrainBuilder.GenerateFloodplains": 0,
    "TerrainBuilder.AddIce": 0,
    "TerrainBuilder.AddCoastalLowland": 0,
    "TerrainBuilder.SetWOfRiver": 0,
    "TerrainBuilder.SetNWOfRiver": 0,
    "TerrainBuilder.SetNEOfRiver": 0,
    "Map.GetContinentsInUse": 0,
    "StartPositioner.DivideMapIntoMajorRegions": 0,
    "StartPositioner.DivideMapIntoMinorRegions": 0,
    "FractalWrap": 0,
}


class Model:
    def __init__(self, plate_value: int):
        self.plate_value = plate_value
        self.default_creates = 0
        self.world_age = None
        self.flags = {"FRAC_WRAP_X"}

    def block(self, pending, s):
        """[(label, count or None)] for a block of natives starting at state s"""
        items = []
        tect = []
        for name, args, _facts in pending:
            if name in ("Fractal.Create", "Fractal.CreateRifts"):
                a = split_args(args)
                n, exp, flags, exps = fractal_count(name, a, s)
                items.append((f"{name}({args})", n))
                s = advance(s, n)
                if name == "Fractal.CreateRifts" or ("FRAC_POLAR" in flags and exps == (6, 5)):
                    k = ridges_count(self.plate_value, set(), exp[0], exp[1], s)
                    items.append((f"[not wrapped] Fractal:BuildRidges({self.plate_value},{{}},1,2) on {exp}", k))
                    s = advance(s, k)
                if exps == (-1, -1):
                    self.default_creates += 1
                    tect.append(exp)
                    if self.default_creates == 2 and self.world_age is not None:
                        wa = self.world_age
                        adjust = 2.0 * (0.75 if wa < 3 else 1.5 if wa > 3 else 1.0)
                        plates = 9 * adjust
                        for which in ("hills", "mountains"):
                            k = ridges_count(plates, self.flags, exp[0], exp[1], s)
                            items.append((f"[not wrapped] {which} Fractal:BuildRidges({plates},{{FRAC_WRAP_X}},10,5) "
                                          f"on {exp}", k))
                            s = advance(s, k)
            elif name in FIXED:
                items.append((f"{name}({args})", FIXED[name]))
                s = advance(s, FIXED[name])
            else:
                items.append((f"{name}({args})", None))
        return items


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("session")
    p.add_argument("--line", type=int, default=0)
    p.add_argument("--total", type=int, default=0, help="the map's measured draw count (draws_before_probe)")
    p.add_argument("--kmax", type=int, default=1_500_000)
    p.add_argument("--plate-value", type=int, default=3, help="Maps.PlateValue of the size (Duel 3)")
    a = p.parse_args()
    rec = [json.loads(ln) for ln in pathlib.Path(a.session).read_text(encoding="utf-8").splitlines() if ln][a.line]
    total = a.total or rec.get("draws_before_probe")
    reasons = {int(k): v for k, v in rec["probe"]["reasons"].items()}
    ents = list(parse(rec["probe"]["log"], reasons))
    s = rec["map_seed"] & M32
    pos = 0
    model = Model(a.plate_value)
    # a set world age (MapConfiguration world_age 1 new / 2 standard / 3 old)
    # is Continents.lua's world_age_new 5 / normal 3 / old 2; unset, it is rolled
    wa = str(rec.get("map_options", {}).get("world_age"))
    model.world_age = {"1": 5, "2": 3, "3": 2}.get(wa)
    rows = []  # (kind, label, count, detail)
    pending = []
    lua_run = collections.Counter()
    bad = 0

    def flush_lua():
        if lua_run:
            rows.append(("lua", ", ".join(f"{k} x{v}" for k, v in lua_run.most_common()), sum(lua_run.values()), ""))
            lua_run.clear()

    def emit_block(k):
        items = model.block(pending, s)
        known = [n for _, n in items if n is not None]
        msum = sum(known)
        unknown = [lbl for lbl, n in items if n is None]
        for lbl, n in items:
            rows.append(("native", lbl, n, ""))
        if k is None:
            verdict = f"model {msum} (+ {len(unknown)} unmodelled)"
        elif msum == k:
            verdict = f"model {msum} EXACT" + (f"; the {len(unknown)} unmodelled call(s) draw 0" if unknown else "")
        else:
            verdict = f"model {msum}; residual {k - msum} over {len(unknown)} unmodelled call(s)"
        rows.append(("block", f"{len(pending)} logged native call(s)", k, verdict))

    for i, (kind, name, x) in enumerate(ents):
        if kind == "open":
            if name != "GenerateMap":
                pending.append([name, x, ""])
            continue
        if kind == "close":
            if not name.startswith("GenerateMap") and pending:
                pending[-1][2] = x
            continue
        r, v = x
        if pending or val(step(s), r) != v:
            # the gap before this draw: the smallest k (within what the map's
            # measured total leaves) with this and the next Lua draws of the
            # run all matching; the window shrinks when a native inside the
            # run draws too
            run = []
            j = i
            while j < len(ents) and ents[j][0] == "lua" and len(run) < 40:
                run.append(ents[j][2])
                j += 1
            kcap = a.kmax if total is None else min(a.kmax, total - pos - 1)
            k_found = None
            for win in (40, 24, 16, 10, 6):
                follow = run[:win]
                if win > len(run) and win != 40:
                    continue
                t = s
                for k in range(kcap + 1):
                    t2 = t
                    ok = True
                    for (rr, vv) in follow:
                        t2 = step(t2)
                        if val(t2, rr) != vv:
                            ok = False
                            break
                    if ok:
                        k_found = k
                        break
                    t = step(t)
                if k_found is not None:
                    break
            flush_lua()
            if pending:
                emit_block(k_found)
            else:
                rows.append(("gap", f"unlogged native draws before '{name}' (Lua entry {i})", k_found, ""))
            if k_found is None:
                print("alignment failed at entry", i)
                break
            s = advance(s, k_found)
            pos += k_found
            pending = []
        s = step(s)
        pos += 1
        if val(s, r) != v:
            bad += 1
        if name == "Random World Age - Lua" and model.world_age is None:
            model.world_age = 2 + v
        lua_run[name] += 1
    flush_lua()
    tail = None if total is None else total - pos
    if pending:
        emit_block(tail)
    elif tail:
        rows.append(("tail", "unlogged draws after the last Lua draw", tail, ""))
    run = 0
    for kind, label, n, detail in rows:
        if kind in ("lua", "block", "tail", "gap") and n is not None:
            run += n
        if kind == "native":
            print(f"                   {label[:100]:<100} {n if n is not None else '?'}")
        else:
            print(f"{run:8d} {kind:6s} {str(n):>7}  {label[:120]}  {detail}")
    print(f"world age {model.world_age}; Lua draws not matching at their position: {bad}")
    print(f"ledger total {run}; measured {total}")
    out = pathlib.Path(a.session).with_name(pathlib.Path(a.session).stem + "_ledger.json")
    out.write_text(json.dumps(rows, indent=0), encoding="utf-8")
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
