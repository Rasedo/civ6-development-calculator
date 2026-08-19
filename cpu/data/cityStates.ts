/**
 * City-state definitions (base Civ 6 envoy system).
 * Envoy bonuses AS MODELED: 1 envoy = +2 type-yield in the capital; 3 envoys =
 * +2 in every city's matching district; 6 envoys = a further +2 per district.
 * Suzerain (3+ envoys, most among majors) adds a type-specific perk.
 *
 * SOURCING SWEEP. Verified against the Civilization wiki's
 * City-state / Suzerain pages. CORRECT: the SUZERAIN rule (most envoys AND at
 * least 3) and the 3-/6-envoy THRESHOLDS.
 *
 * The ENVOY LADDER is the real one, checked per city-state against the GS
 * Civilopedia: Geneva reads "+2 Science in your Capital / +2 Science in every
 * Campus district / Additional +2", Kumasi the same shape in Culture. What
 * stays degraded is the 3-/6-envoy step's KEY — real Civ 6 counts the
 * district's BUILDING TIERS, this model counts the district (see
 * CITY_STATE_TYPE_BUILDINGS, the catalog for that round).
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

export const CITY_STATE_TYPE_YIELD: Record<CityStateType, YieldKey> = {
  scientific: 'science',
  cultural: 'culture',
  trade: 'gold',
  industrial: 'production',
  militaristic: 'production',
  religious: 'faith',
};

export const CITY_STATE_TYPE_DISTRICT: Record<CityStateType, DistrictId> = {
  scientific: 'CAMPUS',
  cultural: 'THEATER_SQUARE',
  trade: 'COMMERCIAL_HUB',
  industrial: 'INDUSTRIAL_ZONE',
  militaristic: 'ENCAMPMENT',
  religious: 'HOLY_SITE',
};

// The real GS 3-/6-envoy bonuses key to the DISTRICT's BUILDING TIERS,
// not the district itself (a Campus with a Library + University earns the
// scientific bonus TWICE in real Civ 6). This table records those real building
// tiers per type, restricted to buildings that EXIST in this roster. The LIVE
// envoy-bonus channel (cityStateEnvoyBonuses/envoyBonusDelta + the GPU district-bonus
// term) stays DISTRICT-keyed ("suzerain/quest logic stays as
// is") — this is the catalog data for a future building-keyed wiring round.
// Inert in the parity gate regardless: the scripted scenario never lifts a
// city-state past 1 envoy, so the 3-envoy threshold is unreachable there.
export const CITY_STATE_TYPE_BUILDINGS: Record<CityStateType, string[]> = {
  scientific: ['LIBRARY', 'UNIVERSITY', 'RESEARCH_LAB'],
  cultural: ['AMPHITHEATER', 'MUSEUM', 'BROADCAST_CENTER'],
  trade: ['MARKET', 'BANK', 'STOCK_EXCHANGE'],
  industrial: ['WORKSHOP', 'FACTORY', 'POWER_PLANT'],
  militaristic: ['BARRACKS', 'STABLE', 'ARMORY', 'MILITARY_ACADEMY'],
  religious: ['SHRINE', 'TEMPLE'],
};

/**
 * A suzerain perk this engine models as a RULE rather than a flat capital
 * yield. Each name is one Civilopedia line, quoted at its row.
 */
export type SuzEffect =
  | 'xpDouble'          // Kabul
  | 'cavalryHills'      // Preslav
  | 'regionalReach'     // Mexico City (Toronto in rulesets without Canada)
  | 'worksScience'      // Anshan
  | 'csRouteYields'     // Kumasi
  | 'holySitePressure'; // Jerusalem

export const SUZ_EFFECTS: SuzEffect[] = [
  'xpDouble', 'cavalryHills', 'regionalReach', 'worksScience', 'csRouteYields', 'holySitePressure',
];

/** Kabul: "Your units receive double experience from battles they initiate." */
export const KABUL_XP_MULT = 2;
/** Preslav: "+5 Strength when fighting on hill tiles" (light and heavy cavalry). */
export const PRESLAV_HILL_CS = 5;
/** Mexico City: "Regional effects ... reach 3 tiles farther." */
export const REGIONAL_REACH_BONUS = 3;
/** Anshan: "+2 Science from each Great Work of Writing. +1 Science from each
 *  Relic and Artifact." */
