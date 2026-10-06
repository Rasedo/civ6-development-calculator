/**
 * THE IMPORTER: one turn of an autoplayed Civ 6 game (a `TurnRecord` from
 * `tools/civ6lab/h1/dump.py`) as the engine's `GameState`, so the engine's own
 * rule functions can be asked about the game's state.
 *
 * Every game row the engine has no id for is dropped and counted in `gaps`
 * (`<kind>:<game type>`): a civilization or leader outside `CIV_LEADERS`, a
 * building, unit, district, improvement, feature, resource, tech, civic,
 * policy, belief or wonder outside the catalogs. A civilization's unique
 * building, district or unit the engine does not carry as its own row
 * becomes the row it replaces (`BuildingReplaces` / `DistrictReplaces` /
 * `UnitReplaces`), which is how the engine stores them — a unique building
 * is its base row read through `effectiveBuilding`.
 *
 * Seats: the game's majors in ascending player id become seats 0..n-1, its
 * city-states city-state ids 0..m-1 in ascending player id, the Free Cities
 * player `FREE_SEAT`, the barbarians `BARB_SEAT`. Tile index = the game's
 * plot index (y * W + x, row = the game's y), the layout `world@1` uses.
 * The map wraps in x when the record's head says so (`GameMap.wrapX`).
 *
 * A city's worked plots are pinned (`Tile.locked`) and its district slots
 * take the game's specialist counts (`City.specialistPref`), so the engine's
 * yield walk works what the game works. Its great works, its build queue and
 * the World Congress's standing resolutions are carried as the record names
 * them (`importGreatWorks`, `importQueue`, `importCongress`). What a single turn does not say
 * (the best melee a seat has trained, a city's culture expansions, a seat's
 * plot purchases) comes from a `History` folded over the earlier records.
 */
import type { City, CityState, CityStateType, DistrictId, FeatureId, GameMap, GameState, GreatPersonClass, ImprovementId, Seat, TerrainId, Tile, TradeRoute, Unit, Yields } from '../core/types';
import { NO_SEAT } from '../core/types';
import { createGameFromMap } from '../core/game';
import { BARB_SEAT, FREE_SEAT, civOf, emptySeat, freeSeatOf, grantKey, isCiv, markCityCentre, seatOf, tileBelongsTo, seatOfCityState, setTileOwner, setWar } from '../core/seats';
import { stampTradingPost, tradeRouteMinDuration } from '../core/trade';
import { tradeCourse, tradeReach } from '../core/tradePath';
import { cityCentreYields, cityPlotBonus, cityYieldCtx, growthDetachResidue, luxuryAmenities, luxuryHoldings } from '../core/city';
import { tileYields } from '../core/yields';
import { riverReach } from '../core/disasters';
import { goldShortfall } from '../data/seats';
import { governorsOf } from '../core/governors';
import { envoysWith } from '../core/cityStates';
import { GOVERNOR_DEFAULT_PROMOTION, GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBit, promotionBitValue } from '../data/governors';
import { CIV_LEADERS, COMPETITIONS, COMPETITION_TURNS, DEAL_ITEMS, DEAL_LUXURY, DEAL_TURNS, DEDICATION_COMMEMORATIONS, GOV_INTOLERANCE, TOURISM_GOV_MULT, TOURISM_ROUTE_PCT } from '../data/seats';
import { BOOST_FRACTION } from '../data/boosts';
import { updateCulturalDominance } from '../core/seatTurn';
import { addSeatPerm } from '../core/gpAbility';
import { BUILDINGS, POWER_PLANT_IDS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { CIVICS } from '../data/civics';
import { TECHS } from '../data/techs';
import { UNITS, CITY_MAX_HP, UNIT_HP, BUILDER_COST_STEP, SETTLER_COST_STEP, FORMATION_CS } from '../data/units';
import { scaleByGameSpeed } from '../data/constants';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import { GOVERNMENTS, POLICIES, type SlotKind } from '../data/policies';
import { ENHANCER_BELIEFS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, PANTHEONS, WORSHIP_BELIEFS } from '../data/religion';
import { AGE_GOLDEN } from '../data/seats';
import { CITY_STATE_SUZERAIN_BONUS, CITY_STATE_TYPES } from '../data/cityStates';
import { PROMO_CLASSES } from '../data/promotions';
import { FEATURES, clearableFeatures, isFloodplains } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { hexDistance, neighborTile } from '../../world/hex';
import { YIELD_KEYS } from '../../world/types';
import { GP_BUILDING_YIELDS, GP_CITY_PERM, GP_CLASSES, GP_PERM, GP_RESOURCE_REVEAL, GP_TILE_PERM, GREAT_PEOPLE, gpChargesOf, gpEffectOf, type GreatPersonDef } from '../data/greatPeople';
import {
  GW_GP_EXTRA_SLOTS, GW_HOLDERS, GW_LAYOUT, GWO_ARTIFACT, GWO_LANDSCAPE, GWO_MUSIC, GWO_PORTRAIT, GWO_RELIC, GWO_RELIGIOUS,
  GWO_NAMES, GWO_SCULPTURE, GWO_WRITING, holderSlots, type GreatWork,
} from '../data/greatWorks';
import { CONGRESS_GROWTH_A, CONGRESS_GROWTH_B, CONGRESS_MIGRATION, CONGRESS_RESOLUTIONS, UDT_DISTRICTS } from '../data/seats';
import { CONGRESS_CURRENCIES } from '../core/congress';
import { PROJECTS, PROJECT_LIST, projectConversionRate } from '../data/projects';
import { GOVERNORS } from '../data/governors';
import { GOVERNMENT_LIST, POLICY_LIST } from '../data/policies';
import { LUXURY_IDS } from '../../world/resources';
import { SPY_MISSIONS, SPY_OFFENSIVE_MISSIONS } from '../data/espionage';
import type { QueueItem } from '../core/types';
import { projectCost, settlerCost, unitStepCost } from '../core/game';
import { builderCost, traderCost, unitDomain } from '../core/units';
import { carryLayout, computeUnlocks, governmentSlots } from '../core/effects';
import { ERA_BEGINS, eraCountdownStep } from '../core/eras';
import { districtSiteCost } from '../core/phase';
import { P, bool, num, plotAt, type Catalog, type DumpCity, type DumpPlayer, type DumpResolution, type TurnRecord } from './record';
import { aliases, engineId, gameHash } from './aliases';

export interface Imported {
  state: GameState;
  /** game player id -> engine seat */
  seatOfPlayer: Map<number, number>;
  /** engine seat -> game player id */
  playerOfSeat: Map<number, number>;
  /** a major's or a Free City's engine City, by `${gamePlayer}:${gameCityId}` */
  cityByKey: Map<string, City>;
  /** the game's city behind every imported engine City */
  dumpOfCity: Map<City, DumpCity>;
  /** a city-state's engine record, by game player id */
  minorOfPlayer: Map<number, CityState>;
  /** the game's city behind every imported city-state */
  dumpOfMinor: Map<CityState, DumpCity>;
  /** `<kind>:<game type>` -> how many rows of it were dropped or mapped */
  gaps: Map<string, number>;
  /** engine religion id (its founder's seat) by the game's religion type */
  religionSeat: Map<number, number>;
  /** cities whose culture-expansion count the history cannot know */
  tilesUnknown: Set<number>;
  /** cities the game holds no next plot for (`History.nextPlotUnheld`) */
  nextPlotUnheld: Set<number>;
  /** each city as the record of the turn before showed it, by
   *  `${gamePlayer}:${gameCityId}` (empty without that record) */
  cityBefore: Map<string, DumpCity>;
  /** the gaps met importing each seat (its research, government, policies,
   *  pantheon, its religion's beliefs) and each plot (a feature, resource or
   *  improvement dropped) */
  seatGaps: Map<number, Set<string>>;
  tileGaps: Map<number, Set<string>>;
  /** the gaps met importing each city (a building or district, its great
   *  works, the amenity ledgers the dump lacks), by `${gamePlayer}:${gameCityId}` */
  cityGaps: Map<string, Set<string>>;
  /** the World Congress resolutions in the record the importer could not
   *  carry into `GameState.congress` */
  congressGaps: string[];
  /** the resolutions in force for a seat's cities (`GameState.congress` as
   *  that seat reads it this record) */
  congressOf: (seat: number) => NonNullable<GameState['congress']>;
  /** does the record carry the queues' banked production (`queueProgress`)?
   *  Where it does not, every imported queue item stands at 0 */
  queueProgressRead: boolean;
  /** the yield columns (YIELD_KEYS order) of each plot the importer read
   *  back from the record to set hidden state — a Great Bath plot's Faith
   *  gives its flood count (`importFloodCounts`). A read-back column cannot
   *  disagree, so the plot checks leave it out */
  readBack: Map<number, Set<number>>;
  /** does the record carry each plot's coastal lowland band (`importLowlands`)?
   *  Where it does not, the bands are the engine's own derivation */
  lowlandsRead: boolean;
  /** the yield column (YIELD_KEYS order) of each city, by
   *  `${gamePlayer}:${gameCityId}`, whose district project's conversion the
   *  records cannot give (`importProjectYield`): the step that put the
   *  project's first Production in also paid in a bank no record holds, so
   *  `city.yields` leaves that column out */
  projectYieldUnread: Map<string, number>;
  /** every live trade route of the record, on its owner's `tradeRoutes`,
   *  beside the game's route table it came from */
  routes: { owner: number; route: TradeRoute; game: Record<string, unknown> }[];
  /** the engine's price each standing district held when it was placed, by
   *  `${gamePlayer}:${gameCityId}:${district row}` (`History.districtLocked`) */
  districtLocked: Map<string, number>;
}

const strip = (s: string, prefix: string) => (s.startsWith(prefix) ? s.slice(prefix.length) : s);

const TERRAIN_BASE: Record<string, TerrainId> = {
  GRASS: 'GRASSLAND', PLAINS: 'PLAINS', DESERT: 'DESERT', TUNDRA: 'TUNDRA', SNOW: 'SNOW',
};
const FEATURE_ID: Record<string, string> = {
  FEATURE_FOREST: 'WOODS', FEATURE_JUNGLE: 'RAINFOREST', FEATURE_BARRIER_REEF: 'GREAT_BARRIER_REEF',
  FEATURE_KILIMANJARO: 'MOUNT_KILIMANJARO', FEATURE_EVEREST: 'MOUNT_EVEREST',
  FEATURE_CLIFFS_DOVER: 'CLIFFS_OF_DOVER', FEATURE_BURNING_FOREST: 'BURNING_WOODS',
  FEATURE_BURNT_FOREST: 'BURNT_WOODS', FEATURE_BURNING_JUNGLE: 'BURNING_RAINFOREST',
  FEATURE_BURNT_JUNGLE: 'BURNT_RAINFOREST', FEATURE_DEVILSTOWER: 'DEVILS_TOWER',
};
/** the game's six river / cliff direction bits per plot: 1 = the plot lies NE
 *  of the edge (the edge is its SW side), 2 = NW of it (SE side), 4 = W of it
 *  (E side). The game's y grows NORTH and a record's rows are y, so the
 *  game's south is the engine's row - 1 — the engine's N directions
 *  (world/hex.ts: 0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE, NE = row - 1). The SW
 *  side is the engine's NW, the SE side its NE (1103 t3: Xian's centre lies
 *  beside a hill whose river runs along the hill's south, and is not fresh). */
const OWN_EDGES: [number, number][] = [[4, 0], [2, 1], [1, 2]];
/** the edges a neighbour's own bits carry, as [engine direction to the
 *  neighbour, the neighbour's bit]: its E side is our W, its SE side our SW
 *  (the neighbour lies game-NW, engine-SW), its SW side our SE */
const NEIGHBOUR_EDGES: [number, number][] = [[3, 4], [4, 2], [5, 1]];

interface Ctx {
  cat: Catalog;
  gaps: Map<string, number>;
  bReplace: Map<string, string>;
  dReplace: Map<string, string>;
  uReplace: Map<string, string>;
  wonders: Set<string>;
  /** the seat, plot or city a gap found now belongs to, when there is one */
  scopeSeat?: number;
  scopeTile?: number;
  scopeCity?: string;
  seatGaps?: Map<number, Set<string>>;
  tileGaps?: Map<number, Set<string>>;
  cityGaps?: Map<string, Set<string>>;
}

function gap(ctx: Ctx, kind: string, name: string): void {
  const k = `${kind}:${name}`;
  ctx.gaps.set(k, (ctx.gaps.get(k) ?? 0) + 1);
  const put = <K>(m: Map<K, Set<string>> | undefined, at: K | undefined) => {
    if (m === undefined || at === undefined) return;
    if (!m.has(at)) m.set(at, new Set());
    m.get(at)!.add(k);
  };
  put(ctx.seatGaps, ctx.scopeSeat);
  put(ctx.tileGaps, ctx.scopeTile);
  put(ctx.cityGaps, ctx.scopeCity);
}

/** A game row's engine id: its own (`engineId`), or — a civilization's
 *  unique row the engine does not carry — the row it replaces, counted as
 *  `<kind>-as-base`; null, counted as a `<kind>` gap, for neither. */
function rowId(ctx: Ctx, kind: string, name: string, prefix: string, known: object,
  replaces: Map<string, string>): string | null {
  const own = engineId(kind, name, prefix, known);
  if (own) return own;
  const base = replaces.get(name);
  const viaBase = base ? engineId(kind, base, prefix, known) : null;
  if (viaBase) {
    gap(ctx, `${kind}-as-base`, name);
    return viaBase;
  }
  gap(ctx, kind, name);
  return null;
}

function buildingId(ctx: Ctx, idx: number): string | null {
  return rowId(ctx, 'building', ctx.cat.buildings[idx], 'BUILDING_', BUILDINGS, ctx.bReplace);
}

function districtId(ctx: Ctx, idx: number): DistrictId | null {
  return rowId(ctx, 'district', ctx.cat.districts[idx], 'DISTRICT_', DISTRICTS, ctx.dReplace) as DistrictId | null;
}

export function unitId(ctx: Pick<Ctx, 'cat' | 'uReplace' | 'gaps'>, idx: number): string | null {
  return rowId(ctx as Ctx, 'unit', ctx.cat.units[idx], 'UNIT_', UNITS, ctx.uReplace);
}

/** A catalog row's engine id, as the importer maps it, outside an import: a
 *  building, district or unit index of `cat`. */
export function engineRowOf(cat: Catalog, kind: 'building' | 'district' | 'unit', idx: number): string | null {
  const ctx: Ctx = {
    cat, gaps: new Map(), bReplace: new Map(cat.buildingReplaces), dReplace: new Map(cat.districtReplaces),
    uReplace: new Map(cat.unitReplaces), wonders: new Set(cat.wonders),
  };
  return kind === 'building' ? buildingId(ctx, idx) : kind === 'district' ? districtId(ctx, idx) : unitId(ctx, idx);
}

const ALL_BELIEFS = { ...FOLLOWER_BELIEFS, ...FOUNDER_BELIEFS, ...WORSHIP_BELIEFS, ...ENHANCER_BELIEFS };

function beliefInto(ctx: Ctx, idx: number, rel: GameState['seats'][number]['religion']): void {
  const name = ctx.cat.beliefs[idx];
  const id = engineId('belief', name, 'BELIEF_', ALL_BELIEFS) ?? '';
  if (FOLLOWER_BELIEFS[id]) rel.follower = id;
  else if (FOUNDER_BELIEFS[id]) rel.founder = id;
  else if (WORSHIP_BELIEFS[id]) rel.worship = id;
  else if (ENHANCER_BELIEFS[id]) rel.enhancer = id;
  else gap(ctx, 'belief', name);
}

function tileOf(ctx: Ctx, rec: TurnRecord, i: number): Tile {
  const W = rec.head.W;
  const p = plotAt(rec, i);
  const tname = ctx.cat.terrains[p[P.terrain] as number];
  let terrain: TerrainId;
  let elevation: Tile['elevation'] = 'FLAT';
  if (tname === 'TERRAIN_COAST') terrain = p[P.isLake] === 1 ? 'LAKE' : 'COAST';
  else if (tname === 'TERRAIN_OCEAN') terrain = 'OCEAN';
  else {
    const parts = strip(tname, 'TERRAIN_').split('_');
    terrain = TERRAIN_BASE[parts[0]];
    if (parts[1] === 'HILLS') elevation = 'HILLS';
    if (parts[1] === 'MOUNTAIN') elevation = 'MOUNTAIN';
  }
  let feature: FeatureId | null = null;
  let volcano = false;
  const fi = p[P.feature] as number;
  if (fi >= 0) {
    const fname = ctx.cat.features[fi];
    if (fname === 'FEATURE_VOLCANO') volcano = true;
    else {
      const id = FEATURE_ID[fname] ?? strip(fname, 'FEATURE_');
      if (id in FEATURES) feature = id as FeatureId;
      else gap(ctx, 'feature', fname);
    }
  }
  let resource: string | null = null;
  let digs: Partial<Tile> = {};
  const ri = p[P.resource] as number;
  if (ri >= 0) {
    const rname = ctx.cat.resources[ri];
    const id = strip(rname, 'RESOURCE_');
    // the game's two dig "resources" are the engine's plot flags
    if (rname === 'RESOURCE_ANTIQUITY_SITE') digs = { antiquity: true };
    else if (rname === 'RESOURCE_SHIPWRECK') digs = { shipwreck: true };
    else if (RESOURCES[id]) resource = id;
    else gap(ctx, 'resource', rname);
  }
  let improvement: string | null = null;
  let goodyHut = false;
  const ii = p[P.improvement] as number;
  if (ii >= 0) {
    const iname = ctx.cat.improvements[ii];
    if (iname === 'IMPROVEMENT_GOODY_HUT') goodyHut = true;
    else if (iname !== 'IMPROVEMENT_BARBARIAN_CAMP') {
      const id = engineId('improvement', iname, 'IMPROVEMENT_', IMPROVEMENTS);
      if (id) improvement = id as ImprovementId;
      else gap(ctx, 'improvement', iname);
    }
  }
  const route = p[P.route] as number;
  const routeName = route >= 0 ? ctx.cat.routes[route] : '';
  return {
    index: i,
    col: i % W,
    row: Math.floor(i / W),
    terrain,
    elevation,
    feature,
    resource,
    riverMask: 0,
    cliffMask: 0,
    improvement,
    district: null,
    districtComplete: false,
    builtWonder: null,
    builtWonderComplete: false,
    pillaged: p[P.improvementPillaged] === 1,
    districtPillaged: false,
    goodyHut,
    volcano,
    fertility: 0,
    fertilityProd: 0,
    droughtTurns: 0,
    ownerSeat: NO_SEAT,
    ownerCity: -1,
    ...(route >= 0 ? { road: true } : {}),
    ...(routeName === 'ROUTE_RAILROAD' ? { railroad: true } : {}),
    ...digs,
  };
}

function edgeMask(map: GameMap, rec: TurnRecord, t: Tile, field: number): number {
  const own = plotAt(rec, t.index)[field] as number;
  let m = 0;
  for (const [bit, d] of OWN_EDGES) if (own & bit) m |= 1 << d;
  for (const [d, bit] of NEIGHBOUR_EDGES) {
    const n = neighborTile(map, t, d);
    if (n && ((plotAt(rec, n.index)[field] as number) & bit)) m |= 1 << d;
  }
  return m;
}

function leaderRow(leader: string): number {
  const id = strip(leader, 'LEADER_');
  return CIV_LEADERS.findIndex((l) => l.leader === id);
}

/**
 * WHAT ONE TURN'S STATE DOES NOT SAY, read off the records before it: the
 * strongest melee unit each player has trained or bought (a city centre's
 * base, `Seat.bestMeleeCS`), how many plots each city has taken with culture
 * (`City.tilesAcquired`, what a border expansion costs), the Builders
 * each player has gained, and the age every closed era gave each player with
 * the era score it began the current one on. All are reconstructed from
 * diffs — a unit id new at t+1, a culture box that fell, age thresholds that
 * moved — so a game recorded from its first turn carries them; a city first
 * seen after its founding turn is `unknownSince`, and a check reading its
 * count is skipped.
 */
export interface History {
  firstTurn: number;
  last: TurnRecord | null;
  /** the record folded in before `last`, and the one before that */
  before: TurnRecord | null;
  beforeThat: TurnRecord | null;
  /** the World Congress table the record before the current one showed */
  congressBefore?: unknown;
  bestMelee: Map<number, number>;
  /** units a major holds levied from a city-state, by `owner:id`, with the
   *  city-state's player id: a city-state's unit gone at t+1 beside a new
   *  one of its type under the major */
  levied: Map<string, number>;
  /** culture expansions by the city's centre plot (a capture keeps them) */
  cultureTaken: Map<number, number>;
  /** the residue each city's growth accumulator keeps, in 256ths, by its
   *  centre plot (`City.growthDrift`, `foldGrowthDrift`) */
  growthDrift: Map<number, number>;
  /** Builders each player has gained: a Builder id new at t+1 */
  builders: Map<number, number>;
  /** Great People each player has spent, by class: a Great Person unit of
   *  the player's at t gone at t+1 */
  gpSpent: Map<number, Map<GreatPersonClass, number>>;
  /** the resources each player SEES ahead of their revealing technology
   *  (`GP_RESOURCE_REVEAL`, James Young's Oil) where the records name no
   *  Great Person (`History.people` null): a plot the player reads paying the
   *  resource's yield without the technology is the grant, latched */
  revealed: Map<number, Set<string>>;
  /** centre plots of cities already standing at the first record past turn 1 */
  unknownSince: Set<number>;
  /** centre plots of the last record's cities that the record before did not
   *  hold or that gained a plot without their culture box paying for it (a
   *  founding, a purchase): the game holds no next plot for them until its
   *  next culture step */
  nextPlotUnheld: Set<number>;
  /** a fire's fertility by plot: +1 Food when it turns burnt, +1 Production
   *  when its feature regrows (`RandomEvent_Yields` Turns 2 and 6) */
  fireFood: Map<number, number>;
  fireProd: Map<number, number>;
  /** a random event's fertility by plot, [Food, Production, Science] — the
   *  game's own per-plot draw off `RandomEvent_Yields`, read as the record's
   *  yields against the record before: what a plot gained when it turned to
   *  Volcanic Soil (the feature the soil replaced given back), and what a
   *  plot gained with nothing else about it or its owner moving (a flood, a
   *  storm, a blizzard) */
  eventYields: Map<number, [number, number, number]>;
  /** each plot's yields at the last record it stood bare (no working
   *  improvement, district, wonder or revealed-by-research resource), keyed
   *  by its feature, owner and resource then, and the draws read on it by
   *  then */
  bare: Map<number, { key: string; y: number[]; ev: number[] }>;
  /** each player's district-discount count (`Seat.discountDistricts`): the
   *  specialty districts it had completed at the record before its research
   *  last moved — the count the game took when the technology or civic
   *  completed, ahead of that turn's productions */
  discountDistricts: Map<number, number>;
  /** the age each era transition gave each player, in order (`AGE_DARK`,
   *  `AGE_NORMAL`, `AGE_GOLDEN_ONLY`, `AGE_HEROIC`) */
  ages: Map<number, number[]>;
  /** the turns a new era began on: the first record whose age thresholds
   *  moved for any major (the world's era is the game's, one for all) */
  eraTurns: number[];
  /** the game era as the game began them (an ERAS index and its first
   *  turn), and the countdown the engine's rule (`eraCountdownStep`) runs
   *  over the records' player eras */
  gameEra: number;
  eraStartTurn: number;
  eraCountdown: number;
  /** the once-moment keys each player has recorded by the engine's rule
   *  across the pairs so far, and the world's (`eraChecks`) */
  moments: Map<number, number[]>;
  momentsWorld: number[];
  /** the first record each live trade route was seen in, by `routeKey` */
  routeSeen: Map<string, number>;
  /** each live route's course as the first record it was seen in laid it,
   *  by `routeKey`: the game paths a route once, when it begins */
  routeCourse: Map<string, number[]>;
  /** the plots each live route's Trader stood on, record by record, by
   *  `routeKey` (a plot repeated is kept once) */
  trail: Map<string, number[]>;
  /** the Trading Posts each player holds, by centre plot: both ends of
   *  every route that left the records while its Trader lived on (a route
   *  run to its end; a plundered route takes its Trader with it) */
  posts: Map<number, Set<number>>;
  /** each major's policy slots as each record listed them, by player and
   *  turn: the government, the slot kinds, the card in each slot and the
   *  cards slotted without their modifiers (`importLapsed`) */
  policySlots: Map<number, Map<number, PolicySlots>>;
  /** the last record a project only one scored competition counts stood in
   *  a queue, by `COMPETITIONS` place */
  competitionSeen: Map<number, number>;
  /** the competitions each player took the podium's top of, [competition,
   *  0 gold (the top tier alone) / 1 the top tier shared] */
  podium: Map<number, [number, number][]>;
  /** each major's lifetime culture as the game counts it (`Seat.cultureTotal`):
   *  every gain of civic progress — a turn's culture while a civic is
   *  chosen, the culture held while none is once one is, a boost's share of
   *  a civic not yet held (PlayerCulture 0x3a1fb0) — and the culture held */
  culture: Map<number, number>;
  cultureHeld: Map<number, number>;
  /** each major's tourism banked toward each major it has met, by `p:o`
   *  (`Seat.tourismTo`): the record's tourism through the pair's route and
   *  government terms of `tourismIntlPct` */
  tourismTo: Map<string, number>;
  /** the majors each major is culturally dominant over (`updateCulturalDominance`) */
  dominant: Map<number, Set<number>>;
  /** the districts a city quoted while they did not stand in it, by
   *  `${gamePlayer}:${gameCityId}:${district row}`, the engine's price for
   *  each at the latest record it did not stand, and the price each locked
   *  at placement: the engine's at the record before the first it stood
   *  (that record's turn placed it), else at that first record, itself left
   *  out of the city */
  districtQuoted: Set<string>;
  districtPriced: Map<string, { turn: number; price: number }>;
  districtLocked: Map<string, number>;
  /** the floods the records' `events` named, by `${turn}:${RandomEvents
   *  index}`, each with the plot it started on; null where no record carried
   *  `events` */
  floods: Map<string, number> | null;
  /** the sea level the records' `events` reached: the highest
   *  RANDOM_EVENT_SEA_LEVEL_RISE<n> named */
  seaLevel: number;
  /** every great person the records' `greatPeople` named, by
   *  GreatPersonIndividuals index; null where no record carried it */
  people: Map<number, RecruitedPerson> | null;
}

/** A recruited great person as the records follow it: the unit that carried
 *  it (`owner:id`, bound the record it was first listed in, to a Great
 *  Person unit of its claimant and class new in that record), the plot that
 *  unit last stood on, and the turn the records first lacked the unit — its
 *  charges spent. A person listed with no new unit to carry it was spent
 *  before the record. */
interface RecruitedPerson {
  player: number;
  cls: string;
  unit: string | null;
  at: number;
  spent: number | null;
}

interface PolicySlots {
  gov: number;
  kinds: SlotKind[];
  cards: (string | null)[];
  lapsed: Set<string>;
}

/** A record route's identity: its Trader and its two cities. */
function routeKey(r: Record<string, number>): string {
  return `${r.TraderUnitPlayer}:${r.TraderUnitID}:${r.OriginCityPlayer}:${r.OriginCityID}:${r.DestinationCityPlayer}:${r.DestinationCityID}`;
}

/** Every trade route a record carries, as the game's route tables. */
function recordRoutes(rec: TurnRecord): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (const c of rec.cities) {
    if (Array.isArray(c.routes)) out.push(...(c.routes as Record<string, number>[]));
  }
  return out;
}

