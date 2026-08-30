
import { neighbors } from './hex';
import { TERRAINS } from './terrains';
import { FEATURES } from './features';
import { WONDERS } from './wonders';
import type { GameMap, Tile } from './types';

export function isWater(tile: Tile): boolean {
  return TERRAINS[tile.terrain].water;
}

export function isLand(tile: Tile): boolean {
  return !isWater(tile);
}

/**
 * CIV6 (Canal): "Allows Naval units to pass through this tile." The passage is
 * a HULL fact and nothing else — the ground under a Canal is still land, so no
 * city turns coastal on it, no citizen works it as sea, and no land unit is
 * kept off it. A pillaged district carries no effect, this one included.
 */
export function canalPassage(tile: Tile): boolean {
  return tile.district === 'CANAL' && tile.districtComplete && !tile.districtPillaged;
}

/** where a HULL may float: open water, or a Canal's passage. */
export function hullTile(tile: Tile): boolean {
  return isWater(tile) || canalPassage(tile);
}

export function isMountain(tile: Tile): boolean {
  return tile.elevation === 'MOUNTAIN';
}

export function isImpassable(tile: Tile): boolean {
  if (isMountain(tile)) return true;
  if (tile.wonder && WONDERS[tile.wonder]?.impassable) return true;
  return tile.feature != null && !!FEATURES[tile.feature]?.impassable;
}

export function hasRiver(tile: Tile): boolean {
  return tile.riverMask !== 0;
}

export function hasFreshWater(map: GameMap, tile: Tile): boolean {
  if (hasRiver(tile)) return true;
  if (tile.feature === 'OASIS') return true;
  for (const n of neighbors(map, tile)) {
    if (n.terrain === 'LAKE') return true;
    if (n.feature === 'OASIS') return true;
  }
  return false;
}

export function isCoastalLand(map: GameMap, tile: Tile): boolean {
  if (isWater(tile)) return false;
  return neighbors(map, tile).some((n) => n.terrain === 'COAST' || n.terrain === 'OCEAN');
}

export function isCoastalWater(map: GameMap, tile: Tile): boolean {
  if (tile.terrain !== 'COAST' && tile.terrain !== 'LAKE') return false;
  if (tile.feature === 'ICE') return false;
  return neighbors(map, tile).some((n) => isLand(n));
}
