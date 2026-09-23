"""civ6lab watch — play a game forward by Autoplay and log every city-state
each turn (AUDIT C-38: what a city-state spends, builds and fields).

    python tools/civ6lab/watch.py --turns 250 --save-every 25 --tag lab4

One JSONL per run under tools/civ6lab/runs/ (`cs_watch.lua`, one line per
living city-state per turn), a named save every `--save-every` turns
(`<tag>_t<turn>`) so a later scene can start from any point, and the whole
random-event history (`event_history.lua`) at the end — GetEventsForTurn reads
any past turn, so the one-event-a-turn premise (C-74) needs no per-turn log.
A Dedication that stalls the turn is answered by `lab.advance`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
IG = "InGame"


def _connect(host: str, port: int) -> Tuner:
    for _ in range(40):
        try:
            return Tuner(host, port).connect()
        except TunerError:
            time.sleep(3.0)
    raise TunerError("no tuner")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=4318)
    p.add_argument("--turns", type=int, default=250, help="turns to play")
    p.add_argument("--save-every", type=int, default=25)
    p.add_argument("--tag", default="watch")
    p.add_argument("--wait", type=float, default=600.0, help="seconds to allow one turn")
    a = p.parse_args(argv)
    lab.RUNS.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"cs_watch_{a.tag}_{stamp}.jsonl"
    watch = (HERE / "cs_watch.lua").read_text(encoding="utf-8")
    save = (HERE / "save_named.lua").read_text(encoding="utf-8")
    t = _connect(a.host, a.port)
    lp = lab.local_player(t)
    t0 = lab.turn(t)
    print(f"watching from turn {t0} for {a.turns} turns, seat {lp} -> {out.name}", flush=True)
    with open(out, "a", encoding="utf-8") as fh:
        for ln in t.run(lab.GC, watch, timeout=60):
            fh.write(ln + "\n")
        played = 0
        while played < a.turns:
            try:
                tn = lab.advance(t, "autoplay", lp, a.wait)
            except TunerError as e:
                print("   ", e, "- reconnecting", flush=True)
                t.close()
                t = _connect(a.host, a.port)
                continue
            played += 1
            for ln in t.run(lab.GC, watch, timeout=60):
                fh.write(ln + "\n")
            fh.flush()
            if a.save_every and tn % a.save_every == 0:
                name = f"{a.tag}_t{tn}"
                print("   ", t.run(IG, save.replace("SAVENAME", name))[-1], flush=True)
            print(f"turn {tn}", flush=True)
    hist = lab.RUNS / f"event_history_{a.tag}_{stamp}.txt"
    hist.write_text("\n".join(t.run(IG, (HERE / "event_history.lua").read_text(encoding="utf-8"), timeout=120)),
                    encoding="utf-8")
    print("event history ->", hist.name)
    t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
