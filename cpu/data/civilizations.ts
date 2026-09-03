/**
 * THE CIVILIZATION ABILITIES — CIV6, the owner's install (Civilizations.xml,
 * Traits / TraitModifiers / Modifiers). One constant per sourced number; the
 * rule body that spends each lives beside the mechanic it touches.
 */
import type { ImprovementId, TerrainId, FeatureId } from '../../world/types';
import type { DistrictId } from '../core/types';
import type { YieldKey } from '../core/types';
import type { Era } from './techs';
import type { CivId, LeaderId } from './seats';

/** CIV6 (Iteru, TRAIT_RIVER_FASTER_BUILDTIME_DISTRICT / _WONDER): "+15%
 *  Production towards Districts and Wonders built next to a River." */
export const ITERU_RIVER_PROD_MULT = 1.15;

/** CIV6 (Knarr, MELEE_SHIP_HEAL_NEUTRAL): naval melee units heal +10 in
 *  neutral territory. */
export const KNARR_NAVAL_MELEE_NEUTRAL_HEAL = 10;

/** CIV6 (Epic Quest): "Levying units from a city-state costs 50% less Gold." */
export const EPIC_QUEST_LEVY_MULT = 0.5;

/** CIV6 (All Roads Lead to Rome): "Trade Routes generate +1 Gold for passing
 *  through Trading Posts in your own cities." */
export const ROME_OWN_POST_GOLD = 1;

/** CIV6 (Mediterranean's Bride): "Your Trade Routes to other civilizations
 *  provide +4 Gold for Egypt. Other civilizations' Trade Routes to Egypt
 *  provide +2 Food for them and +2 Gold for Egypt. Trading with Allies earns
 *  twice as many bonus Alliance Points." */
export const CLEOPATRA_INTL_ROUTE_GOLD = 4;
export const CLEOPATRA_INCOMING_ROUTE_FOOD = 2;
export const CLEOPATRA_INCOMING_ROUTE_GOLD = 2;
export const CLEOPATRA_TRADE_QP_MULT = 2;

/** CIV6 (Thunderbolt of the North): "+50% Production toward all naval melee
 *  units. Receive Science from pillaging and coastal raiding Mines in
 *  addition to Gold. Pillaging or coastal raiding Quarries, Pastures,
 *  Plantations, and Camps also yields Culture" — 15 each
 *  (EFFECT_ADJUST_ADDITIONAL_PILLAGING), scaled like the row's own lump. */
export const HARDRADA_NAVAL_MELEE_PROD_MULT = 1.5;
export const HARDRADA_PILLAGE: readonly { improvement: ImprovementId; kind: 'science' | 'culture'; amount: number }[] = [
  { improvement: 'MINE', kind: 'science', amount: 15 },
  { improvement: 'QUARRY', kind: 'culture', amount: 15 },
  { improvement: 'PASTURE', kind: 'culture', amount: 15 },
  { improvement: 'PLANTATION', kind: 'culture', amount: 15 },
  { improvement: 'CAMP', kind: 'culture', amount: 15 },
];

/** CIV6 (Adventures of Enkidu): "When at war with a common foe, they and
 *  their allies share pillage rewards and share combat experience gains if
 *  within 5 tiles. Their Alliances gain Alliance Points for being at war
 *  with a common foe. +5 Combat Strength against units of civilizations
 *  their allies are at war with." Two points a turn is eight quarter-points. */
export const ENKIDU_WAR_CS = 5;
export const ENKIDU_COMMON_FOE_QP = 8;
export const ENKIDU_SHARE_RANGE = 5;

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

export const PLOT_YIELD_ROWS: readonly PlotYieldRow[] = [
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
];

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
  /** every item of a queue kind */
  every?: 'building' | 'unit';
  pct: number;
}
export const PROD_MULT_ROWS: readonly ProdMultRow[] = [
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
];

/** CIV6 (EFFECT_DISTRICT_ADJACENCY, Meiji Restoration): "+1 standard adjacency
 *  bonus to all districts from adjacent districts" — the district's own yield,
 *  +amount per adjacent district. */
