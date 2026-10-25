/**
 * THE AI'S MEMORY AGAINST THE GAME'S LOGS: what the city-states', the Free
 * Cities' and the barbarians' AI carry from one turn to the next, set beside
 * what the game's own logs show of theirs at the same turn's end:
 *
 *   - knowledge.army: the knowledge base's army records, per player and unit
 *     type the count and the oldest's age (AI_Knowledge.csv's ARMY lines);
 *   - knowledge.camps: the camps the knowledge base holds (its CAMP lines);
 *   - cityAi.contracts: the city AI's contracts as AI_CityBuild.csv shows them (each
 *     open where its last CONTRACT line printed it submitted, accepted or in
 *     progress), each its item and its tree, from AI_CityBuild.csv's
 *     CONTRACT lines folded to that turn;
 *   - ops: the operations alive at the turn's end, by name, from
 *     AI_Operation.csv (running and started, less those complete).
 *
 * A player's memory is CLEAN at a turn when every kind the logs show agrees;
 * the next turn's decisions read it (`replay.ts`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { CP_ACCEPTED, CP_IN_PROGRESS, CP_SUBMITTED, type AiContract } from '../core/aiContracts';
import { opsOf } from '../core/operations/manager';
import type { ArmyRecord, Seat } from '../core/types';
import { gameTypeOf } from '../data/aliases';

export const MEMORY_KINDS = ['knowledge.army', 'knowledge.camps', 'cityAi.contracts', 'ops'] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];

const lines = (path: string): string[] => (existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/).slice(1) : []);

/** AI_Knowledge.csv's ARMY lines by `${turn}:${player}`: per line (the
 *  players in the game's list, the line's index the player) and type
 *  `${player}|${type} ${count} ${oldest age}` */
export function loadArmyLog(dumpPath: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const index = new Map<string, number>();
  for (const line of lines(dumpPath.replace(/\.jsonl$/, '.logs/AI_Knowledge.csv'))) {
    const c = line.split(',');
    if (c[2]?.trim() !== 'ARMY') continue;
    const key = `${c[0].trim()}:${c[1].trim()}`;
    const k = index.get(key) ?? 0;
    index.set(key, k + 1);
    const list = out.get(key) ?? (out.set(key, []), out.get(key)!);
    for (const cell of c.slice(4)) {
      const m = /^\s*UNIT_(\S+) (\d+) (\d+)/.exec(cell);
      if (m) list.push(`${k}|${m[1]} ${m[2]} ${m[3]}`);
    }
  }
  // the last two lines are the Free Cities' and the barbarians'
  for (const [key, list] of out) {
    const n = index.get(key)!;
    out.set(key, list.map((x) => {
      const k = Number(x.slice(0, x.indexOf('|')));
      return `${k === n - 1 ? 63 : k === n - 2 ? 62 : k}${x.slice(x.indexOf('|'))}`;
    }));
  }
  return out;
}

/** the game's logs of the AI's memory beside a dump */
export class MemoryLogs {
  readonly army: Map<string, string[]>;
  /** `${turn}:${player}` -> the camps' plots (x:y), in their order */
  readonly camps = new Map<string, string[]>();
  /** player -> [turn, its open contracts (`item|tree`, sorted)] at each turn
   *  a CONTRACT line changed them, ascending */
  private readonly contracts = new Map<number, [number, string[]][]>();
  /** `${turn}:${player}` -> the operations alive at the turn's end (sorted) */
  private readonly ops = new Map<string, string[]>();
  /** whether the recording kept each kind's log: a kind without one is not
   *  compared */
  readonly logged: Record<MemoryKind, boolean>;
  /** per player, our contracts some CONTRACT line has named, by id, while
   *  its last line printed it open — held after the contract leaves the book
   *  (a tree's release, the weak handles' silent drop), as the log's fold
   *  keeps it */
  readonly shownOpen = new Map<number, Map<number, AiContract>>();
  /** `${turn}:${player}` -> the contracts a city queued that turn
   *  (`item|tree`, AI_CityBuild.csv's queue lines) */
  readonly queued = new Map<string, string[]>();

