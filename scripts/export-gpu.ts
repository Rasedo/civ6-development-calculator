/**
 * Fixture exporter for the GPU engine (gpu/): dumps the rule tables and,
 * per seed, a static map snapshot plus a reference trace of the TS engine
 * running the phase-4 scenario — a contested multi-city world: barbarians
 * raid, city-states court envoys, and scripted rival civilizations grow,
 * settle, race beliefs and declare war.
 *
 *   - the capital trains settlers (pop >= gate) until every planned site
 *     is claimed, then a warrior per city, then cheapest buildings;
 *   - settle SITES are chosen here at t=0 and fed to the engine via
 *     state.plannedSettles — the GPU engine consumes the same ordered list
 *     when its own simulated settlers complete (site choice is data, the
 *     founding turn is simulated; a site failing canFoundCity is dropped
 *     without spending the settler, exactly like the plannedSettles loop);
 *   - envoys back the neediest met city-state (ties to the lowest id).
 *
 * The rules also carry the boost-condition table (the GPU engine detects
 * eurekas itself), the empire-score weights (the RL reward), the
 * JS-computed damage table (libm exp() may differ by an ulp between
 * runtimes), and the city-state/rival pacing constants. rngInit is
 * captured AFTER game creation: city-state and rival placement draw from
 * the in-state RNG, so the reference loop starts mid-stream.
 *
 * The GPU engine must reproduce these traces exactly — the TS engine is
 * the oracle.
 *
 *   npm run gpu:export             # writes gpu/fixtures/*.json
 *   npm run gpu:export -- 12 80 3  # 12 seeds, 80 turns, 3 extra cities
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createGame, endTurn, foundCity, queueBuilding, queueDistrict, queueSettler , TURN_LIMIT } from '../src/core/game';
import { queueUnit, walkPath, builderImprove, moveCostInto, trainableUnits } from '../src/core/units';
import { IMPROVEMENTS, SEASIDE_RESORT_MIN_APPEAL } from '../src/data/improvements'; // B-27 (#71)
import { validImprovements, canPlaceDistrict } from '../src/core/rules';
import { terrainDefense, GENERAL_AURA_CS, GENERAL_AURA_RANGE, BARB_SCOUT_OPENER_LIVE } from '../src/core/combat';
import { GENERAL_AURA_MP } from '../src/core/aura'; // #70/S3 (B-8)
import { assignEnvoy } from '../src/core/cityStates';
import {
  CITY_STATE_TYPES,
  ENVOY_COST,
  INFLUENCE_PER_TURN,
  CS_CAPITAL_BONUS,
  QUEST_COOLDOWN,
  QUEST_ENVOYS,
  CS_TYPE_YIELD,
  CS_TYPE_DISTRICT,
  CS_TYPE_BUILDINGS,
  CS_DISTRICT_BONUS,
  CS_SUZERAIN_LIVE,
  CS_SUZERAIN_YIELD,
  CS_MAX_HP,
  CS_MEET_RANGE,
  LEVY_UNITS,
  LEVY_GOLD_COST,
  LEVY_COOLDOWN,
} from '../src/data/cityStates';
import { GP_CLASSES, GREAT_PEOPLE, gpCost, GP_CLASS_DISTRICT, GW_BUILDINGS, GW_SLOTS, GW_WONDER_SLOTS, GW_WORKS_PER_PERSON, GW_CULTURE, GW_TOURISM, GW_PRINTING_TECH, GW_PRINTING_WRITING_MULT, RELIC_BUILDING, RELIC_SLOTS_PER_BUILDING, RELIC_FAITH, RELIC_TOURISM, ARTIFACT_BUILDING, ARTIFACT_SLOTS, ARTIFACT_CULTURE, ARTIFACT_TOURISM, SPECIALIST_YIELDS } from '../src/data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, PANTHEON_FAITH_COST, RELIGION_PRESSURE_RANGE, JUST_WAR_RANGE, B18_FOLLOWER_COUPLING_LIVE, WORSHIP_BUILDINGS, SPREAD_PRESSURE, MISSIONARY_CAP, APOSTLE_CAP, APOSTLE_BUY_LIVE, CITY_RELIGION_ADDER_LIVE, THEO_DAMAGE, THEO_BASE_DAMAGE, THEO_PRESSURE_SWING, THEO_PRESSURE_RANGE, type BeliefEffects } from '../src/data/religion';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION, gpClassesOf, gppFractionOf } from '../src/data/projects';
import { BUILT_WONDERS } from '../src/data/builtWonders';
import { TRADE_ROUTE_RANGE, CS_ROUTE_GOLD, CS_ROUTE_SPEC, INTL_ROUTE_GOLD, TRADE_ROUTE_DURATION } from '../src/core/trade';
import { SUZERAIN_ENVOYS } from '../src/data/cityStates';
import { TERRAINS } from '../src/data/terrains';
import {
  RIVAL_MAX_CITIES,
  RIVAL_WAR_MIN_TURNS,
  RIVAL_CITY_MAX_HP,
  RIVAL_WORK_RADIUS,
  LOYALTY_MAX,
  LOYALTY_RANGE,
  LOYALTY_PRESSURE_SCALE,
  LOYALTY_AMENITY,
  PEACE_MIN_WAR_TURNS,
  PEACE_GOLD_COST,
  RIVAL_PROD_DIV,
  RIVAL_DEF_PER_TECH,
  WAR_WEARINESS_PER_TURN,
  WAR_WEARINESS_DECAY,
  WAR_WEARINESS_PER_AMENITY,
  WAR_WEARINESS_CAP,
  RR_DOW_PROXIMITY,
  RR_DOW_STRENGTH_RATIO,
  RR_DOW_WW_MAX,
  RR_PEACE_WW,
  RR_FORMAL_MIN_TURNS,
  WW_SURPRISE_MULT,
  WW_FORMAL_MULT,
  ERA_LENGTH,
  ERA_SCORE_FOUND,
  ERA_SCORE_CONQUER,
  ERA_SCORE_WONDER,
  ERA_SCORE_PANTHEON,
  ERA_SCORE_RELIGION,
  ERA_SCORE_GP,
  ERA_DARK_T,
  ERA_GOLDEN_T,
  AGE_PRESSURE,
  GOV_CIVICS_PER_TITLE,
  GOV_MAX_TITLES,
  GOVERNOR_LOYALTY,
  HEROIC_DEDICATIONS,
  RIVAL_TILE_BUY_LIVE,
  ADMIRAL_MARCH_LIVE,
  DEDICATION_FAITH,
  DEDICATION_ERA_SCORE,
  DEDICATION_PAYOUTS_LIVE,
  RR_ALLY_MIN_PEACE,
  RR_WARMONGER_DOW,
  RR_WARMONGER_CAPTURE,
  RR_WARMONGER_GANG,
  DIPLO_FAVOR_PER_SUZERAIN,
  CONGRESS_INTERVAL,
  CONGRESS_MIN_ERA,
  DVP_PER_RESOLUTION,
  DED_EVENT_SCORE,
  DIPLO_VICTORY_POINTS,
  TOURISM_PER_VISITOR_PER_CIV,
  CULTURE_PER_DOMESTIC_TOURIST,
  RIVAL_ENGINEER_LIVE,
  DED_MONUMENTALITY,
  DED_FREE_INQUIRY,
  DED_PEN_BRUSH_AND_VOICE,
  DED_EXODUS,
} from '../src/data/rivals';
import { scoreSettleSites } from '../src/core/advisor';
import { availableBuildings } from '../src/core/rules';
import { makeYieldCtx } from '../src/core/effects';
import { tileYields, districtAdjacency } from '../src/core/yields';
import { tileYieldsForCenter, cityMaintenance, WONDER_TOURISM_BASE } from '../src/core/city';
import { BALANCED_WEIGHTS } from '../src/core/empirePlanner';
import { traceRow, traceColumnTables } from './gpu-trace';
import { unitActionNames } from './gpu-actions';
import { hexDistance, neighbors, neighborTile } from '../src/core/hex';
import { hasFreshWater, hasRiver, isCoastalLand, isCoastalWater, isImpassable, isMountain, isWater } from '../src/core/query';
import { unitPassable } from '../src/core/units';
import { MAX_BARB_PER_CAMP } from '../src/core/combat';
import { UNITS, UNIT_HP, CITY_MAX_HP, WALLS_HP, ENCAMPMENT_HP } from '../src/data/units';
import { YIELD_KEYS, type City, type DistrictId, type GameState, type Tile } from '../src/core/types';
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../src/data/buildings';
import { DISTRICTS, PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS, type AdjacencySource } from '../src/data/districts';
import { IMPROVEMENTS } from '../src/data/improvements';
import { FEATURES } from '../src/data/features';
import { TECHS, ERAS, MODERN_ERA_INDEX } from '../src/data/techs'; // B-20 (#71): era scale
import { CIVICS } from '../src/data/civics';
import { GOVERNMENTS, POLICIES, GOVERNMENTS_ADOPTION_LIVE, type SlotKind } from '../src/data/policies';
import { RESOURCES } from '../src/data/resources';
import { BOOSTS, BOOST_FRACTION } from '../src/data/boosts';
import {
  CITIZEN_SCIENCE,
  CITIZEN_CULTURE,
  FOOD_PER_CITIZEN,
  CITY_CENTER_MIN_FOOD,
  CITY_CENTER_MIN_PRODUCTION,
  HOUSING_FRESH_WATER,
  HOUSING_COASTAL,
  HOUSING_NO_WATER,
  AQUEDUCT_FRESH_BONUS,
  AQUEDUCT_NO_FRESH_TOTAL,
  GOLD_PURCHASE_MULT,
  LUXURY_AMENITY_CITIES,
  GAME_SPEED,
  REGIONAL_RANGE,
  EMBARK_MOVES,
  EMBARKED_DEFENSE_CS,
  embarkState,
} from '../src/data/constants';

// The GPU improvement index space (tile.improvement values, build codes 13-15).
// AUDIT A-13: the roster grew — indices 0-2 stay stable (every existing
// plane/consumer keys on them); the resource-only improvements append.
// FISHING_BOATS stays OUT: water-only, and a land builder can never stand
// on the tile (unreachable in both engines).
// B-27 (#71): SEASIDE_RESORT appended LAST — this array's order IS the GPU's
// improvement index, so anything but an append renumbers every other row.
const IMPROVEMENT_IDS = ['FARM', 'MINE', 'LUMBER_MILL', 'QUARRY', 'PASTURE', 'CAMP', 'PLANTATION', 'OIL_WELL', 'SEASIDE_RESORT', 'FORT']; // B-27 (#78): FORT appended LAST — the GPU resolves by name, but order is the index
// Canonical luxury catalog order for the per-tile `lux` plane.
const LUXURY_IDS = Object.values(RESOURCES)
  .filter((r) => r.category === 'luxury')
  .map((r) => r.id);

// #78 (2026-07-28, OWNER DECISION): the gate seed set is TEMPORARILY 12, down
// from 24, to halve the development loop — the #47 attack-target fix roughly
// DOUBLED the battery wall (687s -> 1434s on an idle box) because unfrozen
// rivals actually fight.
//
// **RESTORE THIS TO 24 BEFORE THE FINAL HUNT.** The owner's explicit plan is to
// unshrink "closer to the end of development when we start the last hunt". A
// smaller fixed set is not a smaller sample of the same thing: seeds are never
// resampled, so any divergence only the dropped seeds reach goes from "caught
// eventually" to "NEVER caught". Both score latents hunted this session
// (envoy seed 9170, rGScore1 seed 9235) were single-seed reds.
const N_SEEDS = Number(process.argv[2] ?? 12);
const N_TURNS = Number(process.argv[3] ?? 250); // #56: scripted horizon 100→250 (survival heuristics H1/H2 keep the seeds alive)
const N_EXTRA = Number(process.argv[4] ?? 5); // candidate sites beyond the capital
const SETTLER_POP_GATE = 2; // capital waits for pop 2 before training a settler
const CS_MAX = 3;

// --- V-H1 chop plane helpers -------------------------------------------------
function chopKeyCode(t: any): number {
  if (!t.feature) return 0;
  const def = (FEATURES as any)[t.feature];
  if (!def?.removable || !def?.chopYield) return 0;
  if (t.resource) {
    const res = (RESOURCES as any)[t.resource];
    if (res?.requiresFeature?.includes(t.feature)) return 0;
  }
  return def.chopYield === 'food' ? 1 : def.chopYield === 'production' ? 2 : 0;
}
function chopUnlockTech(t: any): number {
  if (!t.feature) return -1;
  return Object.values(TECHS).findIndex((tech: any) =>
    (tech.effects ?? []).some((fx: any) => fx.kind === 'unlockFeatureRemoval' && fx.feature === t.feature));
}

const R_MAX = Number(process.argv[5] ?? 2);  // C3c-i: parametric (the default 2 IS the parity-contract pool)
// C3c-i: argv[5] = rival count (default 2 — THE PARITY CONTRACT POOL);
// argv[6] = output dir. The O=4 pool: `-- 24 100 5 3 gpu/fixtures_o4`.
const OUT = process.argv[6] ?? 'gpu/fixtures';

/**
 * #71 (DEBT-1): SEED_OVERRIDES is keyed by INDEX and tuned for the
 * PARITY-CONTRACT roster (R_MAX 2). Alternate-roster exports — notably
 * melee_test's `gpu/fixtures_o4` at 3 rivals — run a harsher world where a
 * seed the 2-rival set keeps can lose every city, and the exporter then
 * throws. Overriding it in the shared map would silently reshuffle the MAIN
 * fixture set and invalidate the whole gate, so alternate rosters get their
 * OWN map, consulted only when R_MAX differs from the contract.
 */
