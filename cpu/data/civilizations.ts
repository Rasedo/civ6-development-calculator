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
  /** per adjacent DISTRICT (the default), the district's own RIVER, or per
   *  adjacent tile of a FEATURE */
  source?: 'RIVER' | 'RAINFOREST';
}
export const DISTRICT_ADJ_ROWS: readonly DistrictAdjRow[] = [
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
/** CIV6: `foeGolden` is Swift Hawk's "civilizations that are in a Golden or
 *  Heroic Age" — a HEROIC age IS a golden one on both engines, so the test is
 *  the age alone. Its "or Free Cities" half waits on a Free City existing. */
export type CombatCsWhen = 'always' | 'foeMinor' | 'foeWounded' | 'foeCity' | 'onCoast' | 'foeGolden';
/** CIV6 (Thermopylae, ABILITY_GORGO_POLICY_SLOT_COMBAT_BONUS): "+1 Combat
 *  Strength for every Military Policy slotted" — the row's amount is paid ONCE
 *  PER slotted policy of the named kind instead of flat. */
export type CombatCsPer = 'militaryPolicy';
export interface CombatCsRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
  when: CombatCsWhen;
  classes?: readonly string[];
  /** the amount is paid once per slotted policy of this kind */
  per?: CombatCsPer;
}
export const COMBAT_CS_ROWS: readonly CombatCsRow[] = [
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
  // CIV6 (The First Emperor): "Builders receive an additional charge."
  { leader: 'QIN', unit: 'BUILDER', amount: 1 },
  // CIV6 (El Escorial): "Inquisitors can Remove Heresy one extra time."
  { leader: 'PHILIP_II', unit: 'INQUISITOR', amount: 1 },
  // CIV6 (Dharma): "Missionaries have +2 spreads."
  { civ: 'INDIA', unit: 'MISSIONARY', amount: 2 },
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
export const HAPPY_YIELD_ROWS: readonly HappyYieldRow[] = [
  { civ: 'SCOTLAND', tier: 'Happy', yield: 'science', pct: 5 },
  { civ: 'SCOTLAND', tier: 'Happy', yield: 'production', pct: 5 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', yield: 'science', pct: 10 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', yield: 'production', pct: 10 },
];

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
export const HAPPY_GPP_ROWS: readonly HappyGppRow[] = [
  { civ: 'SCOTLAND', tier: 'Happy', cls: 'SCIENTIST', district: 'CAMPUS', amount: 1 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', cls: 'SCIENTIST', district: 'CAMPUS', amount: 2 },
  { civ: 'SCOTLAND', tier: 'Happy', cls: 'ENGINEER', district: 'INDUSTRIAL_ZONE', amount: 1 },
  { civ: 'SCOTLAND', tier: 'Ecstatic', cls: 'ENGINEER', district: 'INDUSTRIAL_ZONE', amount: 2 },
];

/** CIV6 (EFFECT_ADJUST_PLAYER_GOVERNMENT_SLOT_TYPE): a policy slot of one kind
 *  in every government — Plato's Republic's Wildcard, the Holy Roman
 *  Emperor's Military. */
export interface PolicySlotRow {
  civ?: CivId;
  leader?: LeaderId;
  kind: 'military' | 'economic' | 'diplomatic' | 'wildcard';
  amount: number;
}
export const POLICY_SLOT_ROWS: readonly PolicySlotRow[] = [
  { civ: 'GREECE', kind: 'wildcard', amount: 1 },
  { leader: 'BARBAROSSA', kind: 'military', amount: 1 },
];

/** CIV6 (EFFECT_ADJUST_UNIT_POST_COMBAT_YIELD): "Combat victories provide
 *  Culture/Faith equal to 50% of the Combat Strength of the defeated unit" —
 *  the DEFEATED type's own strength, banked in the killer's purse. */
export interface PostCombatYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  pctOfDefeated: number;
}
export const POST_COMBAT_YIELD_ROWS: readonly PostCombatYieldRow[] = [
  { leader: 'GORGO', yield: 'culture', pctOfDefeated: 50 },
  { leader: 'TAMAR', yield: 'faith', pctOfDefeated: 50 },
];

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
export const WORK_IMPASSABLE_ROWS: readonly WorkImpassableRow[] = [
  { civ: 'INCA', mountain: true },
];

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
export const ROUTE_TERRAIN_ROWS: readonly RouteTerrainRow[] = [
  { leader: 'PACHACUTI', mountain: true, yield: 'food', amount: 1 },
];

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
export const GOVERNOR_YIELD_ROWS: readonly GovernorYieldRow[] = [
  { civ: 'MAPUCHE', yield: 'culture', pct: 5, founded: true },
  { civ: 'MAPUCHE', yield: 'production', pct: 5, founded: true },
  { civ: 'MAPUCHE', yield: 'culture', pct: 15, founded: false },
  { civ: 'MAPUCHE', yield: 'production', pct: 15, founded: false },
];

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
export const GOVERNOR_LOYALTY_ROWS: readonly GovernorLoyaltyRow[] = [
  { civ: 'MAPUCHE', amount: 4, range: 9 },
];

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
export const GARRISON_LOYALTY_ROWS: readonly GarrisonLoyaltyRow[] = [
  { civ: 'ZULU', amount: 3, formation: false },
  { civ: 'ZULU', amount: 2, formation: true },
];

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
export const FORMATION_ROWS: readonly FormationRow[] = [
  { leader: 'SHAKA', tier: 1, naval: false, civic: 'MERCENARIES', cs: 5 },
  { leader: 'SHAKA', tier: 2, naval: false, civic: 'NATIONALISM', cs: 5 },
  { civ: 'SPAIN', tier: 1, naval: true, civic: 'MERCANTILISM' },
  { civ: 'SPAIN', tier: 2, naval: true, civic: 'MERCANTILISM' },
];

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
export const TERRAIN_ADJ_YIELD_ROWS: readonly TerrainAdjYieldRow[] = [
  { civ: 'INCA', mountain: true, improvement: 'TERRACE_FARM', yield: 'food', amount: 1 },
];

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
export const GOVERNOR_TITLE_YIELD_ROWS: readonly GovernorTitleYieldRow[] = [
  { leader: 'SEONDEOK', yield: 'culture', pct: 3 },
  { leader: 'SEONDEOK', yield: 'science', pct: 3 },
];

/** CIV6 (Nobel Prize, EFFECT_ADJUST_GREAT_PERSON_POINTS): "+1 Great Engineer
 *  point from Factories and +1 Great Scientist point from Universities." */
export interface GppBuildingRow {
  civ?: CivId;
  leader?: LeaderId;
  building: string;
  cls: string;
  amount: number;
}
export const GPP_BUILDING_ROWS: readonly GppBuildingRow[] = [
  { civ: 'SWEDEN', building: 'FACTORY', cls: 'ENGINEER', amount: 1 },
  { civ: 'SWEDEN', building: 'UNIVERSITY', cls: 'SCIENTIST', amount: 1 },
];

/** CIV6 (Nobel Prize): "gains 50 Diplomatic Favor when earning a Great Person
 *  (on Standard Speed)." */
export interface GreatPersonFavorRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const GP_FAVOR_ROWS: readonly GreatPersonFavorRow[] = [
  { civ: 'SWEDEN', amount: 50 },
];

/** CIV6 (Mana, EFFECT_GRANT_PLAYER_SPECIFIC_TECHNOLOGY): "Begin the game with
 *  the Sailing and Shipbuilding technologies unlocked." */
export interface StartTechRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
}
export const START_TECH_ROWS: readonly StartTechRow[] = [
  { civ: 'MAORI', tech: 'SAILING' },
  { civ: 'MAORI', tech: 'SHIPBUILDING' },
];

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
export const SEAT_BAN_ROWS: readonly SeatBanRow[] = [
  { civ: 'MAORI', ban: 'harvest' },
  { civ: 'MAORI', ban: 'greatWriter' },
  { leader: 'MVEMBA', ban: 'holySite' },
  { leader: 'MVEMBA', ban: 'greatProphet' },
  { leader: 'MVEMBA', ban: 'foundReligion' },
];

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
export const WORSHIP_ROWS: readonly WorshipRow[] = [
  { leader: 'SALADIN', costPct: 10, yieldPct: 10 },
];

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
export const OCEAN_ACCESS_ROWS: readonly OceanAccessRow[] = [
  { civ: 'NORWAY', tech: 'SHIPBUILDING' },
  { civ: 'MAORI', tech: null },
];

