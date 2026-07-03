/**
 * Fixture exporter for the GPU engine (gpu/): dumps the rule tables and,
 * per seed, a static map snapshot plus a reference trace of the TS engine
 * running the phase-1 scenario (single auto-settled city, no units mode,
 * no city-states/rivals/fog/disasters, scripted cheapest-building policy).
 * The GPU engine must reproduce these traces exactly — the TS engine is
 * the oracle.
 *
 *   npm run gpu:export            # writes gpu/fixtures/*.json
 *   npm run gpu:export -- 12 80   # 12 seeds, 80 turns
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, endTurn, foundCity, queueBuilding } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { availableBuildings } from '../src/core/rules';
import { makeYieldCtx } from '../src/core/effects';
import { tileYields } from '../src/core/yields';
import { tileYieldsForCenter, cityMaintenance } from '../src/core/city';
import { hasFreshWater, hasRiver, isCoastalLand, isImpassable } from '../src/core/query';
import { YIELD_KEYS, type GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { TECHS } from '../src/data/techs';
import { CIVICS } from '../src/data/civics';
import { RESOURCES } from '../src/data/resources';
import { BOOST_FRACTION } from '../src/data/boosts';
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

const N_SEEDS = Number(process.argv[2] ?? 8);
const N_TURNS = Number(process.argv[3] ?? 60);
const OUT = 'gpu/fixtures';

mkdirSync(OUT, { recursive: true });

// --- rules -------------------------------------------------------------------

const techList = Object.values(TECHS);
const civicList = Object.values(CIVICS);
const techIdx = new Map(techList.map((t, i) => [t.id, i]));
const civicIdx = new Map(civicList.map((c, i) => [c.id, i]));

// Phase 1 buildable set: City Center buildings only (no other districts exist).
const centerBuildings = Object.values(BUILDINGS)
  .filter((b) => b.district === 'CITY_CENTER' && b.id !== 'PALACE' && !b.worship)
  .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
const buildingUnlockTech = new Map<string, number>();
techList.forEach((t, i) => {
  for (const fx of t.effects ?? []) {
    if (fx.kind === 'unlockBuilding') buildingUnlockTech.set(fx.building, i);
  }
});

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
console.log(`rules.json: ${rules.buildings.length} buildings, ${rules.techs.length} techs, ${rules.civics.length} civics`);

// --- per-seed fixtures ----------------------------------------------------------

function cheapestBuilding(state: GameState): string | null {
  const city = state.cities[0];
  if (!city) return null;
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
  const city = state.cities[0];
  const ctx = makeYieldCtx(state);
  const map = state.map;

  const tiles = map.tiles.map((t) => {
    const y = tileYields(ctx, t);
    return {
      y: YIELD_KEYS.map((k) => Math.round(y[k] * 1000) / 1000),
      workable: !isImpassable(t) && !t.district ? 1 : 0,
      res: t.resource ? (RESOURCES[t.resource].category === 'luxury' ? 3 : RESOURCES[t.resource].category === 'strategic' ? 2 : 1) : 0,
    };
  });
  const center = map.tiles[city.centerIndex];
  const centerY = tileYieldsForCenter(ctx, center);
  // Snapshot BEFORE the simulation loop mutates the map.
  const ownedInit = map.tiles.map((t) => (t.cityId === city.id ? 1 : 0));

  const knownBoosts = new Set(state.research.boosted);
  const boostSchedule: { turn: number; kind: string; idx: number }[] = [];
  const trace: number[][] = [];

  for (let t = 0; t < N_TURNS; t++) {
    if (city.queue.length === 0) {
      const next = cheapestBuilding(state);
      if (next) queueBuilding(state, city.id, next);
    }
    endTurn(state);
    for (const id of state.research.boosted) {
      if (knownBoosts.has(id)) continue;
      knownBoosts.add(id);
      if (techIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'tech', idx: techIdx.get(id)! });
      else if (civicIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'civic', idx: civicIdx.get(id)! });
    }
    trace.push([
      state.turn,
      city.population,
      Math.round(city.foodBox * 1000),
      Math.round(state.treasury * 1000),
      Math.round(state.scienceTotal * 1000),
      Math.round(state.cultureTotal * 1000),
      state.research.techs.length,
      state.research.civics.length,
      map.tiles.filter((x) => x.cityId === city.id).length,
      city.buildings.length,
      Math.round(city.cultureBox * 1000),
    ]);
  }

  const fixture = {
    seed,
    width: map.width,
    height: map.height,
    centerIndex: city.centerIndex,
    centerYields: YIELD_KEYS.map((k) => centerY[k]),
    /** City-center district + Palace upkeep (new buildings add their own). */
    baseMaintenance: cityMaintenance(
      { ...state, cities: [{ ...city, buildings: ['PALACE'] }] } as GameState,
      { ...city, buildings: ['PALACE'] },
    ),
    freshWater: hasFreshWater(map, center) ? 1 : 0,
    coastal: isCoastalLand(map, center) ? 1 : 0,
    riverAtCenter: hasRiver(center) ? 1 : 0,
    tiles,
    ownedInit,
    boostSchedule,
    trace,
  };
  writeFileSync(`${OUT}/seed${seed}.json`, JSON.stringify(fixture));
  console.log(`seed${seed}.json: ${N_TURNS} turns, pop ${city.population}, ${city.buildings.length} buildings, ${boostSchedule.length} boosts`);
}
console.log(`\nFixtures in ${OUT}/ — run gpu/parity_test.py against them.`);
