/**
 * THE OPERATIONS BESIDE THE ACTION REPLAY: each AI major's and each
 * city-state's operations (cpu/core/operations) run on record t as the importer reads it
 * — the AI's own operation state carried from turn to turn, its units'
 * moves carried out on a copy of the state — and scored against the game's
 * own AI_Operation.csv and AI_Operation_Eval.csv of that game, line by line,
 * and against record t+1 for the plots its operation units end their turn
 * on. It reads; the record's moves still land.
 *
 * Measured per operation family (each operation name the port starts, and
 * every operation's lines together): per turn and AI major, every line the
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
import { applySeatUnitOrders } from '../core/phase';
import { majorView, type MajorViewInputs } from '../core/majorView';
import { citiesOf, seatOf } from '../core/seats';
import { computeCityStats } from '../core/city';
import { spawnUnit, unitFullMoves } from '../core/units';
import type { GameState, Seat } from '../core/types';
import { newOpsAi, notReadyHook, operationsTurn, opsOf, peaceMade, remapUnits, surpriseWarReady, type OpsAi } from '../core/operations/manager';
import { knownArmy } from '../core/operations/knowledge';
import { warValue } from '../../ai/major/warValue';
import { opsSettle } from '../../ai/major/settle';
import { seatUnitRows } from '../core/operations/unitRows';
import type { MajorView } from '../../ai/major/view';
import type { WarHooks } from './diploSender';
import { opUnits } from '../core/operations/operation';
import { engineRowOf } from './import';
import { gameTypeOf } from '../data/aliases';
import type { Catalog, TurnRecord } from './record';

/** the families measured: the operations the port starts, then all */
const FAMILIES = ['Settle New City', 'Naval Superiority', 'Attack Barb Camp', 'City Defense', 'Attack Enemy City', 'Attack Walled City', 'all'] as const;
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

/** the "CITY VALUES" lines by `${turn}:${player}`: [city name, value] */
function readCityValues(path: string): Map<string, [string, number][]> {
  const out = new Map<string, [string, number][]>();
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const m = /^(\d+), (\d+), -1, CITY VALUES, ([-\d.]+), (\S+)/.exec(raw.replace(/\r$/, ''));
    if (!m) continue;
    const k = `${m[1]}:${m[2]}`;
    (out.get(k) ?? out.set(k, []).get(k)!).push([m[4].replace(/^LOC_CITY_NAME_/, ''), Number(m[3])]);
  }
  return out;
}

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
  /** the CITY VALUES lines: the log's, ours, equal within 0.1, ours equal
   *  the log's of the turn before */
  cityValues: { log: number; ours: number; equal: number; equalBefore: number; firstMiss?: string; misses: string[] };
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
  evals: newEvals(), warEvals: newEvals(), cityValues: { log: 0, ours: 0, equal: 0, equalBefore: 0, misses: [] } });

const inFamily = (family: string, line: string): boolean => family === 'all' || opName(line) === family;