export const DISTRICT_UNIT_ROWS: readonly DistrictUnitRow[] = [
  { leader: 'MVEMBA', district: 'THEATER_SQUARE', unit: 'APOSTLE' },
];

// ---------------------------------------------------------------------------
// THE CONQUERED CITY, THE SECOND HORSE AND THE BOOST

/** CIV6 (People of the Steppe, EFFECT_ADJUST_EXTRA_UNIT_COPY_TAG): "Receive a
 *  second light cavalry unit ... each time you train a light cavalry unit."
 *  A TRAINED unit only — the install's collection is the player's units and
 *  the real game excludes a purchase, exactly as the Venetian Arsenal does. */
export interface ExtraUnitCopyRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the unit CLASS the copy follows */
  cls: string;
  amount: number;
}
/** the WIRE's index space for a copy row's class — both engines address one
 *  by position, and the unit plane behind each is named on the unit row. */
export const COPY_CLASSES = ['LIGHT_CAVALRY'] as const;
export const EXTRA_UNIT_COPY_ROWS: readonly ExtraUnitCopyRow[] = [
  { civ: 'SCYTHIA', cls: 'LIGHT_CAVALRY', amount: 1 },
];

/** CIV6 (Great Turkish Bombard, EFFECT_ADJUST_POPULATION_AFTER_CONQUEST):
 *  "Conquered cities do not lose Population" — the PERCENTAGE of the
 *  captured city's population this row keeps, over the usual loss. */
