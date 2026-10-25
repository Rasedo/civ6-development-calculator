/**
 * THE OPERATIONS BESIDE THE ACTION REPLAY: each city-state's, the Free
 * Cities' and the barbarians' operations as the engine's own turn runs them
 * (their lines handed in by the replay), scored against the game's own
 * AI_Operation.csv and AI_Operation_Eval.csv of that game, line by line, and
 * against record t+1 for the plots its operation units end their turn on.
 * It reads; the record's moves still land.
 *
 * Measured per operation family (each operation name the port starts, and
 * every operation's lines together): per turn and AI party, every line the
 * game logged for it against ours (the same text after the turn and the
 * player), by kind (Started, running TARGET, the team's Ready line, the
 * recruit lines, Operation Move, Operation Change Target, the attacks, the
 * protection, Operation complete, the rest), equal where the turn's lines of
 * that kind are the same in the same order; the turns whose lines are all
 * equal; the family's units' plots after the moves against record t+1. And
 * the manager's candidate lines against no enemy (AI_Operation_Eval.csv,
 * enemy -1), per turn, the turns all equal.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { TurnRecord } from './record';

/** the families measured: the operations the minors start, then all */
const FAMILIES = ['Naval Superiority', 'Attack Barb Camp', 'City Defense', 'Attack Enemy City', 'Attack Walled City',
  'Barbarian Attack', 'Barbarian City Assault', 'Free Cities Raid', 'all'] as const;
const TRACE = (process.env.REPLAY_TRACE ?? '').split(',').includes('operations');

/** a line's operation name */
const opName = (line: string): string => line.slice(0, line.indexOf(',')).replace(/ running$/, '');

/** a line's kind */
function kindOf(line: string): string {
  const head = line.slice(0, line.indexOf(','));
  const note = line.slice(line.indexOf(',') + 1).trim();
  if (head.endsWith(' running')) return 'running';
  if (note === 'Started') return 'started';
  if (note === 'Operation complete') return 'complete';
  if (note.startsWith(',')) return 'team';
  if (note.startsWith('Operation Move')) return 'move';
  if (note.startsWith('Operation Change Target')) return 'changeTarget';
  if (note.startsWith('Operation Recruit') || note.startsWith('No recruits') || note.startsWith('Recruiting')) return 'recruit';
  if (note.startsWith('Op Attack Units') || note.startsWith('Operation Attack Units')) return 'attack';
  if (note.startsWith('Attack Target')) return 'attackTarget';
  if (note.startsWith('Operation City Attack')) return 'cityAttack';
  if (note.startsWith('Operation Siege City')) return 'siege';
  if (note.startsWith('Operation Pillage City')) return 'pillage';
  if (note.startsWith('Operation Air Attack')) return 'air';
  if (note.startsWith('Operation Protect Units')) return 'protect';
  return 'other';
}

const KINDS = ['started', 'running', 'team', 'recruit', 'move', 'changeTarget', 'attack', 'attackTarget', 'cityAttack', 'siege',
  'pillage', 'air', 'protect', 'complete', 'other'] as const;

const norm = (s: string): string => s.replace(/\s+$/, '');

/** a csv's lines by `${turn}:${player}`, each without its turn and player */
function readLog(path: string, keep: (rest: string) => boolean): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const line = raw.replace(/\r$/, '');
    const m = /^(\d+), (\d+), (.*)$/.exec(line);
    if (!m || !keep(m[3])) continue;
    const k = `${m[1]}:${m[2]}`;
    (out.get(k) ?? out.set(k, []).get(k)!).push(norm(m[3]));
  }
  return out;
}

interface FamilyTally {
  turns: number;
  turnsEqual: number;
  /** per kind: the log's lines, ours, the turns the kind's lines were equal
   *  in, the turns either side had one */
  kinds: Record<string, { log: number; ours: number; turnsEqual: number; turns: number }>;
  /** the family's units after its moves: compared with record t+1, at the
   *  record's plot */
  plots: number;
  plotsEqual: number;
  firstMiss?: string;
  misses: string[];
}

export interface OperationsTally {
  families: Record<string, FamilyTally>;
  /** the candidate lines against no enemy: turns, turns all equal, the
   *  log's lines and ours, the log's lines against an enemy (not run) */
  evals: EvalTally;
  /** the candidate lines against an enemy (the war candidates) */
  warEvals: EvalTally;
}

