/** Shared type definitions for the ENGINE half. The map half (YIELD_KEYS,
 * Tile, GameMap, the terrain/feature/resource id unions, NO_SEAT,
 * CITY_MIN_DIST) lives in world/types.ts — the engine-free module the seeder
 * shares — and is re-exported here so engine-internal imports stay stable. */
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
  /** The turn this city was founded. */
  foundedTurn: number;
  /** City HP. */
  hp: number;
  id: number;
  name: string;
  /**
   * The SEAT that owns this city. Required, so a city with no owner is a type
   * error rather than defaulting to somebody. City ids run per seat.
   */
  seat: number;
  centerIndex: number;
  population: number;
  /** Accumulated food toward next citizen. */
  foodBox: number;
  /** Accumulated culture toward the next border expansion. */
  cultureBox: number;
  /** Tiles gained beyond the initial ring (drives expansion cost). */
  tilesAcquired: number;
  /** Tile indexes this city's owner forced to be worked. */
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
   * Loyalty 0–100 (only moves while other civs exist; capitals immune).
   * A city at 0 flips to the seat pressuring it hardest. Absent = 100.
   */
  loyalty?: number;
  /**
   * outer-defense HP from ANCIENT_WALLS (max WALLS_HP = 100).
   * Set to full when the walls complete; damage depletes it before city HP;
   * heals with the city. Absent = 0 (no walls). Capture keeps ANCIENT_WALLS
   * but empties the pool, so the captor starts at 0 and heals up.
   */
  outerHp?: number;
  /**
   * Religious pressure. `religionPressure[g]` is the integer
   * pressure this city has accumulated from religion g (religion g belongs to
   * seat g): +1 each turn that religion's holy city is within
   * RELIGION_PRESSURE_RANGE tiles.
   *
   * `followedReligion` is the religion id holding the most pressure (>0), ties
   * broken toward the lowest id — a founding-order proxy, since earlier
   * founders accrue longer. Null = follows nobody. Deterministic, zero-RNG.
   *
   * INERT: computed and serialized, not yet read by the yield pipeline.
   * Founded and flipped cities start unset, i.e. under no pressure.
   */
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
  /** RELICS held in this city's TEMPLE slot (cap 1). Each pays
   *  +4 faith and +8 tourism — the densest tourism source in real Civ 6. */
  relics?: number;
  /** ARTIFACTS excavated from Antiquity Sites, held in this city's
   *  ARCHAEOLOGICAL MUSEUM (3 slots). +3 Culture and +3 Tourism each. */
  artifacts?: number;
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

/** One driven seat's decisions for one turn, in the mask layouts. */
export interface SeatActionRecord {
  /** [centerTile, maskColumn] pairs. The city axis is keyed by CENTER TILE
   * because slot order and founding order diverge under compaction and
   * capture. A missing center = that engine has no such city. */
  production: [number, number][];
  /** Warhead column: 0 declares on seat 0, R sues for peace. Null or absent
   * = no war action this turn. */
  war?: number | null;
  /** This turn's envoy assignments (city-state indices, in pick order). */
  envoys?: number[];
  /** tech / civic mask column; null or -1 = no pick. */
  tech: number | null;
  civic: number | null;
  /** One entry per unit STEP this turn — a unit may act more than once. */
  units: number[][];
  /** The GOLD purchase — ONE per seat per turn. [kind, a, b]:
   * kind 0 building [0, centreTile, buildingIdx], 1 settler [1, -1, -1],
   * 2 military unit [2, -1, -1], 3 tile [3, tileIndex, centreTile] (#104).
   * Cities are keyed by CENTRE, like production. Absent = no purchase. */
  buy?: [number, number, number] | null;
  /** The FAITH purchases (#104) — faith is its own currency, so these ride
   * beside the gold buy. [kind, centreTile] entries in apply order: kind 4
   * worship building, 5 missionary, 6 apostle. The engine enforces ONE
   * religious unit per seat per turn regardless of what is asked. */
  buyFaith?: [number, number][];
  /** The city-state LEVY (#104): the CS index to levy, or null/absent.
   * Gold, but NOT the one-gold-purchase slot — a levy is a diplomacy
   * action and rides beside `buy`, like real Civ 6. */
  levy?: number | null;
  /** #107 GEOPOLITICS — targets are CIV indices, 0-based (seat = index+1),
   * the same index space as the observation's civ block. `denounce`:
   * grudge stamps this turn. `ally` / `rrPeace` name a PAIR and ride the
   * LOWER civ index's record (the applying arm writes both sides).
   * `rrWar`: the one civ↔civ declaration. Every arm re-validates its
   * rules; the choosing thresholds are the driver's policy. */
  denounce?: number[];
  ally?: number[];
  rrWar?: number | null;
  rrPeace?: number[];
}

