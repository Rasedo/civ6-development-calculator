/**
 * THE MAJORS' GOVERNOR AI IN THE ACTION REPLAY (ai/major/governors.ts): at
 * each pair's start (record t, the AI turn t's analysis) every AI major's
 * governor scores are taken on the replayed engine and compared line by line
 * with the game's own log of that game (`<dump>.logs/AI_Governors.csv`:
 * turn, player, governor, its best slot value, each promotion's score), and
 * its turn — the appointment or promotion, then the seats — is run. The
 * replay's `governors` decision of an AI major lands the port's turn through
 * the engine's verbs (`applyGovernorTurn`) and imposes record t+1's roster
 * only where it differs; a turn the port acts in and the record does not is
 * the record's.
 *
 * Beside it, the choice alone on the log's own scores of the turn (the best
 * slot values and the promotion scores the log lines carry), against the
 * log's events (`Governors.csv`: "Governor Appointed", "Governor Promoted"
 * past the appointment's own).
 */
import { existsSync, readFileSync } from 'node:fs';
import { AI_GOVERNORS } from '../../ai/major/tables';
import { governorChoice, governorLogLine, governorScores, governorTurn, type GovernorChoice, type GovernorScores, type GovernorTurn } from '../../ai/major/governors';
import type { MajorView } from '../../ai/major/view';
import { appointGovernor, assignGovernor, promoteGovernor } from '../core/governors';
import { majorView } from '../core/majorView';
import { seatOf } from '../core/seats';
import type { GameState } from '../core/types';
import { GOVERNORS, GOVERNOR_INSTALL_ID, GOVERNOR_PROMOTIONS, PROMO_INSTALL_ID } from '../data/governors';

/** REPLAY_TRACE=governorScores prints every score line that differs from the
 *  log's to stderr */
const TRACE = new Set((process.env.REPLAY_TRACE ?? '').split(','));
const TRACE_SCORES = TRACE.has('governorScores');
/** REPLAY_TRACE=governorTurns prints each AI major's governor turn */
const TRACE_TURNS = TRACE.has('governorTurns');

interface LogLine { assignment: number; promotions: Map<string, number> }

/** AI_Governors.csv by `${turn}:${player}`, the first block of each (the
 *  logger runs twice a turn for some players, both blocks equal) */
function readScores(path: string): Map<string, Map<string, LogLine>> {
  const out = new Map<string, Map<string, LogLine>>();
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 4 || !c[2].startsWith('GOVERNOR_')) continue;
    const k = `${c[0]}:${c[1]}`;
    let m = out.get(k);
    if (!m) out.set(k, (m = new Map()));
    if (m.has(c[2])) continue;
    m.set(c[2], { assignment: Number(c[3]), promotions: new Map(c.slice(4).map((x) => {
      const [v, p] = x.split(':');
      return [p, Number(v)] as const;
    })) });
  }
  return out;
}

interface GovEvent { kind: 'appoint' | 'promote' | 'assign'; governor: string; city: string }

/** Governors.csv's events by `${turn}:${civilization}` in the log's order */
function readEvents(path: string): Map<string, GovEvent[]> {
  const out = new Map<string, GovEvent[]>();
  for (const line of readFileSync(path, 'utf8').split('\n').slice(1)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 5) continue;
    const kind = c[1] === 'Governor Appointed' ? 'appoint' : c[1] === 'Governor Promoted' ? 'promote' : c[1] === 'Governor Assigned' ? 'assign' : null;
    if (!kind) continue;
    const governor = c[2].replace(/^LOC_/, '').replace(/_NAME$/, '');
    const k = `${c[0]}:${c[3]}`;
    const list = out.get(k) ?? [];
    list.push({ kind, governor, city: c[4].replace(/^LOC_CITY_NAME_/, '') });
    out.set(k, list);
  }
  return out;
}

