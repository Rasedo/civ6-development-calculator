export * from '../../world/types';
import type { ResearchEntry } from './aiResearch';
import type { CivicEntry } from './aiCivics';
import type { CityAi } from './aiCityTrees';
import type { OpsAi } from './operations/manager';
import type { EconomicMemory } from './aiEconomic';
import type { CityGrowth } from './aiCityBuild';
import type { GreatWork } from '../data/greatWorks';
import type { QuestType } from '../data/quests';
import type { BarbTag } from '../data/barbarians';
import type { DistrictId, GameMap, YieldKey } from '../../world/types';

export type FocusId = 'balanced' | YieldKey;

/** a district project's converted yield (`City.projectYield`) */
export interface ProjectYield {
  key: YieldKey;
  amount: number;
}

/** CIV6 (Pillaging): what a wrecked improvement or district pays its
 *  pillager. HEAL is a flat HP lump; every other kind is a yield lump that
 *  scales with game progress (`progressScale`). */
export type PlunderKind = 'heal' | 'gold' | 'faith' | 'science' | 'culture';
export interface PlunderRow { kind: PlunderKind; amount: number }

export type QueueItem =
  | { kind: 'district'; district: DistrictId; tileIndex: number; progress: number; cost?: number }
  | { kind: 'building'; building: string; progress: number }
  | { kind: 'wonder'; wonder: string; tileIndex: number; progress: number }
  | { kind: 'settler'; progress: number; cost: number }
  | { kind: 'unit'; unit: string; progress: number; cost?: number; formation?: number }
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

/**
 * One appointed GOVERNOR. `cityId` is the city they sit in and `minorId` the
 * city-state (Amani alone), -1 for neither; `establishTurns` counts down to
 * the turn their ABILITIES start paying, while the loyalty channel runs from
 * the moment they are seated; `outTurns` is the neutralize clock, which
 * follows the PERSON and not the city.
 */
export interface Governor {
  appointed: boolean;
  cityId: number;
  minorId: number;
  establishTurns: number;
  outTurns: number;
  /** bitmask over the GOVERNOR_PROMOTIONS catalog. */
  promotions: number;
}

export interface City {
  /** Completed Terrestrial Laser Stations here: each draws LASER_POWER_LOAD
   *  and speeds the craft by 1 LY/turn only while this city is powered. */
  laserStations?: number;
  /** CIV6 (Nuclear accident): the reactor's AGE — "the number of turns that
   *  have passed since the Power Plant was first constructed, converted to,
   *  or last recommissioned". Absent until this city holds a plant. */
  reactorAge?: number;
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
  /** the tiles this city's last yield walk chose to work, in the walk's
   *  own order. The pick EXPOSED — nothing reads it back into the walk. */
  workedTiles?: number[];
  /** the AMENITY TIER this city's recorded walk read ran on, as its wire index.
   *  Derived, like `workedTiles` — kept because it MULTIPLIES every yield the
   *  city pays, so a disagreement about it is invisible until it shows up as
   *  a fraction of a food box. Read it through the census, never inline. */
  amenityTier?: number;
  /** the National Park amenities its owner's last turn processing counted
   *  (`refreshParkAmenities`): a park designated since pays from the owner's
   *  next processing; absent before the city's first. */
  parkAmenities?: number;
  cultureBox: number;
  tilesAcquired: number;
  /** CIV6 (City_Culture): the plot this city's culture claims next — drawn
   *  at the end of every border turn (`drawBorderPlot`); absent or -1 before
   *  its first, or with nothing in reach. */
  nextPlot?: number;
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
  /** The seat a FREE CITY revolted from: its centre stands on that seat's
   *  base (`holderStrength`). -1 on every other city. */
  formerSeat?: number;
  /** CITIZEN ASSIGNMENT for the district SLOTS: how many citizens the player
   * has pinned into each district, by PLACEABLE_DISTRICTS index; -1 where the
   * automatic rule decides. `Tile.locked` is the same choice for plots. */
  specialistPref?: number[];
  /** CITIZEN ASSIGNMENT, the third choice: citizens the player leaves on
   *  neither a plot nor a slot. The walk works population less specialists
   *  less these, and each pays its Gold (`UNASSIGNED_CITIZEN_GOLD`). */
  idleCitizens?: number;
  focus: FocusId;
  queue: QueueItem[];
  isCapital: boolean;
  buildings: string[];
  /** the members of `buildings` standing PILLAGED — dark until repaired.
   *  CIV6 (Sabotage Production): "Pillage all buildings in the industrial
   *  zone"; a pillaged building is repaired from the city's own queue at
   *  PILLAGE_BUILDING_REPAIR_PERCENT of its cost. ONE reader:
   *  `buildingPillaged`. Absent = none. */
  pillagedBuildings?: string[];
  /** the game era each member of `buildings` that carries `yieldsPerEra`
   *  was constructed or last repaired in (`stampBuildingEra`), by building
   *  id. It rides the city through a capture or a flip. Absent = none. */
  buildingEras?: Record<string, number>;
  districts: { type: DistrictId; tileIndex: number }[];
  wonders: { id: string; tileIndex: number }[];
  productionBank?: number;
  /** CIV6 (Project_YieldConversions; City_BuildQueue 0x184ae0): the yield
   *  the city's last production step converted from the Production it put
   *  into a district project — PercentOfProductionRate of that Production
   *  (with the bank paid in, never above the project's cost). The step
   *  clears it first (0x177d10), and the city's yields read it, under their
   *  percent, until the next step. Absent = none. */
  projectYield?: ProjectYield;
  loyalty?: number;
  /** A FREE CITY's threat (CityBuildAI +0x1b8, `cityThreat` on the Free
   *  Cities' knowledge base) as its city AI's last update left it, -1 none;
   *  absent, none */
  aiThreat?: number;
  /** A FREE CITY's enemy at the gates (CityBuildAI +0x218) as its city AI's
   *  last update left it (`cityThreat`); absent, none */
  aiThreatNear?: boolean;
  /** A FREE CITY's raid (its manager record +0x20 / +0x24, `freeRaidSignal`):
   *  the player it raids once in its life, and the id of the Free Cities
   *  Raid running for it, -1 once that operation is gone; absent, none */
  freeRaid?: { player: number; op: number };
  /** A FREE CITY's race: the loyalty pressure each major seat has exerted on
   *  it "since the Free City became independent", dense over seats. CIV6:
   *  at 0 loyalty "it will join the Civilization that has exerted the most
   *  Loyalty pressure on it since the Free City became independent". Held
   *  only while the city is Free. */
  freePressure?: number[];
  /** A FREE CITY's count of turns toward its next grant (`freeCityGrant`). */
  freeGrantTurns?: number;
  /** A FREE CITY's allowed units (`freeCityAllowed`, its record's, made at
   *  the revolt): the chassis its grants are drawn from. */
  freeAllowed?: string[];
  /** CIV6 (Gain Sources): turns each SEAT's spies "operate at 2 levels higher"
   *  in this city, dense over seats. */
  spySources?: number[];
  outerHp?: number;
  /** the turn this city (or its Encampment) last took combat damage — what
   *  the repair project's three quiet turns are counted from. 0 = never. */
  lastHitTurn?: number;
  /** the turn a Builder last paid its charges into this city's District
   *  Project — the Royal Society's clause allows one such payment per city
   *  per turn. 0 = never. */
  projectBoostTurn?: number;
  religionPressure?: number[];
  followedReligion?: number | null;
  /** the UNCONVERTED group's pressure: RELIGION_SPREAD_ATHEISM_PRESSURE_PER_POP
   *  per citizen at founding, then an accumulator that grows only when the city
   *  grows following no religion (`gainPopulationPressure`) and never shrinks
   *  with the city. */
  unconvertedPressure?: number;
  /** the residue the city's growth accumulator keeps, in 256ths (0 when
   *  absent): a growth percent p attaches as floor(p·256/100) and detaches as
   *  floor(−p·256/100), so each detach of a percent that is no whole number
   *  of 256ths leaves −1 (`growthDetachResidue`). */
  growthDrift?: number;
  /** the Great Works held here, one per occupied layout slot (`GW_LAYOUT`):
   *  object type, maker, era and civilization. Carried on capture.
   *  Yield-bearing, so the GPU mirror bumps _eff_version on every write. */
  greatWorks?: GreatWork[];
  /** permanent per-city adders a Great Person left behind, by `GP_CITY_PERM`
   *  position. */
  gpPerm?: number[];
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
  /** a minor's catch-up (`minorCatchUp`): per row it lacks, how many majors
   *  held it at its last turn */
  techCatchUp?: Record<string, number>;
  civicCatchUp?: Record<string, number>;
  /** CIV6 (m_xResearchOverflow / m_xCulturalOverflow): the pool a completion
   *  left with nothing current, set aside when the next item is picked and
   *  paid in with the next turn's Science / Culture (runs/h1_duelw1116 China
   *  t6→t8: Pottery done at 13 of 12, Mining reads 0 then 4 at +3) */
  techOverflow?: number;
  civicOverflow?: number;
  /** the research AI's GOAL (`aiResearch.ts`): the technology its research
   *  leads to; absent or null, none */
  goal?: string | null;
  /** the research AI's analysis of its last turn, which a completion's
   *  choice reads (`researchCompletionChoice`); absent before its first */
  aiEntries?: ResearchEntry[];
  /** the civics AI's analysis of its last turn, which a completion's choice
   *  reads (`civicChoice`); absent before its first */
  civicAiEntries?: CivicEntry[];
  /** the civics AI's government values (+0xb38, raw, by GOVERNMENT_ type),
   *  written by its turn (0x620110) after the propagation and read by the
   *  next turn's analysis (`civicAnalysis`); absent before its first */
  civicGovValues?: Record<string, number>;
  /** the civics AI's best card per civic (0x623b90, raw, by CIVIC_ type,
   *  those above 0), written with `civicGovValues` and read by the next
   *  turn's civic value (`civicValue`); absent before its first */
  civicPolicyBest?: Record<string, number>;
  /** the research AI's turns left on its research as its last choice set
   *  them (research AI +0x528: its turn 0x760980 and a completion's choice
   *  0x762d60 write it), and the value its city build analysis of this turn
   *  reads — the one before this turn's choice (`aiCityBuild.ts`) */
  aiLeft?: number;
  aiLeftSeen?: number;
}

