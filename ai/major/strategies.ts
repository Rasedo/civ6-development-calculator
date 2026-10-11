/**
 * THE MAJORS' STRATEGIES, as Civ 6's victory manager picks and drops them
 * (GameCore_XP2 AI/VictoryStrategy.cpp, `this` the player's victory manager
 * at GrandStrategic +0x508; `tools/civ6lab/dll_readings.md` "C-97: the
 * victory manager's strategies"). Its log is AI_Victories.csv ("%d, %d, %s,
 * %s": the turn, the player, the strategy, Following / Exclusive / Stopped /
 * Forbidden), one line per strategy changed.
 *
 * THE EVALUATION (0x7bc580, the manager's job): per strategy in database
 * order (AI_STRATEGIES) — none for one disqualified for good (+0x48); a
 * victory strategy whose victory is off is disqualified; so is one whose
 * conditions needed, its leader's and civilization's Strategies lists' bias
 * (+0xa8, 0x622e90) added, outnumber its conditions. Else every condition in
 * database order is asked (the registry 0x7bd310): a true one marks the
 * strategy exclusive where it is an Exclusive row, else counts; a true
 * Disqualifier disqualifies it for good and stops the walk; a true Forbidden
 * row forbids it for the turn. A forbidden strategy changes where it
 * follows (it stops). Else, from the turn its last change allows (+0x90, the
 * change's turn + 20): the count reaching the conditions needed changes it
 * where it does not follow, falling short changes it where it does.
 *
 * THE APPLY (0x7bb3e0): the first victory strategy marked exclusive that
 * follows or changes makes every other victory strategy that follows change
 * (stop) and every other's change void. Then each changed strategy stops
 * where it follows, else starts unless disqualified; a start or a stop sets
 * the turn of its next change to this turn + 20 (0x7bf160 / 0x7bb870).
 *
 * THE ISLAND (GrandStrategic 0x6fafc0, after the apply; the "Is On Island"
 * condition reads it the next turn): while no city's landmass was more than
 * half revealed, or the player stood on an island: per own city in order,
 * one on a landmass more than half of which the player has revealed decides
 * — an island while the landmass's coastal plots reach
 * AI_ISLAND_COAST_PERCENTAGE of its plots, the first that does not ending
 * the walk. The share is read here from the player's revealed plots; the
 * game's is its knowledge base's count per landmass (+0x2e8, refreshed at
 * 0x783980 from a per-plot visibility word), which turns later
 * (runs/h1_duelv1124: Qin's Naval strategy at t71, here at t48).
 *
 * The conditions not read (0x6fe2b0 "Has Settle Spot", the city AI's threat
 * +0x1b8 "Cities Under Threat", the diplomacy array +0x9d0 "Has Opponents"
 * reads besides war) read false and are counted (`StrategyGaps`).
 */
import { AI_ERAS, AI_GLOBALS, AI_STRATEGIES, AI_STRATEGY_BIAS_BY_CIV, AI_STRATEGY_BIAS_BY_LEADER } from './tables';
import type { AiStrategy, AiStrategyBias, AiStrategyCondition } from './types';
import type { MajorView } from './view';
import { AI_DIFFICULTIES } from '../../cpu/data/aiTables';
import { AI_YIELDS } from '../../cpu/core/aiWeights';
import {
  knowledgeRecord, knowledgeTurn, newKnowledge, yieldAdvantage, yieldDefaults, type AiYieldDefaults, type KnowledgeBase,
} from './knowledge';

/** a change's wait before the strategy may change again */
const CHANGE_TURNS = 20;

export type StrategyStatus = 'Following' | 'Exclusive' | 'Stopped' | 'Forbidden';

export interface StrategyChange {
  strategy: string;
  status: StrategyStatus;
}

/** one major's victory manager */
export interface SeatStrategies {
  active: Set<string>;
  /** disqualified for good */
  disqualified: Set<string>;
  /** the turn each strategy may change again */
  nextChange: Map<string, number>;
  /** the conditions-needed bias of the leader's and civilization's lists */
  bias: Map<string, number>;
  knowledge: KnowledgeBase;
  /** GrandStrategic +0x440: a city's landmass more than half revealed */
  landmassRevealed: boolean;
  /** GrandStrategic +0x4a0 */
  island: boolean;
}

export interface StrategyMemory {
  defaults: AiYieldDefaults | null;
  seats: Map<number, SeatStrategies>;
  /** each major's PlayerStats military strength as its last update stored
   *  it (each player's turn start, before its production; the caller stores
   *  `militaryStrengths`), the rank conditions' reading */
  military: ReadonlyMap<number, number>;
}

/** the conditions the port reads as false, counted per evaluation */
export type StrategyGaps = Map<string, number>;

