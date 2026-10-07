/**
 * THE TURN'S EVENT SELECTION (the step.eventPick check): the engine's draw table
 * (`eventTable`: its rows, weights and site lists) on the record before the
 * step, walked with the game's own logged "Random Event Roll"
 * (`randLog.ts`), against the event the records show began at the step.
 * The table reads what the record does not carry from what came before it:
 *
 * - each site's event memory (the first-occurrence boost): every event the
 *   records showed before the step, on its row and its site — a flood's
 *   river (the engine's river whose list holds the recorded start plot), a
 *   volcano or wonder, a reactor city;
 * - which rivers are named (a river floods once named): as many as the log's
 *   "Random River" draws before the step, those the majors' sight reached
 *   first — the union over every record so far of what each major's plots,
 *   cities and units reveal (`initFog`);
 * - which volcanoes are active: the log's choices ("Choose Active" wakes,
 *   "Choose Inactive" puts to sleep), each the logged index into the
 *   candidates (a wake's the sleeping named ones) in the volcano vector's
 *   order (`volcanoOrder`), and every
 *   recorded eruption's volcano (which names a wake the choice could not).
 *
 * The rivers and volcanoes walk the game's own vectors where the dump has
 * them (`Catalog.orders`, `GameMap.rivers` / `GameMap.volcanoes`). Gaps: a
 * dump without them (`map:riverOrder` where the right flood row fell on
 * another named river, `map:volcanoOrder` while a wake is unnamed), a
 * volcano choice the candidates do not explain (`volcano:activity`).
 * Warming reads the world's carbon the game's climate log holds for the
 * step (`loadCarbonLog`: 1121 t189 / t203 / t241, the flood rows warmed by
 * 0.57 / 0.92 / 1.24 degrees, pick FLOOD_MAJOR at Tarim and FLOOD_MODERATE at
 * the Arno where the unwarmed table picks the other river), else the imported
 * state's.
 */
import type { GameState, Tile } from '../core/types';
import type { CheckResult } from './checks';
import type { Catalog, TurnRecord } from './record';
import type { Imported } from './import';
import type { RandLog } from './randLog';
import { droughtStarts, eventAt, eventTable, floodplainRun, laidRivers, riverPlotList, sitePairWeight, stormStarts, volcanoOrder, type EventTable } from '../core/disasters';
import type { GameMap } from '../../world/types';
import { warmingDegrees } from '../core/climate';
import { TURN_LIMIT } from '../core/game';
import { EVENT_OCC_SCALE, FIRST_TIME_OCCURRENCE_BOOST } from '../data/disasters';
import { ERUPTION_ROWS, STORM_EVENTS } from '../data/disasters';
import { initFog } from '../core/fog';
import { isCiv } from '../core/seats';
import { deforestationLevel } from '../core/climate';
import { deforestationModifier } from '../data/climate';
import { siteLabel } from './drawSites';

const FLOODS = ['FLOOD_MODERATE', 'FLOOD_MAJOR', 'FLOOD_1000_YEAR'];
const ACCIDENTS = ['NUCLEAR_ACCIDENT_MINOR', 'NUCLEAR_ACCIDENT_MAJOR', 'NUCLEAR_ACCIDENT_CATASTROPHIC'];
const DROUGHTS = ['DROUGHT_MAJOR', 'DROUGHT_EXTREME'];
const FIRES = ['JUNGLE_FIRE', 'FOREST_FIRE'];

/** an engine row's RandomEvents type */
function rowName(t: EventTable, i: number): string {
  const r = t.rows[i];
  switch (r.family) {
    case 'eruption': return `RANDOM_EVENT_${ERUPTION_ROWS[r.sev]}`;
    case 'flood': return `RANDOM_EVENT_${FLOODS[r.sev]}`;
    case 'storm': return `RANDOM_EVENT_${STORM_EVENTS[r.sev].id}`;
    case 'accident': return `RANDOM_EVENT_${ACCIDENTS[r.sev]}`;
    case 'drought': return `RANDOM_EVENT_${DROUGHTS[r.sev]}`;
    case 'meteor': return 'RANDOM_EVENT_METEOR_SHOWER';
    case 'fire': return `RANDOM_EVENT_${FIRES[r.sev]}`;
  }
}

/** the plots of a per-site row's site k (null for a row counted once per map) */
function sitePlots(t: EventTable, i: number, k: number): Tile[] | null {
  const r = t.rows[i];
  if (r.family === 'flood') return t.sites.flood[k].list;
  if (r.family === 'eruption') return t.sites.eruption[r.sev][k];
  if (r.family === 'accident') return [t.keys[i]![k]];
  return null;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : -1);

