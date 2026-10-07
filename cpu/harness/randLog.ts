/**
 * THE GAME'S OWN DRAW LOG (`Logs/RandCalls.csv`): every draw the game took —
 * its turn, its range, its value, the generator's state BEFORE it and the
 * DLL's label of the site that drew (`tools/civ6lab/dll_readings.md`, "H-1:
 * every draw of a player's start", "H-1: the draw log's labels"). The log
 * holds every game its instance played, one after another, each starting
 * where the turn falls back; the dump's game is the one whose chain holds
 * the dump's witness seeds. A recording keeps its game's slice beside its
 * dump (`<dump>.randcalls.csv`, `tools/civ6lab/h1/fleet.py`); the pair
 * recorded before that keeps one file for both
 * (`h1_randcalls_duelw<a>_<b>.csv` beside the dumps).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { lcgStep } from './civ6Random';

/** One draw of the game's log. */
export interface LoggedDraw {
  turn: number;
  range: number;
  value: number;
  label: string;
}

/** One game's chain of draws, indexed by the generator's state. */
export class RandLog {
  readonly draws: LoggedDraw[];
  /** the state each draw was taken from -> its index; the state after the
   *  last draw -> the draw count */
  private readonly at = new Map<number, number>();
  /** the state each draw was taken from */
  private readonly seeds: number[];

  constructor(rows: { turn: number; range: number; value: number; seed: number; label: string }[]) {
    this.draws = rows.map(({ turn, range, value, label }) => ({ turn, range, value, label }));
    this.seeds = rows.map((r) => r.seed >>> 0);
    rows.forEach((r, i) => this.at.set(r.seed >>> 0, i));
    if (rows.length) this.at.set(lcgStep(rows[rows.length - 1].seed), rows.length);
  }

  /** the generator's state before draw `i` */
  stateAt(i: number): number {
    return i < this.seeds.length ? this.seeds[i] : lcgStep(this.seeds[this.seeds.length - 1]);
  }

  /** the index of the draw taken from `state` (the draw count for the state
   *  after the last), undefined off the chain */
  index(state: number): number | undefined {
    return this.at.get(state >>> 0);
  }

  /** the draws from state `a` up to state `b`, undefined where either is off
   *  the chain or `b` comes first */
  between(a: number, b: number): LoggedDraw[] | undefined {
    const i = this.index(a);
    const j = this.index(b);
    if (i === undefined || j === undefined || j < i) return undefined;
    return this.draws.slice(i, j);
  }
}

/** The log's rows, the label being everything past the fifth comma (a label
 *  may hold commas: "..., Player: 1"). */
function parse(text: string) {
  const games: { turn: number; range: number; value: number; seed: number; label: string }[][] = [];
  let cur: (typeof games)[number] = [];
  let last = 0;
  for (const line of text.split(/\r?\n/)) {
    const f: string[] = [];
    let rest = line;
    for (let k = 0; k < 5; k++) {
      const c = rest.indexOf(',');
      if (c < 0) break;
      f.push(rest.slice(0, c).trim());
      rest = rest.slice(c + 1);
    }
    if (f.length < 5 || !/^\d+$/.test(f[0])) continue;
    const turn = Number(f[0]);
    if (cur.length && turn < last) {
      games.push(cur);
      cur = [];
    }
    last = turn;
    cur.push({ turn, range: Number(f[1]), value: Number(f[2]), seed: Number(f[3]) >>> 0, label: rest.trim() });
  }
  if (cur.length) games.push(cur);
  return games;
}

/** The log file of a dump: its own slice beside it, else a shared file
 *  beside it whose name lists the dump's duel number. */
export function randLogPath(dumpPath: string): string | undefined {
  const own = dumpPath.replace(/\.jsonl$/, '.randcalls.csv');
  if (existsSync(own)) return own;
  const duel = /h1_duelw(\d+)_/.exec(basename(dumpPath))?.[1];
  if (!duel) return undefined;
  const dir = dirname(dumpPath);
  const shared = readdirSync(dir).find((f) => {
    const m = /^h1_randcalls_duelw([\d_]+)\.csv$/.exec(f);
    return !!m && m[1].split('_').includes(duel);
  });
  return shared ? join(dir, shared) : undefined;
}

/** The game of the log at `path` whose chain holds the most of `seeds`;
 *  undefined when none holds any. */
export function loadRandLog(path: string, seeds: Iterable<number>): RandLog | undefined {
  return gameOfLog(path, seeds)?.log;
}

/** The game in the draw log at `path` whose chain holds the most of
 *  `seeds`, and its place among the log's games; undefined when none holds
 *  any. */
function gameOfLog(path: string, seeds: Iterable<number>): { log: RandLog; k: number } | undefined {
  const want = new Set([...seeds].map((s) => s >>> 0));
  let best: { log: RandLog; k: number } | undefined;
  let bestHits = 0;
  parse(readFileSync(path, 'utf8')).forEach((rows, k) => {
    const log = new RandLog(rows);
    let hits = 0;
    for (const s of want) if (log.index(s) !== undefined) hits++;
    if (hits > bestHits) {
      best = { log, k };
      bestHits = hits;
    }
  });
  return best;
}

/**
 * THE WORLD'S CARBON by turn, from the game's own climate log
 * (`Logs/Game_RandomEvents.csv`, a row of sixteen numbers per turn written
 * by the random-event step, 0x33a280: its third column "Total CO2" the
 * climate's world total 0x28db00, in thousands): turn -> carbon. Read from
 * the dump's own logs (`<dump>.logs/`, `tools/civ6lab/h1/fleet.py`), else a
 * shared folder beside it (`h1_logs_duelw<a>_<b>/`) holding several games
 * one after another, the dump's game being the one its draw log there
 * matches by `seeds`. Undefined where neither is kept.
 */
export function loadCarbonLog(dumpPath: string, seeds: Iterable<number>): Map<number, number> | undefined {
  const own = join(dumpPath.replace(/\.jsonl$/, '.logs'), 'Game_RandomEvents.csv');
  if (existsSync(own)) return carbonGames(readFileSync(own, 'utf8')).pop();
  const duel = Number(/h1_duelw(\d+)_/.exec(basename(dumpPath))?.[1]);
  if (!duel) return undefined;
  const dir = dirname(dumpPath);
  const shared = readdirSync(dir).find((f) => {
    const m = /^h1_logs_duelw(\d+)_(\d+)$/.exec(f);
    return !!m && Number(m[1]) <= duel && duel <= Number(m[2]);
  });
  if (!shared) return undefined;
  const events = join(dir, shared, 'Game_RandomEvents.csv');
  const draws = join(dir, shared, 'RandCalls.csv');
  if (!existsSync(events) || !existsSync(draws)) return undefined;
  const game = gameOfLog(draws, seeds);
  return game ? carbonGames(readFileSync(events, 'utf8'))[game.k] : undefined;
}

/** The climate log's games, each turn -> world carbon; a game starts where
 *  the turn falls back. */
function carbonGames(text: string): Map<number, number>[] {
  const games: Map<number, number>[] = [];
  let cur = new Map<number, number>();
  let last = 0;
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(',').map((x) => x.trim());
    if (f.length !== 16 || !f.every((x) => /^-?\d+$/.test(x))) continue;
    const turn = Number(f[0]);
    if (cur.size && turn < last) {
      games.push(cur);
      cur = new Map();
    }
    last = turn;
    cur.set(turn, Number(f[2]) * 1000);
  }
  if (cur.size) games.push(cur);
  return games;
}
