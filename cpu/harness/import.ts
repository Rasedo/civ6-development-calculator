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
import type { City, CityState, CityStateType, DistrictId, FeatureId, GameMap, GameState, ImprovementId, TerrainId, Tile, Unit } from '../core/types';
import { NO_SEAT } from '../core/types';
import { createGameFromMap } from '../core/game';
import { BARB_SEAT, FREE_SEAT, emptySeat, freeSeatOf, markCityCentre, seatOf, seatOfCityState, setTileOwner, setWar } from '../core/seats';
import { governorsOf } from '../core/governors';
import { FERTILITY_CAP } from '../core/disasters';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX } from '../data/governors';
import { CIV_LEADERS } from '../data/seats';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { CIVICS } from '../data/civics';
import { TECHS } from '../data/techs';
import { UNITS, CITY_MAX_HP, UNIT_HP } from '../data/units';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { IMPROVEMENTS } from '../data/improvements';
import { GOVERNMENTS, POLICIES } from '../data/policies';
import { ENHANCER_BELIEFS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, PANTHEONS, WORSHIP_BELIEFS } from '../data/religion';
import { AGE_GOLDEN } from '../data/seats';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { FEATURES, clearableFeatures } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { neighborTile } from '../../world/hex';
import { GP_CITY_PERM, GP_CLASSES, GREAT_PEOPLE } from '../data/greatPeople';
import {
  GW_GP_EXTRA_SLOTS, GW_HOLDERS, GW_LAYOUT, GWO_ARTIFACT, GWO_LANDSCAPE, GWO_MUSIC, GWO_PORTRAIT, GWO_RELIC, GWO_RELIGIOUS,
  GWO_SCULPTURE, GWO_WRITING, holderSlots, type GreatWork,
} from '../data/greatWorks';
import { CONGRESS_RESOLUTIONS } from '../data/seats';
import { PROJECTS, PROJECT_LIST } from '../data/projects';
import { GOVERNORS } from '../data/governors';
import { GOVERNMENT_LIST, POLICY_LIST } from '../data/policies';
import { LUXURY_IDS } from '../../world/resources';
import { SPY_MISSIONS, SPY_OFFENSIVE_MISSIONS } from '../data/espionage';
import type { QueueItem } from '../core/types';
import { projectCost, settlerCost } from '../core/game';
import { builderCost, traderCost } from '../core/units';
import { computeUnlocks } from '../core/effects';
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
  /** does the record carry the queues' banked production (`queueProgress`)?
   *  Where it does not, every imported queue item stands at 0 */
  queueProgressRead: boolean;
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
  FEATURE_BURNT_JUNGLE: 'BURNT_RAINFOREST',
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
  bestMelee: Map<number, number>;
  /** culture expansions by the city's centre plot (a capture keeps them) */
  cultureTaken: Map<number, number>;
  /** Builders each player has gained: a Builder id new at t+1 */
  builders: Map<number, number>;
  /** centre plots of cities already standing at the first record past turn 1 */
  unknownSince: Set<number>;
  /** a fire's fertility by plot: +1 Food when it turns burnt, +1 Production
   *  when its feature regrows (`RandomEvent_Yields` Turns 2 and 6) */
  fireFood: Map<number, number>;
  fireProd: Map<number, number>;
  /** an eruption's fertility by plot, [Food, Production, Science]: what the
   *  plot gained when it turned to Volcanic Soil — the game's own per-plot
   *  draw off `RandomEvent_Yields`, read as the record's yields against the
   *  record before, the feature the soil replaced given back */
  soil: Map<number, [number, number, number]>;
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
  return { firstTurn: -1, last: null, bestMelee: new Map(), cultureTaken: new Map(), builders: new Map(),
    unknownSince: new Set(), fireFood: new Map(), fireProd: new Map(), soil: new Map(), ages: new Map(),
    eraTurns: [], gameEra: 0, eraStartTurn: 1, eraCountdown: -1 };
}

