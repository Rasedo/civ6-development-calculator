/**
 * THE RANDOM EVENTS' DRAWS, replayed on Civ 6's generator (`civ6Random.ts`)
 * from the recorder's witness seeds (`tools/civ6lab/dll_readings.md`, "H-1:
 * the random events' draws"). The turn's random-event step is the last thing
 * to draw before the first player's `PlayerTurnStarted`: its draws end at the
 * state that witness reads, so an event whose draw count is known starts
 * that many draws before it. Pure: reads a map, writes nothing.
 */

import type { GameMap, Tile } from '../../world/types';
import { FEATURES } from '../../world/features';
import { isImpassable, isWater } from '../../world/query';
import { ERUPTION_BLDG_P, ERUPTION_CIV_KILL_P, ERUPTION_CUL_P, ERUPTION_DESTROY_P, ERUPTION_DISTRICT_P, ERUPTION_DMG_HI, ERUPTION_DMG_LO, ERUPTION_PAINT_P, ERUPTION_WONDER, ERUPTION_POP_P, ERUPTION_PROD_P, ERUPTION_SCI_P, FLOOD_DAMAGE_ROWS, FLOOD_MITIGATED_YIELD_REDUCTION, FLOOD_YIELD_ROWS, SOIL_REPLACES, STORM_EVENTS, STORM_LAST_TURN_PCT, STORM_MOVEMENT, STORM_ROWS, STORM_STEP_COST_OFF, STORM_STEP_COST_ON, WIND_ROWS, DROUGHT_DESTROY_P, DROUGHT_HEXES, gameLatitude, stormFamilyAt } from '../data/disasters';
import { Civ6Random, lcgStep, pickWeighted } from './civ6Random';
import { droughtCandidate, floodplainRun, riverGraph, stormFootprint, type RiverEdge } from '../core/disasters';

/**
 * A FLOOD'S PLOTS, in the order its draws walk them: the river's Floodplains
 * list (`floodplainRun`, 0xa2aa30 → 0xa2aca0). The record keeps no flow and
 * no river identity, only the river edges and the plot the list begins on
 * (`start`, the flood's start plot): every walk up the river edges from an
 * edge `start` borders, laid from its top down, whose run begins on `start`.
 * The candidates: every distinct run (two rivers meeting above a shared
 * mouth give two).
 */
export function floodplainList(map: GameMap, start: Tile): Tile[][] {
  const { edges, at } = riverGraph(map);
  const runs = new Map<string, Tile[]>();
  const walk = (path: RiverEdge[], top: string) => {
    const next = (at.get(top) ?? []).filter((g) => !path.includes(g));
    if (!next.length) {
      const run = floodplainRun(map, [...path].reverse());
      if (run[0] === start) runs.set(run.map((t) => t.index).join(','), run);
      return;
    }
    for (const g of next) walk([...path, g], g.ends[0] === top ? g.ends[1] : g.ends[0]);
  };
  for (const e of edges) {
    if (!e.plots.includes(start.index)) continue;
    for (const up of e.ends) walk([e], up);
  }
  return [...runs.values()];
}

/** What a struck plot holds that spends draws of its own, as the record
 *  before the event shows it. */
export interface StruckPlot {
  tile: Tile;
  /** its owner takes no damage from the event (`TRAIT_AVOID_*`, 0xa28eb0):
   *  no damage draw */
  immune: boolean;
  /** land (or naval) units neither civilian nor air: one "Random Event Unit
   *  Damage Roll" each when a UNIT_DAMAGE_LAND (NAVAL) row lands (0x3366a0) */
  landUnits: number;
  navalUnits: number;
  /** a complete district with garrison hit points: one roll when a
   *  CITY_GARRISON row lands (0x336000) */
  garrison: boolean;
  /** in a coastal lowland band: a storm row's CoastalLowlandPercentage */
  lowland: boolean;
  /** a complete district with walls standing: one roll when a CITY_WALLS
   *  row lands (0x336170) */
  walls: boolean;
}

/** a landed damage row's own draws on a plot (the shared applier 0x336a50):
 *  MinHP + rand(MaxHP − MinHP) per unit, garrison or walls struck */
