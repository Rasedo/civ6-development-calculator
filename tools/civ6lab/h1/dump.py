"""H-1: the per-turn full-state dump of a running Civ 6 game, over the tuner.

    python tools/civ6lab/h1/dump.py --host 127.0.0.2 snap --out runs/h1_x.jsonl
    python tools/civ6lab/h1/dump.py --host 127.0.0.2 --deadline 170 play --out runs/h1_x.jsonl --turns 40
    python tools/civ6lab/h1/dump.py --host 127.0.0.2 --deadline 170 play --out runs/h1_x.jsonl --turns 40 --observer

A record is ONE JSON line per turn: `turn`, `seed` (GameCore's
`Game.GetRandomSeed()` read at the dump), `turnBefore` / `turnAfter` (the
counter read before and after the dump; a record whose counter moved under
it carries `moved: true` and no check reads it), `head`, `map` (one list per
row y, one plot list per x — the layout `h1_dump_ig.lua` documents),
`players`, `religions`, `congress` (the World Congress resolutions table,
raw), `cities` (each with its `plots`: the map plots whose
owner and owning city are the city's), `units`. The catalogs (index -> type
name) go once to `<out>.cat.json`.

`play` passes turns one at a time and dumps after each until `--turns` more
turns are recorded or the wall `--deadline` is near; it is resumable — run it
again on the same `--out` and it carries on from the game's current turn. In
a game with a human seat the seat is Autoplayed one turn at a time
(`lab.advance`), so the game HOLDS at the seat's turn while the dump reads:
the state cannot move under it. `--observer` follows an all-AI game as
`watch.py` does; the counter can move during a dump there (an observer game
cannot be paused from the tuner), which the `moved` flag records.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
LAB = HERE.parent
sys.path.insert(0, str(LAB))
from tuner import Tuner, TunerError  # noqa: E402
import h4  # noqa: E402
import lab  # noqa: E402

GC, IG = lab.GC, lab.IG
PRELUDE = (LAB / "lab_json.lua").read_text(encoding="utf-8")


def lua(name: str, cat: bool = False) -> str:
    code = (HERE / name).read_text(encoding="utf-8")
    return PRELUDE + "\n" + code.replace("ZCAT", "1" if cat else "0")


def snapshot(t: Tuner, cat: bool, timeout: float) -> tuple[dict, dict | None]:
    """One turn's record, and the catalog when `cat`."""
    before = lab.turn(t)
    gc_lines = t.run(GC, lua("h1_dump_gc.lua"), timeout=timeout)
    ig_lines = t.run(IG, lua("h1_dump_ig.lua", cat), timeout=timeout)
    after = lab.turn(t)
    rec: dict = {"turnBefore": before, "turnAfter": after, "moved": before != after,
                 "map": [], "players": [], "cities": [], "units": [], "religions": None, "errors": []}
    catalog = None
    for ln in gc_lines + ig_lines:
        try:
            o = json.loads(ln)
        except ValueError:
            rec["errors"].append(ln)
            continue
        k = o.pop("k", None)
        if k == "gc":
            rec["turn"], rec["seed"] = o["turn"], o["seed"]
        elif k == "head":
            rec["head"] = o
        elif k == "cat":
            catalog = o
        elif k == "row":
            rec["map"].append(o["plots"])
        elif k == "player":
            rec["players"].append(o)
        elif k == "congress":
            rec["congress"] = o["resolutions"]
        elif k == "religions":
            rec["religions"] = o["list"]
        elif k == "city":
            rec["cities"].append(o)
        elif k == "unit":
            rec["units"].append(o)
        elif k == "end":
            rec["turnEnd"] = o["turn"]
    by_city: dict[tuple[int, int], list[int]] = {}
    for y, row in enumerate(rec["map"]):
        for x, p in enumerate(row):
            if p[6] >= 0 and isinstance(p[19], int) and p[19] >= 0:
                by_city.setdefault((p[6], p[19]), []).append(y * len(row) + x)
    for c in rec["cities"]:
        c["plots"] = by_city.get((c["owner"], c["id"]), [])
    return rec, catalog


def write(out: pathlib.Path, rec: dict, catalog: dict | None) -> None:
    with open(out, "a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
    if catalog is not None:
        cat = out.with_suffix(".cat.json")
        cat.write_text(json.dumps(catalog), encoding="utf-8", newline="\n")


def recorded_turns(out: pathlib.Path) -> set[int]:
    if not out.exists():
        return set()
    done = set()
    for ln in out.read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(ln)
        except ValueError:
            continue
        if not r.get("moved"):
            done.add(r.get("turnBefore"))
    return done


def cmd_snap(a, t: Tuner) -> int:
    rec, cat = snapshot(t, not a.out.with_suffix(".cat.json").exists(), a.timeout)
    write(a.out, rec, cat)
    print(f"turn {rec.get('turn')} moved={rec['moved']} plots={sum(len(r) for r in rec['map'])}"
          f" players={len(rec['players'])} cities={len(rec['cities'])} units={len(rec['units'])}"
          f" errors={len(rec['errors'])} -> {a.out}")
    return 0


def cmd_play(a, t: Tuner) -> int:
    lp = -1 if a.observer else lab.local_player(t)
    done = recorded_turns(a.out)
    left = a.turns
    end = a.t0 + a.deadline - a.reserve
    while left > 0:
        now = lab.turn(t)
        if now not in done:
            rec, cat = snapshot(t, not a.out.with_suffix(".cat.json").exists(), a.timeout)
            write(a.out, rec, cat)
            if not rec["moved"]:
                done.add(now)
            left -= 1
            print(f"turn {rec.get('turn')} moved={rec['moved']} cities={len(rec['cities'])}"
                  f" units={len(rec['units'])} errors={len(rec['errors'])}"
                  f" at {time.monotonic() - a.t0:.0f}s", flush=True)
        if left <= 0 or time.monotonic() >= end:
            break
        wait = max(5.0, end - time.monotonic())
        try:
            if a.observer:
                lab.wait_turn(t, now, -1, wait, lambda s: print(s, flush=True), one_more_turn=True)
            else:
                lab.advance(t, "autoplay", lp, wait, lambda s: print(s, flush=True), one_more_turn=True)
        except lab.TurnStalled as e:
            print(f"stalled: {e}")
            break
        except lab.GameOver as e:
            print(f"game_over {json.dumps(e.info)}")
            break
    print(f"recorded {a.turns - left} turn(s) this call; the game is at turn {lab.turn(t)}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.2")
    p.add_argument("--deadline", type=float, default=170.0, help="wall seconds this call may take")
    p.add_argument("--reserve", type=float, default=25.0, help="seconds kept back for the last dump")
    p.add_argument("--timeout", type=float, default=60.0, help="seconds one Lua dump may take")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snap")
    s.add_argument("--out", type=pathlib.Path, required=True)
    s.set_defaults(fn=cmd_snap)
    s = sub.add_parser("play")
    s.add_argument("--out", type=pathlib.Path, required=True)
    s.add_argument("--turns", type=int, default=10)
    s.add_argument("--observer", action="store_true")
    s.set_defaults(fn=cmd_play)
    a = p.parse_args(argv)
    a.t0 = time.monotonic()
    h4.guard(a.deadline, a.cmd)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    t = h4.connect(a.host)
    try:
        return a.fn(a, t)
    except TunerError as e:
        print("TUNER:", e)
        return 1
    finally:
        t.close()


if __name__ == "__main__":
    sys.exit(main())
