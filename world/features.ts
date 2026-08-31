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
  /** a NATURAL WONDER row — one roster with every other feature. Its
   *  `yields` are the tile's WHOLE yields (no terrain underneath),
   *  `adjacentYields` pay every neighbouring tile, and a
   *  `doublesAdjacentTerrain` row doubles the neighbour's terrain yields
   *  instead. Spawn rules, size and colour stay in `WONDERS`. */
  naturalWonder?: boolean;
  adjacentYields?: Partial<Yields>;
  doublesAdjacentTerrain?: boolean;
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
  // APPENDED LAST — roster order IS the wire's feature index.
  // CIV6 (Geothermal Fissure): "+1 Science", and the ground a GEOTHERMAL
  // PLANT must stand on. Unremovable — no builder clears one.
  GEOTHERMAL_FISSURE: {
    id: 'GEOTHERMAL_FISSURE',
    name: 'Geothermal Fissure',
    yields: { science: 1 },
    terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'],
    allowHills: true,
    removable: false,
  },
  // CIV6 (Volcanic Soil): "This land adjacent to a volcano has suffered from
  // a previous eruption ... the rich deposits of minerals the volcano has
  // brought forth have probably enhanced the yields here", and its one listed
  // trait is "Can receive additional yields from environmental effects" —
  // which is `Tile.fertility` / `fertilityProd`, the channel an eruption
  // already writes. The row carries the NAME the Fire Goddess addresses; the
  // yields stay where they were.
  // CIV6 (Volcanic Soil): "This land adjacent to a volcano has suffered from
  // a previous eruption ... Can receive additional yields from environmental
  // effects" — the `fertility` channel, which the eruption already lays down.
  // The row carries the NAME, which Fire Goddess pays Faith on; nothing on
  // the map places it yet.
  VOLCANIC_SOIL: {
    id: 'VOLCANIC_SOIL',
    name: 'Volcanic Soil',
    yields: {},
    terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'],
    allowHills: true,
    removable: false,
  },
};

// The NATURAL WONDERS, appended LAST — this record's order is the exported
// feature index, so anything but an append renumbers every other row.
// SOURCING SWEEP: Crater Lake faith 4 -> 5. Real Civ 6 Crater Lake yields
// 5 Faith and 1 Science on its tile (Civilization wiki, "Crater Lake
// (Civ6)"). Dead Sea (+2 culture / +2 faith) re-verified and correct.
const NW = { terrains: [] as TerrainId[], allowHills: false, removable: false, naturalWonder: true };
Object.assign(FEATURES, {
  CRATER_LAKE: { id: 'CRATER_LAKE', name: 'Crater Lake', yields: { science: 1, faith: 5 }, ...NW },
  DEAD_SEA: { id: 'DEAD_SEA', name: 'Dead Sea', yields: { faith: 2, culture: 2 }, ...NW },
  GALAPAGOS: { id: 'GALAPAGOS', name: 'Galápagos Islands', yields: {}, impassable: true, adjacentYields: { science: 2 }, ...NW },
  GREAT_BARRIER_REEF: { id: 'GREAT_BARRIER_REEF', name: 'Great Barrier Reef', yields: { food: 2, science: 2 }, ...NW },
  PANTANAL: { id: 'PANTANAL', name: 'Pantanal', yields: { food: 2, culture: 2 }, ...NW },
  ULURU: { id: 'ULURU', name: 'Uluru', yields: {}, impassable: true, adjacentYields: { culture: 2, faith: 2 }, ...NW },
  TORRES_DEL_PAINE: { id: 'TORRES_DEL_PAINE', name: 'Torres del Paine', yields: {}, impassable: true, doublesAdjacentTerrain: true, ...NW },
  MOUNT_KILIMANJARO: { id: 'MOUNT_KILIMANJARO', name: 'Mount Kilimanjaro', yields: {}, impassable: true, adjacentYields: { food: 1, science: 1 }, ...NW },
  YOSEMITE: { id: 'YOSEMITE', name: 'Yosemite', yields: {}, impassable: true, adjacentYields: { gold: 1, food: 1, science: 1 }, ...NW },
  CLIFFS_OF_DOVER: { id: 'CLIFFS_OF_DOVER', name: 'Cliffs of Dover', yields: {}, impassable: true, adjacentYields: { gold: 2, culture: 1 }, ...NW },
  MOUNT_EVEREST: { id: 'MOUNT_EVEREST', name: 'Mount Everest', yields: {}, impassable: true, adjacentYields: { faith: 1, science: 1 }, ...NW },
  EYE_OF_THE_SAHARA: { id: 'EYE_OF_THE_SAHARA', name: 'Eye of the Sahara', yields: { science: 2, gold: 1 }, ...NW },
} satisfies Record<string, FeatureDef>);
