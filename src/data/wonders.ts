/**
 * Natural wonders (a recognizable base-game subset). Values eyeballed close
 * to Civ 6. Wonder tiles can never be improved, districted or settled;
 * passable ones are workable with the yields below. Holy Sites get +2 faith
 * adjacency from any adjacent natural wonder (see districts.ts).
 */

import type { TerrainId, Yields } from '../core/types';

export interface NaturalWonderDef {
  id: string;
  name: string;
  /** Short code drawn on the map. */
  code: string;
  /** Number of contiguous tiles. */
  size: number;
  impassable: boolean;
  /** Terrain the wonder tiles are converted to (e.g. lakes). */
  becomesTerrain?: TerrainId;
  /** Yields of each wonder tile (workable only if passable). */
  tileYields: Partial<Yields>;
  /** Bonus yields granted to all adjacent (non-wonder) tiles. */
  adjacentYields?: Partial<Yields>;
  /** Adjacent tiles get their base terrain yields doubled (Torres del Paine). */
  doublesAdjacentTerrain?: boolean;
  /** Placement requirements for the anchor tile. */
  spawn: {
    water?: boolean; // must be coast water
    terrains?: TerrainId[]; // for land wonders
    minLat?: number;
    maxLat?: number;
    inland?: boolean; // no adjacent salt water
  };
  color: string;
}

export const WONDERS: Record<string, NaturalWonderDef> = {
  CRATER_LAKE: {
    id: 'CRATER_LAKE',
    name: 'Crater Lake',
    code: 'CL',
    size: 1,
    impassable: false,
    becomesTerrain: 'LAKE',
    tileYields: { science: 1, faith: 4 },
    spawn: { terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], inland: true, maxLat: 0.85 },
    color: '#7fd4e8',
  },
  DEAD_SEA: {
    id: 'DEAD_SEA',
    name: 'Dead Sea',
    code: 'DS',
    size: 2,
    impassable: false,
    becomesTerrain: 'LAKE',
    tileYields: { faith: 2, culture: 2 },
    spawn: { terrains: ['DESERT', 'PLAINS'], inland: true, minLat: 0.15, maxLat: 0.55 },
    color: '#9fe0d8',
  },
  GALAPAGOS: {
    id: 'GALAPAGOS',
    name: 'Galápagos Islands',
    code: 'GA',
    size: 2,
    impassable: true,
    tileYields: {},
    adjacentYields: { science: 2 },
    spawn: { water: true, maxLat: 0.5 },
    color: '#6fd8a8',
  },
  GREAT_BARRIER_REEF: {
    id: 'GREAT_BARRIER_REEF',
    name: 'Great Barrier Reef',
    code: 'GB',
    size: 2,
    impassable: false,
    tileYields: { food: 2, science: 2 },
    spawn: { water: true, maxLat: 0.55 },
    color: '#ff9fb0',
  },
  PANTANAL: {
    id: 'PANTANAL',
    name: 'Pantanal',
    code: 'PN',
    size: 3,
    impassable: false,
    tileYields: { food: 2, culture: 2 },
    spawn: { terrains: ['GRASSLAND', 'PLAINS'], maxLat: 0.45 },
    color: '#8fd86f',
  },
  ULURU: {
    id: 'ULURU',
    name: 'Uluru',
    code: 'UL',
    size: 1,
    impassable: true,
    tileYields: {},
    adjacentYields: { culture: 2, faith: 2 },
    spawn: { terrains: ['DESERT', 'PLAINS'], minLat: 0.15, maxLat: 0.55 },
    color: '#e8845f',
  },
  TORRES_DEL_PAINE: {
    id: 'TORRES_DEL_PAINE',
    name: 'Torres del Paine',
    code: 'TP',
    size: 2,
    impassable: true,
    tileYields: {},
    doublesAdjacentTerrain: true,
    spawn: { terrains: ['PLAINS', 'TUNDRA', 'GRASSLAND'], minLat: 0.45, maxLat: 0.88 },
    color: '#b8c8e8',
  },
};

/** How many wonders to place per map size (scaled by tile count). */
export function wonderQuota(width: number, height: number): number {
  return Math.max(2, Math.round((width * height) / 1000));
}