/** a strategy's evaluation: each condition's answer, the count, the need */
export type StrategyTrace = (strategy: string, said: readonly boolean[], count: number, need: number) => void;

export const newStrategyMemory = (): StrategyMemory => ({ defaults: null, seats: new Map(), military: new Map() });

/** PlayerStats' update (0x4bc720): each major's military strength now */
export function militaryStrengths(view: MajorView): Map<number, number> {
  return new Map(view.majors().map((o) => [o, view.militaryStrength(o)] as const));
}

const within = (r: AiStrategyBias, h: number): boolean =>
  (!r.minDifficulty || AI_DIFFICULTIES.indexOf(r.minDifficulty) <= h) && (!r.maxDifficulty || AI_DIFFICULTIES.indexOf(r.maxDifficulty) >= h);

function seatStrategies(view: MajorView, mem: StrategyMemory, seat: number): SeatStrategies {
  let st = mem.seats.get(seat);
  if (st) return st;
  const h = view.handicap(seat);
  const bias = new Map<string, number>();
  const leader = view.leaderType(seat);
  const civ = view.civilizationType(seat);
  for (const r of [...(leader ? AI_STRATEGY_BIAS_BY_LEADER[leader] ?? [] : []), ...(civ ? AI_STRATEGY_BIAS_BY_CIV[civ] ?? [] : [])]) {
    if (within(r, h)) bias.set(r.strategy, (bias.get(r.strategy) ?? 0) + r.value);
  }
  st = { active: new Set(), disqualified: new Set(), nextChange: new Map(), bias, knowledge: newKnowledge(),
    landmassRevealed: false, island: false };
  mem.seats.set(seat, st);
  return st;
}

const YIELD_OF: Readonly<Record<string, string>> = {
  'Good Faith City': 'YIELD_FAITH', 'Good Tech City': 'YIELD_SCIENCE', 'Good Culture City': 'YIELD_CULTURE',
};
const ERA_OF: Readonly<Record<string, string>> = {
  'Is Ancient': 'ERA_ANCIENT', 'Is Classical': 'ERA_CLASSICAL', 'Is Medieval': 'ERA_MEDIEVAL', 'Is Renaissance': 'ERA_RENAISSANCE',
  'Is Industrial': 'ERA_INDUSTRIAL', 'Is Modern': 'ERA_MODERN', 'Is Atomic': 'ERA_ATOMIC', 'Is Information': 'ERA_INFORMATION',
};
const GP_OF: Readonly<Record<string, string>> = {
  'Has Great Writer': 'GREAT_PERSON_CLASS_WRITER', 'Has Great Artist': 'GREAT_PERSON_CLASS_ARTIST',
  'Has Great Musician': 'GREAT_PERSON_CLASS_MUSICIAN',
};
const PROPHET = 'GREAT_PERSON_CLASS_PROPHET';

interface CondCtx {
  view: MajorView;
  mem: StrategyMemory;
  seat: number;
  st: SeatStrategies;
  defaults: AiYieldDefaults;
  agendas: readonly string[];
  gaps: StrategyGaps;
}

/** n x thr% + 0.5 truncated, the float the rank conditions take */
const rankBar = (n: number, pct: number): number => Math.trunc(Math.fround(Math.fround(Math.fround(pct * Math.fround(0.01)) * n) + 0.5));

