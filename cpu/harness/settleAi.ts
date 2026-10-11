/**
 * THE MAJORS' SETTLE AI BESIDE THE ACTION REPLAY: where each AI major's AI
 * would found (ai/major/settle.ts), run at the point the game's AI took it
 * (the pair's start) and scored against the game's own logs of that game. It
 * reads; the record's foundings still land. Each turn runs twice: on the
 * replayed engine (after the active player's moves), and on record t as the
 * importer reads it (the choice alone, free of the engine's drift).
 *
 * - The first turn settler (a seat without a city, AI_Tactical.csv "HL:
 *   First turn settler"): the settler's planning reach against the log's
 *   AI_Planning.csv line for it, and the plot it goes for (on our reach, and
 *   on the log's) against record t+1 — the city founded there, or the
 *   settler standing there; and the pick as the seat's action rows, applied on
 *   a copy of the state, carrying the settler to it.
 * - The "Settle New City" operation's target (AI_Operation.csv, "TARGET
 *   x:y") of a seat holding a city (one without names none: "Operation
 *   Change Target INVALID, No backup"): where the operation starts, our best
 *   region top against the log's target; where the log changes the target
 *   ("Operation Change Target"), our best top other than the old target
 *   against the new one; and every running turn's target against our best
 *   of that turn.
 * - Where the recording kept the verbose AI logs, every plot score of
 *   AI_SiteEval.csv (each region's plots, each turn and player) against
 *   ours.
 */
import { existsSync, readFileSync } from 'node:fs';
import { bestSettleSite, firstTurnSettlePlot, firstTurnSettlerOrders, settleRegions } from '../../ai/major/settle';
import { applySeatUnitOrders } from '../core/phase';
import type { MajorReachView } from '../../ai/major/view';
import { majorView, type MajorViewInputs } from '../core/majorView';
import { citiesOf, seatOf } from '../core/seats';
import { unitFullMoves } from '../core/units';
import type { GameState, Seat } from '../core/types';
import type { TurnRecord } from './record';

interface OpTurn {
  started: boolean;
  /** the target the running lines name, "x:y" ("-9999:-9999" for none) */
  target: string | null;
  /** an "Operation Change Target" line this turn */
  changed: boolean;
}

/** the operation's lines by `${turn}:${player}` */
function readOps(path: string): Map<string, OpTurn> {
  const out = new Map<string, OpTurn>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4 || !c[2].startsWith('Settle New City')) continue;
    const k = `${c[0]}:${c[1]}`;
    let v = out.get(k);
    if (!v) out.set(k, (v = { started: false, target: null, changed: false }));
    if (c[2] === 'Settle New City' && c[3] === 'Started') v.started = true;
    else if (c[2] === 'Settle New City running' && c[3].startsWith('TARGET ')) v.target ??= c[3].slice(7);
    else if (c[3].startsWith('Operation Change Target')) v.changed = true;
  }
  return out;
}

/** the settlers' planning lines by `${turn}:${player}`: each a list of
 *  [x:y, turns, moves] */
function readPlanning(path: string): Map<string, [string, number, number][][]> {
  const out = new Map<string, [string, number, number][][]>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 5 || c[2] !== 'UNIT_SETTLER') continue;
    const spots = c.slice(4).flatMap((s): [string, number, number][] => {
      const m = /^(\d+:\d+)\((\d+)\/(\d+)\)$/.exec(s);
      return m ? [[m[1], Number(m[2]), Number(m[3])]] : [];
    });
    const k = `${c[0]}:${c[1]}`;
    (out.get(k) ?? out.set(k, []).get(k)!).push(spots);
  }
  return out;
}

export interface SettleTally {
  /** first turn settler: choices, the reach's lines equal to the log's (plot,
   *  turn and Movement in order), picks equal to record t+1 on our reach and
   *  on the log's reach */
  firstTurn: number;
  reachEqual: number;
  /** the picks as the seat's action rows (ai/major/settle.ts), and
   *  those the engine carries to the pick */
  orders: number;
  ordersLand: number;
  pickRecord: number;
  pickRecordLogReach: number;
  firstMiss?: string;
  /** the operation's target, the seat holding a city: starts and changes
   *  compared, equal; every running turn compared, equal */
  starts: number;
  startsEqual: number;
  changes: number;
  changesEqual: number;
  running: number;
  runningEqual: number;
  firstTargetMiss?: string;
  /** the plot scores of AI_SiteEval.csv (a recording with the verbose AI
   *  logs): lines compared, equal, the first turn with a line unequal */
  scores: number;
  scoresEqual: number;
  firstScoreMiss?: string;
  misses: string[];
}

