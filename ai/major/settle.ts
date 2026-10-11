/**
 * WHERE THE MAJORS' AI FOUNDS ITS CITIES (GameCore_XP2 AI/GrandStrategic.cpp
 * and AI/SiteEvaluator; the reading is tools/civ6lab/dll_readings.md "C-97:
 * the settle site evaluation").
 *
 * Each turn the AI scores every plot of each map region (0x6fd510, one job
 * per region, the plots in index order) by its PlotEvaluations conditions
 * (0x6fd1d0 -> 0x702380) and keeps each region's list sorted best first, a
 * stable sort. The settler's operation targets the best region top
 * (0x6fe2b0, "Settle New City"); a seat without a city moves its settler to
 * the best plot of this turn's planning reach and founds there (0x70d250,
 * "HL: First turn settler").
 *
 * A score is 24.8 fixed point: each condition's whole-number term << 8,
 * their sum, less the danger << 8; a condition the plot fails (its
 * threshold) zeroes the score. A plot is a site with a score above 0.
 */
import type { OpsSettle } from '../../cpu/core/operations/types';
import { AI_FEATURES, AI_GLOBALS, AI_PLOT_EVAL_BY_CIV, AI_PLOT_EVAL_BY_LEADER, AI_PLOT_EVAL_BY_STRATEGY, AI_PLOT_EVAL_CONDITIONS, AI_PLOT_EVAL_LISTS,
  AI_RESOURCE_CLASS } from './tables';
import { dangerMap } from './danger';
import type { MajorReachView, MajorView } from './view';

/** CITY_MIN_RANGE (GlobalParameters +0x12c): the yield ring's reach, and a
 *  city's reach over a site on its own area */
const CITY_MIN_RANGE = AI_GLOBALS.CITY_MIN_RANGE;
/** the plots the ring callback walks (0x6b000's range, 5) */
const RING = 5;
/** the features' counted reach (0x6f93a0: distance 2 and under) */
const FEATURE_RANGE = 2;
/** a condition's failed threshold (0xffd8f1 << 8) */
const INVALID = -9999;
const FX = 256;

const FEATURE = new Map(AI_FEATURES.map((f) => [f.type, f] as const));
const CLASS_INDEX: Readonly<Record<string, number>> = { RESOURCECLASS_BONUS: 0, RESOURCECLASS_LUXURY: 1, RESOURCECLASS_STRATEGIC: 2 };

/** one condition's weights summed over the seat's lists (0x6dd310): a
 *  Favored row adds its Value to the threshold, any other to the value; a
 *  keyed row adds it to its yield, resource, feature (a natural wonder's to
 *  every natural wonder) or resource class too */
export interface PlotEvalEntry {
  threshold: number;
  value: number;
  yields: Map<string, number>;
  resources: Map<string, number>;
  features: Map<string, number>;
  classes: [number, number, number];
}

const COND = (name: string): number => {
  const i = AI_PLOT_EVAL_CONDITIONS.indexOf(name);
  if (i < 0) throw new Error(`settle: no condition ${name}`);
  return i;
};
const C_ENEMY = COND('Nearest Enemy City');
const C_FRIENDLY = COND('Nearest Friendly City');
const C_NEW_RESOURCES = COND('New Resources');
const C_INNER = COND('Inner Ring Yield');
const C_TOTAL = COND('Total Yield');
const C_COASTAL = COND('Coastal');
const C_FRESH = COND('Fresh Water');
const C_RESOURCE = COND('Specific Resource');
const C_FEATURE = COND('Specific Feature');
const C_CLASS = COND('Resource Class');
const C_FOREIGN = COND('Foreign Continent');
const C_PRESSURE = COND('Cultural Pressure');

/** the PlotEvaluations lists of the seat's leader, civilization and the
 *  strategies it follows, merged: one entry per condition */