const SEED_OVERRIDES_ALT: Record<number, Record<number, number>> = {
  // 3 rivals: 9196's player is wiped by t100 under the post-#70 world
  // (ranged barbs + general auras + a third rival). 9199 survives.
  3: { 15: 9199 },
};

function seedFor(s: number): number {
  if (R_MAX !== 2) {
    const alt = SEED_OVERRIDES_ALT[R_MAX];
    if (alt && alt[s] !== undefined) return alt[s];
  }
  return SEED_OVERRIDES[s] ?? 9001 + s * 13;
}

mkdirSync(OUT, { recursive: true });

// --- rules -------------------------------------------------------------------

const techList = Object.values(TECHS);
const civicList = Object.values(CIVICS);
const techIdx = new Map(techList.map((t, i) => [t.id, i]));
const civicIdx = new Map(civicList.map((c, i) => [c.id, i]));

// Buildable set: City Center buildings + the buildings of EVERY district the
// scaffold places — DERIVED from SCAFFOLD_DISTRICTS so the two never drift (the
// scaffold places HARBOR by ~t270, so its buildings — Lighthouse/Shipyard/Seaport —
// must be buildable; Aqueduct has no buildings, harmless). Worship buildings still
// excluded below. (Harbor stage: pairs with the _city_totals player-yield mirror.)
const BUILDING_DISTRICTS = new Set<string>(['CITY_CENTER', ...SCAFFOLD_DISTRICTS.map((d) => d.id)]);
const centerBuildings = Object.values(BUILDINGS)
  // B9-R3: worship buildings JOIN the table (rivals faith-buy them; every
  // production/gold picker masks them via the `worship` flag). PALACE stays
  // out (both engines model it as a capital term, not a table row).
  .filter((b) => BUILDING_DISTRICTS.has(b.district) && b.id !== 'PALACE' && !SCRIPTED_HELD_BUILDINGS.has(b.id))
  .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
const buildingIdx = new Map(centerBuildings.map((b, i) => [b.id, i]));
const buildingUnlockTech = new Map<string, number>();
techList.forEach((t, i) => {
  for (const fx of t.effects ?? []) {
    if (fx.kind === 'unlockBuilding') buildingUnlockTech.set(fx.building, i);
  }
});
// Some buildings (Temple, Amphitheater, Museum, Zoo, Stadium, Arena) are
// unlocked by a CIVIC, not a tech — availableBuildings gates on both.
const buildingUnlockCivic = new Map<string, number>();
civicList.forEach((c, i) => {
  for (const fx of c.effects ?? []) {
    if (fx.kind === 'unlockBuilding') buildingUnlockCivic.set(fx.building, i);
  }
});

