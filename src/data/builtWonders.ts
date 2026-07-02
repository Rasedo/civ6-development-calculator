/**
 * World wonders (base-game subset whose effects fit the modeled systems).
 * One per world; they occupy a tile like a district. Costs/effects are
 * eyeballed base Civ 6; a few unlock techs are stand-ins where the real
 * unlock isn't in our compact tree (noted inline).
 */

import type { DistrictId, TerrainId, Yields } from '../core/types';

export interface BuiltWonderDef {
  id: string;
  name: string;
  code: string;
  cost: number;
  requiresTech?: string;
  requiresCivic?: string;
  placement: {
    /** Allowed base terrains (land wonders). */
    terrains?: TerrainId[];
    flatOnly?: boolean;
    hillsOnly?: boolean;
    requiresRiver?: boolean;
    /** Must neighbor a completed district of this type. */
    adjacentDistrict?: DistrictId;
    /** Must neighbor a tile with this resource. */
    adjacentResource?: string;
    /** Placed on coastal water adjacent to land (Colossus). */
    onCoastalWater?: boolean;
    allowFloodplains?: boolean;
  };
  /** Flat yields for the owning city. */
  cityYields?: Partial<Yields>;
  effects?: {
    /** Growth multiplier for every city in the empire (Hanging Gardens). */
    growthAllMult?: number;
    /** Amenities to cities within 6 tiles (Colosseum). */
    regionalAmenities?: number;
    /** +2 food +2 gold +1 production on this city's non-floodplain desert tiles. */
    petraDesert?: boolean;
    /** Multipliers on the owning city's final yields (Ruhr, Oxford, Big Ben). */
    cityYieldMult?: Partial<Yields>;
    /** Adds a wildcard policy slot (Forbidden City). */
    extraWildcardSlot?: boolean;
  };
  description: string;
}

const W = (def: BuiltWonderDef) => def;

export const BUILT_WONDERS: Record<string, BuiltWonderDef> = Object.fromEntries(
  [
    W({
      id: 'STONEHENGE',
      name: 'Stonehenge',
      code: 'SH',
      cost: 180,
      requiresTech: 'ASTROLOGY',
      placement: { flatOnly: true, adjacentResource: 'STONE' },
      cityYields: { faith: 2 },
      description: '+2 faith. Flat land adjacent to Stone.',
    }),
    W({
      id: 'PYRAMIDS',
      name: 'Pyramids',
      code: 'PY',
      cost: 220,
      requiresTech: 'MASONRY',
      placement: { terrains: ['DESERT'], flatOnly: true, allowFloodplains: true },
      cityYields: { culture: 2 },
      description: '+2 culture. Desert (floodplains allowed).',
    }),
    W({
      id: 'HANGING_GARDENS',
      name: 'Hanging Gardens',
      code: 'HG',
      cost: 180,
      requiresTech: 'IRRIGATION',
      placement: { requiresRiver: true },
      effects: { growthAllMult: 1.15 },
      description: '+15% growth in all cities. Must be on a river.',
    }),
    W({
      id: 'ORACLE',
      name: 'Oracle',
      code: 'OR',
      cost: 290,
      requiresCivic: 'MYSTICISM',
      placement: { hillsOnly: true },
      cityYields: { culture: 1, faith: 1 },
      description: '+1 culture, +1 faith. Hills.',
    }),
    W({
      id: 'GREAT_LIBRARY',
      name: 'Great Library',
      code: 'GL',
      cost: 400,
      requiresCivic: 'RECORDED_HISTORY',
      placement: { flatOnly: true, adjacentDistrict: 'CAMPUS' },
      cityYields: { science: 2 },
      description: '+2 science. Flat land adjacent to a Campus.',
    }),
    W({
      id: 'COLOSSEUM',
      name: 'Colosseum',
      code: 'CO',
      cost: 400,
      requiresCivic: 'GAMES_AND_RECREATION',
      placement: { flatOnly: true, adjacentDistrict: 'ENTERTAINMENT_COMPLEX' },
      cityYields: { culture: 2 },
      effects: { regionalAmenities: 1 },
      description: '+2 culture; +1 amenity to cities within 6 tiles. Flat, adjacent to an Entertainment Complex.',
    }),
    W({
      id: 'PETRA',
      name: 'Petra',
      code: 'PE',
      cost: 400,
      requiresTech: 'MATHEMATICS',
      placement: { terrains: ['DESERT'], flatOnly: true },
      effects: { petraDesert: true },
      description: "+2 food, +2 gold, +1 production on this city's desert tiles (non-floodplain).",
    }),
    W({
      id: 'COLOSSUS',
      name: 'Colossus',
      code: 'CS',
      cost: 400,
      requiresTech: 'CELESTIAL_NAVIGATION', // stand-in for Shipbuilding
      placement: { onCoastalWater: true, adjacentDistrict: 'HARBOR' },
      cityYields: { gold: 3 },
      description: '+3 gold. Coastal water adjacent to a Harbor.',
    }),
    W({
      id: 'GREAT_ZIMBABWE',
      name: 'Great Zimbabwe',
      code: 'GZ',
      cost: 680,
      requiresTech: 'BANKING',
      placement: { flatOnly: true, adjacentDistrict: 'COMMERCIAL_HUB' },
      cityYields: { gold: 5 },
      description: '+5 gold. Flat land adjacent to a Commercial Hub.',
    }),
    W({
      id: 'FORBIDDEN_CITY',
      name: 'Forbidden City',
      code: 'FC',
      cost: 920,
      requiresTech: 'EDUCATION', // stand-in for Printing
      placement: { flatOnly: true, adjacentDistrict: 'CITY_CENTER' },
      cityYields: { culture: 5 },
      effects: { extraWildcardSlot: true },
      description: '+5 culture and an extra wildcard policy slot. Flat, adjacent to the City Center.',
    }),
    W({
      id: 'OXFORD_UNIVERSITY',
      name: 'Oxford University',
      code: 'OX',
      cost: 1450,
      requiresTech: 'ASTRONOMY', // stand-in for Scientific Theory
      placement: { flatOnly: true, adjacentDistrict: 'CAMPUS' },
      cityYields: { science: 3 },
      effects: { cityYieldMult: { science: 1.1 } },
      description: '+3 science and +10% science in this city. Flat, adjacent to a Campus.',
    }),
    W({
      id: 'RUHR_VALLEY',
      name: 'Ruhr Valley',
      code: 'RV',
      cost: 1450,
      requiresTech: 'INDUSTRIALIZATION',
      placement: { requiresRiver: true, adjacentDistrict: 'INDUSTRIAL_ZONE' },
      effects: { cityYieldMult: { production: 1.2 } },
      description: '+20% production in this city. River tile adjacent to an Industrial Zone.',
    }),
    W({
      id: 'BIG_BEN',
      name: 'Big Ben',
      code: 'BB',
      cost: 1450,
      requiresTech: 'ECONOMICS',
      placement: { requiresRiver: true, adjacentDistrict: 'COMMERCIAL_HUB' },
      cityYields: { gold: 6 },
      effects: { cityYieldMult: { gold: 1.1 } },
      description: '+6 gold and +10% gold in this city. River tile adjacent to a Commercial Hub.',
    }),
  ].map((w) => [w.id, w]),
);
