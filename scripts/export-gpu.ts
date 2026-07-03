/**
 * Fixture exporter for the GPU engine (gpu/): dumps the rule tables and,
 * per seed, a static map snapshot plus a reference trace of the TS engine
 * running the phase-2 scenario — a peaceful multi-city empire (no units
 * mode, no city-states/rivals/fog/disasters):
 *
 *   - the capital trains settlers (pop >= gate) until every planned site
 *     is claimed, then falls back to cheapest-building production;
 *   - settle SITES are chosen here at t=0 and fed to the engine via
 *     state.plannedSettles — the GPU engine consumes the same ordered list
 *     when its own simulated settlers complete (site choice is data, the
 *     founding turn is simulated);
 *   - every city runs the scripted cheapest-building policy and competes
 *     for tiles through cultural border growth on the shared map.
 *
 * Since phase 3 the rules also carry the boost-condition table (the GPU
 * engine detects eurekas itself — required for off-script action play)
 * and the empire-score weights (the RL reward), and the trace carries an
 * empireScore column. Site metadata is precomputed for every candidate
 * site up front, mirroring what foundCity would produce (it strips the
 * center tile's removable feature).
 *
 * The GPU engine must reproduce these traces exactly — the TS engine is
 * the oracle.
 *
 *   npm run gpu:export             # writes gpu/fixtures/*.json
 *   npm run gpu:export -- 12 80 3  # 12 seeds, 80 turns, 3 extra cities
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, endTurn, foundCity, queueBuilding, queueSettler } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { availableBuildings } from '../src/core/rules';
import { makeYieldCtx } from '../src/core/effects';
import { tileYields } from '../src/core/yields';
import { tileYieldsForCenter, cityMaintenance } from '../src/core/city';
import { BALANCED_WEIGHTS } from '../src/core/empirePlanner';
import { traceRow } from './gpu-trace';
import { hexDistance, neighbors } from '../src/core/hex';
import { hasFreshWater, hasRiver, isCoastalLand, isImpassable } from '../src/core/query';
import { YIELD_KEYS, type City, type GameState, type Tile } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
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

const N_SEEDS = Number(process.argv[2] ?? 10);
const N_TURNS = Number(process.argv[3] ?? 100);
const N_EXTRA = Number(process.argv[4] ?? 5); // candidate sites beyond the capital
const SETTLER_POP_GATE = 2; // capital waits for pop 2 before training a settler
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
  if (row) boostRows.push({ target, idx, ...row });
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
  const state = createGame({ width: 44, height: 26, seed, withResources: true, withWonders: true });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  const capital = state.cities[0];
  const ctx = makeYieldCtx(state);
  const map = state.map;

  const tiles = map.tiles.map((t) => {
    const y = tileYields(ctx, t);
    return {
      y: YIELD_KEYS.map((k) => Math.round(y[k] * 1000) / 1000),
      workable: !isImpassable(t) && !t.district ? 1 : 0,
      res: t.resource ? (RESOURCES[t.resource].category === 'luxury' ? 3 : RESOURCES[t.resource].category === 'strategic' ? 2 : 1) : 0,
      // near a natural wonder (for the ASTROLOGY-style eureka)
      wnear: t.wonder !== null || neighbors(map, t).some((n) => n.wonder !== null) ? 1 : 0,
    };
  });

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
      foundedTurn: -1,
      centerYields: YIELD_KEYS.map((k) => cy[k]),
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
  for (const minDist of [6, 5, 4]) {
    for (const c of siteCands) {
      if (chosen.length >= N_EXTRA) break;
      if (chosen.includes(c.tileIndex)) continue;
      const t = map.tiles[c.tileIndex];
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
  cities[0].foundedTurn = 0;

  const ownerInit = map.tiles.map((t) => t.cityId);
  const C_MAX = 1 + N_EXTRA;

  const knownBoosts = new Set(state.research.boosted);
  const boostSchedule: { turn: number; kind: string; idx: number }[] = [];
  const trace: number[][] = [];
  let settlersQueued = 0;

  for (let t = 0; t < N_TURNS; t++) {
    for (const city of state.cities) {
      if (city.queue.length > 0) continue;
      if (city.isCapital && settlersQueued < chosen.length && city.population >= SETTLER_POP_GATE) {
        queueSettler(state, city.id);
        settlersQueued += 1;
      } else {
        const next = cheapestBuilding(state, city);
        if (next) queueBuilding(state, city.id, next);
      }
    }
    const citiesBefore = state.cities.length;
    endTurn(state);
    for (let i = citiesBefore; i < state.cities.length; i++) {
      cities[i].foundedTurn = state.turn - 1;
    }
    for (const id of state.research.boosted) {
      if (knownBoosts.has(id)) continue;
      knownBoosts.add(id);
      if (techIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'tech', idx: techIdx.get(id)! });
      else if (civicIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'civic', idx: civicIdx.get(id)! });
    }
    trace.push(traceRow(state, C_MAX));
  }
  if (state.cities.length < 3) {
    throw new Error(`seed ${seed}: only ${state.cities.length} cities founded by turn ${N_TURNS}`);
  }

  const fixture = { seed, width: map.width, height: map.height, cities, tiles, ownerInit, boostSchedule, trace };
  writeFileSync(`${OUT}/seed${seed}.json`, JSON.stringify(fixture));
  const founded = cities.filter((c) => c.foundedTurn >= 0).map((c) => `t${c.foundedTurn}`).join(' ');
  const pops = state.cities.map((c) => c.population).join('/');
  console.log(`seed${seed}.json: ${N_TURNS} turns, ${state.cities.length}/${C_MAX} cities (${founded}), pop ${pops}, ${boostSchedule.length} boosts`);
}
console.log(`\nFixtures in ${OUT}/ — run gpu/parity_test.py against them.`);
