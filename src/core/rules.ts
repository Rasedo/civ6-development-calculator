/**
 * Placement validation: city sites, improvements, features, districts,
 * buildings — including tech/civic gating (bypassed in sandbox mode).
 * Every rule returns a reason so the UI can explain refusals.
 */

import type { City, DistrictId, GameState, ImprovementId, Tile } from './types';
import { hexDistance, neighbors } from './hex';
import { isWater, isImpassable, isMountain, isCoastalWater, hasRiver } from './query';
import { computeUnlocks, isTechComplete, isCivicComplete, type Unlocks } from './effects';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS, type BuildingDef, buildingsForDistrict } from '../data/buildings';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { CITY_MIN_DIST, CITY_WORK_RADIUS, maxSpecialtyDistricts } from '../data/constants';

export interface RuleResult {
  ok: boolean;
  reason?: string;
}

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

/** Sandbox ignores research gating entirely. */
function gates(state: GameState): Unlocks | null {
  return state.sandbox ? null : computeUnlocks(state);
}

// ---------------------------------------------------------------------------

export function canFoundCity(state: GameState, tileIndex: number): RuleResult {
  const tile = state.map.tiles[tileIndex];
  if (isWater(tile)) return no('Cities must be founded on land.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.wonder) return no('Cannot settle on a natural wonder.');
  if (tile.feature === 'OASIS') return no('Cannot settle on an oasis.');
  if (tile.district) return no('Tile already occupied.');
  for (const c of state.cities) {
    const center = state.map.tiles[c.centerIndex];
    if (hexDistance(center.col, center.row, tile.col, tile.row) < CITY_MIN_DIST) {
      return no(`Too close to ${c.name} (min ${CITY_MIN_DIST} tiles).`);
    }
  }
  return ok;
}

// ---------------------------------------------------------------------------

/** Improvements that may be built on this tile right now (research-gated). */
export function validImprovements(state: GameState, tile: Tile): ImprovementId[] {
  if (tile.cityId === -1) return []; // must be inside your borders
  if (tile.district || tile.wonder || isImpassable(tile)) return [];

  const unlocks = gates(state);
  const unlocked = (imp: ImprovementId) => !unlocks || unlocks.improvements.has(imp);

  if (tile.resource) {
    // A tile with a resource only accepts the improvement that works it.
    const imp = RESOURCES[tile.resource].improvement;
    return unlocked(imp) ? [imp] : [];
  }
  if (isWater(tile)) return [];

  const out: ImprovementId[] = [];
  const flat = tile.elevation === 'FLAT';
  const hills = tile.elevation === 'HILLS';
  const hillFarmsOk = !unlocks || unlocks.hillFarms;

  if (
    unlocked('FARM') &&
    ((tile.feature === null &&
      (tile.terrain === 'GRASSLAND' || tile.terrain === 'PLAINS') &&
      (flat || (hills && hillFarmsOk))) ||
      tile.feature === 'FLOODPLAINS')
  ) {
    out.push('FARM');
  }
  if (unlocked('MINE') && hills && tile.feature === null) out.push('MINE');
  if (unlocked('LUMBER_MILL') && tile.feature === 'WOODS') out.push('LUMBER_MILL');
  return out;
}

export function canRemoveFeature(state: GameState, tile: Tile): RuleResult {
  if (!tile.feature) return no('No feature here.');
  const def = FEATURES[tile.feature];
  if (!def.removable) return no(`${def.name} cannot be removed.`);
  if (tile.resource) {
    const res = RESOURCES[tile.resource];
    if (res.requiresFeature?.includes(tile.feature)) {
      return no(`${res.name} depends on the ${def.name}.`);
    }
  }
  const unlocks = gates(state);
  if (unlocks && !unlocks.featureRemovals.has(tile.feature)) {
    return no(`Removing ${def.name} requires further research.`);
  }
  return ok;
}

// ---------------------------------------------------------------------------

export function canPlaceDistrict(
  state: GameState,
  city: City,
  type: DistrictId,
  tileIndex: number,
): RuleResult {
  const map = state.map;
  const def = DISTRICTS[type];
  const tile = map.tiles[tileIndex];
  const center = map.tiles[city.centerIndex];

  const unlocks = gates(state);
  if (unlocks && type !== 'CITY_CENTER' && !unlocks.districts.has(type)) {
    return no(`${def.name} requires research.`);
  }

  if (tile.cityId !== city.id) return no('Tile not owned by this city.');
  const dist = hexDistance(center.col, center.row, tile.col, tile.row);
  if (dist === 0) return no('City center occupies this tile.');
  if (dist > CITY_WORK_RADIUS) return no('Too far from the city center.');
  if (tile.district) return no('Another district is here.');
  if (tile.builtWonder) return no('A wonder occupies this tile.');
  if (tile.wonder) return no('Cannot build on a natural wonder.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.feature === 'FLOODPLAINS') return no('Districts cannot be built on floodplains.');
  if (tile.feature === 'OASIS') return no('Districts cannot be built on an oasis.');

  if (def.placement.onCoastalWater) {
    if (!isCoastalWater(map, tile)) return no('Must be on coast/lake water adjacent to land.');
  } else if (isWater(tile)) {
    return no('Must be on land.');
  }

  if (tile.resource) {
    const cat = RESOURCES[tile.resource].category;
    if (cat !== 'bonus') return no(`Cannot build over a ${cat} resource.`);
  }

  if (!def.allowMultiple && city.districts.some((d) => d.type === type)) {
    return no(`${def.name} already exists in this city.`);
  }
  if (def.countsTowardLimit) {
    const specialty = city.districts.filter((d) => DISTRICTS[d.type].countsTowardLimit).length;
    if (specialty >= maxSpecialtyDistricts(city.population)) {
      return no(`Needs more population (${specialty}/${maxSpecialtyDistricts(city.population)} district slots used).`);
    }
  }

  const around = neighbors(map, tile);
  if (def.placement.requiresAdjacentCityCenter) {
    if (!around.some((n) => n.district === 'CITY_CENTER')) {
      return no('Must be adjacent to the City Center.');
    }
  }
  if (def.placement.requiresWaterSourceOrMountain) {
    const sourced =
      hasRiver(tile) ||
      around.some((n) => n.terrain === 'LAKE' || n.feature === 'OASIS' || isMountain(n));
    if (!sourced) return no('Needs an adjacent river, lake, oasis or mountain.');
  }
  if (def.placement.notAdjacentToCityCenter) {
    if (around.some((n) => n.district === 'CITY_CENTER')) {
      return no('Cannot be adjacent to the City Center.');
    }
  }
  return ok;
}

/** All tiles where the district could go (for map highlighting). */
export function districtPlacementTiles(state: GameState, city: City, type: DistrictId): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (t.cityId !== city.id) continue;
    if (hexDistance(center.col, center.row, t.col, t.row) > CITY_WORK_RADIUS) continue;
    if (canPlaceDistrict(state, city, type, t.index).ok) out.push(t.index);
  }
  return out;
}