function damageRolls(rng: Civ6Random, kind: string, lo: number, hi: number, p: StruckPlot): void {
  const n = kind === 'UNIT_DAMAGE_LAND' ? p.landUnits : kind === 'UNIT_DAMAGE_NAVAL' ? p.navalUnits
    : kind === 'CITY_GARRISON' ? Number(p.garrison) : kind === 'CITY_WALLS' ? Number(p.walls) : -1;
  if (n >= 0) unitRolls(rng, n, hi - lo);
}

/** The unit rolls of a landed row that strikes units, a garrison or walls:
 *  `known` from the records, or with the game's log the rolls it holds
 *  there — a unit that moved onto the plot and died in the event is in no
 *  record. */
export function unitRolls(rng: Civ6Random, known: number, range: number): void {
  const n = rng.upcoming('Random Event Unit Damage Roll') ?? known;
  for (let i = 0; i < n; i++) rng.get(range, 'Random Event Unit Damage Roll');
}

/**
 * The climate the sea's rises left (Game_Climate 0x291a20 on a
 * RANDOM_EVENT_SEA_LEVEL_RISE row): HaltsFloodFertility stops a flood's
 * yield rows (0xa2f200 skips 0xa2ed80, no draw), HaltsStormFertility a
 * storm's (0x286f80), and FertilityRemovalChance above 0 takes event
 * fertility back off each plot a halted storm or a drought strikes
 * (`removeFertility`); `fert` holds each plot's event fertility, [Food,
 * Production, Science, Culture].
 */
export interface EventClimate {
  haltFlood: boolean;
  haltStorm: boolean;
  removal: number;
  fert: Map<number, number[]>;
}

export function newClimate(): EventClimate {
  return { haltFlood: false, haltStorm: false, removal: 0, fert: new Map() };
}

/** "Remove Fertility Chance" (0xa1c0c0 → 0xa19bd0): per yield type, in the
 *  game's YieldTypes order, where the plot holds c > 0 of that yield's event
 *  fertility, x = min(chance, 100) · c: ONE rand(100) under x mod 100 takes
 *  x // 100 + 1 away, else x // 100. The yields taken. */
export function removeFertility(rng: Civ6Random, climate: EventClimate, plot: number): number {
  const f = climate.fert.get(plot);
  if (!f || climate.removal <= 0) return 0;
  let gone = 0;
  for (let c = 0; c < f.length; c++) {
    if (f[c] <= 0) continue;
    const x = Math.min(climate.removal, 100) * f[c];
    const q = Math.floor(x / 100);
    const n = rng.get(100, 'Remove Fertility Chance') < x - 100 * q ? q + 1 : q;
    f[c] = Math.max(0, f[c] - n);
    gone += n;
  }
  return gone;
}

/** One flood's draws (0xa2f200): unless the river is mitigated, the damage
 *  rows (0xa2a4d0), each over the plots, one "Pillage Improvement Chance"
 *  rand(100) a plot its owner is not immune on (a landed row's own rolls
 *  straight after it); then, unless the climate halts a flood's fertility,
 *  the yield rows (0xa2ed80), each over the plots, one "Boosted Yield
 *  Chance" rand(100) a plot, +1 of the row's yield where it falls under the
 *  row's Percentage — on a mitigated river (100 − MitigatedYieldReduction)%
 *  of it — and the plot carries the row's Floodplains. */
export interface FloodDraws {
  /** +[Food, Production] by plot */
  gains: Map<number, [number, number]>;
  /** the damage rows that landed, by plot */
  damage: Map<number, string[]>;
}

export function floodDraws(rng: Civ6Random, sev: number, plots: readonly StruckPlot[], mitigated: boolean, halted = false): FloodDraws {
  const damage = new Map<number, string[]>();
  if (!mitigated) {
    for (const row of FLOOD_DAMAGE_ROWS[sev]) {
      for (const p of plots) {
        if (p.immune || rng.get(100, 'Pillage Improvement Chance') >= row.pct) continue;
        if (!damage.has(p.tile.index)) damage.set(p.tile.index, []);
        damage.get(p.tile.index)!.push(row.kind);
        damageRolls(rng, row.kind, row.lo, row.hi, p);
      }
    }
  }
  const gains = new Map<number, [number, number]>();
  if (halted) return { gains, damage };
  for (const row of FLOOD_YIELD_ROWS[sev]) {
    const pct = mitigated ? Math.trunc(((100 - FLOOD_MITIGATED_YIELD_REDUCTION) * row.pct) / 100) : row.pct;
    for (const p of plots) {
      if (rng.get(100, 'Boosted Yield Chance') >= pct || p.tile.feature !== row.feature) continue;
      const g = gains.get(p.tile.index) ?? [0, 0];
      g[row.yield === 'YIELD_FOOD' ? 0 : 1] += 1;
      gains.set(p.tile.index, g);
    }
  }
  return { gains, damage };
}

