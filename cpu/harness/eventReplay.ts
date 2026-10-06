/**
 * THE RECORDED RANDOM EVENTS, REPLAYED ON THE GAME'S GENERATOR. Where the
 * records carry the start-of-turn witnesses' generator states
 * (`StartWitness.seed`), the draws between the barbarians' completed start
 * of turn T-1 and the first player's start of turn T end with the turn's
 * random-event step (`tools/civ6lab/dll_readings.md`, "H-1: the random
 * events' draws"): each live storm's walk, the volcano roll, the event roll
 * and the new event's own draws (`eventDraws.ts`). The step is placed at the
 * end of those draws, and a start counts only where the replay reproduces
 * what the records place without the yields: a new storm's start plot, a
 * storm's plot after its first walk. Then the draws decide each struck plot's
 * fertility — the importer adds it (`History.eventYields`) and reads none of
 * it back. An event the replay does not reach stays with the readings
 * (`foldEventYields`).
 */

import type { GameMap, Tile } from '../../world/types';
import { UNITS } from '../data/units';
import { ERUPTION_ROWS, ERUPTION_WEIGHT, ERUPTION_WONDER, FIRST_TIME_OCCURRENCE_BOOST, FLOOD_WEIGHT, STANDARD_MAP_AREA, STORM_EVENTS } from '../data/disasters';
import { unitDomain } from '../core/units';
import { plotAt, P, num, type Catalog, type TurnRecord } from './record';
import { engineRowOf, recordMap } from './import';
import { drawsBetween, type Civ6Random } from './civ6Random';
import {
  eruptionDraws, floodDraws, floodplainList, newOutcome, replayAtEnd, stormBirth, stormStartPlots, stormWalk,
  type EventOutcome, type StormState, type StruckPlot,
} from './eventDraws';

/** the game's turns N the event roll's total is ten times (0x339020: the
 *  game speed's turns, online) */
export const EVENT_ROLL_TOTAL = 2500;
/** a storm walks on the two turns after its birth (the third has no walk:
 *  the duels' gaps after it hold the quiet turn's draws alone) */
const STORM_WALKS = 2;

/** One recorded event the generator placed. */
export interface ReplayedEvent {
  /** `${start turn}:${RandomEvents index}` */
  key: string;
  family: 'flood' | 'storm' | 'eruption';
  /** the turns whose draws placed it (a storm's birth and its walks) */
  turns: number[];
}

export interface EventReplay {
  /** the events whose every draw the replay placed, by key */
  events: Map<string, ReplayedEvent>;
  /** the fertility the replayed events laid between record T-1 and record
   *  T, by T: plot -> [Food, Production, Science, Culture] */
  gains: Map<number, Map<number, number[]>>;
  /** each witnessed turn's outcome: `ok`, or why the step was not placed */
  turns: Map<number, string>;
}

type EventRow = number[];

const FLOODS = ['RANDOM_EVENT_FLOOD_MODERATE', 'RANDOM_EVENT_FLOOD_MAJOR', 'RANDOM_EVENT_FLOOD_1000_YEAR'];
const NO_DRAW_EVENTS = ['RANDOM_EVENT_DROUGHT_MAJOR', 'RANDOM_EVENT_DROUGHT_EXTREME'];

/** the volcano roll's draws between the walks and the event roll: one, or
 *  none (the roll's gate 0x335040 is not read to the end), or two (a woken
 *  volcano's choice) */
type VolcanoDraws = 0 | 1 | 2;

/** what a struck plot holds as the event reached it: units from the record
 *  after it (where every player's turn left them), with the units that
 *  vanished from the record before (struck down by it); garrison and walls
 *  from the record before */
