/**
 * THE TRADER'S PATH AND RANGE (GameCore_XP2 Trade_Movement.cpp; the
 * pathfinder's callbacks installed at 0x557fd0: step cost 0x558970, node
 * valid 0x558db0, range 0x5579b0 — `tools/civ6lab/dll_readings.md`, checked
 * by `tools/civ6lab/dll_tradepath.py`).
 *
 * A route's path is the least-cost path from its origin under the DLL's step
 * costs and closed plots, and its range is a budget walked along that path,
 * not a hex distance between the ends. The search runs from ONE origin over
 * every plot at once (`tradeReach`): every destination's path and range come
 * out of the same walk, which is what lets the candidate lists ask about every
 * pair. The one destination-bound rule — the destination city's own
 * TradeEmbark districts refuel to `TRADE_DEST_REFUEL` — changes a course only
 * where the walk reaches such a district short of the centre, and only there
 * does `tradeCourse` walk again for that one destination.
 *
 * The search is the pathfinder's (CvAStar, GeneratePath 0x77d10 over
 * SearchStep 0x793f0) with no heuristic: the open list is sorted by cost, a
 * new node placed by AddToOpen 0x775a0 (below the head first, above the tail
 * last, else from the nearer end by cost: strictly nearer the tail after its
 * equals, else before them), the head popped (GetBest 0x781e0), its children
 * the six neighbours in DirectionTypes order and then its portal jumps
 * (0x77a50, `pathPortals`), each linked where the node test passes; an open
 * node is re-parented only where strictly cheaper (LinkChild 0x78750),
 * re-keyed after its new equals (0x79560), its range taken again from the new
 * parent. The GPU twin (`_trade_reach`) runs the same walk plot for plot.
 */
import type { GameState, Tile } from './types';
import { srcConst, xml } from '../data/provenance';
import { MP_SCALE, TRADE_COURSE_MAX } from '../data/constants';
import { DIRECTION_TYPES, neighborTile } from '../../world/hex';
import { isImpassable, isWater, multiDomainPlot } from '../../world/query';
import { civsAtWar, isCityStateSeat, seatOf } from './seats';
import { isExplored } from './fog';
import { pathPortals } from './rules';
import { terrainMp, tradeWaterLevel, TRADE_WATER_OPEN } from './units';

export const TRADE_BASE_RANGE = srcConst('trade.baseRange', 15,
  xml('GlobalParameters', 'Name=TRADE_ROUTE_BASE_RANGE', 'Value'));
export const TRADE_LAND_REFUEL = srcConst('trade.landRefuel', 15,
  xml('GlobalParameters', 'Name=TRADE_ROUTE_LAND_RANGE_REFUEL', 'Value'));
export const TRADE_WATER_REFUEL = srcConst('trade.waterRefuel', 30,
  xml('GlobalParameters', 'Name=TRADE_ROUTE_WATER_RANGE_REFUEL', 'Value'));
/** the destination city's own TradeEmbark districts refuel to this, whatever
 *  the next plot */
export const TRADE_DEST_REFUEL = srcConst('trade.destRefuel', 3, {
  lab: 'GameCore_XP2 0x558ca5: the path context stores 3 at +0x1b0, the range callback 0x5579b0 '
    + 'refuels to it from a TradeEmbark district of the destination city (context +0xd8/+0xdc) '
    + 'when the origin and trading-post refuels do not apply, and marks the step refuelled',
});

const COST_LAB = '(GameCore_XP2 0x558970, tools/civ6lab/dll_readings.md C-20)';
/** the step cost, in 1/100 move: every step's base */
export const TRADE_COST_STEP = srcConst('trade.costStep', 100, { lab: `${COST_LAB}: every step 100` });
/** onto a Railroad, the route of the highest PlacementValue */
export const TRADE_COST_RAIL = srcConst('trade.costRail', 10, { lab: `${COST_LAB}: the best route +10` });
/** onto any other route */
export const TRADE_COST_ROUTE = srcConst('trade.costRoute', 50, { lab: `${COST_LAB}: any other route +50` });
/** onto water with no route */
export const TRADE_COST_WATER = srcConst('trade.costWater', 50, { lab: `${COST_LAB}: water with no route +50` });
/** onto bare land, per point of the plot's movement cost */
export const TRADE_COST_LAND = srcConst('trade.costLand', 100, { lab: `${COST_LAB}: land with no route +100 x the plot's movement cost` });
/** a land<->water switch the range callback did not refuel */
export const TRADE_COST_SWITCH = srcConst('trade.costSwitch', 10000, {
  lab: `${COST_LAB}: 0x558a08 swaps the step's 100 for 10100 when 0x558300 answers a switch and the range `
    + 'callback 0x5579b0 left its refuelled flag (context +0x1cc) clear',
});