export interface GovernmentState {
  /** the government the seat's record chose (`adoptGovernment`); null until
   *  one does, and the seat is in the newest its civics unlock
   *  (`seatGovernment`) */
  chosen: string | null;
  policies: (string | null)[];
  /** CIV6 (Legacy policy card): a government's legacy card is "unlocked by"
   *  that government, so the seat must remember every government it has been
   *  in. A bitmask over `GOVERNMENT_LIST` positions — the roster is a fixed
   *  catalog both engines derive from one export. */
  held: number;
  /** the turn the seat last completed a civic. The next turn's record may
   *  change the government and the cards for free (the UI's
   *  `CivicCompletedThisTurn`); any other turn pays `policyUnlockCost`. */
  civicTurn: number;
  /** ANARCHY: the first turn `chosen` takes office after a return to a
   *  government the seat held before; the seat is in no government while
   *  the turn is below it (`seatGovernment`) */
  anarchyEnd: number;
  /** CIV6 (PlayerCulture, dll_readings "the slot rebuild"): the slotted cards
   *  whose modifiers are not attached. A slot rebuild (a government change)
   *  detaches every card and lays the old cards back into the new slots
   *  without attaching them; a card pays again only once it is slotted anew.
   *  A subset of `policies`; `civ_policy_lapsed` is the twin. */
  lapsed: string[];
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
  /** the KIND the war column declares under — a `WAR_KINDS` code, a driver
   *  decision validated by `warKindAllowed` on both engines; absent on a
   *  declare column = `defaultWarKind` (the cheapest casus belli the seat
   *  holds), meaningless on a sue or a minor's column */
  warKind?: number | null;
  envoys?: number[];
  tech: number | null;
  civic: number | null;
  /** the SLOT LAYOUT — which card in which slot, a driver decision: per slot
   *  of the seat's government (wonder extras included), grouped by kind in
   *  SLOT_KINDS order and within a kind in the slots' order
   *  (`policyWireOrder`), the card's table index (POLICY_LIST order) or -1
   *  for an empty slot; absent = no decision this turn */
  policies?: number[];
  units: number[][];
  /** the ONE gold purchase: [kind, a, b]. Kind 0 building (a=centre,
   *  b=layout idx), 1 settler, 2 unit, 3 tile (a=tile, b=centre),
   *  4 Great Person patronage (a=class index), 5 DISTRICT (a=SITE tile,
   *  b=scaffold idx — the site names the city, as kind 3's does, and the
   *  governor holding Contractor is the permission). */
  buy?: [number, number, number] | null;
  /** [kind, city CENTRE tile] per faith purchase; kind 12 (a Valletta-class
   *  building) carries a third slot naming the building's prodLayout index;
   *  kind 15 (patronage) carries the GP class there and no city; kind 17 is a
   *  DISTRICT bought with faith — [17, SITE tile, scaffold idx], the Divine
   *  Architect twin of gold's kind 5. The two lists number independently:
   *  faith's 16 is the Rock Band, gold's 5 is this district. */
  buyFaith?: ([number, number] | [number, number, number])[];
  /** The city-state LEVY: the CS index to levy, or null/absent.
   * Gold, but NOT the one-gold-purchase slot — a levy is a diplomacy
   * action and rides beside `buy`, like real Civ 6. */
  levy?: number | null;
  /** the route verb: [origin CENTRE tile, dest code] — dest is a CENTRE
   * tile (an own or another major's city) or -(2+csIndex) for a city-state.
   * Establishing spends a free Trader; both engines only re-validate. */
  route?: [number, number] | null;
  /** THE MISSILE SILO'S LAUNCH: [device row, target tile]. The silo is an
   * improvement, not a unit, so its blow is the SEAT's order and rides here
   * beside the levy; a device thrown by a bomber or a submarine is that
   * unit's own column instead. Both engines re-validate the named pair. */
  nuke?: [number, number] | null;
  denounce?: number[];
  /** THE DEAL PUT ON THE TABLE this turn: [the other seat, what this seat
   *  GIVES, what it ASKS]. An offer alone moves nothing — the other seat's
   *  `accept` is the "Accept Deal" button, and both engines re-validate every
   *  item then. A mission, a friendship, an alliance and open borders are
   *  items of it (`DEAL_ITEM_KINDS`): proposals the other seat answers. */
  offer?: [number, DealItem[], DealItem[]];
  /** THE SEATS whose standing offer this one accepts. */
  accept?: number[];
  /** GREAT WORKS given away: [work kind, recipient seat] each. The kind
   *  indexes GW_KINDS. WHICH city gives and WHICH receives is not a decision —
   *  the works are counts, not identities, so both engines take the giver's
   *  first city holding one and the receiver's first with a free slot. */
  gift?: [number, number][];
  /** PROMISES ASKED: [promiser seat, promise kind] each. The asker pays the
   *  kind's favor; an ask the promiser does not `keepPromise` this turn is
   *  refused. */
  askPromise?: [number, number][];
  /** PROMISES MADE: [asker seat, promise kind] each — this seat answers an ask
   *  standing this turn with its promise. */
  keepPromise?: [number, number][];
  /** CITIZEN ASSIGNMENT for the district SLOTS: [centreTile, districtIndex,
   * count] — how many citizens this city pins into that district. A negative
   * count hands the slot back to the automatic rule. */
  specialists?: [number, number, number][];
  /** CITIZEN ASSIGNMENT for the PLOTS: the tiles whose citizen pin this seat
   * FLIPS this turn, in order. A flip is what the city screen's click does,
   * and both engines re-validate that the plot is this seat's ground. */
  lockTiles?: number[];
  /** The TILE SWAP: [claiming city's centreTile, tile] each, in order — the
   * plot moves from one of this seat's cities to the claiming one. Both
   * engines re-validate every swap (`swapTileOk`) as it lands. */
  swapTiles?: [number, number][];
  /** The SPECIAL SESSION ballot: [outcome (0 = join, 1 = refuse), EXTRA
   * votes to buy at the vote price]. Left out, the seat joins every
   * emergency it is not the target of, buying none. */
  vote?: CongressVote;
  /** the Great Person class this seat PASSES on this turn (-1/absent none) */
  gpPass?: number;
  /** THE GOVERNOR VERBS, applied in order after the seat's governor clocks:
   *  [verb, governor roster index, argument] each — `GOV_APPOINT` (argument
   *  0), `GOV_PROMOTE` (a GOVERNOR_PROMOTIONS index), `GOV_ASSIGN_CITY` (the
   *  city's CENTRE tile), `GOV_ASSIGN_MINOR` (a city-state roster index). At
   *  most GOV_ACTIONS_MAX; both engines re-validate each (`applyGovernorActions`). */
  governors?: [number, number, number][];
  /** the PANTHEON this seat founds this turn, a `PANTHEONS` row (data
   *  order); absent = none. Paid from its Faith where it banks the turn's. */
  pantheon?: number | null;
  /** the RELIGION this seat founds, a `RELIGION_TYPES` row — the founding's
   *  choice beside its `beliefs`; a founding names one no seat has founded */
  religion?: number | null;
  /** the BELIEFS this seat's religion adopts this turn, as [class, index]
   *  pairs (`BELIEF_CLASSES` code, the class catalog's row): founding names
   *  the Follower and then one other class, enhancing every class the
   *  religion still lacks that has a belief left (`adoptBeliefs`). */
  beliefs?: [number, number][];
  /** the GOVERNMENT this seat adopts, a `GOVERNMENT_LIST` position
   *  (`adoptGovernment` validates it against `governmentsOpen`); absent = no
   *  decision, the standing government holds */
  government?: number | null;
}

