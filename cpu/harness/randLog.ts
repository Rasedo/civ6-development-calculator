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
  const want = new Set([...seeds].map((s) => s >>> 0));
  let best: RandLog | undefined;
  let bestHits = 0;
  for (const rows of parse(readFileSync(path, 'utf8'))) {
    const log = new RandLog(rows);
    let hits = 0;
    for (const s of want) if (log.index(s) !== undefined) hits++;
    if (hits > bestHits) {
      best = log;
      bestHits = hits;
    }
  }
  return best;
}