/** CIV6 (`Districts.TradeEmbark`): the districts a Trader embarks and refuels
 *  at. The Royal Navy Dockyard and the Cothon are this engine's Harbor. */
export const TRADE_EMBARK_DISTRICTS: readonly string[] = srcConst('trade.embarkDistricts', ['CITY_CENTER', 'HARBOR'], {
  derived: 'the Districts rows with TradeEmbark true, as the engine district (DISTRICT_ROYAL_NAVY_DOCKYARD and '
    + 'DISTRICT_COTHON are variants of HARBOR here)',
  inputs: ['CITY_CENTER', 'HARBOR', 'ROYAL_NAVY_DOCKYARD', 'COTHON'].map(
    (d) => xml('Districts', `DistrictType=DISTRICT_${d}`, 'TradeEmbark', { expect: true })),
});

/** CIV6 (`Features.DangerValue` > 0): the features a Trader's path never
 *  crosses, save as its destination (0x558db0). */
export const TRADE_DANGER_FEATURES: readonly string[] = srcConst('trade.dangerFeatures', ['BURNING_RAINFOREST', 'BURNING_WOODS'], {
  derived: 'the Features rows with DangerValue > 0 this engine carries, as the engine feature '
    + '(FEATURE_BURNING_JUNGLE is BURNING_RAINFOREST, FEATURE_BURNING_FOREST is BURNING_WOODS)',
  inputs: [xml('Features', 'FeatureType=FEATURE_BURNING_JUNGLE', 'DangerValue', { expect: 80 }),
    xml('Features', 'FeatureType=FEATURE_BURNING_FOREST', 'DangerValue', { expect: 80 })],
});

/** The facts the walk reads for one (seat, origin). */
interface TradeGraph {
  water: number;
  major: boolean;
  /** living city centre -> its holder */
  holder: Map<number, number>;
  /** the plots that are neither land nor water to the walk: every living
   *  city centre and every Canal plot (`multiDomainPlot`) */
  neither: Set<number>;
  /** TradeEmbark plot -> its city's centre */
  embark: Map<number, number>;
  /** the embark plots this walk refuels at */
  refuel: Set<number>;
  /** portal plot -> the portals it jumps to (`pathPortals`) */
  exit: Map<number, number[]>;
}

/** One origin's walk: per plot the least cost found (-1 unreached), the
 *  range left on arriving, the plot it came from and its step count — and
 *  what it walked, so `tradeCourse` can walk again for one destination. */
export interface TradeReach {
  state: GameState;
  seat: number;
  origin: number;
  graph: TradeGraph;
  g: Int32Array;
  left: Int32Array;
  parent: Int32Array;
  steps: Int32Array;
}