export const AGE_DARK = 0;
export const AGE_NORMAL = 1;
export const AGE_GOLDEN_ONLY = 2;
export const AGE_HEROIC = 3;

/** a record player's age, read off the game's three age flags */
export function ageOf(p: DumpPlayer): number {
  return bool(p.heroic) ? AGE_HEROIC : bool(p.goldenAge) ? AGE_GOLDEN_ONLY : bool(p.darkAge) ? AGE_DARK : AGE_NORMAL;
}

/** a record's major players' own eras, in id order */
export function majorEras(rec: TurnRecord): number[] {
  return [...rec.players].sort((a, b) => a.id - b.id).filter((p) => bool(p.major)).map((p) => num(p.era));
}

/** Did a new era begin between two records: has any major's pair of age
 *  thresholds moved? */
export function eraBegan(a: TurnRecord, b: TurnRecord): boolean {
  for (const p1 of b.players) {
    if (!bool(p1.major)) continue;
    const p0 = a.players.find((q) => q.id === p1.id);
    if (p0 && (num(p0.darkThreshold) !== num(p1.darkThreshold) || num(p0.goldenThreshold) !== num(p1.goldenThreshold))) {
      return true;
    }
  }
  return false;
}

export function newHistory(): History {
  return { firstTurn: -1, last: null, before: null, beforeThat: null, bestMelee: new Map(), levied: new Map(), cultureTaken: new Map(), growthDrift: new Map(), builders: new Map(), gpSpent: new Map(), revealed: new Map(),
    unknownSince: new Set(), nextPlotUnheld: new Set(), fireFood: new Map(), fireProd: new Map(), eventYields: new Map(), bare: new Map(), discountDistricts: new Map(), ages: new Map(), moments: new Map(), momentsWorld: [],
    eraTurns: [], gameEra: 0, eraStartTurn: 1, eraCountdown: -1, routeSeen: new Map(), routeCourse: new Map(), trail: new Map(), posts: new Map(), policySlots: new Map(),
    competitionSeen: new Map(), podium: new Map(), culture: new Map(), cultureHeld: new Map(), tourismTo: new Map(),
    dominant: new Map(), districtQuoted: new Set(), districtPriced: new Map(), districtLocked: new Map(), floods: null, seaLevel: 0, people: null };
}

/** Fold a record's `events` into the history: the floods (each with its
 *  start plot) and the sea level. */
function foldEvents(h: History, rec: TurnRecord, cat: Catalog): void {
  if (!Array.isArray(rec.events)) return;
  h.floods ??= new Map();
  for (const [turn, type, , start] of rec.events) {
    const name = cat.randomEvents?.[type] ?? '';
    const rise = /^RANDOM_EVENT_SEA_LEVEL_RISE(\d+)$/.exec(name);
    if (rise) h.seaLevel = Math.max(h.seaLevel, Number(rise[1]));
    if (name.startsWith('RANDOM_EVENT_FLOOD_') && num(start) >= 0) h.floods.set(`${turn}:${type}`, num(start));
  }
}

/** Fold a record's `greatPeople` into the history (`RecruitedPerson`);
 *  false where the record carries none. */
function foldPeople(h: History, rec: TurnRecord, cat: Catalog): boolean {
  if (!Array.isArray(rec.greatPeople)) return false;
  const W = rec.head.W;
  h.people ??= new Map();
  const live = new Map(rec.units.map((u) => [`${u.owner}:${u.id}`, u]));
  const before = new Set((h.last ?? { units: [] }).units.map((u) => `${u.owner}:${u.id}`));
  const bound = new Set([...h.people.values()].map((p) => p.unit).filter((u): u is string => u !== null));
  for (const [ind, player, cls] of rec.greatPeople) {
    if (h.people.has(ind)) continue;
    const name = strip(cat.greatPersonClasses?.[cls] ?? '', 'GREAT_PERSON_CLASS_');
    const unit = rec.units.find((u) => u.owner === player && cat.units[u.type] === `UNIT_GREAT_${name}`
      && !before.has(`${u.owner}:${u.id}`) && !bound.has(`${u.owner}:${u.id}`));
    const key = unit ? `${unit.owner}:${unit.id}` : null;
    if (key) bound.add(key);
    h.people.set(ind, { player, cls: name, unit: key, at: unit ? unit.y * W + unit.x : -1, spent: unit ? null : rec.turn });
  }
  for (const p of h.people.values()) {
    if (p.spent !== null || p.unit === null) continue;
    const u = live.get(p.unit);
    if (u) p.at = u.y * W + u.x;
    else p.spent = rec.turn;
  }
  return true;
}

/** A GreatPersonIndividuals index's engine person, or undefined. */
function personOf(cat: Catalog, ind: number): GreatPersonDef | undefined {
  const pid = aliasOrPrefixed(cat.greatPeople?.[ind] ?? '');
  return pid ? PEOPLE[pid] : undefined;
}

/** The record's cultural dominance by the engine's rule, each major in id
 *  order as each major's turn takes it, on the history's banks. */
function foldDominance(h: History, rec: TurnRecord): void {
  const majors = rec.players.filter((p) => bool(p.major)).sort((a, b) => a.id - b.id);
  const seats = majors.map((p, i) => {
    const s = emptySeat(i);
    s.cultureTotal = h.culture.get(p.id) ?? 0;
    s.tourismTo = majors.map((o) => h.tourismTo.get(`${p.id}:${o.id}`) ?? 0);
    s.culturallyDominant = majors.map((o) => h.dominant.get(p.id)?.has(o.id) ?? false);
    return s;
  });
  majors.forEach((p, i) => {
    updateCulturalDominance(seats, seats[i]);
    h.dominant.set(p.id, new Set(majors.filter((_o, j) => seats[i].culturallyDominant![j]).map((o) => o.id)));
  });
}

/** Fold one record's culture and tourism into the history's lifetime banks:
 *  `prev`'s yields land by `rec`, a boost `rec` shows first lands at once. */
function foldCultureTourism(h: History, prev: TurnRecord, rec: TurnRecord, cat: Catalog): void {
  const majors = prev.players.filter((p) => bool(p.major));
  const routed = new Set(recordRoutes(prev).map((r) => `${r.OriginCityPlayer}:${r.DestinationCityPlayer}`));
  const govOf = (p: DumpPlayer) => strip(cat.governments[num(p.government)] ?? '', 'GOVERNMENT_');
  for (const p of majors) {
    const cy = num(p.cultureYield);
    if (num(p.civic) >= 0) {
      h.culture.set(p.id, (h.culture.get(p.id) ?? 0) + (h.cultureHeld.get(p.id) ?? 0) + cy);
      h.cultureHeld.set(p.id, 0);
    } else {
      h.cultureHeld.set(p.id, (h.cultureHeld.get(p.id) ?? 0) + cy);
    }
    const q = rec.players.find((x) => x.id === p.id);
    const was = p.civicBoosts ?? '';
    const now = q?.civicBoosts ?? '';
    for (let k = 0; k < now.length; k++) {
      if (now[k] !== '1' || was[k] === '1' || (q?.civics ?? '')[k] === '1') continue;
      const cost = CIVICS[strip(cat.civics[k] ?? '', 'CIVIC_')]?.cost ?? 0;
      h.culture.set(p.id, (h.culture.get(p.id) ?? 0) + Math.round(cost * BOOST_FRACTION));
    }
    const met = new Set((p.met ?? []).map(num));
    for (const o of majors) {
      if (o.id === p.id || !met.has(o.id)) continue;
      let pct = routed.has(`${p.id}:${o.id}`) ? TOURISM_ROUTE_PCT : 0;
      const ga = govOf(p);
      const gb = govOf(o);
      if (ga !== gb) pct -= ((GOV_INTOLERANCE[ga] ?? 0) + (GOV_INTOLERANCE[gb] ?? 0)) * TOURISM_GOV_MULT;
      const k = `${p.id}:${o.id}`;
      h.tourismTo.set(k, (h.tourismTo.get(k) ?? 0) + Math.floor(num(p.tourism) * Math.max(0, 100 + pct) / 100));
    }
  }
}

