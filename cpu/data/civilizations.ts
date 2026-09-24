/**
 * THE CIVILIZATION ABILITIES — CIV6, the owner's install (Civilizations.xml,
 * Traits / TraitModifiers / Modifiers). One constant per sourced number; the
 * rule body that spends each lives beside the mechanic it touches.
 */
import type { ImprovementId, TerrainId, FeatureId } from '../../world/types';
import type { DistrictId } from '../core/types';
import type { YieldKey } from '../core/types';
import type { Era } from './techs';
import type { SlotKind } from './policies';
import type { CivId, LeaderId } from './seats';
import { GWO_ARTIFACT, GWO_RELIC, GWO_SCULPTURE } from './greatWorks';
import type { WarKindId } from './warKinds';
import { srcConst, xml, type Src, type SrcMap } from './provenance';

// ---------------------------------------------------------------------------
// PROVENANCE (cpu/data/provenance.ts) for every roster ROW LIST in this file.
//
// The install writes a civilization's or leader's clause as
// `Traits` -> `TraitModifiers` -> `Modifiers` -> `ModifierArguments`, and the
// number a row carries is one `ModifierArguments.Value` cell. A row's `civ` /
// `leader` key is the ENGINE's; the install's TraitType is named in the
// modifier id the tag points at. Where the install writes a CLAUSE as a
// requirement set instead of an argument (a terrain, an improvement, "the city
// is not on my capital's continent"), the tag reads
// `Modifiers.SubjectRequirementSetId` — the cell that IS the clause.
//
// Each `*_SRC` array is POSITIONAL: entry i tags row i of the list below, and
// `withSrc` merges the two. A hole (undefined) is an untagged row.
const ma = (mid: string, name = 'Amount', expect?: string | number | boolean, note?: string): Src =>
  xml('ModifierArguments', `ModifierId=${mid}&Name=${name}`, 'Value',
    { ...(expect === undefined ? {} : { expect }), ...(note === undefined ? {} : { note }) });
const mreq = (mid: string, expect: string, note?: string): Src =>
  xml('Modifiers', `ModifierId=${mid}`, 'SubjectRequirementSetId',
    { expect, ...(note === undefined ? {} : { note }) });
const mtype = (mid: string, expect: string, note?: string): Src =>
  xml('Modifiers', `ModifierId=${mid}`, 'ModifierType',
    { expect, ...(note === undefined ? {} : { note }) });
/** the OWNER's half of the same clause — a modifier may carry its requirement
 *  set on either side, and the install writes the column BOTH ways
 *  (`OwnerRequirementSetId` and, on a handful of rows, `OwnerRequirementsetId`
 *  with a lowercase s, which is a spelling the game's own loader honours). */
const mown = (mid: string, expect: string, col = 'OwnerRequirementSetId', note?: string): Src =>
  xml('Modifiers', `ModifierId=${mid}`, col,
    { expect, ...(note === undefined ? {} : { note }) });

const withSrc = <T>(rows: readonly T[], src: readonly (SrcMap | undefined)[]): readonly T[] => {
  // a positional table is only right while the list is the length it was
  // tagged at: a row added or removed shifts every tag after it.
  if (src.length !== rows.length) {
    throw new Error(`withSrc: ${rows.length} rows, ${src.length} tags (first row ${JSON.stringify(rows[0])})`);
  }
  return rows.map((r, i) => (src[i] ? { ...r, src: src[i] } : r));
};

/** one EFFECT_ADJUST_PLOT_YIELD row: the yield, the amount, and every clause
 *  column the install folds into one requirement set. */
const plotSrc = (mid: string, y: string, req: string, clauses: readonly string[]): SrcMap => ({
  yield: ma(mid, 'YieldType', y),
  amount: ma(mid),
  ...Object.fromEntries(clauses.map((c) => [c, mreq(mid, req)])),
});

const HARDRADA_PILLAGE_SRC: readonly (SrcMap | undefined)[] = [
  { improvement: ma('TRAIT_LEADER_PILLAGE_SCIENCE_MINES', 'ImprovementType', 'IMPROVEMENT_MINE'),
    amount: ma('TRAIT_LEADER_PILLAGE_SCIENCE_MINES') },
  { improvement: ma('TRAIT_LEADER_PILLAGE_CULTURE_QUARRIES', 'ImprovementType', 'IMPROVEMENT_QUARRY'),
    amount: ma('TRAIT_LEADER_PILLAGE_CULTURE_QUARRIES') },
  { improvement: ma('TRAIT_LEADER_PILLAGE_CULTURE_PASTURES', 'ImprovementType', 'IMPROVEMENT_PASTURE'),
    amount: ma('TRAIT_LEADER_PILLAGE_CULTURE_PASTURES') },
  { improvement: ma('TRAIT_LEADER_PILLAGE_CULTURE_PLANTATIONS', 'ImprovementType', 'IMPROVEMENT_PLANTATION'),
    amount: ma('TRAIT_LEADER_PILLAGE_CULTURE_PLANTATIONS') },
  { improvement: ma('TRAIT_LEADER_PILLAGE_CULTURE_CAMPS', 'ImprovementType', 'IMPROVEMENT_CAMP'),
    amount: ma('TRAIT_LEADER_PILLAGE_CULTURE_CAMPS') },
];

const PLOT_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  plotSrc('TUNDRA_MINES_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_TUNDRA_MINE_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TUNDRA_HILLS_MINES_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_TUNDRA_HILLS_MINE_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_MINES_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_SNOW_MINE_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_HILLS_MINES_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_SNOW_HILLS_MINE_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TUNDRA_CAMPS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_TUNDRA_CAMP_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TUNDRA_HILLS_CAMPS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_TUNDRA_HILLS_CAMP_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_CAMPS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_SNOW_CAMP_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_HILLS_CAMPS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_SNOW_HILLS_CAMP_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TUNDRA_FARMS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_TUNDRA_FARM_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TUNDRA_HILLS_FARMS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_TUNDRA_HILLS_FARM_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_FARMS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_SNOW_FARM_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_HILLS_FARMS_FOOD', 'YIELD_FOOD', 'PLOT_HAS_SNOW_HILLS_FARM_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TUNDRA_LUMBER_MILLS_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_TUNDRA_LUMBER_MILL_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TUNDRA_HILLS_LUMBER_MILLS_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_TUNDRA_HILLS_LUMBER_MILL_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_LUMBER_MILLS_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_SNOW_LUMBER_MILL_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('SNOW_HILLS_LUMBER_MILLS_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_SNOW_HILLS_LUMBER_MILL_REQUIREMENTS', ['terrain', 'improvement', 'hills']),
  plotSrc('TRAIT_PRODUCTION_MOUNTAIN', 'YIELD_PRODUCTION', 'REQUIREMENTS_PLOT_IS_MOUNTAIN', ['mountain']),
  plotSrc('TRAIT_PRODUCTION_MOUNTAIN_LATE', 'YIELD_PRODUCTION', 'REQUIREMENTS_PLOT_IS_MOUNTAIN_LATE', ['mountain', 'eraAtLeast']),
  plotSrc('TRAIT_MALI_MINES_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_MINE_REQUIREMENTS', ['improvement']),
  plotSrc('TRAIT_MALI_MINES_GOLD', 'YIELD_GOLD', 'PLOT_HAS_MINE_REQUIREMENTS', ['improvement']),
  plotSrc('TRAIT_MAORI_PRODUCTION_WOODS', 'YIELD_PRODUCTION', 'PLOT_HAS_FOREST_NO_IMPROVEMENT_REQUIREMENTS', ['feature', 'anyImprovement']),
  plotSrc('TRAIT_MAORI_PRODUCTION_RAINFOREST', 'YIELD_PRODUCTION', 'PLOT_HAS_JUNGLE_NO_IMPROVEMENT_REQUIREMENTS', ['feature', 'anyImprovement']),
  plotSrc('TRAIT_MAORI_PRODUCTION_RAINFOREST_MERCANTILISM', 'YIELD_PRODUCTION', 'PLOT_HAS_JUNGLE_MERCANTILISM_REQUIREMENTS', ['feature', 'civic', 'anyImprovement']),
  plotSrc('TRAIT_MAORI_PRODUCTION_WOODS_MERCANTILISM', 'YIELD_PRODUCTION', 'PLOT_HAS_FOREST_MERCANTILISM_REQUIREMENTS', ['feature', 'civic', 'anyImprovement']),
  plotSrc('TRAIT_MAORI_PRODUCTION_RAINFOREST_CONSERVATION', 'YIELD_PRODUCTION', 'PLOT_HAS_JUNGLE_CONSERVATION_REQUIREMENTS', ['feature', 'civic', 'anyImprovement']),
  plotSrc('TRAIT_MAORI_PRODUCTION_WOODS_CONSERVATION', 'YIELD_PRODUCTION', 'PLOT_HAS_FOREST_CONSERVATION_REQUIREMENTS', ['feature', 'civic', 'anyImprovement']),
  plotSrc('TRAIT_MAORI_FISHING_BOAT_FOOD', 'YIELD_FOOD', 'PLOT_HAS_FISHINGBOATS_REQUIREMENTS', ['improvement']),
  plotSrc('TRAIT_INCREASED_TUNDRA_FAITH', 'YIELD_FAITH', 'PLOT_HAS_TUNDRA_REQUIREMENTS', ['terrain', 'hills']),
  plotSrc('TRAIT_INCREASED_TUNDRA_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_TUNDRA_REQUIREMENTS', ['terrain', 'hills']),
  plotSrc('TRAIT_INCREASED_TUNDRA_HILLS_FAITH', 'YIELD_FAITH', 'PLOT_HAS_TUNDRA_HILLS_REQUIREMENTS', ['terrain', 'hills']),
  plotSrc('TRAIT_INCREASED_TUNDRA_HILLS_PRODUCTION', 'YIELD_PRODUCTION', 'PLOT_HAS_TUNDRA_HILLS_REQUIREMENTS', ['terrain', 'hills']),
];

const PROD_MULT_SRC: readonly (SrcMap | undefined)[] = [
  { pct: ma('TRAIT_INTERCONTINENTAL_DISTRICT_PRODUCTION'),
    offHomeContinent: mreq('TRAIT_INTERCONTINENTAL_DISTRICT_PRODUCTION', 'CITY_NOT_OWNER_CAPITAL_CONTINENT_REQUIREMENTS'),
    every: mtype('TRAIT_INTERCONTINENTAL_DISTRICT_PRODUCTION', 'MODIFIER_PLAYER_CITIES_ADJUST_ALL_DISTRICTS_PRODUCTION') },
  { pct: ma('TRAIT_BOOST_ENCAMPMENT_PRODUCTION'), districtItem: ma('TRAIT_BOOST_ENCAMPMENT_PRODUCTION', 'DistrictType', 'DISTRICT_ENCAMPMENT') },
  { pct: ma('TRAIT_BOOST_HOLY_SITE_PRODUCTION'), districtItem: ma('TRAIT_BOOST_HOLY_SITE_PRODUCTION', 'DistrictType', 'DISTRICT_HOLY_SITE') },
  { pct: ma('TRAIT_BOOST_THEATER_DISTRICT_PRODUCTION'), districtItem: ma('TRAIT_BOOST_THEATER_DISTRICT_PRODUCTION', 'DistrictType', 'DISTRICT_THEATER') },
  { pct: ma('TRAIT_DAM_PRODUCTION_PRODUCTION'), districtItem: ma('TRAIT_DAM_PRODUCTION_PRODUCTION', 'DistrictType', 'DISTRICT_DAM') },
  { pct: ma('TRAIT_LESS_BUILDING_PRODUCTION'), every: mtype('TRAIT_LESS_BUILDING_PRODUCTION', 'MODIFIER_PLAYER_CITIES_ADJUST_BUILDING_PRODUCTION_MODIFIER') },
  { pct: ma('TRAIT_LESS_UNIT_PRODUCTION'), every: mtype('TRAIT_LESS_UNIT_PRODUCTION', 'MODIFIER_PLAYER_CITIES_ADJUST_UNIT_PRODUCTION_MODIFIER') },
  { pct: ma('TRAIT_ADJUST_MILITARY_ENGINEER_PRODUCTION'), unit: ma('TRAIT_ADJUST_MILITARY_ENGINEER_PRODUCTION', 'UnitType', 'UNIT_MILITARY_ENGINEER') },
  { pct: ma('TRAIT_ADJUST_INDUSTRIAL_ZONE_BUILDINGS_PRODUCTION'), district: ma('TRAIT_ADJUST_INDUSTRIAL_ZONE_BUILDINGS_PRODUCTION', 'DistrictType', 'DISTRICT_INDUSTRIAL_ZONE') },
  // the install's two wall rows are cross-named: TRAIT_CASTLE_PRODUCTION carries
  // BUILDING_WALLS and TRAIT_WALLS_PRODUCTION carries BUILDING_CASTLE.
  { pct: ma('TRAIT_CASTLE_PRODUCTION'), building: ma('TRAIT_CASTLE_PRODUCTION', 'BuildingType', 'BUILDING_WALLS') },
  { pct: ma('TRAIT_WALLS_PRODUCTION'), building: ma('TRAIT_WALLS_PRODUCTION', 'BuildingType', 'BUILDING_CASTLE') },
  { pct: ma('TRAIT_STAR_FORT_PRODUCTION'), building: ma('TRAIT_STAR_FORT_PRODUCTION', 'BuildingType', 'BUILDING_STAR_FORT') },
  { pct: ma('TRAIT_FLOOD_BARRIER_PRODUCTION'), building: ma('TRAIT_FLOOD_BARRIER_PRODUCTION', 'BuildingType', 'BUILDING_FLOOD_BARRIER') },
  { pct: ma('TRAIT_SIEGE_PRODUCTION'), promoClass: ma('TRAIT_SIEGE_PRODUCTION', 'UnitPromotionClass', 'PROMOTION_CLASS_SIEGE') },
];

const districtAdjSrc = (mid: string, district: string, source?: [string, string]): SrcMap => ({
  district: ma(mid, 'DistrictType', district),
  amount: ma(mid),
  ...(source ? { source: ma(mid, source[0], source[1]) } : {}),
});
const DISTRICT_ADJ_SRC: readonly (SrcMap | undefined)[] = [
  districtAdjSrc('TRAIT_AMAZON_RAINFOREST_CAMPUS_ADJACENCY', 'DISTRICT_CAMPUS', ['FeatureType', 'FEATURE_JUNGLE']),
  districtAdjSrc('TRAIT_AMAZON_RAINFOREST_COMMERCIALHUB_ADJACENCY', 'DISTRICT_COMMERCIAL_HUB', ['FeatureType', 'FEATURE_JUNGLE']),
  districtAdjSrc('TRAIT_AMAZON_RAINFOREST_HOLYSITE_ADJACENCY', 'DISTRICT_HOLY_SITE', ['FeatureType', 'FEATURE_JUNGLE']),
  districtAdjSrc('TRAIT_AMAZON_RAINFOREST_THEATER_ADJACENCY', 'DISTRICT_THEATER', ['FeatureType', 'FEATURE_JUNGLE']),
  { district: ma('TRAIT_CAMPUS_RIVER_ADJACENCY', 'DistrictType', 'DISTRICT_CAMPUS'), amount: ma('TRAIT_CAMPUS_RIVER_ADJACENCY'),
    source: mtype('TRAIT_CAMPUS_RIVER_ADJACENCY', 'MODIFIER_PLAYER_CITIES_RIVER_ADJACENCY') },
  { district: ma('TRAIT_THEATER_DISTRICT_RIVER_ADJACENCY', 'DistrictType', 'DISTRICT_THEATER'), amount: ma('TRAIT_THEATER_DISTRICT_RIVER_ADJACENCY'),
    source: mtype('TRAIT_THEATER_DISTRICT_RIVER_ADJACENCY', 'MODIFIER_PLAYER_CITIES_RIVER_ADJACENCY') },
  { district: ma('TRAIT_INDUSTRIAL_ZONE_RIVER_ADJACENCY', 'DistrictType', 'DISTRICT_INDUSTRIAL_ZONE'), amount: ma('TRAIT_INDUSTRIAL_ZONE_RIVER_ADJACENCY'),
    source: mtype('TRAIT_INDUSTRIAL_ZONE_RIVER_ADJACENCY', 'MODIFIER_PLAYER_CITIES_RIVER_ADJACENCY') },
  districtAdjSrc('TRAIT_ADJACENT_DISTRICTS_HOLYSITE_ADJACENCYFAITH', 'DISTRICT_HOLY_SITE'),
  districtAdjSrc('TRAIT_ADJACENT_DISTRICTS_CAMPUS_ADJACENCYSCIENCE', 'DISTRICT_CAMPUS'),
  districtAdjSrc('TRAIT_ADJACENT_DISTRICTS_HARBOR_ADJACENCYGOLD', 'DISTRICT_HARBOR'),
  districtAdjSrc('TRAIT_ADJACENT_DISTRICTS_COMMERCIALHUB_ADJACENCYGOLD', 'DISTRICT_COMMERCIAL_HUB'),
  districtAdjSrc('TRAIT_ADJACENT_DISTRICTS_THEATER_ADJACENCYCULTURE', 'DISTRICT_THEATER'),
  districtAdjSrc('TRAIT_ADJACENT_DISTRICTS_INDUSTRIALZONE_ADJACENCYPRODUCTION', 'DISTRICT_INDUSTRIAL_ZONE'),
];

const routeYieldSrc = (mid: string, y: string, inter = false): SrcMap => ({
  yield: ma(mid, 'YieldType', y),
  amount: ma(mid),
  ...(inter ? { intercontinental: ma(mid, 'Intercontinental') } : {}),
});
const INTL_ROUTE_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  routeYieldSrc('TRAIT_CULTURE_FROM_INTERNATIONAL_TRADE_ROUTES', 'YIELD_CULTURE'),
  routeYieldSrc('TRAIT_INTERNATIONAL_GOLD', 'YIELD_GOLD'),
  routeYieldSrc('TRAIT_INTERNATIONAL_FAITH', 'YIELD_FAITH'),
  routeYieldSrc('TRAIT_INTERNATIONAL_PRODUCTION', 'YIELD_PRODUCTION'),
  routeYieldSrc('TRAIT_INTERCONTINENTAL_INTERNATIONAL_GOLD', 'YIELD_GOLD', true),
  routeYieldSrc('TRAIT_INTERCONTINENTAL_INTERNATIONAL_FAITH', 'YIELD_FAITH', true),
  routeYieldSrc('TRAIT_INTERCONTINENTAL_INTERNATIONAL_PRODUCTION', 'YIELD_PRODUCTION', true),
];
const DOMESTIC_ROUTE_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  routeYieldSrc('TRAIT_DOMESTIC_GOLD', 'YIELD_GOLD'),
  routeYieldSrc('TRAIT_DOMESTIC_FAITH', 'YIELD_FAITH'),
  routeYieldSrc('TRAIT_DOMESTIC_PRODUCTION', 'YIELD_PRODUCTION'),
  routeYieldSrc('TRAIT_INTERCONTINENTAL_DOMESTIC_GOLD', 'YIELD_GOLD', true),
  routeYieldSrc('TRAIT_INTERCONTINENTAL_DOMESTIC_FAITH', 'YIELD_FAITH', true),
  routeYieldSrc('TRAIT_INTERCONTINENTAL_DOMESTIC_PRODUCTION', 'YIELD_PRODUCTION', true),
];

const ROUTE_CAPACITY_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('TRAIT_POTTERY_TRADE_ROUTE'),
    tech: mreq('TRAIT_POTTERY_TRADE_ROUTE', 'PLAYER_HAS_POTTERY_AND_CAPITAL'),
    needsCapital: mreq('TRAIT_POTTERY_TRADE_ROUTE', 'PLAYER_HAS_POTTERY_AND_CAPITAL') },
  { amount: ma('TRADE_ROUTE_GOVERNMENT_DISTRICT'), govPlaza: mreq('TRADE_ROUTE_GOVERNMENT_DISTRICT', 'CITY_HAS_GOV_DISTRICT') },
  { amount: ma('TRADE_ROUTE_GOVERNMENT_TIER_1_BUILDING'), govTier: mreq('TRADE_ROUTE_GOVERNMENT_TIER_1_BUILDING', 'CITY_HAS_TIER_1_GOV_BUILDING') },
  { amount: ma('TRADE_ROUTE_GOVERNMENT_TIER_2_BUILDING'), govTier: mreq('TRADE_ROUTE_GOVERNMENT_TIER_2_BUILDING', 'CITY_HAS_TIER_2_GOV_BUILDING') },
  { amount: ma('TRADE_ROUTE_GOVERNMENT_TIER_3_BUILDING'), govTier: mreq('TRADE_ROUTE_GOVERNMENT_TIER_3_BUILDING', 'CITY_HAS_TIER_3_GOV_BUILDING') },
  { amount: ma('TRAIT_FOREIGN_CONTINENT_TRADE_ROUTE'),
    perForeignCity: mtype('TRAIT_FOREIGN_CONTINENT_TRADE_ROUTE', 'MODIFIER_PLAYER_ADJUST_TRADE_ROUTE_CAPACITY_FOUND_FOREIGN_CITY') },
];

