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
  industrial: ['WORKSHOP', 'FACTORY', 'COAL_POWER_PLANT'],
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
  | 'regionalReach'     // Mexico City
  | 'worksScience'      // Anshan
  | 'csRouteYields'     // Kumasi
  | 'holySitePressure'   // Jerusalem
  | 'apostlePromoChoice' // Yerevan
  | 'eraInspiration'     // Vilnius
  | 'harborPower'        // Cardiff
  | 'faithBuildings'     // Valletta
  | 'suzImprovement';    // Caguana / La Venta / Armagh

/** The WIRE order the exported `suzCode` indexes — append only. */
export const SUZ_EFFECTS: SuzEffect[] = [
  'xpDouble', 'cavalryHills', 'regionalReach', 'worksScience', 'csRouteYields', 'holySitePressure',
  'apostlePromoChoice', 'eraInspiration', 'harborPower', 'faithBuildings',
  // the three whose whole perk is "your Builders can build X improvements",
  // which `validImprovementsIn`'s suzerain block answers off `suzerainOf`.
  'suzImprovement',
];

/** Cardiff: "Cities receive +2 Power for every Harbor building." Renewable,
 *  so it never leaves the city that holds the buildings. */
export const CARDIFF_HARBOR_POWER = 2;
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
/** Valletta: "City Center buildings and Encampment district buildings can be
 *  bought with Faith." The class is the building's own district. */
export const VALLETTA_FAITH_DISTRICTS: DistrictId[] = ['CITY_CENTER', 'ENCAMPMENT'];
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
  Geneva: { name: 'Geneva', type: 'scientific', bonus: 'Your cities earn +15% bonus Science output when you are not at war with any civilization.', channel: 'science', note: 'the +15% is degraded to the flat channel yield' },
  Bologna: { name: 'Bologna', type: 'scientific', bonus: 'Your districts with a building provide +1 Great Person point of their type (Writer, Artist, and Musician for Theater Square districts with a building).', channel: 'science', note: 'a per-district GREAT PERSON point channel keyed to building tiers; the flat science channel stands in' },
  Anshan: { name: 'Anshan', type: 'scientific', bonus: '+2 Science from each Great Work of Writing. +1 Science from each Relic and Artifact.', suz: 'worksScience' },
  Vilnius: { name: 'Vilnius', type: 'cultural', bonus: 'When you enter a new era, earn 1 random Inspiration from that era.', suz: 'eraInspiration' },
  'Nan Madol': { name: 'Nan Madol', type: 'cultural', bonus: 'Your districts on or next to Coast or Lake tiles provide +2 Culture.', channel: 'culture', note: 'a per-district water-adjacency term; the flat channel stands in' },
  Kumasi: { name: 'Kumasi', type: 'cultural', bonus: 'Your Trade Routes to any city-state provide +2 Culture and +1 Gold for every specialty district in the origin city.', suz: 'csRouteYields' },
  Caguana: { name: 'Caguana', type: 'cultural', bonus: 'Your Builders can build Batey improvements.', suz: 'suzImprovement' },
  Venice: { name: 'Venice', type: 'trade', bonus: 'Your Trade Routes to foreign cities earn +1 Gold for each Luxury resource at the destination.', channel: 'gold', note: 'the destination luxury count is not a route term here; the flat channel stands in' },
  Zanzibar: { name: 'Zanzibar', type: 'trade', bonus: 'Receive the Cinnamon and Cloves Luxury resources. These cannot be earned any other way in the game, and provide 6 Amenities each.', channel: 'gold', note: 'two luxuries that exist nowhere else on the map; the flat channel stands in' },
  'Bandar Brunei': { name: 'Bandar Brunei', type: 'trade', bonus: 'Your Trading Posts in foreign cities provide +1 Gold to your Trade Routes passing through or going to the city.', channel: 'gold', note: 'TRADING POSTS are not modeled — a route lays roads and pays yields, it plants nothing' },
  Hunza: { name: 'Hunza', type: 'trade', bonus: 'Receive +1 Gold for every 5 tiles a Trade Route travels.', channel: 'gold', note: 'the Trader walks a real path now, but the gold channel is FLAT — the per-5-tiles scaling stands in' },
  'Hong Kong': { name: 'Hong Kong', type: 'industrial', bonus: 'Your Cities get +20% bonus Production towards city projects.', channel: 'production', note: 'a PROJECT-only production multiplier; the flat channel stands in' },
  'Buenos Aires': { name: 'Buenos Aires', type: 'industrial', bonus: 'Your bonus resources behave like luxury resources, providing +1 Amenity per resource.', channel: 'amenities' },
  Cardiff: { name: 'Cardiff', type: 'industrial', bonus: 'Cities receive +2 Power for every Harbor building.', suz: 'harborPower' },
  'Mexico City': { name: 'Mexico City', type: 'industrial', bonus: 'Regional effects from your Industrial Zone, Water Park, and Entertainment Complex districts reach 3 tiles farther.', suz: 'regionalReach' },
  Kabul: { name: 'Kabul', type: 'militaristic', bonus: 'Your units receive double experience from battles they initiate.', suz: 'xpDouble' },
  Ngazargamu: { name: 'Ngazargamu', type: 'militaristic', bonus: 'Land combat or support units are 20% cheaper to purchase with Gold for each Encampment district building in that city.', channel: 'production', note: 'a per-building GOLD PURCHASE discount; the flat production channel stands in' },
  Preslav: { name: 'Preslav', type: 'militaristic', bonus: 'Your light and heavy cavalry units have +5 Strength when fighting on Hills tiles.', suz: 'cavalryHills' },
  Valletta: { name: 'Valletta', type: 'militaristic', bonus: 'City Center buildings and Encampment district buildings can be bought with Faith. Cost of purchasing Ancient, Medieval, and Renaissance Walls is reduced, but they can only be bought with Faith.', suz: 'faithBuildings', note: 'the walls DISCOUNT has no published magnitude, so the three walls are faith-only at the ordinary faith price' },
  Jerusalem: { name: 'Jerusalem', type: 'religious', bonus: 'Your cities with Holy Sites exert pressure as if they were Holy Cities (4x religious pressure on all cities within 10 tiles).', suz: 'holySitePressure' },
  'La Venta': { name: 'La Venta', type: 'religious', bonus: 'Your Builders can build Colossal Heads improvements.', suz: 'suzImprovement' },
  Yerevan: { name: 'Yerevan', type: 'religious', bonus: 'Your Apostle units can choose from any possible promotion instead of receiving a random promotion.', suz: 'apostlePromoChoice' },
  Armagh: { name: 'Armagh', type: 'religious', bonus: 'Your Builders can build Monastery improvements.', suz: 'suzImprovement' },
};