/** The copies of a progressive chassis a player's price quotes stand at: the
 *  fewest `n` whose `price(n)` is the highest quote among its cities (a
 *  city's queued copy holds the lower price it locked), or undefined where no
 *  city quotes the row or no count reaches the quote. */
function copiesQuoted(rec: TurnRecord, cat: Catalog, pid: number, unitName: string,
  price: (n: number) => number): number | undefined {
  const idx = cat.units.indexOf(unitName);
  if (idx < 0) return undefined;
  let top = -1;
  for (const c of rec.cities) {
    if (c.owner !== pid) continue;
    for (const b of c.buy) if (b[0] === 'U' && b[1] === idx && num(b[2]) > top) top = num(b[2]);
  }
  if (top < 0) return undefined;
  for (let n = 0; n < 200; n++) {
    const v = price(n);
    if (v === top) return n;
    if (v > top) return undefined;
  }
  return undefined;
}

/** Fold one record into the history, in turn order. */
export function advanceHistory(h: History, rec: TurnRecord, cat: Catalog): void {
  const W = rec.head.W;
  const uReplace = new Map(cat.unitReplaces);
  // what a unit new at this record raises its owner's base to
  // (`raiseBestMelee`): a land or naval fighting unit's Combat with its
  // formation's strength
  const made = (idx: number, formation: number) => {
    const id = unitId({ cat, uReplace, gaps: new Map() }, idx);
    const def = id ? UNITS[id] : undefined;
    return def && def.combat > 0 && unitDomain(id!) === 'military' ? def.combat + (FORMATION_CS[formation] ?? 0) : 0;
  };
  // a resource a player reads paying its yield without the revealing
  // technology: the grant (`GP_RESOURCE_REVEAL`) where the records name no
  // great person, and a reading no random event made either way. An unowned
  // plot is the local player's reading.
  const newlyRevealed = new Map<number, Set<string>>();
  foldEvents(h, rec, cat);
  // a person spent by this record: a resource it reveals moves its owner's
  // plots this turn
  for (const [ind, p] of foldPeople(h, rec, cat) ? h.people! : []) {
    if (p.spent !== rec.turn) continue;
    const person = personOf(cat, ind);
    for (const r of GP_RESOURCE_REVEAL) {
      if (!person || !gpEffectOf(person).perm?.[r.perm]) continue;
      if (!newlyRevealed.has(p.player)) newlyRevealed.set(p.player, new Set());
      newlyRevealed.get(p.player)!.add(r.resource);
    }
  }
  for (const { resource } of GP_RESOURCE_REVEAL) {
    const def = RESOURCES[resource];
    const ri = cat.resources.indexOf(`RESOURCE_${resource}`);
    const tech = cat.techs.indexOf(`TECH_${def?.revealTech}`);
    if (!def || ri < 0 || tech < 0) continue;
    for (let i = 0; i < W * rec.head.H; i++) {
      const p = plotAt(rec, i);
      if (p[P.resource] !== ri || (p[P.improvement] as number) >= 0) continue;
      const y = p[P.yields] as number[];
      if (!Array.isArray(y) || YIELD_KEYS.some((k, j) => (def.yields[k] ?? 0) > 0 && y[j] < (def.yields[k] ?? 0))) continue;
      const owner = p[P.owner] as number;
      const pid = owner >= 0 ? owner : num(rec.head.localPlayer);
      const pl = rec.players.find((q) => q.id === pid);
      if (!pl || (pl.techs ?? '')[tech] === '1' || h.revealed.get(pid)?.has(resource)) continue;
      if (!h.revealed.has(pid)) h.revealed.set(pid, new Set());
      h.revealed.get(pid)!.add(resource);
      if (!newlyRevealed.has(pid)) newlyRevealed.set(pid, new Set());
      newlyRevealed.get(pid)!.add(resource);
    }
  }
  if (h.last === null) {
    h.firstTurn = rec.turn;
    if (rec.turn > 1) for (const c of rec.cities) h.unknownSince.add(c.y * W + c.x);
  } else {
    const seen = new Set(h.last.units.map((u) => `${u.owner}:${u.id}`));
    const builder = cat.units.indexOf('UNIT_BUILDER');
    // a unit another player lost this turn: a new one of its type close by is
    // that unit changing hands (a levy, a capture), which raises nothing
    const live = new Set(rec.units.map((u) => `${u.owner}:${u.id}`));
    const handed = h.last.units.filter((u) => !live.has(`${u.owner}:${u.id}`));
    const shape = { width: W, height: rec.head.H, wrapX: bool(rec.head.wrapX) };
    const minors = new Set(rec.players.filter((p) => bool(p.minor)).map((p) => p.id));
    for (const u of rec.units) {
      if (seen.has(`${u.owner}:${u.id}`)) continue;
      const from = handed.find((g) => g.owner !== u.owner && g.type === u.type && hexDistance(shape, g.x, g.y, u.x, u.y) <= 3);
      // a city-state's unit handed to a major is a levy (`Unit.leviedFrom`)
      if (from && minors.has(from.owner) && !minors.has(u.owner)) h.levied.set(`${u.owner}:${u.id}`, from.owner);
      const cs = from ? 0 : made(u.type, Math.max(0, num(u.formation)));
      if (cs > (h.bestMelee.get(u.owner) ?? 0)) h.bestMelee.set(u.owner, cs);
      if (u.type === builder) h.builders.set(u.owner, (h.builders.get(u.owner) ?? 0) + 1);
    }
    const now = new Set(rec.units.map((u) => `${u.owner}:${u.id}`));
    for (const u of h.last.units) {
      const cls = strip(cat.units[u.type] ?? '', 'UNIT_GREAT_') as GreatPersonClass;
      if (now.has(`${u.owner}:${u.id}`) || !GP_CLASSES.includes(cls)) continue;
      const spent = h.gpSpent.get(u.owner) ?? new Map<GreatPersonClass, number>();
      spent.set(cls, (spent.get(cls) ?? 0) + 1);
      h.gpSpent.set(u.owner, spent);
    }
    const before = new Map(h.last.cities.map((c) => [c.y * W + c.x, c]));
    h.nextPlotUnheld.clear();
    for (const c of rec.cities) {
      const k = c.y * W + c.x;
      const b = before.get(k);
      if (!b || b.owner !== c.owner) {
        h.nextPlotUnheld.add(k);
        continue;
      }
      // the box fell on a plot gained or a next plot held: culture paid for
      // it (a box that falls with no plot gained and none to claim moves no
      // price: runs/h1_duelw1108, Xi'an's 307 from t207 while its box
      // emptied every nine turns)
      const paid = num(c.culture) < num(b.culture) - 0.01
        && (c.plots.length > b.plots.length || num(b.nextPlot) >= 0);
      if (paid) h.cultureTaken.set(k, (h.cultureTaken.get(k) ?? 0) + 1);
      // a box pays for one plot; any more came another way
      if (c.plots.length - b.plots.length > (paid ? 1 : 0)) h.nextPlotUnheld.add(k);
    }
    const fname = (i: number) => cat.features[plotAt(rec, i)[P.feature] as number] ?? '';
    const fwas = (i: number) => cat.features[plotAt(h.last!, i)[P.feature] as number] ?? '';
    // signed: an event that lowers a plot for a while (a drought) is undone
    // by its recovery. No event lays yields on water or a mountain (the
    // eruption's soil skips a water plot, tools/civ6lab/dll_readings.md; the
    // engine's `silt`): a water plot's moves are a building's or research's
    // (runs/h1_duelw1108, plot 930: the Crabs read +1 Food over its bare
    // reading when a storm took its Fishing Boats at t131, Hunza's Lighthouse
    // built since)
    const dry = (i: number) => !/_(COAST|OCEAN|MOUNTAIN)$/.test(cat.terrains[plotAt(rec, i)[P.terrain] as number] ?? '')
      && plotAt(rec, i)[P.isLake] !== 1;
    const addEvent = (i: number, f: number, pr: number, sc: number) => {
      if ((!f && !pr && !sc) || !dry(i)) return;
      const acc = h.eventYields.get(i) ?? [0, 0, 0];
      h.eventYields.set(i, [acc[0] + f, acc[1] + pr, acc[2] + sc]);
    };
    // the players whose own rows moved a plot's yields this turn: a pantheon
    // or a government may reach any plot (`moved`); a card pays a plot only
    // through its improvement, so a card change moves the working improved
    // plots alone (`movedImproved`: runs/h1_duelw1108, plot 514, a bare
    // Desert +1 Food at t152 beside a card swap); a technology or a civic
    // only an improved or resource plot (`movesPlot`)
    const moved = new Set<number>();
    const movedImproved = new Set<number>();
    const gained = new Map<number, Set<string>>();
    for (const q of rec.players) {
      const q0 = h.last.players.find((x) => x.id === q.id);
      if (!q0 || JSON.stringify([q.pantheon, q.government]) !== JSON.stringify([q0.pantheon, q0.government])) moved.add(q.id);
      else if (JSON.stringify(q.policies) !== JSON.stringify(q0.policies)) movedImproved.add(q.id);
      const got = new Set<string>();
      for (const [bits, names, prefix] of [[q.techs, cat.techs, 'TECH_'], [q.civics, cat.civics, 'CIVIC_']] as const) {
        const was = (q0 ? (prefix === 'TECH_' ? q0.techs : q0.civics) : '') ?? '';
        for (let k = 0; k < (bits ?? '').length; k++) {
          if (bits[k] === '1' && was[k] !== '1') got.add(strip(names[k] ?? '', prefix));
        }
      }
      gained.set(q.id, got);
    }
    // the research that moves a plot's yields: a resource's revealing
    // technology, and the rows that pay an improvement more
    const movesPlot = (i: number, got: Set<string>) => {
      if (got.size === 0) return false;
      const res = plotAt(rec, i)[P.resource] as number;
      const rid = res >= 0 ? strip(cat.resources[res] ?? '', 'RESOURCE_') : '';
      if (rid && RESOURCES[rid]?.revealTech && got.has(RESOURCES[rid].revealTech!)) return true;
      const imp = plotAt(rec, i)[P.improvement] as number;
      if (imp < 0) return false;
      const iid = strip(cat.improvements[imp] ?? '', 'IMPROVEMENT_');
      for (const r of got) {
        const fx = TECHS[r]?.effects ?? CIVICS[r]?.effects ?? [];
        if (fx.some((e) => (e.kind === 'improvementYields' && e.improvement === iid) || (e.kind === 'farmAdjacency' && iid === 'FARM'))) return true;
      }
      const ry = IMPROVEMENTS[iid as ImprovementId]?.researchYields ?? [];
      return ry.some((y) => (y.tech && got.has(y.tech)) || (y.civic && got.has(y.civic)));
    };
    // the plots of a city where a building that pays plots (`cityPlotBonus`)
    // moved this turn: built, sold, pillaged or repaired; a wonder paying
    // the whole empire's plots moves every city of its owner's
    // (runs/h1_duelw1108, plot 574: Rome's Marsh +1 Production +2 Science
    // when Mediolanum completed the Etemenanki at t172)
    const cityMoved = new Set<number>();
    const bwas = new Map(h.last.cities.map((c) => [`${c.owner}:${c.id}`, c.buildings]));
    const pays = new Map<number, boolean>();
    const paysAt = (bi: number) => {
      if (!pays.has(bi)) pays.set(bi, paysPlots(cat, bi));
      return pays.get(bi)!;
    };
    for (const c of rec.cities) {
      const was = new Set((bwas.get(`${c.owner}:${c.id}`) ?? []).map((b) => JSON.stringify(b)));
      const now = new Set(c.buildings.map((b) => JSON.stringify(b)));
      const diff = [...c.buildings.filter((b) => !was.has(JSON.stringify(b))),
        ...(bwas.get(`${c.owner}:${c.id}`) ?? []).filter((b) => !now.has(JSON.stringify(b)))];
      if (!diff.some((b) => paysAt(b[0] as number))) continue;
      const all = diff.some((b) => paysEmpire(cat, b[0] as number));
      for (const d of rec.cities) if (d === c || (all && d.owner === c.owner)) for (const q of d.plots) cityMoved.add(q);
    }
    const preserve = cat.districts.indexOf('DISTRICT_PRESERVE');
    const centre = cat.districts.indexOf('DISTRICT_CITY_CENTER');
    const same = (i: number, k: number) => plotAt(rec, i)[k] === plotAt(h.last!, i)[k];
    const still = (i: number) => same(i, P.feature) && same(i, P.resource) && same(i, P.improvement)
      && same(i, P.improvementPillaged) && same(i, P.district) && same(i, P.wonder) && same(i, P.owner);
    const nbr = (i: number) => {
      const r = Math.floor(i / W);
      const c = i % W;
      const odd = r & 1;
      const out: number[] = [];
      for (const [dc, dr] of [[1, 0], [-1, 0], [odd, -1], [odd - 1, -1], [odd, 1], [odd - 1, 1]]) {
        const rr = r + dr;
        if (rr < 0 || rr >= rec.head.H) continue;
        out.push(rr * W + (((c + dc) % W) + W) % W);
      }
      return out;
    };
    for (let i = 0; i < W * rec.head.H; i++) {
      const was = fwas(i);
      const now = fname(i);
      if (was === now) {
        // an improvement gone or pillaged with nothing else about the plot
        // moving (a flood's wash): its draw is what the bare plot reads above
        // the bare plot of the last record that held no working improvement
        // on the same ground (runs/h1_duelw1105, plot 583: a Farm 3 Food at
        // t34, washed at t43 to 3 Food 1 Production where the bare plot read
        // 2 and 0), less the draws already read since that record; a
        // resource a technology reveals is left out, its reading moved by
        // research too (runs/h1_duelw1108, plot 743: a Rice Farm washed at
        // t175 to 5 Food 1 Production where the bare plot read 3 and 0, one
        // Food of it read at t58). A pillaged improvement pays nothing, so its
        // plot reads bare (runs/h1_duelw1108, plots 699 and 744: Farms 3 Food
        // at t34, pillaged at t35 still reading 3 where the bare plots read 2
        // and 2)
        const res = plotAt(rec, i)[P.resource] as number;
        const bareKey = `${plotAt(rec, i)[P.feature]}|${plotAt(rec, i)[P.owner]}|${res}`;
        const y1 = plotAt(rec, i)[P.yields] as number[];
        const unimproved = (r: TurnRecord) => (plotAt(r, i)[P.improvement] as number) < 0
          || plotAt(r, i)[P.improvementPillaged] === 1;
        const bare = unimproved(rec) && (plotAt(rec, i)[P.district] as number) < 0
          && (plotAt(rec, i)[P.wonder] as number) < 0 && Array.isArray(y1)
          && (res < 0 || !RESOURCES[strip(cat.resources[res] ?? '', 'RESOURCE_')]?.revealTech);
        const acc = h.eventYields.get(i) ?? [0, 0, 0];
        if (bare && !unimproved(h.last) && same(i, P.owner) && same(i, P.resource)
          && same(i, P.district) && !cityMoved.has(i)) {
          const b = h.bare.get(i);
          const owner = plotAt(rec, i)[P.owner] as number;
          if (b && b.key === bareKey && !(owner >= 0 && moved.has(owner))) {
            const draw = (k: number, a: number) => Math.max(0, y1[k] - b.y[k] - (acc[a] - b.ev[a]));
            addEvent(i, draw(0, 0), draw(1, 1), draw(3, 2));
          }
        }
        if (bare) h.bare.set(i, { key: bareKey, y: [...y1], ev: [...(h.eventYields.get(i) ?? [0, 0, 0])] });
        // a building that pays the city's plots, farmed or not, moved the
        // improved plot: it moves the bare reading the same (runs/h1_duelw1108,
        // plot 743: the Rice Farm +1 Food with Wolin's Water Mill at t58); one
        // that moved with the plot itself leaves no bare reading to trust
        // (runs/h1_duelw1105, plot 564: Nalanda's Water Mill and the Wheat's
        // Farm both at t79)
        else if (cityMoved.has(i) && h.bare.has(i)) {
          const y0 = plotAt(h.last, i)[P.yields] as number[];
          const b = h.bare.get(i)!;
          if (still(i) && Array.isArray(y0) && Array.isArray(y1)) b.y = b.y.map((v, k) => v + y1[k] - y0[k]);
          else h.bare.delete(i);
        }
        // a plot whose yields rose with nothing about it, its neighbours or
        // its owner moving: a random event's draw
        // a district's plot yields nothing but the city centre's, which a
        // flood silts like any other plot
        const dist = plotAt(rec, i)[P.district] as number;
        if (!still(i) || (dist >= 0 && dist !== centre) || cityMoved.has(i)) continue;
        // an unowned plot's yields are the viewing player's (a strategic it
        // has just revealed pays from that record on)
        const owner = plotAt(rec, i)[P.owner] as number;
        const o = owner >= 0 ? owner : num(rec.head.localPlayer);
        if (owner >= 0 && (moved.has(owner) || (movedImproved.has(owner) && !unimproved(rec)))) continue;
        if (o >= 0 && movesPlot(i, gained.get(o) ?? new Set())) continue;
        if (o >= 0 && res >= 0 && newlyRevealed.get(o)?.has(strip(cat.resources[res] ?? '', 'RESOURCE_'))) continue;
        // a neighbour moving may move an improved plot's yields (an adjacency);
        // an unimproved plot's reach no neighbour's row except a Preserve's
        // Grove through the plot's own appeal (the flood that washed away the
        // farms beside plot 540 of runs/h1_duelw1105 at t15 silted it +1 Food
        // +1 Production; the storm that pillaged the Salt mine beside plot 473
        // at t120 moved its appeal and left it +1 Food); a pillaged improvement
        // takes no adjacency (runs/h1_duelw1106, plot 540: its pillaged Farm
        // +1 Food at t114 by the flood that pillaged the Farm beside it)
        if (!unimproved(rec) ? nbr(i).some((n) => !still(n))
          : !same(i, P.appeal) && preserve >= 0 && nbr(i).some((n) => (plotAt(rec, n)[P.district] as number) === preserve)) continue;
        const y = plotAt(rec, i)[P.yields] as number[];
        const y0 = plotAt(h.last, i)[P.yields] as number[];
        if (!y || !y0) continue;
        addEvent(i, y[0] - y0[0], y[1] - y0[1], y[3] - y0[3]);
        continue;
      }
      if (now === 'FEATURE_VOLCANIC_SOIL') {
        const y = plotAt(rec, i)[P.yields] as number[];
        const y0 = plotAt(h.last, i)[P.yields] as number[];
        const lost = was ? FEATURES[FEATURE_ID[was] ?? strip(was, 'FEATURE_')]?.yields ?? {} : {};
        const gain = (k: number, key: 'food' | 'production' | 'science') =>
          Math.max(0, (y?.[k] ?? 0) - (y0?.[k] ?? 0) + ((lost as Partial<Record<string, number>>)[key] ?? 0));
        addEvent(i, gain(0, 'food'), gain(1, 'production'), gain(3, 'science'));
      }
      if (now.startsWith('FEATURE_BURNT_')) h.fireFood.set(i, (h.fireFood.get(i) ?? 0) + 1);
      else if (was.startsWith('FEATURE_BURNT_') && (now === 'FEATURE_FOREST' || now === 'FEATURE_JUNGLE')) {
        h.fireProd.set(i, (h.fireProd.get(i) ?? 0) + 1);
      }
    }
    // the game era's countdown over each turn since the last record, on
    // this record's player eras (a player's era moves at its turn's end)
    let c = h.eraCountdown;
    for (let t = h.last.turn + 1; t <= rec.turn; t++) {
      c = eraCountdownStep(h.gameEra, h.eraStartTurn, c, t, majorEras(rec));
      if (c === ERA_BEGINS) c = -1;
    }
    h.eraCountdown = c;
    // a new era: every major's age for it
    if (eraBegan(h.last, rec)) {
      h.eraTurns.push(rec.turn);
      h.gameEra += 1;
      h.eraStartTurn = rec.turn;
      h.eraCountdown = -1;
      for (const p of rec.players) {
        if (!bool(p.major)) continue;
        const list = h.ages.get(p.id) ?? [];
        list.push(ageOf(p));
        h.ages.set(p.id, list);
      }
    }
    const done = (r: TurnRecord, pid: number) => (bitCount(r.players.find((q) => q.id === pid)?.techs)
      + bitCount(r.players.find((q) => q.id === pid)?.civics));
    for (const p of rec.players) {
      if (bool(p.major) && done(rec, p.id) !== done(h.last, p.id)) {
        h.discountDistricts.set(p.id, completedSpecialty(h.last, cat, p.id));
      }
    }
    // a route gone with its Trader alive ran to its end: its owner holds a
    // Trading Post at both of its cities
    const liveNow = new Set(recordRoutes(rec).map(routeKey));
    const unitsNow = new Set(rec.units.map((u) => `${u.owner}:${u.id}`));
    const centreOf = new Map(h.last.cities.map((c) => [`${c.owner}:${c.id}`, c.y * W + c.x]));
    for (const r of recordRoutes(h.last)) {
      if (liveNow.has(routeKey(r)) || !unitsNow.has(`${r.TraderUnitPlayer}:${r.TraderUnitID}`)) continue;
      const posts = h.posts.get(r.TraderUnitPlayer) ?? new Set<number>();
      for (const k of [`${r.OriginCityPlayer}:${r.OriginCityID}`, `${r.DestinationCityPlayer}:${r.DestinationCityID}`]) {
        const at = centreOf.get(k);
        if (at !== undefined) posts.add(at);
      }
      h.posts.set(r.TraderUnitPlayer, posts);
    }
    // a scored competition's podium: the record names none, but the seat
    // the top quarter's Favor reached (its Favor up by its rate plus the
    // competition's `silverFavor`) while a project only one competition
    // scores was queued within its run took that competition's top tier,
    // and, alone there, its gold (1108 Rome t201: 35 → 86 at 1 a turn, the
    // World Games' Training Athletes queued t196–199)
    const running = COMPETITIONS.flatMap((_def, k) => {
      const seen = h.competitionSeen.get(k);
      return seen !== undefined && rec.turn - seen <= COMPETITION_TURNS ? [k] : [];
    });
    if (running.length === 1) {
      const def = COMPETITIONS[running[0]]!;
      const top = rec.players.filter((p) => {
        const was = h.last!.players.find((q) => q.id === p.id);
        return bool(p.major) && was && num(p.favor) - num(was.favor) - num(was.favorPerTurn) === def.silverFavor;
      });
      for (const p of top) {
        const won = h.podium.get(p.id) ?? [];
        won.push([running[0], top.length === 1 ? 0 : 1]);
        h.podium.set(p.id, won);
      }
      if (top.length) h.competitionSeen.delete(running[0]);
    }
  }
  // the competitions a queued project tells running: the projects only one
  // competition's score counts
  for (const c of rec.cities) {
    for (const q of c.queue ?? []) {
      const pi = typeof q === 'object' ? num(q.ProjectType) : -1;
      const name = pi >= 0 ? cat.projects[pi] : undefined;
      if (!name) continue;
      const kinds = COMPETITIONS.flatMap((def, k) =>
        def.scored.some((r) => r.source === 'project' && `PROJECT_${r.of}` === name) ? [k] : []);
      if (kinds.length === 1) h.competitionSeen.set(kinds[0]!, rec.turn);
    }
  }
  const live = new Set<string>();
  for (const r of recordRoutes(rec)) {
    const k = routeKey(r);
    live.add(k);
    if (!h.routeSeen.has(k)) h.routeSeen.set(k, rec.turn);
    const u = rec.units.find((x) => x.owner === r.TraderUnitPlayer && x.id === r.TraderUnitID);
    if (u) {
      const trail = h.trail.get(k) ?? [];
      const at = u.y * W + u.x;
      if (trail[trail.length - 1] !== at) trail.push(at);
      h.trail.set(k, trail);
    }
  }
  h.congressBefore = h.last ? h.last.congress : rec.congress;
  for (const k of [...h.routeSeen.keys()]) if (!live.has(k)) h.routeSeen.delete(k);
  for (const k of [...h.trail.keys()]) if (!live.has(k)) h.trail.delete(k);
  for (const k of [...h.routeCourse.keys()]) if (!live.has(k)) h.routeCourse.delete(k);
  if (h.last) foldCultureTourism(h, h.last, rec, cat);
  if (h.last) foldGrowthDrift(h, h.last, rec);
  foldDominance(h, rec);
  h.beforeThat = h.before;
  h.before = h.last;
  h.last = rec;
}