// AUDIT A-7: the belief-effect row shape (see `beliefs:` in rules below).
const FEAT_IDS = Object.keys(FEATURES);
const featIdx = new Map(FEAT_IDS.map((f, i) => [f, i]));
// AUDIT A-4: resource-id order (the `rid` tile plane + wonder adjR) and
// the static per-wonder placement test behind the `wok` tile bitmask.
const RESOURCE_IDS = Object.keys(RESOURCES);
const BUILT_WONDER_LIST = Object.values(BUILT_WONDERS);
const wonderStaticOk = (w: (typeof BUILT_WONDER_LIST)[number], t: Tile, m: GameState['map']): boolean => {
  if (t.wonder) return false;
  if (isImpassable(t)) return false;
  const p = w.placement;
  if (p.onCoastalWater) {
    if (!isCoastalWater(m, t)) return false;
  } else {
    if (isWater(t)) return false;
    if (t.feature === 'FLOODPLAINS' && !p.allowFloodplains) return false;
    if (t.feature === 'OASIS') return false;
    if (p.terrains && !p.terrains.includes(t.terrain)) return false;
    if (p.flatOnly && t.elevation !== 'FLAT') return false;
    if (p.hillsOnly && t.elevation !== 'HILLS') return false;
  }
  if (p.requiresRiver && !hasRiver(t)) return false;
  return true;
};
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
    // gate-catch, seed 9066 t57 rTechProg1: rival 1's first QUARRY at t48
    // fired MASONRY's eureka in TS only — the old FARM/MINE/LUMBER
    // hardcode left quarry/pasture rows unexported, so the GPU's research
    // stream forked on the boosted cost). MASONRY (quarry) and
    // HORSEBACK_RIDING (pasture) are live now; CELESTIAL_NAVIGATION
    // (FISHING_BOATS) stays out — the improvement is out of roster,
    // water-unreachable in both engines.
    const imp = IMPROVEMENT_IDS.indexOf(c.id);
    if (imp >= 0) row = { kind: 'improvement', imp, count: c.count, onResource: c.onResource ? 1 : 0 };
  } else if (c.kind === 'anyWonderBuilt') {
    // A-4: rival wonders make this REACHABLE (it was filtered as
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
    // player fill 4+ slots in-gate; the GPU counts the PLAYER's slotted-policy
    // mask (`_gov_policy_mods`). Player-only — rivalCheckSatisfied returns false
    // for policies, and the rival boost loop skips this kind (no rival case).
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
// SCAFFOLD_DISTRICTS moved to data/districts.ts (C1-B4: the rival picker
// shares it). ENCAMPMENT stays held out — see the note there and BUILD_PLAN D6.
const PLACEMENT_CODE = { aqueduct: 1, coastal: 2, encampment: 3 } as const;

// A-7r: policy/government slot-kind wire encoding.
const SLOT_KIND_IDX: Record<SlotKind, number> = { military: 0, economic: 1, diplomatic: 2, wildcard: 3 };

const STATIC_ADJ_SRC = new Set<AdjacencySource>([
  'MOUNTAIN', 'RAINFOREST', 'WOODS', 'REEF', 'NATURAL_WONDER', 'RIVER', 'SEA_RESOURCE',
]);

/** Raw (unfloored) static-source district adjacency for `id` on `tile`. */
function staticAdjRaw(map: GameState['map'], tile: Tile, id: DistrictId): number {
  const def = DISTRICTS[id];
  if (!def.adjacencyYield) return 0;
  let sum = 0;
  const around = neighbors(map, tile);
  for (const rule of def.adjacency) {
    if (!STATIC_ADJ_SRC.has(rule.source)) continue;
    if (rule.source === 'RIVER') {
      if (hasRiver(tile)) sum += rule.amount;
      continue;
    }
    for (const n of around) {
      const m =
        rule.source === 'MOUNTAIN' ? n.elevation === 'MOUNTAIN' && !n.wonder
        : rule.source === 'RAINFOREST' ? n.feature === 'RAINFOREST'
        : rule.source === 'WOODS' ? n.feature === 'WOODS'
        : rule.source === 'REEF' ? n.feature === 'REEF'
        : rule.source === 'NATURAL_WONDER' ? n.wonder !== null
        : rule.source === 'SEA_RESOURCE' ? isWater(n) && n.resource !== null
        : false;
      if (m) sum += rule.amount;
    }
  }
  return sum;
}

/** Adjacency this tile's OWN removable feature (woods/rainforest/reef) lends to
 * a district on a NEIGHBOUR — the amount a fresh city drops when it founds here
 * and foundCity clears the feature (game.ts:168). The engine subtracts this from
 * each neighbour's d_static_adj on in-game founding, since the exported adjacency
 * was baked after only the capital founded. 0 for non-removable / no feature. */
function featureAdjContribution(tile: Tile, id: DistrictId, removable = true): number {
  const f = tile.feature;
  if (!f || FEATURES[f].removable !== removable) return 0;
  const def = DISTRICTS[id];
  if (!def.adjacencyYield) return 0;
  let sum = 0;
  for (const rule of def.adjacency) {
    const m =
      rule.source === 'RAINFOREST' ? f === 'RAINFOREST'
      : rule.source === 'WOODS' ? f === 'WOODS'
      : rule.source === 'REEF' ? f === 'REEF'
      : false;
    if (m) sum += rule.amount;
  }
  return sum;
}

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
  // Mirrors settlerCost(): 80 + 30 × (cities − 1 + settlers banked + settlers queued).
  // goldPurchaseMult mirrors GOLD_PURCHASE_MULT (V-P1: buy = production cost × 4).
  // P4/D-10: builderBase/builderPer/gameSpeed mirror builderCost() —
  // round((50 + 4·n) × GAME_SPEED), n = builders ever trained + queued.
  // P4/D-15: settler 80/30 speed-scales like unit costs (mirrors settlerCost).
  scenario: { settlerBase: Math.round(80 * GAME_SPEED), settlerPerCity: Math.round(30 * GAME_SPEED), settlerPopGate: SETTLER_POP_GATE, goldPurchaseMult: GOLD_PURCHASE_MULT, turnLimit: TURN_LIMIT, builderBase: 50, builderPer: 4, gameSpeed: GAME_SPEED },
  // One civ-id space (C1-A3, mirrors src/core/civs.ts): the player is civ 0,
  // rival r (array index == rival.id, asserted at export) is civ r+1.
  // City-states and barbarians stay outside the numbering.
  civs: { player: 0, rivalBase: 1 },
  // #51/S0.1: the trace column NAMES + tolerances, per block. gpu/parity_test.py
  // expands these against the fixture's own cMax/csMax/rMax, asserts the result
  // matches BatchSim.trace_columns() exactly, and applies tolerance BY NAME —
  // so a new column can never silently shift a later column's tolerance.
  trace: traceColumnTables(),
  // #51/S0.3: the UNIT ACTION enum (index = position). Both engines dispatch by
  // NAME off this list instead of hardcoded column numbers — the collision that
  // bound PILLAGE to the FORT column and left the real pillage column dead.
  actions: { unit: unitActionNames(IMPROVEMENT_IDS) },
  // Mirrors districtCostIn() — rivals pay it from THEIR research counts
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
  // B6-S2: the missionary buy's Shrine gate (rivals.ts missionary branch).
  shrineBidx: buildingIdx.get('SHRINE') ?? -1,
  // AUDIT A-11: rival trade — id-anchored capacity sources + route constants
  // (the rivalTradeCapacity/routeYields mirror; no CS term until A-12).
  trade: {
    marketBidx: buildingIdx.get('MARKET') ?? -1,
    lighthouseBidx: buildingIdx.get('LIGHTHOUSE') ?? -1,
    foreignTradeCidx: civicIdx.get('FOREIGN_TRADE') ?? -3,
    capWonderWidx: ['COLOSSUS', 'GREAT_ZIMBABWE']
      .map((id) => BUILT_WONDER_LIST.findIndex((w) => w.id === id))
      .filter((i) => i >= 0),
    range: TRADE_ROUTE_RANGE,
    // A-12b: rival CS-route income constants (csRouteYields mirror).
    csRouteGold: CS_ROUTE_GOLD,
    csRouteSpec: CS_ROUTE_SPEC,
    // B-23: international-route gold base (routeYieldsInternational: +intlGold
    // +1 gold per destination completed specialty district) + route duration.
    intlGold: INTL_ROUTE_GOLD,
    duration: TRADE_ROUTE_DURATION,
  },
  // B-15 war weariness (mirrors data/rivals.ts): integer accumulator → flat
  // empire-wide amenity penalty for the player AND each rival civ.
  warWeariness: {
    perTurn: WAR_WEARINESS_PER_TURN,
    decay: WAR_WEARINESS_DECAY,
    perAmenity: WAR_WEARINESS_PER_AMENITY,
    cap: WAR_WEARINESS_CAP,
    // B-22 (S3): casus-belli accrual multipliers (SURPRISE ×2, FORMAL ×1).
    surpriseMult: WW_SURPRISE_MULT,
    formalMult: WW_FORMAL_MULT,
  },
  // B-24 (task #68): era score / Ages (mirrors data/rivals.ts; S1 = the
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
    rrAllyMinPeace: RR_ALLY_MIN_PEACE, rrWarmongerDow: RR_WARMONGER_DOW, rrWarmongerCapture: RR_WARMONGER_CAPTURE, rrWarmongerGang: RR_WARMONGER_GANG, diploFavorPerSuzerain: DIPLO_FAVOR_PER_SUZERAIN, congressInterval: CONGRESS_INTERVAL, congressMinEra: CONGRESS_MIN_ERA, dvpPerResolution: DVP_PER_RESOLUTION, diploVictoryPoints: DIPLO_VICTORY_POINTS, rivalTileBuyLive: RIVAL_TILE_BUY_LIVE, dedicationPayoutsLive: DEDICATION_PAYOUTS_LIVE, dedMonumentality: DED_MONUMENTALITY, dedFreeInquiry: DED_FREE_INQUIRY, dedPenBrush: DED_PEN_BRUSH_AND_VOICE, dedExodus: DED_EXODUS, heroicDedications: HEROIC_DEDICATIONS, dedEventScore: [...DED_EVENT_SCORE], dedicationFaith: DEDICATION_FAITH, dedicationEraScore: DEDICATION_ERA_SCORE, governorLoyalty: GOVERNOR_LOYALTY,
  },
  boosts: boostRows,
  // City-state rules (mirrors data/cityStates.ts; covered scope only — the
  // 3/6-envoy district tiers are inert without districts, and the CHIEFDOM
  // influence tier is 0, so influence accrues at the flat base rate).
  cs: {
    envoyCost: ENVOY_COST,
    influencePerTurn: INFLUENCE_PER_TURN,
    capitalBonus: CS_CAPITAL_BONUS,
    meetRange: CS_MEET_RANGE, // A-12: rival proximity-meet radius
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
    // A-12 (B8-L): RIVAL levy — a militaristic CS's suzerain (rival) at war
    // spawns levyUnits units at levyGoldCost off its treasury, levyCooldown
    // per CS shared across seats. (Player levy is UI-only, absent from the
    // scripted reference, so the GPU only mirrors the rival path.)
    levyUnits: LEVY_UNITS,
    levyGoldCost: LEVY_GOLD_COST,
    levyCooldown: LEVY_COOLDOWN,
  },
  // Rival-civ pacing (mirrors data/rivals.ts). loyaltyAmenity is keyed by
  // amenity-tier INDEX in the same order as amenityTiers above. The
  // pantheon/belief pools matter only as SIZES: a rival's pick consumes a
  // draw and shrinks the pool, but the identity is inert in covered scope.
  rivals: {
    maxCities: RIVAL_MAX_CITIES,
    settlerBase: Math.round(80 * GAME_SPEED), // P5/S3: RIVAL_SETTLER_COST(c) = the player's 48 + 18·max(0, c − 1)
    settlerPer: Math.round(30 * GAME_SPEED),
    // (P5/S4: borderPeriod died — rival borders grow on culture.)
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
    // combat; see the RELIC_* comment in src/data/greatPeople.ts for the
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
    // constants' comment in src/data/rivals.ts for the source).
    tourismPerVisitorPerCiv: TOURISM_PER_VISITOR_PER_CIV,
    culturePerDomesticTourist: CULTURE_PER_DOMESTIC_TOURIST,
    techEra: techList.map((t) => Math.max(0, ERAS.indexOf(t.era))),
    civicEra: civicList.map((c) => Math.max(0, ERAS.indexOf(c.era))),
    warMinTurns: RIVAL_WAR_MIN_TURNS,
    // A-19/B-33 (S2): pairwise rival↔rival DoW/peace gates (zero-draw).
    rrDowProximity: RR_DOW_PROXIMITY,
    rrDowStrengthRatio: RR_DOW_STRENGTH_RATIO,
    rrDowWwMax: RR_DOW_WW_MAX,
    rrPeaceWw: RR_PEACE_WW,
    rrFormalMinTurns: RR_FORMAL_MIN_TURNS, // B-22 (S3)
    // Player diplomacy (V-W1): sueForPeace gates on warTurns >= peaceMinWarTurns
    // and costs PEACE_GOLD_COST(warTurns) — exported as its linear params.
    // C1-B3b: research consumers — the production divisor, defense per
    // tech, and the real unit-type gates.
    research: {
      prodDiv: RIVAL_PROD_DIV,
      defPerTech: RIVAL_DEF_PER_TECH,
      spearTech: techIdx.get('BRONZE_WORKING') ?? -1,
      horseTech: techIdx.get('HORSEBACK_RIDING') ?? -1,
      // AUDIT A-6: the ranged rung — SLINGER is ungated, ARCHER needs this.
      archerTech: techIdx.get('ARCHERY') ?? -1,
    },
    // C1-B5b: rival builder gates — improvement unlock indices in the tech
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
    peaceMinWarTurns: PEACE_MIN_WAR_TURNS,
    peaceGold0: PEACE_GOLD_COST(0),
    peaceGoldSlope: PEACE_GOLD_COST(1) - PEACE_GOLD_COST(0),
    cityMaxHp: RIVAL_CITY_MAX_HP,
    workRadius: RIVAL_WORK_RADIUS,
    loyaltyMax: LOYALTY_MAX,
    loyaltyRange: LOYALTY_RANGE,
    loyaltyScale: LOYALTY_PRESSURE_SCALE,
    loyaltyAmenity: ['Ecstatic', 'Happy', 'Content', 'Displeased', 'Unhappy'].map((n) => LOYALTY_AMENITY[n] ?? 0),
    gpCosts: Array.from({ length: 8 }, (_, n) => gpCost(n)),
    gpRoster: GP_CLASSES.map((c) => GREAT_PEOPLE[c].length),
    // Player great-people (advanceGreatPeople): per class, the PLACEABLE_DISTRICTS
    // idx that accrues its points, and each person's instant effect
    // [science→tech, culture→civic, gold→treasury, production→capital]. The player
    // draws from the SAME gp_earned pool the rival race consumes (rivals claim in
    // rivalPhase first, then the player), so only classDistrict + effects are new.
    gpClassDistrict: GP_CLASSES.map((c) => PLACEABLE_DISTRICTS.indexOf(GP_CLASS_DISTRICT[c])),
    gpEffects: GP_CLASSES.map((c) =>
      // P5/S5: col 4 = faith (Prophets) — the rival pantheon's funding; the
      // player's GPU faith stays unmodeled (no consumer — worship is TS-only).
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
    // B-18: Enhancer pool size. The GPU does not yet race enhancers (rival
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
  // beliefs now APPLY to rival civs. Row order = the data-file key order;
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
    apostleBuyLive: APOSTLE_BUY_LIVE, // B-18 (#71): inert until the buy-timing hunt lands
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
  // AUDIT A-4: rival wonders (data order). Static placement lives in the
  // per-tile `wok` bitmask below; LIVE terms (ownership, occupancy,
  // radius, non-bonus resource, adjacent completed district, adjacent
  // un-stripped resource, world uniqueness) are the engine's job.
  // extraWildcardSlot (Forbidden City) is skipped — no rival government;
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
  // AUDIT A-14: rival projects (data order; d = PLACEABLE_DISTRICTS idx,
  // y = YIELD_KEYS idx or -1, g = GP_CLASSES idx or -1). Out-of-scaffold
  // districts export d=-1 and never fire — table-driven for A-9's future.
  projects: {
    // B-25 (Round B3, Slice W): the space-race chain now SHIPS to the GPU.
    // Every row carries sp (space flag) / vic (victory step) plus the tech
    // gate (rt = techs-table idx) and previous-step link (rp = projects-table
    // idx) so the GPU mirrors the sequence + the science victoryType 3/4.
    // Space rows sit LAST (chain order): the rival greedy pick resolves to a
    // base project first, and the scripted player never queues projects, so
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
    // B-26 era ladder: barb u_type 0/1/2/3 = WARRIOR/SPEARMAN/PIKEMAN/MUSKETMAN.
    // #70/S5 appends the RANGED pair: 4 = ARCHER, 5 = CROSSBOWMAN; #71/B-26
    // appends 6 = SCOUT (the scout-then-raid opener). `unitCombat`
    // is the DEFENSE strength (a ranged unit defends on UNITS.combat, 15 for
    // both); the strike itself reads unitRangedStrength / unitRangedRange —
    // the barb (u_*) twins of the roster's rangedStrength / rangedRange.
    unitCombat: [
      UNITS.WARRIOR.combat,
      UNITS.SPEARMAN.combat,
      UNITS.PIKEMAN.combat,
      UNITS.MUSKETMAN.combat,
      UNITS.ARCHER.combat,
      UNITS.CROSSBOWMAN.combat,
      UNITS.SCOUT.combat, // B-26 (#71): 6 = SCOUT — the scout-then-raid opener
      // B-26 (2026-07-27): 7 = GALLEY, 8 = QUADRIREME — the barb NAVAL ladder
      // for coastal camps. Appended LAST: this array's order IS the GPU's barb
      // u_type, so anything but an append renumbers every existing barb.
      UNITS.GALLEY.combat,
      UNITS.QUADRIREME.combat,
    ],
    // B-26 (#71): the barb MOVES table. The GPU raider march used to hardcode
    // 2 MP, which was correct only while every barb type had 2 — the SCOUT
    // opener has 3, so the march must read the type.
    barbScoutOpenerLive: BARB_SCOUT_OPENER_LIVE, // B-26 (#71): inert pending its hunt
    unitMoves: [
      UNITS.WARRIOR.moves ?? 2,
      UNITS.SPEARMAN.moves ?? 2,
      UNITS.PIKEMAN.moves ?? 2,
      UNITS.MUSKETMAN.moves ?? 2,
      UNITS.ARCHER.moves ?? 2,
      UNITS.CROSSBOWMAN.moves ?? 2,
      UNITS.SCOUT.moves ?? 2,
      UNITS.GALLEY.moves ?? 3,
      UNITS.QUADRIREME.moves ?? 3,
    ],
    unitRangedStrength: [0, 0, 0, 0, UNITS.ARCHER.ranged?.strength ?? 0, UNITS.CROSSBOWMAN.ranged?.strength ?? 0, 0, 0, UNITS.QUADRIREME.ranged?.strength ?? 0],
    unitRangedRange: [0, 0, 0, 0, UNITS.ARCHER.ranged?.range ?? 0, UNITS.CROSSBOWMAN.ranged?.range ?? 0, 0, 0, UNITS.QUADRIREME.ranged?.range ?? 0],
    // B-26 (2026-07-27): which barb u_types are NAVAL hulls — the barb twin of
    // the roster's `naval` flag, so the raider march can pick the water plane.
    unitNaval: [0, 0, 0, 0, 0, 0, 0, 1, 1],
    barbNavalTypes: [7, 8], // GALLEY, then QUADRIREME past crossbowmanAfterTurn
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
    // AUDIT A-8: full MP per turn — the rival walkers' budget.
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
    // so the GPU can mirror rivalHasFortJob / the engineer job set.
    engineerIdx: Object.values(UNITS).findIndex((u) => u.id === 'MILITARY_ENGINEER'),
    rivalEngineerLive: RIVAL_ENGINEER_LIVE,
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
  // rivals assign specialists exactly as TS does.
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
  // (verified: player slots VETERANCY[inert]+URBAN_PLANNING, rivals adopt
  // AUTOCRACY and slot the same), so they stay inert here (see ROUND_B2_LOG).
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
writeFileSync(`${OUT}/rules.json`, JSON.stringify(rules));
console.log(
  `rules.json: ${rules.buildings.length} buildings, ${rules.techs.length} techs, ${rules.civics.length} civics, ${boostRows.length} detectable boosts`,
);

// --- per-seed fixtures ----------------------------------------------------------

function cheapestBuilding(state: GameState, city: City): string | null {
  const avail = availableBuildings(state, city)
    .filter((b) => buildingIdx.has(b.id)) // only the exported buildable set (availableBuildings gates district+prereq)
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  return avail[0]?.id ?? null;
}

// A-13/A-15: seeds whose scripted game leaves the player with NO cities by
// t100 (rivals grew strong enough to conquer the capital — the world working
// as designed, but a dead player poisons the scripted fixture: the policy
// closure keeps mutating a ghost capital no engine should have to mirror).
// Each override rerolls JUST that index; off-script rollout games keep
// covering collapse trajectories, so no coverage is lost. Diagnose a dying
// seed with CIV6_EXPORT_DEBUG=<seed> (per-turn event narration).
const SEED_OVERRIDES: Record<number, number> = {
  0: 9002,
  1: 9015,  // #78/#47: rival units no longer freeze, so the world is harsher
  2: 9029,
  4: 9054,
  6: 9080,
  10: 9133,  // #78/#47: rival units no longer freeze, so the world is harsher
  12: 9158,
  15: 9196,
  16: 9212,
  17: 9223,
  23: 9302,  // #78/#47: rival units no longer freeze, so the world is harsher
};
for (let s = 0; s < N_SEEDS; s++) {
  const seed = seedFor(s);
  // withVillages: false — goody-hut claiming (a fog-era mechanic with its
  // own reward rolls) is outside the ported scope, so the reference maps
  // must not carry huts a moving unit could trip over.
  const state = createGame({
    width: 44,
    height: 26,
    seed,
    withResources: true,
    withWonders: true,
    unitsMode: true,
    withVillages: false,
    cityStates: CS_MAX,
    rivals: R_MAX,
  });
  state.disasters = true; // phase 4d: weather rolls join the RNG stream
  // A-12b: snapshot the t0 city-state roster BEFORE the reference run — a
  // rival can now CONQUER a CS mid-run (captureCityStateForRival removes it
  // from state.cityStates), and the fixture must carry the t0 world; the
  // trace's id-keyed CS columns zero out after a capture on both engines.
  const csAtStart = state.cityStates.map((cs) => ({
    id: cs.id,
    type: CITY_STATE_TYPES.indexOf(cs.type),
    center: cs.centerIndex,
    pop: 3,
    // B-21: the suzerain unique-perk yield column for THIS named CS (-1 =
    // descoped row). Name-keyed off CS_SUZERAIN_LIVE — placement assigns names
    // deterministically, so this is the same seat-agnostic per-CS channel.
    suzKey: CS_SUZERAIN_LIVE[cs.name] ? YIELD_KEYS.indexOf(CS_SUZERAIN_LIVE[cs.name]) : -1,
  }));
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  const capital = state.cities[0];
  const ctx = makeYieldCtx(state);
  const map = state.map;
  // Captured AFTER creation: city-state and rival placement draw from the
  // in-state RNG, so the loop starts mid-stream, not at the seed.
  const rngInit = state.rngState >>> 0;
  // B-24: t0 era-score snapshot (createGame's capital foundings accrue) —
  // taken PRE-run like every Init snapshot (the A-12b exporter rule: the
  // live state at dump time is the post-trace object).
  const eraScoreInit = Array.from({ length: 1 + R_MAX }, (_, c) => state.eraScore?.[c] ?? 0);
  const unitRosterIdx = new Map(Object.values(UNITS).map((u, i) => [u.id, i]));
  const rivalCitiesInit = new Map(
    state.rivals.map((r) => [r.id, r.cities.map((rc) => ({ id: rc.id, center: rc.centerIndex, pop: rc.population }))]),
  );
  const rivalUnitsInit = new Map(
    state.rivals.map((r) => [
      r.id,
      state.units
        .filter((u) => u.owner === 'rival' && u.civId === r.id)
        .map((u) => ({ type: unitRosterIdx.get(u.type) ?? 0, tile: u.tileIndex })),
    ]),
  );

  // AUDIT C-7: the static camp/settle planes are only correct because no
  // goody hut can (dis)appear mid-game — enforce the withVillages contract
  // instead of trusting the flag above.
  if (map.tiles.some((t) => t.goodyHut)) {
    throw new Error('GPU export requires a hut-free world (withVillages: false) — the static camp/settle planes assume no goody huts (AUDIT C-7)');
  }

  const tiles = map.tiles.map((t) => {
    // C1-B1: the static plane ships UNPAVED yields — what the tile would
    // yield without its district — because paving is a runtime mask in every
    // GPU consumer, and rival centers need their real (district-nulled)
    // yields live (tileYieldsForCenter). Only t=0 district tiles (capitals)
    // differ from the old export.
    const y = tileYields(ctx, t.district ? { ...t, district: null } : t);
    return {
      y: YIELD_KEYS.map((k) => Math.round(y[k] * 1000) / 1000),
      workable: !isImpassable(t) && !t.district ? 1 : 0,
      res: t.resource ? (RESOURCES[t.resource].category === 'luxury' ? 3 : RESOURCES[t.resource].category === 'strategic' ? 2 : 1) : 0,
      // near a natural wonder (for the ASTROLOGY-style eureka)
      wnear: t.wonder !== null || neighbors(map, t).some((n) => n.wonder !== null) ? 1 : 0,
      // coastal land (A-3: rival coastalCity eurekas — the player's uses
      // the per-city flag set at founding/capture)
      cl: isCoastalLand(map, t) ? 1 : 0,
      // feature id (A-7: belief featureYields — Lady of the Reeds tiles);
      // live via feat_stripped (chops/paves null features)
      fid: t.feature ? featIdx.get(t.feature) ?? -1 : -1,
      // A-13 off-script gate catch (rng 2026006108 t81): foundCity strips
      // ONLY a REMOVABLE feature (game.ts:209 / rivals.ts:144) — an OASIS/
      // FLOODPLAINS center keeps its feature LIVE, and belief featureYields
      // (Lady of the Reeds) apply to it. The GPU founding paths gate their
      // feat_stripped/tdef writes on this bit.
      frm: t.feature && FEATURES[t.feature].removable ? 1 : 0,
      // A-4: resource id (Stonehenge's live stone adjacency, strip-aware),
      // desert flag (Petra) and the static per-wonder placement bitmask
      // (LIVE terms — ownership, occupancy, radius, non-bonus resource,
      // adjacent completed district / un-stripped resource, world
      // uniqueness — are the engine's job)
      rid: t.resource ? RESOURCE_IDS.indexOf(t.resource) : -1,
      des: t.terrain === 'DESERT' ? 1 : 0,
      wok: BUILT_WONDER_LIST.reduce((m2, w, i) => m2 | (wonderStaticOk(w, t, map) ? 1 << i : 0), 0),
      // land units may stand here (mirrors unitPassable land plane)
      pass: unitPassable(t) ? 1 : 0,
      // #45/B-6: WATER passability plane — a water tile that is not impassable
      // (mirrors unitPassable for a naval unit / an embarked land unit, terrain
      // layer only). Tech gating (embark-capability, OCEAN needing CARTOGRAPHY)
      // is composed in the engine at the war-march gather site.
      wpass: isWater(t) && !isImpassable(t) ? 1 : 0,
      // #45/B-6: OCEAN tile — needs CARTOGRAPHY to enter (COAST/LAKE ungated).
      ocean: t.terrain === 'OCEAN' ? 1 : 0,
      work: isImpassable(t) ? 0 : 1, // C1-B1: citizen-workable (water IS workable; ice/mountains are not)
      // Luxury amenity source (mirrors luxuryAmenities): the luxury's catalog
      // index + the improvement index that activates it. -9 = its improvement
      // is outside the GPU roster (PEARLS/WHALES -> FISHING_BOATS), so it can
      // never activate in the GPU — currently true in TS too (no scripted
      // builder path builds FISHING_BOATS), but #50's RL improvement verbs
      // would make it a LIVE asymmetry: revisit with A-18 (AUDIT note).
      lux: t.resource && RESOURCES[t.resource].category === 'luxury' ? LUXURY_IDS.indexOf(t.resource) : -1,
      luxreq: (() => {
        if (!t.resource || RESOURCES[t.resource].category !== 'luxury') return -9;
        const ri = IMPROVEMENT_IDS.indexOf(RESOURCES[t.resource].improvement ?? '');
        return ri >= 0 ? ri : -9;
      })(),
      // defender bonus (mirrors terrainDefense: hills / woods / rainforest +3;
      // B-28: marsh / floodplains −2). READ-only for defense in the engine.
      tdef: terrainDefense(t),
      // B-28: movement-slow encoding, DECOUPLED from tdef so marsh's defense
      // (−2) can differ from its slow-to-enter cost. enter cost = 1 + tmove//3
      // (= moveCostInto − 1): hills +3, slow feature (woods/rainforest/marsh)
      // +3; floodplains is NOT slow. tmove//3 is byte-identical to the OLD
      // tdef//3 for every tile, so movement trajectories are unchanged.
      // B-23 (#71): moveCostInto now takes the tile being LEFT. Passing the
      // same tile is the no-road terrain schedule, which is what tmove encodes
      // (the road discount is applied at step time, not baked into the plane).
      tmove: (moveCostInto(t, t) - 1) * 3,
      rd: t.road ? 1 : 0, // B-23 (#71): the ROAD plane (false at t0)
      // statically camp-eligible (dynamic exclusions — ownership, distance
      // to cities/camps — are the engine's job; mirrors campCandidates)
      camp: !isWater(t) && !isImpassable(t) && !t.wonder && !t.district && !t.builtWonder && !t.goodyHut ? 1 : 0,
      // city-state territory (static — placed at game creation)
      cs: t.csId ?? -1,
      // rival territory at t=0 (grows dynamically in the engine)
      rv: t.rivalId ?? -1,
      rci: t.rivalCityId ?? -1, // A-17: per-rc tile registry (RivalCity.id, per-civ)
      // C1-B4b-2: Water Mill gates on a river at RIVAL centers too
      riv: hasRiver(t) ? 1 : 0,
      // C1-B5b-iii: water housing IF a center stood here (fresh 5 /
      // coastal 3 / dry 2) — rival housing reads it at their centers.
      wh: hasFreshWater(map, t) ? HOUSING_FRESH_WATER : isCoastalLand(map, t) ? HOUSING_COASTAL : HOUSING_NO_WATER,
      // V-H1 chop planes: ftr = the chop grant key when this tile's feature
      // is removable AND carries a chopYield AND no resource depends on it
      // (0 none, 1 food, 2 production); ftu = the tech whose effect unlocks
      // that feature's removal (-1 = never removable).
      ftr: chopKeyCode(t),
      ftu: chopUnlockTech(t),
      wt: isWater(t) ? 1 : 0,
      // Harbor placement surface (static part of canPlaceDistrict for a coastal
      // district): coastal/lake water adjacent to land, no wonder, no non-bonus
      // resource. Ownership/radius/district/improvement stay the engine's job.
      cw:
        isCoastalWater(map, t) && !t.wonder && !t.builtWonder &&
        !(t.resource && RESOURCES[t.resource].category !== 'bonus') ? 1 : 0,
      fw: hasFreshWater(map, t) ? 1 : 0,
      nw: t.wonder ? 1 : 0,
      // statically settleable for rival expansion (mirrors siteQuality's -1s;
      // ownership and dynamic districts are the engine's job). GEO-H (#55):
      // `st` must NOT bake `!t.district` — the district is a LIVE property
      // (siteQuality reads tile.district each call), and the engine already
      // gates on `self.district < 0` at the candidate site. Baking the t0
      // district froze a tile that later loses its district (a razed city's
      // freed center) as permanently unsettleable in the GPU while TS re-opens
      // it live — the seed 9235/9144 founding-site divergence (G-6). Keep `st`
      // purely static: water / impassable / natural wonder / OASIS.
      st: !isWater(t) && !isImpassable(t) && !t.wonder && t.feature !== 'OASIS' ? 1 : 0,
      // district-usable land (static part of canPlaceDistrict for a non-coastal
      // land district): not water/impassable/wonder/builtWonder/oasis/floodplains,
      // no non-bonus resource, no district at t=0. Ownership, radius, the pop cap
      // and dynamically-built districts stay the engine's job.
      du:
        !isWater(t) && !isImpassable(t) && !t.wonder && !t.builtWonder &&
        t.feature !== 'OASIS' && t.feature !== 'FLOODPLAINS' && !t.district &&
        !(t.resource && RESOURCES[t.resource].category !== 'bonus') ? 1 : 0,
      // raw static district adjacency per placeable district (D2a). The engine
      // adds live dynamic sources (adjacent district/center/mine) then floors;
      // self-checked here at t=0 where dynamic=0 so floor(static)=districtAdjacency.
      dadj: PLACEABLE_DISTRICTS.map((id) => {
        const raw = staticAdjRaw(map, t, id);
        // Validate only where no dynamic source is live (no adjacent completed
        // district — at export the sole one is the just-founded city center;
        // no mines/harbors/wonders exist yet). There districtAdjacency ==
        // floor(static). Center-/district-adjacent tiles get validated by the
        // D2b parity gate once the engine adds dynamic sources before flooring.
        const adjDynamic = neighbors(map, t).some((n) => n.district !== null && n.districtComplete);
        if (!adjDynamic && Math.floor(raw) !== districtAdjacency(map, t, id)) {
          throw new Error(`dadj mismatch @${t.index} ${id}: floor(${raw}) != ${districtAdjacency(map, t, id)}`);
        }
        return raw;
      }),
      // per placeable district: the adjacency this tile's removable feature lends
      // to a neighbour, dropped when a city founds here (foundCity clears it).
      fadj: PLACEABLE_DISTRICTS.map((id) => featureAdjContribution(t, id)),
      // P4: the NON-removable feature's lent adjacency (today: the GS REEF's
      // Campus bonus). queueDistrict nulls ANY feature when it paves the tile
      // (P2), so the engine must withdraw this too — foundCity does NOT
      // (it only clears removable features).
      nfadj: PLACEABLE_DISTRICTS.map((id) => featureAdjContribution(t, id, false)),
      // The removable feature's OWN yields (C1-B3 gate catch): PLAYER founding
      // strips the feature, so a later loyalty-flip must read this center
      // stripped — rival founding does NOT strip, and the t=0 capitals were
      // exported already-stripped.
      fy: t.feature && FEATURES[t.feature].removable ? YIELD_KEYS.map((k) => FEATURES[t.feature!].yields?.[k] ?? 0) : [0, 0, 0, 0, 0, 0],
      // Aqueduct water source (requiresWaterSourceOrMountain): on a river, or
      // adjacent to a lake / oasis / mountain. Static — the adjacent-center part
      // is dynamic (the engine checks it against the city's live center).
      aqsrc:
        hasRiver(t) ||
        neighbors(map, t).some((n) => n.terrain === 'LAKE' || n.feature === 'OASIS' || isMountain(n))
          ? 1
          : 0,
      // this tile's static contributions to a nearby site's quality, one
      // per source (terrain, feature, resource) plus the hills flag —
      // siteQuality adds them as FOUR SEPARATE += steps, and candidate
      // qualities compare with strict >, so the engine must reproduce the
      // exact same floating-point add sequence (pre-summing shifts results
      // by an ulp and flips ties: 36.5 vs 36.49999999999999)
      sq: (['terrain', 'feature', 'resource'] as const).map((kind) => {
        const src =
          kind === 'terrain'
            ? TERRAINS[t.terrain]?.yields ?? {}
            : kind === 'feature'
              ? (t.feature ? FEATURES[t.feature]?.yields ?? {} : {})
              : (t.resource ? RESOURCES[t.resource]?.yields ?? {} : {});
        const s = src as { food?: number; production?: number; gold?: number };
        return (s.food ?? 0) * 1.2 + (s.production ?? 0) + (s.gold ?? 0) * 0.5;
      }),
      hl: t.elevation === 'HILLS' ? 1 : 0,
      // A-9 (#71): tile APPEAL contributions. `tileAppeal` (core/appeal.ts)
      // sums what each NEIGHBOUR contributes, so ship the per-tile
      // contribution and let the GPU gather it over `neigh`. `ap` is the
      // STATIC part (natural wonder +2, mountain +1, coast/lake +1) PLUS this
      // tile's t0 feature term; `apf` isolates that removable-feature term so
      // a chopped tile can subtract exactly it via feat_stripped. The rest is
      // DYNAMIC and recomputed GPU-side (completed built wonder +1,
      // MINE/QUARRY/OIL_WELL -1, INDUSTRIAL_ZONE/ENCAMPMENT -1).
      ap: (() => {
        let a = 0;
        if (t.wonder) a += 2;
        if (isMountain(t) && !t.wonder) a += 1;
        if (t.terrain === 'COAST' || t.terrain === 'LAKE') a += 1;
        if (t.feature === 'WOODS') a += 1;
        if (t.feature === 'RAINFOREST' || t.feature === 'MARSH') a -= 1;
        // #78: sourced additions — an adjacent OASIS is +1 and an adjacent
        // FLOODPLAINS is -1. Both are FEATURES, so both also belong in `apf`
        // below so a chop subtracts exactly the right amount.
        if (t.feature === 'OASIS') a += 1;
        if (t.feature === 'FLOODPLAINS') a -= 1;
        return a;
      })(),
      apf:
        t.feature === 'WOODS' || t.feature === 'OASIS'
          ? 1
          : t.feature === 'RAINFOREST' || t.feature === 'MARSH' || t.feature === 'FLOODPLAINS'
            ? -1
            : 0,
      // #78: the ON-TILE appeal term — "+1 if the tile is on a River or Lake".
      // NOT a neighbour contribution, so it cannot ride `ap`.
      aps: (t.riverMask ?? 0) !== 0 || t.terrain === 'LAKE' ? 1 : 0,
      // #78: appeal OVERRIDE. A natural-wonder tile is a fixed 5 and a mountain
      // tile a fixed 4, neither affected by neighbours; -999 means "no
      // override, compute normally". Only blanket auras (Eiffel Tower, Golden
      // Gate Bridge, Alvar Aalto, Charles Correa) would modify these, and none
      // are modelled.
      apo: t.wonder ? 5 : isMountain(t) ? 4 : -999,
      // AUDIT A-8: river-edge crossing bits for the rival MP walkers. The
      // GPU's neigh columns enumerate AXIAL_DIRS order (E NE NW W SW SE) —
      // the same order riverMask bits use — so bit d = crossing toward
      // neighbor column d, both engines.
      rm: t.riverMask ?? 0,
      cm: t.cliffMask ?? 0, // B-26 (#79): CLIFF edge mask — blocks embark/disembark
      // AUDIT A-13: the resource's own-improvement roster index — resource
      // tiles accept exactly this improvement (validImprovements' resource
      // branch). -1 = no resource; -9 = out of roster (FISHING_BOATS on sea
      // resources: water tiles a land builder can never reach, both engines).
      rq: (() => {
        if (!t.resource) return -1;
        const i = IMPROVEMENT_IDS.indexOf(RESOURCES[t.resource].improvement);
        return i >= 0 ? i : -9;
      })(),
      // FARM validity (phase 6a), STATIC part of validImprovements — split
      // by gate. fa_f: flat grass/plains (no feature) or floodplains,
      // ungated. fa_h: hill grass/plains (no feature), needs the hillFarms
      // civic. Both require no resource (resource tiles only accept the
      // resource's own improvement), no district/natural-wonder, passable,
      // land. Ownership, the already-improved check and dynamically-founded
      // city centers stay the engine's job.
      fa_f:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? // resource tiles accept only the resource's improvement, ungated,
            // with no terrain/water check (validImprovements' resource branch);
            // rice/wheat are farmed, so those tiles are FARM-buildable
            RESOURCES[t.resource]?.improvement === 'FARM'
          : !isWater(t) &&
            ((t.feature === null && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT') ||
              t.feature === 'FLOODPLAINS'))
          ? 1
          : 0,
      // hill farms are civic-gated and only for NON-resource tiles (resource
      // tiles are ungated in fa_f regardless of elevation).
      fa_h:
        !t.resource && !t.district && !t.wonder && !isImpassable(t) && !isWater(t) &&
        t.feature === null && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'HILLS'
          ? 1
          : 0,
      // MINE validity (STATIC part; tech-gated by MINING in the engine).
      // Non-resource: hills, no feature. A resource tile accepts only the
      // resource's own improvement, so it is MINE-buildable iff that resource
      // is mined (iron, etc.) — ungated by terrain, like fa_f's rice/wheat.
      mi:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'MINE'
          : !isWater(t) && t.elevation === 'HILLS' && t.feature === null)
          ? 1
          : 0,
      // LUMBER_MILL validity (tech-gated by CONSTRUCTION). Woods, non-resource
      // (a resource on woods takes the resource's improvement instead).
      lu:
        !t.resource && !t.district && !t.wonder && !isImpassable(t) && !isWater(t) && t.feature === 'WOODS'
          ? 1
          : 0,
      // post-CHOP variants (feature treated as removed): _strip_feature_at
      // switches farm/mine to these so a chopped WOODS/RAINFOREST tile becomes
      // farm/mine-able (TS validImprovementsIn gates on the LIVE feature).
      // B-27 (#71): SEASIDE_RESORT's STATIC half — flat G/P/D adjacent to a
      // COAST tile, on an unpaved passable tile. The two DYNAMIC halves stay
      // at runtime: the live feature test (a chop makes a tile eligible) and
      // the Breathtaking appeal test (neighbours change it).
      sr_c:
        !t.district && !t.wonder && !t.builtWonder && !isImpassable(t) && !isWater(t) &&
        !t.resource && t.elevation === 'FLAT' &&
        (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS' || t.terrain === 'DESERT') &&
        neighbors(map, t).some((n) => n.terrain === 'COAST')
          ? 1 : 0,
      // the tile carries NO feature right now (t0). A chop clears it, which the
      // engine tracks with feat_stripped — exactly the fa_f_c pattern.
      sr_nf: t.feature === null ? 1 : 0,
      fa_f_c:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'FARM'
          : !isWater(t) && (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT')
          ? 1 : 0,
      fa_h_c:
        !t.resource && !t.district && !t.wonder && !isImpassable(t) && !isWater(t) &&
        (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'HILLS'
          ? 1 : 0,
      mi_c:
        !t.district && !t.wonder && !isImpassable(t) &&
        (t.resource
          ? RESOURCES[t.resource]?.improvement === 'MINE'
          : !isWater(t) && t.elevation === 'HILLS')
          ? 1 : 0,
      // disaster statics: floodplain, drought-candidate (flat grass/plains),
      // desert, fertilizable (land, not mountain)
      fp: t.feature === 'FLOODPLAINS' ? 1 : 0,
      dc: (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT' ? 1 : 0,
      de: t.terrain === 'DESERT' ? 1 : 0,
      fz: !isWater(t) && t.elevation !== 'MOUNTAIN' ? 1 : 0,
    };
  });
  const volcanoes = map.tiles.filter((t) => t.volcano).map((t) => t.index);
  const landTiles = map.tiles.filter((t) => !isWater(t)).length;
  const maxCamps = Math.max(1, Math.floor(landTiles / 120));

  // Static per-site data, all precomputed at t=0. foundCity strips the
  // center tile's removable feature, so the stripped tile is what the
  // future city center will yield (for the capital the map tile is already
  // stripped, making this the same computation).
  function siteMeta(tileIndex: number, baseMaint: number) {
    const t = map.tiles[tileIndex];
    const stripped: Tile = {
      ...t,
      district: null,
      improvement: null,
      feature: t.feature && FEATURES[t.feature].removable ? null : t.feature,
    };
    const cy = tileYieldsForCenter(ctx, stripped);
    return {
      site: tileIndex,
      centerYields: YIELD_KEYS.map((k) => cy[k]),
      // pre-clamp food: disasters (fertility/drought) apply BEFORE the
      // city-center minimum, so the engine must redo the clamp live
      rawFood: tileYields(ctx, stripped).food,
      freshWater: hasFreshWater(map, t) ? 1 : 0,
      coastal: isCoastalLand(map, t) ? 1 : 0,
      riverAtCenter: hasRiver(t) ? 1 : 0,
      /** City-center district (+ Palace for the capital) upkeep at founding. */
      baseMaintenance: baseMaint,
    };
  }

  // Choose the candidate settle sites now, spaced out from the capital and
  // from each other (≥ CITY_MIN_DIST keeps every founding order legal); the
  // engine consumes this exact ordered list. Relax the spacing if a cramped
  // map can't fit N_EXTRA well-separated cities.
  const siteCands = scoreSettleSites(state, 60);
  const chosen: number[] = [];
  const capT = map.tiles[capital.centerIndex];
  for (const [minDist, maxFromCapital] of [
    [6, 9],
    [5, 9],
    [4, 11],
    [4, 99],
  ]) {
    for (const c of siteCands) {
      if (chosen.length >= N_EXTRA) break;
      if (chosen.includes(c.tileIndex)) continue;
      const t = map.tiles[c.tileIndex];
      // Compact empires survive rival loyalty pressure — far-flung colonies
      // planted next to a rival flip within a dozen turns.
      if (hexDistance(capT.col, capT.row, t.col, t.row) > maxFromCapital) continue;
      const anchors = [capital.centerIndex, ...chosen];
      if (anchors.every((a) => hexDistance(map.tiles[a].col, map.tiles[a].row, t.col, t.row) >= minDist)) {
        chosen.push(c.tileIndex);
      }
    }
    if (chosen.length >= N_EXTRA) break;
  }
  if (chosen.length < N_EXTRA) throw new Error(`seed ${seed}: only found ${chosen.length}/${N_EXTRA} settle sites`);
  state.plannedSettles = [...chosen];

  const cities = [siteMeta(capital.centerIndex, cityMaintenance(state, capital))];
  for (const c of chosen) cities.push(siteMeta(c, 0));

  const ownerInit = map.tiles.map((t) => t.cityId);
  const C_MAX = 1 + N_EXTRA;

  const knownBoosts = new Set(state.research.boosted);
  const boostSchedule: { turn: number; kind: string; idx: number }[] = [];
  const trace: number[][] = [];
  let settlersQueued = 0;

  const warriorTrained = new Set<number>();
  // #56 H2: the once-ever builder flag is replaced by a dynamic gate — the
  // capital re-trains a builder whenever none is alive or queued and a
  // builder job (owned unimproved-farmable OR owned pillaged tile) exists.
  const anyPlayerBuilder = (): boolean =>
    state.units.some((u2) => u2.owner === 'player' && u2.type === 'BUILDER' && (u2.charges ?? 0) > 0) ||
    state.cities.some((c2) => c2.queue.some((q) => q.kind === 'unit' && q.unit === 'BUILDER'));
  const builderJobExists = (): boolean =>
    state.map.tiles.some(
      (t2) => t2.cityId !== -1 && (t2.pillaged || (!t2.improvement && validImprovements(state, t2).includes('FARM'))),
    );
  // #56 H1: army scaling — alive player military + queued military across all
  // city queues (the per-city else-if loop naturally sees earlier cities'
  // queues this turn; the GPU mirrors with a city_seq prefix walk). Best =
  // highest combat among trainable units; strict > keeps UNITS table order on
  // ties (the GPU's argmax-first twin).
  const militaryCount = (): number => {
    let n = 0;
    for (const u2 of state.units) if (u2.owner === 'player' && (UNITS[u2.type]?.combat ?? 0) > 0) n += 1;
    for (const c2 of state.cities)
      for (const q of c2.queue) if (q.kind === 'unit' && q.unit && (UNITS[q.unit]?.combat ?? 0) > 0) n += 1;
    return n;
  };
  const bestMilitary = (): string => {
    let bestId = 'WARRIOR';
    let bestCombat = 0;
    for (const d of trainableUnits(state)) {
      if (d.combat > bestCombat) {
        bestId = d.id;
        bestCombat = d.combat;
      }
    }
    return bestId;
  };
  const placedDistricts = new Set<number>();
  // P2: districts cost production now — the capital QUEUES the next scaffold
  // district when idle (first unplaced spec, scaffold order, whose tech is in
  // AND a resource-free eligible tile exists; best floor(districtAdjacency),
  // ties lowest index). Returns true when one was queued. The GPU scripted
  // chain mirrors this branch exactly (same slot in the priority chain).
  const queueNextDistrict = (cap: City): boolean => {
    for (const spec of SCAFFOLD_DISTRICTS) {
      const di = PLACEABLE_DISTRICTS.indexOf(spec.id);
      // B9-R1: civic-unlocked scaffold entries gate on the civic tree.
      const unlocked = (spec.unlockKind === 'civic' ? state.research.civics : state.research.techs).includes(spec.unlockId);
      if (placedDistricts.has(di) || !unlocked) continue;
      let best = -1;
      let bestAdj = -1;
      for (const tile of state.map.tiles) {
        // AUDIT C-6: bonus-resource tiles are pickable (canPlaceDistrict
        // refuses luxury/strategic; queueDistrict strips the bonus at pave —
        // real Civ 6 placement rules).
        if (tile.cityId !== cap.id || tile.improvement) continue;
        if (!canPlaceDistrict(state, cap, spec.id, tile.index).ok) continue;
        const adj = districtAdjacency(state.map, tile, spec.id);
        if (adj > bestAdj) {
          bestAdj = adj;
          best = tile.index;
        }
      }
      if (best < 0) continue;
      queueDistrict(state, cap.id, spec.id, best);
      placedDistricts.add(di);
      return true;
    }
    return false;
  };
  const cityIds: number[] = state.cities.map((c) => c.id);
  for (let t = 0; t < N_TURNS; t++) {
    // Envoys: greedily back the neediest met city-state (fewest envoys,
    // ties to the lowest id) — the GPU scripted policy mirrors this.
    while (state.envoysAvailable > 0 && state.cityStates.some((cs) => cs.met)) {
      const pick = [...state.cityStates]
        .filter((cs) => cs.met)
        .sort((a, b) => a.envoys - b.envoys || a.id - b.id)[0];
      assignEnvoy(state, pick.id);
    }
    for (const city of state.cities) {
      if (city.queue.length > 0) continue;
      if (city.isCapital && city.population >= 2 && !anyPlayerBuilder() && builderJobExists()) {
        // One builder from the capital FIRST (phase 6a) — #56 H2: re-trained
        // whenever the last one spent its charges and jobs remain (was
        // once-ever). First-builder timing is unchanged; settlers still yield
        // to the builder.
        queueUnit(state, city.id, 'BUILDER');
      } else if (city.isCapital && settlersQueued < chosen.length && city.population >= SETTLER_POP_GATE) {
        queueSettler(state, city.id);
        settlersQueued += 1;
      } else if (!warriorTrained.has(city.id) && city.population >= 2) {
        // One defender per city: exercises training, spawn placement and
        // passive garrisons under the scripted gate (movement/attack are
        // the rollout gate's job).
        queueUnit(state, city.id, 'WARRIOR');
        warriorTrained.add(city.id);
      } else if (SCRIPTED_CAMPUS && city.isCapital && queueNextDistrict(city)) {
        // P2: queued the next scaffold district (it costs production now).
      } else if (city.population >= 2 && militaryCount() < 2 * state.cities.length) {
        // #56 H1: keep a standing army of 2 military units per city, replacing
        // losses with the best trainable unit — the passive one-warrior script
        // lost whole games to rival conquest before the 250t horizon.
        queueUnit(state, city.id, bestMilitary());
      } else {
        const next = cheapestBuilding(state, city);
        if (next) queueBuilding(state, city.id, next);
      }
    }
    // Scripted builders (phase 6a): build a FARM on the current tile if it is
    // a buildable, unimproved farm tile inside our borders; otherwise
    // single-step toward the nearest farm job (nearest by distance, ties to
    // lowest tile index; then the passable, civilian-free neighbour closest to
    // it, ties to direction order, moving only if strictly closer). The GPU
    // engine mirrors this exactly; none of it draws RNG.
    const nTiles = state.map.tiles.length;
    const blockedForBuilder = (ti: number): boolean =>
      state.units.some(
        (u2) =>
          u2.tileIndex === ti &&
          (u2.owner === 'barbarian' ||
            u2.owner === 'rival' ||
            (u2.owner === 'player' && UNITS[u2.type]?.charges !== undefined)),
      );
    for (const u of state.units) {
      if (u.owner !== 'player' || u.type !== 'BUILDER' || (u.charges ?? 0) <= 0) continue;
      const btile = state.map.tiles[u.tileIndex];
      if (btile.pillaged && btile.cityId !== -1) {
        // #56 H2: REPAIR first (the rival A-13 semantics — no charge spent,
        // the turn is; barb raids on player farmland finally get answered).
        btile.pillaged = false;
        u.movesLeft = 0;
        continue;
      }
      if (!btile.improvement && validImprovements(state, btile).includes('FARM')) {
        builderImprove(state, u.id, 'FARM');
        continue;
      }
      let best = -1;
      let bestKey = Infinity;
      for (const t of state.map.tiles) {
        // #56 H2: a job is any owned tile that is unimproved-farmable OR
        // pillaged (repair) — must match builderJobExists and the GPU walker.
        if (t.cityId === -1) continue;
        if (!(t.pillaged || (!t.improvement && validImprovements(state, t).includes('FARM')))) continue;
        const key = hexDistance(btile.col, btile.row, t.col, t.row) * (nTiles + 1) + t.index;
        if (key < bestKey) {
          bestKey = key;
          best = t.index;
        }
      }
      if (best < 0) continue;
      const target = state.map.tiles[best];
      const dHere = hexDistance(btile.col, btile.row, target.col, target.row);
      let stepDir = -1;
      let stepKey = Infinity;
      for (let dir = 0; dir < 6; dir++) {
        const n = neighborTile(state.map, btile, dir);
        if (!n || !unitPassable(n) || blockedForBuilder(n.index)) continue;
        const key = hexDistance(n.col, n.row, target.col, target.row) * 8 + dir;
        if (key < stepKey) {
          stepKey = key;
          stepDir = dir;
        }
      }
      if (stepDir >= 0 && Math.floor(stepKey / 8) < dHere) {
        const n = neighborTile(state.map, btile, stepDir)!;
        u.path = [n.index];
        walkPath(state, u);
      }
    }
    // (P2: scripted districts moved into the per-city production chain above —
    // the capital queues them at districtCost like every other build.)
    // CIV6_EXPORT_DEBUG=<seed>: narrate that seed's scripted game (the
    // SEED_OVERRIDES diagnosis knob — see the map above).
    const evBefore = state.eventLog.length;
    endTurn(state);
    if (process.env.CIV6_EXPORT_DEBUG === String(seed)) {
      for (const line of state.eventLog.slice(evBefore)) console.log(`t${state.turn - 1} ${line}`);
      console.log(`t${state.turn - 1} cities=${state.cities.length} pop=${state.cities.map((c) => c.population).join(',')}`);
    }
    for (const c of state.cities) {
      if (cityIds.includes(c.id)) continue;
      if (cityIds.length < C_MAX) { cityIds.push(c.id); continue; }
      // P5/S2: a 7th-plus ever-founded city reuses the first dead column,
      // mirroring the GPU's first-free-hole slot when founded_n >= C.
      const hole = cityIds.findIndex((id) => !state.cities.some((x) => x.id === id));
      if (hole >= 0) cityIds[hole] = c.id;
    }
    for (const id of state.research.boosted) {
      if (knownBoosts.has(id)) continue;
      knownBoosts.add(id);
      if (techIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'tech', idx: techIdx.get(id)! });
      else if (civicIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'civic', idx: civicIdx.get(id)! });
    }
    trace.push(traceRow(state, cityIds, C_MAX, CS_MAX, R_MAX));
  }
  // A collapsed empire is a legitimate outcome for NON-capital cities —
  // loyalty flips ARE the hostile world working. But rival CONQUEST can
  // kill the capital too (A-13/A-15 made rivals strong enough); a fully
  // dead player makes the fixture unusable → add a SEED_OVERRIDES entry.
  if (state.cities.length < 1) {
    throw new Error(`seed ${seed}: no cities left by turn ${N_TURNS} — add a SEED_OVERRIDES entry (diagnose with CIV6_EXPORT_DEBUG=${seed})`);
  }

  const fixture = {
    seed,
    width: map.width,
    height: map.height,
    unitsMode: 1,
    disasters: 1,
    volcanoes,
    maxCamps,
    rngInit,
    csMax: CS_MAX,
    rMax: R_MAX,
    cityStates: csAtStart,
    rivals: state.rivals.map((r, i) => {
      // C1-A3: the GPU maps rival ARRAY INDEX r to civ r+1 (src/core/civs.ts
      // numbering), which is only sound while ids stay contiguous 0..R-1.
      if (r.id !== i) throw new Error(`rival ids must be contiguous 0..R-1 (got id ${r.id} at index ${i})`);
      return {
        id: r.id,
        aggression: r.aggression,
        treasury: 0, // VP-G1: the fixture is a t0 state — rivals start bankless (r.treasury here is the LIVE post-trace object, like the Init-map snapshots avoid)
        cities: rivalCitiesInit.get(r.id) ?? [],
        units: rivalUnitsInit.get(r.id) ?? [],
      };
    }),
    cities,
    tiles,
    ownerInit,
    eraScoreInit, // B-24: unified-civ era score at t0
    boostSchedule,
    trace,
  };
  writeFileSync(`${OUT}/seed${seed}.json`, JSON.stringify(fixture));
  const pops = state.cities.map((c) => c.population).join('/');
  const envoys = state.cityStates.map((cs) => cs.envoys).join('/');
  const wars = state.rivals.filter((r) => r.atWar).length;
  console.log(
    `seed${seed}.json: ${N_TURNS} turns, ${state.cities.length}/${C_MAX} cities, pop ${pops}, ` +
      `${state.cityStates.length} CS (envoys ${envoys}), ${state.rivals.length} rivals (${wars} at war), ${boostSchedule.length} boosts`,
  );
}
// ROUND B10 lesson: a SEED_OVERRIDES change leaves the PREVIOUS seed's
// fixture on disk (fixtures are gitignored, so a worktree agent's rm never
// reaches the main checkout). Stale orphans poison BOTH downstream gates:
// parity_test sweeps every seed*.json (old-engine fixture vs new engine =
// guaranteed mismatch), and the rollout derives its game set from the
// fixture list, so 24+k fixtures shift the shard batch shapes and BLAS
// float association past the milli tolerances. Sweep them here — the
// emit set is the single source of truth.
const emitted = new Set<string>();
for (let s = 0; s < N_SEEDS; s++) emitted.add(`seed${seedFor(s)}.json`);
for (const f of readdirSync(OUT)) {
  if (/^seed\d+\.json$/.test(f) && !emitted.has(f)) {
    rmSync(`${OUT}/${f}`);
    console.log(`orphaned fixture removed: ${f} (not in the current SEED_OVERRIDES emit set)`);
  }
}
console.log(`\nFixtures in ${OUT}/ — run gpu/parity_test.py against them.`);
