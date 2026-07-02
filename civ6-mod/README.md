# Map Exporter mod

Exports a real Civilization VI game's map so the Development Calculator can
load it.

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
