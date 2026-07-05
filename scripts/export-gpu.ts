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
import { createGame, endTurn, foundCity, queueBuilding, queueSettler } from '../src/core/game';
import { queueUnit, walkPath, builderImprove } from '../src/core/units';
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
} from '../src/data/cityStates';
import { GP_CLASSES, GREAT_PEOPLE, gpCost } from '../src/data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS } from '../src/data/religion';
import { TERRAINS } from '../src/data/terrains';
import {
  RIVAL_GROWTH_FACTOR,
  RIVAL_MAX_POP,
  RIVAL_MAX_CITIES,
  RIVAL_BORDER_PERIOD,
  RIVAL_GPP_RATE,
  RIVAL_PANTHEON_TURN,
  RIVAL_RELIGION_TURN,
  RIVAL_WAR_MIN_TURNS,
  RIVAL_CITY_MAX_HP,
  RIVAL_WORK_RADIUS,
  RIVAL_PROD_TO_SETTLER,
  RIVAL_PROD_TO_MILITARY,
  LOYALTY_MAX,
  LOYALTY_RANGE,
  LOYALTY_PRESSURE_SCALE,
  LOYALTY_AMENITY,
} from '../src/data/rivals';
import { scoreSettleSites } from '../src/core/advisor';
import { availableBuildings } from '../src/core/rules';
import { makeYieldCtx } from '../src/core/effects';
import { tileYields, districtAdjacency } from '../src/core/yields';
import { tileYieldsForCenter, cityMaintenance } from '../src/core/city';
import { BALANCED_WEIGHTS } from '../src/core/empirePlanner';
import { traceRow } from './gpu-trace';
import { hexDistance, neighbors, neighborTile } from '../src/core/hex';
import { hasFreshWater, hasRiver, isCoastalLand, isImpassable, isWater } from '../src/core/query';
import { unitPassable } from '../src/core/units';
import { MAX_BARB_PER_CAMP } from '../src/core/combat';
import { UNITS, UNIT_HP, CITY_MAX_HP } from '../src/data/units';
import { YIELD_KEYS, type City, type DistrictId, type GameState, type Tile } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { DISTRICTS, PLACEABLE_DISTRICTS, type AdjacencySource } from '../src/data/districts';
import { IMPROVEMENTS } from '../src/data/improvements';
import { FEATURES } from '../src/data/features';
import { TECHS } from '../src/data/techs';
import { CIVICS } from '../src/data/civics';
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
} from '../src/data/constants';

const N_SEEDS = Number(process.argv[2] ?? 24);
const N_TURNS = Number(process.argv[3] ?? 100);
const N_EXTRA = Number(process.argv[4] ?? 5); // candidate sites beyond the capital
const SETTLER_POP_GATE = 2; // capital waits for pop 2 before training a settler
const CS_MAX = 3;
const R_MAX = 2;
const OUT = 'gpu/fixtures';

mkdirSync(OUT, { recursive: true });

// --- rules -------------------------------------------------------------------

const techList = Object.values(TECHS);
const civicList = Object.values(CIVICS);
const techIdx = new Map(techList.map((t, i) => [t.id, i]));
const civicIdx = new Map(civicList.map((c, i) => [c.id, i]));

// Phase 1/2 buildable set: City Center buildings only (no other districts exist).
const centerBuildings = Object.values(BUILDINGS)
  .filter((b) => b.district === 'CITY_CENTER' && b.id !== 'PALACE' && !b.worship)
  .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
const buildingIdx = new Map(centerBuildings.map((b, i) => [b.id, i]));
const buildingUnlockTech = new Map<string, number>();
techList.forEach((t, i) => {
  for (const fx of t.effects ?? []) {
    if (fx.kind === 'unlockBuilding') buildingUnlockTech.set(fx.building, i);
  }
});

