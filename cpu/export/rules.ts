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
import { IMPROVEMENTS, SEASIDE_RESORT_MIN_APPEAL, PARK_MIN_APPEAL, PARK_AMENITIES_OWNER,
  PARK_AMENITIES_NEAR, PARK_AMENITY_CITIES } from '../data/improvements';
import { SHIPWRECK_CIVIC } from '../core/units';
import type { ImprovementId } from '../core/types';
import { GENERAL_AURA_CS, GENERAL_AURA_RANGE, BARB_SCOUT_OPENER_LIVE } from '../core/combat';
import { GENERAL_AURA_MP } from '../core/aura';
import { SUZ_EFFECTS, KABUL_XP_MULT, PRESLAV_HILL_CS, REGIONAL_REACH_BONUS, ANSHAN_WRITING_SCIENCE, ANSHAN_RELIC_SCIENCE, KUMASI_ROUTE_CULTURE, KUMASI_ROUTE_GOLD } from '../data/cityStates';
import { CITY_STATE_TYPES, ENVOY_COST, INFLUENCE_PER_TURN, CITY_STATE_CAPITAL_BONUS, QUEST_COOLDOWN, QUEST_ENVOYS, CITY_STATE_TYPE_YIELD, CITY_STATE_TYPE_DISTRICT, CITY_STATE_TYPE_BUILDINGS, CITY_STATE_DISTRICT_BONUS, CITY_STATE_SUZERAIN_YIELD, CITY_STATE_MAX_HP, CITY_STATE_MEET_RANGE, LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import { GP_CLASSES, GREAT_PEOPLE, gpCost, GP_CLASS_DISTRICT, GW_BUILDINGS, GW_SLOTS, GW_WONDER_SLOTS, RELIC_WONDER_SLOTS, GW_WORKS_PER_PERSON, GW_CULTURE, GW_TOURISM, GW_PRINTING_TECH, GW_PRINTING_WRITING_MULT, RELIC_BUILDING, RELIC_SLOTS_PER_BUILDING, RELIC_FAITH, RELIC_TOURISM, ARTIFACT_BUILDING, ARTIFACT_SLOTS, ARTIFACT_CULTURE, ARTIFACT_TOURISM, THEMING_MULT, ARTIST_WORKS, SPECIALIST_YIELDS, SPECIALIST_TIERS } from '../data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, PANTHEON_FAITH_COST, RELIGION_PRESSURE_RANGE, JUST_WAR_RANGE, B18_FOLLOWER_COUPLING_LIVE, WORSHIP_BUILDINGS, SPREAD_PRESSURE, MISSIONARY_CAP, APOSTLE_CAP, CITY_RELIGION_ADDER_LIVE, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE, MARTYR_CHANCE, type BeliefEffects } from '../data/religion';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION, SPACE_FLIGHT_LY, gpClassesOf, gppFractionOf } from '../data/projects';
import { BUILT_WONDERS } from '../data/builtWonders';
import { TRADE_ROUTE_RANGE_LAND, TRADE_ROUTE_RANGE_SEA, CITY_STATE_ROUTE_GOLD, CITY_STATE_ROUTE_SPEC, INTL_ROUTE_GOLD, TRADE_ROUTE_DURATION, PLUNDER_ROUTE_GOLD, TRADE_WALK_EXPIRY_RAIL } from '../core/trade';
import { SUZERAIN_ENVOYS } from '../data/cityStates';
import { MAX_CITIES_PER_SEAT, CITY_SLOTS_PER_SEAT, WAR_MIN_TURNS, PEACE_TREATY_TURNS, LOYALTY_MAX, LOYALTY_RANGE, LOYALTY_PRESSURE_SCALE, LOYALTY_AMENITY, PEACE_GOLD_COST, WW_ERA_BASE_FORMAL, WW_ERA_BASE_SURPRISE, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WAR_WEARINESS_PER_AMENITY, DOW_PROXIMITY, FORMAL_WAR_MIN_TURNS, ERA_LENGTH, ERA_SCORE_FOUND, ERA_SCORE_CONQUER, ERA_SCORE_WONDER, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, ERA_SCORE_GP, ERA_SCORE_MOMENT_MIN, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES, GOVERNOR_LOYALTY, HEROIC_DEDICATIONS, ADMIRAL_MARCH_LIVE, GOLDEN_MOVE_BONUS, DEDICATION_PAYOUTS_LIVE, ALLY_MIN_PEACE, WARMONGER_DOW, WARMONGER_CAPTURE, WARMONGER_GANG, DIPLO_FAVOR_PER_SUZERAIN, CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION, CONGRESS_RESOLUTIONS, CONGRESS_DV_MIN_ERA, CONGRESS_DV_DELTA, CONGRESS_VOTE_STEP, CONGRESS_PROD_MULT, CONGRESS_GPP_MULT, CONGRESS_GROWTH_A, CONGRESS_GROWTH_B, CONGRESS_MIG_LOYALTY, CONGRESS_GW_MULT, DED_EVENT_SCORE, DIPLO_VICTORY_POINTS, TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, ENGINEER_LIVE, DED_MONUMENTALITY, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS } from '../data/seats';
import { WONDER_TOURISM_BASE } from '../core/city';
import { BALANCED_WEIGHTS } from '../core/score';
import { unitActionNames } from '../core/unitActions';
import { MAX_BARB_PER_CAMP, BARB_HORSE_RANGE } from '../core/combat';
import { UNITS, UNIT_HP, CITY_MAX_HP, WALLS_HP, WALL_DAMAGE_MELEE, WALL_DAMAGE_RANGED, WALL_BREACH_FRACTION, RANGED_CITY_PENALTY, ENCAMPMENT_HP } from '../data/units';
import { YIELD_KEYS } from '../core/types';
import { FLOOD_SEVERITY_P, FLOOD_DESTROY_P, FLOOD_DISTRICT_P, FLOOD_POP_P, FLOOD_DAMAGE_LO, FLOOD_DAMAGE_HI, FLOOD_FERT_FOOD, FLOOD_FERT_PROD, floodTerrainColumn } from '../data/disasters';
import { BUILDINGS } from '../data/buildings';
import { DISTRICTS, PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS, type AdjacencySource } from '../data/districts';
import { TECHS, ERAS, MODERN_ERA_INDEX } from '../data/techs'; // era scale
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, SLOT_KINDS, GOVERNMENTS_ADOPTION_LIVE, type SlotKind } from '../data/policies';
import { BOOSTS, BOOST_FRACTION } from '../data/boosts';
import { CITY_WORK_RADIUS, CITIZEN_SCIENCE, CITIZEN_CULTURE, FOOD_PER_CITIZEN, CITY_CENTER_MIN_FOOD, CITY_CENTER_MIN_PRODUCTION, HOUSING_FRESH_WATER, HOUSING_COASTAL, HOUSING_NO_WATER, AQUEDUCT_FRESH_BONUS, AQUEDUCT_NO_FRESH_TOTAL, GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT, LUXURY_AMENITY_CITIES, GAME_SPEED, REGIONAL_RANGE, EMBARK_MOVES, EMBARKED_DEFENSE_CS, embarkState } from '../data/constants';