export interface ConquestPopRow {
  civ?: CivId;
  leader?: LeaderId;
  /** 100 = the whole population survives */
  keepPct: number;
}
export const CONQUEST_POP_ROWS: readonly ConquestPopRow[] = [
  { civ: 'OTTOMAN', keepPct: 100 },
];

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
export const NOT_FOUNDED_ROWS: readonly NotFoundedRow[] = [
  { civ: 'OTTOMAN', channel: 'amenity', amount: 1 },
  { civ: 'OTTOMAN', channel: 'loyalty', amount: 4 },
];

/** CIV6 (Free Imperial Cities, EFFECT_ADJUST_CITY_EXTRA_DISTRICTS): "Each city
 *  can build one more district than usual (exceeding the normal limit based on
 *  Population)." */
export interface ExtraDistrictRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const EXTRA_DISTRICT_ROWS: readonly ExtraDistrictRow[] = [
  { civ: 'GERMANY', amount: 1 },
];

/** CIV6 (Mother Russia, EFFECT_ADJUST_PLAYER_CITY_TILES): "Extra territory
 *  upon founding cities" — the install's Amount is 5, not the eight the
 *  civilopedia's prose suggests. */
export interface CityTilesRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const CITY_TILES_ROWS: readonly CityTilesRow[] = [
  { civ: 'RUSSIA', amount: 5 },
];

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
export const BOOST_PCT_ROWS: readonly BoostPctRow[] = [
  { civ: 'CHINA', tech: true, points: 10 },
  { civ: 'CHINA', tech: false, points: 10 },
];

/** CIV6 (The First Emperor, EFFECT_ADJUST_DISTRICT_PREREQ): "Canals are
 *  unlocked with the Masonry technology" — the row REPLACES the district's
 *  own unlock. */
export interface DistrictPrereqRow {
  civ?: CivId;
  leader?: LeaderId;
  district: DistrictId;
  tech: string;
}
export const DISTRICT_PREREQ_ROWS: readonly DistrictPrereqRow[] = [
  { leader: 'QIN', district: 'CANAL', tech: 'MASONRY' },
];

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
export const WAR_WEARINESS_ROWS: readonly WarWearinessRow[] = [
  { leader: 'GANDHI', enemyPct: 100 },
];

