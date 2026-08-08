/**
 * THE WORLD'S TYPES — the map half of the old shared type file, engine-free.
 *
 * `world/` may be imported by anything (the seeder, both engine sides, tests)
 * and imports NOTHING outside itself. If a symbol needs to know what a tile
 * is WORTH, what a building COSTS, or what a rule DOES, it does not belong
 * here.
 */

/**
 * The six yields, and the ONLY place their order is written.
 *
 * Index here IS the GPU's yield axis: the exporter builds every yield row with
 * `YIELD_KEYS.map`, and the GPU reads those rows 6-wide by position. Reordering
 * this array silently permutes every yield table on the wire.
 */
export const YIELD_KEYS = ['food', 'production', 'gold', 'science', 'culture', 'faith'] as const;

export type YieldKey = (typeof YIELD_KEYS)[number];

export type Yields = Record<YieldKey, number>;

export function emptyYields(): Yields {
  return { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
}

export function addYields(target: Yields, src: Partial<Yields>, factor = 1): Yields {
  for (const k of YIELD_KEYS) {
    const v = src[k];
    if (v) target[k] += v * factor;
  }
  return target;
}

export type TerrainId =
  | 'GRASSLAND'
  | 'PLAINS'
  | 'DESERT'
  | 'TUNDRA'
  | 'SNOW'
  | 'COAST'
  | 'LAKE'
  | 'OCEAN';

export type Elevation = 'FLAT' | 'HILLS' | 'MOUNTAIN';

export type FeatureId =
  | 'WOODS'
  | 'RAINFOREST'
  | 'MARSH'
  | 'FLOODPLAINS'
  | 'OASIS'
  | 'REEF'
  | 'ICE';

export type ResourceCategory = 'bonus' | 'luxury' | 'strategic';

export type ImprovementId =
  | 'FARM'
  | 'MINE'
  | 'QUARRY'
  | 'LUMBER_MILL'
  | 'PASTURE'
  | 'CAMP'
  | 'PLANTATION'
  | 'FISHING_BOATS'
  | 'OIL_WELL'
  // Roster order IS the GPU's improvement index. New entries append HERE;
  // inserting anywhere above renumbers every improvement after it.
  | 'SEASIDE_RESORT'
  | 'FORT';

export type DistrictId =
  | 'CITY_CENTER'
  | 'CAMPUS'
  | 'HOLY_SITE'
  | 'THEATER_SQUARE'
  | 'COMMERCIAL_HUB'
  | 'HARBOR'
  | 'INDUSTRIAL_ZONE'
  | 'ENCAMPMENT'
  | 'AQUEDUCT'
  | 'ENTERTAINMENT_COMPLEX'
  | 'NEIGHBORHOOD';

/** "no seat" — the whole ownership space's null, here because `Tile` carries it. */
export const NO_SEAT = -1;

/** Minimum hex distance between any two city CENTRES — a rule of the WORLD's
 *  geometry (placement legality), which is why it lives beside the map types. */
export const CITY_MIN_DIST = 4;

export interface Tile {
  /**
   * WHO owns this tile — one seat id from the absolute space in
   * cpu/core/seats.ts (NO_SEAT = nobody). Read it through
   * `tileSeat`/`tileCity`/`tileBelongsTo` and write it through `setTileOwner`;
   * nothing else should touch it.
   */
  ownerSeat: number;
  /** WHICH CITY of that seat works the tile (-1 = none / a city-state). */
  ownerCity: number;
  index: number;
  col: number;
  row: number;
  terrain: TerrainId;
  elevation: Elevation;
  feature: FeatureId | null;
  resource: string | null; // resource id from world/resources
  /** Natural wonder id occupying this tile, or null. */
  wonder: string | null;
  /** 6-bit mask; bit d set = river runs along the edge toward neighbor direction d. */
  riverMask: number;
  improvement: string | null; // ImprovementId
  /** District type occupying this tile; possibly still under construction. */
  district: DistrictId | null;
  districtComplete: boolean;
  /** World wonder occupying this tile; possibly still under construction. */
  builtWonder: string | null;
  builtWonderComplete: boolean;
  /** CLIFFS as a six-bit EDGE mask, exactly like `riverMask` — bit
   *  d is set when the edge toward neighbor direction d carries a cliff. Real
   *  Civ 6 puts cliffs on the land/water boundary, where they block EMBARK and
   *  DISEMBARK across that edge. That is what makes a cliff-ringed city safe
   *  from naval invasion. They do NOT block land-to-land movement. */
  cliffMask: number;
  /** an ANTIQUITY SITE — a dig an Archaeologist can excavate into
   *  an Artifact. Real Civ 6 creates these from pre-Modern events (a razed
   *  barbarian outpost, a unit dying) and reveals them with Natural History. */
  antiquity?: boolean;
  /** Pillaged improvement (yields nothing until a builder repairs it). */
  pillaged: boolean;
  /** pillaged district (a complete, non-CITY_CENTER district whose
   * yields/buildings/housing/amenities/GPP go dark until a builder repairs it;
   * static counts — cost/limit/maintenance — stay, since it is still owned). */
  districtPillaged?: boolean;
  /** the ENCAMPMENT garrison pool (max ENCAMPMENT_HP = 100), set
   *  when the district COMPLETES. While positive the tile blocks hostile
   *  entry and the district may strike; a melee attack on the tile depletes
   *  it, and at 0 the tile is enterable and the strike goes silent. Lives on
   *  the TILE (not the city) so every walker's legality check stays O(1) and
   *  the GPU can mirror it as one [B, T] plane. */
  encampHp?: number;
  /** a ROAD lies on this tile. Laid by trade routes (real Civ 6:
   *  Traders lay road as they serve a land route). A step from one road tile
   *  to another ignores the terrain penalty, and from the Classical era on it
   *  also ignores the river crossing charge (Civ 6's Classical road brings
   *  bridges). Absent = no road. */
  road?: boolean;
  /** Tribal village (goody hut) waiting for a unit to claim it. */
  goodyHut: boolean;
  /** Volcano (a mountain that occasionally erupts when disasters are on). */
  volcano: boolean;
  /** Permanent bonus food from floods/eruptions/storm silt (capped). */
  fertility: number;
  /** Turns of drought left (-1 food while active). */
  droughtTurns: number;
}

export interface GameMap {
  width: number;
  height: number;
  seed: number;
  tiles: Tile[];
}

export interface MapGenOptions {
  width: number;
  height: number;
  seed: number;
  /** Approximate fraction of land tiles. */
  landFraction?: number;
  withResources?: boolean;
  withWonders?: boolean;
  withVillages?: boolean;
}
