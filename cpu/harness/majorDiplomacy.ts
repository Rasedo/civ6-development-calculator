/**
 * THE MAJORS' DIPLOMACY BESIDE THE ACTION REPLAY: each major's agendas and
 * opinion of the others (ai/major/diplomacy.ts) run at each major's turn
 * start on the replayed engine, and scored against the game's own log of
 * that game (`<dump>.logs/AI_Diplomacy.csv`, the opinion each major holds of
 * each player it has met, per turn). The probe reads; it drives nothing.
 *
 * The set-up's draws ("Random Diplomatic Value", "Choose random agenda") and
 * the civic agenda's draws are the game's own, taken from its draw log in
 * order. The facts the engine does not keep come from the game's logs: when
 * two majors met (DiplomacySummary.csv's Met rows; the record's action log
 * names the player whose turn it was), the Delegations and Resident
 * Embassies sent, and the wars and peaces. A fact of turn t made in player
 * X's turn is in view at owner O's turn start of t when X moves before O,
 * else at O's start of t+1.
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  diplomacySetup, diplomacyTurnStart, newDiploGaps, opinion, opinionModifiers, type DiploDraw, type DiploGaps,
  type DiplomacyMemory,
} from '../../ai/major/diplomacy';
import { majorView } from '../core/majorView';
import type { GameState } from '../core/types';
import type { LoggedDraw, RandLog } from './randLog';
import type { TurnRecord } from './record';

/** a diplomatic fact the logs name: `a` and `b` are player ids */
interface DiploEvent {
  turn: number;
  kind: 'met' | 'delegation' | 'embassy' | 'war' | 'peace';
  a: number;
  b: number;
  /** the player whose turn it fell in */
  mover: number;
}

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

function readSummary(path: string): DiploEvent[] {
  const out: DiploEvent[] = [];
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4) continue;
    const kind = ({ Met: 'met', Delegation: 'delegation', Embassy: 'embassy', 'At War': 'war', Peace: 'peace' } as const)[c[3]];
    if (!kind) continue;
    const turn = Number(c[0]);
    const a = Number(c[1]);
    const b = Number(c[2]);
    // a meeting is logged both ways: keep the first
    if (kind === 'met' && out.some((e) => e.kind === 'met' && e.turn === turn && e.a === b && e.b === a)) continue;
    out.push({ turn, kind, a, b, mover: kind === 'delegation' || kind === 'embassy' || kind === 'war' ? a : Number.MAX_SAFE_INTEGER });
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
}

/** the port on the record's own state (its logic alone), and on the
 *  replayed engine's (what the AI would think in a free run) */
export interface DiplomacyTally {
  record: DiplomacyLaneTally;
  engine: DiplomacyLaneTally;
}

const laneTally = (): DiplomacyLaneTally => ({ lines: 0, equal: 0, misses: [], byOwner: {}, agendas: {}, drawMisses: [],
  gapRequirements: {}, gapModifierTypes: {} });

class Lane {
  mem: DiplomacyMemory | null = null;
  feed: LogFeed | null = null;
  readonly gaps: DiploGaps = newDiploGaps();
  readonly tally = laneTally();
}

export class DiplomacyProbe {
  private readonly log: Map<string, LogRow> | null;
  private readonly events: DiploEvent[];
  private readonly lanes = { record: new Lane(), engine: new Lane() };

  /** `players`: seat -> the game's player id, the majors' and the city-states' */
  constructor(dumpPath: string, private readonly players: ReadonlyMap<number, number>, private readonly seatOf: ReadonlyMap<number, number>) {
    const base = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.log = existsSync(base + 'AI_Diplomacy.csv') ? readDiplomacyLog(base + 'AI_Diplomacy.csv') : null;
    this.events = readSummary(base + 'DiplomacySummary.csv');
  }

  get active(): boolean {
    return !!this.log;
  }

  get tally(): DiplomacyTally {
    return { record: this.lanes.record.tally, engine: this.lanes.engine.tally };
  }

  /** the turn's meetings' movers, from the record holding the turn's actions */
  private moversOf(b: TurnRecord, turn: number): void {
    const acts = (b as { actions?: unknown[][] }).actions;
    if (!Array.isArray(acts)) return;
    let mover = 0;
    for (const a of acts) {
      if (!Array.isArray(a) || a[1] !== turn) continue;
      if (a[2] === 'PlayerTurnActivated') mover = Number(a[3]);
      else if (a[2] === 'DiplomacyMeet') {
        const x = Number(a[3]);
        const y = Number(a[4]);
        for (const e of this.events) {
          if (e.kind === 'met' && e.turn === turn && ((e.a === x && e.b === y) || (e.a === y && e.b === x))) e.mover = Math.min(e.mover, mover);
        }
      }
    }
  }

