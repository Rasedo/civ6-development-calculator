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
import { xml, type SrcMap } from './provenance';

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
  | 'DESERT'
  // CIV6 (Hansa, Suguba, Acropolis): the three district neighbours only a
  // UNIQUE district's own adjacency row names.
  | 'COMMERCIAL_HUB'
  | 'ENTERTAINMENT_COMPLEX'
  | 'HOLY_SITE_DISTRICT'
  // CIV6 (Hansa): "+1 Production for each adjacent Resource" — ANY resource
  // on land, which no base row asks for.
  | 'RESOURCE'
  // CIV6 (Seowon): "+4 Science" flat, and the only source that reads no
  // neighbour at all — the district's own tile.
  | 'SELF';

export interface AdjacencyRule {
  source: AdjacencySource;
  amount: number;
}

/** CIV6 (DistrictReplaces): a civilization's UNIQUE DISTRICT standing in for
 *  this row — the same district in storage, with its own price, and the
 *  flat Housing and Amenity its Districts row adds on top (the Bath). */
interface DistrictVariant {
  civ: CivId;
  name: string;
  /** CIV6 (Districts.xml): a unique district's own `Cost` is HALF the row it
   *  replaces, without exception — 27 against a specialty district's 54, 18
   *  against the Aqueduct's 36. */
  cost: number;
  housing: number;
  amenities: number;
  /** the variant's OWN adjacency set, REPLACING the base row's — every
   *  unique district in the install ships its own `District_Adjacencies`
   *  rows rather than adding to the base one's. */
  adjacency?: AdjacencyRule[];
  /** CIV6 (M'banza, `MODIFIER_PLAYER_DISTRICT_ADJUST_BASE_YIELD_CHANGE`):
   *  flat yields the district itself pays, on top of its adjacency. */
  flatYield?: Partial<Record<YieldKey, number>>;
  /** CIV6 (M'banza): finishing one grants this unit, free. */
  grantsUnit?: string;
  /** CIV6 (Royal Navy Dockyard,
   *  `MODIFIER_PLAYER_ADJUST_DISTRICT_ADD_NAVAL_UNIT`): finishing one grants
   *  a NAVAL unit the install does not name — the strongest this seat can
   *  train. */
  grantsNavalUnit?: boolean;
}

