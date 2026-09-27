"""Generate a map with Civilization VI's own map scripts.

    python tools/civ6map/generate.py --script Continents --size MAPSIZE_DUEL \
        --map-seed 1000 --majors LEADER_ROBERT_THE_BRUCE,LEADER_HOJO --minors 3 \
        --out tools/civ6map/out/duel_m1000.json [--dump runs/x.json] [--ledger x.json]

Map options (world_age, sea_level, temperature, rainfall, resources, start)
are unset unless given (`--opt world_age=2`): an unset option is nil to the
script, as in a game whose setup never wrote it. `--out` writes the world@1
file both engines load; `--dump` writes the map in the lab's dump shape
(tools/civ6lab/h3_mapdump.py) for a plot-for-plot compare; `--ledger` writes
the draw ledger.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.civ6map.gameinfo import GameInfo  # noqa: E402
from tools.civ6map.vm import run  # noqa: E402
from tools.civ6map.world import World  # noqa: E402


def roster(gi: GameInfo, majors: list[str], n_minors: int, minors: list[str]) -> dict:
    out = {"majors": [], "minors": []}
    for lt in majors:
        civ = gi.find("CivilizationLeaders", LeaderType=lt)
        out["majors"].append({"leader": lt, "civ": civ["CivilizationType"] if civ else None})
    for lt in minors[:n_minors] + [None] * max(0, n_minors - len(minors)):
        civ = gi.find("CivilizationLeaders", LeaderType=lt) if lt else None
        out["minors"].append({"leader": lt, "civ": civ["CivilizationType"] if civ else None})
    return out


def dump(world: World, map_seed: int) -> dict:
    """the map in tools/civ6lab/h3_mapdump.py's shape"""
    rows = []
    for y in range(world.H):
        row = []
        for x in range(world.W):
            i = y * world.W + x
            wr, nwr, ner = world.river[i]
            wc, nwc, nec = world.cliff[i]
            fl = ner + 2 * nwr + 4 * wr + 8 * nec + 16 * nwc + 32 * wc + 64 * world.starting[i]
            row.append(f"{world.terrain[i]}.{world.feature[i]}.{world.resource[i]}.{world.res_count[i]}."
                       f"{world.improvement[i]}.{world.continent[i]}.{fl}")
        rows.append(row)
    return {"grid": [world.W, world.H], "map_seed": map_seed, "rows": rows, "units": [],
            "starts": [[p, i % world.W, i // world.W] for p, i in sorted(world.player_start.items()) if i is not None]}


def generate(script: str, size: str, map_seed: int, *, majors: list[str], n_minors: int, minors: list[str],
             options: dict, gi: GameInfo | None = None, log_print: bool = False):
    gi = gi or GameInfo()
    world = World(gi, size, map_seed, roster=roster(gi, majors, n_minors, minors), options=options)
    api = run(world, script, log_print=log_print)
    return world, api


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--script", default="Continents")
    p.add_argument("--size", default="MAPSIZE_DUEL")
    p.add_argument("--map-seed", type=int, required=True)
    p.add_argument("--majors", default="", help="leader types, comma-separated, in player order")
    p.add_argument("--minors", type=int, default=0)
    p.add_argument("--minor-leaders", default="")
    p.add_argument("--opt", action="append", default=[], help="map option key=value")
    p.add_argument("--out")
    p.add_argument("--dump")
    p.add_argument("--ledger")
    p.add_argument("--print", action="store_true", help="show the scripts' print output")
    a = p.parse_args()
    options = {}
    for kv in a.opt:
        k, _, v = kv.partition("=")
        options[k] = int(v) if v.lstrip("-").isdigit() else v
    t0 = time.time()
    world, api = generate(a.script, a.size, a.map_seed, majors=[m for m in a.majors.split(",") if m],
                          n_minors=a.minors, minors=[m for m in a.minor_leaders.split(",") if m],
                          options=options, log_print=a.print)
    if a.print:
        print("\n".join(api.prints))
    print(f"{a.script} {a.size} map seed {a.map_seed}: {world.rng.n} draws, {time.time() - t0:.1f}s")
    for u in sorted(set(world.unspecified)):
        print("  not specified, stood in:", u)
    if a.dump:
        pathlib.Path(a.dump).write_text(json.dumps(dump(world, a.map_seed)), encoding="utf-8")
    if a.ledger:
        pathlib.Path(a.ledger).write_text(json.dumps(world.rng.ledger), encoding="utf-8")
    if a.out:
        from tools.civ6map.worldfile import world_file
        pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(a.out).write_text(json.dumps(world_file(world, a.script, a.size, a.map_seed)), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
