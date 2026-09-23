# The lab's open scenes

What sessions 2 and 3 did NOT close. Everything else that was on this list —
the Free City trio (asks 10, 12, 13), the Encampment's pools on a capture
(ask 2), the blast and its population rule (ask 5), the majority religion
(ask 3), the purchase price, the Pop Star, the research agreement, the
reactor's clock, gates and payloads (ask 4), and the envoy slope
(C-80 rule 2) — is measured, and the record is `reports/lab2_report.md` and
`reports/lab3_report.md`.

Before anything: `python tools/civ6lab/lab.py probe` green, a named save
written, no battery while the game has the box. The calls, the failures and
the traps are in `README.md`; read them before typing a call into a running
game.

The placement API (`city:GetBuildQueue():CreateDistrict/CreateBuilding`,
`WorldBuilder.CityManager():SetCityValue`) changed the price of most of what
is left: districts, buildings and population can be built from the socket, so
"needs a later save" is no longer a real blocker for anything here.

## 1. Ask 14 — the escape roll's scale

Thirty escape routes is the sample the entry asks for, and the blocker was
only ever the number of runs: a Spy can be BOUGHT in one call
(`CityCommandTypes.PURCHASE`) and gold set with `SetGoldBalance`, which
satisfies "trained in a city" without waiting out a build. A socket-SPAWNED
spy still crashes the game on a capture/kill route — that boundary stands.
`spy_start.lua` runs the missions, `spy_history.lua` reads them, `escape_fit.py`
fits the rates.

## 2. The counterspy term — whether it enters the ROLL

Settled negatively for the ODDS: with a counterspy assigned,
`GetResultProbability` is byte-identical to the undefended baseline, on the
same turn and a turn later. What is not settled is whether the counterspy
enters the actual roll, and it needs real missions against a city whose
counterspy can be confirmed standing — **and no such reader exists**: a spy
put on counterspy duty vanishes from the unit list by the next turn, on both
the AI's side and mine. Either find the reader or accept the negative.

## 3. The reactor's per-turn accident probability

Gates and payloads are measured. What is open is how often the GAME fires one
by itself: five reactors past every gate produced **zero** accidents in ~150
reactor-turns (a 95% bound under 2% per reactor-turn) while 17 other random
events fired in the same window. Two things a run must separate:

* rarity from exhaustion — `OccurrencesPerGame` may be a per-game budget, and
  the two accidents I forced both landed in the event log, so the game may
  have counted them spent. **A fresh game with reactors and no forced events
  is the only clean test.**
* the weight reading predicts the accident's share of the one-event-per-turn
  draw rises with the number of eligible reactors. The district is
  `OnePerCity`, so N reactors is N cities — cheap, since cities can be founded
  from the socket.

## 4. The reactor payloads: the XML rows do not carry what was measured

`Expansion2_RandomEvents.xml`'s three `NUCLEAR_ACCIDENT` rows ship
`Duration`, `Hexes`, `Spacing` and `ChanceIncreasePerDegree` all **0**, and
there is no chance column at all — yet the measured payloads are 2 / 10 / 20
turns of fallout on exactly one plot, −1 population at severity 2 and the
Industrial Zone pillaged at severity 2. So the payload is DLL-side and the XML
row cannot be its source. One sub-question rides on the same run: the
per-severity BUILDING pillage flags went `err → true` for the Factory and the
Power Plant at every severity and for the Workshop only at catastrophic, but
`city:GetBuildings():IsPillaged(hash)` **throws** for a building made by
`CreateBuilding` until the game pillages it — that reader was erroring a moment
before it answered, so the row is the one line of part three I would re-measure
before shipping.

## 5. The envoy's tile — WHICH tile, not how many

**Answered in lab 4 (2026-09-23, `envoy_tile.lua`, `runs/envoy_tile_jakarta_20260923.txt`):**
21 envoys to Jakarta took its whole ring 2 before any ring-3 plot; within a
ring the resource plots first (Sheep, then Stone, Cattle, Stone), then the
2/2 hills, the 2/1 and 2/0 flats, the no-yield Mountain and Volcano last.
That is the shape of the border-growth picker, which both engines already use
for envoy plots (`envoyTiles` -> `pickBorderTile`). Not proven plot for plot:
in ring 2 a 2/1 plains came before two 2/2 hills, so the score has terms past
the yield sum — a check of our scorer on THIS map waits on a map importer.
The city's own `GetCulture():GetNextPlot()` reads -1 for a minor.