/** One seat's Special Session ballot: [outcome, extra votes]. */
export type CongressVote = [number, number];

type SeatActionLog = Record<number, Record<number, SeatActionRecord>>;

/** One thing on the table: [kind, a, b], where the kind indexes
 *  `DEAL_ITEM_KINDS` and what a and b mean is the kind's own business — an
 *  amount for gold and favor, a resource index and quantity, a Great Work
 *  kind, a city's CENTRE tile. */
export type DealItem = [number, number, number];

/** An offer waiting for its answer. `give` moves from the offering seat, `ask`
 *  moves the other way, and both only on acceptance. `left` is a countdown
 *  like every other agreement here, not a turn stamp. */
export interface DealOffer {
  left: number;
  give: DealItem[];
  ask: DealItem[];
}

/** What one seat owes another for the rest of a deal's 30 turns. Only the
 *  TEMPORARY kinds live here: "Resources and gold per turn ... are temporary,
 *  and once the deal has run its course you will get them back." */
export interface DealTerm {
  left: number;
  items: DealItem[];
}

/** One scored competition's record; `cpu/core/competition.ts` owns it. Both
 *  arrays are dense over `state.seats`, so a seat's id IS its index. */
export interface Competition {
  kind: number;
  left: number;
  score: number[];
  member: number[];
  /** the seat a TRIGGERED competition (the Aid Request) is held for; -1 for one a session started */
  target?: number;
}

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

/** A live STORM (Game_Climate m_aStorms): its serial, its `STORM_EVENTS` row,
 *  the plot it is centred on, the turns it has left, and the plots its
 *  footprint has struck — each struck once a storm. */
export interface StormRecord {
  id: number;
  event: number;
  at: number;
  left: number;
  struck: number[];
}

/** A live DROUGHT (Game_Climate m_aDroughts): its footprint's plots in
 *  strike order (`stormFootprint`) and the turns it has left. */
export interface DroughtRecord {
  plots: number[];
  left: number;
}

