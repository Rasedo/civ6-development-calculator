/**
 * THE MAJORS' WORLD CONGRESS AS THE GAME'S AI VOTES IT (AI::CultureAi,
 * CultureAi.cpp; `tools/civ6lab/dll_readings.md` "C-97: the World Congress
 * AI").
 *
 * THE EVALUATION (0x622140, the CultureAi job, per resolution of the
 * session): each option's value (0x7b3be0) — its ResolutionEffects modifiers
 * summed (0x7a4b20) from turn 0 to a 30-turn horizon at the AI's discount
 * rate; the outcome the owner's Resolutions lists name (the player's +0x348:
 * favoured A, disfavoured B) with that option's value the desire; else the
 * better option, A on a tie, its value the desire.
 *
 * THE VOTES (0x628450, the session's handler): the owner's favor F; the
 * resolutions a list names first, then by desire, the highest first
 * (0x61dc50); each takes the votes it wants — the whole of half its desire
 * where F covers every resolution's half-desire votes, else the votes F x
 * desire / (the sum of the positive desires) buys — held to the votes F's
 * remainder buys and at least one, and F pays them (0x527680: s x n x (n - 1),
 * s = 5 through the game speed, whole; 0x527d80 the votes a sum buys).
 *
 * THE TARGET (0x611140 .. 0x612e50, by the resolution's AITargetChooser): the
 * TargetKind handler's hint (0x67dd40), else a "Random congress resolution
 * target" draw over the valid targets. Neither is read: the port names the
 * engine's own line (`MajorView.congressTarget`) and counts it.
 */
import { AI_RESOLUTIONS, AI_RESOLUTION_AGENDA_TRAITS, AI_RESOLUTION_LEADER_TRAITS, AI_RESOLUTION_LISTS,
  AI_RESOLUTION_LISTS_BY_STRATEGY, AI_RESOLUTION_LISTS_BY_TRAIT } from './tables';
import type { MajorView } from './view';
import { AI_RATE, FX } from '../../cpu/core/aiValue';
import { modifiersValue } from '../../cpu/core/aiModifiers';
import { COST_MULTIPLIER_PCT } from '../../cpu/data/constants';

/** the option values' horizon (0x622140: 0x1e) */
const CONGRESS_HORIZON = 30;
/** the vote price's step: 5 through the game speed (0x525400), whole */
export const CONGRESS_AI_STEP = Math.trunc(Math.trunc((5 * FX * COST_MULTIPLIER_PCT) / 100) / FX);

/** one resolution's evaluation: the outcome (1 = A, 2 = B), its desire raw
 *  24.8, whether a list names it */
export interface ResolutionEval { type: string; outcome: 1 | 2; desire: number; listed: boolean; values: [number, number] }

/** the owner's Resolutions lists' word on a resolution: 1 favoured, -1
 *  disfavoured, 0 none (the lists of its leader's traits, its agendas'
 *  traits and the strategies it follows) */
export function resolutionPreference(view: MajorView, seat: number, agendas: readonly string[], type: string): number {
  const traits = [...(AI_RESOLUTION_LEADER_TRAITS[view.leaderType(seat) ?? ''] ?? []),
    ...agendas.flatMap((a) => AI_RESOLUTION_AGENDA_TRAITS[a] ?? [])];
  const lists = [...traits.flatMap((t) => AI_RESOLUTION_LISTS_BY_TRAIT[t] ?? []),
    ...[...view.strategies(seat)].flatMap((s) => AI_RESOLUTION_LISTS_BY_STRATEGY[s] ?? [])];
  let p = 0;
  for (const l of lists) for (const it of AI_RESOLUTION_LISTS[l] ?? []) if (it.resolution === type) p = it.favored ? 1 : -1;
  return p;
}

/** an option's value (0x7b3be0): its modifiers summed to the horizon */
export function optionValue(view: MajorView, seat: number, type: string, option: 1 | 2): number {
  const r = AI_RESOLUTIONS.find((x) => x.type === type);
  if (!r) return 0;
  return modifiersValue({ view, seat, start: 0, horizon: CONGRESS_HORIZON, rate: AI_RATE }, r.effects[option - 1] ?? []);
}