export class EventPicks {
  /** every event the records showed: its turn, its RandomEvents type, its
   *  start plot */
  private readonly seen = new Map<string, { turn: number; name: string; plot: number }>();
  /** per major seat: what it has revealed */
  private readonly explored = new Map<number, Uint8Array>();
  /** the active volcanoes' plots, and whether a choice could not be followed */
  private readonly active = new Set<number>();
  private volcanoUnknown = false;
  /** per river (`riverLists`): the record a major's sight first reached it */
  private readonly firstSeen = new Map<number, number>();
  /** per volcano plot: the record a major's sight first reached it */
  private readonly volcanoSeen = new Map<number, number>();
  /** the named volcanoes the last record read (`TurnRecord.volcanoes`);
   *  null on a dump without them */
  private recordNamed: Set<number> | null = null;
  /** the recorded eruptions already read into `active` */
  private readonly erupted = new Set<string>();
  private lastVolcanoTurn = -1;
  /** wakes whose volcano the choice did not name (the game's volcano order
   *  is the map's own), until an eruption names it */
  private readonly guessed: number[] = [];

  constructor(private readonly cat: Catalog, private readonly log: RandLog | undefined,
    private readonly carbon?: Map<number, number>) {}

  /** the check for the step between `rec` and `next` (the step of turn
   *  rec.turn + 1), on `imp`, the import of `rec`; its state is left as it
   *  came */
  check(rec: TurnRecord, next: TurnRecord | undefined, imp: Imported): CheckResult[] {
    const names = this.cat.randomEvents ?? [];
    for (const r of [rec, next]) {
      for (const e of r?.events ?? []) {
        const key = `${e[0]}:${e[1]}`;
        if (!this.seen.has(key)) this.seen.set(key, { turn: num(e[0]), name: names[num(e[1])] ?? "", plot: num(e[3]) });
      }
    }
    const state = imp.state;
    const T = rec.turn + 1;
    // what the majors have revealed, kept across the records
    const saved = state.seats.map((s) => s.explored);
    const flags = [state.unitsMode, state.fogOfWar] as const;
    initFog(state);
    for (const s of state.seats) {
      if (!isCiv(s.seat) || !s.explored) continue;
      let acc = this.explored.get(s.seat);
      if (!acc) this.explored.set(s.seat, (acc = new Uint8Array(state.map.tiles.length)));
      s.explored.forEach((v, i) => { if (v) acc![i] = 1; });
      s.explored = Array.from(acc);
    }
    riverLists(state.map).forEach((r, i) => {
      if (this.firstSeen.has(i)) return;
      const seen = r.some((p) => p >= 0 && [...this.explored.values()].some((acc) => acc[p] === 1));
      if (seen) this.firstSeen.set(i, rec.turn);
    });
    const nv = rec.volcanoes?.list;
    if (Array.isArray(nv)) this.recordNamed = new Set(nv.map((e) => e[0]));
    for (const t of volcanoOrder(state.map)) {
      if (!this.volcanoSeen.has(t.index) && [...this.explored.values()].some((acc) => acc[t.index] === 1)) {
        this.volcanoSeen.set(t.index, rec.turn);
      }
    }
    state.unitsMode = true;
    state.fogOfWar = true;
    const tiles = state.map.tiles;
    const firedBefore = tiles.map((t) => t.eventFired);
    const activeBefore = tiles.map((t) => t.volcanoActive);
    // the world's carbon at the step, the deforestation factor laid back off
    // it (`worldCarbon`), all on the first seat
    const co2Before = state.seats.map((s) => s.co2);
    const carbon = this.carbon?.get(T);
    if (carbon !== undefined) {
      state.seats.forEach((s, i) => { s.co2 = i === 0 ? carbon / (1 + deforestationModifier(deforestationLevel(state))) : 0; });
    }
    try {
      return this.pick(state, T);
    } finally {
      state.seats.forEach((s, i) => { s.co2 = co2Before[i]; });
      state.seats.forEach((s, i) => { s.explored = saved[i]; });
      [state.unitsMode, state.fogOfWar] = flags;
      tiles.forEach((t, i) => { t.eventFired = firedBefore[i]; t.volcanoActive = activeBefore[i]; });
    }
  }

