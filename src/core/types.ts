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
  | 'OIL_WELL'
  // B-27 (#71): appended LAST — roster order IS the GPU's improvement index,
  // so inserting anywhere else would renumber every existing improvement.
  | 'SEASIDE_RESORT'
  // B-27 (#78): the FORT, appended after SEASIDE_RESORT for the same reason.
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
  /** B-20 (#79): an ANTIQUITY SITE — a dig an Archaeologist can excavate into
   *  an Artifact. Real Civ 6 creates these from pre-Modern events (a razed
   *  barbarian outpost, a unit dying) and reveals them with Natural History. */
  antiquity?: boolean;
  /** Pillaged improvement (yields nothing until a builder repairs it). */
  pillaged: boolean;
  /** AUDIT B-32: pillaged district (a complete, non-CITY_CENTER district whose
   * yields/buildings/housing/amenities/GPP go dark until a builder repairs it;
   * static counts — cost/limit/maintenance — stay, since it is still owned). */
  districtPillaged?: boolean;
  /** B-17 (#71): the ENCAMPMENT garrison pool (max ENCAMPMENT_HP = 100), set
   *  when the district COMPLETES. While positive the tile blocks hostile
   *  entry and the district may strike; a melee attack on the tile depletes
   *  it, and at 0 the tile is enterable and the strike goes silent. Lives on
   *  the TILE (not the city) so every walker's legality check stays O(1) and
   *  the GPU can mirror it as one [B, T] plane. */
  encampHp?: number;
  /** B-23 (#71): a ROAD lies on this tile. Laid by trade routes (real Civ 6:
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
  /** Owning city id, or -1. */
  cityId: number;
  /** Owning city-state id (territory blocks settling/borders); absent = none. */
  csId?: number;
  /** Owning rival-civ id; absent = none. */
  rivalId?: number;
  /** AUDIT A-17: owning rival CITY (RivalCity.id, per-civ ids — meaningful
   * only with rivalId set). The per-city registry the player's cityId gives
   * player tiles; capture/raze/transfer and border adjacency key on it. */
  rivalCityId?: number;
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
  | 'GENERAL'
  // B-19: Writer/Musician split off the condensed Artist class. Both share the
  // Theater Square district (GP_CLASS_DISTRICT) and append at the END of
  // GP_CLASSES so PROPHET keeps class index 3 (prophetCls) and the GPU's
  // per-class tensors auto-extend from the exporter.
  | 'WRITER'
  | 'MUSICIAN';

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
  /**
   * AUDIT B-1: outer-defense HP from ANCIENT_WALLS (max WALLS_HP = 100).
   * Set to full when the walls complete; damage depletes it before city HP;
   * heals with the city. Absent = 0 (no walls). Wiped on capture/transfer
   * because the new owner's `buildings` start empty. RivalCity inherits it.
   */
  outerHp?: number;
  /**
   * B-18 religious pressure spread. `religionPressure[g]` is the integer
   * pressure this city has accumulated from religion g (0 = the player's
   * religion, i+1 = rival i's) — +1 each turn its holy city (the founding
   * civ's capital) is within RELIGION_PRESSURE_RANGE tiles. `followedReligion`
   * is the religion id with the most pressure (>0), ties to the lowest id
   * (a founding-order proxy — earlier founders accrue more pressure); null =
   * none. Deterministic, zero-RNG. Currently INERT: computed and serialized
   * but not yet read by the yield pipeline (per-city follower-belief coupling
   * is the deferred follow-up). Fresh objects (founded/flipped cities) start
   * unset = no pressure, which is the reset-on-birth KILL hygiene.
   */
  religionPressure?: number[];
  followedReligion?: number | null;
  /**
   * B-20 (Round B7): Great Works stored in this city. `greatWorksWriting`
   * occupies AMPHITHEATER slots (2 max), `greatWorksMusic` MUSEUM slots (2 max);
   * each work yields GREAT_WORK_CULTURE culture/turn (building-tier). Absent = 0.
   * Wiped on capture/transfer (the new owner constructs a fresh City — works,
   * like outerHp, do not carry over). Yield-bearing state: the GPU mirror bumps
   * _eff_version on every write.
   */
  greatWorksWriting?: number;
  /** #73: Great Works of ART, in ART MUSEUM slots (3) — the real Civ 6 home. */
  greatWorksArt?: number;
  greatWorksMusic?: number;
  /** B-20 (#73): RELICS held in this city's TEMPLE slot (cap 1). Each pays
   *  +4 faith and +8 tourism — the densest tourism source in real Civ 6. */
  relics?: number;
  /** B-20 (#79): ARTIFACTS excavated from Antiquity Sites, held in this city's
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

export interface GameState {
  /** GV-2: true once TURN_LIMIT turns are played (or a victory fires). */
  gameOver?: boolean;
  /** GV-4/GV-3/B-25: 0 none, 1 score (TURN_LIMIT), 2 domination (all
   *  capitals), 3 science (space race), 4 science-defeat (a rival finished
   *  the space race first). */
  victoryType?: number;
  /** B-15: player war-weariness accumulator (integer turn counter); the
   *  empire-wide amenity penalty is warWearinessPenalty(this). */
  warWeariness?: number;
  /** B-24 (task #68): per-era "historic moment" score, UNIFIED civ ids
   *  (0 = player, r+1 = rival r). Lazy — absent entries read 0. Resets at
   *  every ERA_LENGTH boundary (`eraBoundary`, core/eras.ts). */
  eraScore?: number[];
  /** B-24 S2: per-civ Age (0 Dark / 1 Normal / 2 Golden), UNIFIED civ ids;
   *  assigned at each era boundary from the just-ended window's eraScore.
   *  Absent entries read Normal (era 0, fresh saves). */
  civAges?: number[];
  /** B-24 (#71): the age each civ held in the PREVIOUS era. Substrate for the
   * HEROIC age (Dark -> Golden), which the current age alone cannot detect. */
  prevAges?: number[];
  /** B-24 (#71): dedications each civ committed this era — 1 normally,
   * HEROIC_DEDICATIONS on a Heroic age. */
  dedications?: number[];
  /** B-24 (#77): the NAMED dedications each civ committed to this era —
   *  catalog indices, `dedications[c]` of them (three on a Heroic age). */
  dedicationPicks?: number[][];
  /** B-23 (#71): have roads reached the CLASSICAL tier (bridges)? Latched true
   *  at the first era boundary; a road-to-road step then pays no river charge. */
  roadBridges?: boolean;
  /** B-20 (#71): the player's cumulative TOURISM. Fed by Great Works and
   *  Seaside Resorts; wonders/relics/artifacts/National Parks are recorded
   *  residuals, and the Culture VICTORY itself rides B-25. */
  tourismTotal?: number;
  /** B-22 (#75): the PLAYER's cumulative DIPLOMATIC FAVOR — the World Congress
   *  currency. +government tier and +1 per suzerained city-state each turn. */
  diploFavor?: number;
  /** B-22 (#76): World Congress sessions held so far (both engines count the
   *  same sessions; traced so parity proves the schedule). */
  congressSessions?: number;
  /** B-22 (#76): the PLAYER's DIPLOMATIC VICTORY POINTS. 20 wins. */
  diploPoints?: number;
  /** B-22 (#74): the PLAYER's WARMONGER score (grievances) — the exact twin of
   *  RivalCiv.warmonger. Grows on declaring war and on taking a rival city,
   *  decays 1/turn while at peace with every rival. Past RR_WARMONGER_GANG a
   *  rival may declare on the player WITHOUT the usual strength advantage,
   *  which is real Civ 6's gang-up-on-the-warmonger consequence. */
  warmonger?: number;
  /** B-25: completed space-race project ids (empire-wide chain progress). */
  spaceProjects?: string[];
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
  /** B-18: Enhancer beliefs already claimed (player or, once wired, rivals). */
  claimedEnhancers?: string[];
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
  /**
   * #70/S3 (B-8): the movement pool this unit was GRANTED at its last
   * refresh. Civ 6's rule is "if you have used any movement points during a
   * turn, the unit will not start healing until the next turn" — the heal and
   * B-5 fortify gates therefore ask "did this unit spend any MP", which is
   * `movesLeft >= movesFull`. It used to be derived as `movesLeft >= (the unit
   * type's moves)`, correct only while the granted pool was constant per type;
   * the Great General/Admiral +1 MP aura breaks that, since the pool now
   * varies per turn with a general's position. The GPU needs no mirror — it
   * already tracks the same fact explicitly as p_acted/u_acted/v_acted, so
   * this field converges TS onto the GPU's model. Undefined on units that
   * predate a refresh (the `?? full` fallback reproduces the old behaviour).
   */
  movesFull?: number;
  hp: number;
  /** Builder charges; null for non-builders. */
  charges: number | null;
  /** B-5 FORTIFY (military units only): consecutive turns ended without a
   * move or attack, capped at 2. +3 CS defending at >=1, +6 at >=2. */
  fortifyTurns?: number;
  /** AUDIT B-4 XP: combat experience (player & rival units; barbs accrue none).
   * +5 per attack executed, +2 per attack survived as defender. XP_LEVELS
   * [15,45,90] grant +5 CS/level at every roll the unit fights. Civilians never
   * fight, so theirs stays 0. */
  xp?: number;
  /** Remaining multi-turn movement path (tile indexes), or null. */
  path: number[] | null;
  /** Standing order ('explore' keeps picking new frontier targets). */
  mission?: 'explore' | null;
  /** #45/B-6 EMBARK: a LAND unit currently on a water tile (embarked). Moves
   * at EMBARK_MOVES, cannot fortify/exert ZOC, and (N2) defends at a flat CS.
   * Naval units are never `embarked` — they belong on water natively. */
  embarked?: boolean;
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

