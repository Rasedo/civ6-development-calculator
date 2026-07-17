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

import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, endTurn, foundCity, queueBuilding, queueDistrict, queueSettler , TURN_LIMIT } from '../src/core/game';
import { queueUnit, walkPath, builderImprove, moveCostInto, trainableUnits } from '../src/core/units';
import { IMPROVEMENTS } from '../src/data/improvements';
import { validImprovements, canPlaceDistrict } from '../src/core/rules';
import { terrainDefense } from '../src/core/combat';
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
  CS_DISTRICT_BONUS,
  CS_MAX_HP,
} from '../src/data/cityStates';
import { GP_CLASSES, GREAT_PEOPLE, gpCost, GP_CLASS_DISTRICT } from '../src/data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, PANTHEON_FAITH_COST, type BeliefEffects } from '../src/data/religion';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION } from '../src/data/projects';
import { BUILT_WONDERS } from '../src/data/builtWonders';
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
} from '../src/data/rivals';
import { scoreSettleSites } from '../src/core/advisor';
import { availableBuildings } from '../src/core/rules';
import { makeYieldCtx } from '../src/core/effects';
import { tileYields, districtAdjacency } from '../src/core/yields';
import { tileYieldsForCenter, cityMaintenance } from '../src/core/city';
import { BALANCED_WEIGHTS } from '../src/core/empirePlanner';
import { traceRow } from './gpu-trace';
import { hexDistance, neighbors, neighborTile } from '../src/core/hex';
import { hasFreshWater, hasRiver, isCoastalLand, isCoastalWater, isImpassable, isMountain, isWater } from '../src/core/query';
import { unitPassable } from '../src/core/units';
import { MAX_BARB_PER_CAMP } from '../src/core/combat';
import { UNITS, UNIT_HP, CITY_MAX_HP, WALLS_HP } from '../src/data/units';
import { YIELD_KEYS, type City, type DistrictId, type GameState, type Tile } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { DISTRICTS, PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS, type AdjacencySource } from '../src/data/districts';
import { IMPROVEMENTS } from '../src/data/improvements';
import { FEATURES } from '../src/data/features';
import { TECHS } from '../src/data/techs';
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
} from '../src/data/constants';

// The GPU improvement index space (tile.improvement values, build codes 13-15).
// AUDIT A-13: the roster grew — indices 0-2 stay stable (every existing
// plane/consumer keys on them); the resource-only improvements append.
// FISHING_BOATS stays OUT: water-only, and a land builder can never stand
// on the tile (unreachable in both engines).
const IMPROVEMENT_IDS = ['FARM', 'MINE', 'LUMBER_MILL', 'QUARRY', 'PASTURE', 'CAMP', 'PLANTATION', 'OIL_WELL'];
// Canonical luxury catalog order for the per-tile `lux` plane.
const LUXURY_IDS = Object.values(RESOURCES)
  .filter((r) => r.category === 'luxury')
  .map((r) => r.id);

