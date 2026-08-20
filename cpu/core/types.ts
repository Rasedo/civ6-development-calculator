export * from '../../world/types';
import type { DistrictId, GameMap, YieldKey } from '../../world/types';


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
  | 'GENERAL'
  // Both share the Theater Square district (GP_CLASS_DISTRICT). Appended at
  // the END of GP_CLASSES: roster order IS the class index, and PROPHET must
  // stay at 3 (prophetCls). The GPU's per-class tensors size off the roster.
  | 'WRITER'
  | 'MUSICIAN';

export interface City {
  foundedTurn: number;
  hp: number;
  id: number;
  name: string;
  seat: number;
  centerIndex: number;
  population: number;
  foodBox: number;
  cultureBox: number;
  tilesAcquired: number;
  lockedTiles: number[];
  focus: FocusId;
  queue: QueueItem[];
  isCapital: boolean;
  buildings: string[];
  districts: { type: DistrictId; tileIndex: number }[];
  wonders: { id: string; tileIndex: number }[];
  productionBank?: number;
  loyalty?: number;
  outerHp?: number;
  religionPressure?: number[];
  followedReligion?: number | null;
  /**
   * Great Works stored in this city. `greatWorksWriting` occupies AMPHITHEATER
   * slots (2 max), `greatWorksMusic` MUSEUM slots (2 max); each work yields
   * GREAT_WORK_CULTURE culture/turn (building-tier). Absent = 0.
   * Carried on capture: the captor keeps the works held in the buildings that
   * survive the flip. Yield-bearing, so the GPU mirror bumps _eff_version on
   * every write.
   */
  greatWorksWriting?: number;
  /** Great Works of ART, in ART MUSEUM slots (3) — the real Civ 6 home. */
  greatWorksArt?: number;
  greatWorksMusic?: number;
  /** the ART MUSEUM's own slots, in fill order: what each holds, and who made it */
  gwArtType?: number[];
  gwArtArtist?: number[];
  /** RELICS held in this city's TEMPLE slot (cap 1). Each pays
   *  +4 faith and +8 tourism — the densest tourism source in real Civ 6. */
  relics?: number;
  artifacts?: number;
  /** the PROVENANCE of the artifacts in this city's Archaeological
   *  Museum, in dig order: the era each was buried in, and the seat whose
   *  event buried it. A THEMED museum is three full slots sharing ONE era
   *  with no civilization repeated, and it DOUBLES its artifacts' culture
   *  and tourism (real Civ 6: "the bonus doubles the yields of all items in
   *  the Museum"). Parallel arrays, same length as `artifacts`. */
  artifactEras?: number[];
  artifactSeats?: number[];
}

/** Empire research progress (one tech + one civic at a time, like Civ 6). */
export interface ResearchState {
  tech: string | null;
  /** Science banked toward `tech`. Switching PARKS this in `techRetained`
   *  under the old tech and loads the new one's — real Civ 6 keeps the
   *  progress on a tech you abandon and hands it back when you return. */
  techProgress: number;
  civic: string | null;
  civicProgress: number;
  techs: string[];
  civics: string[];
  boosted: string[];
  /** Progress PARKED on techs that are not currently being researched. The
   *  tech being researched is never in here — its progress lives in
   *  `techProgress` — so the two are a partition, never a sum. */
  techRetained: Record<string, number>;
  civicRetained: Record<string, number>;
}

export interface GovernmentState {
  current: string | null;
  policies: (string | null)[];
}

export interface SeatActionRecord {
  /** [centerTile, maskColumn] pairs, plus a third element on a DISTRICT
   * column: the tile index to build it on. WHERE a district goes is a
   * decision, so it rides the wire — neither engine scans for a plot, both
   * only re-validate the one named. The city axis is keyed by CENTER TILE
   * because slot order and founding order diverge under compaction and
   * capture. A missing center = that engine has no such city. */
  production: [number, number, number?][];
  war?: number | null;
  envoys?: number[];
  tech: number | null;
  civic: number | null;
  units: number[][];
  buy?: [number, number, number] | null;
  buyFaith?: [number, number][];
  /** The city-state LEVY: the CS index to levy, or null/absent.
   * Gold, but NOT the one-gold-purchase slot — a levy is a diplomacy
   * action and rides beside `buy`, like real Civ 6. */
  levy?: number | null;
  /** the route verb: [origin CENTRE tile, dest code] — dest is a CENTRE
   * tile (an own or another major's city) or -(2+csIndex) for a city-state.
   * Establishing spends a free Trader; both engines only re-validate. */
  route?: [number, number] | null;
  denounce?: number[];
  ally?: number[];
}