/** A scripted rival empire: real map presence, real per-city economy. */
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
  /** A-19/B-33 (task #55 S1): rival-ids (0-based rival index) this rival is
   *  currently at war with — the per-pair war substrate BESIDE `atWar` (which
   *  stays the war-with-the-player boolean). Symmetric by construction via
   *  `setRivalWar`; the (0, r+1) player pair is NOT stored here. Empty in the
   *  t0 fixture, so the exporter's field-pick is untouched. Optional (the
   *  codebase's war-state convention: warWeariness?, spaceProjects?) — readers
   *  default to []. */
  atWarRivals?: number[];
  /** B-22 (task #55 S3): rival-ids whose current rival↔rival war with THIS civ
   *  is FORMAL (casus-belli: a denouncement ≥ RR_FORMAL_MIN_TURNS earlier).
   *  Symmetric with `atWarRivals` (both sides written); a war NOT listed here is
   *  SURPRISE (the default). Cleared when the pair makes peace. Empty at t0. */
  warKindFormal?: number[];
  /** B-22 (task #55 S3): directed denouncement stamps — `denouncedTurn[b] = t`
   *  means THIS civ denounced rival b at turn t. Persistent grudge (never reset).
   *  A war a→b is FORMAL iff `denouncedTurn[b]` exists and `turn - it >=
   *  RR_FORMAL_MIN_TURNS` at declaration. Sparse object, empty at t0. */
  denouncedTurn?: Record<number, number>;
  /** B-22 (2026-07-27): rival-ids this civ is ALLIED with. Symmetric by
   *  construction (both sides written), broken by a denouncement or a war.
   *  Allies never declare war on each other. Empty at t0. */
  alliedRivals?: number[];
  /** B-22 (2026-07-27): this civ's WARMONGER score (grievances). Grows on
   *  declaring war and taking cities, decays 1/turn at peace. Blocks
   *  alliances and, past RR_WARMONGER_GANG, invites unprovoked war. */
  warmonger?: number;
  /** B-15: this civ's war-weariness accumulator (integer), symmetric with the
   *  player's; feeds the same amenity penalty through rivalAmenityTiers. */
  warWeariness?: number;
  /** B-20 (#71): this rival's cumulative TOURISM (the player's twin). */
  tourism?: number;
  /** B-22 (#75): this rival's cumulative DIPLOMATIC FAVOR (the player's twin). */
  diploFavor?: number;
  /** B-22 (#76): this rival's DIPLOMATIC VICTORY POINTS (the player's twin). */
  diploPoints?: number;
  /** B-25 (#72): this rival's cumulative LIFETIME CULTURE — the twin of the
   *  player's `cultureTotal`. Real Civ 6 derives DOMESTIC TOURISTS from
   *  lifetime culture, so the Culture victory cannot be judged without it;
   *  `research.civicProgress` is spent down by every completed civic and is
   *  therefore NOT a lifetime total. */
  cultureTotal?: number;
  /** B-25: this civ's completed space-race project ids (chain progress). */
  spaceProjects?: string[];
  /** AUDIT A-11/A-12b: this civ's trade routes — `from` is always an own
   *  RivalCity id; domestic routes set `to` (own RivalCity id), routes to
   *  a met city-state set `toCs` (CityState id), B-23 international routes to
   *  a player city set `toPlayer` (player City id). `expiresTurn` is
   *  start + TRADE_ROUTE_DURATION (B-23 duration). */
  tradeRoutes?: { from: number; to?: number; toCs?: number; toPlayer?: number; expiresTurn?: number }[];
  /** AUDIT A-12: this civ's influence accumulator + banked envoys — the
   *  player's influencePoints/envoysAvailable twins. */
  influencePoints?: number;
  envoysAvailable?: number;
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
  /** B-18: the CLAIMED enhancer belief — a second earned Prophet enhances the
   * founded religion, denying an enhancer from the shared pool (like the
   * follower/founder claims). Unset until enhanced. */
  enhancerClaimed?: boolean;
  enhancerBelief?: string | null;
  /** B-18: this rival's HOLY tile — its capital center at founding, frozen; the
   * source of its religion's pressure spread (mirror of ReligionState.holyTile). */
  holyTile?: number | null;
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
  /** AUDIT A-5r (#71): tiles this civ has GOLD-purchased — the escalator in
   * rivalTilePurchaseCost, the player's state.tilesPurchased twin. */
  tilesPurchased?: number;
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
  /** B-18: Enhancer belief id, added by enhancing a founded religion (needs a
   * second Great Prophet). Effects are inert this round; the slot is real. */
  enhancer?: string | null;
  /** B-18: the HOLY tile — the founding city's center tile (the capital proxy),
   * frozen at founding; the source of religious pressure spread. -1/null = the
   * player has not founded. */
  holyTile?: number | null;
}

