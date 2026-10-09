/**
 * WHAT THE GAME'S AI SAYS A MODIFIER IS WORTH TO A PLAYER (GameCore_XP2,
 * the AI's modifier analysis): a policy's or a government's modifiers summed
 * one by one (0x7a4b20), each over its collection's subjects (0x6cede0, at
 * most 51) that its requirement set admits, by its effect's analyzer, each
 * analyzer's value truncated to a whole number. The analyzers this file
 * holds are the ones read; an effect it does not hold is worth 0 — as the
 * game's AI values an effect it registers no analyzer for (0x6c9640's list),
 * and short of it for the registered ones not yet read.
 */
import { AI_GOVERNMENTS, AI_GP_CLASS_PSEUDOYIELD, AI_PSEUDOYIELD_DEFAULT, AI_YIELD_DEFAULT } from './tables';
import type { AiModifier, AiRequirementSet } from './types';
import type { MajorView } from './view';
import { discounted, fx, fxMul, presentValue, valueBetween } from './fixed';

/** the global AI's discount rate, 2.0 percent (GlobalAI +0x290, written 0x200
 *  by its constructor 0x6db0cf and nowhere else) */
export const AI_DISCOUNT_RATE = 0x200;

/** THE HORIZON a policy's and a government's value runs to (the policy job
 *  0x621eb0 and the choice 0x625d70 pass `m_valueHorizons[0]`, GlobalAI
 *  +0x2f0): 19 turns, the one horizon the logged scores admit. With the
 *  Influence pseudo-yield's factor 1, which Diplomatic League's score forces
 *  (75 = 3 city-states x a 50-point token x 0.5 under the Chiefdom, 112 /
 *  150 / 187 as the token rises to 75 / 100 / 125), Charismatic Leader's +2
 *  reads 14 and Literary Tradition's +2 Writer points 15 at 19 alone; a
 *  city-state's Urban Planning 14 and God King 21 are its weight-0 values at
 *  19 (runs/h1_duelw1117 players 0-4). The table's filler as read
 *  (0x6dd9a0 through 0x5254d0) writes 50 turns at the speed's
 *  CostMultiplier, 25 at Online. */
export const AI_POLICY_HORIZON = 19;

/** One evaluation's terms (the analysis context 0x6ccd50 the analyzers read):
 *  the turn the value starts (+0xb4), its horizon (+0xb8), the rate (+0xbc). */
export interface ValueTerms {
  view: MajorView;
  seat: number;
  start: number;
  horizon: number;
  rate: number;
}

/** A yield's value to the player (0x7a6690): amount x Yields.DefaultValue x
 *  (1 + min(w, 9.0)) with w the player's yield weight (0x702ad0, the sum of
 *  five per-player arrays). The arrays' writers are not ported: every weight
 *  reads 0. `weighted` false is the analyzers that pass no player. */
export function yieldValue(amount: number, yieldType: string, weighted: boolean): number {
  const v = fxMul(amount, fx(AI_YIELD_DEFAULT[yieldType] ?? 1));
  if (!weighted) return v;
  const w = 0;
  return fxMul(v, Math.min(w, 9 * 256) + 256);
}

/** A pseudo-yield's value to the player (0x7a60d0): amount x
 *  PseudoYields.DefaultValue x the player's factor, (1 + w) + q: w the player
 *  AI's pseudo-yield weight (0x700810, at least -1.0), q 0 but for
 *  PSEUDOYIELD_DIPLOMATIC_BONUS toward a named player (0x655840). w's arrays'
 *  writers are not ported: the factor reads 1. */
export function pseudoYieldValue(amount: number, pseudo: string): number {
  return fxMul(amount, fx(AI_PSEUDOYIELD_DEFAULT[pseudo] ?? 1));
}

/** the whole part of a fixed value, as the analyzers add it (`sar 8`) */
const whole = (v: number): number => v >> 8;

type Subject = { kind: 'player' } | { kind: 'city'; id: number; capital: boolean };

/** a collection's subjects for the seat (the collection objects' iterators) */
function subjects(t: ValueTerms, collection: string): Subject[] | null {
  switch (collection) {
    case 'COLLECTION_OWNER': return [{ kind: 'player' }];
    case 'COLLECTION_PLAYER_CITIES': return t.view.cities(t.seat).map((c) => ({ kind: 'city', id: c.id, capital: c.capital }));
    case 'COLLECTION_PLAYER_CAPITAL_CITY': return t.view.cities(t.seat).filter((c) => c.capital).map((c) => ({ kind: 'city', id: c.id, capital: true }));
    default: return null;
  }
}