  private pick(state: GameState, T: number): CheckResult[] {
    const subject = `step t${T}`;
    const roll = this.log?.draws.filter((d) => d.turn === T && siteLabel(d.label) === 'Random Event Roll');
    if (!this.log) return [];
    // the volcanoes up to this step's own roll
    this.followVolcanoes(state, T);
    for (const t of state.map.tiles) if (t.volcano) t.volcanoActive = this.active.has(t.index);
    // the sites' event memory: every event that began before the step
    const t0 = eventTable(state);
    for (const e of this.seen.values()) {
      if (e.turn >= T || e.plot < 0) continue;
      const i = t0.rows.findIndex((_r, j) => rowName(t0, j) === e.name);
      if (i < 0 || !t0.keys[i]) continue;
      const k = t0.keys[i]!.findIndex((_key, kk) => sitePlots(t0, i, kk)!.some((p) => p.index === e.plot));
      if (k >= 0) t0.keys[i]![k].eventFired = (t0.keys[i]![k].eventFired ?? 0) | (1 << i);
    }
    if (!roll?.length) return [{ turn: T, check: 'step.eventPick', subject, ok: false, skip: 'no logged roll' }];
    const at = roll[roll.length - 1];
    if (at.range === 1) return [{ turn: T, check: 'step.eventPick', subject, ok: false, skip: 'the sea rises' }];
    const table = this.named(state, T, eventTable(state));
    const p = eventAt(table, at.value);
    if (process.env.EVENTPICK_SITES) console.error(`sites t${T} ${table.sites.flood.map((r) => r.start.index).join(',')}`);
    if (process.env.EVENTPICK_DBG === String(T)) {
      console.error(`t${T} roll ${at.value}/${at.range} active ${[...this.active]}`);
      table.rows.forEach((_r, i) => console.error(`  ${rowName(table, i)} ${JSON.stringify(table.pairs[i])} ${JSON.stringify(bandOf(table, i))}`));
    }
    const game = [...this.seen.values()].filter((e) => e.turn === T && !e.name.startsWith('RANDOM_EVENT_SEA_LEVEL_RISE'));
    const ours = p ? rowName(table, p.row) : null;
    const plots = p ? sitePlots(table, p.row, p.site) : null;
    const g = game[0];
    let ok: boolean;
    if (!g) ok = ours === null || !placeable(state, table, p!.row);
    else ok = ours === g.name && (plots === null || plots.some((t) => t.index === g.plot));
    const gaps: string[] = [];
    if (this.volcanoUnknown) gaps.push('volcano:activity');
    if (this.guessed.length) gaps.push('map:volcanoOrder');
    // a dump without the game's river vector: the right flood row on another
    // of the named rivers
    if (!ok && g && !state.map.rivers && ours === g.name && table.rows[p!.row].family === 'flood' && table.sites.flood.some((r) => r.list.some((t) => t.index === g.plot))) gaps.push('map:riverOrder');
    if (at.range !== table.range) gaps.push(`roll:range ${at.range} vs ${table.range}`);
    const band = p ? bandOf(table, p.row) : null;
    return [{ turn: T, check: 'step.eventPick', subject, ok,
      game: g ? `${g.name.replace('RANDOM_EVENT_', '')}@${g.plot}` : null,
      ours: ours ? `${ours.replace('RANDOM_EVENT_', '')}@${plots ? plots[0].index : -1}` : null,
      ...(gaps.length ? { gaps } : {}),
      ...(ok ? {} : { state: { roll: at.value, range: at.range, band, sites: p ? table.pairs[p.row] : null,
        floods: table.sites.flood.map((r) => r.start.index) } }) }];
  }

  /** The table with the flood rows over the NAMED rivers alone: as many as
   *  the log's "Random River" draws before the step (a river takes its name
   *  when a major first reveals a plot beside it, 0xa29730 -> 0xa292a0), the
   *  rivers the majors' sight reached first (firstSeen, ties to the
   *  river vector's order); with fewer seen than named, every seen one. */
  private named(state: GameState, T: number, table: EventTable): EventTable {
    const laid = riverLists(state.map);
    const n = this.log?.draws.filter((d) => d.turn < T && siteLabel(d.label) === 'Random River').length ?? 0;
    const order = laid.map((_r, i) => i).filter((i) => this.firstSeen.has(i))
      .sort((a, b) => this.firstSeen.get(a)! - this.firstSeen.get(b)! || a - b).slice(0, n);
    const starts = new Set(order.map((i) => floodplainRun(state.map, laid[i])[0]?.index ?? -1));
    const flood = table.sites.flood.filter((r) => starts.has(r.start.index));
    const sites = { ...table.sites, flood };
    const degrees = warmingDegrees(state);
    const keys = table.keys.map((k, i) => (table.rows[i].family === 'flood' ? flood.map((r) => r.start) : k));
    const pairs = table.pairs.map((p, i) => (table.rows[i].family !== 'flood' ? p
      : keys[i]!.map((t) => sitePairWeight(table.rows[i], ((t.eventFired ?? 0) >> i) & 1 ? 100 : 100 + FIRST_TIME_OCCURRENCE_BOOST, degrees))));
    const total = pairs.reduce((s, p) => s + p.reduce((a, b) => a + b, 0), 0);
    return { rows: table.rows, sites, keys, pairs, range: Math.max(EVENT_OCC_SCALE * TURN_LIMIT, total) };
  }

