/** In-state seeded RNG: serialized with the game, so runs are replayable. */

import type { GameState } from './types';

/** Advance the game's RNG and return a float in [0, 1). */
export function nextRandom(state: GameState): number {
  let a = state.rngState | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = a;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
