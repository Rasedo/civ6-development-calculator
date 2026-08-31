/**
 * RULES.JSON — the rule tables both engines share, compiled from cpu/data.
 *
 * Moved out of the old seeder whole: the seeder produces WORLDS and may not
 * know what a building costs; this file is engine-side and exists solely to
 * ship the catalogs to the GPU. The trace column tables ride along in
 * `rules.trace` (see cpu/driver/trace.ts) until the state-compare digest
 * retires them.
 */


import { TURN_LIMIT } from '../core/game';
import { PRESERVE_APPEAL_HOUSING } from '../core/appeal';
import { BIOSPHERE_POWER_MULT, IMPROVEMENTS, SEASIDE_RESORT_MIN_APPEAL, PARK_MIN_APPEAL, PARK_AMENITIES_OWNER,
  PARK_AMENITIES_NEAR, PARK_AMENITY_CITIES } from '../data/improvements';
import { SHIPWRECK_CIVIC, RELIGIOUS_HEAL_PER_FAITH, unitIsMilitary } from '../core/units';
import { NUCLEAR_DEVICES, FALLOUT_DAMAGE, NUKE_ROBOT_DAMAGE, NUKE_COVER_RANGE, FALLOUT_CLEAN_CHARGES, NUKE_INTERCEPTORS, NUKE_CARRIERS } from '../data/nuclear';
import type { PlunderRow, ImprovementId } from '../core/types';
import { GENERAL_AURA_CS, GENERAL_AURA_RANGE, BARB_SCOUT_OPENER_LIVE } from '../core/combat';
import { GENERAL_AURA_MP } from '../core/aura';
import { CARDIFF_HARBOR_POWER } from '../data/cityStates';
import { SUZ_EFFECTS, KABUL_XP_MULT, PRESLAV_HILL_CS, REGIONAL_REACH_BONUS, ANSHAN_WRITING_SCIENCE, ANSHAN_RELIC_SCIENCE, KUMASI_ROUTE_CULTURE, KUMASI_ROUTE_GOLD } from '../data/cityStates';
import { CITY_STATE_TYPES, ENVOY_COST, INFLUENCE_PER_TURN, CITY_STATE_CAPITAL_BONUS, QUEST_COOLDOWN, QUEST_ENVOYS, CITY_STATE_TYPE_YIELD, CITY_STATE_TYPE_DISTRICT, CITY_STATE_TYPE_BUILDINGS, CITY_STATE_DISTRICT_BONUS, CITY_STATE_SUZERAIN_YIELD, CITY_STATE_MAX_HP, CITY_STATE_MEET_RANGE, LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import { GP_CITY_PERM, GP_FX, GP_PERM, GP_PER_ADJ_SOURCES, GP_SITES, GP_YIELD_KEYS, GW_WORK_CLASSES, gpChargesOf, gpEffectOf, gpSiteOf, type GreatPersonDef } from '../data/greatPeople';
import { strategicSlot } from '../core/stockpile';
import { MAX_LEVEL, XP_PER_LEVEL } from '../core/promotions';
import { KILL_SPREAD_RANGE } from '../data/promotions';
import { GP_CLASSES, GREAT_PEOPLE, GP_ERA_GPP, GP_FLAT_COST_CLASSES, GP_CLASS_DISTRICT, GW_BUILDINGS, GW_SLOTS, GW_WONDER_SLOTS, RELIC_WONDER_SLOTS, GW_WORKS_PER_PERSON, GW_CULTURE, GW_TOURISM, GW_PRINTING_TECH, GW_PRINTING_WRITING_MULT, RELIC_BUILDING, RELIC_SLOTS_PER_BUILDING, RELIC_FAITH, RELIC_TOURISM, ARTIFACT_BUILDING, ARTIFACT_SLOTS, ARTIFACT_PROV_W, ARTIFACT_CULTURE, ARTIFACT_TOURISM, THEMING_MULT, ARTIST_WORKS, SPECIALIST_YIELDS, SPECIALIST_TIERS } from '../data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, PANTHEON_FAITH_COST, RELIGION_PRESSURE_RANGE, JUST_WAR_RANGE, B18_FOLLOWER_COUPLING_LIVE, WORSHIP_BUILDINGS, SPREAD_PRESSURE, MISSIONARY_CAP, APOSTLE_CAP, CITY_RELIGION_ADDER_LIVE, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE, INQUISITOR_CAP, APOSTLE_PROMO_OFFER, INQUISITOR_HOME_STRENGTH, REMOVE_HERESY_PCT, LAUNCH_INQUISITION_CHARGES, CONDEMN_PRESSURE_RANGE, CONDEMN_PRESSURE_SWING, type BeliefEffects } from '../data/religion';
import { PROJECTS, isSpaceProject, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION, SPACE_FLIGHT_LY, LASER_POWER_LOAD, gpClassesOf, gppFractionOf } from '../data/projects';
import { BUILT_WONDERS } from '../data/builtWonders';
import { TRADE_ROUTE_RANGE_LAND, TRADE_ROUTE_RANGE_SEA, CITY_STATE_ROUTE_GOLD, CITY_STATE_ROUTE_SPEC, INTL_ROUTE_GOLD, TRADE_ROUTE_DURATION, PLUNDER_ROUTE_GOLD, TRADE_WALK_EXPIRY_RAIL } from '../core/trade';
import { SUZERAIN_ENVOYS } from '../data/cityStates';
import { MAX_CITIES_PER_SEAT, CITY_SLOTS_PER_SEAT, WAR_MIN_TURNS, PEACE_TREATY_TURNS, LOYALTY_MAX, LOYALTY_RANGE, LOYALTY_PRESSURE_SCALE, LOYALTY_AMENITY, PEACE_GOLD_COST, WW_ERA_BASE_FORMAL, WW_ERA_BASE_SURPRISE, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WAR_WEARINESS_PER_AMENITY, DOW_PROXIMITY, FORMAL_WAR_MIN_TURNS, ERA_LENGTH, ERA_SCORE_FOUND, ERA_SCORE_CONQUER, ERA_SCORE_WONDER, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, ERA_SCORE_GP, ERA_SCORE_MOMENT_MIN, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOVERNOR_LOYALTY, HEROIC_DEDICATIONS, ADMIRAL_MARCH_LIVE, GOLDEN_MOVE_BONUS, DEDICATION_PAYOUTS_LIVE, AGREEMENT_TURNS, ALLIANCE_CIVIC, OPEN_BORDERS_CIVIC, FAVOR_PER_ALLIANCE, ALLIANCE_QP_TURN, ALLIANCE_QP_ROUTE, ALLIANCE_L2_QP, ALLIANCE_L3_QP, ALLIANCE_ROUTE_TO, ALLIANCE_ROUTE_FROM, ALLIANCE_ROUTE_YKEY, ALLIANCE_M1_CS, ALLIANCE_R2_BOOST_TURNS, ALLIANCE_R3_SCI_PCT, ALLIANCE_C2_GPP, ALLIANCE_C3_CUL_PCT, ALLIANCE_C3_TOUR_PCT, ALLIANCE_E2_INFLUENCE, ALLIANCE_REL2_THEO_CS, ALLIANCE_REL3_FAITH_PER_POP, GRIEVANCE_WAR_SURPRISE, GRIEVANCE_WAR_FORMAL, GRIEVANCE_WAR_ON_FRIEND, GRIEVANCE_WAR_ON_SUZERAIN, GRIEVANCE_WAR_ON_CS_FRIEND, GRIEVANCE_CITY_TAKEN, GRIEVANCE_CITY_RAZED, GRIEVANCE_LAST_CITY, GRIEVANCE_CS_CONQUERED, GRIEVANCE_CS_RAZED, GRIEVANCE_DENOUNCE, GRIEVANCE_HELD_CAPITAL_PER_TURN, GRIEVANCE_ALLY_SHARE, GRIEVANCE_FRIEND_SHARE, GRIEVANCE_DECAY_BASE, GRIEVANCE_DECAY_FLOOR, GRIEVANCE_OCCUPIED_DECAY, GRIEVANCE_OCCUPIED_CAPITAL_DECAY, GRIEVANCE_FAVOR_FLOOR, GRIEVANCE_FAVOR_STEP, GRIEVANCE_FAVOR_MAX, GRIEVANCE_GANG, DIPLO_FAVOR_PER_SUZERAIN, CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION, CONGRESS_RESOLUTIONS, CONGRESS_DV_MIN_ERA, CONGRESS_DV_DELTA, CONGRESS_VOTE_STEP, CONGRESS_PROD_MULT, CONGRESS_GPP_MULT, CONGRESS_GROWTH_A, CONGRESS_GROWTH_B, CONGRESS_MIG_LOYALTY, CONGRESS_GW_MULT, CONGRESS_TARGET_KINDS, CONGRESS_PLUS_100, CONGRESS_MINUS_50, CONGRESS_TRADE_GOLD, CONGRESS_TRADE_CAPACITY, CONGRESS_POLICY_FAVOR, CONGRESS_IDEOLOGY_SLOTS, CONGRESS_ENERGY_DISCOUNT, CONGRESS_PR_MULT_A, CONGRESS_PR_MULT_B, CONGRESS_ADVISORY_CS, CONGRESS_PACT_LEVELS, DEAL_ITEMS, DEAL_TURNS, DEAL_OFFER_TURNS, DEAL_ITEM_KINDS, DEAL_PERMANENT, COMPETITIONS, COMPETITION_TURNS, COMPETITION_SILVER_PCT, COMPETITION_BRONZE_PCT, VISIBILITY_MAX, VISIBILITY_TECH, VISIBILITY_CS_PER_LEVEL, DELEGATION_COST, EMBASSY_COST, EMBASSY_CIVIC, CONGRESS_WORLD_RELIGION_RS, CONGRESS_WORLD_RELIGION_FAVOR, CULTURE_BOMB_RANGE, FAVOR_OCCUPIED_CAPITAL, EMERGENCIES, EMERGENCY_SLOTS, SPECIAL_SESSION_COST, SPECIAL_SESSION_GAP, EMERGENCY_MEMBER_FAVOR, EMERGENCY_TARGET_FAVOR, EMERGENCY_MEMBER_CS, EMERGENCY_MEMBER_MP, EMERGENCY_TARGET_LOYALTY, EMERGENCY_MEMBER_HEAL, EMERGENCY_TARGET_STRIKE_CS, EMERGENCY_ENVOY_GOLD, EMERGENCY_CS_ROUTE_GOLD, EMERGENCY_NUCLEAR, EMERGENCY_NUKE_TARGET_CS, EMERGENCY_NUKE_LOYALTY_CUT, WW_WMD_LAUNCHED, DED_EVENT_SCORE, DIPLO_VICTORY_POINTS, TOURISM_PER_VISITOR_PER_CIV, TOURISM_OPEN_BORDERS_PCT, TOURISM_ROUTE_PCT, TOURISM_GOV_MULT, TOURISM_RELIGIOUS_PENALTY_PCT, GOV_INTOLERANCE, CULTURE_PER_DOMESTIC_TOURIST, HOLY_CITY_TOURISM, ENLIGHTENMENT_CIVIC, ENGINEER_LIVE, DED_MONUMENTALITY, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS, DED_SKY, DED_BODYGUARD, DED_AUTOMATON, SKY_EUREKAS, SKY_ALUMINUM_PER_TURN, SKY_AIR_XP_PCT, AUTOMATON_URANIUM_PER_TURN, AUTOMATON_URANIUM_PER_MINE, PRODUCTION_QUEUE_MAX } from '../data/seats';
import { WONDER_TOURISM_BASE } from '../core/city';
import { BALANCED_WEIGHTS } from '../core/score';
import { NUKE_COLS, unitActionNames } from '../core/unitActions';
import { MAX_BARB_PER_CAMP, BARB_HORSE_RANGE, CLASS_MELEE_VS_ANTICAV, CLASS_ANTICAV_VS_CAV, FLANK_SUPPORT_CIVIC, AMPHIBIOUS_ATTACK_CS, FORT_DEFENSE_CS, THEO_HOLY_GROUND_STRENGTH, THEO_HOLY_CITY_STRENGTH } from '../core/combat';
import { GDR_UPGRADES, GDR_DRONE_AA, GDR_PARTICLE_BEAM_CS, GDR_ENHANCED_MOVES, GDR_ARMOR_PLATING_CS, GDR_NAVAL_PENALTY, FORMATION_CS, FORMATION_CIVIC, FORMATION_COST_MULT, FORMATION_TRAIN_DISCOUNT, FORMATION_TRAIN_BUILDING, UNITS, UNIT_HP, CITY_MAX_HP, WALLS_TIER_HP, WALLS_TIER_CS, WALLS_TIER_URBAN, URBAN_DEFENSES_TECH, REPAIR_QUIET_TURNS, WALL_DAMAGE_MELEE, WALL_DAMAGE_RANGED, WALL_BREACH_FRACTION, RANGED_CITY_PENALTY, ENCAMPMENT_HP, UNIT_CLASSES, UNIT_ERA_INDEX, unitHasClass, ROCK_BAND_VENUES, ROCK_BAND_WONDER_VENUE, ROCK_BAND_TIERS, ROCK_BAND_TIER_ODDS, ROCK_BAND_MAX_LEVEL, ROCK_BAND_COST_STEP } from '../data/units';
import { YIELD_KEYS } from '../core/types';
import { FLOOD_SEVERITY_P, FLOOD_DESTROY_P, FLOOD_DISTRICT_P, FLOOD_POP_P, FLOOD_DAMAGE_LO, FLOOD_DAMAGE_HI, FLOOD_FERT_FOOD, FLOOD_FERT_PROD, floodTerrainColumn, FLOOD_CHANCE, ERUPTION_CHANCE_PER_VOLCANO, DROUGHT_CHANCE, STORM_CHANCE, DROUGHT_LENGTH } from '../data/disasters';
import {
  CLIMATE_PHASES, DEFORESTATION_BANDS, CO2_PER_POINT, UNIT_CARBON_SHARE,
  UNIT_CARBON_RESOURCE_SHARE, ADVANCED_POWER_CELLS_SHARE, ADVANCED_POWER_CELLS_TECH,
  CARBON_RECAPTURE_UNITS, CARBON_RECAPTURE_FAVOR,
  LOWLAND_MAX_BAND, FLOOD_BARRIER_PER_TILE, POLLUTION_DISPLAY_DIVISOR,
  FAVOR_PER_POLLUTION_OVER, FAVOR_POLLUTION_CAP,
} from '../data/climate';
import { CARBON_PER_RESOURCE } from '../core/climate';
import { BUILDINGS, isGovYieldBuilding } from '../data/buildings';
import {
  CLASS_BIT, PROMO_CLASSES, PROMO_COLS, PROMO_KINDS, UNIT_PROMO_CLASS, promoRows,
} from '../data/promotions';

/** the widest effect list any promotion carries. */
const PROMO_SLOTS = 2;
/** pad a per-class column list out to the head's fixed width. */
const padTo = <T,>(xs: T[], fill: T): T[] => {
  const out = xs.slice();
  while (out.length < PROMO_COLS) out.push(fill);
  return out;
};
/** pad one row's effect list out to PROMO_SLOTS. */
const slotsOf = (xs: number[]): number[] => {
  const out = xs.slice(0, PROMO_SLOTS);
  while (out.length < PROMO_SLOTS) out.push(0);
  return out;
};
import { DISTRICTS, PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS, type AdjacencySource } from '../data/districts';
import { ENGINEER_FINISH_FRACTION } from '../core/game';
import { TECHS, ERAS, MODERN_ERA_INDEX, type ResearchEffect } from '../data/techs'; // era scale
import {
  SPY_CAPACITY_CIVICS, SPY_CAPACITY_TECHS, SPY_CAPACITY_MAX, SPY_MAX_LEVEL, SPY_SECRET_AGENT_LEVEL,
  SPY_IDLE, SPY_TRAVELLING, SPY_TRAVEL_COLS, SPY_MISSIONS, SPY_PROMO_OFFER,
  SPY_TRAVEL_TURNS_MIN, SPY_TRAVEL_TILES_PER_TURN, SPY_TRAVEL_TURNS_MAX,
  SPY_SUCCESS_PER_LEVEL_PCT, SPY_CAPTURE_PCT,
  SPY_COUNTERSPY_CATCH_PCT, BODYGUARD_OP_NUM, BODYGUARD_OP_DEN,
  SPY_UNREST_LOYALTY, SPY_UNREST_PER_LEVEL, SPY_GOVERNOR_TURNS,
  SPY_GOVERNOR_PER_LEVEL, SPY_SOURCES_LEVELS, SPY_SOURCES_TURNS,
  SPY_PARTISANS_MIN, SPY_PARTISANS_MAX,
  SPY_ESCAPE_ROUTES, SPY_SCANDAL_ENVOYS_BASE, SPY_SCANDAL_PER_LEVEL,
} from '../data/espionage';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, SLOT_KINDS, GOVERNMENTS_ADOPTION_LIVE, type SlotKind, type BuildingYieldBoost, type PolicyEffects } from '../data/policies';

