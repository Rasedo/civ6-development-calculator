/**
 * THE MAJORS' DIPLOMACY BESIDE THE ACTION REPLAY: each major's agendas and
 * opinion of the others (ai/major/diplomacy.ts) run at each major's turn
 * start on the replayed engine, and scored against the game's own log of
 * that game (`<dump>.logs/AI_Diplomacy.csv`, the opinion each major holds of
 * each player it has met, per turn), and each major's diplomatic state
 * toward the others (ai/major/diploState.ts) run on that opinion and scored
 * against the same rows' states. The probe reads; it drives nothing.
 *
 * The set-up's draws ("Random Diplomatic Value", "Choose random agenda") and
 * the civic agenda's draws are the game's own, taken from its draw log in
 * order. The diplomatic facts — when two majors met, their wars and peaces,
 * the Delegations and Resident Embassies held — are the replayed engine's,
 * on both lanes (the record carries none of them).
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  diplomacySetup, diplomacyTurnStart, newDiploGaps, opinion, opinionModifiers, type DiploDraw, type DiploGaps,
  type DiplomacyMemory,
} from '../../ai/major/diplomacy';
import {
  answerAction, diploState, diploStateTurn, newDiploStateGaps, newDiploStateMemory, type DiploStateGaps, type DiploStateMemory,
} from '../../ai/major/diploState';
import { DELEGATION_COST, EMBASSY_COST } from '../data/seats';
import { MISSION_EMBASSY } from '../core/seats';
import { majorView } from '../core/majorView';
import type { GameState } from '../core/types';
import type { LoggedDraw, RandLog } from './randLog';

/** the opinion entries of one AI_Diplomacy row: [opinion, state] per player
 *  listed, in the log's order */
type LogRow = [number, string][];

const MAJOR_STATES = new Set(['DIPLO_STATE_ALLIED', 'DIPLO_STATE_DECLARED_FRIEND', 'DIPLO_STATE_FRIENDLY', 'DIPLO_STATE_NEUTRAL',
  'DIPLO_STATE_UNFRIENDLY', 'DIPLO_STATE_DENOUNCED', 'DIPLO_STATE_WAR']);

function readDiplomacyLog(path: string): Map<string, LogRow> {
  const out = new Map<string, LogRow>();
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4 || c[2] !== '') continue;
    const cells = c.slice(3).filter((x) => x.includes(':'));
    out.set(`${c[0]}:${c[1]}`, cells.map((x) => {
      const k = x.indexOf(':');
      return [Number(x.slice(0, k)), x.slice(k + 1)] as [number, string];
    }));
  }
  return out;
}

/** the game's draws of one label, served in order */
class LogFeed {
  private readonly next = new Map<string, number>();
  readonly misses: string[] = [];
  constructor(private readonly draws: readonly LoggedDraw[]) {}

  draw(turn: number): DiploDraw {
    return (range, label) => {
      let k = this.next.get(label) ?? 0;
      while (k < this.draws.length && this.draws[k].label !== label) k++;
      this.next.set(label, k + 1);
      const d = this.draws[k];
      if (!d) {
        this.misses.push(`t${turn} ${label}: past the log's draws`);
        return 0;
      }
      if (d.range !== range || d.turn !== turn) this.misses.push(`t${turn} ${label}: ours over ${range}, the log's t${d.turn} over ${d.range}`);
      return Math.min(d.value, range - 1);
    };
  }
}

/** one lane's score: the port run on one state over the game */
export interface DiplomacyLaneTally {
  /** opinion lines: one per (turn, major, met major) the log holds */
  lines: number;
  equal: number;
  firstMiss?: string;
  misses: string[];
  /** per owner seat: lines, equal */
  byOwner: Record<string, [number, number]>;
  /** the agendas each major took */
  agendas: Record<string, string[]>;
  /** the draws whose range or turn was not the log's */
  drawMisses: string[];
  /** what the port could not evaluate: requirement and modifier types, counted per evaluation */
  gapRequirements: Record<string, number>;
  gapModifierTypes: Record<string, number>;
  /** state lines: one per (turn, major, met major) the log holds, the port's
   *  diplomatic state (ai/major/diploState) against the log's */
  stateLines: number;
  stateEqual: number;
  stateFirstMiss?: string;
  stateMisses: string[];
  /** the logged transitions the port's state followed, and missed: from>to */
  stateMoves: Record<string, [number, number]>;
  /** what the state turn could not evaluate: checks and allowed rows */
  gapChecks: Record<string, number>;
  gapAllowed: Record<string, number>;
  /** the same state lines, the machine run on the log's own opinions (the
   *  state turn alone) */
  onLogLines: number;
  onLogEqual: number;
  onLogMisses: string[];
  /** the receiver's answers to the record's mission proposals: the port's
   *  answer (ai/major/diploState `answerAction`) in the port's state, and in
   *  the state the state turn reaches on the log's own opinions */
  answers: number;
  answersEqual: number;
  answersOnLogEqual: number;
  answerMisses: string[];
}

