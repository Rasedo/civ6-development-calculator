"""A generated map as the `world@1` file both engines load (world/file.ts,
cpu/world/load.ts).

Rows are the game's y (row 0 the game's bottom row): the engines' odd-r
layout then keeps every adjacency, with the game's directions NE, E, SE, SW,
W, NW landing on the engine's SE, E, NE, NW, W, SW. Rivers and cliffs become
six-bit edge masks in the engine's direction order. A coast plot in a lake
area is LAKE. Volcanoes go to the volcano layer, goody huts to the goody
layer. A feature or resource the engine has no id for is left out and
counted in `gen.dropped`. `map.wrapX` says the map wraps in x, as the game's does:
column 0 and column width - 1 are neighbours, and the river and cliff masks
of the seam plots name edges across it; the engines read it into
`GameMap.wrapX` (the fixture's `wrapX`) and wrap every hex primitive.
Majors start with a Settler and a Warrior on their start plot; city-states
at theirs.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re

from .world import World

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
TERRAINS = ["GRASSLAND", "PLAINS", "DESERT", "TUNDRA", "SNOW", "COAST", "LAKE", "OCEAN"]
ELEVATIONS = ["FLAT", "HILLS", "MOUNTAIN"]
BASE_TERRAIN = {"GRASS": "GRASSLAND", "PLAINS": "PLAINS", "DESERT": "DESERT", "TUNDRA": "TUNDRA", "SNOW": "SNOW"}
FEATURE_ID = {"FEATURE_FOREST": "WOODS", "FEATURE_JUNGLE": "RAINFOREST", "FEATURE_BARRIER_REEF": "GREAT_BARRIER_REEF",
              "FEATURE_KILIMANJARO": "MOUNT_KILIMANJARO", "FEATURE_EVEREST": "MOUNT_EVEREST",
              "FEATURE_CLIFFS_DOVER": "CLIFFS_OF_DOVER", "FEATURE_BURNING_FOREST": "BURNING_WOODS",
              "FEATURE_BURNT_FOREST": "BURNT_WOODS", "FEATURE_BURNING_JUNGLE": "BURNING_RAINFOREST",
              "FEATURE_BURNT_JUNGLE": "BURNT_RAINFOREST"}
# the game's direction d -> the engine's (world/hex.ts: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE)
ENGINE_DIR = {0: 5, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4}
MINOR_TYPE = {"SCIENTIFIC": "scientific", "CULTURAL": "cultural", "TRADE": "trade", "INDUSTRIAL": "industrial",
              "MILITARISTIC": "militaristic", "RELIGIOUS": "religious"}


def _ts_keys(rel: str) -> list[str]:
    text = (ROOT / rel).read_text(encoding="utf-8")
    return re.findall(r"^\s{2}([A-Z_]+):\s*\{", text, re.M)


def _leaders() -> list[str]:
    text = (ROOT / "world/roster.ts").read_text(encoding="utf-8")
    body = text.split("export const CIV_LEADERS", 1)[1]
    return re.findall(r"leader: '([A-Z_]+)'", body)


def world_file(w: World, script: str, size: str, map_seed: int) -> dict:
    features = _ts_keys("world/features.ts")
    resources = _ts_keys("world/resources.ts")
    leaders = _leaders()
    dropped: dict[str, int] = {}
    N = w.N
    terrain, elevation, feature, resource, volcano, goody = [], [], [], [], [], []
    goody_imp = w.gi.index("Improvements", "ImprovementType", "IMPROVEMENT_GOODY_HUT")
    for i in range(N):
        tt = w.t_rows[w.terrain[i]]["TerrainType"]
        if tt == "TERRAIN_COAST":
            terrain.append(TERRAINS.index("LAKE" if w.is_lake(i) else "COAST"))
            elevation.append(0)
        elif tt == "TERRAIN_OCEAN":
            terrain.append(TERRAINS.index("OCEAN"))
            elevation.append(0)
        else:
            base = tt[len("TERRAIN_"):].split("_")[0]
            terrain.append(TERRAINS.index(BASE_TERRAIN[base]))
            elevation.append(2 if tt.endswith("_MOUNTAIN") else 1 if tt.endswith("_HILLS") else 0)
        f = w.feature[i]
        fv, vol = -1, 0
        if f >= 0:
            ft = w.f_rows[f]["FeatureType"]
            if ft == "FEATURE_VOLCANO":
                vol = 1
            else:
                eid = FEATURE_ID.get(ft, ft[len("FEATURE_"):])
                if eid in features:
                    fv = features.index(eid)
                else:
                    dropped[ft] = dropped.get(ft, 0) + 1
        feature.append(fv)
        volcano.append(vol)
        r = w.resource[i]
        rv = -1
        if r >= 0:
            rt = w.r_rows[r]["ResourceType"]
            eid = rt[len("RESOURCE_"):]
            if eid in resources:
                rv = resources.index(eid)
            else:
                dropped[rt] = dropped.get(rt, 0) + 1
        resource.append(rv)
        goody.append(1 if w.improvement[i] == goody_imp and goody_imp >= 0 else 0)
    river_mask, cliff_mask = [], []
    for i in range(N):
        rm = 0
        for d, on in enumerate(w.river_edges(i)):
            if on:
                rm |= 1 << ENGINE_DIR[d]
        river_mask.append(rm)
        cm = 0
        wc, nwc, nec = w.cliff[i]
        own = {1: wc, 2: nwc, 3: nec}
        for d in range(6):
            if d in own:
                on = own[d]
            else:
                n = w.adj(i, d)
                on = n is not None and w.cliff[n][{4: 0, 5: 1, 0: 2}[d]]
            if on:
                cm |= 1 << ENGINE_DIR[d]
        cliff_mask.append(cm)
    civs, city_states = [], []
    majors = w.roster["majors"]
    for pid, m in enumerate(majors):
        i = w.player_start.get(pid)
        if i is None:
            continue
        lid = (m["leader"] or "")[len("LEADER_"):]
        civs.append({"leader": leaders.index(lid) if lid in leaders else pid,
                     "units": [{"type": "SETTLER", "tile": i}, {"type": "WARRIOR", "tile": i}]})
    for k, m in enumerate(w.roster["minors"]):
        i = w.player_start.get(len(majors) + k)
        if i is None or m["leader"] is None:
            continue
        row = w.gi.find("Leaders", LeaderType=m["leader"])
        kind = (row or {}).get("InheritFrom") or ""
        city_states.append({"name": (m["civ"] or m["leader"]).split("_", 1)[1],
                            "type": MINOR_TYPE.get(kind.rsplit("_", 1)[-1], "trade"), "center": i})
    out = {
        "format": "world@1",
        "gen": {"seed": map_seed, "placement": f"civ6map {script} {size}",
                "params": {"width": w.W, "height": w.H, "cityStateMax": len(w.roster["minors"]),
                           "civCount": len(majors)},
                "genStamp": "civ6map", "dropped": dropped},
        "catalogs": {"terrains": TERRAINS, "elevations": ELEVATIONS, "features": features, "resources": resources},
        "map": {"width": w.W, "height": w.H, "wrapX": w.wrap_x, "terrain": terrain, "elevation": elevation,
                "feature": feature,
                "resource": resource, "riverMask": river_mask, "cliffMask": cliff_mask, "volcano": volcano,
                "goodyHut": goody},
        "civs": civs,
        "cityStates": city_states,
        "rngInit": (map_seed ^ 0x9E3779B9) & 0xFFFFFFFF,
    }
    out["worldHash"] = hashlib.sha256(json.dumps(out).encode()).hexdigest()
    return out