/** ONE CONDITION (the registry's function), true or false */
function condition(c: CondCtx, row: AiStrategyCondition): boolean {
  const { view, seat, st } = c;
  const thr = row.threshold;
  const majors = view.majors();
  const others = majors.filter((o) => o !== seat);
  const fn = row.fn;
  if (fn in ERA_OF) return view.playerEra(seat) >= AI_ERAS.indexOf(ERA_OF[fn]);
  if (fn in YIELD_OF) {
    // 0x7bcd60: a city whose advantage reaches the threshold
    const k = AI_YIELDS.indexOf(YIELD_OF[fn] as (typeof AI_YIELDS)[number]);
    const at = new Map(view.mapCities().map((x) => [x.plot, x] as const));
    return view.cityPlots(seat).some((p) => {
      const city = at.get(p);
      return !!city && yieldAdvantage(st.knowledge, c.defaults, city.yields[k], k) >= thr << 8;
    });
  }
  if (fn in GP_OF) return view.greatPeopleOfClass(seat, GP_OF[fn]) >= thr;
  switch (fn) {
    case 'Is Not Major':
      return !majors.includes(seat);
    case 'Is In Dark Age':
      return view.darkAge(seat);
    case 'Fewer Cities':
      return view.cityPlots(seat).length <= thr;
    case 'Handicap at or below':
      return view.handicap(seat) <= thr;
    case 'Major Civ Wars':
      return others.filter((o) => view.atWar(seat, o)).length <= thr;
    case 'Is On Island':
      return st.island;
    case 'Has Agenda':
      return row.string !== null && c.agendas.includes(row.string);
    case 'Founded Religion':
      return view.religionFounded(seat) !== null;
    case 'Unconverted Cities':
      // 0x7bff10: the known cities with no majority religion
      return st.knowledge.cities.filter((e) => e.religion < 0).length >= thr;
    case 'Cannot Found Religion':
      // 0x7bada0: no religion founded, no prophet offered, none earned
      return view.religionFounded(seat) === null && !view.greatPersonOffered(PROPHET) && view.greatPeopleOfClass(seat, PROPHET) === 0;
    case 'Religion Destroyed': {
      // 0x7bf080: founded, and no city anywhere follows it
      const r = view.religionFounded(seat);
      return r !== null && !view.mapCities().some((x) => x.religion === r);
    }
    case 'Good Culture': {
      // 0x7bce30: the player and every major it met with no more Culture
      // than its own, against the threshold's share of them
      const mine = view.playerYield(seat, 'YIELD_CULTURE');
      let all = 1;
      let below = 1;
      for (const o of others) {
        if (view.metTurn(seat, o) === null) continue;
        all++;
        if (view.playerYield(o, 'YIELD_CULTURE') <= mine) below++;
      }
      return below >= Math.trunc((all * thr) / 100);
    }
    case 'Has Great Works':
      return view.greatWorksMade(seat) >= thr;
    case 'Tourists Taken': {
      // 0x7bfe50: the most domestic tourists of another major, its share
      // reached by the tourists the player draws
      let most = 0;
      for (const o of others) most = Math.max(most, view.domesticTourists(o));
      return most > 0 && view.visitingTourists(seat) >= Math.trunc(Math.fround(most * thr * Math.fround(0.01)));
    }
    case 'Has Taken Capital':
    case 'Has Diplomatic Victory Points':
    case 'Leads Diplomatic Victory Points':
    case 'Percentage Diplomatic Victory Points': {
      // 0x7bd1c0 (all four registered on it): the original capitals of
      // others the player holds
      const own = new Set(view.cityPlots(seat));
      return view.mapCities().filter((x) => own.has(x.plot) && x.originalCapital && x.originalOwner !== seat).length >= thr;
    }
    case 'Has Opponents': {
      // 0x7bd020: the majors at war with it (and those the diplomacy array
      // +0x9d0 marks, unread)
      gap(c, fn);
      return others.filter((o) => view.atWar(seat, o)).length >= thr;
    }
    case 'Leads Military': {
      // 0x7baa20: n majors less each stronger one, down to n x thr% + 0.5
      const mine = strength(c, seat);
      let left = majors.length;
      const bar = rankBar(majors.length, thr);
      for (const o of majors) if (strength(c, o) > mine && --left <= bar) return true;
      return false;
    }
    case 'Lags Military': {
      // 0x7babc0: one plus each stronger major, up to n x (1 - thr%) + 0.5
      const mine = strength(c, seat);
      let rank = 1;
      const bar = Math.trunc(Math.fround(Math.fround(Math.fround(1 - Math.fround(thr * Math.fround(0.01))) * majors.length) + 0.5));
      for (const o of majors) if (strength(c, o) > mine && ++rank >= bar) return true;
      return false;
    }
    case 'Leads Score': {
      const mine = view.score(seat);
      let left = majors.length;
      const bar = rankBar(majors.length, thr);
      for (const o of majors) if (view.score(o) > mine && --left <= bar) return true;
      return false;
    }
    case 'Next Lower Score': {
      // 0x7bebc0: the highest score below the player's (-1 for none), the
      // threshold short of it
      const mine = view.score(seat);
      let next = -1;
      for (const o of majors) {
        const v = view.score(o);
        if (v < mine && (v > next || next < 0)) next = v;
      }
      return next + thr < mine;
    }
    case 'Has Science Wonders':
      return view.scienceWonders(seat) >= thr;
    case 'Has Tech Lead': {
      // 0x7bd210: no more than n x thr% + 0.5 majors with more techs
      const mine = view.techCount(seat);
      const bar = rankBar(majors.length, thr);
      let more = 0;
      for (const o of majors) if (view.techCount(o) > mine && ++more > bar) return false;
      return true;
    }
    case 'Finished Space Project':
      return view.spaceProjects(seat) >= thr;
    default:
      gap(c, fn);
      return false;
  }
}

/** PlayerStats' military strength as the turn before stored it */
const strength = (c: CondCtx, seat: number): number => c.mem.military.get(seat) ?? 0;

function gap(c: CondCtx, fn: string): void {
  c.gaps.set(fn, (c.gaps.get(fn) ?? 0) + 1);
}

