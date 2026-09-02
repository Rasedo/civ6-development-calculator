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
  building?: string;
  district?: DistrictId;
  promoClass?: string;
  pct: number;
}
export const PROD_MULT_ROWS: readonly ProdMultRow[] = [
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
}
export const DISTRICT_ADJ_ROWS: readonly DistrictAdjRow[] = [
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