const COMBAT_CS_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('GORGO_POLICY_SLOT_COMBAT_BONUS'),
    per: mtype('GORGO_POLICY_SLOT_COMBAT_BONUS', 'MODIFIER_PLAYER_UNIT_ADJUST_PER_MILITARY_POLICIES_COMBAT_MODIFIER'),
    when: { derived: "'always': GORGO_POLICY_SLOT_COMBAT_BONUS carries no requirement set" } },
  { amount: ma('BARBAROSSA_COMBAT_BONUS_VS_CITY_STATES'), when: mreq('BARBAROSSA_COMBAT_BONUS_VS_CITY_STATES', 'REQUIREMENTS_OPPONENT_IS_MINOR_CIV') },
  { amount: ma('TOMYRIS_BONUS_VS_WOUNDED_UNITS'), when: mreq('TOMYRIS_BONUS_VS_WOUNDED_UNITS', 'REQUIREMENTS_OPPONENT_IS_WOUNDED') },
  { amount: ma('GENGHIS_KHAN_CAVALRY_BONUS'),
    when: { derived: "'always': GENGHIS_KHAN_CAVALRY_BONUS carries no requirement set — the CLASS gate is on the grant" },
    classes: mreq('TRAIT_COMBAT_BONUS_FOR_CAVALRY', 'REQUIREMENTS_UNIT_IS_MONGOLIAN_CAVALRY') },
  { amount: ma('HOJO_TOKIMUNE_COASTAL_COMBAT_BONUS'),
    when: mreq('HOJO_TOKIMUNE_COASTAL_COMBAT_BONUS', 'REQUIREMENTS_UNIT_ON_COAST'),
    classes: mtype('HOJO_TOKIMUNE_COASTAL_COMBAT_BONUS', 'MODIFIER_UNIT_ADJUST_COMBAT_STRENGTH',
      'the install splits land from hull by ABILITY, not by a class list') },
  { amount: ma('HOJO_TOKIMUNE_SHALLOW_WATER_COMBAT_BONUS'),
    when: mreq('HOJO_TOKIMUNE_SHALLOW_WATER_COMBAT_BONUS', 'REQUIREMENTS_UNIT_IN_SHALLOW_WATER',
      "the hull clause is SHALLOW WATER where the engine spells both halves 'onCoast'"),
    classes: mtype('HOJO_TOKIMUNE_SHALLOW_WATER_COMBAT_BONUS', 'MODIFIER_UNIT_ADJUST_COMBAT_STRENGTH') },
  { amount: ma('GREAT_TURKISH_BOMBARD_STRENGTH'), when: mreq('GREAT_TURKISH_BOMBARD_STRENGTH', 'SHELLS_REQUIREMENTS'),
    classes: mtype('TRAIT_SIEGE_ABILITY', 'MODIFIER_PLAYER_UNITS_GRANT_ABILITY') },
  { amount: ma('TRAIT_TOQUI_COMBAT_BONUS_VS_GOLDEN_AGE_CIV'), when: mreq('TRAIT_TOQUI_COMBAT_BONUS_VS_GOLDEN_AGE_CIV', 'OPPONENT_IS_IN_GOLDEN_AGE_FREE_CITY_REQUIREMENTS') },
  { amount: ma('ROOSEVELT_COMBAT_BONUS_HOME_CONTINENT'), when: mreq('ROOSEVELT_COMBAT_BONUS_HOME_CONTINENT', 'REQUIREMENTS_UNIT_ON_HOME_CONTINENT') },
  { amount: ma('PHILIP_II_COMBAT_BONUS_OTHER_RELIGION'), when: mreq('PHILIP_II_COMBAT_BONUS_OTHER_RELIGION', 'REQUIREMENTS_OPPONENT_IS_OTHER_RELIGION') },
];

const POST_KILL_HEAL_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('TOMYRIS_HEAL_AFTER_DEFEATING_UNIT') },
];
const CAPTURE_SRC: readonly (SrcMap | undefined)[] = [
  { classes: mreq('TRAIT_CAVALRY_CAPTURE_CAVALRY_MODIFIER', 'ATTACKER_OPPONENT_IS_CAVALRY_UNIT_REQUIREMENTS') },
];
const WAR_BUFF_SRC: readonly (SrcMap | undefined)[] = [
  { combat: ma('TRAIT_TERRITORIAL_WAR_COMBAT'), moves: ma('TRAIT_TERRITORIAL_WAR_MOVEMENT'),
    prodPct: { derived: 'zero — Arthashastra has no DIPLOMATIC_YIELD_MODIFIER of its own' },
    civicOverride: ma('TRAIT_TERRITORIAL_WAR_PREREQ_OVERRIDE', 'CivicType', 'CIVIC_MILITARY_TRAINING') },
  { combat: { derived: 'zero — Bannockburn has no DIPLOMATIC_COMBAT_MODIFIER of its own' },
    moves: ma('TRAIT_LIBERATION_WAR_MOVEMENT'), prodPct: ma('TRAIT_LIBERATION_WAR_PRODUCTION'),
    civicOverride: ma('TRAIT_LIBERATION_WAR_PREREQ_OVERRIDE', 'CivicType', 'CIVIC_DEFENSIVE_TACTICS') },
];
/** CIV6: the Mediterranean Colonies clause is settler-only because the
 *  ABILITY it grants is tagged CLASS_SETTLER — the install gates it on the
 *  ability, not on the modifier (`TRAIT_MEDITERRANEAN_COLONIES_GRANT_SETTLERS_ABILITY`
 *  carries no requirement set at all). */
const SETTLER_ONLY_ABILITY: Src = xml('TypeTags', 'Type=ABILITY_MEDITERRANEAN_COLONIES&Tag=CLASS_SETTLER', 'Tag',
  { expect: 'CLASS_SETTLER' });
const EMBARK_MOVE_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('MANA_EMBARKED_EXTRA_MOVEMENT') },
  { amount: ma('MEDITERRANEAN_COLONIES_EXTRA_MOVEMENT'), settlerOnly: SETTLER_ONLY_ABILITY },
];
const IGNORE_SHORES_SRC: readonly (SrcMap | undefined)[] = [
  // Norway's row carries no constant of its own: the clause IS the row
  // (KNARR_IGNORE_EMBARK_DISEMBARK_COST, `Ignore` true, on every combat unit,
  // land civilian and support unit by TypeTag).
  undefined,
  { settlerOnly: SETTLER_ONLY_ABILITY },
];
const CENTER_ADJ_SRC: readonly (SrcMap | undefined)[] = [
  { terrain: ma('TRAIT_DESERT_CITY_CENTER_FAITH', 'TerrainType', 'TERRAIN_DESERT'), yield: ma('TRAIT_DESERT_CITY_CENTER_FAITH', 'YieldType', 'YIELD_FAITH'), amount: ma('TRAIT_DESERT_CITY_CENTER_FAITH') },
  { terrain: ma('TRAIT_DESERT_CITY_CENTER_FOOD', 'TerrainType', 'TERRAIN_DESERT'), yield: ma('TRAIT_DESERT_CITY_CENTER_FOOD', 'YieldType', 'YIELD_FOOD'), amount: ma('TRAIT_DESERT_CITY_CENTER_FOOD') },
];

