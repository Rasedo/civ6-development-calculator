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

    XML CHECK RED — 4775 match, 65 mismatch, 2 dangling, 204 unsourced, 812 derived, 3 lab (+0 unverifiable), 300 pedia, 378 stylized (312 install files)

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

### projects (1)

```
MISMATCH projects.RECOMMISSION_REACTOR.district: catalog 'INDUSTRIAL_ZONE' but the input is absent and the tag says the catalog then holds 'CITY_CENTER'
```

### promotions (3)

```
DANGLING promotions.ARMOR_PIERCING.requires: derived 'the UnitPromotionPrereqs rows of PROMOTION_ARMOR_PIERCING, r' names UnitPromotionPrereqs[UnitPromotion=PROMOTION_ARMOR_PIERCING&PrereqUnitPromotion=PROMOTION_ROUT].PrereqUnitPromotion (no such row)
MISMATCH promotions.PROSELYTIZER.effects.0.v: catalog 75 vs install '50' [ModifierArguments[ModifierId=APOSTLE_EVICT_ALL&Name=Amount].Value <- UnitPromotions.xml]
MISMATCH promotions.POP_STAR.effects.0.v: catalog 25 vs install '-75' [ModifierArguments[ModifierId=ROCKBAND_POP&Name=Amount].Value <- Expansion2_UnitPromotions.xml]
```

### builtWonders (1)

```
MISMATCH builtWonders.COLOSSEUM.effects.regionalAmenities: catalog 3 vs install '2' [Buildings[BuildingType=BUILDING_COLOSSEUM].Entertainment <- Expansion1_Buildings.xml]
```

### policies (2)

```
DANGLING policies.LIBERALISM.obsoleteCivic: derived 'the PrereqCivic of the policy the install names in ObsoleteP' names ObsoletePolicies[PolicyType=POLICY_LIBERALISM].ObsoletePolicy (no such row)
MISMATCH policies.LEGACY_FASCISM.effects.wwCutPct: catalog 15 vs install '20' [ModifierArguments[ModifierId=FASCISM_WAR_WEARINESS&Name=Amount].Value <- Expansion1_Governments.xml]
```

### governments (1)

```
MISMATCH governments.FASCISM.effects.wwCutPct: catalog 15 vs install '20' [ModifierArguments[ModifierId=FASCISM_WAR_WEARINESS&Name=Amount].Value <- Expansion1_Governments.xml]
```

### pantheons (2)

```
MISMATCH pantheons.RIVER_GODDESS.effects.riverCity.amenities: catalog 1 vs install '2' [ModifierArguments[ModifierId=RIVER_GODDESS_HOLY_SITE_AMENITIES_MODIFIER&Name=Amount].Value <- Expansion2_Beliefs.xml]
MISMATCH pantheons.RIVER_GODDESS.effects.riverCity.housing: catalog 1 vs install '2' [ModifierArguments[ModifierId=RIVER_GODDESS_HOLY_SITE_HOUSING_MODIFIER&Name=Amount].Value <- Expansion2_Beliefs.xml]
```

### followerBeliefs (3)

```
MISMATCH followerBeliefs.FEED_THE_WORLD.effects.buildingYields.SHRINE.food: catalog 1 vs install '3' [ModifierArguments[ModifierId=FEED_THE_WORLD_SHRINE_FOOD3_MODIFIER&Name=Amount].Value <- Expansion2_Beliefs.xml]
MISMATCH followerBeliefs.FEED_THE_WORLD.effects.buildingYields.TEMPLE.food: catalog 2 vs install '3' [ModifierArguments[ModifierId=FEED_THE_WORLD_TEMPLE_FOOD3_MODIFIER&Name=Amount].Value <- Expansion2_Beliefs.xml]
MISMATCH followerBeliefs.DIVINE_INSPIRATION.effects.faithPerWonder: catalog 2 vs install '4' [ModifierArguments[ModifierId=DIVINE_INSPIRATION_WONDER_FAITH_MODIFIER&Name=Amount].Value <- Beliefs.xml]
```

### founderBeliefs (4)

