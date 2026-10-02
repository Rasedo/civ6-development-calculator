"""H-3: the natives-probe game configs for every Gathering Storm map script,
tools/civ6lab/h3_<size>_<script>.json. A probe script is a mod map, so it
gets a map option only from its config (README, "The map options"): each
config carries exactly the Map-group rows the install gives the real script
(Base MapSettings.xml, Expansion2_StandardMaps.xml) at their DefaultValue 2
— Seven_Seas and InlandSea have no SeaLevel row, Tilted_Axis no Temperature,
Shuffle none.

    python tools/civ6lab/h3_scripts.py
"""
from __future__ import annotations

import json
import pathlib

HERE = pathlib.Path(__file__).parent
ALL4 = ("world_age", "sea_level", "temperature", "rainfall")
OPTIONS = {
    "Island_Plates": ALL4, "Small_Continents": ALL4, "Terra": ALL4, "Splintered_Fractal": ALL4,
    "Primordial": ALL4, "Lakes": ALL4, "Continents_Islands": ALL4,
    "Seven_Seas": ("world_age", "temperature", "rainfall"),
    "InlandSea": ("world_age", "temperature", "rainfall"),
    "Tilted_Axis": ("world_age", "sea_level", "rainfall"),
    "Shuffle": (),
}
SIZES = {"tiny": ("MAPSIZE_TINY", 6), "small": ("MAPSIZE_SMALL", 9), "standard": ("MAPSIZE_STANDARD", 12)}


def main() -> int:
    for script, opts in OPTIONS.items():
        for tag, (size, cs) in SIZES.items():
            cfg = {"ruleset": "RULESET_EXPANSION_2", "speed": "GAMESPEED_ONLINE", "difficulty": "DIFFICULTY_PRINCE",
                   "map": f"civ6lab_mapprobe_natives_{script.lower()}.lua", "size": size, "city_states": cs,
                   "realism": 2, "start_era": "ERA_ANCIENT", "max_turns": 500, "all_ai": False}
            cfg.update({k: 2 for k in opts})
            out = HERE / f"h3_{tag}_{script.lower()}.json"
            out.write_bytes((json.dumps(cfg, indent=2) + "\n").encode("utf-8"))
            print(out.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