export function plotEvalEntries(leader: string | null, civ: string | null, strategies: ReadonlySet<string>): PlotEvalEntry[] {
  const out: PlotEvalEntry[] = AI_PLOT_EVAL_CONDITIONS.map(() => ({ threshold: 0, value: 0, yields: new Map(), resources: new Map(),
    features: new Map(), classes: [0, 0, 0] }));
  const lists = [...(leader ? AI_PLOT_EVAL_BY_LEADER[leader] ?? [] : []), ...(civ ? AI_PLOT_EVAL_BY_CIV[civ] ?? [] : []),
    ...[...strategies].flatMap((s) => AI_PLOT_EVAL_BY_STRATEGY[s] ?? [])];
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const list of lists) {
    for (const it of AI_PLOT_EVAL_LISTS[list] ?? []) {
      const c = AI_PLOT_EVAL_CONDITIONS.indexOf(it.condition);
      if (c < 0) continue;
      const e = out[c];
      if (it.favored) e.threshold += it.value;
      else e.value += it.value;
      if (!it.stringVal) continue;
      if (c === C_INNER || c === C_TOTAL) add(e.yields, it.stringVal, it.value);
      else if (c === C_RESOURCE) add(e.resources, it.stringVal, it.value);
      else if (c === C_FEATURE) {
        if (FEATURE.get(it.stringVal)?.naturalWonder) {
          // the natural wonder row adds its value to its own feature once per
          // natural wonder in the database (0x76cee0 indexes the row's feature,
          // not the one the loop walks)
          for (const f of AI_FEATURES) if (f.naturalWonder) add(e.features, it.stringVal, it.value);
        } else add(e.features, it.stringVal, it.value);
      } else if (c === C_CLASS && it.stringVal in CLASS_INDEX) e.classes[CLASS_INDEX[it.stringVal]] += it.value;
    }
  }
  return out;
}

/** what the evaluation reads off a plot and its ring (the 0xd8-byte
 *  evaluation 0x76e070 clears) */
export interface PlotEval {
  continent: number;
  /** distance to the nearest of the seat's cities, 0 with none */
  nearest: number;
  enemy: number;
  danger: number;
  pressure: number;
  coastal: boolean;
  freshWater: boolean;
  newResources: number;
  inner: Map<string, number>;
  total: Map<string, number>;
  resources: Map<string, number>;
  features: Map<string, number>;
}

const YIELDS = ['YIELD_FOOD', 'YIELD_PRODUCTION', 'YIELD_GOLD', 'YIELD_SCIENCE', 'YIELD_CULTURE', 'YIELD_FAITH'] as const;

/** May the seat found a city on the plot (0x1eaa30)? Passable land, a
 *  feature that allows Settlement, no district, the seat's own territory or
 *  nobody's, and no city within CITY_MIN_RANGE on its area nor closer than
 *  CITY_MIN_RANGE off it (Rules_Cities 0x515910). */
export function canFoundAt(view: MajorView, seat: number, plot: number): boolean {
  const ps = view.plots();
  const p = ps[plot];
  if (p.impassable || p.water || p.district) return false;
  if (p.feature && FEATURE.get(p.feature)?.settlement === false) return false;
  if (p.owner !== -1 && p.owner !== seat) return false;
  for (const q of view.plotsWithin(plot, CITY_MIN_RANGE)) {
    const c = ps[q];
    if (!c.city) continue;
    if (c.area === p.area || view.plotDistance(plot, q) < CITY_MIN_RANGE) return false;
  }
  return true;
}

/** The plot's evaluation (0x6fd1d0 and its ring callback 0x6f93a0), null
 *  where the seat may not settle it (unrevealed, CanFound fails). */