/** turn -> SEAT id -> that seat's record. Seat 0 is a key like any other. */
export type SeatActionLog = Record<number, Record<number, SeatActionRecord>>;

export interface GameState {
  /** Every actor's own state, indexed by seat. */
  seats: Seat[];
  /** true once TURN_LIMIT turns are played (or a victory fires). */
  gameOver?: boolean;
  /** 0 none, 1 score (TURN_LIMIT), 2 domination (all capitals), 3 science
   *  (space race), 4 science-defeat (another civ launched first). */
  victoryType?: number;
  /** Have roads reached the CLASSICAL tier (bridges)? Latched true at the
   *  first era boundary; a road-to-road step then pays no river charge. */
  roadBridges?: boolean;
  /** World Congress sessions held so far. */
  congressSessions?: number;
  map: GameMap;
  turn: number;
  /** Recorded decisions. A seat listed here does not decide: its codes are
   * applied instead of running the ladder. The codes are the shared MASK
   * layouts, so one log drives either engine. */
  seatActions?: SeatActionLog;
  /** Sandbox: districts/buildings complete instantly, cost nothing, and ignore tech gating. */
  sandbox: boolean;
  /** Great-person ids recruited BY ANYONE, in claim order. Real Civ 6 great
   *  people are unique individuals, so the denial set is global. Each seat's
   *  own recruits are in `Seat.gpEarned`. */
  claimedGreatPeople: string[];
  tradeRoutes: TradeRoute[];
  /**
   * Units mode: improvements/chops need real builders, units exist on the
   * map. Off = classic calculator behavior (free instant improvements).
   */
  unitsMode: boolean;
  units: Unit[];
  nextUnitId: number;
  /** Seeded RNG state for all in-game randomness (serialized => replayable). */
  rngState: number;
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
  /** Recent gameplay events (goody rewards etc.), newest last. */
  eventLog: string[];
  /** Independent city-states on the map ([] = none / feature off). */
  cityStates: CityState[];
  /**
   * The BARBARIANS' seat — the `hostile` class, one object so that
   * `seatOf(state, BARB_SEAT)` answers like every other seat. Its civ-level
   * state is zero and stays zero (barbarians bank nothing, research nothing);
   * what it is FOR is that generic seat code has something to read.
   */
  barbSeat: Seat;
  /** Pantheon beliefs already claimed (unavailable to anyone else). */
  claimedPantheons: string[];
  /** Follower/founder beliefs already claimed. */
  claimedBeliefs: string[];
  /** Enhancer beliefs already claimed. */
  claimedEnhancers?: string[];
}

export interface Unit {
  id: number;
  /** Unit type id from data/units. */
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
  /** Builder charges; null for non-builders. */
  charges: number | null;
  /** FORTIFY (military units only): consecutive turns ended without a
   * move or attack, capped at 2. +3 CS defending at >=1, +6 at >=2. */
  fortifyTurns?: number;
  /** XP: combat experience (civ units; barbs accrue none).
   * +5 per attack executed, +2 per attack survived as defender. XP_LEVELS
   * [15,45,90] grant +5 CS/level at every roll the unit fights. Civilians never
   * fight, so theirs stays 0. */
  xp?: number;
  /** Remaining multi-turn movement path (tile indexes), or null. */
  path: number[] | null;
  /** Standing order ('explore' keeps picking new frontier targets). */
  mission?: 'explore' | null;
  /** A LAND unit currently on a water tile (embarked). Moves
   * at EMBARK_MOVES, cannot fortify/exert ZOC, and (N2) defends at a flat CS.
   * Naval units are never `embarked` — they belong on water natively. */
  embarked?: boolean;
}

/**
 * A SEAT — one actor's own state. Code that reads a seat must not be able to
 * tell WHICH seat it has; that is the whole point of the shape.
 *
 * Fields are REQUIRED wherever possible: `x?: number` plus `?? 0` at the read
 * site is what silently swallows a dropped field.
 */
