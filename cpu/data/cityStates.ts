/**
 * City-state definitions. The envoy ladder is `CITY_STATE_ENVOY_ROWS`: at 1,
 * 3 and 6 envoys each type pays the capital and named buildings (a yield
 * type) or production toward items (Industrial, Militaristic:
 * `CITY_STATE_ITEM_PROD`). Suzerain (3+ envoys, most among majors) adds a
 * type-specific perk.
 */

import type { CityStateType, DistrictId, QueueItem, YieldKey } from '../core/types';
import type { PromoClass } from './promotions';
import type { PlotYieldRow } from './civilizations';
import { type Src, type SrcMap, srcConst, xml } from './provenance';
import { GAME_SPEED, scaleByGameSpeed } from './constants';

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

/**
 * A suzerain perk this engine models as a RULE rather than a flat capital
 * yield. Each name is one Civilopedia line, quoted at its row.
 */
export type SuzEffect =
  | 'xpDouble'          // Kabul
  | 'militaryBuildingLoyalty' // Preslav
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
  | 'suzImprovement'     // Caguana / La Venta / Armagh / Nalanda / Granada
  | 'sciencePeace'       // Geneva
  | 'districtGpp'        // Bologna
  | 'waterDistrictCulture' // Nan Madol
  | 'routeLuxuryGold'    // Amsterdam
  | 'spiceLuxuries'      // Zanzibar
  | 'routeLengthGold'    // Hunza
  | 'projectProduction'  // Hong Kong
  | 'landPurchaseDiscount' // Ngazargamu
  | 'bonusAmenities'     // Buenos Aires
  | 'shallowWaterProd'   // Auckland
  | 'resourceTypeProduction' // Johannesburg
  | 'hubAmenities'       // Muscat
  | 'relicFaith'         // Kandy
  | 'partnerProduction' // Singapore
  | 'wonderProduction'   // Brussels
  | 'freshWaterHousing' // Mohenjo-Daro
  | 'gpActivatedPressure' // Vatican City
  | 'freeStrategic';   // Hattusa

/** The WIRE order the exported `suzCode` indexes — append only. */
export const SUZ_EFFECTS: SuzEffect[] = [
  'xpDouble', 'militaryBuildingLoyalty', 'regionalReach', 'worksScience', 'csRouteYields', 'holySitePressure',
  'apostlePromoChoice', 'eraInspiration', 'harborPower', 'faithBuildings',
  'wallsFullDamage',
  // the five whose perk is "your Builders can build X improvements",
  // which `validImprovementsIn`'s suzerain block answers off `suzerainOf`.
  'suzImprovement',
  'routePostGold',
  'sciencePeace', 'districtGpp', 'waterDistrictCulture', 'routeLuxuryGold',
  'spiceLuxuries', 'routeLengthGold', 'projectProduction', 'landPurchaseDiscount',
  'bonusAmenities', 'shallowWaterProd', 'resourceTypeProduction', 'hubAmenities', 'relicFaith',
  'partnerProduction', 'wonderProduction', 'freshWaterHousing', 'gpActivatedPressure', 'freeStrategic',
];

/** Cardiff: "Cities receive +2 Power for every Harbor building." Renewable,
 *  so it never leaves the city that holds the buildings. */
export const CARDIFF_HARBOR_POWER = 2;
/** Kabul: "Your units receive double experience from battles they initiate." */
export const KABUL_XP_MULT = 2;
/** CIV6 (Expansion1_Leaders.xml, the three MINOR_CIV_PRESLAV_*_IDENTITY_BONUS
 *  rows): `MODIFIER_PLAYER_CITIES_ADJUST_IDENTITY_PER_TURN` Amount 2, one row
 *  per Encampment building requirement set (`MILITARISTIC_BUILDING_ROWS`) —
 *  "+2 Loyalty per turn in cities for each Encampment district building". */
export const PRESLAV_BUILDING_LOYALTY = 2;
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
/** Vatican City: the pressure a Great Person's activation spreads for the
 *  suzerain (0x497d40: the player's founded religion, else its majority one,
 *  to every city within RELIGION_SPREAD_RANGE_COMBAT_VICTORY of the person's
 *  plot, `THEO_PRESSURE_RANGE`, 0x498860). */
export const VATICAN_GP_PRESSURE = srcConst('cityStates.vaticanGpPressure', 400,
  xml('ModifierArguments', 'ModifierId=MINOR_CIV_VATICAN_CITY_GREAT_PERSON_RELIGIOUS_PRESSURE&Name=Amount', 'Value'));
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
 *  on the destination city's own tiles. Expansion1_Leaders.xml's
 *  MINOR_CIV_ANTIOCH_LUXURY_TRADE_ROUTE_BONUS is the same modifier type,
 *  yield and Amount, so an Antioch suzerain holds the same rule; each
 *  suzerainty attaches its own modifier, and two pay twice. */
export const AMSTERDAM_DEST_LUXURY_GOLD = 1;

/** CIV6 (DLC/VikingsLandmarks/Data/VikingsLandmarks_CityStates.xml,
 *  MINOR_CIV_AUCKLAND_SHALLOW_WATER_PRODUCTION_BONUS_{BASE,INDUSTRIAL}): two
 *  `MODIFIER_PLAYER_ADJUST_PLOT_YIELD` YIELD_PRODUCTION Amount 1 rows on every
 *  plot of the suzerain whose terrain is TERRAIN_COAST (PLOT_HAS_SHALLOW_WATER;
 *  this engine's LAKE is the install's COAST too), the second under
 *  REQUIREMENT_PLAYER_ERA_AT_LEAST ERA_INDUSTRIAL. */
