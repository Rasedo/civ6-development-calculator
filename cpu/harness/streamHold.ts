/**
 * THE ACTION REPLAY ON THE GAME'S RANDOM STREAM (`holdRng`). The game draws
 * for its AI between the engine's rule draws (a unit's "Random Direction", a
 * city's "City Build District Choice"), which the driver never takes, so a
 * free-running replay would draw every rule off the game's stream. The hold
 * places the generator at the game's state before each of the engine's
 * labelled draws (`randRange`'s label), from the game's own draw log
 * (`randLog.ts`: its Seed column is the state BEFORE the draw; 46,082 of
 * 46,082 logged values are that state's draw):
 *
 * - at each witnessed point — a seat's start (its player's `PlayerTurnStarted`
 *   seed) and the turn's random-event step (the logged step's first draw,
 *   `loggedStep`, else the event replay's) — the generator takes the game's
 *   state, and the point opens a window of the log: up to the next witnessed
 *   point, its player's start and actions;
 * - each labelled draw takes the first draw of the log with its label not yet
 *   taken: in the window (the same range first), else anywhere in the turn
 *   ("displaced": a rule the engine takes elsewhere in the turn than the
 *   game). A draw outside the engine's turn — the record's actions, applied
 *   before and after it (`actions`) — searches the actions' turn. A label the
 *   turn's log no longer holds draws where the generator stands ("unlogged");
 *   an `Engine:` label (the driver's stand-ins) is never held.
 *
 * The log's draws are its turn's: the step that precedes the starts of turn
 * T and every player's start and actions of T. With no log the points alone
 * hold (the event replay's step). Only the replay's own game is held: the
 * per-turn checks it runs beside draw on states of their own, untouched.
 * `STREAM_HOLD=points` holds the points alone with the log at hand, to
 * measure the stream without the draw holds; `STREAM_TRACE=<turn>` prints
 * the turn's points and draws, each with the logged draw it took.
 */
import type { GameState } from '../core/types';
import type { DrawLabel, RngHooks, RngPoint } from '../core/rand';
import type { TurnRecord } from './record';
import type { History } from './import';
import { DRAW_SITES, loggedStep, siteLabel } from './drawSites';
import { lcgStep } from './civ6Random';

/** per label: what the engine drew and what the log holds */
export interface LabelTally {
  owner: string;
  /** the log's draws in the turns the replay covers */
  logged: number;
  /** the engine's draws */
  engine: number;
  /** held at a logged draw of the label: in its window, elsewhere in the turn */
  inWindow: number;
  displaced: number;
  /** held at a draw of another range */
  rangeOff: number;
  /** drawn with no logged draw of the label left in the turn */
  unlogged: number;
  /** the log's draws of the covered turns the engine never took */
  missing: number;
}

export interface StreamLedger {
  /** whether the draws were held (else the points alone) */
  draws: boolean;
  /** the witnessed points held */
  points: number;
  /** the windows between held points, and those whose rule draws the engine
   *  took exactly: every logged draw of a label the engine draws taken at
   *  its range, no engine draw of such a label unlogged in it */
  stretches: number;
  exact: number;
  byKind: Record<string, [number, number]>;
  /** the turns the replay covers whole (its actions and its starts) */
  turns: number;
  engineDraws: number;
  loggedDraws: number;
  byLabel: Record<string, LabelTally>;
  /** per covered turn with a difference: label -> [engine, logged] */
  turnsOff: { turn: number; labels: Record<string, [number, number]> }[];
  /** the step windows not drawn exactly, by their first difference: "the
   *  event" where the engine's event differs from the game's right after the
   *  roll, else the engine's label against the game's there: their turns */
  stepsOff: Record<string, number[]>;
}

export interface StreamHold extends RngHooks {
  /** the draws that follow are the record's actions of `turn` (outside the
   *  engine's turn); null: the engine's turn, whose points place its draws */
  actions(turn: number | null): void;
  ledger(): StreamLedger;
}

/** the label's key: the volcano roll's choice by either branch is one site */
function keyOf(label: string): string {
  const k = siteLabel(label);
  return k === 'Choose Inactive Volcano Roll' ? 'Choose Active Volcano Roll' : k;
}

/**
 * The hold for a replay of `recs`. The engine's seat phase of turn t is the
 * game's starts of turn t + 1 (the replay steps from record t to record
 * t + 1), so each seat takes the state its player's start of turn t + 1
 * began from; the random-event step that follows takes the state its first
 * draw was taken from.
 */
export function streamHold(game: GameState, recs: readonly TurnRecord[], playerOfSeat: Map<number, number>, history: History): StreamHold {
  last = makeHold(game, recs, playerOfSeat, history);
  return last;
}

