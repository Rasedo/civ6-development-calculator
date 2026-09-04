
import { neighbors } from './hex';
import { TERRAINS } from './terrains';
import { FEATURES } from './features';
import type { GameMap, Tile } from './types';

/**
 * CIV6 (Continents): every contiguous LANDMASS gets an id, counting from 0
 * in ascending tile index; water is -1. A flood fill over land, which is what
 * a continent IS — mountains and impassable ground belong to the landmass
 * they sit in, and a lake never splits one because the ring of land around it
 * stays connected.
 *
 * Derived at map creation like `deriveLowlands`, so the world FILE is
 * unchanged and both engines read the same ids: the exporter ships this field
 * per tile and the GPU reads it back.
 */
export function deriveContinents(map: GameMap): void {
  const cont = new Int32Array(map.tiles.length).fill(-1);
  let next = 0;
  for (const seed of map.tiles) {
    if (isWater(seed) || cont[seed.index] >= 0) continue;
    const id = next++;
    // ascending tile index out of the seed, so the walk is order-free
    const stack: Tile[] = [seed];
    cont[seed.index] = id;
    while (stack.length) {
      const t = stack.pop()!;
      for (const n of neighbors(map, t)) {
        if (isWater(n) || cont[n.index] >= 0) continue;
        cont[n.index] = id;
        stack.push(n);
      }
    }
  }
  for (const t of map.tiles) t.continent = cont[t.index];
}

/**
 * CIV6 (Mountain Tunnel): "Acts as a movement portal on a mountain range."
 * No table names a range, so one is the connected component of MOUNTAIN tiles
 * — the same flood fill `deriveContinents` runs over land, and static for the
 * same reason: mountains never move, so this bakes at export and never has to
 * be a mutable plane (C-20).
 */
export function deriveMountainRanges(map: GameMap): void {
  const rng = new Int32Array(map.tiles.length).fill(-1);
  let next = 0;
  for (const seed of map.tiles) {
    if (!isMountain(seed) || rng[seed.index] >= 0) continue;
    const id = next++;
    // ascending tile index out of the seed, so the walk is order-free
    const stack: Tile[] = [seed];
    rng[seed.index] = id;
    while (stack.length) {
      const t = stack.pop()!;
      for (const n of neighbors(map, t)) {
        if (!isMountain(n) || rng[n.index] >= 0) continue;
        rng[n.index] = id;
        stack.push(n);
      }
    }
  }
  for (const t of map.tiles) t.mountainRange = rng[t.index];
}

export function isWater(tile: Tile): boolean {
  return TERRAINS[tile.terrain].water || !!tile.submerged;
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
  return tile.feature != null && !!FEATURES[tile.feature]?.impassable;
}

/** the natural-wonder FEATURE standing on this tile, null otherwise — the
 *  one reader of the roster's `naturalWonder` flag. */
export function naturalWonderAt(tile: Tile): string | null {
  return tile.feature !== null && FEATURES[tile.feature]?.naturalWonder ? tile.feature : null;
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
