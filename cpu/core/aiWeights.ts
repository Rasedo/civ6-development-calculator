/**
 * THE AI'S WEIGHTS (GameCore_XP2, `this` the player's AI::GrandStrategic;
 * `tools/civ6lab/dll_readings.md` "C-96 / C-97: the AI's yield weights and
 * the modifier evaluator").
 *
 * THE YIELD WEIGHT w[y] (0x702ad0) is the sum of five 24.8 parts; the yield
 * value (`aiValue.yieldValue`, 0x7a6690) pays a yield at (1 + min(w, 9.0)) of
 * its DefaultValue:
 * - the Religious AI's faith boost (0x74f5a0, Faith only) — reads 0 here: its
 *   religious unit choice ranks on the City Analysis values the engine does
 *   not run;
 * - the Economic AI's gold boost (0x687bf0, Gold only): -0.2 x the gold per
 *   turn while that is negative;
 * - the victory manager's Strategy_YieldPriorities rows of the strategies
 *   followed (PercentageDelta x 0.01; the install has none);
 * - the Yields lists (0x6fde70, 0x7ba440): the leader's and the
 *   civilization's trait lists (a list kept while the player's handicap lies
 *   in its MinDifficulty..MaxDifficulty) and the followed strategies' lists,
 *   each row Value x 0.01 (subtracted where Favored is false; an item kept
 *   while the handicap lies in its own bounds);
 * - the sensitivity boost (0x6fafc0): for a yield whose sensitivity s (the
 *   YieldSensitivities lists, the same sources) is above 0, over the player
 *   and every major it has met, with x their yield per turn: n > 1, the sample
 *   deviation sd > 0 and the player's x below the most -> s x (max - x) / sd.
 *
 * THE PSEUDO-YIELD WEIGHT (0x700810), which the pseudo-yield value
 * (`aiValue.pseudoYieldValue`, 0x7a60d0) pays at (1 + w): the followed
 * strategies' PseudoYields lists, each row Value x 0.01 taken twice (the
 * logged scores of the great person cards: 1124 player 1's Great Scientist
 * points +0.5 under the Science Victory strategy's +25, +1.2 under the
 * Medieval and Renaissance +30 each; no trait's PseudoYields list moves
 * them — China's Great Prophet points read 1.0 against
 * LowReligiousPreference's -75), held at -1.0 at least; PSEUDOYIELD_DISTRICT
 * adds 0.5 x the ChronologyIndex of the player's era (player +0x1358 +0xf8,
 * Eras +0x1c).
 *
 * The strategies followed are the majors' AI's own (ai/major/strategies.ts,
 * the victory manager's update), handed in by the caller; a city-state
 * follows none.
 */
import { AI_CIVILIZATION_TRAITS, AI_DIFFICULTIES, AI_LEADER_TRAITS, AI_LIST_ITEMS, AI_STRATEGY_LISTS, AI_STRATEGY_YIELD_PRIORITIES,
  AI_TRAIT_LISTS } from '../data/aiTables';
import { CIV_LEADERS } from '../data/seats';
import { FX, fmul, fxConst, type AiListItem, type AiListRef } from './aiValue';
import { civEraIndex, computeCityStats, luxuryAmenities } from './city';
import { getModifiers, unitUpkeep } from './effects';
import { wmdUpkeep } from './nuclear';
import { isCiv, majorsMet, seatOf } from './seats';
import { minorCity } from './cityStates';
import type { GameState, Seat } from './types';

/** the yields in YieldTypes order */
export const AI_YIELDS = ['YIELD_FOOD', 'YIELD_PRODUCTION', 'YIELD_GOLD', 'YIELD_SCIENCE', 'YIELD_CULTURE', 'YIELD_FAITH'] as const;

/** the Prince handicap, a Difficulties index: a seat with none set */
const PRINCE = AI_DIFFICULTIES.indexOf('DIFFICULTY_PRINCE');

/** What the weights take from the majors' AI: the strategies the player
 *  follows (its victory manager, ai/major/strategies.ts). */
export interface AiWeightInputs {
  strategies?: ReadonlySet<string>;
}

/** the strategies the player follows: a major's as its AI names them, a
 *  city-state's none */
export function followedStrategies(seat: number, inputs: AiWeightInputs = {}): string[] {
  if (!isCiv(seat)) return [];
  return [...(inputs.strategies ?? [])];
}

/** the seat's leader's and civilization's traits that carry a weight list */
function traitsOf(seat: number, s: Seat): readonly string[] {
  if (!isCiv(seat)) return [];
  const entry = CIV_LEADERS[s.civ];
  if (!entry) return [];
  return [...(AI_LEADER_TRAITS[`LEADER_${entry.leader}`] ?? []), ...(AI_CIVILIZATION_TRAITS[`CIVILIZATION_${entry.civ}`] ?? [])];
}