export interface DistrictDef {
  id: DistrictId;
  /** PROVENANCE, per column (cpu/data/provenance.ts): the install row and
   *  column each number came from. Stripped by the exporter; checked by
   *  tools/install/xml_check.py. */
  src?: SrcMap;
  civVariants?: DistrictVariant[];
  /** an AMENITY this district pays per adjacent tile of one kind, which no
   *  other channel carries (the Aqueduct's Geothermal Fissure). */
  amenityAdjacent?: AdjacencyRule;
  name: string;
  code: string;
  color: string;
  cost: number;
  /** CIV6: this district's cost is FLAT (`scaleByGameSpeed(cost)`) — it never
   *  scales with research progress and takes no discount. The Spaceport. */
  fixedCost?: boolean;
  /** CIV6 (`Districts.CostProgressionParam1`): the UNDER-REPRESENTED discount,
   *  as a percentage off. Every specialty row ships 40; the Government Plaza
   *  and the Diplomatic Quarter ship 25. Absent means the 40 the install gives
   *  every other row.
   */
  discountPct?: number;
  /** CIV6 (`Districts.CostProgressionModel` = GAME_PROGRESS, with
   *  `Districts.CostProgressionParam1`): this
   *  row's price climbs with the GAME's own progress rather than with the
   *  specialty curve — `base + floor(scaleByGameSpeed(param) x progress)`,
   *  the model `projectCost` runs for the district projects and the Cothon. The install writes it
   *  on six rows at 1000; a civVariant carries its own base and the SAME
   *  parameter, which is why the term is added after the variant ratio. */
  costProgressGame?: number;
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
  /** CIV6 (`Districts.CityStrengthModifier`): what this district adds to its
   *  city centre's Combat Strength while it stands complete and unpillaged
   *  (`centreStrength` / `_centre_strength`). */
  cityStrength: number;
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
    cityStrength: 0,
    placement: {},
    description: 'Founded with the city.',
    src: {
      cost: { stylized: 'the City Center is FOUNDED, never produced: no production column ever offers it, so the install Cost 54 has nothing to charge' },
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_CITY_CENTER', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_CITY_CENTER', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_CITY_CENTER', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_CITY_CENTER', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_CITY_CENTER', 'CityStrengthModifier'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
    },
  }),
  CAMPUS: D({
    id: 'CAMPUS',
    // CIV6 (Seowon): "+4 Science, and -1 for each adjacent district" — it
    // reads NOTHING the Campus reads, mountains and rainforest included.
    civVariants: [{
      civ: 'KOREA', name: 'Seowon', cost: 27, housing: 0, amenities: 0,
      adjacency: [
        { source: 'SELF', amount: 4 },
        { source: 'DISTRICT', amount: -1 },
        { source: 'GOV_PLAZA', amount: 1 },
      ],
    }],
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
    cityStrength: 2,
    placement: {},
    description: 'Science district.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'PlunderType', { expect: 'PLUNDER_SCIENCE' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      adjacencyYield: xml('Adjacency_YieldChanges', 'ID=District_Science', 'YieldType', { expect: 'YIELD_SCIENCE' }),
      'adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=Mountains_Science1', 'AdjacentTerrain', { expect: 'TERRAIN_GRASS_MOUNTAIN' }),
      'adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=Mountains_Science1', 'YieldChange'),
      'adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=Jungle_Science', 'AdjacentFeature', { expect: 'FEATURE_JUNGLE' }),
      'adjacency.1.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=Jungle_Science', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=Jungle_Science', 'TilesRequired')] },
      'adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Reef_Science', 'AdjacentFeature', { expect: 'FEATURE_REEF' }),
      'adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=Reef_Science', 'YieldChange'),
      'adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Geothermal_Science', 'AdjacentFeature', { expect: 'FEATURE_GEOTHERMAL_FISSURE' }),
      'adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Geothermal_Science', 'YieldChange'),
      'adjacency.4.source': xml('Adjacency_YieldChanges', 'ID=Government_Science', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'adjacency.4.amount': xml('Adjacency_YieldChanges', 'ID=Government_Science', 'YieldChange'),
      'adjacency.5.source': xml('Adjacency_YieldChanges', 'ID=District_Science', 'OtherDistrictAdjacent', { expect: 'true' }),
      'adjacency.5.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Science', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Science', 'TilesRequired')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_SEOWON', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_SEOWON', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_SEOWON', 'Entertainment'),
      'civVariants.0.adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=BaseDistrict_Science', 'Self', { expect: 'true' }),
      'civVariants.0.adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=BaseDistrict_Science', 'YieldChange'),
      'civVariants.0.adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=NegativeDistrict_Science', 'OtherDistrictAdjacent', { expect: 'true' }),
      'civVariants.0.adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=NegativeDistrict_Science', 'YieldChange'),
      'civVariants.0.adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Government_Science', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'civVariants.0.adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=Government_Science', 'YieldChange'),
    },
  }),
  HOLY_SITE: D({
    id: 'HOLY_SITE',
    // CIV6 (Lavra): the Holy Site's own rows, unchanged in kind.
    civVariants: [{
      civ: 'RUSSIA', name: 'Lavra', cost: 27, housing: 0, amenities: 0,
      adjacency: [
        { source: 'NATURAL_WONDER', amount: 2 },
        { source: 'MOUNTAIN', amount: 1 },
        { source: 'WOODS', amount: 0.5 },
        { source: 'DISTRICT', amount: 0.5 },
        { source: 'GOV_PLAZA', amount: 1 },
      ],
    }],
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
    cityStrength: 2,
    placement: {},
    description: 'Faith district.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'PlunderType', { expect: 'PLUNDER_FAITH' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      adjacencyYield: xml('Adjacency_YieldChanges', 'ID=District_Faith', 'YieldType', { expect: 'YIELD_FAITH' }),
      'adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=NaturalWonder_Faith', 'AdjacentNaturalWonder', { expect: 'true' }),
      'adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=NaturalWonder_Faith', 'YieldChange'),
      'adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=Mountain_Faith1', 'AdjacentTerrain', { expect: 'TERRAIN_GRASS_MOUNTAIN' }),
      'adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=Mountain_Faith1', 'YieldChange'),
      'adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Forest_Faith', 'AdjacentFeature', { expect: 'FEATURE_FOREST' }),
      'adjacency.2.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=Forest_Faith', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=Forest_Faith', 'TilesRequired')] },
      'adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Government_Faith', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Government_Faith', 'YieldChange'),
      'adjacency.4.source': xml('Adjacency_YieldChanges', 'ID=District_Faith', 'OtherDistrictAdjacent', { expect: 'true' }),
      'adjacency.4.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Faith', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Faith', 'TilesRequired')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_LAVRA', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_LAVRA', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_LAVRA', 'Entertainment'),
      'civVariants.0.adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=NaturalWonder_Faith', 'AdjacentNaturalWonder', { expect: 'true' }),
      'civVariants.0.adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=NaturalWonder_Faith', 'YieldChange'),
      'civVariants.0.adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=Mountain_Faith1', 'AdjacentTerrain', { expect: 'TERRAIN_GRASS_MOUNTAIN' }),
      'civVariants.0.adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=Mountain_Faith1', 'YieldChange'),
      'civVariants.0.adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Forest_Faith', 'AdjacentFeature', { expect: 'FEATURE_FOREST' }),
      'civVariants.0.adjacency.2.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=Forest_Faith', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=Forest_Faith', 'TilesRequired')] },
      'civVariants.0.adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=District_Faith', 'OtherDistrictAdjacent', { expect: 'true' }),
      'civVariants.0.adjacency.3.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Faith', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Faith', 'TilesRequired')] },
      'civVariants.0.adjacency.4.source': xml('Adjacency_YieldChanges', 'ID=Government_Faith', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'civVariants.0.adjacency.4.amount': xml('Adjacency_YieldChanges', 'ID=Government_Faith', 'YieldChange'),
    },
  }),
  THEATER_SQUARE: D({
    id: 'THEATER_SQUARE',
    // CIV6 (Acropolis): the Theater Square's rows plus a City Centre, an
    // Entertainment Complex and a Water Park, and its district rows pay per
    // ONE neighbour instead of per two.
    civVariants: [{
      civ: 'GREECE', name: 'Acropolis', cost: 27, housing: 0, amenities: 0,
      adjacency: [
        // Adjacency_YieldChanges[Wonder_Culture].YieldChange 2 — the same row
        // the plain Theater Square reads.
        { source: 'BUILT_WONDER', amount: 2 },
        { source: 'DISTRICT', amount: 1 },
        { source: 'CITY_CENTER', amount: 1 },
        { source: 'GOV_PLAZA', amount: 1 },
        { source: 'ENTERTAINMENT_COMPLEX', amount: 2 },
      ],
    }],
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
    cityStrength: 2,
    placement: {},
    description: 'Culture district (+1 per adjacent world wonder).',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_THEATER', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_THEATER', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_THEATER', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_THEATER', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_THEATER', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_THEATER', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_THEATER', 'PlunderType', { expect: 'PLUNDER_CULTURE' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_THEATER', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      adjacencyYield: xml('Adjacency_YieldChanges', 'ID=District_Culture', 'YieldType', { expect: 'YIELD_CULTURE' }),
      'adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=Wonder_Culture', 'AdjacentWonder', { expect: 'true' }),
      'adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=Wonder_Culture', 'YieldChange'),
      'adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=Government_Culture', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=Government_Culture', 'YieldChange'),
      'adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=District_Culture', 'OtherDistrictAdjacent', { expect: 'true' }),
      'adjacency.2.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Culture', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Culture', 'TilesRequired')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_ACROPOLIS', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_ACROPOLIS', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_ACROPOLIS', 'Entertainment'),
      'civVariants.0.adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=Wonder_Culture', 'AdjacentWonder', { expect: 'true' }),
      'civVariants.0.adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=Wonder_Culture', 'YieldChange'),
      'civVariants.0.adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=District_Culture_Standard', 'OtherDistrictAdjacent', { expect: 'true' }),
      'civVariants.0.adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=District_Culture_Standard', 'YieldChange'),
      'civVariants.0.adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=District_Culture_City_Center', 'AdjacentDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      'civVariants.0.adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=District_Culture_City_Center', 'YieldChange'),
      'civVariants.0.adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Government_Culture', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'civVariants.0.adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Government_Culture', 'YieldChange'),
      'civVariants.0.adjacency.4.source': xml('Adjacency_YieldChanges', 'ID=EntertainmentComplex_Culture', 'AdjacentDistrict', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
      'civVariants.0.adjacency.4.amount': xml('Adjacency_YieldChanges', 'ID=EntertainmentComplex_Culture', 'YieldChange'),
    },
  }),
  COMMERCIAL_HUB: D({
    id: 'COMMERCIAL_HUB',
    // CIV6 (Suguba): a Holy Site beside it pays like a river does.
    civVariants: [{
      civ: 'MALI', name: 'Suguba', cost: 27, housing: 0, amenities: 0,
      adjacency: [
        { source: 'RIVER', amount: 2 },
        { source: 'HOLY_SITE_DISTRICT', amount: 2 },
        { source: 'DISTRICT', amount: 0.5 },
        { source: 'GOV_PLAZA', amount: 1 },
      ],
    }],
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
    cityStrength: 2,
    placement: {},
    description: 'Gold district.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      adjacencyYield: xml('Adjacency_YieldChanges', 'ID=District_Gold', 'YieldType', { expect: 'YIELD_GOLD' }),
      'adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=River_Gold', 'AdjacentRiver', { expect: 'true' }),
      'adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=River_Gold', 'YieldChange'),
      'adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=Harbor_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_HARBOR' }),
      'adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=Harbor_Gold', 'YieldChange'),
      'adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'YieldChange'),
      'adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=District_Gold', 'OtherDistrictAdjacent', { expect: 'true' }),
      'adjacency.3.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Gold', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Gold', 'TilesRequired')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_SUGUBA', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_SUGUBA', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_SUGUBA', 'Entertainment'),
      'civVariants.0.adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=River_Gold', 'AdjacentRiver', { expect: 'true' }),
      'civVariants.0.adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=River_Gold', 'YieldChange'),
      'civVariants.0.adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=Holy_Site_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
      'civVariants.0.adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=Holy_Site_Gold', 'YieldChange'),
      'civVariants.0.adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=District_Gold', 'OtherDistrictAdjacent', { expect: 'true' }),
      'civVariants.0.adjacency.2.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Gold', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Gold', 'TilesRequired')] },
      'civVariants.0.adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'civVariants.0.adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'YieldChange'),
    },
  }),
  HARBOR: D({
    id: 'HARBOR',
    // CIV6 (Royal Navy Dockyard, Cothon): both read the Harbor's own rows
    // with a CITY CENTRE worth 2 instead of the base row's own amount; the
    // Dockyard grants a naval unit when it finishes.
    civVariants: [
      {
        civ: 'ENGLAND', name: 'Royal Navy Dockyard', cost: 27, housing: 0, amenities: 0,
        adjacency: [
          { source: 'SEA_RESOURCE', amount: 1 },
          { source: 'DISTRICT', amount: 0.5 },
          { source: 'CITY_CENTER', amount: 2 },
          { source: 'GOV_PLAZA', amount: 1 },
        ],
        grantsNavalUnit: true,
      },
      {
        civ: 'PHOENICIA', name: 'Cothon', cost: 27, housing: 0, amenities: 0,
        adjacency: [
          { source: 'SEA_RESOURCE', amount: 1 },
          { source: 'DISTRICT', amount: 0.5 },
          { source: 'CITY_CENTER', amount: 2 },
          { source: 'GOV_PLAZA', amount: 1 },
        ],
      },
    ],
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
    cityStrength: 2,
    placement: { onCoastalWater: true },
    description: 'Placed on coast/lake water adjacent to land.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      adjacencyYield: xml('Adjacency_YieldChanges', 'ID=District_Gold', 'YieldType', { expect: 'YIELD_GOLD' }),
      'placement.onCoastalWater': xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'Coast'),
      'adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=Harbor_City_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      'adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=Harbor_City_Gold', 'YieldChange'),
      'adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=SeaResource_Gold', 'AdjacentSeaResource', { expect: 'true' }),
      'adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=SeaResource_Gold', 'YieldChange'),
      'adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'YieldChange'),
      'adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=District_Gold', 'OtherDistrictAdjacent', { expect: 'true' }),
      'adjacency.3.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Gold', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Gold', 'TilesRequired')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_ROYAL_NAVY_DOCKYARD', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_ROYAL_NAVY_DOCKYARD', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_ROYAL_NAVY_DOCKYARD', 'Entertainment'),
      'civVariants.1.cost': xml('Districts', 'DistrictType=DISTRICT_COTHON', 'Cost'),
      'civVariants.1.housing': xml('Districts', 'DistrictType=DISTRICT_COTHON', 'Housing'),
      'civVariants.1.amenities': xml('Districts', 'DistrictType=DISTRICT_COTHON', 'Entertainment'),
      'civVariants.0.grantsNavalUnit': { derived: 'true where the install attaches MODIFIER_PLAYER_ADJUST_DISTRICT_ADD_NAVAL_UNIT to the district; the install names no unit', inputs: [xml('Districts', 'DistrictType=DISTRICT_ROYAL_NAVY_DOCKYARD', 'DistrictType')] },
      'civVariants.0.adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=SeaResource_Gold', 'AdjacentSeaResource', { expect: 'true' }),
      'civVariants.0.adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=SeaResource_Gold', 'YieldChange'),
      'civVariants.0.adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=District_Gold', 'OtherDistrictAdjacent', { expect: 'true' }),
      'civVariants.0.adjacency.1.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Gold', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Gold', 'TilesRequired')] },
      'civVariants.0.adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=RoyalDock_City_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      'civVariants.0.adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=RoyalDock_City_Gold', 'YieldChange'),
      'civVariants.0.adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'civVariants.0.adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'YieldChange'),
      'civVariants.1.adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=SeaResource_Gold', 'AdjacentSeaResource', { expect: 'true' }),
      'civVariants.1.adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=SeaResource_Gold', 'YieldChange'),
      'civVariants.1.adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=District_Gold', 'OtherDistrictAdjacent', { expect: 'true' }),
      'civVariants.1.adjacency.1.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Gold', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Gold', 'TilesRequired')] },
      'civVariants.1.adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Harbor_City_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
      'civVariants.1.adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=Harbor_City_Gold', 'YieldChange'),
      'civVariants.1.adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'civVariants.1.adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Government_Gold', 'YieldChange'),
    },
  }),
  INDUSTRIAL_ZONE: D({
    id: 'INDUSTRIAL_ZONE',
    // CIV6 (Hansa): a Commercial Hub and any adjacent Resource pay it, and it
    // keeps the three engineering districts the base row already reads.
    civVariants: [{
      civ: 'GERMANY', name: 'Hansa', cost: 27, housing: 0, amenities: 0,
      adjacency: [
        { source: 'COMMERCIAL_HUB', amount: 2 },
        { source: 'DISTRICT', amount: 0.5 },
        { source: 'RESOURCE', amount: 1 },
        { source: 'GOV_PLAZA', amount: 1 },
        { source: 'AQUEDUCT', amount: 2 },
        { source: 'CANAL', amount: 2 },
        { source: 'DAM', amount: 2 },
      ],
    }],
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
    cityStrength: 2,
    placement: {},
    description: 'Production district.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'PlunderType', { expect: 'PLUNDER_SCIENCE' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      adjacencyYield: xml('Adjacency_YieldChanges', 'ID=District_Production', 'YieldType', { expect: 'YIELD_PRODUCTION' }),
      'adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=Minel_HalfProduction', 'AdjacentImprovement', { expect: 'IMPROVEMENT_MINE' }),
      'adjacency.0.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=Minel_HalfProduction', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=Minel_HalfProduction', 'TilesRequired')] },
      'adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=Quarry_Production', 'AdjacentImprovement', { expect: 'IMPROVEMENT_QUARRY' }),
      'adjacency.1.amount': xml('Adjacency_YieldChanges', 'ID=Quarry_Production', 'YieldChange'),
      'adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Aqueduct_Production', 'AdjacentDistrict', { expect: 'DISTRICT_AQUEDUCT' }),
      'adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=Aqueduct_Production', 'YieldChange'),
      'adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Dam_Production', 'AdjacentDistrict', { expect: 'DISTRICT_DAM' }),
      'adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Dam_Production', 'YieldChange'),
      'adjacency.4.source': xml('Adjacency_YieldChanges', 'ID=Canal_Production', 'AdjacentDistrict', { expect: 'DISTRICT_CANAL' }),
      'adjacency.4.amount': xml('Adjacency_YieldChanges', 'ID=Canal_Production', 'YieldChange'),
      'adjacency.5.source': xml('Adjacency_YieldChanges', 'ID=Government_Production', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'adjacency.5.amount': xml('Adjacency_YieldChanges', 'ID=Government_Production', 'YieldChange'),
      'adjacency.6.source': xml('Adjacency_YieldChanges', 'ID=District_Production', 'OtherDistrictAdjacent', { expect: 'true' }),
      'adjacency.6.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Production', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Production', 'TilesRequired')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_HANSA', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_HANSA', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_HANSA', 'Entertainment'),
      'civVariants.0.adjacency.0.source': xml('Adjacency_YieldChanges', 'ID=Commerical_Hub_Production', 'AdjacentDistrict', { expect: 'DISTRICT_COMMERCIAL_HUB' }),
      'civVariants.0.adjacency.0.amount': xml('Adjacency_YieldChanges', 'ID=Commerical_Hub_Production', 'YieldChange'),
      'civVariants.0.adjacency.1.source': xml('Adjacency_YieldChanges', 'ID=District_Production', 'OtherDistrictAdjacent', { expect: 'true' }),
      'civVariants.0.adjacency.1.amount': { derived: 'YieldChange / TilesRequired — the install pays 1 per TWO neighbours where this catalog carries 0.5 per neighbour', inputs: [xml('Adjacency_YieldChanges', 'ID=District_Production', 'YieldChange'), xml('Adjacency_YieldChanges', 'ID=District_Production', 'TilesRequired')] },
      'civVariants.0.adjacency.2.source': xml('Adjacency_YieldChanges', 'ID=Resource_Production', 'AdjacentResource', { expect: 'true' }),
      'civVariants.0.adjacency.2.amount': xml('Adjacency_YieldChanges', 'ID=Resource_Production', 'YieldChange'),
      'civVariants.0.adjacency.3.source': xml('Adjacency_YieldChanges', 'ID=Government_Production', 'AdjacentDistrict', { expect: 'DISTRICT_GOVERNMENT' }),
      'civVariants.0.adjacency.3.amount': xml('Adjacency_YieldChanges', 'ID=Government_Production', 'YieldChange'),
      'civVariants.0.adjacency.4.source': xml('Adjacency_YieldChanges', 'ID=Aqueduct_Production', 'AdjacentDistrict', { expect: 'DISTRICT_AQUEDUCT' }),
      'civVariants.0.adjacency.4.amount': xml('Adjacency_YieldChanges', 'ID=Aqueduct_Production', 'YieldChange'),
      'civVariants.0.adjacency.5.source': xml('Adjacency_YieldChanges', 'ID=Canal_Production', 'AdjacentDistrict', { expect: 'DISTRICT_CANAL' }),
      'civVariants.0.adjacency.5.amount': xml('Adjacency_YieldChanges', 'ID=Canal_Production', 'YieldChange'),
      'civVariants.0.adjacency.6.source': xml('Adjacency_YieldChanges', 'ID=Dam_Production', 'AdjacentDistrict', { expect: 'DISTRICT_DAM' }),
      'civVariants.0.adjacency.6.amount': xml('Adjacency_YieldChanges', 'ID=Dam_Production', 'YieldChange'),
    },
  }),
  ENCAMPMENT: D({
    id: 'ENCAMPMENT',
    // CIV6 (Ikanda): the Encampment with a Housing of its own.
    civVariants: [{
      civ: 'ZULU', name: 'Ikanda', cost: 27, housing: 1, amenities: 0,
    }],
    name: 'Encampment',
    code: 'EN',
    color: '#9c3c3c',
    cost: 54,
    countsTowardLimit: true,
    adjacency: [],
    housing: 0,
    maintenance: 1,
    appealAdjacent: -1,
    cityStrength: 2,
    placement: { notAdjacentToCityCenter: true },
    description: 'Military district (its buildings add production and housing).',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'CityStrengthModifier'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      'placement.notAdjacentToCityCenter': xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'NoAdjacentCity'),
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_IKANDA', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_IKANDA', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_IKANDA', 'Entertainment'),
    },
  }),
  AQUEDUCT: D({
    id: 'AQUEDUCT',
    costProgressGame: 1000,
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
    cityStrength: 0,
    placement: { requiresAdjacentCityCenter: true, requiresWaterSourceOrMountain: true },
    // CIV6: an Aqueduct beside a Geothermal Fissure provides 1 Amenity.
    amenityAdjacent: { source: 'GEOTHERMAL_FISSURE', amount: 1 },
    description: 'Adjacent to City Center and a river/lake/oasis/mountain. +2 housing (fresh-water city) or +6 (otherwise).',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      costProgressGame: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'CostProgressionParam1'),
      'placement.requiresAdjacentCityCenter': xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'Aqueduct'),
      'placement.requiresWaterSourceOrMountain': xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'Aqueduct', { note: 'the install carries the whole Aqueduct placement rule in one flag' }),
      'amenityAdjacent.amount': xml('ModifierArguments', 'ModifierId=AQUEDUCT_ADDAMENITIES&Name=Amount', 'Value'),
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_BATH', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_BATH', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_BATH', 'Entertainment'),
    },
  }),
  ENTERTAINMENT_COMPLEX: D({
    id: 'ENTERTAINMENT_COMPLEX',
    // CIV6 (Street Carnival): `Entertainment="2"` — twice the Complex's own
    // Amenity, on the same ground.
    civVariants: [{
      civ: 'BRAZIL', name: 'Street Carnival', cost: 27, housing: 0, amenities: 2,
    }],
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
    cityStrength: 2,
    exclusiveDistricts: ['WATER_PARK'],
    placement: {},
    description: 'Amenities district. One or the other with the Water Park, never both.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'Maintenance'),
      amenities: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'Entertainment'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      exclusiveDistricts: { derived: 'the MutuallyExclusiveDistricts rows of this district, as engine ids', inputs: [xml('MutuallyExclusiveDistricts', 'District=DISTRICT_ENTERTAINMENT_COMPLEX', 'MutuallyExclusiveDistrict')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_STREET_CARNIVAL', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_STREET_CARNIVAL', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_STREET_CARNIVAL', 'Entertainment'),
    },
  }),
  NEIGHBORHOOD: D({
    id: 'NEIGHBORHOOD',
    costProgressGame: 1000,
    // CIV6 (M'banza): FIVE Housing whatever the tile's Appeal, +2 Food and
    // +4 Gold of its own, unlocked at Guilds rather than Urbanization, and a
    // free Apostle when it finishes.
    civVariants: [{
      civ: 'KONGO', name: "M'banza", cost: 27, housing: 5, amenities: 0,
      flatYield: { food: 2, gold: 4 },
      // its EARLIER unlock is a `DISTRICT_PREREQ_ROWS` override, the same
      // door The First Emperor's Canal comes through
      grantsUnit: 'APOSTLE',
    }],
    plunder: { kind: 'gold', amount: 50 },
    name: 'Neighborhood',
    code: 'NH',
    color: '#7c8b4f',
    cost: 54,
    countsTowardLimit: false,
    allowMultiple: true,
    adjacency: [],
    // appeal-based (2-6), computed from the tile it sits on: `cityHousing`
    // takes the NEIGHBORHOOD arm and never reads this column at all, and the
    // Average band it lands in pays 4 — the install's Districts.Housing.
    housing: 0,
    maintenance: 0,
    appealAdjacent: 0,
    cityStrength: 2,
    placement: {},
    description: 'Housing based on tile appeal (2-6).',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'RequiresPopulation'),
      housing: { stylized: 'the appeal band pays it — cpu/core/city.ts:382 takes the NEIGHBORHOOD arm and never reads this column; its Average band pays 6-2 = 4, the install Districts.Housing' },
      maintenance: xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      costProgressGame: xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'CostProgressionParam1'),
      allowMultiple: { derived: 'true where the install row says OnePerCity false', inputs: [xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'OnePerCity')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_MBANZA', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_MBANZA', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_MBANZA', 'Entertainment'),
      'civVariants.0.flatYield.food': xml('ModifierArguments', 'ModifierId=MBANZA_FOOD&Name=Amount', 'Value'),
      'civVariants.0.flatYield.gold': xml('ModifierArguments', 'ModifierId=MBANZA_GOLD&Name=Amount', 'Value'),
    },
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
    cityStrength: 2,
    // CIV6 (Aerodrome): "must be built on flat terrain".
    placement: { flatLand: true },
    description: 'Builds and bases aircraft. Flat land only.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
    },
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
    maintenance: 0,  // Districts.xml writes the Spaceport no Maintenance (schema default 0)
    appealAdjacent: -1,
    cityStrength: 2,
    placement: { flatLand: true },
    description: 'Launch site for the Science Victory projects. Flat land only.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'PlunderType', { expect: 'PLUNDER_SCIENCE' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      fixedCost: { derived: 'true where the install row carries NO CostProgressionModel', inputs: [xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'CostProgressionModel')] },
    },
  }),
  // CIV6 (Dam): "It must be built on a Floodplains tile and the River must
  // traverse at least 2 adjacent sides of the future Dam tile", "Limit of one
  // per River", and it "Does not depend on Population" — one of the three
  // ENGINEERING districts, which is also what lets a Military Engineer rush it.
  DAM: D({
    id: 'DAM',
    costProgressGame: 1000,
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
    cityStrength: 0,
    floodShield: true,
    placement: { floodplainRiver: true },
    description: 'On a floodplain with the river on two sides. +3 housing, and its river no longer floods.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_DAM', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_DAM', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_DAM', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_DAM', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_DAM', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_DAM', 'CityStrengthModifier'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      costProgressGame: xml('Districts', 'DistrictType=DISTRICT_DAM', 'CostProgressionParam1'),
      allowMultiple: { derived: 'true where the install row says OnePerCity false', inputs: [xml('Districts', 'DistrictType=DISTRICT_DAM', 'OnePerCity')] },
    },
  }),
  // CIV6 (Canal): "provides passage from a body of water to a City Center or
  // another body of water", "Does not depend on Population", "No limit on the
  // number that can be built per city".
  CANAL: D({
    id: 'CANAL',
    costProgressGame: 1000,
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
    cityStrength: 0,
    placement: { canalPassage: true },
    description: 'Flat land between water and a City Center or a second body of water.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_CANAL', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_CANAL', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      costProgressGame: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'CostProgressionParam1'),
      allowMultiple: { derived: 'true where the install row says OnePerCity false', inputs: [xml('Districts', 'DistrictType=DISTRICT_CANAL', 'OnePerCity')] },
    },
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
    cityStrength: 2,
    exclusiveDistricts: ['ENTERTAINMENT_COMPLEX'],
    placement: { onCoastalWater: true },
    // CIV6 (DISTRICT_WATER_STREET_CARNIVAL, "Copacabana"): Cost 27,
    // `Entertainment="2"` against the Water Park's 1, on the same Coast +
    // AdjacentToLand ground and the same Natural History unlock. A Theater
    // Square beside one is paid the +2 Culture `Copacabana_Culture` names,
    // which is exactly what `WaterPark_Culture` already pays the base row —
    // the variant IS the Water Park in storage, so no source is added.
    civVariants: [{
      civ: 'BRAZIL', name: 'Copacabana', cost: 27, housing: 0, amenities: 2,
    }],
    description: 'The Entertainment Complex on the water. One or the other, never both.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'Maintenance'),
      amenities: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'Entertainment'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'PlunderType', { expect: 'PLUNDER_HEAL' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      'placement.onCoastalWater': xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'Coast'),
      exclusiveDistricts: { derived: 'the MutuallyExclusiveDistricts rows of this district, as engine ids', inputs: [xml('MutuallyExclusiveDistricts', 'District=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'MutuallyExclusiveDistrict')] },
      'civVariants.0.cost': xml('Districts', 'DistrictType=DISTRICT_WATER_STREET_CARNIVAL', 'Cost'),
      'civVariants.0.housing': xml('Districts', 'DistrictType=DISTRICT_WATER_STREET_CARNIVAL', 'Housing'),
      'civVariants.0.amenities': xml('Districts', 'DistrictType=DISTRICT_WATER_STREET_CARNIVAL', 'Entertainment'),
    },
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
    // appeal-based, like the Neighborhood's: `cityHousing` takes the
    // `appealHousing` arm and never reads this column; PRESERVE_APPEAL_HOUSING's
    // Average band pays 1, the install's Districts.Housing.
    housing: 0,
    maintenance: 0,
    appealAdjacent: 1,
    cityStrength: 0,
    appealHousing: true,
    cultureBombUnowned: true,
    placement: { notAdjacentToCityCenter: true },
    description: 'Housing from the appeal of its own tile, and it annexes the unowned tiles it touches.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'RequiresPopulation'),
      housing: { stylized: 'the appeal band pays it — cpu/core/city.ts:384 takes the appealHousing arm and never reads this column; PRESERVE_APPEAL_HOUSING[2] (Average) is 1, the install Districts.Housing' },
      maintenance: xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'PlunderType', { expect: 'PLUNDER_GOLD' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      'placement.notAdjacentToCityCenter': xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'NoAdjacentCity'),
      appealHousing: { derived: 'true where the install gives the district AppealHousingChanges rows', inputs: [xml('AppealHousingChanges', 'DistrictType=DISTRICT_PRESERVE&MinimumValue=4', 'AppealChange')] },
    },
  }),
  // CIV6 (Government Plaza): "+8 Loyalty to this city", "+1 adjacency bonus to
  // all adjacent districts", "Awards +1 Governor Title", "Limit of one per
  // civilization".
  GOVERNMENT_PLAZA: D({
    id: 'GOVERNMENT_PLAZA',
    // CIV6 (`CostProgressionParam1`): 25, not the usual 40
    discountPct: 25,
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
    cityStrength: 2,
    loyalty: 8,
    governorTitle: 1,
    oneCivWide: true,
    placement: {},
    description: 'The seat of government: one per civilization, +8 loyalty, and a governor title.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'PlunderType', { expect: 'PLUNDER_CULTURE' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      discountPct: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'CostProgressionParam1'),
      loyalty: xml('ModifierArguments', 'ModifierId=GOVERNMENT_IDENTITY_PER_TURN_MODIFIER&Name=Amount', 'Value'),
      oneCivWide: { derived: 'true where the install row carries MaxPerPlayer 1', inputs: [xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'MaxPerPlayer')] },
    },
  }),
  // CIV6 (Diplomatic Quarter): "+1 Envoy when built next to the City Center",
  // "Enemy Spies operate at 2 levels below normal when targeting this district
  // or adjacent districts", "Limit of one per civilization".
  DIPLOMATIC_QUARTER: D({
    id: 'DIPLOMATIC_QUARTER',
    // CIV6 (`CostProgressionParam1`): 25, not the usual 40
    discountPct: 25,
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
    cityStrength: 2,
    envoysNextToCenter: 1,
    spyLevelPenalty: 2,
    oneCivWide: true,
    placement: {},
    description: 'One per civilization. An envoy if it touches the centre, and enemy spies work two levels down.',
    src: {
      cost: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'Cost'),
      countsTowardLimit: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'RequiresPopulation'),
      housing: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'Housing'),
      maintenance: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'Maintenance'),
      appealAdjacent: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'Appeal'),
      cityStrength: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'CityStrengthModifier'),
      'plunder.kind': xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'PlunderType', { expect: 'PLUNDER_CULTURE' }),
      'plunder.amount': xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'PlunderAmount'),
      code: { stylized: 'a display code, not a game constant' },
      color: { stylized: 'a display colour, not a game constant' },
      discountPct: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'CostProgressionParam1'),
      spyLevelPenalty: xml('ModifierArguments', 'ModifierId=DIPLOMATIC_QUARTER_ESPIONAGE_BONUS&Name=Amount', 'Value'),
      envoysNextToCenter: xml('ModifierArguments', 'ModifierId=DIPLOMATIC_QUARTER_AWARD_ONE_INFLUENCE_TOKEN&Name=Amount', 'Value'),
      oneCivWide: { derived: 'true where the install row carries MaxPerPlayer 1', inputs: [xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'MaxPerPlayer')] },
    },
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
export const SCAFFOLD_DISTRICTS: { id: DistrictId; src?: SrcMap; unlockId: string; unlockKind?: 'civic'; placement?: 'aqueduct' | 'coastal' | 'encampment' | 'flat' | 'dam' | 'canal' }[] = [
  { id: 'CAMPUS', unlockId: 'WRITING',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_CAMPUS', 'PrereqTech', { expect: 'TECH_WRITING' }),
    },
  },
  { id: 'HOLY_SITE', unlockId: 'ASTROLOGY',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_HOLY_SITE', 'PrereqTech', { expect: 'TECH_ASTROLOGY' }),
    },
  },
  { id: 'COMMERCIAL_HUB', unlockId: 'CURRENCY',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_COMMERCIAL_HUB', 'PrereqTech', { expect: 'TECH_CURRENCY' }),
    },
  },
  { id: 'AQUEDUCT', unlockId: 'ENGINEERING', placement: 'aqueduct',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_AQUEDUCT', 'PrereqTech', { expect: 'TECH_ENGINEERING' }),
    },
  },
  { id: 'HARBOR', unlockId: 'CELESTIAL_NAVIGATION', placement: 'coastal',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_HARBOR', 'PrereqTech', { expect: 'TECH_CELESTIAL_NAVIGATION' }),
    },
  },
  { id: 'INDUSTRIAL_ZONE', unlockId: 'APPRENTICESHIP',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_INDUSTRIAL_ZONE', 'PrereqTech', { expect: 'TECH_APPRENTICESHIP' }),
    },
  },
  { id: 'THEATER_SQUARE', unlockId: 'DRAMA_AND_POETRY', unlockKind: 'civic',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_THEATER', 'PrereqCivic', { expect: 'CIVIC_DRAMA_POETRY' }),
      unlockKind: { derived: "'civic' where the install row unlocks on PrereqCivic rather than PrereqTech", inputs: [xml('Districts', 'DistrictType=DISTRICT_THEATER', 'PrereqCivic')] },
    },
  },
  { id: 'ENTERTAINMENT_COMPLEX', unlockId: 'GAMES_AND_RECREATION', unlockKind: 'civic',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' }),
      unlockKind: { derived: "'civic' where the install row unlocks on PrereqCivic rather than PrereqTech", inputs: [xml('Districts', 'DistrictType=DISTRICT_ENTERTAINMENT_COMPLEX', 'PrereqCivic')] },
    },
  },
  { id: 'ENCAMPMENT', unlockId: 'BRONZE_WORKING', placement: 'encampment',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_ENCAMPMENT', 'PrereqTech', { expect: 'TECH_BRONZE_WORKING' }),
    },
  },
  { id: 'AERODROME', unlockId: 'FLIGHT',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_AERODROME', 'PrereqTech', { expect: 'TECH_FLIGHT' }),
    },
  },
  { id: 'NEIGHBORHOOD', unlockId: 'URBANIZATION', unlockKind: 'civic',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'PrereqCivic', { expect: 'CIVIC_URBANIZATION' }),
      unlockKind: { derived: "'civic' where the install row unlocks on PrereqCivic rather than PrereqTech", inputs: [xml('Districts', 'DistrictType=DISTRICT_NEIGHBORHOOD', 'PrereqCivic')] },
    },
  },
  { id: 'SPACEPORT', unlockId: 'ROCKETRY', placement: 'flat',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_SPACEPORT', 'PrereqTech', { expect: 'TECH_ROCKETRY' }),
    },
  },
  { id: 'PRESERVE', unlockId: 'MYSTICISM', unlockKind: 'civic', placement: 'encampment',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'PrereqCivic', { expect: 'CIVIC_MYSTICISM' }),
      unlockKind: { derived: "'civic' where the install row unlocks on PrereqCivic rather than PrereqTech", inputs: [xml('Districts', 'DistrictType=DISTRICT_PRESERVE', 'PrereqCivic')] },
    },
  },
  { id: 'GOVERNMENT_PLAZA', unlockId: 'STATE_WORKFORCE', unlockKind: 'civic',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'PrereqCivic', { expect: 'CIVIC_STATE_WORKFORCE' }),
      unlockKind: { derived: "'civic' where the install row unlocks on PrereqCivic rather than PrereqTech", inputs: [xml('Districts', 'DistrictType=DISTRICT_GOVERNMENT', 'PrereqCivic')] },
    },
  },
  { id: 'DIPLOMATIC_QUARTER', unlockId: 'MATHEMATICS',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_DIPLOMATIC_QUARTER', 'PrereqTech', { expect: 'TECH_MATHEMATICS' }),
    },
  },
  { id: 'DAM', unlockId: 'BUTTRESS', placement: 'dam',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_DAM', 'PrereqTech', { expect: 'TECH_BUTTRESS' }),
    },
  },
  { id: 'WATER_PARK', unlockId: 'NATURAL_HISTORY', unlockKind: 'civic', placement: 'coastal',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
      unlockKind: { derived: "'civic' where the install row unlocks on PrereqCivic rather than PrereqTech", inputs: [xml('Districts', 'DistrictType=DISTRICT_WATER_ENTERTAINMENT_COMPLEX', 'PrereqCivic')] },
    },
  },
  { id: 'CANAL', unlockId: 'STEAM_POWER', placement: 'canal',
    src: {
      unlockId: xml('Districts', 'DistrictType=DISTRICT_CANAL', 'PrereqTech', { expect: 'TECH_STEAM_POWER' }),
    },
  },
];

