"""civ6lab fleet — several Civ 6 instances at once, each playing observer
games back to back under a watch (the observer fleet).

    python tools/civ6lab/fleet.py --hosts 3 --config tools/civ6lab/obs_small.json \\
        --games 2 --turns 250 --tag obs
    python tools/civ6lab/fleet.py --hosts 2 --save lab4_t100 --human --games 1 --turns 20 --tag l4
    python tools/civ6lab/fleet.py --hosts 3 --config tools/civ6lab/obs_small.json --games 2 \\
        --lua cs_watch.lua --state GameCore_Tuner --lua cs_watch2.lua --state InGame

Hosts are 127.0.0.1 .. 127.0.0.N. LAUNCH: every instance not already up is
started at once (`--stagger` seconds apart), every main menu is waited for in
parallel, and the windows are retiled once. Then, per host in parallel, a
loop of games: before each one the stop file (`--stop-file`) ends the loop
and the box's free memory must be at least `--min-free-mb` (the host waits,
logging, until it is); the game is `game.py new --config` (an all-AI
observer game) or `game.py load --save`; `watch.py` plays it for `--turns`
turns under the tag `<tag><host number>g<game>` with the readers given by
`--lua` / `--state`; between games the watch exits to the main menu, and the
last game ends as `--at-end` says. Every step of a host is a subprocess whose
output goes to that host's log, `runs/fleet_<tag><n>_<stamp>.log`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import pathlib
import subprocess
import sys
import threading
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402
import watch  # noqa: E402

HERE = pathlib.Path(__file__).parent
PORT = 4318


def ready(host: str, wait: float, log) -> bool:
    """wait for the host's main menu with no game behind it (the state
    `game.py new` needs); a host found inside a game is sent to the main
    menu first"""
    deadline = time.monotonic() + wait
    sent = False
    while time.monotonic() < deadline:
        try:
            t = Tuner(host, PORT).connect()
            states = t.refresh_states()
            if game.GC in states:
                if not sent:
                    log(f"in a game; to the main menu: {game.finish(t, host, 'menu')}")
                    sent = True
            elif game.FE in states:
                t.close()
                return True
            t.close()
        except TunerError:
            pass
        time.sleep(3.0)
    log(f"no main menu within {wait:.0f}s")
    return False


def run(cmd: list[str], fh, log) -> int:
    log("$ " + " ".join(cmd))
    fh.flush()
    env = dict(os.environ, PYTHONUTF8="1")
    return subprocess.run(cmd, stdout=fh, stderr=subprocess.STDOUT, cwd=str(HERE.parents[1]), env=env).returncode


def host_loop(n: int, a, stamp: str) -> None:
    host = f"127.0.0.{n}"
    path = lab.RUNS / f"fleet_{a.tag}{n}_{stamp}.log"
    with open(path, "a", encoding="utf-8", newline="\n") as fh:
        def log(s: str) -> None:
            fh.write(f"[{dt.datetime.now().strftime('%H:%M:%S')}] {s}\n")
            fh.flush()
        print(f"{host} -> {path.name}", flush=True)
        py = sys.executable
        for g in range(a.games):
            if a.stop_file.exists():
                log(f"stop file {a.stop_file} found; no new game")
                break
            while watch.free_mb() < a.min_free_mb:
                if a.stop_file.exists():
                    break
                log(f"free memory {watch.free_mb():.0f} MB below {a.min_free_mb:.0f}; waiting")
                time.sleep(60.0)
            if a.stop_file.exists():
                log(f"stop file {a.stop_file} found; no new game")
                break
            if not ready(host, a.wait, log):
                break
            if a.save:
                start = [py, str(HERE / "game.py"), "--host", host, "load", a.save]
            else:
                start = [py, str(HERE / "game.py"), "--host", host, "new", "--config", str(a.config)]
            if run(start, fh, log) != 0:
                log("the game did not start; this host stops")
                break
            last = g == a.games - 1
            cmd = [py, str(HERE / "watch.py"), "--host", host, "--turns", str(a.turns),
                   "--tag", f"{a.tag}{n}g{g}", "--save-every", str(a.save_every),
                   "--min-free-mb", str(a.min_free_mb), "--at-end", a.at_end if last else "menu"]
            if not a.human:
                cmd.append("--observer")
            for lua in a.lua or []:
                cmd += ["--lua", lua]
            for state in a.state or []:
                cmd += ["--state", state]
            rc = run(cmd, fh, log)
            log(f"game {g} watch exit {rc}")
            if rc != 0:
                break
        log("done")
    print(f"{host} done", flush=True)


def launch(hosts: list[str], a) -> list[str]:
    """start every host not up, wait for all main menus in parallel, retile;
    returns the hosts that reached the menu"""
    exe = pathlib.Path(a.exe)
    for i, h in enumerate(hosts):
        if game.up(h, PORT):
            print(f"{h} already up", flush=True)
            continue
        if not exe.exists():
            raise SystemExit(f"no game binary at {exe}; pass --exe")
        if i and a.stagger:
            time.sleep(a.stagger)
        game.spawn(h, exe)
        print(f"{h} launched", flush=True)
    ok: dict[str, bool] = {}

    def wait_one(h: str) -> None:
        ok[h] = ready(h, a.wait, lambda s: print(f"{h}: {s}", flush=True))

    threads = [threading.Thread(target=wait_one, args=(h,)) for h in hosts]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    game.retile()
    up = [h for h in hosts if ok.get(h)]
    print(f"main menu on {len(up)} of {len(hosts)}: {', '.join(up)}", flush=True)
    return up


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--hosts", type=int, required=True, help="instances, on 127.0.0.1 .. 127.0.0.N")
    p.add_argument("--stagger", type=float, default=0.0, help="seconds between process starts")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--config", type=pathlib.Path, help="game.py new --config: a new game per round")
    src.add_argument("--save", help="game.py load: this named save per round")
    p.add_argument("--human", action="store_true", help="the games have a human seat (watch by Autoplay)")
    p.add_argument("--games", type=int, default=1, help="games per host")
    p.add_argument("--turns", type=int, default=250)
    p.add_argument("--tag", default="obs")
    p.add_argument("--save-every", type=int, default=25)
    p.add_argument("--lua", action="append", help="watch.py --lua, in order (repeatable)")
    p.add_argument("--state", action="append", help="watch.py --state, in order (repeatable)")
    p.add_argument("--at-end", choices=game.AT_END, default="menu", help="the fate of each host's LAST game")
    p.add_argument("--min-free-mb", type=float, default=2048.0)
    p.add_argument("--stop-file", type=pathlib.Path, default=lab.RUNS / "fleet.stop",
                   help="present before a game starts: that host starts no more games")
    p.add_argument("--wait", type=float, default=600.0, help="seconds to allow a main menu")
    p.add_argument("--exe", default=str(game.CIV6_EXE))
    a = p.parse_args(argv)
    if a.state and len(a.state) != len(a.lua or []):
        p.error("give one --state per --lua, or none")
    lab.RUNS.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    hosts = [f"127.0.0.{n}" for n in range(1, a.hosts + 1)]
    up = launch(hosts, a)
    threads = [threading.Thread(target=host_loop, args=(int(h.rsplit(".", 1)[1]), a, stamp)) for h in up]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return 0 if len(up) == len(hosts) else 1


if __name__ == "__main__":
    sys.exit(main())