function struckContext(cat: Catalog, before: TurnRecord, after: TurnRecord, map: GameMap): (plot: number) => StruckPlot {
  const W = before.head.W;
  const counts = (units: TurnRecord['units']) => {
    const out = new Map<number, [number, number]>();
    for (const u of units) {
      const id = engineRowOf(cat, 'unit', u.type);
      if (!id) continue;
      const dom = unitDomain(id);
      if (dom === 'civilian' || dom === 'air' || dom === 'spy') continue;
      const i = u.y * W + u.x;
      const c = out.get(i) ?? [0, 0];
      c[UNITS[id]?.naval ? 1 : 0] += 1;
      out.set(i, c);
    }
    return out;
  };
  const live = new Set(after.units.map((u) => `${u.owner}:${u.id}`));
  const now = counts(after.units);
  const gone = counts(before.units.filter((u) => !live.has(`${u.owner}:${u.id}`)));
  const defense = new Map<number, [boolean, boolean]>();
  for (const c of before.cities) {
    for (const d of c.districts) {
      if (d[3] !== true) continue;
      const at = num(d[2] as number) * W + num(d[1] as number);
      defense.set(at, [num(d[7] as number) > 0, num(d[9] as number) > 0 && num(d[8] as number) < num(d[9] as number)]);
    }
  }
  return (i: number): StruckPlot => {
    const a = now.get(i) ?? [0, 0];
    const b = gone.get(i) ?? [0, 0];
    const p = plotAt(before, i);
    const owner = p[P.owner] as number;
    const [garrison, walls] = defense.get(i) ?? [false, false];
    return {
      tile: map.tiles[i], immune: before.players.find((q) => q.id === owner)?.civ === 'CIVILIZATION_EGYPT',
      landUnits: a[0] + b[0], navalUnits: a[1] + b[1], garrison, walls,
      lowland: typeof p[P.lowland] === 'number' && (p[P.lowland] as number) >= 0,
    };
  };
}

/** a river mitigated against floods (0xa2a4d0): a complete, unpillaged Dam
 *  or the Great Bath on one of its Floodplains */
function mitigated(cat: Catalog, rec: TurnRecord, plots: readonly Tile[]): boolean {
  const W = rec.head.W;
  const on = new Set(plots.map((t) => t.index));
  for (const c of rec.cities) {
    for (const d of c.districts) {
      if (d[3] !== true || d[4] === true || !on.has(num(d[2] as number) * W + num(d[1] as number))) continue;
      if (cat.districts[d[0] as number] === 'DISTRICT_DAM') return true;
    }
    for (const [b, pillaged] of c.buildings) {
      if (cat.buildings[b] !== 'BUILDING_GREAT_BATH' || pillaged === 1) continue;
      if (plots.some((t) => plotAt(rec, t.index)[P.wonder] === b)) return true;
    }
  }
  return false;
}

interface Step {
  st: StormState[];
  out: EventOutcome;
  soil: Map<number, number[]>;
  born?: StormState;
  /** a new storm the record places and the replay reproduced */
  bornOk: boolean;
  /** the event roll */
  roll: number;
}