/** Does the building row `bi` of the record pay its city's plots
 *  (`cityPlotBonus`): a wonder naming a terrain or feature, or paying per
 *  flood; a building's Coast, feature or Coast resource clause, the Water
 *  Mill's, or a unique row's own. */
function paysPlots(cat: Catalog, bi: number): boolean {
  const name = cat.buildings[bi];
  if (cat.wonders.includes(name)) {
    const id = engineId('wonder', name, 'BUILDING_', BUILT_WONDERS);
    const fx = id ? BUILT_WONDERS[id]?.effects : undefined;
    return !!(fx?.tileYields?.length || fx?.faithPerFlood);
  }
  const id = engineRowOf(cat, 'building', bi);
  const b = id ? BUILDINGS[id] : undefined;
  // a unique row's clauses only where the record names the unique row (the
  // Marae's, not the Amphitheater's it replaces)
  const unique = cat.buildingReplaces.some(([u]) => u === name);
  return !!b && !!(b.coastPlotYields || b.plotFeatureYields || b.coastResourceYields || b.special === 'WATER_MILL'
    || (unique && b.civVariants?.some((v) => v.featureTileYields || v.coastResourceYields)));
}

/** Does the building row `bi` of the record name a wonder paying every plot
 *  of its owner's empire (`tileYields` rows with `empire`)? */
function paysEmpire(cat: Catalog, bi: number): boolean {
  const name = cat.buildings[bi];
  if (!cat.wonders.includes(name)) return false;
  const id = engineId('wonder', name, 'BUILDING_', BUILT_WONDERS);
  return !!(id && BUILT_WONDERS[id]?.effects?.tileYields?.some((r) => r.empire));
}

/** the 1s of a research bit string */
function bitCount(bits: string | undefined): number {
  let n = 0;
  for (const ch of bits ?? '') if (ch === '1') n += 1;
  return n;
}

/** the specialty districts (`countsTowardLimit`) a player had completed in a record */
function completedSpecialty(rec: TurnRecord, cat: Catalog, pid: number): number {
  let n = 0;
  for (const c of rec.cities) {
    if (c.owner !== pid) continue;
    for (const d of c.districts) {
      const id = engineRowOf(cat, 'district', d[0] as number) as DistrictId | null;
      if (id && DISTRICTS[id]?.countsTowardLimit && d[3] === true) n += 1;
    }
  }
  return n;
}

