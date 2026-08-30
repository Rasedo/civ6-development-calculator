
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

// The union is a SET; `IMPROVEMENT_IDS` (cpu/core/unitActions.ts) is the
// ordered roster whose position is the GPU's improvement index and the build
// column's number, so a new id appends THERE.
export type ImprovementId =
  | 'BATEY'
  | 'COLOSSAL_HEADS'
  | 'MONASTERY'
  | 'FARM'
  | 'MINE'
  | 'QUARRY'
  | 'LUMBER_MILL'
  | 'PASTURE'
  | 'CAMP'
  | 'PLANTATION'
  | 'FISHING_BOATS'
  | 'OIL_WELL'
  | 'SEASIDE_RESORT'
  | 'FORT'
  | 'AIRSTRIP'
  | 'SOLAR_FARM'
  | 'WIND_FARM';

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
  | 'NEIGHBORHOOD'
  | 'SPACEPORT'
  | 'AERODROME'
  | 'DAM'
  | 'CANAL'
  | 'WATER_PARK'
  | 'PRESERVE'
  | 'GOVERNMENT_PLAZA'
  | 'DIPLOMATIC_QUARTER';

/** "no seat" — the whole ownership space's null, here because `Tile` carries it. */
export const NO_SEAT = -1;

/** Minimum hex distance between any two city CENTRES — a rule of the WORLD's
 *  geometry (placement legality), which is why it lives beside the map types. */
export const CITY_MIN_DIST = 4;

export interface Tile {
  ownerSeat: number;
  ownerCity: number;
  index: number;
  col: number;
  row: number;
  terrain: TerrainId;
  elevation: Elevation;
  feature: FeatureId | null;
  resource: string | null; // resource id from world/resources
  wonder: string | null;
  riverMask: number;
  improvement: string | null; // ImprovementId
  district: DistrictId | null;
  districtComplete: boolean;
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
  /** the ERA index and the SEAT whose event stamped the dig on this
   *  tile. An Artifact carries its provenance out of the ground: a themed
   *  Archaeological Museum needs three artifacts of ONE era from three
   *  DIFFERENT civilizations. */
  antiquityEra?: number;
  antiquitySeat?: number;
  /** a SHIPWRECK — the WATER dig. Real Civ 6 puts these on passable
   *  water and reveals them with Cultural Heritage; an Archaeologist that
   *  works one removes it from the map and excavates an Artifact. */
  shipwreck?: boolean;
  shipwreckEra?: number;
  shipwreckSeat?: number;
  /** the NATIONAL PARK this tile belongs to, named by the LOWEST tile
   *  index in its four-tile cluster (its anchor); absent or -1 = no park.
   *  The anchor is what gives a park an identity two adjacent parks cannot
   *  blur: each pays its own amenities, and every tile pays TOURISM equal to
   *  its own current appeal. */
  park?: number;
  pillaged: boolean;
  districtPillaged?: boolean;
  /** the ENCAMPMENT garrison pool (max ENCAMPMENT_HP = 100), set
   *  when the district COMPLETES. While positive the tile blocks hostile
   *  entry and the district may strike; a melee attack on the tile depletes
   *  it, and at 0 the tile is enterable and the strike goes silent. Lives on
   *  the TILE (not the city) so every walker's legality check stays O(1) and
   *  the GPU can mirror it as one [B, T] plane. */
  encampHp?: number;
  /** the Encampment's OWN outer-defense pool, walls-tier sized and separate
   *  from the city's (`encampOuterPool` resolves the absent-=-FULL default). */
  encampOuterHp?: number;
  /** a ROAD lies on this tile. Laid by trade routes (real Civ 6:
   *  Traders lay road as they serve a land route). A step from one road tile
   *  to another ignores the terrain penalty, and from the Classical era on it
   *  also ignores the river crossing charge (Civ 6's Classical road brings
   *  bridges). Absent = no road. */
  road?: boolean;
  goodyHut: boolean;
  volcano: boolean;
  /** a CITIZEN is PINNED to this plot. `assignWorkedTiles` takes every
   *  locked plot the city can work before it ranks anything by score, so a
   *  lock is how a player overrides the automatic allocation for tiles the
   *  way a specialist pin overrides it for slots. The lock lives on the PLOT
   *  and dies when the plot changes hands (`setTileOwner`). */
  locked?: boolean;
  /** how many times a river flood has reached this tile — the Great Bath's
   *  "+1 Faith for every time a tile belonging to this city has been
   *  Flooded" reads it. A flood counts once per episode (`floodTile`). */
  floodCount?: number;
  /** CIV6 (Marina Raskova): a permanent "+1 air unit slots" on this
   *  district tile, written at the general's retirement. */
  airSlotBonus?: number;
  /** the COASTAL LOWLAND band, 1 (drowns first) to 3; absent = highland or
   *  inland, which the rising sea never reaches. Derived from the map at
   *  creation by `deriveLowlands`, never read off the world file. */
  lowland?: number;
  /** the sea has been over this tile: it is pillaged and pays no improvement
   *  bonus, but is still workable and can be repaired behind a Flood
   *  Barrier. */
  flooded?: boolean;
  /** CIV6 (Railroad): the 0.25-Movement route a Military Engineer lays over
   *  the road, at the cost of 1 Iron and 1 Coal. */
  railroad?: boolean;
  fertility: number;
  /** the PRODUCTION half of flood silt — real Civ 6 fertilizes food and
   *  production on separate rolls, so the two accumulate apart. */
  fertilityProd: number;
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
  landFraction?: number;
  layout?: 'continents' | 'pangaea' | 'islands';
  resourceMult?: number;
  resourceWeights?: [number, number, number];
  withResources?: boolean;
  withWonders?: boolean;
  withVillages?: boolean;
}