export interface GameState {
  seats: Seat[];
  gameOver?: boolean;
  victoryType?: number;
  victoryRow?: number;
  /** the ROAD TIER the world has reached, 0..3 (`ROAD_TIER_MP`). */
  roadTier?: number;
  /** the GAME ERA (an ERAS index), the turn it began, and the countdown to
   *  the next one (-1 while none runs) — `gameEraTurn`. */
  gameEra?: number;
  eraStartTurn?: number;
  eraCountdown?: number;
  /** the once-moment keys any player has recorded, and the city-states'
   *  research eras (`recordMoments`), ascending */
  momentsWorld?: number[];
  congressSessions?: number;
  /** Standing World Congress resolutions from the LAST session (res index
   * into CONGRESS_RESOLUTIONS, winning outcome 0=A/1=B, target index),
   * replaced wholesale each session. */
  congress?: { res: number; outcome: number; target: number }[];
  /** Emergencies at any stage — pending, called, running. */
  emergencies?: Emergency[];
  /** The SCORED COMPETITION running right now. One at a time; real Civ 6
   *  bounds nothing here, and a single slot is what makes the score a plane. */
  competition?: Competition;
  /** the seats one random event of THIS disaster phase dealt the aid
   *  request's damage (`AID_DAMAGE_MIN`); the phase's end raises the Aid
   *  Request for the lowest and clears it */
  aidHit?: number[];
  /** The turn the Congress last sat, Regular or Special. A Special Session
   * needs SPECIAL_SESSION_GAP turns of quiet before it may be called. */
  lastSessionTurn?: number;
  warTurns?: Record<string, number>;
  /** THE MEETING of two majors: the turn they met, keyed like `warTurns`.
   *  Symmetric; absent while they have not met (`meetMajors`). */
  metTurns?: Record<string, number>;
  /** the turn a pair of majors last made peace, keyed like `warTurns`;
   *  absent where they never fought */
  peaceTurn?: Record<string, number>;
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
  /** THE ALLIANCE'S TYPE, keyed like `allyTurns` - an index into
   *  ALLIANCE_TYPES while the alliance stands; cleared when it lapses. */
  allianceType?: Record<string, number>;
  /** ALLIANCE POINTS in QUARTER-points, keyed like `allyTurns` - the pair's
   *  accumulated trust, kept when an alliance lapses. */
  alliancePts?: Record<string, number>;
  /** Turns an OPEN BORDERS grant still runs, keyed `${grantor}>${guest}`.
   *  DIRECTED, because granting is one-way: "Granting open borders to a rival
   *  doesn't mean that rival also grants open borders to you." */
  borderTurns?: Record<string, number>;
  /** DIRECTED, the mission this seat holds with that one: MISSION_DELEGATION
   *  or MISSION_EMBASSY (the Resident Embassy takes the Delegation's place).
   *  Indefinite: a war is what ends it, never a clock. */
  delegations?: Record<string, number>;
  /** THE OFFER ON THE TABLE, keyed from -> to. One per ordered pair; it stands
   *  for the turn it was made and the one after, then lapses. */
  dealOffers?: Record<string, DealOffer>;
  /** THE RUNNING TERM of an accepted deal, keyed giver -> receiver: what that
   *  seat is handing over for the rest of the 30 turns, and what comes back
   *  when the clock runs out. */
  dealTerms?: Record<string, DealTerm>;
  /** THE PROMISE LEDGER, keyed `${asker}>${promiser}`: per promise kind
   *  (PROMISES order) the turns left on the promiser's promise (positive) or
   *  on its refusal (negative), 0 where neither stands. */
  promises?: Record<string, number[]>;
  /** Per promise kind, turns left on the window a BROKEN promise opened,
   *  keyed `${asker}>${promiser}`: the promise stands broken while it runs,
   *  and any kind's window is the asker's War of Retribution casus belli. */
  promiseBroken?: Record<string, number[]>;
  /** CAPTURED SPIES, keyed owner -> captor: the LEVELS of the owner's spies
   *  that captor is holding, one entry per spy. They are "imprisoned, but not
   *  killed", still count against the owner's capacity, and come home at the
   *  level they were caught at (`releaseSpy`). */
  spyHeld?: Record<string, number[]>;
  /** the CLIMATE PHASE the world has reached, 0 = Phase I; absent or -1 =
   *  no climate change yet. Monotone: it never steps back. */
  climateIdx?: number;
  /** the climate phase the climate step stood at before it last crossed into
   *  a higher one, while the crossing's sea (the polar melt, the flooded and
   *  submerged lowlands) waits for the next random-event step, which takes it
   *  as its event by force (`seaRise`); absent when none waits. */
  seaRiseFrom?: number;
  /** per flood river (`floodRivers` order, `FloodRiver.id`) whether it has
   *  its name — a major's sight has lain on one of its own plots
   *  (`nameRivers`); a river floods only once named; absent before the
   *  first naming pass */
  riverNamed?: boolean[];
  /** how many removable features (Woods, Rainforest, Marsh) the map carried
   *  at creation, and how many Ice tiles — the denominators the deforestation
   *  level and the polar melt are measured against. */
  removableAtStart?: number;
  iceAtStart?: number;
  map: GameMap;
  turn: number;
  /** the last storm serial handed out (`StormRecord.id`) */
  stormSerial?: number;
  /** the last fire serial handed out (`Tile.fireSeq`) */
  fireSerial?: number;
  /** the Relics created this game (`createRelic`): the "Choosing a Relic"
   *  draw runs over the rest of `RELIC_COUNT` */
  relicsMade?: number;
  /** the live STORMS (Game_Climate m_aStorms), in the order they began */
  storms?: StormRecord[];
  /** the live DROUGHTS (Game_Climate m_aDroughts), in the order they began */
  droughts?: DroughtRecord[];
  seatActions?: SeatActionLog;
  sandbox: boolean;
  /** Great-person ids recruited BY ANYONE, in claim order. Real Civ 6 great
   *  people are unique individuals, so the denial set is global. Each seat's
   *  own recruits are in `Seat.gpEarned`. */
  claimedGreatPeople: string[];
  /** the FROZEN offer per class: a roster index, -1 = a draw is pending,
   *  -2 = the class is exhausted (no unclaimed person at or past the world
   *  era — final, the pool only shrinks). */
  gpOffer?: number[];
  /** the price FROZEN when the offer was drawn. */
  gpPrice?: number[];
  /** who PASSED on the standing offer, per class — -1 (or absent) nobody.
   *  CIV6: the passer is locked out of THAT individual and the price falls
   *  20% for everyone else; the claim resets the cell for the next person. */
  gpPassedBy?: number[];
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
  /** the barbarian tribes, one a camp ever raised, the dead ones kept
   *  (`cpu/core/barbarians.ts`) */
  barbTribes?: BarbTribe[];
  /** the barbarians' unit pool (`barbSlots`) */
  barbPool?: UnitPool;
  /** the civilians the barbarians captured this turn, each with its captor
   *  (AI_EVENT_UNIT_CAPTURED's payload, 0x212500): the Builder Capture's
   *  trigger, read at their turn's end */
  barbCaptures?: { captive: number; captor: number }[];
  /** the camp step has added camps once: every later step adds one */
  barbCampsBegun?: boolean;
  /** per player (seat), the first turn a barbarian scout may report one of
   *  its cities again (the manager's throttle, 0x153ef0) */
  barbSpotNext?: Record<number, number>;
  /** CIV6's FREE CITIES player (`FREE_SEAT`): the cities loyalty took from
   *  their owners, until each joins whoever pulled hardest. Created by
   *  `freeSeatOf` at the first revolt; absent until then. */
  freeSeat?: Seat;
  claimedPantheons: string[];
  /** every religion belief some religion holds, of every class — the one
   *  pool that keeps a belief to one religion */
  claimedBeliefs: string[];
}

