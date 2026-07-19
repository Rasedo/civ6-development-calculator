/**
 * Districts (base game, common to all civs). Adjacency rules follow base
 * Civ 6. Production cost scales with overall tech/civic progress and locks
 * in at queue time (districtCost in core/game.ts); the `cost` field below is
 * only a fallback for queue items without a locked cost.
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
  /** Yield gained per matching neighbor (0.5 = "+1 per 2"). */
  amount: number;
}

export interface DistrictDef {
  id: DistrictId;
  name: string;
  code: string;
  color: string;
  cost: number;
  /** Counts against the population district limit (specialty districts do). */
  countsTowardLimit: boolean;
  allowMultiple: boolean;
  adjacencyYield?: YieldKey;
  adjacency: AdjacencyRule[];
  housing: number;
  placement: {
    /** Must be placed on coast/lake water adjacent to land (Harbor). */
    onCoastalWater?: boolean;
    requiresAdjacentCityCenter?: boolean;
    /** Aqueduct: needs adjacent river/lake/oasis/mountain as a water source. */
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
    adjacency: [
      { source: 'MOUNTAIN', amount: 1 },
      { source: 'RAINFOREST', amount: 0.5 },
      { source: 'REEF', amount: 1 },
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
    adjacency: [
      { source: 'BUILT_WONDER', amount: 1 },
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
    adjacency: [
      { source: 'CITY_CENTER', amount: 1 },
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

/** Order shown in UI menus. */
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
 * The districts scripted policies place, in priority order — shared by the
 * GPU fixture exporter's scaffold, the GPU engine, and the rival district
 * picker (C1-B4). A-9 (ROUND B9): the full specialty catalog is scaffolded
 * now — the original five keep their order (first-placeable-wins semantics),
 * the append runs yields-first with Encampment last (its BUILD_PLAN D6
 * hold-out is lifted; cap competition is intended, real AIs build early
 * Encampments). `unlockKind: 'civic'` marks civic-tree unlocks (the default
 * is a tech id); NEIGHBORHOOD stays out pending the appeal-housing stage.
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
