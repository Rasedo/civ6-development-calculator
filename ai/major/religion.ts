/**
 * THE MAJORS' RELIGION AI, as Civ 6's runs it (GameCore_XP2 AI::Religious,
 * Religious.cpp; `tools/civ6lab/dll_readings.md` "C-97: the religion AI").
 *
 * THE BELIEF LIST (AI::Religious +0x3b0): an entry per belief in database
 * order, each with its class, a taken flag and a score; the "Belief
 * Analysis" job scores every entry (0x7500d0) and the AI turn (0x74fbf0)
 * logs the list (0x750e30, AI_Religious.csv: turn, player, belief, score).
 * A player the job never runs for (a city-state, the Free Cities, the
 * barbarians) logs -1.0 throughout.
 *
 * THE PICKS. The pantheon (0x74e2b0, when the AI turn finds it must found
 * one): the first highest-scoring pantheon belief not taken. A religion's
 * belief (0x751430, at the founding and at each belief the religion may add):
 * the highest-scoring belief not taken of a class the religion has room for,
 * a Follower belief before any other. The religion founded (0x750fe0): the
 * leader's favored religion, then the civilization's, the first no one has
 * founded; else a draw over the religions left ("Random Religion Choice").
 *
 * THE ACTIONS. Each pick goes on the seat's action record, the format an RL
 * agent emits too: the pantheon's row (`pantheon`), the founding's religion
 * and beliefs (`religion`, `beliefs`), an enhancement's beliefs; the engine
 * re-validates and applies them.
 */
import { AI_BELIEFS, AI_FAVORED_RELIGIONS_BY_CIV, AI_FAVORED_RELIGIONS_BY_LEADER, AI_RELIGIONS } from './tables';
import type { AiBelief } from './types';
import type { MajorView } from './view';
import type { SeatActionRecord } from '../../cpu/core/types';
import { AI_BELIEF_HORIZON } from '../../cpu/data/aiValue';
import { AI_RATE, FX_MIN } from '../../cpu/core/aiValue';
import { modifiersValue, type AiCitySubject, type ValueTerms } from '../../cpu/core/aiModifiers';

/** an entry the job leaves taken, or never scores: -1.0 */
export const BELIEF_TAKEN = -256;

/** the class index the DLL's BeliefClassTypes enumeration gives (the
 *  BeliefClasses rows in order) */
const CLASS_INDEX: Readonly<Record<string, number>> = {
  BELIEF_CLASS_PANTHEON: 0, BELIEF_CLASS_FOLLOWER: 1, BELIEF_CLASS_WORSHIP: 2, BELIEF_CLASS_FOUNDER: 3, BELIEF_CLASS_ENHANCER: 4,
};
export const beliefClassIndex = (b: AiBelief): number => CLASS_INDEX[b.class] ?? -1;

/** a seat's belief scores, by BeliefType, in database order (the list's
 *  entries' +0x14), fixed point */
export type BeliefScores = ReadonlyMap<string, number>;

/** the religion a belief's value is of (0x7a7400: context +0x48): the
 *  religion the seat founded, else the one most of its cities follow, -1 for
 *  none */
export function evaluationReligion(view: MajorView, seat: number): number {
  return view.religionFounded(seat) ?? view.majorityReligion(seat) ?? -1;
}

/**
 * ONE BELIEF'S VALUE (0x7a7400): from turn 0 to the horizon
 * (`m_valueHorizons`[2]) at the AI's rate, FX_MIN where the horizon is not
 * past the start; else its modifiers' sum (0x7a4b20) in a context of the
 * seat, the religion (`evaluationReligion`) and the cities its knowledge base
 * holds (`known`, the COLLECTION_ALL_CITIES walk).
 */
export function beliefValue(view: MajorView, seat: number, b: AiBelief, known: readonly AiCitySubject[]): number {
  const t: ValueTerms = { view, seat, start: 0, horizon: AI_BELIEF_HORIZON, rate: AI_RATE,
    religion: evaluationReligion(view, seat), known };
  if (t.start >= t.horizon) return FX_MIN;
  return modifiersValue(t, b.modifiers);
}

/**
 * THE JOB'S SCORE of one entry (0x7500d0): -1.0, taken, for a belief a
 * pantheon or a religion holds (0x3408d0 / 0x340950) and for one of a class
 * the seat's own religion already holds; else its value.
 */
export function beliefScore(view: MajorView, seat: number, b: AiBelief, known: readonly AiCitySubject[],
                            held: ReadonlySet<string> = view.beliefsHeld()): number {
  if (held.has(b.type)) return BELIEF_TAKEN;
  const cls = beliefClassIndex(b);
  for (const own of view.religionBeliefs(seat)) {
    const ob = AI_BELIEFS.find((x) => x.type === own);
    if (ob && beliefClassIndex(ob) === cls) return BELIEF_TAKEN;
  }
  return beliefValue(view, seat, b, known);
}

/** every entry's score, in database order (the "Belief Analysis" job) */
export function beliefScores(view: MajorView, seat: number, known: readonly AiCitySubject[]): BeliefScores {
  const held = view.beliefsHeld();
  return new Map(AI_BELIEFS.map((b) => [b.type, beliefScore(view, seat, b, known, held)] as const));
}

/** the score's taken flag: the job sets it with the -1.0 */
const taken = (scores: BeliefScores, b: AiBelief): boolean => scores.get(b.type) === BELIEF_TAKEN;

/**
 * THE PANTHEON (0x74e2b0): over the list in order, the pantheon beliefs not
 * taken, the first strictly above the best so far (the first one stands
 * whatever it scores); null where none is left.
 */
