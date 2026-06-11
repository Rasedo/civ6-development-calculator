/**
 * Tile features. Yield modifiers follow base Civ 6:
 * woods +1P, rainforest +1F, marsh +1F, floodplains +3F (on bare desert),
 * oasis +3F+1G, reef +1F+1P (Gathering Storm feature, included because it
 * matters for coastal play), ice impassable.
 */

import type { TerrainId, Yields } from '../core/types';

export interface FeatureDef {
  id: string;
  name: string;
  yields: Partial<Yields>;
  /** Terrains the feature can sit on (for generation + validation). */
  terrains: TerrainId[];
  /** Allowed on hills? (always allowed on flat unless flatOnly is false). */
  allowHills: boolean;
  impassable?: boolean;
  /** Can a builder remove it (chop)? */
  removable: boolean;
  /** Counts as fresh water for adjacent tiles / cities. */
  freshWater?: boolean;
}

export const FEATURES: Record<string, FeatureDef> = {
  WOODS: {
    id: 'WOODS',
    name: 'Woods',
    yields: { production: 1 },
    terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'],
    allowHills: true,
    removable: true,
  },
  RAINFOREST: {
    id: 'RAINFOREST',
    name: 'Rainforest',
    yields: { food: 1 },
    terrains: ['PLAINS'],
    allowHills: true,
    removable: true,
  },
  MARSH: {
    id: 'MARSH',
    name: 'Marsh',
    yields: { food: 1 },
    terrains: ['GRASSLAND'],
    allowHills: false,
    removable: true,
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