The slope is measured: +1 owned plot per envoy, no cap through 16, unchanged
by suzerainty. What no reading covers is which plot the city-state takes —
the ring order, the yield preference, whether it prefers the side its capital
faces. `envoy_step.lua` already records the owned-plot set before and after
each give, so the scene is a re-run with the plot DIFF kept rather than the
count.

## 6. The 0.07 strength residual — how hills and a feature combine

The ICBM warhead defence is `D = base - (aim plot terrain + feature
DefenseModifier)` with base 75 (silo) and 80 (submarine), pinned on a bare
tile. Terrain-only +3 and feature-only +3 each behave exactly as +3. The one
tile that wobbles is the STACKED one — Plains Hills + Jungle, nominal +6,
which implies an effective bonus of about **5.93**. The residual is 0.07 of a
strength point and it sits in the COMBINATION rule, not in the warhead.
`plot_defence.lua` plus a health sweep that walks the flip to n = 10/11 (where
consecutive damages differ by 2.9%) is the instrument; a second stacked pairing
(hills + forest, hills + marsh) would say whether it is a rounding of the sum
or a different stacking rule.

## 7. Two shipped combat constants nobody has located

`COMBAT_DAMAGE_MULTIPLIER_MINIMUM = 0.25` and `COMBAT_POWER_DAMPENER = 5` are
in `GlobalParameters.xml` and neither has been found in a measured path — the
0.25 demonstrably does NOT floor the unit-vs-unit damage multiplier (a Warrior
previews **1** damage against a Giant Death Robot, not 7.5). Whatever they
clamp, it is something else. `SimulateAttackInto` is deterministic, so this is
a sweep, not a battery.

## 8. The anti-air support term, to the point

Eleven of thirteen support rows fit `+5 * hp/100` exactly; the 33 HP and 50 HP
single-supporter rows sit about 0.3 strength low. Sub-unit and unexplained.
Worth one more sweep only if an engine ever needs the support term to the point.

## 9. The Nuclear Emergency

`Game.GetEmergencyManager():GetEmergencyInfoTable(0)` came back empty after 21
warheads, which is one reader on one seat rather than a verdict. Both engines
raise `EMERGENCY_NUCLEAR` at the end of `detonate`, so it wants a second look
with the World Congress state read as well.

## 10. Loose ends recorded rather than pursued

* **Ask 9, the city-state's spending watch** — banks were snapshotted at turns
  131 and 173 and recorded. What it would measure is what a city-state CHOOSES
  to spend on, i.e. AI behaviour, which the owner's 2026-09-20 ruling puts out
  of scope; the engine-side halves (income, unit upkeep) are already modelled.
  It stays here only so nobody re-opens it as an engine question.
* **The tribal-village draw** — one pop (seed 5983) fired with no visible
  payout and is unexplained; the magnitudes (SMALL gold 20, MEDIUM gold 37,
  SMALL faith 10) were sampled at one era only.
* **Experience** — the amount is not drawn and the engine's own preview is
  seed-invariant, but no melee was made to RESOLVE from the socket, so
  "the engine applies the number it previews" is inferred, not counted.
* **The espionage roll** — it happens at the COMPLETION turn, where the stream
  is shared with every other actor, so seed accounting cannot isolate it. Only
  a real-mission sample can say what it consumes.

## 11. The tile swap's reach (AUDIT C-81)

`CityManager.GetCommandTargets(city, CityCommandTypes.SWAP_TILE_OWNER, {})`
returns the plots the DLL offers (`tResults[CityCommandResults.PLOTS]`, read
exactly as `Base/Assets/UI/WorldView/PlotInfo.lua` `ShowSwapTiles` reads it).
Place two cities of one player four hexes apart, let the second own plots at
distance 1, 2, 3 and 4 from the first centre (none next to its own centre, no
district, no wonder), and read the list for the first city: the engines assume
exactly the plots within 3 of the claimant. Then `RequestCommand` one swap and
read both cities' plot-acquisition count before and after, to learn whether a
swap moves the border-growth cost of either city.