export function replayEvents(recs: readonly TurnRecord[], cat: Catalog): EventReplay {
  const result: EventReplay = { events: new Map(), gains: new Map(), turns: new Map() };
  const names = cat.randomEvents ?? [];
  const byTurn = new Map(recs.map((r) => [r.turn, r]));
  const seeds = new Map<string, number>();
  for (const r of recs) {
    for (const w of r.witness ?? []) {
      const s = (w as { seed?: unknown }).seed;
      if (typeof s === 'number') seeds.set(`${w.turn}:${w.player}:${w.point}`, s >>> 0);
    }
  }
  if (!seeds.size) return result;
  // each event as its first record shows it
  const first = new Map<string, EventRow>();
  for (const r of recs) {
    if (!Array.isArray(r.events)) continue;
    for (const e of r.events as EventRow[]) if (!first.has(`${e[0]}:${e[1]}`)) first.set(`${e[0]}:${e[1]}`, e);
  }
  // the turns each event's draws fall on, and whether each was placed
  const placed = new Map<string, { family: ReplayedEvent['family']; turns: Map<number, Map<number, number[]> | null> }>();
  const mark = (key: string, family: ReplayedEvent['family'], turn: number, g: Map<number, number[]> | null) => {
    if (!placed.has(key)) placed.set(key, { family, turns: new Map() });
    placed.get(key)!.turns.set(turn, g);
  };
  const resolved = resolveRivers(first, byTurn, names, cat);
  const bands = rollBands(first, names, recs[0], cat);
  // the list each river was found to hold
  const riverHolds = new Map<number, string>();
  let live: { storm: StormState; key: string }[] = [];
  let volcano: VolcanoDraws = 1;
  const turns = [...byTurn.keys()].sort((a, b) => a - b);
  for (const T of turns) {
    const before = byTurn.get(T - 1);
    const after = byTurn.get(T)!;
    const news = [...first.values()].filter((e) => e[0] === T);
    live = live.filter((s) => T - s.storm.start <= STORM_WALKS);
    const fail = (why: string) => {
      result.turns.set(T, why);
      for (const s of live) mark(s.key, 'storm', T, null);
      for (const e of news) mark(`${e[0]}:${e[1]}`, familyOf(names[e[1]] ?? ''), T, null);
      live = [];
    };
    const a = seeds.get(`${T - 1}:63:post`);
    const b = seeds.get(`${T}:0:pre`);
    if (!before || a === undefined || b === undefined) { fail('no witness'); continue; }
    const draws = drawsBetween(a, b, 1 << 15);
    if (draws === undefined) { fail('witnesses not linked'); continue; }
    const map = recordMap(before, cat);
    const ctx = struckContext(cat, before, after, map);
    // the new events: each family's own draws after the roll
    const parts: ((rng: Civ6Random, step: Step) => boolean)[] = [];
    let unsupported = '';
    for (const e of news) {
      const name = names[e[1]] ?? '';
      const key = `${e[0]}:${e[1]}`;
      const sev = FLOODS.indexOf(name);
      const storm = STORM_EVENTS.findIndex((s) => `RANDOM_EVENT_${s.id}` === name);
      const eruption = ERUPTION_ROWS.findIndex((r) => `RANDOM_EVENT_${r}` === name);
      if (sev >= 0) {
        const river = num(e[8]);
        const sig = (l: Tile[]) => l.map((t) => t.index).join(',');
        let lists = resolved.get(key) ?? [];
        if (riverHolds.has(river)) lists = lists.filter((l) => sig(l) === riverHolds.get(river));
        else lists = lists.filter((l) => ![...riverHolds.values()].includes(sig(l)));
        const list = lists.length === 1 ? lists[0] : chooseList(lists, sev, e, before, cat, ctx, a, draws);
        if (list) riverHolds.set(river, sig(list));
        if (!list) { unsupported = `${name} t${T}: the river's Floodplains list is not known`; continue; }
        const mit = mitigated(cat, before, list);
        parts.push((rng, step) => {
          const fd = floodDraws(rng, sev, list.map((t) => ctx(t.index)), mit);
          let n = 0;
          for (const [i, [f, p]] of fd.gains) { addGain(step.soil, i, [f, p, 0, 0]); n += f + p; }
          step.out.damage = fd.damage;
          return n === num(e[4]);
        });
        void key;
      } else if (storm >= 0) {
        const at = num(e[3]);
        if (at < 0) {
          // no plot qualified: no draw after the roll
          if (stormStartPlots(map, storm).length) { unsupported = `${name} t${T}: the record places no start plot`; continue; }
          continue;
        }
        parts.push((rng, step) => {
          step.born = stormBirth(rng, map, storm, T, ctx, step.out);
          step.bornOk = step.born?.at === at && step.born.added === num(e[4]);
          return step.bornOk;
        });
      } else if (eruption >= 0 && name.startsWith('RANDOM_EVENT_VOLCANO')) {
        const centre = map.tiles[num(e[2])];
        if (!centre) { unsupported = `${name} t${T}: no volcano plot`; continue; }
        parts.push((rng, step) => {
          const soil = new Map<number, number[]>();
          eruptionDraws(rng, map, [centre], eruption, ctx, step.out, soil);
          let n = 0;
          for (const [i, g] of soil) { addGain(step.soil, i, g); n += g[0] + g[1] + g[2] + g[3]; }
          return n === num(e[4]);
        });
      } else if (NO_DRAW_EVENTS.includes(name) && num(e[3]) < 0) {
        // a drought that found no start plot draws nothing after the roll
        continue;
      } else {
        unsupported = `${name} t${T}: its draws are not modelled`;
      }
    }
    if (unsupported) { fail(unsupported); continue; }
    // the step, on each volcano-roll reading, the one the last turn used first
    const tryModes: VolcanoDraws[] = [volcano, ...([1, 0, 2] as VolcanoDraws[]).filter((v) => v !== volcano)];
    let chosen: { k: number; value: Step } | undefined;
    // draws the records cannot show (a unit that came and went on a struck
    // plot) fall in a flood's or an eruption's damage pass, before its yields
    const struckEvent = news.some((e) => FLOODS.includes(names[e[1]] ?? '') || (names[e[1]] ?? '').startsWith('RANDOM_EVENT_VOLCANO'));
    const slack = struckEvent ? [0, 1, 2] : [0];
    const variants = tryModes.flatMap((v) => slack.flatMap((extra) => slack.map((tail) => [v, extra, tail] as const)))
      .sort((x, y) => x[1] + x[2] - y[1] - y[2]);
    for (const [v, extra, tail] of variants) {
      const replay = (rng: Civ6Random): Step => {
        const step: Step = { st: live.map((s) => ({ ...s.storm, struck: new Set(s.storm.struck) })), out: newOutcome(), soil: new Map(), bornOk: true, roll: -1 };
        for (const s of step.st) stormWalk(rng, map, s, T, ctx, step.out);
        for (let i = 0; i < v; i++) rng.get(EVENT_ROLL_TOTAL, 'Active Volcano Roll');
        step.roll = rng.get(EVENT_ROLL_TOTAL, 'Random Event Roll');
        for (let i = 0; i < extra; i++) rng.get(100, 'unrecorded unit roll');
        for (const part of parts) if (!part(rng, step)) step.bornOk = false;
        for (let i = 0; i < tail; i++) rng.get(100, 'unrecorded draw after the event');
        return step;
      };
      const fits = replayAtEnd(a, draws, replay).filter((c) => c.value.bornOk && news.every((e) => {
        const [lo, hi] = bands.get(e[1]) ?? [0, EVENT_ROLL_TOTAL];
        return c.value.roll >= lo && c.value.roll < hi;
      }) && c.value.st.every((s, i) => {
        const row = (after.events as EventRow[] | undefined)?.find((x) => `${x[0]}:${x[1]}` === live[i].key);
        return !row || (num(row[2]) === s.at && num(row[4]) === s.added);
      }));
      if (fits.length) {
        chosen = fits[0];
        if (live.length) volcano = v;
        break;
      }
    }
    if (!chosen) { fail('no start reproduces the step'); continue; }
    result.turns.set(T, 'ok');
    const step = chosen.value;
    for (const [i, [f, p]] of step.out.gains) addGain(step.soil, i, [f, p, 0, 0]);
    const g = step.soil;
    if (g.size) result.gains.set(T, g);
    for (const s of live) mark(s.key, 'storm', T, g);
    for (const e of news) {
      const key = `${e[0]}:${e[1]}`;
      mark(key, familyOf(names[e[1]] ?? ''), T, g);
    }
    live = step.st.map((s, i) => ({ storm: s, key: live[i].key }));
    if (step.born) {
      const e = news.find((x) => STORM_EVENTS[step.born!.event] && `RANDOM_EVENT_${STORM_EVENTS[step.born!.event].id}` === names[x[1]])!;
      live.push({ storm: step.born, key: `${e[0]}:${e[1]}` });
    }
  }
  // an event is replayed when every turn its draws fell on was placed
  for (const [key, p] of placed) {
    if ([...p.turns.values()].some((g) => g === null)) continue;
    const e = first.get(key);
    if (!e) continue;
    if (p.family === 'storm' && p.turns.size < STORM_WALKS + 1 && num(e[3]) >= 0
      && Math.max(...turns) >= e[0] + STORM_WALKS) continue;
    result.events.set(key, { key, family: p.family, turns: [...p.turns.keys()] });
  }
  return result;
}

