/**
 * THE RECORDED RANDOM EVENTS, REPLAYED ON THE GAME'S GENERATOR. Where the
 * records carry the start-of-turn witnesses' generator states
 * (`StartWitness.seed`), the draws between the barbarians' completed start
 * of turn T-1 and the first player's start of turn T end with the turn's
 * random-event step (`tools/civ6lab/dll_readings.md`, "H-1: the random
 * events' draws", "C-74: the fire"): each live storm's walk, each live fire's
 * turn, the volcano roll, the event roll and the new event's own draws
 * (`eventDraws.ts`). The step is placed at the
 * end of those draws, and a start counts only where the replay reproduces
 * what the records place without the yields: a new storm's start plot, a
 * storm's plot after its first walk. Then the draws decide each struck plot's
 * fertility — the importer adds it (`History.eventYields`) and reads none of
 * it back. An event the replay does not reach stays with the readings
 * (`foldEventYields`).
 */

import type { GameMap, Tile } from '../../world/types';
import { UNITS } from '../data/units';
import { TURN_LIMIT } from '../core/game';
import { ERUPTION_ROWS, ERUPTION_WEIGHT, ERUPTION_WONDER, FIRE_BURNING_FEATURE, FIRE_BURNT_TURN, FIRE_DAMAGE_TURNS, FIRE_DMG, FIRE_REGROW_TURN, FIRE_SPREAD_P, FIRE_SPREAD_TURNS, FIRE_START_FEATURE, FIRST_TIME_OCCURRENCE_BOOST, FLOOD_WEIGHT, STANDARD_MAP_AREA, STORM_EVENTS } from '../data/disasters';
import { fireCandidate, meteorGround } from '../core/disasters';
import { RING_DIRS, neighborTile } from '../../world/hex';
import { unitDomain } from '../core/units';
import { plotAt, P, num, type Catalog, type TurnRecord } from './record';
import { engineRowOf, recordMap } from './import';
import { drawsBetween, type Civ6Random } from './civ6Random';
import type { RandLog } from './randLog';
import { loggedStep, sameDraw } from './drawSites';
import {
  droughtDraws, eruptionDraws, floodDraws, floodplainList, newClimate, newOutcome, replayAtEnd, stormBirth, stormStartPlots, stormWalk, unitRolls,
  type EventClimate, type EventOutcome, type StormState, type StruckPlot,
} from './eventDraws';
import { CLIMATE_PHASES } from '../data/climate';

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
  family: 'flood' | 'storm' | 'eruption' | 'drought' | 'fire' | 'sea' | 'meteor';
  /** the turns whose draws placed it (a storm's birth and its walks) */
  turns: number[];
}

export interface EventReplay {
  /** the events whose every draw the replay placed, by key */
  events: Map<string, ReplayedEvent>;
  /** by key, the read records whose turns' steps the replay placed for each
   *  event (an unread record's turn counts at the next read record), one not
   *  in `events` included (a storm whose last step was not placed): their
   *  draws are in `gains` */
  placedTurns: Map<string, Set<number>>;
  /** the fertility the replayed events laid between the read record before
   *  T and read record T, by T: plot -> [Food, Production, Science, Culture] */
  gains: Map<number, Map<number, number[]>>;
  /** each witnessed turn's outcome: `ok`, or why the step was not placed */
  turns: Map<number, string>;
  /** by read record T, the plots whose fertility the starts that reproduce the step lay
   *  differently, or that a storm laid after such a turn: `gains` holds the
   *  latest start's */
  unsure: Map<number, number[]>;
  /** by T, the step as placed: its draws (the chosen start's), and with the
   *  game's log the logged draws from its start to the witness and whether
   *  the start the records alone choose is the logged one (`byRecords`) */
  steps: Map<number, StepDraws>;
  /** by T, the generator's states bracketing the gap the step closes: the
   *  barbarians' completed start of T-1 and the first player's start of T */
  gaps: Map<number, [number, number]>;
}