/** a modifier with no requirement set on its subjects: the one kind this
 *  file values (the set map GlobalAI +0x4d0 and its test 0x6cf3c0 are not
 *  read) */
const unconditional = (set: AiRequirementSet | undefined): boolean => !set || set.reqs.length === 0;

/** One analyzer: the value of the modifier's arguments on one subject, a
 *  whole number. */
type Analyzer = (t: ValueTerms, args: Readonly<Record<string, string>>, s: Subject) => number;

const amountOf = (args: Readonly<Record<string, string>>): number => (Number(args.Amount ?? 0) | 0) << 8;

const ANALYZERS: Readonly<Record<string, Analyzer>> = {
  // 0x6b8ba0: a city subject only; the yield at the player's weight, valued
  // from the start to the horizon (0x7a2140)
  EFFECT_ADJUST_CITY_YIELD_CHANGE: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const v = yieldValue(amountOf(args), args.YieldType ?? '', true);
    return whole(valueBetween(v, t.rate, t.start, t.horizon));
  },
  // 0x6b9d90: a city subject only; the city's whole yield (City::GetYield
  // 0x1cb8b0) capped at 100, times the percent, times 0.01f, at the player's
  // weight, valued from the start to the horizon
  EFFECT_ADJUST_CITY_YIELD_MODIFIER: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const type = args.YieldType ?? '';
    const have = Math.min(Math.floor(t.view.cityYield(t.seat, s.id, type)), 100);
    const amount = fx(Math.fround(Math.fround(have * (Number(args.Amount ?? 0) | 0)) * Math.fround(0.01)));
    return whole(valueBetween(yieldValue(amount, type, true), t.rate, t.start, t.horizon));
  },
  // 0x6a7d70: the yield unweighted (no player passed), PV(horizon) - PV(start)
  EFFECT_ADJUST_PLAYER_YIELD_CHANGE: (t, args) => {
    const v = yieldValue(amountOf(args), args.YieldType ?? '', false);
    return whole(presentValue(v, t.rate, t.horizon) - presentValue(v, t.rate, t.start));
  },
  // 0x6a0b10: the class's pseudo-yield, its present value to the horizon
  EFFECT_ADJUST_GREAT_PERSON_POINTS: (t, args) => {
    const pseudo = AI_GP_CLASS_PSEUDOYIELD[args.GreatPersonClassType ?? ''];
    if (!pseudo) return 0;
    return whole(presentValue(pseudoYieldValue(amountOf(args), pseudo), t.rate, t.horizon));
  },
  // 0x6afcd0: a player that may take Influence (0x449940); the game's
  // city-states (the list at Game +0x3f8 +0x1650) x the player's points a
  // token (Player_Influence +0x270: the government's InfluencePointsThreshold
  // at the game speed, 0x44eaa0) x the amount, as PSEUDOYIELD_INFLUENCE,
  // discounted from the start (0x7a1240)
  EFFECT_ADJUST_DUPLICATE_FIRST_INFLUENCE_TOKEN: (t, args) => {
    const gov = AI_GOVERNMENTS.find((g) => g.type === t.view.government(t.seat));
    if (!gov) return 0;
    const token = Math.trunc((gov.influenceThreshold * t.view.costMultiplierPct) / 100);
    const v = pseudoYieldValue(amountOf(args) * t.view.cityStates * token, 'PSEUDOYIELD_INFLUENCE');
    return whole(discounted(v, t.rate, t.start));
  },
  // 0x6ae510: PSEUDOYIELD_INFLUENCE, PV(horizon) - PV(start)
  EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN: (t, args) => {
    const v = pseudoYieldValue(amountOf(args), 'PSEUDOYIELD_INFLUENCE');
    return whole(presentValue(v, t.rate, t.horizon) - presentValue(v, t.rate, t.start));
  },
};

/** One modifier's value (0x6cede0 over its subjects, each analyzer's whole
 *  number added): 0 where its collection, requirements or effect are not
 *  read. */
export function modifierValue(t: ValueTerms, m: AiModifier): number {
  const an = ANALYZERS[m.effect];
  const subs = subjects(t, m.collection);
  if (!an || !subs || !unconditional(m.subjectReqs)) return 0;
  let sum = 0;
  for (const s of subs.slice(0, 51)) sum += an(t, m.args, s);
  return sum;
}

/** THE MODIFIERS' SUM (0x7a4b20): each modifier's whole value, held to
 *  +-0x7fffff, in fixed point */
export function modifiersValue(t: ValueTerms, mods: readonly AiModifier[]): number {
  let v = 0;
  for (const m of mods) v += Math.min(Math.max(modifierValue(t, m), -0x7fffff), 0x7fffff) * 256;
  return v;
}
