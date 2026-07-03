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
your government and slotted policy cards, your pantheon and founded-religion
beliefs, your cities (position, population, name), each city's buildings and
current production (with progress/cost), and plot deltas (improvements,
districts, world wonders, ownership).

In the calculator: **Import map → Live sync → Connect Lua.log…** (Chromium
browsers only — it uses the File System Access API). The app re-reads the log
every few seconds and rebuilds a mirrored state, so the district advisor,
settle advisor, comparisons and planners all run on your live position.
On Firefox/Safari, paste the log into the Import textarea and click
**Apply as live sync** instead (re-paste to refresh).

Mirrored: map, cities, districts, wonders, buildings, improvements, borders
(nearest-city approximation), research, government + policy cards (placed
into the first compatible slot), pantheon/follower/founder beliefs, worship
building, and each city's current production — progress is rescaled onto
this engine's production costs so turns-to-complete stay meaningful.
Not mirrored: specialists, deeper queue entries beyond the current item,
and any DLC content this engine doesn't model (skipped and counted in the
sync summary). The government/policy/belief/queue reads are pcall-guarded:
on game versions where an API differs, those lines are simply absent and
the rest of the sync still works.

## Format

```
CIV6MAP_BEGIN|<width>|<height>
CIV6MAP|<x>|<y>|<TERRAIN_*>|<FEATURE_* or ->|<RESOURCE_* or ->|<L or ->|<riverFlags>
CIV6MAP_END

CIV6SYNC_BEGIN|<turn>|<localPlayerId>
CIV6SYNC_RESEARCH|TECH_A,TECH_B|CIVIC_A,CIVIC_B
CIV6SYNC_GOV|GOVERNMENT_X
CIV6SYNC_POLICIES|POLICY_A,POLICY_B
CIV6SYNC_BELIEFS|BELIEF_A,BELIEF_B
CIV6SYNC_CITY|<cityId>|<x>|<y>|<population>|<name>
CIV6SYNC_CITYBLD|<cityId>|BUILDING_A,BUILDING_B
CIV6SYNC_QUEUE|<cityId>|<producedType>|<progress>|<cost>
CIV6SYNC_PLOT|<x>|<y>|<improvement>|<district>|<wonder>|<owner>   (deltas only)
CIV6SYNC_END
```

`riverFlags`: bit 1 = river on east edge, bit 2 = southeast edge, bit 4 =
southwest edge (each edge is reported by exactly one of the two plots it
separates). This mod has not been run against every game version — if a line
format mismatch is reported by the importer, please open an issue with your
Lua.log.