export function evaluatePlot(view: MajorView, seat: number, plot: number, danger: Int16Array): PlotEval | null {
  const ps = view.plots();
  if (!view.revealed(seat, plot) || !canFoundAt(view, seat, plot)) return null;
  const p = ps[plot];
  let nearest = 0;
  let first = true;
  for (const c of view.cityPlots(seat)) {
    const d = view.plotDistance(plot, c);
    if (first || d < nearest) nearest = d;
    first = false;
  }
  const ev: PlotEval = {
    continent: p.continent, nearest, enemy: 0, danger: danger[plot], pressure: Math.floor(view.pressureAt(seat, plot)),
    coastal: p.coastal, freshWater: p.freshWater, newResources: 0,
    inner: new Map(), total: new Map(), resources: new Map(), features: new Map(),
  };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const q of view.plotsWithin(plot, RING)) {
    if (!view.revealed(seat, q)) continue;
    const t = ps[q];
    const d = view.plotDistance(plot, q);
    if (t.owner !== -1 && t.owner !== seat) {
      if (t.city) ev.enemy = Math.min(ev.enemy, d);
      continue;
    }
    if (d === 0 || d > CITY_MIN_RANGE) continue;
    for (const y of YIELDS) {
      const v = view.plotYield(seat, q, y);
      add(ev.total, y, v);
      if (d === 1) add(ev.inner, y, v);
    }
    if (t.feature && d <= FEATURE_RANGE) add(ev.features, t.feature, 1);
    if (t.resource && view.resourceVisible(seat, t.resource)) {
      add(ev.resources, t.resource, 1);
      if (d === 1 && view.resourceHeld(seat, t.resource) === 0 && AI_RESOURCE_CLASS[t.resource] !== 'RESOURCECLASS_BONUS') ev.newResources++;
    }
  }
  return ev;
}

/** one condition's term (the evaluators the table at 0xf2e740 holds) */
function term(c: number, e: PlotEvalEntry, ev: PlotEval, view: MajorView, seat: number): number {
  const gate = (ok: boolean) => (ok ? 0 : INVALID);
  const sum = (w: Map<string, number>, have: Map<string, number>) => {
    let s = 0;
    for (const [k, v] of w) if (v !== 0) s += (have.get(k) ?? 0) * v;
    return s;
  };
  switch (c) {
    case C_ENEMY: return e.threshold > 0 ? gate(ev.enemy >= e.threshold) : ev.enemy * e.value;
    case C_FRIENDLY: return e.threshold > 0 ? gate(ev.nearest >= e.threshold) : ev.nearest * e.value;
    case C_NEW_RESOURCES: return e.threshold > 0 ? gate(ev.newResources >= e.threshold) : ev.newResources * e.value;
    case C_INNER: return sum(e.yields, ev.inner);
    case C_TOTAL: return sum(e.yields, ev.total);
    case C_COASTAL: return e.threshold > 0 ? gate(ev.coastal) : ev.coastal && !ev.freshWater ? e.value : 0;
    case C_FRESH: return e.threshold > 0 ? gate(ev.freshWater) : ev.freshWater ? e.value : 0;
    case C_RESOURCE: return sum(e.resources, ev.resources);
    case C_FEATURE: return sum(e.features, ev.features);
    case C_CLASS: {
      let s = 0;
      for (const [r, n] of ev.resources) {
        const k = CLASS_INDEX[AI_RESOURCE_CLASS[r] ?? ''];
        if (n > 0 && k !== undefined) s += n * e.classes[k];
      }
      return s;
    }
    case C_FOREIGN: {
      let s = 0;
      if (e.threshold > 0 && ev.continent !== -1
        && !view.cityPlots(seat).some((q) => view.plots()[q].continent === ev.continent)) s = e.threshold;
      const home = view.homeContinent(seat);
      if (ev.continent !== -1 && home !== -1 && home !== ev.continent) s += e.value;
      return s;
    }
    case C_PRESSURE: return e.threshold < 0 ? gate(ev.pressure > e.threshold) : ev.pressure * e.value;
    default: return 0;
  }
}

/** The plot's score, fixed point (0x702380): 0 where a condition fails, never
 *  below 0 (AI_SiteEval.csv logs none) */
export function plotScore(view: MajorView, seat: number, entries: readonly PlotEvalEntry[], ev: PlotEval): number {
  let s = 0;
  for (let c = 0; c < entries.length; c++) {
    const e = entries[c];
    if (e.threshold === 0 && e.value === 0) continue;
    const v = term(c, e, ev, view, seat);
    if (v === INVALID) return 0;
    s += v;
  }
  return Math.max(0, s - ev.danger) * FX;
}

export interface SettleSite {
  plot: number;
  /** fixed point */
  score: number;
}

/** each region's plots best first (a stable sort over the plots in index
 *  order), and whether it holds a site; regions by their id */
