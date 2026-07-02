# Map Exporter mod

Exports a real Civilization VI game's map so the Development Calculator can
load it — and, with the LiveSync context, keeps the calculator mirroring your
game turn by turn.

## Install

1. Copy the `MapExporter` folder into your Civ 6 mods directory:
   - Windows: `Documents\My Games\Sid Meier's Civilization VI\Mods\`
   - macOS: `~/Library/Application Support/Sid Meier's Civilization VI/Mods/`
   - Linux: `~/.local/share/aspyr-media/Sid Meier's Civilization VI/Mods/`
2. Start Civ 6, enable **Map Exporter (Development Calculator)** under
   *Additional Content → Mods*, and load (or start) the game whose map you
   want. The mod changes no gameplay and is save-compatible.

## Export & import

1. Load into the game. The mod prints the whole map to the Lua log the moment
   the load screen closes.
2. Open the log file:
   - Windows: `Documents\My Games\Sid Meier's Civilization VI\Logs\Lua.log`
   - macOS/Linux: same relative `Logs/Lua.log` next to the Mods folder.
3. In the calculator, press **Import map** and paste the entire log (or just
   the `CIV6MAP…` lines) into the box. Unknown expansion features/resources
   are skipped and reported.

Note: the calculator displays imported maps mirrored north–south (Civ 6 counts
rows from the south, the calculator from the north; the mirror keeps every
adjacency exact). Yields, rivers and wonders are unaffected.

## Live sync

`LiveSync.lua` (same mod, enabled automatically) prints a `CIV6SYNC` snapshot
at load and at the start of every one of your turns: completed techs/civics,
your cities (position, population, name), each city's buildings, and plot
deltas (improvements, districts, world wonders, ownership).

In the calculator: **Import map → Live sync → Connect Lua.log…** (Chromium
browsers only — it uses the File System Access API). The app re-reads the log
every few seconds and rebuilds a mirrored state, so the district advisor,
settle advisor, comparisons and planners all run on your live position.
Mirrored: map, cities, districts, wonders, buildings, improvements, borders
(nearest-city approximation), research, and your worship building. Not
mirrored (reset each sync): production queues, policy cards, beliefs,
specialists — set those by hand if an analysis depends on them.

## Format

```
CIV6MAP_BEGIN|<width>|<height>
CIV6MAP|<x>|<y>|<TERRAIN_*>|<FEATURE_* or ->|<RESOURCE_* or ->|<L or ->|<riverFlags>
CIV6MAP_END
```

`riverFlags`: bit 1 = river on east edge, bit 2 = southeast edge, bit 4 =
southwest edge (each edge is reported by exactly one of the two plots it
separates). This mod has not been run against every game version — if a line
format mismatch is reported by the importer, please open an issue with your
Lua.log.
