"""C-74-S2 / C-38-S2: games back to back on ONE instance (the host's own),
each from a config with its own map and game seed, played one Autoplay turn
at a time by `c74s2_watch.py` with the given readers, then back to the main
menu.

    python tools/civ6lab/c74s2_games.py --host 127.0.0.4 --config tools/civ6lab/c74s2_duel.json \\
        --games 3 --first 2 --turns 249 --tag c74s2_duel --lua c74s2_turn.lua --state GameCore_Tuner

Before each game the victories are switched off from the main menu
(`GameConfiguration.SetValue(<VictoryType>, false)` for the six victory rows —
the setup screen's `Victories` parameters, ConfigurationId = VictoryType),
so a Duel is not won before its turn target. `game.py new`'s `all_ai` leaves
the human slot taken on this box (the slot reads SS_TAKEN in game), so the
seat is played by Autoplay one turn at a time.

Game k is hosted with map_seed 74200 + 2k and game_seed 74201 + 2k (a config
naming seeds keeps its own), watched as `<tag><k>`, and its log is
`runs/<tag><k>_watch.log`. The stop file `runs/c74s2.stop` ends the loop
before the next game.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import fleet  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[1]
SCRATCH = ROOT / ".claude" / "scratchpad"
VICTORIES = ("VICTORY_CONQUEST", "VICTORY_CULTURE", "VICTORY_RELIGIOUS", "VICTORY_SCORE",
             "VICTORY_TECHNOLOGY", "VICTORY_DIPLOMATIC")
LUA_NO_VICTORY = "\n".join(
    f'pcall(function() GameConfiguration.SetValue("{v}", false) end); '
    f'print("{v}=" .. tostring(GameConfiguration.GetValue("{v}")))' for v in VICTORIES)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", required=True)
    p.add_argument("--config", required=True)
    p.add_argument("--games", type=int, default=1)
    p.add_argument("--first", type=int, default=1, help="the number of the first game")
    p.add_argument("--turns", type=int, default=249)
    p.add_argument("--tag", required=True)
    p.add_argument("--lua", action="append", default=[])
    p.add_argument("--state", action="append", default=[])
    p.add_argument("--set", action="append", default=[], help="KEY=VALUE overriding the config (JSON value)")
    p.add_argument("--victories", action="store_true", help="leave the victories on")
    a = p.parse_args(argv)
    base = json.loads(pathlib.Path(a.config).read_text(encoding="utf-8"))
    for kv in a.set:
        k, v = kv.split("=", 1)
        base[k] = json.loads(v)
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    stop = lab.RUNS / "c74s2.stop"
    for k in range(a.first, a.first + a.games):
        if stop.exists():
            print("stop file present; ending")
            break
        tag = f"{a.tag}{k}"
        logp = lab.RUNS / f"{tag}_watch.log"
        with open(logp, "a", encoding="utf-8", newline="\n") as fh:
            def log(s: str) -> None:
                fh.write(s + "\n")
                fh.flush()
            if not fleet.ready(a.host, 600, log):
                print(f"{tag}: no main menu")
                return 1
            cfg = dict(base)
            cfg.setdefault("map_seed", 74200 + 2 * k)
            cfg.setdefault("game_seed", 74201 + 2 * k)
            cfgp = SCRATCH / f"{tag}.json"
            cfgp.write_text(json.dumps(cfg, indent=1) + "\n", encoding="utf-8", newline="\n")
            log("config " + json.dumps(cfg))
            if not a.victories:
                try:
                    t = Tuner(a.host, 4318).connect()
                    t.refresh_states()
                    log("victories off: " + " ".join(t.run(game.FE, LUA_NO_VICTORY, timeout=20)))
                    t.close()
                except TunerError as e:
                    log(f"victories off FAILED: {e}")
            cmd = [sys.executable, str(HERE / "game.py"), "--host", a.host, "new", "--config", str(cfgp)]
            rc = subprocess.run(cmd, stdout=fh, stderr=subprocess.STDOUT, cwd=str(ROOT), env=env).returncode
            if rc:
                print(f"{tag}: game.py new failed ({rc})")
                return 1
            cmd = [sys.executable, str(HERE / "c74s2_watch.py"), "--host", a.host, "--turns", str(a.turns),
                   "--tag", tag, "--at-end", "menu"]
            for n, s in zip(a.lua, a.state):
                cmd += ["--lua", n, "--state", s]
            rc = subprocess.run(cmd, stdout=fh, stderr=subprocess.STDOUT, cwd=str(ROOT), env=env).returncode
            print(f"{tag}: watch exit {rc}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
