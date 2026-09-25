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
import type { PromoClass } from './promotions';
import { type SrcMap, srcConst, xml } from './provenance';
import { GAME_SPEED } from './constants';

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
// bonus (a city holds at most one of the pair).
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
  | 'routePostGold'      // Jakarta
  | 'suzImprovement'     // Caguana / La Venta / Armagh
  | 'sciencePeace'       // Geneva
  | 'districtGpp'        // Bologna
  | 'waterDistrictCulture' // Nan Madol
  | 'routeLuxuryGold'    // Amsterdam
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
 *  on the destination city's own tiles. (Antioch carries the same text in
 *  Expansion1.) */
export const AMSTERDAM_DEST_LUXURY_GOLD = 1;

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
interface SuzerainBonusDef {
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  name: string;
  type: CityStateType;
  bonus: string;
  /** the modeled RULE — every catalog row names one. */
  suz: SuzEffect;
  note?: string;
}

/**
 * PROVENANCE (cpu/data/provenance.ts). A city-state's TYPE is the install's
 * `Types`/`Civilizations` classification for that minor; the BONUS text is the
 * Civilopedia's suzerain paragraph, and `suz` is the engine's own code for the
 * clause — the install writes each bonus as a trait's modifier chain, not as a
 * column a checker can read back.
 */
const SUZ_SRC: SrcMap = {
  type: { pedia: 'the GS City-State page classification (scientific / cultural / trade / industrial '
    + '/ militaristic / religious)' },
  bonus: { pedia: 'the GS Civilopedia suzerain paragraph for this city-state, quoted' },
  suz: { stylized: 'the engine code for the clause; the install writes the bonus as a trait '
    + 'modifier chain, not as a readable column' },
};

