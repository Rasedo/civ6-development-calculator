/**
 * Game state lifecycle: creation, player actions (found city, improve,
 * place districts/buildings), the end-of-turn loop, and serialization.
 */

import type { City, DistrictId, GameState, ImprovementId, MapGenOptions, QueueItem } from './types';
import { generateMap } from './mapgen';
import { tilesWithin } from './hex';
import { computeCityStats, luxuryAmenities } from './city';
import { canFoundCity, canPlaceDistrict, validImprovements, canRemoveFeature, availableBuildings, type RuleResult } from './rules';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { CITY_WORK_RADIUS, CITY_NAMES } from '../data/constants';

export function createGame(opts: MapGenOptions & { sandbox?: boolean }): GameState {
  return {
    map: generateMap(opts),
    cities: [],
    nextCityId: 0,
    turn: 1,
    sandbox: opts.sandbox ?? false,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faithTotal: 0,
  };
}

function cityName(id: number): string {
  const base = CITY_NAMES[id % CITY_NAMES.length];
  const round = Math.floor(id / CITY_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

export function foundCity(state: GameState, tileIndex: number): RuleResult & { city?: City } {
  const check = canFoundCity(state, tileIndex);
  if (!check.ok) return check;

  const tile = state.map.tiles[tileIndex];
  const id = state.nextCityId++;
  const city: City = {
    id,
    name: cityName(id),
    centerIndex: tileIndex,
    population: 1,
    foodBox: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: state.cities.length === 0,
    buildings: state.cities.length === 0 ? ['PALACE'] : [],
    districts: [{ type: 'CITY_CENTER', tileIndex }],
  };

  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.improvement = null;
  if (tile.feature && FEATURES[tile.feature].removable) tile.feature = null;

  for (const t of tilesWithin(state.map, tile.col, tile.row, CITY_WORK_RADIUS)) {
    if (t.cityId === -1) t.cityId = id;
  }
  tile.cityId = id;

  state.cities.push(city);
  return { ok: true, city };
}

export function placeImprovement(
  state: GameState,
  tileIndex: number,
  imp: ImprovementId,
): RuleResult {
  const tile = state.map.tiles[tileIndex];
  if (!validImprovements(state, tile).includes(imp)) {
    return { ok: false, reason: 'Not a valid improvement for this tile.' };
  }
  tile.improvement = imp;
  return { ok: true };
}

export function removeImprovement(state: GameState, tileIndex: number): void {
  state.map.tiles[tileIndex].improvement = null;
}

export function removeFeature(state: GameState, tileIndex: number): RuleResult {
  const tile = state.map.tiles[tileIndex];
  const check = canRemoveFeature(tile);
  if (!check.ok) return check;
  // Improvements that depended on the feature disappear with it.
  if (tile.improvement === 'LUMBER_MILL' && tile.feature === 'WOODS') tile.improvement = null;
  tile.feature = null;
  return { ok: true };
}

export function queueDistrict(
  state: GameState,
  cityId: number,
  type: DistrictId,
  tileIndex: number,
): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  const check = canPlaceDistrict(state, city, type, tileIndex);
  if (!check.ok) return check;

  const tile = state.map.tiles[tileIndex];
  tile.district = type;
  tile.districtComplete = state.sandbox;
  tile.improvement = null;
  tile.feature = null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;

  city.districts.push({ type, tileIndex });
  if (!state.sandbox) {
    city.queue.push({ kind: 'district', district: type, tileIndex, progress: 0 });
  }
  return { ok: true };
}

export function queueBuilding(state: GameState, cityId: number, buildingId: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city.' };
  if (!availableBuildings(state, city).some((b) => b.id === buildingId)) {
    return { ok: false, reason: 'Building not available in this city.' };
  }
  if (state.sandbox) {
    city.buildings.push(buildingId);
  } else {
    city.queue.push({ kind: 'building', building: buildingId, progress: 0 });
  }
  return { ok: true };
}

export function cancelQueueItem(state: GameState, cityId: number, index: number): void {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city || index < 0 || index >= city.queue.length) return;
  const item = city.queue[index];
  if (item.kind === 'district') {
    const tile = state.map.tiles[item.tileIndex];
    tile.district = null;
    tile.districtComplete = false;
    city.districts = city.districts.filter((d) => d.tileIndex !== item.tileIndex);
  }
  city.queue.splice(index, 1);
}

export function itemCost(item: QueueItem): number {
  return item.kind === 'district' ? DISTRICTS[item.district].cost : BUILDINGS[item.building].cost;
}

export function itemLabel(item: QueueItem): string {
  return item.kind === 'district' ? DISTRICTS[item.district].name : BUILDINGS[item.building].name;
}

export function endTurn(state: GameState): void {
  const luxMap = luxuryAmenities(state);
  for (const city of state.cities) {
    const stats = computeCityStats(state, city, luxMap);

    // --- production ---------------------------------------------------------
    if (city.queue.length > 0) {
      city.queue[0].progress += stats.total.production;
      while (city.queue.length > 0 && city.queue[0].progress >= itemCost(city.queue[0])) {
        const item = city.queue.shift()!;
        const overflow = item.progress - itemCost(item);
        if (item.kind === 'district') {
          state.map.tiles[item.tileIndex].districtComplete = true;
        } else {
          city.buildings.push(item.building);
        }
        if (city.queue.length > 0) city.queue[0].progress += overflow;
      }
    }

    // --- growth -------------------------------------------------------------
    city.foodBox += stats.effectiveFoodSurplus;
    if (city.foodBox >= stats.growthNeeded) {
      city.population += 1;
      city.foodBox -= stats.growthNeeded;
    } else if (city.foodBox < 0) {
      city.population = Math.max(1, city.population - 1);
      city.foodBox = 0;
    }

    // --- empire accumulators ---------------------------------------------------
    state.treasury += stats.total.gold;
    state.scienceTotal += stats.total.science;
    state.cultureTotal += stats.total.culture;
    state.faithTotal += stats.total.faith;
  }
  state.turn += 1;
}

export function toggleLockedTile(state: GameState, cityId: number, tileIndex: number): void {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return;
  const i = city.lockedTiles.indexOf(tileIndex);
  if (i >= 0) city.lockedTiles.splice(i, 1);
  else city.lockedTiles.push(tileIndex);
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  return JSON.parse(json) as GameState;
}
