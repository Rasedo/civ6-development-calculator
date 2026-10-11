/**
 * THE MAJORS' STRATEGIES BESIDE THE ACTION REPLAY: each major's victory
 * manager (ai/major/strategies.ts) run at each pair's start, the AI turn the
 * game logs it at, on the replayed engine, and scored against the game's own
 * log of that game: AI_Victories.csv (every strategy changed, turn by turn)
 * and AI_Knowledge.csv (the knowledge base's statistics and city entries).
 * It reads; the strategies the engine's lane keeps are what the majors'
 * other probes read (`followedBefore`), so no strategy is fed from the logs.
 * A second lane runs the same on record t as the importer reads it (the
 * victory manager alone, free of the engine's drift).
 *
 * And the majors' meeting (the engine's `meetMajors`): each pair's meeting
 * turn in the engine against the first record that names the other in the
 * player's `met`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { militaryStrengths, newStrategyMemory, strategyTurn, type StrategyChange, type StrategyGaps, type StrategyMemory } from '../../ai/major/strategies';
import { knowledgeStats } from '../../ai/major/knowledge';
import { majorView } from '../core/majorView';
import { civEraIndex } from '../core/city';
import type { MajorView } from '../../ai/major/view';
import { isCiv, metTurnWith, seatOf } from '../core/seats';
import type { GameState } from '../core/types';
import { num, type Catalog, type TurnRecord } from './record';
import { UNITS, UNIT_HP } from '../data/units';

/** STRAT_TRACE=<StrategyType,...> prints each evaluation of those to stderr */
const TRACE = new Set((process.env.STRAT_TRACE ?? '').split(',').filter(Boolean));