/** A BARBARIAN TRIBE: a camp and its clocks (the game's BarbarianTribe_Instance). */
export interface BarbTribe {
  /** the camp's plot */
  plot: number;
  /** the camp stands; a cleared camp's tribe stays in the list, dead */
  alive: boolean;
  /** the player whose unit took its camp: its units rampage against it
   *  (Barbarian Rampage) */
  rampage?: number;
  kind: 'NAVAL' | 'CAVALRY' | 'MELEE';
  /** its BarbarianTribeNames row within its kind */
  name: number;
  /** turns since its last raised unit, and toward its next scout */
  spawnTurns: number;
  scoutTurns: number;
  /** the ids of the units and scouts it raised */
  units: number[];
  scouts: number[];
  /** the tribe's counts its turn reads (+0x34, +0x28): each melee or ranged
   *  unit and each scout it raised, less each lost in battle — a unit gone
   *  any other way still counts */
  unitCount: number;
  scoutCount: number;
  /** the camp's defender it raised first (the AI's DEFENDER while the camp
   *  stands, which keeps the camp) */
  defender?: number;
  /** the units it raised in its last turn, which its operation cannot take
   *  in the same turn */
  fresh?: number[];
  /** its Boldness: the raid and the assault wait for it */
  boldness?: number;
  /** its raid score: its units' pillages (Barbarian Raid Check) */
  score?: number;
  /** the cities its raid and its assault wait to go after */
  raidTargets?: BarbTarget[];
  assaultTargets?: BarbTarget[];
  /** a scout that saw a city walks home to report it: its tree "Barbarian
   *  Found City" (`barbarianOps.ts`) */
  homing?: BarbHoming;
  /** per scout, the city plots it saw at its last look */
  saw?: Record<number, number[]>;
  /** its raid or city assault (the AI operation it runs) */
  op?: BarbOp;
  /** the spawn interval its operation set (the force's SpawnRate) while it
   *  recruits, and the classes of the units it asked for, one raised a spawn
   *  turn as the class's unit then */
  every?: number;
  queue?: BarbTag[];
}

/** a city a barbarian tribe goes after: its owner and its centre */
export interface BarbTarget {
  seat: number;
  plot: number;
}

/** A SCOUT'S TREE ("Barbarian Found City"): its id among the barbarian
 *  player's trees, its scout, the city it saw, its run between ticks (each
 *  node's status and memory, the tagged data) */
export interface BarbHoming {
  id: number;
  scout: number;
  target: BarbTarget;
  status: number[];
  mem: Record<string, unknown>[];
  bb: Record<string, unknown>;
}

/** A TRIBE'S OPERATION: a raid ("Raid City") or a city assault
 *  ("Barbarian City Attack") on a city, its id in the barbarians'
 *  operation manager (`barbarianOps.ts`) */
export interface BarbOp {
  id: number;
  assault: boolean;
  target: BarbTarget;
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
  /** the id of the FREE CITY that granted this unit (`grantFreeCityUnit`);
   *  absent on every other unit. A join takes that city's grants with it. */
  freeCity?: number;
  /** the city-state seat whose army this unit is while a suzerain holds it by
   *  LEVY (`levyUnits`); absent on every other unit. It survives an upgrade
   *  (the Raven King's discount reads it) and clears when the unit returns. */
  leviedFrom?: number;
  /** CIV6 (GOODY_METEOR_UNIT_REFUND_COST, IGNORE_RESOURCE_MAINTENANCE): a
   *  Meteor Site's grant "has no resource maintenance cost" — it burns no
   *  fuel and is never short of it, through any upgrade. */
  noResourceUpkeep?: boolean;
  /** SPY STATE. `spyMission` is SPY_IDLE, SPY_TRAVELLING or a `SPY_MISSIONS`
   *  index; `spyTurns` is the clock it is running; `spyTarget` the centre tile
   *  it is in transit to; `spyLevel` its rank, capped at Master Spy. */
  spyMission?: number;
  spyTurns?: number;
  spyTarget?: number;
  spyLevel?: number;
  /** ROCK BAND STATE. `bandLevel` is 1..4 ("Rock Bands start at level 1 and
   *  can be promoted up to level 4"); `bandAlbum` its accumulated Album
   *  Sales, "the expected Tourism strength at their next concert". */
  bandLevel?: number;
  bandAlbum?: number;
  fortifyTurns?: number;
  /** how many attacks this unit has left this turn. CIV6: a unit attacks
   *  ONCE per turn; Sweeping Wind is the only row that buys a second. Reset
   *  at the refresh; undefined before the first one, where readers fall back
   *  to the single attack every unit has. */
  attacksLeft?: number;
  /** the turn a STEALTH chassis last attacked. CIV6 (Unit): "if a stealth
   *  unit attacks, it will become visible for a turn before becoming
   *  invisible again", so it is seen while this equals the live turn. */
  revealedTurn?: number;
  /** the hex a FIGHTER patrols (UNITOPERATION_DEPLOY), absent while it is
   *  stationed. CIV6 (Patrols): a deployed fighter holds the hex "until it is
   *  ordered otherwise or it is destroyed"; `tileIndex` stays its base. */
  patrol?: number;
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
  /** CIV6 (Ordu, ABILITY_ORDU_INCREASED_MOVEMENT): the flat MOVEMENT the city
   *  that trained it granted, carried for life the same way `xpPct` is. Both
   *  are written by one composer (`applyTrainingGrants`), so a third grant
   *  cannot miss a training site. */
  mpBonus?: number;
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
  /** extra promotions the TRAINING city banked on this unit (Patron Saint),
   *  each spent by re-arming it the moment it takes one. */
  promoBonus?: number;
  /** a GREAT PERSON unit's QUEUE POSITION in its class's roster — which
   *  person this chassis is carrying, and so which ability its charge spends.
   *  Undefined on every other unit. */
  gpAt?: number;
  /**
   * FORMATION TIER: 0 a lone unit, 1 a Corps or Fleet, 2 an Army or Armada.
   * Undefined is 0 — read it through `formationCS`, never inline, so no site
   * carries its own default.
   */
  formation?: number;
  /**
   * IN AN ESCORT FORMATION with the military unit on its own tile. CIV6
   * (Formations): "A military unit can create a formation with a support or
   * civilian unit at any time" — the pair then moves as one. Only a CIVILIAN
   * carries the flag; who escorts it is whoever holds the tile's military
   * slot, so read it through `inEscort`, never inline.
   */
  escorted?: boolean;
  /** of AI type DEFENDER (+0x1c0 4), homed on its city-state's city: its
   *  city's standing army (`minorStandingArmy`) */
  aiDefender?: boolean;
  /** A LAND unit currently on a water tile (embarked). Moves
   * at EMBARK_MOVES, cannot fortify/exert ZOC, and defends at a flat CS.
   * Naval units are never `embarked` — they belong on water natively. */
  embarked?: boolean;
  /** the unit's place in its player's unit pool (`UnitPool`) — the
   *  barbarians', a city-state's, the Free Cities': the order their tactical
   *  AI walks their units in */
  slot?: number;
}

