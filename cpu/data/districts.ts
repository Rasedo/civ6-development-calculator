/**
 * Districts, common to all civs. Adjacency amounts are the GATHERING STORM
 * Civilopedia's, which is the ruleset this repo models: a "+1 for every two
 * adjacent X" reads as 0.5 here and the TOTAL truncates once, in
 * `districtAdjacency` — never per source. Production cost scales with overall
 * tech/civic progress and locks in at queue time (districtCost in
 * core/game.ts); the `cost` field below is only a fallback for queue items
 * without a locked cost.
 *
 * Sources the real game has and this map cannot express are simply absent:
 * Government Plaza, Ley Line, Geothermal Fissure, Dam/Canal/Bath (the
 * Industrial Zone's +2 reads off the Aqueduct alone), Lumber Mill and
 * strategic resources for the Industrial Zone, Entertainment Complex and
 * Water Park for the Theater Square.
 */

import type { DistrictId, YieldKey } from '../core/types';

export type AdjacencySource =
  | 'MOUNTAIN' // +amount per adjacent mountain
  | 'RAINFOREST' // per adjacent rainforest
  | 'WOODS' // per adjacent woods
  | 'REEF' // per adjacent reef
  | 'NATURAL_WONDER' // per adjacent natural wonder tile
  | 'BUILT_WONDER' // per adjacent completed world wonder
  | 'RIVER' // flat bonus if the district tile touches a river
  | 'DISTRICT' // per adjacent completed district (any type)
  | 'CITY_CENTER' // per adjacent city center
  | 'HARBOR_DISTRICT' // per adjacent harbor
  | 'SEA_RESOURCE' // per adjacent water tile with a resource
  | 'MINE' // per adjacent mine improvement (GS: +0.5 for Industrial Zone)
  | 'QUARRY' // per adjacent quarry improvement (GS: +1 for Industrial Zone)
  | 'AQUEDUCT'; // per adjacent Aqueduct district (GS: +2 for Industrial Zone)

export interface AdjacencyRule {
  source: AdjacencySource;
  amount: number;
}

export interface DistrictDef {
  id: DistrictId;
  name: string;
  code: string;
  color: string;
  cost: number;
  countsTowardLimit: boolean;
  allowMultiple: boolean;
  adjacencyYield?: YieldKey;
  adjacency: AdjacencyRule[];
  housing: number;
  placement: {
    /** Must be placed on coast/lake water adjacent to land (Harbor). */
    onCoastalWater?: boolean;
    requiresAdjacentCityCenter?: boolean;
    requiresWaterSourceOrMountain?: boolean;
    notAdjacentToCityCenter?: boolean;
  };
  description: string;
}

const D = (def: DistrictDef) => def;

