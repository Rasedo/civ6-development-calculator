# Constant provenance — the mismatch ledger

Every catalog constant carries a source tag (cpu/data/provenance.ts) and
tools/civ6lab/xml_check.py re-reads the install and compares. This file
holds what the checker found that the catalogs did NOT yet agree with, per
tagging wave, until task #264 closes each line on both engines. A line
leaves when the value is fixed (a gate-stage change with a battery) or the
tag becomes STYLIZED with the ruling quoted.

    npm run export                       # writes seeder/worlds/provenance.json
    python tools/civ6lab/xml_check.py check

## The checker's list — AUTHORITATIVE, regenerated (2026-09-14, modinfo load order)

The lines below are `xml_check.py check` verbatim; the agent reports further
down are NOTES on them (classification, cause) and can name lines that no
longer appear (the alphabetical load order produced artefacts — Isolationism,
three unique units' resource bills, the Okihtcitaw's rung — and hid one, the
Pike and Shot's maintenance). Task #264 works THIS list.

    XML CHECK RED — 3940 match, 48 mismatch, 939 unsourced, 1426 lab/stylized/derived (312 install files)

### units (15)

```
MISMATCH units.NATURALIST.charges: catalog 0 vs install '1' [Units[UnitType=UNIT_NATURALIST].ParkCharges <- Units.xml]
MISMATCH units.BATTERING_RAM.upgradesTo: catalog 'MEDIC' vs install 'UNIT_SIEGE_TOWER' [UnitUpgrades[Unit=UNIT_BATTERING_RAM].UpgradeUnit <- Expansion2_Units.xml]
MISMATCH units.INQUISITOR.religiousStrength: catalog 70 vs install '75' [Units[UnitType=UNIT_INQUISITOR].ReligiousStrength <- Units.xml]
MISMATCH units.PIKE_AND_SHOT.maintenance: catalog 4 vs install '3' [Units[UnitType=UNIT_PIKE_AND_SHOT].Maintenance <- Expansion1_Expansion2.xml]
MISMATCH units.SPY.moves: catalog 0 vs install '1' [Units[UnitType=UNIT_SPY].BaseMoves <- Units.xml]
MISMATCH units.MAMLUK.cost: catalog 108 vs install '132' [Units[UnitType=UNIT_ARABIAN_MAMLUK].Cost <- Expansion2_Units.xml]
MISMATCH units.MAMLUK.maintenance: catalog 3 vs install '4' [Units[UnitType=UNIT_ARABIAN_MAMLUK].Maintenance <- Expansion2_Units.xml]
MISMATCH units.VARU.maintenance: catalog 3 vs install '2' [Units[UnitType=UNIT_INDIAN_VARU].Maintenance <- Expansion2_Units.xml]
MISMATCH units.VARU.upgradesTo: catalog 'TANK' vs install 'UNIT_CUIRASSIER' [UnitUpgrades[Unit=UNIT_INDIAN_VARU].UpgradeUnit <- Expansion2_Units.xml]
MISMATCH units.TOA.maintenance: catalog 2 vs install '0' [Units[UnitType=UNIT_MAORI_TOA].Maintenance <- (schema DEFAULT)]
MISMATCH units.TOA.requiresResource: catalog 'IRON' vs install None [Units[UnitType=UNIT_MAORI_TOA].StrategicResource <- (row found in Expansion2_Units_Major.xml, no column StrategicResource, no default)]
MISMATCH units.MINAS_GERAES.antiAir: catalog 90 vs install '95' [Units[UnitType=UNIT_BRAZILIAN_MINAS_GERAES].AntiAirCombat <- Units.xml]
MISMATCH units.U_BOAT.requiresResource: catalog 'OIL' vs install None [Units[UnitType=UNIT_GERMAN_UBOAT].StrategicResource <- (row found in Units.xml, no column StrategicResource, no default)]
MISMATCH units.U_BOAT.resourceCost: catalog 1 vs install None [Units_XP2[UnitType=UNIT_GERMAN_UBOAT].ResourceCost <- (no such row)]
MISMATCH units.U_BOAT.resourceUpkeep: catalog 1 vs install None [Units_XP2[UnitType=UNIT_GERMAN_UBOAT].ResourceMaintenanceAmount <- (no such row)]
```

### buildings (10)

```
MISMATCH buildings.PALACE.cost: catalog 0 vs install '1' [Buildings[BuildingType=BUILDING_PALACE].Cost <- Buildings.xml]
MISMATCH buildings.PALACE.amenities: catalog 1 vs install '2' [Buildings[BuildingType=BUILDING_PALACE].Entertainment <- Expansion2_Buildings.xml]
MISMATCH buildings.PAGODA.housing: catalog 1 vs install '0' [Buildings[BuildingType=BUILDING_PAGODA].Housing <- Expansion2_Buildings.xml]
MISMATCH buildings.FACTORY.civVariants.0.yields.production: catalog 4 vs install '3' [Building_YieldChanges[BuildingType=BUILDING_ELECTRONICS_FACTORY&YieldType=YIELD_PRODUCTION].YieldChange <- Expansion2_Buildings.xml]
MISMATCH buildings.HANGAR.airSlots: catalog 2 vs install '1' [ModifierArguments[ModifierId=HANGAR_BONUS_AIR_SLOTS&Name=Amount].Value <- Expansion2_Buildings.xml]
MISMATCH buildings.AIRPORT.yields.production: catalog 3 vs install '4' [Building_YieldChanges[BuildingType=BUILDING_AIRPORT&YieldType=YIELD_PRODUCTION].YieldChange <- Expansion2_Buildings.xml]
MISMATCH buildings.AIRPORT.airSlots: catalog 2 vs install '1' [ModifierArguments[ModifierId=AIRPORT_BONUS_AIR_SLOTS&Name=Amount].Value <- Expansion2_Buildings.xml]
MISMATCH buildings.ZOO.civVariants.0.cost: catalog 175 vs install '216' [Buildings[BuildingType=BUILDING_THERMAL_BATH].Cost <- Expansion2_Buildings_Major.xml]
MISMATCH buildings.RENAISSANCE_WALLS.civVariants.0.cost: catalog 154 vs install '156' [Buildings[BuildingType=BUILDING_TSIKHE].Cost <- Expansion1_Buildings_Major.xml]
MISMATCH buildings.AQUATICS_CENTER.cost: catalog 396 vs install '288' [Buildings[BuildingType=BUILDING_AQUATICS_CENTER].Cost <- Expansion2_Buildings.xml]
```

### districts (5)

```
MISMATCH districts.CITY_CENTER.cost: catalog 0 vs install '54' [Districts[DistrictType=DISTRICT_CITY_CENTER].Cost <- Districts.xml]
MISMATCH districts.THEATER_SQUARE.civVariants.0.adjacency.0.amount: catalog 1 vs install '2' [Adjacency_YieldChanges[ID=Wonder_Culture].YieldChange <- Expansion1_Districts.xml]
MISMATCH districts.NEIGHBORHOOD.housing: catalog 0 vs install '4' [Districts[DistrictType=DISTRICT_NEIGHBORHOOD].Housing <- Districts.xml]
MISMATCH districts.SPACEPORT.maintenance: catalog 1 vs install '0' [Districts[DistrictType=DISTRICT_SPACEPORT].Maintenance <- (schema DEFAULT)]
MISMATCH districts.PRESERVE.housing: catalog 0 vs install '1' [Districts[DistrictType=DISTRICT_PRESERVE].Housing <- KublaiKhan_Vietnam_Districts.xml]
```

### improvements (2)

```
MISMATCH improvements.LUMBER_MILL.yields.production: catalog 1 vs install '2' [Improvement_YieldChanges[ImprovementType=IMPROVEMENT_LUMBER_MILL&YieldType=YIELD_PRODUCTION].YieldChange <- Expansion2_Improvements.xml]
MISMATCH improvements.SPHINX.appealAdjacent: catalog 1 vs install '2' [Improvements[ImprovementType=IMPROVEMENT_SPHINX].Appeal <- Expansion2_Improvements.xml]
```

### techs (7)

```
MISMATCH techs.MILITARY_ENGINEERING.effects.1.improvement: catalog 'FORT' vs install 'TECH_SIEGE_TACTICS' [Improvements[ImprovementType=IMPROVEMENT_FORT].PrereqTech <- Improvements.xml]
MISMATCH techs.BANKING.effects.1.improvement: catalog 'QUARRY' vs install None [Improvement_BonusYieldChanges[ImprovementType=IMPROVEMENT_QUARRY&YieldType=YIELD_GOLD&PrereqTech=TECH_BANKING].ImprovementType <- (no such row)]
MISMATCH techs.BANKING.effects.1.yields.gold: catalog 2 vs install None [Improvement_BonusYieldChanges[ImprovementType=IMPROVEMENT_QUARRY&YieldType=YIELD_GOLD&PrereqTech=TECH_BANKING].BonusYieldChange <- (no such row)]
MISMATCH techs.STEEL.effects.0.improvement: catalog 'OIL_WELL' vs install 'TECH_REFINING' [Improvements[ImprovementType=IMPROVEMENT_OIL_WELL].PrereqTech <- Expansion2_Improvements.xml]
MISMATCH techs.SYNTHETIC_MATERIALS.effects.1.yields.gold: catalog 1 vs install '2' [Improvement_BonusYieldChanges[ImprovementType=IMPROVEMENT_CAMP&YieldType=YIELD_GOLD&PrereqTech=TECH_SYNTHETIC_MATERIALS].BonusYieldChange <- Expansion2_Improvements.xml]
MISMATCH techs.ROBOTICS.effects.0.improvement: catalog 'PASTURE' vs install None [Improvement_BonusYieldChanges[ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_ROBOTICS].ImprovementType <- (no such row)]
MISMATCH techs.ROBOTICS.effects.0.yields.production: catalog 1 vs install None [Improvement_BonusYieldChanges[ImprovementType=IMPROVEMENT_PASTURE&YieldType=YIELD_PRODUCTION&PrereqTech=TECH_ROBOTICS].BonusYieldChange <- (no such row)]
```

### civics (3)

```
MISMATCH civics.CODE_OF_LAWS.effects.0.government: catalog 'CHIEFDOM' vs install None [Governments[GovernmentType=GOVERNMENT_CHIEFDOM].PrereqCivic <- (row found in Expansion1_Governments.xml, no column PrereqCivic, no default)]
MISMATCH civics.SUFFRAGE.effects.2.policy: catalog 'ECONOMIC_UNION' vs install 'CIVIC_IDEOLOGY' [Policies[PolicyType=POLICY_ECONOMIC_UNION].PrereqCivic <- Expansion2_Policies.xml]
MISMATCH civics.CLASS_STRUGGLE.effects.1.policy: catalog 'FIVE_YEAR_PLAN' vs install 'CIVIC_IDEOLOGY' [Policies[PolicyType=POLICY_FIVE_YEAR_PLAN].PrereqCivic <- Expansion2_Policies.xml]
```

### promotions (2)

```
MISMATCH promotions.PROSELYTIZER.effects.0.v: catalog 75 vs install '50' [ModifierArguments[ModifierId=APOSTLE_EVICT_ALL&Name=Amount].Value <- UnitPromotions.xml]
MISMATCH promotions.POP_STAR.effects.0.v: catalog 25 vs install '-75' [ModifierArguments[ModifierId=ROCKBAND_POP&Name=Amount].Value <- Expansion2_UnitPromotions.xml]
```

### builtWonders (1)

```
MISMATCH builtWonders.COLOSSEUM.effects.regionalAmenities: catalog 3 vs install '2' [Buildings[BuildingType=BUILDING_COLOSSEUM].Entertainment <- Expansion1_Buildings.xml]
```

### policies (1)

```
MISMATCH policies.LEGACY_FASCISM.effects.wwCutPct: catalog 15 vs install '20' [ModifierArguments[ModifierId=FASCISM_WAR_WEARINESS&Name=Amount].Value <- Expansion1_Governments.xml]
```

### governments (1)

```
MISMATCH governments.FASCISM.effects.wwCutPct: catalog 15 vs install '20' [ModifierArguments[ModifierId=FASCISM_WAR_WEARINESS&Name=Amount].Value <- Expansion1_Governments.xml]
```

### congressResolutions (1)

```
MISMATCH congressResolutions.WORLD_RELIGION.minEra: catalog 4 vs install None [Resolutions[ResolutionType=WC_RES_WORLD_RELIGION].EarliestEra <- (row found in Expansion2_Congress.xml, no column EarliestEra, no default)]
```

## Wave 1, agent A report (2026-09-14) — units, techs, civics, improvements, promotions

Verified by me after the agent returned: tsc green, rules.json byte-identical
(md5 with srcStamp removed), checker totals for these five catalogs:
units 1102/18/6/25, techs 267/7/103/38, civics 228/3/101/23,
improvements 333/2/55/92, promotions 405/2/260/118 (match / mismatch /
unsourced / lab-stylized-derived). No catalog value was changed.

## MISMATCH — 32, classified by the agent, to be TRIAGED and fixed on both engines as gate-stage changes

### units (18)
- NATURALIST.charges 0 vs ParkCharges 1 — engine models the Naturalist as consumed on designation. DECISION: fidelity says a charge; check the park verb's consumer on both engines.
- BATTERING_RAM.upgradesTo MEDIC vs UNIT_SIEGE_TOWER — wrong rung.
- OKIHTCITAW.upgradesTo SKIRMISHER vs UNIT_RANGER — the unique's OWN successor, not the replaced chassis'.
- VARU.upgradesTo TANK vs UNIT_CUIRASSIER — same family.
- INQUISITOR.religiousStrength 70 vs 75.
- MINAS_GERAES.antiAir 90 vs 95.
- MAMLUK.cost 108 vs 132 (180 pre-scale vs install 220); MAMLUK.maintenance 3 vs 4.
- VARU.maintenance 3 vs 2.
- TOA.maintenance 2 vs 0 (schema default).
- KHEVSURETI / TOA / KESHIG / U_BOAT / DE_ZEVEN_PROVINCIEN .requiresResource — the catalog inherits the base chassis' strategic bill onto five uniques the install EXEMPTS (no StrategicResource); U_BOAT.resourceCost/resourceUpkeep likewise (no Units_XP2 row). The Khevsureti instead carries Units_XP2.ResourceCost 10, which the catalog never reads. ONE systematic defect.
- SPY.moves 0 vs BaseMoves 1 — deliberate (the spy jumps); memory `zero-mp-chassis` — leave, tag as stylized with the reason.

### techs (7)
- MILITARY_ENGINEERING.effects.1.improvement FORT — install: Fort's PrereqTech is TECH_SIEGE_TACTICS; the row's comment asserts the opposite. Comment AND row wrong.
- STEEL.effects.0.improvement OIL_WELL — GS: Oil Well at TECH_REFINING.
- BANKING.effects.1 (QUARRY +2 gold) — no such install row; the Quarry's bonus rows are +1 Production at Gunpowder, Rocketry, Predictive Systems.
- ROBOTICS.effects.0 (PASTURE +1 production) — install: Robotics gives the Pasture +1 FOOD; the +1 Production is at TECH_REPLACEABLE_PARTS, which the catalog lacks.
- SYNTHETIC_MATERIALS.effects.1.yields.gold 1 vs 2 (Camp).

### civics (3)
- CODE_OF_LAWS.effects.0.government CHIEFDOM — Chiefdom has no PrereqCivic (starting government); unsourceable fact, tag stays as a pointer. Not a defect.
- SUFFRAGE.effects.2.policy ECONOMIC_UNION — install PrereqCivic CIVIC_IDEOLOGY.
- CLASS_STRUGGLE.effects.1.policy FIVE_YEAR_PLAN — install PrereqCivic CIVIC_IDEOLOGY.

### improvements (2)
- LUMBER_MILL.yields.production 1 vs 2 (Expansion2_Improvements.xml).
- SPHINX.appealAdjacent 1 vs Appeal 2 — the row's comment claims "the XML says one, outranking the pedia"; the XML says 2. Comment inverts the evidence.

### promotions (2)
- PROSELYTIZER.effects.0.v 75 vs APOSTLE_EVICT_ALL Amount 50.
- POP_STAR.effects.0.v 25 vs ROCKBAND_POP Amount -75 (TOURISM_BOMB_ADDITIONAL_YIELD on YIELD_GOLD) — the relation between 25 and -75 unverified; not an `expect`.

## UNSOURCED (525 + 39 + 16) — by reason
- Engine vocabulary with no install counterpart: `effects.N.kind` enums (techs 75, civics 88, promotions 141), promotion `mask` bitmasks (118), empty `effects` arrays (41), improvement map glyph `code` (38). Candidates for a SKIP rule in the dump (they are not constants about the game).
- The fact is an ABSENCE in the install (complement lists, a missing PurchaseYield, no charge column for Archaeologist / Rock Band).
- DLL / requirement-set magnitudes: siegeMaxWalls, GDR healFriendlyOnly, Disciples 250 pressure, improvement damage/heal/swap/governor clauses, Sphinx per-count, Lumber Mill river production.

## Types widened
Only in the agent's own files. techs / civics / promotions build rows through positional helpers, so each gained an id-keyed `TECH_SRC` / `CIVIC_SRC` / `PROMO_SRC` map above the helper that the helper spreads onto the row.

## Cross-catalog note
The tech/civic unlock effects' engine→install id map for buildings and districts was read from agent B's already-tagged buildings.ts / districts.ts, so those tags are load-bearing for these.

## Wave 1, agent B report (2026-09-14) — buildings, districts, wonders, policies, governments, projects, boosts, great people, storms, nukes, spies, city-states, civ levels, congress, emergencies, climate, great-work holders, governors

Verified by me after the agent returned: tsc green; the wire was NOT
byte-identical at first — `civLevels` is exported by a spread, so its `src`
rode onto rules.json; the exporter now strips it there too (the second
spread after `storms`). Agent's own tallies (match / mismatch / unsourced /
lab-stylized-derived): buildings 326/10/9/92, districts 291/5/22/63,
builtWonders 159/1/16/83, policies 124/2/61/129, governments 48/1/2/12,
projects 73/0/4/29, boosts 0/0/55/110, greatPeople 402/0/8/205, storms
42/0/0/126, congressResolutions 35/1/12/18, spyMissions 10/0/0/44, civLevels
40/0/0/0, nuclearDevices 8/0/0/2. NOT DONE: the four belief lists (64
constants, every magnitude a BeliefModifiers chain; six ids need an alias)
and governorPromotions (153 constants). No catalog value changed.