/** the DLL's DirectionTypes offsets (0xeff670 / 0xeff688) in axial (q, r),
 *  r growing with the game's y: 0 NORTHEAST, 1 EAST, 2 SOUTHEAST, 3
 *  SOUTHWEST, 4 WEST, 5 NORTHWEST */
const DIR_DQ = [0, 1, 1, 0, -1, -1];
const DIR_DR = [1, 0, -1, -1, 0, 1];

/** the plot at axial offset (dq, dr) from `t` (0x1e000 without its range
 *  test), undefined off the map's rows */
function offsetPlot(map: GameMap, t: Tile, dq: number, dr: number): Tile | undefined {
  const row = t.row + dr;
  if (row < 0 || row >= map.height) return undefined;
  let col = t.col + dq + Math.floor(row / 2) - Math.floor(t.row / 2);
  if (map.wrapX) col = ((col % map.width) + map.width) % map.width;
  else if (col < 0 || col >= map.width) return undefined;
  return map.tiles[row * map.width + col];
}

/** a storm's `RandomEvent_Terrains` (0x28eab0) */
export function stormTerrain(ev: number, t: Tile): boolean {
  return stormFamilyAt(t) === STORM_EVENTS[ev].family;
}

/** A live storm as the replay keeps it (the game's m_aStorms record). */
export interface StormState {
  /** its `STORM_EVENTS` row */
  event: number;
  /** its turn of birth */
  start: number;
  /** its current plot */
  at: number;
  /** the plots it has struck (+0x38): each once */
  struck: Set<number>;
  /** the yields its strikes have added (the event's FertilityAdded) */
  added: number;
  /** the direction its last "Storm Direction Preview" drew (a DirectionTypes
   *  index, the event's recorded direction), -1 where no row was drawn */
  dir: number;
}

/** What one turn's draws laid on the map. */
export interface EventOutcome {
  /** +[Food, Production] by plot */
  gains: Map<number, [number, number]>;
  /** the damage rows that landed, by plot */
  damage: Map<number, string[]>;
}

export function newOutcome(): EventOutcome {
  return { gains: new Map(), damage: new Map() };
}

function gain(out: EventOutcome, plot: number, yieldType: string, n = 1): void {
  const g = out.gains.get(plot) ?? [0, 0];
  g[yieldType === 'YIELD_FOOD' ? 0 : 1] += n;
  out.gains.set(plot, g);
}

function damaged(out: EventOutcome, plot: number, kind: string): void {
  if (!out.damage.has(plot)) out.damage.set(plot, []);
  out.damage.get(plot)!.push(kind);
}

/** a plot yields take no event yields on: water, or impassable (a
 *  mountain, an impassable natural wonder) */
function barren(t: Tile): boolean {
  return isWater(t) || t.elevation === 'MOUNTAIN' || !!(t.feature && FEATURES[t.feature]?.impassable);
}

/**
 * ONE STORM STRIKE (0x286f80) at the storm's current plot, at `pct` percent
 * of its rows (100, or 50 on its last turns): every footprint plot it has not
 * yet struck takes each damage row's "Pillage Improvement Chance" rand(100)
 * against Percentage × pct // 100 — the row's CoastalLowlandPercentage on a
 * coastal-lowland plot — a landed row's own rolls straight after it; then,
 * unless the plot is water or impassable, each yield row's "Boosted Yield
 * Chance" rand(100) against Percentage × pct // 100, +1 of its yield — where
 * the climate halts a storm's fertility, the plot's event fertility taken
 * back instead (`removeFertility`) —; and joins the struck list.
 */
