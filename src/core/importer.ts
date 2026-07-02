/**
 * Importer for maps exported from a real Civ 6 game by the MapExporter mod
 * (see civ6-mod/). Accepts a whole Lua.log or just the CIV6MAP lines.
 *
 * Civ 6 counts rows from the south; the calculator from the north. Rows are
 * imported as-is, which mirrors the map north–south but keeps every adjacency,
 * river edge and yield exact (see civ6-mod/README.md).
 */

import type { GameMap, TerrainId, Tile } from './types';
import { neighborOffset, oppositeDir, inBounds, tileIndex } from './hex';
import { RESOURCES } from '../data/resources';
import { FEATURES } from '../data/features';
import { WONDERS } from '../data/wonders';

const TERRAIN_BASE: Record<string, TerrainId> = {
  GRASS: 'GRASSLAND',
  PLAINS: 'PLAINS',
  DESERT: 'DESERT',
  TUNDRA: 'TUNDRA',
  SNOW: 'SNOW',
  COAST: 'COAST',
  OCEAN: 'OCEAN',
};

const FEATURE_MAP: Record<string, string> = {
  FEATURE_FOREST: 'WOODS',
  FEATURE_JUNGLE: 'RAINFOREST',
  FEATURE_MARSH: 'MARSH',
  FEATURE_FLOODPLAINS: 'FLOODPLAINS',
  FEATURE_FLOODPLAINS_GRASSLAND: 'FLOODPLAINS',
  FEATURE_FLOODPLAINS_PLAINS: 'FLOODPLAINS',
  FEATURE_OASIS: 'OASIS',
  FEATURE_REEF: 'REEF',
  FEATURE_ICE: 'ICE',
};

const WONDER_MAP: Record<string, string> = {
  FEATURE_BARRIER_REEF: 'GREAT_BARRIER_REEF',
  FEATURE_CRATER_LAKE: 'CRATER_LAKE',
  FEATURE_DEAD_SEA: 'DEAD_SEA',
  FEATURE_GALAPAGOS: 'GALAPAGOS',
  FEATURE_PANTANAL: 'PANTANAL',
  FEATURE_ULURU: 'ULURU',
  FEATURE_TORRES_DEL_PAINE: 'TORRES_DEL_PAINE',
};

export interface ImportReport {
  width: number;
  height: number;
  plots: number;
  missingPlots: number;
  wonders: string[];
  /** Feature/resource type strings we had no mapping for, with counts. */
  unknownFeatures: Record<string, number>;
  unknownResources: Record<string, number>;
}

export interface ImportResult {
  map: GameMap;
  report: ImportReport;
}

function blankTile(index: number, col: number, row: number): Tile {
  return {
    index,
    col,
    row,
    terrain: 'OCEAN',
    elevation: 'FLAT',
    feature: null,
    resource: null,
    wonder: null,
    riverMask: 0,
    improvement: null,
    district: null,
    districtComplete: false,
    builtWonder: null,
    builtWonderComplete: false,
    cityId: -1,
  };
}

function setRiverEdge(map: GameMap, tile: Tile, dir: number): void {
  tile.riverMask |= 1 << dir;
  const [nc, nr] = neighborOffset(tile.col, tile.row, dir);
  if (inBounds(map, nc, nr)) {
    map.tiles[tileIndex(map, nc, nr)].riverMask |= 1 << oppositeDir(dir);
  }
}