const gwSrc = (mid: string, obj: string, y: string): SrcMap => ({
  obj: ma(mid, 'GreatWorkObjectType', obj),
  yield: ma(mid, 'YieldType', y),
  amount: ma(mid, 'YieldChange'),
});
const GREAT_WORK_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  gwSrc('TRAIT_GREAT_WORK_FOOD_RELIC', 'GREATWORKOBJECT_RELIC', 'YIELD_FOOD'),
  gwSrc('TRAIT_GREAT_WORK_PRODUCTION_RELIC', 'GREATWORKOBJECT_RELIC', 'YIELD_PRODUCTION'),
  gwSrc('TRAIT_GREAT_WORK_FAITH_RELIC', 'GREATWORKOBJECT_RELIC', 'YIELD_FAITH'),
  gwSrc('TRAIT_GREAT_WORK_GOLD_RELIC', 'GREATWORKOBJECT_RELIC', 'YIELD_GOLD'),
  gwSrc('TRAIT_GREAT_WORK_FOOD_ARTIFACT', 'GREATWORKOBJECT_ARTIFACT', 'YIELD_FOOD'),
  gwSrc('TRAIT_GREAT_WORK_PRODUCTION_ARTIFACT', 'GREATWORKOBJECT_ARTIFACT', 'YIELD_PRODUCTION'),
  gwSrc('TRAIT_GREAT_WORK_FAITH_ARTIFACT', 'GREATWORKOBJECT_ARTIFACT', 'YIELD_FAITH'),
  gwSrc('TRAIT_GREAT_WORK_GOLD_ARTIFACT', 'GREATWORKOBJECT_ARTIFACT', 'YIELD_GOLD'),
  gwSrc('TRAIT_GREAT_WORK_FOOD_SCULPTURE', 'GREATWORKOBJECT_SCULPTURE', 'YIELD_FOOD'),
  gwSrc('TRAIT_GREAT_WORK_PRODUCTION_SCULPTURE', 'GREATWORKOBJECT_SCULPTURE', 'YIELD_PRODUCTION'),
  gwSrc('TRAIT_GREAT_WORK_FAITH_SCULPTURE', 'GREATWORKOBJECT_SCULPTURE', 'YIELD_FAITH'),
  gwSrc('TRAIT_GREAT_WORK_GOLD_SCULPTURE', 'GREATWORKOBJECT_SCULPTURE', 'YIELD_GOLD'),
];
const GPP_CLASS_SRC: readonly (SrcMap | undefined)[] = [
  { cls: ma('TRAIT_DOUBLE_ARTIST_POINTS', 'GreatPersonClassType', 'GREAT_PERSON_CLASS_ARTIST'), pct: ma('TRAIT_DOUBLE_ARTIST_POINTS') },
  { cls: ma('TRAIT_DOUBLE_MUSICIAN_POINTS', 'GreatPersonClassType', 'GREAT_PERSON_CLASS_MUSICIAN'), pct: ma('TRAIT_DOUBLE_MUSICIAN_POINTS') },
  { cls: ma('TRAIT_DOUBLE_MERCHANT_POINTS', 'GreatPersonClassType', 'GREAT_PERSON_CLASS_MERCHANT'), pct: ma('TRAIT_DOUBLE_MERCHANT_POINTS') },
];
const poweredSrc = (mid: string, y: string): SrcMap => ({ yield: ma(mid, 'YieldType', y), amount: ma(mid) });
const POWERED_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  poweredSrc('TRAIT_POWERED_BUILDINGS_MORE_CULTURE', 'YIELD_CULTURE'),
  poweredSrc('TRAIT_POWERED_BUILDINGS_MORE_GOLD', 'YIELD_GOLD'),
  poweredSrc('TRAIT_POWERED_BUILDINGS_MORE_PRODUCTION', 'YIELD_PRODUCTION'),
  poweredSrc('TRAIT_POWERED_BUILDINGS_MORE_SCIENCE', 'YIELD_SCIENCE'),
  poweredSrc('TRAIT_POWERED_BUILDINGS_MORE_FOOD', 'YIELD_FOOD'),
];
const STOCKPILE_RATE_SRC: readonly (SrcMap | undefined)[] = [
  { resource: ma('TRAIT_ACCUMULATE_MORE_COAL', 'ResourceType', 'RESOURCE_COAL'), amount: ma('TRAIT_ACCUMULATE_MORE_COAL') },
  { resource: ma('TRAIT_ACCUMULATE_MORE_IRON', 'ResourceType', 'RESOURCE_IRON'), amount: ma('TRAIT_ACCUMULATE_MORE_IRON') },
  { terrain: ma('TUNDRA_RESOURCE_EXTRACTION', 'TerrainType', 'TERRAIN_TUNDRA'), pct: ma('TUNDRA_RESOURCE_EXTRACTION') },
  { terrain: ma('SNOW_RESOURCE_EXTRACTION', 'TerrainType', 'TERRAIN_SNOW'), pct: ma('SNOW_RESOURCE_EXTRACTION') },
];
const STOCKPILE_CAP_SRC: readonly (SrcMap | undefined)[] = [
  { building: mreq('TRAIT_ADJUST_LIGHTHOUSE_STOCKPILE_CAP', 'BUILDING_IS_LIGHTHOUSE'), amount: ma('TRAIT_ADJUST_LIGHTHOUSE_STOCKPILE_CAP') },
  { building: mreq('TRAIT_ADJUST_SHIPYARD_STOCKPILE_CAP', 'BUILDING_IS_SHIPYARD'), amount: ma('TRAIT_ADJUST_SHIPYARD_STOCKPILE_CAP') },
  { building: mreq('TRAIT_ADJUST_SEAPORT_STOCKPILE_CAP', 'BUILDING_IS_SEAPORT'), amount: ma('TRAIT_ADJUST_SEAPORT_STOCKPILE_CAP') },
];
const UNIT_CHARGE_SRC: readonly (SrcMap | undefined)[] = [
  { unit: mreq('TRAIT_ADJUST_MILITARY_ENGINEER_BUILDCHARGES', 'UNIT_IS_MILITARY_ENGINEER'), amount: ma('TRAIT_ADJUST_MILITARY_ENGINEER_BUILDCHARGES') },
  { unit: mreq('TRAIT_ADJUST_BUILDER_CHARGES', 'UNIT_IS_BUILDER'), amount: ma('TRAIT_ADJUST_BUILDER_CHARGES') },
  { unit: mreq('TRAIT_ADJUST_INQUISITOR_CHARGES', 'UNIT_IS_INQUISITOR'), amount: ma('TRAIT_ADJUST_INQUISITOR_CHARGES') },
  { unit: mreq('TRAIT_MISSIONARY_SPREADS', 'UNIT_IS_MISSIONARY'), amount: ma('TRAIT_MISSIONARY_SPREADS') },
];
const TILE_COST_SRC: readonly (SrcMap | undefined)[] = [
  { terrain: ma('TUNDRA_PLOT_COST', 'TerrainType', 'TERRAIN_TUNDRA'), pct: ma('TUNDRA_PLOT_COST') },
  { terrain: ma('SNOW_PLOT_COST', 'TerrainType', 'TERRAIN_SNOW'), pct: ma('SNOW_PLOT_COST') },
];
const FARM_TERRAIN_SRC: readonly (SrcMap | undefined)[] = [
  { terrain: ma('TUNDRA_FARMS', 'TerrainType', 'TERRAIN_TUNDRA'),
    hills: { derived: "false — the install's TERRAIN_TUNDRA is the FLAT tundra; its hills are TERRAIN_TUNDRA_HILLS" } },
  { terrain: ma('TUNDRA_HILLS_FARMS', 'TerrainType', 'TERRAIN_TUNDRA_HILLS'),
    hills: { derived: "true — the install's row names TERRAIN_TUNDRA_HILLS" },
    civic: mreq('TUNDRA_HILLS_FARMS', 'PLAYER_HAS_CIVIL_ENGINEERING') },
];
const routeImpSrc = (mid: string, imp: string, y: string, side: 'Origin' | 'Destination'): SrcMap => ({
  improvement: ma(mid, 'ImprovementType', imp),
  yield: ma(mid, 'YieldType', y),
  amount: ma(mid),
  side: ma(mid, side, true),
});
const ROUTE_IMPROVEMENT_SRC: readonly (SrcMap | undefined)[] = [
  routeImpSrc('TRAIT_TRADE_FOOD_FROM_CAMPS', 'IMPROVEMENT_CAMP', 'YIELD_FOOD', 'Origin'),
  routeImpSrc('TRAIT_TRADE_GOLD_FROM_CAMPS', 'IMPROVEMENT_CAMP', 'YIELD_GOLD', 'Destination'),
  routeImpSrc('TRAIT_TRADE_FOOD_FROM_PASTURES', 'IMPROVEMENT_PASTURE', 'YIELD_FOOD', 'Origin'),
  routeImpSrc('TRAIT_TRADE_GOLD_FROM_PASTURES', 'IMPROVEMENT_PASTURE', 'YIELD_GOLD', 'Destination'),
];
const GRANT_UNIT_SRC: readonly (SrcMap | undefined)[] = [
  { unit: ma('TRAIT_POTTERY_ADD_TRADER', 'UnitType', 'UNIT_TRADER'),
    // the grant waits on the tech AND a standing capital; the engine's row
    // names the tech and the capital is where the unit lands.
    tech: mown('TRAIT_POTTERY_ADD_TRADER', 'PLAYER_HAS_POTTERY_AND_CAPITAL', 'OwnerRequirementsetId') },
  { unit: ma('UNIQUE_LEADER_ADD_SPY_UNIT', 'UnitType', 'UNIT_SPY'),
    tech: mown('UNIQUE_LEADER_ADD_SPY_UNIT', 'PLAYER_HAS_CASTLES_TECHNOLOGY_AND_CAPITAL', 'OwnerRequirementsetId') },
  { unit: ma('BUILDER_PRESETTLEMENT', 'UnitType', 'UNIT_BUILDER'), firstCity: mreq('BUILDER_PRESETTLEMENT', 'PLAYER_HAS_ONE_CITY') },
  { unit: ma('TRAIT_INTERCONTINENTAL_BUILDER', 'UnitType', 'UNIT_BUILDER'),
    foreignContinent: mreq('TRAIT_INTERCONTINENTAL_BUILDER', 'CITY_NOT_OWNER_CAPITAL_CONTINENT_REQUIREMENTS') },
  { promoClass: ma('TRAIT_FOREIGN_CONTINENT_MELEE_UNIT', 'UnitPromotionClassType', 'PROMOTION_CLASS_MELEE'),
    foreignContinent: mtype('TRAIT_FOREIGN_CONTINENT_MELEE_UNIT', 'MODIFIER_PLAYER_ADJUST_SETTLE_FOREIGN_CONTINENT_UNIT_CLASS') },
];
const SPY_CAPACITY_SRC: readonly (SrcMap | undefined)[] = [
  { tech: mreq('UNIQUE_LEADER_ADD_SPY_CAPACITY', 'PLAYER_HAS_CASTLES_TECHNOLOGY'), amount: ma('UNIQUE_LEADER_ADD_SPY_CAPACITY') },
];
const CAPITAL_SRC: readonly (SrcMap | undefined)[] = [
  { firstCityPop: ma('POPULATION_PRESETTLEMENT'), palaceHousing: ma('CAPITAL_HOUSING'), palaceAmenities: ma('CAPITAL_ENTERTAINMENT'),
    'presettleYields.science': ma('SCIENCE_PRESETTLEMENT'), 'presettleYields.culture': ma('CULTURE_PRESETTLEMENT') },
];
const happySrc = (mid: string, tier: string, y: string): SrcMap => ({
  tier: ma(mid, 'HappinessType', tier), yield: ma(mid, 'YieldType', y), pct: ma(mid),
});
const HAPPY_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  happySrc('TRAIT_SCIENCE_HAPPY', 'HAPPINESS_HAPPY', 'YIELD_SCIENCE'),
  happySrc('TRAIT_PRODUCTION_HAPPY', 'HAPPINESS_HAPPY', 'YIELD_PRODUCTION'),
  happySrc('TRAIT_SCIENCE_ECSTATIC', 'HAPPINESS_ECSTATIC', 'YIELD_SCIENCE'),
  happySrc('TRAIT_PRODUCTION_ECSTATIC', 'HAPPINESS_ECSTATIC', 'YIELD_PRODUCTION'),
];
const happyGppSrc = (mid: string, tier: string, cls: string, req: string): SrcMap => ({
  tier: ma(mid, 'HappinessType', tier), cls: ma(mid, 'GreatPersonClassType', cls),
  amount: ma(mid), district: mreq(mid, req),
});
const HAPPY_GPP_SRC: readonly (SrcMap | undefined)[] = [
  happyGppSrc('TRAIT_SCIENTIST_HAPPY', 'HAPPINESS_HAPPY', 'GREAT_PERSON_CLASS_SCIENTIST', 'PLAYER_HAS_CAMPUS_HAPPY_REQUIREMENTS'),
  happyGppSrc('TRAIT_SCIENTIST_ECSTATIC', 'HAPPINESS_ECSTATIC', 'GREAT_PERSON_CLASS_SCIENTIST', 'PLAYER_HAS_CAMPUS_ECSTATIC_REQUIREMENTS'),
  happyGppSrc('TRAIT_ENGINEER_HAPPY', 'HAPPINESS_HAPPY', 'GREAT_PERSON_CLASS_ENGINEER', 'PLAYER_HAS_INDUSTRIAL_ZONE_HAPPY_REQUIREMENTS'),
  happyGppSrc('TRAIT_ENGINEER_ECSTATIC', 'HAPPINESS_ECSTATIC', 'GREAT_PERSON_CLASS_ENGINEER', 'PLAYER_HAS_INDUSTRIAL_ZONE_ECSTATIC_REQUIREMENTS'),
];
const POLICY_SLOT_SRC: readonly (SrcMap | undefined)[] = [
  { amount: { derived: 'one slot per modifier row — TRAIT_WILDCARD_GOVERNMENT_SLOT carries a GovernmentSlotType and no Amount' } },
  { amount: { derived: 'one slot per modifier row — TRAIT_MILITARY_GOVERNMENT_SLOT carries a GovernmentSlotType and no Amount' } },
];
const POST_COMBAT_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  { yield: ma('UNIQUE_LEADER_CULTURE_KILLS', 'YieldType', 'YIELD_CULTURE'), pctOfDefeated: ma('UNIQUE_LEADER_CULTURE_KILLS', 'PercentDefeatedStrength') },
  { yield: ma('TRAIT_LEADER_FAITH_KILLS', 'YieldType', 'YIELD_FAITH'), pctOfDefeated: ma('TRAIT_LEADER_FAITH_KILLS', 'PercentDefeatedStrength') },
];
const WORK_IMPASSABLE_SRC: readonly (SrcMap | undefined)[] = [
  { mountain: ma('TRAIT_WORK_GRASS_MOUNTAIN', 'Ignore', true,
    'the install names its five mountain terrains one modifier at a time; this engine has one MOUNTAIN') },
];
const ROUTE_TERRAIN_SRC: readonly (SrcMap | undefined)[] = [
  { mountain: ma('DOMESTIC_TRADE_ROUTE_FOOD_GRASS_MOUNTAIN_ORIGIN', 'TerrainType', 'TERRAIN_GRASS_MOUNTAIN',
      'one of the install\'s five per-mountain rows'),
    yield: ma('DOMESTIC_TRADE_ROUTE_FOOD_GRASS_MOUNTAIN_ORIGIN', 'YieldType', 'YIELD_FOOD'),
    amount: ma('DOMESTIC_TRADE_ROUTE_FOOD_GRASS_MOUNTAIN_ORIGIN') },
];
const govYieldSrc = (mid: string, y: string, req: string): SrcMap => ({
  yield: ma(mid, 'YieldType', y), pct: ma(mid), founded: mreq(mid, req),
});
const GOVERNOR_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  govYieldSrc('TOQUI_CULTURE_FROM_GOVERNOR', 'YIELD_CULTURE', 'CITY_HAS_GOVERNOR_FOUNDED'),
  govYieldSrc('TOQUI_PRODUCTION_FROM_GOVERNOR', 'YIELD_PRODUCTION', 'CITY_HAS_GOVERNOR_FOUNDED'),
  govYieldSrc('TOQUI_CULTURE_GOVERNOR_NOT_FOUNDED', 'YIELD_CULTURE', 'CITY_HAS_GOVERNOR_NOT_FOUNDED'),
  govYieldSrc('TOQUI_PRODUCTION_GOVERNOR_NOT_FOUNDED', 'YIELD_PRODUCTION', 'CITY_HAS_GOVERNOR_NOT_FOUNDED'),
];
const GOVERNOR_LOYALTY_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('TOQUI_DOMESTIC_LOYALTY'),
    range: { pedia: 'the published Toqui text ("within 9 tiles"); MODIFIER_PLAYER_GOVERNORS_ADJUST_GOVERNOR_IDENTITY_PRESSURE carries no radius' } },
];
const GARRISON_LOYALTY_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('TRAIT_ISIBONGO_GARRISONIDENTITY'), formation: mreq('TRAIT_ISIBONGO_GARRISONIDENTITY', 'CITY_HAS_GARRISON_UNIT_REQUIERMENT') },
  { amount: ma('TRAIT_ISIBONGO_GARRISONFORMATIONIDENTITY'), formation: mreq('TRAIT_ISIBONGO_GARRISONFORMATIONIDENTITY', 'CITY_HAS_GARRISON_CORPS_OR_ARMY_REQUIREMENT') },
];
const FORMATION_SRC: readonly (SrcMap | undefined)[] = [
  { tier: ma('TRAIT_LAND_CORPS_EARLY', 'Corps', true), naval: ma('TRAIT_LAND_CORPS_EARLY', 'Domain', 'DOMAIN_LAND'),
    civic: ma('TRAIT_LAND_CORPS_EARLY', 'CivicType', 'CIVIC_MERCENARIES'), cs: ma('TRAIT_LAND_CORPS_COMBAT_STRENGTH') },
  { tier: ma('TRAIT_LAND_ARMIES_EARLY', 'Corps', false), naval: ma('TRAIT_LAND_ARMIES_EARLY', 'Domain', 'DOMAIN_LAND'),
    civic: ma('TRAIT_LAND_ARMIES_EARLY', 'CivicType', 'CIVIC_NATIONALISM'), cs: ma('TRAIT_LAND_ARMIES_COMBAT_STRENGTH') },
  { tier: ma('TRAIT_NAVAL_CORPS_EARLY', 'Corps', true), naval: ma('TRAIT_NAVAL_CORPS_EARLY', 'Domain', 'DOMAIN_SEA'),
    civic: ma('TRAIT_NAVAL_CORPS_EARLY', 'CivicType', 'CIVIC_MERCANTILISM') },
  { tier: ma('TRAIT_NAVAL_ARMIES_EARLY', 'Corps', false), naval: ma('TRAIT_NAVAL_ARMIES_EARLY', 'Domain', 'DOMAIN_SEA'),
    civic: ma('TRAIT_NAVAL_ARMIES_EARLY', 'CivicType', 'CIVIC_MERCANTILISM') },
];
const TERRAIN_ADJ_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  { mountain: ma('TRAIT_TERRACE_GRASS_MOUNTAIN', 'TerrainType', 'TERRAIN_GRASS_MOUNTAIN'),
    improvement: ma('TRAIT_TERRACE_GRASS_MOUNTAIN', 'ImprovementType', 'IMPROVEMENT_TERRACE_FARM'),
    yield: ma('TRAIT_TERRACE_GRASS_MOUNTAIN', 'YieldType', 'YIELD_FOOD'), amount: ma('TRAIT_TERRACE_GRASS_MOUNTAIN') },
];
const GOVERNOR_TITLE_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  { yield: ma('TRAIT_ADJUST_CITY_CULTURE_PER_GOVERNOR_TITLE_MODIFIER', 'YieldType', 'YIELD_CULTURE'), pct: ma('TRAIT_ADJUST_CITY_CULTURE_PER_GOVERNOR_TITLE_MODIFIER') },
  { yield: ma('TRAIT_ADJUST_CITY_SCIENCE_PER_GOVERNOR_TITLE_MODIFIER', 'YieldType', 'YIELD_SCIENCE'), pct: ma('TRAIT_ADJUST_CITY_SCIENCE_PER_GOVERNOR_TITLE_MODIFIER') },
];
const GPP_BUILDING_SRC: readonly (SrcMap | undefined)[] = [
  { building: mreq('TRAIT_GREAT_ENGINEER_FACTORY_MODIFIER', 'BUILDING_IS_FACTORY'),
    cls: ma('TRAIT_GREAT_ENGINEER_FACTORY_MODIFIER', 'GreatPersonClassType', 'GREAT_PERSON_CLASS_ENGINEER'),
    amount: ma('TRAIT_GREAT_ENGINEER_FACTORY_MODIFIER') },
  { building: mreq('TRAIT_GREAT_SCIENTIST_UNIVERSITY_MODIFIER', 'BUILDING_IS_UNIVERSITY'),
    cls: ma('TRAIT_GREAT_SCIENTIST_UNIVERSITY_MODIFIER', 'GreatPersonClassType', 'GREAT_PERSON_CLASS_SCIENTIST'),
    amount: ma('TRAIT_GREAT_SCIENTIST_UNIVERSITY_MODIFIER') },
];
const GP_FAVOR_SRC: readonly (SrcMap | undefined)[] = [{ amount: ma('TRAIT_GREATPERSON_FAVOR_MODIFIER') }];
const START_TECH_SRC: readonly (SrcMap | undefined)[] = [
  { tech: ma('TRAIT_MAORI_MANA_SAILING', 'TechType', 'TECH_SAILING') },
  { tech: ma('TRAIT_MAORI_MANA_SHIPBUILDING', 'TechType', 'TECH_SHIPBUILDING') },
];
const SEAT_BAN_SRC: readonly (SrcMap | undefined)[] = [
  { ban: ma('TRAIT_MAORI_PREVENT_HARVEST', 'Enable', true) },
  { ban: xml('ExcludedGreatPersonClasses', 'TraitType=TRAIT_CIVILIZATION_MAORI_MANA&GreatPersonClassType=GREAT_PERSON_CLASS_WRITER',
      'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_WRITER' }) },
  { ban: xml('ExcludedDistricts', 'TraitType=TRAIT_LEADER_RELIGIOUS_CONVERT&DistrictType=DISTRICT_HOLY_SITE',
      'DistrictType', { expect: 'DISTRICT_HOLY_SITE' }) },
  { ban: xml('ExcludedGreatPersonClasses', 'TraitType=TRAIT_LEADER_RELIGIOUS_CONVERT&GreatPersonClassType=GREAT_PERSON_CLASS_PROPHET',
      'GreatPersonClassType', { expect: 'GREAT_PERSON_CLASS_PROPHET' }) },
  { ban: { derived: 'a consequence of the Great Prophet exclusion above — the install writes no separate "may not found a religion" row' } },
];
const WORSHIP_SRC: readonly (SrcMap | undefined)[] = [
  { costPct: { derived: '100 - Discount — the install writes the DISCOUNT (90)',
      inputs: [ma('TRAIT_RELIGIOUS_BUILDING_DISCOUNT', 'Discount')] },
    yieldPct: ma('TRAIT_RELIGIOUS_BUILDING_MULTIPLIER_FAITH', 'Multiplier') },
];
const OCEAN_ACCESS_SRC: readonly (SrcMap | undefined)[] = [
  { tech: mreq('TRAIT_EARLY_OCEAN_NAVIGATION', 'PLAYER_HAS_SHIPBUILDING_TECH') },
  undefined,
];
const DISTRICT_UNIT_SRC: readonly (SrcMap | undefined)[] = [
  { district: ma('TRAIT_FREE_APOSTLE_FINISH_THEATER_DISTRICT', 'DistrictType', 'DISTRICT_THEATER'),
    unit: ma('TRAIT_FREE_APOSTLE_FINISH_THEATER_DISTRICT', 'UnitType', 'UNIT_APOSTLE') },
];
const EXTRA_UNIT_COPY_SRC: readonly (SrcMap | undefined)[] = [
  { cls: ma('TRAIT_EXTRALIGHTCAVALRY', 'Tag', 'CLASS_LIGHT_CAVALRY'), amount: ma('TRAIT_EXTRALIGHTCAVALRY') },
  { unit: ma('TRAIT_EXTRASAKAHORSEARCHER', 'UnitType', 'UNIT_SCYTHIAN_HORSE_ARCHER'), amount: ma('TRAIT_EXTRASAKAHORSEARCHER'),
    cls: { derived: "the empty string — TRAIT_EXTRASAKAHORSEARCHER names a UnitType and carries no Tag, so this row copies one CHASSIS and no class" } },
];
const CONQUEST_POP_SRC: readonly (SrcMap | undefined)[] = [{ keepPct: ma('TRAIT_CAPTURED_NO_POPULATION_LOSS', 'Percent') }];
const NOT_FOUNDED_SRC: readonly (SrcMap | undefined)[] = [
  { channel: mtype('TRAIT_CAPTURED_AMENITY', 'MODIFIER_PLAYER_CITIES_ADJUST_TRAIT_AMENITY'), amount: ma('TRAIT_CAPTURED_AMENITY') },
  { channel: mtype('TRAIT_CAPTURED_LOYALTY', 'MODIFIER_PLAYER_CITIES_ADJUST_IDENTITY_PER_TURN'), amount: ma('TRAIT_CAPTURED_LOYALTY') },
];
const EXTRA_DISTRICT_SRC: readonly (SrcMap | undefined)[] = [{ amount: ma('TRAIT_EXTRA_DISTRICT_EACH_CITY') }];
const CITY_TILES_SRC: readonly (SrcMap | undefined)[] = [{ amount: ma('TRAIT_INCREASED_TILES') }];
const BOOST_PCT_SRC: readonly (SrcMap | undefined)[] = [
  { tech: mtype('TRAIT_TECHNOLOGY_BOOST', 'MODIFIER_PLAYER_ADJUST_TECHNOLOGY_BOOST'), points: ma('TRAIT_TECHNOLOGY_BOOST') },
  { tech: mtype('TRAIT_CIVIC_BOOST', 'MODIFIER_PLAYER_ADJUST_CIVIC_BOOST'), points: ma('TRAIT_CIVIC_BOOST') },
];
const BUILDING_PREREQ_SRC: readonly (SrcMap | undefined)[] = [
  { building: xml('BuildingReplaces', 'CivUniqueBuildingType=BUILDING_MADRASA', 'ReplacesBuildingType', { expect: 'BUILDING_UNIVERSITY' }),
    civic: xml('Buildings', 'BuildingType=BUILDING_MADRASA', 'PrereqCivic', { expect: 'CIVIC_THEOLOGY' }) },
];
const DISTRICT_PREREQ_SRC: readonly (SrcMap | undefined)[] = [
  { district: ma('TRAIT_CANAL_UNLOCK_MASONRY', 'DistrictType', 'DISTRICT_CANAL'),
    tech: ma('TRAIT_CANAL_UNLOCK_MASONRY', 'TechType', 'TECH_MASONRY') },
  { district: xml('DistrictReplaces', 'CivUniqueDistrictType=DISTRICT_MBANZA', 'ReplacesDistrictType', { expect: 'DISTRICT_NEIGHBORHOOD' }),
    civic: xml('Districts', 'DistrictType=DISTRICT_MBANZA', 'PrereqCivic', { expect: 'CIVIC_GUILDS' }) },
];
const WAR_WEARINESS_SRC: readonly (SrcMap | undefined)[] = [{ enemyPct: ma('TRAIT_INCREASE_ENEMY_WAR_WEARINESS') }];
const PEACEFUL_FOUNDER_SRC: readonly (SrcMap | undefined)[] = [{ amount: ma('TRAIT_FAITH_PEACEFUL_FOUNDERS') }];
const YIELD_PER_SUZERAIN_SRC: readonly (SrcMap | undefined)[] = [
  { yield: ma('TRAIT_CULTURE_PER_CITY_STATE_TRIBUTARY', 'YieldType', 'YIELD_CULTURE'), pct: ma('TRAIT_CULTURE_PER_CITY_STATE_TRIBUTARY') },
];
const GOVERNOR_TITLE_GRANT_SRC: readonly (SrcMap | undefined)[] = [
  { tech: mreq('SULEIMAN_GOVERNOR_POINTS', 'PLAYER_HAS_GUNPOWDER_TECH'), amount: ma('SULEIMAN_GOVERNOR_POINTS', 'Delta') },
];
const GP_REFUND_SRC: readonly (SrcMap | undefined)[] = [{ pct: ma('TRAIT_GREAT_PERSON_REFUND') }];
const EVICT_PCT_SRC: readonly (SrcMap | undefined)[] = [{ points: ma('TRAIT_INQUISITORS_FULL_EVICT') }];
const RELIGION_AMENITY_SRC: readonly (SrcMap | undefined)[] = [
  { followers: ma('TRAIT_AMENITIES_FOR_MIN_FOLLOWERS', 'Followers'), amenities: ma('TRAIT_AMENITIES_FOR_MIN_FOLLOWERS', 'Amenities') },
];
const FEATURE_APPEAL_SRC: readonly (SrcMap | undefined)[] = [
  { feature: ma('TRAIT_AMAZON_RAINFOREST_EXTRA_APPEAL', 'FeatureType', 'FEATURE_JUNGLE'), amount: ma('TRAIT_AMAZON_RAINFOREST_EXTRA_APPEAL') },
];
const ROUTE_PRESSURE_SRC: readonly (SrcMap | undefined)[] = [
  { origin: ma('TRAIT_ORIGIN_DESTINATION_RELIGIOUS_PRESSURE', 'Origin'),
    destination: ma('TRAIT_ORIGIN_DESTINATION_RELIGIOUS_PRESSURE', 'Destination'),
    pct: ma('TRAIT_ORIGIN_DESTINATION_RELIGIOUS_PRESSURE') },
];
const FOREIGN_FOLLOWER_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  { yield: ma('TRAIT_SCIENCE_PER_FOREIGN_CITY_FOLLOWING_RELIGION', 'YieldType', 'YIELD_SCIENCE'),
    amount: ma('TRAIT_SCIENCE_PER_FOREIGN_CITY_FOLLOWING_RELIGION'),
    per: ma('TRAIT_SCIENCE_PER_FOREIGN_CITY_FOLLOWING_RELIGION', 'PerXItems') },
];
const GP_GUARANTEE_SRC: readonly (SrcMap | undefined)[] = [
  { cls: ma('TRAIT_GUARANTEE_ONE_PROPHET', 'GreatPersonClassType', 'GREAT_PERSON_CLASS_PROPHET') },
];
const FAITH_PURCHASE_DISTRICT_SRC: readonly (SrcMap | undefined)[] = [
  { district: ma('TRAIT_PURCHASE_COMMERCIAL_HUB_BUILDINGS_FAITH', 'DistrictType', 'DISTRICT_COMMERCIAL_HUB') },
];
const START_BOOST_SRC: readonly (SrcMap | undefined)[] = [
  { tech: ma('TRAIT_FREE_TECH_BOOST_WRITING', 'TechType', 'TECH_WRITING') },
];
const POST_COMBAT_LOYALTY_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('TRAIT_DIMINISH_LOYALTY_IN_ENEMY_CITY'), goldenExtra: ma('TRAIT_DIMINISH_LOYALTY_IN_ENEMY_CITY', 'AdditionalGoldenAge') },
];
const LEVY_SRC: readonly (SrcMap | undefined)[] = [
  { upgradeDiscountPct: ma('LEVY_UNITUPGRADEDISCOUNT'), envoys: ma('LEVY_MILITARY_TWO_FREE_ENVOYS'),
    levyMoves: ma('RAVEN_LEVY_MOVEMENT'), levyCombat: ma('RAVEN_LEVY_COMBAT') },
];
const DOMESTIC_ROUTE_LOYALTY_SRC: readonly (SrcMap | undefined)[] = [{ amount: ma('TRAIT_IDENTITY_FROM_DOMESTIC_TRADE_ROUTES') }];
const INCOMING_ROUTE_YIELD_SRC: readonly (SrcMap | undefined)[] = [
  { yield: ma('TRAIT_CULTURE_FROM_INCOMING_TRADE_ROUTES', 'YieldType', 'YIELD_CULTURE'), amount: ma('TRAIT_CULTURE_FROM_INCOMING_TRADE_ROUTES') },
];
const WONDER_ERA_PROD_SRC: readonly (SrcMap | undefined)[] = [
  { startEra: ma('TRAIT_WONDER_MEDIAVALINDUSTRIAL_PRODUCTION', 'StartEra', 'ERA_MEDIEVAL'),
    endEra: ma('TRAIT_WONDER_MEDIAVALINDUSTRIAL_PRODUCTION', 'EndEra', 'ERA_INDUSTRIAL'),
    pct: ma('TRAIT_WONDER_MEDIAVALINDUSTRIAL_PRODUCTION') },
];
const WONDER_TOURISM_SRC: readonly (SrcMap | undefined)[] = [
  { pct: { derived: 'ScalingFactor - 100 — the install writes 200 (double), the catalog the ADDED percentage',
      inputs: [ma('TRAIT_WONDER_DOUBLETOURISM', 'ScalingFactor')] } },
];
const RIVER_CROSS_PROD_SRC: readonly (SrcMap | undefined)[] = [
  { pct: ma('TRAIT_CITY_ADJACENT_RIVER_DISTRICT_PRODUCTION') },
  { pct: ma('TRAIT_CITY_ADJACENT_RIVER_BUILDING_PRODUCTION') },
];
const DIPLO_VIS_SRC: readonly (SrcMap | undefined)[] = [
  { postLevels: ma('TRAIT_TRADING_POST_DIPLO_VISIBILITY'),
    flatLevels: { derived: 'zero — Ortoo grants its level from a TRADING POST (Source=SOURCE_TRADING_POST_TRAIT), not flat' },
    csPerLevel: ma('TRAIT_EACH_DIPLO_VISIBILITY_COMBAT_MODIFIER') },
  { postLevels: { derived: 'zero — the Flying Squadron level is flat, not from a trading post' },
    flatLevels: ma('UNIQUE_LEADER_ADD_VISIBILITY'),
    csPerLevel: { derived: 'zero — the Flying Squadron adds no per-level combat step' } },
];
const WAR_BAN_SRC: readonly (SrcMap | undefined)[] = [
  { ban: ma('TRAIT_NO_SUPRISE_WAR_FOR_CANADA', 'DiplomaticActionType', 'DIPLOACTION_DECLARE_SURPRISE_WAR') },
  // the OTHER side of the same ban: the install hangs it on TRAIT_LEADER_MAJOR_CIV
  // — every major leader carries "you may not surprise-war CIVILIZATION_CANADA".
  { ban: ma('TRAIT_NO_SUPRISE_WAR_ON_CANADA', 'DiplomaticActionType', 'DIPLOACTION_DECLARE_SURPRISE_WAR',
    'MODIFIER_PLAYER_ADJUST_BANNED_DIPLOMATIC_ACTION_SPECIFIC_CIVILIZATION, CivilizationType CIVILIZATION_CANADA, on TRAIT_LEADER_MAJOR_CIV') },
  // UNSOURCED: "cannot declare war on City-States". The install's only two
  // BANNED_DIPLOMATIC_ACTION modifiers are the surprise-war pair above — no row
  // bans DIPLOACTION_DECLARE_WAR_MINOR_CIV for anyone, so this half of the
  // published Faces of Peace text has no table to read.
  undefined,
];
const TOURISM_FAVOR_SRC: readonly (SrcMap | undefined)[] = [
  { perTourism: ma('TRAIT_TOURISM_INTO_FAVOR', 'Tourism'), favor: ma('TRAIT_TOURISM_INTO_FAVOR', 'Favor') },
];
const EMERGENCY_FAVOR_SRC: readonly (SrcMap | undefined)[] = [{ pct: ma('TRAIT_EMERGENCY_FAVOR_MODIFIER') }];
const GOLDEN_DEDICATION_SRC: readonly (SrcMap | undefined)[] = [{ count: ma('TRAIT_ALLOW_QUESTS_IN_GOLDEN_AGE') }];
const INTL_ROUTE_TERRAIN_SRC: readonly (SrcMap | undefined)[] = [
  { terrain: ma('TRADE_ROUTE_GOLD_DESERT_ORIGIN', 'TerrainType', 'TERRAIN_DESERT'),
    flatOnly: ma('TRADE_ROUTE_GOLD_DESERT_ORIGIN', 'TerrainType', 'TERRAIN_DESERT',
      "the install names FLAT desert; TERRAIN_DESERT_HILLS is a terrain of its own and gets no row"),
    yield: ma('TRADE_ROUTE_GOLD_DESERT_ORIGIN', 'YieldType', 'YIELD_GOLD'),
    amount: ma('TRADE_ROUTE_GOLD_DESERT_ORIGIN') },
];
const GOLDEN_ROUTE_CAPACITY_SRC: readonly (SrcMap | undefined)[] = [{ amount: ma('GOLDEN_AGE_TRADE_ROUTE') }];
const PROGRESS_TRADE_SRC: readonly (SrcMap | undefined)[] = [
  { per: ma('TRAIT_ADJUST_PROGRESS_DIFF_TRADE_BONUS', 'TechCivicsPerYield') },
];
const UNIT_POP_COST_SRC: readonly (SrcMap | undefined)[] = [
  { unit: ma('JANISSARY_LOSE_POPULATION_IN_FOUNDED_CITIES', 'UnitType', 'UNIT_SULEIMAN_JANISSARY'),
    amount: ma('JANISSARY_LOSE_POPULATION_IN_FOUNDED_CITIES'),
    foundedOnly: mreq('JANISSARY_LOSE_POPULATION_IN_FOUNDED_CITIES', 'JANISSARY_CITY_FOUNDED') },
];
const SLOT_CONVERT_SRC: readonly (SrcMap | undefined)[] = [
  { from: ma('TRAIT_ALL_DIPLO_POLICY_ARE_WILDCARDS', 'ReplacedGovernmentSlotType', 'SLOT_DIPLOMATIC'),
    to: ma('TRAIT_ALL_DIPLO_POLICY_ARE_WILDCARDS', 'AddedGovernmentSlotType', 'SLOT_WILDCARD') },
];
const SLOT_FAVOR_SRC: readonly (SrcMap | undefined)[] = [{ favor: ma('TRAIT_WILD_CARD_FAVOR') }];
const PLAZA_DISTRICT_PROD_SRC: readonly (SrcMap | undefined)[] = [{ pct: ma('PRODUCTION_GOVERNMENT_DISTRICT') }];
const greatWorkLoyaltySrc = (): SrcMap => ({
  amount: { derived: "the NEGATION of the install's Amount — IDENTITY_NEARBY_GREATWORKS writes 1 with ForeignCities true, and the foreign city LOSES it",
    inputs: [ma('IDENTITY_NEARBY_GREATWORKS')] },
  range: { pedia: 'the published Eleanor text ("within 9 tiles"); the install\'s modifier carries no radius' },
});
const GREAT_WORK_LOYALTY_SRC: readonly (SrcMap | undefined)[] = [greatWorkLoyaltySrc(), greatWorkLoyaltySrc()];
const GOVERNOR_XP_SRC: readonly (SrcMap | undefined)[] = [
  // the XP pair writes its clause on the OWNER (the city), where the Culture
  // and Production pair above writes the same clause on the SUBJECT.
  { pct: ma('TOQUI_GOVERNOR_UNIT_EXPERIENCE'), founded: mown('TOQUI_UNIT_XP_FROM_GOVERNOR_MODIFIER', 'CITY_HAS_GOVERNOR_FOUNDED') },
  { pct: ma('TOQUI_GOVERNOR_UNIT_EXPERIENCE_NOT_FOUNDED'), founded: mown('TOQUI_UNIT_XP_FROM_GOVERNOR_MODIFIER_NOT_FOUNDED', 'CITY_HAS_GOVERNOR_NOT_FOUNDED') },
];
const PARK_APPEAL_SRC: readonly (SrcMap | undefined)[] = [
  { amount: ma('TRAIT_NATIONAL_PARK_APPEAL_BONUS', 'Amount', undefined,
    "the install hangs it on TRAIT_LEADER_ANTIQUES_AND_PARKS — Roosevelt's other persona — under CITY_HAS_NATIONAL_PARK_REQUREMENTS") },
];
const TRADE_GAIN_TILE_SRC: readonly (SrcMap | undefined)[] = [
  { radius: ma('TRAIT_TRADE_GAIN_TILES_EN_ROUTE', 'GainTileRadius') },
];
const SPY_PROMO_SRC: readonly (SrcMap | undefined)[] = [
  { promotions: { derived: "one — the install's Amount is -1, its own marker for 'a free promotion', not an experience figure",
    inputs: [ma('UNIQUE_LEADER_SPIES_START_PROMOTED')] } },
];
const CULTURE_BOMB_SRC: readonly (SrcMap | undefined)[] = [
  { improvement: ma('TRAIT_MAORI_FISHING_BOAT_CULTURE_BOMB', 'ImprovementType', 'IMPROVEMENT_FISHING_BOATS') },
  { district: ma('TRAIT_HARBOR_CULTURE_BOMB', 'DistrictType', 'DISTRICT_HARBOR') },
];
const WONDER_CHARGE_SRC: readonly (SrcMap | undefined)[] = [
  { pct: ma('TRAIT_BUILDER_WONDER_PERCENT'),
    startEra: { pedia: "the leader's published text (Ancient and Classical wonders); TRAIT_BUILDER_WONDER_PERCENT carries no requirement set" },
    endEra: { pedia: "the leader's published text (Ancient and Classical wonders); TRAIT_BUILDER_WONDER_PERCENT carries no requirement set" } },
];
const WONDER_ERA_BOOST_SRC: readonly (SrcMap | undefined)[] = [
  { techs: ma('TRAIT_TECHNOLOGY_BOOST_WONDER_ERA'), civics: ma('TRAIT_CIVIC_BOOST_WONDER_ERA') },
];