// Boost conditions the covered scope can actually trigger (everything else
// — improvements, districts, great people, wonders, policies — is
// structurally unreachable in this scenario for BOTH engines, so skipping
// it preserves parity).
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
    // Improvement eurekas for the improvements a builder can actually place
    // (FARM=0, MINE=1, LUMBER_MILL=2). WHEEL/STEEL want a mine ON a resource,
    // APPRENTICESHIP three mines, MASS_PRODUCTION a lumber mill, IRRIGATION a
    // farmed resource. Out-of-scope improvements (quarry/pasture/...) can't be
    // built, so their eurekas never fire in either engine — left skipped.
    const imp = c.id === 'FARM' ? 0 : c.id === 'MINE' ? 1 : c.id === 'LUMBER_MILL' ? 2 : -1;
    if (imp >= 0) row = { kind: 'improvement', imp, count: c.count, onResource: c.onResource ? 1 : 0 };
  } else if (c.kind === 'district' && !c.distinctTypes) {
    // District eurekas/inspirations (STATE_WORKFORCE: any specialty district;
    // MATHEMATICS: 3; per-type ones). distinctTypes conditions (7 different
    // districts) wait for D3, when more than one district type can exist.
    const dtype = c.type ? PLACEABLE_DISTRICTS.indexOf(c.type) : -1;
    row = { kind: 'district', dtype, count: c.count };
  }
  if (row) boostRows.push({ target, idx, ...row });
}

