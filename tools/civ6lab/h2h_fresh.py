"""H-2 hold: from a running game, back to the main menu and a fresh observer
game (`game.py new`); `game.LUA_EXIT` releases a held turn before it exits.

    python tools/civ6lab/h2h_fresh.py --host 127.0.0.4 --config tools/civ6lab/c74s2_duel.json --map-seed 4301 --game-seed 4302
"""
from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import game  # noqa: E402
import h4  # noqa: E402

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--config", required=True)
    p.add_argument("--map-seed", type=int)
    p.add_argument("--game-seed", type=int)
    a = p.parse_args()
    h4.guard(170, "h2h_fresh")
    t = h4.connect(a.host)
    if game.IG in t.refresh_states():
        try:
            print(t.run(game.IG, game.LUA_EXIT, timeout=5)[-1])
        except Exception as e:  # noqa: BLE001 — the exit tears the state down under the call
            print("exit:", e)
    t.close()
    end = time.monotonic() + 90
    while True:
        time.sleep(2.0)
        try:
            t = h4.connect(a.host, wait=10)
            st = t.refresh_states()
            t.close()
            if game.FE in st and game.GC not in st:
                break
        except Exception as e:  # noqa: BLE001 — the socket resets across the exit
            print("waiting:", e)
        if time.monotonic() > end:
            print("no main menu within 90 s")
            return 1
    cmd = [sys.executable, str(HERE / "game.py"), "--host", a.host, "new", "--config", a.config]
    if a.map_seed is not None:
        cmd += ["--map-seed", str(a.map_seed)]
    if a.game_seed is not None:
        cmd += ["--game-seed", str(a.game_seed)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=140)
    print(out.stdout.strip().splitlines()[-1] if out.stdout.strip() else out.stderr[-500:])
    return out.returncode


if __name__ == "__main__":
    sys.exit(main())
