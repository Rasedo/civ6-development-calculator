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
 * The ENVOY LADDER is the real one: 1 envoy in the Capital, then the 3-/6-
 * envoy steps. The Civilopedia's own city-state pages still print the
 * vanilla "in every Campus district" wording, but Rise and Fall re-keyed
 * both steps to the district's BUILDING TIERS (tier 1 at 3 envoys, tier 2
 * at 6) — the CITY_STATE_TYPE_TIER1/TIER2 tables, live through
 * `cityStateEnvoyBonuses`.
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

// CIV6 (Rise and Fall): the 3-/6-envoy bonuses key to the type district's
// TIER-1 / TIER-2 building. Either member of an exclusive pair carries the
// bonus (a city holds at most one of the pair), and the minor's own build
// ladder takes the FIRST tier-1 member — a model choice.
export const CITY_STATE_TYPE_TIER1: Record<CityStateType, readonly string[]> = {
  scientific: ['LIBRARY'],
  cultural: ['AMPHITHEATER'],
  trade: ['MARKET'],
  industrial: ['WORKSHOP'],
  militaristic: ['BARRACKS', 'STABLE'],
  religious: ['SHRINE'],
};
export const CITY_STATE_TYPE_TIER2: Record<CityStateType, readonly string[]> = {
  scientific: ['UNIVERSITY'],
  cultural: ['MUSEUM', 'ARCHAEOLOGICAL_MUSEUM'],
  trade: ['BANK'],
  industrial: ['FACTORY'],
  militaristic: ['ARMORY'],
  religious: ['TEMPLE'],
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
  | 'wallsFullDamage'    // Akkad
  | 'routePostGold'      // Bandar Brunei
  | 'suzImprovement'     // Caguana / La Venta / Armagh
  | 'sciencePeace'       // Geneva
  | 'districtGpp'        // Bologna
  | 'waterDistrictCulture' // Nan Madol
  | 'routeLuxuryGold'    // Venice
  | 'spiceLuxuries'      // Zanzibar
  | 'routeLengthGold'    // Hunza
  | 'projectProduction'  // Hong Kong
  | 'landPurchaseDiscount' // Ngazargamu
  | 'bonusAmenities';    // Buenos Aires

/** The WIRE order the exported `suzCode` indexes — append only. */
export const SUZ_EFFECTS: SuzEffect[] = [
  'xpDouble', 'cavalryHills', 'regionalReach', 'worksScience', 'csRouteYields', 'holySitePressure',
  'apostlePromoChoice', 'eraInspiration', 'harborPower', 'faithBuildings',
  'wallsFullDamage',
  // the three whose whole perk is "your Builders can build X improvements",
  // which `validImprovementsIn`'s suzerain block answers off `suzerainOf`.
  'suzImprovement',
  'routePostGold',
  'sciencePeace', 'districtGpp', 'waterDistrictCulture', 'routeLuxuryGold',
  'spiceLuxuries', 'routeLengthGold', 'projectProduction', 'landPurchaseDiscount',
  'bonusAmenities',
];

/** Cardiff: "Cities receive +2 Power for every Harbor building." Renewable,
 *  so it never leaves the city that holds the buildings. */
export const CARDIFF_HARBOR_POWER = 2;
/** Akkad: "Melee and anti-cavalry units' attacks do full damage to the
 *  city's walls." The Battering Ram's own effect, at EVERY walls tier and
 *  with no support unit present. */
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

/** CIV6 (Leaders.xml, MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_{WALLS,CASTLE,STAR}
 *  _BONUS): `MODIFIER_PLAYER_CITIES_ADJUST_BUILDING_PURCHASE_COST` Amount 50
 *  on BUILDING_WALLS, BUILDING_CASTLE and BUILDING_STAR_FORT — the three walls
 *  are half price for a Valletta suzerain, who is also the only seat that may
 *  buy them at all (`wallsGoldBlocked`). */
export const VALLETTA_WALLS_DISCOUNT_PCT = 50;
/** Kumasi: routes to any city-state pay "+2 Culture and +1 Gold for every
 *  specialty district in the origin city". */
export const KUMASI_ROUTE_CULTURE = 2;
export const KUMASI_ROUTE_GOLD = 1;

/** CIV6 (Leaders.xml, MINOR_CIV_GENEVA_SCIENCE_AT_PEACE_BONUS):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_CITY_YIELD_MODIFIER` YIELD_SCIENCE Amount 15,
 *  under the requirement set PLAYER_IS_AT_PEACE_WITH_ALL_MAJORS — a PERCENT on every city's
 *  science, not a flat capital yield. */
export const GENEVA_SCIENCE_PCT = 15;

/** CIV6 (Expansion2_Leaders.xml, the nine MINOR_CIV_BOLOGNA_GREAT_*_POINTS
 *  _BONUS rows): `MODIFIER_PLAYER_CITIES_ADJUST_GREAT_PERSON_POINT` Amount 1
 *  each, under a BUILDING requirement — the TIER-1 building of the class's own
 *  district. Barracks and Stable are ONE requirement set (TEST_ANY), so a city
 *  holding either pays the General's point once. */
export const BOLOGNA_DISTRICT_GPP = 1;
export const BOLOGNA_GPP_BUILDING: Record<string, readonly string[]> = {
  WRITER: ['AMPHITHEATER'],
  ARTIST: ['AMPHITHEATER'],
  MUSICIAN: ['AMPHITHEATER'],
  SCIENTIST: ['LIBRARY'],
  MERCHANT: ['MARKET'],
  ENGINEER: ['WORKSHOP'],
  ADMIRAL: ['LIGHTHOUSE'],
  GENERAL: ['BARRACKS', 'STABLE'],
  PROPHET: ['SHRINE'],
};

/** CIV6 (Leaders.xml, MINOR_CIV_NAN_MADOL_DISTRICTS_CULTURE_BONUS):
 *  `MODIFIER_PLAYER_DISTRICTS_ADJUST_YIELD_CHANGE` YIELD_CULTURE Amount 2,
 *  under the requirement set PLOT_IS_OR_ADJACENT_TO_COAST (TEST_ANY of `REQUIREMENT_PLOT_IS_COAST`
 *  and REQUIREMENT_PLOT_ADJACENT_TO_COAST). This engine's LAKE is the install's
 *  COAST, so the predicate is "on or next to SHALLOW WATER". */
export const NAN_MADOL_WATER_CULTURE = 2;

/** CIV6 (Leaders.xml, MINOR_CIV_AMSTERDAM_LUXURY_TRADE_ROUTE_BONUS):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_TRADE_ROUTE_YIELD_PER_DESTINATION_LUXURY_FOR
 *  _INTERNATIONAL` YIELD_GOLD Amount 1 — per DISTINCT luxury resource standing
 *  on the destination city's own tiles. (The install spells this bonus on
 *  AMSTERDAM, and on Antioch in Expansion1; see the roster note.) */
export const VENICE_DEST_LUXURY_GOLD = 1;

/** CIV6 (Leaders.xml, MINOR_CIV_ZANZIBAR_{CINNAMON,CLOVES}_RESOURCE_BONUS):
 *  two `MODIFIER_PLAYER_ADJUST_FREE_RESOURCE_IMPORT` rows, Amount 1 each, for
 *  RESOURCE_CINNAMON and RESOURCE_CLOVES — both RESOURCECLASS_LUXURY with
 *  `Happiness="6" Frequency="0"` (Resources.xml): they are never placed on a
 *  map and each serves SIX cities. This model carries a luxury as its REACH,
 *  which is exactly what `gpLuxuries` already holds. */
export const ZANZIBAR_LUXURIES = 2;
export const ZANZIBAR_LUXURY_AMENITIES = 6;

/** CIV6 (GranColombia_Maya_Leaders.xml,
 *  MINOR_CIV_HUNZA_GOLD_FROM_TRADE_ROUTE_LENGTH):
 *  `MODIFIER_PLAYER_ADJUST_TRADE_ROUTE_YIELD_PER_PATH_TILE` YIELD_GOLD Amount
 *  0.2 — the trait text's "+1 Gold for every 5 tiles a Trade Route travels".
 *  Taken as the text's whole gold per five tiles rather than as a fifth per
 *  tile: a fraction summed on two engines drifts, an integer does not. */
export const HUNZA_TILES_PER_GOLD = 5;
export const HUNZA_ROUTE_GOLD = 1;

/** CIV6 (Leaders.xml, MINOR_CIV_HONG_KONG_PROJECT_PRODUCTION_BONUS):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_ALL_PROJECTS_PRODUCTION` Amount 20. */
export const HONG_KONG_PROJECT_PCT = 20;

/** CIV6 (Expansion2_Leaders.xml, the three MINOR_CIV_NGAZARGAMU_*_PURCHASE
 *  _BONUS rows): `MODIFIER_PLAYER_CITIES_ADJUST_UNITS_PURCHASE_COST` Amount 20
 *  with `UnitDomain DOMAIN_LAND`, one row per Encampment building — Barracks OR
 *  Stable (one TEST_ANY set), Armory, Military Academy. Three rows stack to
 *  60% off. The gate is the modifier's own DOMAIN_LAND; the trait text says
 *  "land combat or support units", which the DLL alone could tell apart. */
export const NGAZARGAMU_PURCHASE_PCT = 20;
export const NGAZARGAMU_BUILDINGS: readonly (readonly string[])[] = [
  ['BARRACKS', 'STABLE'], ['ARMORY'], ['MILITARY_ACADEMY'],
];

/** CIV6 (Leaders.xml, MINOR_CIV_BUENOS_AIRES_BONUS_RESOURCE_AMENITY_BONUS):
 *  `MODIFIER_PLAYER_OWNED_BONUS_RESOURCE_EXTRA_AMENITIES` Amount 1. The gate
 *  the modifier names is OWNERSHIP, not an improvement — so every distinct
 *  bonus resource on this seat's tiles serves ONE city, the reach an
 *  `Happiness="1"` luxury would have. */
export const BUENOS_AIRES_AMENITIES = 1;
export interface SuzerainBonusDef {
  name: string;
  type: CityStateType;
  bonus: string;
  /** the modeled RULE — every catalog row names one. */
  suz: SuzEffect;
  note?: string;
}
export const CITY_STATE_SUZERAIN_BONUS: Record<string, SuzerainBonusDef> = {
  Geneva: { name: 'Geneva', type: 'scientific', bonus: 'Your cities earn +15% bonus Science output when you are not at war with any civilization.', suz: 'sciencePeace' },
  Bologna: { name: 'Bologna', type: 'scientific', bonus: 'Your districts with a building provide +1 Great Person point of their type (Writer, Artist, and Musician for Theater Square districts with a building).', suz: 'districtGpp' },
  Anshan: { name: 'Anshan', type: 'scientific', bonus: '+2 Science from each Great Work of Writing. +1 Science from each Relic and Artifact.', suz: 'worksScience' },
  Vilnius: { name: 'Vilnius', type: 'cultural', bonus: 'When you enter a new era, earn 1 random Inspiration from that era.', suz: 'eraInspiration' },
  'Nan Madol': { name: 'Nan Madol', type: 'cultural', bonus: 'Your districts on or next to Coast or Lake tiles provide +2 Culture.', suz: 'waterDistrictCulture' },
  Kumasi: { name: 'Kumasi', type: 'cultural', bonus: 'Your Trade Routes to any city-state provide +2 Culture and +1 Gold for every specialty district in the origin city.', suz: 'csRouteYields' },
  Caguana: { name: 'Caguana', type: 'cultural', bonus: 'Your Builders can build Batey improvements.', suz: 'suzImprovement' },
  Venice: { name: 'Venice', type: 'trade', bonus: 'Your Trade Routes to foreign cities earn +1 Gold for each Luxury resource at the destination.', suz: 'routeLuxuryGold', note: 'the install spells this bonus on AMSTERDAM (base) and Antioch (Expansion1); no Civ 6 city-state is named Venice' },
  Zanzibar: { name: 'Zanzibar', type: 'trade', bonus: 'Receive the Cinnamon and Cloves Luxury resources. These cannot be earned any other way in the game, and provide 6 Amenities each.', suz: 'spiceLuxuries' },
  'Bandar Brunei': { name: 'Bandar Brunei', type: 'trade', bonus: 'Your Trading Posts in foreign cities provide +1 Gold to your Trade Routes passing through or going to the city.', suz: 'routePostGold', note: 'the install spells this bonus on JAKARTA; Bandar Brunei is a scenario minor there' },
  Hunza: { name: 'Hunza', type: 'trade', bonus: 'Receive +1 Gold for every 5 tiles a Trade Route travels.', suz: 'routeLengthGold' },
  'Hong Kong': { name: 'Hong Kong', type: 'industrial', bonus: 'Your Cities get +20% bonus Production towards city projects.', suz: 'projectProduction' },
  'Buenos Aires': { name: 'Buenos Aires', type: 'industrial', bonus: 'Your bonus resources behave like luxury resources, providing +1 Amenity per resource.', suz: 'bonusAmenities' },
  Cardiff: { name: 'Cardiff', type: 'industrial', bonus: 'Cities receive +2 Power for every Harbor building.', suz: 'harborPower' },
  'Mexico City': { name: 'Mexico City', type: 'industrial', bonus: 'Regional effects from your Industrial Zone, Water Park, and Entertainment Complex districts reach 3 tiles farther.', suz: 'regionalReach' },
  Akkad: { name: 'Akkad', type: 'militaristic', bonus: "Melee and anti-cavalry units' attacks do full damage to the city's walls.", suz: 'wallsFullDamage' },
  Kabul: { name: 'Kabul', type: 'militaristic', bonus: 'Your units receive double experience from battles they initiate.', suz: 'xpDouble' },
  Ngazargamu: { name: 'Ngazargamu', type: 'militaristic', bonus: 'Land combat or support units are 20% cheaper to purchase with Gold for each Encampment district building in that city.', suz: 'landPurchaseDiscount' },
  Preslav: { name: 'Preslav', type: 'militaristic', bonus: 'Your light and heavy cavalry units have +5 Strength when fighting on Hills tiles.', suz: 'cavalryHills' },
  Valletta: { name: 'Valletta', type: 'militaristic', bonus: 'City Center buildings and Encampment district buildings can be bought with Faith. Cost of purchasing Ancient, Medieval, and Renaissance Walls is reduced, but they can only be bought with Faith.', suz: 'faithBuildings' },
  Jerusalem: { name: 'Jerusalem', type: 'religious', bonus: 'Your cities with Holy Sites exert pressure as if they were Holy Cities (4x religious pressure on all cities within 10 tiles).', suz: 'holySitePressure' },
  'La Venta': { name: 'La Venta', type: 'religious', bonus: 'Your Builders can build Colossal Heads improvements.', suz: 'suzImprovement' },
  Yerevan: { name: 'Yerevan', type: 'religious', bonus: 'Your Apostle units can choose from any possible promotion instead of receiving a random promotion.', suz: 'apostlePromoChoice' },
  Armagh: { name: 'Armagh', type: 'religious', bonus: 'Your Builders can build Monastery improvements.', suz: 'suzImprovement' },
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
  militaristic: ['Kabul', 'Ngazargamu', 'Preslav', 'Valletta', 'Akkad'],
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