interface EvalTally {
  turns: number; turnsEqual: number; log: number; ours: number; logEnemy: number; firstMiss?: string; misses: string[];
  /** per player>enemy, the first turn of a candidate against it: the log's, ours */
  first: Record<string, [number | null, number | null]>;
}

const newFamily = (): FamilyTally => ({ turns: 0, turnsEqual: 0, kinds: Object.fromEntries(KINDS.map((k) => [k, { log: 0, ours: 0, turnsEqual: 0, turns: 0 }])),
  plots: 0, plotsEqual: 0, misses: [] });
const newEvals = (): EvalTally => ({ turns: 0, turnsEqual: 0, log: 0, ours: 0, logEnemy: 0, misses: [], first: {} });
const newTally = (): OperationsTally => ({ families: Object.fromEntries(FAMILIES.map((f) => [f, newFamily()])),
  evals: newEvals(), warEvals: newEvals() });

const inFamily = (family: string, line: string): boolean => family === 'all' || opName(line) === family;


export class OperationsProbe {
  private readonly log: Map<string, string[]>;
  private readonly evalLog: Map<string, string[]>;
  readonly tally = newTally();
  /** each player-turn with an operation started, the log's Started lines
   *  beside ours */
  onStarts: ((turn: number, player: number, log: readonly string[], ours: readonly string[]) => void) | null = null;

  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly seatOfPlayer: ReadonlyMap<number, number>) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.log = readLog(`${logs}AI_Operation.csv`, () => true);
    this.evalLog = readLog(`${logs}AI_Operation_Eval.csv`, (r) => !/^-?\d+, (CITY VALUES|MINOR CIV LEVY),/.test(r));
  }

  get active(): boolean {
    return this.log.size > 0 && this.seats.size > 0;
  }

  /** a city-state's operations' turn as the engine ran it: its lines, its
   *  candidate lines */
  minorTurn(turn: number, player: number, lines: readonly string[], evals: readonly string[]): void {
    if (!this.active) return;
    const ours = lines.map(norm);
    if (TRACE) {
      const logs = this.log.get(`${turn}:${player}`) ?? [];
      if (logs.length || ours.length) console.error(`== t${turn} p${player}`);
      for (let i = 0; i < Math.max(logs.length, ours.length); i++) {
        const mark = logs[i] === ours[i] ? '  ' : '!!';
        console.error(`${mark} log  ${logs[i] ?? '-'}\n${mark} ours ${ours[i] ?? '-'}`);
      }
      const ev = (this.evalLog.get(`${turn}:${player}`) ?? []).join(' | ');
      if (ev || evals.length) console.error(`   eval log  ${ev}\n   eval ours ${evals.join(' | ')}`);
    }
    this.score(turn, player, ours, evals);
  }

  /** a city-state's operation unit's plot after its units' turn, against
   *  record t+1 (`b`) now */
  minorEnd(b: TurnRecord, def: string, player: number, turn: number, key: string, plot: number, type: string): void {
    const r = b.units.find((u) => `${u.owner}:${u.id}` === key);
    if (!r) return;
    const at = r.y * b.head.W + r.x;
    for (const family of FAMILIES) {
      if (family !== 'all' && family !== def) continue;
      const t = this.tally.families[family];
      t.plots++;
      if (at === plot) t.plotsEqual++;
      else if (family !== 'all' && t.misses.length < 30) t.misses.push(`t${turn} p${player} ${type} ${key}: ours plot ${plot}, record t+1 ${at}`);
    }
  }

  /** a turn's lines and candidate lines against the logs */
  private score(turn: number, player: number, ours: string[], evals: readonly string[]): void {
    this.compare(turn, player, ours);
    // the eval lines name the enemy by the game's player id
    const playerOf = new Map([...this.seatOfPlayer].map(([p, s]) => [s, p]));
    const named = evals.map((l) => l.replace(/^(-?\d+), /, (_m, s: string) => `${Number(s) < 0 ? s : playerOf.get(Number(s)) ?? s}, `));
    this.compareEvals(this.tally.evals, turn, player, named, true);
    this.compareEvals(this.tally.warEvals, turn, player, named, false);
  }

  private compare(turn: number, player: number, ours: string[]): void {
    const all = this.log.get(`${turn}:${player}`) ?? [];
    const started = (ls: readonly string[]) => ls.filter((l) => kindOf(l) === 'started');
    const [logStarts, ourStarts] = [started(all), started(ours)];
    if (logStarts.length || ourStarts.length) this.onStarts?.(turn, player, logStarts, ourStarts);
    for (const family of FAMILIES) {
      const t = this.tally.families[family];
      const logs = all.filter((l) => inFamily(family, l));
      const mine = ours.filter((l) => inFamily(family, l));
      if (!logs.length && !mine.length) continue;
      t.turns++;
      const whole = logs.length === mine.length && logs.every((l, i) => l === mine[i]);
      if (whole) t.turnsEqual++;
      else if (t.misses.length < 30) {
        const i = logs.findIndex((l, k) => l !== mine[k]);
        const at = i < 0 ? logs.length : i;
        const m = `t${turn} p${player}: line ${at}: log "${logs[at] ?? '-'}" ours "${mine[at] ?? '-'}"`;
        t.firstMiss ??= m;
        t.misses.push(m);
      }
      for (const k of KINDS) {
        const a = logs.filter((l) => kindOf(l) === k);
        const b = mine.filter((l) => kindOf(l) === k);
        const s = t.kinds[k];
        s.log += a.length;
        s.ours += b.length;
        if (a.length || b.length) {
          s.turns++;
          if (a.length === b.length && a.every((l, i) => l === b[i])) s.turnsEqual++;
        }
      }
    }
  }

  private compareEvals(e: EvalTally, turn: number, player: number, mine: string[], noEnemy: boolean): void {
    const all = this.evalLog.get(`${turn}:${player}`) ?? [];
    const pick = (l: string) => l.startsWith('-1,') === noEnemy;
    const logs = all.filter(pick);
    const ours = mine.filter(pick);
    e.logEnemy += all.length - logs.length;
    if (!noEnemy) {
      const enemy = (l: string) => `${player}>${l.split(',')[0]}`;
      for (const l of logs) (e.first[enemy(l)] ??= [null, null])[0] ??= turn;
      for (const l of ours) (e.first[enemy(l)] ??= [null, null])[1] ??= turn;
    }
    if (!logs.length && !ours.length) return;
    e.turns++;
    e.log += logs.length;
    e.ours += ours.length;
    if (logs.length === ours.length && logs.every((l, i) => l === ours[i])) e.turnsEqual++;
    else if (e.misses.length < 30) {
      const i = logs.findIndex((l, k) => l !== ours[k]);
      const at = i < 0 ? logs.length : i;
      const m = `t${turn} p${player}: line ${at}: log "${logs[at] ?? '-'}" ours "${ours[at] ?? '-'}"`;
      e.firstMiss ??= m;
      e.misses.push(m);
    }
  }
}