export interface DistrictAdjRow {
  civ?: CivId;
  leader?: LeaderId;
  district: DistrictId;
  amount: number;
  /** per adjacent DISTRICT (the default) or for the district's own RIVER */
  source?: 'RIVER';
}
export const DISTRICT_ADJ_ROWS: readonly DistrictAdjRow[] = [
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
];

/** CIV6 (EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL): a flat yield on
 *  the seat's own international routes. Cleopatra's +4 Gold rides its own
 *  clause; the Intercontinental rows (Spain) wait on a continent model. */
export interface RouteYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
}
export const INTL_ROUTE_YIELD_ROWS: readonly RouteYieldRow[] = [
  // CIV6 (Radio Oranje): "+2 Culture from international Trade Routes."
  { leader: 'WILHELMINA', yield: 'culture', amount: 2 },
];

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
}
export const ROUTE_CAPACITY_ROWS: readonly RouteCapacityRow[] = [
  { civ: 'CREE', amount: 1, tech: 'POTTERY', needsCapital: true },
  { leader: 'DIDO', amount: 1, govPlaza: true },
  { leader: 'DIDO', amount: 1, govTier: 1 },
  { leader: 'DIDO', amount: 1, govTier: 2 },
  { leader: 'DIDO', amount: 1, govTier: 3 },
];

/** Does a roster row name this seat? */
export function rowIsFor(row: { civ?: CivId; leader?: LeaderId }, civ: string | null, leader: string | null): boolean {
  return row.civ !== undefined ? row.civ === civ : row.leader === leader;
}

/**
 * CIV6 (EFFECT_GRANT_ABILITY -> MODIFIER_UNIT_ADJUST_COMBAT_STRENGTH): a flat
 * Combat Strength a civilization's or leader's units carry under a clause —
 * against a city-state's units (Barbarossa), against a wounded unit
 * (Tomyris), for a class (Genghis Khan's cavalry), on a coastal tile (Hojo's
 * land units on coastal land, his hulls on Coast), against a city or
 * district (the Great Turkish Bombard). `classes` names TARGET_CLASSES; an
 * empty list is every combat unit.
 */
export type CombatCsWhen = 'always' | 'foeMinor' | 'foeWounded' | 'foeCity' | 'onCoast';
export interface CombatCsRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  when: CombatCsWhen;
  classes?: readonly string[];
}
export const COMBAT_CS_ROWS: readonly CombatCsRow[] = [
  { leader: 'BARBAROSSA', amount: 7, when: 'foeMinor' },
  { leader: 'TOMYRIS', amount: 5, when: 'foeWounded' },
  { leader: 'GENGHIS_KHAN', amount: 3, when: 'always', classes: ['LIGHT_CAV', 'HEAVY_CAV'] },
  { leader: 'HOJO', amount: 5, when: 'onCoast', classes: ['RECON', 'MELEE', 'RANGED', 'ANTICAV', 'LIGHT_CAV', 'HEAVY_CAV', 'SIEGE'] },
  { leader: 'HOJO', amount: 5, when: 'onCoast', classes: ['NAVAL_MELEE', 'NAVAL_RANGED', 'NAVAL_RAIDER', 'NAVAL_CARRIER'] },
  { civ: 'OTTOMAN', amount: 5, when: 'foeCity', classes: ['SIEGE'] },
];

/** CIV6 (EFFECT_ADJUST_UNIT_POST_COMBAT_HEAL, Tomyris): "Heal after
 *  defeating a unit" — on the same hook the War Department's heal rides. */
export interface PostKillHealRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const POST_KILL_HEAL_ROWS: readonly PostKillHealRow[] = [
  { leader: 'TOMYRIS', amount: 30 },
];

/** CIV6 (EFFECT_ADJUST_UNIT_MOVEMENT under UNIT_EMBARKED): extra Movement
 *  while embarked — Mana's land units, Mediterranean Colonies' Settlers. */
export interface EmbarkMoveRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  settlerOnly?: boolean;
}
export const EMBARK_MOVE_ROWS: readonly EmbarkMoveRow[] = [
  { civ: 'MAORI', amount: 2 },
  { civ: 'PHOENICIA', amount: 2, settlerOnly: true },
];