// The GPU improvement index space (tile.improvement values, build codes 13-15).
// the roster grew — indices 0-2 stay stable (every existing
// plane/consumer keys on them); the resource-only improvements append.
// FISHING_BOATS stays OUT: water-only, and a land builder can never stand
// on the tile (unreachable in both engines).
// SEASIDE_RESORT appended LAST — this array's order IS the GPU's
// improvement index, so anything but an append renumbers every other row.
import { IMPROVEMENT_IDS } from '../core/unitActions'; // ONE roster, core-owned (order is the column index; FORT appended LAST)

 
import { techList, civicList, techIdx, civicIdx, centerBuildings, buildingIdx, buildingUnlockTech, buildingUnlockCivic, FEAT_IDS, TERRAIN_IDS, RESOURCE_IDS, BUILT_WONDER_LIST } from './catalog';
import { DED_TO_ARMS, DED_DRACONES, DED_COINAGE, DED_STEAM, DED_WISH, DEDICATION_ERAS, WISH_PARK_TOURISM_MULT, WISH_WONDER_TOURISM_NUM, WISH_WONDER_TOURISM_DEN, TO_ARMS_MIL_PROD_MULT, DRACONES_DISCOVERY_SCORE, COINAGE_INTL_GOLD_PER_SPEC, STEAM_WONDER_PROD_MULT } from '../data/seats';
import { BUILDING_ERA_INDEX } from '../data/buildings';
import { INDUSTRIAL_ERA_INDEX } from '../data/techs';

