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
import { IMPROVEMENTS, SEASIDE_RESORT_MIN_APPEAL } from '../data/improvements'; // B-27 (#71)
import type { ImprovementId } from '../core/types';
import { GENERAL_AURA_CS, GENERAL_AURA_RANGE, BARB_SCOUT_OPENER_LIVE } from '../core/combat';
import { GENERAL_AURA_MP } from '../core/aura'; // #70/S3 (B-8)
import { CITY_STATE_TYPES, ENVOY_COST, INFLUENCE_PER_TURN, CS_CAPITAL_BONUS, QUEST_COOLDOWN, QUEST_ENVOYS, CS_TYPE_YIELD, CS_TYPE_DISTRICT, CS_TYPE_BUILDINGS, CS_DISTRICT_BONUS, CS_SUZERAIN_YIELD, CS_MAX_HP, CS_MEET_RANGE, LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import { GP_CLASSES, GREAT_PEOPLE, gpCost, GP_CLASS_DISTRICT, GW_BUILDINGS, GW_SLOTS, GW_WONDER_SLOTS, GW_WORKS_PER_PERSON, GW_CULTURE, GW_TOURISM, GW_PRINTING_TECH, GW_PRINTING_WRITING_MULT, RELIC_BUILDING, RELIC_SLOTS_PER_BUILDING, RELIC_FAITH, RELIC_TOURISM, ARTIFACT_BUILDING, ARTIFACT_SLOTS, ARTIFACT_CULTURE, ARTIFACT_TOURISM, SPECIALIST_YIELDS } from '../data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, PANTHEON_FAITH_COST, RELIGION_PRESSURE_RANGE, JUST_WAR_RANGE, B18_FOLLOWER_COUPLING_LIVE, WORSHIP_BUILDINGS, SPREAD_PRESSURE, MISSIONARY_CAP, APOSTLE_CAP, CITY_RELIGION_ADDER_LIVE, THEO_DAMAGE, THEO_BASE_DAMAGE, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE, type BeliefEffects } from '../data/religion';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION, gpClassesOf, gppFractionOf } from '../data/projects';
import { BUILT_WONDERS } from '../data/builtWonders';
import { TRADE_ROUTE_RANGE, CS_ROUTE_GOLD, CS_ROUTE_SPEC, INTL_ROUTE_GOLD, TRADE_ROUTE_DURATION } from '../core/trade';
import { SUZERAIN_ENVOYS } from '../data/cityStates';
import { MAX_CITIES_PER_SEAT, WAR_MIN_TURNS, LOYALTY_MAX, LOYALTY_RANGE, LOYALTY_PRESSURE_SCALE, LOYALTY_AMENITY, PEACE_GOLD_COST, TECH_PROD_DIV, CITY_DEF_PER_TECH, WW_ERA_BASE_FORMAL, WW_ERA_BASE_SURPRISE, WW_ABROAD_MULT, WW_DEATH_MULT, WW_DECAY_AT_WAR, WW_DECAY_AT_PEACE, WW_PEACE_TREATY, WAR_WEARINESS_PER_AMENITY, DOW_PROXIMITY, DOW_STRENGTH_RATIO, DOW_WW_MAX, PEACE_WW, FORMAL_WAR_MIN_TURNS, ERA_LENGTH, ERA_SCORE_FOUND, ERA_SCORE_CONQUER, ERA_SCORE_WONDER, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, ERA_SCORE_GP, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES, GOVERNOR_LOYALTY, HEROIC_DEDICATIONS, ADMIRAL_MARCH_LIVE, DEDICATION_FAITH, GOLDEN_MOVE_BONUS, DEDICATION_ERA_SCORE, DEDICATION_PAYOUTS_LIVE, ALLY_MIN_PEACE, WARMONGER_DOW, WARMONGER_CAPTURE, WARMONGER_GANG, DIPLO_FAVOR_PER_SUZERAIN, CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION, DED_EVENT_SCORE, DIPLO_VICTORY_POINTS, TOURISM_PER_VISITOR_PER_CIV, CULTURE_PER_DOMESTIC_TOURIST, ENGINEER_LIVE, DED_MONUMENTALITY, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS } from '../data/seats';
import { WONDER_TOURISM_BASE } from '../core/city';
import { BALANCED_WEIGHTS } from '../core/score';
import { unitActionNames } from '../core/unitActions';
import { MAX_BARB_PER_CAMP } from '../core/combat';
import { UNITS, UNIT_HP, CITY_MAX_HP, WALLS_HP, ENCAMPMENT_HP } from '../data/units';
import { YIELD_KEYS } from '../core/types';
import { BUILDINGS } from '../data/buildings';
import { DISTRICTS, PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS, type AdjacencySource } from '../data/districts';
import { TECHS, ERAS, MODERN_ERA_INDEX } from '../data/techs'; // B-20 (#71): era scale
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, GOVERNMENTS_ADOPTION_LIVE, type SlotKind } from '../data/policies';
import { BOOSTS, BOOST_FRACTION } from '../data/boosts';
import { CITY_WORK_RADIUS, CITIZEN_SCIENCE, CITIZEN_CULTURE, FOOD_PER_CITIZEN, CITY_CENTER_MIN_FOOD, CITY_CENTER_MIN_PRODUCTION, HOUSING_FRESH_WATER, HOUSING_COASTAL, HOUSING_NO_WATER, AQUEDUCT_FRESH_BONUS, AQUEDUCT_NO_FRESH_TOTAL, GOLD_PURCHASE_MULT, LUXURY_AMENITY_CITIES, GAME_SPEED, REGIONAL_RANGE, EMBARK_MOVES, EMBARKED_DEFENSE_CS, embarkState } from '../data/constants';

// The GPU improvement index space (tile.improvement values, build codes 13-15).
// AUDIT A-13: the roster grew — indices 0-2 stay stable (every existing
// plane/consumer keys on them); the resource-only improvements append.
// FISHING_BOATS stays OUT: water-only, and a land builder can never stand
// on the tile (unreachable in both engines).
// B-27 (#71): SEASIDE_RESORT appended LAST — this array's order IS the GPU's
// improvement index, so anything but an append renumbers every other row.
import { IMPROVEMENT_IDS } from '../core/unitActions'; // #93: ONE roster, core-owned (order is the column index; FORT appended LAST)

 
import { techList, civicList, techIdx, civicIdx, centerBuildings, buildingIdx, buildingUnlockTech, buildingUnlockCivic, FEAT_IDS, RESOURCE_IDS, BUILT_WONDER_LIST } from './catalog';