export const AUCKLAND_PLOT_ROWS: readonly PlotYieldRow[] = (['COAST', 'LAKE'] as const).flatMap((terrain) => [
  { yield: 'production' as const, amount: 1, terrain },
  { yield: 'production' as const, amount: 1, terrain, playerEraAtLeast: 'Industrial' as const },
]);

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
 *  0.2, held as the DLL holds a modifier's Amount: 24.8 fixed point, 51. */
export const HUNZA_PATH_TILE_GOLD_FX = Math.floor(0.2 * 256);

/** CIV6 (Leaders.xml, MINOR_CIV_HONG_KONG_PROJECT_PRODUCTION_BONUS):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_ALL_PROJECTS_PRODUCTION` Amount 20. */
export const HONG_KONG_PROJECT_PCT = 20;

/** CIV6 (Babylon_Leaders.xml, MINOR_CIV_JOHANNESBURG_PRODUCTION_RESOURCES and
 *  _LATE under PLAYER_HAS_INDUSTRIALIZATION):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_YIELD_BY_NUMBER_RESOURCES` YIELD_PRODUCTION
 *  Amount 1 each — "Cities receive +1 Production for every improved resource
 *  type. After researching Industrialization it becomes +2 Production." The
 *  type count is each city's distinct resources standing under an unpillaged
 *  improvement on its own plots (runs/h1_duelw1123, China's suzerainty:
 *  Jiaodong's Cotton and Cocoa plantations, Shanghai's Niter and Iron mines,
 *  +2 Production each from t107). */
export const JOHANNESBURG_RESOURCE_PROD = 1;
export const JOHANNESBURG_RESOURCE_PROD_LATE = 1;
export const JOHANNESBURG_LATE_TECH = 'INDUSTRIALIZATION';

/** CIV6 (VikingsLandmarks_CityStates.xml, MINOR_CIV_MUSCAT_COMMERCIAL_HUB_AMENITY_BONUS):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_CITY_AMENITIES_FROM_CITY_STATES` Amount 1
 *  under CITY_HAS_COMMERCIAL_HUB_VIKING — "+1 Amenity in cities with a
 *  Commercial Hub district" (runs/h1_duelw1120 Wuhan: the city-state part 1
 *  from t200, its Hub complete at t197). */
export const MUSCAT_HUB_AMENITIES = 1;
export const MUSCAT_HUB_DISTRICT = 'COMMERCIAL_HUB';

/** CIV6 (Leaders.xml, MINOR_CIV_KANDY_BETTER_RELIC_BONUS):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_GREATWORK_YIELD` GREATWORKOBJECT_RELIC
 *  YIELD_FAITH ScalingFactor 150 — "+50% Faith from all Relics"
 *  (runs/h1_duelw1120 Xi'an: its two Relics pay 12 Faith under China's
 *  suzerainty, not 8). */
export const KANDY_RELIC_FAITH_PCT = 50;
/** CIV6 (Leaders.xml, MINOR_CIV_KANDY_GRANT_RELIC_BONUS):
 *  `MODIFIER_PLAYER_ADJUST_NATURAL_WONDER_RELIC` Amount 1 — the Relics the
 *  suzerain is given as it first reveals a natural wonder (the visibility
 *  manager 0x50d390 creates that many through 0x495860 on the discovery). */
export const KANDY_WONDER_RELICS = 1;

/** CIV6 (GranColombia_Maya_Leaders.xml, MINOR_CIV_SINGAPORE_PRODUCTION_PER_MAJOR_TRADE_PARTNER):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_CITY_YIELD_PER_MAJOR_TRADE_PARTNER`
 *  YIELD_PRODUCTION Amount 2 — each city of the suzerain, per distinct
 *  foreign major its own Trade Routes run to (runs/h1_duelw1119 Taiyuan,
 *  China's suzerainty: +2 Production from t229, its route to Rome; its route
 *  to Babylon, a city-state, pays nothing at t247). */
export const SINGAPORE_PARTNER_PROD = 2;

/** CIV6 (Leaders.xml, MINOR_CIV_BRUSSELS_WONDER_PRODUCTION_BONUS):
 *  `MODIFIER_PLAYER_CITIES_ADJUST_WONDER_PRODUCTION` Amount 15 — percent
 *  toward wonders, joining the production cards' additive sum. */
export const BRUSSELS_WONDER_PCT = 15;

/** CIV6 (Expansion2_Leaders.xml, the three MINOR_CIV_NGAZARGAMU_*_PURCHASE
 *  _BONUS rows): `MODIFIER_PLAYER_CITIES_ADJUST_UNITS_PURCHASE_COST` Amount 20
 *  with `UnitDomain DOMAIN_LAND`, one row per Encampment building — Barracks OR
 *  Stable (one TEST_ANY set), Armory, Military Academy. Three rows stack to
 *  60% off. The gate is the modifier's own DOMAIN_LAND; the trait text says
 *  "land combat or support units", which the DLL alone could tell apart. */
export const NGAZARGAMU_PURCHASE_PCT = 20;
/** The three Encampment building requirement sets the militaristic
 *  suzerains (Ngazargamu, Preslav) pay a row each on —
 *  BUILDING_IS_BARRACKS_STABLE_MILITARITIC_CITY_STATE (TEST_ANY),
 *  BUILDING_IS_ARMORY, BUILDING_IS_MILITARY_ACADEMY. */
