"""civ6lab fleet — several Civ 6 instances at once, each playing observer
games back to back under a watch (the observer fleet), and the summary of a
run.

    python tools/civ6lab/fleet.py run --hosts 3 --config tools/civ6lab/obs_small.json \\
        --games 2 --turns 250 --tag obs
    python tools/civ6lab/fleet.py run --hosts 2 --first-host 3 --config tools/civ6lab/c74s2_duel.json \\
        --games 0 --budget-min 120 --mem-cap-mb 8000 --tag duel
    python tools/civ6lab/fleet.py run --hosts 2 --save lab4_t100 --human --games 1 --turns 20 --tag l4
    python tools/civ6lab/fleet.py run --hosts 3 --config tools/civ6lab/obs_small.json --games 2 \\
        --lua cs_watch.lua --state GameCore_Tuner --lua cs_watch2.lua --state InGame
    python tools/civ6lab/fleet.py summary tools/civ6lab/runs/fleet_obs_<stamp>_manifest.jsonl

RUN. Hosts are 127.0.0.K .. 127.0.0.K+N-1 (`--first-host` K, default 1;
`--hosts` N). LAUNCH: every instance not already up is started at once
(`--stagger` seconds apart), every main menu is waited for in parallel, and
the windows are retiled once. Then, per host in parallel, a loop of games
(`--games`, 0 = no limit) that ends at the stop file (`--stop-file`, read
before each game), at the wall-clock budget (`--budget-min`: no game starts
after it, and the running watch stops at it), or after `--max-crashes`
crashes on that host. Before each game the box's free memory must be at
least `--min-free-mb` (the host waits, logging, until it is). The game is
`game.py new --config` with a fresh map and game seed (`--seed-base` B gives
B+2k and B+2k+1 for the run's k-th game, otherwise both are drawn at random)
or `game.py load --save`; `watch.py` plays it for `--turns` turns under the
tag `<tag><host number>g<game>` with the readers given by `--lua` /
`--state`; between games the watch exits to the main menu, and the last game
ends as `--at-end` says (`close` also closes an instance whose loop ended
early).

RECOVERY. A game counts as crashed when `game.py` cannot start it, when the
watch ends `crash` (the instance's process died, its tuner stayed
unreachable past `--unreachable` seconds, or a turn stood still past
`--wait`), or when the host shows no main menu after a game: the instance is
closed, relaunched, and the loop goes on with the next game. An instance
whose private memory passes `--mem-cap-mb` after a game is closed and
relaunched the same way.

RECORDS. Every step of a host is a subprocess whose output goes to that
host's log, `runs/fleet_<tag><n>_<stamp>.log`. The run's MANIFEST,
`runs/fleet_<tag>_<stamp>_manifest.jsonl`, holds one JSON line per record,
by `kind`:
* `run` — the stamp, hosts and arguments; `run_end` — the wall time at the end;
* `game` — host, game number, tag, config (or save), the seeds asked for,
  the game's own readback (`setup`: turn, seeds, humans, minors, majors),
  wall start and end, start turn, turn reached, turns played, the end
  (`target`, `game_over`, `stop`, `crash`) and why, the reader logs, the
  event history, the host log, the reconnect count and the instance's
  private memory after the game;
* `reconnect` — a tuner reconnect inside a watch; `crash` — a crashed game;
  `relaunch` — an instance closed and started again, and why (`crash`,
  `memcap`); `stop` — why a host's loop ended.

SUMMARY. `summary <manifest>` prints games, turns, throughput (turns and
games per hour of the run's wall time), crashes, reconnects, relaunches and
endings, per host and in all, and a `cs_analyze.py` command per city-state
watch log (`cs_watch`) the run wrote.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import pathlib
import random
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


class Fleet:
    """one run's shared state: the manifest (written under a lock), the seed
    counter, the budget's deadline"""

    def __init__(self, a, stamp: str):
        self.a = a
        self.stamp = stamp
        self.manifest = lab.RUNS / f"fleet_{a.tag}_{stamp}_manifest.jsonl"
        self.deadline = time.time() + 60.0 * a.budget_min if a.budget_min else None
        self.lock = threading.Lock()
        self.k = 0
        self.rng = random.SystemRandom()

    def record(self, kind: str, **fields) -> None:
        line = json.dumps({"kind": kind, "at": time.time(), **fields})
        with self.lock, open(self.manifest, "a", encoding="utf-8", newline="\n") as fh:
            fh.write(line + "\n")

    def seeds(self) -> tuple[int, int]:
        """the next game's (map seed, game seed)"""
        with self.lock:
            k, self.k = self.k, self.k + 1
        if self.a.seed_base is not None:
            return self.a.seed_base + 2 * k, self.a.seed_base + 2 * k + 1
        return self.rng.randint(1, 2**31 - 1), self.rng.randint(1, 2**31 - 1)

    def over_budget(self) -> bool:
        return self.deadline is not None and time.time() >= self.deadline


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


