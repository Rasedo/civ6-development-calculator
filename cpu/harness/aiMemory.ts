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
 * A recording with the game's own AI memory beside it (`<stem>.aimem.jsonl`,
 * `GameMemory`) is compared against that instead (`readGameMemory`): the
 * army records with their plots and ages, the camps, every contract, the
 * operations' targets, members and strengths.
 *
 * A player's memory is CLEAN at a turn when every kind compared agrees; the
 * next turn's decisions read it (`replay.ts`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { CP_ACCEPTED, CP_CLAIMED, CP_IN_PROGRESS, CP_NAMES, CP_SUBMITTED, type AiContract } from '../core/aiContracts';
import type { CityAi } from '../core/aiCityTrees';
import { opsOf } from '../core/operations/manager';
import type { ArmyRecord, Seat } from '../core/types';
import { gameTypeOf } from '../data/aliases';
import { CIVICS } from '../data/civics';

export const MEMORY_KINDS = ['knowledge.army', 'knowledge.camps', 'cityAi.contracts', 'contracts', 'contracts.progress', 'ops',
  'ops.targets', 'ops.members', 'ops.strength'] as const;
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
  readonly logged: Partial<Record<MemoryKind, boolean>>;
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

/** one contract as the game's Control Manager holds it (aimem.py) */
export interface GameContract {
  kind: string;
  status: number;
  id: number;
  owner: number;
  value: number;
  unit?: number;
  building?: number;
  district?: number;
  goal?: number;
  plot?: [number, number];
}

/** one operation as the game's military AI holds it (aimem.py) */
export interface GameOperation {
  name: string | null;
  enemy: number;
  targetX: number;
  targetY: number;
  opStrength: number;
  targetStrength: number;
  /** per team its members: [unit id, type index, experience, level, promotion ready] */
  teams: [number, number | null, number | null, number | null, number | null][][];
}

/** one read of the game's AI memory (`<stem>.aimem.jsonl`, aimem.py) */
export interface GameMemoryRead {
  site: 'start' | 'tactical' | 'log' | 'endlook';
  turn: number;
  player: number;
  /** per owner per unit type index the records [id, +4, +8, age, x, y, +0x18, +0x1c] */
  army?: Record<string, Record<string, number[][]>>;
  camps?: number[][];
  contracts?: GameContract[];
  trees?: Record<string, { name: string | null }>;
  ops?: GameOperation[];
}

/**
 * THE GAME'S OWN AI MEMORY beside a recording (`<stem>.aimem.jsonl`,
 * tools/civ6lab/aimem.py): each player's reads by site and turn — the
 * tactical step, the knowledge base's log (AI_Knowledge.csv's moment), the
 * end look (the player's AI turn over; a second end look of the same turn
 * replaces the first).
 */
export class GameMemory {
  private readonly reads = new Map<string, GameMemoryRead>();

  constructor(path: string) {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      if (!line) continue;
      const r = JSON.parse(line) as GameMemoryRead;
      if (r.turn !== undefined) this.reads.set(`${r.site}:${r.turn}:${r.player}`, r);
    }
  }

  static of(dumpPath: string): GameMemory | undefined {
    const path = dumpPath.replace(/\.jsonl$/, '.aimem.jsonl');
    return existsSync(path) ? new GameMemory(path) : undefined;
  }

  at(site: GameMemoryRead['site'], turn: number, player: number): GameMemoryRead | undefined {
    return this.reads.get(`${site}:${turn}:${player}`);
  }
}

/** the catalog's names a read's indices take */
export interface MemoryNames {
  units: readonly string[];
  buildings: readonly string[];
  districts: readonly string[];
  techs: readonly string[];
  civics: readonly string[];
}

const OPEN = new Set([CP_CLAIMED, CP_SUBMITTED, CP_ACCEPTED, CP_IN_PROGRESS]);
const xy = (plot: number, W: number) => (plot < 0 ? '-9999:-9999' : `${plot % W}:${Math.floor(plot / W)}`);

/** a contract's item as both sides name it: build UNIT_x / BUILDING_x /
 *  DISTRICT_x, tech TECH_x, civic CIVIC_x, plot x:y */
function gameItem(c: GameContract, n: MemoryNames): string {
  if (c.kind === 'build') {
    if ((c.unit ?? -1) >= 0) return n.units[c.unit!] ?? `unit${c.unit}`;
    if ((c.building ?? -1) >= 0) return n.buildings[c.building!] ?? `building${c.building}`;
    if ((c.district ?? -1) >= 0) return n.districts[c.district!] ?? `district${c.district}`;
    return 'none';
  }
  if (c.kind === 'tech') return n.techs[c.goal ?? -1] ?? `tech${c.goal}`;
  if (c.kind === 'civic') return n.civics[c.goal ?? -1] ?? `civic${c.goal}`;
  if (c.kind === 'plot') return `${c.plot?.[0]}:${c.plot?.[1]}`;
  return c.kind;
}