export const ANSHAN_WRITING_SCIENCE = 2;
export const ANSHAN_RELIC_SCIENCE = 1;
/** Kumasi: routes to any city-state pay "+2 Culture and +1 Gold for every
 *  specialty district in the origin city". */
export const KUMASI_ROUTE_CULTURE = 2;
export const KUMASI_ROUTE_GOLD = 1;
export interface SuzerainBonusDef {
  name: string;
  type: CityStateType;
  bonus: string;
  channel?: YieldKey | 'amenities' | 'production-capital' | 'none';
  /** the modeled RULE, when the perk is one; rows without it pay the flat
   *  channel yield or nothing. */
  suz?: SuzEffect;
  note?: string;
}
export const CITY_STATE_SUZERAIN_BONUS: Record<string, SuzerainBonusDef> = {
  Geneva: { name: 'Geneva', type: 'scientific', bonus: 'Your cities earn +15% Science whenever you are not at war with any civilization.', channel: 'science', note: 'the +15% is degraded to the flat channel yield' },
  Stockholm: { name: 'Stockholm', type: 'scientific', bonus: '+2 science per specialty district building tier.', channel: 'science' },
  Seoul: { name: 'Seoul', type: 'scientific', bonus: '+science per turn per Campus adjacency.', channel: 'science' },
  Anshan: { name: 'Anshan', type: 'scientific', bonus: '+2 Science from each Great Work of Writing. +1 Science from each Relic and Artifact.', suz: 'worksScience' },
  Vilnius: { name: 'Vilnius', type: 'cultural', bonus: 'When you enter a new era, earn 1 random Inspiration from that era.', channel: 'culture', note: 'boosts exist, but picking a random unearned one at an era edge is its own rule; the flat channel stands in' },
  Antioch: { name: 'Antioch', type: 'cultural', bonus: 'Extra trade-route yields / market access.', channel: 'gold', note: 'NOT a Gathering Storm city-state (replaced), so no GS line can be quoted for it; the flat channel stands in' },
  Kumasi: { name: 'Kumasi', type: 'cultural', bonus: 'Your Trade Routes to any city-state provide +2 Culture and +1 Gold for every specialty district in the origin city.', suz: 'csRouteYields' },
  Caguana: { name: 'Caguana', type: 'cultural', bonus: 'Your Builders can now make Batey improvements. +1 Culture. +1 Culture for every adjacent Bonus resource and Entertainment Complex.', channel: 'culture', note: 'a whole IMPROVEMENT with its own adjacency and a Flight-gated tourism term; the flat channel stands in' },
  Amsterdam: { name: 'Amsterdam', type: 'trade', bonus: '+gold from trade routes / luxuries.', channel: 'gold', note: 'NOT a Gathering Storm city-state (replaced), so no GS line can be quoted for it; the flat channel stands in' },
  Zanzibar: { name: 'Zanzibar', type: 'trade', bonus: 'Receive the Cinnamon and Cloves Luxury resources. These cannot be earned any other way in the game, and provide 6 Amenities each.', channel: 'gold', note: 'two luxuries that exist nowhere else on the map; the flat channel stands in' },
  'Bandar Brunei': { name: 'Bandar Brunei', type: 'trade', bonus: 'Your Trading Posts in foreign cities provide +1 Gold to your Trade Routes passing through or going to the city.', channel: 'gold', note: 'TRADING POSTS are not modeled — a route lays roads and pays yields, it plants nothing' },
  Hunza: { name: 'Hunza', type: 'trade', bonus: 'Your Trade Routes generate +1 Gold for every 5 tiles they travel.', channel: 'gold', note: 'a route has no PATH here and nothing walks it, so there is no tile count to pay on' },
  Toronto: { name: 'Toronto', type: 'industrial', bonus: 'Regional effects from your Industrial Zone, Water Park, and Entertainment Complex districts reach 3 tiles farther.', suz: 'regionalReach', note: 'the same city-state as Mexico City — one replaces the other by ruleset, and this roster carries both' },
  'Buenos Aires': { name: 'Buenos Aires', type: 'industrial', bonus: 'Your Bonus resources behave like Luxury resources, providing 1 Amenity per type.', channel: 'amenities' },
  Cardiff: { name: 'Cardiff', type: 'industrial', bonus: 'Cities receive +2 Power for every Harbor building.', channel: 'production', note: 'POWER is not modeled at all — no plant, no grid, no powered-building term' },
  'Mexico City': { name: 'Mexico City', type: 'industrial', bonus: 'Regional effects from your Industrial Zone, Water Park, and Entertainment Complex districts reach 3 tiles farther.', suz: 'regionalReach' },
  Kabul: { name: 'Kabul', type: 'militaristic', bonus: 'Your units receive double experience from battles they initiate.', suz: 'xpDouble' },
  Carthage: { name: 'Carthage', type: 'militaristic', bonus: '+Encampment building production; free maintenance for melee.', channel: 'production' },
  Preslav: { name: 'Preslav', type: 'militaristic', bonus: 'Your light and heavy cavalry units have +5 Strength when fighting on hill tiles.', suz: 'cavalryHills' },
  Valletta: { name: 'Valletta', type: 'militaristic', bonus: 'City Center buildings and Encampment district buildings can be bought with Faith. Cost of purchasing Ancient, Medieval, and Renaissance Walls is reduced, but they can only be bought with Faith.', channel: 'production', note: 'a FAITH-purchase channel for a class of buildings; the flat production channel stands in' },
  Jerusalem: { name: 'Jerusalem', type: 'religious', bonus: 'Your cities with Holy Sites exert pressure as if they were Holy Cities (4x Religion pressure on all cities within 10 tiles).', suz: 'holySitePressure' },
  'La Venta': { name: 'La Venta', type: 'religious', bonus: 'Your Builders can now make Colossal Head improvements.', channel: 'faith', note: 'a whole IMPROVEMENT with its own adjacency; the flat channel stands in' },
  Yerevan: { name: 'Yerevan', type: 'religious', bonus: 'Your Apostle units can choose from any possible promotion instead of receiving a random promotion.', channel: 'none', note: 'unit PROMOTIONS are not modeled — the only one that reaches a rule is MARTYR, drawn at the death, and CHOOSING it would be a decision with no wire record' },
  Armagh: { name: 'Armagh', type: 'religious', bonus: 'Your Builders can now make Monastery improvements.', channel: 'faith', note: 'a whole IMPROVEMENT with its own adjacency; the flat channel stands in' },
};