export type SeatActionLog = Record<number, Record<number, SeatActionRecord>>;

export interface GameState {
  seats: Seat[];
  gameOver?: boolean;
  victoryType?: number;
  victoryRow?: number;
  roadBridges?: boolean;
  congressSessions?: number;
  /** Standing World Congress resolutions from the LAST session (res index
   * into CONGRESS_RESOLUTIONS, winning outcome 0=A/1=B, target index),
   * replaced wholesale each session. */
  congress?: { res: number; outcome: number; target: number }[];
  warTurns?: Record<string, number>;
  /** turns a pair's PEACE TREATY still binds, keyed like `warTurns`. */
  treatyTurns?: Record<string, number>;
  map: GameMap;
  turn: number;
  seatActions?: SeatActionLog;
  sandbox: boolean;
  /** Great-person ids recruited BY ANYONE, in claim order. Real Civ 6 great
   *  people are unique individuals, so the denial set is global. Each seat's
   *  own recruits are in `Seat.gpEarned`. */
  claimedGreatPeople: string[];
  unitsMode: boolean;
  units: Unit[];
  nextUnitId: number;
  rngState: number;
  disasters: boolean;
  fogOfWar: boolean;
  autoResearch?: boolean;
  eventLog: string[];
  cityStates: CityState[];
  barbSeat: Seat;
  claimedPantheons: string[];
  claimedBeliefs: string[];
  claimedEnhancers?: string[];
}

export interface Unit {
  id: number;
  type: string;
  /**
   * The SEAT that owns this unit; BARB_SEAT for a barbarian. Test it through
   * the predicates in core/seats.ts, never by comparing the number inline.
   */
  seat: number;
  tileIndex: number;
  movesLeft: number;
  /**
   * The movement pool this unit was GRANTED at its last refresh.
   *
   * Civ 6's rule: a unit that has spent any movement this turn does not start
   * healing until the next one. The heal and Fortify gates therefore ask
   * whether the unit spent any MP, which is `movesLeft >= movesFull`.
   *
   * The pool is not constant per unit type — the Great General/Admiral +1 MP
   * aura varies it per turn with the general's position — so the type's own
   * `moves` cannot stand in for it. Undefined until the first refresh, where
   * readers fall back to the type's full pool.
   */
  movesFull?: number;
  hp: number;
  charges: number | null;
  fortifyTurns?: number;
  /** XP: combat experience (civ units; barbs accrue none).
   * +5 per attack executed, +2 per attack survived as defender. XP_LEVELS
   * [15,45,90] grant +5 CS/level at every roll the unit fights. Civilians never
   * fight, so theirs stays 0. */
  xp?: number;
  path: number[] | null;
  mission?: 'explore' | null;
  /** A LAND unit currently on a water tile (embarked). Moves
   * at EMBARK_MOVES, cannot fortify/exert ZOC, and (N2) defends at a flat CS.
   * Naval units are never `embarked` — they belong on water natively. */
  embarked?: boolean;
}

export interface Seat {
  seat: number;
  /**
   * THIS SEAT'S CITIES — one field on one interface, so a rule that touches
   * a seat's cities cannot be written twice and drift.
   */
  cities: City[];
  nextCityId: number;
  warmonger: number;
  ww: Record<number, number>;
  wwTurn: Record<number, number>;
  diplomaticFavor: number;
  diplomaticPoints: number;
  influencePoints: number;
  envoysAvailable: number;

  treasury: number;
  scienceTotal: number;
  cultureTotal: number;
  faith: number;
  tourism: number;