export const MILITARISTIC_BUILDING_ROWS: readonly (readonly string[])[] = [
  ['BARRACKS', 'STABLE'], ['ARMORY'], ['MILITARY_ACADEMY'],
];

/** CIV6 (Leaders.xml, MINOR_CIV_BUENOS_AIRES_BONUS_RESOURCE_AMENITY_BONUS):
 *  `MODIFIER_PLAYER_OWNED_BONUS_RESOURCE_EXTRA_AMENITIES` Amount 1. The gate
 *  the modifier names is OWNERSHIP, not an improvement — so every distinct
 *  bonus resource on this seat's tiles serves ONE city, the reach an
 *  `Happiness="1"` luxury would have. */
export const BUENOS_AIRES_AMENITIES = 1;

/** CIV6 (Expansion2_Leaders.xml, MINOR_CIV_HATTUSA_<R>_RESOURCE_XP2, one per
 *  strategic resource): `MODIFIER_PLAYER_ADJUST_FREE_RESOURCE_IMPORT_EXTRACTION`
 *  Amount 2 under PLAYER_HAS_NO_IMPROVED_<R> (REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED
 *  inverse, REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY) — each turn the
 *  suzerain banks 2 of every strategic resource it sees and improves nowhere
 *  (runs/h1_duelw1103, China suzerain of Hattusa with no strategic source:
 *  its luxury allocation rebuilt at its turn end, the bank over its cap, t64
 *  and t92). */
export const HATTUSA_FREE_STRATEGIC = srcConst('cityState.hattusaFreeStrategic', 2,
  xml('ModifierArguments', 'ModifierId=MINOR_CIV_HATTUSA_HORSES_RESOURCE_XP2&Name=Amount', 'Value'));
