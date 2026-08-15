/**
 * THE EMPIRE SCORE — the RL reward, and the one thing that outlived the
 * UI-era advisor family (#100): `rules.score` ships these weights to the GPU,
 * every consumer reads `empireScore`, and the
 * two engines must agree on it bit for bit.
 */
import type { GameState, YieldKey } from './types';
import { seatOf } from './seats';
import { computeCityStats } from './city';

export type ScoreObjective = 'science' | 'culture' | 'gold' | 'production' | 'food' | 'balanced';

export const BALANCED_WEIGHTS: Partial<Record<YieldKey, number>> = {
  food: 1,
  production: 2,
  gold: 1,
  science: 1.5,
  culture: 1.5,
  faith: 0.75,
};

export function empireScore(state: GameState, seat: number, objective: ScoreObjective): number {
  let score = 0;
  for (const city of seatOf(state, seat)!.cities) {
    const stats = computeCityStats(state, city);
    if (objective === 'food') {
      score += city.population * 10 + stats.total.food;
    } else if (objective === 'balanced') {
      score += city.population * 3;
      for (const [k, w] of Object.entries(BALANCED_WEIGHTS)) {
        score += stats.total[k as YieldKey] * (w ?? 0);
      }
    } else {
      score += stats.total[objective] + city.population; // pop tiebreak keeps expansion honest
    }
  }
  return score;
}