export function stormStrike(rng: Civ6Random, map: GameMap, storm: StormState, pct: number,
  ctx: (plot: number) => StruckPlot, out: EventOutcome, climate: EventClimate): void {
  const ev = STORM_EVENTS[storm.event];
  const rows = STORM_ROWS[storm.event];
  for (const t of stormFootprint(map, map.tiles[storm.at], ev.hexes)) {
    if (storm.struck.has(t.index)) continue;
    const p = ctx(t.index);
    for (const row of rows.dmg) {
      const chance = row.lowland >= 0 && p.lowland ? row.lowland : Math.trunc((row.pct * pct) / 100);
      if (rng.get(100, 'Pillage Improvement Chance') >= chance) continue;
      damaged(out, t.index, row.kind);
      damageRolls(rng, row.kind, row.lo, row.hi, p);
    }
    if (climate.haltStorm) {
      if (!barren(t)) storm.added -= removeFertility(rng, climate, t.index);
    } else if (!barren(t)) {
      for (const row of rows.yields) {
        if (rng.get(100, 'Boosted Yield Chance') >= Math.trunc((row.pct * pct) / 100)) continue;
        gain(out, t.index, row.yield);
        storm.added += 1;
      }
    }
    storm.struck.add(t.index);
  }
}

/** the `PrevailingWinds` rows at a plot's latitude, each with the plot it
 *  points at (undefined off the map's rows) */
function windsAt(map: GameMap, t: Tile): { plot: Tile | undefined; weight: number }[] {
  const lat = gameLatitude(t.row, map.height);
  return WIND_ROWS.filter((w) => w.lo <= lat && lat <= w.hi)
    .map((w) => ({ plot: offsetPlot(map, t, DIR_DQ[w.dir], DIR_DR[w.dir]), weight: w.weight }));
}

/** "Storm Direction Preview" (0x28d1f0): one weighted draw over the rows at
 *  the plot's latitude, whatever lies that way; the row's direction, -1
 *  where the latitude holds none */
function stormPreview(rng: Civ6Random, map: GameMap, at: number): number {
  const lat = gameLatitude(map.tiles[at].row, map.height);
  const rows = WIND_ROWS.filter((w) => w.lo <= lat && lat <= w.hi);
  return rows.length ? rows[pickWeighted(rng, rows.map((r) => r.weight), 'Storm Direction Preview')].dir : -1;
}

/**
 * A NEW STORM (0x291a20): "Pick Storm Start Plot" (0x288250) — ONE uniform
 * draw over every plot that qualifies, ascending: Hexes ≥ 19 asks the plot
 * and one of its six neighbours (all six on the map) to stand on the storm's
 * terrain, Hexes ≥ 3 the plot alone, smaller rows no plot (no storm, no
 * draw); the spacing weights it computes do not reach the draw. Then the
 * "Storm Direction Preview", the storm's name (one draw over the naming
 * player's citizen names) and its first strike at full strength.
 */
export function stormStartPlots(map: GameMap, ev: number): Tile[] {
  const hexes = STORM_EVENTS[ev].hexes;
  const need = hexes >= 19 ? 2 : hexes >= 3 ? 1 : 0;
  if (need === 0) return [];
  return map.tiles.filter((t) => {
    if (!stormTerrain(ev, t)) return false;
    if (need === 1) return true;
    const ring = [0, 1, 2, 3, 4, 5].map((d) => offsetPlot(map, t, DIR_DQ[d], DIR_DR[d]));
    return ring.every((n) => n) && ring.some((n) => stormTerrain(ev, n!));
  });
}

export function stormBirth(rng: Civ6Random, map: GameMap, ev: number, turn: number,
  ctx: (plot: number) => StruckPlot, out: EventOutcome, climate: EventClimate, named = true): StormState | undefined {
  const plots = stormStartPlots(map, ev);
  if (!plots.length) return undefined;
  const storm: StormState = { event: ev, start: turn, at: plots[rng.get(plots.length, 'Pick Storm Start Plot')].index, struck: new Set(), added: 0, dir: -1 };
  storm.dir = stormPreview(rng, map, storm.at);
  // its name: a draw over its naming major's citizen names left (none
  // where no major names it: `stormNamer`)
  if (named) rng.get(1, 'Choosing a Citizen Name');
  // the record is stored before this strike, which marks a copy: the stored
  // storm's struck list starts empty
  const copy = { ...storm, struck: new Set<number>() };
  stormStrike(rng, map, copy, 100, ctx, out, climate);
  storm.added = copy.added;
  return storm;
}

/**
 * A LIVE STORM's TURN (0x28ecd0): at `STORM_LAST_TURN_PCT` once turn −
 * start + 1 reaches its Duration, else at 100, it steps until a step will not
 * fit its Movement: each step one "Storm Direction" weighted draw over the
 * `PrevailingWinds` rows at its plot's latitude whose plot lies on the map
 * (0x28c500) — the step onto its own terrain costs 1, elsewhere 2, and a
 * step past what is left ends the walk where it stands, its draw spent — and
 * each step taken strikes; then a "Storm Direction Preview".
 */
