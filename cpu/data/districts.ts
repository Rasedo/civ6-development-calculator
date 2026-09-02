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
 * the Ley Line, the Bath, and the Lumber Mill and
 * strategic resources the Industrial Zone also reads.
 */

import type { PlunderRow, DistrictId, YieldKey } from '../core/types';
import type { CivId } from './seats';

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
  // CIV6 (GS Industrial Zone): "Major bonus (+2 Production) for each adjacent
  // Aqueduct, Dam or Canal".
  | 'AQUEDUCT'
  | 'DAM'
  | 'CANAL'
  // CIV6 (Government Plaza): "+1 adjacency bonus to all adjacent districts."
  | 'GOV_PLAZA'
  // CIV6 (Campus, Aqueduct): per adjacent Geothermal Fissure.
  | 'GEOTHERMAL_FISSURE'
  // The two TERRAIN sources no district row names for itself — Dance of the
  // Aurora and Desert Folklore each hand one to the Holy Site.
  | 'TUNDRA'
  | 'DESERT';

export interface AdjacencyRule {
  source: AdjacencySource;
  amount: number;
}

/** CIV6 (DistrictReplaces): a civilization's UNIQUE DISTRICT standing in for
 *  this row — the same district in storage, with its own price, and the
 *  flat Housing and Amenity its Districts row adds on top (the Bath). */
export interface DistrictVariant {
  civ: CivId;
  name: string;
  cost: number;
  housing: number;
  amenities: number;
}

