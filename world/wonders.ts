
import type { Elevation, FeatureId, TerrainId } from './types';

/** a terrain as the install names one: the base terrain and its elevation
 *  (TERRAIN_GRASS_MOUNTAIN is GRASSLAND at MOUNTAIN). */
export type GroundKind = readonly [TerrainId, Elevation];

/** every pair of `terrains` × `elevations`, the shape every roster row's
 *  terrain list takes. */
function ground(terrains: readonly TerrainId[], elevations: readonly Elevation[]): GroundKind[] {
  return terrains.flatMap((t) => elevations.map((e) => [t, e] as const));
}

const LAND: readonly TerrainId[] = ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW'];
const MOUNTAINS = ground(LAND, ['MOUNTAIN']);

/** CIV6 (`Features.MinDistanceNW`, 8 on every natural wonder row): no plot of
 *  a wonder stands nearer than this to a plot of another. */
export const MIN_DISTANCE_NW = 8;

/** MAPGEN data only — a wonder's yields, appeal and passability live on its
 *  FEATURE row (`FEATURES`), the one roster every reader asks. Every land
 *  clause holds for every plot the wonder covers. */
export interface NaturalWonderDef {
  /** doubles as the wonder's FEATURE row id — the roster the readers ask. */
  id: FeatureId;
  name: string;
  code: string;
  /** CIV6 (`Features.Tiles`): the plots it covers. */
  size: number;
  becomesTerrain?: TerrainId;
  spawn: {
    water?: boolean; // must be coast water
    minLat?: number; // the water wonders' band
    maxLat?: number;
    /** CIV6 (Feature_ValidTerrains): the land terrains and elevations a plot
     *  may stand on — every roster row's list is their product. */
    terrains?: TerrainId[];
    elevations?: Elevation[];
    /** CIV6 (`Features.NoCoast`): no adjacent salt water. */
    inland?: boolean;
    /** CIV6 (`Features.Coast`): adjacent salt water. */
    coast?: boolean;
    /** CIV6 (`Features.NoRiver`): no river edge. */
    noRiver?: boolean;
    /** CIV6 (Feature_AdjacentTerrains): at least one neighbour stands on one
     *  of these. */
    adjacentTerrains?: GroundKind[];
    /** CIV6 (Feature_NotAdjacentTerrains): no neighbour stands on one of
     *  these. */
    notAdjacentTerrains?: GroundKind[];
    /** CIV6 (Feature_AdjacentFeatures): at least one neighbour carries one of
     *  these. */
    adjacentFeatures?: FeatureId[];
    /** CIV6 (`Features.NoAdjacentFeatures`): no neighbour carries a feature. */
    noAdjacentFeatures?: boolean;
  };
  color: string;
}