function tradeGraph(state: GameState, seat: number, origin: number): TradeGraph {
  const holder = new Map<number, number>();
  const embark = new Map<number, number>();
  const add = (who: number, centre: number, districts: readonly { type: string; tileIndex: number }[]): void => {
    holder.set(centre, who);
    embark.set(centre, centre);
    for (const d of districts) if (TRADE_EMBARK_DISTRICTS.includes(d.type)) embark.set(d.tileIndex, centre);
  };
  for (const s of state.seats) for (const c of s.cities) add(s.seat, c.centerIndex, c.districts);
  for (const c of state.freeSeat?.cities ?? []) add(state.freeSeat!.seat, c.centerIndex, c.districts);
  for (const cs of state.cityStates ?? []) add(cs.seat, cs.centerIndex, cs.districts ?? []);
  // a refuelling district: the ORIGIN city's, or a city's where this seat
  // holds a constructed Trading Post, its holder not at war with the seat
  // (City_Trade 0x1f99d0)
  const posts = seatOf(state, seat)?.tradingPosts ?? [];
  const refuel = new Set<number>();
  for (const [plot, centre] of embark) {
    const who = holder.get(centre)!;
    if (centre === origin || (posts.includes(centre) && (who === seat || !civsAtWar(state, seat, who)))) refuel.add(plot);
  }
  const neither = new Set(holder.keys());
  for (const t of state.map.tiles) if (multiDomainPlot(t)) neither.add(t.index);
  const exit = pathPortals(state.map);
  return { water: tradeWaterLevel(state, seat), major: !isCityStateSeat(seat), holder, neither, embark, refuel, exit };
}

/** 0x558db0: may the walk enter this plot? Impassable ground and every
 *  mountain (no portal stands on one), a plot a major has not revealed, water
 *  where the seat's Trader cannot embark, and a foreign centre of a holder at
 *  war are closed. */
function plotOpen(state: GameState, gr: TradeGraph, seat: number, t: Tile): boolean {
  if (isImpassable(t)) return false;
  if (isWater(t) && gr.water < TRADE_WATER_OPEN) return false;
  if (gr.major && !isExplored(state, seat, t.index)) return false;
  const who = gr.holder.get(t.index);
  return who === undefined || who === seat || !civsAtWar(state, seat, who);
}

/** 0x558970's plot term: what stepping ONTO this plot adds. */
function plotTerm(gr: TradeGraph, t: Tile): number {
  if (gr.neither.has(t.index)) return 0;
  if (t.railroad) return TRADE_COST_RAIL;
  if (t.road) return TRADE_COST_ROUTE;
  if (isWater(t)) return TRADE_COST_WATER;
  return (TRADE_COST_LAND * terrainMp(t)) / MP_SCALE;
}

/** The pathfinder's open list, sorted by cost: kept dearest first, so the
 *  head (the cheapest) is the array's last entry. */
class OpenList {
  private plot: number[] = [];
  private cost: number[] = [];
  get size(): number { return this.plot.length; }
  /** GetBest 0x781e0: the head */
  pop(): number {
    this.cost.pop();
    return this.plot.pop()!;
  }
  /** the entries dearer than c, or as dear too where orEqual is set */
  private count(c: number, orEqual: boolean): number {
    let lo = 0;
    let hi = this.cost.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.cost[m] > c || (orEqual && this.cost[m] === c)) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  private put(at: number, p: number, c: number): void {
    this.plot.splice(at, 0, p);
    this.cost.splice(at, 0, c);
  }
  /** AddToOpen 0x775a0: below the head first, above the tail last; else
   *  strictly nearer the tail by cost after its equals, else before them */
  add(p: number, c: number): void {
    const n = this.cost.length;
    if (n === 0 || c < this.cost[n - 1]) this.put(n, p, c);
    else if (c > this.cost[0]) this.put(0, p, c);
    else this.put(this.count(c, Math.abs(c - this.cost[0]) >= Math.abs(c - this.cost[n - 1])), p, c);
  }
  /** 0x79560: an open node made cheaper goes after its new equals */
  rekey(p: number, c: number): void {
    const i = this.plot.indexOf(p);
    this.plot.splice(i, 1);
    this.cost.splice(i, 1);
    this.put(this.count(c, false), p, c);
  }
}

/**
 * THE WALK from `origin` for `seat`'s Traders, over every plot. Per edge
 * u -> v: a switch, a step between land and water (0x558300 over IsLand
 * 0x5583a0 / IsWater 0x558460: a City Centre's plot and a Canal's answer
 * neither, any other plot its ground, a Harbor water), needs a TradeEmbark
 * district at one end (0x558db0) and caps the range r left at u to 1; r is
 * then refuelled at u's refuelling district to TRADE_LAND_REFUEL onto land,
 * TRADE_WATER_REFUEL onto water, the larger onto a neither plot, or else at a
 * district of the destination's city (`dest`'s embark plots, -1 none) to
 * TRADE_DEST_REFUEL; the edge leaves r - 1 and is refused below 0. The cost:
 * TRADE_COST_STEP, v's plot term, and TRADE_COST_SWITCH on a switch u did not
 * refuel. A plot whose feature is a danger is reached but never walked
 * through.
 */
