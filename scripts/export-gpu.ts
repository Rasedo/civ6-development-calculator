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
import { hexDistance } from '../src/core/hex';
import { hasFreshWater, hasRiver, isCoastalLand, isImpassable } from '../src/core/query';
import { YIELD_KEYS, type City, type GameState } from '../src/core/types';
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

const N_SEEDS = Number(process.argv[2] ?? 10);
const N_TURNS = Number(process.argv[3] ?? 100);
const N_EXTRA = Number(process.argv[4] ?? 2); // cities founded beyond the capital
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
  // Mirrors settlerCost(): 80 + 30 × (cities − 1 + settlers banked + settlers queued).
  scenario: { settlerBase: 80, settlerPerCity: 30, settlerPopGate: SETTLER_POP_GATE },
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
    };
  });

  // Static per-city data, captured at founding time (foundCity strips the
  // center tile's feature, so its yields must be read *after* the fact).
  function cityMeta(city: City, foundedTurn: number) {
    const center = map.tiles[city.centerIndex];
    const cy = tileYieldsForCenter(makeYieldCtx(state), center);
    return {
      site: city.centerIndex,
      foundedTurn,
      centerYields: YIELD_KEYS.map((k) => cy[k]),
      freshWater: hasFreshWater(map, center) ? 1 : 0,
      coastal: isCoastalLand(map, center) ? 1 : 0,
      riverAtCenter: hasRiver(center) ? 1 : 0,
      /** City-center district (+ Palace for the capital) upkeep at founding. */
      baseMaintenance: cityMaintenance(state, city),
    };
  }
  const cities = [cityMeta(capital, 0)];

  // Choose the future settle sites now, spaced out from the capital and from
  // each other; the engine consumes this exact ordered list. Relax the
  // spacing if a cramped map can't fit N_EXTRA well-separated cities.
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
    for (const city of state.cities.slice(citiesBefore)) {
      cities.push(cityMeta(city, state.turn - 1));
    }
    for (const id of state.research.boosted) {
      if (knownBoosts.has(id)) continue;
      knownBoosts.add(id);
      if (techIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'tech', idx: techIdx.get(id)! });
      else if (civicIdx.has(id)) boostSchedule.push({ turn: state.turn - 1, kind: 'civic', idx: civicIdx.get(id)! });
    }
    const row = [
      state.turn,
      state.research.techs.length,
      state.research.civics.length,
      state.settlers,
      state.cities.length,
      Math.round(state.treasury * 1000),
      Math.round(state.scienceTotal * 1000),
      Math.round(state.cultureTotal * 1000),
    ];
    for (let c = 0; c < C_MAX; c++) {
      const city = state.cities[c];
      if (!city) {
        row.push(0, 0, 0, 0, 0, 0);
        continue;
      }
      row.push(
        city.population,
        map.tiles.filter((x) => x.cityId === city.id).length,
        city.buildings.length,
        city.tilesAcquired,
        Math.round(city.foodBox * 1000),
        Math.round(city.cultureBox * 1000),
      );
    }
    trace.push(row);
  }
  if (state.cities.length !== C_MAX) {
    throw new Error(`seed ${seed}: founded ${state.cities.length}/${C_MAX} cities — a planned site was rejected`);
  }

  const fixture = { seed, width: map.width, height: map.height, cities, tiles, ownerInit, boostSchedule, trace };
  writeFileSync(`${OUT}/seed${seed}.json`, JSON.stringify(fixture));
  const founded = cities.map((c) => `t${c.foundedTurn}`).join(' ');
  const pops = state.cities.map((c) => c.population).join('/');
  console.log(`seed${seed}.json: ${N_TURNS} turns, ${state.cities.length} cities (${founded}), pop ${pops}, ${boostSchedule.length} boosts`);
}
console.log(`\nFixtures in ${OUT}/ — run gpu/parity_test.py against them.`);
