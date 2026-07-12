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
  /** Pillaged improvement (yields nothing until a builder repairs it). */
  pillaged: boolean;
  /** Tribal village (goody hut) waiting for a unit to claim it. */
  goodyHut: boolean;
  /** Volcano (a mountain that occasionally erupts when disasters are on). */
  volcano: boolean;
  /** Permanent bonus food from floods/eruptions/storm silt (capped). */
  fertility: number;
  /** Turns of drought left (-1 food while active). */
  droughtTurns: number;
  /** Owning city id, or -1. */
  cityId: number;
  /** Owning city-state id (territory blocks settling/borders); absent = none. */
  csId?: number;
  /** Owning rival-civ id; absent = none. */
  rivalId?: number;
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
  | { kind: 'settler'; progress: number; cost: number }
  | { kind: 'unit'; unit: string; progress: number; cost?: number }
  | { kind: 'project'; project: string; progress: number; cost: number };

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
  /**
   * Owning civ in the unified civ space (C1-A2): absent = the player
   * (civ 0); rival cities carry civOfRival(rival.id). Ids stay per-owner
   * sequences until C1-B7 unifies them (rival ids drive border pacing).
   */
  civId?: number;
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
  /** Banked production from chops that landed while the queue was empty. */
  productionBank?: number;
  /**
   * Loyalty 0–100 (only moves while rival civs exist; capitals immune).
   * A city at 0 flips to the pressuring rival. Absent = 100.
   */
  loyalty?: number;
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
  /** GV-2: true once TURN_LIMIT turns are played (or a victory fires). */
  gameOver?: boolean;
  /** GV-4/GV-3: 0 none, 1 score (TURN_LIMIT), 2 domination (all capitals). */
  victoryType?: number;
  /** GV-3: original capital tiles, civ-indexed (0 player, r+1 rival r).
   *  Static once founded — capture never moves the tile, only its owner. */
  capitalTiles?: number[];
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
  /** P4/D-10: builders ever trained or purchased — each adds +4 (pre-speed)
   * to the next builder's cost, like real Civ 6. */
  buildersTrained: number;
  /** P4/D-22: combat strength of the strongest MELEE unit the player has
   * ever fielded — real Civ 6 bases city defense on it. */
  bestMeleeCS: number;
  /** P4/D-17: tiles ever gold-purchased — each adds +5 (pre-speed) to every
   * future tile purchase, empire-wide (real Civ 6 schedule). */
  tilesPurchased: number;
  /** Tile indexes queued for automatic founding as settlers complete. */
  plannedSettles: number[];
  /**
   * Units mode: improvements/chops need real builders, units exist on the
   * map. Off = classic calculator behavior (free instant improvements).
   */
  unitsMode: boolean;
  units: Unit[];
  nextUnitId: number;
  /** Seeded RNG state for all in-game randomness (serialized => replayable). */
  rngState: number;
  /** Barbarian camp tile indexes (units mode only). */
  barbCamps: number[];
  /** City HP keyed by city id (string for JSON); missing = full (200). */
  cityHp: Record<string, number>;
  /** Random natural disasters (floods, eruptions, droughts, storms). */
  disasters: boolean;
  /** Fog of war (units mode): unexplored tiles are hidden and unusable. */
  fogOfWar: boolean;
  /**
   * When false, end-of-turn stops auto-picking the cheapest research;
   * something else (the RL env, a planner) chooses techs/civics instead.
   * Absent/true = classic auto-pick.
   */
  autoResearch?: boolean;
  /** Per-tile explored flags (0/1), parallel to map.tiles; [] = all explored. */
  explored: number[];
  /** Recent gameplay events (goody rewards etc.) for the UI to surface. */
  eventLog: string[];
  /** Independent city-states on the map ([] = none / feature off). */
  cityStates: CityState[];
  /** Influence points accrued toward the next envoy. */
  influencePoints: number;
  /** Earned envoys waiting to be assigned to a met city-state. */
  envoysAvailable: number;
  /** Scripted rival civilizations ([] = none / feature off). */
  rivals: RivalCiv[];
  /** Pantheon beliefs claimed by rivals (unavailable to the player). */
  claimedPantheons: string[];
  /** Follower/founder beliefs claimed by rival religions. */
  claimedBeliefs: string[];
}

