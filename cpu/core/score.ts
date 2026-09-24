/**
 * THE EMPIRE SCORE weights: `rules.score` ships them to the GPU, which scores
 * a seat from them (`seat_score`).
 */
import type { YieldKey } from './types';

export const BALANCED_WEIGHTS: Partial<Record<YieldKey, number>> = {
  food: 1,
  production: 2,
  gold: 1,
  science: 1.5,
  culture: 1.5,
  faith: 0.75,
};
