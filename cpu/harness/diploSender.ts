/**
 * THE MAJORS' DIPLOMATIC SENDING ON THE ACTION REPLAY (ai/major/diploActions.ts):
 * each AI major's savings, pick and perform run at its AI turn on the
 * replayed engine, and its missions go on the engine's table as its own
 * offers; the record's own proposals of an AI major are not fed. Scored
 * against the record's proposals (DiplomacyManager.csv SET_DELEGATION /
 * SET_EMBASSY) per kind — taken, matching (turn, target), the first
 * divergence — and, where the recording carries them, against the game's
 * own logged desires and costs (AI_Diplomacy.csv's action rows, the verbose
 * recordings) and threats ("Threat and Trust").
 *
 * Fed from the recording: the deals the majors struck (DiplomacySummary.csv
 * "Deal Accepted": the trust each party gains, the deals' own AI unported),
 * and the near-victory flags the friendship and the alliance read (the
 * logged friendship row's cost of 9999), the victories' progress unread.
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  ACTION_ALLIANCE, ACTION_DELEGATION, ACTION_DEMAND_TRIBUTE, ACTION_EMBASSY, ACTION_FRIENDSHIP, ACTION_OPEN_BORDERS,
  ACTION_SURPRISE_WAR, actionCost, aiActionsIn, dealStruck, desire, type DiploActionMemory, focusTurn, newDiploActionGaps,
  newDiploActionMemory, performAction, performFriendship, pickActions, preference, recordAnswer, savingsTurn, threat,
  type DesireInputs, type PickedAction, type PickInputs,
} from '../../ai/major/diploActions';
import type { KnownCity } from '../../ai/major/knowledge';
import { majorView, type MajorViewInputs } from '../core/majorView';
import { DEAL_FRIENDSHIP, DEAL_MISSION, DELEGATION_COST, EMBASSY_COST } from '../data/seats';
import type { GameState } from '../core/types';
import type { MajorView } from '../../ai/major/view';

/** a logged action row: desire and cost per other player, x 10 rounded */
type ActionLog = Map<string, [number, number]>;

/** the actions scored in the state's AiAllowed rows only */
const SCORED_ALLOWED = [ACTION_DELEGATION, ACTION_EMBASSY, ACTION_OPEN_BORDERS, ACTION_DEMAND_TRIBUTE];
/** the actions scored on every row: their desire runs whatever the state */
const SCORED_ALWAYS = [ACTION_FRIENDSHIP, ACTION_ALLIANCE, ACTION_SURPRISE_WAR];

/** AI_Diplomacy.csv's action and threat rows, by `${turn}:${owner}:${action}:${other}` (player ids) */
function readActionLog(path: string): { actions: ActionLog; threats: Map<string, number> } {
  const actions: ActionLog = new Map();
  const threats = new Map<string, number>();
  const lines = readFileSync(path, 'utf8').split('\n');
  const head = lines[0].split(',').map((x) => x.trim());
  for (const line of lines.slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4) continue;
    const kind = c[2];
    if (!kind.startsWith('DIPLOACTION') && kind !== 'Threat and Trust') continue;
    for (let k = 4; k < c.length && k < head.length; k++) {
      if (!c[k].includes(':') || head[k] === '') continue;
      const f = c[k].split(':').map(Number);
      if (kind === 'Threat and Trust') threats.set(`${c[0]}:${c[1]}:${head[k]}`, f[0]);
      else actions.set(`${c[0]}:${c[1]}:${kind}:${head[k]}`, [f[0], f[1]]);
    }
  }
  return { actions, threats };
}

/** the deals two majors struck by the turn (DiplomacySummary.csv "Deal
 *  Accepted": the proposer, the receiver), player ids */
function readDeals(path: string): Map<number, [number, number][]> {
  const out = new Map<number, [number, number][]>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c[3] !== 'Deal Accepted') continue;
    const t = Number(c[0]);
    if (!out.has(t)) out.set(t, []);
    // the row names the receiver first
    out.get(t)!.push([Number(c[2]), Number(c[1])]);
  }
  return out;
}

/** a proposal of the record (player ids) */
export interface RecordProposal { kind: 'delegation' | 'embassy'; from: number; to: number; accepted: boolean }

export interface SenderKindTally {
  record: number;
  port: number;
  matching: number;
  firstDivergence?: string;
}

export interface SenderTally {
  kinds: Record<string, SenderKindTally>;
  /** turns an AI major's pick was taken by an action the engine cannot send */
  unsent: Record<string, number>;
  /** logged desire / cost lines of the read actions, equal to 0.1 */
  desireLines: number;
  desireEqual: number;
  costLines: number;
  costEqual: number;
  threatLines: number;
  threatEqual: number;
  /** per action: desire lines, equal; cost lines, equal */
  byAction: Record<string, [number, number, number, number]>;
  misses: string[];
  gaps: Record<string, number>;
}

const actionKind = (a: string): 'delegation' | 'embassy' => (a === ACTION_EMBASSY ? 'embassy' : 'delegation');

