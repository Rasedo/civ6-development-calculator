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

// B-21: the real GS 3-/6-envoy bonuses key to the DISTRICT's BUILDING TIERS,
// not the district itself (a Campus with a Library + University earns the
// scientific bonus TWICE in real Civ 6). This table records those real building
// tiers per type, restricted to buildings that EXIST in this roster. The LIVE
// envoy-bonus channel (csEnvoyBonuses/envoyBonusDelta + the GPU district-bonus
// term) stays DISTRICT-keyed per the B-21 scope ("suzerain/quest logic stays as
// is") — this is the catalog data for a future building-keyed wiring round.
// Inert in the parity gate regardless: the scripted scenario never lifts a
// city-state past 1 envoy, so the 3-envoy threshold is unreachable there.
export const CS_TYPE_BUILDINGS: Record<CityStateType, string[]> = {
  scientific: ['LIBRARY', 'UNIVERSITY', 'RESEARCH_LAB'],
  cultural: ['AMPHITHEATER', 'MUSEUM', 'BROADCAST_CENTER'],
  trade: ['MARKET', 'BANK', 'STOCK_EXCHANGE'],
  industrial: ['WORKSHOP', 'FACTORY', 'POWER_PLANT'],
  militaristic: ['BARRACKS', 'STABLE', 'ARMORY', 'MILITARY_ACADEMY'],
  religious: ['SHRINE', 'TEMPLE'],
};

// B-21: per-CS UNIQUE suzerain bonus table (real GS bonuses, degraded to a
// description + the closest expressible channel). The suzerain PERK logic stays
// type-generic (isSuzerain / csTradeCapacityBonus / the militaristic levy) per
// the B-21 scope, so this table is catalog DATA — it documents each named
// city-state's real bonus for a future per-CS wiring round. Names mirror
// CS_NAMES (type × 4). `channel` names the existing yield/effect surface a
// future wiring would use; `note` records what the real bonus needs that this
// model lacks (tourism, spies, naval, era score, combat) → degraded/inert.
export interface SuzerainBonusDef {
  name: string;
  type: CityStateType;
  bonus: string;
  channel?: YieldKey | 'amenities' | 'production-capital' | 'none';
  note?: string;
}
export const CS_SUZERAIN_BONUS: Record<string, SuzerainBonusDef> = {
  // scientific
  Geneva: { name: 'Geneva', type: 'scientific', bonus: '+15% science while not at war with any civ.', channel: 'science' },
  Stockholm: { name: 'Stockholm', type: 'scientific', bonus: '+2 science per specialty district building tier.', channel: 'science' },
  Seoul: { name: 'Seoul', type: 'scientific', bonus: '+science per turn per Campus adjacency.', channel: 'science' },
  Anshan: { name: 'Anshan', type: 'scientific', bonus: '+1 science & +1 culture from Great Works / relics.', channel: 'science', note: 'Great-Work slots are Slice Q' },
  // cultural
  Vilnius: { name: 'Vilnius', type: 'cultural', bonus: '+2 culture per specialty district building tier.', channel: 'culture' },
  Antioch: { name: 'Antioch', type: 'cultural', bonus: 'Extra trade-route yields / market access.', channel: 'gold', note: 'trade routes are B-23 (deferred)' },
  Kumasi: { name: 'Kumasi', type: 'cultural', bonus: '+2 culture & +1 faith from trade routes to city-states.', channel: 'culture', note: 'trade routes are B-23' },
  Caguana: { name: 'Caguana', type: 'cultural', bonus: '+1 culture from plantations / +appeal.', channel: 'culture', note: 'appeal partly modeled' },
  // trade
  Amsterdam: { name: 'Amsterdam', type: 'trade', bonus: '+gold from trade routes / luxuries.', channel: 'gold', note: 'trade routes are B-23' },
  Zanzibar: { name: 'Zanzibar', type: 'trade', bonus: 'Monopoly luxuries: +amenities & +gold.', channel: 'gold' },
  'Bandar Brunei': { name: 'Bandar Brunei', type: 'trade', bonus: '+gold from sea resources.', channel: 'gold', note: 'naval yields degraded' },
  Hunza: { name: 'Hunza', type: 'trade', bonus: '+gold on trade routes per resource passed.', channel: 'gold', note: 'trade routes are B-23' },
  // industrial
  Toronto: { name: 'Toronto', type: 'industrial', bonus: '+production toward wonders/buildings when powered.', channel: 'production', note: 'power system not modeled' },
  'Buenos Aires': { name: 'Buenos Aires', type: 'industrial', bonus: 'Bonus resources also give +amenities.', channel: 'amenities' },
  Cardiff: { name: 'Cardiff', type: 'industrial', bonus: '+production & +gold from Harbor power.', channel: 'production', note: 'power system not modeled' },
  'Mexico City': { name: 'Mexico City', type: 'industrial', bonus: '+15% production toward Projects.', channel: 'production' },
  // militaristic
  Kabul: { name: 'Kabul', type: 'militaristic', bonus: 'Units earn +XP from combat.', channel: 'none', note: 'unit XP not modeled' },
  Carthage: { name: 'Carthage', type: 'militaristic', bonus: '+Encampment building production; free maintenance for melee.', channel: 'production' },
  Preslav: { name: 'Preslav', type: 'militaristic', bonus: 'Heavy/light cavalry +combat & +movement in enemy land.', channel: 'none', note: 'unit roster is B-10' },
  Valletta: { name: 'Valletta', type: 'militaristic', bonus: 'Gold-purchase Renaissance/ancient walls & buildings in cities with a wall.', channel: 'production' },
  // religious
  Jerusalem: { name: 'Jerusalem', type: 'religious', bonus: 'Your religion counts as majority for envoy effects; +faith.', channel: 'faith', note: 'religion depth is Slice Q' },
  'La Venta': { name: 'La Venta', type: 'religious', bonus: 'Builders can build a special improvement for faith.', channel: 'faith' },
  Yerevan: { name: 'Yerevan', type: 'religious', bonus: 'Apostles gain a promotion of choice.', channel: 'none', note: 'apostles/theological combat not modeled' },
  Armagh: { name: 'Armagh', type: 'religious', bonus: 'Builders can build a Monastery for faith/production.', channel: 'faith' },
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