/** the port on the record's own state (its logic alone), and on the
 *  replayed engine's (what the AI would think in a free run) */
export interface DiplomacyTally {
  record: DiplomacyLaneTally;
  engine: DiplomacyLaneTally;
}

const laneTally = (): DiplomacyLaneTally => ({ lines: 0, equal: 0, misses: [], byOwner: {}, agendas: {}, drawMisses: [],
  gapRequirements: {}, gapModifierTypes: {}, stateLines: 0, stateEqual: 0, stateMisses: [], stateMoves: {}, gapChecks: {},
  gapAllowed: {}, onLogLines: 0, onLogEqual: 0, onLogMisses: [], answers: 0, answersEqual: 0, answersOnLogEqual: 0,
  answerMisses: [] });

class Lane {
  mem: DiplomacyMemory | null = null;
  feed: LogFeed | null = null;
  readonly gaps: DiploGaps = newDiploGaps();
  readonly states: DiploStateMemory = newDiploStateMemory();
  readonly stateGaps: DiploStateGaps = newDiploStateGaps();
  /** the state machine run on the log's own opinions */
  readonly onLog: DiploStateMemory = newDiploStateMemory();
  readonly onLogGaps: DiploStateGaps = newDiploStateGaps();
  /** the log's last state per owner>other */
  readonly logged = new Map<string, string>();
  readonly tally = laneTally();
}

const short = (s: string | null | undefined) => (s ?? '-').replace('DIPLO_STATE_', '');

export class DiplomacyProbe {
  private readonly log: Map<string, LogRow> | null;
  private readonly lanes = { record: new Lane(), engine: new Lane() };

  /** `players`: seat -> the game's player id, the majors' and the city-states' */
  constructor(dumpPath: string, private readonly players: ReadonlyMap<number, number>, private readonly seatOf: ReadonlyMap<number, number>) {
    const base = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.log = existsSync(base + 'AI_Diplomacy.csv') ? readDiplomacyLog(base + 'AI_Diplomacy.csv') : null;
  }

  /** the agendas the engine lane's majors carry */
  agendasOf(seat: number): readonly string[] {
    return this.lanes.engine.mem?.agendas.get(seat) ?? [];
  }

  get active(): boolean {
    return !!this.log;
  }

  get tally(): DiplomacyTally {
    return { record: this.lanes.record.tally, engine: this.lanes.engine.tally };
  }

  private view(state: GameState, after?: GameState) {
    return majorView(state, after ? { civicsHeld: (i: number) => majorView(after).civicsHeld(i) } : {});
  }

  /** the set-up, on the replay's first state */
  setup(state: GameState, randLog: RandLog | undefined, slots: readonly number[]): void {
    if (!this.log) return;
    for (const lane of Object.values(this.lanes)) {
      lane.feed = new LogFeed(randLog?.draws ?? []);
      lane.mem = diplomacySetup(this.view(state), slots, lane.feed.draw(1));
    }
  }