const RAW_CITY_STATE_SUZERAIN_BONUS: Record<string, SuzerainBonusDef> = {
  Geneva: { name: 'Geneva', type: 'scientific', bonus: 'Your cities earn +15% bonus Science output when you are not at war with any civilization.', suz: 'sciencePeace' },
  Bologna: { name: 'Bologna', type: 'scientific', bonus: 'Your districts with a building provide +1 Great Person point of their type (Writer, Artist, and Musician for Theater Square districts with a building).', suz: 'districtGpp' },
  Anshan: { name: 'Anshan', type: 'scientific', bonus: '+2 Science from each Great Work of Writing. +1 Science from each Relic and Artifact.', suz: 'worksScience' },
  Vilnius: { name: 'Vilnius', type: 'cultural', bonus: 'When you enter a new era, earn 1 random Inspiration from that era.', suz: 'eraInspiration' },
  'Nan Madol': { name: 'Nan Madol', type: 'cultural', bonus: 'Your districts on or next to Coast or Lake tiles provide +2 Culture.', suz: 'waterDistrictCulture' },
  Kumasi: { name: 'Kumasi', type: 'cultural', bonus: 'Your Trade Routes to any city-state provide +2 Culture and +1 Gold for every specialty district in the origin city.', suz: 'csRouteYields' },
  Caguana: { name: 'Caguana', type: 'cultural', bonus: 'Your Builders can build Batey improvements.', suz: 'suzImprovement' },
  Amsterdam: { name: 'Amsterdam', type: 'trade', bonus: 'Your Trade Routes to foreign cities earn +1 Gold for each Luxury resource at the destination.', suz: 'routeLuxuryGold' },
  Zanzibar: { name: 'Zanzibar', type: 'trade', bonus: 'Receive the Cinnamon and Cloves Luxury resources. These cannot be earned any other way in the game, and provide 6 Amenities each.', suz: 'spiceLuxuries' },
  Jakarta: { name: 'Jakarta', type: 'trade', bonus: 'Your Trading Posts in foreign cities provide +1 Gold to your Trade Routes passing through or going to the city.', suz: 'routePostGold' },
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

export const CITY_STATE_SUZERAIN_BONUS: Record<string, SuzerainBonusDef> = Object.fromEntries(
  Object.entries(RAW_CITY_STATE_SUZERAIN_BONUS).map(([k, v]) => [k, { ...v, src: SUZ_SRC }]),
);

/**
 * The per-type placement pool. `seeder/place.ts` holds its own copy — the
 * seeder is hashed into `genStamp` and may not import from `cpu/`, so the two
 * tables are kept in step by `tests/cpu/data/cityStateRoster.test.ts` instead.
 */
export const CITY_STATE_NAMES: Record<CityStateType, string[]> = {
  scientific: ['Geneva', 'Bologna', 'Anshan'],
  cultural: ['Vilnius', 'Nan Madol', 'Kumasi', 'Caguana'],
  trade: ['Amsterdam', 'Zanzibar', 'Jakarta', 'Hunza'],
  industrial: ['Mexico City', 'Buenos Aires', 'Hong Kong', 'Cardiff'],
  militaristic: ['Kabul', 'Ngazargamu', 'Preslav', 'Valletta', 'Akkad'],
  religious: ['Jerusalem', 'La Venta', 'Yerevan', 'Armagh'],
};

export const ENVOY_COST = 100;
export const INFLUENCE_PER_TURN = 3;
export const CITY_STATE_CAPITAL_BONUS = 2;
export const CITY_STATE_DISTRICT_BONUS = 2;
export const SUZERAIN_ENVOYS = 3;
export const QUEST_COOLDOWN = 12;
export const QUEST_ENVOYS = 1;
/** CIV6 (Quests_Text.xml, LOC_QUEST_CLEAR_BARBARIAN_CAMP_DESCRIPTION):
 *  "Destroy one Barbarian Outpost within 5 tiles of the city." */
export const QUEST_CAMP_RADIUS = srcConst('cityState.questCampRadius', 5, {
  pedia: 'Quests_Text.xml LOC_QUEST_CLEAR_BARBARIAN_CAMP_DESCRIPTION: "within 5 tiles of the city"',
});
export const CITY_STATE_MAX_HP = 150;
/** CIV6 (Eras.xml `BonusMinorStartingUnits`, "Additional Starting Units for
 *  Minor Civilizations in addition to their Settler"): an Ancient-era start
 *  gives every minor two Warriors — the Quantity 2 row; the third Warrior is
 *  the Emperor-and-up row. Lab 4's twelve-minor watch saw every minor start
 *  with its city and two Warriors. */
export const MINOR_STARTING_UNIT = srcConst('cityState.startingUnit', 'WARRIOR',
  xml('BonusMinorStartingUnits', 'Era=ERA_ANCIENT&Unit=UNIT_WARRIOR', 'Unit', { expect: 'UNIT_WARRIOR' }));
export const MINOR_STARTING_UNITS = srcConst('cityState.startingUnits', 2, {
  lab: 'C-38',
  note: 'BonusMinorStartingUnits ERA_ANCIENT UNIT_WARRIOR Quantity 2 (Base Eras.xml); the checker keys '
    + 'the table on Era&Unit and so folds the Emperor-only row over it',
});

/** CIV6 (Leaders.xml, MINOR_CIV_DEFAULT_TRAIT, which every minor's leader
 *  inherits): the minor's production rows. `MINOR_CIV_PRODUCTION_PENALTY` is
 *  `MODIFIER_PLAYER_CITIES_ADJUST_CITY_YIELD_MODIFIER` YIELD_PRODUCTION -50 —
 *  a percent on its city's Production; `MINOR_CIV_PRODUCTION_WALLS` is
 *  `MODIFIER_PLAYER_CITIES_ADJUST_BUILDING_PRODUCTION` +200 toward
 *  BUILDING_WALLS, BUILDING_CASTLE and BUILDING_STAR_FORT (this engine's
 *  three walls rows); `MINOR_CIV_PRODUCTION_HARBORS` is
 *  `MODIFIER_PLAYER_CITIES_ADJUST_DISTRICT_PRODUCTION` +500 toward
 *  DISTRICT_HARBOR; `MINOR_CIV_PRODUCTION_BUILDERS` and
 *  `MINOR_CIV_PRODUCTION_MILITARY` below are the unit rows. No difficulty row
 *  touches a minor: the HIGH_DIFFICULTY_* scaling rows attach to
 *  TRAIT_LEADER_MAJOR_CIV alone. */
export const MINOR_PRODUCTION_PCT = srcConst('cityState.productionPct', -50,
  xml('ModifierArguments', 'ModifierId=MINOR_CIV_PRODUCTION_PENALTY&Name=Amount', 'Value'));
export const MINOR_WALLS_PROD_PCT = srcConst('cityState.wallsProdPct', 200,
  xml('ModifierArguments', 'ModifierId=MINOR_CIV_PRODUCTION_WALLS&Name=Amount', 'Value'));
export const MINOR_HARBOR_PROD_PCT = srcConst('cityState.harborProdPct', 500,
  xml('ModifierArguments', 'ModifierId=MINOR_CIV_PRODUCTION_HARBORS&Name=Amount', 'Value'));
/** CIV6 (Leaders.xml, the six MINOR_CIV_<TYPE>_TRAIT rows, inherited by every
 *  named minor of the type): `MODIFIER_PLAYER_CITIES_ADJUST_DISTRICT_PRODUCTION`
 *  toward the type's own district (`CITY_STATE_TYPE_DISTRICT`). */
export const MINOR_TYPE_DISTRICT_PROD_PCT: Record<CityStateType, number> = {
  scientific: srcConst('cityState.typeDistrictProdPct.scientific', 500,
    xml('ModifierArguments', 'ModifierId=MINOR_CIV_SCIENTIFIC_CAMPUS_PRODUCTION&Name=Amount', 'Value')),
  cultural: srcConst('cityState.typeDistrictProdPct.cultural', 500,
    xml('ModifierArguments', 'ModifierId=MINOR_CIV_CULTURAL_THEATER_PRODUCTION&Name=Amount', 'Value')),
  trade: srcConst('cityState.typeDistrictProdPct.trade', 500,
    xml('ModifierArguments', 'ModifierId=MINOR_CIV_TRADE_COMMERCIAL_HUB_PRODUCTION&Name=Amount', 'Value')),
  industrial: srcConst('cityState.typeDistrictProdPct.industrial', 500,
    xml('ModifierArguments', 'ModifierId=MINOR_CIV_INDUSTRIAL_INDUSTRIAL_ZONE_PRODUCTION&Name=Amount', 'Value')),
  militaristic: srcConst('cityState.typeDistrictProdPct.militaristic', 500,
    xml('ModifierArguments', 'ModifierId=MINOR_CIV_MILITARISTIC_ENCAMPMENT_PRODUCTION&Name=Amount', 'Value')),
  religious: srcConst('cityState.typeDistrictProdPct.religious', 500,
    xml('ModifierArguments', 'ModifierId=MINOR_CIV_RELIGIOUS_HOLY_SITE_PRODUCTION&Name=Amount', 'Value')),
};
/** CIV6 (Leaders.xml, MINOR_CIV_PRODUCTION_BUILDERS):
 *  `MODIFIER_PLAYER_UNITS_ADJUST_UNIT_PRODUCTION` UnitType UNIT_BUILDER Amount
 *  200 — toward a Builder. */
export const MINOR_BUILDER_PROD_PCT = srcConst('cityState.builderProdPct', 200,
  xml('ModifierArguments', 'ModifierId=MINOR_CIV_PRODUCTION_BUILDERS&Name=Amount', 'Value'));
/** CIV6 (Leaders.xml, MINOR_CIV_PRODUCTION_MILITARY):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_MILITARY_UNITS_PRODUCTION` Amount 200 toward
 *  a military unit, under PLAYER_HAS_SMALL_MILITARY — the inverse of
 *  REQUIREMENT_PLAYER_HAS_AT_LEAST_NUM_MILITARY_UNITS Amount 10, so while the
 *  minor holds fewer than ten military units. */
export const MINOR_MILITARY_PROD_PCT = srcConst('cityState.militaryProdPct', 200,
  xml('ModifierArguments', 'ModifierId=MINOR_CIV_PRODUCTION_MILITARY&Name=Amount', 'Value'));
export const MINOR_SMALL_MILITARY = srcConst('cityState.smallMilitary', 10,
  xml('RequirementArguments', 'RequirementId=REQUIRES_PLAYER_HAS_SMALL_MILITARY&Name=Amount', 'Value'));

/** CIV6 (AiFavoredItems, ListType MinorCivDistricts, the default minor
 *  trait's `Districts` list): the sixteen districts a GS minor disfavours —
 *  every type's district (each type's own list re-favours its own), the
 *  Aqueduct, and the rest of the late or civ-level districts. The census saw
 *  no minor build another type's district, so the build table holds the
 *  type's district, the Harbor and the Neighborhood and no row of this list. */
export const MINOR_DISFAVORED_DISTRICTS: readonly DistrictId[] = srcConst('cityState.disfavoredDistricts', [
  'HOLY_SITE', 'CAMPUS', 'ENCAMPMENT', 'AERODROME', 'COMMERCIAL_HUB', 'ENTERTAINMENT_COMPLEX',
  'THEATER_SQUARE', 'INDUSTRIAL_ZONE', 'AQUEDUCT', 'SPACEPORT', 'GOVERNMENT_PLAZA', 'WATER_PARK',
  'CANAL', 'DAM', 'DIPLOMATIC_QUARTER', 'PRESERVE',
], {
  derived: 'the Item column of every AiFavoredItems row with ListType MinorCivDistricts and Favored false, '
    + 'as engine district ids (THEATER is THEATER_SQUARE, GOVERNMENT GOVERNMENT_PLAZA, '
    + 'WATER_ENTERTAINMENT_COMPLEX WATER_PARK)',
  inputs: ['HOLY_SITE', 'CAMPUS', 'ENCAMPMENT', 'AERODROME', 'COMMERCIAL_HUB', 'ENTERTAINMENT_COMPLEX', 'THEATER',
    'INDUSTRIAL_ZONE', 'AQUEDUCT', 'SPACEPORT', 'GOVERNMENT', 'WATER_ENTERTAINMENT_COMPLEX', 'CANAL', 'DAM',
    'DIPLOMATIC_QUARTER', 'PRESERVE'].map((d) => xml('AiFavoredItems',
    `ListType=MinorCivDistricts&Item=DISTRICT_${d}`, 'Favored', { expect: false })),
}) as readonly DistrictId[];

/** CIV6 (AiFavoredItems, ListType MinorCivUnitBuilds, Value -100): a minor
 *  trains no Recon and no carrier. */
export const MINOR_EXCLUDED_UNIT_CLASSES: readonly PromoClass[] = srcConst('cityState.excludedUnitClasses',
  ['RECON', 'NAVAL_CARRIER'], {
    derived: 'the Item column of the AiFavoredItems rows with ListType MinorCivUnitBuilds (Value -100), '
      + 'as engine promotion classes',
    inputs: ['RECON', 'NAVAL_CARRIER'].map((c) => xml('AiFavoredItems',
      `ListType=MinorCivUnitBuilds&Item=PROMOTION_CLASS_${c}`, 'Value', { expect: -100 })),
  }) as readonly PromoClass[];

/**
 * THE MINOR'S BUILD TABLE — what a city-state's city produces, fitted to the
 * watched games (C-38's census: `runs/cs_watch_*.jsonl`, 250 minor-games with
 * a known opening; the fit is `tools/civ6lab/minor_build_fit.py`). OWNER
 * 2026-09-23: a minor's behaviour is the environment an agent trains against,
 * so what the install does not publish is fitted to the lab records and
 * randomised per episode where the records give a spread.
 *
 * Every turn the minor's Production goes toward the FIRST row that wants an
 * item it can make now, under that item's toward-row; the item completes when
 * the pot covers it, one a turn. A turn no row wants banks the Production
 * (the census: 21.7% of turns to t101 build nothing, and an item that opens
 * after such a stretch completes at once — the walls in one turn, with no Gold
 * spent).
 *
 * A row with `from` is DRAWN once per episode, at the minor's first build:
 * one of twenty equally likely slots, the turn from which the row wants its
 * item, -1 never. An opening row's slots are 0 or -1 — the share of minors
 * that complete the item by turn 100 (Kaplan-Meier over the watches). A
 * development row's slots are the quantiles of the turn it first STARTS
 * (turn 4 on; the turn-2 pick is abandoned after one turn in every game),
 * censored at the minor's last record, and -1 where the estimate stops
 * reaching (fewer than eight minors left in the watch). A by-type row takes
 * the minor's type's id and slots.
 *
 * The rows are in the order the census's medians start them; the repair
 * project, a rule rather than a draw, stands ahead of every drawn row, and the
 * district projects, which take a minor's Production on 19-55% of the turns
 * after it first starts one and leave it idle on under 6%, close the table.
 * What the census holds that this table does not: the Aqueduct (disfavoured),
 * the Research Lab, Stock Exchange and Broadcast Center past the estimate's
 * reach (their slots are all -1), and the Supply Convoy, Military Engineer and
 * Manhattan Project the late watches start a handful of times. A minor BUYS
 * its ships (`MINOR_NAVAL_BUY_BP`); the census never saw one build a naval
 * unit. MinorCivPseudoYields' PSEUDOYIELD_TOURISM -200 names no row here: no
 * item in the table pays Tourism.
 */
export interface MinorBuildRow {
  /** `builder` a Builder while none stands; `unit` / `army` a military unit;
   *  `building` / `district` the row's item; `trader` a Trader while the
   *  minor's routes and Traders are under its trade capacity and a route is
   *  open to it (`minorRouteCandidate`); `repair` the
   *  Repair Outer Defenses project while `repairAvailable` allows; `project`
   *  the row's district project; `worship` the worship building its majority
   *  religion's Worship belief names */
  kind: 'builder' | 'unit' | 'building' | 'district' | 'army' | 'trader' | 'repair' | 'project' | 'worship';
  /** a building, district or project row's item, per minor type; null =
   *  nothing for the type */
  item?: Readonly<Record<CityStateType, string | null>>;
  /** a unit row's promotion class: it trains while the minor's military count
   *  is below `below`, or with no `below` while no unit of the class stands */
  cls?: PromoClass;
  below?: number;
  /** a drawn row's twenty slots, per minor type */
  from?: Readonly<Record<CityStateType, readonly number[]>>;
}

/** the row kinds in their WIRE order — the exporter's `buildKinds` */
export const MINOR_BUILD_KINDS: readonly MinorBuildRow['kind'][] = [
  'builder', 'unit', 'building', 'district', 'army', 'trader', 'repair', 'project', 'worship',
];

/** the slots a drawn row carries */
export const MINOR_BUILD_SLOTS = 20;
const NEVER: readonly number[] = Array<number>(MINOR_BUILD_SLOTS).fill(-1);
const every = <T,>(v: T): Record<CityStateType, T> =>
  Object.fromEntries(CITY_STATE_TYPES.map((t) => [t, v])) as Record<CityStateType, T>;
/** one census fit, the same for every type */
const slots = (name: string, v: readonly number[]) => every(srcConst(`cityState.build.${name}`, v, { lab: 'C-38' }));
/** one census fit per type */
const slotsByType = (name: string, v: Record<CityStateType, readonly number[]>) =>
  Object.fromEntries(CITY_STATE_TYPES.map((t) => [t, v[t] === NEVER ? NEVER
    : srcConst(`cityState.build.${name}.${t}`, v[t], { lab: 'C-38' })])) as Record<CityStateType, readonly number[]>;

export const MINOR_BUILD_ROWS: readonly MinorBuildRow[] = [
  // a Builder while none stands: 554 of 557 Builder runs began with none
  { kind: 'builder' },
  // the walls' repair whenever the perimeter is breached and quiet (28 minors
  // start it, median turn 112)
  { kind: 'repair' },
  { kind: 'building', item: every('MONUMENT'),
    from: slots('MONUMENT', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1]) },
  // the third military unit beside the two it starts with (165 of the 190
  // first Warriors were started with two standing)
  { kind: 'unit', cls: 'MELEE', below: 3,
    from: slots('MELEE', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1]) },
  { kind: 'building', item: every('GRANARY'),
    from: slots('GRANARY', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1]) },
  // a ranged unit while none stands
  { kind: 'unit', cls: 'RANGED',
    from: slots('RANGED', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1]) },
  // a Trader while the minor's routes and Traders are under its capacity
  // and a destination is open (225 of 250 minors start one, median turn 35)
  { kind: 'trader',
    from: slots('TRADER', [18, 20, 25, 29, 30, 31, 32, 33, 35, 37, 40, 43, 52, 61, 69, 75, 86, 108, -1, -1]) },
  { kind: 'district', item: CITY_STATE_TYPE_DISTRICT, from: slotsByType('typeDistrict', {
    scientific: [15, 16, 16, 17, 17, 19, 22, 23, 26, 28, 28, 34, 36, 46, 52, 53, 56, -1, -1, -1],
    cultural: [44, 45, 45, 46, 49, 52, 55, 59, 63, 66, 80, 86, 95, -1, -1, -1, -1, -1, -1, -1],
    trade: [43, 45, 51, 54, 56, 57, 58, 64, 68, 80, 83, 96, -1, -1, -1, -1, -1, -1, -1, -1],
    industrial: [70, 74, 79, 83, 84, 114, 137, 143, 150, 150, 160, 162, -1, -1, -1, -1, -1, -1, -1, -1],
    militaristic: [52, 62, 73, 98, 100, 119, 119, 148, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    religious: [11, 14, 15, 16, 18, 19, 21, 22, 26, 27, 28, 28, 33, 41, 64, 72, -1, -1, -1, -1],
  }) },
  { kind: 'building', item: {
    scientific: 'LIBRARY', cultural: 'AMPHITHEATER', trade: 'MARKET', industrial: 'WORKSHOP',
    militaristic: 'BARRACKS', religious: 'SHRINE',
  }, from: slotsByType('typeTier1', {
    scientific: [17, 24, 28, 35, 36, 39, 42, 43, 50, 52, 53, 65, 71, 75, 78, 83, -1, -1, -1, -1],
    cultural: [45, 46, 46, 47, 59, 72, 77, 83, 85, 94, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    trade: [44, 52, 56, 56, 59, 60, 64, 67, 70, 85, 91, 98, -1, -1, -1, -1, -1, -1, -1, -1],
    industrial: [143, 145, 145, 159, 178, 178, 180, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    militaristic: [53, 84, 101, 104, 104, 125, 167, 167, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    religious: [20, 24, 32, 36, 42, 43, 50, 54, 57, 64, 67, 74, 80, 100, -1, -1, -1, -1, -1, -1],
  }) },
  { kind: 'building', item: every('WATER_MILL'),
    from: slots('WATER_MILL', [38, 41, 45, 48, 50, 54, 56, 58, 63, 74, 118, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'district', item: every('HARBOR'),
    from: slots('HARBOR', [38, 44, 54, 60, 67, 171, 205, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'building', item: every('ANCIENT_WALLS'),
    from: slots('ANCIENT_WALLS', [47, 51, 53, 54, 55, 57, 58, 60, 62, 63, 64, 65, 67, 68, 70, 72, 74, 79, 88, -1]) },
  { kind: 'building', item: every('LIGHTHOUSE'),
    from: slots('LIGHTHOUSE', [40, 50, 59, 68, 81, 214, 244, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'building', item: {
    scientific: 'UNIVERSITY', cultural: 'MUSEUM', trade: 'BANK', industrial: 'FACTORY',
    militaristic: 'ARMORY', religious: 'TEMPLE',
  }, from: slotsByType('typeTier2', {
    scientific: [81, 97, 100, 104, 104, 107, 107, 107, 107, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    cultural: [98, 101, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    trade: NEVER,
    industrial: [155, 191, 191, 198, 198, 199, 199, 199, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    militaristic: [89, 114, 114, 148, 148, 175, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    religious: [66, 69, 71, 73, 75, 77, 77, 78, 82, 84, 91, 101, -1, -1, -1, -1, -1, -1, -1, -1],
  }) },
  { kind: 'building', item: every('MEDIEVAL_WALLS'),
    from: slots('MEDIEVAL_WALLS', [82, 86, 90, 92, 92, 93, 94, 96, 97, 98, 99, 101, 104, 107, 108, 110, 112, 115, -1, -1]) },
  // the third tier (the Industrial Zone's is a power plant, which no minor
  // starts); the religious one is the worship row below
  { kind: 'building', item: {
    scientific: 'RESEARCH_LAB', cultural: 'BROADCAST_CENTER', trade: 'STOCK_EXCHANGE', industrial: null,
    militaristic: 'MILITARY_ACADEMY', religious: null,
  }, from: slotsByType('typeTier3', { ...every(NEVER),
    militaristic: [136, 136, 138, 172, 172, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1] }) },
  // the worship building (Wat, Gurdwara, Cathedral, Meeting House, Synagogue:
  // whichever the minor's religion names)
  { kind: 'worship', from: slotsByType('worship', { ...every(NEVER),
    religious: [76, 84, 90, 90, 92, 95, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1] }) },
  { kind: 'building', item: every('RENAISSANCE_WALLS'),
    from: slots('RENAISSANCE_WALLS', [110, 118, 121, 123, 125, 126, 129, 130, 130, 131, 132, 135, 138, 138, 140, 141, 146, 151, -1, -1]) },
  { kind: 'building', item: every('SHIPYARD'),
    from: slots('SHIPYARD', [135, 144, 161, 204, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'district', item: every('NEIGHBORHOOD'),
    from: slots('NEIGHBORHOOD', [147, 158, 166, 169, 175, 179, 180, 195, 204, 215, 218, 226, -1, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'building', item: every('SEWER'),
    from: slots('SEWER', [174, 177, 183, 189, 193, 199, 203, 207, 208, 211, 212, 224, 250, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'building', item: every('SEAPORT'),
    from: slots('SEAPORT', [223, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'building', item: every('FLOOD_BARRIER'),
    from: slots('FLOOD_BARRIER', [215, 220, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
  { kind: 'building', item: every('FOOD_MARKET'),
    from: slots('FOOD_MARKET', [225, 243, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
  // a military unit while the army is below the episode's cap
  { kind: 'army' },
  // the type district's project (no militaristic minor starts Encampment
  // Training), then the Harbor's
  { kind: 'project', item: {
    scientific: 'RESEARCH_GRANTS', cultural: 'FESTIVAL', trade: 'INVESTMENT', industrial: 'LOGISTICS',
    militaristic: 'TRAINING', religious: 'PRAYERS',
  }, from: slotsByType('typeProject', {
    scientific: [22, 25, 29, 29, 35, 38, 43, 43, 45, 53, 56, 76, 90, -1, -1, -1, -1, -1, -1, -1],
    cultural: [54, 60, 61, 69, 75, 77, 81, 99, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    trade: [53, 62, 67, 70, 74, 78, 93, 98, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    industrial: [77, 80, 83, 104, 118, 118, 206, 215, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    militaristic: NEVER,
    religious: [23, 30, 31, 33, 35, 37, 40, 41, 52, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  }) },
  { kind: 'project', item: every('SHIPPING'),
    from: slots('HARBOR_PROJECT', [60, 76, 121, 136, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]) },
];

/** The army the minor keeps: it trains a military unit while it holds fewer
 *  than this, drawn once per episode — one more than the largest land army a
 *  minor started a post-opening military unit at (turns 20-100), the smallest
 *  it idled at where it started none; 226 minor-games. */
export const MINOR_ARMY_CAP_SLOTS = srcConst('cityState.armyCapSlots',
  [1, 1, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 7], { lab: 'C-38' });

/** The army row's class: the one the army holds fewest of against these
 *  weights — the census's post-opening military starts by class (Recon's one
 *  start aside: MinorCivUnitBuilds) — then the strongest chassis of it. */
export const MINOR_ARMY_CLASSES: readonly (readonly [PromoClass, number])[] = [
  ['RANGED', 140], ['SIEGE', 97], ['ANTICAV', 92], ['HEAVY_CAV', 65], ['MELEE', 50], ['LIGHT_CAV', 14],
];

/** A minor's Builder lays an improvement on a turn with this chance (per
 *  mille): three charges over its standing span, whose median is 11 turns
 *  over 934 spans — the rate whose third success has that median. */
export const MINOR_BUILDER_RATE_PERMILLE = srcConst('cityState.builderRatePermille', 236, { lab: 'C-38' });
/** ...on the minor's own plots within this many tiles of its centre, where its
 *  Builders stand 94% of their turns. WHICH plot and improvement is
 *  unmeasured (LAB C-38-S1), so the pick is one draw over every valid pair. */
export const MINOR_BUILDER_RADIUS = srcConst('cityState.builderRadius', 2, { lab: 'C-38' });

/**
 * THE MINOR'S PURSE — what its Gold and Faith buy, fitted to C-38's census
 * (`tools/civ6lab/minor_play_census.py` over `runs/cs_watch_*.jsonl`, 262
 * minor-games). Every price is the chassis' own speed-scaled cost at the gold
 * (or faith) rate, floored to a multiple of five: the 453 bought Builders paid
 * exactly that (median residual 0), an Archer 120, a Warrior 80, a Catapult
 * 240, a Warrior Monk 100 faith.
 *
 * A Builder is bought on a turn no Builder stands and the treasury covers its
 * price, at a rate drawn once per episode from these twenty slots (per mille)
 * — the quantiles of the per-minor rate over minors with ten or more such
 * turns (pooled 428 of 5,326 turns, 8.0%, flat over banks of 100 to 499).
 */
export const MINOR_BUILDER_BUY_SLOTS = srcConst('cityState.builderBuySlots',
  [0, 0, 0, 24, 29, 39, 45, 53, 59, 67, 71, 80, 87, 97, 105, 120, 143, 167, 182, 211], { lab: 'C-38' });
/** A military unit is bought on a turn the treasury holds at least the floor
 *  (the smallest bank any of the 161 paid-for military purchases left from)
 *  at this rate per ten thousand by the minor's military count (0, 1, ...;
 *  none at eight or more: 0 of 195 such turns)... */
export const MINOR_MILITARY_BUY_FLOOR = srcConst('cityState.militaryBuyFloor', 95, { lab: 'C-38' });
export const MINOR_MILITARY_BUY_BP = srcConst('cityState.militaryBuyBp',
  [101, 101, 88, 66, 66, 50, 37, 37], { lab: 'C-38', note: 'army 0-1 33/3,273; 2 25/2,857; 3-4 31/4,696; '
    + '5 19/3,795; 6-7 9/2,417 rich turns, a loss window apart' });
/** ...and at this multiple of it within this many turns of losing a military
 *  unit (42 of 2,022 rich turns against 117 of 17,231: x3.06). */
export const MINOR_LOSS_BUY_MULT = srcConst('cityState.lossBuyMult', 3, { lab: 'C-38' });
export const MINOR_LOSS_BUY_TURNS = srcConst('cityState.lossBuyTurns', 3, { lab: 'C-38' });
/** CIV6 (Leaders.xml, MINOR_CIV_GOLD_MILITARY_UPGRADE): a minor upgrades at
 *  `MODIFIER_PLAYER_ADJUST_UNIT_UPGRADE_DISCOUNT_PERCENT` 100, and the census
 *  reads every upgrade at exactly 5 Gold (146 of the 171 single-upgrade turns whose
 *  neighbouring income is flat) — `UPGRADE_BASE_COST` at the online speed, the
 *  one install figure the discount leaves. */
export const MINOR_UPGRADE_GOLD = srcConst('cityState.upgradeGold', 5,
  xml('GlobalParameters', 'Name=UPGRADE_BASE_COST', 'Value', {
    scale: GAME_SPEED, note: 'C-38 census: exactly 5 per upgrade, whatever the chassis' }));
/** A minor BUYS its ships — the census never saw one build a naval unit: 65
 *  naval purchases in 42 of 262 minor-games (61 Galleys, 2 Caravels, 2
 *  Ironclads, the naval melee line), 60 of them with no ship standing, each
 *  paying the chassis' own gold price (Galley 125). On a turn the minor holds
 *  no ship and its treasury covers the price, one draw at this rate per ten
 *  thousand: 31 paid purchases over 4,979 such turns of the 82 minors the
 *  census shows coastal (a Harbor, a Lighthouse, a ship). */
export const MINOR_NAVAL_BUY_BP = srcConst('cityState.navalBuyBp', 62, { lab: 'C-38',
  note: 'tools/civ6lab/minor_play_census.py; the coastal denominator counts only the minors whose record shows a coast' });
export const MINOR_NAVAL_CLASS: PromoClass = 'NAVAL_MELEE';

/**
 * THE WALKER — where a minor's land military stands, fitted to C-38's census
 * (100,278 unit-turns at peace, 9,163 at war; a turn's step between two
 * records, the units of one type paired to the smallest total move since the
 * records carry no ids). Each turn a unit draws its step k (per mille over
 * 0, 1, 2, 3 — 3 folds the 4+ tail), then one destination among the plots
 * exactly k away, each weighted by its distance from home in the table below
 * (0 past the table), and walks toward it. The weights are the fixed point
 * that makes the walk's long-run distance the census's on an open grid
 * (`tools/civ6lab/minor_play_census.py --walk`): at peace d0-d5 8.1, 20.6,
 * 22.0, 18.0, 15.3, 10.8%; at war 15.9, 25.5, 23.7, 13.4, 9.1, 6.6%. A
 * damaged unit rests more (52.7% of its turns still). What a unit at war
 * attacks the census cannot say: it records no combat and no major's unit.
 */
export const MINOR_WALK_STEPS_PEACE = srcConst('cityState.walkStepsPeace', [141, 605, 233, 21], { lab: 'C-38' });
export const MINOR_WALK_STEPS_WAR = srcConst('cityState.walkStepsWar', [305, 440, 210, 45], { lab: 'C-38' });
export const MINOR_WALK_STEPS_DAMAGED = srcConst('cityState.walkStepsDamaged', [527, 299, 145, 29], { lab: 'C-38' });
export const MINOR_WALK_WEIGHTS_PEACE = srcConst('cityState.walkWeightsPeace',
  [1000, 344, 229, 158, 136, 116, 22, 20, 16, 9, 9, 6, 7], { lab: 'C-38' });
export const MINOR_WALK_WEIGHTS_WAR = srcConst('cityState.walkWeightsWar',
  [1000, 121, 76, 37, 32, 26, 7, 6, 5, 4, 2, 1, 6], { lab: 'C-38' });
/** The Free Cities' units walk the same body, from their nearest Free City
 *  (C-60's census: `cs_watch_*` player 62 and the id-tracked
 *  `rebel_watch_rebel3b/3c`, 580 unit-turns; d0-d5 12.6, 45.7, 25.9, 10.0,
 *  2.9, 2.2%; one table, the Free Cities being at war with everyone). */
export const FREE_WALK_STEPS = srcConst('cityState.freeWalkSteps', [238, 383, 231, 148], { lab: 'C-60' });
export const FREE_WALK_WEIGHTS = srcConst('cityState.freeWalkWeights', [1000, 594, 134, 39, 15, 24, 6], { lab: 'C-60' });

/**
 * THE FREE CITY'S BUILD TABLE — the city-state production model over C-60's
 * census (`cs_watch_*` player 62, 28 Free City records): the first row that
 * wants an item it can make now takes the city's Production, one item a turn.
 * A young city's first item is a Slinger (7 of 28), then a Monument or a
 * Granary; an older one's is its walls (11 of 28), then a Castle, a siege unit
 * (a Trebuchet, a Catapult) and the buildings its districts hold (University,
 * Research Lab, Library, Museum, Stock Exchange, Bank, Armory, Military
 * Academy, Broadcast Center, Lighthouse, Water Mill), with the
 * repair project whenever its walls are damaged. What the census holds that
 * this table does not: a district (Aqueduct, Harbor, Campus: 4 of 28), the
 * Flood Barrier (one city; its Coastal Lowland gate is not asked here) and the
 * district projects.
 */
export interface FreeCityBuildRow {
  kind: 'unit' | 'building' | 'repair';
  /** a unit row's class: it trains while no Free Cities unit of the class
   *  calls the city its nearest Free City */
  cls?: PromoClass;
  /** a building row: the first of these (catalog order) the city may raise */
  items?: readonly string[];
}
export const FREE_CITY_BUILD_ROWS: readonly FreeCityBuildRow[] = [
  { kind: 'unit', cls: 'RANGED' },
  { kind: 'building', items: ['MONUMENT'] },
  { kind: 'building', items: ['GRANARY'] },
  { kind: 'building', items: ['ANCIENT_WALLS'] },
  { kind: 'repair' },
  { kind: 'building', items: ['MEDIEVAL_WALLS'] },
  { kind: 'unit', cls: 'SIEGE' },
  { kind: 'building', items: ['WATER_MILL', 'BARRACKS', 'LIBRARY', 'LIGHTHOUSE', 'MARKET', 'STABLE',
    'AMPHITHEATER', 'ARMORY', 'UNIVERSITY', 'ARCHAEOLOGICAL_MUSEUM', 'BANK', 'MUSEUM', 'SHIPYARD', 'MILITARY_ACADEMY',
    'STOCK_EXCHANGE', 'BROADCAST_CENTER', 'RESEARCH_LAB', 'SEAPORT'] },
];

/** CIV6 (LOC_CITY_STATES_LEVY_MILITARY_DETAILS): "The Suzerain of this
 *  city-state can pay {1_GoldCost} Gold to take temporary control of all its
 *  current military units. The units will not be able to move on the turn
 *  they are levied, but will take orders from the Suzerain on the following
 *  turn. They will return to the city-state after {2_TurnLimit} Turns, or if
 *  the Suzerain changes." The turn limit is `LEVY_MILITARY_TURN_DURATION`; the
 *  price is `LEVY_MILITARY_PERCENT_OF_UNIT_PURCHASE_COST` of the units' own
 *  Gold purchase prices, summed. */
export const LEVY_TURNS = srcConst('cityState.levyTurns', 30,
  xml('GlobalParameters', 'Name=LEVY_MILITARY_TURN_DURATION', 'Value'));
export const LEVY_COST_PCT = srcConst('cityState.levyCostPct', 25,
  xml('GlobalParameters', 'Name=LEVY_MILITARY_PERCENT_OF_UNIT_PURCHASE_COST', 'Value'));

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
