# Constant provenance — the mismatch ledger

Every catalog constant carries a source tag (cpu/data/provenance.ts) and
tools/civ6lab/xml_check.py re-reads the install and compares. This file
holds what the checker found that the catalogs did NOT yet agree with, per
tagging wave, until task #264 closes each line on both engines. A line
leaves when the value is fixed (a gate-stage change with a battery) or the
tag becomes STYLIZED with the ruling quoted.

    npm run export                       # writes seeder/worlds/provenance.json
    python tools/civ6lab/xml_check.py check

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