/** AI_SiteEval.csv's plot scores by `${turn}:${player}`: [x:y, score] */
function readSiteEval(path: string): Map<string, [string, number][]> {
  const out = new Map<string, [string, number][]>();
  if (!existsSync(path)) return out;
  let rows: [string, number][] = [];
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c[2]?.startsWith('REGION START')) {
      const k = `${c[0]}:${c[1]}`;
      rows = out.get(k) ?? out.set(k, []).get(k)!;
    } else if (c.length >= 4 && c[2]) rows.push([c[2], Number(c[3])]);
  }
  return out;
}

const tally = (): SettleTally => ({ firstTurn: 0, reachEqual: 0, orders: 0, ordersLand: 0, pickRecord: 0, pickRecordLogReach: 0, starts: 0, startsEqual: 0,
  changes: 0, changesEqual: 0, running: 0, runningEqual: 0, scores: 0, scoresEqual: 0, misses: [] });

interface Pick { tally: SettleTally; player: number; turn: number; at: string; ours: string | null; logs: string | null }

export class SettleProbe {
  private readonly ops: Map<string, OpTurn>;
  private readonly planning: Map<string, [string, number, number][][]>;
  private readonly siteEval: Map<string, [string, number][]>;
  private readonly picks: Pick[] = [];
  readonly tally = { engine: tally(), record: tally() };

  /** `seats`: the AI majors, seat -> the record's player id; `strategies`: what
   *  each seat followed as its AI turn opened (`StrategyProbe`), which pick the
   *  strategy lists */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly inputs: (turn: number) => MajorViewInputs) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.ops = readOps(`${logs}AI_Operation.csv`);
    this.planning = readPlanning(`${logs}AI_Planning.csv`);
    this.siteEval = readSiteEval(`${logs}AI_SiteEval.csv`);
  }

  get active(): boolean {
    return this.ops.size > 0 && this.seats.size > 0;
  }

  /** at the pair's start, the AI's turn: its choices on the engine's state
   *  and on record t's */
  preTurn(engine: GameState, record: GameState | null): void {
    if (!this.active) return;
    this.atTurnStart(engine, () => this.choose(engine, this.tally.engine));
    if (record) this.atTurnStart(record, () => this.choose(record, this.tally.record));
  }

  /** `fn` with the AI seats' units on their full Movement, as their turn
   *  starts (the record's and the pair start's show what the turn before
   *  left), the state as it was after */
  private atTurnStart(state: GameState, fn: () => void): void {
    const units = state.units.filter((u) => this.seats.has(u.seat));
    const left = units.map((u) => u.movesLeft);
    for (const u of units) u.movesLeft = u.movesFull ?? unitFullMoves(state, u);
    try {
      fn();
    } finally {
      units.forEach((u, i) => { u.movesLeft = left[i]; });
    }
  }

  private choose(state: GameState, t: SettleTally): void {
    const miss = (m: string) => {
      if (t.misses.length < 40) t.misses.push(m);
    };
    const turn = state.turn;
    const view = majorView(state, this.inputs(turn));
    const plots = view.plots();
    const xy = (p: number) => `${plots[p].x}:${plots[p].y}`;
    const byXy = new Map<string, number>(plots.map((p) => [`${p.x}:${p.y}`, p.index]));
    for (const [seat, player] of this.seats) {
      if (!seatOf(state, seat)) continue;
      const sr = settleRegions(view, seat);
      let unequal = 0;
      let firstLine = '';
      for (const [s, v] of this.siteEval.get(`${turn}:${player}`) ?? []) {
        const p = byXy.get(s);
        const ours = p === undefined ? NaN : (sr.score.get(p) ?? 0) / 256;
        t.scores++;
        if (ours === v) t.scoresEqual++;
        else if (!unequal++) firstLine = `${s} log ${v} ours ${ours}`;
      }
      if (unequal) t.firstScoreMiss ??= `t${turn} p${player}: ${unequal} unequal, first ${firstLine}`;
      if (citiesOf(state, seat).length === 0) {
        const lines = this.planning.get(`${turn}:${player}`) ?? [];
        for (const u of view.units(seat)) {
          if (!u.founder) continue;
          const reach = view.unitReach(u.id, 2);
          const log = lines.find((l) => l[0]?.[0] === xy(u.plot));
          const logReach: MajorReachView[] = (log ?? []).map(([s, tu, mv]) => ({ plot: byXy.get(s) ?? -1, turns: tu, moves: mv * 256 }));
          t.firstTurn++;
          if (log && log.length === reach.length
            && reach.every((r, i) => xy(r.plot) === log[i][0] && r.turns === log[i][1] && Math.floor(r.moves / 256) === log[i][2])) t.reachEqual++;
          const ours = firstTurnSettlePlot(sr, reach);
          const logs = log ? firstTurnSettlePlot(sr, logReach) : null;
          this.picks.push({ tally: t, player, turn, at: xy(u.plot), ours: ours === null ? null : xy(ours), logs: logs === null ? null : xy(logs) });
        }
        // the choice as the seat's action rows, applied on a copy: each
        // settler ends on its pick, or founds there
        const copy = structuredClone(state);
        applySeatUnitOrders(copy, seatOf(copy, seat) as Seat, firstTurnSettlerOrders(view, seat, sr));
        for (const u of view.units(seat)) {
          if (!u.founder) continue;
          const pick = firstTurnSettlePlot(sr, view.unitReach(u.id, 1));
          if (pick === null) continue;
          t.orders++;
          if (citiesOf(copy, seat).some((c) => c.centerIndex === pick) || copy.units.some((x) => x.id === u.id && x.tileIndex === pick)) t.ordersLand++;
        }
        continue;
      }
      const op = this.ops.get(`${turn}:${player}`);
      if (!op?.target) continue;
      const best = bestSettleSite(sr);
      const ours = best ? xy(best.plot) : '-9999:-9999';
      t.running++;
      if (ours === op.target) t.runningEqual++;
      if (op.started) {
        t.starts++;
        if (ours === op.target) t.startsEqual++;
        else {
          const m = `t${turn} p${player} start: ours ${ours} (${(best?.score ?? 0) / 256}) log ${op.target}`
            + ` (ours there ${(sr.score.get(byXy.get(op.target) ?? -1) ?? 0) / 256})`;
          t.firstTargetMiss ??= m;
          miss(m);
        }
      }
      const before = this.ops.get(`${turn - 1}:${player}`);
      if (before?.changed && before.target && !op.started) {
        t.changes++;
        const backup = bestSettleSite(sr, byXy.get(before.target) ?? -1);
        const b = backup ? xy(backup.plot) : '-9999:-9999';
        if (b === op.target) t.changesEqual++;
        else miss(`t${turn} p${player} change from ${before.target}: ours ${b} log ${op.target}`);
      }
    }
  }

  /** at the pair's end: the first turn picks against record t+1 */
  postTurn(b: TurnRecord): void {
    for (const p of this.picks) {
      const t = p.tally;
      const at = (x: string | null) => x !== null
        && (b.cities.some((c) => c.owner === p.player && `${c.x}:${c.y}` === x)
          // the record's unit type is the Units row: UNIT_SETTLER is row 0
          || b.units.some((u) => u.owner === p.player && u.type === 0 && `${u.x}:${u.y}` === x));
      if (at(p.ours)) t.pickRecord++;
      else {
        const m = `t${p.turn} p${p.player} first turn settler at ${p.at}: ours ${p.ours ?? '-'} on the log's reach ${p.logs ?? '-'}`;
        t.firstMiss ??= m;
        if (t.misses.length < 40) t.misses.push(m);
      }
      if (at(p.logs)) t.pickRecordLogReach++;
    }
    this.picks.length = 0;
  }
}