/** a contract's item in the game's name: the contracts hold the install's
 *  types (the AI tables' rows), the goals the engine's tech and civic ids */
const typed = (kind: string, id: string, prefix: string) => (id.startsWith(prefix) ? id : gameTypeOf(kind, id, prefix));

function ourItem(c: AiContract, ai: CityAi, W: number): string {
  if (c.unit) return typed('unit', c.unit, 'UNIT_');
  if (c.building) return typed('building', c.building, 'BUILDING_');
  if (c.district) return typed('district', c.district, 'DISTRICT_');
  const goal = ai.techContracts[c.id];
  if (goal !== undefined) return goal in CIVICS ? typed('civic', goal, 'CIVIC_') : typed('tech', goal, 'TECH_');
  const plot = ai.plotContracts[c.id];
  if (plot !== undefined) return xy(plot, W);
  return 'none';
}

/**
 * A player's memory against the game's own (`GameMemory`), each kind at the
 * moment it is read: the knowledge base's army records (owner, type, plot,
 * age) at the log's moment (`army`, our records as the game writes its ARMY
 * lines); the camps, the contracts and the operations at the end look, the
 * player's AI turn over (ours at its turn's end). The contracts: every
 * open one (claimed, submitted, accepted, in progress) of every kind — build,
 * goal tech, goal civic, Purchase Plot — its item and its tree's name, and
 * again with its progress; the operations: by name, with their enemy and
 * target, their members' unit types, their strengths (the teams' and the
 * enemy's about the target).
 */
export function readGameMemory(game: GameMemory, names: MemoryNames, seat: Seat, player: number, turn: number, W: number,
  playerOf: (seat: number) => number, army: ArmyLogged | undefined, unitType: (id: number) => string | undefined): MemoryRead[] {
  const out: MemoryRead[] = [];
  const add = (kind: MemoryKind, ours: string[], g: string[]) => {
    const [a, b] = [ours.sort().join(', '), g.sort().join(', ')];
    out.push({ kind, equal: a === b, ours: a || 'none', game: b || 'none' });
  };
  const log = game.at('log', turn, player);
  const end = game.at('endlook', turn, player);
  if (log?.army && army) {
    const ours = army.records.map((r) => `${playerOf(r.owner)}|${gameTypeOf('unit', r.type, 'UNIT_').slice(5)}|${xy(r.plot, W)}|${army.turn - r.seen}`);
    const g: string[] = [];
    for (const [owner, per] of Object.entries(log.army)) {
      for (const [t, recs] of Object.entries(per)) {
        for (const r of recs) g.push(`${owner}|${(names.units[Number(t)] ?? `unit${t}`).slice(5)}|${r[4]}:${r[5]}|${r[3]}`);
      }
    }
    add('knowledge.army', ours, g);
  }
  if (end?.camps) add('knowledge.camps', (seat.campsKnown ?? []).map((p) => xy(p, W)), end.camps.map((c) => `${c[0]}:${c[1]}`));
  if (end?.contracts) {
    const ai = seat.cityAi;
    const ours = ai ? ai.contracts.filter((c) => OPEN.has(c.progress)) : [];
    const theirs = end.contracts.filter((c) => OPEN.has(c.status));
    const tree = (c: GameContract) => end.trees?.[String(c.owner)]?.name ?? '-';
    add('contracts', ours.map((c) => `${ourItem(c, ai!, W)}|${c.treeName}`), theirs.map((c) => `${gameItem(c, names)}|${tree(c)}`));
    add('contracts.progress', ours.map((c) => `${ourItem(c, ai!, W)}|${c.treeName}|${CP_NAMES[c.progress]}`),
      theirs.map((c) => `${gameItem(c, names)}|${tree(c)}|${CP_NAMES[c.status] ?? c.status}`));
  }
  if (end?.ops) {
    const ops = seat.ops ? opsOf(seat.ops) : [];
    const theirs = end.ops;
    add('ops', ops.map((o) => o.def), theirs.map((o) => o.name ?? '-'));
    add('ops.targets', ops.map((o) => `${o.def}|${o.enemy}|${xy(o.target, W)}`), theirs.map((o) => `${o.name}|${o.enemy}|${o.targetX}:${o.targetY}`));
    add('ops.members', ops.map((o) => `${o.def}|${o.teams.flatMap((t) => t.members.map((id) => unitType(id) ?? '?')).sort().join('+')}`),
      theirs.map((o) => `${o.name}|${o.teams.flatMap((t) => t.map((m) => names.units[m[1] ?? -1] ?? '?')).sort().join('+')}`));
    add('ops.strength', ops.map((o) => `${o.def}|${o.strength}|${o.enemyStrength}`), theirs.map((o) => `${o.name}|${o.opStrength}|${o.targetStrength}`));
  }
  return out;
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