/** The REAL settler rule now (#71): a 1-pop city may not train or buy one.
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
  fpw: def.effects.faithPerWonder ?? 0,  // A-4 activates this (Divine Inspiration)
  // B6-S1 enhancer channels (zeros on non-enhancer rows):
  presR: def.effects.pressureRangeBonus ?? 0,  // Itinerant Preachers
  tradeRel: YIELD_KEYS.map((k) => def.effects.tradeReligionYields?.[k] ?? 0),  // Messenger of the Gods [6]
  cnear: def.effects.combatNearFollowing ?? 0,  // Just War (within justWarRange, unit-vs-unit)
  cdef: def.effects.combatDefendFollowing ?? 0,  // Defender of the Faith
  cvs: def.effects.combatVsUnitInFollowing ?? 0,  // Crusade
  // B6-S2 missionary channels — pre-rounded INTEGERS so both engines read the
  // identical value (the GPU indexes these by r_enhancer + a base-value pad):
  mchg: def.effects.missionaryChargeBonus ?? 0,  // Scripture +1 charge
  mlump: Math.round(SPREAD_PRESSURE * (def.effects.spreadPressureMult ?? 1)),  // Scripture 15, base 10
  mcost: Math.round((UNITS.MISSIONARY?.cost ?? 0) * (def.effects.missionaryCostMult ?? 1)),  // Holy Order 42, base 60
  // A-13 activates improvementYields (omitted while the targets were
  // unbuildable): extra yields per improvement instance, [nImp, 6] in
  // IMPROVEMENT_IDS order. The FISHING_BOATS row (God of the Sea) simply
  // never exports — out of roster — so that belief stays inert, as in TS
  // scope (the improvement is unreachable in both engines).
  impY: IMPROVEMENT_IDS.map((id) => YIELD_KEYS.map((k) => def.effects.improvementYields?.[id]?.[k] ?? 0)),
  // improvements on a resource of a category (God of Craftsmen): rows by
  // category code 0 none / 1 bonus / 2 strategic / 3 luxury — the same
  // codes as the tile `res` priority plane. NOT unreachable: IRON/NITER/
  // COAL's own improvement is MINE, so strategic mines exist today (the
  // A-7 hunt's catch — rng 2026006082 t127, two worked strategic mines).
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


// Boost conditions the covered scope can actually trigger. Still skipped
// (structurally unreachable for BOTH engines, so parity holds):
// FISHING_BOATS improvement rows (out of roster, water-unreachable).
// B9-R1: distinctTypes district rows export now (see the district branch).
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
    // Improvement eurekas for every improvement in the grown roster (A-13
    // gate-catch, seed 9066 t57 rTechProg1: civ seat 1's first QUARRY at t48
    // fired MASONRY's eureka in TS only — the old FARM/MINE/LUMBER
    // hardcode left quarry/pasture rows unexported, so the GPU's research
    // stream forked on the boosted cost). MASONRY (quarry) and
    // HORSEBACK_RIDING (pasture) are live now; CELESTIAL_NAVIGATION
    // (FISHING_BOATS) stays out — the improvement is out of roster,
    // water-unreachable in both engines.
    const imp = IMPROVEMENT_IDS.indexOf(c.id);
    if (imp >= 0) row = { kind: 'improvement', imp, count: c.count, onResource: c.onResource ? 1 : 0 };
  } else if (c.kind === 'anyWonderBuilt') {
    // A-4: civ-seat wonders make this REACHABLE (it was filtered as
    // structurally-unreachable before) — both civs' detection reads the
    // same global builtWonderComplete scan.
    row = { kind: 'anyWonderBuilt' };
  } else if (c.kind === 'district') {
    // District eurekas/inspirations (STATE_WORKFORCE: any specialty district;
    // MATHEMATICS: 3; per-type ones). B9-R1: distinctTypes conditions
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
    // B-13 (Slice V): the "run N policy cards" inspiration (MEDIEVAL_FAIRES,
    // count 4). Dormant until the new-card unlockPolicy wiring let the scripted
    // seat 0 fill 4+ slots in-gate; the GPU counts SEAT 0's slotted-policy
    // mask (`_gov_policy_mods`). Seat-0 only: the civ-seat boost detector has
    // no arm for this kind (civ governments carry no slotted-policy count).
    row = { kind: 'policies', count: c.count };
  }
  if (row) boostRows.push({ target, idx, ...row });
}


// Adjacency-source order shared with the engine (indices into this list are
// what `districts[].adjacency[].src` refers to). Static sources (known at t=0)
// come first conceptually but the order here is just the stable wire encoding.
const ADJ_SRC: AdjacencySource[] = [
  'MOUNTAIN', 'RAINFOREST', 'WOODS', 'REEF', 'NATURAL_WONDER', 'BUILT_WONDER',
  'RIVER', 'DISTRICT', 'CITY_CENTER', 'HARBOR_DISTRICT', 'SEA_RESOURCE',
  // B-16 (GS Industrial Zone): dynamic improvement/district sources, indices 11-13.
  'MINE', 'QUARRY', 'AQUEDUCT',
];

// Terrain-permanent adjacency sources (known at t=0). The dynamic ones
// (adjacent district/center/harbor/mine, built wonder) are added live by the
// engine before the floor.
// D2b-activate off-switch: the scripted Campus placement + its parity are
// correct for maintenance/adjacency/eurekas, but building a district flips the
// city-state buildDistrict quest's `!already` check, which changes the quest
// RNG stream (envoy/quest cascade). Kept OFF until that CS-quest interaction is
// mirrored (D2b-activate round 2). Flip to true to re-activate; the engine
// reads the same flag via districtScaffold.active.
const SCRIPTED_CAMPUS = true;

// Districts the scripted policy places, in order (each once, when its unlock
// tech is in and the per-pop specialty cap allows). The engine mirrors this.
// placement 'aqueduct' = the non-specialty housing district (adjacent to the
// city center + a river/lake/oasis/mountain; no adjacency yield → lowest tile).
// SCAFFOLD_DISTRICTS moved to data/districts.ts (C1-B4: the civ-seat picker
// shares it). ENCAMPMENT stays held out — see the note there.
const PLACEMENT_CODE = { aqueduct: 1, coastal: 2, encampment: 3 } as const;

// A-7r: policy/government slot-kind wire encoding.
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
    regionalRange: REGIONAL_RANGE, // B9-R2: regional-building reach (hex distance, city centers)
    boostFraction: BOOST_FRACTION,
    // amenityTier(balance) thresholds, highest first (see data/constants.ts).
    // P4/D-12: real Civ 6 bands — Content exactly 0, Displeased -1..-2.
    amenityTiers: [
      { min: 3, growth: 1.2, yield: 1.1 },
      { min: 1, growth: 1.1, yield: 1.05 },
      { min: 0, growth: 1.0, yield: 1.0 },
      { min: -2, growth: 0.85, yield: 0.95 },
      { min: -999, growth: 0.7, yield: 0.9 },
    ],
    // Mirrors settlerCost(0): 80 + 30 × (cities − 1 + settlers banked + settlers queued).
    // goldPurchaseMult mirrors GOLD_PURCHASE_MULT (V-P1: buy = production cost × 4).
    // P4/D-10: builderBase/builderPer/gameSpeed mirror builderCost() —
    // round((50 + 4·n) × GAME_SPEED), n = builders ever trained + queued.
    // P4/D-15: settler 80/30 speed-scales like unit costs (mirrors settlerCost).
    scenario: { settlerBase: Math.round(80 * GAME_SPEED), settlerPerCity: Math.round(30 * GAME_SPEED), settlerPopGate: SETTLER_POP_GATE, goldPurchaseMult: GOLD_PURCHASE_MULT, turnLimit: TURN_LIMIT, builderBase: 50, builderPer: 4, gameSpeed: GAME_SPEED },
      // #51/S0.3: the UNIT ACTION enum (index = position). Both engines dispatch by
    // NAME off this list instead of hardcoded column numbers — the collision that
    // bound PILLAGE to the FORT column and left the real pillage column dead.
    actions: { unit: unitActionNames(IMPROVEMENT_IDS) },
    // Mirrors districtCostIn() — opponents pay it from THEIR research counts
    // (C1-B4). P4/D-8: floor(base·(1+scale·max(tech%, civic%)));
    // P4/D-15: the 54 base speed-scales like every production cost.
    districtCost: { base: Math.round(54 * GAME_SPEED), scale: 9 },
    // Mirrors empireScore(state, 'balanced'): Σ cities (pop × popWeight + yields · weights).
    score: { popWeight: 3, yieldWeights: YIELD_KEYS.map((k) => BALANCED_WEIGHTS[k] ?? 0) },
    // SHIPYARD special (yields.ts:171): a city with this building adds its completed Harbor's
    // districtAdjacency as PRODUCTION. Index into the exported building roster, -1 if absent.
    shipyardBidx: buildingIdx.get('SHIPYARD') ?? -1,
    // AUDIT B-1: the ANCIENT_WALLS building row — the engine watches its
    // completion to fill the outer-defense pool, and B-2's city ranged strike
    // fires only from cities holding it. -1 if absent from the exported set.
    ancientWallsBidx: buildingIdx.get('ANCIENT_WALLS') ?? -1,
    // B9-R3: worship faith-buy anchors — the 5 worship rows in WORSHIP_BUILDINGS
    // order (the deterministic pick indexes THIS list by religion id % 5, not
    // the cost-sorted table), the Temple prerequisite row, and the flat
    // buildingFaithCost for worship (game.ts:443).
    worshipBidx: WORSHIP_BUILDINGS.map((id) => buildingIdx.get(id) ?? -1),
    templeBidx: buildingIdx.get('TEMPLE') ?? -1,
    worshipFaithCost: Math.round(190 * GAME_SPEED),
    // B6-S2: the missionary buy's Shrine gate (phase.ts missionary branch).
    shrineBidx: buildingIdx.get('SHRINE') ?? -1,
    // AUDIT A-11: civ-seat trade — id-anchored capacity sources + route constants
    // (the tradeCapacity/routeYields mirror; no CS term until A-12).
    trade: {
      marketBidx: buildingIdx.get('MARKET') ?? -1,
      lighthouseBidx: buildingIdx.get('LIGHTHOUSE') ?? -1,
      foreignTradeCidx: civicIdx.get('FOREIGN_TRADE') ?? -3,
      capWonderWidx: ['COLOSSUS', 'GREAT_ZIMBABWE']
        .map((id) => BUILT_WONDER_LIST.findIndex((w) => w.id === id))
        .filter((i) => i >= 0),
      range: TRADE_ROUTE_RANGE,
      // A-12b: civ-seat CS-route income constants (csRouteYields mirror).
      csRouteGold: CS_ROUTE_GOLD,
      csRouteSpec: CS_ROUTE_SPEC,
      // B-23: international-route gold base (routeYieldsInternational: +intlGold
      // +1 gold per destination completed specialty district) + route duration.
      intlGold: INTL_ROUTE_GOLD,
      duration: TRADE_ROUTE_DURATION,
    },
    // B-15 war weariness (mirrors data/opponents.ts): integer accumulator → flat
    // empire-wide amenity penalty for seat 0 AND each civ seat.
    warWeariness: {
      // #51/S7.8f: the per-BATTLE model. `perTurn`/`cap` are gone — there is no
      // per-turn accrual and no ceiling.
      eraFormal: [...WW_ERA_BASE_FORMAL],
      eraSurprise: [...WW_ERA_BASE_SURPRISE],
      abroad: WW_ABROAD_MULT,
      death: WW_DEATH_MULT,
      decayAtWar: WW_DECAY_AT_WAR,
      decayAtPeace: WW_DECAY_AT_PEACE,
      peaceTreaty: WW_PEACE_TREATY,
      perAmenity: WAR_WEARINESS_PER_AMENITY,
      // B-22 (S3): casus-belli accrual multipliers (SURPRISE ×2, FORMAL ×1).
    },
    // B-24 (task #68): era score / Ages (mirrors data/opponents.ts; S1 = the
    // accumulator constants; age thresholds + governor constants land S2/S3).
    eras: {
      length: ERA_LENGTH,
      found: ERA_SCORE_FOUND,
      conquer: ERA_SCORE_CONQUER,
      wonder: ERA_SCORE_WONDER,
      pantheon: ERA_SCORE_PANTHEON,
      religion: ERA_SCORE_RELIGION,
      gp: ERA_SCORE_GP,
      // S2: age thresholds (S1-evidence-pinned) + the source-civ pressure factors.
      darkT: ERA_DARK_T,
      goldenT: ERA_GOLDEN_T,
      agePressure: AGE_PRESSURE,
      // S3: governors — stateless greedy loyalty anchors.
      govCivicsPerTitle: GOV_CIVICS_PER_TITLE,
      govMaxTitles: GOV_MAX_TITLES,
      allyMinPeace: ALLY_MIN_PEACE, warmongerDow: WARMONGER_DOW, warmongerCapture: WARMONGER_CAPTURE, warmongerGang: WARMONGER_GANG, diplomaticFavorPerSuzerain: DIPLO_FAVOR_PER_SUZERAIN, congressInterval: CONGRESS_INTERVAL, congressMinEra: CONGRESS_MIN_ERA, dvpPerResolution: DVP_PER_RESOLUTION, diploVictoryPoints: DIPLO_VICTORY_POINTS, dedicationPayoutsLive: DEDICATION_PAYOUTS_LIVE, dedMonumentality: DED_MONUMENTALITY, dedFreeInquiry: DED_FREE_INQUIRY, dedPenBrush: DED_PEN_BRUSH_AND_VOICE, dedExodus: DED_EXODUS, heroicDedications: HEROIC_DEDICATIONS, dedEventScore: [...DED_EVENT_SCORE], dedicationFaith: DEDICATION_FAITH, goldenMoveBonus: GOLDEN_MOVE_BONUS, dedicationEraScore: DEDICATION_ERA_SCORE, governorLoyalty: GOVERNOR_LOYALTY,
    },
    boosts: boostRows,
    // City-state rules (mirrors data/cityStates.ts; covered scope only — the
    // 3/6-envoy district tiers are inert without districts, and the CHIEFDOM
    // influence tier is 0, so influence accrues at the flat base rate).
    cs: {
      envoyCost: ENVOY_COST,
      influencePerTurn: INFLUENCE_PER_TURN,
      capitalBonus: CS_CAPITAL_BONUS,
      meetRange: CS_MEET_RANGE, // A-12: civ-seat proximity-meet radius
      questCooldown: QUEST_COOLDOWN,
      questEnvoys: QUEST_ENVOYS,
      // V-CS: attackCityState/captureCityState (siege hp + the militaristic +6)
      maxHp: CS_MAX_HP,
      militaristicIdx: CITY_STATE_TYPES.indexOf('militaristic'),
      tradeIdx: CITY_STATE_TYPES.indexOf('trade'), // A-12b: suzerain trade capacity
      suzerainEnvoys: SUZERAIN_ENVOYS, // A-12b: the strict-contest minimum
      // per CS type (by index): which yield column its envoys boost
      typeYieldIdx: CITY_STATE_TYPES.map((t) => YIELD_KEYS.indexOf(CS_TYPE_YIELD[t])),
      // per CS type: the district whose count carries the 3-/6-envoy bonus, and
      // the per-district amount (csEnvoyBonuses: +CS_DISTRICT_BONUS at >=3, again
      // at >=6, added to each owned completed district of that type).
      typeDistrictIdx: CITY_STATE_TYPES.map((t) => PLACEABLE_DISTRICTS.indexOf(CS_TYPE_DISTRICT[t])),
      districtBonus: CS_DISTRICT_BONUS,
      // B-21: the 3/6-envoy bonus now lands on the type's tier-1 (>=3) and
      // tier-2 (>=6) BUILDING (CS_TYPE_BUILDINGS[t][0]/[1]) — the catalog index
      // into centerBuildings, -1 if the building is absent from the roster.
      // Regional tier-2 buildings (FACTORY/POWER_PLANT) are excluded by the
      // building-yield loop in BOTH engines (parity-safe; industrial 6-tier inert).
      typeB1Idx: CITY_STATE_TYPES.map((t) => buildingIdx.get(CS_TYPE_BUILDINGS[t][0]) ?? -1),
      typeB2Idx: CITY_STATE_TYPES.map((t) => buildingIdx.get(CS_TYPE_BUILDINGS[t][1]) ?? -1),
      // B-21: the suzerain's per-CS unique perk — a flat capital yield of this
      // amount in the CS's live channel (CS_SUZERAIN_LIVE). The channel is
      // shipped per-CS-instance on csAtStart (name-keyed), -1 = descoped.
      suzerainYield: CS_SUZERAIN_YIELD,
      // A-12 (B8-L): CIV-SEAT levy — a militaristic CS's suzerain (a civ seat) at war
      // spawns levyUnits units at levyGoldCost off its treasury, levyCooldown
      // per CS shared across seats. (Seat-0 levy is UI-only, absent from the
      // scripted reference, so the GPU only mirrors the civ-seat path.)
      levyUnits: LEVY_UNITS,
      levyGoldCost: LEVY_GOLD_COST,
      levyCooldown: LEVY_COOLDOWN,
    },
    // Civ-seat pacing (mirrors data/opponents.ts). loyaltyAmenity is keyed by
    // amenity-tier INDEX in the same order as amenityTiers above. The
    // pantheon/belief pools matter only as SIZES: a civ seat's pick consumes a
    // draw and shrinks the pool, but the identity is inert in covered scope.
    seats: {
      maxCities: MAX_CITIES_PER_SEAT,
      settlerBase: Math.round(80 * GAME_SPEED), // P5/S3: SETTLER_COST(c) = seat 0's 48 + 18·max(0, c − 1)
      settlerPer: Math.round(30 * GAME_SPEED),
      // (P5/S4: borderPeriod died — civ-seat borders grow on culture.)
      // P5/S5: the timed claims died — the pantheon costs faith, religion
      // gates on pantheon + Holy Site + an earned PROPHET-class person.
      pantheonFaithCost: PANTHEON_FAITH_COST,
      prophetCls: GP_CLASSES.indexOf('PROPHET'),
      // B-20 (Round B7): Great Works. WRITER/MUSICIAN class indices, the building
      // columns (b_cost catalog order) that hold writing/music works, the slots
      // per building, the works per person and the per-work culture yield BY KIND
      // (#70/S1: writing 2, music 4 — the real GS values; NO Great Work pays
      // gold, and tourism is unmodeled). The GPU slots works into these building
      // columns and adds the matching culture at the buildings-bucket position.
      // #73: the three slotted Great Work kinds, in kind order
      // (0 WRITING / 1 ART / 2 MUSIC) — the REAL Civ 6 mapping:
      // Amphitheater 2 slots, Art Museum 3, Broadcast Center 1.
      gwClsByKind: [GP_CLASSES.indexOf('WRITER'), GP_CLASSES.indexOf('ARTIST'), GP_CLASSES.indexOf('MUSICIAN')],
      gwBidxByKind: GW_BUILDINGS.map((b) => buildingIdx.get(b) ?? -1),
      gwSlotsByKind: [...GW_SLOTS],
      gwWorksByKind: [...GW_WORKS_PER_PERSON],
      gwCultureByKind: [...GW_CULTURE],
      gwTourismByKind: [...GW_TOURISM], // B-20 (#71): tourism per Great Work
      // B-20 (#74): PRINTING doubles Great Work of WRITING tourism (real Civ 6 —
      // the tourism, not the slot count). Index into the exported tech list.
      gwPrintingTech: techIdx.get(GW_PRINTING_TECH) ?? -1,
      gwPrintingWritingMult: GW_PRINTING_WRITING_MULT,
      // B-20 (#73): RELICS — held in a TEMPLE's single slot, paying 4 faith and
      // 8 tourism each (GS values). Created when an APOSTLE dies in theological
      // combat; see the RELIC_* comment in cpu/data/greatPeople.ts for the
      // Martyr-promotion deviation and the reachability measurement.
      // B-20 (#79): artifacts — the relic plumbing's twin.
      artifactBidx: buildingIdx.get(ARTIFACT_BUILDING) ?? -1,
      artifactSlots: ARTIFACT_SLOTS,
      artifactCulture: ARTIFACT_CULTURE,
      artifactTourism: ARTIFACT_TOURISM,
      modernEraIndex: MODERN_ERA_INDEX,
      relicBidx: buildingIdx.get(RELIC_BUILDING) ?? -1,
      relicSlots: RELIC_SLOTS_PER_BUILDING,
      relicFaith: RELIC_FAITH,
      relicTourism: RELIC_TOURISM,
      // B-20 (#71): WONDER tourism = base + 1 per era advanced PAST the wonder's
      // own era. Wonder era = the era of its unlock (tech or civic); a civ's era
      // = the highest era among its completed techs/civics — the SAME scale.
      wonderTourismBase: WONDER_TOURISM_BASE,
      // B-25 (#72): the CULTURE VICTORY thresholds (GS values — see the
      // constants' comment in cpu/data/opponents.ts for the source).
      tourismPerVisitorPerCiv: TOURISM_PER_VISITOR_PER_CIV,
      culturePerDomesticTourist: CULTURE_PER_DOMESTIC_TOURIST,
      techEra: techList.map((t) => Math.max(0, ERAS.indexOf(t.era))),
      civicEra: civicList.map((c) => Math.max(0, ERAS.indexOf(c.era))),
      warMinTurns: WAR_MIN_TURNS,
      // A-19/B-33 (S2): pairwise civ-seat↔civ-seat DoW/peace gates (zero-draw).
      dowProximity: DOW_PROXIMITY,
      dowStrengthRatio: DOW_STRENGTH_RATIO,
      dowWwMax: DOW_WW_MAX,
      peaceWw: PEACE_WW,
      formalWarMinTurns: FORMAL_WAR_MIN_TURNS, // B-22 (S3)
      // Diplomacy (V-W1): sueForPeace gates on warTurns >= warMinTurns — ONE
      // and costs PEACE_GOLD_COST(warTurns) — exported as its linear params.
      // C1-B3b: research consumers — the production divisor, defense per
      // tech, and the real unit-type gates.
      research: {
        prodDiv: TECH_PROD_DIV,
        defPerTech: CITY_DEF_PER_TECH,
        spearTech: techIdx.get('BRONZE_WORKING') ?? -1,
        horseTech: techIdx.get('HORSEBACK_RIDING') ?? -1,
        // AUDIT A-6: the ranged rung — SLINGER is ungated, ARCHER needs this.
        archerTech: techIdx.get('ARCHERY') ?? -1,
      },
      // C1-B5b: civ-seat builder gates — improvement unlock indices in the tech
      // table (FARM is baseline; hillFarms rides the civic the engine already
      // indexes) and the balanced-weight gain per option for the Δ-tileScore
      // pick (flat catalog yields ⇒ the Δ is a constant per improvement).
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
      // Seat-0 great-people (advanceGreatPeople): per class, the PLACEABLE_DISTRICTS
      // idx that accrues its points, and each person's instant effect
      // [science→tech, culture→civic, gold→treasury, production→capital]. Seat 0
      // draws from the SAME gp_earned pool the civ-seat race consumes (opponents claim in
      // seatPhase first, then seat 0), so only classDistrict + effects are new.
      gpClassDistrict: GP_CLASSES.map((c) => PLACEABLE_DISTRICTS.indexOf(GP_CLASS_DISTRICT[c])),
      gpEffects: GP_CLASSES.map((c) =>
        // P5/S5: col 4 = faith (Prophets) — the civ-seat pantheon's funding;
        // seat 0's GPU faith stays unmodeled (no consumer — worship is TS-only).
        GREAT_PEOPLE[c].map((p) => [p.effect.science ?? 0, p.effect.culture ?? 0, p.effect.gold ?? 0, p.effect.productionToCapital ?? 0, p.effect.faith ?? 0]),
      ),
      // B7-G (B-8): Great General / Great Admiral spawn-at-claim + aura anchors.
      // classIdx = the GP_CLASSES index whose claim spawns the unit; unitIdx =
      // the roster (UNITS) index of the spawned combat-0 civilian (-1 = absent).
      generalClassIdx: GP_CLASSES.indexOf('GENERAL'),
      admiralClassIdx: GP_CLASSES.indexOf('ADMIRAL'),
      generalUnitIdx: Object.values(UNITS).findIndex((u) => u.id === 'GENERAL'),
      admiralUnitIdx: Object.values(UNITS).findIndex((u) => u.id === 'ADMIRAL'),
      generalAuraCs: GENERAL_AURA_CS,
      generalAuraRange: GENERAL_AURA_RANGE,
      generalAuraMp: GENERAL_AURA_MP,
      admiralMarchLive: ADMIRAL_MARCH_LIVE, // B-8 (#71): inert pending its hunt // #70/S3 (B-8): the aura's movement half
      pantheonPool: Object.keys(PANTHEONS).length,
      followerPool: Object.keys(FOLLOWER_BELIEFS).length,
      founderPool: Object.keys(FOUNDER_BELIEFS).length,
      // B-18: Enhancer pool size. The GPU does not yet race enhancers (civ-seat
      // enhancer claiming + the mirrored draw are a deferred follow-up); this
      // documents the slot for that work.
      enhancerPool: Object.keys(ENHANCER_BELIEFS).length,
      // B-18: religious pressure spread radius (holy city -> cities within N tiles).
      pressureRange: RELIGION_PRESSURE_RANGE,
      // B6-S1: Just War's "near a following city" radius (unit-vs-unit combat).
      justWarRange: JUST_WAR_RANGE,
      // B-18 (slice U): pressure->yields coupling master switch. When true a
      // city's FOLLOWER-belief yields key on its followedReligion; when false the
      // owner civ's religion (byte-identical to the pre-coupling per-civ apply).
      followerCoupling: B18_FOLLOWER_COUPLING_LIVE,
    },
    // AUDIT A-7: dense belief-effect tables — identity-claimed pantheons/
    // beliefs now APPLY to civ seats. Row order = the data-file key order;
    // the claim draw picks the k-th OPEN id in this same order in both
    // engines. faithPerWonder shipped by A-4 (fpw); improvementYields shipped
    // by A-13 (impY) now that PASTURE/CAMP/QUARRY/PLANTATION are buildable —
    // only the FISHING_BOATS row stays out (water-unreachable in both
    // engines). improvementOnResource shipped since A-7 (impRes): mines on
    // IRON/NITER/COAL exist today.
    beliefs: {
      // B6-S2: the missionary chassis anchors (read via rules.beliefs, like the
      // enhancer rows). Base values double as the GPU pad row (unenhanced civ):
      // cost round(100·GAME_SPEED)=60 faith, lump SPREAD_PRESSURE=10, cap 2.
      missionaryIdx: Object.values(UNITS).findIndex((u) => u.id === 'MISSIONARY'),
      missionaryCost: UNITS.MISSIONARY.cost,
      spreadPressure: SPREAD_PRESSURE,
      missionaryCap: MISSIONARY_CAP,
      // B-18 (#71): the APOSTLE — faith-buy twin of the missionary, plus the
      // theological-combat constants. Religious strengths ride the roster.
      apostleIdx: Object.values(UNITS).findIndex((u) => u.id === 'APOSTLE'),
      apostleCost: UNITS.APOSTLE.cost,
      apostleCap: APOSTLE_CAP,
      relStrength: Object.values(UNITS).map((u) => u.religiousStrength ?? 0),
      cityReligionAdderLive: CITY_RELIGION_ADDER_LIVE, // #71 DEBT-2: inert pending its hunt
      theoDamage: THEO_DAMAGE,
      theoBaseDamage: THEO_BASE_DAMAGE,
      theoPressureSwing: THEO_PRESSURE_SWING,
      theoPressureRange: THEO_PRESSURE_RANGE,
      pantheons: Object.values(PANTHEONS).map(beliefRow),
      followers: Object.values(FOLLOWER_BELIEFS).map(beliefRow),
      founders: Object.values(FOUNDER_BELIEFS).map(beliefRow),
      // B-18: Enhancer effect rows (all inert this round). Exported so the
      // deferred GPU enhancer race has the table ready; the engine currently
      // builds only pan/fol/fou tables and ignores this key.
      enhancers: Object.values(ENHANCER_BELIEFS).map(beliefRow),
    },
    // AUDIT A-4: civ-seat wonders (data order). Static placement lives in the
    // per-tile `wok` bitmask below; LIVE terms (ownership, occupancy,
    // radius, non-bonus resource, adjacent completed district, adjacent
    // un-stripped resource, world uniqueness) are the engine's job.
    // extraWildcardSlot (Forbidden City) is skipped — no civ-seat government;
    // regionalAmenities (Colosseum) ships but its district is unplaceable
    // in scope. Costs are already speed-scaled in the data file.
    wonders: {
      // B-20 (#71): the era each wonder first became available (its unlock's
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
        // matching (the A-4 hunt's catch: Oracle's MYSTICISM exported -1 and
        // the GPU read that as unlocked, building wonders TS never could)
        ut: w.requiresTech ? techIdx.get(w.requiresTech) ?? -3 : -1,
        uc: w.requiresCivic ? civicIdx.get(w.requiresCivic) ?? -3 : -1,
        cy: YIELD_KEYS.map((k) => w.cityYields?.[k] ?? 0),
        growAll: w.effects?.growthAllMult ?? 1,
        petra: w.effects?.petraDesert ? 1 : 0,
        // AUDIT #78: Great Work slots this wonder grants, per kind
        // [writing, art, music] — additive with the GW_BUILDINGS slots.
        gwslots: GW_WONDER_SLOTS[w.id] ?? [0, 0, 0],
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
      })),
      fpFid: FEAT_IDS.indexOf('FLOODPLAINS'),
    },
    // AUDIT A-14: civ-seat projects (data order; d = PLACEABLE_DISTRICTS idx,
    // y = YIELD_KEYS idx or -1, g = GP_CLASSES idx or -1). Out-of-scaffold
    // districts export d=-1 and never fire — table-driven for A-9's future.
    projects: {
      // B-25 (Round B3, Slice W): the space-race chain now SHIPS to the GPU.
      // Every row carries sp (space flag) / vic (victory step) plus the tech
      // gate (rt = techs-table idx) and previous-step link (rp = projects-table
      // idx) so the GPU mirrors the sequence + the science victoryType 3/4.
      // Space rows sit LAST (chain order): the civ-seat greedy pick resolves to a
      // base project first, and the scripted seat 0 never queues projects, so
      // the chain is inert in-gate (gate-unreachable at 250t) — proven by the
      // parity gate + gpu/space_race_test.py.
      rows: Object.values(PROJECTS).map((p, _i, all) => ({
        d: PLACEABLE_DISTRICTS.indexOf(p.district),
        y: p.yield ? YIELD_KEYS.indexOf(p.yield) : -1,
        g: p.gpClass ? GP_CLASSES.indexOf(p.gpClass) : -1,
        // #79: the FULL class list + this project's own per-class rate. `g` stays
        // for index stability; the GPU reads `gs`/`gf` and falls back to `g`.
        gs: gpClassesOf(p).map((c) => GP_CLASSES.indexOf(c)),
        gf: gppFractionOf(p),
        sp: p.space ? 1 : 0,
        vic: p.victory ? 1 : 0,
        rt: p.requiresTech ? (techIdx.get(p.requiresTech) ?? -1) : -1,
        rp: p.requiresProject ? all.findIndex((q) => q.id === p.requiresProject) : -1,
      })),
      yieldFraction: PROJECT_YIELD_FRACTION,
      gppFraction: PROJECT_GPP_FRACTION,
    },
    // Barbarian rules (mirrors combat.ts). B-29: strengthDiff is now a multiple
    // of 0.1 (wounded units subtract hp/10, a river melee subtracts 5), so the
    // table is indexed by q = round(diff·10) at 0.1 granularity — entry i holds
    // 30·e^(0.04·(i−2000)/10), the EXACT expression damageRoll evaluates for
    // q = i−2000. Computed HERE so both engines share the same doubles: libm
    // exp() may differ by an ulp between runtimes, and damage rounds to integers.
    // B-4: widened from 1201 (±60) to 4001 (±200) — XP level bonuses (up to +15 CS)
    // can grow |diff| past ±60 where B-29's wounds/river only shrank it.
    combat: {
      unitHp: UNIT_HP,
      cityMaxHp: CITY_MAX_HP,
      maxBarbPerCamp: MAX_BARB_PER_CAMP,
      campSpawnChance: 0.08,
      garrisonGrowChance: 0.1,
      spearmanAfterTurn: 60,
      // AUDIT B-26 (ROUND B10): the shared barb MELEE era ladder thresholds
      // (WARRIOR → SPEARMAN t>60 → PIKEMAN t>120 → MUSKETMAN t>180). The GPU
      // reads these; the TS barbMeleeType hard-codes the same thresholds.
      pikemanAfterTurn: 120,
      musketmanAfterTurn: 180,
      // #70/S5 (B-26): the RANGED barb ladder threshold (barbRangedType —
      // ARCHER, then CROSSBOWMAN after turn 120). The GPU reads this; the TS
      // barbRangedType hard-codes the same number.
      crossbowmanAfterTurn: 120,
      cityHealPerTurn: 20,
      wallsHp: WALLS_HP, // AUDIT B-1: the ANCIENT_WALLS outer-defense pool cap
      encampHp: ENCAMPMENT_HP, // B-17 (#71): the ENCAMPMENT garrison pool cap
      unitHealPerTurn: 10,
      // #51/S3.2: the barb era ladder is now a list of ROSTER INDICES, not a
      // second index space. Ladder POSITION is structural in the engine —
      // 0/1/2/3 melee (WARRIOR/SPEARMAN/PIKEMAN/MUSKETMAN), 4/5 ranged
      // (ARCHER/CROSSBOWMAN), 6 SCOUT, 7/8 naval (GALLEY/QUADRIREME) — and each
      // entry says which roster unit that position IS. u_type is therefore a
      // roster index like p_type and v_type, so combat/moves/ranged/naval all
      // read the one roster table.
      //
      // This replaces unitCombat / unitMoves / unitRangedStrength /
      // unitRangedRange / unitNaval, five parallel arrays that restated roster
      // values under a different numbering. Appending a barb type is still an
      // append: the position is the index into THIS array.
      barbScoutOpenerLive: BARB_SCOUT_OPENER_LIVE, // B-26 (#71): inert pending its hunt
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
      ].map((id) => {
        const i = Object.keys(UNITS).indexOf(id);
        if (i < 0) throw new Error(`barbLadder: ${id} is not in the unit roster`);
        return i;
      }),
      barbNavalTypes: [7, 8], // ladder POSITIONS: GALLEY, then QUADRIREME past crossbowmanAfterTurn
      campClearReward: 50,
      dmgBase: Array.from({ length: 4001 }, (_, i) => 30 * Math.exp((0.04 * (i - 2000)) / 10)),
      // #45/B-6 EMBARK: flat embarked MP, the LIVE water-step master switch (N1
      // ships it INERT), and the embark/ocean tech gates (index into rules techs;
      // military embarks on SHIPBUILDING, civilians on SAILING, OCEAN needs
      // CARTOGRAPHY). The GPU mirrors these exactly.
      embarkMoves: EMBARK_MOVES,
      embarkedDefenseCs: EMBARKED_DEFENSE_CS, // #45/B-6: flat embarked-defender CS
      embarkLive: embarkState.live ? 1 : 0,
      sailingTech: techIdx.get('SAILING') ?? -1,
      shipbuildingTech: techIdx.get('SHIPBUILDING') ?? -1,
      cartographyTech: techIdx.get('CARTOGRAPHY') ?? -1,
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
      // B-20 (#79): the CIVIC gate (Archaeologist / Natural History) and the
      // ARTIFACT-slot rule, so the GPU can refuse what trainableUnits refuses.
      requiresCivic: u.requiresCivic ? civicIdx.get(u.requiresCivic) ?? -1 : -1,
      needsArtifactSlot: u.id === 'ARCHAEOLOGIST' ? 1 : 0,
      // AUDIT B-9: strategic-resource ACCESS gate — index into RESOURCE_IDS (the
      // same order the tile `rid` plane uses), or -1 = ungated. The GPU joins it
      // with the per-tile `rq`/res_imp plane to gate build+purchase per civ.
      requiresResource: u.requiresResource ? RESOURCE_IDS.indexOf(u.requiresResource) : -1,
      // V-R: ranged strike stats (Slinger 15/1, Archer 25/2); 0 = melee-only.
      rangedStrength: u.ranged?.strength ?? 0,
      rangedRange: u.ranged?.range ?? 0,
      // AUDIT A-8: full MP per turn — the civ-seat walkers' budget.
      moves: u.moves,
      // #45/B-6: NAVAL unit (lives on water, never embarks). All-false for the
      // current land-only roster — N2 adds GALLEY/QUADRIREME.
      naval: u.naval ? 1 : 0,
      // B6-S2: faith-purchase-only (MISSIONARY) — the trainableUnits filter's
      // mirror; masks the type out of the GPU purchase path.
      fo: u.faithOnly ? 1 : 0,
      // B7-G (B-8): spawn-only (GENERAL/ADMIRAL) — the trainableUnits filter's
      // mirror; masks the type out of production_mask AND the purchase path.
      so: u.spawnOnly ? 1 : 0,
      // #71: the SETTLER chassis — trains through the dedicated escalating
      // settler column only; masked out of the generic unit columns.
      settler: u.settler ? 1 : 0,
    })),
    // Tile improvements (6a: FARM; 6b: MINE, LUMBER_MILL). `ids` are the
    // engine's improvement index (0 = FARM, 1 = MINE, 2 = LUMBER_MILL); a
    // tile's improvement state is -1 = none. FARM is ungated (+1 food, +0.5
    // housing); the hill-farm sub-case needs the hillFarms civic. MINE (+1⚙,
    // MINING) and LUMBER_MILL (+1⚙, CONSTRUCTION) are tech-gated. A MINE is
    // also tech-BOOSTED: Apprenticeship and Industrialization each add +1⚙ to
    // every mine (improvementYields effects), so mineBoostTechs ships the
    // [techIdx, prodAmount] pairs the engine sums over researched techs.
    // builderIdx is BUILDER's roster position.
    improvements: {
      ids: IMPROVEMENT_IDS,
      // AUDIT A-13: the dense per-improvement catalog — base yields (6 cols),
      // housing, and the unlockImprovement tech index (-1 = baseline: FARM).
      // The legacy scalar keys below stay (engine defaults ride them).
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
      // C1-B1 gate catch: an improved luxury (its OWN improvement, e.g. a mine
      // on Diamonds) grants +1 amenity to this many neediest cities.
      luxAmenityCities: LUXURY_AMENITY_CITIES,
      farmFood: IMPROVEMENTS.FARM.yields.food ?? 1,
      farmHousing: IMPROVEMENTS.FARM.housing,
      mineProd: IMPROVEMENTS.MINE.yields.production ?? 1,
      lumberProd: IMPROVEMENTS.LUMBER_MILL.yields.production ?? 1,
      builderIdx: Object.values(UNITS).findIndex((u) => u.id === 'BUILDER'),
      // B-27 (#79): the Military Engineer's roster index + the border/war flag,
      // so the GPU can mirror hasFortJob / the engineer job set.
      engineerIdx: Object.values(UNITS).findIndex((u) => u.id === 'MILITARY_ENGINEER'),
      engineerLive: ENGINEER_LIVE,
      hillFarmsCivic: civicList.findIndex((c) => (c.effects ?? []).some((e) => e.kind === 'hillFarms')),
      farmAdjCivic: civicList.findIndex((c) => (c.effects ?? []).some((e) => e.kind === 'farmAdjacency')),
      farmAdjTech: techList.findIndex((t) => (t.effects ?? []).some((e) => e.kind === 'farmAdjacency')),
      mineUnlockTech: techList.findIndex((t) =>
        t.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'MINE'),
      ),
      // B-27 (#71): RADIO unlocks SEASIDE_RESORT.
      seasideUnlockTech: techList.findIndex((t) =>
        t.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'SEASIDE_RESORT'),
      ),
      seasideMinAppeal: SEASIDE_RESORT_MIN_APPEAL,
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
    // District catalog (D1 plumbing; inert until D2 places one). idx = engine
    // district index; adjYield = the YIELD_KEYS column its adjacency feeds
    // (-1 = none); adjacency `src` indexes ADJ_SRC (static: mountain/rainforest/
    // woods/reef/naturalWonder/river/seaResource; dynamic: builtWonder/district/
    // cityCenter/harbor/mineOrQuarry). Cost is flat in this model.
    // A-22 (2026-07-27): the SPECIALIST yield per district, parallel to
    // `districts` — 6 columns in YIELD_KEYS order, all-zero for a district with
    // no specialist row. The GPU merges these into its worked-tile ranking so
    // opponents assign specialists exactly as TS does.
    specialistYields: PLACEABLE_DISTRICTS.map((id) =>
      YIELD_KEYS.map((k) => (SPECIALIST_YIELDS as any)[id]?.[k] ?? 0),
    ),
    districts: PLACEABLE_DISTRICTS.map((id, idx) => {
      const d = DISTRICTS[id];
      return {
        id,
        idx,
        // P4/D-8: the unlockDistrict effect's tech/civic index (-1 = none in
        // the compact tree) — the discount's U counts types with a satisfied
        // unlock, exactly mirroring computeUnlocks().districts.
        unlockTech: techList.findIndex((t) => t.effects.some((e) => e.kind === 'unlockDistrict' && e.district === id)),
        unlockCivic: civicList.findIndex((c) => c.effects.some((e) => e.kind === 'unlockDistrict' && e.district === id)),
        cost: d.cost,
        adjYield: d.adjacencyYield ? YIELD_KEYS.indexOf(d.adjacencyYield) : -1,
        adjacency: d.adjacency.map((a) => ({ src: ADJ_SRC.indexOf(a.source), amount: a.amount })),
        housing: d.housing,
        // districtMaintenance: 0 for City Center / Neighborhood / Aqueduct, else 1.
        maintenance: ['CITY_CENTER', 'NEIGHBORHOOD', 'AQUEDUCT', 'COMMERCIAL_HUB', 'HARBOR'].includes(id) ? 0 : 1, // P4/D-14: CH+Harbor exempt (real Civ 6)
        countsTowardLimit: d.countsTowardLimit ? 1 : 0,
        allowMultiple: d.allowMultiple ? 1 : 0,
        onCoastalWater: d.placement.onCoastalWater ? 1 : 0,
        reqAdjCenter: d.placement.requiresAdjacentCityCenter ? 1 : 0,
        reqWaterOrMountain: d.placement.requiresWaterSourceOrMountain ? 1 : 0,
        notAdjCenter: d.placement.notAdjacentToCityCenter ? 1 : 0,
      };
    }),
    // D2b scaffold: which district the scripted policy places (Campus) and the
    // tech that unlocks it (WRITING).
    districtScaffold: {
      campusIdx: PLACEABLE_DISTRICTS.indexOf('CAMPUS'),
      campusUnlockTech: techList.findIndex((t) =>
        t.effects.some((e) => e.kind === 'unlockDistrict' && e.district === 'CAMPUS'),
      ),
      active: SCRIPTED_CAMPUS ? 1 : 0,
      // Districts the scripted policy places, IN ORDER (engine mirrors this list).
      // placement 0=land (best floor(static+0.5·adj) tile), 1=aqueduct (adjacent to
      // center + water source, lowest tile, non-specialty + housing), 2=coastal,
      // 3=encampment (NOT adjacent-center). B9-R1: civic-unlocked entries ship
      // unlockCivic instead of unlockTech (exactly one of the two is >= 0).
      place: SCAFFOLD_DISTRICTS.map(({ id, unlockId, unlockKind, placement }) => ({
        idx: PLACEABLE_DISTRICTS.indexOf(id),
        unlockTech: unlockKind === 'civic' ? -1 : techIdx.get(unlockId) ?? -1,
        unlockCivic: unlockKind === 'civic' ? civicIdx.get(unlockId) ?? -1 : -1,
        placement: placement ? PLACEMENT_CODE[placement] : 0,
      })),
      // CS buildDistrict askable list → engine district-type indices, so the
      // `already`/satisfied checks generalize past CAMPUS.
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
      // Mirrors city.ts buildingMaintenance (derived, not stored): Commercial Hub
      // buildings (Market/Bank/Stock Exchange) are upkeep-free, like cost-0 ones.
      maintenance: b.cost === 0 ? 0 : b.maintenance !== undefined ? b.maintenance : b.worship || b.district === 'COMMERCIAL_HUB' ? 0 : b.cost >= 500 ? 3 : b.cost >= 190 ? 2 : 1, // P4/D-13 mirror
      river: b.special === 'WATER_MILL',
      // AUDIT #78: the Water Mill's "Bonus resources improved by Farms gain +1
      // Food each". Deliberately NOT reusing `river` above, which happens to
      // select the same building today but means "requires a river city" — the
      // two would diverge the moment another river-gated building is added.
      farmBonusFood: b.special === 'WATER_MILL',
      unlockTech: buildingUnlockTech.get(b.id) ?? -1,
      unlockCivic: buildingUnlockCivic.get(b.id) ?? -1,
      // District buildings are gated (mirrors availableBuildings) on the city
      // owning a completed district of this type and having a prerequisite.
      reqDistrict: b.district === 'CITY_CENTER' ? -1 : PLACEABLE_DISTRICTS.indexOf(b.district),
      reqBuildings: (b.requiresAny ?? []).map((id) => buildingIdx.get(id) ?? -1).filter((i) => i >= 0),
      // B9-R1: exclusiveWith (Barracks/Stable) — pickers refuse a building whose
      // exclusive sibling is already owned (availableBuildings' rule).
      exclBuildings: (b.exclusiveWith ?? []).map((id) => buildingIdx.get(id) ?? -1).filter((i) => i >= 0),
      // B9-R2: regional buildings leave the local yield/amenity sums — the
      // regional channel (regionalEffects semantics) delivers them by range.
      regional: b.regional ? 1 : 0,
      // B9-R3: worship = faith-purchase-only (never queued, never gold-bought).
      worship: b.worship ? 1 : 0,
      // B-17 (ROUND B7): flat training XP granted to units trained/purchased in
      // a city holding this Encampment military building (best tier counts).
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
    // A-7r behavioral master switch (mirrored to the GPU so both engines gate
    // adoption identically). Landed inert; see GOVERNMENTS_ADOPTION_LIVE.
    governmentsLive: GOVERNMENTS_ADOPTION_LIVE,
    // A-7r: government + policy modifier tables (the A-7 belief-table shape).
    // Slot kinds: military=0, economic=1, diplomatic=2, wildcard=3. Only the
    // cityYields/capitalYields channels are exported (the GPU-implemented gov/
    // policy effects); other PolicyEffects channels (adjacencyMult,
    // buildingYieldMult, housing/amenity conditionals, yieldMult,
    // encampmentProdMult, tilePurchaseMult) are TS-only — no adopted government
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
      // #46r full channel matrix: off-script research paths can adopt ANY
      // government (the Merchant-Republic catch), so every effect channel a
      // government or WIRED card carries is reachable and must export.
      housingAll: g.effects.housingAll ?? 0,
      amenitiesAll: g.effects.amenitiesAll ?? 0,
      yieldMult: YIELD_KEYS.map((k) => g.effects.yieldMult?.[k] ?? 1),
      adjacencyMult: PLACEABLE_DISTRICTS.map((d) => g.effects.adjacencyMult?.[d] ?? 1),
      buildingYieldMult: PLACEABLE_DISTRICTS.map((d) => g.effects.buildingYieldMult?.[d] ?? 1),
      tilePurchaseMult: g.effects.tilePurchaseMult ?? 1,
      encampmentProdMult: g.effects.encampmentProdMult ?? 1, // B9-R1: VETERANCY went live with the Encampment scaffold
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
      encampmentProdMult: p.effects.encampmentProdMult ?? 1, // B9-R1: VETERANCY went live with the Encampment scaffold
      housingIfDistricts: p.effects.housingIfDistricts ? [p.effects.housingIfDistricts.min, p.effects.housingIfDistricts.housing] : [-1, 0],
      amenitiesIfSpecialty: p.effects.amenitiesIfSpecialty ? [p.effects.amenitiesIfSpecialty.min, p.effects.amenitiesIfSpecialty.amenities] : [-1, 0],
      newDeal: p.effects.newDeal ? [p.effects.newDeal.min, p.effects.newDeal.housing, p.effects.newDeal.amenities] : [-1, 0, 0],
    })),
  };
  return rules;
}

