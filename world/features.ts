/**
 * Tile features. Yield modifiers follow base Civ 6:
 * woods +1P, rainforest +1F, marsh +1F, floodplains +3F (on bare desert),
 * oasis +3F+1G, reef +1F+1P (Gathering Storm feature, included because it
 * matters for coastal play), ice impassable.
 */

import type { TerrainId, YieldKey, Yields } from './types';

export interface FeatureDef {
  id: string;
  name: string;
  yields: Partial<Yields>;
  terrains: TerrainId[];
  allowHills: boolean;
  impassable?: boolean;
  removable: boolean;
  freshWater?: boolean;
  chopYield?: YieldKey;
}

/** Features a builder can CLEAR — the Deforestation Treaty's target space,
 *  and the order its wire target index addresses. */
export function clearableFeatures(): string[] {
  return Object.values(FEATURES).filter((f) => f.removable && f.chopYield).map((f) => f.id);
}

export const FEATURES: Record<string, FeatureDef> = {
  WOODS: {
    id: 'WOODS',
    name: 'Woods',
    yields: { production: 1 },
    terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'],
    allowHills: true,
    removable: true,
    chopYield: 'production',
  },
  RAINFOREST: {
    id: 'RAINFOREST',
    name: 'Rainforest',
    yields: { food: 1 },
    terrains: ['PLAINS'],
    allowHills: true,
    removable: true,
    chopYield: 'food',
  },
  MARSH: {
    id: 'MARSH',
    name: 'Marsh',
    yields: { food: 1 },
    terrains: ['GRASSLAND'],
    allowHills: false,
    removable: true,
    chopYield: 'food',
  },
  FLOODPLAINS: {
    id: 'FLOODPLAINS',
    name: 'Floodplains',
    yields: { food: 3 },
    terrains: ['DESERT'],
    allowHills: false,
    removable: false,
  },
  OASIS: {
    id: 'OASIS',
    name: 'Oasis',
    yields: { food: 3, gold: 1 },
    terrains: ['DESERT'],
    allowHills: false,
    removable: false,
    freshWater: true,
  },
  REEF: {
    id: 'REEF',
    name: 'Reef',
    yields: { food: 1, production: 1 },
    terrains: ['COAST'],
    allowHills: false,
    removable: false,
  },
  ICE: {
    id: 'ICE',
    name: 'Ice',
    yields: {},
    terrains: ['COAST', 'OCEAN'],
    allowHills: false,
    impassable: true,
    removable: false,
  },
};
