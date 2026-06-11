/**
 * Yield computations: per-tile yields, district adjacency bonuses, and
 * building yields (including regional effects and special cases).
 */

import { addYields, emptyYields, type GameMap, type GameState, type City, type Tile, type Yields, type DistrictId, type ImprovementId } from './types';
import { neighbors, hexDistance } from './hex';
import { isWater, isMountain, hasRiver } from './query';
import { TERRAINS, HILLS_YIELDS } from '../data/terrains';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS, type AdjacencyRule } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { REGIONAL_RANGE } from '../data/constants';

/** Raw yields of a tile (terrain + hills + feature + resource + improvement). */
export function tileYields(tile: Tile): Yields {
  const out = emptyYields();
  if (isMountain(tile)) return out;
  if (tile.district) return out; // district tiles don't produce tile yields

  addYields(out, TERRAINS[tile.terrain].yields);
  if (tile.elevation === 'HILLS') addYields(out, HILLS_YIELDS);
  if (tile.feature) {
    const f = FEATURES[tile.feature];
    if (f.impassable) return emptyYields();
    addYields(out, f.yields);
  }
  if (tile.resource) addYields(out, RESOURCES[tile.resource].yields);
  if (tile.improvement) addYields(out, IMPROVEMENTS[tile.improvement as ImprovementId].yields);
  return out;
}

function matchesAdjacency(rule: AdjacencyRule, neighbor: Tile): boolean {
  switch (rule.source) {
    case 'MOUNTAIN':
      return isMountain(neighbor);
    case 'RAINFOREST':
      return neighbor.feature === 'RAINFOREST';
    case 'WOODS':
      return neighbor.feature === 'WOODS';
    case 'REEF':
      return neighbor.feature === 'REEF';
    case 'DISTRICT':
      return neighbor.district !== null && neighbor.districtComplete;
    case 'CITY_CENTER':
      return neighbor.district === 'CITY_CENTER' && neighbor.districtComplete;
    case 'HARBOR_DISTRICT':
      return neighbor.district === 'HARBOR' && neighbor.districtComplete;
    case 'SEA_RESOURCE':
      return isWater(neighbor) && neighbor.resource !== null;
    case 'MINE_OR_QUARRY':
      return neighbor.improvement === 'MINE' || neighbor.improvement === 'QUARRY';
    case 'RIVER':
      return false; // handled separately (it's about the tile itself)
  }
}

/**
 * Adjacency bonus a district of `type` gets (or would get) on `tile`,
 * in the district's adjacency yield. Result floored like Civ 6.
 */
export function districtAdjacency(map: GameMap, tile: Tile, type: DistrictId): number {
  const def = DISTRICTS[type];
  if (!def.adjacencyYield || def.adjacency.length === 0) return 0;
  let sum = 0;
  const around = neighbors(map, tile);
  for (const rule of def.adjacency) {
    if (rule.source === 'RIVER') {
      if (hasRiver(tile)) sum += rule.amount;
      continue;
    }
    for (const n of around) {
      if (matchesAdjacency(rule, n)) sum += rule.amount;
    }
  }
  return Math.floor(sum);
}

/** Sum of adjacency yields over a city's completed districts. */
export function cityDistrictYields(map: GameMap, city: City): Yields {
  const out = emptyYields();
  for (const d of city.districts) {
    const tile = map.tiles[d.tileIndex];
    if (!tile.districtComplete) continue;
    const def = DISTRICTS[d.type];
    if (def.adjacencyYield) {
      out[def.adjacencyYield] += districtAdjacency(map, tile, d.type);
    }
  }
  return out;
}

/**
 * Yields from the city's own (non-regional) buildings, including the
 * Shipyard special (production = Harbor gold adjacency).
 */
export function cityBuildingYields(map: GameMap, city: City): Yields {
  const out = emptyYields();
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (!def) continue;
    if (def.regional) continue; // handled by regional scan (affects own city too)
    if (def.yields) addYields(out, def.yields);
    if (def.special === 'SHIPYARD') {
      const harbor = city.districts.find((d) => d.type === 'HARBOR');
      if (harbor && map.tiles[harbor.tileIndex].districtComplete) {
        out.production += districtAdjacency(map, map.tiles[harbor.tileIndex], 'HARBOR');
      }
    }
  }
  return out;
}

export interface RegionalEffects {
  yields: Yields;
  amenities: number;
}

/**
 * Regional building effects reaching `city` from every city's districts
 * within REGIONAL_RANGE of the city center (including its own). The same
 * building type never stacks.
 */
export function regionalEffects(state: GameState, city: City): RegionalEffects {
  const center = state.map.tiles[city.centerIndex];
  const seen = new Set<string>();
  const out: RegionalEffects = { yields: emptyYields(), amenities: 0 };
  for (const other of state.cities) {
    for (const inst of other.districts) {
      const tile = state.map.tiles[inst.tileIndex];
      if (!tile.districtComplete) continue;
      for (const id of other.buildings) {
        const def = BUILDINGS[id];
        if (!def || !def.regional || def.district !== inst.type) continue;
        if (seen.has(id)) continue;
        if (hexDistance(tile.col, tile.row, center.col, center.row) > REGIONAL_RANGE) continue;
        seen.add(id);
        if (def.yields) addYields(out.yields, def.yields);
        if (def.amenities) out.amenities += def.amenities;
      }
    }
  }
  return out;
}

/** Local (non-regional) building amenities, e.g. Arena, Palace. */
export function localBuildingAmenities(city: City): number {
  let n = 0;
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (def && !def.regional && def.amenities) n += def.amenities;
  }
  return n;
}