let last: StreamHold | null = null;
const TRACE = Number(process.env.STREAM_TRACE ?? NaN);

/** the ledger of the last replay's hold */
export function lastStreamLedger(): StreamLedger | undefined {
  return last?.ledger();
}

function makeHold(game: GameState, recs: readonly TurnRecord[], playerOfSeat: Map<number, number>, history: History): StreamHold {
  const pre = new Map<string, number>();
  for (const r of recs) {
    for (const w of r.witness ?? []) if (w.point === 'pre' && typeof w.seed === 'number') pre.set(`${w.turn}:${w.player}`, w.seed >>> 0);
  }
  const log = history.randLog;
  const holdDraws = !!log && process.env.STREAM_HOLD !== 'points';
  const n = log?.draws.length ?? 0;

  // the log's indices per label and turn, and every point's index in order
  const byKey = new Map<string, Map<number, number[]>>();
  if (log) {
    log.draws.forEach((d, i) => {
      const k = keyOf(d.label);
      let m = byKey.get(k);
      if (!m) byKey.set(k, (m = new Map()));
      let a = m.get(d.turn);
      if (!a) m.set(d.turn, (a = []));
      a.push(i);
    });
  }
  const taken = new Uint8Array(n);
  const marks: number[] = [];
  if (log) {
    for (const s of pre.values()) {
      const i = log.index(s);
      if (i !== undefined) marks.push(i);
    }
    for (const [, gap] of history.replay?.gaps ?? []) {
      const gd = log.between(gap[0], gap[1]);
      const b = gd ? loggedStep(gd) : undefined;
      if (b) marks.push(log.index(gap[0])! + b[0]);
    }
  }
  const points = [...new Set(marks)].sort((x, y) => x - y);
  const nextMark = (i: number): number => {
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (points[m] <= i) lo = m + 1;
      else hi = m;
    }
    return lo < points.length ? points[lo] : n;
  };

  // where the draws go: a window of the log [from, to) in turn `turn`, or
  // the turn alone (from = to = -1)
  let from = -1;
  let to = -1;
  let turn = -1;
  type Window = { kind: string; from: number; to: number; spoiled: boolean; seq: string[] };
  let window: Window | null = null;
  const windows: Window[] = [];
  const actionTurns = new Set<number>();
  const pointTurns = new Set<number>();
  const tally = new Map<string, LabelTally>();
  const engineByTurn = new Map<number, Map<string, number>>();
  let engineDraws = 0;
  let held = 0;
  const tallyOf = (k: string): LabelTally => {
    let t = tally.get(k);
    if (!t) tally.set(k, (t = { owner: DRAW_SITES[k]?.owner ?? (k.startsWith('Engine:') ? 'engine' : 'unmapped'),
      logged: 0, engine: 0, inWindow: 0, displaced: 0, rangeOff: 0, unlogged: 0, missing: 0 }));
    return t;
  };

  function stepState(point: RngPoint): number | undefined {
    const T = point.turn + 1;
    const gap = history.replay?.gaps.get(T);
    if (!gap) return undefined;
    const gapDraws = log?.between(gap[0], gap[1]);
    if (log && gapDraws) {
      const b = loggedStep(gapDraws);
      return b ? log.stateAt(log.index(gap[0])! + b[0]) : undefined;
    }
    const at = history.replay?.steps.get(T)?.at ?? -1;
    if (at < 0) return undefined;
    let st = gap[0];
    for (let k = 0; k < at; k++) st = lcgStep(st);
    return st;
  }

  /** the first untaken draw of key `k` in turn `T` within [lo, hi), the
   *  range `max` first */
  function find(k: string, T: number, lo: number, hi: number, max: number): number {
    const a = byKey.get(k)?.get(T);
    if (!a || !log) return -1;
    let any = -1;
    for (const i of a) {
      if (i < lo || taken[i]) continue;
      if (i >= hi) break;
      if (log.draws[i].range === max) return i;
      if (any < 0) any = i;
    }
    return any;
  }

  return {
    point(state: GameState, point: RngPoint): number | undefined {
      if (state !== game) return undefined;
      let s: number | undefined;
      if (point.kind === 'seat') {
        const player = playerOfSeat.get(point.seat);
        s = player === undefined ? undefined : pre.get(`${point.turn + 1}:${player}`);
      } else s = stepState(point);
      const i = s === undefined || !log ? undefined : log.index(s);
      if (i === undefined) {
        from = to = -1;
        turn = point.turn + 1;
        window = null;
      } else {
        from = i;
        to = nextMark(i);
        turn = i < n ? log!.draws[i].turn : point.turn + 1;
        window = { kind: point.kind, from, to, spoiled: false, seq: [] };
        windows.push(window);
      }
      if (TRACE === turn) console.error(`point ${point.kind} seat ${point.seat} t${point.turn} -> [${from},${to}) ${state.eventLog[state.eventLog.length - 1] ?? ""}`);
      if (point.kind === 'seat') pointTurns.add(point.turn + 1);
      if (s !== undefined) held++;
      return s;
    },
    draw(state: GameState, max: number, label: DrawLabel): void {
      if (state !== game) return;
      const k = keyOf(label);
      const t = tallyOf(k);
      t.engine++;
      engineDraws++;
      const bt = engineByTurn.get(turn) ?? new Map<string, number>();
      bt.set(k, (bt.get(k) ?? 0) + 1);
      engineByTurn.set(turn, bt);
      if (!log || k.startsWith('Engine:')) return;
      if (window?.kind === 'step') window.seq.push(k);
      let j = from >= 0 ? find(k, turn, from, to, max) : -1;
      if (j >= 0) t.inWindow++;
      else {
        j = find(k, turn, 0, n, max);
        if (j >= 0) t.displaced++;
      }
      if (TRACE === turn) console.error(`draw t${turn} ${k}/${max} window [${from},${to}) -> ${j}${j >= 0 ? ` ${log.draws[j].label}/${log.draws[j].range}` : ''}`);
      if (j < 0) {
        t.unlogged++;
        if (window) window.spoiled = true;
        return;
      }
      taken[j] = 1;
      if (log.draws[j].range !== max) {
        t.rangeOff++;
        if (window) window.spoiled = true;
      }
      if (holdDraws) state.rngState = log.stateAt(j);
    },
    actions(T: number | null): void {
      from = to = -1;
      window = null;
      if (T === null) turn += 1;
      else {
        turn = T;
        actionTurns.add(T);
      }
    },
    ledger(): StreamLedger {
      const covered = new Set([...actionTurns].filter((T) => pointTurns.has(T)));
      const out: StreamLedger = { draws: holdDraws, points: held, stretches: 0, exact: 0, byKind: {}, turns: covered.size,
        engineDraws, loggedDraws: 0, byLabel: {}, turnsOff: [], stepsOff: {} };
      const drawn = new Set([...tally.keys()]);
      const loggedByTurn = new Map<number, Map<string, number>>();
      for (let i = 0; i < n; i++) {
        const d = log!.draws[i];
        if (!covered.has(d.turn)) continue;
        const k = keyOf(d.label);
        out.loggedDraws++;
        const t = tallyOf(k);
        t.logged++;
        if (!taken[i]) t.missing++;
        const m = loggedByTurn.get(d.turn) ?? new Map<string, number>();
        m.set(k, (m.get(k) ?? 0) + 1);
        loggedByTurn.set(d.turn, m);
      }
      for (const w of windows) {
        let ok = !w.spoiled;
        for (let i = w.from; ok && i < w.to; i++) {
          if (drawn.has(keyOf(log!.draws[i].label)) && !taken[i]) ok = false;
        }
        out.stretches++;
        if (ok) out.exact++;
        const b = (out.byKind[w.kind] ??= [0, 0]);
        b[0]++;
        if (ok) b[1]++;
        if (ok || w.kind !== 'step') continue;
        // the step's first difference, the game's labels the engine draws
        // against the engine's, in order
        const game = log!.draws.slice(w.from, w.to).map((d) => keyOf(d.label)).filter((k) => drawn.has(k));
        let p = 0;
        while (p < game.length && p < w.seq.length && game[p] === w.seq[p]) p++;
        const afterRoll = p > 0 && game[p - 1] === 'Random Event Roll';
        const why = afterRoll ? 'the event' : `${w.seq[p] ?? 'none'} / ${game[p] ?? 'none'}`;
        (out.stepsOff[why] ??= []).push(log!.draws[w.from]?.turn ?? -1);
      }
      for (const T of [...covered].sort((a, b) => a - b)) {
        const e = engineByTurn.get(T) ?? new Map<string, number>();
        const g = loggedByTurn.get(T) ?? new Map<string, number>();
        const labels: Record<string, [number, number]> = {};
        for (const k of new Set([...e.keys(), ...g.keys()])) {
          const owner = tallyOf(k).owner;
          if (owner === 'ai' || owner === 'setup' || owner === 'engine') continue;
          if ((e.get(k) ?? 0) !== (g.get(k) ?? 0)) labels[k] = [e.get(k) ?? 0, g.get(k) ?? 0];
        }
        if (Object.keys(labels).length) out.turnsOff.push({ turn: T, labels });
      }
      out.byLabel = Object.fromEntries([...tally].sort((a, b) => (b[1].logged + b[1].engine) - (a[1].logged + a[1].engine)));
      return out;
    },
  };
}