/** A `buildingYieldBoost` as the GPU reads it:
 *  [districtIndex, yieldIndex, pct, popMin, popPct, adjMin, adjPct].
 *  districtIndex -1 = the row carries no boost. */
const boostRow = (b: BuildingYieldBoost | undefined): number[] =>
  b
    ? [PLACEABLE_DISTRICTS.indexOf(b.district), YIELD_KEYS.indexOf(b.yield),
       b.pct, b.popMin, b.popPct, b.adjMin, b.adjPct]
    : [-1, -1, 0, 0, 0, 0, 0];

/** Every channel a government or a policy card can carry, in one row so the
 *  two tables cannot drift. A government and a card layer identically. */
const governorEffectRow = (fx: GovernorEffects) => ({
  cityYields: YIELD_KEYS.map((k) => fx.cityYields?.[k] ?? 0),
  perCitizen: YIELD_KEYS.map((k) => fx.perCitizen?.[k] ?? 0),
  yieldMult: YIELD_KEYS.map((k) => fx.yieldMult?.[k] ?? 1),
  adjacencyMult: PLACEABLE_DISTRICTS.map((d) => fx.adjacencyMult?.[d] ?? 1),
  faithPerSpecialty: fx.faithPerSpecialty ?? 0,
  districtProdMult: fx.districtProdMult ?? 1,
  projectProdMult: fx.projectProdMult ?? 1,
  growthMult: fx.growthMult ?? 1,
  gppMult: fx.gppMult ?? 1,
  gwTourismMult: fx.gwTourismMult ?? 1,
  pressureMult: fx.pressureMult ?? 1,
  builderCharges: fx.builderCharges ?? 0,
  settlerFreePop: fx.settlerFreePop ? 1 : 0,
  harvestMult: fx.harvestMult ?? 1,
  cityDefense: fx.cityDefense ?? 0,
  territoryCS: fx.territoryCS ?? 0,
  extraStrikes: fx.extraStrikes ?? 0,
  freePromoOnTrain: fx.freePromoOnTrain ? 1 : 0,
  theologyCS: fx.theologyCS ?? 0,
  fullHeal: fx.fullHeal ? 1 : 0,
  ignoreForeignPressure: fx.ignoreForeignPressure ? 1 : 0,
  faithOnBuildPct: fx.faithOnBuildPct ?? 0,
  waterWorks: fx.waterWorks ? 1 : 0,
  // [range, loyalty] per turn onto this seat's OTHER cities / onto foreign ones
  loyaltyToOwn: fx.loyaltyToOwn ? [fx.loyaltyToOwn.range, fx.loyaltyToOwn.loyalty] : [0, 0],
  loyaltyToForeign: fx.loyaltyToForeign ? [fx.loyaltyToForeign.range, fx.loyaltyToForeign.loyalty] : [0, 0],
  spyLevelPenalty: fx.spyLevelPenalty ?? 0,
  noSiege: fx.noSiege ? 1 : 0,
  stockpilePerTurn: fx.stockpilePerTurn ?? 0,
  resourceDiscountPct: fx.resourceDiscountPct ?? 0,
  envoysAtMinor: fx.envoysAtMinor ?? 0,
  envoyDoubleAtMinor: fx.envoyDoubleAtMinor ? 1 : 0,
  minorLuxuries: fx.minorLuxuries ? 1 : 0,
  routeStartFood: fx.routeStartFood ?? 0,
  industryAllSources: fx.industryAllSources ? 1 : 0,
  envDamageImmune: fx.envDamageImmune ? 1 : 0,
  goldPerFeature: fx.goldPerFeature ?? 0,
  appealNearFeature: fx.appealNearFeature ?? 0,
  firstPromoBonus: fx.firstPromoBonus ?? 0,
});

const effectRow = (fx: PolicyEffects) => ({
  cityYields: YIELD_KEYS.map((k) => fx.cityYields?.[k] ?? 0),
  capitalYields: YIELD_KEYS.map((k) => fx.capitalYields?.[k] ?? 0),
  housingAll: fx.housingAll ?? 0,
  amenitiesAll: fx.amenitiesAll ?? 0,
  housingPerWallLevel: fx.housingPerWallLevel ?? 0,
  theologyCS: fx.theologyCS ?? 0,
  yieldsPerGovBuilding: fx.yieldsPerGovBuilding ?? 0,
  yieldMult: YIELD_KEYS.map((k) => fx.yieldMult?.[k] ?? 1),
  adjacencyMult: PLACEABLE_DISTRICTS.map((d) => fx.adjacencyMult?.[d] ?? 1),
  buildingYieldBoost: boostRow(fx.buildingYieldBoost),
  tilePurchaseMult: fx.tilePurchaseMult ?? 1,
  encampHarborProdMult: fx.encampHarborProdMult ?? 1, // VETERANCY: Encampment + Harbor items
  housingIfDistricts: fx.housingIfDistricts ? [fx.housingIfDistricts.min, fx.housingIfDistricts.housing] : [-1, 0],
  amenitiesIfSpecialty: fx.amenitiesIfSpecialty ? [fx.amenitiesIfSpecialty.min, fx.amenitiesIfSpecialty.amenities] : [-1, 0],
  newDeal: fx.newDeal ? [fx.newDeal.min, fx.newDeal.housing, fx.newDeal.amenities] : [-1, 0, 0],
  // [target, unit-class mask over UNIT_CLASSES, eraMax, pct]; target -1 =
  // the row carries no production boost, 0 = the named unit classes,
  // 1 = wonders, 2 = EVERY unit (Fascism's class-free arm).
  prodBoost: fx.prodBoost
    ? [fx.prodBoost.target === 'wonder' ? 1 : fx.prodBoost.target === 'anyUnit' ? 2 : 0,
       fx.prodBoost.classes.reduce((m, c) => m | (1 << UNIT_CLASSES.indexOf(c)), 0),
       fx.prodBoost.eraMax, fx.prodBoost.pct]
    : [-1, 0, 0, 0],
  builderCharges: fx.builderCharges ?? 0,
  unitMaintenanceCut: fx.unitMaintenanceCut ?? 0,
  wmdUpkeepPct: fx.wmdUpkeepPct ?? 0,
  combatVsBarbarians: fx.combatVsBarbarians ?? 0,
  cityDefense: fx.cityDefense ?? 0,
  cityRanged: fx.cityRanged ?? 0,
  reconXpMult: fx.reconXpMult ?? 1,
  routePlunderMult: fx.routePlunderMult ?? 1,
  pillageMult: fx.pillageMult ?? 1,
  faithBuyLandUnits: fx.faithBuyLandUnits ? 1 : 0,
  routeGold: fx.routeGold ?? 0,
  influencePerTurn: fx.influencePerTurn ?? 0,
  firstEnvoyDouble: fx.firstEnvoyDouble ? 1 : 0,
  envoyDoubleDiffGov: fx.envoyDoubleDiffGov ? 1 : 0,
  tourismRouteBonus: fx.tourismRouteBonus ?? 0,
  culturePerSuzerain: fx.culturePerSuzerain ?? 0,
  // [promotion-class mask (CLASS_BIT bits), allCombat, cs]
  unitCombatCS: fx.unitCombatCS
    ? [(fx.unitCombatCS.classes ?? []).reduce((m, c) => m | (CLASS_BIT[c] ?? 0), 0),
       fx.unitCombatCS.all ? 1 : 0, fx.unitCombatCS.cs]
    : [0, 0, 0],
  xpPct: fx.xpPct ?? 0,
  wwCutPct: fx.wwCutPct ?? 0,
  gppMult: fx.gppMult ?? 1,
  cityWithDistrict: fx.cityWithDistrict
    ? [fx.cityWithDistrict.housing, fx.cityWithDistrict.amenities]
    : [0, 0],
  gpp: GP_CLASSES.map((c) => fx.gppFlat?.[c] ?? 0),
  governorYieldMult: YIELD_KEYS.map((k) => fx.governorYieldMult?.[k] ?? 1),
  governorPerCitizen: YIELD_KEYS.map((k) => fx.governorPerCitizen?.[k] ?? 0),
  // ---- the DARK-AGE channels ----
  improvementYields: IMPROVEMENT_IDS.map((i) => YIELD_KEYS.map((k) => fx.improvementYields?.[i as ImprovementId]?.[k] ?? 0)),
  // [district index, yield index, x1000 multiplier] rows
  districtYieldMult: (fx.districtYieldMult ?? []).map((r) =>
    [PLACEABLE_DISTRICTS.indexOf(r.district), YIELD_KEYS.indexOf(r.yield), Math.round(r.mult * 1000)]),
  // [building index, yield index, x1000 multiplier] rows
  buildingYieldMult: (fx.buildingYieldMult ?? []).map((r) =>
    [buildingIdx.get(r.building) ?? -1, YIELD_KEYS.indexOf(r.yield), Math.round(r.mult * 1000)]),
  domesticRouteYield: YIELD_KEYS.map((k) => fx.domesticRouteYield?.[k] ?? 0),
  routeYieldMult: fx.routeYieldMult ?? 1,
  noSettlers: fx.noSettlers ? 1 : 0,
  healOnlyHome: fx.healOnlyHome ? 1 : 0,
  religiousCsHome: fx.religiousCsHome ?? 0,
  navalRaiderProdMult: fx.navalRaiderProdMult ?? 1,
  navalRaiderMoves: fx.navalRaiderMoves ?? 0,
  grievanceNoDecay: fx.grievanceNoDecay ? 1 : 0,
  projectProdMult: fx.projectProdMult ?? 1,
  loyaltyAll: fx.loyaltyAll ?? 0,
  favorPerBuilding: fx.favorPerBuilding
    ? [buildingIdx.get(fx.favorPerBuilding.building) ?? -1, fx.favorPerBuilding.favor]
    : [-1, 0],
  noEnvoyInfluence: fx.noEnvoyInfluence ? 1 : 0,
  unitCsVsEra: fx.unitCsVsEra ? [fx.unitCsVsEra.minEra, fx.unitCsVsEra.cs] : [-1, 0],
  landUnitCostMult: fx.landUnitCostMult ?? 1,
  concertShare: fx.concertShare ?? 0,
  militaryMaintenanceAdd: fx.militaryMaintenanceAdd ?? 0,
});
import { BOOSTS, BOOST_FRACTION } from '../data/boosts';
import { STRATEGIC_IDS, STRATEGIC_PER_TURN, STOCKPILE_CAP_BASE, STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING, UNIT_RESOURCE_COST } from '../data/constants';
import { CITY_WORK_RADIUS, CITIZEN_SCIENCE, CITIZEN_CULTURE, FOOD_PER_CITIZEN, CITY_CENTER_MIN_FOOD, CITY_CENTER_MIN_PRODUCTION, HOUSING_FRESH_WATER, HOUSING_COASTAL, HOUSING_NO_WATER, AQUEDUCT_FRESH_BONUS, AQUEDUCT_NO_FRESH_TOTAL, GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT, LUXURY_AMENITY_CITIES, GAME_SPEED, REGIONAL_RANGE, EMBARK_MOVES, EMBARK_MOVE_TECHS, SEA_MOVE_TECH, SEA_MOVE_TECH_BONUS, EMBARKED_DEFENSE_CS_BY_ERA, embarkState, MP_SCALE, ROAD_TIER_MP, ROAD_TIER_BRIDGES, ROAD_TIER_ERA, RAILROAD_MP, RAILROAD_TECH, RAILROAD_COST, EMBARK_TRANSITION_MP } from '../data/constants';

// The GPU improvement index space (tile.improvement values, build codes 13-15).
// the roster grew — indices 0-2 stay stable (every existing
// plane/consumer keys on them); the resource-only improvements append.
// FISHING_BOATS stays OUT: water-only, and a land builder can never stand
// on the tile (unreachable in both engines).
// SEASIDE_RESORT appended LAST — this array's order IS the GPU's
// improvement index, so anything but an append renumbers every other row.
import { IMPROVEMENT_IDS } from '../core/unitActions'; // ONE roster, core-owned (order is the column index; FORT appended LAST)

 
import { techList, civicList, techIdx, civicIdx, centerBuildings, buildingIdx, buildingUnlockTech, buildingUnlockCivic, FEAT_IDS, featIdx, TERRAIN_IDS, RESOURCE_IDS, BUILT_WONDER_LIST, LUXURY_IDS } from './catalog';
import { clearableFeatures, FEATURES } from '../../world/features';
import { DED_TO_ARMS, DED_DRACONES, DED_COINAGE, DED_STEAM, DED_WISH, DEDICATION_ERAS, WISH_PARK_TOURISM_MULT, WISH_WONDER_TOURISM_NUM, WISH_WONDER_TOURISM_DEN, TO_ARMS_MIL_PROD_MULT, DRACONES_DISCOVERY_SCORE, COINAGE_INTL_GOLD_PER_SPEC, STEAM_WONDER_PROD_MULT } from '../data/seats';
import { BUILDING_ERA_INDEX } from '../data/buildings';
import { INDUSTRIAL_ERA_INDEX } from '../data/techs';
import { GOVERNORS, GOVERNOR_INDEX, GOVERNOR_PROMOTIONS, GOVERNOR_PROMOTION_INDEX, GOVERNOR_DEFAULT_PROMOTION, GOVERNOR_TITLE_CIVICS, GOVERNOR_NEUTRALIZE_TURNS, GOVERNANCE_DOCTRINE_FAVOR, WATER_WORKS_HOUSING, WATER_WORKS_AMENITIES, promotionBitValue, type GovernorEffects } from '../data/governors';

/** The REAL settler rule now: a 1-pop city may not train or buy one.
 *  Exported to the GPU as scenario.settlerPopGate. */
// CIV6 (Pillaging): the shared plunder-kind enum — 0 none, 1 heal, 2 gold,
// 3 faith, 4 science, 5 culture — over `PlunderRow`.
const PLUNDER_KIND_IDX = { heal: 1, gold: 2, faith: 3, science: 4, culture: 5 } as const;
const plunRow = (p?: PlunderRow): number[] => (p ? [PLUNDER_KIND_IDX[p.kind], p.amount] : [0, 0]);

const SETTLER_POP_GATE = 2;

