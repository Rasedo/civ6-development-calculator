/**
 * THE MAJORS' AI BESIDE THE ACTION REPLAY: each AI major's government and
 * policy-card choice (ai/major/policies.ts) run where the game's AI took it,
 * on the replayed engine, and scored against the game's own log of that game
 * (`<dump>.logs/AI_GovtPolicies.csv`) and against record t+1. The record's
 * choice still lands (the replay's `policies` decision); this reads, it does
 * not drive.
 *
 * At each pair's end the seat's policy scores are taken on the engine's
 * state (the AI turn's policy jobs) and compared line by line with the log's
 * "Policies" lines of that turn; they are kept for the next pair. Each
 * "Completed Civic" line of the next turn runs the choice on the slots the
 * seat held before the turn, twice: on the kept scores (the AI as ported),
 * and on the log's own scores of the turn before (the choice alone, every
 * card the log leaves out read 0 where its civic is held and -1.0 where not).
 * Each run's government and cards are compared with the log's "Government
 * Change" and "Slot Policy" lines after the event, and its card set with
 * record t+1's.
 *
 * The weights read the strategies each seat follows — the AI scores its
 * policies before it updates them, so a turn reads the ported ones (the era
 * and Dark Age strategies) as the turn opened and, for those whose
 * conditions are not ported, AI_Victories.csv's last status of each before
 * the turn — and the majors it has met (DiplomacySummary.csv "Met").
 */
import { existsSync, readFileSync } from 'node:fs';
import { NO_SCORE, choosePolicies, policyRecord, policyScores, type PolicyScores } from '../../ai/major/policies';
import { AI_POLICIES } from '../../ai/major/tables';
import type { MajorView } from '../../ai/major/view';
import { portedStrategies, type AiWeightInputs } from '../core/aiWeights';
import { majorView } from '../core/majorView';
import { adoptGovernment, fitPolicies, governmentSlots } from '../core/effects';
import { seatOf } from '../core/seats';
import type { GameState, GovernmentState } from '../core/types';
import { POLICY_LIST } from '../data/policies';

/** REPLAY_TRACE=majorAiScores prints every score line that differs from the
 *  log's to stderr */
const TRACE_SCORES = (process.env.REPLAY_TRACE ?? '').split(',').includes('majorAiScores');

interface LogEvent { civic: string; government: string | null; slots: string[] }

interface LogTurn {
  policies: Map<string, number>;
  civics: Set<string>;
  /** each Completed Civic of the turn with what followed it */
  events: LogEvent[];
}

/** the log's lines by `${turn}:${player}` */
function readLog(path: string): Map<string, LogTurn> {
  const out = new Map<string, LogTurn>();
  const at = (t: number, p: number) => {
    const k = `${t}:${p}`;
    let v = out.get(k);
    if (!v) out.set(k, (v = { policies: new Map(), civics: new Set(), events: [] }));
    return v;
  };
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4) continue;
    const lt = at(Number(c[0]), Number(c[1]));
    if (c[2] === 'Policies') lt.policies.set(c[3], Math.round(Number(c[4]) * 256));
    else if (c[2] === 'Civic') lt.civics.add(c[3]);
    else if (c[2] === 'Completed Civic') lt.events.push({ civic: c[3], government: null, slots: [] });
    else if (c[2] === 'Government Change' && lt.events.length) lt.events[lt.events.length - 1].government = c[3];
    else if (c[2] === 'Slot Policy' && lt.events.length) lt.events[lt.events.length - 1].slots.push(c[3]);
  }
  return out;
}

/** one run of the choice over the log's events */
export interface ChoiceTally {
  /** completed civics the choice ran on, and those whose government and
   *  every slot equal the log's lines */
  choices: number;
  whole: number;
  /** ... whose government (a change or none) is the log's */
  government: number;
  /** the log's slot lines, and those the choice's cards hold (as a set:
   *  the engine's slot order is its own) */
  slots: number;
  slotsEqual: number;
  /** pairs with an event, and those whose card set and government equal
   *  record t+1's */
  pairs: number;
  recordEqual: number;
  firstMiss?: string;
  misses: string[];
}

export interface MajorAiTally {
  /** the choice on the scores the port takes */
  ported: ChoiceTally;
  /** the choice on the game's logged scores */
  logged: ChoiceTally;
  /** score lines: logged above 0 or scored above 0 by us, equal, logged
   *  only, ours only */
  scoreLines: number;
  scoreEqual: number;
  scoreLoggedOnly: number;
  scoreOursOnly: number;
  /** per policy: lines compared and equal */
  scoreByPolicy: Record<string, [number, number]>;
}

const choiceTally = (): ChoiceTally => ({ choices: 0, whole: 0, government: 0, slots: 0, slotsEqual: 0, pairs: 0, recordEqual: 0, misses: [] });

type RecordSet = { government: string | null; policies: string[] };