export function operationsMarkdown(t: OperationsTally): string[] {
  const out = ['', "## The AI's operations (cpu/core/operations)", ''];
  const e = t.evals;
  out.push(`Candidates against no enemy (AI_Operation_Eval.csv, enemy -1): turns ${e.turns}, every line equal ${e.turnsEqual}; lines log ${e.log}, ours ${e.ours}; first miss: ${e.firstMiss ?? '-'}.`);
  const w = t.warEvals;
  out.push('', `Candidates against an enemy (the war candidates): turns ${w.turns}, every line equal ${w.turnsEqual}; lines log ${w.log}, ours ${w.ours}; first miss: ${w.firstMiss ?? '-'}.`);
  out.push('', `First war candidate per player>enemy (log / ours): ${Object.entries(w.first).map(([k, [a, b]]) => `${k} t${a ?? '-'} / t${b ?? '-'}`).join('; ') || '-'}.`);
  for (const family of FAMILIES) {
    const f = t.families[family];
    out.push('', `### ${family === 'all' ? 'Every operation' : `"${family}"`}`, '',
      `Turns (player-turns): ${f.turns}, every line equal ${f.turnsEqual}; units after the moves at record t+1's plot ${f.plotsEqual} / ${f.plots}; first miss: ${f.firstMiss ?? '-'}.`,
      '', '| lines | log | ours | turns equal |', '|---|---|---|---|',
      ...KINDS.map((k) => {
        const s = f.kinds[k];
        return `| ${k} | ${s.log} | ${s.ours} | ${s.turnsEqual} / ${s.turns} |`;
      }));
    if (family !== 'all') out.push('', 'Misses:', '', ...f.misses.map((m) => `- ${m}`));
  }
  out.push('', 'Candidate misses:', '', ...e.misses.map((m) => `- ${m}`));
  out.push('', 'War candidate misses:', '', ...t.warEvals.misses.map((m) => `- ${m}`));
  return out;
}