/** CIV6 (Iteru, TRAIT_RIVER_FASTER_BUILDTIME_DISTRICT / _WONDER): "+15%
 *  Production towards Districts and Wonders built next to a River." */
export const ITERU_RIVER_PROD_MULT = srcConst('iteruProdMult', 1.15, {
  derived: '1 + Amount/100 — the install writes the PERCENT, once for the district clause and once for the wonder one',
  inputs: [ma('TRAIT_RIVER_FASTER_BUILDTIME_DISTRICT'), ma('TRAIT_RIVER_FASTER_BUILDTIME_WONDER')],
});

/** CIV6 (Knarr, MELEE_SHIP_HEAL_NEUTRAL): naval melee units heal +10 in
 *  neutral territory. */
export const KNARR_NAVAL_MELEE_NEUTRAL_HEAL = srcConst('knarrNeutralHeal', 10,
  ma('MELEE_SHIP_HEAL_NEUTRAL', 'Amount', undefined,
    'the clause is the ability ABILITY_HEAL_NEUTRAL_TERRITORY, tagged CLASS_NAVAL_MELEE, and the modifier\'s `Type` is NEUTRAL'));

/** CIV6 (Epic Quest): "Levying units from a city-state costs 50% less Gold." */
export const EPIC_QUEST_LEVY_MULT = srcConst('epicQuestLevyMult', 0.5, {
  derived: '1 - Percent/100 — the install writes the DISCOUNT (50) on TRAIT_LEVY_DISCOUNT, the catalog what is left to pay',
  inputs: [ma('TRAIT_LEVY_DISCOUNT', 'Percent')],
});

/** CIV6 (All Roads Lead to Rome): "Trade Routes generate +1 Gold for passing
 *  through Trading Posts in your own cities." */
export const ROME_OWN_POST_GOLD = srcConst('romeOwnPostGold', 1,
  ma('TRAIT_GOLD_FROM_DOMESTIC_TRADING_POSTS'));

/** CIV6 (Mediterranean's Bride): "Your Trade Routes to other civilizations
 *  provide +4 Gold for Egypt. Other civilizations' Trade Routes to Egypt
 *  provide +2 Food for them and +2 Gold for Egypt. Trading with Allies earns
 *  twice as many bonus Alliance Points." */
export const CLEOPATRA_INTL_ROUTE_GOLD = srcConst('cleopatraIntlGold', 4,
  ma('TRAIT_INTERNATIONAL_TRADE_GAIN_GOLD'));
export const CLEOPATRA_INCOMING_ROUTE_FOOD = srcConst('cleopatraIncomingFood', 2,
  ma('TRAIT_INCOMING_TRADE_OFFER_FOOD'));
export const CLEOPATRA_INCOMING_ROUTE_GOLD = srcConst('cleopatraIncomingGold', 2,
  ma('TRAIT_INCOMING_TRADE_GAIN_GOLD'));
export const CLEOPATRA_TRADE_QP_MULT = srcConst('cleopatraTradeQpMult', 2, {
  derived: '1 + Amount — the install ADDS one Alliance Point per trade to the base one, which is what "twice as many" comes to',
  inputs: [ma('TRAIT_ALLIANCE_POINTS_FROM_TRADE')],
});

/** CIV6 (Thunderbolt of the North): "+50% Production toward all naval melee
 *  units. Receive Science from pillaging and coastal raiding Mines in
 *  addition to Gold. Pillaging or coastal raiding Quarries, Pastures,
 *  Plantations, and Camps also yields Culture" — 15 each
 *  (EFFECT_ADJUST_ADDITIONAL_PILLAGING), scaled like the row's own lump. */
export const HARDRADA_NAVAL_MELEE_PROD_MULT = srcConst('hardradaNavalMeleeProdMult', 1.5, {
  derived: '1 + Amount/100 — the install writes 50 once per ERA (TRAIT_ANCIENT_NAVAL_MELEE_PRODUCTION and its eight siblings), all the same',
  inputs: [ma('TRAIT_ANCIENT_NAVAL_MELEE_PRODUCTION')],
});
export const HARDRADA_PILLAGE: readonly { improvement: ImprovementId; kind: 'science' | 'culture'; amount: number }[] = withSrc([
  { improvement: 'MINE', kind: 'science', amount: 15 },
  { improvement: 'QUARRY', kind: 'culture', amount: 15 },
  { improvement: 'PASTURE', kind: 'culture', amount: 15 },
  { improvement: 'PLANTATION', kind: 'culture', amount: 15 },
  { improvement: 'CAMP', kind: 'culture', amount: 15 },
], HARDRADA_PILLAGE_SRC);

/** CIV6 (Adventures of Enkidu): "When at war with a common foe, they and
 *  their allies share pillage rewards and share combat experience gains if
 *  within 5 tiles. Their Alliances gain Alliance Points for being at war
 *  with a common foe. +5 Combat Strength against units of civilizations
 *  their allies are at war with." Two points a turn is eight quarter-points. */
export const ENKIDU_WAR_CS = srcConst('enkiduWarCs', 5,
  ma('TRAIT_ADJUST_ALLIANCE_ADJUST_COMBAT_STRENGTH', 'Amount', undefined,
    'the install attaches it to the ALLIANCE (TRAIT_ATTACH_ALLIANCE_COMBAT_ADJUSTMENT) under ALLIES_AT_WAR_WITH_TARGET_REQUIREMENTS'));
export const ENKIDU_COMMON_FOE_QP = srcConst('enkiduCommonFoeQp', 8, {
  derived: '4 x Amount — this engine banks Alliance Points in QUARTER points and the install writes two a turn',
  inputs: [ma('TRAIT_ALLIANCE_POINTS_FROM_COMMON_FOE')],
});
export const ENKIDU_SHARE_RANGE = srcConst('enkiduShareRange', 5,
  ma('TRAIT_ADJUST_JOINTWAR_EXPERIENCE', 'Range'));
/** CIV6 (Adventures of Enkidu, `TRAIT_ADJUST_ALLIED_WAR_DISCOUNT` /
 *  `MODIFIER_PLAYER_ADJUST_ALLIED_WAR_DISCOUNT`, `Discount` 150): "May
 *  declare war on anyone at war with their allies without warmonger
 *  penalties." The grievance the DECLARATION owes its target, waived by this
 *  much — 150 against `GRIEVANCE_WAR_BASE` 100 covers a Surprise war's whole
 *  150 and more than a Formal war's 100, which is what "without" means. */
export const ENKIDU_ALLIED_WAR_DISCOUNT = srcConst('enkiduAlliedWarDiscount', 150,
  ma('TRAIT_ADJUST_ALLIED_WAR_DISCOUNT', 'Discount'));

/**
 * CIV6 (EFFECT_ADJUST_PLOT_YIELD): a civilization's or leader's flat yield on
 * every plot the row's requirement set admits — off the install's
 * TraitModifiers, one row per modifier. `hills` is the XML's own split
 * (TERRAIN_TUNDRA is the flat tundra, TERRAIN_TUNDRA_HILLS the hills); a
 * `civic` row waits on the seat's civic, an `eraAtLeast` row on the WORLD
 * era (REQUIREMENT_GAME_ERA_ATLEAST_EXPANSION). Both engines pay these
 * inside the tile walk, so an impassable plot (a mountain) pays nothing
 * until the seat can work it.
 */
export interface PlotYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
  terrain?: TerrainId;
  hills?: boolean;
  improvement?: ImprovementId;
  feature?: FeatureId;
  anyImprovement?: boolean;
  civic?: string;
  mountain?: boolean;
  eraAtLeast?: Era;
}

export const PLOT_YIELD_ROWS: readonly PlotYieldRow[] = withSrc([
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'TUNDRA', improvement: 'MINE', hills: false },
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'TUNDRA', improvement: 'MINE', hills: true },
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'SNOW', improvement: 'MINE', hills: false },
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'SNOW', improvement: 'MINE', hills: true },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'TUNDRA', improvement: 'CAMP', hills: false },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'TUNDRA', improvement: 'CAMP', hills: true },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'SNOW', improvement: 'CAMP', hills: false },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'SNOW', improvement: 'CAMP', hills: true },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'TUNDRA', improvement: 'FARM', hills: false },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'TUNDRA', improvement: 'FARM', hills: true },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'SNOW', improvement: 'FARM', hills: false },
  { leader: 'LAURIER', yield: 'food', amount: 2, terrain: 'SNOW', improvement: 'FARM', hills: true },
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'TUNDRA', improvement: 'LUMBER_MILL', hills: false },
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'TUNDRA', improvement: 'LUMBER_MILL', hills: true },
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'SNOW', improvement: 'LUMBER_MILL', hills: false },
  { leader: 'LAURIER', yield: 'production', amount: 2, terrain: 'SNOW', improvement: 'LUMBER_MILL', hills: true },
  { civ: 'INCA', yield: 'production', amount: 2, mountain: true },
  { civ: 'INCA', yield: 'production', amount: 1, eraAtLeast: 'Industrial', mountain: true },
  { civ: 'MALI', yield: 'production', amount: -1, improvement: 'MINE' },
  { civ: 'MALI', yield: 'gold', amount: 4, improvement: 'MINE' },
  { civ: 'MAORI', yield: 'production', amount: 1, feature: 'WOODS', anyImprovement: true },
  { civ: 'MAORI', yield: 'production', amount: 1, feature: 'RAINFOREST', anyImprovement: true },
  { civ: 'MAORI', yield: 'production', amount: 1, feature: 'RAINFOREST', civic: 'MERCANTILISM', anyImprovement: true },
  { civ: 'MAORI', yield: 'production', amount: 1, feature: 'WOODS', civic: 'MERCANTILISM', anyImprovement: true },
  { civ: 'MAORI', yield: 'production', amount: 2, feature: 'RAINFOREST', civic: 'CONSERVATION', anyImprovement: true },
  { civ: 'MAORI', yield: 'production', amount: 2, feature: 'WOODS', civic: 'CONSERVATION', anyImprovement: true },
  { civ: 'MAORI', yield: 'food', amount: 1, improvement: 'FISHING_BOATS' },
  { civ: 'RUSSIA', yield: 'faith', amount: 1, terrain: 'TUNDRA', hills: false },
  { civ: 'RUSSIA', yield: 'production', amount: 1, terrain: 'TUNDRA', hills: false },
  { civ: 'RUSSIA', yield: 'faith', amount: 1, terrain: 'TUNDRA', hills: true },
  { civ: 'RUSSIA', yield: 'production', amount: 1, terrain: 'TUNDRA', hills: true },
], PLOT_YIELD_SRC);

/**
 * CIV6 (EFFECT_ADJUST_BUILDING_PRODUCTION / EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION):
 * a percentage on the city's Production toward an item — a named building,
 * every building of a district, or every unit of a promotion class (the
 * Ottomans' Siege line, every era). Multiplicative on the seat's stack, the
 * way the Iteru and Thunderbolt clauses are.
 */