export function stormWalk(rng: Civ6Random, map: GameMap, storm: StormState, turn: number,
  ctx: (plot: number) => StruckPlot, out: EventOutcome, climate: EventClimate): void {
  const ev = STORM_EVENTS[storm.event];
  const pct = turn - storm.start + 1 >= ev.duration ? STORM_LAST_TURN_PCT : 100;
  let left = STORM_MOVEMENT;
  for (;;) {
    const rows = windsAt(map, map.tiles[storm.at]).filter((r) => r.plot);
    if (!rows.length) break;
    const to = rows[pickWeighted(rng, rows.map((r) => r.weight), 'Storm Direction')].plot!;
    const cost = stormTerrain(storm.event, to) ? STORM_STEP_COST_ON : STORM_STEP_COST_OFF;
    if (cost > left) break;
    left -= cost;
    storm.at = to.index;
    stormStrike(rng, map, storm, pct, ctx, out, climate);
  }
  storm.dir = stormPreview(rng, map, storm.at);
}

/** an eruption row's damage rows in XML order: each kind with its chance in
 *  percent, absent where the row carries none (the unit and city rows stand
 *  where it carries a band) */
function eruptionDamageRows(row: number): { kind: string; pct: number; lo: number; hi: number }[] {
  const lo = ERUPTION_DMG_LO[row];
  const hi = ERUPTION_DMG_HI[row];
  const band = hi > 0 ? 100 : 0;
  const rows: [string, number][] = [['IMPROVEMENT_DESTROYED', ERUPTION_DESTROY_P[row] * 100], ['IMPROVEMENT_PILLAGED', 100],
    ['DISTRICT_PILLAGED', ERUPTION_DISTRICT_P[row] * 100], ['BUILDING_PILLAGED', ERUPTION_BLDG_P[row] * 100],
    ['POPULATION_LOSS', ERUPTION_POP_P[row] * 100], ['UNIT_KILLED_CIVILIAN', ERUPTION_CIV_KILL_P[row] * 100],
    ['UNIT_DAMAGE_LAND', band], ['CITY_GARRISON', band], ['CITY_WALLS', band]];
  return rows.filter(([, p]) => p > 0).map(([kind, p]) => ({ kind, pct: Math.round(p), lo, hi }));
}

/** an eruption row's soil rows in XML order: [yield column of `EventOutcome`
 *  gains extended to Science 2 and Culture 3, chance in percent] */
function eruptionSoilRows(row: number): [number, number][] {
  const rows: [number, number][] = [[0, ERUPTION_PAINT_P[row]], [1, ERUPTION_PROD_P[row]], [2, ERUPTION_SCI_P[row]], [3, ERUPTION_CUL_P[row]]];
  return rows.filter(([, p]) => p > 0).map(([c, p]) => [c, Math.round(p * 100)]);
}

/** May an eruption reach this neighbour (0xa1c1a0's and 0xa219e0's gate): not
 *  impassable; bare, under a Removable feature or the Eruptable Volcanic Soil */
function eruptionReach(t: Tile): boolean {
  if (isImpassable(t)) return false;
  return t.feature === null || SOIL_REPLACES.includes(t.feature) || t.feature === 'VOLCANIC_SOIL';
}

/**
 * ONE ERUPTION (0xa22000 for a volcano, 0xa22150 for a natural wonder): the
 * damage pass (0xa1c1a0) — each damage row, each neighbour of the eruption's
 * plots in DirectionTypes order (NORTHEAST, EAST, SOUTHEAST, SOUTHWEST, WEST,
 * NORTHWEST) the eruption reaches, one "Pillage Improvement Chance" rand(100)
 * (a landed row's own rolls straight after it) — then the soil pass
 * (0xa219e0): each yield row, each neighbour the eruption reaches above the
 * sea, one "Fertility Gain Chance" rand(100), +1 of the row's yield where it
 * falls under the Percentage (the plot turns Volcanic Soil). A natural
 * wonder's passes (0xa1c760, 0xa21680) draw the same, the soil's labelled
 * "Pillage Improvement Chance" too (runs/h1_duelw1121 t19: Kilimanjaro's 54
 * damage and 18 soil draws, all so labelled). `soil` holds the gains by
 * plot: [Food, Production, Science, Culture].
 */