const beliefRow = (def: { effects: BeliefEffects }) => ({
  featY: FEAT_IDS.map((f) => YIELD_KEYS.map((k) => def.effects.featureYields?.[f]?.[k] ?? 0)),  // [nFeat, 6]
  // the extra ADJACENCY sources a belief hands a district type, [nDistrict,
  // nSource] so the pools sum: a pad row is zero, not a sentinel.
  distAdj: PLACEABLE_DISTRICTS.map((d) => ADJ_SRC.map((s) => {
    const r = def.effects.districtAdjacency;
    return r && r.district === d
      ? r.rules.filter((x) => x.source === s).reduce((acc, x) => acc + x.amount, 0)
      : 0;
  })),
  bldgY: centerBuildings.map((b) => YIELD_KEYS.map((k) => def.effects.buildingYields?.[b.id]?.[k] ?? 0)),  // [NB, 6]
  bldgH: centerBuildings.map((b) => def.effects.buildingHousing?.[b.id] ?? 0),  // [NB]
  border: def.effects.borderCostMult ?? 1,
  growth: def.effects.growthMult ?? 1,
  gpp: GP_CLASSES.map((c) => def.effects.gppFlat?.[c] ?? 0),
  we: def.effects.workEthic ? 1 : 0,
  river: def.effects.riverCity ? [def.effects.riverCity.amenities, def.effects.riverCity.housing] : [0, 0],
  zen: def.effects.amenitiesIfSpecialty
    ? [def.effects.amenitiesIfSpecialty.min, def.effects.amenitiesIfSpecialty.amenities]
    : [0, 0],
  perF: def.effects.perFollowers
    ? [def.effects.perFollowers.per, ...YIELD_KEYS.map((k) => def.effects.perFollowers!.yields[k] ?? 0)]
    : [0, 0, 0, 0, 0, 0, 0],
  perC: YIELD_KEYS.map((k) => def.effects.perCity?.[k] ?? 0),
  fpw: def.effects.faithPerWonder ?? 0,  // Divine Inspiration
  presR: def.effects.pressureRangeBonus ?? 0,  // Itinerant Preachers
  tradeRel: YIELD_KEYS.map((k) => def.effects.tradeReligionYields?.[k] ?? 0),  // Messenger of the Gods [6]
  cnear: def.effects.combatNearFollowing ?? 0,  // Just War (within justWarRange, unit-vs-unit)
  cdef: def.effects.combatDefendFollowing ?? 0,  // Defender of the Faith
  cvs: def.effects.combatVsUnitInFollowing ?? 0,  // Crusade
  // Missionary channels — pre-rounded INTEGERS so both engines read the
  // identical value (the GPU indexes these by civ_only_enhancer + a base-value pad):
  mchg: def.effects.missionaryChargeBonus ?? 0,  // Scripture +1 charge
  mlump: Math.round(SPREAD_PRESSURE * (def.effects.spreadPressureMult ?? 1)),  // Scripture 15, base 10
  mcost: Math.round((UNITS.MISSIONARY?.cost ?? 0) * (def.effects.missionaryCostMult ?? 1)),  // Holy Order 42, base 60
  impY: IMPROVEMENT_IDS.map((id) => YIELD_KEYS.map((k) => def.effects.improvementYields?.[id]?.[k] ?? 0)),
  impRes: (() => {
    const rows = [0, 1, 2, 3].map(() => YIELD_KEYS.map(() => 0 as number));
    const rule = def.effects.improvementOnResource;
    if (rule) {
      const cat = rule.category === 'bonus' ? 1 : rule.category === 'strategic' ? 2 : 3;
      rows[cat] = YIELD_KEYS.map((k) => rule.yields[k] ?? 0);
    }
    return rows;
  })(),
});


const boostRows: object[] = [];
for (const [id, def] of Object.entries(BOOSTS)) {
  if (!def.check) continue;
  const target = techIdx.has(id) ? 'tech' : civicIdx.has(id) ? 'civic' : null;
  if (!target) continue;
  const idx = target === 'tech' ? techIdx.get(id)! : civicIdx.get(id)!;
  const c = def.check;
  let row: object | null = null;
  if (c.kind === 'building') {
    const b = buildingIdx.get(c.id);
    if (b !== undefined) row = { kind: 'building', b, count: c.count };
  } else if (c.kind === 'cityPop') row = { kind: 'cityPop', pop: c.pop };
  else if (c.kind === 'totalPop') row = { kind: 'totalPop', pop: c.pop };
  else if (c.kind === 'coastalCity') row = { kind: 'coastalCity' };
  else if (c.kind === 'cities') row = { kind: 'cities', count: c.count };
  else if (c.kind === 'tech') {
    const t = techIdx.get(c.id);
    if (t !== undefined) row = { kind: 'tech', t };
  } else if (c.kind === 'nearNaturalWonder') row = { kind: 'nearNaturalWonder' };
  else if (c.kind === 'improvement') {
    // Improvement eurekas for every improvement in the grown roster (a
    // gate catch, seed 9066 t57 rTechProg1: seat 1's first QUARRY at t48
    // fired MASONRY's eureka in TS only — the old FARM/MINE/LUMBER
    // hardcode left quarry/pasture rows unexported, so the GPU's research
    // stream forked on the boosted cost). MASONRY (quarry) and
    // HORSEBACK_RIDING (pasture) are live now; CELESTIAL_NAVIGATION
    // (FISHING_BOATS) stays out — the improvement is out of roster,
    // water-unreachable in both engines.
    const imp = IMPROVEMENT_IDS.indexOf(c.id);
    if (imp >= 0) row = { kind: 'improvement', imp, count: c.count, onResource: c.onResource ? 1 : 0 };
  } else if (c.kind === 'anyWonderBuilt') {
    row = { kind: 'anyWonderBuilt' };
  } else if (c.kind === 'district') {
    // District eurekas/inspirations (STATE_WORKFORCE: any specialty district;
    // MATHEMATICS: 3; per-type ones). distinctTypes conditions
    // (CIVIL_ENGINEERING: 7 different specialty districts) export now — the
    // full specialty catalog is scaffold-placeable, so both civs can satisfy
    // them (the old "wait for D3" skip made the GPU miss a live inspiration:
    // rng 2026006131 t248).
    const dtype = c.type ? PLACEABLE_DISTRICTS.indexOf(c.type) : -1;
    row = { kind: 'district', dtype, count: c.count, distinct: c.distinctTypes ? 1 : 0 };
  } else if (c.kind === 'greatPeople') {
    // Great-person eurekas (EDUCATION: a Scientist; HUMANISM: an Artist;
    // ENLIGHTENMENT: any 3). cls -1 = any class (sum); else the GP_CLASSES
    // index, which is the GPU's gp_earned column (tracks the first 5 classes).
    const cls = c.class ? GP_CLASSES.indexOf(c.class) : -1;
    if (!c.class) row = { kind: 'greatPeople', cls: -1, count: c.count };
    else if (cls >= 0 && cls < 5) row = { kind: 'greatPeople', cls, count: c.count };
  } else if (c.kind === 'policies') {
    // the "run N policy cards" inspiration (MEDIEVAL_FAIRES,
    // count 4). Dormant until the new-card unlockPolicy wiring let the scripted
    // seat 0 fill 4+ slots in-gate; the GPU counts SEAT 0's slotted-policy
    // mask (`_gov_policy_mods`). Seat-0 only: the civ-seat boost detector has
    // no arm for this kind (civ governments carry no slotted-policy count).
    row = { kind: 'policies', count: c.count };
  }
  if (row) boostRows.push({ target, idx, ...row });
}


/** [row, improvement, yield] — what each research row adds to an
 *  improvement's own yields, the `improvementYields` effect summed. */
const researchImpYields = (rows: readonly { effects: readonly ResearchEffect[] }[]) =>
  rows.map((r) => IMPROVEMENT_IDS.map((id) => {
    const y = YIELD_KEYS.map(() => 0);
    for (const e of r.effects) {
      if (e.kind !== 'improvementYields' || e.improvement !== id) continue;
      YIELD_KEYS.forEach((k, i) => { y[i] += e.yields[k] ?? 0; });
    }
    return y;
  }));

const ADJ_SRC: AdjacencySource[] = [
  'MOUNTAIN', 'RAINFOREST', 'WOODS', 'REEF', 'NATURAL_WONDER', 'BUILT_WONDER',
  'RIVER', 'DISTRICT', 'CITY_CENTER', 'HARBOR_DISTRICT', 'SEA_RESOURCE',
  'MINE', 'QUARRY', 'AQUEDUCT', 'DAM', 'CANAL', 'GOV_PLAZA',
  'GEOTHERMAL_FISSURE', 'TUNDRA', 'DESERT',
];

const SCRIPTED_CAMPUS = true;

const PLACEMENT_CODE = { aqueduct: 1, coastal: 2, encampment: 3, flat: 4, dam: 5, canal: 6 } as const;

const SLOT_KIND_IDX: Record<SlotKind, number> = { military: 0, economic: 1, diplomatic: 2, wildcard: 3 };


/** ONE person's dense effect record, in `GP_FX` order with the two permanent
 *  runs appended. Every magnitude is the sourced row's own. */
function gpFxRow(p: GreatPersonDef): number[] {
  const fx = gpEffectOf(p);
  const v: Record<string, number> = {
    science: fx.science ?? 0,
    culture: fx.culture ?? 0,
    gold: fx.gold ?? 0,
    prodCapital: fx.productionToCapital ?? 0,
    faith: fx.faith ?? 0,
    eurekaRandom: fx.eurekaRandom ?? 0,
    eurekaLo: fx.eurekaLo ?? 0,
    eurekaHi: fx.eurekaHi ?? 0,
    inspirationRandom: fx.inspirationRandom ?? 0,
    eurekaEra: fx.eurekaEra ? 1 : 0,
    freeTechRandom: fx.freeTechRandom ?? 0,
    unitIdx: fx.unit ? Object.values(UNITS).findIndex((u) => u.id === fx.unit) : -1,
    unitPromotions: fx.unitPromotions ?? 0,
    promotionLevels: fx.promotionLevels ?? 0,
    xpPct: fx.xpPct ?? 0,
    envoys: fx.envoys ?? 0,
    wonderProduction: fx.wonderProduction ?? 0,
    wonderEraDouble: fx.wonderEraDouble ?? -1,
    spaceProduction: fx.spaceProduction ?? 0,
    perAdjSource: fx.perAdjacent ? GP_PER_ADJ_SOURCES.indexOf(fx.perAdjacent.source) : -1,
    perAdjYield: fx.perAdjacent ? GP_YIELD_KEYS.indexOf(fx.perAdjacent.yield) : -1,
    perAdjAmount: fx.perAdjacent?.amount ?? 0,
    perAdjHere: fx.perAdjacent?.here ? 1 : 0,
    luxuryCopies: fx.luxuryCopies ?? 0,
    luxuryAmenities: fx.luxuryAmenities ?? 0,
    greatWorkKind: fx.greatWorkKind ?? -1,
    gppAll: fx.gppAll ?? 0,
    strategicSlot: fx.strategic ? strategicSlot(fx.strategic.resource) : -1,
    strategicAmount: fx.strategic?.amount ?? 0,
    artifactScience: fx.artifactScience ?? 0,
    airSlotBonus: fx.airSlotBonus ?? 0,
    suzerainSeize: fx.suzerainSeize ? 1 : 0,
    formation: fx.formation ?? 0,
    formationNaval: fx.formationNaval ? 1 : 0,
    wonderBuyout: fx.wonderBuyout ? 1 : 0,
  };
  return [
    ...GP_FX.map((k) => v[k] ?? 0),
    ...GP_PERM.map((k) => fx.perm?.[k] ?? 0),
    ...GP_CITY_PERM.map((k) => fx.cityPerm?.[k] ?? 0),
  ];
}