/**
 * Every flood's candidate Floodplains lists (`floodplainList` on the record
 * before it), one river at a time: a river whose floods all walk to one list
 * holds it; a candidate lying wholly inside another river's held list is that
 * river walked upstream against its flow and goes; a river left with one
 * list holds it. Repeated until nothing moves. By event key.
 */
function resolveRivers(first: Map<string, EventRow>, byTurn: Map<number, TurnRecord>, names: readonly string[],
  cat: Catalog): Map<string, Tile[][]> {
  const out = new Map<string, Tile[][]>();
  const byRiver = new Map<number, string[]>();
  for (const [key, e] of first) {
    if (!FLOODS.includes(names[e[1]] ?? '')) continue;
    const before = byTurn.get(e[0] - 1);
    if (!before) continue;
    const map = recordMap(before, cat);
    const start = map.tiles[num(e[3])];
    if (!start) continue;
    out.set(key, floodplainList(map, start));
    const river = num(e[8]);
    if (!byRiver.has(river)) byRiver.set(river, []);
    byRiver.get(river)!.push(key);
  }
  const sig = (l: Tile[]) => l.map((t) => t.index).join(',');
  const held = new Map<number, Set<number>>();
  for (let moved = true; moved;) {
    moved = false;
    for (const [river, keys] of byRiver) {
      if (held.has(river)) continue;
      const others = [...held].filter(([r]) => r !== river).map(([, s]) => s);
      for (const k of keys) {
        const kept = out.get(k)!.filter((l) => !others.some((s) => l.every((t) => s.has(t.index))));
        if (kept.length !== out.get(k)!.length) { out.set(k, kept); moved = true; }
      }
      const sigs = new Set(keys.flatMap((k) => out.get(k)!.map(sig)));
      const common = [...sigs].filter((s) => keys.every((k) => out.get(k)!.some((l) => sig(l) === s)));
      if (common.length === 1) {
        for (const k of keys) out.set(k, out.get(k)!.filter((l) => sig(l) === common[0]));
        held.set(river, new Set(common[0].split(',').map(Number)));
        moved = true;
      }
    }
  }
  return out;
}

