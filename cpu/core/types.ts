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
  /** Completed Terrestrial Laser Stations here: each draws LASER_POWER_LOAD
   *  and speeds the craft by 1 LY/turn only while this city is powered. */
  laserStations?: number;
  /** Is this city POWERED? Resolved once a turn by `resolveSeatPower`, which
   *  is also where a plant burns its fuel; every reader takes the flag. */
  powered?: boolean;
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
  /** The seat this city was FOUNDED as the capital of; -1 for every other
   * city. It does NOT move with the Palace — a relocated capital is a new
   * capital, not an original one — so `origCapitalSeat !== seat` is exactly
   * "somebody else is sitting in this seat's first city". */
  origCapitalSeat?: number;
  /** The seat that FOUNDED this city, whoever holds it now. What the
   *  grievance decay's occupation modifier asks about ("occupying a city or
   *  cities of the other party"), which the capital field alone cannot
   *  answer. */
  founderSeat?: number;
  /** CITIZEN ASSIGNMENT for the district SLOTS: how many citizens the player
   * has pinned into each district, by PLACEABLE_DISTRICTS index; -1 where the
   * automatic rule decides. `Tile.locked` is the same choice for plots. */
  specialistPref?: number[];
  focus: FocusId;
  queue: QueueItem[];
  isCapital: boolean;
  buildings: string[];
  districts: { type: DistrictId; tileIndex: number }[];
  wonders: { id: string; tileIndex: number }[];
  productionBank?: number;
  loyalty?: number;
  /** CIV6 (Neutralize Governor): turns this city's governor is "removed from
   *  duty" for. The seat's stateless greedy pick skips a city while it runs. */
  governorOutTurns?: number;
  /** CIV6 (Gain Sources): turns each SEAT's spies "operate at 2 levels higher"
   *  in this city, dense over seats. */
  spySources?: number[];
  outerHp?: number;
  /** the turn this city (or its Encampment) last took combat damage — what
   *  the repair project's three quiet turns are counted from. 0 = never. */
  lastHitTurn?: number;
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
  /** permanent per-city adders a Great Person left behind, by `GP_CITY_PERM`
   *  position. */
  gpPerm?: number[];
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
  /** [kind, city CENTRE tile] per faith purchase; kind 12 (a Valletta-class
   *  building) carries a third slot naming the building's prodLayout index. */
  buyFaith?: ([number, number] | [number, number, number])[];
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
  /** DECLARATION OF FRIENDSHIP: the seats this one offers friendship to.
   *  Symmetric and instant — the prerequisite an Alliance asks for. */
  friend?: number[];
  /** OPEN BORDERS: the seats this one GRANTS passage to. Directed. */
  borders?: number[];
  /** GREAT WORKS given away: [work kind, recipient seat] each. The kind
   *  indexes GW_KINDS. WHICH city gives and WHICH receives is not a decision —
   *  the works are counts, not identities, so both engines take the giver's
   *  first city holding one and the receiver's first with a free slot. */
  gift?: [number, number][];
  /** CITIZEN ASSIGNMENT for the district SLOTS: [centreTile, districtIndex,
   * count] — how many citizens this city pins into that district. A negative
   * count hands the slot back to the automatic rule. */
  specialists?: [number, number, number][];
  /** CITIZEN ASSIGNMENT for the PLOTS: the tiles whose citizen pin this seat
   * FLIPS this turn, in order. A flip is what the city screen's click does,
   * and both engines re-validate that the plot is this seat's ground. */
  lockTiles?: number[];
  /** The WORLD CONGRESS ballot, one entry per slate slot in slate order
   * (slot 2 is the always-3rd Diplomatic Victory resolution): the outcome
   * (0 = A, 1 = B), the target index, and how many EXTRA votes to buy up the
   * favor curve. A slot the record leaves out votes the AI line. */
  vote?: CongressVote;
}

/** One seat's ballot: [outcome, target, extraVotes] per slate slot, or null
 * for a slot this seat leaves to the AI line. */
export type CongressVote = ([number, number, number] | null)[];

export type SeatActionLog = Record<number, Record<number, SeatActionRecord>>;