  /** the log's volcano choices up to step T's roll, each on the candidates
   *  in the volcano vector's order (`volcanoOrder`): a wake's the sleeping
   *  NAMED volcanoes (0xa20f20) — those the record names
   *  (`TurnRecord.volcanoes`), else as many as the log's "Random Volcano"
   *  draws before it, those the majors' sight reached first (ties to the
   *  vector's order) —, a sleep's the active ones; every recorded
   *  eruption's volcano is active */
  private followVolcanoes(state: GameState, T: number): void {
    const volcanoes = volcanoOrder(state.map).map((t) => t.index);
    // an eruption names an active volcano at its turn, once: a wake the
    // choice could not name was that one
    for (const [key, e] of this.seen) {
      if (e.turn >= T || this.erupted.has(key) || !volcanoes.includes(e.plot) || !e.name.includes('VOLCANO_')) continue;
      this.erupted.add(key);
      if (this.active.has(e.plot)) continue;
      const guess = this.guessed.pop();
      if (guess !== undefined) this.active.delete(guess);
      this.active.add(e.plot);
    }
    if (!this.log || this.lastVolcanoTurn >= T) return;
    let namedCount = 0;
    for (const d of this.log.draws) {
      if (d.turn > T) break;
      const k = siteLabel(d.label);
      if (k === 'Random Volcano') namedCount++;
      if (d.turn <= this.lastVolcanoTurn) continue;
      if (k !== 'Choose Active Volcano Roll' && k !== 'Choose Inactive Volcano Roll') continue;
      // the wake draws "Choose Active", the sleep "Choose Inactive" (`volcanoRoll`)
      const wake = k === 'Choose Active Volcano Roll';
      const seen = volcanoes.filter((v) => this.volcanoSeen.has(v));
      const named = this.recordNamed ?? new Set([...seen].sort((a, b) => this.volcanoSeen.get(a)! - this.volcanoSeen.get(b)!
        || seen.indexOf(a) - seen.indexOf(b)).slice(0, namedCount));
      const from = wake ? volcanoes.filter((v) => !this.active.has(v) && named.has(v)) : volcanoes.filter((v) => this.active.has(v));
      if (from.length !== d.range) this.volcanoUnknown = true;
      const v = from[d.value];
      if (v === undefined) continue;
      if (wake) {
        this.active.add(v);
        if (d.range > 1 && !state.map.volcanoes) this.guessed.push(v);
      } else {
        this.active.delete(v);
        if (d.range > 1 && !state.map.volcanoes) this.volcanoUnknown = true;
      }
    }
    this.lastVolcanoTurn = T;
  }
}

/** a row counted once per map lands nowhere without a start plot: does row
 *  `i` find one? (the storms' and the drought's start tests, the meteor's and
 *  the fire's candidates; a per-site row always has its site) */
function placeable(state: GameState, t: EventTable, i: number): boolean {
  const r = t.rows[i];
  if (r.family === 'meteor') return t.sites.meteor.length > 0;
  if (r.family === 'fire') return t.sites.fire[r.sev].length > 0;
  if (r.family === 'storm') return stormStarts(state.map, STORM_EVENTS[r.sev]).length > 0;
  if (r.family === 'drought') return droughtStarts(state).length > 0;
  return true;
}

/** the roll's band of row i: [first, past the last] */
function bandOf(t: EventTable, i: number): [number, number] {
  let lo = 0;
  for (let j = 0; j < i; j++) for (const x of t.pairs[j]) lo += x;
  return [lo, lo + t.pairs[i].reduce((a, b) => a + b, 0)];
}

/** each river's plot list in the river vector's order: the map's own
 *  (`GameMap.rivers`), else laid back from its edges (`laidRivers`) */
function riverLists(map: GameMap): number[][] {
  return map.rivers ?? laidRivers(map).map(riverPlotList);
}