/** What a trade route pays PER DISTRICT at its destination — CIV6
 *  `District_TradeRouteYields` (Districts.xml, plus the DLC packs for the
 *  Diplomatic Quarter). Three columns per row in the install:
 *  `YieldChangeAsOrigin` is 0 on EVERY row, so the origin's own districts pay
 *  nothing; `YieldChangeAsDomesticDestination` and
 *  `YieldChangeAsInternationalDestination` are the two below. The CITY_CENTER
 *  row is the "flat head" every route pays (food 1 / production 1 at home,
 *  gold 3 abroad). Unique districts inherit their base row — the install's
 *  Hansa, Cothon, Royal Navy Dockyard, Suguba, Seowon, Lavra, Acropolis,
 *  Ikanda, Oppidum, Observatory, Thanh, Hippodrome and Street Carnival rows
 *  each equal the district they replace. The Indonesia/Khmer SCENARIO adds
 *  culture rows to the centre, hub and harbor; scenario rows are not play.
 *  Measured to the unit in the live game (tools/civ6lab
 *  trade_probe.lua): every foreign destination paid 3 gold plus these rows,
 *  a Harbor city 6, an origin with four specialty districts nothing more than
 *  one with none. The GlobalParameters TRADE_ROUTE_GOLD_PER_*_DISTRICT are
 *  dead rows in Gathering Storm and are not read anywhere. */