export class DiploSender {
  private readonly mem = newDiploActionMemory();
  private readonly gaps = newDiploActionGaps();
  private readonly log: { actions: ActionLog; threats: Map<string, number> } | null;
  private readonly deals: Map<number, [number, number][]>;
  readonly tally: SenderTally = { kinds: {}, unsent: {}, desireLines: 0, desireEqual: 0, costLines: 0, costEqual: 0,
    threatLines: 0, threatEqual: 0, byAction: {}, misses: [], gaps: {} };

  /** `seats`: the AI majors, seat -> the record's player id; `player`: any
   *  seat -> player id */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly player: ReadonlyMap<number, number>) {
    const base = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.log = existsSync(base + 'AI_Diplomacy.csv') ? readActionLog(base + 'AI_Diplomacy.csv') : null;
    this.deals = readDeals(base + 'DiplomacySummary.csv');
  }

  /** the majors' sending memory, which the state turn's transitions read */
  get memory(): DiploActionMemory {
    return this.mem;
  }

  isSender(seat: number): boolean {
    return this.seats.has(seat);
  }

  /** the near-victory flag (+0x64f0) `owner` reads in `other` at `turn`: the
   *  logged friendship row's cost of 9999, null where the log holds no row */
  nearVictory(turn: number, owner: number, other: number): boolean | null {
    const row = this.log?.actions.get(`${turn}:${this.player.get(owner)}:${ACTION_FRIENDSHIP}:${this.player.get(other)}`);
    return row ? row[1] === 9999 : null;
  }

  /** the inputs of `owner`'s desires toward `other` beside the preference
   *  and the focus */
  pickInputs(view: MajorView, turn: number, owner: number, other: number, st: string,
             known: readonly KnownCity[]): PickInputs {
    const own = view.mapCities().filter((c) => c.owner === owner).map((c) => c.plot);
    const theirs = known.filter((k) => k.owner === other).map((k) => k.plot);
    let d: number | null = null;
    for (const a of own) for (const b of theirs) d = Math.min(d ?? Infinity, view.plotDistance(a, b));
    // the port's operations AI runs no war operation
    return { state: st, delegationPrice: DELEGATION_COST, embassyPrice: EMBASSY_COST, distance: d,
      nearVictory: this.nearVictory(turn, owner, other), warOperation: false };
  }

  /** the deals the record's majors struck at `turn` by `owner`'s proposal:
   *  the trust each party gains (0x6535f0), after the proposer's pick (its
   *  rows of that turn weigh none: runs/h1_duelv1127 t99) */
  private strike(turn: number, owner: number): void {
    const pid = this.player.get(owner);
    const seatOfPid = (p: number) => [...this.player].find(([, q]) => q === p)?.[0];
    for (const [from, to] of this.deals.get(turn) ?? []) {
      if (from !== pid) continue;
      const b = seatOfPid(to);
      if (b !== undefined) dealStruck(this.mem, owner, b);
    }
  }

  /**
   * ONE TURN of every AI major's diplomatic sending: the savings, the pick on
   * the engine lane's states (`stateOf`), its desires scored against the
   * log, the missions picked returned for the table. `known` is a seat's
   * knowledge base's cities.
   */
  turn(state: GameState, turn: number, inputs: MajorViewInputs,
       stateOf: (owner: number, other: number) => string | null, agendasOf: (seat: number) => readonly string[],
       known: (seat: number) => readonly KnownCity[]): (PickedAction & { owner: number })[] {
    const view = majorView(state, inputs);
    const out: (PickedAction & { owner: number })[] = [];
    for (const [owner, pid] of this.seats) {
      if (!view.majors().includes(owner)) continue;
      savingsTurn(view, this.mem, owner);
      const ins = new Map<number, PickInputs>();
      for (const other of view.majors()) {
        if (other === owner || view.metTurn(owner, other) === null) continue;
        const st = stateOf(owner, other);
        if (!st) continue;
        ins.set(other, this.pickInputs(view, turn, owner, other, st, known(owner)));
        this.score(view, owner, pid, other, turn, ins.get(other)!, agendasOf(owner));
      }
      const picks = pickActions(view, this.mem, owner, ins, agendasOf(owner), this.gaps);
      for (const p of picks) {
        if (p.action === ACTION_DELEGATION || p.action === ACTION_EMBASSY) out.push({ ...p, owner });
        else this.tally.unsent[p.action] = (this.tally.unsent[p.action] ?? 0) + 1;
      }
      this.strike(turn, owner);
    }
    this.tally.gaps = Object.fromEntries(this.gaps.unread);
    return out;
  }

  /** the mission's offer as the owner's action (the perform) */
  perform(state: GameState, owner: number, p: PickedAction): ReturnType<typeof performAction> {
    return performAction(majorView(state), this.mem, owner, p, DELEGATION_COST, EMBASSY_COST, DEAL_MISSION);
  }

  /** the friendship's offer a transition sends (OnDeclareFriendship) */
  offerFriendship(state: GameState, owner: number, other: number): ReturnType<typeof performFriendship> {
    return performFriendship(majorView(state), this.mem, owner, other, DEAL_FRIENDSHIP);
  }

  /** the sender records the receiver's answer */
  answered(owner: number, action: string, accepted: boolean): void {
    recordAnswer(this.mem, owner, action, accepted, DELEGATION_COST, EMBASSY_COST);
  }

  /** the AI turns' close: each AI major's focus on its opinions */
  close(state: GameState, opinionOf: (owner: number, other: number) => number): void {
    const view = majorView(state);
    for (const owner of this.seats.keys()) {
      if (view.majors().includes(owner)) focusTurn(view, this.mem, owner, (o) => opinionOf(o, owner));
    }
  }

  /** the turn's port proposals against the record's of the AI majors */
  compare(turn: number, port: readonly (PickedAction & { owner: number })[], record: readonly RecordProposal[]): void {
    const pids = new Set(this.seats.values());
    const rec = record.filter((r) => pids.has(r.from));
    for (const kind of ['delegation', 'embassy'] as const) {
      const t = (this.tally.kinds[kind] ??= { record: 0, port: 0, matching: 0 });
      const ours = port.filter((p) => actionKind(p.action) === kind).map((p) => `${this.player.get(p.owner)}>${this.player.get(p.target)}`);
      const theirs = rec.filter((r) => r.kind === kind).map((r) => `${r.from}>${r.to}`);
      t.port += ours.length;
      t.record += theirs.length;
      t.matching += ours.filter((x) => theirs.includes(x)).length;
      if (!t.firstDivergence && (ours.length !== theirs.length || ours.some((x) => !theirs.includes(x)))) {
        t.firstDivergence = `t${turn}: ours [${ours.join(' ')}] record [${theirs.join(' ')}]`;
      }
    }
  }

  private score(view: MajorView, owner: number, pid: number, other: number, turn: number, inp: PickInputs,
                agendas: readonly string[]): void {
    if (!this.log) return;
    const oid = this.player.get(other);
    const th = this.log.threats.get(`${turn}:${pid}:${oid}`);
    if (th !== undefined) {
      this.tally.threatLines++;
      const ours = threat(view, owner, other) / 256;
      if (Math.abs(ours - th) < 0.006) this.tally.threatEqual++;
      else if (this.tally.misses.length < 40) {
        this.tally.misses.push(`t${turn} ${pid}->${oid} threat: ours ${ours.toFixed(2)} log ${th} (strengths ${view.militaryStrength(owner)} / ${view.militaryStrength(other)})`);
      }
    }
    const allowed = new Set(aiActionsIn(inp.state));
    for (const a of [...SCORED_ALLOWED, ...SCORED_ALWAYS]) {
      const logged = this.log.actions.get(`${turn}:${pid}:${a}:${oid}`);
      if (!logged || (logged[0] === 0 && logged[1] === 0)) continue;
      if (SCORED_ALLOWED.includes(a) && !allowed.has(a)) continue;
      const pref = preference(view, owner, agendas, a);
      const full: DesireInputs = { ...inp, pref, focus: (this.mem.seats.get(owner)?.focus ?? null) };
      const d = desire(view, this.mem, owner, other, a, full, this.gaps);
      const k = actionCost(view, this.mem, owner, other, a, full);
      const row = (this.tally.byAction[a] ??= [0, 0, 0, 0]);
      this.tally.desireLines++;
      row[0]++;
      const dOk = d !== null && Math.abs(d / 256 - logged[0]) < 0.051;
      if (dOk) {
        this.tally.desireEqual++;
        row[1]++;
      } else if (d !== null && this.tally.misses.length < 40) {
        this.tally.misses.push(`t${turn} ${pid}->${oid} ${a.replace('DIPLOACTION_', '')} in ${inp.state.replace('DIPLO_STATE_', '')}: `
          + `ours ${(d / 256).toFixed(2)} log ${logged[0]}`);
      }
      if (k !== null) {
        this.tally.costLines++;
        row[2]++;
        if (Math.abs(k / 256 - logged[1]) < 0.051) {
          this.tally.costEqual++;
          row[3]++;
        }
      }
    }
  }
}

/** the tally as the replay report's section */
export function senderMarkdown(t: SenderTally): string[] {
  const out = ['', '## The majors\' AI: diplomatic sending (ai/major/diploActions.ts)', '',
    '| kind | record | port | matching | first divergence |', '|---|---:|---:|---:|---|'];
  for (const [k, v] of Object.entries(t.kinds)) out.push(`| ${k} | ${v.record} | ${v.port} | ${v.matching} | ${v.firstDivergence ?? '-'} |`);
  out.push('', `- Picks taken by an action the engine does not send: ${JSON.stringify(t.unsent)}.`,
    `- Logged desires of the read actions: ${t.desireEqual} / ${t.desireLines} equal; costs ${t.costEqual} / ${t.costLines}; threats ${t.threatEqual} / ${t.threatLines}.`,
    `- Per action (desires, costs): ${Object.entries(t.byAction).map(([a, [n, e, cn, ce]]) => `${a.replace('DIPLOACTION_', '')} ${e} / ${n}, ${ce} / ${cn}`).join('; ')}.`,
    `- Not read: ${JSON.stringify(t.gaps)}.`, '', 'Desire misses:', '', ...t.misses.map((m) => `- ${m}`));
  return out;
}
