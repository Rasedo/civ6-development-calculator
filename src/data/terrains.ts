/**
 * Terrain definitions. Yields follow base Civ 6:
 * grassland 2F, plains 1F1P, desert 0, tundra 1F, snow 0,
 * coast 1F1G, lake 1F1G, ocean 1F. Hills add +1P (handled via Tile.elevation),
 * mountains are impassable and yield nothing.
 */

import type { TerrainId, Yields } from '../core/types';

export interface TerrainDef {
  id: TerrainId;
  name: string;
  water: boolean;
  yields: Partial<Yields>;
  color: string;
  hillsColor?: string;
}

export const TERRAINS: Record<TerrainId, TerrainDef> = {
  GRASSLAND: {
    id: 'GRASSLAND',
    name: 'Grassland',
    water: false,
    yields: { food: 2 },
    color: '#7fa650',
    hillsColor: '#6d9143',
  },
  PLAINS: {
    id: 'PLAINS',
    name: 'Plains',
    water: false,
    yields: { food: 1, production: 1 },
    color: '#b5a35c',
    hillsColor: '#9f8e4d',
  },
  DESERT: {
    id: 'DESERT',
    name: 'Desert',
    water: false,
    yields: {},
    color: '#e0c585',
    hillsColor: '#c8ad6e',
  },
  TUNDRA: {
    id: 'TUNDRA',
    name: 'Tundra',
    water: false,
    yields: { food: 1 },
    color: '#a8a890',
    hillsColor: '#93937c',
  },
  SNOW: {
    id: 'SNOW',
    name: 'Snow',
    water: false,
    yields: {},
    color: '#e8edf2',
    hillsColor: '#cfd6dd',
  },
  COAST: {
    id: 'COAST',
    name: 'Coast',
    water: true,
    yields: { food: 1, gold: 1 },
    color: '#5d97c2',
  },
  LAKE: {
    id: 'LAKE',
    name: 'Lake',
    water: true,
    yields: { food: 1, gold: 1 },
    color: '#56aec2',
  },
  OCEAN: {
    id: 'OCEAN',
    name: 'Ocean',
    water: true,
    yields: { food: 1 },
    color: '#2b5680',
  },
};

export const HILLS_YIELDS: Partial<Yields> = { production: 1 };
export const MOUNTAIN_COLOR = '#8b8b82';