export interface RouteYieldRow {
  food?: number; production?: number; gold?: number; science?: number; culture?: number; faith?: number;
}
export const DISTRICT_ROUTE_YIELDS: Partial<Record<DistrictId, { domestic: RouteYieldRow; international: RouteYieldRow }>> = {
  CITY_CENTER: { domestic: { food: 1, production: 1 }, international: { gold: 3 } },
  COMMERCIAL_HUB: { domestic: { production: 1 }, international: { gold: 3 } },
  HARBOR: { domestic: { production: 1 }, international: { gold: 3 } },
  GOVERNMENT_PLAZA: { domestic: { food: 1, production: 1 }, international: { gold: 2 } },
  DIPLOMATIC_QUARTER: { domestic: { food: 1, production: 1 }, international: { culture: 1 } },
  CAMPUS: { domestic: { food: 1 }, international: { science: 1 } },
  HOLY_SITE: { domestic: { food: 1 }, international: { faith: 1 } },
  THEATER_SQUARE: { domestic: { food: 1 }, international: { culture: 1 } },
  INDUSTRIAL_ZONE: { domestic: { production: 1 }, international: { production: 1 } },
  ENCAMPMENT: { domestic: { production: 1 }, international: { production: 1 } },
  ENTERTAINMENT_COMPLEX: { domestic: { food: 1 }, international: { food: 1 } },
  WATER_PARK: { domestic: { food: 1 }, international: { food: 1 } },
  // AERODROME, AQUEDUCT, CANAL, DAM, NEIGHBORHOOD, SPACEPORT carry no row;
  // PRESERVE is not in this install at all.
};