  /** the event `kind` between players a and b last in view at owner O's
   *  start of turn t, or null */
  private lastSeen(kind: DiploEvent['kind'], a: number, b: number, owner: number, turn: number, directed: boolean): DiploEvent | null {
    let out: DiploEvent | null = null;
    for (const e of this.events) {
      if (e.kind !== kind) continue;
      if (!((e.a === a && e.b === b) || (!directed && e.a === b && e.b === a))) continue;
      if (e.turn > turn || (e.turn === turn && e.mover >= owner)) continue;
      out = e;
    }
    return out;
  }

  private view(state: GameState, ownerSeat: number, after?: GameState) {
    const owner = this.players.get(ownerSeat) ?? ownerSeat;
    const turn = state.turn;
    const pid = (seat: number) => this.players.get(seat) ?? seat;
    const metTurn = (i: number, j: number): number | null => this.lastSeen('met', pid(i), pid(j), owner, turn, false)?.turn ?? null;
    const lastWar = (i: number, j: number) => {
      const w = this.lastSeen('war', pid(i), pid(j), owner, turn, false);
      const p = this.lastSeen('peace', pid(i), pid(j), owner, turn, false);
      return { w, p };
    };
    return majorView(state, {
      ...(after ? { civicsHeld: (i: number) => majorView(after).civicsHeld(i) } : {}),
      metTurn,
      peaceSince: (i, j) => {
        const { w, p } = lastWar(i, j);
        if (p && (!w || p.turn >= w.turn)) return p.turn;
        return metTurn(i, j);
      },
      mission: (s, r, kind) => {
        const sent = this.lastSeen(kind, pid(s), pid(r), owner, turn, true);
        if (!sent) return false;
        // a war sends the missions home; an Embassy takes the Delegation's
        // place (runs/h1_duelw1110: Rome's +3 for Qin's Delegation of 56 gone
        // with its Embassy of 98)
        const { w } = lastWar(s, r);
        const embassy = kind === 'delegation' ? this.lastSeen('embassy', pid(s), pid(r), owner, turn, true) : null;
        return (!w || w.turn < sent.turn) && (!embassy || embassy.turn < sent.turn);
      },
    });
  }

  /** the set-up, on the replay's first state */
  setup(state: GameState, randLog: RandLog | undefined, slots: readonly number[]): void {
    if (!this.log) return;
    const owner = Math.min(...[...this.players.keys()]);
    for (const lane of Object.values(this.lanes)) {
      lane.feed = new LogFeed(randLog?.draws ?? []);
      lane.mem = diplomacySetup(this.view(state, owner), slots, lane.feed.draw(1));
    }
  }

  /** each major's turn start of the pair's first turn, on the engine's state
   *  and on the record's, scored against the log's rows of that turn; `b`
   *  holds the turn's action log */
  preTurn(engine: GameState, record: GameState, recordNext: GameState, b: TurnRecord): void {
    if (!this.log) return;
    this.moversOf(b, engine.turn);
    this.lane(this.lanes.engine, engine);
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
      const view = this.view(state, owner, next && owner !== majors[0] ? next : undefined);
      if (!view.majors().includes(owner)) continue;
      diplomacyTurnStart(view, mem, owner, feed.draw(turn), lane.gaps);
      const row = this.log.get(`${turn}:${this.players.get(owner)}`);
      if (!row) continue;
      const logged = row.filter(([, s]) => MAJOR_STATES.has(s));
      const others = majors.filter((o) => o !== owner && view.metTurn(owner, o) !== null);
      for (let k = 0; k < Math.max(logged.length, others.length); k++) {
        const other = others[k];
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
  }
}

function laneMarkdown(name: string, t: DiplomacyLaneTally): string[] {
  return [`### ${name}`, '',
    `- Opinion lines (AI_Diplomacy.csv, a major's of a major it met): ${t.lines}; equal ${t.equal}; first miss: ${t.firstMiss ?? '-'}.`,
    `- Per owner: ${Object.entries(t.byOwner).map(([o, [n, e]]) => `seat ${o} ${e} / ${n}`).join(', ')}.`,
    `- Agendas: ${Object.entries(t.agendas).map(([s, a]) => `seat ${s} ${a.join(' ')}`).join('; ')}.`,
    `- Draws off the log: ${t.drawMisses.length ? t.drawMisses.join('; ') : 'none'}.`,
    `- Not read yet: requirement types ${JSON.stringify(t.gapRequirements)}; modifier types ${JSON.stringify(t.gapModifierTypes)}.`,
    '', 'Misses:', '', ...t.misses.map((m) => `- ${m}`), ''];
}

/** the tally as the replay report's section */
export function diplomacyMarkdown(t: DiplomacyTally): string[] {
  return ['', '## The majors\' AI: opinion of the other majors (ai/major/diplomacy)', '',
    ...laneMarkdown('On the record\'s state', t.record), ...laneMarkdown('On the replayed engine\'s state', t.engine)];
}