// ---------------------------------------------------------------------------

/** Buildings the city could queue right now (research-gated). */
export function availableBuildings(state: GameState, city: City): BuildingDef[] {
  const map = state.map;
  const unlocks = gates(state);
  const completed = new Set(
    city.districts.filter((d) => map.tiles[d.tileIndex].districtComplete).map((d) => d.type),
  );
  const queued = new Set(
    city.queue.filter((q) => q.kind === 'building').map((q) => (q.kind === 'building' ? q.building : '')),
  );
  const have = new Set(city.buildings);
  const center = map.tiles[city.centerIndex];

  const out: BuildingDef[] = [];
  for (const type of completed) {
    for (const def of buildingsForDistrict(type)) {
      if (have.has(def.id) || queued.has(def.id)) continue;
      if (unlocks && !unlocks.buildings.has(def.id)) continue;
      if (def.requiresAny && !def.requiresAny.some((r) => have.has(r))) continue;
      if (def.exclusiveWith?.some((x) => have.has(x) || queued.has(x))) continue;
      if (def.special === 'WATER_MILL' && !hasRiver(center)) continue;
      out.push(def);
    }
  }
  return out;
}

export function buildingDef(id: string): BuildingDef {
  return BUILDINGS[id];
}

// ---------------------------------------------------------------------------
// World wonders
// ---------------------------------------------------------------------------