/** the log's changes by `${turn}:${player}`, in the log's order */
function readVictories(path: string): Map<string, StrategyChange[]> {
  const out = new Map<string, StrategyChange[]>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4) continue;
    const k = `${c[0]}:${c[1]}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ strategy: c[2], status: c[3] as StrategyChange['status'] });
  }
  return out;
}

interface KnowledgeTurn {
  mean: number[];
  sd: number[];
  cities: string[];
}

/** AI_Knowledge.csv's statistics and city entries by `${turn}:${player}` */
function readKnowledge(path: string): Map<string, KnowledgeTurn> {
  const out = new Map<string, KnowledgeTurn>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4) continue;
    const k = `${c[0]}:${c[1]}`;
    if (c[2] === 'START LOG') {
      const mean: number[] = [];
      const sd: number[] = [];
      for (const cell of c.slice(4)) {
        const m = /^YIELD_\w+ (-?[\d.]+) \+\/- (-?[\d.]+)$/.exec(cell);
        if (m) {
          mean.push(Number(m[1]));
          sd.push(Number(m[2]));
        }
      }
      out.set(k, { mean, sd, cities: [] });
    } else if (c[2] === 'CITY') out.get(k)?.cities.push(c[3]);
  }
  return out;
}

export interface StrategyTally {
  /** the log's change lines and ours, equal (strategy and status), and the
   *  per player counts */
  logLines: number;
  ourLines: number;
  equal: number;
  byPlayer: Record<string, [number, number, number]>;
  /** per strategy: the log's lines, ours, equal */
  byStrategy: Record<string, [number, number, number]>;
  firstMiss?: string;
  misses: string[];
  /** the knowledge base: turns compared, statistics equal (every yield's
   *  mean and deviation to the log's two decimals), entries' plots equal */
  kbTurns: number;
  kbStatsEqual: number;
  kbCitiesEqual: number;
  firstKbMiss?: string;
  gaps: Record<string, number>;
}

export interface ContactTally {
  /** major pairs, met in the records, met in the engine, at the record's turn */
  pairs: number;
  recordMet: number;
  engineMet: number;
  sameTurn: number;
  lines: string[];
}

const newTally = (): StrategyTally => ({ logLines: 0, ourLines: 0, equal: 0, byPlayer: {}, byStrategy: {}, misses: [], kbTurns: 0,
  kbStatsEqual: 0, kbCitiesEqual: 0, gaps: {} });

class Lane {
  readonly mem: StrategyMemory = newStrategyMemory();
  readonly gaps: StrategyGaps = new Map();
  readonly tally = newTally();
  /** the strengths each pair's start read, by its turn */
  readonly strengths = new Map<number, ReadonlyMap<number, number>>();
}

export class StrategyProbe {
  private readonly log: Map<string, StrategyChange[]>;
  private readonly kb: Map<string, KnowledgeTurn>;
  private readonly lanes = { engine: new Lane(), record: new Lane() };
  private readonly before = new Map<number, Map<number, ReadonlySet<string>>>();
  private readonly recordMet = new Map<string, number>();

  get tally(): { engine: StrategyTally; record: StrategyTally } {
    return { engine: this.lanes.engine.tally, record: this.lanes.record.tally };
  }

  /** `players`: every major, seat -> the record's player id; `agendas`: the
   *  diplomacy AI's agendas of a seat */
  constructor(dumpPath: string, private readonly players: ReadonlyMap<number, number>,
              private readonly agendas: (seat: number) => readonly string[]) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.log = readVictories(`${logs}AI_Victories.csv`);
    this.kb = readKnowledge(`${logs}AI_Knowledge.csv`);
  }

  get active(): boolean {
    return this.log.size > 0;
  }

  /** the strategies each major followed as its AI turn `turn` opened (its
   *  scores read them; the update follows) */
  followedBefore(turn: number): ReadonlyMap<number, ReadonlySet<string>> {
    return this.before.get(turn) ?? new Map();
  }

  /**
   * The pair's start (record t), each major's AI turn t as its turn opens
   * (the victory manager's update at the player's activation): on the
   * engine's state and on record t's. Record t is taken at the first
   * player's activation; a later player's own turn start (its research and
   * civics completed before its activation, `starts`: engine ids by seat)
   * lands before its AI turn (runs/h1_duelw1124: China's Civil Service,
   * completed before its activation at t69, moves its Medieval strategy at
   * t69; its Celestial Navigation, completed after it at t31, at t32). The
   * rank conditions read the strengths PlayerStats stored as the turn
   * before's players started, before their production (Rome's Scout, in
   * record 5, first moves China's Lags Military at t6).
   */
  preTurn(state: GameState, record: GameState, starts: ReadonlyMap<number, { techs: readonly string[]; civics: readonly string[] }>,
          recordStrengths: ReadonlyMap<number, number>): void {
    for (const s of record.seats) s.handicap = state.seats[s.seat]?.handicap ?? s.handicap;
    const turn = state.turn;
    const snap = new Map<number, ReadonlySet<string>>();
    for (const seat of this.players.keys()) snap.set(seat, new Set(this.lanes.engine.mem.seats.get(seat)?.active ?? []));
    this.before.set(turn, snap);
    this.lane(this.lanes.engine, state, turn, majorView(state), null);
    const era = (i: number) => {
      const r = record.seats[i]?.research;
      const add = starts.get(i);
      return r ? civEraIndex([...r.techs, ...(add?.techs ?? [])], [...r.civics, ...(add?.civics ?? [])]) : 0;
    };
    this.lane(this.lanes.record, record, turn, majorView(record, { playerEra: era }), recordStrengths);
  }

  /** `stored`: the strengths PlayerStats holds as each player's turn t
   *  starts where the caller knows them (record t's), else the engine's of
   *  the pair. A player reads each other's as its last turn start before its
   *  own activation left them: this turn's for the players before it in the
   *  turn's order and itself, the turn before's for the players after it
   *  (runs/h1_duelw1124: Rome, first to move, reads China's of t-1) */
  private lane(lane: Lane, state: GameState, turn: number, view: MajorView, stored: ReadonlyMap<number, number> | null): void {
    const now = stored ?? militaryStrengths(view);
    const before = lane.strengths.get(turn - 1) ?? new Map<number, number>();
    lane.strengths.set(turn, now);
    const t = lane.tally;
    const mem = lane.mem;
    for (const [seat, player] of this.players) {
      if (!seatOf(state, seat) || !view.majors().includes(seat)) continue;
      mem.military = new Map([...this.players].map(([o, q]) => [o, (q <= player ? now.get(o) : before.get(o)) ?? 0] as const));
      const ours = strategyTurn(view, mem, seat, this.agendas(seat), turn, lane.gaps, TRACE.size ? (st, said, n, need) => {
        if (TRACE.has(st)) console.error(`${lane === this.lanes.engine ? 'E' : 'R'} t${turn} p${player} ${st}: ${said.map((x) => (x ? 1 : 0)).join('')} ${n}/${need}`
          + ` mil ${view.majors().map((o) => `${mem.military.get(o) ?? 0}/${view.militaryStrength(o)}`).join(',')} techs ${view.majors().map((o) => view.techCount(o)).join(',')}`);
      } : undefined);
      const logged = this.log.get(`${turn}:${player}`) ?? [];
      const row = (t.byPlayer[String(player)] ??= [0, 0, 0]);
      t.logLines += logged.length;
      t.ourLines += ours.length;
      row[0] += logged.length;
      row[1] += ours.length;
      const left = [...ours];
      for (const l of logged) {
        (t.byStrategy[l.strategy] ??= [0, 0, 0])[0]++;
        const k = left.findIndex((o) => o.strategy === l.strategy && o.status === l.status);
        if (k >= 0) {
          left.splice(k, 1);
          t.equal++;
          row[2]++;
          t.byStrategy[l.strategy][2]++;
        }
      }
      for (const o of ours) (t.byStrategy[o.strategy] ??= [0, 0, 0])[1]++;
      if (left.length || ours.length - left.length !== logged.length) {
        const miss = `t${turn} p${player}: ours [${ours.map((o) => `${o.strategy}=${o.status}`).join(' ')}] log [${logged.map((o) => `${o.strategy}=${o.status}`).join(' ')}]`;
        t.firstMiss ??= miss;
        if (t.misses.length < 60) t.misses.push(miss);
      }
      // the knowledge base's statistics, as the log prints them at the turn
      const kt = this.kb.get(`${turn}:${player}`);
      const kb = mem.seats.get(seat)?.knowledge;
      if (kt && kb) {
        t.kbTurns++;
        const s = knowledgeStats(kb);
        const r2 = (x: number) => Math.round(x * 100) / 100;
        const statsOk = kt.mean.every((m, k) => Math.abs(r2(s.mean[k]) - m) < 0.006 && Math.abs(r2(s.sd[k]) - kt.sd[k]) < 0.006);
        if (statsOk) t.kbStatsEqual++;
        const plots = view.plots();
        const ourCities = kb.cities.map((e) => `${plots[e.plot].x}:${plots[e.plot].y}`).sort().join(' ');
        // the log prints the entries as its turn ends: the turn before's
        // lines are what this turn's start records
        const logCities = [...(this.kb.get(`${turn - 1}:${player}`)?.cities ?? [])].sort().join(' ');
        if (ourCities === logCities) t.kbCitiesEqual++;
        if ((!statsOk || ourCities !== logCities) && !t.firstKbMiss) {
          t.firstKbMiss = `t${turn} p${player}: ours ${s.mean.map((m, k) => `${m.toFixed(2)}+-${s.sd[k].toFixed(2)}`).join(',')} [${ourCities}]`
            + ` log ${kt.mean.map((m, k) => `${m}+-${kt.sd[k]}`).join(',')} [${logCities}]`;
        }
      }
    }
    t.gaps = Object.fromEntries(lane.gaps);
  }

  /** the first record turn each pair of majors stands met */
  recordContacts(b: TurnRecord, seatOfPlayer: ReadonlyMap<number, number>): void {
    for (const p of b.players) {
      const a = seatOfPlayer.get(p.id);
      if (a === undefined || !isCiv(a)) continue;
      for (const q of p.met ?? []) {
        const o = seatOfPlayer.get(num(q));
        if (o === undefined || !isCiv(o) || o === a) continue;
        const k = a < o ? `${a},${o}` : `${o},${a}`;
        if (!this.recordMet.has(k)) this.recordMet.set(k, b.turn);
      }
    }
  }

  /** the meetings, the records' against the engine's */
  contacts(state: GameState): ContactTally {
    const majors = state.seats.filter((s) => isCiv(s.seat)).map((s) => s.seat);
    const out: ContactTally = { pairs: 0, recordMet: 0, engineMet: 0, sameTurn: 0, lines: [] };
    for (const a of majors) {
      for (const b of majors) {
        if (b <= a) continue;
        out.pairs++;
        const rec = this.recordMet.get(`${a},${b}`) ?? null;
        const eng = metTurnWith(state, a, b);
        if (rec !== null) out.recordMet++;
        if (eng !== null) out.engineMet++;
        // record t+1 shows a meeting the engine makes in turn t
        if (rec !== null && eng !== null && rec === eng + 1) out.sameTurn++;
        out.lines.push(`seats ${a}-${b}: the records from t${rec ?? '-'}, the engine at t${eng ?? '-'}`);
      }
    }
    return out;
  }
}

function laneMarkdown(name: string, t: StrategyTally): string[] {
  const out = ['', `### ${name}`, '',
    `- AI_Victories.csv lines ${t.logLines}, ours ${t.ourLines}, equal ${t.equal}; per player ${Object.entries(t.byPlayer)
      .map(([p, [l, o, e]]) => `p${p} ${e} / ${l} (ours ${o})`).join(', ')}; first miss: ${t.firstMiss ?? '-'}.`,
    `- AI_Knowledge.csv: turns ${t.kbTurns}, statistics equal ${t.kbStatsEqual}, city entries equal ${t.kbCitiesEqual}; first miss: ${t.firstKbMiss ?? '-'}.`,
    `- Conditions read as false (unread), evaluations: ${JSON.stringify(t.gaps)}.`,
    '', '| strategy | log | ours | equal |', '|---|---:|---:|---:|'];
  for (const [s, [l, o, e]] of Object.entries(t.byStrategy).sort((a, b) => b[1][0] - a[1][0])) out.push(`| ${s} | ${l} | ${o} | ${e} |`);
  out.push('', 'Misses:', '', ...t.misses.map((m) => `- ${m}`));
  return out;
}