// The land rows are the layered install's Features, Feature_ValidTerrains,
// Feature_AdjacentTerrains, Feature_NotAdjacentTerrains and
// Feature_AdjacentFeatures rows (Features.xml, Expansion1_Features_Major.xml,
// Expansion2_Features.xml, Australia_Features.xml, VikingsLandmarks_Features.xml).
export const WONDERS: Record<string, NaturalWonderDef> = {
  CRATER_LAKE: {
    id: 'CRATER_LAKE',
    name: 'Crater Lake',
    code: 'CL',
    size: 1,
    becomesTerrain: 'LAKE',
    spawn: { terrains: ['PLAINS', 'TUNDRA'], elevations: ['FLAT'], inland: true, noRiver: true },
    color: '#7fd4e8',
  },
  DEAD_SEA: {
    id: 'DEAD_SEA',
    name: 'Dead Sea',
    code: 'DS',
    size: 2,
    becomesTerrain: 'LAKE',
    spawn: {
      terrains: ['GRASSLAND', 'DESERT'], elevations: ['FLAT'], inland: true, noRiver: true,
      notAdjacentTerrains: MOUNTAINS, noAdjacentFeatures: true,
    },
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
    size: 4,
    spawn: {
      terrains: ['GRASSLAND', 'PLAINS'], elevations: ['FLAT'], inland: true, noRiver: true,
      notAdjacentTerrains: ground(['SNOW'], ['FLAT']),
    },
    color: '#8fd86f',
  },
  ULURU: {
    id: 'ULURU',
    name: 'Uluru',
    code: 'UL',
    size: 1,
    spawn: {
      terrains: ['DESERT'], elevations: ['FLAT', 'HILLS'], inland: true, noRiver: true,
      notAdjacentTerrains: [...MOUNTAINS, ...ground(['GRASSLAND', 'PLAINS', 'TUNDRA', 'SNOW'], ['FLAT', 'HILLS'])],
    },
    color: '#e8845f',
  },
  TORRES_DEL_PAINE: {
    id: 'TORRES_DEL_PAINE',
    name: 'Torres del Paine',
    code: 'TP',
    size: 2,
    spawn: {
      terrains: ['GRASSLAND', 'PLAINS', 'TUNDRA'], elevations: ['FLAT', 'HILLS'], inland: true, noRiver: true,
      notAdjacentTerrains: [...ground(['DESERT', 'SNOW'], ['FLAT']), ...MOUNTAINS],
    },
    color: '#b8c8e8',
  },
  MOUNT_KILIMANJARO: {
    id: 'MOUNT_KILIMANJARO',
    name: 'Mount Kilimanjaro',
    code: 'KI',
    size: 1,
    spawn: {
      terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA'], elevations: ['MOUNTAIN'], inland: true, noRiver: true,
      notAdjacentTerrains: MOUNTAINS,
    },
    color: '#cfe0b0',
  },
  YOSEMITE: {
    id: 'YOSEMITE',
    name: 'Yosemite',
    code: 'YO',
    size: 2,
    spawn: {
      terrains: ['PLAINS', 'TUNDRA'], elevations: ['FLAT'], inland: true, noRiver: true,
      notAdjacentTerrains: MOUNTAINS, adjacentFeatures: ['WOODS'],
    },
    color: '#a8c890',
  },
  CLIFFS_OF_DOVER: {
    id: 'CLIFFS_OF_DOVER',
    name: 'Cliffs of Dover',
    code: 'CD',
    size: 2,
    spawn: { terrains: ['GRASSLAND', 'PLAINS'], elevations: ['HILLS'], coast: true, noRiver: true },
    color: '#e8e8f0',
  },
  MOUNT_EVEREST: {
    id: 'MOUNT_EVEREST',
    name: 'Mount Everest',
    code: 'EV',
    size: 3,
    spawn: {
      terrains: ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA'], elevations: ['MOUNTAIN'], inland: true, noRiver: true,
      adjacentTerrains: ground(LAND, ['FLAT', 'HILLS']),
    },
    color: '#dce6f2',
  },
  EYE_OF_THE_SAHARA: {
    id: 'EYE_OF_THE_SAHARA',
    name: 'Eye of the Sahara',
    code: 'ES',
    size: 3,
    spawn: { terrains: ['DESERT'], elevations: ['FLAT', 'HILLS'], inland: true, noRiver: true },
    color: '#e0c088',
  },
  EYJAFJALLAJOKULL: {
    id: 'EYJAFJALLAJOKULL',
    name: 'Eyjafjallajökull',
    code: 'EY',
    size: 2,
    spawn: {
      terrains: ['SNOW', 'TUNDRA'], elevations: ['FLAT', 'HILLS'], inland: true, noRiver: true,
      adjacentTerrains: ground(['SNOW', 'TUNDRA'], ['FLAT', 'HILLS']),
    },
    color: '#c8ccd4',
  },
  VESUVIUS: {
    id: 'VESUVIUS',
    name: 'Vesuvius',
    code: 'VE',
    size: 1,
    spawn: {
      terrains: ['GRASSLAND', 'PLAINS'], elevations: ['MOUNTAIN'], noRiver: true,
      adjacentTerrains: ground(LAND, ['FLAT', 'HILLS']),
    },
    color: '#8a6f63',
  },
};

export function wonderQuota(width: number, height: number): number {
  return Math.max(2, Math.round((width * height) / 1000));
}