/** CIV6 (Satyagraha, EFFECT_ADJUST_PLAYER_FAITH_PEACEFUL_FOUNDERS): "+5 Faith
 *  for each civilization (including India) they have met that has founded a
 *  Religion and is not currently at war." */
export interface PeacefulFounderRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const PEACEFUL_FOUNDER_ROWS: readonly PeacefulFounderRow[] = [
  { leader: 'GANDHI', amount: 5 },
];

/** CIV6 (Surrounded by Glory, EFFECT_ADJUST_PLAYER_YIELD_MODIFIER_PER_TRIBUTARY):
 *  "+5% Culture per city-state you are the Suzerain of." */
export interface YieldPerSuzerainRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  pct: number;
}
export const YIELD_PER_SUZERAIN_ROWS: readonly YieldPerSuzerainRow[] = [
  { leader: 'PERICLES', yield: 'culture', pct: 5 },
];

/** CIV6 (Grand Vizier, EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS): "Gain ... a
 *  Governor Title when the Gunpowder technology is researched" — RunOnce. */
export interface GovernorTitleGrantRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
  amount: number;
}
export const GOVERNOR_TITLE_GRANT_ROWS: readonly GovernorTitleGrantRow[] = [
  { leader: 'SULEIMAN', tech: 'GUNPOWDER', amount: 1 },
];

/** CIV6 (Magnanimous, EFFECT_ADJUST_GREAT_PERSON_POINTS_REFUND_PERCENT):
 *  "After recruiting or patronizing a Great Person, 20% of its Great Person
 *  point cost is refunded." */
export interface GpRefundRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const GP_REFUND_ROWS: readonly GpRefundRow[] = [
  { leader: 'PEDRO', pct: 20 },
];

/** CIV6 (El Escorial, EFFECT_ADJUST_UNIT_EVICT_PERCENT): "Inquisitors
 *  eliminate 100% of the presence of other Religions" — the install adds 25
 *  PERCENTAGE POINTS to the base Remove Heresy share. */
export interface EvictPctRow {
  civ?: CivId;
  leader?: LeaderId;
  points: number;
}
export const EVICT_PCT_ROWS: readonly EvictPctRow[] = [
  { leader: 'PHILIP_II', points: 25 },
];

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
export const RELIGION_AMENITY_ROWS: readonly ReligionAmenityRow[] = [
  { civ: 'INDIA', followers: 1, amenities: 1 },
];

/** CIV6 (Dharma, EFFECT_ADJUST_GAINS_ALL_FOLLOWER_BELIEFS): "Receives Follower
 *  Belief bonuses in a city from each Religion that has at least 1 Follower." */