/** Fold one record into the history, in turn order. */
export function advanceHistory(h: History, rec: TurnRecord, cat: Catalog): void {
  const W = rec.head.W;
  const uReplace = new Map(cat.unitReplaces);
  const melee = (idx: number) => {
    const id = unitId({ cat, uReplace, gaps: new Map() }, idx);
    const def = id ? UNITS[id] : undefined;
    return def && def.combat > 0 && !def.ranged ? def.combat : 0;
  };
  if (h.last === null) {
    h.firstTurn = rec.turn;
    if (rec.turn > 1) for (const c of rec.cities) h.unknownSince.add(c.y * W + c.x);
  } else {
    const seen = new Set(h.last.units.map((u) => `${u.owner}:${u.id}`));
    const builder = cat.units.indexOf('UNIT_BUILDER');
    for (const u of rec.units) {
      if (seen.has(`${u.owner}:${u.id}`)) continue;
      const cs = melee(u.type);
      if (cs > (h.bestMelee.get(u.owner) ?? 0)) h.bestMelee.set(u.owner, cs);
      if (u.type === builder) h.builders.set(u.owner, (h.builders.get(u.owner) ?? 0) + 1);
    }
    const before = new Map(h.last.cities.map((c) => [c.y * W + c.x, c]));
    for (const c of rec.cities) {
      const b = before.get(c.y * W + c.x);
      if (!b || b.owner !== c.owner) continue;
      // the box fell: culture paid for a plot
      const k = c.y * W + c.x;
      if (num(c.culture) < num(b.culture) - 0.01) h.cultureTaken.set(k, (h.cultureTaken.get(k) ?? 0) + 1);
    }
    const fname = (i: number) => cat.features[plotAt(rec, i)[P.feature] as number] ?? '';
    const fwas = (i: number) => cat.features[plotAt(h.last!, i)[P.feature] as number] ?? '';
    for (let i = 0; i < W * rec.head.H; i++) {
      const was = fwas(i);
      const now = fname(i);
      if (was === now) continue;
      if (now === 'FEATURE_VOLCANIC_SOIL') {
        const y = plotAt(rec, i)[P.yields] as number[];
        const y0 = plotAt(h.last, i)[P.yields] as number[];
        const lost = was ? FEATURES[FEATURE_ID[was] ?? strip(was, 'FEATURE_')]?.yields ?? {} : {};
        const gain = (k: number, key: 'food' | 'production' | 'science') =>
          Math.max(0, (y?.[k] ?? 0) - (y0?.[k] ?? 0) + ((lost as Partial<Record<string, number>>)[key] ?? 0));
        const acc = h.soil.get(i) ?? [0, 0, 0];
        h.soil.set(i, [acc[0] + gain(0, 'food'), acc[1] + gain(1, 'production'), acc[2] + gain(3, 'science')]);
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
  }
  h.last = rec;
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
  for (const [i, n] of history?.fireFood ?? []) tiles[i].fertility = Math.min(FERTILITY_CAP, n);
  for (const [i, n] of history?.fireProd ?? []) tiles[i].fertilityProd = Math.min(FERTILITY_CAP, n);
  for (const [i, [f, pr, sc]] of history?.soil ?? []) {
    tiles[i].fertility = Math.min(FERTILITY_CAP, tiles[i].fertility + f);
    tiles[i].fertilityProd = Math.min(FERTILITY_CAP, tiles[i].fertilityProd + pr);
    if (sc) tiles[i].fertilitySci = Math.min(FERTILITY_CAP, (tiles[i].fertilitySci ?? 0) + sc);
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
    state.seats.push(seat);
    seatOfPlayer.set(p.id, i);
    playerOfSeat.set(i, p.id);
  });
  const minorOfPlayer = new Map<number, CityState>();
  minors.forEach((p, k) => {
    const seat = seatOfCityState(k);
    seatOfPlayer.set(p.id, seat);
    playerOfSeat.set(seat, p.id);
    const kind = strip(inherits.get(String(p.leader)) ?? '', 'LEADER_MINOR_CIV_').toLowerCase();
    if (!CITY_STATE_TYPES.includes(kind as CityStateType)) gap(ctx, 'city-state-type', String(p.leader));
    const cs: CityState = {
      ...emptySeat(seat), id: k, name: strip(String(p.civ), 'CIVILIZATION_'),
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
    ctx.scopeSeat = undefined;
    s.bestMeleeCS = history?.bestMelee.get(p.id) ?? 0;
    s.buildersTrained = history?.builders.get(p.id) ?? 0;
    if (bool(p.major)) importAges(s, p, history);
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

  // the cities
  const cityByKey = new Map<string, City>();
  const dumpOfCity = new Map<City, DumpCity>();
  const dumpOfMinor = new Map<CityState, DumpCity>();
  const cities = [...rec.cities].sort((a, b) => a.owner - b.owner || a.id - b.id);
  for (const c of cities) {
    ctx.scopeCity = `${c.owner}:${c.id}`;
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
    if (Array.isArray(c.religions)) {
      for (const r of c.religions) {
        const g = religionSeat.get(r.Religion);
        if (g !== undefined) religionPressure[g] = r.Pressure;
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
    if (num(c.amenityParts?.[14]) > 0) gap(ctx, 'bankruptcy', 'not imported');
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
      let promotions = 0;
      for (const pi of promos) {
        const pid = engineId('promotion', cat.promotions[pi], 'GOVERNOR_PROMOTION_', GOVERNOR_PROMOTION_INDEX);
        if (pid) promotions |= 1 << GOVERNOR_PROMOTION_INDEX[pid];
        else gap(ctx, 'governor-promotion', cat.promotions[pi]);
      }
      const minor = minorOfPlayer.get(owner);
      const city = cityByKey.get(`${owner}:${cityId}`);
      roster[GOVERNOR_INDEX[id as keyof typeof GOVERNOR_INDEX]] = {
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

  // the luxuries a seat holds beyond its own improved plots came by a deal or
  // a city-state, and those it exports left by one: the importer carries no
  // deal, so both are the seat's gaps
  for (const p of players) {
    const seat = seatOfGame(p.id);
    if (seat === NO_SEAT || !seatOf(state, seat)) continue;
    ctx.scopeSeat = seat;
    for (const [ri, held, exported] of p.luxuries ?? []) {
      const rname = cat.resources[ri];
      const id = strip(rname, 'RESOURCE_');
      const own = tiles.filter((t) => t.ownerSeat === seat && t.resource === id && t.improvement && !t.pillaged).length;
      if (held > own) gap(ctx, 'luxury-imported', rname);
      if (exported > 0) gap(ctx, 'luxury-exported', rname);
    }
    ctx.scopeSeat = undefined;
  }

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
    state.units.push(unit);
  }
  state.nextUnitId = nextId;

  // the World Congress, then the build queues: last, so the prices the
  // engine locks at queueing read the whole imported state
  const congressGaps = importCongress(rec, cat, state, religionSeat, seatOfGame);
  // (a queued row the engine lacks is the game's gap, no city's: nothing a
  // check reads comes from the queue)
  let queueProgressRead = false;
  for (const city of cityByKey.values()) {
    if (importQueue(ctx, state, dumpOfCity.get(city)!, city)) queueProgressRead = true;
  }
  return {
    state, seatOfPlayer, playerOfSeat, cityByKey, dumpOfCity, minorOfPlayer, dumpOfMinor,
    gaps: ctx.gaps, seatGaps: ctx.seatGaps!, tileGaps: ctx.tileGaps!, cityGaps: ctx.cityGaps!, religionSeat,
    congressGaps, queueProgressRead,
    tilesUnknown: new Set(rec.cities.map((c) => c.y * W + c.x).filter((k) => !history || history.unknownSince.has(k))),
  };
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
 * the game's whole-game era score and its two age bars.
 */
function importAges(s: GameState['seats'][number], p: DumpPlayer, history?: History): void {
  const engineAge = (a: number) => (a >= AGE_GOLDEN_ONLY ? AGE_GOLDEN : a === AGE_DARK ? 0 : 1);
  s.age = engineAge(ageOf(p));
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
 * not (`Imported.queueProgressRead`). The prices the engine locks at
 * queueing (a district's, a project's, a Settler's, a Builder's or a
 * Trader's) are the engine's own for the imported state.
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
      unlocks ??= computeUnlocks(state, city.seat);
      queue.push({ kind: 'district', district: id, tileIndex: at, progress, cost: districtSiteCost(state, s, id, unlocks) });
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
 * record's table becomes `{ res, outcome, target }` — the resolution by its
 * type's hash, outcome 0 for the entry's "A", the target its localisation key
 * names in the engine's own target space for the resolution's kind. The
 * Diplomatic Victory resolution stands outside the engine's table. Every
 * entry the importer cannot place is returned as a gap.
 */
function importCongress(rec: TurnRecord, cat: Catalog, state: GameState, religionSeat: Map<number, number>,
  seatOfGame: (pid: number) => number): string[] {
  const table = rec.congress;
  if (!table || typeof table !== 'object') return [];
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
  state.congress = out;
  return gaps;
}

/** a resolution's target in the engine's target space for its kind, read off
 *  the localisation key the game names it by; -1 where the engine has none */
function congressTarget(kind: string, thing: string, rec: TurnRecord, cat: Catalog,
  religionSeat: Map<number, number>, seatOfGame: (pid: number) => number, majors: number): number {
  const core = strip(thing, 'LOC_').replace(/_NAME$/, '');
  const after = (prefix: string) => (core.startsWith(prefix) ? core.slice(prefix.length) : '');
  switch (kind) {
    case 'district': {
      const id = engineId('district', core, 'DISTRICT_', DISTRICTS);
      return id ? PLACEABLE_DISTRICTS.indexOf(id as DistrictId) : -1;
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
    case 'currency': return core === 'YIELD_GOLD' ? 0 : core === 'YIELD_FAITH' ? 1 : -1;
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