/** A PLAYER'S UNIT POOL (the player's unit list, a free list): a unit gone
 *  frees its slot at the player's next tactical turn, the slots freed
 *  together pushed in ascending order; a new unit takes the slot pushed
 *  last, else a new slot past the end (`poolSlots`, `poolDying`). */
export interface UnitPool {
  /** slots ever used */
  size: number;
  /** freed slots, the last pushed last */
  free: number[];
  /** slots whose unit was gone when the player's last tactical turn ended */
  dying: number[];
}

export interface Seat {
  seat: number;
  /** the player's handicap, a Difficulties index; absent, the AI's Prince */
  handicap?: number;
  /** a city-state's or the Free Cities' unit pool (`poolSlots`), its slot 0
   *  the founding Settler's */
  unitPool?: UnitPool;
  /** THE KNOWLEDGE BASE'S ARMY RECORDS (`knowledgeLook`) of a city-state,
   *  the Free Cities or the barbarians: one per unit the player has seen —
   *  its id, owner and unit type, the turn and plot last seen; a record
   *  drops 22 turns after. Absent = none. */
  armyKnown?: ArmyRecord[];
  /** the turn the records last aged (`knowledgeLook` with its ageing): a
   *  record's age is this less the turn it was last seen */
  armyAged?: number;
  /** the military AI's Combat Desire of a city-state (`minorCombatDesire`)
   *  or the Free Cities (`freeCombatDesire`), raw 24.8: its
   *  PSEUDOYIELD_UNIT_COMBAT weight */
  combatDesire?: number;
  /** the barbarians' knowledge base's camps (`barbCampsLook`), in its
   *  order. Absent = none. */
  campsKnown?: number[];
  /** the city AI of a city-state (`minorAiTurn`: the events' slots, the
   *  trees, the contracts and reservations) or the Free Cities (the ids their
   *  operations' trees take, `freeOps.ts`) (`CityAi`) */
  cityAi?: CityAi;
  /** the operation manager of a city-state (`minorOps.ts`), the Free Cities
   *  (`freeOps.ts`) or the barbarians (`barbarianOps.ts`); the barbarians'
   *  tree pool (`newBarbTreeId`): the generation the next tree's id takes,
   *  the slots it made, its free slots (the head last) */
  ops?: OpsAi;
  opsNext?: number;
  treeSlots?: number;
  treeFree?: number[];
  /** the units a city-state's "Upgrade Units" trees hold (`upgradeTreesTick`):
   *  present while a tree runs, empty where it holds none */
  upgrading?: number[];
  /** a city-state's technology or civic gained since its "Upgrade Units"
   *  trees last ticked (TRIGGER_TECH_UPGRADE / TRIGGER_CIVIC_UPGRADE) */
  upgradeTrigger?: boolean;
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
  /** ...and what this seat emitted THIS TURN. The Climate Accords competition
   *  compares it across seats; `resolveCompetition` clears it when it has. */
  co2Turn?: number;
  diplomaticFavor: number;
  diplomaticPoints: number;
  /** the percent of Production toward city projects this seat's research
   *  completions have banked — CIV6 (Future Tech): "+5% ... each time it is
   *  completed". */
  researchProjectPct?: number;
  /** THIS TURN's Special Session ballot, as the record left it. Written
   * inside seatPhase, read and cleared by the turn's Special Sessions
   * (`emergencySessions`) — an intent is for one turn. */
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
  /** WON Nuclear Emergencies, by the seat they were won against — that
   * seat's units fight this seat's at -3 CS, one count per win. */
  emgNukeCS?: number[];
  /** Nuclear Emergencies this seat LOST as a member: its cities exert one
   * less Loyalty pressure each. */
  emgNukeCut?: number;
  /** GREAT PEOPLE this seat has recruited AND SPENT — the ids whose charge
   *  actually fired, which is what a founded religion counts, not the claim. */
  gpActivated?: string[];
  /** INVENTED LUXURIES a Great Merchant made, each entry the number of cities
   *  that copy serves the way a worked luxury resource does. */
  gpLuxuries?: number[];
  /** copies of map luxuries a Great Person granted (Colaeus, Magellan), by
   *  `LUXURY_IDS` row — the seat's own, counted with its improved copies. */
  gpLuxCopies?: number[];
  /** permanent per-seat adders a Great Person left behind, by `GP_PERM`
   *  position. */
  gpPerm?: number[];
  influencePoints: number;
  envoysAvailable: number;
  /** governor titles GRANTED outright rather than derived from held state —
   *  CIV6 (GOODY_DIPLOMACY_GRANT_GOVERNOR_TITLE): "+1 governor point" */
  grantedTitles: number;

  treasury: number;
  /** the whole Gold the seat's last upkeep fell short of its treasury
   *  (`goldShortfall`) — what its cities' bankruptcy amenities read */
  goldShortfall: number;
  scienceTotal: number;
  cultureTotal: number;
  faith: number;
  tourism: number;
  /** the seat's science / culture / tourism OUTPUT of its last completed
   *  accrual - what an ally's percentage bonus reads (Alliance level 3). */
  sciRate?: number;
  culRate?: number;
  tourRate?: number;
  /** Lifetime tourism SENT to each rival seat (index = seat), the general
   *  half and the religious half apart — real Civ 6 accrues per foreign
   *  civilization, and the international modifiers are per pair. */
  tourismTo?: number[];
  tourismReligiousTo?: number[];
  /** the rival seats (index = seat) this seat is culturally dominant over
   *  (`updateCulturalDominance`) */
  culturallyDominant?: boolean[];
  /** how many copies of each chassis this seat has ever acquired, keyed by
   *  unit id — what a `costStep` price progression counts. */
  unitsAcquired?: Record<string, number>;
  /** the RELIGIOUS half (relics + holy cities), banked apart because a
   *  rival's Enlightenment or a different religion halves it at the read
   *  (`cultureVictor`) — the general bank above is never diminished. */
  tourismReligious?: number;

