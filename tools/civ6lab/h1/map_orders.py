"""The game's river and volcano orders for a recorded game, beside its dump.

    python tools/civ6lab/h1/map_orders.py runs/h1_duelw1118_<stamp>.jsonl [...] [--map-seed S --config C]

The flood weight (0xa2cfc0) walks the river manager's vector and the volcano
roll and the eruption weights walk the volcano vector, each in its own order,
which the map script sets: Expansion2's RiversLakes.lua DoRiver passes each
river its ID (`nextRiverID`, one per DoRiver call from AddRivers' four passes
over the plots) to every SetXOfRiver, and 0xa28900 appends a river at its
first edge, so the vector runs in river-ID order; TerrainGenerator.lua's
SetFeatureType(FEATURE_VOLCANO) appends a volcano as it is placed (0x896c40 ->
0xa1e370 -> 0xa19360), so the volcano vector runs in placement order — the
continent-boundary pass column by column, then the lone mountains. Both are
the map generator's: `tools/civ6map` runs the game's own map script on the
game's map seed (the fleet manifest's `map_seed`, the config's script, size
and majors, every map option at its default 2) and this reads its river
setter calls and its volcano placements. The generated map is checked
against the dump's first record (every river edge and every volcano plot)
and nothing is written where they differ.

A dump recorded with the river vector in its catalog (`rivers`: the game's
own lists over RiverManager.GetRiverByIndex) takes the game's lists, and its
records' named volcanoes (`volcanoes`: MapFeatureManager.GetNamedVolcanoes,
the vector's named entries in order) the volcano order, a volcano never
named after them; the generator is then a check, and each river's
Floodplains list is checked against the run its plot list gives. A dump
without them takes the generator's orders, and none is written where the
generated map differs from the record.

Writes `<stem>.orders.json`: `rivers` (per river in vector order its plot
list as its edges were set, each edge adding its own plot then the plot
across, each plot once, -1 for a partner off the map), `volcanoes` (plots in
vector order), `source` ("game" or "map script") and the check's notes.
"""
from __future__ import annotations

import argparse
import glob
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from tools.civ6map.generate import generate  # noqa: E402

RUNS = ROOT / "tools" / "civ6lab" / "runs"
DEFAULT_OPTIONS = {k: 2 for k in ("world_age", "sea_level", "temperature", "rainfall", "resources", "start")}


def manifest_row(dump: pathlib.Path) -> dict:
    for m in sorted(glob.glob(str(dump.parent / "h1_fleet_*.jsonl"))):
        for ln in pathlib.Path(m).read_text(encoding="utf-8").splitlines():
            if not ln.strip():
                continue
            r = json.loads(ln)
            if pathlib.Path(r.get("dump", "")).name == dump.name:
                return r
    raise SystemExit(f"no fleet manifest names {dump.name}")


def first_record(dump: pathlib.Path) -> dict:
    with open(dump, encoding="utf-8") as fh:
        return json.loads(fh.readline())


def floodplain_run(plots: list[int], fp: set[int], lo: int = 4, hi: int = 10) -> list[int]:
    """the river's Floodplains list from its plot list read from the mouth
    (0xa2aca0; the engines' `floodplainRun`)"""
    run: list[int] = []
    for q in reversed(plots):
        if q >= 0 and q in fp:
            run.append(q)
            if len(run) >= hi:
                break
        elif len(run) >= lo:
            break
        else:
            run = []
    return run if len(run) >= lo else []