export class MajorAiProbe {
  private readonly log: Map<string, LogTurn> | null;
  private readonly kept = new Map<number, PolicyScores>();
  private readonly before = new Map<number, GovernmentState>();
  readonly tally: MajorAiTally = { ported: choiceTally(), logged: choiceTally(), scoreLines: 0, scoreEqual: 0,
    scoreLoggedOnly: 0, scoreOursOnly: 0, scoreByPolicy: {} };

  private readonly strategies: Map<number, { turn: number; strategy: string; on: boolean }[]>;
  private readonly meetings: { turn: number; a: number; b: number }[];
  private readonly ported = new Map<number, string[]>();

  /** `seats`: the AI majors, seat -> the record's player id; `majors`:
   *  every major, player id -> seat */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>, private readonly majors: ReadonlyMap<number, number>) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.log = existsSync(logs + 'AI_GovtPolicies.csv') ? readLog(logs + 'AI_GovtPolicies.csv') : null;
    this.strategies = new Map();
    this.meetings = [];
    if (existsSync(logs + 'AI_Victories.csv')) {
      for (const line of readFileSync(logs + 'AI_Victories.csv', 'utf8').split('\n').slice(1)) {
        const c = line.split(',').map((x) => x.trim());
        if (c.length < 4 || /_CHANGES$|^STRATEGY_DARKAGE$/.test(c[2])) continue;
        const p = Number(c[1]);
        if (!this.strategies.has(p)) this.strategies.set(p, []);
        this.strategies.get(p)!.push({ turn: Number(c[0]), strategy: c[2], on: c[3] === 'Following' || c[3] === 'Exclusive' });
      }
    }
    if (existsSync(logs + 'DiplomacySummary.csv')) {
      for (const line of readFileSync(logs + 'DiplomacySummary.csv', 'utf8').split('\n').slice(1)) {
        const c = line.split(',').map((x) => x.trim());
        if (c[3] === 'Met') this.meetings.push({ turn: Number(c[0]), a: Number(c[1]), b: Number(c[2]) });
      }
    }
  }

  /** what the yield weights read of the logs, per seat, at the AI turn `turn` */
  private weightInputs(turn: number): Map<number, AiWeightInputs> {
    const out = new Map<number, AiWeightInputs>();
    for (const [player, seat] of this.majors) {
      const on = new Set<string>(this.ported.get(seat) ?? []);
      for (const v of this.strategies.get(player) ?? []) {
        if (v.turn >= turn) break;
        if (v.on) on.add(v.strategy);
        else on.delete(v.strategy);
      }
      const met = new Set<number>();
      for (const m of this.meetings) {
        if (m.turn > turn || m.a !== player) continue;
        const other = this.majors.get(m.b);
        if (other !== undefined) met.add(other);
      }
      out.set(seat, { strategies: on, met: [...met] });
    }
    return out;
  }

  get active(): boolean {
    return !!this.log && this.seats.size > 0;
  }

  private view(state: GameState, turn: number): MajorView {
    return majorView(state, {
      civicList: new Map([...this.seats].map(([seat, p]) => [seat, this.log?.get(`${turn}:${p}`)?.civics ?? new Set<string>()] as const)),
      weights: this.weightInputs(turn),
    });
  }

  /** before the pair's turn: the seats' governments as they stand, and every
   *  major's ported strategies (the AI updates them after it scores) */
  preTurn(state: GameState): void {
    for (const seat of this.seats.keys()) {
      const s = seatOf(state, seat);
      if (s) this.before.set(seat, structuredClone(s.government));
    }
    for (const seat of this.majors.values()) this.ported.set(seat, portedStrategies(state, seat));
  }

  /** the log's scores of a turn as the choice reads them */
  private loggedScores(view: MajorView, seat: number, lt: LogTurn | undefined): PolicyScores {
    const held = view.civicsHeld(seat);
    return new Map(AI_POLICIES.map((p) => [p.type, lt?.policies.get(p.type) ?? (p.civic && held.has(p.civic) ? 0 : NO_SCORE)] as const));
  }

  /** the choice run on each event of the turn from the slots `pre`, tallied */
  private run(state: GameState, seat: number, player: number, turn: number, pre: GovernmentState, events: readonly LogEvent[],
              scoresOf: (view: MajorView) => PolicyScores, record: RecordSet | null, t: ChoiceTally): void {
    const s = seatOf(state, seat)!;
    const post = s.government;
    s.government = structuredClone(pre);
    try {
      for (const ev of events) {
        const view = this.view(state, turn - 1);
        const choice = choosePolicies(view, seat, scoresOf(view), true);
        t.choices++;
        // the cards as a set: the engine lays a set into its own slot order
        // (`fitPolicies`), so a slot's place is not the game's
        const ours = choice.slots.map((x) => x.policy ?? '-');
        const govOk = (choice.government ?? null) === ev.government;
        if (govOk) t.government++;
        const left = [...ours];
        let eq = 0;
        for (const c of ev.slots) {
          const k = left.indexOf(c);
          if (k >= 0) {
            eq++;
            left.splice(k, 1);
          }
        }
        t.slots += ev.slots.length;
        t.slotsEqual += eq;
        if (govOk && eq === ev.slots.length && ours.length === ev.slots.length) t.whole++;
        else {
          const miss = `t${turn} p${player} ${ev.civic}: ours ${choice.government ?? ''} [${ours.join(' ')}] log ${ev.government ?? ''} [${ev.slots.join(' ')}]`;
          t.firstMiss ??= miss;
          if (t.misses.length < 30) t.misses.push(miss);
        }
        // the next completed civic of the turn reads the slots this one left
        const rec = policyRecord(view, choice);
        if (rec.government !== null && rec.government !== undefined) adoptGovernment(state, seat, rec.government);
        const ids = (rec.policies ?? []).map((i) => POLICY_LIST[i].id);
        s.government.policies = fitPolicies(governmentSlots(state, seat), ids) ?? s.government.policies;
      }
      const ours = new Set(s.government.policies.filter((x): x is string => !!x));
      const want = record ? new Set(record.policies) : new Set(pre.policies.filter((x): x is string => !!x));
      const gov = record?.government ?? pre.chosen;
      t.pairs++;
      if (ours.size === want.size && [...ours].every((x) => want.has(x)) && (gov === null || gov === s.government.chosen)) t.recordEqual++;
    } finally {
      s.government = post;
    }
  }

  /** after the pair's turn: its choices, then its scores. The log numbers the
   *  AI's turn by the turn the pair starts from: a record's turn is the one
   *  after the AI's turn it shows (runs/h1_duelw1117: China's Code of Laws
   *  logged at 9, its cards first in record 10). */
  postTurn(state: GameState, recordSet: (seat: number) => RecordSet | null): void {
    if (!this.log) return;
    const t = this.tally;
    const turn = state.turn - 1;
    for (const [seat, player] of this.seats) {
      const pre = this.before.get(seat);
      const kept = this.kept.get(seat);
      const lt = this.log.get(`${turn}:${player}`);
      if (!seatOf(state, seat) || !pre || !kept || !lt?.events.length) continue;
      const record = recordSet(seat);
      this.run(state, seat, player, turn, pre, lt.events, () => kept, record, t.ported);
      const before = this.log.get(`${turn - 1}:${player}`);
      this.run(state, seat, player, turn, pre, lt.events, (v) => this.loggedScores(v, seat, before), record, t.logged);
    }
    // the AI turn's scores, against the log's lines of the turn
    for (const [seat, player] of this.seats) {
      if (!seatOf(state, seat)) continue;
      const scores = policyScores(this.view(state, turn), seat);
      this.kept.set(seat, scores);
      const lt = this.log.get(`${turn}:${player}`);
      if (!lt || lt.civics.size === 0) continue;
      const names = new Set([...lt.policies.keys(), ...[...scores].filter(([, v]) => v > 0).map(([k]) => k)]);
      for (const p of names) {
        const ours = scores.get(p) ?? 0;
        const game = lt.policies.get(p);
        const row = (t.scoreByPolicy[p] ??= [0, 0]);
        t.scoreLines++;
        row[0]++;
        if (game === undefined) t.scoreOursOnly++;
        else if (ours <= 0) t.scoreLoggedOnly++;
        if (TRACE_SCORES && ours !== game) console.error(`score t${turn} p${player} ${p} ours ${ours / 256} log ${game === undefined ? '-' : game / 256}`);
        if (game !== undefined && ours === game) {
          t.scoreEqual++;
          row[1]++;
        }
      }
    }
  }
}