export interface TradeRoute {
  /** Origin city id (receives the yields). */
  from: number;
  /** Destination city id (-1 when the destination is a city-state). */
  to: number;
  /** Destination city-state id, if this is a city-state route. */
  toCs?: number;
  /** B-23 international: destination rival civ id (for a PLAYER route to a
   *  met rival's city). Paired with toRivalCity. */
  toRivalCiv?: number;
  /** B-23 international: destination rival city id, within toRivalCiv. */
  toRivalCity?: number;
  /** B-23 duration: the turn this route expires (start + TRADE_ROUTE_DURATION).
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
  /** A-18 (#79): is the PLAYER at war with this city-state? Real Civ 6 makes
   *  a city-state a separate player you must DECLARE on before attacking; this
   *  is that state. It gates both the attack MASK (attackTargets) and the
   *  resolver (meleeAttack), so a peaceful city-state can be neither offered to
   *  the autopilot nor struck by a UI/RL order. Absent = at peace. */
  atWar?: boolean;
  /** #50 (#79): turns elapsed since the player declared on this city-state —
   *  the `RivalCiv.warTurns` twin, gating when peace may be offered. */
  csWarTurns?: number;
  /** Siege hit points; absent = full (CS_MAX_HP). */
  hp?: number;
  /** Turn of the player's last militaristic levy here (cooldown). */
  lastLevyTurn?: number;
  /** AUDIT A-12: envoys each RIVAL civ has assigned here (index = rival
   *  id). The suzerain contest reads player `envoys` vs these. */
  rivalEnvoys?: number[];
  /** AUDIT A-12: which rivals have met this CS (index = rival id) —
   *  proximity contact (a rival city or unit within 3), not fog. */
  rivalMet?: boolean[];
  /** AUDIT A-12 (B8-L): the per-RIVAL deterministic quest (index = rival
   *  id) — the zero-draw twin of `quest`; the kind is the first satisfiable
   *  option in a fixed order, no RNG. */
  rivalQuest?: (CityStateQuest | null)[];
  /** AUDIT A-12 (B8-L): turn each rival's quest was last issued/cleared
   *  (index = rival id) — the reissue-cooldown clock, mirrors
   *  `questIssuedTurn`. */
  rivalQuestIssuedTurn?: number[];
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
