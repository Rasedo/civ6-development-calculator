/**
 * City-state definitions (base Civ 6 envoy system, eyeballed numbers).
 * Envoy bonuses: 1 envoy = +2 type-yield in the capital; 3 envoys = +2 in
 * every city's matching district; 6 envoys = a further +2 per district.
 * Suzerain (3+ envoys, most among majors — trivially you, solo) adds a
 * type-specific perk.
 */

import type { CityStateType, DistrictId, YieldKey } from '../core/types';

export const CITY_STATE_TYPES: CityStateType[] = [
  'scientific',
  'cultural',
  'trade',
  'industrial',
  'militaristic',
  'religious',
];

/** Yield each type grants through envoys. */
export const CS_TYPE_YIELD: Record<CityStateType, YieldKey> = {
  scientific: 'science',
  cultural: 'culture',
  trade: 'gold',
  industrial: 'production',
  militaristic: 'production',
  religious: 'faith',
};

/** District whose presence carries the 3- and 6-envoy bonuses. */
export const CS_TYPE_DISTRICT: Record<CityStateType, DistrictId> = {
  scientific: 'CAMPUS',
  cultural: 'THEATER_SQUARE',
  trade: 'COMMERCIAL_HUB',
  industrial: 'INDUSTRIAL_ZONE',
  militaristic: 'ENCAMPMENT',
  religious: 'HOLY_SITE',
};

export const CS_TYPE_COLORS: Record<CityStateType, string> = {
  scientific: '#4a90d9',
  cultural: '#b05fb0',
  trade: '#d9a94a',
  industrial: '#b3763e',
  militaristic: '#c0392b',
  religious: '#e8e4d8',
};

export const CS_NAMES: Record<CityStateType, string[]> = {
  scientific: ['Geneva', 'Stockholm', 'Seoul', 'Anshan'],
  cultural: ['Vilnius', 'Antioch', 'Kumasi', 'Caguana'],
  trade: ['Amsterdam', 'Zanzibar', 'Bandar Brunei', 'Hunza'],
  industrial: ['Toronto', 'Buenos Aires', 'Cardiff', 'Mexico City'],
  militaristic: ['Kabul', 'Carthage', 'Preslav', 'Valletta'],
  religious: ['Jerusalem', 'La Venta', 'Yerevan', 'Armagh'],
};

/** Influence points needed per envoy. */
export const ENVOY_COST = 100;
/** Base influence per turn; +1 per government tier above Chiefdom. */
export const INFLUENCE_PER_TURN = 3;
/** Envoy thresholds and per-threshold district yield amount. */
export const ENVOY_THRESHOLDS = [1, 3, 6] as const;
export const CS_CAPITAL_BONUS = 2;
export const CS_DISTRICT_BONUS = 2;
/** Envoys needed to be suzerain (solo: no competition). */
export const SUZERAIN_ENVOYS = 3;
/** New quests are issued this many turns after the last one resolved. */
export const QUEST_COOLDOWN = 12;
/** Quest reward. */
export const QUEST_ENVOYS = 1;
/** Siege hit points of a city-state. */
export const CS_MAX_HP = 150;
/** Suzerain levy from militaristic city-states: units granted, gold, cooldown. */
export const LEVY_UNITS = 2;
export const LEVY_GOLD_COST = 120;
export const LEVY_COOLDOWN = 20;

/** Government tier for influence accrual (matches data/policies tiers). */
export const GOV_INFLUENCE_TIER: Record<string, number> = {
  CHIEFDOM: 0,
  AUTOCRACY: 1,
  OLIGARCHY: 1,
  CLASSICAL_REPUBLIC: 1,
  MONARCHY: 2,
  THEOCRACY: 2,
  MERCHANT_REPUBLIC: 2,
  DEMOCRACY: 3,
  COMMUNISM: 3,
  FASCISM: 3,
};