export interface SettleRegions {
  regions: { region: number; plots: SettleSite[]; any: boolean }[];
  /** every evaluated plot's score */
  score: Map<number, number>;
}

export function settleRegions(view: MajorView, seat: number): SettleRegions {
  const entries = plotEvalEntries(view.leaderType(seat), view.civilizationType(seat), view.strategies(seat));
  const danger = dangerMap(view, seat);
  const by = new Map<number, { region: number; plots: SettleSite[]; any: boolean }>();
  const score = new Map<number, number>();
  for (const p of view.plots()) {
    if (p.region < 0) continue;
    let r = by.get(p.region);
    if (!r) by.set(p.region, (r = { region: p.region, plots: [], any: false }));
    const ev = evaluatePlot(view, seat, p.index, danger);
    const s = ev ? plotScore(view, seat, entries, ev) : 0;
    if (ev && s > 0) r.any = true;
    r.plots.push({ plot: p.index, score: s });
    score.set(p.index, s);
  }
  const regions = [...by.values()].sort((a, b) => a.region - b.region);
  for (const r of regions) r.plots.sort((a, b) => b.score - a.score);
  return { regions, score };
}

/** The best region top (0x6fe2b0): a region holding a site, its top scoring
 *  above every earlier one's and not `exclude`; null for none */
export function bestSettleSite(sr: SettleRegions, exclude = -1): SettleSite | null {
  let best: SettleSite | null = null;
  for (const r of sr.regions) {
    if (!r.any) continue;
    const top = r.plots[0];
    if (top.score > (best?.score ?? 0) && top.plot !== exclude) best = top;
  }
  return best;
}

/** The first turn settler's choice (0x70d250, a seat without a city): the
 *  plot of this turn's reach (turns 1) whose region list scores best, above
 *  0, the first in the reach's order on a tie; null where none scores, the
 *  settler then founding where it stands if it may (else the fallback's
 *  weighted draw, "First Turn Settler Fallback"). */
export function firstTurnSettlePlot(sr: SettleRegions, reach: readonly MajorReachView[]): number | null {
  let best = 0;
  let plot: number | null = null;
  for (const r of reach) {
    if (r.turns > 1) continue;
    const s = sr.score.get(r.plot) ?? -FX;
    if (s > best) {
      best = s;
      plot = r.plot;
    }
  }
  return plot;
}

/** The first turn settlers' orders as the seat's action record carries them
 *  (`SeatActionRecord.units`, one row per step, a column per unit in the
 *  seat's order): each settler walks its path to its pick, then founds
 *  ("HL: First turn settler": the move, then the city); a settler whose pick
 *  is none founds where it stands where it may. The engine refuses a step or
 *  a founding the unit's Movement cannot pay, and the next turn picks
 *  anew. Empty for a seat with a city. */
export function firstTurnSettlerOrders(view: MajorView, seat: number, sr: SettleRegions): number[][] {
  if (view.cityPlots(seat).length > 0) return [];
  const units = view.units(seat);
  const found = view.unitActionColumn('FOUND_CITY');
  const rows: number[][] = [];
  const row = (col: number, a: number) => {
    const r = units.map(() => -1);
    r[col] = a;
    rows.push(r);
  };
  units.forEach((u, col) => {
    if (!u.founder) return;
    const pick = firstTurnSettlePlot(sr, view.unitReach(u.id, 1));
    if (pick === null) {
      if (canFoundAt(view, seat, u.plot)) row(col, found);
      return;
    }
    let at = u.plot;
    for (const p of view.unitPath(u.id, pick)) {
      row(col, view.unitActionColumn(`MOVE_${view.stepDirection(at, p)}`));
      at = p;
    }
    row(col, found);
  });
  return rows;
}

/** the seat's settling AI as its operations read it: the regions made on
 *  first use, a site tested on the view as it stands */
export function opsSettle(view: () => MajorView, seat: number): OpsSettle {
  let sr: SettleRegions | null = null;
  return {
    best: (exclude) => bestSettleSite((sr ??= settleRegions(view(), seat)), exclude),
    canFoundAt: (plot) => canFoundAt(view(), seat, plot),
  };
}