interface SuzerainBonusDef {
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  name: string;
  type: CityStateType;
  bonus: string;
  /** the modeled RULE — every catalog row names one. */
  suz: SuzEffect;
  /** the install's CivilizationType where it is not the name's (Anshan's
   *  LOC_CIVILIZATION_BABYLON_NAME): what a recorded game's minor carries */
  civ?: string;
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
  Anshan: { name: 'Anshan', type: 'scientific', bonus: '+2 Science from each Great Work of Writing. +1 Science from each Relic and Artifact.', suz: 'worksScience', civ: 'CIVILIZATION_BABYLON' },
  Nalanda: { name: 'Nalanda', type: 'scientific', bonus: 'Your Builders can now make Mahavihara improvements. When a player constructs their first Mahavihara receive a random technology.', suz: 'suzImprovement' },
  Vilnius: { name: 'Vilnius', type: 'cultural', bonus: 'When you enter a new era, earn 1 random Inspiration from that era.', suz: 'eraInspiration' },
  'Nan Madol': { name: 'Nan Madol', type: 'cultural', bonus: 'Your districts on or next to Coast or Lake tiles provide +2 Culture.', suz: 'waterDistrictCulture' },
  Kumasi: { name: 'Kumasi', type: 'cultural', bonus: 'Your Trade Routes to any city-state provide +2 Culture and +1 Gold for every specialty district in the origin city.', suz: 'csRouteYields' },
  Caguana: { name: 'Caguana', type: 'cultural', bonus: 'Your Builders can build Batey improvements.', suz: 'suzImprovement' },
  Amsterdam: { name: 'Amsterdam', type: 'trade', bonus: 'Your Trade Routes to foreign cities earn +1 Gold for each Luxury resource at the destination.', suz: 'routeLuxuryGold' },
  Antioch: { name: 'Antioch', type: 'trade', bonus: 'Your Trade Routes to foreign cities earn +1 Gold for each Luxury resource at the destination.', suz: 'routeLuxuryGold' },
  Zanzibar: { name: 'Zanzibar', type: 'trade', bonus: 'Receive the Cinnamon and Cloves Luxury resources. These cannot be earned any other way in the game, and provide 6 Amenities each.', suz: 'spiceLuxuries' },
  Jakarta: { name: 'Jakarta', type: 'trade', bonus: 'Your Trading Posts in foreign cities provide +1 Gold to your Trade Routes passing through or going to the city.', suz: 'routePostGold' },
  Hunza: { name: 'Hunza', type: 'trade', bonus: 'Receive +1 Gold for every 5 tiles a Trade Route travels.', suz: 'routeLengthGold' },
  'Hong Kong': { name: 'Hong Kong', type: 'industrial', bonus: 'Your Cities get +20% bonus Production towards city projects.', suz: 'projectProduction' },
  'Buenos Aires': { name: 'Buenos Aires', type: 'industrial', bonus: 'Your bonus resources behave like luxury resources, providing +1 Amenity per resource.', suz: 'bonusAmenities' },
  Cardiff: { name: 'Cardiff', type: 'industrial', bonus: 'Cities receive +2 Power for every Harbor building.', suz: 'harborPower' },
  Muscat: { name: 'Muscat', type: 'trade', bonus: '+1 Amenity in cities with a Commercial Hub district.', suz: 'hubAmenities' },
  Brussels: { name: 'Brussels', type: 'industrial', bonus: 'Your cities get +15% Production towards wonders.', suz: 'wonderProduction' },
  Singapore: { name: 'Singapore', type: 'industrial', bonus: '+2 Production in your cities for each major civilization their Trade Routes go to.', suz: 'partnerProduction' },
  Kandy: { name: 'Kandy', type: 'religious', bonus: 'Receive a Relic every time you discover a new natural wonder, and earn +50% Faith from all Relics.', suz: 'relicFaith' },
  Johannesburg: { name: 'Johannesburg', type: 'industrial', bonus: 'Cities receive +1 Production for every improved resource type. After researching Industrialization it becomes +2 Production.', suz: 'resourceTypeProduction' },
  Auckland: { name: 'Auckland', type: 'industrial', bonus: 'Shallow water tiles you own provide +1 Production. Additional +1 when you reach the Industrial era.', suz: 'shallowWaterProd' },
  'Mexico City': { name: 'Mexico City', type: 'industrial', bonus: 'Regional effects from your Industrial Zone, Water Park, and Entertainment Complex districts reach 3 tiles farther.', suz: 'regionalReach' },
  Akkad: { name: 'Akkad', type: 'militaristic', bonus: "Melee and anti-cavalry units' attacks do full damage to the city's walls.", suz: 'wallsFullDamage' },
  Kabul: { name: 'Kabul', type: 'militaristic', bonus: 'Your units receive double experience from battles they initiate.', suz: 'xpDouble' },
  Ngazargamu: { name: 'Ngazargamu', type: 'militaristic', bonus: 'Land combat or support units are 20% cheaper to purchase with Gold for each Encampment district building in that city.', suz: 'landPurchaseDiscount' },
  Preslav: { name: 'Preslav', type: 'militaristic', bonus: 'You receive +2 Loyalty per turn in cities for each Encampment district building.', suz: 'militaryBuildingLoyalty' },
  Valletta: { name: 'Valletta', type: 'militaristic', bonus: 'City Center buildings and Encampment district buildings can be bought with Faith. Cost of purchasing Ancient, Medieval, and Renaissance Walls is reduced, but they can only be bought with Faith.', suz: 'faithBuildings' },
  Granada: { name: 'Granada', type: 'militaristic', bonus: 'Your Builders can now make Alcázar improvements.', suz: 'suzImprovement' },
  Jerusalem: { name: 'Jerusalem', type: 'religious', bonus: 'Your cities with Holy Sites exert pressure as if they were Holy Cities (4x religious pressure on all cities within 10 tiles).', suz: 'holySitePressure' },
  'La Venta': { name: 'La Venta', type: 'religious', bonus: 'Your Builders can build Colossal Heads improvements.', suz: 'suzImprovement' },
  Yerevan: { name: 'Yerevan', type: 'religious', bonus: 'Your Apostle units can choose from any possible promotion instead of receiving a random promotion.', suz: 'apostlePromoChoice' },
  Armagh: { name: 'Armagh', type: 'religious', bonus: 'Your Builders can build Monastery improvements.', suz: 'suzImprovement' },
  // CIV6 (Leaders.xml, MINOR_CIV_MOHENJO_DARO_CITIES_FRESHWATER_HOUSING_BONUS:
  // MODIFIER_PLAYER_GRANT_CITIES_FRESHWATER_HOUSING_BONUS, HasBonus true)
  'Mohenjo-Daro': { name: 'Mohenjo-Daro', type: 'cultural', bonus: 'Your cities have full Housing from water, as if they were adjacent to a River.', suz: 'freshWaterHousing' },
  // CIV6 (GranColombia_Maya_Leaders.xml, MINOR_CIV_VATICAN_CITY_UNIQUE_INFLUENCE_BONUS
  // attaching MINOR_CIV_VATICAN_CITY_GREAT_PERSON_RELIGIOUS_PRESSURE to the
  // suzerain: MODIFIER_PLAYER_GRANT_RELIGIOUS_PRESSURE_GREAT_PERSON_ACTIVATED)
  'Vatican City': { name: 'Vatican City', type: 'religious', bonus: 'When you activate a Great Person they spread 400 Religious pressure of your founded (or majority) religion to cities within 10 tiles.', suz: 'gpActivatedPressure' },
  Hattusa: { name: 'Hattusa', type: 'scientific', bonus: 'Receive 2 of each Strategic resource you have revealed but do not have an improved source of.', suz: 'freeStrategic' },
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
  scientific: ['Geneva', 'Bologna', 'Anshan', 'Nalanda'],
  cultural: ['Vilnius', 'Nan Madol', 'Kumasi', 'Caguana'],
  trade: ['Amsterdam', 'Zanzibar', 'Jakarta', 'Hunza', 'Antioch'],
  industrial: ['Mexico City', 'Buenos Aires', 'Hong Kong', 'Cardiff', 'Auckland'],
  militaristic: ['Kabul', 'Ngazargamu', 'Preslav', 'Valletta', 'Akkad', 'Granada'],
  religious: ['Jerusalem', 'La Venta', 'Yerevan', 'Armagh'],
};

export const ENVOY_COST = 100;
export const INFLUENCE_PER_TURN = 3;
/** the envoys a city-state takes from the first major to meet it
 *  (runs/h1_duelw1117-1124: the first meeting of every minor, by either
 *  major, adds one to its count that record; no later meeting does) */
export const FIRST_MEET_ENVOYS = srcConst('cityState.firstMeetEnvoys', 1,
  xml('GlobalParameters', 'Name=INFLUENCE_TOKENS_FREE_FOR_FIRST_PLAYER_MEET', 'Value'));