```
MISMATCH founderBeliefs.TITHE.effects.perFollowers.per: catalog 4 vs install '1' [ModifierArguments[ModifierId=TITHE_GOLD_CITY_MODIFIER&Name=PerXItems].Value <- Expansion2_Beliefs.xml]
MISMATCH founderBeliefs.TITHE.effects.perFollowers.yields.gold: catalog 1 vs install '3' [ModifierArguments[ModifierId=TITHE_GOLD_CITY_MODIFIER&Name=Amount].Value <- Expansion2_Beliefs.xml]
MISMATCH founderBeliefs.WORLD_CHURCH.effects.perFollowers.per: catalog 5 vs install '4' [ModifierArguments[ModifierId=WORLD_CHURCH_CULTURE_FOLLOWER_MODIFIER&Name=PerXItems].Value <- Expansion2_Beliefs.xml]
MISMATCH founderBeliefs.CROSS_CULTURAL_DIALOGUE.effects.perFollowers.per: catalog 5 vs install '4' [ModifierArguments[ModifierId=CROSS_CULTURAL_DIALOGUE_SCIENCE_FOLLOWER_MODIFIER&Name=PerXItems].Value <- Expansion2_Beliefs.xml]
```

### enhancerBeliefs (2)

```
MISMATCH enhancerBeliefs.ITINERANT_PREACHERS.effects.pressureRangeBonus: catalog 2 vs install '3' [ModifierArguments[ModifierId=ITINERANT_PREACHERS_SPREAD_DISTANCE&Name=DistanceChange].Value <- Beliefs.xml]
MISMATCH enhancerBeliefs.SCRIPTURE.effects.spreadPressureMult: catalog 1.5 vs install '25' [ModifierArguments[ModifierId=SCRIPTURE_SPEAD_STRENGTH&Name=SpreadMultiplier].Value <- Beliefs.xml]
```

### congressResolutions (1)

```
MISMATCH congressResolutions.WORLD_RELIGION.minEra: catalog 4 vs install None [Resolutions[ResolutionType=WC_RES_WORLD_RELIGION].EarliestEra <- (row found in Expansion2_Congress.xml, no column EarliestEra, no default)]
```

### scenario (1)

```
MISMATCH scenario.goldPurchaseMult: catalog 4 vs install '2' [GlobalParameters[Name=GOLD_PURCHASE_MULTIPLIER].Value <- GlobalParameters.xml]
```

### eras (4)