  research: ResearchState;
  government: GovernmentState;
  religion: ReligionState;
  gpp: Partial<Record<GreatPersonClass, number>>;
  /** the Great Person points this seat EARNED this turn, per class — the
   *  `co2Turn` shape, read once by a scored competition and cleared with it.
   *  CIV6 (World's Fair): "1 point per Great Person POINT of every class". */
  gppTurn?: Partial<Record<GreatPersonClass, number>>;
  buildersTrained: number;
  /** the Settlers this seat has TRAINED or BOUGHT — what `settlerCost`'s
   *  progression counts (a starting, captured or granted one moves nothing). */
  settlersTrained?: number;
  /** the COMPLETED specialty districts each district type's price reads for
   *  the under-represented discount, dense over `PLACEABLE_DISTRICTS`
   *  (`districtDiscounted`): every type's taken when a technology or civic
   *  completes, a type's own again when a district of it completes
   *  (`refreshDistrictDiscount`). */
  discountDistricts?: number[];
  /** CIV6: a Relic with no open slot is held until one opens, not lost. */
  relicReserve: number;
  /** CIV6 (Warlord's Throne): "Capturing an enemy City grants 20% bonus
   *  Production in all Cities for 5 turns" — the turns still to run. */
  conquestProdTurns?: number;
  /** PlayerStats' strength over every domain without the treasury's
   *  (0x4bd0d0(-1): +0x210 less +0x390), stored as the seat's turn starts,
   *  before its production (`storeUnitStrength`); absent, none */
  unitStrength?: number;
  bestMeleeCS: number;
  /** the strongest Ranged Strength of a unit the seat trained, bought or
   *  upgraded to (its formation's included; a siege chassis' Bombard and an
   *  aircraft's raise nothing): what its cities strike from
   *  (`cityStrikeStrength`); absent, none */
  bestRangedCS?: number;
  /** every ONE-TIME project this seat has completed. */
  projectsDone: string[];
  /** nuclear devices held, dense over `NUCLEAR_DEVICES`. CIV6: a finished
   *  device "is added to the player's inventory and can then be used by any
   *  unit or improvement capable of deploying it". */
  wmd?: number[];
  /** The citizen names this seat's civilization has given (`drawCitizenName`):
   *  its Spies', its Archaeologists' and the storms named for it. Absent = none. */
  citizenNames?: number;
  /** The Tribal Villages this seat has had of each kind, dense over
   *  `GOODY_KINDS`: each halves that kind's weight in its next draw
   *  (`goodyKindWeight`). Absent = none. */
  goodyKinds?: number[];
  /** Light-years the Exoplanet craft has travelled; -1 = no craft in flight.
   *  The win fires on ARRIVAL (spaceLy >= SPACE_FLIGHT_LY), not on launch. */
  spaceLy?: number;
  /** Completed LAGRANGE stations — each adds +1 LY/turn unconditionally. The
   *  terrestrial ones are counted per city (`City.laserStations`). */
  orbitalLasers?: number;
  /** GS strategic stockpiles, dense over `STRATEGIC_IDS`. */
  stockpile?: number[];
  /** bitmask over `STRATEGIC_IDS`: the slots whose unit fuel bill the bank
   *  could not meet at this seat's last upkeep pass. */
  fuelShort?: number;
  camps: number[];
  /** CIV6 (BOOST_TRIGGER_NUM_BARBS_KILLED): the barbarian units this seat
   *  has destroyed (`boostOnKill`) */
  barbKills?: number;
  gpEarned: string[];
  /** the era score this seat has earned over the whole game */
  eraScore?: number;
  /** the once-moment keys this seat has recorded (`recordMoment`), ascending */
  moments?: number[];
  /** the Age bars the current game era fixed as it began (`ageBars`): a
   *  score below `darkBar` at the next era's start is a Dark age, one at or
   *  above `goldenBar` a Golden one. */
  darkBar?: number;
  goldenBar?: number;
  /** how many DARK / GOLDEN-or-HEROIC ages this civ has entered — the
   *  per-civ threshold drift's memory. */
  darkAges?: number;
  goldenAges?: number;
  age?: number;
  /** the seven GOVERNORS, one slot per catalog row; see `governors.ts`. */
  governors?: Governor[];
  /** The Age this seat held in the PREVIOUS era — the substrate for a HEROIC
   *  age (Dark -> Golden), which the current age alone cannot detect. */
  prevAge?: number;
  dedications?: number;
  dedicationPicks?: number[];
  /** the seat has been paid a `firstBuildTechs` row's technologies (the
   *  Mahavihara's) — latched at its first one, never cleared. */
  firstImpTech?: boolean;
  /** This seat's ORIGINAL capital tile. Static once founded; capture moves
   *  the owner, never the tile. */
  capitalTile?: number;
  /** THIS SEAT'S fog: per-tile explored flags (0/1), parallel to map.tiles.
   *  Empty = nothing hidden from it. One seat's scouting never lifts another's
   *  fog, so this is the seat's own knowledge, not the world's. */
  explored: number[];
  name: string;
  color: string;
  /** CIV6: the civilization this seat plays — an index into `CIV_LEADERS`
   *  (its unique units and abilities); -1 plays none. */
  civ: number;
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
  /**
   * THE KIND of each war, keyed by absolute foe seat: `+(code + 1)` where
   * this seat DECLARED it, `-(code + 1)` where the foe did, `code` indexing
   * `WAR_KINDS` (data/warKinds.ts). Written only through `setWarKind` at the
   * declaration, cleared at the peace; a foe with no entry is a war with no
   * kind (a minor's, or one that predates the store). The GPU's twin is the
   * signed `seat_warkind[b, i, j]` plane; the gate compares the `warKinds`
   * digest field — each seat's [foe, value] pairs in foe order.
   */
  warKinds: Record<number, number>;
  /** Directed denouncement stamps keyed by absolute seat: `denounced[b] = t`
   *  means this seat denounced b at turn t. The stamp IS the clock: the
   *  denouncement is live while `turn - t` is under AGREEMENT_TURNS, and the
   *  Formal-War casus belli opens FORMAL_WAR_MIN_TURNS in. `denounceActive`
   *  and `denounceCasusBelli` are the two readings. */
  denounced: Record<number, number>;
  tradeRoutes?: TradeRoute[];
  /** CIV6 (Trading Post): centre tiles where this civ holds one — stamped at
   *  both endpoints when a route runs its full term. Sorted, append-once;
   *  readers gate on a living city standing at the centre. */
  tradingPosts?: number[];
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
  /** 0 walking out, 1 walking home */
  walkLeg?: number;
  /** the route's COURSE: the plots of its path, origin to destination,
   *  fixed at creation (`tradeCourse`) — what the Trader walks and the path
   *  term, the posts passed and the length read. */
  course?: number[];
}

export interface ReligionState {
  /** CIV6 (Inquisitor): "You can only create Inquisitors if you have founded a
   *  religion and had an Apostle use the Launch Inquisition ability within
   *  your territory." Latched once, never cleared. */
  inquisition?: boolean;
  pantheon: string | null;
  founded: boolean;
  /** the religion founded, a `RELIGION_TYPES` id (the game names the
   *  religion by its type), null before the founding */
  type: string | null;
  /** the religion's belief of each class (`BELIEF_CLASSES`), null until
   *  adopted — founding takes the Follower and one other, each Evangelize
   *  Belief one more. `worship` is the Worship BELIEF, which names the
   *  building. */
  follower: string | null;
  founder: string | null;
  worship: string | null;
  enhancer?: string | null;
  /** the beliefs the religion has EARNED: RELIGION_INITIAL_BELIEFS at the
   *  founding, one more per Apostle's Evangelize Belief. Absent = none. */
  beliefsEarned?: number;
  holyTile?: number | null;
}

export type CityStateType =
  | 'scientific'
  | 'cultural'
  | 'trade'
  | 'industrial'
  | 'militaristic'
  | 'religious';

