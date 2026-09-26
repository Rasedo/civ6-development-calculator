/**
 * TWO SCORES.
 *
 * THE EMPIRE SCORE weights: `rules.score` ships them to the GPU, which scores
 * a seat from them (`seat_score`) as the environment's reward.
 *
 * CIV 6'S SCORE (`SCORING_LINE_ITEMS`, cpu/data/scoring.ts): what the game's
 * scores panel shows and what the turn-limit victory ranks. The GPU twin is
 * `score_lines` / `leader` (gpu/core/sim_economy.py).
 */
import type { GameState, Seat } from './types';
import type { YieldKey } from './types';
import { SCORING_LINE_ITEMS, type ScoreCount } from '../data/scoring';
import { completedDistrictCount } from './yields';
import { seatWonders } from './wonders';

export const BALANCED_WEIGHTS: Partial<Record<YieldKey, number>> = {
  food: 1,
  production: 2,
  gold: 1,
  science: 1.5,
  culture: 1.5,
  faith: 0.75,
};

/** What each line item counts for one major seat. */
function scoreCounts(state: GameState, s: Seat): Record<ScoreCount, number> {
  const wonders = seatWonders(state, s.seat).length;
  let districts = wonders; // each completed wonder stands on its own district
  let population = 0;
  let buildings = 0;
  for (const c of s.cities) {
    districts += completedDistrictCount(state, c, false);
    population += c.population;
    buildings += c.buildings.length;
  }
  const r = s.religion;
  return {
    eraScore: (s.eraScorePast ?? 0) + (s.eraScore ?? 0),
    civics: s.research.civics.length,
    cities: s.cities.length,
    districts,
    population,
    greatPeople: s.gpEarned.length,
    religion: [r.follower, r.founder, r.worship, r.enhancer].filter((b) => b != null).length,
    techs: s.research.techs.length,
    wonders,
    buildings,
  };
}

/** A major seat's Score, line by line in `SCORING_LINE_ITEMS` order. */
export function scoreLines(state: GameState, s: Seat): number[] {
  const n = scoreCounts(state, s);
  return SCORING_LINE_ITEMS.map((l) => n[l.count] * l.multiplier * l.categoryMultiplier);
}

/** THE SCORE VICTORY's seat: the living major (one that holds a city) with
 *  the highest Score. A tie goes to the higher line in `TieBreakerPriority`
 *  order, then to the lower seat. -1 when no major holds a city. */
export function scoreLeader(state: GameState): number {
  let best = -1;
  let bestKey: number[] = [];
  for (const s of state.seats) {
    if (s.cities.length === 0) continue;
    const lines = scoreLines(state, s);
    const key = [lines.reduce((a, b) => a + b, 0), ...lines];
    const k = key.findIndex((v, i) => v !== bestKey[i]);
    if (best < 0 || (k >= 0 && key[k] > bestKey[k])) {
      best = s.seat;
      bestKey = key;
    }
  }
  return best;
}