/** A turn's random-event step as the replay placed it. */
export interface StepDraws {
  /** the replayed step's draws and where they start in the gap's draws */
  ours: { label: string; range: number }[];
  at: number;
  /** the log's step (`loggedStep`) and where it starts in the gap */
  logged?: { label: string; range: number }[];
  loggedAt?: number;
  byRecords?: boolean;
}

type EventRow = number[];

const FLOODS = ['RANDOM_EVENT_FLOOD_MODERATE', 'RANDOM_EVENT_FLOOD_MAJOR', 'RANDOM_EVENT_FLOOD_1000_YEAR'];
const DROUGHTS = ['RANDOM_EVENT_DROUGHT_MAJOR', 'RANDOM_EVENT_DROUGHT_EXTREME'];
/** the fires, each with the feature it starts on */
const FIRE_EVENTS = ['RANDOM_EVENT_FOREST_FIRE', 'RANDOM_EVENT_JUNGLE_FIRE'];
const FIRE_EVENT_FEATURE = ['WOODS', 'RAINFOREST'];

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

/** a fire on its plot, its start turn and row; `lit` 0 for a spread's
 *  birth (during the fires' turns), 1 for the event's pick (after the roll),
 *  `seq` its place among the births of its turn */
interface SpreadFire {
  plot: number;
  start: number;
  row: number;
  lit: number;
  seq: number;
}

interface Step {
  st: StormState[];
  /** the climate as the step leaves it: its own copy of the plots' event
   *  fertility */
  climate: EventClimate;
  out: EventOutcome;
  soil: Map<number, number[]>;
  born?: StormState;
  /** a new storm the record places and the replay reproduced */
  bornOk: boolean;
  /** the event roll */
  roll: number;
  /** the fires a spread lit this step */
  births?: SpreadFire[];
}

/** The plots nobody held when turn T's random-event step ran: the record
 *  after it holds them unowned, or the first player's start of T took them
 *  after the step (its CityTileOwnershipChanged rows before the turn's
 *  first PlayerTurnActivated) — the claims of the players after it on the
 *  turn before stand (runs/h1_duelw1119 t56: the meteor's pick over 262
 *  plots, four the record before held unowned taken since). */
function unownedAtStep(after: TurnRecord, T: number): Set<number> {
  const W = after.head.W;
  const out = new Set<number>();
  for (let i = 0; i < W * after.map.length; i++) if ((plotAt(after, i)[P.owner] as number) < 0) out.add(i);
  const rows = (after as TurnRecord & { actions?: unknown }).actions;
  if (Array.isArray(rows)) {
    for (const r of rows as (number | string)[][]) {
      if (r[1] !== T) continue;
      if (r[2] === 'PlayerTurnActivated') break;
      if (r[2] === 'CityTileOwnershipChanged') out.add((r[6] as number) * W + (r[5] as number));
    }
  }
  return out;
}

/**
 * `recs` are the records read; `unread` the records whose counter moved
 * while they were dumped. An unread record's witnesses still bracket its
 * turn's step and its units still stand where the step struck, so the step
 * of its turn is replayed on the read record before it, and what it laid
 * lands at the next read record (runs/h1_duelw1131: record 5 unread, record
 * 6 missing; the t3 dust storm's last walk at t5 lays 229 and 272 +1
 * Production, first read at record 7).
 */