export interface ProdMultRow {
  civ?: CivId;
  leader?: LeaderId;
  /** one building; or every building of a district */
  building?: string;
  district?: DistrictId;
  /** every unit of a promotion class; or one unit type */
  promoClass?: string;
  unit?: string;
  /** a DISTRICT item */
  districtItem?: DistrictId;
  /** CIV6 (Treasure Fleet): the row pays only in a city that is NOT on the
   *  seat's home continent — its ORIGINAL capital's landmass. */
  offHomeContinent?: boolean;
  /** every item of a queue kind */
  every?: 'building' | 'unit' | 'district';
  pct: number;
}
export const PROD_MULT_ROWS: readonly ProdMultRow[] = withSrc([
  // CIV6 (Treasure Fleet): "Cities not on your original Capital's continent
  // receive +25% Production towards districts".
  { civ: 'SPAIN', every: 'district', pct: 25, offHomeContinent: true },
  // CIV6 (Divine Wind, EFFECT_ADJUST_DISTRICT_PRODUCTION): "Builds Encampment,
  // Holy Site and Theater Square districts in half the time."
  { leader: 'HOJO', districtItem: 'ENCAMPMENT', pct: 100 },
  { leader: 'HOJO', districtItem: 'HOLY_SITE', pct: 100 },
  { leader: 'HOJO', districtItem: 'THEATER_SQUARE', pct: 100 },
  // CIV6 (Grote Rivieren): "+50% Production toward the Dam district" (the
  // Flood Barrier building waits on its row)
  { civ: 'NETHERLANDS', districtItem: 'DAM', pct: 50 },
  // CIV6 (Songs of the Jeli, EFFECT_ADJUST_ALL_BUILDING/UNIT_PRODUCTION_MODIFIER):
  // "-30% Production toward constructing buildings or training units."
  { civ: 'MALI', every: 'building', pct: -30 },
  { civ: 'MALI', every: 'unit', pct: -30 },
  // CIV6 (Workshop of the World, EFFECT_ADJUST_UNIT_PRODUCTION): "+100%
  // Production towards Military Engineers."
  { civ: 'ENGLAND', unit: 'MILITARY_ENGINEER', pct: 100 },
  // CIV6 (Workshop of the World): "+20% Production towards Industrial Zone buildings."
  { civ: 'ENGLAND', district: 'INDUSTRIAL_ZONE', pct: 20 },
  // CIV6 (Strength in Unity): "+50% Production towards walls" — the three tiers
  { civ: 'GEORGIA', building: 'ANCIENT_WALLS', pct: 50 },
  { civ: 'GEORGIA', building: 'MEDIEVAL_WALLS', pct: 50 },
  { civ: 'GEORGIA', building: 'RENAISSANCE_WALLS', pct: 50 },
  // CIV6 (Grote Rivieren): "+50% Production towards the Flood Barrier."
  { civ: 'NETHERLANDS', building: 'FLOOD_BARRIER', pct: 50 },
  // CIV6 (Great Turkish Bombard): "+50% Production towards siege units."
  { civ: 'OTTOMAN', promoClass: 'SIEGE', pct: 50 },
], PROD_MULT_SRC);

/** CIV6 (EFFECT_DISTRICT_ADJACENCY, Meiji Restoration): "+1 standard adjacency
 *  bonus to all districts from adjacent districts" — the district's own yield,
 *  +amount per adjacent district. */
export interface DistrictAdjRow {
  civ?: CivId;
  leader?: LeaderId;
  district: DistrictId;
  amount: number;
  /** per adjacent DISTRICT (the default), the district's own RIVER, or per
   *  adjacent tile of a FEATURE */
  source?: 'RIVER' | 'RAINFOREST';
}
export const DISTRICT_ADJ_ROWS: readonly DistrictAdjRow[] = withSrc([
  // CIV6 (Amazon, EFFECT_FEATURE_ADJACENCY): "Rainforest tiles provide +1
  // adjacency bonus for Campus, Commercial Hub, Holy Site, and Theater Square
  // districts" — the install's FEATURE_JUNGLE is this engine's RAINFOREST.
  { civ: 'BRAZIL', district: 'CAMPUS', amount: 1, source: 'RAINFOREST' },
  { civ: 'BRAZIL', district: 'COMMERCIAL_HUB', amount: 1, source: 'RAINFOREST' },
  { civ: 'BRAZIL', district: 'HOLY_SITE', amount: 1, source: 'RAINFOREST' },
  { civ: 'BRAZIL', district: 'THEATER_SQUARE', amount: 1, source: 'RAINFOREST' },
  // CIV6 (Grote Rivieren, EFFECT_RIVER_ADJACENCY): "Major adjacency bonus for
  // Campuses, Theater Squares, and Industrial Zones if next to a river."
  { civ: 'NETHERLANDS', district: 'CAMPUS', amount: 2, source: 'RIVER' },
  { civ: 'NETHERLANDS', district: 'THEATER_SQUARE', amount: 2, source: 'RIVER' },
  { civ: 'NETHERLANDS', district: 'INDUSTRIAL_ZONE', amount: 2, source: 'RIVER' },
  { civ: 'JAPAN', district: 'HOLY_SITE', amount: 1 },
  { civ: 'JAPAN', district: 'CAMPUS', amount: 1 },
  { civ: 'JAPAN', district: 'HARBOR', amount: 1 },
  { civ: 'JAPAN', district: 'COMMERCIAL_HUB', amount: 1 },
  { civ: 'JAPAN', district: 'THEATER_SQUARE', amount: 1 },
  { civ: 'JAPAN', district: 'INDUSTRIAL_ZONE', amount: 1 },
], DISTRICT_ADJ_SRC);

/** CIV6 (EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL): a flat yield on
 *  the seat's own international routes. Cleopatra's +4 Gold rides its own
 *  clause; the Intercontinental rows (Spain) wait on a continent model. */
export interface RouteYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
  /** CIV6 (Treasure Fleet, the install's `Intercontinental` argument): the row
   *  pays only where the route's two ENDPOINTS sit on different landmasses.
   *  It ADDS to the plain row rather than replacing it — the install ships 3
   *  and 6, and the text reads "triple these numbers". */
  intercontinental?: boolean;
}

/**
 * CIV6 (Treasure Fleet): "Trade Routes receive +3 Gold, +2 Faith, and +1
 * Production. Trade Routes between multiple continents receive TRIPLE these
 * numbers." Spain's six rows land in each list: the plain one on every route,
 * the intercontinental one adding twice as much again on top, so an
 * intercontinental leg pays 9 / 6 / 3. Both lists carry the same six because
 * the install writes the clause once for DOMESTIC and once for INTERNATIONAL.
 */
const TREASURE_FLEET: readonly RouteYieldRow[] = [
  { civ: 'SPAIN', yield: 'gold', amount: 3 },
  { civ: 'SPAIN', yield: 'faith', amount: 2 },
  { civ: 'SPAIN', yield: 'production', amount: 1 },
  { civ: 'SPAIN', yield: 'gold', amount: 6, intercontinental: true },
  { civ: 'SPAIN', yield: 'faith', amount: 4, intercontinental: true },
  { civ: 'SPAIN', yield: 'production', amount: 2, intercontinental: true },
];

export const INTL_ROUTE_YIELD_ROWS: readonly RouteYieldRow[] = withSrc([
  // CIV6 (Radio Oranje): "+2 Culture from international Trade Routes."
  { leader: 'WILHELMINA', yield: 'culture', amount: 2 },
  ...TREASURE_FLEET,
], INTL_ROUTE_YIELD_SRC);

/** The DOMESTIC half of EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC — the
 *  same shape as the international list, read on a route between two of the
 *  seat's own cities. */
export const DOMESTIC_ROUTE_YIELD_ROWS: readonly RouteYieldRow[] = withSrc([
  ...TREASURE_FLEET,
], DOMESTIC_ROUTE_YIELD_SRC);

/** CIV6 (EFFECT_ADJUST_TRADE_ROUTE_CAPACITY): +1 Trade Route capacity under a
 *  clause — a tech held with a capital standing (Nîhithaw), the Government
 *  Plaza and each of its building tiers (Founder of Carthage). */
export interface RouteCapacityRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  tech?: string;
  needsCapital?: boolean;
  govPlaza?: boolean;
  govTier?: number;
  /** the amount is paid ONCE PER city this seat holds off its home continent */
  perForeignCity?: boolean;
}
export const ROUTE_CAPACITY_ROWS: readonly RouteCapacityRow[] = withSrc([
  { civ: 'CREE', amount: 1, tech: 'POTTERY', needsCapital: true },
  { leader: 'DIDO', amount: 1, govPlaza: true },
  { leader: 'DIDO', amount: 1, govTier: 1 },
  { leader: 'DIDO', amount: 1, govTier: 2 },
  { leader: 'DIDO', amount: 1, govTier: 3 },
  // CIV6 (Pax Britannica, EFFECT_GRANT_FOUND_FOREIGN_CITY_TRADE_ROUTE_CAPACITY):
  // Amount 1 per city off the home continent. The leader's published blurb does
  // not mention it — the install's TABLE does, and the table outranks the text.
  { leader: 'VICTORIA', amount: 1, perForeignCity: true },
], ROUTE_CAPACITY_SRC);

/** Does a roster row name this seat? */
export function rowIsFor(row: { civ?: CivId; leader?: LeaderId }, civ: string | null, leader: string | null): boolean {
  return row.civ !== undefined ? row.civ === civ : row.leader === leader;
}

/** CIV6: `foeGolden` is Swift Hawk's "civilizations that are in a Golden or
 *  Heroic Age" — a HEROIC age IS a golden one on both engines, so the test is
 *  the age alone. Its "or Free Cities" half is not modeled.
 *  `foeOtherReligion` is El Escorial's REQUIREMENTS_OPPONENT_IS_OTHER_RELIGION:
 *  the foe's PLAYER holds a majority religion other than this seat's own
 *  (`majorityReligionOf` on both sides — both exist and differ). */
export type CombatCsWhen = 'always' | 'foeMinor' | 'foeWounded' | 'foeCity' | 'onCoast' | 'foeGolden' | 'onHomeContinent' | 'foeOtherReligion';
/** CIV6 (Thermopylae, ABILITY_GORGO_POLICY_SLOT_COMBAT_BONUS): "+1 Combat
 *  Strength for every Military Policy slotted" — the row's amount is paid ONCE
 *  PER slotted policy of the named kind instead of flat. */
export type CombatCsPer = 'militaryPolicy';
/**
 * CIV6 (EFFECT_GRANT_ABILITY -> MODIFIER_UNIT_ADJUST_COMBAT_STRENGTH): a flat
 * Combat Strength a civilization's or leader's units carry under a clause —
 * against a city-state's units (Barbarossa), against a wounded unit
 * (Tomyris), for a class (Genghis Khan's cavalry), on a coastal tile (Hojo's
 * land units on coastal land, his hulls on Coast), against a city or
 * district (the Great Turkish Bombard). `classes` names TARGET_CLASSES; an
 * empty list is every combat unit.
 */
export interface CombatCsRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  when: CombatCsWhen;
  classes?: readonly string[];
  /** the amount is paid once per slotted policy of this kind */
  per?: CombatCsPer;
}
export const COMBAT_CS_ROWS: readonly CombatCsRow[] = withSrc([
  // CIV6 (Thermopylae): "+1 Combat Strength for every Military Policy slotted."
  { leader: 'GORGO', amount: 1, when: 'always', per: 'militaryPolicy' },
  { leader: 'BARBAROSSA', amount: 7, when: 'foeMinor' },
  { leader: 'TOMYRIS', amount: 5, when: 'foeWounded' },
  { leader: 'GENGHIS_KHAN', amount: 3, when: 'always', classes: ['LIGHT_CAV', 'HEAVY_CAV'] },
  { leader: 'HOJO', amount: 5, when: 'onCoast', classes: ['RECON', 'MELEE', 'RANGED', 'ANTICAV', 'LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'] },
  { leader: 'HOJO', amount: 5, when: 'onCoast', classes: ['NAVAL_MELEE', 'NAVAL_RANGED', 'NAVAL_RAIDER', 'NAVAL_CARRIER'] },
  { civ: 'OTTOMAN', amount: 5, when: 'foeCity', classes: ['SIEGE'] },
  // CIV6 (Swift Hawk): "+10 Combat Strength when fighting Free Cities or
  // civilizations that are in a Golden or Heroic Age."
  { leader: 'LAUTARO', amount: 10, when: 'foeGolden' },
  // CIV6 (Roosevelt Corollary): "Units receive a +5 Combat Strength on their
  // home continent" — REQUIREMENTS_UNIT_ON_HOME_CONTINENT, the ORIGINAL
  // capital's landmass.
  { leader: 'T_ROOSEVELT', amount: 5, when: 'onHomeContinent' },
  // CIV6 (El Escorial, PHILIP_II_COMBAT_BONUS_OTHER_RELIGION Amount 5,
  // REQUIREMENTS_OPPONENT_IS_OTHER_RELIGION): against a player of another
  // majority religion
  { leader: 'PHILIP_II', amount: 5, when: 'foeOtherReligion' },
], COMBAT_CS_SRC);

/** CIV6 (EFFECT_ADJUST_UNIT_POST_COMBAT_HEAL, Tomyris): "Heal after
 *  defeating a unit" — on the same hook the War Department's heal rides. */
export interface PostKillHealRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const POST_KILL_HEAL_ROWS: readonly PostKillHealRow[] = withSrc([
  { leader: 'TOMYRIS', amount: 30 },
], POST_KILL_HEAL_SRC);

/** CIV6 (EFFECT_ADJUST_UNIT_COMBAT_UNIT_CAPTURE, Mongol Horde): "a chance to
 *  capture defeated enemy cavalry class units" — a melee loser of one of the
 *  named classes, beaten by an attacker of one of them, may change hands
 *  instead of dying (`captureRoll`). The classes gate BOTH chassis. */
export interface CaptureRow {
  civ?: CivId;
  leader?: LeaderId;
  classes: readonly string[];
}
export const CAPTURE_ROWS: readonly CaptureRow[] = withSrc([
  { leader: 'GENGHIS_KHAN', classes: ['LIGHT_CAV', 'HEAVY_CAV'] },
], CAPTURE_SRC);

/** CIV6 (Expansion1_Leaders.xml, the DiplomaticYieldSource modifiers): what a
 *  leader's units and cities earn for `WAR_BUFF_TURNS` after DECLARING a war
 *  of one kind (`kind` is a `WAR_KINDS` id), and the civic at which the
 *  leader may declare that kind (EFFECT_ADD_DIPLOMATIC_ACTION_OVERRIDE, in
 *  place of the row's own `InitiatorPrereqCivic`).
 *  - Arthashastra (TRAIT_TERRITORIAL_WAR_COMBAT Amount 5 ReligiousOnly false,
 *    TRAIT_TERRITORIAL_WAR_MOVEMENT Amount 2, TRAIT_TERRITORIAL_WAR_PREREQ_OVERRIDE
 *    CIVIC_MILITARY_TRAINING), all TurnsActive 10;
 *  - Bannockburn (TRAIT_LIBERATION_WAR_PRODUCTION YIELD_PRODUCTION Amount 100,
 *    TRAIT_LIBERATION_WAR_MOVEMENT Amount 2, TRAIT_LIBERATION_WAR_PREREQ_OVERRIDE
 *    CIVIC_DEFENSIVE_TACTICS), all TurnsActive 10. */
export interface WarBuffRow {
  civ?: CivId;
  leader?: LeaderId;
  kind: WarKindId;
  /** flat Combat Strength on every combat unit */
  combat: number;
  /** flat Movement on every unit */
  moves: number;
  /** percent Production in every city */
  prodPct: number;
  /** the civic the row's `civic` prerequisite is overridden to */
  civicOverride: string;
}
export const WAR_BUFF_ROWS: readonly WarBuffRow[] = withSrc([
  { leader: 'CHANDRAGUPTA', kind: 'territorial', combat: 5, moves: 2, prodPct: 0, civicOverride: 'MILITARY_TRAINING' },
  { leader: 'ROBERT_THE_BRUCE', kind: 'liberation', combat: 0, moves: 2, prodPct: 100, civicOverride: 'DEFENSIVE_TACTICS' },
], WAR_BUFF_SRC);

/** CIV6 (EFFECT_ADJUST_UNIT_MOVEMENT under UNIT_EMBARKED): extra Movement
 *  while embarked — Mana's land units, Mediterranean Colonies' Settlers. */
export interface EmbarkMoveRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  settlerOnly?: boolean;
}
export const EMBARK_MOVE_ROWS: readonly EmbarkMoveRow[] = withSrc([
  { civ: 'MAORI', amount: 2 },
  { civ: 'PHOENICIA', amount: 2, settlerOnly: true },
], EMBARK_MOVE_SRC);

/** CIV6 (EFFECT_ADJUST_UNIT_IGNORE_SHORES): "No movement penalty for
 *  embarking and disembarking" — the Knarr's every unit, the Mediterranean
 *  Colonies' Settlers. */
export interface IgnoreShoresRow {
  civ?: CivId;
  leader?: LeaderId;
  settlerOnly?: boolean;
}
export const IGNORE_SHORES_ROWS: readonly IgnoreShoresRow[] = withSrc([
  { civ: 'NORWAY' },
  { civ: 'PHOENICIA', settlerOnly: true },
], IGNORE_SHORES_SRC);

// ---------------------------------------------------------------------------
// THE CITY'S ROWS — clauses a civilization or leader pays in every city

/** CIV6 (Songs of the Jeli, EFFECT_TERRAIN_ADJACENCY): "City Centers gain +1
 *  Faith and +1 Food for every adjacent Desert and Desert Hills tiles" — the
 *  install's two terrains are the engine's one DESERT, hills or flat. */
export interface CenterAdjRow {
  civ?: CivId;
  leader?: LeaderId;
  terrain: TerrainId;
  yield: YieldKey;
  amount: number;
}
export const CENTER_ADJ_ROWS: readonly CenterAdjRow[] = withSrc([
  { civ: 'MALI', terrain: 'DESERT', yield: 'faith', amount: 1 },
  { civ: 'MALI', terrain: 'DESERT', yield: 'food', amount: 1 },
], CENTER_ADJ_SRC);

/** CIV6 (Nkisi, EFFECT_ADJUST_CITY_GREATWORK_YIELD): "+2 Food, +2 Production,
 *  +1 Faith, and +4 Gold from each Relic, Artifact, and Sculpture" — one row
 *  per (object type, yield), `TRAIT_GREAT_WORK_*_SCULPTURE` the sculpture
 *  four. */
export interface GreatWorkYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the work's object type (`GWO_*`) */
  obj: number;
  yield: YieldKey;
  amount: number;
}
export const GREAT_WORK_YIELD_ROWS: readonly GreatWorkYieldRow[] = withSrc([
  { civ: 'KONGO', obj: GWO_RELIC, yield: 'food', amount: 2 },
  { civ: 'KONGO', obj: GWO_RELIC, yield: 'production', amount: 2 },
  { civ: 'KONGO', obj: GWO_RELIC, yield: 'faith', amount: 1 },
  { civ: 'KONGO', obj: GWO_RELIC, yield: 'gold', amount: 4 },
  { civ: 'KONGO', obj: GWO_ARTIFACT, yield: 'food', amount: 2 },
  { civ: 'KONGO', obj: GWO_ARTIFACT, yield: 'production', amount: 2 },
  { civ: 'KONGO', obj: GWO_ARTIFACT, yield: 'faith', amount: 1 },
  { civ: 'KONGO', obj: GWO_ARTIFACT, yield: 'gold', amount: 4 },
  { civ: 'KONGO', obj: GWO_SCULPTURE, yield: 'food', amount: 2 },
  { civ: 'KONGO', obj: GWO_SCULPTURE, yield: 'production', amount: 2 },
  { civ: 'KONGO', obj: GWO_SCULPTURE, yield: 'faith', amount: 1 },
  { civ: 'KONGO', obj: GWO_SCULPTURE, yield: 'gold', amount: 4 },
], GREAT_WORK_YIELD_SRC);

/** CIV6 (Nkisi, EFFECT_ADJUST_GREAT_PERSON_POINTS_PERCENT): "Receive 50% more
 *  Great Artist, Great Musician, and Great Merchant points." */
export interface GppClassRow {
  civ?: CivId;
  leader?: LeaderId;
  cls: string;
  pct: number;
}
export const GPP_CLASS_ROWS: readonly GppClassRow[] = withSrc([
  { civ: 'KONGO', cls: 'ARTIST', pct: 50 },
  { civ: 'KONGO', cls: 'MUSICIAN', pct: 50 },
  { civ: 'KONGO', cls: 'MERCHANT', pct: 50 },
], GPP_CLASS_SRC);

