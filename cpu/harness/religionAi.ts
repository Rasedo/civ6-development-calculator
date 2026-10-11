/**
 * THE MAJORS' RELIGION AI BESIDE THE ACTION REPLAY (ai/major/religion.ts):
 * each AI major's belief scores taken on the replayed engine where the
 * game's AI turn took them and compared line by line with the game's own log
 * of that game (`<dump>.logs/AI_Religious.csv`), and its picks — the
 * pantheon, the founding's beliefs and each belief the religion adds — run
 * where `Game_Religion.csv` shows the game's, on the scores the port takes
 * and on the log's own scores of that turn. The record's choices still land
 * (the replay's `pantheon` and `religion` decisions); this reads, it does not
 * drive.
 *
 * The log numbers the AI's turn by the turn the pair starts from (as
 * AI_GovtPolicies.csv: `majorAi.ts`); the scores are taken after the pair,
 * on the cities each seat's knowledge base holds (`StrategyProbe`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { AI_BELIEFS } from '../../ai/major/tables';
import { BELIEF_TAKEN, beliefClassIndex, beliefScores, evaluationReligion, pantheonPick, religionBeliefPick, religionChoice, type BeliefScores } from '../../ai/major/religion';
import type { KnownCity } from '../../ai/major/knowledge';
import { modifierValue, type AiCitySubject, type ValueTerms } from '../core/aiModifiers';
import { AI_RATE } from '../core/aiValue';
import { AI_BELIEF_HORIZON } from '../data/aiValue';
import { majorView } from '../core/majorView';
import { seatOf } from '../core/seats';
import type { GameState } from '../core/types';

/** REPLAY_TRACE=religionScores prints every score line that differs from
 *  the log's to stderr */
const TRACE_SCORES = (process.env.REPLAY_TRACE ?? '').split(',').includes('religionScores');

interface ReligionEvent { kind: 'pantheon' | 'found' | 'belief'; belief: string }

/** AI_Religious.csv by `${turn}:${player}`: belief -> score, fixed point */
function readScores(path: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4 || !c[2].startsWith('BELIEF_')) continue;
    const k = `${c[0]}:${c[1]}`;
    let m = out.get(k);
    if (!m) out.set(k, (m = new Map()));
    m.set(c[2], Math.round(Number(c[3]) * 256));
  }
  return out;
}

/** Game_Religion.csv's pantheons, foundings and beliefs added, by
 *  `${turn}:${player}` in the log's order */
function readEvents(path: string): Map<string, ReligionEvent[]> {
  const out = new Map<string, ReligionEvent[]>();
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4) continue;
    const kind = c[2] === 'Found Pantheon' ? 'pantheon' : c[2] === 'Found Religion' ? 'found' : c[2].startsWith('Add belief') ? 'belief' : null;
    if (!kind) continue;
    const k = `${c[0]}:${c[1]}`;
    const list = out.get(k) ?? [];
    list.push({ kind, belief: c[3] });
    out.set(k, list);
  }
  return out;
}

/** the picks run where the log shows the game's, on one source of scores */
export interface PickTally {
  /** pantheons founded, and those whose belief the pick names */
  pantheons: number;
  pantheonsEqual: number;
  /** beliefs the religion added (the founding's and later), and those the
   *  pick names */
  beliefs: number;
  beliefsEqual: number;
  /** religions founded, and those whose type the founding's choice names
   *  (`religionChoice`; a draw it would take is a miss) */
  religions: number;
  religionsEqual: number;
  firstMiss?: string;
  misses: string[];
}

export interface ReligionAiTally {
  /** the picks on the port's scores and on the log's */
  ported: PickTally;
  logged: PickTally;
  /** score lines (every belief, each AI major's logged turn), equal */
  scoreLines: number;
  scoreEqual: number;
  /** the lines the log scores above 0, and those equal */
  valuedLines: number;
  valuedEqual: number;
  /** turns (AI major, turn) whose every line is equal */
  turns: number;
  turnsEqual: number;
  firstScoreMiss?: string;
  /** per belief: lines compared and equal */
  scoreByBelief: Record<string, [number, number]>;
}

