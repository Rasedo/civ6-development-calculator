
import { neighbors } from './hex';
import { TERRAINS } from './terrains';
import { FEATURES } from './features';
import type { GameMap, Tile } from './types';

/** the connected components of the tiles `cls` gives a class (-1 none),
 *  numbered from 0 in the order of their lowest tile; -1 off every class */
function components(map: GameMap, cls: (t: Tile) => number): Int32Array {
  const out = new Int32Array(map.tiles.length).fill(-1);
  let next = 0;
  for (const seed of map.tiles) {
    const k = cls(seed);
    if (k < 0 || out[seed.index] >= 0) continue;
    const id = next++;
    const stack: Tile[] = [seed];
    out[seed.index] = id;
    while (stack.length) {
      const t = stack.pop()!;
      for (const n of neighbors(map, t)) {
        if (out[n.index] >= 0 || cls(n) !== k) continue;
        out[n.index] = id;
        stack.push(n);
      }
    }
  }
  return out;
}

/**
 * CIV6 (Continents): each plot's continent, Plot:GetContinentType() — the
 * map script's TerrainBuilder.StampContinents partition (`GameMap.
 * continents`: land, mountain and lake plots carry one, the sea -1). A map
 * whose generator kept none takes each contiguous landmass as a continent,
 * counting from 0 in ascending tile index, water -1.
 *
 * Stamped at map creation like `deriveLowlands`; the exporter ships it per
 * tile and the GPU reads it back.
 */
export function deriveContinents(map: GameMap): void {
  const cont = map.continents ?? components(map, (t) => (isWater(t) ? -1 : 0));
  for (const t of map.tiles) t.continent = cont[t.index];
}

/**
 * CIV6 (AreaBuilder.Recalculate): each plot's AREA — a connected component of
 * one class, water (lakes included), mountains, or the rest of the land —
 * numbered from 0 in the order of its lowest plot (tools/civ6map world.py
 * `recalculate_areas`). The barbarians read it: a naval tribe's island
 * (0x153d60 reads the plot's area size, Plot:GetArea) and the camp step's
 * regions, which never cross an area. Static at creation like `continent`.
 */
export function deriveAreas(map: GameMap): void {
  const area = components(map, (t) => (isWater(t) ? 0 : isMountain(t) ? 2 : 1));
  for (const t of map.tiles) t.area = area[t.index];
}

/**
 * CIV6 (Mountain Tunnel): "Acts as a movement portal on a mountain range."
 * No table names a range, so one is the connected component of MOUNTAIN tiles
 * — static: mountains never move, so this bakes at export and never has to
 * be a mutable plane.
 */
export function deriveMountainRanges(map: GameMap): void {
  const rng = components(map, (t) => (isMountain(t) ? 0 : -1));
  for (const t of map.tiles) t.mountainRange = rng[t.index];
}

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

/**
 * A completed Canal's plot answers both land and water in the district word
 * the trade path reads (GameCore_XP2 0x81240 masks 1 and 4): the Trader's walk
 * takes it as neither (no land-water switch, the larger refuel onto it, no
 * step term) and the route's path score counts it as a multiple-domain plot
 * (runs/h1_duelw1124 Cardiff -> Xiurong through Shenyang's Canal: 12 Gold).
 */
export function multiDomainPlot(tile: Tile): boolean {
  return tile.district === 'CANAL' && tile.districtComplete;
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
  // CIV6 (Features.xml AddsFreshWater): the Oasis, and the Crater Lake and
  // Pamukkale beside the plot (runs/h1_duelw1110, Yiyang beside the Crater
  // Lake: 5 Housing of water)
  const fresh = (t: Tile): boolean => {
    const f = t.feature;
    return f !== null && FEATURES[f]?.freshWater === true;
  };
  if (fresh(tile)) return true;
  // a drowned Lake or Oasis is SEA now, and the sea is not fresh
  for (const n of neighbors(map, tile)) {
    if (n.terrain === 'LAKE') return true;
    if (fresh(n)) return true;
  }
  return false;
}

export function isCoastalLand(map: GameMap, tile: Tile): boolean {
  if (isWater(tile)) return false;
  return neighbors(map, tile).some((n) => n.terrain === 'COAST' || n.terrain === 'OCEAN');
}

export function isCoastalWater(map: GameMap, tile: Tile): boolean {
  const terr = tile.terrain;
  if (terr !== 'COAST' && terr !== 'LAKE') return false;
  if (tile.feature === 'ICE') return false;
  return neighbors(map, tile).some((n) => isLand(n));
}
