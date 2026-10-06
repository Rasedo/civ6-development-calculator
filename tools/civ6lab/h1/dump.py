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
raw), `events` (the random events of the turn and the one before),
`greatPeople` (every recruited person by individual), `parks` (the
National Parks' plots), `cities` (each with its `plots`: the map plots whose
owner and owning city are the city's), `units`, and from the turn-start
witness (`h1_starts.lua`, armed by `play`) `starts` (per player the last turn
its PlayerTurnStarted and PlayerTurnStartComplete fired, read before the
dump; `startsMoved: true` when one fired while it read) and `witness` (each
player's state at those two points of its block, for the record's turn and
the one before). The catalogs (index -> type name) go once to
`<out>.cat.json`.

`play` passes turns one at a time and dumps after each until `--turns` more
turns are recorded or the wall `--deadline` is near; it is resumable — run it
again on the same `--out` and it carries on from the game's current turn. In
a game with a human seat the seat is Autoplayed one turn at a time
(`lab.advance`), so the game HOLDS at the seat's turn while the dump reads:
the state cannot move under it; the dump waits (`--start-wait`) until the
seat's own turn start has run (`wait_started`), so every record holds it. `--observer` follows an all-AI game as
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


def lua(name: str, cat: bool = False, **tokens: str | int) -> str:
    code = (HERE / name).read_text(encoding="utf-8").replace("ZCAT", "1" if cat else "0")
    for k, v in tokens.items():
        code = code.replace(k, str(v))
    return PRELUDE + "\n" + code


def starts(t: Tuner, mode: str, timeout: float = 30.0) -> dict:
    """The turn-start witness (`h1_starts.lua`): `arm` installs its two
    listeners in GameCore_Tuner (once per game), `starts` and `read` only
    read. Returns the read line: `starts` (per player the last turn its
    PlayerTurnStarted and PlayerTurnStartComplete fired) and, from `read`,
    `witness` (each player's state at those two points, for the current turn
    and the one before)."""
    out = t.run(GC, lua("h1_starts.lua", ZMODE=mode, ZTURN=lab.turn(t)), timeout=timeout)
    for ln in reversed(out):
        try:
            o = json.loads(ln)
        except ValueError:
            continue
        if o.get("k") == "starts":
            return o
    return {"starts": {}, "witness": {}, "errors": out[-3:]}


def start_complete(o: dict, player: int) -> int:
    """The last turn `player`'s turn start completed, per a `starts` read
    (-1 never seen)."""
    v = (o.get("starts") or {}).get(str(player))
    return int(v[1]) if isinstance(v, list) and len(v) > 1 else -1


def wait_started(t: Tuner, lp: int, turn: int, limit: float, log, first: float = 2.0, poll: float = 3.0) -> bool:
    """Hold the dump until the local seat's start of `turn` has completed
    (its PlayerTurnStartComplete fired, `h1_starts.lua`): the counter moves
    before the game's turn change and the seat's own block run (the era
    change, the per-turn favor, the seat's banks), and a dump read in that
    gap catches the seat's cities before their turn start — the records'
    "a turn start missing" (1103-1112: every era's first turn and the turns
    a screen stood over the change). A screen or a session holding the turn
    is answered as `lab.wait_turn` answers it. False when `limit` seconds
    pass first; the record's `starts` then shows it."""
    t0 = time.monotonic()
    looked = t0 + first - poll
    while time.monotonic() - t0 < limit:
        try:
            if start_complete(starts(t, "starts"), lp) >= turn:
                return True
        except TunerError:
            pass
        now = time.monotonic()
        if now - looked >= poll:
            looked = now
            try:
                for c in lab.diagnose(t, lp):
                    if c[0] in ("popup", "session"):
                        log(f"    start held: {c[0]} {c[1]} -> {lab.handle(t, lp, c)}")
            except (TunerError, IndexError) as e:
                log(f"    diagnose failed: {e}")
        time.sleep(0.25)
    return False


def snapshot(t: Tuner, cat: bool, timeout: float) -> tuple[dict, dict | None]:
    """One turn's record, and the catalog when `cat`."""
    before = lab.turn(t)
    st = starts(t, "read", timeout)
    gc_lines = t.run(GC, lua("h1_dump_gc.lua"), timeout=timeout)
    ig_lines = t.run(IG, lua("h1_dump_ig.lua", cat), timeout=timeout)
    st_after = starts(t, "starts", timeout)
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
        elif k == "events":
            rec["events"] = o["list"]
        elif k == "greatPeople":
            rec["greatPeople"] = o["past"]
        elif k == "parks":
            rec["parks"] = o["list"]
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
    # whose turn start the record holds (`h1_starts.lua`), read before the
    # dump; a start that ran while it read is flagged
    if st.get("armed"):
        rec["starts"] = st.get("starts") or {}
        rec["witness"] = st.get("witness") or []
        if (st_after.get("starts") or {}) != rec["starts"]:
            rec["startsMoved"] = True
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
    log = lambda s: print(s, flush=True)  # noqa: E731
    while left > 0:
        now = lab.turn(t)
        # the witness listens from here on (once per game; a loaded game arms
        # afresh) — the turn starts before this call ran are not witnessed
        st = starts(t, "arm")
        if now not in done:
            # the seat's own turn start runs before its record is read
            if lp >= 0 and st.get("armed") and start_complete(st, lp) == now - 1:
                if not wait_started(t, lp, now, a.start_wait, log):
                    log(f"    turn {now}: the seat's turn start did not complete within {a.start_wait}s")
            rec, cat = snapshot(t, not a.out.with_suffix(".cat.json").exists(), a.timeout)
            write(a.out, rec, cat)
            if not rec["moved"]:
                done.add(now)
            left -= 1
            print(f"turn {rec.get('turn')} moved={rec['moved']} cities={len(rec['cities'])}"
                  f" units={len(rec['units'])} errors={len(rec['errors'])}"
                  f" at {time.monotonic() - a.t0:.0f}s", flush=True)
            # the seat is gone (the dump lists only living players): with no
            # seat's turn to hold, the game would run on unheld — stop here
            if lp >= 0 and not any(p.get("id") == lp for p in rec["players"]):
                print(f"game_over {json.dumps({'seatEliminated': lp, 'turn': rec.get('turn')})}")
                break
        if left <= 0 or time.monotonic() >= end:
            break
        wait = max(5.0, end - time.monotonic())
        try:
            if a.observer:
                lab.wait_turn(t, now, -1, wait, log, one_more_turn=True)
            else:
                lab.advance(t, "autoplay", lp, wait, log, one_more_turn=True)
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
    p.add_argument("--start-wait", type=float, default=60.0,
                   help="seconds `play` waits for the seat's own turn start before it dumps")
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