  constructor(dumpPath: string) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.army = loadArmyLog(dumpPath);
    const knowledge = lines(`${logs}AI_Knowledge.csv`);
    for (const line of knowledge) {
      const c = line.split(',').map((x) => x.trim());
      if (c[2] !== 'CAMP') continue;
      const k = `${c[0]}:${c[1]}`;
      (this.camps.get(k) ?? (this.camps.set(k, []), this.camps.get(k)!)).push(c[3]);
    }
    const open = new Map<number, Map<string, string>>();
    const build = lines(`${logs}AI_CityBuild.csv`);
    for (const line of build) {
      const c = line.split(',').map((x) => x.trim());
      // the queue line: "turn, player, city, , , item, tree, CONTRACT id"
      if (c[4] === '' && c[7]?.startsWith('CONTRACT ')) {
        const k = `${c[0]}:${c[1]}`;
        (this.queued.get(k) ?? (this.queued.set(k, []), this.queued.get(k)!)).push(`${c[5]}|${c[6]}`);
        continue;
      }
      if (!c[4]?.startsWith('CONTRACT ') || c.length < 11) continue;
      const [turn, player] = [Number(c[0]), Number(c[1])];
      const book = open.get(player) ?? (open.set(player, new Map()), open.get(player)!);
      const item = [c[6], c[7], c[8]].find((x) => !x.startsWith('NO_')) ?? '';
      if (c[5] === 'SUBMITTED' || c[5] === 'ACCEPTED' || c[5] === 'IN PROGRESS') book.set(c[4], `${item}|${c[10]}`);
      else book.delete(c[4]);
      const hist = this.contracts.get(player) ?? (this.contracts.set(player, []), this.contracts.get(player)!);
      const snap = [...book.values()].sort();
      if (hist.length && hist[hist.length - 1][0] === turn) hist[hist.length - 1][1] = snap;
      else hist.push([turn, snap]);
    }
    const alive = new Map<string, Map<string, number>>();
    const opLines = lines(`${logs}AI_Operation.csv`);
    for (const line of opLines) {
      const m = /^(\d+), (\d+), (.*)$/.exec(line);
      if (!m) continue;
      const k = `${m[1]}:${m[2]}`;
      const head = m[3].slice(0, m[3].indexOf(',') < 0 ? m[3].length : m[3].indexOf(','));
      const note = m[3].slice(head.length + 1).trim();
      const name = head.replace(/ running$/, '');
      const step = head.endsWith(' running') || note === 'Started' ? 1 : note === 'Operation complete' ? -1 : 0;
      if (!step) continue;
      const a = alive.get(k) ?? (alive.set(k, new Map()), alive.get(k)!);
      a.set(name, (a.get(name) ?? 0) + step);
    }
    for (const [k, a] of alive) this.ops.set(k, [...a].flatMap(([n, c]) => Array<string>(Math.max(0, c)).fill(n)).sort());
    this.logged = { 'knowledge.army': this.army.size > 0, 'knowledge.camps': knowledge.length > 0, 'cityAi.contracts': build.length > 0,
      'ops': opLines.length > 0 };
  }

  /** the open contracts the log shows for the player at the turn's end */
  contractsAt(turn: number, player: number): string[] {
    let out: string[] = [];
    for (const [t, snap] of this.contracts.get(player) ?? []) {
      if (t > turn) break;
      out = snap;
    }
    return out;
  }

  opsAt(turn: number, player: number): string[] {
    return this.ops.get(`${turn}:${player}`) ?? [];
  }
}

/** one memory kind's comparison of a player at a turn: ours, the log's */
export interface MemoryRead {
  kind: MemoryKind;
  equal: boolean;
  ours: string;
  game: string;
}

/** a knowledge base's army records as its tactical turn's ageing and look
 *  left them (`traceKnowledge`), with that turn */
export interface ArmyLogged {
  turn: number;
  records: readonly ArmyRecord[];
}

/**
 * A player's memory at the end of its turn `turn` against the logs:
 * `playerOf` names a seat's player as the logs do, `W` the map's width. Its
 * army records are `army`, the knowledge base as the game writes its ARMY
 * lines (after the tactical turn's ageing and look, before the turn's end
 * look), each record's age the ageings since it was last seen.
 */
export function readMemory(logs: MemoryLogs, seat: Seat, player: number, turn: number, W: number,
  playerOf: (seat: number) => number, army: ArmyLogged | undefined): MemoryRead[] {
  const out: MemoryRead[] = [];
  const add = (kind: MemoryKind, ours: string[], game: string[]) => {
    if (!logs.logged[kind]) return;
    const [a, b] = [ours.join(', '), game.join(', ')];
    out.push({ kind, equal: a === b, ours: a || 'none', game: b || 'none' });
  };
  const by = new Map<string, { n: number; age: number }>();
  for (const r of army?.records ?? []) {
    const k = `${playerOf(r.owner)}|${gameTypeOf('unit', r.type, 'UNIT_').slice(5)}`;
    const e = by.get(k) ?? (by.set(k, { n: 0, age: 0 }), by.get(k)!);
    e.n += 1;
    e.age = Math.max(e.age, army!.turn - r.seen);
  }
  // the log's army records hold no Settler
  add('knowledge.army', [...by].map(([k, e]) => `${k} ${e.n} ${e.age}`).filter((x) => !x.includes('|SETTLER ')).sort(),
    (logs.army.get(`${turn}:${player}`) ?? []).filter((x) => !x.includes('|SETTLER ')).sort());
  add('knowledge.camps', (seat.campsKnown ?? []).map((p) => `${p % W}:${Math.floor(p / W)}`), logs.camps.get(`${turn}:${player}`) ?? []);
  if (seat.cityAi) {
    // as the log can show them: the progress its last CONTRACT line printed
    const shown = logs.shownOpen.get(player) ?? (logs.shownOpen.set(player, new Map()), logs.shownOpen.get(player)!);
    for (const c of seat.cityAi.contracts) if (c.shown !== undefined) shown.set(c.id, c);
    for (const [id, c] of shown) {
      if (c.shown !== CP_SUBMITTED && c.shown !== CP_ACCEPTED && c.shown !== CP_IN_PROGRESS) shown.delete(id);
    }
    add('cityAi.contracts', [...shown.values()].map((c) => `${c.unit ?? c.building ?? c.district ?? ''}|${c.treeName}`).sort(),
      logs.contractsAt(turn, player));
  }
  add('ops', seat.ops ? opsOf(seat.ops).map((o) => o.def).sort() : [], logs.opsAt(turn, player));
  return out;
}