/** CIV6 (Workshop of the World, EFFECT_ADJUST_CITY_YIELD_FROM_POWERED_BUILDING):
 *  "Buildings that provide additional yields when Powered receive +4 of that
 *  yield" — one row per yield the install names. */
export interface PoweredYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
}
export const POWERED_YIELD_ROWS: readonly PoweredYieldRow[] = withSrc([
  { civ: 'ENGLAND', yield: 'culture', amount: 4 },
  { civ: 'ENGLAND', yield: 'gold', amount: 4 },
  { civ: 'ENGLAND', yield: 'production', amount: 4 },
  { civ: 'ENGLAND', yield: 'science', amount: 4 },
  { civ: 'ENGLAND', yield: 'food', amount: 4 },
], POWERED_YIELD_SRC);

/** Strategic accumulation: CIV6 (Workshop of the World,
 *  EFFECT_ADJUST_CITY_EXTRA_ACCUMULATION_SPECIFIC_RESOURCE): "Iron and Coal
 *  Mines accumulate 2 more resources per turn"; (The Last Best West,
 *  EFFECT_ADJUST_EXTRA_ACCUMALATION_TERRAIN): on Tundra and Snow "strategic
 *  resource accumulation rate is +100%". */
export interface StockpileRateRow {
  civ?: CivId;
  leader?: LeaderId;
  resource?: string;
  terrain?: TerrainId;
  amount?: number;
  pct?: number;
}
export const STOCKPILE_RATE_ROWS: readonly StockpileRateRow[] = withSrc([
  { civ: 'ENGLAND', resource: 'COAL', amount: 2 },
  { civ: 'ENGLAND', resource: 'IRON', amount: 2 },
  { leader: 'LAURIER', terrain: 'TUNDRA', pct: 100 },
  { leader: 'LAURIER', terrain: 'SNOW', pct: 100 },
], STOCKPILE_RATE_SRC);

/** CIV6 (Workshop of the World, EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP):
 *  +10 stockpile capacity per Lighthouse, Shipyard and Seaport. */
export interface StockpileCapRow {
  civ?: CivId;
  leader?: LeaderId;
  building: string;
  amount: number;
}
export const STOCKPILE_CAP_ROWS: readonly StockpileCapRow[] = withSrc([
  { civ: 'ENGLAND', building: 'LIGHTHOUSE', amount: 10 },
  { civ: 'ENGLAND', building: 'SHIPYARD', amount: 10 },
  { civ: 'ENGLAND', building: 'SEAPORT', amount: 10 },
], STOCKPILE_CAP_SRC);

/** CIV6 (Workshop of the World, EFFECT_ADJUST_UNIT_BUILD_CHARGES): "Military
 *  Engineers receive +2 charges." */
export interface UnitChargeRow {
  civ?: CivId;
  leader?: LeaderId;
  unit: string;
  amount: number;
}
export const UNIT_CHARGE_ROWS: readonly UnitChargeRow[] = withSrc([
  { civ: 'ENGLAND', unit: 'MILITARY_ENGINEER', amount: 2 },
  // CIV6 (The First Emperor): "Builders receive an additional charge."
  { leader: 'QIN', unit: 'BUILDER', amount: 1 },
  // CIV6 (El Escorial): "Inquisitors can Remove Heresy one extra time."
  { leader: 'PHILIP_II', unit: 'INQUISITOR', amount: 1 },
  // CIV6 (Dharma): "Missionaries have +2 spreads."
  { civ: 'INDIA', unit: 'MISSIONARY', amount: 2 },
], UNIT_CHARGE_SRC);

/** CIV6 (The Last Best West, EFFECT_ADJUST_PLOT_PURCHASE_COST_TERRAIN):
 *  "Reduces the purchase cost of tiles in these terrain types by 50%." */
export interface TileCostRow {
  civ?: CivId;
  leader?: LeaderId;
  terrain: TerrainId;
  pct: number;
}
export const TILE_COST_ROWS: readonly TileCostRow[] = withSrc([
  { leader: 'LAURIER', terrain: 'TUNDRA', pct: -50 },
  { leader: 'LAURIER', terrain: 'SNOW', pct: -50 },
], TILE_COST_SRC);

/** CIV6 (The Last Best West, EFFECT_ADJUST_IMPROVEMENT_VALID_TERRAIN): "Allows
 *  Farms to be built on Tundra terrain. After Civil Engineering is unlocked
 *  Farms can be built on Tundra Hills." */
export interface FarmTerrainRow {
  civ?: CivId;
  leader?: LeaderId;
  terrain: TerrainId;
  hills: boolean;
  civic?: string;
}
export const FARM_TERRAIN_ROWS: readonly FarmTerrainRow[] = withSrc([
  { leader: 'LAURIER', terrain: 'TUNDRA', hills: false },
  { leader: 'LAURIER', terrain: 'TUNDRA', hills: true, civic: 'CIVIL_ENGINEERING' },
], FARM_TERRAIN_SRC);

/** CIV6 (Favorable Terms,
 *  EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_IMPROVEMENT_IN_TARGET_CITY): the
 *  ORIGIN side pays the sender +1 Food per Camp or Pasture at the destination;
 *  the DESTINATION side pays the destination's owner +1 Gold per Camp or
 *  Pasture there on every route sent to his cities. */
export interface RouteImprovementRow {
  civ?: CivId;
  leader?: LeaderId;
  improvement: ImprovementId;
  yield: YieldKey;
  amount: number;
  side: 'origin' | 'destination';
}
export const ROUTE_IMPROVEMENT_ROWS: readonly RouteImprovementRow[] = withSrc([
  { leader: 'POUNDMAKER', improvement: 'CAMP', yield: 'food', amount: 1, side: 'origin' },
  { leader: 'POUNDMAKER', improvement: 'CAMP', yield: 'gold', amount: 1, side: 'destination' },
  { leader: 'POUNDMAKER', improvement: 'PASTURE', yield: 'food', amount: 1, side: 'origin' },
  { leader: 'POUNDMAKER', improvement: 'PASTURE', yield: 'gold', amount: 1, side: 'destination' },
], ROUTE_IMPROVEMENT_SRC);

/** CIV6 (EFFECT_GRANT_UNIT_IN_CITY): a free unit in the capital at a
 *  technology (the Cree Trader at Pottery, Catherine's Spy at Castles), or in
 *  the FIRST city at its founding (Kupe's Builder). Spain's Builder on a
 *  foreign continent waits on. */
import type { PromoClass } from './promotions';

export interface GrantUnitRow {
  civ?: CivId;
  leader?: LeaderId;
  /** a named chassis. A row may name a promotion CLASS instead, and take the
   *  strongest chassis of it the seat could train. */
  unit?: string;
  promoClass?: PromoClass;
  tech?: string;
  firstCity?: boolean;
  /** CIV6 (Pax Britannica, Treasure Fleet): the city was founded on a
   *  continent other than the seat's HOME one — its original capital's. */
  foreignContinent?: boolean;
}
export const GRANT_UNIT_ROWS: readonly GrantUnitRow[] = withSrc([
  { civ: 'CREE', unit: 'TRADER', tech: 'POTTERY' },
  { leader: 'CATHERINE_DE_MEDICI', unit: 'SPY', tech: 'CASTLES' },
  { leader: 'KUPE', unit: 'BUILDER', firstCity: true },
  // CIV6 (Treasure Fleet): "Cities not on your original Capital's continent
  // receive ... a builder when founded."
  { civ: 'SPAIN', unit: 'BUILDER', foreignContinent: true },
  // CIV6 (Pax Britannica): "All cities founded on a continent other than your
  // home continent receive a free melee unit."
  { leader: 'VICTORIA', promoClass: 'MELEE', foreignContinent: true },
], GRANT_UNIT_SRC);

/** CIV6 (Catherine's Flying Squadron, EFFECT_GRANT_SPY): "extra spy capacity"
 *  with the Castles technology. */
export interface SpyCapacityRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
  amount: number;
}
export const SPY_CAPACITY_ROWS: readonly SpyCapacityRow[] = withSrc([
  { leader: 'CATHERINE_DE_MEDICI', tech: 'CASTLES', amount: 1 },
], SPY_CAPACITY_SRC);

/** CIV6 (Kupe's Voyage): "+1 Population when settling your first city. The
 *  Palace receives +3 Housing and +1 Amenity. +2 Science and +2 Culture per
 *  turn before you settle your first city." */
export interface CapitalRow {
  civ?: CivId;
  leader?: LeaderId;
  firstCityPop?: number;
  palaceHousing?: number;
  palaceAmenities?: number;
  presettleYields?: Partial<Record<YieldKey, number>>;
}
export const CAPITAL_ROWS: readonly CapitalRow[] = withSrc([
  { leader: 'KUPE', firstCityPop: 1, palaceHousing: 3, palaceAmenities: 1, presettleYields: { science: 2, culture: 2 } },
], CAPITAL_SRC);

// ---------------------------------------------------------------------------
// THE SEAT'S ROWS — happiness, policy slots and what a kill pays

/** CIV6 (Scottish Enlightenment, EFFECT_ADJUST_CITY_HAPPINESS_YIELD): "Happy
 *  cities receive an additional +5% Science and +5% Production ... Ecstatic
 *  cities double all these amounts" — one row per tier and yield. */
export interface HappyYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  tier: 'Happy' | 'Ecstatic';
  yield: YieldKey;
  pct: number;
}
export const HAPPY_YIELD_ROWS: readonly HappyYieldRow[] = withSrc([
  { civ: 'SCOTLAND', tier: 'Happy', yield: 'science', pct: 5 },
  { civ: 'SCOTLAND', tier: 'Happy', yield: 'production', pct: 5 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', yield: 'science', pct: 10 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', yield: 'production', pct: 10 },
], HAPPY_YIELD_SRC);

/** CIV6 (Scottish Enlightenment, EFFECT_ADJUST_CITY_HAPPINESS_GREAT_PERSON):
 *  "+1 Great Scientist point per Campus and +1 Great Engineer point per
 *  Industrial Zone", doubled while Ecstatic — the district must stand. */
export interface HappyGppRow {
  civ?: CivId;
  leader?: LeaderId;
  tier: 'Happy' | 'Ecstatic';
  cls: string;
  district: DistrictId;
  amount: number;
}
export const HAPPY_GPP_ROWS: readonly HappyGppRow[] = withSrc([
  { civ: 'SCOTLAND', tier: 'Happy', cls: 'SCIENTIST', district: 'CAMPUS', amount: 1 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', cls: 'SCIENTIST', district: 'CAMPUS', amount: 2 },
  { civ: 'SCOTLAND', tier: 'Happy', cls: 'ENGINEER', district: 'INDUSTRIAL_ZONE', amount: 1 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', cls: 'ENGINEER', district: 'INDUSTRIAL_ZONE', amount: 2 },
], HAPPY_GPP_SRC);

/** CIV6 (EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE): a policy slot of one kind
 *  in every government — Plato's Republic's Wildcard, the Holy Roman
 *  Emperor's Military. */
export interface PolicySlotRow {
  civ?: CivId;
  leader?: LeaderId;
  kind: 'military' | 'economic' | 'diplomatic' | 'wildcard';
  amount: number;
}
export const POLICY_SLOT_ROWS: readonly PolicySlotRow[] = withSrc([
  { civ: 'GREECE', kind: 'wildcard', amount: 1 },
  { leader: 'BARBAROSSA', kind: 'military', amount: 1 },
], POLICY_SLOT_SRC);

/** CIV6 (EFFECT_ADJUST_UNIT_POST_COMBAT_YIELD): "Combat victories provide
 *  Culture/Faith equal to 50% of the Combat Strength of the defeated unit" —
 *  the DEFEATED type's own strength, banked in the killer's purse. */
export interface PostCombatYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  pctOfDefeated: number;
}
export const POST_COMBAT_YIELD_ROWS: readonly PostCombatYieldRow[] = withSrc([
  { leader: 'GORGO', yield: 'culture', pctOfDefeated: 50 },
  { leader: 'TAMAR', yield: 'faith', pctOfDefeated: 50 },
], POST_COMBAT_YIELD_SRC);

// ---------------------------------------------------------------------------
// THE MOUNTAIN, THE GOVERNOR AND THE FORMATION

/** CIV6 (Mit'a, EFFECT_ADJUST_PLAYER_TERRAIN_WORK_IMPASSABLE_MODIFIER):
 *  "Citizens may work Mountain tiles." The install names its five mountain
 *  terrains one by one; this engine's MOUNTAIN elevation is all five. */
export interface WorkImpassableRow {
  civ?: CivId;
  leader?: LeaderId;
  mountain: true;
}
export const WORK_IMPASSABLE_ROWS: readonly WorkImpassableRow[] = withSrc([
  { civ: 'INCA', mountain: true },
], WORK_IMPASSABLE_SRC);

/** CIV6 (Qhapaq Ñan,
 *  EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_TERRAIN_FOR_DOMESTIC): "Domestic
 *  Trade Routes gain +1 Food for every Mountain tile in the origin city." */
export interface RouteTerrainRow {
  civ?: CivId;
  leader?: LeaderId;
  mountain: true;
  yield: YieldKey;
  amount: number;
}
export const ROUTE_TERRAIN_ROWS: readonly RouteTerrainRow[] = withSrc([
  { leader: 'PACHACUTI', mountain: true, yield: 'food', amount: 1 },
], ROUTE_TERRAIN_SRC);

/** CIV6 (Toqui, EFFECT_ADJUST_CITY_YIELD_MODIFIER): "Cities with an
 *  Established Governor provide +5% Culture, +5% Production ... These numbers
 *  are tripled in cities not founded by the Mapuche." */
export interface GovernorYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  pct: number;
  /** the city this row pays: one this seat FOUNDED, or one it did not */
  founded: boolean;
}
export const GOVERNOR_YIELD_ROWS: readonly GovernorYieldRow[] = withSrc([
  { civ: 'MAPUCHE', yield: 'culture', pct: 5, founded: true },
  { civ: 'MAPUCHE', yield: 'production', pct: 5, founded: true },
  { civ: 'MAPUCHE', yield: 'culture', pct: 15, founded: false },
  { civ: 'MAPUCHE', yield: 'production', pct: 15, founded: false },
], GOVERNOR_YIELD_SRC);

/** CIV6 (Toqui, EFFECT_ADJUST_GOVERNOR_IDENTITY_PRESSURE): "All cities within
 *  9 tiles of a city with your Governor gain +4 Loyalty per turn towards your
 *  civilization" — the seat's own cities gain it, a foreign one loses it, the
 *  shape `governorLoyaltyAura` already pays for the Garrison Commander. */
export interface GovernorLoyaltyRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  range: number;
}
export const GOVERNOR_LOYALTY_ROWS: readonly GovernorLoyaltyRow[] = withSrc([
  { civ: 'MAPUCHE', amount: 4, range: 9 },
], GOVERNOR_LOYALTY_SRC);

/** CIV6 (Isibongo, EFFECT_ADJUST_CITY_IDENTITY_PER_TURN): "Cities with a
 *  garrisoned unit get +3 Loyalty per turn, or +5 if it is a Corps or Army" —
 *  the second row is the +2 the install adds on top. */
export interface GarrisonLoyaltyRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  /** paid only when the garrison is a Corps or an Army */
  formation: boolean;
}
export const GARRISON_LOYALTY_ROWS: readonly GarrisonLoyaltyRow[] = withSrc([
  { civ: 'ZULU', amount: 3, formation: false },
  { civ: 'ZULU', amount: 2, formation: true },
], GARRISON_LOYALTY_SRC);

/** CIV6 (EFFECT_ADJUST_CORPS_ARMY_PREREQ): the civic a formation TIER needs,
 *  for one domain — Shaka's land Corps at Mercenaries and Armies at
 *  Nationalism, Spain's Fleets and Armadas both at Mercantilism.
 *  (EFFECT_ADJUST_CORPS_ARMY_MODIFIED_STRENGTH): what that formation adds. */
export interface FormationRow {
  civ?: CivId;
  leader?: LeaderId;
  /** 1 = Corps/Fleet, 2 = Army/Armada */
  tier: 1 | 2;
  naval: boolean;
  civic?: string;
  cs?: number;
}
export const FORMATION_ROWS: readonly FormationRow[] = withSrc([
  { leader: 'SHAKA', tier: 1, naval: false, civic: 'MERCENARIES', cs: 5 },
  { leader: 'SHAKA', tier: 2, naval: false, civic: 'NATIONALISM', cs: 5 },
  { civ: 'SPAIN', tier: 1, naval: true, civic: 'MERCANTILISM' },
  { civ: 'SPAIN', tier: 2, naval: true, civic: 'MERCANTILISM' },
], FORMATION_SRC);

/** CIV6 (Mit'a, EFFECT_ADJUST_TERRAIN_YIELD_FROM_ADJACENT_IMPROVEMENTS): "+1
 *  Food to Mountain tiles for every adjacent Terrace Farm" — the MOUNTAIN's
 *  own yield, which only a seat that may work one ever collects. */
export interface TerrainAdjYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  mountain: true;
  improvement: ImprovementId;
  yield: YieldKey;
  amount: number;
}
export const TERRAIN_ADJ_YIELD_ROWS: readonly TerrainAdjYieldRow[] = withSrc([
  { civ: 'INCA', mountain: true, improvement: 'TERRACE_FARM', yield: 'food', amount: 1 },
], TERRAIN_ADJ_YIELD_SRC);

// ---------------------------------------------------------------------------
// THE TITLE, THE PRIZE, THE START AND THE BAN

/** CIV6 (Hwarang, EFFECT_ADJUST_CITY_YIELD_MODIFIER_PER_GOVERNOR_TITLE):
 *  "Governors established in a city provide +3% Culture and Science for each
 *  Promotion they have earned, including their first." */
export interface GovernorTitleYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  pct: number;
}
export const GOVERNOR_TITLE_YIELD_ROWS: readonly GovernorTitleYieldRow[] = withSrc([
  { leader: 'SEONDEOK', yield: 'culture', pct: 3 },
  { leader: 'SEONDEOK', yield: 'science', pct: 3 },
], GOVERNOR_TITLE_YIELD_SRC);

/** CIV6 (Nobel Prize, EFFECT_ADJUST_GREAT_PERSON_POINTS): "+1 Great Engineer
 *  point from Factories and +1 Great Scientist point from Universities." */
export interface GppBuildingRow {
  civ?: CivId;
  leader?: LeaderId;
  building: string;
  cls: string;
  amount: number;
}
export const GPP_BUILDING_ROWS: readonly GppBuildingRow[] = withSrc([
  { civ: 'SWEDEN', building: 'FACTORY', cls: 'ENGINEER', amount: 1 },
  { civ: 'SWEDEN', building: 'UNIVERSITY', cls: 'SCIENTIST', amount: 1 },
], GPP_BUILDING_SRC);

/** CIV6 (Nobel Prize): "gains 50 Diplomatic Favor when earning a Great Person
 *  (on Standard Speed)." */
export interface GreatPersonFavorRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const GP_FAVOR_ROWS: readonly GreatPersonFavorRow[] = withSrc([
  { civ: 'SWEDEN', amount: 50 },
], GP_FAVOR_SRC);

/** CIV6 (Mana, EFFECT_GRANT_PLAYER_SPECIFIC_TECHNOLOGY): "Begin the game with
 *  the Sailing and Shipbuilding technologies unlocked." */
export interface StartTechRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
}
export const START_TECH_ROWS: readonly StartTechRow[] = withSrc([
  { civ: 'MAORI', tech: 'SAILING' },
  { civ: 'MAORI', tech: 'SHIPBUILDING' },
], START_TECH_SRC);

/** What a roster row FORBIDS its own seat. CIV6 (Mana): "Resources cannot be
 *  harvested. Great Writers cannot be earned"; (Religious Convert): "May not
 *  build Holy Site districts, gain Great Prophets, or found Religions." */