export interface GovernorAiTally {
  /** score lines: a governor's best slot value, a promotion's score */
  assignLines: number;
  assignEqual: number;
  promoLines: number;
  promoEqual: number;
  /** per governor / promotion: lines and equal */
  byGovernor: Record<string, [number, number]>;
  byPromotion: Record<string, [number, number]>;
  firstScoreMiss?: string;
  /** the turn's choice against the log's events: turns the log appoints or
   *  promotes in, and the port's choice the same (governor and kind); the
   *  port's choices on turns the log takes none */
  choices: number;
  choiceEqual: number;
  choiceExtra: number;
  /** the same on the log's own scores of the turn */
  loggedChoiceEqual: number;
  loggedChoiceExtra: number;
  firstChoiceMiss?: string;
  /** the log's assignments, and the port's the same (governor and city);
   *  the port's on turns the log assigns none */
  assigns: number;
  assignEqualEvents: number;
  assignExtra: number;
  firstAssignMiss?: string;
  /** against record t+1: governors the record or the port changed, and the
   *  port's roster the record's */
  rosterChanges: number;
  rosterEqual: number;
  firstRosterMiss?: string;
  misses: string[];
}

const newTally = (): GovernorAiTally => ({ assignLines: 0, assignEqual: 0, promoLines: 0, promoEqual: 0, byGovernor: {}, byPromotion: {},
  choices: 0, choiceEqual: 0, choiceExtra: 0, loggedChoiceEqual: 0, loggedChoiceExtra: 0, assigns: 0, assignEqualEvents: 0, assignExtra: 0,
  rosterChanges: 0, rosterEqual: 0, misses: [] });

const short = (t: string): string => t.replace(/^GOVERNOR_(PROMOTION_)?(THE_)?/, '');
const choiceText = (c: GovernorChoice): string => (!c ? '-' : 'appoint' in c ? `appoint ${short(c.appoint)}` : `promote ${short(c.promote)} ${short(c.promotion)}`);

/** the engine's index of a GovernorType / GovernorPromotionType */
const engineGovernor = (type: string): number => GOVERNORS.findIndex((g) => GOVERNOR_INSTALL_ID[g.id] === type);
const enginePromotion = (type: string): number => GOVERNOR_PROMOTIONS.findIndex((p) => PROMO_INSTALL_ID[p.id] === type);

/** the port's turn through the engine's own verbs */
export function applyGovernorTurn(state: GameState, seat: number, t: GovernorTurn): void {
  const c = t.choice;
  if (c && 'appoint' in c) appointGovernor(state, seat, engineGovernor(c.appoint));
  else if (c) promoteGovernor(state, seat, engineGovernor(c.promote), enginePromotion(c.promotion));
  for (const a of t.assign) {
    const i = engineGovernor(a.governor);
    if (i < 0 || !a.slot) continue;
    const minor = state.cityStates.find((m) => m.seat === a.slot!.seat);
    assignGovernor(state, seat, i, minor ? { minorId: minor.id } : { cityId: a.slot.id });
  }
}

const empty = (t: GovernorTurn | undefined): boolean => !t || (!t.choice && t.assign.length === 0);

export class GovernorProbe {
  private readonly scores: Map<string, Map<string, LogLine>> | null;
  private readonly events: Map<string, GovEvent[]>;
  private readonly turns = new Map<number, GovernorTurn>();
  readonly tally = newTally();

  /** `seats`: the AI majors, seat -> the record's player id; `strategies`:
   *  what each seat follows as its AI turn opens (`StrategyProbe`) */
  constructor(dumpPath: string, private readonly seats: ReadonlyMap<number, number>,
              private readonly strategies: () => ReadonlyMap<number, ReadonlySet<string>>) {
    const logs = dumpPath.replace(/\.jsonl$/, '.logs/');
    this.scores = existsSync(logs + 'AI_Governors.csv') ? readScores(logs + 'AI_Governors.csv') : null;
    this.events = existsSync(logs + 'Governors.csv') ? readEvents(logs + 'Governors.csv') : new Map();
  }

  get active(): boolean {
    return !!this.scores && this.seats.size > 0;
  }

  /** the port's turn for the seat in this pair, undefined for a seat the
   *  port does not drive */
  turnOf(seat: number): GovernorTurn | undefined {
    return this.turns.get(seat);
  }

  private miss(m: string): void {
    if (this.tally.misses.length < 40) this.tally.misses.push(m);
  }

  /** a pair's start: no AI turn taken yet */
  clear(): void {
    this.turns.clear();
  }