export const CITY_STATE_SUZERAIN_YIELD = 3;

/** CIV6 (Geneva): "when you are not at war with any civilization" — the one
 *  suzerain channel a war with a MAJOR silences. A city-state war does not:
 *  a minor is not a civilization. */
export const CITY_STATE_SUZERAIN_PEACE_ONLY: readonly string[] = ['Geneva'];
export const CITY_STATE_SUZERAIN_LIVE: Record<string, YieldKey> = {
  Geneva: 'science',
  Bologna: 'science',
  'Nan Madol': 'culture',
  Venice: 'gold',
  Zanzibar: 'gold',
  'Bandar Brunei': 'gold',
  'Hong Kong': 'production',
  Ngazargamu: 'production',
};

export const CITY_STATE_TYPE_COLORS: Record<CityStateType, string> = {
  scientific: '#4a90d9',
  cultural: '#b05fb0',
  trade: '#d9a94a',
  industrial: '#b3763e',
  militaristic: '#c0392b',
  religious: '#e8e4d8',
};

/**
 * The per-type placement pool. `seeder/place.ts` holds its own copy — the
 * seeder is hashed into `genStamp` and may not import from `cpu/`, so the two
 * tables are kept in step by `tests/cpu/data/cityStateRoster.test.ts` instead.
 */
export const CITY_STATE_NAMES: Record<CityStateType, string[]> = {
  scientific: ['Geneva', 'Bologna', 'Anshan'],
  cultural: ['Vilnius', 'Nan Madol', 'Kumasi', 'Caguana'],
  trade: ['Venice', 'Zanzibar', 'Bandar Brunei', 'Hunza'],
  industrial: ['Mexico City', 'Buenos Aires', 'Hong Kong', 'Cardiff'],
  militaristic: ['Kabul', 'Ngazargamu', 'Preslav', 'Valletta'],
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
