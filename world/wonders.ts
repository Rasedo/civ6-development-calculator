
import type { FeatureId, TerrainId } from './types';

/** MAPGEN data only — a wonder's yields, appeal and passability live on its
 *  FEATURE row (`FEATURES`), the one roster every reader asks. */
export interface NaturalWonderDef {
  /** doubles as the wonder's FEATURE row id — the roster the readers ask. */
  id: FeatureId;
  name: string;
  code: string;
  size: number;
  becomesTerrain?: TerrainId;
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
    becomesTerrain: 'LAKE',
    spawn: { terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], inland: true, maxLat: 0.85 },
    color: '#7fd4e8',
  },
  DEAD_SEA: {
    id: 'DEAD_SEA',
    name: 'Dead Sea',
    code: 'DS',
    size: 2,
    becomesTerrain: 'LAKE',
    spawn: { terrains: ['DESERT', 'PLAINS'], inland: true, minLat: 0.15, maxLat: 0.55 },
    color: '#9fe0d8',
  },
  GALAPAGOS: {
    id: 'GALAPAGOS',
    name: 'Galápagos Islands',
    code: 'GA',
    size: 2,
    spawn: { water: true, maxLat: 0.5 },
    color: '#6fd8a8',
  },
  GREAT_BARRIER_REEF: {
    id: 'GREAT_BARRIER_REEF',
    name: 'Great Barrier Reef',
    code: 'GB',
    size: 2,
    spawn: { water: true, maxLat: 0.55 },
    color: '#ff9fb0',
  },
  PANTANAL: {
    id: 'PANTANAL',
    name: 'Pantanal',
    code: 'PN',
    size: 3,
    spawn: { terrains: ['GRASSLAND', 'PLAINS'], maxLat: 0.45 },
    color: '#8fd86f',
  },
  ULURU: {
    id: 'ULURU',
    name: 'Uluru',
    code: 'UL',
    size: 1,
    spawn: { terrains: ['DESERT', 'PLAINS'], minLat: 0.15, maxLat: 0.55 },
    color: '#e8845f',
  },
  TORRES_DEL_PAINE: {
    id: 'TORRES_DEL_PAINE',
    name: 'Torres del Paine',
    code: 'TP',
    size: 2,
    spawn: { terrains: ['PLAINS', 'TUNDRA', 'GRASSLAND'], minLat: 0.45, maxLat: 0.88 },
    color: '#b8c8e8',
  },

  MOUNT_KILIMANJARO: {
    id: 'MOUNT_KILIMANJARO',
    name: 'Mount Kilimanjaro',
    code: 'KI',
    size: 1,
    spawn: { terrains: ['GRASSLAND', 'PLAINS'], maxLat: 0.4 },
    color: '#cfe0b0',
  },
  YOSEMITE: {
    id: 'YOSEMITE',
    name: 'Yosemite',
    code: 'YO',
    size: 2,
    spawn: { terrains: ['PLAINS', 'TUNDRA', 'GRASSLAND'], minLat: 0.4 },
    color: '#a8c890',
  },
  CLIFFS_OF_DOVER: {
    id: 'CLIFFS_OF_DOVER',
    name: 'Cliffs of Dover',
    code: 'CD',
    size: 2,
    spawn: { terrains: ['GRASSLAND', 'PLAINS'], minLat: 0.45 },
    color: '#e8e8f0',
  },
  MOUNT_EVEREST: {
    id: 'MOUNT_EVEREST',
    name: 'Mount Everest',
    code: 'EV',
    size: 2,
    spawn: { terrains: ['TUNDRA', 'PLAINS', 'GRASSLAND'], minLat: 0.5 },
    color: '#dce6f2',
  },
  EYE_OF_THE_SAHARA: {
    id: 'EYE_OF_THE_SAHARA',
    name: 'Eye of the Sahara',
    code: 'ES',
    size: 3,
    spawn: { terrains: ['DESERT'], minLat: 0.1, maxLat: 0.5 },
    color: '#e0c088',
  },
};

export function wonderQuota(width: number, height: number): number {
  return Math.max(2, Math.round((width * height) / 1000));
}