/** A MINOR'S CATCH-UP: a technology or civic it lacks that at least
 *  max(1, (this x majors + 50) / 100) majors hold stands at its cost less one
 *  (the immediate 50 of 0x4cb930 / 0x39ec60) */
export const MINOR_CATCHUP_PCT = srcConst('cityState.catchUpPct', 50,
  { lab: 'tools/civ6lab/dll_readings.md H-1: a minor\'s research catch-up (0x4cb930, 0x39ec60)' });

/** The queue kinds a city-state's envoys pay PRODUCTION TOWARD, per type —
 *  the Industrial rows' EFFECT_ADJUST_CITY_PRODUCTION_BUILDING / _DISTRICT and
 *  the Militaristic rows' EFFECT_ADJUST_CITY_PRODUCTION_UNIT. The text reads
 *  "when producing wonders, buildings, and districts" and "when producing
 *  units" — a Settler is a unit. None of it is a city yield. */
export const CITY_STATE_ITEM_PROD: Partial<Record<CityStateType, readonly QueueItem['kind'][]>> = {
  industrial: ['building', 'wonder', 'district'],
  militaristic: ['unit', 'settler'],
};

/**
 * One rung of a city-state type's ENVOY LADDER: one install modifier the
 * type's trait attaches to every major holding at least `envoys` envoys there
 * (PLAYER_HAS_{SMALL,MEDIUM,LARGE}_INFLUENCE, MinimumTokens 1 / 3 / 6). Each
 * city-state of the type pays its rows again.
 *
 * A YIELD type (Scientific, Cultural, Trade, Religious) pays its type's yield
 * (`CITY_STATE_TYPE_YIELD`): an empty `buildings` is the capital row
 * (MODIFIER_PLAYER_CAPITAL_CITY_ADJUST_CITY_YIELD_CHANGE), otherwise
 * MODIFIER_PLAYER_CITIES_ADJUST_BUILDING_YIELD_CHANGE on that one building in
 * every city. A PRODUCTION type (`CITY_STATE_ITEM_PROD`) pays production toward
 * its kinds: an empty `buildings` is the capital row, otherwise every city
 * holding ANY of `buildings` (the modifier's SubjectRequirementSet) — two rows
 * a city both qualifies for pay twice ("+4 if it has both these buildings").
 */
export interface EnvoyRow {
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  /** the TraitModifiers row that attaches the modifier */
  id: string;
  type: CityStateType;
  envoys: number;
  amount: number;
  buildings: readonly string[];
}

type InfluenceTier = 'SMALL' | 'MEDIUM' | 'LARGE';
const TIER_ENVOYS: Record<InfluenceTier, number> = { SMALL: 1, MEDIUM: 3, LARGE: 6 };
const TRAIT: Record<CityStateType, string> = {
  scientific: 'SCIENTIFIC', cultural: 'CULTURAL', trade: 'TRADE',
  industrial: 'INDUSTRIAL', militaristic: 'MILITARISTIC', religious: 'RELIGIOUS',
};

/** CIV6 (Leaders.xml, each type's MINOR_CIV_<TYPE>_SEND_TRADE_ROUTE_BONUS,
 *  MODIFIER_PLAYER_CITIES_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS): what a minor's
 *  city adds of its type's yield (`CITY_STATE_TYPE_YIELD`) to a route sent
 *  to it. The DLL's route yield (Trade_Manager 0x54c6c0) pays a minor
 *  destination's row only under Sovereignty outcome A naming its type, times
 *  the resolution's factor (`sovereigntyRouteYields`); otherwise it is
 *  unpaid. */
export const CITY_STATE_ROUTE_TO_OTHERS = Object.fromEntries(CITY_STATE_TYPES.map((t) => [t,
  srcConst(`cityState.routeToOthers.${t}`, t === 'trade' ? 2 : 1,
    xml('ModifierArguments', `ModifierId=MINOR_CIV_${TRAIT[t]}_SEND_TRADE_ROUTE_BONUS&Name=Amount`, 'Value'))])) as Record<CityStateType, number>;

function rungSrc(type: CityStateType, tier: InfluenceTier, attach: string, mod: string): Record<string, Src> {
  return {
    type: xml('TraitModifiers', `ModifierId=${attach}`, 'TraitType', { expect: `MINOR_CIV_${TRAIT[type]}_TRAIT` }),
    envoys: xml('RequirementArguments', `RequirementId=REQUIRES_PLAYER_HAS_${tier}_INFLUENCE&Name=MinimumTokens`, 'Value'),
    amount: xml('ModifierArguments', `ModifierId=${mod}&Name=Amount`, 'Value'),
  };
}

/** a yield type's rung: `building` is [engine id, install id], none for the
 *  capital row */
function yieldRung(type: CityStateType, tier: InfluenceTier, attach: string, mod: string,
  amount: number, building?: readonly [string, string]): EnvoyRow {
  const src = rungSrc(type, tier, attach, mod);
  if (building) {
    src.buildings = { derived: 'the modifier\'s BuildingType, as an engine id', inputs: [
      xml('ModifierArguments', `ModifierId=${mod}&Name=BuildingType`, 'Value', { expect: `BUILDING_${building[1]}` })] };
  }
  return { id: attach, type, envoys: TIER_ENVOYS[tier], amount, buildings: building ? [building[0]] : [], src };
}