/**
 * WHERE EACH EVENT'S ROLL MAY LAND, by RandomEvents index: the weighted
 * draw (0x335260 / 0x287c00) walks the rows in table order, so a row's roll
 * lies past every entry before it and short of the running total through its
 * own. The bounds this dump allows without the weights' history: per-site
 * rows (a flood per river, an eruption per volcano, a natural wonder's) count
 * nothing below and, above, every site the dump shows (the rivers its floods
 * name, the map's volcanoes) at its first-occurrence boost; once-per-map
 * rows (the storms) count their map-scaled weight both ways; warming may
 * raise any warmed row by half again. Rows past the storms are left open.
 */
function rollBands(first: Map<string, EventRow>, names: readonly string[], rec: TurnRecord, cat: Catalog): Map<number, [number, number]> {
  const rivers = new Set<number>();
  for (const e of first.values()) if (FLOODS.includes(names[e[1]] ?? '')) rivers.add(num(e[8]));
  const map = recordMap(rec, cat);
  const volcanoes = map.tiles.filter((t) => t.volcano).length;
  const area = map.width * map.height;
  const tenths = (occ: number) => Math.floor(10 * occ);
  const boosted = (occ: number) => Math.floor((tenths(occ) * (100 + FIRST_TIME_OCCURRENCE_BOOST)) / 100);
  const out = new Map<number, [number, number]>();
  let lo = 0;
  let hi = 0;
  names.forEach((name, i) => {
    const ev = name.replace('RANDOM_EVENT_', '');
    const sev = FLOODS.indexOf(name);
    const er = (ERUPTION_ROWS as readonly string[]).indexOf(ev);
    const storm = STORM_EVENTS.findIndex((s) => s.id === ev);
    let minW = 0;
    let maxW = 0;
    if (sev >= 0) maxW = Math.ceil(1.5 * rivers.size * boosted(FLOOD_WEIGHT[sev]));
    else if (er >= 0) {
      const sites = ERUPTION_WONDER[er] ? Number(map.tiles.some((t) => t.feature === ERUPTION_WONDER[er])) : volcanoes;
      maxW = sites * boosted(ERUPTION_WEIGHT[er]);
    } else if (storm >= 0) {
      minW = Math.floor((tenths(STORM_EVENTS[storm].weight) * area) / STANDARD_MAP_AREA);
      maxW = STORM_EVENTS[storm].cipd ? Math.ceil(1.5 * minW) : minW;
    } else {
      out.set(i, [lo, EVENT_ROLL_TOTAL]);
      hi = EVENT_ROLL_TOTAL;
      return;
    }
    out.set(i, [lo, Math.min(EVENT_ROLL_TOTAL, hi + maxW)]);
    lo += minW;
    hi += maxW;
  });
  return out;
}

function familyOf(name: string): ReplayedEvent['family'] {
  if (FLOODS.includes(name)) return 'flood';
  if (STORM_EVENTS.some((s) => `RANDOM_EVENT_${s.id}` === name)) return 'storm';
  return 'eruption';
}

function addGain(m: Map<number, number[]>, i: number, g: number[]): void {
  const acc = m.get(i) ?? [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) acc[k] += g[k];
  m.set(i, acc);
}

/**
 * The flood's Floodplains list among the river walks' candidates
 * (`floodplainList`): the only one, or — two rivers meeting above a shared
 * mouth — the one whose replayed draws land the game's own FertilityAdded
 * count (the event row, not a plot) when exactly one does. Undefined
 * otherwise.
 */
function chooseList(lists: Tile[][], sev: number, e: EventRow, before: TurnRecord, cat: Catalog,
  ctx: (plot: number) => StruckPlot, from: number, draws: number): Tile[] | undefined {
  if (lists.length <= 1) return lists[0];
  const fits = lists.filter((list) => {
    const mit = mitigated(cat, before, list);
    const r = replayAtEnd(from, draws, (rng) => {
      rng.get(EVENT_ROLL_TOTAL, 'Random Event Roll');
      return floodDraws(rng, sev, list.map((t) => ctx(t.index)), mit);
    })[0];
    if (!r) return false;
    let n = 0;
    for (const [f, p] of r.value.gains.values()) n += f + p;
    return n === num(e[4]);
  });
  return fits.length === 1 ? fits[0] : undefined;
}
