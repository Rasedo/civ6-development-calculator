/**
 * Procedural map generation, eyeballing the look of Civ 6 "Continents" maps:
 * fBm elevation with a mid-map oceanic split, latitude climate bands,
 * edge-following rivers fed from highlands, lake detection, coast rings,
 * climate-driven features and (optionally) resources.
 *
 * Fully deterministic for a given seed + options. A later stage can bypass
 * this entirely by importing map JSON extracted from the real game.
 */

import { fbm } from './noise';
import { mulberry32, deriveSeed, shuffle, type Rng } from './rng';
import {
  neighbors,
  tileAt,
  inBounds,
  hexDistance,
  vertexKey,
  vertexNeighbors,
  vertexTouchingTiles,
  type Vertex,
} from './hex';
import type { GameMap, MapGenOptions, TerrainId, Tile } from './types';
import { RESOURCES, type ResourceDef } from '../data/resources';

export function generateMap(opts: MapGenOptions): GameMap {
  const width = opts.width;
  const height = opts.height;
  const seed = opts.seed >>> 0;
  const landFraction = opts.landFraction ?? 0.35;
  const withResources = opts.withResources ?? true;

  const map: GameMap = { width, height, seed, tiles: [] };
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      map.tiles.push({
        index: row * width + col,
        col,
        row,
        terrain: 'OCEAN',
        elevation: 'FLAT',
        feature: null,
        resource: null,
        riverMask: 0,
        improvement: null,
        district: null,
        districtComplete: false,
        cityId: -1,
      });
    }
  }

  // --- 1. Elevation ---------------------------------------------------------
  const elevNoise = fbm(deriveSeed(seed, 'elev'), 5);
  const FREQ = 0.085;
  const elev = new Float64Array(width * height);
  for (const t of map.tiles) {
    const distToEdge = Math.min(t.col, t.row, width - 1 - t.col, height - 1 - t.row);
    const falloff = Math.min(1, distToEdge / 4);
    const x = t.col / (width - 1);
    // Carve an oceanic channel in the middle to suggest two continents.
    const split = 1 - 0.42 * Math.exp(-Math.pow((x - 0.5) / 0.07, 2));
    elev[t.index] = elevNoise(t.col * FREQ, t.row * FREQ) * falloff * split;
  }

  // Sea level chosen so that ~landFraction of tiles end up land.
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const seaLevel = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - landFraction)))];
  const isLandIdx = (i: number) => elev[i] >= seaLevel;

  // --- 2. Mountains & hills ---------------------------------------------------
  const ridgeNoise = fbm(deriveSeed(seed, 'ridge'), 4);
  const landTiles = map.tiles.filter((t) => isLandIdx(t.index));
  const maxElev = Math.max(...landTiles.map((t) => elev[t.index]), seaLevel + 1e-9);
  const mscore = new Map<number, number>();
  for (const t of landTiles) {
    const ridged = 1 - Math.abs(2 * ridgeNoise(t.col * FREQ * 1.6, t.row * FREQ * 1.6) - 1);
    const rel = (elev[t.index] - seaLevel) / (maxElev - seaLevel);
    mscore.set(t.index, 0.55 * rel + 0.45 * ridged);
  }
  const byScore = [...landTiles].sort((a, b) => mscore.get(b.index)! - mscore.get(a.index)!);
  const nMountain = Math.round(byScore.length * 0.05);
  const nHills = Math.round(byScore.length * 0.17);
  byScore.forEach((t, i) => {
    if (i < nMountain) t.elevation = 'MOUNTAIN';
    else if (i < nMountain + nHills) t.elevation = 'HILLS';
  });

  // --- 3. Climate bands -> base terrain ---------------------------------------
  const moistNoise = fbm(deriveSeed(seed, 'moist'), 4);
  const tempNoise = fbm(deriveSeed(seed, 'temp'), 3);
  const half = (height - 1) / 2;
  const latOf = (row: number) => Math.abs(row - half) / half;
  const latJ = new Float64Array(width * height);
  for (const t of map.tiles) {
    latJ[t.index] = latOf(t.row) + (tempNoise(t.col * FREQ * 2, t.row * FREQ * 2) - 0.5) * 0.12;
  }
  // Raw fBm clusters tightly around 0.5; rank-normalize over land so
  // moisture thresholds behave like real percentiles.
  const moisture = new Float64Array(width * height);
  {
    const raw = new Float64Array(width * height);
    for (const t of map.tiles) raw[t.index] = moistNoise(t.col * FREQ * 1.3, t.row * FREQ * 1.3);
    const rankedLand = [...landTiles].sort((a, b) => raw[a.index] - raw[b.index]);
    rankedLand.forEach((t, i) => {
      moisture[t.index] = rankedLand.length > 1 ? i / (rankedLand.length - 1) : 0.5;
    });
  }
  for (const t of landTiles) {
    const lat = latJ[t.index];
    const m = moisture[t.index];
    let terrain: TerrainId;
    if (lat > 0.86) terrain = 'SNOW';
    else if (lat > 0.7) terrain = 'TUNDRA';
    else if (lat < 0.22 && m > 0.5) terrain = 'PLAINS'; // equatorial rainforest belt
    else if (lat > 0.18 && lat < 0.5 && m < 0.3) terrain = 'DESERT';
    else terrain = m >= 0.5 ? 'GRASSLAND' : 'PLAINS';
    t.terrain = terrain;
  }

  // --- 4. Water classification: lakes, coast, ocean -----------------------------
  const waterTiles = map.tiles.filter((t) => !isLandIdx(t.index));
  const compId = new Map<number, number>();
  const compSize = new Map<number, number>();
  let nextComp = 0;
  for (const start of waterTiles) {
    if (compId.has(start.index)) continue;
    const id = nextComp++;
    const queue = [start];
    compId.set(start.index, id);
    let size = 0;
    while (queue.length) {
      const t = queue.pop()!;
      size++;
      for (const n of neighbors(map, t)) {
        if (!isLandIdx(n.index) && !compId.has(n.index)) {
          compId.set(n.index, id);
          queue.push(n);
        }
      }
    }
    compSize.set(id, size);
  }
  for (const t of waterTiles) {
    if (compSize.get(compId.get(t.index)!)! <= 8) t.terrain = 'LAKE';
  }
  for (const t of waterTiles) {
    if (t.terrain === 'LAKE') continue;
    t.terrain = neighbors(map, t).some((n) => isLandIdx(n.index)) ? 'COAST' : 'OCEAN';
  }

  // --- 5. Rivers along hex edges -------------------------------------------------
  generateRivers(map, elev, seaLevel, deriveSeed(seed, 'rivers'));

  // --- 6. Features ------------------------------------------------------------
  const rngF = mulberry32(deriveSeed(seed, 'features'));
  for (const t of map.tiles) {
    const lat = latJ[t.index];
    const m = moisture[t.index];
    if (isLandIdx(t.index)) {
      if (t.elevation === 'MOUNTAIN') continue;
      if (t.terrain === 'DESERT' && t.elevation === 'FLAT' && t.riverMask !== 0) {
        t.feature = 'FLOODPLAINS';
        continue;
      }
      if (t.terrain === 'PLAINS' && lat < 0.22 && m > 0.5 && rngF() < 0.7) {
        t.feature = 'RAINFOREST';
        continue;
      }
      if (
        (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') &&
        m > 0.55 &&
        rngF() < 0.35
      ) {
        t.feature = 'WOODS';
        continue;
      }
      if (t.terrain === 'TUNDRA' && m > 0.4 && rngF() < 0.3) {
        t.feature = 'WOODS';
        continue;
      }
      if (t.terrain === 'GRASSLAND' && t.elevation === 'FLAT' && m > 0.8 && rngF() < 0.3) {
        t.feature = 'MARSH';
        continue;
      }
      if (t.terrain === 'DESERT' && t.elevation === 'FLAT' && rngF() < 0.06) {
        const nearOasis = neighbors(map, t).some((n) => n.feature === 'OASIS');
        if (!nearOasis) t.feature = 'OASIS';
      }
    } else {
      const rawLat = latOf(t.row);
      if (rawLat > 0.93 || (rawLat > 0.88 && rngF() < 0.5)) {
        t.feature = 'ICE';
        continue;
      }
      if (t.terrain === 'COAST' && rawLat < 0.65 && rngF() < 0.07) {
        t.feature = 'REEF';
      }
    }
  }

  // --- 7. Resources --------------------------------------------------------------
  if (withResources) {
    placeResources(map, deriveSeed(seed, 'resources'));
  }

  return map;
}