export type SeatBan = 'harvest' | 'greatWriter' | 'holySite' | 'greatProphet' | 'foundReligion';
/** the WIRE's index space for a ban — both engines address one by position. */
export const SEAT_BANS: readonly SeatBan[] = ['harvest', 'greatWriter', 'holySite', 'greatProphet', 'foundReligion'];
export interface SeatBanRow {
  civ?: CivId;
  leader?: LeaderId;
  ban: SeatBan;
}
export const SEAT_BAN_ROWS: readonly SeatBanRow[] = withSrc([
  { civ: 'MAORI', ban: 'harvest' },
  { civ: 'MAORI', ban: 'greatWriter' },
  { leader: 'MVEMBA', ban: 'holySite' },
  { leader: 'MVEMBA', ban: 'greatProphet' },
  { leader: 'MVEMBA', ban: 'foundReligion' },
], SEAT_BAN_SRC);

/** CIV6 (Righteousness of the Faith, EFFECT_ADD_RELIGIOUS_BUILDING_MULTIPLIER):
 *  the worship building of this row's religion costs a TENTH of the usual
 *  Faith, and adds `yieldPct` to the Science, Faith and Culture of the row's
 *  own cities that hold it. (The install lets ANY player buy it at that price;
 *  a seat here founds only its own religion, so the discount reaches the row
 *  itself — the cross-seat half is open in docs/roster_ledger.json.) */
export interface WorshipRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the percentage of the usual faith cost this row pays */
  costPct: number;
  /** what the building adds to Science, Faith and Culture in this row's cities */
  yieldPct: number;
}
export const WORSHIP_ROWS: readonly WorshipRow[] = withSrc([
  { leader: 'SALADIN', costPct: 10, yieldPct: 10 },
], WORSHIP_SRC);

/** CIV6 (Religious Convert, EFFECT_ADJUST_PLAYER_DISTRICT_CREATE_UNIT):
 *  "Receives an Apostle each time he finishes a M'banza or Theater Square
 *  district." The M'banza is Kongo's unique district and not in the roster,
 *  so the Theater Square arm ships alone. */
export interface DistrictUnitRow {
  civ?: CivId;
  leader?: LeaderId;
  district: DistrictId;
  unit: string;
}
/** CIV6 (MODIFIER_PLAYER_UNITS_ADJUST_VALID_TERRAIN, TERRAIN_OCEAN): a row
 *  whose units may cross OCEAN without Cartography — the Knarr from
 *  Shipbuilding, Mana from the first turn (`tech: null`). */
export interface OceanAccessRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the tech the clause waits on, or null for none */
  tech: string | null;
}
export const OCEAN_ACCESS_ROWS: readonly OceanAccessRow[] = withSrc([
  { civ: 'NORWAY', tech: 'SHIPBUILDING' },
  { civ: 'MAORI', tech: null },
], OCEAN_ACCESS_SRC);

export const DISTRICT_UNIT_ROWS: readonly DistrictUnitRow[] = withSrc([
  { leader: 'MVEMBA', district: 'THEATER_SQUARE', unit: 'APOSTLE' },
], DISTRICT_UNIT_SRC);

// ---------------------------------------------------------------------------
// THE CONQUERED CITY, THE SECOND HORSE AND THE BOOST

/** CIV6 (People of the Steppe, EFFECT_ADJUST_EXTRA_UNIT_COPY_TAG): "Receive a
 *  second light cavalry unit ... each time you train a light cavalry unit."
 *  A TRAINED unit only — the install's collection is the player's units and
 *  the real game excludes a purchase, exactly as the Venetian Arsenal does. */
export interface ExtraUnitCopyRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the CLASS a row copies, or '' when it names one chassis instead. */
  cls: string;
  /** CIV6 (TRAIT_EXTRASAKAHORSEARCHER,
   *  `MODIFIER_PLAYER_UNITS_ADJUST_EXTRA_UNIT_COPY` UnitType
   *  UNIT_SCYTHIAN_HORSE_ARCHER): a row may name ONE chassis rather than a
   *  class — the Saka Horse Archer is PROMOTION_CLASS_RANGED, so the light
   *  cavalry row above never reaches it. */
  unit?: string;
  amount: number;
}
/** the WIRE's index space for a copy row's class — both engines address one
 *  by position, and the unit plane behind each is named on the unit row. */
export const COPY_CLASSES = ['LIGHT_CAVALRY'] as const;
export const EXTRA_UNIT_COPY_ROWS: readonly ExtraUnitCopyRow[] = withSrc([
  { civ: 'SCYTHIA', cls: 'LIGHT_CAVALRY', amount: 1 },
  { civ: 'SCYTHIA', cls: '', unit: 'SAKA_HORSE_ARCHER', amount: 1 },
], EXTRA_UNIT_COPY_SRC);

/** CIV6 (Great Turkish Bombard, EFFECT_ADJUST_POPULATION_AFTER_CONQUEST):
 *  "Conquered cities do not lose Population" — the PERCENTAGE of the
 *  captured city's population this row keeps, over the usual loss. */
export interface ConquestPopRow {
  civ?: CivId;
  leader?: LeaderId;
  /** 100 = the whole population survives */
  keepPct: number;
}
export const CONQUEST_POP_ROWS: readonly ConquestPopRow[] = withSrc([
  { civ: 'OTTOMAN', keepPct: 100 },
], CONQUEST_POP_SRC);

/** CIV6 (Great Turkish Bombard, CITY_NOT_FOUNDED): "Cities not founded by the
 *  Ottomans gain +1 Amenity and +4 Loyalty per turn." */
export type NotFoundedChannel = 'amenity' | 'loyalty';
export interface NotFoundedRow {
  civ?: CivId;
  leader?: LeaderId;
  channel: NotFoundedChannel;
  amount: number;
}
/** the WIRE's index space for the channel — both engines address one by position. */
export const NOT_FOUNDED_CHANNELS: readonly NotFoundedChannel[] = ['amenity', 'loyalty'];
export const NOT_FOUNDED_ROWS: readonly NotFoundedRow[] = withSrc([
  { civ: 'OTTOMAN', channel: 'amenity', amount: 1 },
  { civ: 'OTTOMAN', channel: 'loyalty', amount: 4 },
], NOT_FOUNDED_SRC);

/** CIV6 (Free Imperial Cities, EFFECT_ADJUST_CITY_EXTRA_DISTRICTS): "Each city
 *  can build one more district than usual (exceeding the normal limit based on
 *  Population)." */
export interface ExtraDistrictRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const EXTRA_DISTRICT_ROWS: readonly ExtraDistrictRow[] = withSrc([
  { civ: 'GERMANY', amount: 1 },
], EXTRA_DISTRICT_SRC);

/** CIV6 (Mother Russia, EFFECT_ADJUST_PLAYER_CITY_TILES): "Extra territory
 *  upon founding cities" — the install's Amount is 5, not the eight the
 *  civilopedia's prose suggests. */
export interface CityTilesRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const CITY_TILES_ROWS: readonly CityTilesRow[] = withSrc([
  { civ: 'RUSSIA', amount: 5 },
], CITY_TILES_SRC);

/** CIV6 (Dynastic Cycle, EFFECT_ADJUST_TECHNOLOGY_BOOST /
 *  EFFECT_ADJUST_CIVIC_BOOST): "Eurekas and Inspirations provide 50% ...
 *  instead of 40%" — the install's Amount is 10 PERCENTAGE POINTS added to
 *  the base fraction, not a factor. */
export interface BoostPctRow {
  civ?: CivId;
  leader?: LeaderId;
  /** true for a TECH boost, false for a CIVIC one */
  tech: boolean;
  points: number;
}
export const BOOST_PCT_ROWS: readonly BoostPctRow[] = withSrc([
  { civ: 'CHINA', tech: true, points: 10 },
  { civ: 'CHINA', tech: false, points: 10 },
], BOOST_PCT_SRC);

/** CIV6 (The First Emperor, EFFECT_ADJUST_DISTRICT_PREREQ): "Canals are
 *  unlocked with the Masonry technology" — the row REPLACES the district's
 *  own unlock. */
export interface DistrictPrereqRow {
  civ?: CivId;
  leader?: LeaderId;
  district: DistrictId;
  /** exactly ONE of the two — the row REPLACES the district's own edge. */
  tech?: string;
  civic?: string;
}
/** CIV6 (Buildings.xml): a UNIQUE BUILDING may arrive on a different edge of
 *  the tree from the row it replaces — the Madrasa on the Theology CIVIC where
 *  the University waits for the Education tech. The row REPLACES that
 *  building's own unlock for the seat it names, the same way
 *  `DISTRICT_PREREQ_ROWS` replaces a district's. */
export interface BuildingPrereqRow {
  civ?: CivId;
  leader?: LeaderId;
  building: string;
  /** exactly ONE of the two. */
  tech?: string;
  civic?: string;
}
export const BUILDING_PREREQ_ROWS: readonly BuildingPrereqRow[] = withSrc([
  { civ: 'ARABIA', building: 'UNIVERSITY', civic: 'THEOLOGY' },
], BUILDING_PREREQ_SRC);

export const DISTRICT_PREREQ_ROWS: readonly DistrictPrereqRow[] = withSrc([
  { leader: 'QIN', district: 'CANAL', tech: 'MASONRY' },
  // CIV6 (M'banza, Districts.xml `PrereqCivic="CIVIC_GUILDS"`): Kongo's
  // Neighborhood arrives at Guilds, where everyone else waits for
  // Urbanization.
  { civ: 'KONGO', district: 'NEIGHBORHOOD', civic: 'GUILDS' },
], DISTRICT_PREREQ_SRC);

/** CIV6 (Satyagraha, EFFECT_ADJUST_WAR_WEARINESS): "Opposing civilizations
 *  receive double the war weariness for fighting against Gandhi" — the
 *  install's Amount is 100 with Enemy true, so it is a PERCENTAGE added to
 *  the enemy's accrual. */
export interface WarWearinessRow {
  civ?: CivId;
  leader?: LeaderId;
  /** added to what a seat AT WAR WITH this row accrues */
  enemyPct: number;
}
export const WAR_WEARINESS_ROWS: readonly WarWearinessRow[] = withSrc([
  { leader: 'GANDHI', enemyPct: 100 },
], WAR_WEARINESS_SRC);

/** CIV6 (Satyagraha, EFFECT_ADJUST_PLAYER_FAITH_PEACEFUL_FOUNDERS): "+5 Faith
 *  for each civilization (including India) they have met that has founded a
 *  Religion and is not currently at war." */
export interface PeacefulFounderRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const PEACEFUL_FOUNDER_ROWS: readonly PeacefulFounderRow[] = withSrc([
  { leader: 'GANDHI', amount: 5 },
], PEACEFUL_FOUNDER_SRC);

/** CIV6 (Surrounded by Glory, EFFECT_ADJUST_PLAYER_YIELD_MODIFIER_PER_TRIBUTARY):
 *  "+5% Culture per city-state you are the Suzerain of." */
export interface YieldPerSuzerainRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  pct: number;
}
export const YIELD_PER_SUZERAIN_ROWS: readonly YieldPerSuzerainRow[] = withSrc([
  { leader: 'PERICLES', yield: 'culture', pct: 5 },
], YIELD_PER_SUZERAIN_SRC);

/** CIV6 (Grand Vizier, EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS): "Gain ... a
 *  Governor Title when the Gunpowder technology is researched" — RunOnce. */
export interface GovernorTitleGrantRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
  amount: number;
}
export const GOVERNOR_TITLE_GRANT_ROWS: readonly GovernorTitleGrantRow[] = withSrc([
  { leader: 'SULEIMAN', tech: 'GUNPOWDER', amount: 1 },
], GOVERNOR_TITLE_GRANT_SRC);

/** CIV6 (Magnanimous, EFFECT_ADJUST_GREAT_PERSON_POINTS_REFUND_PERCENT):
 *  "After recruiting or patronizing a Great Person, 20% of its Great Person
 *  point cost is refunded." */
export interface GpRefundRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const GP_REFUND_ROWS: readonly GpRefundRow[] = withSrc([
  { leader: 'PEDRO', pct: 20 },
], GP_REFUND_SRC);

/** CIV6 (El Escorial, EFFECT_ADJUST_UNIT_EVICT_PERCENT): "Inquisitors
 *  eliminate 100% of the presence of other Religions" — the install adds 25
 *  PERCENTAGE POINTS to the base Remove Heresy share. */
export interface EvictPctRow {
  civ?: CivId;
  leader?: LeaderId;
  points: number;
}
export const EVICT_PCT_ROWS: readonly EvictPctRow[] = withSrc([
  { leader: 'PHILIP_II', points: 25 },
], EVICT_PCT_SRC);

// ---------------------------------------------------------------------------
// THE FOLLOWER, THE LEVY AND THE ROUTE

/** CIV6 (Dharma, EFFECT_ADJUST_RELIGION_AMENITIES_FOR_MINIMUM_FOLLOWERS):
 *  "Cities gain an Amenity for every Religion with at least 1 Follower." */
export interface ReligionAmenityRow {
  civ?: CivId;
  leader?: LeaderId;
  /** how many followers a religion needs before it pays */
  followers: number;
  amenities: number;
}
export const RELIGION_AMENITY_ROWS: readonly ReligionAmenityRow[] = withSrc([
  { civ: 'INDIA', followers: 1, amenities: 1 },
], RELIGION_AMENITY_SRC);

/** CIV6 (Dharma, EFFECT_ADJUST_GAINS_ALL_FOLLOWER_BELIEFS): "Receives Follower
 *  Belief bonuses in a city from each Religion that has at least 1 Follower." */
export interface AllFollowerBeliefsRow {
  civ?: CivId;
  leader?: LeaderId;
}
export const ALL_FOLLOWER_BELIEFS_ROWS: readonly AllFollowerBeliefsRow[] = [
  { civ: 'INDIA' },
];

/** CIV6 (Epic Quest, TRAIT_BARBARIAN_CAMP_GOODY): "Receive a Tribal Village
 *  reward each time you capture a barbarian outpost." The install spells it
 *  as EFFECT_ADJUST_IMPROVEMENT_GOODY_HUT, mapping IMPROVEMENT_BARBARIAN_CAMP
 *  to IMPROVEMENT_GOODY_HUT — so it is the SAME draw, not a reward of its own
 *. */
export interface CampGoodyRow {
  civ?: CivId;
  leader?: LeaderId;
}
export const CAMP_GOODY_ROWS: readonly CampGoodyRow[] = [
  { civ: 'SUMERIA' },
];

/** CIV6 (Amazon, TRAIT_AMAZON_RAINFOREST_EXTRA_APPEAL): "Rainforest tiles
 *  provide +1 Appeal to adjacent tiles, instead of the usual -1" — the
 *  install writes it as EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER on
 *  FEATURE_JUNGLE with Amount 2, which is exactly the swing from -1 to +1.
 *  The engine spells the install's JUNGLE as RAINFOREST. */
export interface FeatureAppealRow {
  civ?: CivId;
  leader?: LeaderId;
  feature: string;
  amount: number;
}
export const FEATURE_APPEAL_ROWS: readonly FeatureAppealRow[] = withSrc([
  { civ: 'BRAZIL', feature: 'RAINFOREST', amount: 2 },
], FEATURE_APPEAL_SRC);

/** CIV6 (Poundmaker, TRAIT_ALLIANCE_SHARED_VIS): the install writes
 *  EFFECT_ADJUST_PLAYER_ALL_ALLIANCES_PROVIDE_SHARED_VIS with `ShareVis:
 *  true` — a boolean, no direction and no level. Read as MUTUAL, because that
 *  is what "shared" means in the alliance system it names: the holder and its
 *  ally each see what the other uncovers. The DISCOVERY event stays the
 *  discoverer's own — an ally shown a natural wonder earns no era score for
 *  it. */
export interface AllianceSharedVisRow {
  civ?: CivId;
  leader?: LeaderId;
}
export const ALLIANCE_SHARED_VIS_ROWS: readonly AllianceSharedVisRow[] = [
  { leader: 'POUNDMAKER' },
];

/** CIV6 (Dharma, EFFECT_ADJUST_PLAYER_TRADE_ROUTE_RELIGIOUS_PRESSURE): "+100%
 *  Religious pressure from your Trade Routes", on both ends of the leg. */
export interface RoutePressureRow {
  civ?: CivId;
  leader?: LeaderId;
  origin: boolean;
  destination: boolean;
  pct: number;
}
export const ROUTE_PRESSURE_ROWS: readonly RoutePressureRow[] = withSrc([
  { civ: 'INDIA', origin: true, destination: true, pct: 100 },
], ROUTE_PRESSURE_SRC);

/** CIV6 (The Last Prophet, EFFECT_ADD_PLAYER_BELIEF_YIELD /
 *  BELIEF_YIELD_PER_FOREIGN_CITY): "+1 Science for each foreign city following
 *  Arabia's Religion." */
export interface ForeignFollowerYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
  /** how many foreign cities one payment needs */
  per: number;
}
export const FOREIGN_FOLLOWER_YIELD_ROWS: readonly ForeignFollowerYieldRow[] = withSrc([
  { civ: 'ARABIA', yield: 'science', amount: 1, per: 1 },
], FOREIGN_FOLLOWER_YIELD_SRC);

/** CIV6 (The Last Prophet, EFFECT_ADJUST_GREAT_PERSON_GUARANTEE):
 *  "Automatically receive the final Great Prophet when the next-to-last one is
 *  claimed (if you have not earned a Great Prophet already)." */
export interface GreatPersonGuaranteeRow {
  civ?: CivId;
  leader?: LeaderId;
  cls: string;
}
export const GP_GUARANTEE_ROWS: readonly GreatPersonGuaranteeRow[] = withSrc([
  { civ: 'ARABIA', cls: 'PROPHET' },
], GP_GUARANTEE_SRC);

/** CIV6 (Songs of the Jeli, EFFECT_ENABLE_BUILDING_FAITH_PURCHASE): "May
 *  purchase Commercial Hub district buildings with Faith." */
export interface FaithPurchaseDistrictRow {
  civ?: CivId;
  leader?: LeaderId;
  district: DistrictId;
}
export const FAITH_PURCHASE_DISTRICT_ROWS: readonly FaithPurchaseDistrictRow[] = withSrc([
  { civ: 'MALI', district: 'COMMERCIAL_HUB' },
], FAITH_PURCHASE_DISTRICT_SRC);

/** CIV6 (Mediterranean Colonies, EFFECT_GRANT_PLAYER_SPECIFIC_TECH_BOOST):
 *  "Begin the game with the Writing technology Eureka." */
export interface StartBoostRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
}
export const START_BOOST_ROWS: readonly StartBoostRow[] = withSrc([
  { civ: 'PHOENICIA', tech: 'WRITING' },
], START_BOOST_SRC);

/** CIV6 (Swift Hawk, EFFECT_ADJUST_PLAYER_POST_COMBAT_LOYALTY): "Defeating an
 *  enemy unit within the borders of an enemy city causes that city to lose 20
 *  Loyalty, and 40 if that civilization is in a Golden or Heroic Age." The
 *  install's `AffectLocal` is false — the loss is the DEFEATED side's city. */
export interface PostCombatLoyaltyRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  /** what a GOLDEN or Heroic age adds to the loss */
  goldenExtra: number;
}
export const POST_COMBAT_LOYALTY_ROWS: readonly PostCombatLoyaltyRow[] = withSrc([
  { leader: 'LAUTARO', amount: -20, goldenExtra: -20 },
], POST_COMBAT_LOYALTY_SRC);

/** CIV6 (Raven King, EFFECT_ADJUST_PLAYER_LEVIED_UNIT_UPGRADE_DISCOUNT_PERCENT
 *  and EFFECT_GRANT_INFLUENCE_TOKEN_LEVY_MILITARY): "levied units cost 75%
 *  less to upgrade" and a levy hands back two Envoys. */
export interface LevyRow {
  civ?: CivId;
  leader?: LeaderId;
  /** EFFECT_ADJUST_PLAYER_LEVIED_UNIT_UPGRADE_DISCOUNT_PERCENT, Amount 75 */
  upgradeDiscountPct: number;
  envoys: number;
  /** CIV6 (The Raven King): LEVY_UNITS_GRANT_ABILITY grants levied units
   *  ABILITY_THE_RAVEN_KING, whose two modifiers are
   *  EFFECT_ADJUST_UNIT_MOVEMENT Amount 2 and
   *  EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER Amount 5. */
  levyMoves: number;
  levyCombat: number;
}
export const LEVY_ROWS: readonly LevyRow[] = withSrc([
  { leader: 'MATTHIAS_CORVINUS', upgradeDiscountPct: 75, envoys: 2, levyMoves: 2, levyCombat: 5 },
], LEVY_SRC);