/** CIV6 (EFFECT_ADJUST_UNIT_IGNORE_SHORES): "No movement penalty for
 *  embarking and disembarking" — the Knarr's every unit, the Mediterranean
 *  Colonies' Settlers. */
export interface IgnoreShoresRow {
  civ?: CivId;
  leader?: LeaderId;
  settlerOnly?: boolean;
}
export const IGNORE_SHORES_ROWS: readonly IgnoreShoresRow[] = [
  { civ: 'NORWAY' },
  { civ: 'PHOENICIA', settlerOnly: true },
];

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
export const CENTER_ADJ_ROWS: readonly CenterAdjRow[] = [
  { civ: 'MALI', terrain: 'DESERT', yield: 'faith', amount: 1 },
  { civ: 'MALI', terrain: 'DESERT', yield: 'food', amount: 1 },
];

/** CIV6 (Nkisi, EFFECT_ADJUST_CITY_GREATWORK_YIELD): "+2 Food, +2 Production,
 *  +1 Faith, and +4 Gold from each Relic, Artifact, and Sculpture" — the
 *  Relic and the Artifact are counted; a Work of Art carries no
 *  sculpture/painting kind on either engine, so that third row waits. */
export interface GreatWorkYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  kind: 'relic' | 'artifact';
  yield: YieldKey;
  amount: number;
}
export const GREAT_WORK_YIELD_ROWS: readonly GreatWorkYieldRow[] = [
  { civ: 'KONGO', kind: 'relic', yield: 'food', amount: 2 },
  { civ: 'KONGO', kind: 'relic', yield: 'production', amount: 2 },
  { civ: 'KONGO', kind: 'relic', yield: 'faith', amount: 1 },
  { civ: 'KONGO', kind: 'relic', yield: 'gold', amount: 4 },
  { civ: 'KONGO', kind: 'artifact', yield: 'food', amount: 2 },
  { civ: 'KONGO', kind: 'artifact', yield: 'production', amount: 2 },
  { civ: 'KONGO', kind: 'artifact', yield: 'faith', amount: 1 },
  { civ: 'KONGO', kind: 'artifact', yield: 'gold', amount: 4 },
];

/** CIV6 (Nkisi, EFFECT_ADJUST_GREAT_PERSON_POINTS_PERCENT): "Receive 50% more
 *  Great Artist, Great Musician, and Great Merchant points." */
export interface GppClassRow {
  civ?: CivId;
  leader?: LeaderId;
  cls: string;
  pct: number;
}
export const GPP_CLASS_ROWS: readonly GppClassRow[] = [
  { civ: 'KONGO', cls: 'ARTIST', pct: 50 },
  { civ: 'KONGO', cls: 'MUSICIAN', pct: 50 },
  { civ: 'KONGO', cls: 'MERCHANT', pct: 50 },
];

/** CIV6 (Workshop of the World, EFFECT_ADJUST_CITY_YIELD_FROM_POWERED_BUILDING):
 *  "Buildings that provide additional yields when Powered receive +4 of that
 *  yield" — one row per yield the install names. */
export interface PoweredYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
}
export const POWERED_YIELD_ROWS: readonly PoweredYieldRow[] = [
  { civ: 'ENGLAND', yield: 'culture', amount: 4 },
  { civ: 'ENGLAND', yield: 'gold', amount: 4 },
  { civ: 'ENGLAND', yield: 'production', amount: 4 },
  { civ: 'ENGLAND', yield: 'science', amount: 4 },
  { civ: 'ENGLAND', yield: 'food', amount: 4 },
];

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
export const STOCKPILE_RATE_ROWS: readonly StockpileRateRow[] = [
  { civ: 'ENGLAND', resource: 'COAL', amount: 2 },
  { civ: 'ENGLAND', resource: 'IRON', amount: 2 },
  { leader: 'LAURIER', terrain: 'TUNDRA', pct: 100 },
  { leader: 'LAURIER', terrain: 'SNOW', pct: 100 },
];