const pickTally = (): PickTally => ({ pantheons: 0, pantheonsEqual: 0, beliefs: 0, beliefsEqual: 0, religions: 0, religionsEqual: 0, misses: [] });

export class ReligionProbe {
  private readonly scores: Map<string, Map<string, number>> | null;
  private readonly events: Map<string, ReligionEvent[]>;
  /** each seat's religion classes as the log's beliefs filled them */
  private readonly classes = new Map<number, Set<number>>();
  readonly tally: ReligionAiTally = { ported: pickTally(), logged: pickTally(), scoreLines: 0, scoreEqual: 0, valuedLines: 0,
    valuedEqual: 0, turns: 0, turnsEqual: 0, scoreByBelief: {} };

  /** `seats`: the AI majors, seat -> the record's player id; `known`: the
   *  cities a seat's knowledge base holds */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly known: (seat: number) => readonly KnownCity[]) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.scores = existsSync(`${logs}AI_Religious.csv`) ? readScores(`${logs}AI_Religious.csv`) : null;
    this.events = existsSync(`${logs}Game_Religion.csv`) ? readEvents(`${logs}Game_Religion.csv`) : new Map();
  }

  get active(): boolean {
    return !!this.scores && this.seats.size > 0;
  }

  /** the seat's knowledge base's cities as the analysis's subjects, in its
   *  order: the entries whose city stands */
  private subjects(state: GameState, seat: number): AiCitySubject[] {
    const view = majorView(state);
    const at = new Map(view.mapCities().map((c) => [`${c.plot}:${c.owner}`, c] as const));
    return this.known(seat).flatMap((e) => {
      const c = at.get(`${e.plot}:${e.owner}`);
      return c ? [{ seat: c.owner, id: c.id, capital: c.capital }] : [];
    });
  }

  private pick(t: PickTally, turn: number, player: number, ev: ReligionEvent, ours: string | null): void {
    const ok = ours === ev.belief;
    if (ev.kind === 'pantheon') {
      t.pantheons++;
      if (ok) t.pantheonsEqual++;
    } else if (ev.kind === 'found') {
      t.religions++;
      if (ok) t.religionsEqual++;
    } else {
      t.beliefs++;
      if (ok) t.beliefsEqual++;
    }
    if (!ok) {
      const miss = `t${turn} p${player} ${ev.kind}: ours ${ours ?? '-'} log ${ev.belief}`;
      t.firstMiss ??= miss;
      if (t.misses.length < 30) t.misses.push(miss);
    }
  }

  /** the picks of the turn's events on one source of scores */
  private picks(t: PickTally, turn: number, player: number, seat: number, scores: BeliefScores, evs: readonly ReligionEvent[],
                state: GameState): void {
    const held = new Set(this.classes.get(seat) ?? []);
    for (const ev of evs) {
      if (ev.kind === 'found') {
        // the religions the others had founded; a draw the choice would take
        // names none
        const view = majorView(state);
        const others = new Set(state.seats.filter((s) => s.seat !== seat && s.religion.type).map((s) => `RELIGION_${s.religion.type}`));
        let drew = false;
        const ours = religionChoice(view, seat, others, () => { drew = true; return 0; });
        this.pick(t, turn, player, ev, drew ? null : ours);
        continue;
      }
      const ours = ev.kind === 'pantheon' ? pantheonPick(scores) : religionBeliefPick(scores, held);
      this.pick(t, turn, player, ev, ours);
      const b = AI_BELIEFS.find((x) => x.type === ev.belief);
      if (ev.kind === 'belief' && b) held.add(beliefClassIndex(b));
    }
  }

  /** after the pair's turn: the AI turn's scores against the log's lines,
   *  then the picks of its events */
  postTurn(state: GameState): void {
    if (!this.scores) return;
    const t = this.tally;
    const turn = state.turn - 1;
    for (const [seat, player] of this.seats) {
      if (!seatOf(state, seat)) continue;
      const logged = this.scores.get(`${turn}:${player}`);
      if (!logged) continue;
      const view = majorView(state);
      const ours = beliefScores(view, seat, this.subjects(state, seat));
      let all = true;
      for (const b of AI_BELIEFS) {
        const game = logged.get(b.type);
        if (game === undefined) continue;
        const mine = ours.get(b.type) ?? BELIEF_TAKEN;
        const row = (t.scoreByBelief[b.type] ??= [0, 0]);
        t.scoreLines++;
        row[0]++;
        if (game > 0) t.valuedLines++;
        if (mine === game) {
          t.scoreEqual++;
          row[1]++;
          if (game > 0) t.valuedEqual++;
        } else {
          all = false;
          t.firstScoreMiss ??= `t${turn} p${player} ${b.type}: ours ${mine / 256} log ${game / 256}`;
          if (TRACE_SCORES) {
            const subs = this.subjects(state, seat);
            const t0: ValueTerms = { view, seat, start: 0, horizon: AI_BELIEF_HORIZON, rate: AI_RATE, religion: evaluationReligion(view, seat), known: subs };
            const parts = b.modifiers.map((m) => `${m.id}=${modifierValue(t0, m)}`).join(' ');
            console.error(`belief t${turn} p${player} ${b.type} ours ${mine / 256} log ${game / 256} [${parts}] known ${subs.length}`
              + ` w ${['YIELD_FAITH', 'YIELD_CULTURE', 'YIELD_FOOD', 'YIELD_PRODUCTION'].map((y) => view.yieldWeight(seat, y) / 256).join('/')}`);
          }
        }
      }
      t.turns++;
      if (all) t.turnsEqual++;
      const evs = this.events.get(`${turn}:${player}`) ?? [];
      if (evs.length) {
        this.picks(t.ported, turn, player, seat, ours, evs, state);
        this.picks(t.logged, turn, player, seat, logged, evs, state);
        const cls = this.classes.get(seat) ?? new Set<number>();
        for (const ev of evs) {
          const b = AI_BELIEFS.find((x) => x.type === ev.belief);
          if (ev.kind === 'belief' && b) cls.add(beliefClassIndex(b));
        }
        this.classes.set(seat, cls);
      }
    }
  }
}