export function eruptionDraws(rng: Civ6Random, map: GameMap, plots: readonly Tile[], row: number,
  ctx: (plot: number) => StruckPlot, out: EventOutcome, soil: Map<number, number[]>): void {
  const wonder = !!ERUPTION_WONDER[row];
  const soilLabel = wonder ? 'Pillage Improvement Chance' : 'Fertility Gain Chance';
  const around = (p: Tile) => [0, 1, 2, 3, 4, 5].map((d) => offsetPlot(map, p, DIR_DQ[d], DIR_DR[d])).filter((n): n is Tile => !!n);
  // the volcano's passes: each row over its ring; the wonder's: each of its
  // plots, each row over the plot itself then its ring
  const passes: Tile[][] = wonder ? [...plots].sort((a, b) => a.index - b.index).map((p) => [p, ...around(p)]) : [plots.flatMap(around)];
  for (const ring of passes) {
    for (const r of eruptionDamageRows(row)) {
      for (const n of ring) {
        if (!eruptionReach(n)) continue;
        if (rng.get(100, 'Pillage Improvement Chance') >= r.pct) continue;
        damaged(out, n.index, r.kind);
        damageRolls(rng, r.kind, r.lo, r.hi, ctx(n.index));
      }
    }
  }
  for (const ring of passes) {
    for (const [c, pct] of eruptionSoilRows(row)) {
      for (const n of ring) {
        if (!eruptionReach(n) || isWater(n)) continue;
        if (rng.get(100, soilLabel) >= pct) continue;
        const g = soil.get(n.index) ?? [0, 0, 0, 0];
        g[c] += 1;
        soil.set(n.index, g);
      }
    }
  }
}

/**
 * A NEW DROUGHT's draws (`droughtStart` / `drought` in core/disasters.ts):
 * "Pick Drought Start Plot" (0x287e80), one uniform draw over every map
 * plot `droughtCandidate` admits — `centres` the live city centres, `live`
 * the plots any storm has struck; then the strike 0x286530: on each land
 * plot of its footprint one draw per `RandomEvent_Damages` row of severity
 * `sev` (EXTREME's SPECIFIC_IMPROVEMENT_DESTROYED, then
 * SPECIFIC_IMPROVEMENT_PILLAGED), then the plot's event fertility taken back
 * where the climate removes it (`removeFertility`). The start plot's index,
 * -1 where no plot qualifies (no draw).
 */
export function droughtDraws(rng: Civ6Random, map: GameMap, sev: number, centres: ReadonlySet<number>,
  live: ReadonlySet<number>, climate: EventClimate): number {
  const cands = map.tiles.filter((t) => droughtCandidate(map, t, centres, (u) => live.has(u.index)));
  if (!cands.length) return -1;
  const at = cands[rng.get(cands.length, 'Pick Drought Start Plot')];
  const rows = DROUGHT_DESTROY_P[sev] > 0 ? 2 : 1;
  for (const t of stormFootprint(map, at, DROUGHT_HEXES)) {
    if (isWater(t)) continue;
    for (let r = 0; r < rows; r++) rng.get(100, 'Pillage Improvement Chance');
    removeFertility(rng, climate, t.index);
  }
  return at.index;
}

/** The turn's random-event step placed at the end of the gap's draws: the
 *  `draws` the generator took from `from` to the witness, and the replay of
 *  the step (the storms' walks, the volcano roll, the event roll and the
 *  event's own draws — the last things the turn draws). Every start where,
 *  run there, the replay takes exactly the draws left to the witness, the
 *  latest first, each with the draws it took (`trace`). */
export function replayAtEnd<T>(from: number, draws: number, replay: (rng: Civ6Random) => T,
  ahead?: readonly { label: string }[]): { k: number; value: T; trace: NonNullable<Civ6Random['trace']> }[] {
  const states = [from >>> 0];
  for (let i = 0; i < draws; i++) states.push(lcgStep(states[i]));
  const out: { k: number; value: T; trace: NonNullable<Civ6Random['trace']> }[] = [];
  for (let k = draws - 1; k >= 0; k--) {
    const rng = new Civ6Random(states[k], true, ahead ? ahead.slice(k) : null);
    const value = replay(rng);
    if (rng.count === draws - k) out.push({ k, value, trace: rng.trace! });
  }
  return out;
}