def orders(dump: pathlib.Path, map_seed: int | None = None, config: str | None = None) -> dict:
    row = manifest_row(dump) if map_seed is None or config is None else {"map_seed": map_seed, "config": config}
    cfg_path = pathlib.Path(row["config"])
    if not cfg_path.is_absolute():
        cfg_path = ROOT / cfg_path
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    script = cfg["map"].removesuffix(".lua")
    world, _api = generate(script, cfg["size"], int(row["map_seed"]), majors=cfg.get("leaders", []),
                           n_minors=int(cfg.get("city_states", 0)), minors=[], options=DEFAULT_OPTIONS)
    rec = first_record(dump)
    plots = [p for r in rec["map"] for p in r]
    notes: list[str] = []
    cat = json.loads(dump.with_suffix(".cat.json").read_text(encoding="utf-8"))
    # the generated map against the record: every river edge (bits 1 NE,
    # 2 NW, 4 W) and every volcano plot
    edge_diff = sum(1 for i, p in enumerate(plots)
                    if p[11] != (4 * world.river[i][0] + 2 * world.river[i][1] + world.river[i][2]))
    volcano_f = cat["features"].index("FEATURE_VOLCANO") if "FEATURE_VOLCANO" in cat["features"] else -2
    rec_volc = sorted(i for i, p in enumerate(plots) if p[1] == volcano_f)
    gen_volc = list(dict.fromkeys(i for i in world.volcano_order if world.feature[i] == world.fix["FEATURE_VOLCANO"]))
    gen_rivers = [lst for rid, lst in world.river_plots().items() if rid >= 0]
    gen_ok = edge_diff == 0 and sorted(gen_volc) == rec_volc
    if not gen_ok:
        notes.append(f"the generated map differs from the record (river plots {edge_diff}, volcanoes "
                     f"{sorted(gen_volc)} vs {rec_volc})")
    # the game's own vectors, where the dump read them
    live = cat.get("rivers")
    named: list[int] = []
    with open(dump, encoding="utf-8") as fh:
        for ln in fh:
            v = json.loads(ln).get("volcanoes")
            if isinstance(v, dict) and isinstance(v.get("list"), list):
                order = [int(e[0]) for e in v["list"]]
                if named and [i for i in order if i in named] != named:
                    notes.append(f"the named volcanoes reordered: {named} then {order}")
                named = order
    if isinstance(live, list) and live:
        rivers = [[int(q) for q in r.get("plots", [])] for r in live]
        fp = {i for i, p in enumerate(plots) if p[1] >= 0 and "FLOODPLAINS" in cat["features"][p[1]]}
        off = [r.get("index") for r, lst in zip(live, rivers)
               if [int(q) for q in r.get("floodplain", [])] != floodplain_run(lst, fp)]
        notes.append(f"the game's river vector: {len(rivers)} rivers; its Floodplains lists "
                     + ("all the plot lists' runs" if not off else f"differ from the plot lists' runs on rivers {off}"))
        if gen_ok:
            same = len(rivers) == len(gen_rivers) and all([q for q in g if q >= 0] == [q for q in m if q >= 0]
                                                          for g, m in zip(gen_rivers, rivers))
            notes.append(f"the map script's river order {'matches' if same else 'DIFFERS'}")
        unnamed = [i for i in (gen_volc if gen_ok else rec_volc) if i not in named]
        volcanoes = named + unnamed
        if unnamed:
            notes.append(f"volcanoes never named, after the named ones: {unnamed}")
        if gen_ok and [i for i in gen_volc if i in named] != named:
            notes.append(f"the named volcanoes {named} DIFFER from the map script's order {gen_volc}")
        return {"mapSeed": int(row["map_seed"]), "script": script, "size": cfg["size"], "source": "game",
                "rivers": rivers, "volcanoes": volcanoes, "notes": notes}
    if not gen_ok:
        raise SystemExit(f"{dump.name}: {notes[-1]}; no orders written")
    return {"mapSeed": int(row["map_seed"]), "script": script, "size": cfg["size"], "source": "map script",
            "rivers": gen_rivers, "volcanoes": gen_volc, "notes": notes}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("dumps", nargs="+")
    p.add_argument("--out-dir", help="write the sidecars here instead of beside the dumps")
    p.add_argument("--map-seed", type=int, help="the game's map seed, over the fleet manifest's (with --config)")
    p.add_argument("--config", help="the game's config file, over the fleet manifest's (with --map-seed)")
    a = p.parse_args()
    for d in a.dumps:
        dump = pathlib.Path(d)
        o = orders(dump, a.map_seed, a.config)
        out = (pathlib.Path(a.out_dir) if a.out_dir else dump.parent) / (dump.name.removesuffix(".jsonl") + ".orders.json")
        out.write_text(json.dumps(o), encoding="utf-8", newline="\n")
        print(f"{out.name}: {len(o['rivers'])} rivers, volcanoes {o['volcanoes']} ({o['source']})"
              + "".join(f"\n  {n}" for n in o["notes"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