export class OperationsProbe {
  private readonly log: Map<string, string[]>;
  private readonly evalLog: Map<string, string[]>;
  private readonly cityValueLog: Map<string, [string, number][]>;
  /** per seat, the view its operations' turn left and the players it was at
   *  war with */
  private readonly lastView = new Map<number, MajorView>();
  private readonly wars = new Map<number, Set<number>>();
  private readonly ais = new Map<number, OpsAi>();
  /** the record unit keys of the last record state's engine units, by seat */
  private keys = new Map<number, string>();
  /** the plots the operation units ended on, by record key, awaiting t+1 */
  private ends: { family: string; player: number; turn: number; key: string; plot: number; type: string }[] = [];
  readonly tally = newTally();

  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>, private readonly cat: Catalog,
              private readonly seatOfPlayer: ReadonlyMap<number, number>,
              private readonly inputs: (turn: number) => MajorViewInputs) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.log = readLog(`${logs}AI_Operation.csv`, () => true);
    this.evalLog = readLog(`${logs}AI_Operation_Eval.csv`, (r) => !/^-?\d+, (CITY VALUES|MINOR CIV LEVY),/.test(r));
    this.cityValueLog = readCityValues(`${logs}AI_Operation_Eval.csv`);
  }

  /** what the wars' desires and can-do read of the seats' operations */
  warHooks(): WarHooks {
    return {
      // on the view the seat's operations' turn left (its knowledge base)
      value: (view, owner, other, favoured) => {
        const ai = this.ais.get(owner);
        const v = this.lastView.get(owner) ?? view;
        const records = (p: number) => (ai ? knownArmy(ai.army, p) : []);
        return warValue(v, owner, other, favoured, {
          army: (p) => (p === owner ? v.units(owner) : records(p)), records, turn: v.turn,
        });
      },
      // on the view the seat's operations' turn left: their units' ids
      ready: (_view, owner, other) => {
        const ai = this.ais.get(owner);
        const v = this.lastView.get(owner);
        return !!ai && !!v && surpriseWarReady(ai, v, other);
      },
      notReady: (view, owner, other) => {
        const ai = this.ais.get(owner);
        if (ai) notReadyHook(ai, view, other);
      },
    };
  }

  get active(): boolean {
    return this.log.size > 0 && this.seats.size > 0;
  }

  /** the record units' keys in the importer's order: engine id -> key */
  private unitKeys(rec: TurnRecord): Map<number, string> {
    const out = new Map<number, string>();
    let k = 0;
    for (const u of rec.units) {
      if (!this.seatOfPlayer.has(u.owner) || !engineRowOf(this.cat, 'unit', u.type)) continue;
      out.set(k++, `${u.owner}:${u.id}`);
    }
    return out;
  }

  /** at the pair's start, the AI's turn on record t (`state`, the import of
   *  `rec`; `next` record t+1, `nextState` its import). Record t is read
   *  before the AI major's start of turn: the units its cities finish at that
   *  start (a unit record t+1 holds that record t does not, of the type a
   *  city of the seat finishes this turn) stand at their city as its turn
   *  begins, the other cities bank the turn's production; what a city
   *  produces once its turn's choice is made is record t+1's. */
  preTurn(rec: TurnRecord, state: GameState, next: TurnRecord, nextState: GameState): void {
    if (!this.active) return;
    const keys = this.unitKeys(rec);
    const copy = structuredClone(state);
    const had = new Set(rec.units.map((u) => `${u.owner}:${u.id}`));
    const built = new Map<number, { city: number; unit: number; type: string }[]>();
    for (const [seat, player] of this.seats) {
      const view = majorView(copy, this.inputs(copy.turn));
      const due = view.cityBuilds(seat).filter((b) => b.unitType && b.turnsLeft <= 1);
      for (const u of next.units) {
        if (u.owner !== player || had.has(`${u.owner}:${u.id}`)) continue;
        const type = engineRowOf(this.cat, 'unit', u.type);
        const k = type ? due.findIndex((b) => b.unitType === gameTypeOf('unit', type, 'UNIT_')) : -1;
        if (!type || k < 0) continue;
        const made = spawnUnit(copy, type, due[k].plot, seat);
        if (made) {
          keys.set(made.id, `${u.owner}:${u.id}`);
          built.set(seat, [...built.get(seat) ?? [], { city: due[k].city, unit: made.id, type: due[k].unitType! }]);
        }
        due.splice(k, 1);
      }
      // the turn start's production: a city that finished its unit moves on
      // to its next item, any other banks the turn's production
      for (const c of citiesOf(copy, seat)) {
        if ((built.get(seat) ?? []).some((b) => b.city === c.id)) c.queue = c.queue.slice(1);
        else if (c.queue[0]) c.queue[0].progress += computeCityStats(copy, c).total.production;
      }
    }
    const byKey = new Map([...keys].map(([id, k]) => [k, id]));
    // the AI's units carried over from the last record state
    for (const ai of this.ais.values()) remapUnits(ai, (id) => {
      const k = this.keys.get(id);
      return k === undefined ? undefined : byKey.get(k);
    });
    this.keys = keys;
    // the AI acts at its turn's start: its units on their full Movement
    for (const u of copy.units) if (this.seats.has(u.seat)) u.movesLeft = u.movesFull ?? unitFullMoves(copy, u);
    const turn = copy.turn;
    for (const [seat, player] of this.seats) {
      if (!seatOf(copy, seat)) continue;
      let ai = this.ais.get(seat);
      if (!ai) this.ais.set(seat, (ai = newOpsAi(seat)));
      let view = majorView(copy, this.inputs(turn));
      const after = majorView(nextState, this.inputs(turn));
      // the military AI's unit production table, once a turn
      let rows: ReturnType<typeof seatUnitRows> | null = null;
      // a peace the seat made since its last turn (0x650890)
      const now = new Set(view.players().filter((p) => p !== seat && view.atWar(seat, p)));
      for (const p of this.wars.get(seat) ?? []) if (!now.has(p)) peaceMade(ai, p);
      this.wars.set(seat, now);
      const out = operationsTurn(ai, {
        turn,
        view: () => view,
        act: (rows) => {
          applySeatUnitOrders(copy, seatOf(copy, seat) as Seat, rows);
          view = majorView(copy, this.inputs(turn));
        },
        built: built.get(seat) ?? [],
        settle: view.majors().includes(seat) ? opsSettle(() => view, seat) : null,
        unitRows: () => (rows ??= (() => {
          const counts = new Map<string, number>();
          for (const r of ai.army.values()) counts.set(`${r.type}|${r.owner}`, (counts.get(`${r.type}|${r.owner}`) ?? 0) + 1);
          return seatUnitRows(copy, seat, (u, p) => counts.get(`${u}|${p}`) ?? 0, view.players(), (p) => view.atWar(seat, p));
        })()),
        producing: (city) => {
          const plot = view.cityBuilds(seat).find((b) => b.city === city)?.plot;
          const k = after.cityBuilds(seat).findIndex((b) => b.plot === plot);
          return k < 0 ? null : after.contractCities(seat)[k].current;
        },
      });
      const ours = out.lines.map(norm);
      if (TRACE) {
        console.error(`== t${turn} p${player}`);
        const logs = this.log.get(`${turn}:${player}`) ?? [];
        for (let i = 0; i < Math.max(logs.length, ours.length); i++) {
          const mark = logs[i] === ours[i] ? '  ' : '!!';
          console.error(`${mark} log  ${logs[i] ?? '-'}\n${mark} ours ${ours[i] ?? '-'}`);
        }
        const ev = (this.evalLog.get(`${turn}:${player}`) ?? []).join(' | ');
        console.error(`   eval log  ${ev}\n   eval ours ${out.evals.join(' | ')}`);
        console.error(`   units ${view.units(seat).map((u) => `${u.id}:${u.type}@${u.plot}`).join(' ')}`);
        console.error(`   contracts ${ai.book.contracts.map((c) => `${c.id}:${c.unit}:${c.progress}:tree${c.tree}:turns${c.turns}`).join(' ')}`);
        console.error(`   ops ${opsOf(ai).map((o) => `${o.def.name}#${o.id}[${o.teams.map((t) => t.members.join(',')).join('|')}]`).join(' ')}`);
      }
      this.lastView.set(seat, view);
      this.compare(turn, player, ours);
      // the eval lines name the enemy by the game's player id
      const playerOf = new Map([...this.seatOfPlayer].map(([p, s]) => [s, p]));
      const evals = out.evals.map((l) => l.replace(/^(-?\d+), /, (_m, s: string) => `${Number(s) < 0 ? s : playerOf.get(Number(s)) ?? s}, `));
      this.compareEvals(this.tally.evals, turn, player, evals, true);
      this.compareEvals(this.tally.warEvals, turn, player, evals, false);
      const names = new Map(rec.cities.map((c) => [c.y * rec.head.W + c.x, c.name.replace(/^LOC_CITY_NAME_/, '')]));
      this.compareCityValues(turn, player, out.cityValues.map(({ plot, value }) => [names.get(plot) ?? '?', value]));
      for (const op of opsOf(ai)) {
        for (const id of opUnits(op)) {
          const u = view.units(seat).find((x) => x.id === id);
          const key = keys.get(id);
          if (!u || !key) continue;
          for (const family of FAMILIES) {
            if (family === 'all' || family === op.def.name) this.ends.push({ family, player, turn, key, plot: u.plot, type: u.type });
          }
        }
      }
    }
  }

  private compare(turn: number, player: number, ours: string[]): void {
    const all = this.log.get(`${turn}:${player}`) ?? [];
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

  /** the CITY VALUES lines of the turn by city name, against the log's of the
   *  turn and of the turn before */
  private compareCityValues(turn: number, player: number, ours: [string, number][]): void {
    const t = this.tally.cityValues;
    const logs = this.cityValueLog.get(`${turn}:${player}`) ?? [];
    const before = new Map(this.cityValueLog.get(`${turn - 1}:${player}`) ?? []);
    t.log += logs.length;
    t.ours += ours.length;
    const mine = new Map(ours);
    for (const [name, value] of logs) {
      const v = mine.get(name);
      if (v !== undefined && Math.abs(v / 256 - value) < 0.1) t.equal++;
      else if (t.misses.length < 40) {
        const m = `t${turn} p${player} ${name}: log ${value.toFixed(1)} ours ${v === undefined ? '-' : (v / 256).toFixed(1)}`;
        t.firstMiss ??= m;
        t.misses.push(m);
      }
      const b = before.get(name);
      if (v !== undefined && b !== undefined && Math.abs(v / 256 - b) < 0.1) t.equalBefore++;
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

  /** at the pair's end: the operation units' plots against record t+1 */
  postTurn(b: TurnRecord): void {
    const at = new Map(b.units.map((u) => [`${u.owner}:${u.id}`, u.y * b.head.W + u.x]));
    for (const e of this.ends) {
      const p = at.get(e.key);
      if (p === undefined) continue;
      const t = this.tally.families[e.family];
      t.plots++;
      if (p === e.plot) t.plotsEqual++;
      else if (e.family !== 'all' && t.misses.length < 30) t.misses.push(`t${e.turn} p${e.player} ${e.type} ${e.key}: ours plot ${e.plot}, record t+1 ${p}`);
    }
    this.ends = [];
  }
}

export function operationsMarkdown(t: OperationsTally): string[] {
  const out = ['', "## The AI's operations (cpu/core/operations)", ''];
  const e = t.evals;
  out.push(`Candidates against no enemy (AI_Operation_Eval.csv, enemy -1): turns ${e.turns}, every line equal ${e.turnsEqual}; lines log ${e.log}, ours ${e.ours}; first miss: ${e.firstMiss ?? '-'}.`);
  const w = t.warEvals;
  out.push('', `Candidates against an enemy (the war candidates): turns ${w.turns}, every line equal ${w.turnsEqual}; lines log ${w.log}, ours ${w.ours}; first miss: ${w.firstMiss ?? '-'}.`);
  out.push('', `First war candidate per player>enemy (log / ours): ${Object.entries(w.first).map(([k, [a, b]]) => `${k} t${a ?? '-'} / t${b ?? '-'}`).join('; ') || '-'}.`);
  const cv = t.cityValues;
  out.push('', `CITY VALUES lines: log ${cv.log}, ours ${cv.ours}; equal (within 0.1) ${cv.equal}; ours equal to the log's of the turn before ${cv.equalBefore}; first miss: ${cv.firstMiss ?? '-'}.`);
  for (const family of FAMILIES) {
    const f = t.families[family];
    out.push('', `### ${family === 'all' ? 'Every operation' : `"${family}"`}`, '',
      `Turns (AI major-turns): ${f.turns}, every line equal ${f.turnsEqual}; units after the moves at record t+1's plot ${f.plotsEqual} / ${f.plots}; first miss: ${f.firstMiss ?? '-'}.`,
      '', '| lines | log | ours | turns equal |', '|---|---|---|---|',
      ...KINDS.map((k) => {
        const s = f.kinds[k];
        return `| ${k} | ${s.log} | ${s.ours} | ${s.turnsEqual} / ${s.turns} |`;
      }));
    if (family !== 'all') out.push('', 'Misses:', '', ...f.misses.map((m) => `- ${m}`));
  }
  out.push('', 'Candidate misses:', '', ...e.misses.map((m) => `- ${m}`));
  out.push('', 'War candidate misses:', '', ...t.warEvals.misses.map((m) => `- ${m}`));
  out.push('', 'CITY VALUES misses:', '', ...t.cityValues.misses.map((m) => `- ${m}`));
  return out;
}