/** a production type's rung: each building is [engine id, install id, the
 *  RequirementId naming it in the modifier's requirement set]; none for the
 *  capital row. An Industrial rung's DISTRICT twin modifier carries the same
 *  Amount and the same requirement set. */
function prodRung(type: CityStateType, tier: InfluenceTier, attach: string, mod: string,
  amount: number, buildings: readonly (readonly [string, string, string])[] = []): EnvoyRow {
  const src = rungSrc(type, tier, attach, mod);
  if (buildings.length > 0) {
    src.buildings = { derived: 'the BuildingType of each requirement in the modifier\'s SubjectRequirementSet, as engine ids',
      inputs: buildings.map(([, inst, req]) => xml('RequirementArguments', `RequirementId=${req}&Name=BuildingType`, 'Value',
        { expect: `BUILDING_${inst}` })) };
  }
  return { id: attach, type, envoys: TIER_ENVOYS[tier], amount, buildings: buildings.map(([b]) => b), src };
}

const SCI = 'MINOR_CIV_SCIENTIFIC_';
const CUL = 'MINOR_CIV_CULTURAL_';
const TRD = 'MINOR_CIV_TRADE_';
const REL = 'MINOR_CIV_RELIGIOUS_';
const MIL = 'MINOR_CIV_MILITARISTIC_';
const IND = 'MINOR_CIV_INDUSTRIAL_';

/** CIV6 (DLC/Ethiopia/Data/Ethiopia_Buildings.xml, which every Gathering Storm
 *  game loads; Ethiopia_RemoveData.xml deletes the Leaders.xml /
 *  Expansion1_Leaders.xml ladder it replaces). */
