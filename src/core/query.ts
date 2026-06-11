/** Small shared predicates over tiles and the map. */

import { neighbors } from './hex';
import { TERRAINS } from '../data/terrains';
import { FEATURES } from '../data/features';
import type { GameMap, Tile } from './types';

export function isWater(tile: Tile): boolean {
  return TERRAINS[tile.terrain].water;
}

export function isLand(tile: Tile): boolean {
  return !isWater(tile);
}

export function isMountain(tile: Tile): boolean {
  return tile.elevation === 'MOUNTAIN';
}

export function isImpassable(tile: Tile): boolean {
  if (isMountain(tile)) return true;
  return tile.feature != null && !!FEATURES[tile.feature]?.impassable;
}

/** Tile touches a river edge. */
export function hasRiver(tile: Tile): boolean {
  return tile.riverMask !== 0;
}

/** Fresh water access: river edge, own/adjacent oasis, or adjacent lake. */
export function hasFreshWater(map: GameMap, tile: Tile): boolean {
  if (hasRiver(tile)) return true;
  if (tile.feature === 'OASIS') return true;
  for (const n of neighbors(map, tile)) {
    if (n.terrain === 'LAKE') return true;
    if (n.feature === 'OASIS') return true;
  }
  return false;
}

/** Land tile adjacent to salt water (coast/ocean). */
export function isCoastalLand(map: GameMap, tile: Tile): boolean {
  if (isWater(tile)) return false;
  return neighbors(map, tile).some((n) => n.terrain === 'COAST' || n.terrain === 'OCEAN');
}

/** Water tile (coast/lake) adjacent to land — valid Harbor spot terrain-wise. */
export function isCoastalWater(map: GameMap, tile: Tile): boolean {
  if (tile.terrain !== 'COAST' && tile.terrain !== 'LAKE') return false;
  if (tile.feature === 'ICE') return false;
  return neighbors(map, tile).some((n) => isLand(n));
}