export interface AllFollowerBeliefsRow {
  civ?: CivId;
  leader?: LeaderId;
}
export const ALL_FOLLOWER_BELIEFS_ROWS: readonly AllFollowerBeliefsRow[] = [
  { civ: 'INDIA' },
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
export const ROUTE_PRESSURE_ROWS: readonly RoutePressureRow[] = [
  { civ: 'INDIA', origin: true, destination: true, pct: 100 },
];

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
export const FOREIGN_FOLLOWER_YIELD_ROWS: readonly ForeignFollowerYieldRow[] = [
  { civ: 'ARABIA', yield: 'science', amount: 1, per: 1 },
];

/** CIV6 (The Last Prophet, EFFECT_ADJUST_GREAT_PERSON_GUARANTEE):
 *  "Automatically receive the final Great Prophet when the next-to-last one is
 *  claimed (if you have not earned a Great Prophet already)." */
export interface GreatPersonGuaranteeRow {
  civ?: CivId;
  leader?: LeaderId;
  cls: string;
}
export const GP_GUARANTEE_ROWS: readonly GreatPersonGuaranteeRow[] = [
  { civ: 'ARABIA', cls: 'PROPHET' },
];

/** CIV6 (Songs of the Jeli, EFFECT_ENABLE_BUILDING_FAITH_PURCHASE): "May
 *  purchase Commercial Hub district buildings with Faith." */
export interface FaithPurchaseDistrictRow {
  civ?: CivId;
  leader?: LeaderId;
  district: DistrictId;
}
export const FAITH_PURCHASE_DISTRICT_ROWS: readonly FaithPurchaseDistrictRow[] = [
  { civ: 'MALI', district: 'COMMERCIAL_HUB' },
];

/** CIV6 (Mediterranean Colonies, EFFECT_GRANT_PLAYER_SPECIFIC_TECH_BOOST):
 *  "Begin the game with the Writing technology Eureka." */
export interface StartBoostRow {
  civ?: CivId;
  leader?: LeaderId;
  tech: string;
}
export const START_BOOST_ROWS: readonly StartBoostRow[] = [
  { civ: 'PHOENICIA', tech: 'WRITING' },
];

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
export const POST_COMBAT_LOYALTY_ROWS: readonly PostCombatLoyaltyRow[] = [
  { leader: 'LAUTARO', amount: -20, goldenExtra: -20 },
];

/** CIV6 (Raven King, EFFECT_ADJUST_PLAYER_LEVIED_UNIT_UPGRADE_DISCOUNT_PERCENT
 *  and EFFECT_GRANT_INFLUENCE_TOKEN_LEVY_MILITARY): "levied units cost 75%
 *  less to upgrade" and a levy hands back two Envoys. */
export interface LevyRow {
  civ?: CivId;
  leader?: LeaderId;
  upgradeDiscountPct: number;
  envoys: number;
}
export const LEVY_ROWS: readonly LevyRow[] = [
  { leader: 'MATTHIAS_CORVINUS', upgradeDiscountPct: 75, envoys: 2 },
];

/** CIV6 (Radio Oranje, EFFECT_ADJUST_PLAYER_IDENTITY_PER_TURN_FOR_DOMESTIC_TRADE_ROUTE_ORIGIN):
 *  "+2 Loyalty per turn in the ORIGIN city of a domestic Trade Route." */
export interface DomesticRouteLoyaltyRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const DOMESTIC_ROUTE_LOYALTY_ROWS: readonly DomesticRouteLoyaltyRow[] = [
  { leader: 'WILHELMINA', amount: 2 },
];

/** CIV6 (Radio Oranje, EFFECT_ADJUST_TRADE_ROUTE_YIELD_FROM_OTHERS): "+2
 *  Culture from each Trade Route another civilization sends to this one." */
export interface IncomingRouteYieldRow {
  civ?: CivId;
  leader?: LeaderId;
  yield: YieldKey;
  amount: number;
}
export const INCOMING_ROUTE_YIELD_ROWS: readonly IncomingRouteYieldRow[] = [
  { leader: 'WILHELMINA', yield: 'culture', amount: 2 },
];

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
export const WONDER_ERA_PROD_ROWS: readonly WonderEraProdRow[] = [
  { civ: 'FRANCE', startEra: 'Medieval', endEra: 'Industrial', pct: 20 },
];

/** CIV6 (France, EFFECT_ADJUST_CITY_TOURISM): "Tourism from wonders of any era
 *  is +100%" — the install's ScalingFactor is 200, so the row carries the
 *  ADDED percentage. */
export interface WonderTourismRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const WONDER_TOURISM_ROWS: readonly WonderTourismRow[] = [
  { civ: 'FRANCE', pct: 100 },
];

/** CIV6 (Pearl of the Danube): "+50% Production to Districts and Buildings
 *  constructed ACROSS A RIVER from a City Center." */
export interface RiverCrossProdRow {
  civ?: CivId;
  leader?: LeaderId;
  kind: 'district' | 'building';
  pct: number;
}
export const RIVER_CROSS_PROD_ROWS: readonly RiverCrossProdRow[] = [
  { civ: 'HUNGARY', kind: 'district', pct: 50 },
  { civ: 'HUNGARY', kind: 'building', pct: 50 },
];

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
export const DIPLO_VIS_ROWS: readonly DiploVisRow[] = [
  { civ: 'MONGOLIA', postLevels: 1, flatLevels: 0, csPerLevel: 3 },
  // CIV6 (Flying Squadron): "Has 1 level of Diplomatic Visibility greater
  // than normal with every civilization that she's met."
  { leader: 'CATHERINE_DE_MEDICI', postLevels: 0, flatLevels: 1, csPerLevel: 0 },
];

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
export const WAR_BAN_ROWS: readonly WarBanRow[] = [
  { civ: 'CANADA', ban: 'surpriseByMe' },
  { civ: 'CANADA', ban: 'surpriseOnMe' },
  { civ: 'CANADA', ban: 'onCityState' },
];

/** CIV6 (Faces of Peace, EFFECT_ADJUST_PLAYER_TOURISM_FAVOR): "For every 100
 *  Tourism per turn earn 1 Diplomatic Favor per turn." */
export interface TourismFavorRow {
  civ?: CivId;
  leader?: LeaderId;
  perTourism: number;
  favor: number;
}
export const TOURISM_FAVOR_ROWS: readonly TourismFavorRow[] = [
  { civ: 'CANADA', perTourism: 100, favor: 1 },
];

/** CIV6 (Faces of Peace, EFFECT_ADJUST_PLAYER_EMERGENCY_FAVOR_MODIFIER):
 *  "+100% Diplomatic Favor from successfully completing an Emergency or Scored
 *  Competition" — as a MEMBER of it. */
export interface EmergencyFavorRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const EMERGENCY_FAVOR_ROWS: readonly EmergencyFavorRow[] = [
  { civ: 'CANADA', pct: 100 },
];

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
export const GOLDEN_DEDICATION_ROWS: readonly GoldenDedicationRow[] = [
  { civ: 'GEORGIA', count: 1 },
];

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
export const INTL_ROUTE_TERRAIN_ROWS: readonly IntlRouteTerrainRow[] = [
  { leader: 'MANSA_MUSA', terrain: 'DESERT', flatOnly: true, yield: 'gold', amount: 1 },
];

/** CIV6 (Sahel Merchants, EFFECT_GRANT_GOLDEN_AGE_TRADE_ROUTE_CAPACITY):
 *  "Receive +1 Trade Capacity every time you enter a Golden Age." */
export interface GoldenRouteCapacityRow {
  civ?: CivId;
  leader?: LeaderId;
  amount: number;
}
export const GOLDEN_ROUTE_CAPACITY_ROWS: readonly GoldenRouteCapacityRow[] = [
  { leader: 'MANSA_MUSA', amount: 1 },
];

/** CIV6 (The Grand Embassy, EFFECT_ADJUST_PLAYER_PROGRESS_DIFF_TRADE_BONUS):
 *  "Receives Science or Culture from Trade Routes to civilizations that are
 *  more advanced than Russia. +1 per 3 technologies or civics ahead." */
export interface ProgressTradeRow {
  civ?: CivId;
  leader?: LeaderId;
  /** how many techs (or civics) ahead one point of yield costs */
  per: number;
}
export const PROGRESS_TRADE_ROWS: readonly ProgressTradeRow[] = [
  { leader: 'PETER_GREAT', per: 3 },
];

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
/** OPEN: the Janissary is not in the engine's unit roster, so this row has
 *  no chassis to charge — it is not on the wire (docs/roster_ledger.json). */
export const UNIT_POP_COST_ROWS: readonly UnitPopCostRow[] = [
  { leader: 'SULEIMAN', unit: 'JANISSARY', amount: -1, foundedOnly: true },
];

/** CIV6 (Kristina, EFFECT_ADJUST_AUTO_THEMED_BUILDINGS_WITH_X_SLOTS):
 *  "Buildings with at least three Great Work slots and wonders with at least
 *  two Great Work slots are automatically themed when they have all their
 *  slots filled." */
export interface AutoThemeRow {
  civ?: CivId;
  leader?: LeaderId;
  /** the slot count at or above which the carrier themes itself */
  slots: number;
  wonder: boolean;
}
/** OPEN against C-59: only a MUSEUM themes on either engine, and a wonder
 *  never does, so a generic themed carrier has nowhere to land. Not on the
 *  wire (docs/roster_ledger.json). */
export const AUTO_THEME_ROWS: readonly AutoThemeRow[] = [
  { leader: 'KRISTINA', slots: 3, wonder: false },
  { leader: 'KRISTINA', slots: 2, wonder: true },
];

/** CIV6 (Kristina, EFFECT_ADJUST_ALL_GREAT_WORKS_YIELDS_MODIFIER /
 *  _TOURISM_MODIFIER): what a THEMED carrier pays over its works' face. */
export interface ThemedBonusRow {
  civ?: CivId;
  leader?: LeaderId;
  yieldPct: number;
  tourismPct: number;
}
export const THEMED_BONUS_ROWS: readonly ThemedBonusRow[] = [
  { leader: 'KRISTINA', yieldPct: 100, tourismPct: 100 },
];

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
export const SLOT_CONVERT_ROWS: readonly SlotConvertRow[] = [
  { civ: 'AMERICA', from: 'diplomatic', to: 'wildcard' },
];

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
export const SLOT_FAVOR_ROWS: readonly SlotFavorRow[] = [
  { civ: 'AMERICA', kind: 'wildcard', favor: 1 },
];

/** CIV6 (Founder of Carthage, EFFECT_ADJUST_ALL_DISTRICT_PRODUCTION_MODIFIER):
 *  "+50% Production toward districts in the city with the Government Plaza." */
export interface PlazaDistrictProdRow {
  civ?: CivId;
  leader?: LeaderId;
  pct: number;
}
export const PLAZA_DISTRICT_PROD_ROWS: readonly PlazaDistrictProdRow[] = [
  { leader: 'DIDO', pct: 50 },
];

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
export const GREAT_WORK_LOYALTY_ROWS: readonly GreatWorkLoyaltyRow[] = [
  { leader: 'ELEANOR_ENGLAND', amount: -1, range: 9 },
  { leader: 'ELEANOR_FRANCE', amount: -1, range: 9 },
];

/** CIV6 (Eleanor, EFFECT_ADJUST_PLAYER_SKIP_FREE_CITY_STEP): "A city that
 *  leaves another civilization due to a loss of Loyalty and is currently
 *  receiving the most Loyalty per turn from Eleanor's civilization skips the
 *  Free City step to join this civilization." */
export interface SkipFreeCityRow {
  civ?: CivId;
  leader?: LeaderId;
}
/** OPEN against C-60: neither engine models a Free City at all — a city that
 *  loses its loyalty goes straight to the highest-pressure seat — so every
 *  seat already behaves as Eleanor alone should. Not on the wire
 *  (docs/roster_ledger.json). */
export const SKIP_FREE_CITY_ROWS: readonly SkipFreeCityRow[] = [
  { leader: 'ELEANOR_ENGLAND' },
  { leader: 'ELEANOR_FRANCE' },
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
export const GOVERNOR_XP_ROWS: readonly GovernorXpRow[] = [
  { civ: 'MAPUCHE', pct: 10, founded: true },
  { civ: 'MAPUCHE', pct: 30, founded: false },
];

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
export const PARK_APPEAL_ROWS: readonly ParkAppealRow[] = [
  { leader: 'T_ROOSEVELT', amount: 1 },
];

export const SPY_PROMO_ROWS: readonly SpyPromoRow[] = [
  { leader: 'CATHERINE_DE_MEDICI', promotions: 1 },
];

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
export const CULTURE_BOMB_ROWS: readonly CultureBombRow[] = [
  { civ: 'MAORI', improvement: 'FISHING_BOATS' },
  { civ: 'NETHERLANDS', district: 'HARBOR' },
];

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
export const WONDER_CHARGE_ROWS: readonly WonderChargeRow[] = [
  { leader: 'QIN', startEra: 'Ancient', endEra: 'Classical', pct: 15 },
];