export function replayEvents(recs: readonly TurnRecord[], cat: Catalog, log?: RandLog, unread: readonly TurnRecord[] = []): EventReplay {
  const result: EventReplay = { events: new Map(), placedTurns: new Map(), gains: new Map(), turns: new Map(), unsure: new Map(), steps: new Map(), gaps: new Map() };
  const names = cat.randomEvents ?? [];
  const byTurn = new Map(recs.map((r) => [r.turn, r]));
  const unreadAt = new Map(unread.filter((r) => !byTurn.has(r.turn)).map((r) => [r.turn, r]));
  const readTurns = [...byTurn.keys()].sort((a, b) => a - b);
  // the read record a step's fertility first shows in
  const readAt = (T: number) => readTurns.find((t) => t >= T) ?? T;
  const seeds = new Map<string, number>();
  for (const r of [...recs, ...unreadAt.values()]) {
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
  // every plot a storm has struck, its walk over or not: the game keeps
  // each storm's record, struck list and all, after its last turn
  const scarred = new Set<number>();
  // the climate the sea's rises left, and the event fertility the placed
  // steps laid on each plot
  let climate = newClimate();
  // the fires a spread lit (the records keep no event row for them)
  const spread: SpreadFire[] = [];
  // the events a turn with an unknown start drew for
  const doubtful = new Set<string>();
  let volcano: VolcanoDraws = 1;
  const turns = [...new Set([...readTurns, ...unreadAt.keys()])].sort((a, b) => a - b);
  for (const T of turns) {
    // the map the step struck: the read record before, or the latest earlier
    // one where that record was not read (runs/h1_duelw1119: record 3
    // missing, record 4 unread; the step of t5 runs on record 2)
    const before = byTurn.get(T - 1) ?? byTurn.get(readTurns.filter((t) => t < T).pop() ?? -1);
    const after = byTurn.get(T) ?? unreadAt.get(T)!;
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
    result.gaps.set(T, [a, b]);
    const draws = drawsBetween(a, b, 1 << 15);
    if (draws === undefined) { fail('witnesses not linked'); continue; }
    const map = recordMap(before, cat);
    const ctx = struckContext(cat, before, after, map);
    const afterMap = recordMap(after, cat);
    // the volcano roll's range: the game's turns over twice the volcanoes
    const volcanoD = Math.floor(TURN_LIMIT / (2 * Math.max(1, map.tiles.filter((t) => t.volcano).length)));
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
        const list = lists.length === 1 ? lists[0] : chooseList(lists, sev, e, before, cat, ctx, a, draws, climate.haltFlood);
        if (list) riverHolds.set(river, sig(list));
        if (!list) { unsupported = `${name} t${T}: the river's Floodplains list is not known`; continue; }
        const mit = mitigated(cat, before, list);
        parts.push((rng, step) => {
          const fd = floodDraws(rng, sev, list.map((t) => ctx(t.index)), mit, step.climate.haltFlood);
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
          step.born = stormBirth(rng, map, storm, T, ctx, step.out, step.climate);
          step.bornOk = step.born?.at === at && step.born.added === num(e[4]) && (e[13] === undefined || step.born.dir === num(e[13]));
          return step.bornOk;
        });
      } else if (eruption >= 0) {
        // a volcano's row erupts its plot; a natural wonder's row the
        // wonder's plots (`erupt`: Eyjafjallajokull, Kilimanjaro, Vesuvius)
        const centres = ERUPTION_WONDER[eruption] ? map.tiles.filter((t) => t.feature === ERUPTION_WONDER[eruption])
          : [map.tiles[num(e[2])]].filter((t): t is Tile => !!t);
        if (!centres.length) { unsupported = `${name} t${T}: no volcano plot`; continue; }
        parts.push((rng, step) => {
          const soil = new Map<number, number[]>();
          eruptionDraws(rng, map, centres, eruption, ctx, step.out, soil);
          let n = 0;
          for (const [i, g] of soil) { addGain(step.soil, i, g); n += g[0] + g[1] + g[2] + g[3]; }
          return n === num(e[4]);
        });
      } else if (DROUGHTS.includes(name) && num(e[3]) < 0) {
        // a drought that found no start plot draws nothing after the roll
        continue;
      } else if (DROUGHTS.includes(name)) {
        // the ground as the step found it: the record after it (a feature
        // the players cleared on the turn before is gone: runs/h1_duelw1124
        // t194, 624's Rainforest), every plot a storm ever struck left out
        const at = num(e[3]);
        const centres = new Set(before.cities.map((c) => c.y * before.head.W + c.x));
        parts.push((rng, step) => {
          const live = new Set([...scarred, ...step.st.flatMap((s) => [...s.struck])]);
          const start = droughtDraws(rng, afterMap, DROUGHTS.indexOf(name), centres, live, step.climate);
          return start === at;
        });
      } else if (FIRE_EVENTS.includes(name)) {
        // a fire: one uniform draw over the plots of its feature
        // (`fireCandidate`, ascending), then its birth strike at age 0 (the
        // one-off strike 0x2867f0): the Turn 0 yield row's "Boosted Yield
        // Chance", then the five damage rows whose turns hold 0 (the pillage
        // pair, the citizen, the civilians, the land units — each land unit's
        // own roll straight after its row, which always lands at 101)
        const at = num(e[3]);
        const row = FIRE_START_FEATURE.indexOf(FIRE_EVENT_FEATURE[FIRE_EVENTS.indexOf(name)]);
        // the plots of the feature as the step found them: the record after
        // it (the players' chops and plantings of the turn before are in
        // it, so are the fires the step regrew), the plot it lit itself added
        const cands = afterMap.tiles.filter((t) => fireCandidate(t, row) || t.index === at);
        if (!cands.length) continue;
        parts.push((rng) => {
          const pick = cands[rng.get(cands.length, 'Pick One Off Start Plot')].index;
          rng.get(100, 'Boosted Yield Chance');
          for (let i = 0; i < 5; i++) rng.get(100, 'Pillage Improvement Chance');
          unitRolls(rng, ctx(pick).landUnits, FIRE_DMG[1] - FIRE_DMG[0]);
          return pick === at;
        });
      } else if (name === 'RANDOM_EVENT_METEOR_SHOWER') {
        // the meteor: one uniform draw over the plots it may strike — its
        // ground (`meteorGround`), nobody's in the record before — ascending,
        // then its strike's two damage rows (2 of 2 meteors land: 1115 t135,
        // 1116 t243)
        const at = num(e[3]);
        const free = unownedAtStep(after, T);
        const cands = map.tiles.filter((t) => meteorGround(t) && free.has(t.index));
        if (!cands.length) {
          if (at >= 0) unsupported = `${name} t${T}: the record's plot is no candidate`;
          continue;
        }
        parts.push((rng) => {
          const pick = cands[rng.get(cands.length, 'Pick One Off Start Plot')].index;
          for (let i = 0; i < 2; i++) rng.get(100, 'Pillage Improvement Chance');
          return pick === at;
        });
      } else if (name.startsWith('RANDOM_EVENT_SEA_LEVEL_RISE')) {
        // the sea's rise draws nothing after the roll (2 of 2 rises on 1116
        // close their step on the witness this way)
        continue;
      } else {
        unsupported = `${name} t${T}: its draws are not modelled`;
      }
    }
    if (unsupported) { fail(unsupported); continue; }
    // the live fires' turns (the one-off tick 0x289430), in the order they
    // began: each its strike's rows at its age (`fireStrike`): the recorded
    // fires (the event's pick) and the ones a spread lit, which the records
    // keep no event row for. A SPREAD that lands lights every plot beside the
    // fire, in the ring walk's order (`RING_DIRS`), of the fire's own live feature
    // (`fireCandidate`), each born on the spot with its strike at age 0; the
    // record after shows each burning
    const recorded = [...first.values()].filter((e) => FIRE_EVENTS.includes(names[e[1]] ?? '') && num(e[3]) >= 0
      && T - e[0] >= 1 && T - e[0] <= FIRE_REGROW_TURN)
      .map((e) => ({ plot: num(e[3]), start: e[0], row: FIRE_START_FEATURE.indexOf(FIRE_EVENT_FEATURE[FIRE_EVENTS.indexOf(names[e[1]] ?? '')]), lit: 1, seq: 0 }));
    const fires = [...recorded, ...spread.filter((f) => T - f.start >= 1 && T - f.start <= FIRE_REGROW_TURN)]
      .sort((x, y) => x.start - y.start || x.lit - y.lit || x.seq - y.seq);
    const fireTurns = (rng: Civ6Random, step: Step) => {
      step.births = [];
      const taken = new Set(fires.map((f) => f.plot));
      for (const f of fires) {
        const age = T - f.start;
        if (age === FIRE_BURNT_TURN || age === FIRE_REGROW_TURN) {
          // its 100% row: the burnt plot's Food, the regrown plot's
          // Production, as the plot's event fertility (runs/h1_duelw1122
          // t248: the fire of t245 at 158, burnt at t247, takes a
          // "Remove Fertility Chance")
          rng.get(100, 'Boosted Yield Chance');
          const g = step.climate.fert.get(f.plot) ?? [0, 0, 0, 0];
          g[age === FIRE_BURNT_TURN ? 0 : 1] += 1;
          step.climate.fert.set(f.plot, g);
        }
        if (age < FIRE_DAMAGE_TURNS[0] || age > FIRE_DAMAGE_TURNS[1]) continue;
        for (let i = 0; i < 4; i++) rng.get(100, 'Pillage Improvement Chance');
        unitRolls(rng, ctx(f.plot).landUnits, FIRE_DMG[1] - FIRE_DMG[0]);
        if (age < FIRE_SPREAD_TURNS[0] || age > FIRE_SPREAD_TURNS[1]) continue;
        if (rng.get(100, 'Pillage Improvement Chance') >= Math.round(FIRE_SPREAD_P * 100)) continue;
        for (const d of RING_DIRS) {
          const n = neighborTile(map, map.tiles[f.plot], d);
          if (!n || taken.has(n.index) || !fireCandidate(n, f.row)) continue;
          taken.add(n.index);
          step.births.push({ plot: n.index, start: T, row: f.row, lit: 0, seq: step.births.length });
          rng.get(100, 'Boosted Yield Chance');
          for (let i = 0; i < 5; i++) rng.get(100, 'Pillage Improvement Chance');
          unitRolls(rng, ctx(n.index).landUnits, FIRE_DMG[1] - FIRE_DMG[0]);
          if (afterMap.tiles[n.index].feature !== FIRE_BURNING_FEATURE[f.row]) step.bornOk = false;
        }
      }
    };
    // the step, on each volcano-roll reading, the one the last turn used first
    const tryModes: VolcanoDraws[] = [volcano, ...([1, 0, 2] as VolcanoDraws[]).filter((v) => v !== volcano)];
    let chosen: { k: number; value: Step } | undefined;
    const alts: Step[] = [];
    let slackUsed = 0;
    // draws the records cannot show (a unit that came and went on a struck
    // plot) fall in a flood's or an eruption's damage pass, before its yields
    const struckEvent = news.some((e) => FLOODS.includes(names[e[1]] ?? '') || ERUPTION_ROWS.some((r) => `RANDOM_EVENT_${r}` === names[e[1]]));
    const slack = struckEvent ? [0, 1, 2] : [0];
    const variants = tryModes.flatMap((v) => slack.flatMap((extra) => slack.map((tail) => [v, extra, tail] as const)))
      .sort((x, y) => x[1] + x[2] - y[1] - y[2]);
    // the sea's rise is the turn's event by force: the roll is a draw over
    // its one row
    const rise = news.some((e) => (names[e[1]] ?? '').startsWith('RANDOM_EVENT_SEA_LEVEL_RISE'));
    // the game's log of the gap's draws places the step itself
    // (`loggedStep`): the replay runs from its first draw and counts only
    // where its draws are the logged ones, label and range; the start the
    // records alone choose (the latest that lands on the witness) is kept to
    // tell whether they found it
    const logged = log?.between(a, b);
    const bounds = logged ? loggedStep(logged) : undefined;
    const i0 = logged ? log!.index(a)! : 0;
    let byRecords: { k: number; trace: { label: string; range: number }[] } | undefined;
    let chosenTrace: { label: string; range: number }[] = [];
    let chosenAt = -1;
    for (const [v, extra, tail] of variants) {
      const replay = (rng: Civ6Random): Step => {
        const step: Step = { st: live.map((s) => ({ ...s.storm, struck: new Set(s.storm.struck) })), out: newOutcome(), soil: new Map(), bornOk: true, roll: -1,
          climate: { ...climate, fert: new Map([...climate.fert].map(([i, f]) => [i, [...f]])) } };
        for (const s of step.st) stormWalk(rng, map, s, T, ctx, step.out, step.climate);
        fireTurns(rng, step);
        if (v > 0) rng.get(volcanoD, 'Active Volcano Roll');
        if (v > 1) rng.get(1, 'Choose Active Volcano Roll');
        step.roll = rng.get(rise ? 1 : EVENT_ROLL_TOTAL, 'Random Event Roll');
        for (let i = 0; i < extra; i++) rng.get(100, 'Random Event Unit Damage Roll');
        for (const part of parts) if (!part(rng, step)) step.bornOk = false;
        for (let i = 0; i < tail; i++) rng.get(100, 'Random Event Unit Damage Roll');
        return step;
      };
      // what the records show of the step: a new event's own outcome, its
      // roll in its row's band, the live storms where the record has them
      const shown = (c: { value: Step }) => c.value.bornOk && news.every((e) => {
        if (rise) return true;
        const [lo, hi] = bands.get(e[1]) ?? [0, EVENT_ROLL_TOTAL];
        return c.value.roll >= lo && c.value.roll < hi;
      }) && c.value.st.every((s, i) => {
        const row = (after.events as EventRow[] | undefined)?.find((x) => `${x[0]}:${x[1]}` === live[i].key);
        return !row || (num(row[2]) === s.at && num(row[4]) === s.added && (row[13] === undefined || num(row[13]) === s.dir));
      });
      const byRec = replayAtEnd(a, draws, replay).filter(shown);
      if (byRec.length && !byRecords) byRecords = byRec[0];
      let fits: typeof byRec;
      let at: number;
      if (logged) {
        if (!bounds) break;
        const [s0, s1] = bounds;
        fits = replayAtEnd(log!.stateAt(i0 + s0), s1 - s0, replay, logged.slice(s0))
          .filter((c) => c.k === 0 && shown(c) && c.trace.every((d, i) => sameDraw(d, logged[s0 + i])));
        at = s0;
      } else {
        fits = byRec;
        at = fits.length ? fits[0].k : -1;
      }
      // the unrecorded draws are a last resort: a start needing more of them
      // than the chosen one is no candidate
      if (chosen && extra + tail > slackUsed) break;
      for (const f of fits) alts.push(f.value);
      if (fits.length && !chosen) {
        chosen = fits[0];
        chosenTrace = fits[0].trace;
        chosenAt = at;
        slackUsed = extra + tail;
        if (live.length) volcano = v;
      }
    }
    const loggedStepDraws = logged && bounds ? logged.slice(bounds[0], bounds[1]) : undefined;
    if (!chosen) {
      if (logged) {
        result.steps.set(T, { ours: byRecords?.trace ?? [], at: byRecords?.k ?? -1, ...(loggedStepDraws ? { logged: loggedStepDraws, loggedAt: bounds![0] } : {}),
          byRecords: false });
      }
      fail('no start reproduces the step');
      continue;
    }
    result.turns.set(T, 'ok');
    const step = chosen.value;
    result.steps.set(T, { ours: chosenTrace, at: chosenAt, ...(loggedStepDraws ? { logged: loggedStepDraws, loggedAt: bounds![0],
      byRecords: !!byRecords && byRecords.k === bounds![0] && byRecords.trace.length === loggedStepDraws.length
        && byRecords.trace.every((d, i) => sameDraw(d, loggedStepDraws[i])) } : {}) });
    for (const s of alts) for (const [i, [f, p]] of s.out.gains) addGain(s.soil, i, [f, p, 0, 0]);
    const g = step.soil;
    if (g.size) {
      const acc = result.gains.get(readAt(T)) ?? new Map<number, number[]>();
      for (const [i, f] of g) addGain(acc, i, f);
      result.gains.set(readAt(T), acc);
    }
    // the plots where the starts that reproduce the step lay different
    // fertility, and every plot a storm whose earlier turn was so lays: the
    // draws before the step are not recorded, so which start ran is not known
    const inherited = live.some((s) => doubtful.has(s.key));
    const plots = new Set<number>();
    for (const s of alts) for (const i of s.soil.keys()) plots.add(i);
    const unsure = [...plots].filter((i) => inherited || alts.some((s) => (s.soil.get(i) ?? []).join() !== (g.get(i) ?? []).join()));
    const walks = (s: Step) => s.st.map((x) => `${x.at}:${[...x.struck].sort((p, q) => p - q).join()}`).join('|')
      + `|${s.born ? `${s.born.at}:${[...s.born.struck].join()}` : ''}`;
    if (unsure.length) result.unsure.set(readAt(T), [...new Set([...(result.unsure.get(readAt(T)) ?? []), ...unsure])]);
    if (unsure.length || alts.some((s) => walks(s) !== walks(step))) {
      for (const s of live) doubtful.add(s.key);
      for (const e of news) doubtful.add(`${e[0]}:${e[1]}`);
    }
    for (const s of live) mark(s.key, 'storm', T, g);
    for (const e of news) {
      const key = `${e[0]}:${e[1]}`;
      mark(key, familyOf(names[e[1]] ?? ''), T, g);
    }
    live = step.st.map((s, i) => ({ storm: s, key: live[i].key }));
    for (const s of step.st) for (const i of s.struck) scarred.add(i);
    spread.push(...(step.births ?? []));
    // the step's fertility: what its storms took back, then what it laid; a
    // sea's rise sets the climate's flags for the steps after it
    climate = step.climate;
    for (const [i, f] of g) climate.fert.set(i, (climate.fert.get(i) ?? [0, 0, 0, 0]).map((v, k) => v + f[k]));
    for (const e of news) {
      const k = /^RANDOM_EVENT_SEA_LEVEL_RISE(\d)$/.exec(names[e[1]] ?? '');
      const ph = k ? CLIMATE_PHASES[Number(k[1]) - 1] : undefined;
      if (ph) climate = { ...climate, haltFlood: ph.haltsFlood, haltStorm: ph.haltsStorm, removal: ph.fertilityRemoval };
    }
    if (step.born) {
      const e = news.find((x) => STORM_EVENTS[step.born!.event] && `RANDOM_EVENT_${STORM_EVENTS[step.born!.event].id}` === names[x[1]])!;
      live.push({ storm: step.born, key: `${e[0]}:${e[1]}` });
      for (const i of step.born.struck) scarred.add(i);
    }
  }
  // an event is replayed when every turn its draws fell on was placed
  for (const [key, p] of placed) {
    result.placedTurns.set(key, new Set([...p.turns].filter(([, g]) => g !== null).map(([t]) => readAt(t))));
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
  if (DROUGHTS.includes(name)) return 'drought';
  if (FIRE_EVENTS.includes(name)) return 'fire';
  if (name.startsWith('RANDOM_EVENT_SEA_LEVEL_RISE')) return 'sea';
  if (name === 'RANDOM_EVENT_METEOR_SHOWER') return 'meteor';
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
  ctx: (plot: number) => StruckPlot, from: number, draws: number, haltFlood: boolean): Tile[] | undefined {
  if (lists.length <= 1) return lists[0];
  const fits = lists.filter((list) => {
    const mit = mitigated(cat, before, list);
    const r = replayAtEnd(from, draws, (rng) => {
      rng.get(EVENT_ROLL_TOTAL, 'Random Event Roll');
      return floodDraws(rng, sev, list.map((t) => ctx(t.index)), mit, haltFlood);
    })[0];
    if (!r) return false;
    let n = 0;
    for (const [f, p] of r.value.gains.values()) n += f + p;
    return n === num(e[4]);
  });
  return fits.length === 1 ? fits[0] : undefined;
}
