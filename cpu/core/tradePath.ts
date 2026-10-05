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
 * THIS ENGINE'S READING where the DLL's own order is unread (the A*
 * heuristic 0x271490 and its heap): the heuristic is 0, so the search is
 * Dijkstra's, one label per plot. The open plot popped next is the one with
 * the least cost, the LOWER plot index on a tie. A plot's label is replaced by
 * a strictly cheaper one, or by an equally cheap one leaving MORE range; on a
 * full tie the first label stays. Edges are tried in neighbour-direction
 * order, then the portal exit. The GPU twin (`_trade_reach`) runs the same
 * walk plot for plot.
 */
import type { GameState, Tile } from './types';
import { srcConst, xml } from '../data/provenance';
import { MP_SCALE, TRADE_COURSE_MAX } from '../data/constants';
import { neighborTile } from '../../world/hex';
import { isImpassable, isWater } from '../../world/query';
import { civsAtWar, isCityStateSeat, seatOf } from './seats';
import { isExplored } from './fog';
import { portalAt, portalExit } from './rules';
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
  /** TradeEmbark plot -> its city's centre */
  embark: Map<number, number>;
  /** the embark plots this walk refuels at */
  refuel: Set<number>;
  exit: Map<number, number>;
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
  const exit = new Map<number, number>();
  for (const t of state.map.tiles) if (portalAt(t)) exit.set(t.index, portalExit(state.map, t));
  return { water: tradeWaterLevel(state, seat), major: !isCityStateSeat(seat), holder, embark, refuel, exit };
}

/** 0x558db0: may the walk enter this plot? Impassable ground and a mountain
 *  with no tunnel, a plot a major has not revealed, water where the seat's
 *  Trader cannot embark, and a foreign centre of a holder at war are closed. */
function plotOpen(state: GameState, gr: TradeGraph, seat: number, t: Tile): boolean {
  if (!portalAt(t) && isImpassable(t)) return false;
  if (isWater(t) && gr.water < TRADE_WATER_OPEN) return false;
  if (gr.major && !isExplored(state, seat, t.index)) return false;
  const who = gr.holder.get(t.index);
  return who === undefined || who === seat || !civsAtWar(state, seat, who);
}

/** 0x558970's plot term: what stepping ONTO this plot adds. */
function plotTerm(gr: TradeGraph, t: Tile): number {
  if (gr.holder.has(t.index) || portalAt(t)) return 0;
  if (t.railroad) return TRADE_COST_RAIL;
  if (t.road) return TRADE_COST_ROUTE;
  if (isWater(t)) return TRADE_COST_WATER;
  return (TRADE_COST_LAND * terrainMp(t)) / MP_SCALE;
}

/** A binary min-heap of packed (cost, plot) keys. */
class KeyHeap {
  private a: number[] = [];
  get size(): number { return this.a.length; }
  push(k: number): void {
    const a = this.a;
    a.push(k);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p] <= k) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = k;
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= a.length) break;
        const c = l + 1 < a.length && a[l + 1] < a[l] ? l + 1 : l;
        if (a[c] >= last) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return top;
  }
}

/**
 * THE WALK from `origin` for `seat`'s Traders, over every plot. Per edge
 * u -> v: a switch, a step between land and water (0x558300 over IsLand
 * 0x5583a0 / IsWater 0x558460: a City Centre's plot answers neither, any
 * other plot its ground, a Harbor water), needs a TradeEmbark district at
 * one end (0x558db0) and caps the range r left at u to 1; r is then
 * refuelled at u's refuelling district to TRADE_LAND_REFUEL onto land,
 * TRADE_WATER_REFUEL onto water, the larger onto a centre, or else at a
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
  const heap = new KeyHeap();
  g[origin] = 0;
  left[origin] = TRADE_BASE_RANGE;
  heap.push(origin);
  const nb: number[] = [];
  while (heap.size > 0) {
    const key = heap.pop();
    const u = key % T;
    if (done[u] || (key - u) / T !== g[u]) continue;
    done[u] = 1;
    const at = tiles[u];
    if (u !== origin && at.feature && TRADE_DANGER_FEATURES.includes(at.feature)) continue;
    nb.length = 0;
    for (let d = 0; d < 6; d++) {
      const n = neighborTile(map, at, d);
      if (n) nb.push(n.index);
    }
    const ex = gr.exit.get(u) ?? -1;
    if (ex >= 0) nb.push(ex);
    const wu = isWater(at);
    const cu = gr.holder.has(u);
    const eu = gr.embark.has(u);
    const fuel = gr.refuel.has(u);
    const dfuel = !fuel && dest >= 0 && gr.embark.get(u) === dest;
    for (const v of nb) {
      if (done[v]) continue;
      const to = tiles[v];
      if (!plotOpen(state, gr, seat, to)) continue;
      const wv = isWater(to);
      const cv = gr.holder.has(v);
      const sw = !cu && !cv && wu !== wv;
      if (sw && !eu && !gr.embark.has(v)) continue;
      let r = sw ? Math.min(left[u], 1) : left[u];
      if (fuel) r = cv ? Math.max(TRADE_WATER_REFUEL, TRADE_LAND_REFUEL) : wv ? TRADE_WATER_REFUEL : TRADE_LAND_REFUEL;
      else if (dfuel) r = TRADE_DEST_REFUEL;
      const lv = r - 1;
      if (lv < 0) continue;
      const gv = g[u] + TRADE_COST_STEP + plotTerm(gr, to) + (sw && !fuel && !dfuel ? TRADE_COST_SWITCH : 0);
      if (g[v] < 0 || gv < g[v] || (gv === g[v] && lv > left[v])) {
        g[v] = gv;
        left[v] = lv;
        parent[v] = u;
        steps[v] = steps[u] + 1;
        heap.push(gv * T + v);
      }
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

/** Is `dest` within `seat`'s trade range of `origin`? */
export function routeInRange(state: GameState, seat: number, origin: number, dest: number): boolean {
  return tradeCourse(tradeReach(state, seat, origin), dest) !== null;
}