const pickLine = (name: string, p: PickTally): string =>
  `${name}: pantheons ${p.pantheonsEqual} / ${p.pantheons}, religions founded ${p.religionsEqual} / ${p.religions}, religion beliefs ${p.beliefsEqual} / ${p.beliefs}; first miss: ${p.firstMiss ?? '-'}.`;

/** the tally as the replay report's section */
export function religionAiMarkdown(t: ReligionAiTally): string[] {
  const out = ['', '## The majors\' AI: religion (ai/major/religion.ts)', '',
    `- ${pickLine('On the ported scores', t.ported)}`,
    `- ${pickLine('On the game\'s logged scores', t.logged)}`,
    `- Score lines: ${t.scoreLines}; equal ${t.scoreEqual}; the log's above 0 ${t.valuedLines}, equal ${t.valuedEqual}; turns ${t.turns}, every line equal ${t.turnsEqual}; first miss: ${t.firstScoreMiss ?? '-'}.`,
    '', '| belief | lines | equal |', '|---|---:|---:|'];
  for (const [b, [n, e]] of Object.entries(t.scoreByBelief)) out.push(`| ${b} | ${n} | ${e} |`);
  out.push('', 'Misses on the ported scores:', '', ...t.ported.misses.map((m) => `- ${m}`),
    '', 'Misses on the logged scores:', '', ...t.logged.misses.map((m) => `- ${m}`));
  return out;
}
