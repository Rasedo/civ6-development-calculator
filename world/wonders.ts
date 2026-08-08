/**
 * Natural wonders (a recognizable base-game subset). Wonder tiles can never be
 * improved, districted or settled;
 * passable ones are workable with the yields below. Holy Sites get +2 faith
 * adjacency from any adjacent natural wonder (see districts.ts).
 *
 * SOURCING SWEEP, all against the GS CIVILOPEDIA directly:
 *   CRATER_LAKE  corrected faith 4 -> 5 ("+5 Faith, +1 Science") — CONFIRMED
 *   DEAD_SEA     +2 Faith / +2 Culture — correct as written
 *   PANTANAL     +2 Food / +2 Culture — correct as written
 *
 * YOSEMITE is `impassable: true` with
 * `adjacentYields: { gold: 1, food: 1, science: 1 }` and no own-tile yield,
 * matching the Civilopedia.
 * Its "+2 Appeal to neighbouring tiles" is NOT modelled: appeal credits any
 * adjacent natural wonder +2 generically (core/appeal.ts), so Yosemite already
 * gets the right appeal by the general rule and needs no per-wonder term.
 *
 * The remaining eight wonders are NOT yet sourced individually; NARROWED marker.
 */

import type { TerrainId, Yields } from './types';

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
    // SOURCING SWEEP: faith 4 -> 5. Real Civ 6 Crater Lake
    // yields 5 Faith and 1 Science on its tile (Civilization wiki, "Crater
    // Lake (Civ6)"). Dead Sea (+2 culture / +2 faith) re-verified and correct.
    tileYields: { science: 1, faith: 5 },
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

  // Natural wonders 7 → 12. Effects use ONLY the fields tileYields()
  // already bakes into the exported per-tile yields (tileYields / adjacentYields)
  // plus the generic Holy-Site NATURAL_WONDER adjacency + the ASTROLOGY "near a
  // wonder" eureka — so every new wonder is captured in the map export and the
  // GPU (which reads the baked map) stays turn-exact.
  MOUNT_KILIMANJARO: {
    id: 'MOUNT_KILIMANJARO',
    name: 'Mount Kilimanjaro',
    code: 'KI',
    size: 1,
    impassable: true,
    tileYields: {},
    adjacentYields: { food: 1, science: 1 },
    spawn: { terrains: ['GRASSLAND', 'PLAINS'], maxLat: 0.4 },
    color: '#cfe0b0',
  },
  YOSEMITE: {
    id: 'YOSEMITE',
    name: 'Yosemite',
    code: 'YO',
    size: 2,
    // Sourced from the Civilopedia
    // (features/feature_yosemite) — "+1 Gold, +1 Food, and +1 Science to
    // adjacent tiles" and "impassable — units cannot enter this two-tile
    // natural wonder". Was `impassable: false` paying { gold, science } on its
    // OWN tile: wrong on passability, wrong channel, and missing the Food.
    // The recorded note claimed this needed a NEW adjacency channel; it did
    // not — `adjacentYields` already exists and five other wonders use it.
    impassable: true,
    tileYields: {},
    adjacentYields: { gold: 1, food: 1, science: 1 },
    spawn: { terrains: ['PLAINS', 'TUNDRA', 'GRASSLAND'], minLat: 0.4 },
    color: '#a8c890',
  },
  CLIFFS_OF_DOVER: {
    id: 'CLIFFS_OF_DOVER',
    name: 'Cliffs of Dover',
    code: 'CD',
    size: 2,
    impassable: true,
    tileYields: {},
    adjacentYields: { gold: 2, culture: 1 },
    spawn: { terrains: ['GRASSLAND', 'PLAINS'], minLat: 0.45 },
    color: '#e8e8f0',
  },
  MOUNT_EVEREST: {
    id: 'MOUNT_EVEREST',
    name: 'Mount Everest',
    code: 'EV',
    size: 2,
    impassable: true,
    tileYields: {},
    adjacentYields: { faith: 1, science: 1 },
    spawn: { terrains: ['TUNDRA', 'PLAINS', 'GRASSLAND'], minLat: 0.5 },
    color: '#dce6f2',
  },
  EYE_OF_THE_SAHARA: {
    id: 'EYE_OF_THE_SAHARA',
    name: 'Eye of the Sahara',
    code: 'ES',
    size: 3,
    impassable: false,
    tileYields: { science: 2, gold: 1 },
    spawn: { terrains: ['DESERT'], minLat: 0.1, maxLat: 0.5 },
    color: '#e0c088',
  },
};

/** How many wonders to place per map size (scaled by tile count). */
export function wonderQuota(width: number, height: number): number {
  return Math.max(2, Math.round((width * height) / 1000));
}