export interface Unit {
  id: number;
  /** Unit type id from data/units. */
  type: string;
  owner: 'player' | 'barbarian' | 'rival';
  /** Owning rival civ id (rival units only). */
  civId?: number;
  tileIndex: number;
  movesLeft: number;
  hp: number;
  /** Builder charges; null for non-builders. */
  charges: number | null;
  /** Remaining multi-turn movement path (tile indexes), or null. */
  path: number[] | null;
  /** Standing order ('explore' keeps picking new frontier targets). */
  mission?: 'explore' | null;
}

/**
 * A rival's city is a real City object (C1-A2): the same shape the player
 * uses, so the C1-B stages can swap the heuristic economy for the real
 * machinery field by field. Until then the City fields beyond the old
 * scalar set (queue, buildings, districts, focus, …) are inert defaults —
 * the heuristic in rivalPhase still drives everything. `foodBox` carries
 * what the heuristic used to call growthBox.
 */
export interface RivalCity extends City {
  /** City HP (player cities keep theirs in state.cityHp until C1-B7 unifies). */
  hp: number;
  foundedTurn: number;
}

/** A scripted rival empire: real map presence, abstract economy. */
export interface RivalCiv {
  id: number;
  name: string;
  color: string;
  /** 0..1 — settling pace and war likelihood. */
  aggression: number;
  cities: RivalCity[];
  nextCityId: number;
  atWar: boolean;
  warTurns: number;
  peaceTurns: number;
  /** Real tech/civic trees (C1-B3): same shape as the player's. */
  research: ResearchState;

  /** Great-person race points per class. */
  gpp: Partial<Record<GreatPersonClass, number>>;
  pantheonClaimed: boolean;
  religionFounded: boolean;
  /** AUDIT A-7: the CLAIMED belief identities — effects apply to this civ
   * (previously denial-only: picks joined the global pools and were
   * forgotten). Optional for old saves; unset until claimed/founded. */
  pantheon?: string | null;
  followerBelief?: string | null;
  founderBelief?: string | null;
  /** VP-G1: banked gold — accrues from worked tiles; no scripted spender. */
  treasury?: number;
  /** P5/S5 (C-17): banked faith — the pantheon's consumer. */
  faith?: number;
  /** P5/S5 (C-16): PROPHET-class great people this civ claimed (religion gate). */
  prophets?: number;
  /** P4/D-10: this civ's builders ever trained (its own cost escalator). */
  buildersTrained?: number;
  /** P4/D-22: this civ's strongest melee unit ever fielded (city defense). */
  bestMeleeCS?: number;
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
  /** Destination city id (-1 when the destination is a city-state). */
  to: number;
  /** Destination city-state id, if this is an international route. */
  toCs?: number;
}

export type CityStateType =
  | 'scientific'
  | 'cultural'
  | 'trade'
  | 'industrial'
  | 'militaristic'
  | 'religious';

export interface CityStateQuest {
  kind: 'clearCamp' | 'sendTradeRoute' | 'buildDistrict';
  /** For buildDistrict: the district type asked for. */
  district?: DistrictId;
  /** For clearCamp: the camp tile that must be cleared. */
  campIndex?: number;
}

export interface CityState {
  id: number;
  name: string;
  type: CityStateType;
  centerIndex: number;
  population: number;
  /** Envoys the player has assigned here. */
  envoys: number;
  /** Met once the player has explored near it (envoys need contact). */
  met: boolean;
  quest: CityStateQuest | null;
  /** Turn the current quest was issued (for reissue pacing). */
  questIssuedTurn: number;
  /** Siege hit points; absent = full (CS_MAX_HP). */
  hp?: number;
  /** Turn of the player's last militaristic levy here (cooldown). */
  lastLevyTurn?: number;
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