export const CITY_STATE_ENVOY_ROWS: readonly EnvoyRow[] = [
  yieldRung('scientific', 'SMALL', `${SCI}SMALL_INFLUENCE_CAPITAL`, `${SCI}YIELD_FOR_CAPITAL_ETHIOPIA`, 1),
  yieldRung('scientific', 'SMALL', `${SCI}SMALL_INFLUENCE_ETHIOPIA`, `${SCI}YIELD_FOR_LIBRARY_ETHIOPIA`, 1, ['LIBRARY', 'LIBRARY']),
  yieldRung('scientific', 'MEDIUM', `${SCI}MEDIUM_INFLUENCE_ETHIOPIA`, `${SCI}YIELD_FOR_CONSULATE`, 2, ['CONSULATE', 'CONSULATE']),
  yieldRung('scientific', 'MEDIUM', `${SCI}MEDIUM_INFLUENCE_UNIVERSITY`, `${SCI}YIELD_FOR_UNIVERSITY_ETHIOPIA`, 2, ['UNIVERSITY', 'UNIVERSITY']),
  yieldRung('scientific', 'LARGE', `${SCI}LARGE_INFLUENCE_ETHIOPIA`, `${SCI}YIELD_FOR_CHANCERY`, 3, ['CHANCERY', 'CHANCERY']),
  yieldRung('scientific', 'LARGE', `${SCI}LARGE_INFLUENCE_RESEARCH_LAB`, `${SCI}YIELD_FOR_RESEARCH_LAB`, 3, ['RESEARCH_LAB', 'RESEARCH_LAB']),

  yieldRung('cultural', 'SMALL', `${CUL}SMALL_INFLUENCE_CAPITAL`, `${CUL}YIELD_FOR_CAPITAL_ETHIOPIA`, 1),
  yieldRung('cultural', 'SMALL', `${CUL}SMALL_INFLUENCE_ETHIOPIA`, `${CUL}YIELD_FOR_AMPHITHEATER_ETHIOPIA`, 1, ['AMPHITHEATER', 'AMPHITHEATER']),
  yieldRung('cultural', 'MEDIUM', `${CUL}MEDIUM_INFLUENCE_ETHIOPIA`, `${CUL}YIELD_FOR_CONSULATE`, 2, ['CONSULATE', 'CONSULATE']),
  yieldRung('cultural', 'MEDIUM', `${CUL}MEDIUM_INFLUENCE_MUSEUM_ART`, `${CUL}YIELD_FOR_MUSEUM_ART`, 2, ['MUSEUM', 'MUSEUM_ART']),
  yieldRung('cultural', 'MEDIUM', `${CUL}MEDIUM_INFLUENCE_MUSEUM_ARTIFACT`, `${CUL}YIELD_FOR_MUSEUM_ARTIFACT`, 2, ['ARCHAEOLOGICAL_MUSEUM', 'MUSEUM_ARTIFACT']),
  yieldRung('cultural', 'LARGE', `${CUL}LARGE_INFLUENCE_ETHIOPIA`, `${CUL}YIELD_FOR_CHANCERY`, 3, ['CHANCERY', 'CHANCERY']),
  yieldRung('cultural', 'LARGE', `${CUL}LARGE_INFLUENCE_BROADCAST_CENTER`, `${CUL}YIELD_FOR_BROADCAST_CENTER`, 3, ['BROADCAST_CENTER', 'BROADCAST_CENTER']),

  yieldRung('trade', 'SMALL', `${TRD}SMALL_INFLUENCE_CAPITAL`, `${TRD}YIELD_FOR_CAPITAL_ETHIOPIA`, 2),
  yieldRung('trade', 'SMALL', `${TRD}SMALL_INFLUENCE_ETHIOPIA`, `${TRD}YIELD_FOR_MARKET_ETHIOPIA`, 2, ['MARKET', 'MARKET']),
  yieldRung('trade', 'SMALL', `${TRD}SMALL_INFLUENCE_LIGHTHOUSE`, `${TRD}YIELD_FOR_LIGHTHOUSE_ETHIOPIA`, 2, ['LIGHTHOUSE', 'LIGHTHOUSE']),
  yieldRung('trade', 'MEDIUM', `${TRD}MEDIUM_INFLUENCE_ETHIOPIA`, `${TRD}YIELD_FOR_CONSULATE`, 4, ['CONSULATE', 'CONSULATE']),
  yieldRung('trade', 'MEDIUM', `${TRD}MEDIUM_INFLUENCE_BANK`, `${TRD}YIELD_FOR_BANK_ETHIOPIA`, 4, ['BANK', 'BANK']),
  yieldRung('trade', 'MEDIUM', `${TRD}MEDIUM_INFLUENCE_SHIPYARD`, `${TRD}YIELD_FOR_SHIPYARD_ETHIOPIA`, 4, ['SHIPYARD', 'SHIPYARD']),
  yieldRung('trade', 'LARGE', `${TRD}LARGE_INFLUENCE_ETHIOPIA`, `${TRD}YIELD_FOR_CHANCERY`, 6, ['CHANCERY', 'CHANCERY']),
  yieldRung('trade', 'LARGE', `${TRD}LARGE_INFLUENCE_STOCK_EXCHANGE`, `${TRD}YIELD_FOR_STOCK_EXCHANGE`, 6, ['STOCK_EXCHANGE', 'STOCK_EXCHANGE']),
  yieldRung('trade', 'LARGE', `${TRD}LARGE_INFLUENCE_SEAPORT`, `${TRD}YIELD_FOR_SEAPORT`, 6, ['SEAPORT', 'SEAPORT']),

  yieldRung('religious', 'SMALL', `${REL}SMALL_INFLUENCE_CAPITAL`, `${REL}YIELD_FOR_CAPITAL_ETHIOPIA`, 1),
  yieldRung('religious', 'SMALL', `${REL}SMALL_INFLUENCE_ETHIOPIA`, `${REL}YIELD_FOR_SHRINE_ETHIOPIA`, 1, ['SHRINE', 'SHRINE']),
  yieldRung('religious', 'MEDIUM', `${REL}MEDIUM_INFLUENCE_ETHIOPIA`, `${REL}YIELD_FOR_CONSULATE`, 2, ['CONSULATE', 'CONSULATE']),
  yieldRung('religious', 'MEDIUM', `${REL}MEDIUM_INFLUENCE_TEMPLE`, `${REL}YIELD_FOR_TEMPLE_ETHIOPIA`, 2, ['TEMPLE', 'TEMPLE']),
  yieldRung('religious', 'LARGE', `${REL}LARGE_INFLUENCE_ETHIOPIA`, `${REL}YIELD_FOR_CHANCERY`, 3, ['CHANCERY', 'CHANCERY']),
  ...(['CATHEDRAL', 'DAR_E_MEHR', 'GURDWARA', 'MEETING_HOUSE', 'MOSQUE', 'PAGODA', 'STUPA', 'SYNAGOGUE', 'WAT'] as const)
    .map((b) => yieldRung('religious', 'LARGE', `${REL}LARGE_INFLUENCE_${b}`, `${REL}YIELD_FOR_${b}`, 3, [b, b])),

  prodRung('militaristic', 'SMALL', `${MIL}SMALL_INFLUENCE_CAPITAL`, `${MIL}YIELD_FOR_CAPITAL_ETHIOPIA`, 1),
  prodRung('militaristic', 'SMALL', `${MIL}SMALL_INFLUENCE_ETHIOPIA`, `${MIL}PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA`, 1,
    [['BARRACKS', 'BARRACKS', 'REQUIRES_CITY_HAS_BARRACKS_ETHIOPIA'], ['STABLE', 'STABLE', 'REQUIRES_CITY_HAS_STABLE_ETHIOPIA']]),
  prodRung('militaristic', 'MEDIUM', `${MIL}MEDIUM_INFLUENCE_ETHIOPIA`, `${MIL}PRODUCTION_FOR_CONSULATE`, 2,
    [['CONSULATE', 'CONSULATE', 'REQUIRES_CITY_HAS_CONSULATE']]),
  prodRung('militaristic', 'MEDIUM', `${MIL}MEDIUM_INFLUENCE_ARMORY`, `${MIL}PRODUCTION_FOR_ARMORY_ETHIOPIA`, 2,
    [['ARMORY', 'ARMORY', 'REQUIRES_CITY_HAS_ARMORY_ETHIOPIA']]),
  prodRung('militaristic', 'LARGE', `${MIL}LARGE_INFLUENCE_ETHIOPIA`, `${MIL}PRODUCTION_FOR_CHANCERY`, 3,
    [['CHANCERY', 'CHANCERY', 'REQUIRES_CITY_HAS_CHANCERY']]),
  prodRung('militaristic', 'LARGE', `${MIL}LARGE_INFLUENCE_MILITARY_ACADEMY`, `${MIL}PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA`, 3,
    [['MILITARY_ACADEMY', 'MILITARY_ACADEMY', 'REQUIRES_CITY_HAS_MILITARY_ACADEMY']]),

  prodRung('industrial', 'SMALL', `${IND}SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL`, `${IND}BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA`, 1),
  prodRung('industrial', 'SMALL', `${IND}SMALL_INFLUENCE_ETHIOPIA_BUILDING`, `${IND}BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA`, 1,
    [['WORKSHOP', 'WORKSHOP', 'REQUIRES_CITY_HAS_WORKSHOP_ETHIOPIA']]),
  prodRung('industrial', 'MEDIUM', `${IND}MEDIUM_INFLUENCE_ETHIOPIA_BUILDING`, `${IND}BUILDING_PRODUCTION_FOR_CONSULATE`, 2,
    [['CONSULATE', 'CONSULATE', 'REQUIRES_CITY_HAS_CONSULATE']]),
  prodRung('industrial', 'MEDIUM', `${IND}MEDIUM_INFLUENCE_FACTORY_BUILDING`, `${IND}BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA`, 2,
    [['FACTORY', 'FACTORY', 'REQUIRES_CITY_HAS_FACTORY_ETHIOPIA']]),
  prodRung('industrial', 'LARGE', `${IND}LARGE_INFLUENCE_ETHIOPIA_BUILDING`, `${IND}BUILDING_PRODUCTION_FOR_CHANCERY`, 3,
    [['CHANCERY', 'CHANCERY', 'REQUIRES_CITY_HAS_CHANCERY']]),
  prodRung('industrial', 'LARGE', `${IND}LARGE_INFLUENCE_POWER_PLANT_BUILDING`, `${IND}BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA`, 3,
    [['NUCLEAR_POWER_PLANT', 'POWER_PLANT', 'REQUIRES_CITY_HAS_POWER_PLANT_ETHIOPIA'],
      ['COAL_POWER_PLANT', 'COAL_POWER_PLANT', 'REQUIRES_CITY_HAS_COAL_POWER_PLANT_ETHIOPIA'],
      ['OIL_POWER_PLANT', 'FOSSIL_FUEL_POWER_PLANT', 'REQUIRES_CITY_HAS_FOSSIL_FUEL_POWER_PLANT_ETHIOPIA']]),
];
export const SUZERAIN_ENVOYS = 3;
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
/** A minor's repair of a pillaged building: it resumes the building at
 *  this percent of its cost, the rest built with Production — 100 less the
 *  install's PILLAGE_BUILDING_REPAIR_PERCENT 25. */