/** CIV6 (Workshop of the World, EFFECT_ADJUST_PLAYER_RESOURCE_STOCKPILE_CAP):
 *  +10 stockpile capacity per Lighthouse, Shipyard and Seaport. */
export interface StockpileCapRow {
  civ?: CivId;
  leader?: LeaderId;
  building: string;
  amount: number;
}
export const STOCKPILE_CAP_ROWS: readonly StockpileCapRow[] = [
  { civ: 'ENGLAND', building: 'LIGHTHOUSE', amount: 10 },
  { civ: 'ENGLAND', building: 'SHIPYARD', amount: 10 },
  { civ: 'ENGLAND', building: 'SEAPORT', amount: 10 },
];

/** CIV6 (Workshop of the World, EFFECT_ADJUST_UNIT_BUILD_CHARGES): "Military
 *  Engineers receive +2 charges." */
export interface UnitChargeRow {
  civ?: CivId;
  leader?: LeaderId;
  unit: string;
  amount: number;
}
export const UNIT_CHARGE_ROWS: readonly UnitChargeRow[] = [
  { civ: 'ENGLAND', unit: 'MILITARY_ENGINEER', amount: 2 },
];

/** CIV6 (The Last Best West, EFFECT_ADJUST_PLOT_PURCHASE_COST_TERRAIN):
 *  "Reduces the purchase cost of tiles in these terrain types by 50%." */
export interface TileCostRow {
  civ?: CivId;
  leader?: LeaderId;
  terrain: TerrainId;
  pct: number;
}
export const TILE_COST_ROWS: readonly TileCostRow[] = [
  { leader: 'LAURIER', terrain: 'TUNDRA', pct: -50 },
  { leader: 'LAURIER', terrain: 'SNOW', pct: -50 },
];

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
export const FARM_TERRAIN_ROWS: readonly FarmTerrainRow[] = [
  { leader: 'LAURIER', terrain: 'TUNDRA', hills: false },
  { leader: 'LAURIER', terrain: 'TUNDRA', hills: true, civic: 'CIVIL_ENGINEERING' },
];

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
export const ROUTE_IMPROVEMENT_ROWS: readonly RouteImprovementRow[] = [
  { leader: 'POUNDMAKER', improvement: 'CAMP', yield: 'food', amount: 1, side: 'origin' },
  { leader: 'POUNDMAKER', improvement: 'CAMP', yield: 'gold', amount: 1, side: 'destination' },
  { leader: 'POUNDMAKER', improvement: 'PASTURE', yield: 'food', amount: 1, side: 'origin' },
  { leader: 'POUNDMAKER', improvement: 'PASTURE', yield: 'gold', amount: 1, side: 'destination' },
];

/** CIV6 (EFFECT_GRANT_UNIT_IN_CITY): a free unit in the capital at a
 *  technology (the Cree Trader at Pottery, Catherine's Spy at Castles), or in
 *  the FIRST city at its founding (Kupe's Builder). Spain's Builder on a
 *  foreign continent waits on C-48. */
export interface GrantUnitRow {
  civ?: CivId;
  leader?: LeaderId;
  unit: string;
  tech?: string;
  firstCity?: boolean;
}
export const GRANT_UNIT_ROWS: readonly GrantUnitRow[] = [
  { civ: 'CREE', unit: 'TRADER', tech: 'POTTERY' },
  { leader: 'CATHERINE_DE_MEDICI', unit: 'SPY', tech: 'CASTLES' },
  { leader: 'KUPE', unit: 'BUILDER', firstCity: true },
];

/** CIV6 (Catherine's Flying Squadron, EFFECT_GRANT_SPY): "extra spy capacity"
 *  with the Castles technology. */
export interface SpyCapacityRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
  amount: number;
}
export const SPY_CAPACITY_ROWS: readonly SpyCapacityRow[] = [
  { leader: 'CATHERINE_DE_MEDICI', tech: 'CASTLES', amount: 1 },
];

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
export const CAPITAL_ROWS: readonly CapitalRow[] = [
  { leader: 'KUPE', firstCityPop: 1, palaceHousing: 3, palaceAmenities: 1, presettleYields: { science: 2, culture: 2 } },
];