export const CITY_STATE_SUZERAIN_YIELD = 3;
export const CITY_STATE_SUZERAIN_LIVE: Record<string, YieldKey> = {
  Geneva: 'science',
  Stockholm: 'science',
  Seoul: 'science',
  Vilnius: 'culture',
  Caguana: 'culture',
  Zanzibar: 'gold',
  'Bandar Brunei': 'gold',
  Carthage: 'production',
  Valletta: 'production',
  'La Venta': 'faith',
  Armagh: 'faith',
};

export const CITY_STATE_TYPE_COLORS: Record<CityStateType, string> = {
  scientific: '#4a90d9',
  cultural: '#b05fb0',
  trade: '#d9a94a',
  industrial: '#b3763e',
  militaristic: '#c0392b',
  religious: '#e8e4d8',
};

export const CITY_STATE_NAMES: Record<CityStateType, string[]> = {
  scientific: ['Geneva', 'Stockholm', 'Seoul', 'Anshan'],
  cultural: ['Vilnius', 'Antioch', 'Kumasi', 'Caguana'],
  trade: ['Amsterdam', 'Zanzibar', 'Bandar Brunei', 'Hunza'],
  industrial: ['Toronto', 'Buenos Aires', 'Cardiff', 'Mexico City'],
  militaristic: ['Kabul', 'Carthage', 'Preslav', 'Valletta'],
  religious: ['Jerusalem', 'La Venta', 'Yerevan', 'Armagh'],
};

export const ENVOY_COST = 100;
export const INFLUENCE_PER_TURN = 3;
export const ENVOY_THRESHOLDS = [1, 3, 6] as const;
export const CITY_STATE_CAPITAL_BONUS = 2;
export const CITY_STATE_DISTRICT_BONUS = 2;
export const SUZERAIN_ENVOYS = 3;
export const CITY_STATE_MEET_RANGE = 3;
export const QUEST_COOLDOWN = 12;
export const QUEST_ENVOYS = 1;
export const CITY_STATE_MAX_HP = 150;
export const LEVY_UNITS = 2;
export const LEVY_GOLD_COST = 120;
export const LEVY_COOLDOWN = 20;

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