def relaunch(host: str, a, log) -> bool:
    """close the instance (a dead, hung or bloated one) and start it again;
    True once its main menu is up"""
    pids = game.close_instance(host)
    log(f"closed pid {pids}")
    deadline = time.monotonic() + 60.0
    while game.instance_pids(host) and time.monotonic() < deadline:
        time.sleep(2.0)
    game.spawn(host, pathlib.Path(a.exe))
    log("relaunched")
    return ready(host, a.wait, log)


def game_setup(host: str) -> dict | None:
    """the running game's own readback (`game.game_info`)"""
    try:
        t = Tuner(host, PORT).connect()
        try:
            return game.game_info(t)
        finally:
            t.close()
    except (TunerError, ValueError) as e:
        return {"error": str(e)}


def host_loop(n: int, F: Fleet) -> None:
    a = F.a
    host = f"127.0.0.{n}"
    path = lab.RUNS / f"fleet_{a.tag}{n}_{F.stamp}.log"
    result = lab.RUNS / f"fleet_{a.tag}{n}_{F.stamp}_result.json"
    cfg = json.loads(a.config.read_text(encoding="utf-8")) if a.config else None
    with open(path, "a", encoding="utf-8", newline="\n") as fh:
        def log(s: str) -> None:
            fh.write(f"[{dt.datetime.now().strftime('%H:%M:%S')}] {s}\n")
            fh.flush()

        def restart(why: str) -> bool:
            ok = relaunch(host, a, log)
            F.record("relaunch", host=host, why=why, ok=ok)
            return ok

        print(f"{host} -> {path.name}", flush=True)
        py = sys.executable
        crashes = 0
        g = 0
        stop = "games done"
        closed = False
        while not a.games or g < a.games:
            if a.stop_file.exists():
                stop = f"stop file {a.stop_file}"
                break
            if F.over_budget():
                stop = "wall-clock budget"
                break
            while watch.free_mb() < a.min_free_mb and not a.stop_file.exists() and not F.over_budget():
                log(f"free memory {watch.free_mb():.0f} MB below {a.min_free_mb:.0f}; waiting")
                time.sleep(60.0)
            if a.stop_file.exists() or F.over_budget():
                continue
            if not ready(host, a.wait, log):
                F.record("crash", host=host, game=g, why="no main menu")
                crashes += 1
                if crashes > a.max_crashes or not restart("crash"):
                    stop = f"{crashes} crashes" if crashes > a.max_crashes else "relaunch failed"
                    break
                continue
            tag = f"{a.tag}{n}g{g}"
            rec: dict = {"host": host, "game": g, "tag": tag, "log": str(path)}
            if a.save:
                rec["save"] = a.save
                start = [py, str(HERE / "game.py"), "--host", host, "load", a.save]
            else:
                map_seed, game_seed = F.seeds()
                rec.update(config=cfg, config_file=str(a.config), map_seed=map_seed, game_seed=game_seed)
                start = [py, str(HERE / "game.py"), "--host", host, "new", "--config", str(a.config),
                         "--map-seed", str(map_seed), "--game-seed", str(game_seed)]
            rec["wall_start"] = time.time()
            rc = run(start, fh, log)
            if rc != 0:
                rec.update(wall_end=time.time(), end="crash", why=f"the game did not start (exit {rc})", turns=0)
            else:
                rec["setup"] = game_setup(host)
                log(f"setup {json.dumps(rec['setup'])}")
                last = bool(a.games) and g == a.games - 1
                cmd = [py, str(HERE / "watch.py"), "--host", host, "--turns", str(a.turns),
                       "--tag", tag, "--save-every", str(a.save_every),
                       "--min-free-mb", str(a.min_free_mb), "--at-end", a.at_end if last else "menu",
                       "--wait", str(a.turn_wait), "--unreachable", str(a.unreachable), "--result", str(result)]
                if F.deadline is not None:
                    cmd += ["--stop-at", f"{F.deadline:.0f}"]
                if not a.human:
                    cmd.append("--observer")
                for lua in a.lua or []:
                    cmd += ["--lua", lua]
                for state in a.state or []:
                    cmd += ["--state", state]
                result.unlink(missing_ok=True)
                wrc = run(cmd, fh, log)
                log(f"game {g} watch exit {wrc}")
                try:
                    res = json.loads(result.read_text(encoding="utf-8"))
                    result.unlink()
                except (OSError, ValueError):
                    res = {}
                for r in res.get("reconnects", []):
                    F.record("reconnect", host=host, game=g, **r)
                rec.update(wall_end=res.get("wall_end") or time.time(), start_turn=res.get("start_turn"),
                           target=res.get("target"), turn=res.get("turn"), end=res.get("end"), why=res.get("why"),
                           readers=res.get("readers", []), event_history=res.get("event_history"),
                           reconnects=len(res.get("reconnects", [])), watch_exit=wrc)
                if rec["end"] is None:
                    rec.update(end="crash", why=f"the watch ended with no end (exit {wrc})")
                if rec["start_turn"] is not None and rec["turn"] is not None:
                    rec["turns"] = rec["turn"] - rec["start_turn"]
                closed = last and a.at_end == "close" and rec["end"] != "crash"
            rec["private_mb"] = None if closed else game.instance_private_mb(host)
            F.record("game", **rec)
            log(f"game {g}: {rec['end']} ({rec['why']}) at turn {rec.get('turn')}")
            g += 1
            if rec["end"] == "crash":
                crashes += 1
                F.record("crash", host=host, game=g - 1, why=rec["why"])
                if crashes > a.max_crashes:
                    stop = f"{crashes} crashes"
                    break
                if not restart("crash"):
                    stop = "relaunch failed"
                    break
                continue
            if rec["end"] == "stop" and rec["why"] == "wall-clock budget":
                stop = "wall-clock budget"
                break
            mb = rec["private_mb"]
            if a.mem_cap_mb and mb is not None and mb > a.mem_cap_mb and (not a.games or g < a.games):
                log(f"private memory {mb:.0f} MB past the cap {a.mem_cap_mb:.0f}")
                if not restart("memcap"):
                    stop = "relaunch failed"
                    break
        if a.at_end == "close" and not closed:
            log(f"closing: {game.close_instance(host)}")
        F.record("stop", host=host, why=stop, games=g, crashes=crashes)
        log(f"done: {stop}")
    print(f"{host} done: {stop}", flush=True)


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