  /** the receiver's answer to a mission the record's sender proposed: the
   *  port's (`answerAction`) on the engine's lane, in the state the port
   *  holds and in the one it reaches on the log's opinions, against the
   *  record's `accepted` */
  answer(state: GameState, receiver: number, sender: number, mission: number, accepted: boolean): void {
    if (!this.log) return;
    const lane = this.lanes.engine;
    const t = lane.tally;
    const view = this.view(state);
    const embassy = mission === MISSION_EMBASSY;
    const action = embassy ? 'DIPLOACTION_RESIDENT_EMBASSY' : 'DIPLOACTION_DIPLOMATIC_DELEGATION';
    const gold = embassy ? EMBASSY_COST : DELEGATION_COST;
    const ours = diploState(lane.states, receiver, sender);
    const onLog = diploState(lane.onLog, receiver, sender);
    const port = answerAction(view, ours, receiver, action, gold);
    const portOnLog = answerAction(view, onLog, receiver, action, gold);
    t.answers++;
    if (port === accepted) t.answersEqual++;
    if (portOnLog === accepted) t.answersOnLogEqual++;
    if ((port !== accepted || portOnLog !== accepted) && t.answerMisses.length < 40) {
      t.answerMisses.push(`t${state.turn} ${receiver}<-${sender} ${embassy ? 'Embassy' : 'Delegation'}: game ${accepted ? 'accepts' : 'refuses'}, `
        + `ours ${port ? 'accepts' : 'refuses'} in ${short(ours)}, on the log's opinions ${portOnLog ? 'accepts' : 'refuses'} in ${short(onLog)}, `
        + `gold weight ${(view.yieldWeight(receiver, 'YIELD_GOLD') / 256).toFixed(2)}`);
    }
  }

  /** each major's turn start of the pair's first turn, on the engine's state
   *  and on the record's (its diplomatic facts the engine's), scored against
   *  the log's rows of that turn */
  preTurn(engine: GameState, record: GameState, recordNext: GameState): void {
    if (!this.log) return;
    this.lane(this.lanes.engine, engine);
    for (const r of [record, recordNext]) {
      r.metTurns = { ...engine.metTurns };
      r.peaceTurn = { ...engine.peaceTurn };
      r.delegations = { ...engine.delegations };
    }
    this.lane(this.lanes.record, record, recordNext);
  }

  private lane(lane: Lane, state: GameState, next?: GameState): void {
    const { mem, feed } = lane;
    if (!this.log || !mem || !feed) return;
    const turn = state.turn;
    const t = lane.tally;
    const majors = [...this.players.keys()].filter((s) => this.seatOf.get(this.players.get(s)!) === s && s < state.seats.length)
      .sort((x, y) => x - y);
    for (const owner of majors) {
      // the record is read at the first major's turn start: a later major's
      // civics completed at its own start show in the next record
      const view = this.view(state, next && owner !== majors[0] ? next : undefined);
      if (!view.majors().includes(owner)) continue;
      diplomacyTurnStart(view, mem, owner, feed.draw(turn), lane.gaps);
      diploStateTurn(view, lane.states, owner, (o) => opinion(mem, owner, o), lane.stateGaps);
      const row: LogRow | undefined = this.log.get(`${turn}:${this.players.get(owner)}`);
      if (!row) continue;
      const logged: LogRow = row.filter(([, s]) => MAJOR_STATES.has(s));
      const others = majors.filter((o) => o !== owner && view.metTurn(owner, o) !== null);
      // the state turn alone: the same machine on the log's own opinions
      const logOpinion = new Map(others.map((o, k) => [o, logged[k]?.[0] ?? 0] as const));
      diploStateTurn(view, lane.onLog, owner, (o) => logOpinion.get(o) ?? 0, lane.onLogGaps);
      for (let k = 0; k < Math.max(logged.length, others.length); k++) {
        const other = others[k];
        const gameState: string | undefined = logged[k]?.[1];
        t.onLogLines++;
        if (gameState !== undefined && other !== undefined && diploState(lane.onLog, owner, other) === gameState) t.onLogEqual++;
        else if (t.onLogMisses.length < 40) {
          t.onLogMisses.push(`t${turn} ${owner}->${other ?? '?'}: ours ${short(other === undefined ? null : diploState(lane.onLog, owner, other))} `
            + `game ${short(gameState)} at opinion ${logged[k]?.[0] ?? '-'}`);
        }
        const ourState = other === undefined ? null : diploState(lane.states, owner, other);
        t.stateLines++;
        const pk = `${owner}>${other ?? '?'}`;
        const before = lane.logged.get(pk);
        if (gameState !== undefined) lane.logged.set(pk, gameState);
        if (before !== undefined && gameState !== undefined && before !== gameState) {
          const mk = `${short(before)}>${short(gameState)}`;
          const mv = (t.stateMoves[mk] ??= [0, 0]);
          mv[ourState === gameState ? 0 : 1]++;
        }
        if (gameState !== undefined && ourState === gameState) t.stateEqual++;
        else {
          const miss = `t${turn} ${owner}->${other ?? '?'}: ours ${short(ourState)} game ${short(gameState)} at opinion ${logged[k]?.[0] ?? '-'}`;
          t.stateFirstMiss ??= miss;
          if (t.stateMisses.length < 40) t.stateMisses.push(miss);
        }
        const game = logged[k]?.[0];
        const ours = other === undefined ? undefined : opinion(mem, owner, other);
        const byOwner = (t.byOwner[String(owner)] ??= [0, 0]);
        t.lines++;
        byOwner[0]++;
        if (game !== undefined && ours === game) {
          t.equal++;
          byOwner[1]++;
          continue;
        }
        const mods = other === undefined ? '' : [...opinionModifiers(mem, owner, other).values()]
          .map((m) => `${m.id.replace(/^(STANDARD_DIPLOMA(CY|TIC)_|AGENDA_)/, '')}=${(m.value / 256).toFixed(2)}`).join(' ');
        const miss = `t${turn} ${owner}->${other ?? '?'}: ours ${ours ?? '-'} game ${game ?? '-'} [${mods}]`;
        t.firstMiss ??= miss;
        if (t.misses.length < 60) t.misses.push(miss);
      }
    }
    for (const [seat, agendas] of mem.agendas) t.agendas[String(seat)] = [...agendas];
    t.drawMisses = feed.misses.slice(0, 30);
    t.gapRequirements = Object.fromEntries(lane.gaps.requirements);
    t.gapModifierTypes = Object.fromEntries(lane.gaps.modifierTypes);
    t.gapChecks = Object.fromEntries(lane.stateGaps.checks);
    t.gapAllowed = Object.fromEntries(lane.stateGaps.allowed);
  }
}