/** a city-state's quest for a major (`cpu/core/quests.ts`) */
export interface CityStateQuest {
  type: QuestType;
  /** the type's target: the unit, district, tech, civic or Great Person
   *  class to train, complete, boost or recruit; the actor's own religion
   *  (its seat) to convert the capital to; null for a Trade Route or a camp */
  target: string | number | null;
}

/** a knowledge base's record of one unit (CivKnowledge's 0x20-byte army
 *  entry: the unit's id, its age, its plot) */
export interface ArmyRecord {
  id: number;
  owner: number;
  type: string;
  seen: number;
  /** the plot it was last seen on */
  plot: number;
  /** its damage when last seen */
  damage: number;
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
  /** THE LEVY (`levyUnits`): the seat holding this minor's army, and the turn
   *  at whose start it comes home (`LEVY_TURNS` - 1 after the levy). Absent
   *  while no one holds it. */
  levySeat?: number;
  levyEnds?: number;
  /** the turn the minor's city last took a hit — the quiet the repair
   *  project waits on (`City.lastHitTurn`) */
  lastHitTurn?: number;
  /** its city's power this turn (`City.powered`), set by `minorPower` */
  powered?: boolean;
  /** its last turn's Production went toward a `fullyPowered` project that is
   *  still running (`minorBuild`) — the queue head `minorPower` reads */
  fullyPowered?: boolean;
  /** the district project its last turn's Production went toward and did
   *  not finish (`minorBuild`) — the queue head the religious step reads
   *  (`pressureFromCity`). Absent = none. */
  buildProject?: string;
  /** The STORED answer to the suzerain contest (-1 none), refreshed at every
   *  envoy write — the fixed point that rules reweighting envoys BY the
   *  current suzerain read (Containment, the border passage). */
  suzerain?: number;
  /** The minor's one city holds pressure like any other city (index = seat). */
  religionPressure?: number[];
  /** its city's unconverted pressure (`City.unconvertedPressure`) */
  unconvertedPressure?: number;
  /** its city's district-slot pins (`City.specialistPref`) */
  specialistPref?: number[];
  /** its city's citizens on neither a plot nor a slot (`City.idleCitizens`) */
  idleCitizens?: number;
  /** the minor's own BUILD record — `minorBuild` writes these, the tile
   *  planes carry the districts, and the conquest hands the whole set to the
   *  captured City. Absent = nothing built yet. A district's `cost` is the
   *  price it locked at its placement (`minorPlaceDistrict`). */
  districts?: { type: DistrictId; tileIndex: number; cost?: number }[];
  buildings?: string[];
  /** `City.pillagedBuildings` for the minor's city — the same ONE reader. */
  pillagedBuildings?: string[];
  /** a building was pillaged while the minor worked on an item: its repair
   *  waits until that item completes (`minorBuild`). */
  repairWait?: boolean;
  outerHp?: number;
  /** the item in hand (`minorItemKey`), its progress, the progress kept on
   *  each item it switched away from, and the overflow store a completion or
   *  an idle step leaves for the next step (`minorBuild`); a district's plot
   *  (`prodSite`); the item's value as its AI set it (CityBuildAI +0xa48,
   *  `minorAiTurn`). */
  prodItem?: string;
  prodProgress?: number;
  prodRetained?: Record<string, number>;
  prodOverflow?: number;
  prodSite?: number;
  /** the strategic resource its unit in hand reserved at the queue's front
   *  check (0x17f3a0: the unit's cost, reserved where its stock less its
   *  reservations covers it), released and charged at the completion;
   *  absent none */
  prodReserved?: number;
  prodSetValue?: number;
  /** its city's Food favored by its city AI (`minorFoodFocus`, 0x5cdae0):
   *  the citizen manager's yield flag */
  favoredFood?: boolean;
  /** the turn its city was founded (city +0x2600, m_iTurnFounded); absent
   *  for a city a record's import finds standing */
  foundedTurn?: number;
  /** its city's trade list (CityBuildAI +0x870, `minorTradeList`): the
   *  destination centres a trade path reaches, and the ones it did not */
  tradeCities?: number[];
  tradeRejected?: number[];
  /** its trade AI's route value K (raw, knowledge base +0x6d8,
   *  `minorTradeValue`) */
  tradeValue?: number;
  /** its city's UNITS table (raw, `AI_UNITS`' order) as its city AI's last
   *  turn left it, and its unimproved resources' counts (CityBuildAI +0x978)
   *  as its last update counted them — the research and civics values'
   *  city terms read them (0x5d4cd0, 0x5d45c0); a founding turn's first look
   *  counts none */
  unitValues?: readonly number[];
  /** its city's BUILDINGS and PROJECTS tables (raw, `AI_BUILDINGS`' and
   *  `AI_PROJECTS`' order) as its city's update of the turn left them: its
   *  second hook's Default Specialization reads them (`minorSecondHook`) */
  buildingValues?: readonly number[];
  projectValues?: readonly number[];
  resourceCounts?: Record<string, number>;
  economy?: EconomicMemory;
  threat?: number;
  /** its city's enemy at the gates (CityBuildAI +0x218) as its last update
   *  left it (`cityThreat`); absent, none */
  threatNear?: boolean;
  /** its city's growth as its city AI's full update read it, between the
   *  turn's production and its growth (`minorPhase`): the growth forecast's
   *  inputs (CityBuildAI +0x6c8) */
  aiGrowth?: CityGrowth;
  /** the camps its knowledge base holds, in their order (m_barbarians
   *  +0x638) */
  campsKnown?: number[];
  /** per plot 1 where its knowledge base's looks have seen it or a meeting
   *  revealed it (the player's revealed plots, visibility +0x2f0, as
   *  `minorCampsLook` and `minorTradeList` read them; `meetCityState`) */
  revealed?: number[];
  /** the count its city's standing army lacks (CityBuildAI +0x2d8,
   *  `minorStandingArmyShort`), set in its city's update */
  standingArmyShort?: number;
  /** the yield its last build step converted from a district project
   *  (`City.projectYield`, which `minorCity` hands its city) */
  projectYield?: ProjectYield;
  /** the minor city's GOLD and FAITH: what its yield walk pays, less its
   *  units' upkeep, spent on purchases and upgrades (`minorPhase`). A Seat's
   *  own fields, declared here so the census compares them for a minor
   *  (`minorTreasury` / `minorFaith`). */
  treasury: number;
  faith: number;
  /** CIV6 (City-state): the install has ONE city rule, so a minor's city
   *  grows on its FOOD BOX and claims tiles on its CULTURE BOX exactly as a
   *  major's does. Before a minor's city grew and claimed, these were hardcoded 0 in `minorCity` and the
   *  population moved on a 12-turn clock instead. */
  foodBox?: number;
  cultureBox?: number;
  tilesAcquired?: number;
  nextPlot?: number;
  /** the quest standing for each major, keyed by seat */
  seatQuest?: (CityStateQuest | null)[];
  /** the type of each major's last completed quest, keyed by seat — the
   *  type its next quest skips */
  seatQuestLast?: (QuestType | null)[];
}