/** the strategy's conditions needed with the bias */
const needed = (st: SeatStrategies, s: AiStrategy): number => s.needed + (st.bias.get(s.type) ?? 0);

/**
 * ONE AI TURN of the seat's victory manager, at its turn's start: the
 * knowledge base's update, the evaluation and the apply, the island, then
 * the cities recorded. Returns the changes as AI_Victories.csv logs them.
 */
export function strategyTurn(view: MajorView, mem: StrategyMemory, seat: number, agendas: readonly string[], turn = view.turn,
                             gaps: StrategyGaps = new Map(), trace?: StrategyTrace): StrategyChange[] {
  mem.defaults ??= yieldDefaults(view);
  const st = seatStrategies(view, mem, seat);
  knowledgeRecord(view, st.knowledge, seat);
  knowledgeTurn(view, st.knowledge, seat);
  const ctx: CondCtx = { view, mem, seat, st, defaults: mem.defaults, agendas, gaps };
  const toggle = new Map<string, boolean>();
  const exclusive = new Set<string>();
  // THE EVALUATION
  for (const s of AI_STRATEGIES) {
    if (st.disqualified.has(s.type)) continue;
    const need = needed(st, s);
    if (need > s.conditions.length) {
      st.disqualified.add(s.type);
      toggle.set(s.type, true);
      continue;
    }
    let count = 0;
    let forbid = false;
    let dq = false;
    const said: boolean[] = [];
    for (const row of s.conditions) {
      const hit = condition(ctx, row);
      said.push(hit);
      if (!hit) continue;
      if (row.exclusive) exclusive.add(s.type);
      else count++;
      if (row.disqualifier) {
        st.disqualified.add(s.type);
        toggle.set(s.type, true);
        dq = true;
        break;
      }
      if (row.forbidden) forbid = true;
    }
    const on = st.active.has(s.type);
    trace?.(s.type, said, count, need);
    if (forbid) {
      toggle.set(s.type, on);
      continue;
    }
    if (dq) continue;
    if (turn < (st.nextChange.get(s.type) ?? -1)) continue;
    toggle.set(s.type, count >= need ? !on : on);
  }
  // THE APPLY: the first exclusive victory strategy
  let forced = false;
  for (const s of AI_STRATEGIES) {
    if (!s.victory || !exclusive.has(s.type)) continue;
    if (!st.active.has(s.type) && !toggle.get(s.type)) continue;
    for (const o of AI_STRATEGIES) {
      if (!o.victory || o.type === s.type) continue;
      if (st.active.has(o.type)) {
        toggle.set(o.type, true);
        forced = true;
      } else toggle.set(o.type, false);
    }
    break;
  }
  const changes: StrategyChange[] = [];
  for (const s of AI_STRATEGIES) {
    const t = toggle.get(s.type) ?? false;
    if (t) {
      if (st.active.has(s.type)) {
        st.active.delete(s.type);
        st.nextChange.set(s.type, turn + CHANGE_TURNS);
      } else if (!st.disqualified.has(s.type)) {
        st.active.add(s.type);
        st.nextChange.set(s.type, turn + CHANGE_TURNS);
      }
      const status: StrategyStatus = st.disqualified.has(s.type) ? 'Forbidden'
        : st.active.has(s.type) ? (exclusive.has(s.type) ? 'Exclusive' : 'Following') : 'Stopped';
      changes.push({ strategy: s.type, status });
    } else if (forced && st.active.has(s.type) && s.victory) {
      changes.push({ strategy: s.type, status: 'Exclusive' });
    }
  }
  islandTurn(view, st, seat);
  return changes;
}

/** THE ISLAND (0x6fafc0's walk over the player's cities) */
function islandTurn(view: MajorView, st: SeatStrategies, seat: number): void {
  if (st.landmassRevealed && !st.island) return;
  const plots = view.plots();
  const pct = AI_GLOBALS.AI_ISLAND_COAST_PERCENTAGE;
  for (const p of view.cityPlots(seat)) {
    const area = plots[p].area;
    if (area < 0) continue;
    let total = 0;
    let revealed = 0;
    let coastal = 0;
    for (const q of plots) {
      if (q.area !== area) continue;
      total++;
      if (view.revealed(seat, q.index)) revealed++;
      if (q.coastal) coastal++;
    }
    if (!(total > 0 && revealed / total > 0.5)) continue;
    st.landmassRevealed = true;
    if (coastal < Math.trunc((total * pct) / 100)) {
      st.island = false;
      return;
    }
    st.island = true;
  }
}

/** the strategies the seat follows */
export const followed = (mem: StrategyMemory, seat: number): ReadonlySet<string> => mem.seats.get(seat)?.active ?? new Set();