function laneMarkdown(name: string, t: DiplomacyLaneTally): string[] {
  return [`### ${name}`, '',
    `- Opinion lines (AI_Diplomacy.csv, a major's of a major it met): ${t.lines}; equal ${t.equal}; first miss: ${t.firstMiss ?? '-'}.`,
    `- Per owner: ${Object.entries(t.byOwner).map(([o, [n, e]]) => `seat ${o} ${e} / ${n}`).join(', ')}.`,
    `- Agendas: ${Object.entries(t.agendas).map(([s, a]) => `seat ${s} ${a.join(' ')}`).join('; ')}.`,
    `- Draws off the log: ${t.drawMisses.length ? t.drawMisses.join('; ') : 'none'}.`,
    `- Not read yet: requirement types ${JSON.stringify(t.gapRequirements)}; modifier types ${JSON.stringify(t.gapModifierTypes)}.`,
    '', 'Misses:', '', ...t.misses.map((m) => `- ${m}`), '',
    `- Diplomatic state lines (ai/major/diploState, the port's opinion): ${t.stateLines}; equal ${t.stateEqual}; first miss: ${t.stateFirstMiss ?? '-'}.`,
    `- The log's state changes the port followed / missed: ${Object.entries(t.stateMoves).map(([k, [a, b]]) => `${k} ${a} / ${b}`).join(', ') || 'none'}.`,
    `- Not read yet: checks ${JSON.stringify(t.gapChecks)}; allowed rows weighed on unread desires ${JSON.stringify(t.gapAllowed)}.`,
    `- The state turn alone, on the log's own opinions: ${t.onLogEqual} / ${t.onLogLines} lines.`,
    ...(t.answers ? [`- The receivers' answers to the record's missions (ai/major/diploState answerAction): ${t.answers}; as the game's in the port's state ${t.answersEqual}, in the state on the log's opinions ${t.answersOnLogEqual}.`,
      '', 'Answer misses:', '', ...t.answerMisses.map((m) => `- ${m}`), ''] : []),
    '', 'State misses:', '', ...t.stateMisses.map((m) => `- ${m}`), '',
    'State misses on the log\'s opinions:', '', ...t.onLogMisses.map((m) => `- ${m}`), ''];
}

/** the tally as the replay report's section */
export function diplomacyMarkdown(t: DiplomacyTally): string[] {
  return ['', '## The majors\' AI: opinion of the other majors (ai/major/diplomacy)', '',
    ...laneMarkdown('On the record\'s state', t.record), ...laneMarkdown('On the replayed engine\'s state', t.engine)];
}
