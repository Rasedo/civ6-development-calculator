/** Shared type definitions for the whole engine. */

export type YieldKey = 'food' | 'production' | 'gold' | 'science' | 'culture' | 'faith';

export type Yields = Record<YieldKey, number>;

export const YIELD_KEYS: YieldKey[] = ['food', 'production', 'gold', 'science', 'culture', 'faith'];

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
  | 'OIL_WELL';

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

export interface Tile {
  index: number;
  col: number;
  row: number;
  terrain: TerrainId;
  elevation: Elevation;
  feature: string | null; // FeatureId
  resource: string | null; // resource id from data/resources
  /** Natural wonder id occupying this tile, or null. */
  wonder: string | null;
  /** 6-bit mask; bit d set = river runs along the edge toward neighbor direction d. */
  riverMask: number;
  improvement: string | null; // ImprovementId
  /** District type occupying this tile (may be under construction). */
  district: DistrictId | null;
  districtComplete: boolean;
  /** World wonder occupying this tile (may be under construction). */
  builtWonder: string | null;
  builtWonderComplete: boolean;
  /** Owning city id, or -1. */
  cityId: number;
}

export interface GameMap {
  width: number;
  height: number;
  seed: number;
  tiles: Tile[];
}

export type FocusId = 'balanced' | YieldKey;

export type QueueItem =
  | { kind: 'district'; district: DistrictId; tileIndex: number; progress: number; cost?: number }
  | { kind: 'building'; building: string; progress: number }
  | { kind: 'wonder'; wonder: string; tileIndex: number; progress: number }
  | { kind: 'settler'; progress: number; cost: number };

export type GreatPersonClass =
  | 'SCIENTIST'
  | 'ENGINEER'
  | 'MERCHANT'
  | 'PROPHET'
  | 'ARTIST'
  | 'ADMIRAL'
  | 'GENERAL';

export interface City {
  id: number;
  name: string;
  centerIndex: number;
  population: number;
  /** Accumulated food toward next citizen. */
  foodBox: number;
  /** Accumulated culture toward the next border expansion. */
  cultureBox: number;
  /** Tiles gained beyond the initial ring (drives expansion cost). */
  tilesAcquired: number;
  /** Tile indexes the player forced to be worked. */
  lockedTiles: number[];
  focus: FocusId;
  queue: QueueItem[];
  isCapital: boolean;
  /** Building ids present in the city (across all its districts). */
  buildings: string[];
  /** District instances: type -> tile indexes (NEIGHBORHOOD may repeat). */
  districts: { type: DistrictId; tileIndex: number }[];
  /** World wonders this city has placed (complete flag lives on the tile). */
  wonders: { id: string; tileIndex: number }[];
  /** Manual specialist assignments: district tileIndex (as string) -> count. */
  specialists: Record<string, number>;
}

/** Empire research progress (one tech + one civic at a time, like Civ 6). */
export interface ResearchState {
  tech: string | null;
  techProgress: number;
  civic: string | null;
  civicProgress: number;
  techs: string[];
  civics: string[];
  /** Tech/civic ids whose eureka/inspiration has fired (-40% cost). */
  boosted: string[];
}

/** Current government and slotted policy cards (null = empty slot). */
export interface GovernmentState {
  current: string | null;
  /** One entry per slot, ordered as the government's slot list. */
  policies: (string | null)[];
}

export interface GameState {
  map: GameMap;
  cities: City[];
  nextCityId: number;
  turn: number;
  /** Sandbox: districts/buildings complete instantly, cost nothing, and ignore tech gating. */
  sandbox: boolean;
  treasury: number;
  scienceTotal: number;
  cultureTotal: number;
  faithTotal: number;
  research: ResearchState;
  government: GovernmentState;
  greatPeople: {
    points: Partial<Record<GreatPersonClass, number>>;
    /** Ids of great people already earned (in claim order). */
    earned: string[];
  };
  religion: ReligionState;
  tradeRoutes: TradeRoute[];
  /** Trained settlers waiting to found a city (first city needs none). */
  settlers: number;
  /** Tile indexes queued for automatic founding as settlers complete. */
  plannedSettles: number[];
}

export interface ReligionState {
  /** Chosen pantheon belief id (costs 25 faith). */
  pantheon: string | null;
  founded: boolean;
  name: string | null;
  follower: string | null;
  founder: string | null;
  /** Worship building id unlocked by founding. */
  worship: string | null;
}

export interface TradeRoute {
  /** Origin city id (receives the yields). */
  from: number;
  /** Destination city id. */
  to: number;
}

export interface MapGenOptions {
  width: number;
  height: number;
  seed: number;
  /** Approximate fraction of land tiles. */
  landFraction?: number;
  withResources?: boolean;
  withWonders?: boolean;
}

export interface YieldBreakdown {
  tiles: Yields;
  districts: Yields;
  buildings: Yields;
  citizens: Yields;
  total: Yields;
  /** Multiplier applied to non-food yields from amenities. */
  amenityYieldFactor: number;
  workedTiles: number[];
}