  /** the AI turn t of the AI majors whose actions land now (`active`: the
   *  record's active player, whose actions open the pair, or every other,
   *  whose land after the engine's turn): each one's analysis and turn, its
   *  scores against the log's lines of the turn */
  aiTurn(state: GameState, turn: number, active: (player: number) => boolean, cityName: (seat: number, cityId: number) => string,
         civicsHeld?: (seat: number) => ReadonlySet<string>): void {
    if (!this.scores) return;
    const view = majorView(state, { strategies: this.strategies(), ...(civicsHeld ? { civicsHeld } : {}) });
    for (const [seat, player] of this.seats) {
      if (!active(player) || !seatOf(state, seat)) continue;
      const scores = governorScores(view, seat);
      const t = governorTurn(view, seat, scores);
      this.turns.set(seat, t);
      if (TRACE_TURNS) {
        console.error(`govturn t${turn} p${player} titles ${view.governorTitles(seat)} ${choiceText(t.choice)} assign [${t.assign.map((a) => `${short(a.governor)}@${a.slot?.seat}:${a.slot?.id}`).join(' ')}]`
          + ` roster [${view.governors(seat).filter((g) => g.appointed).map((g) => `${short(g.type)}@${g.city?.seat}:${g.city?.id}`).join(' ')}]`);
        for (const a of scores.governors) {
          if (!view.governors(seat).find((g) => g.type === a.type)?.appointed) continue;
          console.error(`  ${short(a.type)}: ${a.slots.map((s, k) => `${s ? cityName(s.seat, s.id) : '-'}=${a.values[k] >> 8}`).join(' ')}`);
        }
      }
      this.compareScores(scores, turn, player);
      this.compareChoices(view, seat, player, turn, scores, cityName);
    }
  }

  private compareScores(scores: GovernorScores, turn: number, player: number): void {
    const logged = this.scores!.get(`${turn}:${player}`);
    if (!logged) return;
    const t = this.tally;
    for (const a of scores.governors) {
      const game = logged.get(a.type);
      if (!game) continue;
      const ours = governorLogLine(scores, a);
      const gr = (t.byGovernor[a.type] ??= [0, 0]);
      t.assignLines++;
      gr[0]++;
      if (ours.assignment === game.assignment) {
        t.assignEqual++;
        gr[1]++;
      } else {
        t.firstScoreMiss ??= `t${turn} p${player} ${short(a.type)} assignment ours ${ours.assignment} log ${game.assignment}`;
        if (TRACE_SCORES) console.error(`gov t${turn} p${player} ${a.type} ours ${ours.assignment} log ${game.assignment}`);
      }
      for (const [p, v] of ours.promotions) {
        const g = game.promotions.get(p);
        if (g === undefined) continue;
        const pr = (t.byPromotion[p] ??= [0, 0]);
        t.promoLines++;
        pr[0]++;
        if (g === v) {
          t.promoEqual++;
          pr[1]++;
        } else {
          t.firstScoreMiss ??= `t${turn} p${player} ${short(p)} ours ${v} log ${g}`;
          if (TRACE_SCORES) console.error(`promo t${turn} p${player} ${p} ours ${v} log ${g}`);
        }
      }
    }
  }