/** THE EVALUATION (0x622140) of the session's resolutions */
export function evaluateResolutions(view: MajorView, seat: number, agendas: readonly string[],
                                    types: readonly string[]): ResolutionEval[] {
  return types.map((type) => {
    const v1 = optionValue(view, seat, type, 1);
    const v2 = optionValue(view, seat, type, 2);
    const pref = resolutionPreference(view, seat, agendas, type);
    if (pref > 0) return { type, outcome: 1, desire: v1, listed: true, values: [v1, v2] };
    if (pref < 0) return { type, outcome: 2, desire: v2, listed: true, values: [v1, v2] };
    return v1 < v2 ? { type, outcome: 2, desire: v2, listed: false, values: [v1, v2] }
      : { type, outcome: 1, desire: v1, listed: false, values: [v1, v2] };
  });
}

/** the favor `n` votes cost (0x527680) */
export const voteCost = (n: number, step = CONGRESS_AI_STEP): number => step * (Math.abs(n) - 1) * Math.abs(n);

/** the votes `favor` buys (0x527d80): 1 for none, else whole((sqrt(4 x favor
 *  / s + 1) + 1) x 0.5) in single precision */
export function votesFor(favor: number, step = CONGRESS_AI_STEP): number {
  if (favor <= 0) return 1;
  const f = Math.fround;
  const root = f(Math.sqrt(f(f(f(favor) * 4) / step) + 1));
  return Math.trunc(f(f(root + 1) * 0.5));
}

/** THE VOTES (0x628450): each resolution's votes, by type, from the owner's
 *  favor `favor` (whole) */
export function allocateVotes(evals: readonly ResolutionEval[], favor: number, step = CONGRESS_AI_STEP): Map<string, number> {
  const order = [...evals].sort((a, b) => (a.listed !== b.listed ? (a.listed ? -1 : 1) : b.desire - a.desire));
  const half = (d: number): number => Math.trunc((d >> 8) / 2);
  const totalCost = Math.max(1, order.reduce((s, e) => s + voteCost(half(e.desire), step), 0));
  const sumPos = Math.max(FX, order.reduce((s, e) => s + Math.max(e.desire, 0), 0));
  const over = totalCost > favor;
  // the favor per point of desire, x 100, 24.8 (0x16e940)
  const ratio = Math.trunc((favor * 100 * FX * FX) / sumPos);
  const out = new Map<string, number>();
  let left = favor;
  for (const e of order) {
    const cap = Math.max(votesFor(Math.max(left, 0), step), 0);
    const want = over ? votesFor(Math.trunc((ratio * e.desire) / (100 * FX)) >> 8, step) : (Math.trunc((e.desire * FX) / (2 * FX)) >> 8);
    const n = Math.max(1, Math.min(want, cap));
    out.set(e.type, n);
    left -= voteCost(n, step);
  }
  return out;
}

/** THE OWNER'S BALLOT for the session's resolutions (`slate`: the engine's
 *  resolution indices and their install types, in slate order): [the
 *  outcome (0 = A, 1 = B), the target, the extra votes] per slot, as the
 *  record's `vote` carries it */
export function congressBallot(view: MajorView, seat: number, agendas: readonly string[],
                               slate: readonly { index: number; type: string }[]): {
  vote: [number, number, number][]; evals: ResolutionEval[]; votes: Map<string, number> } {
  const evals = evaluateResolutions(view, seat, agendas, slate.map((s) => s.type));
  const votes = allocateVotes(evals, Math.floor(view.favor(seat)));
  const vote = slate.map((s, k) => {
    const e = evals[k];
    return [e.outcome - 1, view.congressTarget(seat, s.index), (votes.get(s.type) ?? 1) - 1] as [number, number, number];
  });
  return { vote, evals, votes };
}