export const MINOR_REPAIR_RESUME_PCT = srcConst('cityState.repairResumePct', 75, {
  lab: 'runs/c74s3_minor_pillage_20260926T132658Z.jsonl',
  note: 'the minor finishes its current item, then queues the pillaged building, which resumes at University 93 of 125 and Meeting House 71 of 95 and is built with Production; nothing bought',
});
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

/** CIV6 (AiFavoredItems, ListType MinorCivUnitBuilds, Value -100): a minor
 *  trains no Recon and no carrier. */
export const MINOR_EXCLUDED_UNIT_CLASSES: readonly PromoClass[] = srcConst('cityState.excludedUnitClasses',
  ['RECON', 'NAVAL_CARRIER'], {
    derived: 'the Item column of the AiFavoredItems rows with ListType MinorCivUnitBuilds (Value -100), '
      + 'as engine promotion classes',
    inputs: ['RECON', 'NAVAL_CARRIER'].map((c) => xml('AiFavoredItems',
      `ListType=MinorCivUnitBuilds&Item=PROMOTION_CLASS_${c}`, 'Value', { expect: -100 })),
  }) as readonly PromoClass[];

/** CIV6 (Leaders.xml, MINOR_CIV_GOLD_MILITARY_UPGRADE): a minor upgrades at
 *  `MODIFIER_PLAYER_ADJUST_UNIT_UPGRADE_DISCOUNT_PERCENT` 100, and the census
 *  reads every upgrade at exactly 5 Gold (146 of the 171 single-upgrade turns whose
 *  neighbouring income is flat) — `UPGRADE_BASE_COST` at the online speed, the
 *  one install figure the discount leaves. */
export const MINOR_UPGRADE_GOLD = srcConst('cityState.upgradeGold', 5,
  xml('GlobalParameters', 'Name=UPGRADE_BASE_COST', 'Value', {
    scale: GAME_SPEED, note: 'C-38 census: exactly 5 per upgrade, whatever the chassis' }));
/** CIV6 (LOC_CITY_STATES_LEVY_MILITARY_DETAILS): "The Suzerain of this
 *  city-state can pay {1_GoldCost} Gold to take temporary control of all its
 *  current military units. The units will not be able to move on the turn
 *  they are levied, but will take orders from the Suzerain on the following
 *  turn. They will return to the city-state after {2_TurnLimit} Turns, or if
 *  the Suzerain changes." The turn limit is LEVY_MILITARY_TURN_DURATION
 *  through the speed's CostMultiplier (GameCore_XP2_Release.dll 0x44da30:
 *  the minor's levy counter +1 against 0x5254d0 of the row, 15 online — not
 *  GameSpeed_Durations' 21); the price is `levyGoldCost`'s. */
export const LEVY_TURNS = srcConst('cityState.levyTurns', scaleByGameSpeed(30), {
  derived: 'LEVY_MILITARY_TURN_DURATION through the speed CostMultiplier (GameCore_XP2 0x44da30 via 0x5254d0)',
  inputs: [xml('GlobalParameters', 'Name=LEVY_MILITARY_TURN_DURATION', 'Value', { expect: 30 })],
});

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
  DIGITAL_DEMOCRACY: 4,
};