  /** the choice, ported and on the log's own scores, against the log's
   *  appointment or promotion of the turn; the assignments against the
   *  log's */
  private compareChoices(view: MajorView, seat: number, player: number, turn: number, scores: GovernorScores,
                         cityName: (seat: number, cityId: number) => string): void {
    const t = this.tally;
    const civ = view.civilizationType(seat) ?? '';
    const evs = this.events.get(`${turn}:${civ}`) ?? [];
    // the appointment's own promotion (its BaseAbility) is logged with it
    const appointed = new Set(evs.filter((e) => e.kind === 'appoint').map((e) => e.governor));
    const took = evs.find((e) => e.kind === 'appoint') ?? evs.find((e) => e.kind === 'promote' && !appointed.has(e.governor));
    const same = (c: GovernorChoice): boolean => !!c && !!took
      && ('appoint' in c ? took.kind === 'appoint' && c.appoint === took.governor : took.kind === 'promote' && c.promote === took.governor);
    const ours = this.turns.get(seat)!.choice;
    const logged = this.scores!.get(`${turn}:${player}`);
    const fromLog: GovernorChoice = logged ? governorChoice(view, seat, {
      governors: scores.governors.map((a) => ({ ...a, values: [(logged.get(a.type)?.assignment ?? 0) * 256] })),
      promotions: new Map(AI_GOVERNORS.flatMap((g) => g.promotions.map((p) => [p, (logged.get(g.type)?.promotions.get(p) ?? 0) * 256] as const))),
    }) : null;
    if (took) {
      t.choices++;
      if (same(ours)) t.choiceEqual++;
      else {
        const m = `t${turn} p${player}: ours ${choiceText(ours)} log ${took.kind} ${short(took.governor)}`;
        t.firstChoiceMiss ??= m;
        this.miss(m);
      }
      if (same(fromLog)) t.loggedChoiceEqual++;
    } else {
      if (ours) {
        t.choiceExtra++;
        const m = `t${turn} p${player}: ours ${choiceText(ours)} log none`;
        t.firstChoiceMiss ??= m;
        this.miss(m);
      }
      if (fromLog) t.loggedChoiceExtra++;
    }
    const assigns = evs.filter((e) => e.kind === 'assign');
    const name = (slot: { seat: number; id: number } | null): string => (slot ? cityName(slot.seat, slot.id) : '-');
    const ourAssigns = this.turns.get(seat)!.assign.map((a) => ({ governor: a.governor, city: name(a.slot) }));
    t.assigns += assigns.length;
    for (const e of assigns) {
      if (ourAssigns.some((a) => a.governor === e.governor && a.city === e.city)) t.assignEqualEvents++;
      else {
        const m = `t${turn} p${player}: log assigns ${short(e.governor)} to ${e.city}, ours [${ourAssigns.map((a) => `${short(a.governor)} ${a.city}`).join(', ')}]`;
        t.firstAssignMiss ??= m;
        this.miss(m);
      }
    }
    for (const a of ourAssigns) {
      if (assigns.some((e) => e.governor === a.governor && e.city === a.city)) continue;
      t.assignExtra++;
      const m = `t${turn} p${player}: ours assigns ${short(a.governor)} to ${a.city}, the log does not`;
      t.firstAssignMiss ??= m;
      this.miss(m);
    }
  }

  /** a pair's roster check: governors the record or the port changed, and
   *  whether the port's roster is the record's */
  rosterCheck(turn: number, player: number, changed: number, equal: number, what: string): void {
    const t = this.tally;
    t.rosterChanges += changed;
    t.rosterEqual += equal;
    if (equal < changed) t.firstRosterMiss ??= `t${turn} p${player}: ${what}`;
  }

  /** the AI majors the port acted for in a pair the record holds no change
   *  of their governors in */
  actedAlone(players: ReadonlySet<number>): number[] {
    return [...this.seats].filter(([seat, player]) => !players.has(player) && !empty(this.turns.get(seat))).map(([, player]) => player);
  }
}

/** the tally as the replay report's section */
export function governorAiMarkdown(t: GovernorAiTally): string[] {
  const out = ['', "## The majors' AI: governors (ai/major/governors.ts)", '',
    `- Score lines (AI_Governors.csv): best slot values ${t.assignEqual} / ${t.assignLines}, promotion scores ${t.promoEqual} / ${t.promoLines}; first miss: ${t.firstScoreMiss ?? '-'}.`,
    `- The choice (appoint / promote) against Governors.csv: ${t.choiceEqual} / ${t.choices} turns the log takes one, ${t.choiceExtra} taken where the log takes none; on the log's own scores ${t.loggedChoiceEqual} / ${t.choices}, ${t.loggedChoiceExtra} extra; first miss: ${t.firstChoiceMiss ?? '-'}.`,
    `- The seats against Governors.csv's assignments: ${t.assignEqualEvents} / ${t.assigns}, ${t.assignExtra} the log does not make; first miss: ${t.firstAssignMiss ?? '-'}.`,
    `- The roster against record t+1: governors changed ${t.rosterChanges}, the port's the record's ${t.rosterEqual}; first miss: ${t.firstRosterMiss ?? '-'}.`,
    '', '| governor | lines | equal |', '|---|---:|---:|'];
  for (const [g, [n, e]] of Object.entries(t.byGovernor)) out.push(`| ${g} | ${n} | ${e} |`);
  out.push('', '| promotion | lines | equal |', '|---|---:|---:|');
  for (const [p, [n, e]] of Object.entries(t.byPromotion).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0])) out.push(`| ${p} | ${n} | ${e} |`);
  out.push('', 'Misses:', '', ...t.misses.map((m) => `- ${m}`));
  return out;
}