const choiceLine = (name: string, c: ChoiceTally): string =>
  `${name}: completed civics ${c.choices}, government as the log's ${c.government}, government and every slot ${c.whole}, slot lines ${c.slotsEqual} / ${c.slots}; `
  + `pairs ${c.pairs}, card set and government as record t+1's ${c.recordEqual}; first miss: ${c.firstMiss ?? '-'}.`;

/** the tally as the replay report's section */
export function majorAiMarkdown(t: MajorAiTally): string[] {
  const out = ['', '## The majors\' AI: government and policy cards (ai/major)', '',
    `- ${choiceLine('On the ported scores', t.ported)}`,
    `- ${choiceLine('On the game\'s logged scores', t.logged)}`,
    `- Score lines (logged above 0 or ours above 0): ${t.scoreLines}; equal ${t.scoreEqual}; logged only ${t.scoreLoggedOnly}; ours only ${t.scoreOursOnly}.`,
    '', '| policy | lines | equal |', '|---|---:|---:|'];
  for (const [p, [n, e]] of Object.entries(t.scoreByPolicy).sort((a, b) => b[1][1] - a[1][1] || b[1][0] - a[1][0])) out.push(`| ${p} | ${n} | ${e} |`);
  out.push('', 'Misses on the logged scores:', '', ...t.logged.misses.map((m) => `- ${m}`),
    '', 'Misses on the ported scores:', '', ...t.ported.misses.map((m) => `- ${m}`));
  return out;
}