export function importTurn(rec: TurnRecord, cat: Catalog, history?: History): Imported {
  const ctx: Ctx = {
    cat,
    gaps: new Map(),
    bReplace: new Map(cat.buildingReplaces),
    dReplace: new Map(cat.districtReplaces),
    uReplace: new Map(cat.unitReplaces),
    wonders: new Set(cat.wonders),
    seatGaps: new Map(),
    cityGaps: new Map(),
    tileGaps: new Map(),
  };
  const W = rec.head.W;
  const H = rec.head.H;
  const tiles: Tile[] = [];
  for (let i = 0; i < W * H; i++) {
    ctx.scopeTile = i;
    tiles.push(tileOf(ctx, rec, i));
  }
  ctx.scopeTile = undefined;
  for (const [i, n] of history?.fireFood ?? []) tiles[i].fertility = n;
  for (const [i, n] of history?.fireProd ?? []) tiles[i].fertilityProd = n;
  for (const [i, [f, pr, sc]] of history?.eventYields ?? []) {
    tiles[i].fertility += Math.max(0, f);
    tiles[i].fertilityProd += Math.max(0, pr);
    if (sc > 0) tiles[i].fertilitySci = (tiles[i].fertilitySci ?? 0) + sc;
  }
  const map: GameMap = { width: W, height: H, wrapX: bool(rec.head.wrapX), seed: 0, tiles };
  for (const t of tiles) {
    t.riverMask = edgeMask(map, rec, t, P.riverBits);
    t.cliffMask = edgeMask(map, rec, t, P.cliffBits);
  }
  const state = createGameFromMap(map, num(rec.seed) >>> 0);
  state.turn = rec.turn;
  if (history) {
    state.gameEra = history.gameEra;
    state.eraStartTurn = history.eraStartTurn;
    state.eraCountdown = history.eraCountdown;
  }
  const lowlandsRead = importLowlands(rec, tiles);
  // the sea level the records' events reached: one climate phase per rise
  if (history?.floods) state.climateIdx = history.seaLevel - 1;
  // the National Parks: each plot names its park by the park's lowest plot
  const parksRead = Array.isArray(rec.parks);
  for (const [, plots] of parksRead ? rec.parks as [string, number[]][] : []) {
    const anchor = Math.min(...plots);
    for (const q of plots) if (tiles[q]) tiles[q].park = anchor;
  }

  const seatOfPlayer = new Map<number, number>();
  const playerOfSeat = new Map<number, number>();
  const players = [...rec.players].sort((a, b) => a.id - b.id);
  const majors = players.filter((p) => bool(p.major));
  const minors = players.filter((p) => bool(p.minor));
  const inherits = new Map(cat.leaderInherits);
  majors.forEach((p, i) => {
    const seat = emptySeat(i);
    const row = leaderRow(String(p.leader));
    if (row < 0) gap(ctx, 'leader', String(p.leader));
    seat.civ = row;
    seat.name = String(p.civ);
    for (const r of history?.people ? [] : GP_RESOURCE_REVEAL) {
      if (history?.revealed.get(p.id)?.has(r.resource)) (seat.gpPerm ??= GP_PERM.map(() => 0))[GP_PERM.indexOf(r.perm)] = 1;
    }
    // the podiums the history saw it take (`History.podium`): the gold's
    // permanent channels and the top tier's
    for (const [k, tier] of history?.podium.get(p.id) ?? []) {
      const def = COMPETITIONS[k]!;
      if (tier === 0 && def.goldPerm) addSeatPerm(seat, def.goldPerm);
      if (def.silverPerm) addSeatPerm(seat, def.silverPerm);
    }
    state.seats.push(seat);
    seatOfPlayer.set(p.id, i);
    playerOfSeat.set(i, p.id);
  });
  // lifetime culture, the tourism banks and cultural dominance the history
  // folded (`foldCultureTourism`, `foldDominance`)
  if (history) {
    majors.forEach((p, i) => {
      const seat = state.seats[i];
      seat.cultureTotal = history.culture.get(p.id) ?? 0;
      seat.tourismTo = majors.map((o) => history.tourismTo.get(`${p.id}:${o.id}`) ?? 0);
      seat.culturallyDominant = majors.map((o) => history.dominant.get(p.id)?.has(o.id) ?? false);
    });
  }
  const minorOfPlayer = new Map<number, CityState>();
  minors.forEach((p, k) => {
    const seat = seatOfCityState(k);
    seatOfPlayer.set(p.id, seat);
    playerOfSeat.set(seat, p.id);
    const kind = strip(inherits.get(String(p.leader)) ?? '', 'LEADER_MINOR_CIV_').toLowerCase();
    if (!CITY_STATE_TYPES.includes(kind as CityStateType)) gap(ctx, 'city-state-type', String(p.leader));
    // the engine names a city-state as its suzerain-bonus row does
    // ('Hong Kong' for CIVILIZATION_HONG_KONG), which is what every bonus reads
    const civName = strip(String(p.civ), 'CIVILIZATION_');
    const name = Object.keys(CITY_STATE_SUZERAIN_BONUS).find((n) => n.toUpperCase().replace(/[ -]/g, '_') === civName) ?? civName;
    const cs: CityState = {
      ...emptySeat(seat), id: k, name,
      type: (CITY_STATE_TYPES.includes(kind as CityStateType) ? kind : 'trade') as CityStateType,
      centerIndex: -1, population: 0, envoys: {}, met: [], suzerain: -1,
    };
    state.cityStates.push(cs);
    minorOfPlayer.set(p.id, cs);
  });
  state.cityStateMax = minors.length;
  for (const p of players) {
    if (bool(p.free)) {
      freeSeatOf(state);
      seatOfPlayer.set(p.id, FREE_SEAT);
      playerOfSeat.set(FREE_SEAT, p.id);
    } else if (bool(p.barb)) {
      seatOfPlayer.set(p.id, BARB_SEAT);
      playerOfSeat.set(BARB_SEAT, p.id);
    }
  }
  const seatOfGame = (pid: number) => seatOfPlayer.get(pid) ?? NO_SEAT;

  // the religions: an engine religion is named by its founder's seat
  const religionSeat = new Map<number, number>();
  const religions = Array.isArray(rec.religions) ? rec.religions : [];
  for (const r of religions) {
    const founder = seatOfGame(r.Founder);
    if (founder === NO_SEAT || founder >= state.seats.length) continue;
    religionSeat.set(r.Religion, founder);
    const rel = state.seats[founder].religion;
    rel.founded = true;
    rel.name = strip(cat.religions[r.Religion] ?? '', 'RELIGION_');
    ctx.scopeSeat = founder;
    for (const b of r.Beliefs ?? []) beliefInto(ctx, b, rel);
    ctx.scopeSeat = undefined;
    rel.beliefsEarned = (r.Beliefs ?? []).length;
    const hc = rec.players.find((q) => q.id === r.Founder)?.holyCity;
    const holy = typeof hc === 'object' && hc ? rec.cities.find((c) => c.owner === hc.player && c.id === hc.id) : undefined;
    rel.holyTile = holy ? holy.y * W + holy.x : null;
  }

  // the seats' research, government, purse and ages
  for (const p of players) {
    const seat = seatOfGame(p.id);
    const s = seatOf(state, seat);
    if (!s) continue;
    ctx.scopeSeat = seat;
    importPlayer(ctx, p, s);
    if (bool(p.major)) importAges(ctx, s, p, history);
    ctx.scopeSeat = undefined;
    s.bestMeleeCS = history?.bestMelee.get(p.id) ?? 0;
    // the copies a price progression counts are the game's own, read off its
    // quote where one stands: a free Builder (a Tribal Village's) moves no
    // price (runs/h1_duelw1105, China's t46 and t52 Builders left it at 31)
    const builders = copiesQuoted(rec, ctx.cat, p.id, 'UNIT_BUILDER',
      (n) => UNITS.BUILDER.cost + scaleByGameSpeed(BUILDER_COST_STEP) * n);
    s.buildersTrained = builders ?? history?.builders.get(p.id) ?? 0;
    // a lost Settler stays counted and a captured one never was (China's t28
    // capture left 70 standing): with no quote, the cities past the first and
    // the Settlers in the field
    const settlers = copiesQuoted(rec, ctx.cat, p.id, 'UNIT_SETTLER',
      (n) => UNITS.SETTLER.cost + scaleByGameSpeed(SETTLER_COST_STEP) * n);
    s.discountDistricts = history?.discountDistricts.get(p.id) ?? completedSpecialty(rec, ctx.cat, p.id);
    s.settlersTrained = settlers ?? Math.max(0, rec.cities.filter((c) => c.owner === p.id).length - 1
      + rec.units.filter((u) => u.owner === p.id && ctx.cat.units[u.type] === 'UNIT_SETTLER').length);
    for (const [id, def] of Object.entries(UNITS)) {
      if (def.costStep === undefined) continue;
      const n = copiesQuoted(rec, ctx.cat, p.id, `UNIT_${id}`, (k) => unitStepCost(id, k));
      if (n === undefined) continue;
      s.unitsAcquired ??= {};
      s.unitsAcquired[id] = n;
    }
  }
  for (const p of players) {
    const a = seatOfGame(p.id);
    for (const q of p.wars ?? []) {
      const b = seatOfGame(q);
      if (a !== NO_SEAT && b !== NO_SEAT && a !== BARB_SEAT && b !== BARB_SEAT) setWar(state, a, b, true);
    }
  }
  for (const p of minors) {
    const cs = minorOfPlayer.get(p.id)!;
    for (const [giver, n] of p.envoysReceived ?? []) {
      const g = seatOfGame(giver);
      if (g >= 0 && g < state.seats.length) cs.envoys[g] = n;
    }
    const suz = num(p.suzerain);
    cs.suzerain = suz >= 0 ? seatOfGame(suz) : -1;
    for (const m of p.met ?? []) {
      const g = seatOfGame(m);
      if (g >= 0 && g < state.seats.length) cs.met.push(g);
    }
  }

  // plot ownership, districts and wonders
  for (const t of tiles) {
    const p = plotAt(rec, t.index);
    const owner = p[P.owner] as number;
    if (owner >= 0) setTileOwner(t, seatOfGame(owner));
    const wi = p[P.wonder] as number;
    if (typeof wi === 'number' && wi >= 0) {
      const wname = cat.buildings[wi];
      const id = engineId('wonder', wname, 'BUILDING_', BUILT_WONDERS);
      if (id) {
        t.builtWonder = id;
        t.builtWonderComplete = p[P.wonderComplete] === 1;
      } else gap(ctx, 'wonder', wname);
    }
    const ii = p[P.improvement] as number;
    if (ii >= 0 && cat.improvements[ii] === 'IMPROVEMENT_BARBARIAN_CAMP') state.barbSeat.camps.push(t.index);
  }

  const shortfallRead = importShortfalls(rec, state, seatOfGame, history);

  // the cities
  const cityByKey = new Map<string, City>();
  const dumpOfCity = new Map<City, DumpCity>();
  const dumpOfMinor = new Map<CityState, DumpCity>();
  const cities = [...rec.cities].sort((a, b) => a.owner - b.owner || a.id - b.id);
  for (const c of cities) {
    ctx.scopeCity = `${c.owner}:${c.id}`;
    // a record with no National Park plots: a city its parks reach
    // (GetAmenitiesFromNationalParks) reads with the park missing
    if (!parksRead && num(c.amenityParts?.[6] ?? 0) > 0) gap(ctx, 'national-park', 'unrecorded');
    const seat = seatOfGame(c.owner);
    const center = c.y * W + c.x;
    const pillaged: string[] = [];
    const buildings: string[] = [];
    const wonders: City['wonders'] = [];
    for (const [bi, pil] of c.buildings) {
      const name = cat.buildings[bi];
      if (ctx.wonders.has(name)) {
        const id = engineId('wonder', name, 'BUILDING_', BUILT_WONDERS);
        const at = c.plots.find((q) => tiles[q].builtWonder === id);
        if (id && at !== undefined) wonders.push({ id, tileIndex: at });
        continue;
      }
      const id = buildingId(ctx, bi);
      if (!id) continue;
      buildings.push(id);
      if (pil) pillaged.push(id);
    }
    const districts: City['districts'] = [];
    const pins = PLACEABLE_DISTRICTS.map(() => -1);
    let hp = CITY_MAX_HP;
    let outerHp: number | undefined;
    for (const d of c.districts) {
      const [ti, dx, dy, complete, dpil] = d as [number, number, number, boolean, boolean];
      const name = cat.districts[ti];
      if (name === 'DISTRICT_WONDER') continue;
      const id = districtId(ctx, ti);
      if (!id) continue;
      const at = dy * W + dx;
      const t = tiles[at];
      if (id === 'CITY_CENTER') {
        markCityCentre(t);
        hp = CITY_MAX_HP - num(d[6] as number);
        const outerMax = num(d[9] as number);
        if (outerMax > 0) outerHp = outerMax - num(d[8] as number);
      } else {
        t.district = id;
        t.districtComplete = complete === true;
        t.districtPillaged = dpil === true;
      }
      districts.push({ type: id, tileIndex: at });
      const di = PLACEABLE_DISTRICTS.indexOf(id);
      const workers = num(plotAt(rec, at)[P.workers] as number);
      if (di >= 0 && workers > 0 && c.worked.includes(at)) pins[di] = workers;
    }
    if (!districts.some((d) => d.type === 'CITY_CENTER')) {
      markCityCentre(tiles[center]);
      districts.unshift({ type: 'CITY_CENTER', tileIndex: center });
    }
    const religionPressure = new Array(state.seats.length).fill(0);
    let followed: number | null = null;
    let unconvertedPressure: number | undefined;
    if (Array.isArray(c.religions)) {
      for (const r of c.religions) {
        const g = religionSeat.get(r.Religion);
        if (g !== undefined) religionPressure[g] = r.Pressure;
        if (r.Religion === -1) unconvertedPressure = r.Pressure;
      }
    }
    const maj = num(c.majorityReligion);
    if (maj >= 0) followed = religionSeat.get(maj) ?? null;
    const minor = minorOfPlayer.get(c.owner);
    if (minor) {
      minor.centerIndex = center;
      minor.population = c.pop;
      minor.foodBox = num(c.food);
      minor.cultureBox = num(c.culture);
      minor.nextPlot = num(c.nextPlot);
      minor.tilesAcquired = history?.cultureTaken.get(center) ?? 0;
      minor.hp = hp;
      minor.outerHp = outerHp;
      minor.buildings = buildings.filter((b) => b !== 'PALACE');
      minor.pillagedBuildings = pillaged.length ? pillaged : undefined;
      minor.districts = districts.filter((d) => d.type !== 'CITY_CENTER');
      minor.religionPressure = religionPressure;
      minor.unconvertedPressure = unconvertedPressure;
      dumpOfMinor.set(minor, c);
      for (const q of c.plots) setTileOwner(tiles[q], seat);
      continue;
    }
    const holder = seatOf(state, seat);
    if (!holder || seat === BARB_SEAT) {
      gap(ctx, 'city-holder', String(c.owner));
      continue;
    }
    const origOwner = seatOfGame(num(c.originalOwner));
    const city: City = {
      id: holder.nextCityId++,
      seat,
      name: c.name,
      foundedTurn: 0,
      hp,
      centerIndex: center,
      population: c.pop,
      foodBox: num(c.food),
      cultureBox: num(c.culture),
      tilesAcquired: history?.cultureTaken.get(center) ?? 0,
      ...(history?.growthDrift.get(center) ? { growthDrift: history.growthDrift.get(center) } : {}),
      nextPlot: num(c.nextPlot),
      focus: 'balanced',
      queue: [],
      isCapital: bool(c.capital),
      origCapitalSeat: bool(c.capital) && origOwner === seat ? seat : -1,
      founderSeat: origOwner,
      buildings,
      districts,
      wonders,
      loyalty: num(c.loyalty),
      religionPressure,
      unconvertedPressure,
      followedReligion: followed,
      specialistPref: pins,
      ...(pillaged.length ? { pillagedBuildings: pillaged } : {}),
      ...(outerHp !== undefined ? { outerHp } : {}),
    };
    holder.cities.push(city);
    cityByKey.set(`${c.owner}:${c.id}`, city);
    dumpOfCity.set(city, c);
    for (const q of c.plots) setTileOwner(tiles[q], seat, city.id);
    // the citizens: every worked plot pinned, so the engine's walk works the
    // game's plots; the district slots take the game's specialist counts
    for (const q of c.worked) if (q !== center && !tiles[q].district) tiles[q].locked = true;
    if (city.isCapital) holder.capitalTile = center;
    importGreatWorks(ctx, c, city);
    if (num(c.governor) >= 0 && rec.players.find((q) => q.id === c.owner)?.governors === undefined) {
      gap(ctx, 'governor', 'not in the record');
    }
    // the amenities war weariness and a gold shortfall take: the engine's
    // weariness and shortfall ledgers are not in the dump
    if (num(c.amenityParts?.[13]) > 0) gap(ctx, 'war-weariness', 'not imported');
    if (num(c.amenityParts?.[14]) > 0 && !shortfallRead.has(c.owner)) gap(ctx, 'bankruptcy', 'not imported');
  }

  // the governors: each appointed one in its catalog slot, seated in the
  // engine city (or, Amani, the city-state) the game names
  for (const p of players) {
    const seat = seatOfGame(p.id);
    const s = seatOf(state, seat);
    if (!s || seat < 0 || seat >= state.seats.length) continue;
    ctx.scopeSeat = seat;
    const roster = governorsOf(s);
    for (const [ti, owner, cityId, established, toEstablish, neutralized, promos] of p.governors ?? []) {
      const gname = cat.governors[ti];
      const id = engineId('governor', gname, 'GOVERNOR_', GOVERNOR_INDEX);
      if (!id) {
        gap(ctx, 'governor', gname);
        continue;
      }
      // the game lists the governor's default title among its promotions; the
      // engine holds it implicitly (`GOVERNOR_DEFAULT_PROMOTION`), so its bit
      // stays clear
      const gi = GOVERNOR_INDEX[id as keyof typeof GOVERNOR_INDEX];
      // the mask is a sum of powers of two past bit 31 (`promotionBitValue`),
      // which a 32-bit `|` would wrap onto another governor's title
      let promotions = 0;
      for (const pi of promos) {
        const pid = engineId('promotion', cat.promotions[pi], 'GOVERNOR_PROMOTION_', GOVERNOR_PROMOTION_INDEX);
        if (!pid) gap(ctx, 'governor-promotion', cat.promotions[pi]);
        else {
          const bit = GOVERNOR_PROMOTION_INDEX[pid];
          if (bit !== GOVERNOR_DEFAULT_PROMOTION[gi] && !promotionBit(promotions, bit)) promotions += promotionBitValue(bit);
        }
      }
      const minor = minorOfPlayer.get(owner);
      const city = cityByKey.get(`${owner}:${cityId}`);
      roster[gi] = {
        appointed: true,
        cityId: city && city.seat === seat ? city.id : -1,
        minorId: minor ? minor.id : -1,
        establishTurns: bool(established) ? 0 : Math.max(0, num(toEstablish)),
        outTurns: Math.max(0, num(neutralized) || 0),
        promotions,
      };
    }
    ctx.scopeSeat = undefined;
  }

  // the game's `GetTokensReceived` counts an established governor's envoys
  // (Amani's 2 arrive the turn she establishes and leave with her), which the
  // engine adds on top of its store (`envoysWith`): the store is the count
  // with the governor's share taken back out
  for (const cs of minorOfPlayer.values()) {
    for (const [k, read] of Object.entries(cs.envoys)) {
      const seat = Number(k);
      const base = envoysWith(state, cs, seat, 0);
      const step = envoysWith(state, cs, seat, 1) - base;
      if (base === 0 && step === 1) continue;
      ctx.scopeSeat = seat;
      if ((read - base) % step !== 0 || read < base) gap(ctx, 'envoys', cs.name);
      else cs.envoys[seat] = (read - base) / step;
      ctx.scopeSeat = undefined;
    }
  }

  // a resource the engine lacks on an owned plot is its owner's gap too: a
  // luxury pays every city of the seat, a strategic its stockpile
  for (const [i, gs] of ctx.tileGaps!) {
    const seat = seatOfGame(plotAt(rec, i)[P.owner] as number);
    if (seat === NO_SEAT || !seatOf(state, seat)) continue;
    for (const g of gs) {
      if (!g.startsWith('resource:')) continue;
      if (!ctx.seatGaps!.has(seat)) ctx.seatGaps!.set(seat, new Set());
      ctx.seatGaps!.get(seat)!.add(g);
    }
  }

  const luxUnrecorded = importLuxuryDeals(ctx, state, players, cat, seatOfGame, history);
  if (history?.people) importPeople(ctx, rec, state, history.people, seatOfGame);
  else spentPersonGaps(ctx, rec, cityByKey, history);
  const routes = importTradeRoutes(rec, state, cityByKey, minorOfPlayer, seatOfGame, history);

  // the units
  let nextId = 0;
  for (const u of rec.units) {
    const seat = seatOfGame(u.owner);
    if (seat === NO_SEAT) continue;
    const id = unitId(ctx, u.type);
    if (!id) continue;
    const def = UNITS[id];
    const unit: Unit = {
      id: nextId++,
      type: id,
      seat,
      tileIndex: u.y * W + u.x,
      movesLeft: num(u.moves),
      movesFull: num(u.maxMoves),
      hp: UNIT_HP - num(u.damage),
      charges: def.charges !== undefined ? num(u.buildCharges) || num(u.spreadCharges) || def.charges : null,
      xp: num(u.xp),
      level: num(u.level),
      ...(num(u.formation) > 0 ? { formation: num(u.formation) } : {}),
      ...(bool(u.embarked) ? { embarked: true } : {}),
    };
    const levy = history?.levied.get(`${u.owner}:${u.id}`);
    if (levy !== undefined && seatOfGame(levy) !== NO_SEAT) unit.leviedFrom = seatOfGame(levy);
    state.units.push(unit);
  }
  state.nextUnitId = nextId;

  // the World Congress, then the build queues: last, so the prices the
  // engine locks at queueing read the whole imported state
  // A session's resolutions reach a player's cities on that player's turn:
  // a seat that has not played yet this turn (a player after the record's
  // active one) still reads the table the record before showed (1104 China's
  // Cocoa Luxury Policy, shown at t142, pays from t143 and the next session,
  // shown at t162, leaves it paying through t162; 1107 Rome, the active
  // seat, reads each session the turn it shows)
  const now = importCongress(rec.congress, rec, cat, state, religionSeat, seatOfGame);
  const before = history?.congressBefore !== undefined
    ? importCongress(history.congressBefore, rec, cat, state, religionSeat, seatOfGame) : now;
  const active = rec.players.find((p) => bool(p.turnActive));
  const congressOf = (seat: number): NonNullable<GameState['congress']> =>
    active !== undefined && (playerOfSeat.get(seat) ?? Infinity) <= active.id ? now.list : before.list;
  state.congress = now.list;
  unrecordedLuxuryGaps(ctx, rec, state, luxUnrecorded, seatOfGame, congressOf);
  if (history) importLapsed(rec, cat, state, seatOfGame, history);
  const congressGaps = [...new Set([...now.gaps, ...before.gaps])];
  // (a queued row the engine lacks is the game's gap, no city's: nothing a
  // check reads comes from the queue)
  let queueProgressRead = false;
  for (const city of cityByKey.values()) {
    if (importQueue(ctx, state, dumpOfCity.get(city)!, city)) queueProgressRead = true;
  }
  // the record before is the last step's input where it is the turn before
  // and the owner's turn start ran once between each pair (`notStarted`)
  const b1 = history?.before?.turn === rec.turn - 1 ? history.before : null;
  const b2 = b1 && history?.beforeThat?.turn === rec.turn - 2 ? history.beforeThat : null;
  const late = new Set([...(b1 ? notStarted(b1, rec) : []), ...(b1 && b2 ? notStarted(b2, b1) : [])]);
  const prevCities = new Map((b1?.cities ?? []).map((c) => [`${c.owner}:${c.id}`, c]));
  const projectYieldUnread = new Map<string, number>();
  for (const [key, city] of cityByKey) {
    const c = dumpOfCity.get(city)!;
    const col = importProjectYield(state, ctx.cat, c, prevCities.get(key), !!b2 && !late.has(c.owner), city);
    if (col >= 0) projectYieldUnread.set(key, col);
  }
  const readBack = history?.floods ? importFloods(state, history.floods) : importFloodCounts(rec, state, cityByKey.values());
  if (history) lockDistrictPrices(rec, cat, state, cityByKey, history);
  return {
    state, seatOfPlayer, playerOfSeat, cityByKey, dumpOfCity, minorOfPlayer, dumpOfMinor,
    gaps: ctx.gaps, seatGaps: ctx.seatGaps!, tileGaps: ctx.tileGaps!, cityGaps: ctx.cityGaps!, religionSeat,
    congressGaps, congressOf, queueProgressRead, readBack, lowlandsRead, projectYieldUnread, routes,
    districtLocked: history?.districtLocked ?? new Map(),
    tilesUnknown: new Set(rec.cities.map((c) => c.y * W + c.x).filter((k) => !history || history.unknownSince.has(k))),
    nextPlotUnheld: new Set(history?.nextPlotUnheld ?? []),
    cityBefore: prevCities,
  };
}