/** a row's difficulty bounds hold the handicap */
function within(r: AiListRef | AiListItem, h: number): boolean {
  return (!r.minDifficulty || AI_DIFFICULTIES.indexOf(r.minDifficulty) <= h) && (!r.maxDifficulty || AI_DIFFICULTIES.indexOf(r.maxDifficulty) >= h);
}

/** one system's sum per item over the lists the player's traits (`traits`)
 *  and strategies carry: each row fx(Value x 0.01), Favored false subtracted
 *  (0x6dd1b0) */
function listSum(seat: number, s: Seat, strategies: readonly string[], system: string, traits: boolean): Map<string, number> {
  const h = s.handicap ?? PRINCE;
  const lists: string[] = [];
  if (traits) for (const t of traitsOf(seat, s)) for (const r of AI_TRAIT_LISTS[t] ?? []) if (r.system === system && within(r, h)) lists.push(r.list);
  for (const st of strategies) for (const r of AI_STRATEGY_LISTS[st] ?? []) if (r.system === system && within(r, h)) lists.push(r.list);
  const out = new Map<string, number>();
  for (const l of lists) {
    for (const it of AI_LIST_ITEMS[l] ?? []) {
      if (!within(it, h)) continue;
      const v = fxConst(it.value * 0.01);
      out.set(it.item, (out.get(it.item) ?? 0) + (it.favored ? v : -v));
    }
  }
  return out;
}

/** the seat's gold per turn: its cities' net Gold (a city-state's one city's) less its units' and its
 *  devices' upkeep */
export function goldPerTurn(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  const lux = luxuryAmenities(state, seat);
  const mods = getModifiers(state, seat);
  let g = 0;
  for (const c of s.cities) g += computeCityStats(state, c, lux, mods).total.gold;
  // a city-state's one city
  const cs = state.cityStates.find((x) => x.seat === seat);
  if (cs) g += computeCityStats(state, minorCity(cs)).total.gold;
  for (const u of state.units) if (u.seat === seat) g -= unitUpkeep(mods, u);
  return g - wmdUpkeep(state, seat);
}

/** a yield per turn the sensitivity compares (Science and Culture carry
 *  sensitivity lists): the seat's last accrual's output */
function yieldPerTurn(state: GameState, seat: number, y: string): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  if (y === 'YIELD_SCIENCE') return s.sciRate ?? 0;
  if (y === 'YIELD_CULTURE') return s.culRate ?? 0;
  if (y === 'YIELD_GOLD') return goldPerTurn(state, seat);
  return 0;
}

/** THE YIELD WEIGHTS of a seat, raw 24.8 per YieldType (0x702ad0) */
export function yieldWeights(state: GameState, seat: number, inputs: AiWeightInputs = {}): Record<string, number> {
  const s = seatOf(state, seat);
  const w: Record<string, number> = Object.fromEntries(AI_YIELDS.map((y) => [y, 0]));
  if (!s) return w;
  const strategies = followedStrategies(seat, inputs);
  // the Economic AI's gold boost (0x687bf0)
  const gpt = goldPerTurn(state, seat);
  if (gpt < 0) w.YIELD_GOLD += fmul(fxConst(-0.2), fxConst(gpt));
  // the victory manager's Yields (Strategy_YieldPriorities)
  for (const r of AI_STRATEGY_YIELD_PRIORITIES) if (strategies.includes(r.strategy) && r.yield in w) w[r.yield] += fxConst(r.pct * 0.01);
  // the Yields lists
  for (const [y, v] of listSum(seat, s, strategies, 'Yields', true)) if (y in w) w[y] += v;
  // the sensitivity boost
  const sens = listSum(seat, s, strategies, 'YieldSensitivities', true);
  const others = state.seats.map((o) => o.seat).filter((o) => o !== seat && isCiv(o) && majorsMet(state, seat, o));
  for (const [y, sv] of sens) {
    if (!(y in w) || sv <= 0 || !others.length) continue;
    const xs = [seat, ...others].map((p) => yieldPerTurn(state, p, y));
    const n = xs.length;
    const max = Math.max(...xs);
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
    if (sd > 0 && xs[0] < max) w[y] += fmul(sv, fxConst((max - xs[0]) / sd));
  }
  return w;
}

/** THE PSEUDO-YIELD WEIGHTS of a seat, raw 24.8 per PseudoYieldType
 *  (0x700810); a pseudo-yield absent reads 0 */
export function pseudoYieldWeights(state: GameState, seat: number, inputs: AiWeightInputs = {}): Map<string, number> {
  const out = new Map<string, number>();
  const s = seatOf(state, seat);
  if (!s) return out;
  for (const [p, v] of listSum(seat, s, followedStrategies(seat, inputs), 'PseudoYields', false)) out.set(p, Math.max(2 * v, -FX));
  const chronology = civEraIndex(s.research.techs, s.research.civics) + 1;
  out.set('PSEUDOYIELD_DISTRICT', (out.get('PSEUDOYIELD_DISTRICT') ?? 0) + fxConst(0.5 * chronology));
  return out;
}