// Adjacency-source order shared with the engine (indices into this list are
// what `districts[].adjacency[].src` refers to). Static sources (known at t=0)
// come first conceptually but the order here is just the stable wire encoding.
const ADJ_SRC: AdjacencySource[] = [
  'MOUNTAIN', 'RAINFOREST', 'WOODS', 'REEF', 'NATURAL_WONDER', 'BUILT_WONDER',
  'RIVER', 'DISTRICT', 'CITY_CENTER', 'HARBOR_DISTRICT', 'SEA_RESOURCE', 'MINE_OR_QUARRY',
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
const SCAFFOLD_DISTRICTS: { id: DistrictId; unlockId: string }[] = [
  { id: 'CAMPUS', unlockId: 'WRITING' },
  { id: 'HOLY_SITE', unlockId: 'ASTROLOGY' },
  { id: 'COMMERCIAL_HUB', unlockId: 'CURRENCY' },
];

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

const rules = {
  focusBase: [2, 2, 1, 1, 1, 1], // food, production, gold, science, culture, faith
  citizenScience: CITIZEN_SCIENCE,
  citizenCulture: CITIZEN_CULTURE,
  foodPerCitizen: FOOD_PER_CITIZEN,
  centerMinFood: CITY_CENTER_MIN_FOOD,
  centerMinProduction: CITY_CENTER_MIN_PRODUCTION,
  housing: { fresh: HOUSING_FRESH_WATER, coastal: HOUSING_COASTAL, none: HOUSING_NO_WATER },
  boostFraction: BOOST_FRACTION,
  // amenityTier(balance) thresholds, highest first (see data/constants.ts)
  amenityTiers: [
    { min: 3, growth: 1.2, yield: 1.1 },
    { min: 1, growth: 1.1, yield: 1.05 },
    { min: -1, growth: 1.0, yield: 1.0 },
    { min: -4, growth: 0.85, yield: 0.95 },
    { min: -999, growth: 0.7, yield: 0.9 },
  ],
  // Mirrors settlerCost(): 80 + 30 × (cities − 1 + settlers banked + settlers queued).
  scenario: { settlerBase: 80, settlerPerCity: 30, settlerPopGate: SETTLER_POP_GATE },
  // Mirrors empireScore(state, 'balanced'): Σ cities (pop × popWeight + yields · weights).
  score: { popWeight: 3, yieldWeights: YIELD_KEYS.map((k) => BALANCED_WEIGHTS[k] ?? 0) },
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
    // per CS type (by index): which yield column its envoys boost
    typeYieldIdx: CITY_STATE_TYPES.map((t) => YIELD_KEYS.indexOf(CS_TYPE_YIELD[t])),
  },
  // Rival-civ pacing (mirrors data/rivals.ts). loyaltyAmenity is keyed by
  // amenity-tier INDEX in the same order as amenityTiers above. The
  // pantheon/belief pools matter only as SIZES: a rival's pick consumes a
  // draw and shrinks the pool, but the identity is inert in covered scope.
  rivals: {
    growthFactor: RIVAL_GROWTH_FACTOR,
    maxPop: RIVAL_MAX_POP,
    maxCities: RIVAL_MAX_CITIES,
    settlerBase: 90, // RIVAL_SETTLER_COST(c) = 90 + 40·max(0, c − 1)
    settlerPer: 40,
    borderPeriod: RIVAL_BORDER_PERIOD,
    gppRate: RIVAL_GPP_RATE,
    pantheonTurn: RIVAL_PANTHEON_TURN,
    religionTurn: RIVAL_RELIGION_TURN,
    warMinTurns: RIVAL_WAR_MIN_TURNS,
    cityMaxHp: RIVAL_CITY_MAX_HP,
    workRadius: RIVAL_WORK_RADIUS,
    prodToSettler: RIVAL_PROD_TO_SETTLER,
    prodToMilitary: RIVAL_PROD_TO_MILITARY,
    loyaltyMax: LOYALTY_MAX,
    loyaltyRange: LOYALTY_RANGE,
    loyaltyScale: LOYALTY_PRESSURE_SCALE,
    loyaltyAmenity: ['Ecstatic', 'Happy', 'Content', 'Displeased', 'Unhappy'].map((n) => LOYALTY_AMENITY[n] ?? 0),
    gpCosts: Array.from({ length: 8 }, (_, n) => gpCost(n)),
    gpRoster: GP_CLASSES.map((c) => GREAT_PEOPLE[c].length),
    pantheonPool: Object.keys(PANTHEONS).length,
    followerPool: Object.keys(FOLLOWER_BELIEFS).length,
    founderPool: Object.keys(FOUNDER_BELIEFS).length,
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
    ids: ['FARM', 'MINE', 'LUMBER_MILL'],
    farmFood: IMPROVEMENTS.FARM.yields.food ?? 1,
    farmHousing: IMPROVEMENTS.FARM.housing,
    mineProd: IMPROVEMENTS.MINE.yields.production ?? 1,
    lumberProd: IMPROVEMENTS.LUMBER_MILL.yields.production ?? 1,
    builderIdx: Object.values(UNITS).findIndex((u) => u.id === 'BUILDER'),
    hillFarmsCivic: civicList.findIndex((c) => (c.effects ?? []).some((e) => e.kind === 'hillFarms')),
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
      cost: d.cost,
      adjYield: d.adjacencyYield ? YIELD_KEYS.indexOf(d.adjacencyYield) : -1,
      adjacency: d.adjacency.map((a) => ({ src: ADJ_SRC.indexOf(a.source), amount: a.amount })),
      housing: d.housing,
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
    place: SCAFFOLD_DISTRICTS.map(({ id, unlockId }) => ({
      idx: PLACEABLE_DISTRICTS.indexOf(id),
      unlockTech: techIdx.get(unlockId) ?? -1,
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
    // Mirrors city.ts buildingMaintenance (derived, not stored).
    maintenance: b.cost === 0 ? 0 : b.cost >= 500 ? 3 : b.cost >= 190 ? 2 : 1,
    river: b.special === 'WATER_MILL',
    unlockTech: buildingUnlockTech.get(b.id) ?? -1,
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
};
writeFileSync(`${OUT}/rules.json`, JSON.stringify(rules));
console.log(
  `rules.json: ${rules.buildings.length} buildings, ${rules.techs.length} techs, ${rules.civics.length} civics, ${boostRows.length} detectable boosts`,
);

// --- per-seed fixtures ----------------------------------------------------------

function cheapestBuilding(state: GameState, city: City): string | null {
  const avail = availableBuildings(state, city)
    .filter((b) => b.district === 'CITY_CENTER')
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  return avail[0]?.id ?? null;
}

for (let s = 0; s < N_SEEDS; s++) {
  const seed = 9001 + s * 13;
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

  const tiles = map.tiles.map((t) => {
    const y = tileYields(ctx, t);
    return {
      y: YIELD_KEYS.map((k) => Math.round(y[k] * 1000) / 1000),
      workable: !isImpassable(t) && !t.district ? 1 : 0,
      res: t.resource ? (RESOURCES[t.resource].category === 'luxury' ? 3 : RESOURCES[t.resource].category === 'strategic' ? 2 : 1) : 0,
      // near a natural wonder (for the ASTROLOGY-style eureka)
      wnear: t.wonder !== null || neighbors(map, t).some((n) => n.wonder !== null) ? 1 : 0,
      // land units may stand here (mirrors unitPassable)
      pass: unitPassable(t) ? 1 : 0,
      // defender bonus (mirrors terrainDefense: hills / woods / rainforest / marsh)
      tdef: terrainDefense(t),
      // statically camp-eligible (dynamic exclusions — ownership, distance
      // to cities/camps — are the engine's job; mirrors campCandidates)
      camp: !isWater(t) && !isImpassable(t) && !t.wonder && !t.district && !t.builtWonder && !t.goodyHut ? 1 : 0,
      // city-state territory (static — placed at game creation)
      cs: t.csId ?? -1,
      // rival territory at t=0 (grows dynamically in the engine)
      rv: t.rivalId ?? -1,
      wt: isWater(t) ? 1 : 0,
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
  let builderTrained = false;
  const placedDistricts = new Set<number>();
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
      if (city.isCapital && !builderTrained && city.population >= 2) {
        // One builder from the capital FIRST (phase 6a): the capital trains
        // settlers for the rest of the game, so the builder must precede them.
        queueUnit(state, city.id, 'BUILDER');
        builderTrained = true;
      } else if (city.isCapital && settlersQueued < chosen.length && city.population >= SETTLER_POP_GATE) {
        queueSettler(state, city.id);
        settlersQueued += 1;
      } else if (!warriorTrained.has(city.id) && city.population >= 2) {
        // One defender per city: exercises training, spawn placement and
        // passive garrisons under the scripted gate (movement/attack are
        // the rollout gate's job).
        queueUnit(state, city.id, 'WARRIOR');
        warriorTrained.add(city.id);
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
      if (!btile.improvement && validImprovements(state, btile).includes('FARM')) {
        builderImprove(state, u.id, 'FARM');
        continue;
      }
      let best = -1;
      let bestKey = Infinity;
      for (const t of state.map.tiles) {
        if (t.cityId === -1 || t.improvement) continue;
        if (!validImprovements(state, t).includes('FARM')) continue;
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
    // Scripted districts (D2b/D3b): place each scaffold district IN ORDER, once,
    // when its unlock tech is in and the per-pop specialty cap allows another
    // (canPlaceDistrict enforces the cap). Best floor(districtAdjacency) tile,
    // ties lowest index; after the builders, before endTurn so this turn's
    // yields reflect it. The GPU mirrors this list and choice.
    if (SCRIPTED_CAMPUS) {
      const cap = state.cities.find((c) => c.isCapital);
      if (cap) {
        for (const spec of SCAFFOLD_DISTRICTS) {
          const di = PLACEABLE_DISTRICTS.indexOf(spec.id);
          if (placedDistricts.has(di) || !state.research.techs.includes(spec.unlockId)) continue;
          let best = -1;
          let bestAdj = -1;
          for (const tile of map.tiles) {
            if (tile.cityId !== cap.id || tile.improvement) continue;
            if (!canPlaceDistrict(state, cap, spec.id, tile.index).ok) continue;
            const adj = districtAdjacency(map, tile, spec.id);
            if (adj > bestAdj) {
              bestAdj = adj;
              best = tile.index;
            }
          }
          if (best >= 0) {
            const tile = map.tiles[best];
            tile.district = spec.id;
            tile.districtComplete = true;
            cap.districts.push({ type: spec.id, tileIndex: best });
            placedDistricts.add(di);
          }
        }
      }
    }
    endTurn(state);
    for (const c of state.cities) {
      if (!cityIds.includes(c.id)) cityIds.push(c.id);
    }
    for (const id of state.research.boosted) {
      if (knownBoosts.has(id)) continue;
      knownBoosts.add(id);
      if (techIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'tech', idx: techIdx.get(id)! });
      else if (civicIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'civic', idx: civicIdx.get(id)! });
    }
    trace.push(traceRow(state, cityIds, C_MAX, CS_MAX, R_MAX));
  }
  // A collapsed empire is a legitimate outcome — loyalty flips ARE the
  // hostile world working (the capital itself can never flip).
  if (state.cities.length < 1) {
    throw new Error(`seed ${seed}: no cities left by turn ${N_TURNS}`);
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
    rivals: state.rivals.map((r) => ({
      id: r.id,
      aggression: r.aggression,
      cities: rivalCitiesInit.get(r.id) ?? [],
      units: rivalUnitsInit.get(r.id) ?? [],
    })),
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