/** The prices the record's standing districts locked at placement
 *  (`History.districtLocked`): a district the city quoted before it stood
 *  locks the engine's price at the first record it stands, itself left out
 *  of the city. */
function lockDistrictPrices(rec: TurnRecord, cat: Catalog, state: GameState, cityByKey: Map<string, City>,
  h: History): void {
  for (const c of rec.cities) {
    const city = cityByKey.get(`${c.owner}:${c.id}`);
    const s = city ? seatOf(state, city.seat) : undefined;
    if (!city || !s) continue;
    let unlocks: ReturnType<typeof computeUnlocks> | null = null;
    for (const [kind, idx] of c.buy) {
      if (kind !== 'D') continue;
      const id = engineRowOf(cat, 'district', idx) as DistrictId | null;
      if (!id || city.districts.some((d) => d.type === id)) continue;
      const key = `${c.owner}:${c.id}:${idx}`;
      h.districtLocked.delete(key);
      h.districtQuoted.add(key);
    }
    // a district locks at the first record it stands, quoted there or not (a
    // complete one leaves the list until it is pillaged: runs/h1_duelw1104
    // Rome's Industrial Zone bought t123 at 112, quoted again at 112 from
    // its pillage at t184)
    const prefix = `${c.owner}:${c.id}:`;
    const human = bool(rec.players.find((p) => p.id === c.owner)?.human);
    for (const key of h.districtQuoted) {
      if (!key.startsWith(prefix) || h.districtLocked.has(key)) continue;
      const idx = Number(key.slice(prefix.length));
      const id = engineRowOf(cat, 'district', idx) as DistrictId | null;
      if (!id) continue;
      const at = city.districts.findIndex((d) => d.type === id);
      const was = h.districtPriced.get(key);
      if (at < 0) {
        // not standing: this record's price, the lock should its turn place it
        if (was?.turn !== rec.turn) {
          unlocks ??= computeUnlocks(state, city.seat);
          h.districtPriced.set(key, { turn: rec.turn, price: districtSiteCost(state, s, id, unlocks) });
        }
        continue;
      }
      if (was?.turn === rec.turn - 1 && human) {
        h.districtLocked.set(key, was.price);
        continue;
      }
      unlocks ??= computeUnlocks(state, city.seat);
      const [placed] = city.districts.splice(at, 1);
      h.districtLocked.set(key, districtSiteCost(state, s, id, unlocks));
      city.districts.splice(at, 0, placed);
    }
  }
}

/**
 * The cards each major holds slotted without their modifiers
 * (`GovernmentState.lapsed`), read off the records' slot lists by the game's
 * rules (dll_readings "C-94: the slot rebuild"): a slot rebuild — the
 * government or the slot count changed since the record before — lays the
 * old cards back by `carryLayout`, unattached, and the AI then slots its
 * choices one slot at a time, each SetSlotPolicy attaching its card; so a
 * card standing where the rebuild laid it is lapsed, any other attached.
 * Between records with no rebuild a card keeps its standing while it keeps
 * its slot, and a card in a slot it did not hold was slotted anew. The first
 * record a player is seen in reads every card attached. Each turn is read
 * once and kept, so a record imported again (the pair checks' t+1) reads the
 * same answer.
 */
function importLapsed(rec: TurnRecord, cat: Catalog, state: GameState, seatOfGame: (pid: number) => number,
  history: History): void {
  for (const p of rec.players) {
    if (!bool(p.major)) continue;
    const seat = seatOfGame(p.id);
    const s = seatOf(state, seat);
    if (!s || seat < 0 || seat >= state.seats.length) continue;
    const byTurn = history.policySlots.get(p.id) ?? new Map<number, PolicySlots>();
    history.policySlots.set(p.id, byTurn);
    let now = byTurn.get(rec.turn);
    if (!now) {
      const cards = (p.policies ?? []).map((pi) => {
        const i = num(pi);
        return i >= 0 ? engineId('policy', cat.policies[i], 'POLICY_', POLICIES) : null;
      });
      const kinds = governmentSlots(state, seat);
      const gov = num(p.government);
      const before = Math.max(-1, ...[...byTurn.keys()].filter((t) => t < rec.turn));
      const prev = byTurn.get(before);
      const lapsed = new Set<string>();
      if (prev && (prev.gov !== gov || prev.cards.length !== cards.length)) {
        const laid = carryLayout(prev.kinds.map((k, i) => [k, prev!.cards[i] ?? null] as const), kinds, () => true);
        cards.forEach((c, i) => { if (c && laid[i] === c) lapsed.add(c); });
      } else if (prev) {
        cards.forEach((c, i) => { if (c && prev!.cards[i] === c && prev!.lapsed.has(c)) lapsed.add(c); });
      }
      now = { gov, kinds, cards, lapsed };
      byTurn.set(rec.turn, now);
    }
    s.government.lapsed = [...now.lapsed];
  }
}

/**
 * The plots' coastal lowland bands (the record's `coastalLowlands` index 0,
 * 1, 2 is the engine's band 1, 2, 3), flooded and submerged, where the record
 * carries them; false where it does not.
 */
function importLowlands(rec: TurnRecord, tiles: Tile[]): boolean {
  if ((plotAt(rec, 0)?.length ?? 0) <= P.submerged) return false;
  for (const t of tiles) {
    const p = plotAt(rec, t.index);
    const band = num(p[P.lowland] as number);
    t.lowland = band >= 0 ? band + 1 : undefined;
    const on = (v: unknown) => v === 1 || v === true;
    if (on(p[P.flooded])) t.flooded = true;
    if (on(p[P.submerged])) t.submerged = true;
  }
  return true;
}

/**
 * Each seat's gold shortfall (`Seat.goldShortfall`, what its cities'
 * bankruptcy amenities read) off the record before, a turn earlier: the
 * Gold its treasury, Gold income and upkeep left below 0
 * (`goldShortfall`), 0 where the record's own treasury stands above 0 —
 * a shortfall clamps the treasury at 0 (`bankruptcy`). 493 of 497 major
 * seat-turns of runs/h1_duelw1109 agree with the cities' recorded loss
 * (amenity part 14, which is never read); the rest moved their income
 * between the records. Returns the players
 * read; a player with no record of the turn before is not.
 */
function importShortfalls(rec: TurnRecord, state: GameState, seatOfGame: (pid: number) => number,
  history?: History): Set<number> {
  const read = new Set<number>();
  const prev = history?.last === rec ? history.before : history?.last;
  if (!prev || prev.turn !== rec.turn - 1) return read;
  for (const p of rec.players) {
    const s = seatOf(state, seatOfGame(p.id));
    const q = prev.players.find((x) => x.id === p.id);
    if (!s || !q) continue;
    const balance = num(q.gold) + num(q.goldYield) - num(q.maintTotal);
    if (Number.isNaN(balance) || Number.isNaN(num(p.gold))) continue;
    s.goldShortfall = num(p.gold) > 0 ? 0 : goldShortfall(balance);
    read.add(p.id);
  }
  return read;
}

/**
 * The floods the records named (`History.floods`): each one's river from
 * the plot it started on (`riverReach`), every plot of it one flood more
 * (`Tile.floodCount`, the Great Bath's Faith). Nothing is read back.
 */
function importFloods(state: GameState, floods: Map<string, number>): Map<number, Set<number>> {
  for (const start of floods.values()) {
    const t = state.map.tiles[start];
    if (!t) continue;
    for (const r of riverReach(state.map, t)) r.floodCount = (r.floodCount ?? 0) + 1;
  }
  return new Map();
}

/**
 * The floods each Floodplains plot of a Great Bath city has taken, where
 * the records name no flood (no `events`): the Bath pays its Floodplains plots Faith per
 * flood (`cityPlotBonus`), so in such a city the plot's recorded Faith above
 * what the plot pays with no flood counted IS its count. Elsewhere the count
 * pays nothing and stays 0. Returns the plots whose Faith column was read
 * back (`Imported.readBack`).
 */
function importFloodCounts(rec: TurnRecord, state: GameState, cities: Iterable<City>): Map<number, Set<number>> {
  const faith = YIELD_KEYS.indexOf('faith');
  const readBack = new Map<number, Set<number>>();
  for (const city of cities) {
    let per = 0;
    for (const w of city.wonders) per += BUILT_WONDERS[w.id]?.effects?.faithPerFlood ?? 0;
    if (!per) continue;
    const ctx = cityYieldCtx(state, city);
    const bonus = cityPlotBonus(state, city);
    for (const t of state.map.tiles) {
      const isCentre = t.index === city.centerIndex;
      if (!tileBelongsTo(t, city) || !isFloodplains(t.feature) || (t.district && !isCentre) || t.builtWonder) continue;
      const read = (plotAt(rec, t.index)[P.yields] as number[] | undefined)?.[faith];
      if (read === undefined) continue;
      t.floodCount = 0;
      let y: Yields;
      if (isCentre) y = cityCentreYields(state, city, ctx, bonus);
      else {
        y = tileYields(ctx, t);
        bonus(t, false, y);
      }
      t.floodCount = Math.max(0, Math.round((read - y.faith) / per));
      readBack.set(t.index, new Set([faith]));
    }
  }
  return readBack;
}

/**
 * The record's live trade routes, each on its owner's `tradeRoutes` (a
 * major's from its city, a city-state's from its one city, id -1), and the
 * Trading Posts the history saw planted (`History.posts`) with Rome's in each
 * of its cities (All Roads Lead to Rome). The record names no path, so a
 * route's course is the one the engine's walk lays from its origin
 * (`tradeCourse`), and its start the first record that carried it.
 */
function importTradeRoutes(rec: TurnRecord, state: GameState, cityByKey: Map<string, City>,
  minorOfPlayer: Map<number, CityState>, seatOfGame: (pid: number) => number,
  history?: History): Imported['routes'] {
  for (const [pid, posts] of history?.posts ?? []) {
    const owner = seatOf(state, seatOfGame(pid));
    if (owner) for (const at of posts) stampTradingPost(owner, at);
  }
  for (const s of state.seats) {
    if (civOf(state, s.seat) === 'ROME') for (const c of s.cities) stampTradingPost(s, c.centerIndex);
  }
  const out: Imported['routes'] = [];
  for (const r of recordRoutes(rec)) {
    const made = routeOfRecord(r, state, cityByKey, minorOfPlayer);
    if (!made) continue;
    const { owner, route } = made;
    const kept = history?.routeCourse.get(routeKey(r));
    if (kept) route.course = [...kept];
    else history?.routeCourse.set(routeKey(r), [...(route.course ?? [])]);
    const trail = history?.trail.get(routeKey(r));
    if (trail) route.course = trailCourse(state, owner.seat, route.course ?? [], trail);
    const seen = history?.routeSeen.get(routeKey(r));
    if (seen !== undefined) {
      route.createdTurn = seen;
      route.expiresTurn = seen + tradeRouteMinDuration(state);
    }
    (owner.tradeRoutes ??= []).push(route);
    out.push({ owner: owner.seat, route, game: r });
  }
  return out;
}

/**
 * A route's course as its Trader walked it: the plots of the last whole leg
 * it ran between the route's two cities, or of the leg it is on, the rest
 * of the way the engine's (`tradeCourse`) from the furthest plot the Trader
 * reached; consecutive plots the records saw apart are joined the engine's
 * way. The engine's own course where the Trader stood on nothing off it.
 */
function trailCourse(state: GameState, seat: number, course: number[], seen: number[]): number[] {
  if (course.length < 2 || seen.every((at) => course.includes(at))) return course;
  const origin = course[0];
  const dest = course[course.length - 1];
  const dist = (a: number, b: number) => {
    const ta = state.map.tiles[a];
    const tb = state.map.tiles[b];
    return hexDistance(state.map, ta.col, ta.row, tb.col, tb.row);
  };
  // a route begins at its origin; a Trader that turned in a city between
  // two records stood in it: two plots apart, both beside one of the
  // route's cities
  const trail = seen[0] === origin || seen[0] === dest ? [seen[0]] : [origin, seen[0]];
  for (let i = 1; i < seen.length; i++) {
    const a = seen[i - 1];
    const b = seen[i];
    for (const end of [origin, dest]) {
      if (a !== end && b !== end && dist(a, b) > 1 && dist(a, end) === 1 && dist(b, end) === 1) trail.push(end);
    }
    trail.push(b);
  }
  const ends: number[] = [];
  trail.forEach((at, i) => { if (at === origin || at === dest) ends.push(i); });
  const lastEnd = ends.length ? ends[ends.length - 1] : -1;
  // the last whole leg, origin first
  let whole: number[] | null = null;
  for (let k = ends.length - 1; k > 0; k--) {
    const a = ends[k - 1];
    const b = ends[k];
    if (trail[a] === trail[b]) continue;
    const leg = trail.slice(a, b + 1);
    whole = trail[a] === origin ? leg : leg.reverse();
    break;
  }
  const part = trail.slice(lastEnd + 1);
  const outbound = lastEnd < 0 || trail[lastEnd] === origin;
  const join = (a: number, b: number): number[] => {
    if (whole) {
      const i = whole.indexOf(a);
      const j = whole.indexOf(b);
      if (i >= 0 && j > i) return whole.slice(i, j + 1);
    }
    return tradeCourse(tradeReach(state, seat, a), b) ?? [a, b];
  };
  let stops: number[];
  if (part.length === 0) stops = whole ?? course;
  else if (outbound) stops = [origin, ...part, dest];
  else stops = [origin, ...part.reverse(), dest];
  // a plot the course already holds closes a loop the Trader walked off its
  // route (1108 Rome's Trader out to Antium and back before Shenyang): the
  // loop is cut
  const out: number[] = [stops[0]];
  const step = (at: number) => {
    const k = out.indexOf(at);
    if (k >= 0) out.length = k + 1;
    else out.push(at);
  };
  for (let i = 1; i < stops.length; i++) {
    const a = out[out.length - 1];
    const b = stops[i];
    if (a === b) continue;
    if (dist(a, b) === 1) step(b);
    else for (const at of join(a, b).slice(1)) step(at);
  }
  return out;
}

/** One of the game's route rows as the engine's route on its owner — a
 *  major's or a city-state's — with the course the engine walks; null when
 *  either end is no city of the import. */
function routeOfRecord(r: Record<string, number>, state: GameState, cityByKey: Map<string, City>,
  minorOfPlayer: Map<number, CityState>): { owner: Seat | CityState; route: TradeRoute } | null {
  const origin = cityByKey.get(`${r.OriginCityPlayer}:${r.OriginCityID}`);
  const minorOwner = minorOfPlayer.get(r.OriginCityPlayer);
  const owner = minorOwner ?? (origin && isCiv(origin.seat) ? seatOf(state, origin.seat) : undefined);
  if (!owner) return null;
  const from = minorOwner ? -1 : origin!.id;
  const originCentre = minorOwner ? minorOwner.centerIndex : origin!.centerIndex;
  const dest = cityByKey.get(`${r.DestinationCityPlayer}:${r.DestinationCityID}`);
  const minor = minorOfPlayer.get(r.DestinationCityPlayer);
  const route: TradeRoute | null = minor ? { from, toCs: minor.id }
    : !dest ? null
    : dest.seat === owner.seat ? { from, to: dest.id }
    : { from, toSeat: dest.seat, toSeatCity: dest.id };
  if (!route) return null;
  const destCentre = minor ? minor.centerIndex : dest!.centerIndex;
  route.course = tradeCourse(tradeReach(state, owner.seat, originCentre), destCentre) ?? [];
  return { owner, route };
}

/** The routes that ended and began between an import's record and the next
 *  one, each on the owner it ran for — a route ends and begins on its
 *  owner's turn, so a reader stepping through the turn applies each once
 *  that owner's turn has passed. */
export function routeChanges(imp: Imported, next: TurnRecord): {
  ended: { owner: number; route: TradeRoute }[]; begun: { owner: number; route: TradeRoute }[];
} {
  const nextRows = recordRoutes(next);
  const nextKeys = new Set(nextRows.map(routeKey));
  const haveKeys = new Set(imp.routes.map((r) => routeKey(r.game as Record<string, number>)));
  const ended = imp.routes.filter((r) => !nextKeys.has(routeKey(r.game as Record<string, number>)))
    .map((r) => ({ owner: r.owner, route: r.route }));
  const begun: { owner: number; route: TradeRoute }[] = [];
  for (const r of nextRows) {
    if (haveKeys.has(routeKey(r))) continue;
    const made = routeOfRecord(r, imp.state, imp.cityByKey, imp.minorOfPlayer);
    if (made) begun.push({ owner: made.owner.seat, route: made.route });
  }
  return { ended, begun };
}

function bitsToIds(bits: string, names: string[], kind: string, prefix: string, known: object, ctx: Ctx): string[] {
  const out: string[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    const id = engineId(kind, names[i], prefix, known);
    if (id) out.push(id);
    else gap(ctx, kind, names[i]);
  }
  return out;
}