// ---------------------------------------------------------------------------

function touchesWater(map: GameMap, v: Vertex, isLandIdx: (i: number) => boolean): boolean {
  for (const [c, r] of vertexTouchingTiles(v)) {
    const t = tileAt(map, c, r);
    if (t && !isLandIdx(t.index)) return true;
  }
  return false;
}

function vertexElevation(
  map: GameMap,
  v: Vertex,
  elev: Float64Array,
  isLandIdx: (i: number) => boolean,
): number {
  let sum = 0;
  let n = 0;
  for (const [c, r] of vertexTouchingTiles(v)) {
    const t = tileAt(map, c, r);
    if (!t) {
      sum += 1.5; // repel rivers from the map border
    } else if (!isLandIdx(t.index)) {
      sum += -0.5; // attract toward water
    } else {
      sum += elev[t.index];
    }
    n++;
  }
  return sum / n;
}

function generateRivers(map: GameMap, elev: Float64Array, seaLevel: number, seed: number): void {
  const rng = mulberry32(seed);
  const isLandIdx = (i: number) => elev[i] >= seaLevel;
  const landTiles = map.tiles.filter((t) => isLandIdx(t.index));
  if (landTiles.length === 0) return;

  const riverCount = Math.max(2, Math.round(landTiles.length / 55));

  // Sources: high-elevation land, spaced out, not right at the water.
  const topLand = [...landTiles]
    .sort((a, b) => elev[b.index] - elev[a.index])
    .slice(0, Math.max(10, Math.floor(landTiles.length * 0.3)));
  shuffle(rng, topLand);
  const sources: Tile[] = [];
  for (const t of topLand) {
    if (sources.length >= riverCount) break;
    if (neighbors(map, t).some((n) => !isLandIdx(n.index))) continue;
    if (sources.some((s) => hexDistance(s.col, s.row, t.col, t.row) < 6)) continue;
    sources.push(t);
  }

  const usedEdges = new Set<string>();
  const edgeId = (a: Vertex, b: Vertex) => [vertexKey(a), vertexKey(b)].sort().join('|');

  for (const src of sources) {
    let v: Vertex = { col: src.col, row: src.row, side: rng() < 0.5 ? 'N' : 'S' };
    const visited = new Set<string>([vertexKey(v)]);

    for (let step = 0; step < 120; step++) {
      if (touchesWater(map, v, isLandIdx)) break;
      const options = vertexNeighbors(v).filter((e) => !visited.has(vertexKey(e.to)));
      if (options.length === 0) break;

      let best = options[0];
      let bestScore = Infinity;
      for (const e of options) {
        const score = vertexElevation(map, e.to, elev, isLandIdx) + (rng() - 0.5) * 0.04;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }

      const id = edgeId(v, best.to);
      if (usedEdges.has(id)) break; // merged into an existing river
      usedEdges.add(id);
      for (const f of best.flanks) {
        const t = tileAt(map, f.col, f.row);
        if (t) t.riverMask |= 1 << f.dir;
      }
      visited.add(vertexKey(best.to));
      v = best.to;
      if (!inBounds(map, v.col, v.row) && !touchesWater(map, v, isLandIdx)) {
        // walked off the map without reaching water; stop here
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------

function resourceValidOnTile(tile: Tile, def: ResourceDef): boolean {
  if (tile.elevation === 'MOUNTAIN') return false;
  if (!def.elevations.includes(tile.elevation)) return false;

  const f = tile.feature;
  const farmFloodplains = f === 'FLOODPLAINS' && def.improvement === 'FARM';
  if (f) {
    const allowed =
      def.requiresFeature?.includes(f) || def.okFeatures?.includes(f) || farmFloodplains;
    if (!allowed) return false;
  } else if (def.requiresFeature) {
    return false;
  }

  if (!def.terrains.includes(tile.terrain) && !farmFloodplains) return false;
  return true;
}

function placeResources(map: GameMap, seed: number): void {
  const rng = mulberry32(seed);
  const all = Object.values(RESOURCES);
  const landCount = map.tiles.filter(
    (t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST' && t.terrain !== 'LAKE',
  ).length;
  let quota = Math.round(landCount / 9);

  const order = shuffle(rng, [...map.tiles]);
  for (const t of order) {
    if (quota <= 0) break;
    if (t.terrain === 'OCEAN') continue;
    if (t.elevation === 'MOUNTAIN') continue;
    if (t.feature === 'ICE' || t.feature === 'OASIS') continue;
    if (neighbors(map, t).some((n) => n.resource)) continue;

    const valid = all.filter((d) => resourceValidOnTile(t, d));
    if (valid.length === 0) continue;

    const cat = pickCategory(rng, valid);
    const pool = valid.filter((d) => d.category === cat);
    t.resource = pool[Math.floor(rng() * pool.length)].id;
    quota--;
  }
}

function pickCategory(rng: Rng, valid: ResourceDef[]): ResourceDef['category'] {
  const has = (c: ResourceDef['category']) => valid.some((d) => d.category === c);
  const roll = rng();
  if (roll < 0.45 && has('bonus')) return 'bonus';
  if (roll < 0.8 && has('luxury')) return 'luxury';
  if (has('strategic')) return 'strategic';
  if (has('luxury')) return 'luxury';
  return 'bonus';
}

export { resourceValidOnTile };