/** The REAL settler rule now: a 1-pop city may not train or buy one.
 *  Exported to the GPU as scenario.settlerPopGate. */
const SETTLER_POP_GATE = 2;

const beliefRow = (def: { effects: BeliefEffects }) => ({
  featY: FEAT_IDS.map((f) => YIELD_KEYS.map((k) => def.effects.featureYields?.[f]?.[k] ?? 0)),  // [nFeat, 6]
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
  mcost: Math.round((UNITS.MISSIONARY?.cost ?? 0) * (def.effects.missionaryCostMult ?? 1)),  // Holy Order 63, base 90
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


const ADJ_SRC: AdjacencySource[] = [
  'MOUNTAIN', 'RAINFOREST', 'WOODS', 'REEF', 'NATURAL_WONDER', 'BUILT_WONDER',
  'RIVER', 'DISTRICT', 'CITY_CENTER', 'HARBOR_DISTRICT', 'SEA_RESOURCE',
  'MINE', 'QUARRY', 'AQUEDUCT',
];

const SCRIPTED_CAMPUS = true;

const PLACEMENT_CODE = { aqueduct: 1, coastal: 2, encampment: 3, flat: 4 } as const;

const SLOT_KIND_IDX: Record<SlotKind, number> = { military: 0, economic: 1, diplomatic: 2, wildcard: 3 };


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
    shipyardBidx: buildingIdx.get('SHIPYARD') ?? -1,
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
      govCivicsPerTitle: GOV_CIVICS_PER_TITLE,
      govMaxTitles: GOV_MAX_TITLES,
      allyMinPeace: ALLY_MIN_PEACE, warmongerDow: WARMONGER_DOW, warmongerCapture: WARMONGER_CAPTURE, warmongerGang: WARMONGER_GANG, diplomaticFavorPerSuzerain: DIPLO_FAVOR_PER_SUZERAIN, congressInterval: CONGRESS_INTERVAL, congressMinEra: CONGRESS_MIN_ERA, dvpPerResolution: DVP_PER_RESOLUTION, diploVictoryPoints: DIPLO_VICTORY_POINTS, dedicationPayoutsLive: DEDICATION_PAYOUTS_LIVE, dedMonumentality: DED_MONUMENTALITY, dedFreeInquiry: DED_FREE_INQUIRY, dedPenBrush: DED_PEN_BRUSH_AND_VOICE, dedExodus: DED_EXODUS, heroicDedications: HEROIC_DEDICATIONS, dedEventScore: [...DED_EVENT_SCORE], goldenMoveBonus: GOLDEN_MOVE_BONUS, governorLoyalty: GOVERNOR_LOYALTY, dedToArms: DED_TO_ARMS, dedDracones: DED_DRACONES, dedCoinage: DED_COINAGE, dedSteam: DED_STEAM, dedWish: DED_WISH,
      // which catalog entries each WORLD ERA offers, padded to a rectangle
      // with -1 (the GPU walks `dedEraLen` entries of each row)
      dedEras: DEDICATION_ERAS.map((w) => {
        const wide = Math.max(...DEDICATION_ERAS.map((x) => x.length));
        return [...w, ...Array<number>(wide - w.length).fill(-1)];
      }),
      dedEraLen: DEDICATION_ERAS.map((w) => w.length),
      wishParkTourism: WISH_PARK_TOURISM_MULT, wishWonderTourNum: WISH_WONDER_TOURISM_NUM, wishWonderTourDen: WISH_WONDER_TOURISM_DEN, toArmsMilProd: TO_ARMS_MIL_PROD_MULT, draconesDiscoveryScore: DRACONES_DISCOVERY_SCORE, coinageIntlGoldPerSpec: COINAGE_INTL_GOLD_PER_SPEC, steamWonderProd: STEAM_WONDER_PROD_MULT, industrialEra: INDUSTRIAL_ERA_INDEX,
      // t: the target-space kind, 0 district / 1 gpClass / 2 gwKind / 3 seat
      congressResolutions: CONGRESS_RESOLUTIONS.map((r) => ({ min: r.minEra, max: r.maxEra, t: ['district', 'gpClass', 'gwKind', 'seat'].indexOf(r.target) })),
      congressDvMinEra: CONGRESS_DV_MIN_ERA, congressDvDelta: CONGRESS_DV_DELTA, congressVoteStep: CONGRESS_VOTE_STEP, congressProdMult: CONGRESS_PROD_MULT, congressGppMult: CONGRESS_GPP_MULT, congressGrowthA: CONGRESS_GROWTH_A, congressGrowthB: CONGRESS_GROWTH_B, congressMigLoyalty: CONGRESS_MIG_LOYALTY, congressGwMult: CONGRESS_GW_MULT,
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
      settlerBase: Math.round(80 * GAME_SPEED), // 48 + 18·max(0, cities − 1 + live + queued)
      settlerPer: Math.round(30 * GAME_SPEED),
      pantheonFaithCost: PANTHEON_FAITH_COST,
      prophetCls: GP_CLASSES.indexOf('PROPHET'),
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
      artifactSlots: ARTIFACT_SLOTS,
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
      techEra: techList.map((t) => Math.max(0, ERAS.indexOf(t.era))),
      civicEra: civicList.map((c) => Math.max(0, ERAS.indexOf(c.era))),
      warMinTurns: WAR_MIN_TURNS,
      peaceTreatyTurns: PEACE_TREATY_TURNS,
      dowProximity: DOW_PROXIMITY,
      formalWarMinTurns: FORMAL_WAR_MIN_TURNS,
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
      gpCosts: Array.from({ length: 8 }, (_, n) => gpCost(n)),
      gpRoster: GP_CLASSES.map((c) => GREAT_PEOPLE[c].length),
      gpClassDistrict: GP_CLASSES.map((c) => PLACEABLE_DISTRICTS.indexOf(GP_CLASS_DISTRICT[c])),
      gpEffects: GP_CLASSES.map((c) =>
        GREAT_PEOPLE[c].map((p) => [p.effect.science ?? 0, p.effect.culture ?? 0, p.effect.gold ?? 0, p.effect.productionToCapital ?? 0, p.effect.faith ?? 0]),
      ),
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
      martyrChance: MARTYR_CHANCE,
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
        regionalAmenities: w.effects?.regionalAmenities ?? 0,
        cityAmenities: w.effects?.cityAmenities ?? 0,
        cityHousing: w.effects?.cityHousing ?? 0,
        dvp: w.effects?.dvp ?? 0,
        // policy slots, parallel to SLOT_KINDS
        slots: SLOT_KINDS.map((k) => w.effects?.extraSlots?.[k] ?? 0),
        envoysPerWonder: w.effects?.envoysPerWonder ?? 0,
        spreadCharges: w.effects?.spreadCharges ?? 0,
        buildCharges: w.effects?.buildCharges ?? 0,
        apostleMartyr: w.effects?.apostleMartyr ? 1 : 0,
        floodMitigation: w.effects?.floodMitigation ? 1 : 0,
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
    // Space rows carry sp (space flag) / vic (victory step) plus the tech gate
    // (rt = techs-table idx) and previous-step link (rp = projects-table idx),
    // which is what `_space_step_ok` reads. They sit LAST, in chain order: the
    // scripted greedy takes the lowest legal index, so a base project always
    // shadows them. Laser rows (`ls`, repeatable, tech-gated only) sit between
    // the base rows and the chain; `pc` is a FIXED price (already speed-scaled)
    // where >= 0, else the generic curve applies.
    projects: {
      rows: Object.values(PROJECTS).map((p, _i, all) => ({
        d: PLACEABLE_DISTRICTS.indexOf(p.district),
        y: p.yield ? YIELD_KEYS.indexOf(p.yield) : -1,
        g: p.gpClass ? GP_CLASSES.indexOf(p.gpClass) : -1,
        // the FULL class list + this project's own per-class rate. `g` stays
        // for index stability; the GPU reads `gs`/`gf` and falls back to `g`.
        gs: gpClassesOf(p).map((c) => GP_CLASSES.indexOf(c)),
        gf: gppFractionOf(p),
        sp: p.space ? 1 : 0,
        ls: p.laser ? 1 : 0,
        vic: p.victory ? 1 : 0,
        pc: p.cost ?? -1,
        rt: p.requiresTech ? (techIdx.get(p.requiresTech) ?? -1) : -1,
        rp: p.requiresProject ? all.findIndex((q) => q.id === p.requiresProject) : -1,
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
      wallsHp: WALLS_HP, // the ANCIENT_WALLS outer-defense pool cap
      wallDamageMelee: WALL_DAMAGE_MELEE,
      wallDamageRanged: WALL_DAMAGE_RANGED,
      wallBreachFraction: WALL_BREACH_FRACTION,
      rangedCityPenalty: RANGED_CITY_PENALTY,
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
      // EMBARK: flat embarked MP, the LIVE water-step master switch (N1
      // ships it INERT), and the embark/ocean tech gates (index into rules techs;
      // military embarks on SHIPBUILDING, civilians on SAILING, OCEAN needs
      // CARTOGRAPHY). The GPU mirrors these exactly.
      embarkMoves: EMBARK_MOVES,
      embarkedDefenseCs: EMBARKED_DEFENSE_CS, // flat embarked-defender CS
      embarkLive: embarkState.live ? 1 : 0,
      shipbuildingTech: techIdx.get('SHIPBUILDING') ?? -1,
      cartographyTech: techIdx.get('CARTOGRAPHY') ?? -1,
      celestialTech: techIdx.get('CELESTIAL_NAVIGATION') ?? -1,
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
      charges: u.charges ?? 0,
      requiresTech: u.requiresTech ? techIdx.get(u.requiresTech) ?? -1 : -1,
      // the CIVIC gate (Archaeologist / Natural History) and the
      // ARTIFACT-slot rule, so the GPU can refuse what trainableUnits refuses.
      requiresCivic: u.requiresCivic ? civicIdx.get(u.requiresCivic) ?? -1 : -1,
      needsArtifactSlot: u.id === 'ARCHAEOLOGIST' ? 1 : 0,
      // strategic-resource ACCESS gate — index into RESOURCE_IDS (the
      // same order the tile `rid` plane uses), or -1 = ungated. The GPU joins it
      // with the per-tile `rq`/res_imp plane to gate build+purchase per civ.
      requiresResource: u.requiresResource ? RESOURCE_IDS.indexOf(u.requiresResource) : -1,
      rangedStrength: u.ranged?.strength ?? 0,
      rangedRange: u.ranged?.range ?? 0,
      moves: u.moves,
      naval: u.naval ? 1 : 0,
      cavalry: u.cavalry ? 1 : 0, // Preslav's hill bonus keys on the class
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
        };
      }),
      luxAmenityCities: LUXURY_AMENITY_CITIES,
      farmFood: IMPROVEMENTS.FARM.yields.food ?? 1,
      farmHousing: IMPROVEMENTS.FARM.housing,
      mineProd: IMPROVEMENTS.MINE.yields.production ?? 1,
      lumberProd: IMPROVEMENTS.LUMBER_MILL.yields.production ?? 1,
      builderIdx: Object.values(UNITS).findIndex((u) => u.id === 'BUILDER'),
      // the Military Engineer's roster index + the border/war flag,
      // so the GPU can mirror hasFortJob / the engineer job set.
      engineerIdx: Object.values(UNITS).findIndex((u) => u.id === 'MILITARY_ENGINEER'),
      engineerLive: ENGINEER_LIVE,
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
      mineBoostTechs: techList
        .map((t, i): [number, number] => {
          let boost = 0;
          for (const e of t.effects) {
            if (e.kind === 'improvementYields' && e.improvement === 'MINE') boost += e.yields.production ?? 0;
          }
          return [i, boost];
        })
        .filter(([, boost]) => boost > 0),
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
        housing: d.housing,
        maintenance: ['CITY_CENTER', 'NEIGHBORHOOD', 'AQUEDUCT', 'COMMERCIAL_HUB', 'HARBOR'].includes(id) ? 0 : 1, // CH+Harbor exempt (real Civ 6)
        countsTowardLimit: d.countsTowardLimit ? 1 : 0,
        allowMultiple: d.allowMultiple ? 1 : 0,
        onCoastalWater: d.placement.onCoastalWater ? 1 : 0,
        reqAdjCenter: d.placement.requiresAdjacentCityCenter ? 1 : 0,
        reqWaterOrMountain: d.placement.requiresWaterSourceOrMountain ? 1 : 0,
        notAdjCenter: d.placement.notAdjacentToCityCenter ? 1 : 0,
        // specialist base yields, and the TOP building that upgrades them
        // (-1 none, -2 = any worship building)
        spec: YIELD_KEYS.map((k) => SPECIALIST_YIELDS[id]?.[k] ?? 0),
        specTB: SPECIALIST_TIERS[id] ? (SPECIALIST_TIERS[id]!.building === 'WORSHIP' ? -2 : buildingIdx.get(SPECIALIST_TIERS[id]!.building) ?? -1) : -1,
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
      unlockTech: buildingUnlockTech.get(b.id) ?? -1,
      eraIdx: BUILDING_ERA_INDEX[b.id] ?? 0,
      unlockCivic: buildingUnlockCivic.get(b.id) ?? -1,
      reqDistrict: b.district === 'CITY_CENTER' ? -1 : PLACEABLE_DISTRICTS.indexOf(b.district),
      reqBuildings: (b.requiresAny ?? []).map((id) => buildingIdx.get(id) ?? -1).filter((i) => i >= 0),
      exclBuildings: (b.exclusiveWith ?? []).map((id) => buildingIdx.get(id) ?? -1).filter((i) => i >= 0),
      regional: b.regional ? 1 : 0,
      // worship = faith-purchase-only (never queued, never gold-bought).
      worship: b.worship ? 1 : 0,
      trainXp: b.trainXp ?? 0,
    })),
    techs: techList.map((t) => ({
      id: t.id,
      cost: t.cost,
      prereqs: (t.prereqs ?? []).map((p) => techIdx.get(p)!),
    })),
    civics: civicList.map((c) => ({
      id: c.id,
      cost: c.cost,
      prereqs: (c.prereqs ?? []).map((p) => civicIdx.get(p)!),
    })),
    // The adoption master switch, mirrored to the GPU so both engines gate
    // adoption identically — see GOVERNMENTS_ADOPTION_LIVE.
    governmentsLive: GOVERNMENTS_ADOPTION_LIVE,
    // government + policy modifier tables (the belief-table shape).
    // Slot kinds: military=0, economic=1, diplomatic=2, wildcard=3. Only the
    // cityYields/capitalYields channels are exported (the GPU-implemented gov/
    // policy effects); other PolicyEffects channels (adjacencyMult,
    // buildingYieldMult, housing/amenity conditionals, yieldMult,
    // encampHarborProdMult, tilePurchaseMult) are TS-only — no adopted government
    // or slotted card in the scripted 100-turn gate uses a LIVE instance of one
    // (verified: seat 0 slots VETERANCY[inert]+URBAN_PLANNING, opponents adopt
    // AUTOCRACY and slot the same), so they stay inert here.
    governments: Object.values(GOVERNMENTS).map((g) => ({
      id: g.id,
      tier: g.tier,
      unlockCivic: civicList.findIndex((c) =>
        c.effects.some((e) => e.kind === 'unlockGovernment' && e.government === g.id),
      ),
      slots: [
        g.slots.filter((s) => s === 'military').length,
        g.slots.filter((s) => s === 'economic').length,
        g.slots.filter((s) => s === 'diplomatic').length,
        g.slots.filter((s) => s === 'wildcard').length,
      ],
      cityYields: YIELD_KEYS.map((k) => g.effects.cityYields?.[k] ?? 0),
      capitalYields: YIELD_KEYS.map((k) => g.effects.capitalYields?.[k] ?? 0),
      // The full channel matrix: off-script research paths can adopt ANY
      // government (the Merchant-Republic catch), so every effect channel a
      // government or WIRED card carries is reachable and must export.
      housingAll: g.effects.housingAll ?? 0,
      amenitiesAll: g.effects.amenitiesAll ?? 0,
      yieldMult: YIELD_KEYS.map((k) => g.effects.yieldMult?.[k] ?? 1),
      adjacencyMult: PLACEABLE_DISTRICTS.map((d) => g.effects.adjacencyMult?.[d] ?? 1),
      buildingYieldMult: PLACEABLE_DISTRICTS.map((d) => g.effects.buildingYieldMult?.[d] ?? 1),
      tilePurchaseMult: g.effects.tilePurchaseMult ?? 1,
      encampHarborProdMult: g.effects.encampHarborProdMult ?? 1, // VETERANCY: Encampment + Harbor items
      housingIfDistricts: g.effects.housingIfDistricts ? [g.effects.housingIfDistricts.min, g.effects.housingIfDistricts.housing] : [-1, 0],
      amenitiesIfSpecialty: g.effects.amenitiesIfSpecialty ? [g.effects.amenitiesIfSpecialty.min, g.effects.amenitiesIfSpecialty.amenities] : [-1, 0],
      newDeal: g.effects.newDeal ? [g.effects.newDeal.min, g.effects.newDeal.housing, g.effects.newDeal.amenities] : [-1, 0, 0],
    })),
    policies: Object.values(POLICIES).map((p) => ({
      id: p.id,
      kind: SLOT_KIND_IDX[p.kind],
      unlockCivic: civicList.findIndex((c) =>
        c.effects.some((e) => e.kind === 'unlockPolicy' && e.policy === p.id),
      ),
      cityYields: YIELD_KEYS.map((k) => p.effects.cityYields?.[k] ?? 0),
      capitalYields: YIELD_KEYS.map((k) => p.effects.capitalYields?.[k] ?? 0),
      housingAll: p.effects.housingAll ?? 0,
      amenitiesAll: p.effects.amenitiesAll ?? 0,
      yieldMult: YIELD_KEYS.map((k) => p.effects.yieldMult?.[k] ?? 1),
      adjacencyMult: PLACEABLE_DISTRICTS.map((d) => p.effects.adjacencyMult?.[d] ?? 1),
      buildingYieldMult: PLACEABLE_DISTRICTS.map((d) => p.effects.buildingYieldMult?.[d] ?? 1),
      tilePurchaseMult: p.effects.tilePurchaseMult ?? 1,
      encampHarborProdMult: p.effects.encampHarborProdMult ?? 1, // VETERANCY: Encampment + Harbor items
      housingIfDistricts: p.effects.housingIfDistricts ? [p.effects.housingIfDistricts.min, p.effects.housingIfDistricts.housing] : [-1, 0],
      amenitiesIfSpecialty: p.effects.amenitiesIfSpecialty ? [p.effects.amenitiesIfSpecialty.min, p.effects.amenitiesIfSpecialty.amenities] : [-1, 0],
      newDeal: p.effects.newDeal ? [p.effects.newDeal.min, p.effects.newDeal.housing, p.effects.newDeal.amenities] : [-1, 0, 0],
    })),
  };
  return rules;
}

