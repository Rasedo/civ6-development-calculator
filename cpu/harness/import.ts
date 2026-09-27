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
 * The game's map wraps in x and the engine's does not: `wrapped` answers
 * whether two plots are nearer across the seam, so a check whose reach
 * crosses it can skip.
 *
 * A city's worked plots are pinned (`Tile.locked`) and its district slots
 * take the game's specialist counts (`City.specialistPref`), so the engine's
 * yield walk works what the game works. What a single turn does not say
 * (the best melee a seat has trained, a city's culture expansions, a seat's
 * plot purchases) comes from a `History` folded over the earlier records.
 */
import type { City, CityState, CityStateType, DistrictId, FeatureId, GameState, ImprovementId, TerrainId, Tile, Unit } from '../core/types';
import { NO_SEAT } from '../core/types';
import { createGameFromMap } from '../core/game';
import { BARB_SEAT, FREE_SEAT, emptySeat, freeSeatOf, markCityCentre, seatOf, seatOfCityState, setTileOwner, setWar } from '../core/seats';
import { governorsOf } from '../core/governors';
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
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { hexDistance } from '../../world/hex';
import { P, bool, num, plotAt, type Catalog, type DumpCity, type DumpPlayer, type TurnRecord } from './record';
import { engineId } from './aliases';

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
  width: number;
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
}

const strip = (s: string, prefix: string) => (s.startsWith(prefix) ? s.slice(prefix.length) : s);

const TERRAIN_BASE: Record<string, TerrainId> = {
  GRASS: 'GRASSLAND', PLAINS: 'PLAINS', DESERT: 'DESERT', TUNDRA: 'TUNDRA', SNOW: 'SNOW',
};
const FEATURE_AS_BASE = new Set(['FEATURE_FLOODPLAINS_GRASSLAND', 'FEATURE_FLOODPLAINS_PLAINS']);
const FEATURE_ID: Record<string, string> = {
  FEATURE_FOREST: 'WOODS', FEATURE_JUNGLE: 'RAINFOREST', FEATURE_FLOODPLAINS_GRASSLAND: 'FLOODPLAINS',
  FEATURE_FLOODPLAINS_PLAINS: 'FLOODPLAINS', FEATURE_BARRIER_REEF: 'GREAT_BARRIER_REEF',
  FEATURE_KILIMANJARO: 'MOUNT_KILIMANJARO', FEATURE_EVEREST: 'MOUNT_EVEREST',
  FEATURE_CLIFFS_DOVER: 'CLIFFS_OF_DOVER', FEATURE_BURNING_FOREST: 'BURNING_WOODS',
  FEATURE_BURNT_FOREST: 'BURNT_WOODS', FEATURE_BURNING_JUNGLE: 'BURNING_RAINFOREST',
  FEATURE_BURNT_JUNGLE: 'BURNT_RAINFOREST',
};
/** the game's six river / cliff direction bits per plot: 1 = the plot lies NE
 *  of the edge (the edge is its SW side), 2 = NW of it (SE side), 4 = W of it
 *  (E side). The engine's directions (world/hex.ts): 0 E, 1 NE, 2 NW, 3 W,
 *  4 SW, 5 SE. */
const OWN_EDGES: [number, number][] = [[4, 0], [2, 5], [1, 4]];
/** the edges a neighbour's own bits carry, as [engine direction to the
 *  neighbour, the neighbour's bit] */
const NEIGHBOUR_EDGES: [number, number][] = [[3, 4], [2, 2], [1, 1]];

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
      if (id in FEATURES) {
        feature = id as FeatureId;
        // the grassland and plains floodplains are features of their own in
        // the game, which the engine carries as its one (desert) FLOODPLAINS
        if (FEATURE_AS_BASE.has(fname)) gap(ctx, 'feature-as-base', fname);
      } else gap(ctx, 'feature', fname);
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

/** The game plot index of the neighbour in ENGINE direction d, x wrapping as
 *  the game's map does. */
function gameNeighbour(W: number, H: number, i: number, d: number): number | null {
  const x = i % W;
  const y = Math.floor(i / W);
  const odd = (y & 1) === 1;
  // engine odd-r: 0 E, 1 NE (row - 1), 2 NW, 3 W, 4 SW (row + 1), 5 SE
  const table: [number, number][] = odd
    ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
    : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const [dx, dy] = table[d];
  const ny = y + dy;
  if (ny < 0 || ny >= H) return null;
  const nx = (x + dx + W) % W;
  return ny * W + nx;
}

function edgeMask(rec: TurnRecord, i: number, field: number): number {
  const W = rec.head.W;
  const H = rec.head.H;
  const own = plotAt(rec, i)[field] as number;
  let m = 0;
  for (const [bit, d] of OWN_EDGES) if (own & bit) m |= 1 << d;
  for (const [d, bit] of NEIGHBOUR_EDGES) {
    const n = gameNeighbour(W, H, i, d);
    if (n !== null && ((plotAt(rec, n)[field] as number) & bit)) m |= 1 << d;
  }
  return m;
}