export function pantheonPick(scores: BeliefScores): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const b of AI_BELIEFS) {
    if (beliefClassIndex(b) !== 0 || taken(scores, b)) continue;
    const s = scores.get(b.type) ?? BELIEF_TAKEN;
    if (s > bestScore || best === null) {
      best = b.type;
      bestScore = s;
    }
  }
  return best;
}

/**
 * A BELIEF FOR THE RELIGION (0x751430): over the list in order, the
 * beliefs not taken of a religion's class (not the pantheon's) whose class
 * the religion has room for (0x3409a0: one belief a class); one scoring
 * above the best so far, or any while none stands, is taken; a Follower
 * belief takes the place of a best of another class whatever it scores, and
 * once a Follower belief stands only a better Follower belief replaces it.
 * `classesHeld`: the classes the religion holds (the beliefs added so far
 * this founding included). Null where none is left.
 */
export function religionBeliefPick(scores: BeliefScores, classesHeld: ReadonlySet<number>): string | null {
  let best: string | null = null;
  let bestScore = 0;
  let bestFollower = false;
  for (const b of AI_BELIEFS) {
    const cls = beliefClassIndex(b);
    const follower = cls === 1;
    if (taken(scores, b) || cls <= 0) continue;
    const s = scores.get(b.type) ?? BELIEF_TAKEN;
    if (!(s > bestScore || best === null)) {
      if (bestFollower || !follower) continue;
    }
    if (classesHeld.has(cls)) continue;
    if (bestFollower && !follower) continue;
    best = b.type;
    bestScore = s;
    bestFollower = follower;
  }
  return best;
}

/** the beliefs a founding adds (0x750fe0's loop and the add-belief signal,
 *  each 0x751430 on the scores the founding reads): `n` picks, each
 *  filling its class */
export function foundingBeliefs(scores: BeliefScores, classesHeld: ReadonlySet<number>, n: number): string[] {
  const held = new Set(classesHeld);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const b = religionBeliefPick(scores, held);
    if (!b) break;
    out.push(b);
    held.add(beliefClassIndex(AI_BELIEFS.find((x) => x.type === b)!));
  }
  return out;
}

/**
 * THE RELIGION THE AI FOUNDS (0x750fe0): the leader's FavoredReligions, then
 * the civilization's, the first no player has founded (0x340490); else one
 * of the religions left — neither the pantheon's row nor one that needs a
 * custom name, none founded — by `draw(n)` ("Random Religion Choice", a draw
 * over their count); null where none is left.
 */
export function religionChoice(view: MajorView, seat: number, founded: ReadonlySet<string>,
                               draw: (n: number) => number): string | null {
  const leader = view.leaderType(seat);
  const civ = view.civilizationType(seat);
  for (const r of [...(leader ? AI_FAVORED_RELIGIONS_BY_LEADER[leader] ?? [] : []),
                   ...(civ ? AI_FAVORED_RELIGIONS_BY_CIV[civ] ?? [] : [])]) {
    if (!founded.has(r)) return r;
  }
  const left = AI_RELIGIONS.filter((r, i) => i !== 0 && !r.customName && !founded.has(r.type));
  return left.length ? left[draw(left.length)].type : null;
}

/** the pantheon pick as the seat's action record, nothing where the seat may
 *  found none now or the pick names no row the engine carries */
export function pantheonRecord(view: MajorView, seat: number, scores: BeliefScores): Pick<SeatActionRecord, 'pantheon'> {
  if (!view.pantheonOpen(seat)) return {};
  const b = pantheonPick(scores);
  const col = b ? view.pantheonColumn(b) : -1;
  return col >= 0 ? { pantheon: col } : {};
}

/** beliefs as the record's [class, row] pairs, the Follower first (the
 *  order a founding names them in) */
function beliefPairs(view: MajorView, beliefs: readonly string[]): [number, number][] | null {
  const out: [number, number][] = [];
  for (const b of beliefs) {
    const col = view.beliefColumn(b);
    if (!col) return null;
    out.push([col[0], col[1]]);
  }
  return out;
}

/**
 * THE FOUNDING as the seat's action record (0x750fe0): the religion
 * (`religionChoice`, `draw` the game's "Random Religion Choice") and the
 * beliefs the founding grants, each 0x751430 on the scores; nothing where
 * the seat may not found now or a pick names no row the engine carries.
 */
export function foundingRecord(view: MajorView, seat: number, scores: BeliefScores, initial: number,
                               draw: (n: number) => number): Pick<SeatActionRecord, 'religion' | 'beliefs'> {
  if (!view.religionOpen(seat)) return {};
  const r = religionChoice(view, seat, view.religionsFounded(), draw);
  const col = r ? view.religionColumn(r) : -1;
  const pairs = beliefPairs(view, foundingBeliefs(scores, new Set(), initial));
  if (col < 0 || !pairs || pairs.length !== initial) return {};
  return { religion: col, beliefs: pairs };
}

/** the beliefs an enhancement adds as the seat's action record (each
 *  0x751430 on the classes the religion holds) */
export function enhanceRecord(view: MajorView, seat: number, scores: BeliefScores): Pick<SeatActionRecord, 'beliefs'> {
  const n = view.beliefPicks(seat);
  if (n <= 0) return {};
  const held = new Set(view.religionBeliefs(seat).flatMap((b) => {
    const x = AI_BELIEFS.find((y) => y.type === b);
    return x ? [beliefClassIndex(x)] : [];
  }));
  const pairs = beliefPairs(view, foundingBeliefs(scores, held, n));
  return pairs && pairs.length === n ? { beliefs: pairs } : {};
}