  research: ResearchState;
  government: GovernmentState;
  religion: ReligionState;
  gpp: Partial<Record<GreatPersonClass, number>>;
  buildersTrained: number;
  /** CIV6: a Relic with no open slot is held until one opens, not lost. */
  relicReserve: number;
  bestMeleeCS: number;
  tilesPurchased: number;
  spaceProjects: string[];
  /** Light-years the Exoplanet craft has travelled; -1 = no craft in flight.
   *  The win fires on ARRIVAL (spaceLy >= SPACE_FLIGHT_LY), not on launch. */
  spaceLy?: number;
  /** Completed laser-station projects — each adds +1 LY/turn to the craft. */
  spaceLasers?: number;
  camps: number[];
  gpEarned: string[];
  eraScore?: number;
  age?: number;
  /** The Age this seat held in the PREVIOUS era — the substrate for a HEROIC
   *  age (Dark -> Golden), which the current age alone cannot detect. */
  prevAge?: number;
  dedications?: number;
  dedicationPicks?: number[];
  /** This seat's ORIGINAL capital tile. Static once founded; capture moves
   *  the owner, never the tile. */
  capitalTile?: number;
  /** THIS SEAT'S fog: per-tile explored flags (0/1), parallel to map.tiles.
   *  Empty = nothing hidden from it. One seat's scouting never lifts another's
   *  fog, so this is the seat's own knowledge, not the world's. */
  explored: number[];
  name: string;
  color: string;
  aggression: number;
  peaceTurns: number;
  /**
   * WAR. Every seat this one is fighting, as ABSOLUTE SEAT IDS — the single
   * storage, whatever the pair. Symmetric by construction: write it only
   * through `setWar`, ask it only through `civsAtWar`.
   *
   * The GPU's twin is one symmetric `war[b, i, j]` matrix over the same seat
   * space. Neither engine reads the other; the gate compares the `wars` digest
   * field — each seat's opponents as a SORTED list of absolute seat ids — so
   * what has to agree is the SET, not any packing of it.
   */
  wars: number[];
  formalWars: number[];
  /** Directed denouncement stamps keyed by absolute seat: `denounced[b] = t`
   *  means this seat denounced b at turn t. A persistent grudge, never reset. */
  denounced: Record<number, number>;
  /** Who this seat is ALLIED with, as absolute seat ids. Symmetric; broken by
   *  a denouncement or a war. Allies never declare war on each other. */
  allies: number[];
  tradeRoutes?: TradeRoute[];
}

/** One active trade route. Established by the route WIRE verb (spending a
 * free Trader); its virtual walker advances one descent step per turn and is
 * what plunder targets. Ends on a completed round trip after the era-scaled
 * minimum (the Trader returns), or to a plunder (the Trader dies with it). */
export interface TradeRoute {
  from: number;
  to?: number;
  toCs?: number;
  toSeat?: number;
  toSeatCity?: number;
  /** the round-trip MINIMUM end turn (createdTurn + tradeRouteMinDuration) */
  expiresTurn?: number;
  createdTurn?: number;
  /** the servicing Trader's CURRENT tile (walks 1 tile/turn) */
  walkTile?: number;
  /** -1 parked at origin (sea route), 0 walking out, 1 walking home */
  walkLeg?: number;
}

export interface ReligionState {
  pantheon: string | null;
  founded: boolean;
  name: string | null;
  follower: string | null;
  founder: string | null;
  worship: string | null;
  enhancer?: string | null;
  holyTile?: number | null;
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
  district?: DistrictId;
  /** For clearCamp: the camp tile that must be cleared. */
  campIndex?: number;
}

export interface CityState extends Seat {
  id: number;
  name: string;
  type: CityStateType;
  centerIndex: number;
  population: number;
  envoys: Record<number, number>;
  met: number[];
  hp?: number;
  lastLevyTurn?: number;
  /** The per-seat quest, keyed by ABSOLUTE SEAT. The kind is the first
   *  satisfiable option in a fixed order, no RNG. */
  seatQuest?: (CityStateQuest | null)[];
  seatQuestIssuedTurn?: number[];
}