export interface Seat {
  /** This seat's id in the absolute space defined in core/seats.ts. */
  seat: number;
  /**
   * THIS SEAT'S CITIES — one field on one interface, so a rule that touches
   * a seat's cities cannot be written twice and drift.
   */
  cities: City[];
  /** Next city id for THIS seat. */
  nextCityId: number;
  /** Grievances others hold against this seat. */
  warmonger: number;
  /**
   * War weariness points, PER WAR, keyed by the OPPONENT's absolute seat.
   * Every rule that touches it is per-war: a battle scores against one enemy,
   * `-50` decays a war in which nobody fought, and `-2000` comes off when a
   * peace treaty is signed with ONE civ. The amenity penalty reads the HIGHEST
   * entry, never the sum: simultaneous wars score separately and only the
   * worst is felt.
   *
   * Absent key = 0. Integer-like keys, so JS iterates them in ascending
   * numeric order on every engine — the serialization is deterministic.
   */
  ww: Record<number, number>;
  /** Turn of the last battle against that opponent (`ww`'s key space), so the
   *  end-of-turn decay can tell a war being fought from a phoney one. */
  wwTurn: Record<number, number>;
  /** Cumulative diplomatic favor. */
  diplomaticFavor: number;
  /** Diplomatic victory points. */
  diplomaticPoints: number;
  /** Influence accrued toward the next envoy. */
  influencePoints: number;
  /** Envoys banked and not yet assigned. */
  envoysAvailable: number;

  // --- economy -----------------------------------------------------------
  // One name per quantity. Storage is symmetric across seats even where a
  // mechanic does not yet accrue for all of them (those gaps live in
  // docs/AUDIT.md rather than being papered over here).
  /** Gold in the bank. */
  treasury: number;
  /** Lifetime science. */
  scienceTotal: number;
  /** Lifetime culture. */
  cultureTotal: number;
  /** Faith banked. */
  faith: number;
  /** Cumulative tourism. */
  tourism: number;

  /** Tech + civic progress. */
  research: ResearchState;
  /** Adopted government + filled policy slots. Every seat STORES one; seats
   *  above 0 still DERIVE theirs per read via `computeAdoption`, so their
   *  stored copy is inert until that derivation is replaced by a direct set. */
  government: GovernmentState;
  /** Pantheon / religion / beliefs. A claimed id is its own "claimed" flag. */
  religion: ReligionState;
  /** Great-person points per class. */
  gpp: Partial<Record<GreatPersonClass, number>>;
  /** Builders ever trained — this seat's OWN cost escalator. */
  buildersTrained: number;
  /** Strongest melee combat strength this seat ever FIELDED — the
   *  floor its city defense keeps pace with. */
  bestMeleeCS: number;
  /** Tiles bought with gold. */
  tilesPurchased: number;
  /** Completed space-race project ids. */
  spaceProjects: string[];
  /**
   * Tile indices of the CAMPS this seat holds. Empty for every class but the
   * barbarians — an answer, not a gap, so no capability bit guards it.
   *
   * A camp is a TILE INDEX, not a city: no population, queue or borders.
   */
  camps: number[];
  /** Great-person ids THIS seat recruited. `prophetsOf` derives the prophet
   *  count from it. */
  gpEarned: string[];
  /** Per-era "historic moment" score. Resets at every ERA_LENGTH boundary. */
  eraScore?: number;
  /** This seat's Age for the current era: 0 Dark, 1 Normal, 2 Golden. */
  age?: number;
  /** The Age this seat held in the PREVIOUS era — the substrate for a HEROIC
   *  age (Dark -> Golden), which the current age alone cannot detect. */
  prevAge?: number;
  /** How many dedications this seat committed this era: 1 normally,
   *  HEROIC_DEDICATIONS on a Heroic age. */
  dedications?: number;
  /** The NAMED dedications, as catalog indices — `dedications` of them. */
  dedicationPicks?: number[];
  /** This seat's ORIGINAL capital tile. Static once founded; capture moves
   *  the owner, never the tile. */
  capitalTile?: number;
  /** THIS SEAT'S fog: per-tile explored flags (0/1), parallel to map.tiles.
   *  Empty = nothing hidden from it. One seat's scouting never lifts another's
   *  fog, so this is the seat's own knowledge, not the world's. */
  explored: number[];
  /** This seat's civ name. */
  name: string;
  /** Display color. */
  color: string;
  /** 0..1 — settling pace and war likelihood. */
  aggression: number;
  warTurns: number;
  peaceTurns: number;
  /**
   * WAR. Every seat this one is fighting, as ABSOLUTE SEAT IDS — the single
   * storage, whatever the pair. Symmetric by construction: write it only
   * through `setWar`, ask it only through `civsAtWar`.
   *
   * The GPU's twin is one symmetric `war[b, i, j]` matrix over its own compact
   * seat index. Neither engine reads the other; both flatten their storage
   * into the `rrWarMask` trace column (bit i = the i-th civ above seat 0) and
   * the gate compares those numbers, so the BIT ORDER is what has to agree.
   */
  wars: number[];
  /** Of those wars, the ones that are FORMAL — a denouncement at least
   *  FORMAL_WAR_MIN_TURNS earlier. Absolute seat ids; anything at war and not
   *  listed here is a SURPRISE war. Cleared when the pair makes peace. */
  formalWars: number[];
  /** Directed denouncement stamps keyed by absolute seat: `denounced[b] = t`
   *  means this seat denounced b at turn t. A persistent grudge, never reset. */
  denounced: Record<number, number>;
  /** Who this seat is ALLIED with, as absolute seat ids. Symmetric; broken by
   *  a denouncement or a war. Allies never declare war on each other. */
  allies: number[];
  /** This seat's trade routes. `from` is always one of its own city ids;
   *  domestic routes set `to` (own city id), routes to a met city-state set
   *  `toCs`, and international routes set `toSeatCity` (a city id in the
   *  destination seat). `expiresTurn` is start + TRADE_ROUTE_DURATION. */
  tradeRoutes?: { from: number; to?: number; toCs?: number; toSeat?: number; toSeatCity?: number; expiresTurn?: number }[];
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
  /** Enhancer belief id, added by enhancing a founded religion (needs a
   * second Great Prophet). Stored but INERT: nothing reads the effects yet. */
  enhancer?: string | null;
  /** The HOLY tile: the founding city's center tile, frozen at founding, and
   * the source this religion's pressure spreads from. -1/null = not founded. */
  holyTile?: number | null;
}