def cmd_run(a) -> int:
    if a.state and len(a.state) != len(a.lua or []):
        raise SystemExit("give one --state per --lua, or none")
    lab.RUNS.mkdir(exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    F = Fleet(a, stamp)
    hosts = [f"127.0.0.{n}" for n in range(a.first_host, a.first_host + a.hosts)]
    F.record("run", stamp=stamp, tag=a.tag, hosts=hosts,
             args={k: (str(v) if isinstance(v, pathlib.Path) else v) for k, v in vars(a).items() if k != "fn"})
    print(f"manifest -> {F.manifest}", flush=True)
    up = launch(hosts, a)
    threads = [threading.Thread(target=host_loop, args=(int(h.rsplit(".", 1)[1]), F)) for h in up]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    F.record("run_end", hosts_up=up)
    print(f"manifest -> {F.manifest}", flush=True)
    return 0 if len(up) == len(hosts) else 1


def cmd_summary(a) -> int:
    rows = [json.loads(ln) for ln in open(a.manifest, encoding="utf-8") if ln.strip()]
    run_rows = [r for r in rows if r["kind"] == "run"]
    games = [r for r in rows if r["kind"] == "game"]
    by = collections.defaultdict(list)
    for r in rows:
        by[r["kind"]].append(r)
    t0 = run_rows[0]["at"] if run_rows else min((g["wall_start"] for g in games), default=0.0)
    t1 = max([r["at"] for r in rows] + [g.get("wall_end") or 0.0 for g in games])
    hours = max(t1 - t0, 1e-9) / 3600.0
    print(f"manifest {a.manifest}")
    if run_rows:
        print(f"run {run_rows[0]['stamp']} tag {run_rows[0]['tag']} hosts {', '.join(run_rows[0]['hosts'])}")
    print(f"wall {hours * 60:.1f} min" + ("" if by["run_end"] else " (no run_end: the run is live or was killed)"))

    def line(label: str, gs: list[dict], span: float) -> None:
        turns = sum(g.get("turns") or 0 for g in gs)
        done = sum(1 for g in gs if g.get("end") in ("target", "game_over"))
        ends = collections.Counter(g.get("end") for g in gs)
        print(f"  {label:<12} games {len(gs):>3} (finished {done:>3})  turns {turns:>6}"
              f"  {turns / span:8.1f} turns/h  {done / span:6.2f} games/h  "
              + " ".join(f"{k}={v}" for k, v in sorted(ends.items(), key=lambda kv: str(kv[0]))))

    hosts = sorted({g["host"] for g in games}, key=lambda h: int(h.rsplit(".", 1)[1]))
    for h in hosts:
        line(h, [g for g in games if g["host"] == h], hours)
    line("all", games, hours)
    print(f"crashes {len(by['crash'])}  reconnects {len(by['reconnect'])}  relaunches "
          + (", ".join(f"{k} {v}" for k, v in collections.Counter(r['why'] for r in by['relaunch']).items()) or "0"))
    for r in by["crash"]:
        print(f"  crash {r['host']} game {r.get('game')}: {r['why']}")
    for r in by["stop"]:
        print(f"  stop {r['host']}: {r['why']} after {r['games']} games")
    why = collections.Counter(f"{g.get('end')}: {g.get('why')}" for g in games if g.get("end") != "target")
    for k, v in why.most_common():
        print(f"  {v} x {k}")
    cs = [p for g in games for p in g.get("readers", []) if pathlib.Path(p).name.startswith("cs_watch_")]
    if cs:
        print("city-state logs (AUDIT C-38):")
        for p in cs:
            print(f"  python tools/civ6lab/cs_analyze.py {p}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run the fleet")
    r.add_argument("--hosts", type=int, required=True, help="instances, on 127.0.0.K .. 127.0.0.K+N-1")
    r.add_argument("--first-host", type=int, default=1, help="K, the first host's last octet")
    r.add_argument("--stagger", type=float, default=0.0, help="seconds between process starts")
    src = r.add_mutually_exclusive_group(required=True)
    src.add_argument("--config", type=pathlib.Path, help="game.py new --config: a new game per round")
    src.add_argument("--save", help="game.py load: this named save per round")
    r.add_argument("--human", action="store_true", help="the games have a human seat (watch by Autoplay)")
    r.add_argument("--games", type=int, default=1, help="games per host (0: until the budget or the stop file)")
    r.add_argument("--turns", type=int, default=250)
    r.add_argument("--tag", default="obs")
    r.add_argument("--save-every", type=int, default=25)
    r.add_argument("--seed-base", type=int, help="the k-th game's seeds are B+2k (map) and B+2k+1 (game)")
    r.add_argument("--lua", action="append", help="watch.py --lua, in order (repeatable)")
    r.add_argument("--state", action="append", help="watch.py --state, in order (repeatable)")
    r.add_argument("--at-end", choices=game.AT_END, default="menu", help="the fate of each host's LAST game")
    r.add_argument("--min-free-mb", type=float, default=2048.0)
    r.add_argument("--mem-cap-mb", type=float, default=0.0,
                   help="an instance whose private memory passes this after a game is relaunched (0: no cap)")
    r.add_argument("--budget-min", type=float, default=0.0, help="wall-clock minutes for the run (0: none)")
    r.add_argument("--max-crashes", type=int, default=3, help="a host stops after more crashes than this")
    r.add_argument("--unreachable", type=float, default=300.0, help="watch.py --unreachable")
    r.add_argument("--turn-wait", type=float, default=600.0, help="watch.py --wait: seconds to allow one turn")
    r.add_argument("--stop-file", type=pathlib.Path, default=lab.RUNS / "fleet.stop",
                   help="present before a game starts: that host starts no more games")
    r.add_argument("--wait", type=float, default=600.0, help="seconds to allow a main menu")
    r.add_argument("--exe", default=str(game.CIV6_EXE))
    r.set_defaults(fn=cmd_run)
    s = sub.add_parser("summary", help="summarise a run from its manifest")
    s.add_argument("manifest", type=pathlib.Path)
    s.set_defaults(fn=cmd_summary)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