export function buildRules() {
  const rules = {
    focusBase: [2, 2, 1, 1, 1, 1], // food, production, gold, science, culture, faith
    citizenScience: CITIZEN_SCIENCE,
    citizenCulture: CITIZEN_CULTURE,
    foodPerCitizen: FOOD_PER_CITIZEN,
    centerMinFood: CITY_CENTER_MIN_FOOD,
    centerMinProduction: CITY_CENTER_MIN_PRODUCTION,
    housing: { fresh: HOUSING_FRESH_WATER, coastal: HOUSING_COASTAL, none: HOUSING_NO_WATER, aqFreshBonus: AQUEDUCT_FRESH_BONUS, aqNoFreshTotal: AQUEDUCT_NO_FRESH_TOTAL },
    regionalRange: REGIONAL_RANGE, // regional-building reach (hex distance, city centers)
    cardiffHarborPower: CARDIFF_HARBOR_POWER,
    laserPowerLoad: LASER_POWER_LOAD,
    biospherePowerMult: BIOSPHERE_POWER_MULT,
    boostFraction: BOOST_FRACTION,
    // amenityTier(balance) thresholds, highest first (see data/constants.ts).
    // real Civ 6 bands — Content exactly 0, Displeased -1..-2.
    amenityTiers: [
      { min: 3, growth: 1.2, yield: 1.1 },
      { min: 1, growth: 1.1, yield: 1.05 },
      { min: 0, growth: 1.0, yield: 1.0 },
      { min: -2, growth: 0.85, yield: 0.95 },
      { min: -999, growth: 0.7, yield: 0.9 },
    ],
    scenario: { settlerBase: Math.round(80 * GAME_SPEED), settlerPerCity: Math.round(30 * GAME_SPEED), settlerPopGate: SETTLER_POP_GATE, goldPurchaseMult: GOLD_PURCHASE_MULT, faithPurchaseMult: FAITH_PURCHASE_MULT, turnLimit: TURN_LIMIT, builderBase: 50, builderPer: 4, gameSpeed: GAME_SPEED, spaceLyTarget: SPACE_FLIGHT_LY },
    actions: { unit: unitActionNames(IMPROVEMENT_IDS) },
    districtCost: { base: Math.round(54 * GAME_SPEED), scale: 9 },
    score: { popWeight: 3, yieldWeights: YIELD_KEYS.map((k) => BALANCED_WEIGHTS[k] ?? 0) },
    // THE MOVEMENT UNIT and the route ladder over it (`MP_SCALE`).
    mpScale: MP_SCALE,
    roadTierMp: ROAD_TIER_MP,
    roadTierBridges: ROAD_TIER_BRIDGES.map((b) => (b ? 1 : 0)),
    roadTierEra: ROAD_TIER_ERA,
    railroadMp: RAILROAD_MP,
    // CIV6 (Coastal Lowlands): the wonders whose placement asks for COASTAL
    // WATER — the one `wok` clause a tile turning to sea can move, because
    // every other one the exporter derives reads TERRAIN, which stays.
    wonderCoastalMask: BUILT_WONDER_LIST.reduce(
      (m, w, i) => m | (w.placement.onCoastalWater ? 1 << i : 0), 0),
    // CIV6 (Railroad): the tech, and the stockpile slots one tile spends
    railroadTech: techIdx.get(RAILROAD_TECH) ?? -1,
    railroadCost: RAILROAD_COST.map(([id, n]: readonly [string, number]) => [STRATEGIC_IDS.indexOf(id), n]),
    embarkTransitionMp: EMBARK_TRANSITION_MP,
    shipyardBidx: buildingIdx.get('SHIPYARD') ?? -1,
    militaryAcademyBidx: buildingIdx.get(FORMATION_TRAIN_BUILDING.land) ?? -1,
    seaportBidx: buildingIdx.get(FORMATION_TRAIN_BUILDING.naval) ?? -1,
    nuclearPlantBidx: buildingIdx.get('NUCLEAR_POWER_PLANT') ?? -1,
    ancientWallsBidx: buildingIdx.get('ANCIENT_WALLS') ?? -1,
    worshipBidx: WORSHIP_BUILDINGS.map((id) => buildingIdx.get(id) ?? -1),
    templeBidx: buildingIdx.get('TEMPLE') ?? -1,
    worshipFaithCost: Math.round(380 * GAME_SPEED),
    shrineBidx: buildingIdx.get('SHRINE') ?? -1,
    trade: {
      marketBidx: buildingIdx.get('MARKET') ?? -1,
      lighthouseBidx: buildingIdx.get('LIGHTHOUSE') ?? -1,
      foreignTradeCidx: civicIdx.get('FOREIGN_TRADE') ?? -3,
      capWonderWidx: ['COLOSSUS', 'GREAT_ZIMBABWE']
        .map((id) => BUILT_WONDER_LIST.findIndex((w) => w.id === id))
        .filter((i) => i >= 0),
      range: TRADE_ROUTE_RANGE_LAND,
      seaRange: TRADE_ROUTE_RANGE_SEA,
      cityStateRouteGold: CITY_STATE_ROUTE_GOLD,
      cityStateRouteSpec: CITY_STATE_ROUTE_SPEC,
      intlGold: INTL_ROUTE_GOLD,
      duration: TRADE_ROUTE_DURATION,
      plunderGold: PLUNDER_ROUTE_GOLD,
      walkRail: TRADE_WALK_EXPIRY_RAIL,
      // the era-scaled minimum-duration bumps (tradeRouteMinDuration):
      // +10 from era 2, +20 from era 4, +30 from era 7
      durEraBumps: [2, 4, 7],
      // the Trader's cost progression (traderCost): base x (1 + prog x
      // floor(100 x furthest tree fraction) / 100)
      traderCostProg: 4,
    },
    warWeariness: {
      eraFormal: [...WW_ERA_BASE_FORMAL],
      eraSurprise: [...WW_ERA_BASE_SURPRISE],
      abroad: WW_ABROAD_MULT,
      death: WW_DEATH_MULT,
      decayAtWar: WW_DECAY_AT_WAR,
      decayAtPeace: WW_DECAY_AT_PEACE,
      peaceTreaty: WW_PEACE_TREATY,
      perAmenity: WAR_WEARINESS_PER_AMENITY,
    },
    eras: {
      length: ERA_LENGTH,
      count: ERAS.length,
      found: ERA_SCORE_FOUND,
      conquer: ERA_SCORE_CONQUER,
      wonder: ERA_SCORE_WONDER,
      pantheon: ERA_SCORE_PANTHEON,
      religion: ERA_SCORE_RELIGION,
      gp: ERA_SCORE_GP,
      momentMin: ERA_SCORE_MOMENT_MIN,
      darkT: ERA_DARK_T,
      goldenT: ERA_GOLDEN_T,
      agePressure: AGE_PRESSURE,
      // CIV6 (Governor): the thirteen civics that each "grant 1 Governor
      // Title", by civic index; the Government Plaza's own titles ride the
      // district and building rows.
      governorTitleCivics: GOVERNOR_TITLE_CIVICS.map((c) => civicIdx.get(c) ?? -1).filter((i) => i >= 0),
      governorNeutralizeTurns: GOVERNOR_NEUTRALIZE_TURNS,
      waterWorksHousing: WATER_WORKS_HOUSING,
      waterWorksAmenities: WATER_WORKS_AMENITIES,
      governanceDoctrineFavor: GOVERNANCE_DOCTRINE_FAVOR,
      grievanceWarSurprise: GRIEVANCE_WAR_SURPRISE, grievanceWarFormal: GRIEVANCE_WAR_FORMAL, grievanceWarOnFriend: GRIEVANCE_WAR_ON_FRIEND, grievanceWarOnSuzerain: GRIEVANCE_WAR_ON_SUZERAIN, grievanceWarOnCsFriend: GRIEVANCE_WAR_ON_CS_FRIEND, grievanceCityTaken: GRIEVANCE_CITY_TAKEN, grievanceCityRazed: GRIEVANCE_CITY_RAZED, grievanceLastCity: GRIEVANCE_LAST_CITY, grievanceCsConquered: GRIEVANCE_CS_CONQUERED, grievanceCsRazed: GRIEVANCE_CS_RAZED, grievanceDenounce: GRIEVANCE_DENOUNCE, grievanceHeldCapital: GRIEVANCE_HELD_CAPITAL_PER_TURN, grievanceAllyShare: GRIEVANCE_ALLY_SHARE, grievanceFriendShare: GRIEVANCE_FRIEND_SHARE, grievanceDecayBase: GRIEVANCE_DECAY_BASE, grievanceDecayFloor: GRIEVANCE_DECAY_FLOOR, grievanceOccupiedDecay: GRIEVANCE_OCCUPIED_DECAY, grievanceOccupiedCapitalDecay: GRIEVANCE_OCCUPIED_CAPITAL_DECAY, grievanceFavorFloor: GRIEVANCE_FAVOR_FLOOR, grievanceFavorStep: GRIEVANCE_FAVOR_STEP, grievanceFavorMax: GRIEVANCE_FAVOR_MAX, grievanceGang: GRIEVANCE_GANG, diplomaticFavorPerSuzerain: DIPLO_FAVOR_PER_SUZERAIN, congressInterval: CONGRESS_INTERVAL, congressMinEra: CONGRESS_MIN_ERA, dvpPerResolution: DVP_PER_RESOLUTION, diploVictoryPoints: DIPLO_VICTORY_POINTS, dedicationPayoutsLive: DEDICATION_PAYOUTS_LIVE, dedMonumentality: DED_MONUMENTALITY, dedFreeInquiry: DED_FREE_INQUIRY, dedPenBrush: DED_PEN_BRUSH_AND_VOICE, dedExodus: DED_EXODUS, heroicDedications: HEROIC_DEDICATIONS, dedEventScore: [...DED_EVENT_SCORE], goldenMoveBonus: GOLDEN_MOVE_BONUS, governorLoyalty: GOVERNOR_LOYALTY, dedToArms: DED_TO_ARMS, dedDracones: DED_DRACONES, dedCoinage: DED_COINAGE, dedSteam: DED_STEAM, dedWish: DED_WISH, dedSky: DED_SKY, dedBodyguard: DED_BODYGUARD, dedAutomaton: DED_AUTOMATON,
      // which catalog entries each WORLD ERA offers, padded to a rectangle
      // with -1 (the GPU walks `dedEraLen` entries of each row)
      dedEras: DEDICATION_ERAS.map((w) => {
        const wide = Math.max(...DEDICATION_ERAS.map((x) => x.length));
        return [...w, ...Array<number>(wide - w.length).fill(-1)];
      }),
      dedEraLen: DEDICATION_ERAS.map((w) => w.length),
      // ESPIONAGE. The mission table's ORDER is the wire: column k of the
      // MISSION head is row k here on both engines. `district` is a
      // PLACEABLE_DISTRICTS index, -1 for the CITY CENTER (which every city
      // has and no placeable row carries).
      espionage: {
        capacityCivics: SPY_CAPACITY_CIVICS.map((c) => Object.keys(CIVICS).indexOf(c)).filter((i) => i >= 0),
        capacityTechs: SPY_CAPACITY_TECHS.map((t) => Object.keys(TECHS).indexOf(t)).filter((i) => i >= 0),
        secretAgentLevel: SPY_SECRET_AGENT_LEVEL,
        capacityMax: SPY_CAPACITY_MAX,
        maxLevel: SPY_MAX_LEVEL,
        idle: SPY_IDLE,
        travelling: SPY_TRAVELLING,
        travelCols: SPY_TRAVEL_COLS,
        promoOffer: SPY_PROMO_OFFER,
        missions: SPY_MISSIONS.map((m) => ({
          id: m.id,
          district: m.district === 'CITY_CENTER' ? -1 : PLACEABLE_DISTRICTS.indexOf(m.district),
          offensive: m.offensive ? 1 : 0,
          certain: m.certain ? 1 : 0,
          athome: m.athome ? 1 : 0,
          citystate: m.citystate ? 1 : 0,
          turns: m.turns,
          // 0 where the chassis' table publishes none — `certain` decides those
          successPct: m.successPct ?? 0,
        })),
        travelMin: SPY_TRAVEL_TURNS_MIN,
        travelTilesPerTurn: SPY_TRAVEL_TILES_PER_TURN,
        travelMax: SPY_TRAVEL_TURNS_MAX,
        successPerLevel: SPY_SUCCESS_PER_LEVEL_PCT,
        capturePct: SPY_CAPTURE_PCT,
        counterspyPct: SPY_COUNTERSPY_CATCH_PCT,
        bodyguardNum: BODYGUARD_OP_NUM,
        bodyguardDen: BODYGUARD_OP_DEN,
        unrestLoyalty: SPY_UNREST_LOYALTY,
        unrestPerLevel: SPY_UNREST_PER_LEVEL,
        governorTurns: SPY_GOVERNOR_TURNS,
        governorPerLevel: SPY_GOVERNOR_PER_LEVEL,
        sourcesLevels: SPY_SOURCES_LEVELS,
        sourcesTurns: SPY_SOURCES_TURNS,
        partisansMin: SPY_PARTISANS_MIN,
        partisansMax: SPY_PARTISANS_MAX,
        escapeRoutes: SPY_ESCAPE_ROUTES.map((r) => ({
          id: r.id,
          district: r.district === null ? -1 : PLACEABLE_DISTRICTS.indexOf(r.district),
          turns: r.turns,
          basePct: r.basePct,
        })),
        scandalEnvoysBase: SPY_SCANDAL_ENVOYS_BASE,
        scandalEnvoysPerLevel: SPY_SCANDAL_PER_LEVEL,
      },
      // Sky and Stars' Eurekas, one padded row per WORLD ERA, as TECH indices
      skyEurekas: ERAS.map((_, e) => {
        const ids = SKY_EUREKAS[e] ?? [];
        const wide = Math.max(...Object.values(SKY_EUREKAS).map((x) => x.length));
        const cols = ids.map((id) => Object.keys(TECHS).indexOf(id)).filter((i) => i >= 0);
        return [...cols, ...Array<number>(wide - cols.length).fill(-1)];
      }),
      skyAluminumSlot: STRATEGIC_IDS.indexOf('ALUMINUM'),
      skyAluminumPerTurn: SKY_ALUMINUM_PER_TURN,
      skyAirXpPct: SKY_AIR_XP_PCT,
      automatonUraniumSlot: STRATEGIC_IDS.indexOf('URANIUM'),
      automatonUraniumPerTurn: AUTOMATON_URANIUM_PER_TURN,
      automatonUraniumPerMine: AUTOMATON_URANIUM_PER_MINE,
      wishParkTourism: WISH_PARK_TOURISM_MULT, wishWonderTourNum: WISH_WONDER_TOURISM_NUM, wishWonderTourDen: WISH_WONDER_TOURISM_DEN, toArmsMilProd: TO_ARMS_MIL_PROD_MULT, draconesDiscoveryScore: DRACONES_DISCOVERY_SCORE, coinageIntlGoldPerSpec: COINAGE_INTL_GOLD_PER_SPEC, steamWonderProd: STEAM_WONDER_PROD_MULT, industrialEra: INDUSTRIAL_ERA_INDEX,
      // t: the target-space kind, an index into CONGRESS_TARGET_KINDS
      congressResolutions: CONGRESS_RESOLUTIONS.map((r) => ({ id: r.id, min: r.minEra, max: r.maxEra, t: CONGRESS_TARGET_KINDS.indexOf(r.target) })),
      // The Deforestation Treaty's target space, as FEATURE-CATALOG indices:
      // a target `k` on the wire is the tile feature `congressFeatures[k]`.
      congressFeatures: clearableFeatures().map((f) => featIdx.get(f) ?? -1),
      // the terrains the Lighthouse pays its food on, as TERRAIN_IDS indices
      coastFoodTerrains: ['COAST', 'LAKE'].map((t) => TERRAIN_IDS.indexOf(t)),
      congressDvMinEra: CONGRESS_DV_MIN_ERA, congressDvDelta: CONGRESS_DV_DELTA, congressVoteStep: CONGRESS_VOTE_STEP, congressProdMult: CONGRESS_PROD_MULT, congressGppMult: CONGRESS_GPP_MULT, congressGrowthA: CONGRESS_GROWTH_A, congressGrowthB: CONGRESS_GROWTH_B, congressMigLoyalty: CONGRESS_MIG_LOYALTY, congressGwMult: CONGRESS_GW_MULT, congressPlus100: CONGRESS_PLUS_100, congressMinus50: CONGRESS_MINUS_50, congressTradeGold: CONGRESS_TRADE_GOLD, congressTradeCapacity: CONGRESS_TRADE_CAPACITY, congressPolicyFavor: CONGRESS_POLICY_FAVOR, congressIdeologySlots: CONGRESS_IDEOLOGY_SLOTS, congressEnergyDiscount: CONGRESS_ENERGY_DISCOUNT, congressPrMultA: CONGRESS_PR_MULT_A, congressPrMultB: CONGRESS_PR_MULT_B, congressAdvisoryCs: CONGRESS_ADVISORY_CS, congressPactLevels: CONGRESS_PACT_LEVELS, visibilityMax: VISIBILITY_MAX, visibilityCsPerLevel: VISIBILITY_CS_PER_LEVEL, visibilityTech: Object.keys(TECHS).indexOf(VISIBILITY_TECH), delegationCost: DELEGATION_COST, embassyCost: EMBASSY_COST, embassyCivic: civicIdx.get(EMBASSY_CIVIC) ?? -1, dealItems: DEAL_ITEMS, dealTurns: DEAL_TURNS, dealOfferTurns: DEAL_OFFER_TURNS, competitionTurns: COMPETITION_TURNS, competitionSilverPct: COMPETITION_SILVER_PCT, competitionBronzePct: COMPETITION_BRONZE_PCT, competitions: COMPETITIONS.map((c) => ({ id: c.id, gold: c.goldPoints, silver: c.silverFavor, bronze: c.bronzeFavor })), dealItemKinds: [...DEAL_ITEM_KINDS], dealPermanent: [...DEAL_PERMANENT], congressWorldReligionRs: CONGRESS_WORLD_RELIGION_RS, congressWorldReligionFavor: CONGRESS_WORLD_RELIGION_FAVOR, cultureBombRange: CULTURE_BOMB_RANGE, favorOccupiedCapital: FAVOR_OCCUPIED_CAPITAL, preserveHousing: PRESERVE_APPEAL_HOUSING,
      // EMERGENCIES: the catalog (id + the turn limit) and every magnitude
      emergencies: EMERGENCIES.map((e) => ({ id: e.id, turns: e.turns })),
      emergencySlots: EMERGENCY_SLOTS, specialSessionCost: SPECIAL_SESSION_COST,
      specialSessionGap: SPECIAL_SESSION_GAP,
      emergencyMemberFavor: EMERGENCY_MEMBER_FAVOR, emergencyTargetFavor: EMERGENCY_TARGET_FAVOR,
      emergencyMemberCs: EMERGENCY_MEMBER_CS, emergencyMemberMp: EMERGENCY_MEMBER_MP,
      emergencyTargetLoyalty: EMERGENCY_TARGET_LOYALTY, emergencyMemberHeal: EMERGENCY_MEMBER_HEAL,
      emergencyTargetStrikeCs: EMERGENCY_TARGET_STRIKE_CS,
      emergencyEnvoyGold: EMERGENCY_ENVOY_GOLD, emergencyCsRouteGold: EMERGENCY_CS_ROUTE_GOLD,
    },
    boosts: boostRows,
    cityState: {
      envoyCost: ENVOY_COST,
      influencePerTurn: INFLUENCE_PER_TURN,
      capitalBonus: CITY_STATE_CAPITAL_BONUS,
      meetRange: CITY_STATE_MEET_RANGE, // civ-seat proximity-meet radius
      questCooldown: QUEST_COOLDOWN,
      questEnvoys: QUEST_ENVOYS,
      maxHp: CITY_STATE_MAX_HP,
      militaristicIdx: CITY_STATE_TYPES.indexOf('militaristic'),
      tradeIdx: CITY_STATE_TYPES.indexOf('trade'), // suzerain trade capacity
      suzerainEnvoys: SUZERAIN_ENVOYS, // the strict-contest minimum
      typeYieldIdx: CITY_STATE_TYPES.map((t) => YIELD_KEYS.indexOf(CITY_STATE_TYPE_YIELD[t])),
      typeDistrictIdx: CITY_STATE_TYPES.map((t) => PLACEABLE_DISTRICTS.indexOf(CITY_STATE_TYPE_DISTRICT[t])),
      districtBonus: CITY_STATE_DISTRICT_BONUS,
      typeB1Idx: CITY_STATE_TYPES.map((t) => buildingIdx.get(CITY_STATE_TYPE_BUILDINGS[t][0]) ?? -1),
      typeB2Idx: CITY_STATE_TYPES.map((t) => buildingIdx.get(CITY_STATE_TYPE_BUILDINGS[t][1]) ?? -1),
      suzerainYield: CITY_STATE_SUZERAIN_YIELD,
      // Suzerain perks modeled as RULES — `effects` is the code order the
      // per-CS `suzCode` plane indexes.
      suz: {
        effects: SUZ_EFFECTS,
        xpMult: KABUL_XP_MULT,
        hillCs: PRESLAV_HILL_CS,
        reachBonus: REGIONAL_REACH_BONUS,
        writingScience: ANSHAN_WRITING_SCIENCE,
        relicScience: ANSHAN_RELIC_SCIENCE,
        routeCulture: KUMASI_ROUTE_CULTURE,
        routeGold: KUMASI_ROUTE_GOLD,
      },
      // CIV-SEAT levy — a militaristic CS's suzerain (a civ seat) at war
      // spawns levyUnits units at levyGoldCost off its treasury, levyCooldown
      // per CS shared across seats. (Seat-0 levy is UI-only, absent from the
      // scripted reference, so the GPU only mirrors the civ-seat path.)
      levyUnits: LEVY_UNITS,
      levyGoldCost: LEVY_GOLD_COST,
      levyCooldown: LEVY_COOLDOWN,
    },
    seats: {
      maxCities: MAX_CITIES_PER_SEAT,
      // The per-seat CITY COLUMN width — one number for the GPU's storage rows
      // and for both engines' observation/decision head (see CITY_SLOTS_PER_SEAT).
      citySlots: CITY_SLOTS_PER_SEAT,
      productionQueueMax: PRODUCTION_QUEUE_MAX,
      settlerBase: Math.round(80 * GAME_SPEED), // 48 + 18·max(0, cities − 1 + live + queued)
      settlerPer: Math.round(30 * GAME_SPEED),
      pantheonFaithCost: PANTHEON_FAITH_COST,
      prophetCls: GP_CLASSES.indexOf('PROPHET'),
      engineerCls: GP_CLASSES.indexOf('ENGINEER'),
      // the promotion ladder a granted LEVEL fills the bar toward
      promoMaxLevel: MAX_LEVEL,
      promoXpPerLevel: XP_PER_LEVEL,
      // CIV6 (Disciples): the kill spreads its religion "to cities within
      // 10 hexes".
      killSpreadRange: KILL_SPREAD_RANGE,
      rainforestFid: FEAT_IDS.indexOf('RAINFOREST'),
      // Great Works. WRITER/MUSICIAN class indices, the building
      // columns (b_cost catalog order) that hold writing/music works, the slots
      // per building, the works per person and the per-work culture yield BY KIND
      // (writing 2, music 4 — the real GS values; NO Great Work pays
      // gold). The GPU slots works into these building columns and adds the
      // matching culture at the buildings-bucket position; `gwTourismByKind`
      // carries the tourism the same way.
      // the three slotted Great Work kinds, in kind order
      // (0 WRITING / 1 ART / 2 MUSIC) — the REAL Civ 6 mapping:
      // Amphitheater 2 slots, Art Museum 3, Broadcast Center 1.
      gwClsByKind: [GP_CLASSES.indexOf('WRITER'), GP_CLASSES.indexOf('ARTIST'), GP_CLASSES.indexOf('MUSICIAN')],
      gwBidxByKind: GW_BUILDINGS.map((b) => buildingIdx.get(b) ?? -1),
      gwSlotsByKind: [...GW_SLOTS],
      gwWorksByKind: [...GW_WORKS_PER_PERSON],
      gwCultureByKind: [...GW_CULTURE],
      gwTourismByKind: [...GW_TOURISM], // tourism per Great Work
      // PRINTING doubles Great Work of WRITING tourism (real Civ 6 —
      // the tourism, not the slot count). Index into the exported tech list.
      gwPrintingTech: techIdx.get(GW_PRINTING_TECH) ?? -1,
      gwPrintingWritingMult: GW_PRINTING_WRITING_MULT,
      artifactBidx: buildingIdx.get(ARTIFACT_BUILDING) ?? -1,
      workshopBidx: buildingIdx.get('WORKSHOP') ?? -1,
      artifactSlots: ARTIFACT_SLOTS,
      // every slot an Artifact can STAND in per city — the museum's own
      // plus the whole any-work pool; the provenance arrays' width.
      artifactProvW: ARTIFACT_PROV_W,
      artifactCulture: ARTIFACT_CULTURE,
      artifactTourism: ARTIFACT_TOURISM,
      // a THEMED Archaeological Museum doubles what it holds; the theming
      // test itself is one era, three civilizations, every slot full.
      themingMult: THEMING_MULT,
      // the three works each Great Artist makes, in creation order
      artistWorks: ARTIST_WORKS.map((w) => [...w]),
      modernEraIndex: MODERN_ERA_INDEX,
      relicBidx: buildingIdx.get(RELIC_BUILDING) ?? -1,
      relicSlots: RELIC_SLOTS_PER_BUILDING,
      relicFaith: RELIC_FAITH,
      relicTourism: RELIC_TOURISM,
      wonderTourismBase: WONDER_TOURISM_BASE,
      tourismPerVisitorPerCiv: TOURISM_PER_VISITOR_PER_CIV,
      culturePerDomesticTourist: CULTURE_PER_DOMESTIC_TOURIST,
      rockBandVenues: Object.keys(ROCK_BAND_VENUES).map((bid) => [
        buildingIdx.get(bid) ?? -1,
        PLACEABLE_DISTRICTS.indexOf(BUILDINGS[bid].district as typeof PLACEABLE_DISTRICTS[number]),
        ROCK_BAND_VENUES[bid],
      ]),
      rockBandWonderVenue: ROCK_BAND_WONDER_VENUE,
      rockBandTiers: ROCK_BAND_TIERS.map((r) => [r.album, r.bomb, r.promote ? 1 : 0, r.dies ? 1 : 0]),
      rockBandOdds: ROCK_BAND_TIER_ODDS.map((r) => [...r]),
      rockBandMaxLevel: ROCK_BAND_MAX_LEVEL,
      rockBandCostStep: ROCK_BAND_COST_STEP,
      tourismOpenBordersPct: TOURISM_OPEN_BORDERS_PCT,
      tourismRoutePct: TOURISM_ROUTE_PCT,
      tourismGovMult: TOURISM_GOV_MULT,
      tourismReligiousPenaltyPct: TOURISM_RELIGIOUS_PENALTY_PCT,
      holyCityTourism: HOLY_CITY_TOURISM,
      enlightenmentCidx: civicIdx.get(ENLIGHTENMENT_CIVIC) ?? -3,
      techEra: techList.map((t) => Math.max(0, ERAS.indexOf(t.era))),
      civicEra: civicList.map((c) => Math.max(0, ERAS.indexOf(c.era))),
      warMinTurns: WAR_MIN_TURNS,
      peaceTreatyTurns: PEACE_TREATY_TURNS,
      dowProximity: DOW_PROXIMITY,
      formalWarMinTurns: FORMAL_WAR_MIN_TURNS,
      agreementTurns: AGREEMENT_TURNS,
      favorPerAlliance: FAVOR_PER_ALLIANCE,
      allianceCivic: civicIdx.get(ALLIANCE_CIVIC) ?? -1,
      allianceQpTurn: ALLIANCE_QP_TURN,
      allianceQpRoute: ALLIANCE_QP_ROUTE,
      allianceL2Qp: ALLIANCE_L2_QP,
      allianceL3Qp: ALLIANCE_L3_QP,
      allianceRouteTo: [...ALLIANCE_ROUTE_TO],
      allianceRouteFrom: [...ALLIANCE_ROUTE_FROM],
      allianceRouteYcol: ALLIANCE_ROUTE_YKEY.map((k) => (k ? YIELD_KEYS.indexOf(k) : -1)),
      allianceM1Cs: ALLIANCE_M1_CS,
      allianceR2BoostTurns: ALLIANCE_R2_BOOST_TURNS,
      allianceR3SciPct: ALLIANCE_R3_SCI_PCT,
      allianceC2Gpp: ALLIANCE_C2_GPP,
      allianceC3CulPct: ALLIANCE_C3_CUL_PCT,
      allianceC3TourPct: ALLIANCE_C3_TOUR_PCT,
      allianceE2Influence: ALLIANCE_E2_INFLUENCE,
      allianceRel2TheoCs: ALLIANCE_REL2_THEO_CS,
      allianceRel3FaithPerPop: ALLIANCE_REL3_FAITH_PER_POP,
      openBordersCivic: civicIdx.get(OPEN_BORDERS_CIVIC) ?? -1,
      research: {
        spearTech: techIdx.get('BRONZE_WORKING') ?? -1,
        horseTech: techIdx.get('HORSEBACK_RIDING') ?? -1,
        archerTech: techIdx.get('ARCHERY') ?? -1,
      },
      builder: {
        mineTech: Object.values(TECHS).findIndex((td) => td.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'MINE')),
        lumberTech: Object.values(TECHS).findIndex((td) => td.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'LUMBER_MILL')),
        gains: ['FARM', 'MINE', 'LUMBER_MILL'].map((imp) =>
          YIELD_KEYS.reduce((g, k) => g + (BALANCED_WEIGHTS[k] ?? 0) * (IMPROVEMENTS[imp as ImprovementId].yields[k] ?? 0), 0),
        ),
      },
      peaceGold0: PEACE_GOLD_COST(0),
      peaceGoldSlope: PEACE_GOLD_COST(1) - PEACE_GOLD_COST(0),
      cityMaxHp: CITY_MAX_HP,
      workRadius: CITY_WORK_RADIUS,
      loyaltyMax: LOYALTY_MAX,
      loyaltyRange: LOYALTY_RANGE,
      loyaltyScale: LOYALTY_PRESSURE_SCALE,
      loyaltyAmenity: ['Ecstatic', 'Happy', 'Content', 'Displeased', 'Unhappy'].map((n) => LOYALTY_AMENITY[n] ?? 0),
      // the ERA space the queue and its price both live in. The cost table is
      // computed HERE so both engines read the same floored doubles:
      // [person era][eras the world is behind them].
      gpCostTable: GP_ERA_GPP.map((base) => GP_ERA_GPP.map((_, d) => Math.floor(base * (1 + 0.3 * d) ** d))),
      gpEra: GP_CLASSES.map((c) => GREAT_PEOPLE[c].map((p) => p.era)),
      gpFlatCost: GP_CLASSES.map((c) => (GP_FLAT_COST_CLASSES.has(c) ? 1 : 0)),
      gpRoster: GP_CLASSES.map((c) => GREAT_PEOPLE[c].length),
      gpClassDistrict: GP_CLASSES.map((c) => PLACEABLE_DISTRICTS.indexOf(GP_CLASS_DISTRICT[c])),
      // THE PERSON'S OWN ROW, one dense record per queue position. `gpFx`
      // names the columns so neither engine writes a position down, and the
      // two permanent runs ride the tail in GP_PERM / GP_CITY_PERM order.
      gpFx: [...GP_FX],
      gpPermKeys: [...GP_PERM],
      gpCityPermKeys: [...GP_CITY_PERM],
      gpEffects: GP_CLASSES.map((c) => GREAT_PEOPLE[c].map((p) => gpFxRow(p))),
      // the SITE a charge may be spent at, and which district when it names one
      gpSite: GP_CLASSES.map((c) => GREAT_PEOPLE[c].map((p) => GP_SITES.indexOf(gpSiteOf(p).site))),
      gpSiteDistrict: GP_CLASSES.map((c) =>
        GREAT_PEOPLE[c].map((p) => PLACEABLE_DISTRICTS.indexOf(gpSiteOf(p).district))),
      gpCharges: GP_CLASSES.map((c) => GREAT_PEOPLE[c].map((p) => gpChargesOf(p))),
      gpScientist: GP_CLASSES.indexOf('SCIENTIST'),
      // the NAMED eurekas and the instant buildings, as catalog bitmasks
      gpEureka: GP_CLASSES.map((c) => GREAT_PEOPLE[c].map((p) => {
        const ids = new Set(gpEffectOf(p).eurekaTechs ?? []);
        return Object.keys(TECHS).map((t) => (ids.has(t) ? 1 : 0));
      })),
      gpBuildings: GP_CLASSES.map((c) => GREAT_PEOPLE[c].map((p) => {
        const ids = new Set(gpEffectOf(p).buildings ?? []);
        for (const id of ids) {
          if (buildingIdx.get(id) === undefined) throw new Error(`gpBuildings: ${id} is not a City Center-space building`);
        }
        return centerBuildings.map((b) => (ids.has(b.id) ? 1 : 0));
      })),
      // the CHASSIS each class arrives on — units roster order
      gpClassUnitIdx: GP_CLASSES.map((c) => Object.values(UNITS).findIndex((u) => u.id === c)),
      gpWorkClasses: GP_CLASSES.map((c) => (GW_WORK_CLASSES.has(c) ? 1 : 0)),
      generalClassIdx: GP_CLASSES.indexOf('GENERAL'),
      admiralClassIdx: GP_CLASSES.indexOf('ADMIRAL'),
      generalUnitIdx: Object.values(UNITS).findIndex((u) => u.id === 'GENERAL'),
      admiralUnitIdx: Object.values(UNITS).findIndex((u) => u.id === 'ADMIRAL'),
      generalAuraCs: GENERAL_AURA_CS,
      generalAuraRange: GENERAL_AURA_RANGE,
      generalAuraMp: GENERAL_AURA_MP,
      admiralMarchLive: ADMIRAL_MARCH_LIVE, // inert pending its hunt // the aura's movement half
      pantheonPool: Object.keys(PANTHEONS).length,
      followerPool: Object.keys(FOLLOWER_BELIEFS).length,
      founderPool: Object.keys(FOUNDER_BELIEFS).length,
      // Enhancer pool size. The GPU does not yet race enhancers (civ-seat
      // enhancer claiming + the mirrored draw are a deferred follow-up); this
      // documents the slot for that work.
      enhancerPool: Object.keys(ENHANCER_BELIEFS).length,
      pressureRange: RELIGION_PRESSURE_RANGE,
      justWarRange: JUST_WAR_RANGE,
      followerCoupling: B18_FOLLOWER_COUPLING_LIVE,
    },
    beliefs: {
      // the missionary chassis anchors (read via rules.beliefs, like the
      // enhancer rows). Base values double as the GPU pad row (unenhanced civ):
      // cost round(100·GAME_SPEED)=60 faith, lump SPREAD_PRESSURE=10, cap 2.
      missionaryIdx: Object.values(UNITS).findIndex((u) => u.id === 'MISSIONARY'),
      missionaryCost: UNITS.MISSIONARY.cost,
      spreadPressure: SPREAD_PRESSURE,
      missionaryCap: MISSIONARY_CAP,
      apostleIdx: Object.values(UNITS).findIndex((u) => u.id === 'APOSTLE'),
      apostleCost: UNITS.APOSTLE.cost,
      apostleCap: APOSTLE_CAP,
      relStrength: Object.values(UNITS).map((u) => u.religiousStrength ?? 0),
      cityReligionAdderLive: CITY_RELIGION_ADDER_LIVE, // DEBT-2: inert pending its hunt
      theoPressureSwing: THEO_PRESSURE_SWING,
      theoPressureRange: THEO_PRESSURE_RANGE,
      religiousHealPerFaith: RELIGIOUS_HEAL_PER_FAITH,
      theoHolyGround: THEO_HOLY_GROUND_STRENGTH,
      theoHolyCity: THEO_HOLY_CITY_STRENGTH,
      inquisitorIdx: Object.values(UNITS).findIndex((u) => u.id === 'INQUISITOR'),
      inquisitorCost: UNITS.INQUISITOR.cost,
      // CIV6 (Warrior Monk): bought with Faith only, "in a city that has a
      // majority religion with the Warrior Monks Follower Belief and a Holy
      // Site with a Temple". The belief is the CITY's, so the GPU needs its
      // catalog row and not just the buyer's own.
      warriorMonkIdx: Object.values(UNITS).findIndex((u) => u.id === 'WARRIOR_MONK'),
      warriorMonkCost: UNITS.WARRIOR_MONK.cost,
      warriorMonkFollower: Object.keys(FOLLOWER_BELIEFS).indexOf('WARRIOR_MONKS'),
      inquisitorCap: INQUISITOR_CAP,
      apostlePromoOffer: APOSTLE_PROMO_OFFER,
      inquisitorHomeStrength: INQUISITOR_HOME_STRENGTH,
      removeHeresyPct: REMOVE_HERESY_PCT,
      launchInquisitionCharges: LAUNCH_INQUISITION_CHARGES,
      condemnPressureRange: CONDEMN_PRESSURE_RANGE,
      condemnPressureSwing: CONDEMN_PRESSURE_SWING,
      // Each ADJ_SRC entry as the FEATURE / the TERRAIN it names, -1 where it
      // is neither. A belief hands a district a source the district's own row
      // never names, so the static adjacency export cannot have counted it.
      adjSrcFeat: ADJ_SRC.map((s) => FEAT_IDS.indexOf(s as never)),
      adjSrcTerr: ADJ_SRC.map((s) => TERRAIN_IDS.indexOf(s)),
      pantheons: Object.values(PANTHEONS).map(beliefRow),
      followers: Object.values(FOLLOWER_BELIEFS).map(beliefRow),
      founders: Object.values(FOUNDER_BELIEFS).map(beliefRow),
      // Enhancer effect rows (all inert this round). Exported so the
      // deferred GPU enhancer race has the table ready; the engine currently
      // builds only pan/fol/fou tables and ignores this key.
      enhancers: Object.values(ENHANCER_BELIEFS).map(beliefRow),
    },
    wonders: {
      // the era each wonder first became available (its unlock's
      // era), parallel to `rows` — the GPU indexes it by wonder index.
      eras: Object.values(BUILT_WONDERS).map((w) =>
        w.requiresTech
          ? Math.max(0, ERAS.indexOf(TECHS[w.requiresTech]?.era))
          : w.requiresCivic
          ? Math.max(0, ERAS.indexOf(CIVICS[w.requiresCivic]?.era))
          : 0,
      ),
      rows: Object.values(BUILT_WONDERS).map((w) => ({
        cost: w.cost,
        // -1 = no requirement; -3 = requires a tech/civic ABSENT from the
        // compact tree — unreachable, exactly like TS's includes() never
        // matching (a hunt's catch: Oracle's MYSTICISM exported -1 and
        // the GPU read that as unlocked, building wonders TS never could)
        ut: w.requiresTech ? techIdx.get(w.requiresTech) ?? -3 : -1,
        uc: w.requiresCivic ? civicIdx.get(w.requiresCivic) ?? -3 : -1,
        cy: YIELD_KEYS.map((k) => w.cityYields?.[k] ?? 0),
        growAll: w.effects?.growthAllMult ?? 1,
        gwslots: GW_WONDER_SLOTS[w.id] ?? [0, 0, 0],
        relicslots: RELIC_WONDER_SLOTS[w.id] ?? 0,
        // Great Person points per turn, parallel to GP_CLASSES.
        gpp: GP_CLASSES.map((c) => w.effects?.gpPoints?.[c] ?? 0),
        // Terrain/feature-keyed tile yields. terr/feat/xfeat are catalog
        // indices, -1 for "no constraint"; emp = 1 pays every city the seat
        // holds rather than only the wonder's own.
        tiley: (w.effects?.tileYields ?? []).map((r) => ({
          terr: r.terrain ? TERRAIN_IDS.indexOf(r.terrain) : -1,
          feat: r.feature ? FEAT_IDS.indexOf(r.feature) : -1,
          xfeat: r.excludeFeature ? FEAT_IDS.indexOf(r.excludeFeature) : -1,
          emp: r.empire ? 1 : 0,
          y: YIELD_KEYS.map((k) => r.yields[k] ?? 0),
        })),
        // improvement indices the wonder pays an amenity for, and the reach
        amenImp: (w.effects?.amenityPerImprovement?.improvements ?? []).map((i) => IMPROVEMENT_IDS.indexOf(i)),
        amenImpRange: w.effects?.amenityPerImprovement?.range ?? 0,
        // improvement indices the HOLDING city is paid a yield for, and that yield
        impY: (w.effects?.cityYieldPerImprovement?.improvements ?? []).map((i) => IMPROVEMENT_IDS.indexOf(i)),
        impYYields: YIELD_KEYS.map((k) => w.effects?.cityYieldPerImprovement?.yields[k] ?? 0),
        boostTechEra: w.effects?.boostTechsThroughEra ?? -1,
        distGpp: w.effects?.districtGpPoints ?? 0,
        patronPct: w.effects?.patronageFaithPct ?? 0,
        mult: YIELD_KEYS.map((k) => w.effects?.cityYieldMult?.[k] ?? 1),
        // adjacency requirement: -1 none, -2 CITY_CENTER, -3 required but
        // out-of-catalog (never placeable — Colosseum/Ruhr), else the
        // PLACEABLE_DISTRICTS index
        adjD: !w.placement.adjacentDistrict
          ? -1
          : w.placement.adjacentDistrict === 'CITY_CENTER'
            ? -2
            : PLACEABLE_DISTRICTS.indexOf(w.placement.adjacentDistrict) >= 0
              ? PLACEABLE_DISTRICTS.indexOf(w.placement.adjacentDistrict)
              : -3,
        adjR: w.placement.adjacentResource ? RESOURCE_IDS.indexOf(w.placement.adjacentResource) : -1,
        // the BUILDING the adjacent district's city must hold, the
        // IMPROVEMENT a neighbour must carry, and the two clauses that read
        // the seat rather than the ground.
        adjDB: w.placement.adjacentDistrictBuilding
          ? buildingIdx.get(w.placement.adjacentDistrictBuilding) ?? -3
          : -1,
        adjI: w.placement.adjacentImprovement
          ? IMPROVEMENT_IDS.indexOf(w.placement.adjacentImprovement)
          : -1,
        adjCap: w.placement.adjacentCapital ? 1 : 0,
        needRel: w.placement.requiresReligion ? 1 : 0,
        regionalAmenities: w.effects?.regionalAmenities ?? 0,
        cityAmenities: w.effects?.cityAmenities ?? 0,
        cityHousing: w.effects?.cityHousing ?? 0,
        faithPerFlood: w.effects?.faithPerFlood ?? 0,
        dvp: w.effects?.dvp ?? 0,
        grantUnit: w.effects?.grantUnit ? Object.values(UNITS).findIndex((u) => u.id === w.effects!.grantUnit) : -1,
        grantProphet: w.effects?.grantProphet ? 1 : 0,
        rivalSciBoost: w.effects?.rivalScientistBoost ? 1 : 0,
        religionSite: w.effects?.religionSite ? 1 : 0,
        // policy slots, parallel to SLOT_KINDS
        slots: SLOT_KINDS.map((k) => w.effects?.extraSlots?.[k] ?? 0),
        envoysPerWonder: w.effects?.envoysPerWonder ?? 0,
        spreadCharges: w.effects?.spreadCharges ?? 0,
        buildCharges: w.effects?.buildCharges ?? 0,
        engineerCharges: w.effects?.engineerCharges ?? 0,
        apostleMartyr: w.effects?.apostleMartyr ? 1 : 0,
        holyShield: w.effects?.holyTourismShield ? 1 : 0,
        floodMitigation: w.effects?.floodMitigation ? 1 : 0,
        renewablePower: w.effects?.renewablePowerBoost ? 1 : 0,
        dupNaval: w.effects?.duplicateNavalTrain ? 1 : 0,
        relicTourismMult: w.effects?.religiousTourismMult ?? 1,
        resortTourismMult: w.effects?.resortTourismMult ?? 1,
        loyaltyAura: w.effects?.loyaltyAura ?? 0,
        occupyDefense: w.effects?.occupyDefense ?? 0,
        freeCivics: w.effects?.freeCivics ?? 0,
        freeTechs: w.effects?.freeTechs ?? 0,
        treasuryMult: w.effects?.treasuryMult ?? 1,
        eraScorePerMoment: w.effects?.eraScorePerMoment ?? 0,
      })),
      fpFid: FEAT_IDS.indexOf('FLOODPLAINS'),
    },
    // Projects in data order; d = PLACEABLE_DISTRICTS idx, y = YIELD_KEYS idx
    // or -1, g = GP_CLASSES idx or -1. A project on an out-of-scaffold district
    // exports d=-1 and never fires.
    //
    // One-time rows carry one (the ledger flag) / vic (victory step) plus the
    // tech gate (rt = techs-table idx) and previous-step link (rp =
    // projects-table idx), which is what `_once_step_ok` reads. `wmd` is the
    // 1-based NUCLEAR_DEVICES row a repeatable device build fills. They sit
    // LAST, in chain order: the
    // scripted greedy takes the lowest legal index, so a base project always
    // shadows them. Laser rows (`ls`, repeatable, gated on the tech and on the
    // finished expedition; `orb` = the unconditional orbital one) sit between
    // the base rows and the chain; `pc` is a FIXED price (already speed-scaled)
    // where >= 0, else the generic curve applies.
    // GS STRATEGIC STOCKPILES. `rid` maps a stockpile SLOT to the resource
    // table the tile plane uses; `rate` is what one improved source pays per
    // turn. `slotOf` inverts it so a tile or a unit gate can find its slot.
    // NUCLEAR WEAPONS: the two devices in catalog order (the wire order of
    // both nuclear heads), what the ground they poison costs, and the hulls
    // that stop a strike.
    nuclear: {
      devices: NUCLEAR_DEVICES.map((d) => ({
        radius: d.radius, fallout: d.fallout, range: d.range,
        upkeep: d.upkeep, uranium: d.uranium,
      })),
      falloutDamage: FALLOUT_DAMAGE,
      robotDamage: NUKE_ROBOT_DAMAGE,
      coverRange: NUKE_COVER_RANGE,
      cleanCharges: FALLOUT_CLEAN_CHARGES,
      nukeCols: NUKE_COLS,
      siloIid: IMPROVEMENT_IDS.indexOf('MISSILE_SILO'),
      wwLaunched: WW_WMD_LAUNCHED,
      emergencyNuclear: EMERGENCY_NUCLEAR,
      emergencyNukeCS: EMERGENCY_NUKE_TARGET_CS,
      emergencyNukeLoyaltyCut: EMERGENCY_NUKE_LOYALTY_CUT,
    },
    // THE GIANT DEATH ROBOT'S FUTURE-ERA UPGRADES, each a seat TECH.
    gdr: {
      upgradeId: GDR_UPGRADES.map((g) => g.id),
      upgradeTech: GDR_UPGRADES.map((g) => techIdx.get(g.tech) ?? -1),
      droneAA: GDR_DRONE_AA,
      particleBeamCS: GDR_PARTICLE_BEAM_CS,
      enhancedMoves: GDR_ENHANCED_MOVES,
      armorPlatingCS: GDR_ARMOR_PLATING_CS,
      navalPenalty: GDR_NAVAL_PENALTY,
    },
    strategic: {
      rid: STRATEGIC_IDS.map((id) => RESOURCE_IDS.indexOf(id)),
      rate: STRATEGIC_IDS.map((id) => STRATEGIC_PER_TURN[id]),
      slotOf: RESOURCE_IDS.map((id) => STRATEGIC_IDS.indexOf(id)),
      capBase: STOCKPILE_CAP_BASE,
      capPerEncampmentBuilding: STOCKPILE_CAP_PER_ENCAMPMENT_BUILDING,
      encampmentDidx: PLACEABLE_DISTRICTS.indexOf('ENCAMPMENT'),
    },
    projects: {
      rows: Object.values(PROJECTS).map((p, _i, all) => ({
        d: PLACEABLE_DISTRICTS.indexOf(p.district),
        y: p.yield ? YIELD_KEYS.indexOf(p.yield) : -1,
        g: p.gpClass ? GP_CLASSES.indexOf(p.gpClass) : -1,
        // the FULL class list + this project's own per-class rate. `g` stays
        // for index stability; the GPU reads `gs`/`gf` and falls back to `g`.
        gs: gpClassesOf(p).map((c) => GP_CLASSES.indexOf(c)),
        gf: gppFractionOf(p),
        one: p.once ? 1 : 0,
        spc: isSpaceProject(p.id) ? 1 : 0,
        wmd: p.wmd ?? 0,
        ls: p.laser ? 1 : 0,
        orb: p.orbital ? 1 : 0,
        rs: p.resource ? STRATEGIC_IDS.indexOf(p.resource) : -1,
        rc: p.resourceCost ?? 0,
        vic: p.victory ? 1 : 0,
        pc: p.cost ?? -1,
        rt: p.requiresTech ? (techIdx.get(p.requiresTech) ?? -1) : -1,
        // the CIVIC half of the research gate, and the carbon the row takes
        // back out of the air
        rv: p.requiresCivic ? (civicIdx.get(p.requiresCivic) ?? -1) : -1,
        cr: p.carbonRecapture ? 1 : 0,
        rp: p.requiresProject ? all.findIndex((q) => q.id === p.requiresProject) : -1,
        // the CITY CENTER project channel: `cc` says the row runs in the one
        // district every city already has, so it needs no registry lookup;
        // `rep` marks the repair, whose price is the perimeter HP it restores.
        cc: p.district === 'CITY_CENTER' ? 1 : 0,
        rep: p.repair ? 1 : 0,
        // the reactor reset, whose gate is a BUILDING rather than a ledger
        rec: p.recommission ? 1 : 0,
      })),
      yieldFraction: PROJECT_YIELD_FRACTION,
      gppFraction: PROJECT_GPP_FRACTION,
    },
    // RIVER FLOOD magnitudes — the Flood (Civ6) tables, by severity.
    disasters: {
      floodSeverityP: [...FLOOD_SEVERITY_P],
      floodDestroyP: [...FLOOD_DESTROY_P],
      floodDistrictP: [...FLOOD_DISTRICT_P],
      floodPopP: [...FLOOD_POP_P],
      floodDmgLo: [...FLOOD_DAMAGE_LO],
      floodDmgHi: [...FLOOD_DAMAGE_HI],
      floodFertFood: FLOOD_FERT_FOOD.map((r) => [...r]),
      floodFertProd: FLOOD_FERT_PROD.map((r) => [...r]),
      // per TERRAIN id, which fertility column it reads
      floodFertCol: TERRAIN_IDS.map((t) => floodTerrainColumn(t)),
      // the per-turn base chances the climate phase scales
      floodChance: FLOOD_CHANCE,
      eruptionChance: ERUPTION_CHANCE_PER_VOLCANO,
      droughtChance: DROUGHT_CHANCE,
      stormChance: STORM_CHANCE,
      droughtLength: DROUGHT_LENGTH,
    },
    // THE CLIMATE ARC. Every row is the Climate (Civ6) page's own except the
    // two the file marks MODEL; both engines read the tables by index and
    // neither names a fuel or a phase.
    climate: {
      // raw carbon per unit of each STRATEGIC SLOT, from the plant that
      // burns it — a slot no plant burns is 0.
      carbonPerResource: CARBON_PER_RESOURCE,
      unitShare: UNIT_CARBON_SHARE,
      unitResourceShare: UNIT_CARBON_RESOURCE_SHARE,
      cellsShare: ADVANCED_POWER_CELLS_SHARE,
      cellsTech: techIdx.get(ADVANCED_POWER_CELLS_TECH) ?? -1,
      co2PerPoint: CO2_PER_POINT,
      recaptureUnits: CARBON_RECAPTURE_UNITS,
      recaptureFavor: CARBON_RECAPTURE_FAVOR,
      lowlandMaxBand: LOWLAND_MAX_BAND,
      barrierPerTile: FLOOD_BARRIER_PER_TILE,
      pollutionDivisor: POLLUTION_DISPLAY_DIVISOR,
      favorPerOver: FAVOR_PER_POLLUTION_OVER,
      favorCap: FAVOR_POLLUTION_CAP,
      // [points, flood band, submerge band, iceMelt, fertility, desertify]
      phases: CLIMATE_PHASES.map((p) => [
        p.points, p.flood, p.submerge, p.iceMelt, p.fertility ? 1 : 0, p.desertification ? 1 : 0,
      ]),
      // descending [cut, modifier] — the first cut the level clears wins
      deforestation: DEFORESTATION_BANDS.map((b) => [b[0], b[1]]),
      // the feature ids the deforestation level counts, and the polar ice
      clearFids: clearableFeatures().map((f) => featIdx.get(f) ?? -1),
      iceFid: featIdx.get('ICE') ?? -1,
    },
    combat: {
      unitHp: UNIT_HP,
      cityMaxHp: CITY_MAX_HP,
      maxBarbPerCamp: MAX_BARB_PER_CAMP,
      campSpawnChance: 0.08,
      garrisonGrowChance: 0.1,
      spearmanAfterTurn: 60,
      // the shared barb MELEE era ladder thresholds
      // (WARRIOR → SPEARMAN t>60 → PIKEMAN t>120 → MUSKETMAN t>180). The GPU
      // reads these; the TS barbMeleeType hard-codes the same thresholds.
      pikemanAfterTurn: 120,
      musketmanAfterTurn: 180,
      // the RANGED barb ladder threshold (barbRangedType —
      // ARCHER, then CROSSBOWMAN after turn 120). The GPU reads this; the TS
      // barbRangedType hard-codes the same number.
      crossbowmanAfterTurn: 120,
      cityHealPerTurn: 20,
      // the outer-defense pool by WALLS TIER, and the Combat Strength each
      // tier adds to the city it surrounds
      wallsTierHp: [...WALLS_TIER_HP],
      wallsTierCs: [...WALLS_TIER_CS],
      // Urban Defenses arrive with a TECH and no building at all
      urbanDefensesTech: techIdx.get(URBAN_DEFENSES_TECH) ?? -1,
      wallsTierUrban: WALLS_TIER_URBAN,
      repairQuietTurns: REPAIR_QUIET_TURNS,
      wallDamageMelee: WALL_DAMAGE_MELEE,
      wallDamageRanged: WALL_DAMAGE_RANGED,
      wallBreachFraction: WALL_BREACH_FRACTION,
      rangedCityPenalty: RANGED_CITY_PENALTY,
      // FORMATIONS by tier: what a Corps/Fleet and an Army/Armada add to
      // Combat, Ranged and Bombard Strength, and the civic each tier waits on.
      formationCs: [...FORMATION_CS],
      formationCivic: FORMATION_CIVIC.map((c) => (c ? (civicIdx.get(c) ?? -1) : -1)),
      formationCostMult: [...FORMATION_COST_MULT],
      formationTrainDiscount: FORMATION_TRAIN_DISCOUNT,
      encampHp: ENCAMPMENT_HP, // the ENCAMPMENT garrison pool cap
      unitHealPerTurn: 10,
      barbScoutOpenerLive: BARB_SCOUT_OPENER_LIVE, // inert pending its hunt
      barbLadder: [
        'WARRIOR',
        'SPEARMAN',
        'PIKEMAN',
        'MUSKETMAN',
        'ARCHER',
        'CROSSBOWMAN',
        'SCOUT',
        'GALLEY',
        'QUADRIREME',
        'HORSEMAN',
        'KNIGHT',
      ].map((id) => {
        const i = Object.keys(UNITS).indexOf(id);
        if (i < 0) throw new Error(`barbLadder: ${id} is not in the unit roster`);
        return i;
      }),
      barbNavalTypes: [7, 8], // ladder POSITIONS: GALLEY, then QUADRIREME past crossbowmanAfterTurn
      barbCavalryTypes: [9, 10], // ladder POSITIONS: HORSEMAN, then KNIGHT past the same turn
      barbHorseRes: RESOURCE_IDS.indexOf('HORSES'), // a camp with this within barbHorseRange is a CAVALRY outpost
      barbHorseRange: BARB_HORSE_RANGE,
      campClearReward: 50,
      dmgBase: Array.from({ length: 4001 }, (_, i) => 30 * Math.exp((0.04 * (i - 2000)) / 10)),
      // EMBARK: the Classical embarked pool and the rungs that raise it, the
      // Mathematics rung every hull and passenger reads, the LIVE water-step
      // master switch, and the embark/ocean tech gates (indices into rules
      // techs; military embarks on SHIPBUILDING, civilians on SAILING, OCEAN
      // needs CARTOGRAPHY). The GPU mirrors these exactly.
      embarkMoves: EMBARK_MOVES,
      embarkMoveTechs: EMBARK_MOVE_TECHS.map(([id, v]) => [techIdx.get(id) ?? -1, v]),
      seaMoveTech: techIdx.get(SEA_MOVE_TECH) ?? -1,
      seaMoveBonus: SEA_MOVE_TECH_BONUS,
      embarkedDefenseCsByEra: EMBARKED_DEFENSE_CS_BY_ERA, // the embarked defender's CS, by the OWNER's tech era
      // the two "Unit class modifiers" and the civic that unlocks flanking
      // and support at all
      classMeleeVsAnticav: CLASS_MELEE_VS_ANTICAV,
      classAnticavVsCav: CLASS_ANTICAV_VS_CAV,
      fortDefenseCs: FORT_DEFENSE_CS,
      amphibiousAttackCs: AMPHIBIOUS_ATTACK_CS,
      flankSupportCivic: civicIdx.get(FLANK_SUPPORT_CIVIC) ?? -1,
      embarkLive: embarkState.live ? 1 : 0,
      shipbuildingTech: techIdx.get('SHIPBUILDING') ?? -1,
      sailingTech: techIdx.get('SAILING') ?? -1,
      cartographyTech: techIdx.get('CARTOGRAPHY') ?? -1,
      celestialTech: techIdx.get('CELESTIAL_NAVIGATION') ?? -1,
    },
    // THE PROMOTION CATALOG, per class and in COLUMN order — the order IS the
    // PROMOTE head's wire layout. `req` is a bitmask of the columns that open
    // a row (0 = a tier-I root); each row carries up to PROMO_SLOTS effects.
    promotions: {
      classes: [...PROMO_CLASSES],
      // the bit each class presents to another unit's `CS_VS_*` mask, 0 for a
      // class that is never a target — `classBitOf`, as a table
      classBit: PROMO_CLASSES.map((c) => CLASS_BIT[c] ?? 0),
      kinds: [...PROMO_KINDS],
      cols: PROMO_COLS,
      slots: PROMO_SLOTS,
      ids: PROMO_CLASSES.map((c) => promoRows(c).map((p) => p.id)),
      req: PROMO_CLASSES.map((c) => {
        const rows = promoRows(c);
        const col = new Map(rows.map((p, i) => [p.id, i]));
        return padTo(rows.map((p) => p.requires.reduce((m, id) => m | (1 << (col.get(id) ?? 0)), 0)), 0);
      }),
      kind: PROMO_CLASSES.map((c) => padTo(promoRows(c).map(
        (p) => slotsOf(p.effects.map((e) => PROMO_KINDS.indexOf(e.kind))),
      ), slotsOf([]))),
      v: PROMO_CLASSES.map((c) => padTo(promoRows(c).map(
        (p) => slotsOf(p.effects.map((e) => e.v ?? 0)),
      ), slotsOf([]))),
      mask: PROMO_CLASSES.map((c) => padTo(promoRows(c).map(
        (p) => slotsOf(p.effects.map((e) => e.mask ?? 0)),
      ), slotsOf([]))),
      unitClass: Object.values(UNITS).map((u) => PROMO_CLASSES.indexOf(UNIT_PROMO_CLASS[u.id] ?? ('' as never))),
      // CHOKE POINTS names "Woods, Jungle, Hills, or Marsh"; hills are their
      // own plane, so only the three FEATURES need naming here.
      chokeFeatures: ['WOODS', 'RAINFOREST', 'MARSH'].map((f) => featIdx.get(f) ?? -1),
      // RANGER names Woods and Jungle for its 1-MP step; MARSH is nobody's,
      // so this list is the choke one MINUS the marsh.
      woodsFeatures: ['WOODS', 'RAINFOREST'].map((f) => featIdx.get(f) ?? -1),
    },
    // The trainable roster (mirrors trainableUnits + UNITS data). `civilian`
    // marks builder-type units (charges) — they hold the civilian stacking
    // slot and cannot attack.
    units: Object.values(UNITS).map((u) => ({
      id: u.id,
      cost: u.cost,
      combat: u.combat,
      maintenance: u.maintenance,
      civilian: u.charges !== undefined ? 1 : 0,
      military: unitIsMilitary(u.id) ? 1 : 0,
      charges: u.charges ?? 0,
      requiresTech: u.requiresTech ? techIdx.get(u.requiresTech) ?? -1 : -1,
      // the CIVIC gate (Archaeologist / Natural History) and the
      // ARTIFACT-slot rule, so the GPU can refuse what trainableUnits refuses.
      requiresCivic: u.requiresCivic ? civicIdx.get(u.requiresCivic) ?? -1 : -1,
      needsArtifactSlot: u.id === 'ARCHAEOLOGIST' ? 1 : 0,
      // a building the TRAINING city must hold (the Military Engineer's Armory)
      requiresBuilding: u.requiresBuilding ? buildingIdx.get(u.requiresBuilding) ?? -1 : -1,
      // strategic-resource ACCESS gate — index into RESOURCE_IDS (the
      // same order the tile `rid` plane uses), or -1 = ungated. The GPU joins it
      // with the per-tile `rq`/res_imp plane to gate build+purchase per civ.
      requiresResource: u.requiresResource ? RESOURCE_IDS.indexOf(u.requiresResource) : -1,
      // the STOCKPILE slot the unit charges, and what it charges
      resSlot: u.requiresResource ? STRATEGIC_IDS.indexOf(u.requiresResource) : -1,
      resCost: u.requiresResource ? u.resourceCost ?? UNIT_RESOURCE_COST : 0,
      // GS: a FUEL unit bills this out of the bank every turn it lives
      resUpkeep: u.resourceUpkeep ?? 0,
      // the chassis this one upgrades INTO, as a roster index
      upTo: u.upgradesTo ? Object.keys(UNITS).indexOf(u.upgradesTo) : -1,
      antiAir: u.antiAir ?? 0,
      antiAirRange: u.antiAirRange ?? -1,   // -1 = this chassis covers nothing
      gdr: u.gdr ? 1 : 0,
      ww: u.waterWalk ? 1 : 0,
      // the nuclear pair: `nukeCover` stops a strike one hex out, `nukeCarry`
      // throws one; `healFriendly` heals at home alone.
      nukeCover: NUKE_INTERCEPTORS.includes(u.id) ? 1 : 0,
      nukeCarry: NUKE_CARRIERS.includes(u.id) ? 1 : 0,
      healFriendly: u.healFriendlyOnly ? 1 : 0,
      spy: u.spy ? 1 : 0,
      noGold: u.noGold ? 1 : 0,
      // AIR: 0 = not an aircraft, 1 = fighter, 2 = bomber. `rangedRange` is
      // the OPERATIONAL range, measured from the base.
      air: u.air === 'FIGHTER' ? 1 : u.air === 'BOMBER' ? 2 : 0,
      airSlots: u.airSlots ?? 0,
      rangedStrength: u.ranged?.strength ?? 0,
      rangedRange: u.ranged?.range ?? 0,
      moves: u.moves,
      naval: u.naval ? 1 : 0,
      cavalry: u.cavalry ? 1 : 0, // Preslav's hill bonus keys on the class
      // the two classes a Battering Ram or a Siege Tower helps
      melee: u.melee ? 1 : 0,
      antiCavalry: u.antiCavalry ? 1 : 0,
      // the UNIT_CLASSES bit mask and the era index a production card reads
      cls: UNIT_CLASSES.reduce((m, c, i) => m | (unitHasClass(u, c) ? 1 << i : 0), 0),
      era: UNIT_ERA_INDEX[u.id] ?? 0,
      recon: u.recon ? 1 : 0, // Survey doubles what this class earns
      // the NAVAL RAIDER axis: STEALTH hides the chassis from anything more
      // than a hex away, REVEAL STEALTH sees one within `sight`, and the two
      // zone-of-control abilities are independent of both.
      stealth: u.stealth ? 1 : 0,
      raider: u.raider ? 1 : 0, // CIV6: "Can perform Coastal Raids."
      revealStealth: u.revealStealth ? 1 : 0,
      ignoresZoc: u.ignoresZoc ? 1 : 0,
      exertsNoZoc: u.exertsNoZoc ? 1 : 0,
      sight: u.sight ?? 0,
      // BOMBARD strength (0 = not a siege unit): full damage to a perimeter,
      // no city penalty, and no melee attack at all.
      bombard: u.bombard ?? 0,
      // the siege SUPPORT chassis: 1 = Battering Ram, 2 = Siege Tower, and
      // the highest walls tier it still works against.
      siegeSupport: u.siegeSupport === 'RAM' ? 1 : u.siegeSupport === 'TOWER' ? 2 : 0,
      siegeMaxWalls: u.siegeMaxWalls ?? 0,
      // faith-purchase-only (MISSIONARY) — the trainableUnits filter's
      // mirror; masks the type out of the GPU purchase path.
      fo: u.faithOnly ? 1 : 0,
      so: u.spawnOnly ? 1 : 0,
      settler: u.settler ? 1 : 0,
      trader: u.trader ? 1 : 0,
      naturalist: u.naturalist ? 1 : 0,
    })),
    improvements: {
      ids: IMPROVEMENT_IDS,
      rows: IMPROVEMENT_IDS.map((id) => {
        const def = IMPROVEMENTS[id as keyof typeof IMPROVEMENTS];
        return {
          id,
          yields: YIELD_KEYS.map((k) => def.yields[k] ?? 0),
          housing: def.housing,
          unlock: techList.findIndex((t) =>
            t.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === id),
          ),
          // THE SUZERAIN ROWS. `suz` = 1 marks an improvement whose whole
          // offer rides a city-state's suzerainty (the fixture's `suzImp`
          // names which minor); the rest is its own ground rule and its
          // neighbours' payout, all catalog columns.
          suz: def.suzerainOf ? 1 : 0,
          terr: (def.terrains ?? []).map((t) => TERRAIN_IDS.indexOf(t)),
          xterr: (def.excludeTerrains ?? []).map((t) => TERRAIN_IDS.indexOf(t)),
          // 0 = FLAT, 1 = HILLS; MOUNTAIN is never improvable
          elev: (def.elevations ?? []).map((e) => (e === 'FLAT' ? 0 : 1)),
          noAdjSame: def.noAdjacentSame ? 1 : 0,
          // what a RENEWABLE generator supplies its city, per turn
          power: def.power ?? 0,
          // a row a Builder places on its own ground clause alone
          gnd: def.groundOnly ? 1 : 0,
          // a Builder row standing on WATER on its own terrain list alone
          wtr: def.waterOnly ? 1 : 0,
          adj: (def.adjacency ?? []).map((r) => ({
            bres: r.bonusResource ? 1 : 0,
            dist: r.district ? PLACEABLE_DISTRICTS.indexOf(r.district) : -1,
            anyd: r.anyDistrict ? 1 : 0,
            feats: (r.features ?? []).map((f) => FEAT_IDS.indexOf(f)),
            per: r.per,
            y: YIELD_KEYS.map((k) => r.yields[k] ?? 0),
            uc: r.upgradeCivic ? civicIdx.get(r.upgradeCivic) ?? -3 : -1,
            uper: r.upgradePer ?? 0,
            uy: YIELD_KEYS.map((k) => r.upgradeYields?.[k] ?? 0),
          })),
          houseCivic: def.housingCivic ? civicIdx.get(def.housingCivic) ?? -3 : -1,
          relHeal: def.religiousHeal ?? 0,
          tourY: def.tourismFrom ? YIELD_KEYS.indexOf(def.tourismFrom) : -1,
          tourTech: def.tourismTech ? techIdx.get(def.tourismTech) ?? -3 : -1,
          // THE MILITARY ENGINEER'S ROWS, and the appeal every improvement
          // takes off its neighbours.
          eng: def.engineer ? 1 : 0,
          noFeat: def.noFeature ? 1 : 0,
          // the ONE feature a row may stand on (the Geothermal Plant), -1 free
          reqFeat: def.requiresFeature ? FEAT_IDS.indexOf(def.requiresFeature) : -1,
          air: def.airSlots ?? 0,
          appeal: def.appealAdjacent ?? 0,
          plun: plunRow(def.plunder),
        };
      }),
      luxAmenityCities: LUXURY_AMENITY_CITIES,
      // the roster's naturalWonder flags and per-feature CATALOG yields, in
      // FEAT_IDS order — what lets the GPU derive its wonder plane and price
      // a feature that ARRIVES after t0 from the same table TS reads.
      featNatural: FEAT_IDS.map((f) => (FEATURES[f]?.naturalWonder ? 1 : 0)),
      featCatalogY: FEAT_IDS.map((f) => YIELD_KEYS.map((k) => FEATURES[f]?.yields?.[k] ?? 0)),
      nLuxuries: LUXURY_IDS.length,
      farmFood: IMPROVEMENTS.FARM.yields.food ?? 1,
      farmHousing: IMPROVEMENTS.FARM.housing,
      mineProd: IMPROVEMENTS.MINE.yields.production ?? 1,
      lumberProd: IMPROVEMENTS.LUMBER_MILL.yields.production ?? 1,
      builderIdx: Object.values(UNITS).findIndex((u) => u.id === 'BUILDER'),
      // the Military Engineer's roster index + the border/war flag,
      // so the GPU can mirror hasFortJob / the engineer job set.
      engineerIdx: Object.values(UNITS).findIndex((u) => u.id === 'MILITARY_ENGINEER'),
      engineerLive: ENGINEER_LIVE,
      // the 20% charge. Its four targets are the Aqueduct, Canal and Dam
      // districts and the Flood Barrier building, each of which the GPU
      // already names for itself.
      engineerFinishFraction: ENGINEER_FINISH_FRACTION,
      hillFarmsCivic: civicList.findIndex((c) => (c.effects ?? []).some((e) => e.kind === 'hillFarms')),
      farmAdjCivic: civicList.findIndex((c) => (c.effects ?? []).some((e) => e.kind === 'farmAdjacency')),
      farmAdjTech: techList.findIndex((t) => (t.effects ?? []).some((e) => e.kind === 'farmAdjacency')),
      mineUnlockTech: techList.findIndex((t) =>
        t.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'MINE'),
      ),
      seasideUnlockTech: techList.findIndex((t) =>
        t.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'SEASIDE_RESORT'),
      ),
      seasideMinAppeal: SEASIDE_RESORT_MIN_APPEAL,
      parkMinAppeal: PARK_MIN_APPEAL,
      parkAmenitiesOwner: PARK_AMENITIES_OWNER,
      parkAmenitiesNear: PARK_AMENITIES_NEAR,
      parkAmenityCities: PARK_AMENITY_CITIES,
      // the civic that reveals SHIPWRECKS, and so gates working one.
      shipwreckCivic: civicIdx.get(SHIPWRECK_CIVIC) ?? -1,
      lumberUnlockTech: techList.findIndex((t) =>
        t.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'LUMBER_MILL'),
      ),
      // What RESEARCH adds to an improvement's own yields, [row, improvement,
      // yield]. Techs and civics carry the same effect kind and TS sums both
      // into one `mods.improvementYields` map, so both tables ship.
      techImpY: researchImpYields(techList),
      civicImpY: researchImpYields(civicList),
      // what a row pays extra on a RIVER tile (the Lumber Mill's second
      // Production), [improvement, yield]
      impRiverY: IMPROVEMENT_IDS.map((id) =>
        YIELD_KEYS.map((k) => IMPROVEMENTS[id as ImprovementId]?.riverYields?.[k] ?? 0)),
    },
    districts: PLACEABLE_DISTRICTS.map((id, idx) => {
      const d = DISTRICTS[id];
      return {
        id,
        idx,
        unlockTech: techList.findIndex((t) => t.effects.some((e) => e.kind === 'unlockDistrict' && e.district === id)),
        unlockCivic: civicList.findIndex((c) => c.effects.some((e) => e.kind === 'unlockDistrict' && e.district === id)),
        cost: d.cost,
        adjYield: d.adjacencyYield ? YIELD_KEYS.indexOf(d.adjacencyYield) : -1,
        adjacency: d.adjacency.map((a) => ({ src: ADJ_SRC.indexOf(a.source), amount: a.amount })),
        // an AMENITY per adjacent tile of one kind (the Aqueduct's fissure)
        amenAdj: d.amenityAdjacent
          ? [ADJ_SRC.indexOf(d.amenityAdjacent.source), d.amenityAdjacent.amount]
          : [-1, 0],
        housing: d.housing,
        maintenance: d.maintenance,
        amenities: d.amenities ?? 0,
        countsTowardLimit: d.countsTowardLimit ? 1 : 0,
        allowMultiple: d.allowMultiple ? 1 : 0,
        onCoastalWater: d.placement.onCoastalWater ? 1 : 0,
        reqAdjCenter: d.placement.requiresAdjacentCityCenter ? 1 : 0,
        reqWaterOrMountain: d.placement.requiresWaterSourceOrMountain ? 1 : 0,
        notAdjCenter: d.placement.notAdjacentToCityCenter ? 1 : 0,
        appealAdjacent: d.appealAdjacent,
        loyalty: d.loyalty ?? 0,
        oneCivWide: d.oneCivWide ? 1 : 0,
        exclusive: (d.exclusiveDistricts ?? []).map((x) => PLACEABLE_DISTRICTS.indexOf(x)).filter((i) => i >= 0),
        governorTitle: d.governorTitle ?? 0,
        envoysNextToCenter: d.envoysNextToCenter ?? 0,
        cultureBombUnowned: d.cultureBombUnowned ? 1 : 0,
        appealHousing: d.appealHousing ? 1 : 0,
        floodShield: d.floodShield ? 1 : 0,
        spyLevelPenalty: d.spyLevelPenalty ?? 0,
        plun: plunRow(d.plunder),
        // specialist base yields, and the TOP building that upgrades them
        // (-1 none, -2 = any worship building)
        spec: YIELD_KEYS.map((k) => SPECIALIST_YIELDS[id]?.[k] ?? 0),
        // the buildings that lift this district's specialists, -2 = any
        // worship building; a district with no tier exports an empty list
        specTB: (SPECIALIST_TIERS[id]?.buildings ?? []).map((b) => (b === 'WORSHIP' ? -2 : buildingIdx.get(b) ?? -1)).filter((i) => i !== -1),
        specTA: YIELD_KEYS.map((k) => SPECIALIST_TIERS[id]?.add[k] ?? 0),
      };
    }),
    districtScaffold: {
      campusIdx: PLACEABLE_DISTRICTS.indexOf('CAMPUS'),
      campusUnlockTech: techList.findIndex((t) =>
        t.effects.some((e) => e.kind === 'unlockDistrict' && e.district === 'CAMPUS'),
      ),
      active: SCRIPTED_CAMPUS ? 1 : 0,
      place: SCAFFOLD_DISTRICTS.map(({ id, unlockId, unlockKind, placement }) => ({
        idx: PLACEABLE_DISTRICTS.indexOf(id),
        unlockTech: unlockKind === 'civic' ? -1 : techIdx.get(unlockId) ?? -1,
        unlockCivic: unlockKind === 'civic' ? civicIdx.get(unlockId) ?? -1 : -1,
        placement: placement ? PLACEMENT_CODE[placement] : 0,
        // FLAT price (the Spaceport): speed-scaled here, -1 = the generic curve.
        fixedCost: DISTRICTS[id].fixedCost ? Math.round(DISTRICTS[id].cost * GAME_SPEED) : -1,
      })),
      askable: (['CAMPUS', 'HOLY_SITE', 'COMMERCIAL_HUB', 'THEATER_SQUARE'] as const).map((id) =>
        PLACEABLE_DISTRICTS.indexOf(id),
      ),
    },
    palace: {
      // The GPU has no `city_bldg` bit for the Palace — it is a capital TERM
      // there — so any per-building rule that names it needs this flag.
      govYieldBuilding: BUILDINGS.PALACE && isGovYieldBuilding(BUILDINGS.PALACE) ? 1 : 0,
      yields: YIELD_KEYS.map((k) => BUILDINGS.PALACE?.yields?.[k] ?? 0),
      housing: BUILDINGS.PALACE?.housing ?? 0,
      amenities: BUILDINGS.PALACE?.amenities ?? 0,
      maintenance: BUILDINGS.PALACE?.maintenance ?? 0,
    },
    buildings: centerBuildings.map((b) => ({
      id: b.id,
      cost: b.cost,
      yields: YIELD_KEYS.map((k) => b.yields?.[k] ?? 0),
      housing: b.housing ?? 0,
      amenities: b.amenities ?? 0,
      maintenance: b.cost === 0 ? 0 : b.maintenance !== undefined ? b.maintenance : b.worship || b.district === 'COMMERCIAL_HUB' ? 0 : b.cost >= 500 ? 3 : b.cost >= 190 ? 2 : 1, // the buildingMaintenance mirror
      river: b.special === 'WATER_MILL',
      farmBonusFood: b.special === 'WATER_MILL',
      coastFood: b.special === 'LIGHTHOUSE',
      cultureAtMaxLoyalty: b.special === 'MONUMENT',
      loyalty: b.loyalty ?? 0,
      unlockTech: buildingUnlockTech.get(b.id) ?? -1,
      eraIdx: BUILDING_ERA_INDEX[b.id] ?? 0,
      unlockCivic: buildingUnlockCivic.get(b.id) ?? -1,
      reqDistrict: b.district === 'CITY_CENTER' ? -1 : PLACEABLE_DISTRICTS.indexOf(b.district),
      reqBuildings: (b.requiresAny ?? []).map((id) => buildingIdx.get(id) ?? -1).filter((i) => i >= 0),
      exclBuildings: (b.exclusiveWith ?? []).map((id) => buildingIdx.get(id) ?? -1).filter((i) => i >= 0),
      regional: b.regional ? 1 : 0,
      // GS POWER: the base load this row demands, what it pays once its city
      // is powered, and whether it SUPPLIES its region.
      power: b.power ?? 0,
      poweredYields: YIELD_KEYS.map((k) => b.poweredYields?.[k] ?? 0),
      poweredAmenities: b.poweredAmenities ?? 0,
      powerPlant: b.powerPlant ? 1 : 0,
      // the plant's fuel SLOT and its published Power-per-unit rate
      fuelSlot: b.fuel ? STRATEGIC_IDS.indexOf(b.fuel) : -1,
      fuelRate: b.fuelRate ?? 0,
      airSlots: b.airSlots ?? 0,
      // the GOVERNMENT PLAZA rows: the government tier each needs, the title
      // it awards, and the empire-wide channels they pay into.
      govTier: b.govTier ?? 0,
      govTitle: b.govTitle ?? 0,
      spyCapacity: b.spyCapacity ?? 0,
      faithBuyUnits: b.faithBuyUnits ? 1 : 0,
      pillageFaithImp: b.pillageFaithImp ?? 0,
      pillageFaithDist: b.pillageFaithDist ?? 0,
      grantUnit: b.grantUnit ? Object.values(UNITS).findIndex((u) => u.id === b.grantUnit) : -1,
      grantUnitNewCity: b.grantUnitNewCity ? Object.values(UNITS).findIndex((u) => u.id === b.grantUnitNewCity) : -1,
      settlerProdPct: b.settlerProdPct ?? 0,
      conquestProdPct: b.conquestProdPct ?? 0,
      conquestProdTurns: b.conquestProdTurns ?? 0,
      anyWorkSlots: b.anyWorkSlots ?? 0,
      healOnKill: b.healOnKill ?? 0,
      projectChargePct: b.projectChargePct ?? 0,
      spyLevelPenalty: b.spyLevelPenalty ?? 0,
      // the Consulate's empire-wide half — paid to any city of the seat
      // holding a live Encampment, wherever the building itself stands
      spyLevelPenaltyEncampment: b.spyLevelPenaltyEncampment ?? 0,
      influencePerTurn: b.influencePerTurn ?? 0,
      favorPerTurn: b.favorPerTurn ?? 0,
      loyaltyWithoutGovernor: b.loyaltyWithoutGovernor ?? 0,
      amenitiesWithGovernor: b.amenitiesWithGovernor ?? 0,
      housingWithGovernor: b.housingWithGovernor ?? 0,
      // CIV6 (Autocracy): does this building count for its per-government-
      // building yields — derived from the district, never transcribed.
      govYieldBuilding: isGovYieldBuilding(b) ? 1 : 0,
      powerSupply: b.powerSupply ?? 0,
      regionalRange: b.regionalRange ?? 0,
      // the PRESERVE rows: what they pay an adjacent unimproved tile at
      // Breathtaking and at Charming, in that order (the bands do not stack).
      appealYields: b.appealYields
        ? [YIELD_KEYS.map((k) => b.appealYields!.breathtaking[k] ?? 0),
           YIELD_KEYS.map((k) => b.appealYields!.charming[k] ?? 0)]
        : [],
      izAdjProduction: b.special === 'COAL_PLANT' ? 1 : 0,
      // the FLOOD BARRIER: a variable price, priced off the city's lowland
      // tiles and the sea level rather than off this row's `cost`.
      floodBarrier: b.floodBarrier ? 1 : 0,
      // worship = faith-purchase-only (never queued, never gold-bought).
      worship: b.worship ? 1 : 0,
      // the WALLS TIER this row supplies (0 = not a walls row), and the
      // gold-purchase refusal the upgraded tiers carry
      walls: b.walls ?? 0,
      noPurchase: b.noPurchase ? 1 : 0,
      trainXpPct: b.trainXpPct ?? 0,
      trainXpClasses: (b.trainXpClasses ?? []).map((c) => PROMO_CLASSES.indexOf(c)),
    })),
    techs: techList.map((t) => ({
      id: t.id,
      cost: t.cost,
      prereqs: (t.prereqs ?? []).map((p) => techIdx.get(p)!),
      awardEnvoys: t.effects.reduce((n, e) => n + (e.kind === 'award' ? e.envoys ?? 0 : 0), 0),
      awardDvp: t.effects.reduce((n, e) => n + (e.kind === 'award' ? e.dvp ?? 0 : 0), 0),
    })),
    civics: civicList.map((c) => ({
      id: c.id,
      cost: c.cost,
      prereqs: (c.prereqs ?? []).map((p) => civicIdx.get(p)!),
      awardEnvoys: c.effects.reduce((n, e) => n + (e.kind === 'award' ? e.envoys ?? 0 : 0), 0),
      awardDvp: c.effects.reduce((n, e) => n + (e.kind === 'award' ? e.dvp ?? 0 : 0), 0),
    })),
    // The adoption master switch, mirrored to the GPU so both engines gate
    // adoption identically — see GOVERNMENTS_ADOPTION_LIVE.
    governmentsLive: GOVERNMENTS_ADOPTION_LIVE,
    // government + policy modifier tables (the belief-table shape).
    // Slot kinds: military=0, economic=1, diplomatic=2, wildcard=3. Every
    // effect channel exports: off-script research can adopt ANY government
    // (the Merchant-Republic catch) and slot any card, so every one is
    // reachable and the two engines read the same table.
    governments: Object.values(GOVERNMENTS).map((g) => ({
      id: g.id,
      tier: g.tier,
      intolerance: GOV_INTOLERANCE[g.id] ?? 0,
      unlockCivic: civicList.findIndex((c) =>
        c.effects.some((e) => e.kind === 'unlockGovernment' && e.government === g.id),
      ),
      slots: [
        g.slots.filter((s) => s === 'military').length,
        g.slots.filter((s) => s === 'economic').length,
        g.slots.filter((s) => s === 'diplomatic').length,
        g.slots.filter((s) => s === 'wildcard').length,
      ],
      ...effectRow(g.effects),
    })),
    governors: GOVERNORS.map((g) => ({
      id: g.id,
      establish: g.establishTurns,
      cityStates: g.cityStates ? 1 : 0,
      // the DEFAULT ability's row in `governorPromotions`
      base: GOVERNOR_DEFAULT_PROMOTION[GOVERNOR_INDEX[g.id]],
    })),
    governorPromotions: GOVERNOR_PROMOTIONS.map((p) => ({
      id: p.id,
      gov: GOVERNOR_INDEX[p.governor],
      tier: p.tier,
      // a bitmask over this list: at least ONE of these must be held
      requires: (p.requires ?? []).reduce((m, r) => m + promotionBitValue(GOVERNOR_PROMOTION_INDEX[r]!), 0),
      ...governorEffectRow(p.effects),
    })),
    policies: Object.values(POLICIES).map((p) => ({
      id: p.id,
      kind: SLOT_KIND_IDX[p.kind],
      unlockCivic: civicList.findIndex((c) =>
        c.effects.some((e) => e.kind === 'unlockPolicy' && e.policy === p.id),
      ),
      // the civic that RETIRES the card; -1 = it never leaves the pool
      obsoleteCivic: p.obsoleteCivic ? civicIdx.get(p.obsoleteCivic) ?? -1 : -1,
      // a DARK AGE card's era window; [-1, -1] on every ordinary card
      dark: p.dark ? [p.dark.firstEra, p.dark.lastEra] : [-1, -1],
      // a LEGACY card's government, by GOVERNMENTS order; -1 otherwise
      legacy: p.legacyOf ? Object.keys(GOVERNMENTS).indexOf(p.legacyOf) : -1,
      ...effectRow(p.effects),
    })),
  };
  return rules;
}