/**
 * PlayerStats' military strength as each major's turn t starts, on record t
 * (`militaryStrength`'s rule over the record's units): its turn start's
 * production not yet counted — a unit the record shows added in turn t
 * before the player's activation is left out (runs/h1_duelw1124 t50: Rome's
 * unit of its turn start, out of the 144 the record's units make).
 */
export function recordMilitary(rec: TurnRecord, cat: Catalog, seatOfPlayer: ReadonlyMap<number, number>): Map<number, number> {
  const added = new Set<string>();
  const active = new Set<number>();
  for (const a of (rec as { actions?: unknown[][] }).actions ?? []) {
    if (!Array.isArray(a) || a[1] !== rec.turn) continue;
    if (a[2] === 'PlayerTurnActivated') active.add(Number(a[3]));
    else if (a[2] === 'UnitAddedToMap' && !active.has(Number(a[3]))) added.add(`${a[3]}:${a[4]}`);
  }
  const out = new Map<number, number>();
  for (const p of rec.players) {
    const seat = seatOfPlayer.get(p.id);
    if (seat === undefined || !isCiv(seat)) continue;
    let sum = 0;
    for (const u of rec.units) {
      if (u.owner !== p.id || added.has(`${u.owner}:${u.id}`)) continue;
      const d = UNITS[(cat.units[num(u.type)] ?? '').replace(/^UNIT_/, '')];
      if (!d) continue;
      const str = Math.max(d.combat ?? 0, d.ranged?.strength ?? 0) << 8;
      const left = Math.max(0, UNIT_HP - num(u.damage)) << 8;
      sum += Math.trunc((Math.trunc((str * left) / 256) * 256) / (UNIT_HP << 8));
    }
    const gold = Math.trunc(num(p.gold));
    sum += Math.trunc(Math.trunc((gold * 256) / 6) / 512);
    out.set(seat, sum >> 8);
  }
  return out;
}

/** the tallies as the replay report's section */
export function strategyMarkdown(t: { engine: StrategyTally; record: StrategyTally }, c: ContactTally | undefined): string[] {
  const out = ['', '## The majors\' AI: strategies (ai/major/strategies.ts)',
    ...laneMarkdown('On the replayed engine\'s state', t.engine), ...laneMarkdown('On record t\'s state', t.record)];
  if (c) {
    out.push('', '## The majors\' meeting (engine `meetMajors`)', '',
      `- Major pairs ${c.pairs}: met in the records ${c.recordMet}, in the engine ${c.engineMet}, the engine's turn the one before the record's ${c.sameTurn}.`,
      ...c.lines.map((l) => `- ${l}`));
  }
  return out;
}
