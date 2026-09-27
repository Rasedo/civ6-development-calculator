"""Turn order: record every turn-processing event the game fires, in order.

    python tools/civ6lab/turnorder_run.py --host 127.0.0.2 --turns 1 --tag t150 [--how autoplay|endturn]
        [--gcsnap --watch 0] [--snap tools/civ6lab/x.lua --snap-state InGame] [--no-advance]

Three recorders, each a global log inside one Lua state (globals persist
across tuner calls), armed once per game load:
  GC  `turnorder_arm.lua` in GameCore_Tuner: GameEvents.* and Events.*
  IG  `turnorder_arm.lua` in InGame: Events.*
  SN  `turnorder_snapgc.lua` in GameCore_Tuner (--gcsnap): at each GE event, the
      event player's state read synchronously (--watch: the player read at the
      game-turn events)
  C9  `turnorder_c93snap.lua` in GameCore_Tuner (--c93): at each GE event the
      event player's gold / yields / research / faith / score, and at the turn
      boundaries the world (CO2, temperature, climate level, sea-level
      countdown, scores, favor, the great-people timeline, the winner) and the
      plots `turnorder_c93rig.lua ZRIG=watch` names
It clears them, optionally runs a probe (--snap) before and after, advances
`--turns` turns (lab.advance), and after each turn swaps each log out in one
call and reads it back. One JSON line per event to
runs/turnorder/<tag>_<stamp>.jsonl:
    {"state": "GC"|"IG"|"SN", "seq", "turn", "seed", "ev", "args": [...]}
The caller bounds the wall clock (`h3_bounded.py`); every tuner call here has
its own timeout.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import lab  # noqa: E402
from tuner import Tuner  # noqa: E402

ARM = (HERE / "turnorder_arm.lua").read_text(encoding="utf-8")
SNAP = (HERE / "turnorder_snapgc.lua").read_text(encoding="utf-8")
C93 = (HERE / "turnorder_c93snap.lua").read_text(encoding="utf-8")
# recorder -> (Lua state, source, the ZSTATE token)
RECORDERS = {"GC": (lab.GC, ARM, "GC"), "IG": (lab.IG, ARM, "IG"), "SN": (lab.GC, SNAP, "GC"),
             "C9": (lab.GC, C93, "GC")}


def lua(rec: str, mode: str, watch: int = 0, **kw) -> str:
    s = RECORDERS[rec][1].replace("ZMODE", mode).replace("ZSTATE", RECORDERS[rec][2])
    s = s.replace("ZOFF", str(kw.get("off", 0))).replace("ZN", str(kw.get("n", 0)))
    return s.replace("ZMARK", kw.get("mark", "")).replace("ZWATCH", str(watch))


def call(t: Tuner, rec: str, mode: str, timeout: float = 15, **kw) -> list[str]:
    return t.run(RECORDERS[rec][0], lua(rec, mode, **kw), timeout=timeout)


def read_all(t: Tuner, rec: str) -> list[str]:
    """Swap the live log out (one atomic call, so nothing recorded between a
    read and a clear is lost) and read the swapped-out log in chunks."""
    call(t, rec, "swap")
    out: list[str] = []
    off = 0
    while True:
        lines = call(t, rec, "readtaken", timeout=60, off=off, n=1500)
        body = lines[:-1]
        out += body
        total = int(lines[-1].split()[1])
        off += len(body)
        if off >= total or not body:
            return out


def parse(rec: str, line: str) -> dict:
    p = line.split("|")
    return {"state": rec, "seq": int(p[0]), "turn": int(p[1]) if p[1].lstrip("-").isdigit() else p[1],
            "seed": int(p[2]) & 0xFFFFFFFF if p[2].lstrip("-").isdigit() else None, "ev": p[3],
            "args": p[4:]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--turns", type=int, default=1)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--how", choices=("autoplay", "endturn"), default="autoplay")
    ap.add_argument("--gcsnap", action="store_true")
    ap.add_argument("--c93", action="store_true", help="the C-93 witness (turnorder_c93snap.lua)")
    ap.add_argument("--watch", type=int, default=0)
    ap.add_argument("--snap", action="append", default=[], help="a Lua probe run before and after")
    ap.add_argument("--snap-state", action="append", default=[])
    ap.add_argument("--set", action="append", default=[], help="TOKEN=VALUE substituted in the --snap probes")
    ap.add_argument("--no-advance", action="store_true")
    ap.add_argument("--wait", type=float, default=150.0)
    a = ap.parse_args()
    recs = ["GC", "IG"] + (["SN"] if a.gcsnap else []) + (["C9"] if a.c93 else [])
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    outp = HERE / "runs" / "turnorder" / f"{a.tag}_{stamp}.jsonl"
    outp.parent.mkdir(parents=True, exist_ok=True)
    t = Tuner(a.host).connect()
    for r in recs:
        print(r, [x[:120] for x in call(t, r, "arm", timeout=30, watch=a.watch)][:1])
        call(t, r, "clear")
        call(t, r, "on")
    with outp.open("w", encoding="utf-8") as f:
        def snap(when: str) -> None:
            for i, path in enumerate(a.snap):
                state = a.snap_state[i] if i < len(a.snap_state) else lab.GC
                src = pathlib.Path(path).read_text(encoding="utf-8")
                for kv in a.set:
                    k, v = kv.split("=", 1)
                    src = src.replace(k, v)
                lines = t.run(state, src, timeout=60)
                f.write(json.dumps({"kind": "snap", "when": when, "probe": path, "state": state,
                                    "lines": lines}, ensure_ascii=False) + "\n")
                print(f"snap {when} {path}: {len(lines)} lines")
        snap("before")
        lp = lab.local_player(t)
        t0 = lab.turn(t)
        f.write(json.dumps({"kind": "start", "turn": t0, "lp": lp, "how": a.how}) + "\n")
        for k in range(0 if a.no_advance else a.turns):
            for r in recs:
                call(t, r, "mark", mark=f"before_advance_{k}", watch=a.watch)
            tn = lab.advance(t, a.how, lp, a.wait)
            print(f"advanced to {tn}")
            for r in recs:
                call(t, r, "mark", mark=f"after_advance_{k}", watch=a.watch)
            for r in recs:
                lines = read_all(t, r)
                for ln in lines:
                    f.write(json.dumps(parse(r, ln), ensure_ascii=False) + "\n")
                print(f"{r}: {len(lines)} events")
            f.flush()
        snap("after")
    t.close()
    print("wrote", outp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