const N_SEEDS = Number(process.argv[2] ?? 24);
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
  .filter((b) => BUILDING_DISTRICTS.has(b.district) && b.id !== 'PALACE' && !b.worship)
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
// (structurally unreachable for BOTH engines, so parity holds): policy
// rows, distinctTypes district rows (7 different districts — D3), and
// FISHING_BOATS improvement rows (out of roster, water-unreachable).
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
  } else if (c.kind === 'district' && !c.distinctTypes) {
    // District eurekas/inspirations (STATE_WORKFORCE: any specialty district;
    // MATHEMATICS: 3; per-type ones). distinctTypes conditions (7 different
    // districts) wait for D3, when more than one district type can exist.
    const dtype = c.type ? PLACEABLE_DISTRICTS.indexOf(c.type) : -1;
    row = { kind: 'district', dtype, count: c.count };
  } else if (c.kind === 'greatPeople') {
    // Great-person eurekas (EDUCATION: a Scientist; HUMANISM: an Artist;
    // ENLIGHTENMENT: any 3). cls -1 = any class (sum); else the GP_CLASSES
    // index, which is the GPU's gp_earned column (tracks the first 5 classes).
    const cls = c.class ? GP_CLASSES.indexOf(c.class) : -1;
    if (!c.class) row = { kind: 'greatPeople', cls: -1, count: c.count };
    else if (cls >= 0 && cls < 5) row = { kind: 'greatPeople', cls, count: c.count };
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
  // B-15 war weariness (mirrors data/rivals.ts): integer accumulator → flat
  // empire-wide amenity penalty for the player AND each rival civ.
  warWeariness: {
    perTurn: WAR_WEARINESS_PER_TURN,
    decay: WAR_WEARINESS_DECAY,
    perAmenity: WAR_WEARINESS_PER_AMENITY,
    cap: WAR_WEARINESS_CAP,
  },
  boosts: boostRows,
  // City-state rules (mirrors data/cityStates.ts; covered scope only — the
  // 3/6-envoy district tiers are inert without districts, and the CHIEFDOM
  // influence tier is 0, so influence accrues at the flat base rate).
  cs: {
    envoyCost: ENVOY_COST,
    influencePerTurn: INFLUENCE_PER_TURN,
    capitalBonus: CS_CAPITAL_BONUS,
    questCooldown: QUEST_COOLDOWN,
    questEnvoys: QUEST_ENVOYS,
    // V-CS: attackCityState/captureCityState (siege hp + the militaristic +6)
    maxHp: CS_MAX_HP,
    militaristicIdx: CITY_STATE_TYPES.indexOf('militaristic'),
    // per CS type (by index): which yield column its envoys boost
    typeYieldIdx: CITY_STATE_TYPES.map((t) => YIELD_KEYS.indexOf(CS_TYPE_YIELD[t])),
    // per CS type: the district whose count carries the 3-/6-envoy bonus, and
    // the per-district amount (csEnvoyBonuses: +CS_DISTRICT_BONUS at >=3, again
    // at >=6, added to each owned completed district of that type).
    typeDistrictIdx: CITY_STATE_TYPES.map((t) => PLACEABLE_DISTRICTS.indexOf(CS_TYPE_DISTRICT[t])),
    districtBonus: CS_DISTRICT_BONUS,
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
    warMinTurns: RIVAL_WAR_MIN_TURNS,
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
    pantheonPool: Object.keys(PANTHEONS).length,
    followerPool: Object.keys(FOLLOWER_BELIEFS).length,
    founderPool: Object.keys(FOUNDER_BELIEFS).length,
    // B-18: Enhancer pool size. The GPU does not yet race enhancers (rival
    // enhancer claiming + the mirrored draw are a deferred follow-up); this
    // documents the slot for that work.
    enhancerPool: Object.keys(ENHANCER_BELIEFS).length,
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
    // B-25: space-race projects are TS-only (the GPU space-race SIMULATION is
    // deferred — see ROUND_B2_LOG). They are gated on Information/Future techs
    // no civ reaches in the 100-turn gate AND sit last so the rival greedy
    // `.find` never selects them, so filtering them here keeps the GPU project
    // table (and every project index) byte-identical — both engines inert.
    rows: Object.values(PROJECTS).filter((p) => !p.space).map((p) => ({
      d: PLACEABLE_DISTRICTS.indexOf(p.district),
      y: p.yield ? YIELD_KEYS.indexOf(p.yield) : -1,
      g: p.gpClass ? GP_CLASSES.indexOf(p.gpClass) : -1,
    })),
    yieldFraction: PROJECT_YIELD_FRACTION,
    gppFraction: PROJECT_GPP_FRACTION,
  },
  // Barbarian rules (mirrors combat.ts). dmgBase[d+60] = 30·e^(0.04·d) is
  // computed HERE so both engines share the exact same doubles — libm exp()
  // may differ by an ulp between runtimes, and damage rounds to integers.
  combat: {
    unitHp: UNIT_HP,
    cityMaxHp: CITY_MAX_HP,
    maxBarbPerCamp: MAX_BARB_PER_CAMP,
    campSpawnChance: 0.08,
    garrisonGrowChance: 0.1,
    spearmanAfterTurn: 60,
    cityHealPerTurn: 20,
    wallsHp: WALLS_HP, // AUDIT B-1: the ANCIENT_WALLS outer-defense pool cap
    unitHealPerTurn: 10,
    unitCombat: [UNITS.WARRIOR.combat, UNITS.SPEARMAN.combat], // barb types 0/1
    campClearReward: 50,
    dmgBase: Array.from({ length: 121 }, (_, i) => 30 * Math.exp(0.04 * (i - 60))),
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
    // V-R: ranged strike stats (Slinger 15/1, Archer 25/2); 0 = melee-only.
    rangedStrength: u.ranged?.strength ?? 0,
    rangedRange: u.ranged?.range ?? 0,
    // AUDIT A-8: full MP per turn — the rival walkers' budget.
    moves: u.moves,
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
    hillFarmsCivic: civicList.findIndex((c) => (c.effects ?? []).some((e) => e.kind === 'hillFarms')),
    farmAdjCivic: civicList.findIndex((c) => (c.effects ?? []).some((e) => e.kind === 'farmAdjacency')),
    farmAdjTech: techList.findIndex((t) => (t.effects ?? []).some((e) => e.kind === 'farmAdjacency')),
    mineUnlockTech: techList.findIndex((t) =>
      t.effects.some((e) => e.kind === 'unlockImprovement' && e.improvement === 'MINE'),
    ),
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
    // center + water source, lowest tile, non-specialty + housing).
    place: SCAFFOLD_DISTRICTS.map(({ id, unlockId, placement }) => ({
      idx: PLACEABLE_DISTRICTS.indexOf(id),
      unlockTech: techIdx.get(unlockId) ?? -1,
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
    unlockTech: buildingUnlockTech.get(b.id) ?? -1,
    unlockCivic: buildingUnlockCivic.get(b.id) ?? -1,
    // District buildings are gated (mirrors availableBuildings) on the city
    // owning a completed district of this type and having a prerequisite.
    reqDistrict: b.district === 'CITY_CENTER' ? -1 : PLACEABLE_DISTRICTS.indexOf(b.district),
    reqBuildings: (b.requiresAny ?? []).map((id) => buildingIdx.get(id) ?? -1).filter((i) => i >= 0),
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
  2: 9028, // 9027: Rome+Egypt double war t21, capital conquered t36, last city flipped t84
  // #56: NOT an army-fixable death — Egypt war t21, Brightwater defects by
  // LOYALTY t54 (settled into Egypt's pressure blob), capital conquered t61.
  // Structural for a passive script with fixed t0 settle sites (the 9027
  // shape); H1/H2 verified not to help (diagnosed at 250t, 2026-07-17).
  4: 9054, // 9053: see above
};
for (let s = 0; s < N_SEEDS; s++) {
  const seed = SEED_OVERRIDES[s] ?? 9001 + s * 13;
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
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  const capital = state.cities[0];
  const ctx = makeYieldCtx(state);
  const map = state.map;
  // Captured AFTER creation: city-state and rival placement draw from the
  // in-state RNG, so the loop starts mid-stream, not at the seed.
  const rngInit = state.rngState >>> 0;
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
      // land units may stand here (mirrors unitPassable)
      pass: unitPassable(t) ? 1 : 0,
      work: isImpassable(t) ? 0 : 1, // C1-B1: citizen-workable (water IS workable; ice/mountains are not)
      // Luxury amenity source (mirrors luxuryAmenities): the luxury's catalog
      // index + the improvement index that activates it (-9 = its improvement
      // is outside the GPU roster, so it can never activate in either engine).
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
      tmove: (moveCostInto(t) - 1) * 3,
      // statically camp-eligible (dynamic exclusions — ownership, distance
      // to cities/camps — are the engine's job; mirrors campCandidates)
      camp: !isWater(t) && !isImpassable(t) && !t.wonder && !t.district && !t.builtWonder && !t.goodyHut ? 1 : 0,
      // city-state territory (static — placed at game creation)
      cs: t.csId ?? -1,
      // rival territory at t=0 (grows dynamically in the engine)
      rv: t.rivalId ?? -1,
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
      // ownership and dynamic districts are the engine's job)
      st: !isWater(t) && !isImpassable(t) && !t.wonder && t.feature !== 'OASIS' && !t.district ? 1 : 0,
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
      // AUDIT A-8: river-edge crossing bits for the rival MP walkers. The
      // GPU's neigh columns enumerate AXIAL_DIRS order (E NE NW W SW SE) —
      // the same order riverMask bits use — so bit d = crossing toward
      // neighbor column d, both engines.
      rm: t.riverMask ?? 0,
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
      if (placedDistricts.has(di) || !state.research.techs.includes(spec.unlockId)) continue;
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
    cityStates: state.cityStates.map((cs) => ({
      id: cs.id,
      type: CITY_STATE_TYPES.indexOf(cs.type),
      center: cs.centerIndex,
      pop: 3,
    })),
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
console.log(`\nFixtures in ${OUT}/ — run gpu/parity_test.py against them.`);