function walk(state: GameState, seat: number, origin: number, gr: TradeGraph, dest: number): TradeReach {
  const map = state.map;
  const tiles = map.tiles;
  const T = tiles.length;
  const g = new Int32Array(T).fill(-1);
  const left = new Int32Array(T);
  const parent = new Int32Array(T).fill(-1);
  const steps = new Int32Array(T);
  const done = new Uint8Array(T);
  const open = new OpenList();
  g[origin] = 0;
  left[origin] = TRADE_BASE_RANGE;
  open.add(origin, 0);
  const nb: number[] = [];
  while (open.size > 0) {
    const u = open.pop();
    done[u] = 1;
    const at = tiles[u];
    if (u !== origin && at.feature && TRADE_DANGER_FEATURES.includes(at.feature)) continue;
    nb.length = 0;
    for (const d of DIRECTION_TYPES) {
      const n = neighborTile(map, at, d);
      if (n) nb.push(n.index);
    }
    for (const ex of gr.exit.get(u) ?? []) nb.push(ex);
    const wu = isWater(at);
    const cu = gr.neither.has(u);
    const eu = gr.embark.has(u);
    const fuel = gr.refuel.has(u);
    const dfuel = !fuel && dest >= 0 && gr.embark.get(u) === dest;
    for (const v of nb) {
      if (done[v]) continue;
      const to = tiles[v];
      if (!plotOpen(state, gr, seat, to)) continue;
      const wv = isWater(to);
      const cv = gr.neither.has(v);
      const sw = !cu && !cv && wu !== wv;
      if (sw && !eu && !gr.embark.has(v)) continue;
      let r = sw ? Math.min(left[u], 1) : left[u];
      if (fuel) r = cv ? Math.max(TRADE_WATER_REFUEL, TRADE_LAND_REFUEL) : wv ? TRADE_WATER_REFUEL : TRADE_LAND_REFUEL;
      else if (dfuel) r = TRADE_DEST_REFUEL;
      const lv = r - 1;
      if (lv < 0) continue;
      const gv = g[u] + TRADE_COST_STEP + plotTerm(gr, to) + (sw && !fuel && !dfuel ? TRADE_COST_SWITCH : 0);
      const fresh = g[v] < 0;
      if (!fresh && gv >= g[v]) continue;
      g[v] = gv;
      left[v] = lv;
      parent[v] = u;
      steps[v] = steps[u] + 1;
      if (fresh) open.add(v, gv);
      else open.rekey(v, gv);
    }
  }
  return { state, seat, origin, graph: gr, g, left, parent, steps };
}

/** One origin's walk for `seat`'s Traders, no destination bound. */
export function tradeReach(state: GameState, seat: number, origin: number): TradeReach {
  return walk(state, seat, origin, tradeGraph(state, seat, origin), -1);
}

/** The route's COURSE to `dest` out of one origin's walk: its plots, origin
 *  to destination — null where the walk never reaches `dest`, or where the
 *  course would run past `TRADE_COURSE_MAX` plots. Where the walk reached one
 *  of the destination city's own TradeEmbark districts short of its centre
 *  that does not already refuel, the destination's refuel can change the
 *  course: the walk runs again bound to `dest`. */
export function tradeCourse(reach: TradeReach, dest: number): number[] | null {
  if (dest < 0 || dest === reach.origin) return null;
  let w = reach;
  const gr = reach.graph;
  for (const [plot, centre] of gr.embark) {
    if (centre === dest && plot !== dest && !gr.refuel.has(plot) && reach.g[plot] >= 0) {
      w = walk(reach.state, reach.seat, reach.origin, gr, dest);
      break;
    }
  }
  if (w.g[dest] < 0 || w.steps[dest] >= TRADE_COURSE_MAX) return null;
  const out: number[] = [];
  for (let x = dest; x >= 0; x = w.parent[x]) out.push(x);
  return out.reverse();
}