### MISMATCH — 20, classified by the agent
- buildings.PALACE.cost 0 vs 1 — deliberate (autoCapital, never built). STYLIZED.
- buildings.PALACE.amenities 1 vs Entertainment 2 (GS raised it).
- buildings.PAGODA.housing 1 vs 0 (Expansion2 writes Housing 0).
- buildings.FACTORY.civVariants.0.yields.production 4 vs 3 — the Electronics Factory's extra is the POWERED bonus (Building_YieldChangesBonusWithPower 5 vs 3), not the base row; the row's cost comment (390 vs 390) is stale too (both 330).
- buildings.HANGAR.airSlots 2 vs 1; buildings.AIRPORT.airSlots 2 vs 1 (GS; the Aerodrome itself carries AirSlots 4).
- buildings.AIRPORT.yields.production 3 vs 4 (and the Airport's RequiredPower 1 is not carried at all).
- buildings.ZOO.civVariants.0.cost 175 vs 216 (Thermal Bath) and RENAISSANCE_WALLS.civVariants.0.cost 154 vs 156 (Tsikhe) — deliberate per the file header (install RATIO on the published-ladder base), BUT the Thermal Bath comment assumes a Zoo cost of 445 where the install says 360, so its ratio is spurious: the install prices Thermal Bath and Zoo identically.
- buildings.AQUATICS_CENTER.cost 396 vs 288 (raw 660 vs install 480).
- districts.CITY_CENTER.cost 0 vs 54 — deliberate (founded, never produced). STYLIZED.
- districts.THEATER_SQUARE.civVariants.0.adjacency.0.amount 1 vs 2 — the Acropolis reads the same Wonder_Culture row (+2 per adjacent wonder).
- districts.NEIGHBORHOOD.housing 0 vs 4; districts.PRESERVE.housing 0 vs 1 — deliberate per the rows' comments (appeal-based here). STYLIZED, or a fidelity question.
- districts.SPACEPORT.maintenance 1 vs 0 (schema default: no Maintenance column).
- builtWonders.COLOSSEUM.effects.regionalAmenities 3 vs 2 (R&F/GS lowered it).
- policies.ISOLATIONISM.effects.domesticRouteYield.production 2 vs 3 — a CHECKER ARTEFACT: the last writer was a Dramatic Ages MODE file. Fixed by the modinfo-driven load order (criteria evaluation excludes game modes).
- policies.LEGACY_FASCISM.effects.wwCutPct 15 vs 20 and governments.FASCISM.effects.wwCutPct 15 vs 20 — one fact, two readers; the install's Fascism cuts war weariness by 20. (The "-15%" is the vanilla pedia text.)
- congressResolutions.WORLD_RELIGION.minEra 4 vs none — the install gives World Religion a LatestEra of Industrial and no EarliestEra: available THROUGH Industrial. The catalog has it inverted (Industrial-and-later).

### UNSOURCED, grouped
- Requirement-set facts with no column (buildings' `special` rule names, district placement flags, wonder placement "with a building" halves and terrain/feature filters, policy thresholds — 38 rows, government class lists, project resource amounts, boosts' check arguments — 55).
- Rows absent from the readable install under the OLD file order (4 great people, 2 policies, 4 resolutions, M'banza's Apostle) — to be re-checked under the modinfo order.
- Engine numbers the install does not publish: CATHEDRAL.yields.culture 3 (install: Faith 3 only); LIGHTHOUSE.yields.food/gold 1 (install: nil — the +1 Food is the LIGHTHOUSE_COAST_FOOD plot modifier, which `special: 'LIGHTHOUSE'` already carries, so the flat food may be DOUBLE-PAYING). Both are #264 lines.

### Types widened
`src?: SrcMap` on every row type in the agent's own files; positional builders (policies' P/DK/G, disasters' storm, greatPeople's P, and the frozen literals) carry the tags through a `*_SRC` table or `*Src()` merged by the builder. No shared type touched.

### Tooling findings (both acted on)
1. Alphabetical order inside a pack is not the load order — `Expansion2_RemoveData.xml` deleted the civic boosts (Boosts read 14 rows where the game has ~112), and likely the DEFENDER/BUILDER governor promotions and four resolutions. The checker now follows each pack's .modinfo: InGameActions/UpdateDatabase under the ruleset's criteria, LoadOrder across actions, Priority within.
2. `scale` could not express a fraction; it now compares exactly when the catalog value is fractional.