/** Parse MapExporter output (or a full Lua.log containing it). */
export function parseCivExport(text: string): ImportResult {
  const lines = text.split(/\r?\n/);
  let width = 0;
  let height = 0;
  let map: GameMap | null = null;
  const report: ImportReport = {
    width: 0,
    height: 0,
    plots: 0,
    missingPlots: 0,
    wonders: [],
    unknownFeatures: {},
    unknownResources: {},
  };
  const wonders = new Set<string>();

  for (const raw of lines) {
    const at = raw.indexOf('CIV6MAP');
    if (at === -1) continue;
    const line = raw.slice(at).trim();

    if (line.startsWith('CIV6MAP_BEGIN|')) {
      const parts = line.split('|');
      width = Number(parts[1]);
      height = Number(parts[2]);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4) {
        throw new Error(`Bad CIV6MAP_BEGIN header: "${line}"`);
      }
      map = { width, height, seed: 0, tiles: [] };
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          map.tiles.push(blankTile(row * width + col, col, row));
        }
      }
      continue;
    }
    if (line.startsWith('CIV6MAP_END')) break;
    if (!line.startsWith('CIV6MAP|')) continue;
    if (!map) throw new Error('CIV6MAP plot line before CIV6MAP_BEGIN header.');

    const parts = line.split('|');
    if (parts.length < 8) throw new Error(`Malformed plot line: "${line}"`);
    const [, xs, ys, terrainStr, featureStr, resourceStr, lakeStr, riverStr] = parts;
    const x = Number(xs);
    const y = Number(ys);
    if (!inBounds(map, x, y)) throw new Error(`Plot (${xs},${ys}) outside ${width}x${height}.`);
    const tile = map.tiles[tileIndex(map, x, y)];
    report.plots++;

    // --- terrain + elevation ------------------------------------------------
    const m = /^TERRAIN_([A-Z]+?)(_HILLS|_MOUNTAIN)?$/.exec(terrainStr);
    const base = m ? TERRAIN_BASE[m[1]] : undefined;
    if (!base) throw new Error(`Unknown terrain "${terrainStr}" at (${x},${y}).`);
    tile.terrain = base;
    tile.elevation = m![2] === '_HILLS' ? 'HILLS' : m![2] === '_MOUNTAIN' ? 'MOUNTAIN' : 'FLAT';
    if (tile.terrain === 'COAST' && lakeStr === 'L') tile.terrain = 'LAKE';

    // --- feature / natural wonder --------------------------------------------
    if (featureStr !== '-') {
      const wonder = WONDER_MAP[featureStr];
      const feature = FEATURE_MAP[featureStr];
      if (wonder && WONDERS[wonder]) {
        tile.wonder = wonder;
        wonders.add(wonder);
      } else if (feature && FEATURES[feature]) {
        tile.feature = feature;
      } else {
        report.unknownFeatures[featureStr] = (report.unknownFeatures[featureStr] ?? 0) + 1;
      }
    }

    // --- resource --------------------------------------------------------------
    if (resourceStr !== '-') {
      const id = resourceStr.replace(/^RESOURCE_/, '');
      if (RESOURCES[id] && !tile.wonder) {
        tile.resource = id;
      } else {
        report.unknownResources[resourceStr] = (report.unknownResources[resourceStr] ?? 0) + 1;
      }
    }

    // --- rivers ------------------------------------------------------------------
    // Exporter bits (Civ 6, rows counted from the south): 1 = east edge,
    // 2 = southeast edge, 4 = southwest edge. Under our north-south mirror
    // those become east / northeast / northwest (dirs 0 / 1 / 2).
    const river = Number(riverStr);
    if (river & 1) setRiverEdge(map, tile, 0);
    if (river & 2) setRiverEdge(map, tile, 1);
    if (river & 4) setRiverEdge(map, tile, 2);
  }

  if (!map) throw new Error('No CIV6MAP_BEGIN header found — paste the whole Lua.log.');
  report.width = width;
  report.height = height;
  report.missingPlots = width * height - report.plots;
  report.wonders = [...wonders];
  return { map, report };
}

/** One-line human summary of an import. */
export function importSummary(report: ImportReport): string {
  const parts = [`${report.width}×${report.height}, ${report.plots} plots`];
  if (report.wonders.length) parts.push(`wonders: ${report.wonders.join(', ')}`);
  const uf = Object.entries(report.unknownFeatures).reduce((s, [, n]) => s + n, 0);
  const ur = Object.entries(report.unknownResources).reduce((s, [, n]) => s + n, 0);
  if (uf) parts.push(`${uf} unknown feature tiles skipped`);
  if (ur) parts.push(`${ur} unknown resource tiles skipped`);
  if (report.missingPlots) parts.push(`${report.missingPlots} plots missing (filled as ocean)`);
  return parts.join(' · ');
}