export interface TradeRoute {
  /** Origin city id (receives the yields). */
  from: number;
  /** Destination city id (-1 when the destination is a city-state). */
  to: number;
  /** Destination city-state id, if this is a city-state route. */
  toCs?: number;
  /** International: destination SEAT, paired with `toSeatCity`. */
  toSeat?: number;
  /** International: destination city id within `toSeat`. */
  toSeatCity?: number;
  /** duration: the turn this route expires (start + TRADE_ROUTE_DURATION).
   *  At expiry the route is removed and the owner re-picks next turn. */
  expiresTurn?: number;
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

/**
 * A city-state is a SEAT — the `minor` class. It carries the same
 * civ-level state every seat does, at zero, because `seatOf` can only be total
 * if an object of the right type exists for every id in the seat space. The
 * zeros are the RULE, not padding. A minor needs no `research`/`trade`/`found`
 * capability bit: its empty data already says it never researches, trades or
 * settles.
 */
export interface CityState extends Seat {
  id: number;
  name: string;
  type: CityStateType;
  centerIndex: number;
  population: number;
  /** Envoys assigned here, keyed by ABSOLUTE SEAT — the one store, whatever
   *  the seat. Missing key = 0. Read it through `envoysOf`, write it through
   *  `addEnvoys`; the suzerain contest compares every entry against itself. */
  envoys: Record<number, number>;
  /** The seats that have MET this city-state — one store, whatever the seat.
   *  Contact is a precondition for envoys, trade and quests. */
  met: number[];
  quest: CityStateQuest | null;
  /** Turn the current quest was issued (for reissue pacing). */
  questIssuedTurn: number;
  /** Turns elapsed since seat 0 declared on this city-state; gates when
   *  peace may be offered. */
  csWarTurns?: number;
  /** Siege hit points; absent = full (CS_MAX_HP). */
  hp?: number;
  /** Turn of seat 0's last militaristic levy here (cooldown). */
  lastLevyTurn?: number;
  /** The per-seat quest, indexed by civ index. The kind is the first
   *  satisfiable option in a fixed order, no RNG. */
  seatQuest?: (CityStateQuest | null)[];
  /** Turn each seat's quest was last issued or cleared — the reissue
   *  cooldown clock, mirroring `questIssuedTurn`. */
  seatQuestIssuedTurn?: number[];
}