export interface DistrictDef {
  id: DistrictId;
  civVariants?: DistrictVariant[];
  /** an AMENITY this district pays per adjacent tile of one kind, which no
   *  other channel carries (the Aqueduct's Geothermal Fissure). */
  amenityAdjacent?: AdjacencyRule;
  name: string;
  code: string;
  color: string;
  cost: number;
  /** CIV6: this district's cost is FLAT (`cost` × game speed) — it never
   *  scales with research progress and takes no discount. The Spaceport. */
  fixedCost?: boolean;
  countsTowardLimit: boolean;
  /** A city may hold SEVERAL of this type (CIV 6: the Neighborhood, which is
   *  why it does not count toward the population cap). Absent means one. */
  allowMultiple?: boolean;
  adjacencyYield?: YieldKey;
  adjacency: AdjacencyRule[];
  housing: number;
  /** gold upkeep per turn once the district is complete. */
  maintenance: number;
  /** CIV6 (Entertainment Complex, Water Park): "+1 Amenity from entertainment
   *  to parent city" — the DISTRICT's own amenity, before any building. */
  amenities?: number;
  /**
   * CIV6 (Appeal): "+1 for each adjacent Holy Site, Theater Square,
   * Entertainment Complex, Water Park, Dam, Canal, Preserve, or wonder" and
   * "-1 for each adjacent ... Industrial Zone, Encampment, Aerodrome, or
   * Spaceport" — what this district does to every NEIGHBOURING tile's Appeal.
   * `tileAppeal` / `_tile_appeal` read the whole term off this column, so a
   * new district row carries its own appeal without touching either walk.
   */
  appealAdjacent: number;
  /** CIV6 (Pillaging, GS data): what wrecking it pays the pillager; absent =
   *  NO_PLUNDER (the City Center and the Encampment, which is conquered
   *  instead — and the Dam, whose row is a 0 HP heal). */
  plunder?: PlunderRow;
  /** CIV6 (Government Plaza): "+8 Loyalty to this city." A flat per-turn term
   *  like a building's, paid while the district stands complete. */
  loyalty?: number;
  /** CIV6: "Limit of one per civilization" — the seat may hold one, over
   *  every city it owns, rather than one per city. */
  oneCivWide?: boolean;
  /** CIV6 (Water Park): "cannot be built if an Entertainment Complex already
   *  exists in this city" — and the Entertainment Complex refuses it back. */
  exclusiveDistricts?: DistrictId[];
  /** CIV6 (Government Plaza): "Awards +1 Governor Title." */
  governorTitle?: number;
  /** CIV6 (Diplomatic Quarter): "+1 Envoy when built next to the City
   *  Center." */
  envoysNextToCenter?: number;
  /** CIV6 (Preserve): "Initiate a Culture Bomb on adjacent unowned tiles" the
   *  moment it completes. */
  cultureBombUnowned?: boolean;
  /** CIV6 (Preserve): "Grants up to 3 Housing based on tile's Appeal" — the
   *  district's housing reads the tile it sits on, like a Neighborhood's. */
  appealHousing?: boolean;
  /** CIV6 (Dam): "Prevents damage from Floods on this River", and halves the
   *  Food/Production a flood would fertilize with. */
  floodShield?: boolean;
  /** CIV6 (Dam, Canal): "Military Engineers can spend a charge to complete
   *  20% (rounded down) of a Dam's Production cost." The Aqueduct carries it
   *  too; it is what "engineering district" means. */
  /** CIV6 (Diplomatic Quarter): "Enemy Spies operate at N levels below normal
   *  when targeting this district or adjacent districts." Read as a whole-city
   *  term here, which is what the mission model can address. */
  spyLevelPenalty?: number;
  placement: {
    /** Must be placed on coast/lake water adjacent to land (Harbor). */
    onCoastalWater?: boolean;
    requiresAdjacentCityCenter?: boolean;
    requiresWaterSourceOrMountain?: boolean;
    notAdjacentToCityCenter?: boolean;
    /** Refuses Hills (Spaceport: flat land only). */
    flatLand?: boolean;
    /** CIV6 (Dam): "It must be built on a Floodplains tile and the River must
     *  traverse at least 2 adjacent sides of the future Dam tile", with a
     *  "limit of one per River". */
    floodplainRiver?: boolean;
    /** CIV6 (Canal): "must be built on flat land with a Coast or Lake tile on
     *  one side, and either a City Center or another body of water on the
     *  other". */
    canalPassage?: boolean;
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
    adjacency: [],
    housing: 0,
    maintenance: 0,
    appealAdjacent: 0,
    placement: {},
    description: 'Founded with the city.',
  }),
  CAMPUS: D({
    id: 'CAMPUS',
    plunder: { kind: 'science', amount: 25 },
    name: 'Campus',
    code: 'CA',
    color: '#3f8fce',
    cost: 54,
    countsTowardLimit: true,
    adjacencyYield: 'science',
    // GS Civilopedia: +1 per adjacent Mountain, +2 per adjacent Reef and per
    // adjacent Geothermal Fissure, +1 per TWO adjacent Rainforest tiles, +1
    // per TWO adjacent districts.
    adjacency: [
      { source: 'MOUNTAIN', amount: 1 },
      { source: 'RAINFOREST', amount: 0.5 },
      { source: 'REEF', amount: 2 },
      { source: 'GEOTHERMAL_FISSURE', amount: 2 },
      { source: 'GOV_PLAZA', amount: 1 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    maintenance: 1,
    appealAdjacent: 0,
    placement: {},
    description: 'Science district.',
  }),
  HOLY_SITE: D({
    id: 'HOLY_SITE',
    plunder: { kind: 'faith', amount: 25 },
    name: 'Holy Site',
    code: 'HS',
    color: '#cfd4dc',
    cost: 54,
    countsTowardLimit: true,
    adjacencyYield: 'faith',
    adjacency: [
      { source: 'NATURAL_WONDER', amount: 2 },
      { source: 'MOUNTAIN', amount: 1 },
      { source: 'WOODS', amount: 0.5 },
      { source: 'GOV_PLAZA', amount: 1 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    maintenance: 1,
    appealAdjacent: 1,
    placement: {},
    description: 'Faith district.',
  }),
  THEATER_SQUARE: D({
    id: 'THEATER_SQUARE',
    plunder: { kind: 'culture', amount: 25 },
    name: 'Theater Square',
    code: 'TS',
    color: '#b75fb3',
    cost: 54,
    countsTowardLimit: true,
    adjacencyYield: 'culture',
    // GS Civilopedia: +2 Culture from EACH adjacent wonder tile (a major
    // bonus, not a standard one), +1 per two adjacent districts.
    adjacency: [
      { source: 'BUILT_WONDER', amount: 2 },
      { source: 'GOV_PLAZA', amount: 1 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    maintenance: 1,
    appealAdjacent: 1,
    placement: {},
    description: 'Culture district (+1 per adjacent world wonder).',
  }),
  COMMERCIAL_HUB: D({
    id: 'COMMERCIAL_HUB',
    plunder: { kind: 'gold', amount: 50 },
    name: 'Commercial Hub',
    code: 'CH',
    color: '#e0b62e',
    cost: 54,
    countsTowardLimit: true,
    adjacencyYield: 'gold',
    adjacency: [
      { source: 'RIVER', amount: 2 },
      { source: 'HARBOR_DISTRICT', amount: 2 },
      { source: 'GOV_PLAZA', amount: 1 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    maintenance: 0,
    appealAdjacent: 0,
    placement: {},
    description: 'Gold district.',
  }),
  HARBOR: D({
    id: 'HARBOR',
    plunder: { kind: 'gold', amount: 50 },
    name: 'Harbor',
    code: 'HB',
    color: '#3fa7a0',
    cost: 54,
    countsTowardLimit: true,
    adjacencyYield: 'gold',
    // GS Civilopedia: +2 Gold from each adjacent City Center, +1 per adjacent
    // coastal resource, +1 per two adjacent districts.
    adjacency: [
      { source: 'CITY_CENTER', amount: 2 },
      { source: 'SEA_RESOURCE', amount: 1 },
      { source: 'GOV_PLAZA', amount: 1 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    maintenance: 0,
    appealAdjacent: 0,
    placement: { onCoastalWater: true },
    description: 'Placed on coast/lake water adjacent to land.',
  }),
  INDUSTRIAL_ZONE: D({
    id: 'INDUSTRIAL_ZONE',
    plunder: { kind: 'science', amount: 25 },
    name: 'Industrial Zone',
    code: 'IZ',
    color: '#c0622b',
    cost: 54,
    countsTowardLimit: true,
    adjacencyYield: 'production',
    adjacency: [
      { source: 'MINE', amount: 0.5 },
      { source: 'QUARRY', amount: 1 },
      { source: 'AQUEDUCT', amount: 2 },
      { source: 'DAM', amount: 2 },
      { source: 'CANAL', amount: 2 },
      { source: 'GOV_PLAZA', amount: 1 },
      { source: 'DISTRICT', amount: 0.5 },
    ],
    housing: 0,
    maintenance: 1,
    appealAdjacent: -1,
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
    adjacency: [],
    housing: 0,
    maintenance: 1,
    appealAdjacent: -1,
    placement: { notAdjacentToCityCenter: true },
    description: 'Military district (its buildings add production and housing).',
  }),
  AQUEDUCT: D({
    id: 'AQUEDUCT',
    plunder: { kind: 'gold', amount: 50 },
    name: 'Aqueduct',
    code: 'AQ',
    color: '#6fb8d8',
    cost: 36, // CIV6 (Districts.xml): 36, not the specialty districts' 54
    // CIV6 (Bath): "Replaces the Aqueduct district and cheaper to build" —
    // Cost 18, Housing 2, Entertainment 1 on top of the Aqueduct's water.
    civVariants: [{ civ: 'ROME', name: 'Bath', cost: 18, housing: 2, amenities: 1 }],
    countsTowardLimit: false,
    adjacency: [],
    housing: 0, // housing handled specially (depends on existing fresh water)
    maintenance: 0,
    appealAdjacent: 0,
    placement: { requiresAdjacentCityCenter: true, requiresWaterSourceOrMountain: true },
    // CIV6: an Aqueduct beside a Geothermal Fissure provides 1 Amenity.
    amenityAdjacent: { source: 'GEOTHERMAL_FISSURE', amount: 1 },
    description: 'Adjacent to City Center and a river/lake/oasis/mountain. +2 housing (fresh-water city) or +6 (otherwise).',
  }),
  ENTERTAINMENT_COMPLEX: D({
    id: 'ENTERTAINMENT_COMPLEX',
    plunder: { kind: 'heal', amount: 50 },
    name: 'Entertainment Complex',
    code: 'EC',
    color: '#d86fa0',
    cost: 54,
    countsTowardLimit: true,
    adjacency: [],
    housing: 0,
    maintenance: 1,
    amenities: 1,
    appealAdjacent: 1,
    exclusiveDistricts: ['WATER_PARK'],
    placement: {},
    description: 'Amenities district. One or the other with the Water Park, never both.',
  }),
  NEIGHBORHOOD: D({
    id: 'NEIGHBORHOOD',
    plunder: { kind: 'gold', amount: 50 },
    name: 'Neighborhood',
    code: 'NH',
    color: '#7c8b4f',
    cost: 54,
    countsTowardLimit: false,
    allowMultiple: true,
    adjacency: [],
    housing: 0, // appeal-based (2-6), computed from the tile it sits on
    maintenance: 0,
    appealAdjacent: 0,
    placement: {},
    description: 'Housing based on tile appeal (2-6).',
  }),
  // CIV6 (GS Civilopedia + wiki): unlocked by Rocketry, FLAT 1800 production
  // (never scales with research, no discount), flat land only (no Hills),
  // does NOT count toward the population district limit, no adjacency, -1
  // appeal to adjacent tiles, and it hosts all four Science Victory projects.
  AERODROME: D({
    id: 'AERODROME',
    plunder: { kind: 'gold', amount: 50 },
    name: 'Aerodrome',
    code: 'AER',
    color: '#7f8fa6',
    cost: 54,
    countsTowardLimit: true,
    adjacency: [],
    housing: 0,
    maintenance: 1,
    appealAdjacent: -1,
    // CIV6 (Aerodrome): "must be built on flat terrain".
    placement: { flatLand: true },
    description: 'Builds and bases aircraft. Flat land only.',
  }),
  SPACEPORT: D({
    id: 'SPACEPORT',
    plunder: { kind: 'science', amount: 25 },
    name: 'Spaceport',
    code: 'SPT',
    color: '#8d97ad',
    cost: 1800,
    fixedCost: true,
    countsTowardLimit: false,
    adjacency: [],
    housing: 0,
    maintenance: 1,
    appealAdjacent: -1,
    placement: { flatLand: true },
    description: 'Launch site for the Science Victory projects. Flat land only.',
  }),
  // CIV6 (Dam): "It must be built on a Floodplains tile and the River must
  // traverse at least 2 adjacent sides of the future Dam tile", "Limit of one
  // per River", and it "Does not depend on Population" — one of the three
  // ENGINEERING districts, which is also what lets a Military Engineer rush it.
  DAM: D({
    id: 'DAM',
    name: 'Dam',
    code: 'DM',
    color: '#5f87a8',
    cost: 81,
    countsTowardLimit: false,
    allowMultiple: true, // "as many Dams as its territory covers different Rivers"
    adjacency: [],
    housing: 3,
    maintenance: 0,
    appealAdjacent: 1,
    floodShield: true,
    placement: { floodplainRiver: true },
    description: 'On a floodplain with the river on two sides. +3 housing, and its river no longer floods.',
  }),
  // CIV6 (Canal): "provides passage from a body of water to a City Center or
  // another body of water", "Does not depend on Population", "No limit on the
  // number that can be built per city".
  CANAL: D({
    id: 'CANAL',
    plunder: { kind: 'gold', amount: 50 },
    name: 'Canal',
    code: 'CN',
    color: '#4f9fbf',
    cost: 81,
    countsTowardLimit: false,
    allowMultiple: true,
    adjacency: [],
    housing: 0,
    maintenance: 0,
    appealAdjacent: 1,
    placement: { canalPassage: true },
    description: 'Flat land between water and a City Center or a second body of water.',
  }),
  // CIV6 (Water Park): "must be built on a Coast or Lake tile adjacent to
  // land", and "cannot be built if an Entertainment Complex already exists in
  // this city".
  WATER_PARK: D({
    id: 'WATER_PARK',
    plunder: { kind: 'heal', amount: 50 },
    name: 'Water Park',
    code: 'WP',
    color: '#4fb0c6',
    cost: 54,
    countsTowardLimit: true,
    adjacency: [],
    housing: 0,
    maintenance: 1,
    amenities: 1,
    appealAdjacent: 1,
    exclusiveDistricts: ['ENTERTAINMENT_COMPLEX'],
    placement: { onCoastalWater: true },
    description: 'The Entertainment Complex on the water. One or the other, never both.',
  }),
  // CIV6 (Preserve): "Grants up to 3 Housing based on tile's Appeal",
  // "+1 Appeal", "Initiate a Culture Bomb on adjacent unowned tiles",
  // "Cannot be built next to the City Center".
  PRESERVE: D({
    id: 'PRESERVE',
    plunder: { kind: 'gold', amount: 50 },
    name: 'Preserve',
    code: 'PR',
    color: '#4f9f6a',
    cost: 54,
    countsTowardLimit: true,
    adjacency: [],
    housing: 0, // appeal-based, like the Neighborhood's
    maintenance: 0,
    appealAdjacent: 1,
    appealHousing: true,
    cultureBombUnowned: true,
    placement: { notAdjacentToCityCenter: true },
    description: 'Housing from the appeal of its own tile, and it annexes the unowned tiles it touches.',
  }),
  // CIV6 (Government Plaza): "+8 Loyalty to this city", "+1 adjacency bonus to
  // all adjacent districts", "Awards +1 Governor Title", "Limit of one per
  // civilization".
  GOVERNMENT_PLAZA: D({
    id: 'GOVERNMENT_PLAZA',
    plunder: { kind: 'culture', amount: 25 },
    name: 'Government Plaza',
    code: 'GP',
    color: '#b0894f',
    cost: 30,
    countsTowardLimit: true,
    adjacency: [],
    housing: 0,
    maintenance: 1,
    appealAdjacent: 0,
    loyalty: 8,
    governorTitle: 1,
    oneCivWide: true,
    placement: {},
    description: 'The seat of government: one per civilization, +8 loyalty, and a governor title.',
  }),
  // CIV6 (Diplomatic Quarter): "+1 Envoy when built next to the City Center",
  // "Enemy Spies operate at 2 levels below normal when targeting this district
  // or adjacent districts", "Limit of one per civilization".
  DIPLOMATIC_QUARTER: D({
    id: 'DIPLOMATIC_QUARTER',
    plunder: { kind: 'culture', amount: 25 },
    name: 'Diplomatic Quarter',
    code: 'DQ',
    color: '#8f7fc6',
    cost: 30,
    countsTowardLimit: true,
    adjacency: [],
    housing: 0,
    maintenance: 1,
    appealAdjacent: 0,
    envoysNextToCenter: 1,
    spyLevelPenalty: 2,
    oneCivWide: true,
    placement: {},
    description: 'One per civilization. An envoy if it touches the centre, and enemy spies work two levels down.',
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
  'SPACEPORT',
  'AERODROME', // appended LAST — earlier indices are wire meaning
  'DAM',
  'CANAL',
  'WATER_PARK',
  'PRESERVE',
  'GOVERNMENT_PLAZA',
  'DIPLOMATIC_QUARTER',
];

/**
 * THE district columns of the production mask, in column order — shared by
 * the fixture exporter, the GPU engine and the wire applier, so the order IS
 * the wire's meaning and must never be re-sorted. `unlockKind: 'civic'` marks
 * a civic-tree unlock; the default is a tech id.
 */
export const SCAFFOLD_DISTRICTS: { id: DistrictId; unlockId: string; unlockKind?: 'civic'; placement?: 'aqueduct' | 'coastal' | 'encampment' | 'flat' | 'dam' | 'canal' }[] = [
  { id: 'CAMPUS', unlockId: 'WRITING' },
  { id: 'HOLY_SITE', unlockId: 'ASTROLOGY' },
  { id: 'COMMERCIAL_HUB', unlockId: 'CURRENCY' },
  { id: 'AQUEDUCT', unlockId: 'ENGINEERING', placement: 'aqueduct' },
  { id: 'HARBOR', unlockId: 'CELESTIAL_NAVIGATION', placement: 'coastal' },
  { id: 'INDUSTRIAL_ZONE', unlockId: 'APPRENTICESHIP' },
  { id: 'THEATER_SQUARE', unlockId: 'DRAMA_AND_POETRY', unlockKind: 'civic' },
  { id: 'ENTERTAINMENT_COMPLEX', unlockId: 'GAMES_AND_RECREATION', unlockKind: 'civic' },
  { id: 'ENCAMPMENT', unlockId: 'BRONZE_WORKING', placement: 'encampment' },
  { id: 'AERODROME', unlockId: 'FLIGHT' },
  { id: 'NEIGHBORHOOD', unlockId: 'URBANIZATION', unlockKind: 'civic' },
  { id: 'SPACEPORT', unlockId: 'ROCKETRY', placement: 'flat' },
  { id: 'PRESERVE', unlockId: 'MYSTICISM', unlockKind: 'civic', placement: 'encampment' },
  { id: 'GOVERNMENT_PLAZA', unlockId: 'STATE_WORKFORCE', unlockKind: 'civic' },
  { id: 'DIPLOMATIC_QUARTER', unlockId: 'MATHEMATICS' },
  { id: 'DAM', unlockId: 'BUTTRESS', placement: 'dam' },
  { id: 'WATER_PARK', unlockId: 'NATURAL_HISTORY', unlockKind: 'civic', placement: 'coastal' },
  { id: 'CANAL', unlockId: 'STEAM_POWER', placement: 'canal' },
];