const lines = (name: string, t: SettleTally): string[] => [
  `- ${name}: first turn settler: choices ${t.firstTurn}; planning reach as the log's line ${t.reachEqual}; `
  + `the pick where record t+1 founds or stands, on our reach ${t.pickRecord}, on the log's reach ${t.pickRecordLogReach}; `
  + `as action rows ${t.orders}, the engine carrying the settler to its pick ${t.ordersLand}; first miss: ${t.firstMiss ?? "-"}.`,
  `- ${name}: "Settle New City" target: starts ${t.starts}, our best top the log's ${t.startsEqual}; changes ${t.changes}, our best other top the log's ${t.changesEqual}; `
  + `running turns ${t.running}, our best top the log's target ${t.runningEqual}; first start miss: ${t.firstTargetMiss ?? '-'}.`,
  ...(t.scores ? [`- ${name}: the plot scores of AI_SiteEval.csv: lines ${t.scores}, equal ${t.scoresEqual}; first turn unequal: ${t.firstScoreMiss ?? "-"}.`] : []),
];

/** the tallies as the replay report's section */
export function settleMarkdown(t: { engine: SettleTally; record: SettleTally }): string[] {
  return ['', '## The majors\' AI: settling (ai/major/settle.ts)', '',
    ...lines('On the replayed engine', t.engine), ...lines('On record t', t.record),
    '', 'Misses on record t:', '', ...t.record.misses.map((m) => `- ${m}`),
    '', 'Misses on the replayed engine:', '', ...t.engine.misses.map((m) => `- ${m}`)];
}

export type SettleTallies = SettleProbe['tally'];