/** Is `dest` within `seat`'s trade range of `origin`? (the pathfinder
 *  alone, 0x559140) */
export function routeInRange(state: GameState, seat: number, origin: number, dest: number): boolean {
  return tradeCourse(tradeReach(state, seat, origin), dest) !== null;
}

/**
 * THE TRADE GRAPH'S PATHS (Trade_Graph.cpp; `tools/civ6lab/dll_readings.md`
 * "C-108: the trade graph's paths"). One directed edge per pair of cities,
 * keyed by the two cities (`tradeVertices`: the holder and the city id; a
 * city-state's one city -1), holds the path last laid from the first to the
 * second (`GameState.tradeEdges`, m_vMostRecentPath). A city's capture mints
 * a new id, so its edges stop resolving.
 */

/** centre -> the trade graph's vertex of the living city there */
export function tradeVertices(state: GameState): Map<number, string> {
  const out = new Map<number, string>();
  for (const s of state.seats) for (const c of s.cities) out.set(c.centerIndex, `${s.seat}:${c.id}`);
  for (const c of state.freeSeat?.cities ?? []) out.set(c.centerIndex, `${state.freeSeat!.seat}:${c.id}`);
  for (const cs of state.cityStates ?? []) if (cs.centerIndex >= 0) out.set(cs.centerIndex, `${cs.seat}:-1`);
  return out;
}

/** the edge origin -> dest's path (0x541ae0: the edge's path, null where
 *  none is laid) */
export function tradeEdge(state: GameState, origin: number, dest: number,
  vx: Map<number, string> = tradeVertices(state)): number[] | null {
  const a = vx.get(origin);
  const b = vx.get(dest);
  const p = a && b ? state.tradeEdges?.[`${a}>${b}`] : undefined;
  return p && p.length > 0 ? p : null;
}

/** lay `path` on the edge origin -> dest (0x53e900 / 0x53e510) */
export function setTradeEdge(state: GameState, origin: number, dest: number, path: readonly number[],
  vx: Map<number, string> = tradeVertices(state)): void {
  const a = vx.get(origin);
  const b = vx.get(dest);
  if (!a || !b || path.length === 0) return;
  (state.tradeEdges ??= {})[`${a}>${b}`] = [...path];
}

/** CanStartRoute's path (0x552ed0): the edge origin -> dest holds a path,
 *  else the pathfinder reaches `dest` from the walk's origin */
export function tradeAdmits(reach: TradeReach, dest: number): boolean {
  return tradeEdge(reach.state, reach.origin, dest) !== null || tradeCourse(reach, dest) !== null;
}

/** A route's path from the walk's origin to `dest` (0x54bdb0 / 0x555380 /
 *  GetTradeRoutePath: the edge origin -> dest's path, else 0x5526a0): the
 *  edge's, else the edge dest -> origin's walked backwards, else the
 *  pathfinder's course (`tradeCourse`); null where none */
export function tradePath(reach: TradeReach, dest: number): number[] | null {
  const vx = tradeVertices(reach.state);
  const fwd = tradeEdge(reach.state, reach.origin, dest, vx);
  if (fwd) return [...fwd];
  const back = tradeEdge(reach.state, dest, reach.origin, vx);
  if (back) return [...back].reverse();
  return tradeCourse(reach, dest);
}

/** THE TRADE GRAPH'S UPDATE from one city (0x545020): over every other
 *  living city, each edge from `origin` with no route running on it
 *  (`running`, m_bHasActiveRoute) takes the pathfinder's course for the
 *  origin's holder `seat`; an edge it no longer reaches keeps its path */
export function refreshTradeEdges(state: GameState, seat: number, origin: number,
  running: (dest: number) => boolean): void {
  const vx = tradeVertices(state);
  if (!vx.has(origin)) return;
  const reach = tradeReach(state, seat, origin);
  for (const dest of vx.keys()) {
    if (dest === origin || running(dest)) continue;
    const course = tradeCourse(reach, dest);
    if (course) setTradeEdge(state, origin, dest, course, vx);
  }
}