function importPlayer(ctx: Ctx, p: DumpPlayer, s: GameState['seats'][number]): void {
  const cat = ctx.cat;
  const r = s.research;
  r.techs = bitsToIds(p.techs ?? '', cat.techs, 'tech', 'TECH_', TECHS, ctx);
  r.civics = bitsToIds(p.civics ?? '', cat.civics, 'civic', 'CIVIC_', CIVICS, ctx);
  r.boosted = [
    ...bitsToIds(p.techBoosts ?? '', cat.techs, 'tech', 'TECH_', TECHS, ctx),
    ...bitsToIds(p.civicBoosts ?? '', cat.civics, 'civic', 'CIVIC_', CIVICS, ctx),
  ];
  const tech = num(p.researching);
  const techId = tech >= 0 ? engineId('tech', cat.techs[tech], 'TECH_', TECHS) : null;
  if (techId) {
    r.tech = techId;
    r.techProgress = num(p.researchProgress);
  }
  const civic = num(p.civic);
  const civicId = civic >= 0 ? engineId('civic', cat.civics[civic], 'CIVIC_', CIVICS) : null;
  if (civicId) {
    r.civic = civicId;
    r.civicProgress = num(p.civicProgress);
  }
  const gov = num(p.government);
  if (gov >= 0) {
    const id = engineId('government', cat.governments[gov], 'GOVERNMENT_', GOVERNMENTS);
    if (id) s.government.chosen = id;
    else gap(ctx, 'government', cat.governments[gov]);
  }
  if (bool(p.inAnarchy)) s.government.anarchyEnd = num(p.anarchyEnd);
  s.government.policies = [];
  for (const pi of p.policies ?? []) {
    const i = num(pi);
    if (!(i >= 0)) continue;
    const id = engineId('policy', cat.policies[i], 'POLICY_', POLICIES);
    if (id) s.government.policies.push(id);
    else gap(ctx, 'policy', cat.policies[i]);
  }
  s.treasury = num(p.gold);
  s.faith = num(p.faith);
  s.diplomaticFavor = num(p.favor) || 0;
  s.envoysAvailable = num(p.tokens) || 0;
  const pan = num(p.pantheon);
  if (pan >= 0) {
    const id = engineId('belief', cat.beliefs[pan], 'BELIEF_', PANTHEONS);
    if (id) s.religion.pantheon = id;
    else gap(ctx, 'pantheon', cat.beliefs[pan]);
  }
}

/**
 * A major's ages: the current one off the record's flags (a Heroic age is
 * the engine's Golden code), the eras the history saw begin counted into
 * `darkAges` / `goldenAges` with the one before the current as `prevAge`;
 * the game's whole-game era score and its two age bars; the dedications it
 * holds for the era, by their CommemorationType.
 */
function importAges(ctx: Ctx, s: GameState['seats'][number], p: DumpPlayer, history?: History): void {
  const engineAge = (a: number) => (a >= AGE_GOLDEN_ONLY ? AGE_GOLDEN : a === AGE_DARK ? 0 : 1);
  s.age = engineAge(ageOf(p));
  const held = Array.isArray(p.commemorations) ? p.commemorations : [];
  s.dedicationPicks = [];
  for (const k of held) {
    const name = ctx.cat.commemorations?.[k] ?? `commemoration ${k}`;
    const d = DEDICATION_COMMEMORATIONS.indexOf(name);
    if (d >= 0) s.dedicationPicks.push(d);
    else gap(ctx, 'commemoration', name);
  }
  s.dedications = s.dedicationPicks.length;
  const ages = history?.ages.get(p.id) ?? [];
  s.darkAges = ages.filter((a) => a === AGE_DARK).length;
  s.goldenAges = ages.filter((a) => a >= AGE_GOLDEN_ONLY).length;
  s.prevAge = ages.length >= 2 ? engineAge(ages[ages.length - 2]) : 1;
  s.eraScore = num(p.eraScore) || 0;
  s.darkBar = num(p.darkThreshold) || 0;
  s.goldenBar = num(p.goldenThreshold) || 0;
}

const CLEARABLE = clearableFeatures();

const GWO_BY_NAME: Record<string, number> = {
  GREATWORKOBJECT_SCULPTURE: GWO_SCULPTURE, GREATWORKOBJECT_PORTRAIT: GWO_PORTRAIT,
  GREATWORKOBJECT_LANDSCAPE: GWO_LANDSCAPE, GREATWORKOBJECT_RELIGIOUS: GWO_RELIGIOUS,
  GREATWORKOBJECT_ARTIFACT: GWO_ARTIFACT, GREATWORKOBJECT_WRITING: GWO_WRITING,
  GREATWORKOBJECT_MUSIC: GWO_MUSIC, GREATWORKOBJECT_RELIC: GWO_RELIC,
};
const PEOPLE = Object.fromEntries(Object.values(GREAT_PEOPLE).flat().map((p) => [p.id, p]));

/**
 * The luxuries that cross between majors: per player and luxury the record
 * reads [held, exported], and held = the engine's spare copies (own improved
 * plots and its city-states', `luxuryHoldings`) + imported − exported, so
 * imported = held + exported − spare. Each luxury's imports are matched to
 * its exports, seat order on both sides, and every matched copy becomes one
 * `DEAL_LUXURY` item on the running term from exporter to importer — the
 * record names no partner and no turns left, so the term runs `DEAL_TURNS`.
 * An unmatched import or export, a copy that will not fit the term's
 * `DEAL_ITEMS`, and a copy the engine counts that the game does not hold are
 * the seat's gaps.
 *
 * An import no export matches is a Great Person's grant of that luxury
 * (Colaeus, Magellan: `plotLuxury`): where the records name the people
 * (`History.people`), each spent person's own grant; else when the history
 * saw the seat spend a person of a class holding one — at most one grant per
 * such person in the roster and per person of the class spent, the spent
 * class the evidence. With no history, every unmatched import stays a gap.
 *
 * A player the record carries no luxury rows for at all (a dump written
 * before the dumper read them) is no player holding nothing: its seats come
 * back for `unrecordedLuxuryGaps`.
 */
function importLuxuryDeals(ctx: Ctx, state: GameState, players: DumpPlayer[], cat: Catalog,
                           seatOfGame: (pid: number) => number, history?: History): number[] {
  const unrecorded: number[] = [];
  const grants = new Map<number, number>(); // seat -> copies a spent person may have granted
  for (const [ind, p] of history?.people ?? []) {
    const person = p.spent !== null ? personOf(cat, ind) : undefined;
    const n = person ? (gpEffectOf(person).plotLuxury ?? 0) * gpChargesOf(person) : 0;
    if (n > 0) grants.set(seatOfGame(p.player), (grants.get(seatOfGame(p.player)) ?? 0) + n);
  }
  for (const [pid, spent] of history?.people ? [] : history?.gpSpent ?? []) {
    let n = 0;
    for (const [cls, k] of spent) {
      const amounts = GREAT_PEOPLE[cls].map((p) => gpEffectOf(p).plotLuxury ?? 0).filter((a) => a > 0);
      n += amounts.slice(0, k).reduce((a, b) => a + b, 0);
    }
    if (n > 0) grants.set(seatOfGame(pid), n);
  }
  const flow = new Map<string, { seat: number; n: number }[][]>(); // resource -> [imports, exports]
  const seen = new Set<string>();
  const remember = (seat: number, rname: string, kind: string): void => {
    ctx.scopeSeat = seat;
    gap(ctx, kind, rname);
    ctx.scopeSeat = undefined;
  };
  for (const p of players) {
    const seat = seatOfGame(p.id);
    if (seat === NO_SEAT || !seatOf(state, seat) || !isCiv(seat)) continue;
    if (p.luxuries === undefined) {
      unrecorded.push(seat);
      continue;
    }
    const spare = luxuryHoldings(state, seat).spare;
    const rows = new Map<string, [number, number]>();
    for (const [ri, held, exported] of p.luxuries) rows.set(cat.resources[ri], [held, exported]);
    for (const [id, n] of spare) if (n > 0 && !rows.has(`RESOURCE_${id}`)) rows.set(`RESOURCE_${id}`, [0, 0]);
    for (const [rname, [held, exported]] of rows) {
      const id = strip(rname, 'RESOURCE_');
      const imported = held + exported - (spare.get(id) ?? 0);
      if (!LUXURY_IDS.includes(id) || imported < 0) {
        remember(seat, rname, imported < 0 ? 'luxury-held' : 'luxury-imported');
        continue;
      }
      if (!flow.has(id)) flow.set(id, [[], []]);
      if (imported > 0) flow.get(id)![0].push({ seat, n: imported });
      if (exported > 0) flow.get(id)![1].push({ seat, n: exported });
      seen.add(id);
    }
  }
  for (const id of [...seen].sort()) {
    const [imports, exports] = flow.get(id)!;
    for (const imp of imports) {
      for (const exp of exports) {
        while (imp.n > 0 && exp.n > 0 && exp.seat !== imp.seat) {
          const terms = (state.dealTerms ??= {});
          const term = (terms[grantKey(exp.seat, imp.seat)] ??= { left: DEAL_TURNS, items: [] });
          if (term.items.length >= DEAL_ITEMS) break;
          term.items.push([DEAL_LUXURY, LUXURY_IDS.indexOf(id), 1]);
          imp.n -= 1;
          exp.n -= 1;
        }
      }
    }
    for (const imp of imports) {
      const seat = seatOf(state, imp.seat)!;
      while (imp.n > 0 && (grants.get(imp.seat) ?? 0) > 0) {
        (seat.gpLuxCopies ??= LUXURY_IDS.map(() => 0))[LUXURY_IDS.indexOf(id)] += 1;
        grants.set(imp.seat, grants.get(imp.seat)! - 1);
        imp.n -= 1;
      }
      if (imp.n > 0) remember(imp.seat, `RESOURCE_${id}`, 'luxury-imported');
    }
    for (const exp of exports) if (exp.n > 0) remember(exp.seat, `RESOURCE_${id}`, 'luxury-exported');
  }
  return unrecorded;
}

/**
 * The seats with no luxury rows in the record: the copies on the ground are
 * all the importer can place, so the evidence of a deal or a grant it cannot
 * name is the cities' own luxury amenities (`GetAmenitiesFromLuxuries`,
 * amenityParts[0]). Where the seat's sum differs from the engine's
 * (`luxuryAmenities`, under the congress the seat reads) the seat takes the
 * `luxuries:not recorded` gap.
 */
function unrecordedLuxuryGaps(ctx: Ctx, rec: TurnRecord, state: GameState, seats: number[],
                              seatOfGame: (pid: number) => number,
                              congressOf: (seat: number) => NonNullable<GameState['congress']>): void {
  const was = state.congress;
  for (const seat of seats) {
    state.congress = congressOf(seat);
    let ours = 0;
    for (const n of luxuryAmenities(state, seat).values()) ours += n;
    let game = 0;
    for (const c of rec.cities) if (seatOfGame(c.owner) === seat) game += num(c.amenityParts?.[0] ?? 0);
    if (ours === game) continue;
    ctx.scopeSeat = seat;
    gap(ctx, 'luxuries', 'not recorded');
    ctx.scopeSeat = undefined;
  }
  state.congress = was;
}

/**
 * A city's great works: each filled slot the record names becomes a work in
 * the engine layout position of its holder's slot (`holderSlots`), its
 * object type and maker (the person's place in its class roster, -1 for a
 * Relic or a find) from the GreatWorks row. A work in a Bank's slot means
 * Giovanni de' Medici's widening stands in the city (`bankGwSlots`). The
 * record names no creator player and no find's era, so a work's
 * civilization is the city's seat and its era -1; a full holder of Artifacts,
 * whose theming reads both, is the city's `great-work-origin` gap.
 */
function importGreatWorks(ctx: Ctx, c: DumpCity, city: City): void {
  const works: GreatWork[] = [];
  for (const [bi, s, , row] of c.greatWorks ?? []) {
    const name = ctx.cat.buildings[bi];
    const id = ctx.wonders.has(name) ? engineId('wonder', name, 'BUILDING_', BUILT_WONDERS)
      : engineRowOf(ctx.cat, 'building', bi);
    const h = GW_HOLDERS.findIndex((x) => x.id === id);
    if (h < 0) {
      gap(ctx, 'great-work-holder', name);
      continue;
    }
    const pos = holderSlots(h)[s];
    const gw = ctx.cat.greatWorks?.[num(row)];
    if (pos === undefined || !gw) {
      gap(ctx, 'great-work', gw ? `${name} slot ${s}` : 'no GreatWorks catalog');
      continue;
    }
    const obj = GWO_BY_NAME[gw[1]];
    if (obj === undefined) {
      gap(ctx, 'great-work-object', gw[1]);
      continue;
    }
    let maker = -1;
    if (gw[2]) {
      const pid = aliasOrPrefixed(gw[2]);
      const person = pid ? PEOPLE[pid] : undefined;
      if (person) maker = GREAT_PEOPLE[person.class].indexOf(person);
      else gap(ctx, 'great-work-maker', gw[2]);
    }
    if (GW_HOLDERS[h].id === 'BANK') {
      const perm = GP_CITY_PERM.indexOf('bankGwSlots');
      const amount = GW_GP_EXTRA_SLOTS.find((r) => r.holder === 'BANK')!.amount;
      city.gpPerm ??= GP_CITY_PERM.map(() => 0);
      city.gpPerm[perm] = Math.max(city.gpPerm[perm] ?? 0, amount);
    }
    works.push({ slot: pos, obj, maker, era: -1, seat: city.seat });
  }
  // a full holder of Artifacts is themed by their eras and civilizations
  for (const h of new Set(works.filter((w) => w.obj === GWO_ARTIFACT).map((w) => GW_LAYOUT[w.slot].holder))) {
    const slots = holderSlots(h).filter((x) => GW_LAYOUT[x].extraRank < 0);
    if (slots.every((x) => works.some((w) => w.slot === x))) gap(ctx, 'great-work-origin', GW_HOLDERS[h].id);
  }
  if (works.length) city.greatWorks = works.sort((a, b) => a.slot - b.slot);
}

/** a Great Person's engine id: the roster's own tag, or `GP_` + the
 *  individual's name */
function aliasOrPrefixed(individual: string): string | null {
  const tagged = engineId('person', individual, 'GREAT_PERSON_INDIVIDUAL_', PEOPLE);
  if (tagged) return tagged;
  const bare = `GP_${strip(individual, 'GREAT_PERSON_INDIVIDUAL_')}`;
  return bare in PEOPLE ? bare : null;
}

/**
 * A city's build queue in order. What each entry builds is its row (the
 * entry's one type key, a civilization's unique row read as the row it
 * replaces), a district or wonder on the entry's plot; its progress is the
 * record's `queueProgress` where the record carries it and 0 where it does
 * not (`Imported.queueProgressRead`). A district's locked price is the one
 * the record quotes for it; the other prices the engine locks at queueing (a
 * project's, a Settler's, a Builder's or a Trader's) are the engine's own for
 * the imported state.
 */
function importQueue(ctx: Ctx, state: GameState, c: DumpCity, city: City): boolean {
  const s = seatOf(state, city.seat);
  if (!s) return false;
  const W = state.map.width;
  let read = false;
  let unlocks: ReturnType<typeof computeUnlocks> | null = null;
  const queue: QueueItem[] = [];
  c.queue.forEach((e, i) => {
    if (typeof e !== 'object' || e === null) return;
    const pr = num(c.queueProgress?.[i]);
    if (Number.isFinite(pr) && pr >= 0) read = true;
    const progress = Number.isFinite(pr) && pr >= 0 ? pr : 0;
    const at = e.Location && e.Location.x >= 0 ? e.Location.y * W + e.Location.x : -1;
    if (e.UnitType !== undefined) {
      const id = engineRowOf(ctx.cat, 'unit', e.UnitType);
      if (!id) return gap(ctx, 'queue-unit', ctx.cat.units[e.UnitType]);
      if (id === 'SETTLER') queue.push({ kind: 'settler', progress, cost: settlerCost(state, city.seat) });
      else {
        const cost = id === 'BUILDER' ? builderCost(state, city.seat) : id === 'TRADER' ? traderCost(state, city.seat) : undefined;
        const formation = num(e.MilitaryFormationType) > 0 ? num(e.MilitaryFormationType) : undefined;
        queue.push({ kind: 'unit', unit: id, progress, ...(cost !== undefined ? { cost } : {}),
          ...(formation !== undefined ? { formation } : {}) });
      }
    } else if (e.BuildingType !== undefined) {
      const name = ctx.cat.buildings[e.BuildingType];
      if (ctx.wonders.has(name)) {
        const id = engineId('wonder', name, 'BUILDING_', BUILT_WONDERS);
        if (!id || at < 0) return gap(ctx, 'queue-wonder', name);
        queue.push({ kind: 'wonder', wonder: id, tileIndex: at, progress });
      } else {
        const id = engineRowOf(ctx.cat, 'building', e.BuildingType);
        if (!id) return gap(ctx, 'queue-building', name);
        queue.push({ kind: 'building', building: id, progress });
      }
    } else if (e.DistrictType !== undefined) {
      const id = engineRowOf(ctx.cat, 'district', e.DistrictType) as DistrictId | null;
      if (!id || at < 0) return gap(ctx, 'queue-district', ctx.cat.districts[e.DistrictType]);
      // the price the game locked when the district was placed: its cost
      // reader quotes it for a district standing in the city (the record's
      // buy row); the engine's own for the imported state where none is read
      const locked = c.buy.find((b) => b[0] === 'D' && b[1] === e.DistrictType);
      const lockedCost = locked ? num(locked[2]) : NaN;
      unlocks ??= computeUnlocks(state, city.seat);
      queue.push({ kind: 'district', district: id, tileIndex: at, progress,
        cost: Number.isFinite(lockedCost) && lockedCost > 0 ? lockedCost : districtSiteCost(state, s, id, unlocks) });
    } else if (e.ProjectType !== undefined) {
      const name = ctx.cat.projects[e.ProjectType] ?? '';
      const id = engineId('project', name, 'PROJECT_', PROJECTS);
      if (!id) return gap(ctx, 'queue-project', name);
      queue.push({ kind: 'project', project: id, progress, cost: projectCost(state, city.seat, id, city) });
    }
  });
  city.queue = queue;
  return read;
}