/** One emergency's record; `cpu/core/emergency.ts` owns the phases. */
export interface Emergency {
  kind: number;
  target: number;
  city: number;
  phase: number;
  act: number;
  affected: number[];
  members: number[];
}

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
  /** Emergencies at any stage — pending, called, running. */
  emergencies?: Emergency[];
  /** The turn the Congress last sat, Regular or Special. A Special Session
   * needs SPECIAL_SESSION_GAP turns of quiet before it may be called. */
  lastSessionTurn?: number;
  warTurns?: Record<string, number>;
  /** GRIEVANCES, one SIGNED balance per unordered pair, keyed like
   *  `warTurns`. Positive means the LOWER seat is the victim. Written only
   *  through `addGrievance`, read only through `grievanceWith`. */
  grievances?: Record<string, number>;
  /** turns a pair's PEACE TREATY still binds, keyed like `warTurns`. */
  treatyTurns?: Record<string, number>;
  /** Turns a DECLARATION OF FRIENDSHIP still runs, keyed like `warTurns`
   *  (symmetric — one clock per unordered pair). */
  friendTurns?: Record<string, number>;
  /** Turns an ALLIANCE still runs, keyed like `warTurns`. The single storage:
   *  `seatsAllied` is this clock above zero. */
  allyTurns?: Record<string, number>;
  /** Turns an OPEN BORDERS grant still runs, keyed `${grantor}>${guest}`.
   *  DIRECTED, because granting is one-way: "Granting open borders to a rival
   *  doesn't mean that rival also grants open borders to you." */
  borderTurns?: Record<string, number>;
  /** the CLIMATE PHASE the world has reached, 0 = Phase I; absent or -1 =
   *  no climate change yet. Monotone: it never steps back. */
  climateIdx?: number;
  /** how many removable features (Woods, Rainforest, Marsh) the map carried
   *  at creation, and how many Ice tiles — the denominators the deforestation
   *  level and the polar melt are measured against. */
  removableAtStart?: number;
  iceAtStart?: number;
  map: GameMap;
  turn: number;
  seatActions?: SeatActionLog;
  sandbox: boolean;
  /** Great-person ids recruited BY ANYONE, in claim order. Real Civ 6 great
   *  people are unique individuals, so the denial set is global. Each seat's
   *  own recruits are in `Seat.gpEarned`. */
  claimedGreatPeople: string[];
  /** per GP class, the QUEUE POSITION the next recruit is offered from;
   *  it steps PAST anyone the world era has already left behind. */
  gpNext?: number[];
  unitsMode: boolean;
  units: Unit[];
  nextUnitId: number;
  rngState: number;
  disasters: boolean;
  fogOfWar: boolean;
  autoResearch?: boolean;
  eventLog: string[];
  cityStates: CityState[];
  /** The city-state ROSTER width — the id space, not the live count. Capture
   * removes an entry from `cityStates` and this stays put, so every id-keyed
   * column (the war head's minor half, the observation's minor block) keeps
   * its width for the whole game. The GPU's `S`. */
  cityStateMax?: number;
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
  /** SPY STATE. `spyMission` is SPY_IDLE, SPY_TRAVELLING or a `SPY_MISSIONS`
   *  index; `spyTurns` is the clock it is running; `spyTarget` the centre tile
   *  it is in transit to; `spyLevel` its rank, capped at Master Spy. */
  spyMission?: number;
  spyTurns?: number;
  spyTarget?: number;
  spyLevel?: number;
  fortifyTurns?: number;
  /**
   * XP banked TOWARD THE NEXT LEVEL — never cumulative. CIV6: "earning more
   * XP than needed to reach the next level will not transfer the excess XP to
   * the pool of the next level", and a unit standing at its threshold "won't
   * earn new XP until it finishes the level-up process". Barbarians accrue
   * none and civilians never fight, so theirs stays 0.
   */
  xp?: number;
  /** 1..MAX_LEVEL. A unit holds `level - 1` promotions. */
  level?: number;
  /** the summed PERCENTAGE experience modifier of the city that trained it —
   *  CIV6's Encampment and Harbor buildings — carried for life. */
  xpPct?: number;
  /** a bitmask over the rows of this unit's OWN class list (`promoRows`), so
   *  bit k is column k of the PROMOTE head on both engines. */
  promos?: number;
  /** the columns this unit is ALLOWED to take, when the offer is narrower than
   *  the list. CIV6 gives an Apostle "three promotions randomly chosen from
   *  the pool"; 0 means every legal column, which is every other unit. */
  promoOffer?: number;
  /** the ONCE-ONLY promotions this unit has already collected, by the same
   *  column bit `promos` uses. */
  promoUsed?: number;
  /** a GREAT PERSON unit's QUEUE POSITION in its class's roster — which
   *  person this chassis is carrying, and so which ability its charge spends.
   *  Undefined on every other unit. */
  gpAt?: number;
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
  ww: Record<number, number>;
  wwTurn: Record<number, number>;
  /** LIFETIME raw carbon this seat has discharged. May go negative: CIV6
   *  (Carbon Recapture) "allows the lifetime carbon emissions of a
   *  civilization to go below 0". */
  co2?: number;
  diplomaticFavor: number;
  diplomaticPoints: number;
  /** THIS TURN's World Congress ballot, as the record left it. Written inside
   * seatPhase and consumed by `worldCongress` at the turn tail, which clears
   * every seat's whether a session fires or not — an intent is for one turn. */
  congressVote?: CongressVote;
  /** WON EMERGENCIES, by the seat they were won against — a Military
   * Emergency's +5 healing in that seat's territory, one count per win. */
  emgHeal?: number[];
  /** SURVIVED Military Emergencies, by member seat — +2 CS on a City Strike
   * against that seat's units. */
  emgStrike?: number[];
  /** won City-State Emergencies: +1 Gold/turn per envoy each. */
  emgEnvoyGold?: number;
  /** survived City-State Emergencies: +2 Gold on this seat's minor legs each. */
  emgRouteGold?: number;
  /** GREAT PEOPLE this seat has recruited AND SPENT — the ids whose charge
   *  actually fired, which is what a founded religion counts, not the claim. */
  gpActivated?: string[];
  /** INVENTED LUXURIES a Great Merchant made, each entry the number of cities
   *  that copy serves the way a worked luxury resource does. */
  gpLuxuries?: number[];
  /** permanent per-seat adders a Great Person left behind, by `GP_PERM`
   *  position. */
  gpPerm?: number[];
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
  /** Completed LAGRANGE stations — each adds +1 LY/turn unconditionally. The
   *  terrestrial ones are counted per city (`City.laserStations`). */
  orbitalLasers?: number;
  /** GS strategic stockpiles, dense over `STRATEGIC_IDS`. */
  stockpile?: number[];
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
   *  means this seat denounced b at turn t. The stamp IS the clock: the
   *  denouncement is live while `turn - t` is under AGREEMENT_TURNS, and the
   *  Formal-War casus belli opens FORMAL_WAR_MIN_TURNS in. `denounceActive`
   *  and `denounceCasusBelli` are the two readings. */
  denounced: Record<number, number>;
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
  /** CIV6 (Inquisitor): "You can only create Inquisitors if you have founded a
   *  religion and had an Apostle use the Launch Inquisition ability within
   *  your territory." Latched once, never cleared. */
  inquisition?: boolean;
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