/** Hex distance on the game's map, x wrapping; and whether the wrapped way
 *  is SHORTER than the engine's straight one. */
export function wrapped(width: number, a: number, b: number): boolean {
  const ca = a % width, ra = Math.floor(a / width);
  const cb = b % width, rb = Math.floor(b / width);
  const straight = hexDistance(ca, ra, cb, rb);
  const round = Math.min(hexDistance(ca + width, ra, cb, rb), hexDistance(ca, ra, cb + width, rb));
  return round < straight;
}

function leaderRow(leader: string): number {
  const id = strip(leader, 'LEADER_');
  return CIV_LEADERS.findIndex((l) => l.leader === id);
}

/**
 * WHAT ONE TURN'S STATE DOES NOT SAY, read off the records before it: the
 * strongest melee unit each player has trained or bought (a city centre's
 * base, `Seat.bestMeleeCS`), how many plots each city has taken with culture
 * (`City.tilesAcquired`, what a border expansion costs) and how many plots
 * each player has bought (`Seat.tilesPurchased`, what the next one costs).
 * All three are reconstructed from diffs — a unit id new at t+1, a culture
 * box that fell, a plot gained past it — so a game recorded from its first
 * turn carries them; a city first
 * seen after its founding turn is `unknownSince`, and a check reading its
 * count is skipped.
 */
export interface History {
  firstTurn: number;
  last: TurnRecord | null;
  bestMelee: Map<number, number>;
  /** culture expansions by the city's centre plot (a capture keeps them) */
  cultureTaken: Map<number, number>;
  /** plots each player has bought: a city's gained plots past its culture one */
  plotsBought: Map<number, number>;
  /** Builders each player has gained: a Builder id new at t+1 */
  builders: Map<number, number>;
  /** centre plots of cities already standing at the first record past turn 1 */
  unknownSince: Set<number>;
}

export function newHistory(): History {
  return { firstTurn: -1, last: null, bestMelee: new Map(), cultureTaken: new Map(), plotsBought: new Map(), builders: new Map(), unknownSince: new Set() };
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
      // the box fell: culture paid for a plot; every other plot the city
      // gained this turn was bought
      const k = c.y * W + c.x;
      const took = num(c.culture) < num(b.culture) - 0.01 ? 1 : 0;
      if (took) h.cultureTaken.set(k, (h.cultureTaken.get(k) ?? 0) + 1);
      const had = new Set(b.plots);
      const gained = c.plots.filter((q) => !had.has(q)).length;
      if (gained > took) h.plotsBought.set(c.owner, (h.plotsBought.get(c.owner) ?? 0) + gained - took);
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
  for (const t of tiles) {
    t.riverMask = edgeMask(rec, t.index, P.riverBits);
    t.cliffMask = edgeMask(rec, t.index, P.cliffBits);
  }
  const state = createGameFromMap({ width: W, height: H, seed: 0, tiles }, num(rec.seed) >>> 0);
  state.turn = rec.turn;

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
    s.tilesPurchased = history?.plotsBought.get(p.id) ?? 0;
    s.buildersTrained = history?.builders.get(p.id) ?? 0;
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
    if (c.greatWorks?.length) gap(ctx, 'great-works', 'not imported');
    if (num(c.governor) >= 0 && rec.players.find((q) => q.id === c.owner)?.governors === undefined) {
      gap(ctx, 'governor', 'not in the record');
    }
    // the amenities war weariness and a gold shortfall take: the engine's
    // weariness and shortfall ledgers are not in the dump
    if (num(c.amenityParts?.[13]) > 0) gap(ctx, 'war-weariness', 'not imported');
    if (num(c.amenityParts?.[14]) > 0) gap(ctx, 'bankruptcy', 'not imported');
  }

  ctx.scopeCity = undefined;

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
  return {
    state, seatOfPlayer, playerOfSeat, cityByKey, dumpOfCity, minorOfPlayer, dumpOfMinor,
    gaps: ctx.gaps, seatGaps: ctx.seatGaps!, tileGaps: ctx.tileGaps!, cityGaps: ctx.cityGaps!, religionSeat, width: W,
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
  s.eraScore = num(p.eraScore) || 0;
  s.age = bool(p.goldenAge) || bool(p.heroic) ? AGE_GOLDEN : bool(p.darkAge) ? 0 : 1;
  const pan = num(p.pantheon);
  if (pan >= 0) {
    const id = engineId('belief', cat.beliefs[pan], 'BELIEF_', PANTHEONS);
    if (id) s.religion.pantheon = id;
    else gap(ctx, 'pantheon', cat.beliefs[pan]);
  }
}