/**
 * The players whose turn start had not run when `b` was read: every city of
 * theirs that `a` saw with food and culture coming in shows both boxes
 * exactly where `a` left them. The next record then carries two turn starts
 * at once, so neither pair is a one-turn step for that player.
 */
/** the cities, by `${owner}:${id}`, whose own turn start the record pair
 *  missed while their owner's other cities moved: the same size, a food
 *  surplus and culture to bank, and neither box moved — the record caught the
 *  turn part way through its owner's cities, and the next pair banks two
 *  turns at once (runs/h1_duelw1108 t148: Rome grows, Aquileia and Mediolanum
 *  hold still, then bank +0.84 / +6.3 on a surplus of 0.42 / 3.15) */
export function citiesNotStarted(a: TurnRecord, b: TurnRecord): Set<string> {
  const before = new Map(a.cities.map((c) => [`${c.owner}:${c.id}`, c]));
  const out = new Set<string>();
  for (const c1 of b.cities) {
    const k = `${c1.owner}:${c1.id}`;
    const c0 = before.get(k);
    if (!c0 || c0.pop !== c1.pop || !(num(c0.foodSurplus) > 0) || !(num(c0.cultureYield) > 0)) continue;
    if (num(c1.food) === num(c0.food) && num(c1.culture) === num(c0.culture)) out.add(k);
  }
  return out;
}

export function notStarted(a: TurnRecord, b: TurnRecord): Set<number> {
  const before = new Map(a.cities.map((c) => [`${c.owner}:${c.id}`, c]));
  const moving = new Map<number, boolean>();
  for (const c1 of b.cities) {
    const c0 = before.get(`${c1.owner}:${c1.id}`);
    if (!c0 || c0.pop !== c1.pop || !(num(c0.foodSurplus) > 0) || !(num(c0.cultureYield) > 0)) continue;
    const still = num(c1.food) === num(c0.food) && num(c1.culture) === num(c0.culture);
    moving.set(c1.owner, (moving.get(c1.owner) ?? false) || !still);
  }
  return new Set([...moving].filter(([, m]) => !m).map(([o]) => o));
}

/**
 * The yield a city's last production step converted from a district project
 * (`City.projectYield`). Where the record before is that step's input
 * (`known`), it holds the item heading the queue and the city's Production:
 * a converting project heading it there took that Production — completed or
 * not — and converted its row's rate of it, never above the project's cost.
 * A converting project heading the queue now that did not head it before
 * took its first step with a bank paid in that no record holds, and where
 * the record before is no step's input the step is unknown: the return
 * names that project's yield column (YIELD_KEYS order), which `city.yields`
 * leaves out; -1 otherwise.
 */
function importProjectYield(state: GameState, cat: Catalog, c: DumpCity, prev: DumpCity | undefined, known: boolean,
  city: City): number {
  const head = (d: DumpCity | undefined): string | undefined => {
    const e = d?.queue?.[0];
    if (!e || typeof e !== 'object' || e.ProjectType === undefined) return undefined;
    const id = engineId('project', cat.projects[e.ProjectType] ?? '', 'PROJECT_', PROJECTS);
    return id && PROJECTS[id]?.yield ? id : undefined;
  };
  const before = head(prev);
  if (!known) {
    const any = before ?? head(c);
    return any ? YIELD_KEYS.indexOf(PROJECTS[any].yield!) : -1;
  }
  if (before) {
    const def = PROJECTS[before];
    const production = num(prev!.yields[1]);
    city.projectYield = {
      key: def.yield!,
      amount: Math.min(production, projectCost(state, city.seat, before, city)) * projectConversionRate(def),
    };
    return -1;
  }
  const now = head(c);
  return now ? YIELD_KEYS.indexOf(PROJECTS[now].yield!) : -1;
}

/** a resolution's engine index by the game's ResolutionType hash */
let RESOLUTION_BY_HASH: Map<number, number> | null = null;
function resolutionByHash(): Map<number, number> {
  if (RESOLUTION_BY_HASH) return RESOLUTION_BY_HASH;
  const m = new Map<number, number>();
  const types = aliases().resolution;
  CONGRESS_RESOLUTIONS.forEach((r, i) => {
    const named = [...types].filter(([, id]) => id === r.id).map(([t]) => t);
    for (const t of named.length ? named : [`WC_RES_${r.id}`]) m.set(gameHash(t), i);
  });
  RESOLUTION_BY_HASH = m;
  return m;
}

/**
 * The World Congress's standing resolutions: each numbered entry of the
 * table becomes `{ res, outcome, target }` — the resolution by its
 * type's hash, outcome 0 for the entry's "A", the target its localisation key
 * names in the engine's own target space for the resolution's kind. The
 * Diplomatic Victory resolution stands outside the engine's table. Every
 * entry the importer cannot place is returned as a gap.
 */
/** The World Congress table a record holds, in this import's seat space —
 *  the next record's, for a step a session opening between the two reads. */
export function congressOfRecord(rec: TurnRecord, cat: Catalog, imp: Imported): NonNullable<GameState['congress']> {
  return importCongress(rec.congress, rec, cat, imp.state, imp.religionSeat,
    (pid) => imp.seatOfPlayer.get(pid) ?? NO_SEAT).list;
}

function importCongress(table: unknown, rec: TurnRecord, cat: Catalog, state: GameState, religionSeat: Map<number, number>,
  seatOfGame: (pid: number) => number): { list: NonNullable<GameState['congress']>; gaps: string[] } {
  if (!table || typeof table !== 'object') return { list: [], gaps: [] };
  const gaps: string[] = [];
  const out: NonNullable<GameState['congress']> = [];
  const dv = gameHash('WC_RES_DIPLOVICTORY');
  for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
    if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue;
    const e = v as DumpResolution;
    if (e.Type === dv) continue;
    const res = resolutionByHash().get(e.Type);
    if (res === undefined) {
      gaps.push(`congress:resolution ${e.Type}`);
      continue;
    }
    if (typeof e.ChosenLabel !== 'string' || typeof e.ChosenThing !== 'string') {
      gaps.push(`congress:${CONGRESS_RESOLUTIONS[res].id} undecided`);
      continue;
    }
    const outcome = e.ChosenLabel === 'A' || e.ChosenLabel === 'А' ? 0 : 1;
    const target = congressTarget(CONGRESS_RESOLUTIONS[res].target, e.ChosenThing, rec, cat, religionSeat, seatOfGame,
      state.seats.length);
    if (target < 0) {
      gaps.push(`congress:${CONGRESS_RESOLUTIONS[res].id} target ${e.ChosenThing}`);
      continue;
    }
    out.push({ res, outcome, target });
  }
  return { list: out, gaps };
}

/**
 * The great people the records saw spent (`History.people`), each charge's
 * lasting effect as the engine's `activateGreatPerson` lays it: the seat's
 * permanent channels (James Young's Oil, Hypatia's Libraries, Ibn Khaldun's
 * happiness yields ...), invented luxuries, the spend itself
 * (`Seat.gpActivated`), and the city and district channels on the plot the
 * person's unit last stood on — the city owning it, else the capital. A
 * person spent before any record showed its unit has no plot: a city or
 * district channel of its is the seat's `gp-site` gap. A person outside the
 * roster is the seat's `gp-person` gap.
 */
function importPeople(ctx: Ctx, rec: TurnRecord, state: GameState, people: Map<number, RecruitedPerson>,
  seatOfGame: (pid: number) => number): void {
  for (const [ind, p] of people) {
    if (p.spent === null || p.spent > rec.turn) continue;
    const seat = seatOfGame(p.player);
    const s = seatOf(state, seat);
    if (!s || seat < 0 || seat >= state.seats.length) continue;
    ctx.scopeSeat = seat;
    const person = personOf(ctx.cat, ind);
    if (!person) {
      gap(ctx, 'gp-person', ctx.cat.greatPeople?.[ind] ?? String(ind));
      ctx.scopeSeat = undefined;
      continue;
    }
    const fx = gpEffectOf(person);
    const charges = gpChargesOf(person);
    for (let k = 0; k < charges; k++) {
      addSeatPerm(s, fx.perm ?? {});
      (s.gpActivated ??= []).push(person.id);
      if (fx.luxuryCopies) for (let i = 0; i < fx.luxuryCopies; i++) (s.gpLuxuries ??= []).push(fx.luxuryAmenities ?? 1);
    }
    const cityPerm = Object.entries(fx.cityPerm ?? {}).filter(([, n]) => n);
    const tilePerm = Object.entries(fx.tilePerm ?? {}).filter(([, n]) => n);
    if (cityPerm.length || tilePerm.length) {
      const tile = p.at >= 0 ? state.map.tiles[p.at] : undefined;
      if (!tile) gap(ctx, 'gp-site', person.id);
      else {
        const city = s.cities.find((c) => tile.ownerSeat === seat && c.id === tile.ownerCity)
          ?? s.cities.find((c) => c.isCapital);
        for (const [k, n] of cityPerm) {
          if (!city) continue;
          const v = (city.gpPerm ??= GP_CITY_PERM.map(() => 0));
          const at = GP_CITY_PERM.indexOf(k as (typeof GP_CITY_PERM)[number]);
          // the Bank's slots are already read off a work standing in one
          // (`importGreatWorks`): the widening is one, however it was seen
          v[at] = k === 'bankGwSlots' ? Math.max(v[at], n) : v[at] + n * charges;
        }
        for (const [k, n] of tilePerm) {
          const v = (tile.gpPerm ??= GP_TILE_PERM.map(() => 0));
          v[GP_TILE_PERM.indexOf(k as (typeof GP_TILE_PERM)[number])] += n * charges;
        }
      }
    }
    ctx.scopeSeat = undefined;
  }
}

/**
 * CIV6 (MODIFIER_PLAYER_CITIES_ADJUST_BUILDING_YIELD_CHANGE, `GP_BUILDING_YIELDS`):
 * a spent Great Person pays a building row in every city of its player for
 * good (Hypatia's Libraries, Newton's Universities, Leonardo's Workshops ...),
 * and a record without `greatPeople` names no person, only the class spent
 * (`History.gpSpent`).
 * A city holding the row's building, whose owner has spent a person of the
 * class whose era the world has reached, carries a `gp-unknown` gap on the
 * readers of that yield.
 */
function spentPersonGaps(ctx: Ctx, rec: TurnRecord, cityByKey: Map<string, City>, history?: History): void {
  const worldEra = Math.max(0, ...rec.players.filter((q) => bool(q.major)).map((q) => num(q.era)));
  for (const [pid, spent] of history?.gpSpent ?? []) {
    for (const [cls, k] of spent) {
      if (k <= 0) continue;
      for (const person of GREAT_PEOPLE[cls]) {
        if (person.era > worldEra) continue;
        const perm = gpEffectOf(person).perm ?? {};
        for (const row of GP_BUILDING_YIELDS) {
          if (!perm[row.perm]) continue;
          for (const c of rec.cities) {
            if (c.owner !== pid || !cityByKey.get(`${c.owner}:${c.id}`)?.buildings.includes(row.building)) continue;
            ctx.scopeCity = `${c.owner}:${c.id}`;
            gap(ctx, 'gp-unknown', `${person.id} ${row.yield}`);
          }
        }
      }
    }
  }
  ctx.scopeCity = undefined;
}

/**
 * CIV6 (the city's growth accumulator, DLL 0x1b6180 / 0x1b62d0): a session
 * of the World Congress ends the standing resolutions, and a Migration
 * Treaty's growth percent detaches from every city its target held, each
 * keeping the residue (`growthDetachResidue`), latched by the city's centre
 * plot so a capture keeps it. A session is a table naming a new entry, or
 * one whose entries differ from the record before's.
 */
function foldGrowthDrift(h: History, prev: TurnRecord, rec: TurnRecord): void {
  const entries = (t: unknown): (DumpResolution & { IsNew?: boolean })[] => (t && typeof t === 'object'
    ? Object.entries(t as Record<string, unknown>).filter(([k, v]) => /^\d+$/.test(k) && !!v && typeof v === 'object')
      .map(([, v]) => v as DumpResolution & { IsNew?: boolean })
    : []);
  const was = entries(prev.congress);
  const now = entries(rec.congress);
  const sig = (l: DumpResolution[]) => l.map((e) => `${e.Type}:${e.ChosenLabel}:${e.ChosenThing}`).sort().join('|');
  if (!now.some((e) => e.IsNew === true) && sig(was) === sig(now)) return;
  const W = rec.head.W;
  for (const e of was) {
    if (resolutionByHash().get(e.Type) !== CONGRESS_MIGRATION || typeof e.ChosenThing !== 'string') continue;
    const pid = Number(e.ChosenThing);
    const residue = growthDetachResidue(e.ChosenLabel === 'A' || e.ChosenLabel === 'А' ? CONGRESS_GROWTH_A : CONGRESS_GROWTH_B);
    for (const c of prev.cities) {
      if (c.owner !== pid) continue;
      const k = c.y * W + c.x;
      h.growthDrift.set(k, (h.growthDrift.get(k) ?? 0) + residue);
    }
  }
}

/** the install's promotion classes this engine names shorter */
const PROMO_CLASS_ABBREV: Record<string, string> = {
  ANTI_CAVALRY: 'ANTICAV', LIGHT_CAVALRY: 'LIGHT_CAV', HEAVY_CAVALRY: 'HEAVY_CAV',
};

/** a resolution's target in the engine's target space for its kind, read off
 *  the localisation key the game names it by; -1 where the engine has none */
function congressTarget(kind: string, thing: string, rec: TurnRecord, cat: Catalog,
  religionSeat: Map<number, number>, seatOfGame: (pid: number) => number, majors: number): number {
  const core = strip(thing, 'LOC_').replace(/_NAME$/, '');
  const after = (prefix: string) => (core.startsWith(prefix) ? core.slice(prefix.length) : '');
  switch (kind) {
    case 'district': {
      const id = engineId('district', core, 'DISTRICT_', DISTRICTS);
      return id ? UDT_DISTRICTS.indexOf(id as DistrictId) : -1;
    }
    // LOC_BUILDING_POWER_PLANT_EXPANSION2_NAME: the row's Name as Expansion2
    // renames it
    case 'building': {
      const id = engineId('building', core.replace(/_EXPANSION2$/, ''), 'BUILDING_', BUILDINGS);
      return id ? POWER_PLANT_IDS.indexOf(id) : -1;
    }
    case 'religion': return religionSeat.get(cat.religions.indexOf(core)) ?? -1;
    case 'gpClass': return GP_CLASSES.indexOf(after('GREAT_PERSON_CLASS_') as never);
    case 'luxury': return LUXURY_IDS.indexOf(after('RESOURCE_'));
    case 'policy': {
      const id = engineId('policy', core, 'POLICY_', POLICIES);
      return id ? POLICY_LIST.findIndex((p) => p.id === id) : -1;
    }
    case 'government': {
      const id = engineId('government', core, 'GOVERNMENT_', GOVERNMENTS);
      return id ? GOVERNMENT_LIST.findIndex((g) => g.id === id) : -1;
    }
    case 'project': {
      const id = engineId('project', core, 'PROJECT_', PROJECTS);
      return id ? PROJECT_LIST.findIndex((p) => p.id === id) : -1;
    }
    case 'governor': {
      const id = engineId('governor', core, 'GOVERNOR_', GOVERNOR_INDEX);
      return id ? GOVERNORS.findIndex((g) => g.id === id) : -1;
    }
    case 'currency': return CONGRESS_CURRENCIES.indexOf(after('YIELD_').toLowerCase() as never);
    // LOC_MINOR_CIV_SCIENTIFIC_TRAIT_NAME → 'scientific'
    case 'csType': return CITY_STATE_TYPES.indexOf(after('MINOR_CIV_').replace(/_TRAIT$/, '').toLowerCase() as never);
    // LOC_GREAT_WORK_OBJECT_SCULPTURE_NAME → 'SCULPTURE'
    case 'gwObject': return GWO_NAMES.indexOf(after('GREAT_WORK_OBJECT_') as never);
    // LOC_PROMOTION_CLASS_HEAVY_CAVALRY_NAME → 'HEAVY_CAV'
    case 'promoClass': {
      const cls = after('PROMOTION_CLASS_');
      return PROMO_CLASSES.indexOf((PROMO_CLASS_ABBREV[cls] ?? cls) as never);
    }
    case 'seat': {
      // a PlayerType target is the player id itself
      const pid = /^\d+$/.test(thing) ? Number(thing) : -1;
      const seat = rec.players.some((q) => q.id === pid) ? seatOfGame(pid) : NO_SEAT;
      return seat >= 0 && seat < majors ? seat : -1;
    }
    case 'feature': {
      const name = `FEATURE_${after('FEATURE_')}`;
      return CLEARABLE.indexOf(FEATURE_ID[name] ?? strip(name, 'FEATURE_'));
    }
    case 'spyMission': {
      const op = core.replace(/_DESCRIPTION$/, '');
      return SPY_OFFENSIVE_MISSIONS.indexOf(SPY_MISSIONS.findIndex((m) => `UNITOPERATION_SPY_${m.id}` === op));
    }
    default: return -1;
  }
}