```
MISMATCH eras.darkT: catalog 12 vs install '14' [GlobalParameters[Name=DARK_AGE_SCORE_BASE_THRESHOLD].Value <- Expansion2_GlobalParameters.xml]
MISMATCH eras.goldenT: catalog 24 vs install '28' [GlobalParameters[Name=GOLDEN_AGE_SCORE_BASE_THRESHOLD].Value <- Expansion2_GlobalParameters.xml]
MISMATCH eras.delegationCost: catalog 10 vs install '25' [DiplomaticActions[DiplomaticActionType=DIPLOACTION_DIPLOMATIC_DELEGATION].Cost <- DiplomaticActions.xml]
MISMATCH eras.embassyCost: catalog 25 vs install '50' [DiplomaticActions[DiplomaticActionType=DIPLOACTION_RESIDENT_EMBASSY].Cost <- DiplomaticActions.xml]
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

## Wave 2, agent D report (2026-09-14) — the named scalars via `srcConst`

Fully tagged: constants.ts, disasters.ts, espionage.ts, sight.ts,
warKinds.ts, goodyHuts.ts, climate.ts, greatWorks.ts, nuclear.ts,
greatPeople.ts (167 registrations; 2-D tables and Records registered per
row / per key). UNTOUCHED, the next agent's job: seats.ts (226 module-level
consts; the GlobalParameters rows for ~50 of them are already listed in the
agent's report — WAR/PEACE min turns, LOYALTY_*, WAR_WEARINESS_*, the age
thresholds, the congress and alliance and grievance and tourism
parameters) and units.ts's top block (FORMATION_CS = COMBAT_CORPS/ARMY_
STRENGTH_MODIFIER 10/17, FORMATION_COST_MULT = UNIT_CORPS/ARMY_COST_MODIFIER
1.5/2.0, FORMATION_RESOURCE_MULT stylized). Helpers in tmp/agentD:
`wirepaths.py` (a constant's rules.json path from rules.ts), `globalparams.txt`
(all 476 GlobalParameters rows), q1..q7 batch queries. vitest 1790 green,
tsc green, no value changed.

DUMP GAP (closed by the maintainer): cpu/export/provenance.ts imported no
symbol from sight.ts or goodyHuts.ts, so their 13 registrations never
loaded; two side-effect imports fix it. The 13 were hand-verified MATCH.

### MISMATCH — 1
- scenario.goldPurchaseMult 4 vs GlobalParameters GOLD_PURCHASE_MULTIPLIER 2 (beside PURCHASE_DIVISOR 5) — the constant's comment states 4 as fact with no citation. #264: is the engine's cost×4 a deliberate price or a slip against the install's 2-and-divisor-5 formula?
- (raised and re-pointed, no value touched) ARCHAEOLOGIST charges 3: the install has no BuildCharges column for the chassis; retagged LAB (the civilopedia's 3).

### UNSOURCED, grouped
- A. Stated with no source: FAITH_PURCHASE_MULT 2 (no FAITH_PURCHASE_MULTIPLIER row), CITY_CENTER_MIN_PRODUCTION 1, LUXURY_AMENITY_CITIES 4, REGIONAL_RANGE 6, TRADE_ROAD_MAX_STEPS 32, DROUGHT_LENGTH 8 (the install's droughts are 5 and 10 — an owner ask), the spy TRAVEL clock (1 / 8 tiles a turn / 5), SPY_CAPTURE_PCT 50.
- B. Shape `srcConst` cannot take: MAP_SIZES, AMENITY_TIERS, ROAD_TIER_BRIDGES (= Routes.SupportsBridges, verified), RAILROAD_COST (= Route_ResourceCosts, verified), EMBARK_MOVE_TECHS, STORM_DISC, ARTIST_WORKS, SPECIALIST_*, GP_ABILITY/FX/PERM; in seats.ts SKY_EUREKAS, DEDICATION_ERAS, LOYALTY_AMENITY, GOV_INTOLERANCE, SEAT_CAPS (the last two are Records and CAN be registered per key).
- C. Deliberately not registered — catalog-position codes and aggregates (SPY_M_*, WAR_KIND_*, GW_KIND_*, GP_CLASSES, FORMATION_MAX …): they assert nothing about the game.

### Type note
`srcConst` infers a non-fresh literal type; two sites needed `srcConst<number>(…)` (housing.fresh/coastal/none read into a `let`; eras.espionage.travelCols). Expect the same in seats.ts — annotation only.

## Wave 2, agent C report (2026-09-14) — beliefs, governor promotions, the SKIP rule

Complete: religion.ts (BELIEF_SRC + the B() merge; pantheons 31/33,
follower 8/10, founder 11/12, enhancer 5/9 constants tagged) and
governors.ts GOVERNOR_PROMOTIONS (PROMO_INSTALL_ID + PROMO_EFFECT_SRC via
G(); 42/42 rows, 153/153 constants, 0 mismatches). The SKIP rule in
cpu/export/provenance.ts: `kind`, `mask`, `code` join SKIP_COL and an empty
array is not a constant — 674 constants left the dump, 528 of them
unsourced (unsourced 731 → 203 across the whole dump); `effects` was NOT
added (it is the object key every belief and promotion row hangs its
magnitudes on). UNTOUCHED: civilizations.ts's row lists — nothing started;
a ready-to-splice provenance block for ~60 lists (`withSrc()` + positional
`*_SRC` tables, UNVERIFIED against the checker) and the trait dumps are in
.claude/scratchpad/provenance_wave2/agentC/ (civ_src_block.ts, lib.py,
q_trait.py, alltraits.txt, civtraits.txt, gov2.txt). No value changed.

### MISMATCH — 11, all beliefs (governor promotions clean)
- RIVER_GODDESS riverCity amenities 1 vs 2, housing 1 vs 2 — GS raised both.
- FEED_THE_WORLD SHRINE food 1 vs 3, TEMPLE food 2 vs 3 — GS is +3 each (+2 housing, which the engine models under RELIGIOUS_COMMUNITY).
- DIVINE_INSPIRATION faithPerWonder 2 vs 4 — GS.
- TITHE per 4 vs 1, gold 1 vs 3 — GS's Tithe is +3 gold per CITY (Amount 3, PerXItems 1); the engine kept the pre-GS "+1 per 4 followers" shape.
- WORLD_CHURCH per 5 vs 4; CROSS_CULTURAL_DIALOGUE per 5 vs 4 — transcription slips (the Amounts match).
- ITINERANT_PREACHERS pressureRangeBonus 2 vs DistanceChange 3 — slip.
- SCRIPTURE spreadPressureMult 1.5 vs SpreadMultiplier 25 — a PERCENT (×1.25), the catalog's comment made it ×1.5: unit and magnitude.

### UNSOURCED — 9
- GS DELETES the belief (Expansion2_RemoveData.xml): ORAL_TRADITION's plantation culture (now GODDESS_OF_FESTIVALS's clause), CHURCH_PROPERTY's per-city gold; GODDESS_OF_THE_HARVEST is deleted too but carries no constant.
- No install row anywhere: CRUSADE's combat clause, MESSENGER_OF_THE_GODS's route yields.
- The row exists but GS rewrote the clause: RELIGIOUS_COMMUNITY's shrine/temple housing (GS: +2 gold on international routes; the housing moved to FEED_THE_WORLD at 2), SCRIPTURE's missionary charge bonus (GS carries none).
- Condition differs: GODDESS_OF_FESTIVALS's `category: 'luxury'` (install: PLOT_HAS_PLANTATION_REQUIREMENTS) — the Amount is tagged, the condition honestly not.
Two lines for #264 beyond the mismatches: four beliefs the engine fields that Gathering Storm does not have at all (Oral Tradition, Church Property, Crusade, Messenger of the Gods) and one whose clause GS replaced (Religious Community).

### Types widened
`BeliefDef.src?`, `GovernorPromotionDef.src?` — own files only.

## Triage draft for #264 (2026-09-14) — one decision per line, nothing applied yet

Three bins. FIX = the install is the source and the catalog is wrong (a GS
change the catalog never took, or a slip); one catalog edit, both engines
read the wire, then grep both engines for a hard-coded duplicate of the old
number. STYLIZED = the engine differs on purpose; the tag becomes
`{ stylized: '<reason>' }` and the line leaves. ASK = a modelling question
the owner rules on. Every FIX is behaviour-changing: batched, battery after,
fixtures may move.

### FIX (35)
- units: INQUISITOR.religiousStrength 75; MINAS_GERAES.antiAir 95; MAMLUK cost 220 (raw) / maintenance 4; VARU maintenance 2; TOA maintenance 0; PIKE_AND_SHOT maintenance 3; BATTERING_RAM.upgradesTo SIEGE_TOWER; VARU.upgradesTo CUIRASSIER; TOA and U_BOAT lose requiresResource (and the U-Boat its resourceCost/resourceUpkeep) — the install exempts them.
- techs: MILITARY_ENGINEERING's Fort effect moves to SIEGE_TACTICS (and the comment is rewritten); STEEL's Oil Well moves to REFINING; BANKING's Quarry +2 gold is deleted (no such row); ROBOTICS's Pasture row becomes +1 FOOD, and a REPLACEABLE_PARTS Pasture +1 production row is added; SYNTHETIC_MATERIALS Camp gold 2.
- civics: SUFFRAGE loses Economic Union and CLASS_STRUGGLE loses Five-Year Plan; both policies hang on IDEOLOGY.
- improvements: LUMBER_MILL production 2; SPHINX appealAdjacent 2 (comment rewritten — it inverted the XML).
- promotions: PROSELYTIZER 50.
- buildings: PALACE amenities 2; PAGODA housing 0; Electronics Factory base production 3 (its extra is the POWERED bonus — check the powered path carries 5 vs 3); HANGAR/AIRPORT airSlots 1; AIRPORT production 4; AQUATICS_CENTER raw 480; Thermal Bath's ratio premise (the Zoo is 360, not 445 — the install prices both at 360).
- districts: Acropolis Wonder_Culture 2; SPACEPORT maintenance 0.
- builtWonders: COLOSSEUM regionalAmenities 2.
- policies/governments: Fascism wwCutPct 20 (one fact, two readers — fix both).
- congress: WORLD_RELIGION era window = through Industrial (minEra none, maxEra 4), the inverse of today.
- beliefs: RIVER_GODDESS 2/2; FEED_THE_WORLD shrine 3 / temple 3; DIVINE_INSPIRATION 4; WORLD_CHURCH per 4; CROSS_CULTURAL_DIALOGUE per 4; ITINERANT_PREACHERS 3; SCRIPTURE ×1.25 (a percent, 25).

### STYLIZED (6) — retag, quoting the reason already in the row
- PALACE.cost 0 (autoCapital, never built); CITY_CENTER.cost 0 (founded, never produced); SPY.moves 0 (the spy jumps; memory `zero-mp-chassis`); NEIGHBORHOOD.housing 0 and PRESERVE.housing 0 (appeal-based here, per the rows); Tsikhe's ratio cost (the buildings header's rule — see ASK 3 before retagging).

### ASK (owner) (9)
1. GOLD_PURCHASE_MULT 4 vs the install's GOLD_PURCHASE_MULTIPLIER 2 with PURCHASE_DIVISOR 5 — the install's price is a formula (cost × 2 … / 5 …); is the engine's flat ×4 a chosen price or a slip? Same question for FAITH_PURCHASE_MULT 2 (no install row at all).
2. NATURALIST charges 0 vs ParkCharges 1 — the engine consumes the unit on designation; the install spends a charge. Same behaviour, different shape — keep the shape or mirror the column?
3. THE BUILDING COST LADDER: buildings.ts prices from a published ladder, not the XML, and variants by ratio. The checker will disagree with every building whose ladder rung differs from the install's Cost. Move buildings to install costs wholesale (one fixture-moving batch), or declare the ladder STYLIZED and tag every cost so?
4. TITHE's shape — GS is +3 gold per CITY with the religion; the engine's "+1 per 4 followers" is pre-GS. Rewrite the effect (a new effect kind on both engines), or STYLIZED?
5. Four beliefs Gathering Storm does not have (ORAL_TRADITION, CHURCH_PROPERTY deleted by the expansion; CRUSADE, MESSENGER_OF_THE_GODS nowhere in the install) and RELIGIOUS_COMMUNITY's replaced clause — remove them from the roster (a fixture-moving change: religions draw from the pool) or keep as STYLIZED?
6. POP_STAR 25 vs the install's -75 on a tourism-bomb gold yield — the relation is unverified; a lab scene (a Rock Band's concert) settles it.
7. LIGHTHOUSE's flat +1 food beside its coast modifier — likely DOUBLE-PAYING; confirm against the Lighthouse's install rows (nil base yields) and drop the flat food?
8. CATHEDRAL culture 3 — no install row (Faith 3 only; the culture presumably stands in for the great-work slot). Drop it, or STYLIZED until great works fill the slot?
9. CODE_OF_LAWS → CHIEFDOM has no PrereqCivic in the install (starting government) — not a defect; the tag stays as a pointer. Confirm and allowlist.

Order of work: the ASK list goes to the owner first (one message); FIX lands as ONE batch with the per-line comments rewritten, a battery, and the fixture note; STYLIZED retags ride the same commit.

## Wave 3, agent E report (2026-09-14) — civilizations.ts, the roster's modifier rows

Complete: 93 row lists wrapped in `withSrc(rows, X_SRC)` (positional
tables; LEGACY_RATE_ROWS by government name; `withSrc` throws on a length
mismatch so a later row insertion cannot shift the tags), 13 exported
scalars via srcConst, 100 catalogs in the dump. Checker on this slice:
625 match, 0 mismatch, 1 unsourced, 48 lab/stylized/derived. The owning
trait of all 263 modifier ids was verified against TraitModifiers; every
`derived: 'zero — …'` claim re-derived from the trait's real modifiers.

### MISMATCH — none.

### UNSOURCED — 1
- warBan.CANADA.ban (onCityState): the install has no row banning
  DIPLOACTION_DECLARE_WAR_MINOR_CIV; its only banned-action modifiers are the
  surprise-war pair. Left with the reason in a comment.

### What the checker corrected in the draft
- Mapuche governor XP (×2): the requirement set is on the modifier's OWNER
  side (`OwnerRequirementSetId`) where its culture/production twins use the
  subject side — a per-modifier fork; `mown()` helper added.
- Two grant rows spell the install column `OwnerRequirementsetId` (lowercase
  s) — the helper takes the column name.
- Phoenicia's settler-only clauses are gated on the ABILITY's TypeTags class
  (CLASS_SETTLER), not on the modifier.
- The Saka horse archer's extra copy is a `UnitType`, no tag → derived.
- "No surprise war on Canada" hangs on TRAIT_LEADER_MAJOR_CIV — every major
  leader carries it.

### Caveat — a kind the schema lacks
Three facts live in the install's published TEXT, not a table: Toqui's and
Eleanor's 9-tile loyalty radii, Qin's Ancient–Classical wonder band. Tagged
`lab` as the least wrong; a `text` kind (with the LOC key) would be honest.

## Wave 3, agent F report (2026-09-14) — seats.ts scalars and units.ts's formation block

seats.ts: 170 srcConst registrations over 226 module-level consts (the
rest are catalog-position codes, wire-order lists, functions, or the
shapes below); units.ts top block: 10. vitest 1790 green, tsc green, no
value changed. New install sources found: LOYALTY_AMENITY =
Happinesses_XP1.IdentityPerTurnChange (all five tiers), GOV_INTOLERANCE =
Governments.OtherGovernmentIntolerance (ten rows), every alliance
magnitude off AllianceEffects → ModifierArguments, the alliance route
yields per index (the install ships NO military-alliance route modifier —
the engine's 0 is right), most congress magnitudes off ResolutionEffects,
ERA_SCORE_MOMENT_MIN from TAJ_MAHAL_EXTRA_ERA_SCORE.MinScore, the formation
train discount from the two buildings' 25, FORMATION_TRAIN_BUILDING from
the BuildingModifiers rows that carry the discount. Sign conventions via
`expect` with a note: favorOccupiedCapital 5 (install −5),
grievanceFavorMax 10 (install −10), GOV_INTOLERANCE 20 (install −20).

### MISMATCH — 4
- eras.darkT 12 vs DARK_AGE_SCORE_BASE_THRESHOLD 14; eras.goldenT 24 vs
  GOLDEN_AGE_SCORE_BASE_THRESHOLD 28 — the row's own CIV6 (Ages) comment
  quotes the pre-GS 12/24; the install's gap is 14, the engine's 12. FIX
  (and the file header's claim that these are "model tuning" is
  contradicted by the row's citation — rewrite).
- eras.delegationCost 10 vs 25; eras.embassyCost 25 vs 50 — the wiki's
  sentence quoted in the comment; the shipped table is double both (the
  engine's embassy equals the install's delegation). FIX.

### UNSOURCED, grouped
- A. No source stated (12): MAX_CITIES_PER_SEAT 6, LOYALTY_RANGE 9
  (near-miss: CITIZEN_IDENTITY_PRESSURE_RADIUS_CUTOFF 10), ERA_LENGTH 50,
  AGE_PRESSURE, the six ERA_SCORE_* awards (the header calls them model
  tuning; the install's Moments table matches three exactly — PANTHEON 1,
  RELIGION 2, GP 1 — and WONDER 3 matches the past-era row where the
  game-era row pays 4; FOUND/CONQUER are aggregates), two feature flags
  (ADMIRAL_MARCH_LIVE's comment is misplaced — it describes
  HEROIC_DEDICATIONS 137 lines away), DOW_PROXIMITY 9.
- B. Catalog-position codes and wire-order lists (61), deliberately not
  registered.
- C. FORMATION_CIVIC — the base corps/army civic gate is DLL; only
  overrides name a civic (Shaka's early gates, Horn-Chest-Loins). Left
  untagged.
- Could not wrap: SEAT_CAPS (object of objects; the `minor` cell is
  declared UNREACHED), DEAL_PERMANENT (boolean[]), two functions,
  COMPETITIONS (a row catalog — EmergencyScoreSources confirms every
  scored amount in its comments; a ready row-tagging follow-up).