/** Has this wonder been placed (building or built) anywhere in the world? */
export function wonderExists(state: GameState, wonderId: string): boolean {
  return state.map.tiles.some((t) => t.builtWonder === wonderId);
}

export function canPlaceWonder(
  state: GameState,
  city: City,
  wonderId: string,
  tileIndex: number,
): RuleResult {
  const def = BUILT_WONDERS[wonderId];
  if (!def) return no('No such wonder.');
  const map = state.map;
  const tile = map.tiles[tileIndex];
  const center = map.tiles[city.centerIndex];

  if (!state.sandbox) {
    if (def.requiresTech && !isTechComplete(state, def.requiresTech)) {
      return no(`${def.name} requires research.`);
    }
    if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic)) {
      return no(`${def.name} requires a civic.`);
    }
  }
  if (wonderExists(state, wonderId)) return no(`${def.name} already exists in the world.`);

  if (tile.cityId !== city.id) return no('Tile not owned by this city.');
  const dist = hexDistance(center.col, center.row, tile.col, tile.row);
  if (dist === 0 || dist > CITY_WORK_RADIUS) return no('Must be within 3 tiles of the city center.');
  if (tile.district || tile.builtWonder) return no('Tile already occupied.');
  if (tile.wonder) return no('Cannot build on a natural wonder.');
  if (isImpassable(tile)) return no('Impassable terrain.');
  if (tile.resource) {
    const cat = RESOURCES[tile.resource].category;
    if (cat !== 'bonus') return no(`Cannot build over a ${cat} resource.`);
  }

  const p = def.placement;
  if (p.onCoastalWater) {
    if (!isCoastalWater(map, tile)) return no('Must be on coast/lake water adjacent to land.');
  } else {
    if (isWater(tile)) return no('Must be on land.');
    if (tile.feature === 'FLOODPLAINS' && !p.allowFloodplains) {
      return no('Cannot be built on floodplains.');
    }
    if (tile.feature === 'OASIS') return no('Cannot be built on an oasis.');
    if (p.terrains && !p.terrains.includes(tile.terrain)) {
      return no(`Requires ${p.terrains.join('/')} terrain.`);
    }
    if (p.flatOnly && tile.elevation !== 'FLAT') return no('Requires flat land.');
    if (p.hillsOnly && tile.elevation !== 'HILLS') return no('Requires hills.');
  }
  if (p.requiresRiver && !hasRiver(tile)) return no('Must be adjacent to a river.');

  const around = neighbors(map, tile);
  if (p.adjacentDistrict) {
    const okAdj = around.some((n) => n.district === p.adjacentDistrict && n.districtComplete);
    if (!okAdj) return no(`Must be adjacent to a completed ${DISTRICTS[p.adjacentDistrict].name}.`);
  }
  if (p.adjacentResource) {
    if (!around.some((n) => n.resource === p.adjacentResource)) {
      return no(`Must be adjacent to ${p.adjacentResource.toLowerCase()}.`);
    }
  }
  return ok;
}

export function wonderPlacementTiles(state: GameState, city: City, wonderId: string): number[] {
  const center = state.map.tiles[city.centerIndex];
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (t.cityId !== city.id) continue;
    if (hexDistance(center.col, center.row, t.col, t.row) > CITY_WORK_RADIUS) continue;
    if (canPlaceWonder(state, city, wonderId, t.index).ok) out.push(t.index);
  }
  return out;
}

/** Wonders this city could start right now (unlocked, unbuilt, with a legal tile). */
export function availableWonders(state: GameState, city: City): BuiltWonderDef[] {
  return Object.values(BUILT_WONDERS).filter((def) => {
    if (wonderExists(state, def.id)) return false;
    if (!state.sandbox) {
      if (def.requiresTech && !isTechComplete(state, def.requiresTech)) return false;
      if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic)) return false;
    }
    return wonderPlacementTiles(state, city, def.id).length > 0;
  });
}