/** CIV6 (Radio Oranje, EFFECT_ADJUST_PLAYER_IDENTITY_PER_TURN_FOR_DOMESTIC_TRADE_ROUTE_ORIGIN):
 *  "+2 Loyalty per turn in the ORIGIN city of a domestic Trade Route." */
export interface DomesticRouteLoyaltyRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const DOMESTIC_ROUTE_LOYALTY_ROWS: readonly DomesticRouteLoyaltyRow[] = withSrc([
  { leader: 'WILHELMINA', amount: 2 },
], DOMESTIC_ROUTE_LOYALTY_SRC);

/** CIV6 (Radio Oranje, EFFECT_ADJUST_TRADE_ROUTE_YIELD_FROM_OTHERS): "+2
 *  Culture from each Trade Route another civilization sends to this one." */
export interface IncomingRouteYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
}
export const INCOMING_ROUTE_YIELD_ROWS: readonly IncomingRouteYieldRow[] = withSrc([
  { leader: 'WILHELMINA', yield: 'culture', amount: 2 },
], INCOMING_ROUTE_YIELD_SRC);

// ---------------------------------------------------------------------------
// THE WONDER, THE RIVER AND THE POST

/** CIV6 (France, EFFECT_ADJUST_WONDER_ERA_PRODUCTION): "+20% Production
 *  toward Medieval, Renaissance, and Industrial era wonders" — an ERA BAND,
 *  which is what `PROD_MULT_ROWS` cannot say. */
export interface WonderEraProdRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the engine's own era NAMES (`ERAS`), inclusive at both ends */
  startEra: Era;
  endEra: Era;
  pct: number;
}
export const WONDER_ERA_PROD_ROWS: readonly WonderEraProdRow[] = withSrc([
  { civ: 'FRANCE', startEra: 'Medieval', endEra: 'Industrial', pct: 20 },
], WONDER_ERA_PROD_SRC);

/** CIV6 (France, EFFECT_ADJUST_CITY_TOURISM): "Tourism from wonders of any era
 *  is +100%" — the install's ScalingFactor is 200, so the row carries the
 *  ADDED percentage. */
export interface WonderTourismRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const WONDER_TOURISM_ROWS: readonly WonderTourismRow[] = withSrc([
  { civ: 'FRANCE', pct: 100 },
], WONDER_TOURISM_SRC);

/** CIV6 (Pearl of the Danube): "+50% Production to Districts and Buildings
 *  constructed ACROSS A RIVER from a City Center." */
export interface RiverCrossProdRow {
  civ?: CivId;
  leader?: LeaderId;
  kind: 'district' | 'building';
  pct: number;
}
export const RIVER_CROSS_PROD_ROWS: readonly RiverCrossProdRow[] = withSrc([
  { civ: 'HUNGARY', kind: 'district', pct: 50 },
  { civ: 'HUNGARY', kind: 'building', pct: 50 },
], RIVER_CROSS_PROD_SRC);

/** CIV6 (Ortoo, EFFECT_ADJUST_PLAYER_IMMEDIATE_TRADING_POST): "Starting a
 *  Trade Route immediately creates a Trading Post in the destination city." */
export interface ImmediatePostRow {
  civ?: CivId;
  leader?: LeaderId;
}
export const IMMEDIATE_POST_ROWS: readonly ImmediatePostRow[] = [
  { civ: 'MONGOLIA' },
];

/** CIV6 (Ortoo): "Receive an extra level of Diplomatic Visibility for
 *  possessing a Trading Post in any city of a civilization", and "All
 *  Mongolian units double the usual Combat Bonus for having a higher level of
 *  Diplomatic Visibility than their opponent" — the install's Amount 3 IS the
 *  doubled step, taken over the DELTA with the opponent. */
export interface DiploVisRow {
  civ?: CivId;
  leader?: LeaderId;
  /** extra levels held for a trading post in any of that seat's cities */
  postLevels: number;
  /** extra levels held against EVERY civilization this seat has met */
  flatLevels: number;
  /** Combat Strength per level of advantage ADDED to the usual step — the
   *  engine's own `VISIBILITY_CS_PER_LEVEL` is 3, and the install's Amount is
   *  3 too, which is what "double the usual Combat Bonus" comes to */
  csPerLevel: number;
}
export const DIPLO_VIS_ROWS: readonly DiploVisRow[] = withSrc([
  { civ: 'MONGOLIA', postLevels: 1, flatLevels: 0, csPerLevel: 3 },
  // CIV6 (Flying Squadron): "Has 1 level of Diplomatic Visibility greater
  // than normal with every civilization that she's met."
  { leader: 'CATHERINE_DE_MEDICI', postLevels: 0, flatLevels: 1, csPerLevel: 0 },
], DIPLO_VIS_SRC);

/** CIV6 (Faces of Peace, EFFECT_ADJUST_BANNED_DIPLOMATIC_ACTIONS): "Cannot
 *  declare war on City-States or surprise wars. Surprise wars cannot be
 *  declared on Canada." */
export type WarBan = 'surpriseByMe' | 'surpriseOnMe' | 'onCityState';
/** the WIRE's index space for a war ban — both engines address one by position. */
export const WAR_BANS: readonly WarBan[] = ['surpriseByMe', 'surpriseOnMe', 'onCityState'];
export interface WarBanRow {
  civ?: CivId;
  leader?: LeaderId;
  ban: WarBan;
}
export const WAR_BAN_ROWS: readonly WarBanRow[] = withSrc([
  { civ: 'CANADA', ban: 'surpriseByMe' },
  { civ: 'CANADA', ban: 'surpriseOnMe' },
  { civ: 'CANADA', ban: 'onCityState' },
], WAR_BAN_SRC);

/** CIV6 (Faces of Peace, EFFECT_ADJUST_PLAYER_TOURISM_FAVOR): "For every 100
 *  Tourism per turn earn 1 Diplomatic Favor per turn." */
export interface TourismFavorRow {
  civ?: CivId;
  leader?: LeaderId;
  perTourism: number;
  favor: number;
}
export const TOURISM_FAVOR_ROWS: readonly TourismFavorRow[] = withSrc([
  { civ: 'CANADA', perTourism: 100, favor: 1 },
], TOURISM_FAVOR_SRC);

/** CIV6 (Faces of Peace, EFFECT_ADJUST_PLAYER_EMERGENCY_FAVOR_MODIFIER):
 *  "+100% Diplomatic Favor from successfully completing an Emergency or Scored
 *  Competition" — as a MEMBER of it. */
export interface EmergencyFavorRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const EMERGENCY_FAVOR_ROWS: readonly EmergencyFavorRow[] = withSrc([
  { civ: 'CANADA', pct: 100 },
], EMERGENCY_FAVOR_SRC);

/** CIV6 (Strength in Unity,
 *  EFFECT_ADJUST_PLAYER_ALWAYS_ALLOW_COMMEMORATION_QUEST_COUNT): "When making
 *  Dedications at the beginning of a Golden Age or Heroic Age, receive the
 *  Normal Age bonus towards improving Era Score in addition to the other
 *  bonus." */
export interface GoldenDedicationRow {
  civ?: CivId;
  leader?: LeaderId;
  count: number;
}
export const GOLDEN_DEDICATION_ROWS: readonly GoldenDedicationRow[] = withSrc([
  { civ: 'GEORGIA', count: 1 },
], GOLDEN_DEDICATION_SRC);

/** CIV6 (Sahel Merchants,
 *  EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_TERRAIN_FOR_INTERNATIONAL):
 *  "International Trade Routes gain +1 Gold for every flat Desert tile in the
 *  origin city" — the INTERNATIONAL twin of the domestic per-terrain rows. */
export interface IntlRouteTerrainRow {
  civ?: CivId;
  leader?: LeaderId;
  terrain: string;
  /** the install names FLAT ground; its hills are a terrain of their own */
  flatOnly: boolean;
  yield: YieldKey;
  amount: number;
}
export const INTL_ROUTE_TERRAIN_ROWS: readonly IntlRouteTerrainRow[] = withSrc([
  { leader: 'MANSA_MUSA', terrain: 'DESERT', flatOnly: true, yield: 'gold', amount: 1 },
], INTL_ROUTE_TERRAIN_SRC);

/** CIV6 (Sahel Merchants, EFFECT_GRANT_GOLDEN_AGE_TRADE_ROUTE_CAPACITY):
 *  "Receive +1 Trade Capacity every time you enter a Golden Age." */
export interface GoldenRouteCapacityRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const GOLDEN_ROUTE_CAPACITY_ROWS: readonly GoldenRouteCapacityRow[] = withSrc([
  { leader: 'MANSA_MUSA', amount: 1 },
], GOLDEN_ROUTE_CAPACITY_SRC);

/** CIV6 (The Grand Embassy, EFFECT_ADJUST_PLAYER_PROGRESS_DIFF_TRADE_BONUS):
 *  "Receives Science or Culture from Trade Routes to civilizations that are
 *  more advanced than Russia. +1 per 3 technologies or civics ahead." */
export interface ProgressTradeRow {
  civ?: CivId;
  leader?: LeaderId;
  /** how many techs (or civics) ahead one point of yield costs */
  per: number;
}
export const PROGRESS_TRADE_ROWS: readonly ProgressTradeRow[] = withSrc([
  { leader: 'PETER_GREAT', per: 3 },
], PROGRESS_TRADE_SRC);

/** CIV6 (Janissary, EFFECT_ADJUST_CITY_POPULATION_UNIT_CREATED): the unit
 *  costs the city a Population when it is trained — and only in a city this
 *  seat FOUNDED (the install's own requirement set). */
export interface UnitPopCostRow {
  civ?: CivId;
  leader?: LeaderId;
  unit: string;
  amount: number;
  foundedOnly: boolean;
}
/** CIV6 (JANISSARY_LOSE_POPULATION_IN_FOUNDED_CITIES):
 *  `MODIFIER_PLAYER_CITIES_CHANGE_POPULATION_CREATE_UNIT` Amount -1 on the
 *  chassis, under the requirement set JANISSARY_CITY_FOUNDED — the amount is the install's own
 *  SIGNED value, so the reader ADDS it. */
export const UNIT_POP_COST_ROWS: readonly UnitPopCostRow[] = withSrc([
  { leader: 'SULEIMAN', unit: 'JANISSARY', amount: -1, foundedOnly: true },
], UNIT_POP_COST_SRC);

// ---------------------------------------------------------------------------
// THE SLOT, THE GREAT WORK AND THE CONQUERED FORMATION

/** CIV6 (Founding Fathers, EFFECT_REPLACE_PLAYER_GOVERNMENT_SLOT_TYPE): "All
 *  Diplomatic policy slots in the current government are converted to Wildcard
 *  slots." The install's `ReplacesAll` is true, so EVERY slot of the named
 *  kind converts, in whatever government is adopted. */
export interface SlotConvertRow {
  civ?: CivId;
  leader?: LeaderId;
  from: SlotKind;
  to: SlotKind;
}
export const SLOT_CONVERT_ROWS: readonly SlotConvertRow[] = withSrc([
  { civ: 'AMERICA', from: 'diplomatic', to: 'wildcard' },
], SLOT_CONVERT_SRC);

/** CIV6 (Founding Fathers, EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE_GRANT_FAVOR):
 *  "+1 Diplomatic Favor per turn for every Wildcard slot in their government."
 *  Counted AFTER the conversion above, which is what makes the pair worth
 *  having. */
export interface SlotFavorRow {
  civ?: CivId;
  leader?: LeaderId;
  kind: SlotKind;
  favor: number;
}
export const SLOT_FAVOR_ROWS: readonly SlotFavorRow[] = withSrc([
  { civ: 'AMERICA', kind: 'wildcard', favor: 1 },
], SLOT_FAVOR_SRC);

/** CIV6 (Founder of Carthage, EFFECT_ADJUST_ALL_DISTRICT_PRODUCTION_MODIFIER):
 *  "+50% Production toward districts in the city with the Government Plaza." */
export interface PlazaDistrictProdRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const PLAZA_DISTRICT_PROD_ROWS: readonly PlazaDistrictProdRow[] = withSrc([
  { leader: 'DIDO', pct: 50 },
], PLAZA_DISTRICT_PROD_SRC);

/** CIV6 (Eleanor, EFFECT_ADJUST_IDENTITY_PER_TURN_FROM_NEARBY_GREAT_WORKS):
 *  "Great Works in Eleanor's cities each cause -1 Loyalty per turn in FOREIGN
 *  cities within 9 tiles." Both her leaders carry the same row. */
export interface GreatWorkLoyaltyRow {
  civ?: CivId;
  leader?: LeaderId;
  /** per Great Work, and NEGATIVE — the foreign city loses it */
  amount: number;
  range: number;
}
export const GREAT_WORK_LOYALTY_ROWS: readonly GreatWorkLoyaltyRow[] = withSrc([
  { leader: 'ELEANOR_ENGLAND', amount: -1, range: 9 },
  { leader: 'ELEANOR_FRANCE', amount: -1, range: 9 },
], GREAT_WORK_LOYALTY_SRC);

/** CIV6 (Eleanor, EFFECT_ADJUST_PLAYER_SKIP_FREE_CITY_STEP): "A city that
 *  leaves another civilization due to a loss of Loyalty and is currently
 *  receiving the most Loyalty per turn from Eleanor's civilization skips the
 *  Free City step to join this civilization." */
export interface SkipFreeCityRow {
  civ?: CivId;
  leader?: LeaderId;
}
/** The RECEIVER's row: read at the revolt for the seat pressing hardest
 *  (`skipsFreeCityStep`); on the wire as `skipFreeCity`. */
export const SKIP_FREE_CITY_ROWS: readonly SkipFreeCityRow[] = [
  { leader: 'ELEANOR_ENGLAND' },
  { leader: 'ELEANOR_FRANCE' },
];

/** CIV6 (Tamar, MODIFIER_PLAYER_ADJUST_DUPLICATE_INFLUENCE_TOKEN_WHEN_SAME_RELIGION,
 *  Amount 1): an envoy sent to a city-state whose city follows this seat's
 *  MAJORITY religion counts as `amount` more. Read at the SEND
 *  (`sameReligionToken`); on the wire as `envoySameReligion`. */
export interface EnvoySameReligionRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const ENVOY_SAME_RELIGION_ROWS: readonly EnvoySameReligionRow[] = withSrc([
  { leader: 'TAMAR', amount: 1 },
], [{ amount: ma('TRAIT_CITY_STATE_TOKEN_SAME_RELIGION') }]);

/** CIV6 (Mvemba, MODIFIER_PLAYER_GAINS_FOUNDER_BELIEF_MAJORITY_RELIGION): the
 *  seat is paid the FOUNDER belief of the religion more than half of its cities
 *  follow — the founding seat's own claim (`founderBeliefOf`); on the wire as
 *  `majorityFounder`. */
export interface MajorityFounderRow {
  civ?: CivId;
  leader?: LeaderId;
}
export const MAJORITY_FOUNDER_ROWS: readonly MajorityFounderRow[] = [
  { leader: 'MVEMBA' },
];

/** CIV6 (Toqui): "+10% experience in combat towards all units trained in this
 *  city", tripled in a city the Mapuche did not found — the same
 *  established-governor channel its Culture and Production ride. */
export interface GovernorXpRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
  /** true = a city this seat FOUNDED, false = one it did not */
  founded: boolean;
}
export const GOVERNOR_XP_ROWS: readonly GovernorXpRow[] = withSrc([
  { civ: 'MAPUCHE', pct: 10, founded: true },
  { civ: 'MAPUCHE', pct: 30, founded: false },
], GOVERNOR_XP_SRC);

/** CIV6 (Isibongo, EFFECT_ADD_PLAYER_UPGRADE_MILITARY_FORMATION_ON_CITY_CONQUEST):
 *  "Conquering a city with a unit will upgrade it into a Corps or Army, if the
 *  proper Civics are unlocked." */
export interface ConquestFormationRow {
  civ?: CivId;
  leader?: LeaderId;
}
export const CONQUEST_FORMATION_ROWS: readonly ConquestFormationRow[] = [
  { civ: 'ZULU' },
];

/** CIV6 (Flying Squadron): "All spies start as Agents with a free promotion."
 *  The install's Amount is -1, which is its own marker for "one promotion",
 *  not an experience figure. */
export interface SpyPromoRow {
  civ?: CivId;
  leader?: LeaderId;
  promotions: number;
}
/** CIV6 (Roosevelt Corollary, EFFECT_ADJUST_CITY_APPEAL): "+1 Appeal to all
 *  tiles in a city with a National Park." A per-CITY appeal add, which is what
 *  `cityAppealResolver` / `_gp_appeal_plane` already carry for the Great
 *  Person perk. */
export interface ParkAppealRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const PARK_APPEAL_ROWS: readonly ParkAppealRow[] = withSrc([
  { leader: 'T_ROOSEVELT', amount: 1 },
], PARK_APPEAL_SRC);

/** CIV6 (EFFECT_ADJUST_PLAYER_TRADE_GAIN_TILES_EN_ROUTE, GainTileRadius 3 on
 *  TRAIT_CIVILIZATION_CREE_TRADE_GAIN_TILES): "Unclaimed tiles within 3 tiles
 *  of a Cree City come under Cree control when a Trader first moves into
 *  them" — the radius is measured from the CITY, not from the path or the
 *  route's ends. */
export interface TradeGainTileRow {
  civ?: CivId;
  leader?: LeaderId;
  radius: number;
}
export const TRADE_GAIN_TILE_ROWS: readonly TradeGainTileRow[] = withSrc([
  { civ: 'CREE', radius: 3 },
], TRADE_GAIN_TILE_SRC);

export const SPY_PROMO_ROWS: readonly SpyPromoRow[] = withSrc([
  { leader: 'CATHERINE_DE_MEDICI', promotions: 1 },
], SPY_PROMO_SRC);

/** CIV6 (EFFECT_ADD_CULTURE_BOMB_TRIGGER): completing the named IMPROVEMENT —
 *  or the named DISTRICT — claims the tiles around it for the builder. The
 *  Maori's Fishing Boats and the Netherlands' Harbour are the install's two.
 *  This is the FULL bomb, not the Preserve's unowned-only one: a culture bomb
 *  takes a neighbour's ground too. */
export interface CultureBombRow {
  civ?: CivId;
  leader?: LeaderId;
  /** exactly one of these two names the carrier */
  improvement?: ImprovementId;
  district?: DistrictId;
}
export const CULTURE_BOMB_ROWS: readonly CultureBombRow[] = withSrc([
  { civ: 'MAORI', improvement: 'FISHING_BOATS' },
  { civ: 'NETHERLANDS', district: 'HARBOR' },
], CULTURE_BOMB_SRC);

/**
 * CIV6 (The First Emperor, EFFECT_ADJUST_PLAYER_UNIT_WONDER_PERCENT): "When
 * building Ancient and Classical wonders you may spend Builder charges to
 * complete 15% of the original wonder cost."
 *
 * The install's modifier carries the Amount (15) and NO requirement set, so
 * the era band comes from the leader's own published description — the same
 * install, its Text tables. ORIGINAL cost means the wonder's whole cost, not
 * what is left to pay, and one charge buys one helping.
 */
export interface WonderChargeRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the engine's own era NAMES (`ERAS`), inclusive at both ends */
  startEra: Era;
  endEra: Era;
  pct: number;
}
export const WONDER_CHARGE_ROWS: readonly WonderChargeRow[] = withSrc([
  { leader: 'QIN', startEra: 'Ancient', endEra: 'Classical', pct: 15 },
], WONDER_CHARGE_SRC);

/**
 * CIV6 (Dynastic Cycle, EFFECT_ADJUST_FREE_TECH_BOOST_WONDER_ERA and its
 * CIVIC twin): "When completing a wonder receive a random Eureka and
 * Inspiration from the era of the wonder, if available." The install writes
 * the two as separate modifiers, each Amount 1, so the row carries both
 * counts and a seat may hold one without the other.
 */
export interface WonderEraBoostRow {
  civ?: CivId;
  leader?: LeaderId;
  /** how many unearned EUREKAS of the wonder's era to grant */
  techs: number;
  /** ...and how many INSPIRATIONS */
  civics: number;
}
export const WONDER_ERA_BOOST_ROWS: readonly WonderEraBoostRow[] = withSrc([
  { civ: 'CHINA', techs: 1, civics: 1 },
], WONDER_ERA_BOOST_SRC);