export const DISTRICTS: Record<DistrictId, DistrictDef> = {
  CITY_CENTER: D({
    id: 'CITY_CENTER',
    name: 'City Center',
    code: 'CC',
    color: '#d8b54a',
    cost: 0,
    countsTowardLimit: false,
    allowMultiple: false,
    adjacency: [],
    housing: 0,
    placement: {},
    description: 'Founded with the city.',
  }),
  CAMPUS: D({
    id: 'CAMPUS',
    name: 'Campus',
    code: 'CA',
    color: '#3f8fce',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacencyYield: 'science',
    // GS Civilopedia: +1 per adjacent Mountain, +2 per adjacent Reef (and
    // Geothermal Fissure, which this map has no feature for), +1 per TWO
    // adjacent Rainforest tiles, +1 per TWO adjacent districts.
    adjacency: [
      { source: 'MOUNTAIN', amount: 1 },
      { source: 'RAINFOREST', amount: 0.5 },
      { source: 'REEF', amount: 2 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    placement: {},
    description: 'Science district.',
  }),
  HOLY_SITE: D({
    id: 'HOLY_SITE',
    name: 'Holy Site',
    code: 'HS',
    color: '#cfd4dc',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacencyYield: 'faith',
    adjacency: [
      { source: 'NATURAL_WONDER', amount: 2 },
      { source: 'MOUNTAIN', amount: 1 },
      { source: 'WOODS', amount: 0.5 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    placement: {},
    description: 'Faith district.',
  }),
  THEATER_SQUARE: D({
    id: 'THEATER_SQUARE',
    name: 'Theater Square',
    code: 'TS',
    color: '#b75fb3',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacencyYield: 'culture',
    // GS Civilopedia: +2 Culture from EACH adjacent wonder tile (a major
    // bonus, not a standard one), +1 per two adjacent districts.
    adjacency: [
      { source: 'BUILT_WONDER', amount: 2 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    placement: {},
    description: 'Culture district (+1 per adjacent world wonder).',
  }),
  COMMERCIAL_HUB: D({
    id: 'COMMERCIAL_HUB',
    name: 'Commercial Hub',
    code: 'CH',
    color: '#e0b62e',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacencyYield: 'gold',
    adjacency: [
      { source: 'RIVER', amount: 2 },
      { source: 'HARBOR_DISTRICT', amount: 2 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    placement: {},
    description: 'Gold district.',
  }),
  HARBOR: D({
    id: 'HARBOR',
    name: 'Harbor',
    code: 'HB',
    color: '#3fa7a0',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacencyYield: 'gold',
    // GS Civilopedia: +2 Gold from each adjacent City Center, +1 per adjacent
    // coastal resource, +1 per two adjacent districts.
    adjacency: [
      { source: 'CITY_CENTER', amount: 2 },
      { source: 'SEA_RESOURCE', amount: 1 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    placement: { onCoastalWater: true },
    description: 'Placed on coast/lake water adjacent to land.',
  }),
  INDUSTRIAL_ZONE: D({
    id: 'INDUSTRIAL_ZONE',
    name: 'Industrial Zone',
    code: 'IZ',
    color: '#c0622b',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacencyYield: 'production',
    adjacency: [
      { source: 'MINE', amount: 0.5 },
      { source: 'QUARRY', amount: 1 },
      { source: 'AQUEDUCT', amount: 2 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    placement: {},
    description: 'Production district.',
  }),
  ENCAMPMENT: D({
    id: 'ENCAMPMENT',
    name: 'Encampment',
    code: 'EN',
    color: '#9c3c3c',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacency: [],
    housing: 0,
    placement: { notAdjacentToCityCenter: true },
    description: 'Military district (its buildings add production and housing).',
  }),
  AQUEDUCT: D({
    id: 'AQUEDUCT',
    name: 'Aqueduct',
    code: 'AQ',
    color: '#6fb8d8',
    cost: 54,
    countsTowardLimit: false,
    allowMultiple: false,
    adjacency: [],
    housing: 0, // housing handled specially (depends on existing fresh water)
    placement: { requiresAdjacentCityCenter: true, requiresWaterSourceOrMountain: true },
    description: 'Adjacent to City Center and a river/lake/oasis/mountain. +2 housing (fresh-water city) or +6 (otherwise).',
  }),
  ENTERTAINMENT_COMPLEX: D({
    id: 'ENTERTAINMENT_COMPLEX',
    name: 'Entertainment Complex',
    code: 'EC',
    color: '#d86fa0',
    cost: 54,
    countsTowardLimit: true,
    allowMultiple: false,
    adjacency: [],
    housing: 0,
    placement: {},
    description: 'Amenities district.',
  }),
  NEIGHBORHOOD: D({
    id: 'NEIGHBORHOOD',
    name: 'Neighborhood',
    code: 'NH',
    color: '#7c8b4f',
    cost: 54,
    countsTowardLimit: false,
    allowMultiple: true,
    adjacency: [],
    housing: 0, // appeal-based (2-6), computed from the tile it sits on
    placement: {},
    description: 'Housing based on tile appeal (2-6).',
  }),
};

export const PLACEABLE_DISTRICTS: DistrictId[] = [
  'CAMPUS',
  'HOLY_SITE',
  'THEATER_SQUARE',
  'COMMERCIAL_HUB',
  'HARBOR',
  'INDUSTRIAL_ZONE',
  'ENCAMPMENT',
  'AQUEDUCT',
  'ENTERTAINMENT_COMPLEX',
  'NEIGHBORHOOD',
];

/**
 * THE district columns of the production mask, in column order — shared by
 * the fixture exporter, the GPU engine and the wire applier, so the order IS
 * the wire's meaning and must never be re-sorted. `unlockKind: 'civic'` marks
 * a civic-tree unlock; the default is a tech id.
 *
 * NEIGHBORHOOD is deliberately absent: its appeal-housing machinery is live on
 * both engines, but with the column in, the two queued different districts —
 * a placement/cost divergence that needs its own hunt before the row goes back.
 */
export const SCAFFOLD_DISTRICTS: { id: DistrictId; unlockId: string; unlockKind?: 'civic'; placement?: 'aqueduct' | 'coastal' | 'encampment' }[] = [
  { id: 'CAMPUS', unlockId: 'WRITING' },
  { id: 'HOLY_SITE', unlockId: 'ASTROLOGY' },
  { id: 'COMMERCIAL_HUB', unlockId: 'CURRENCY' },
  { id: 'AQUEDUCT', unlockId: 'ENGINEERING', placement: 'aqueduct' },
  { id: 'HARBOR', unlockId: 'CELESTIAL_NAVIGATION', placement: 'coastal' },
  { id: 'INDUSTRIAL_ZONE', unlockId: 'APPRENTICESHIP' },
  { id: 'THEATER_SQUARE', unlockId: 'DRAMA_AND_POETRY', unlockKind: 'civic' },
  { id: 'ENTERTAINMENT_COMPLEX', unlockId: 'GAMES_AND_RECREATION', unlockKind: 'civic' },
  { id: 'ENCAMPMENT', unlockId: 'BRONZE_WORKING', placement: 'encampment' },
];
