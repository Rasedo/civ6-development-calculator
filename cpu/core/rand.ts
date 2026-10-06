import type { GameState } from './types';

/**
 * CIV 6'S SYNCHRONOUS GENERATOR (GameCore_XP2_Release.dll's get 0x8b6c10,
 * `tools/civ6lab/dll_readings.md` "H-1: the random events' draws"): one
 * 32-bit state, the ANSI LCG state' = 1103515245 · state + 12345 (mod 2^32),
 * every draw one step. `randRange` is the game's own draw; `_rand_range` is
 * the twin.
 */
export const LCG_MUL = 1103515245;
export const LCG_ADD = 12345;

function step(state: GameState): number {
  const s = (Math.imul(LCG_MUL, state.rngState) + LCG_ADD) >>> 0;
  state.rngState = s;
  return s;
}

/** the game's draw in [0, max): the new state's top 16 bits times max read
 *  as 16 bits, over 2^16; a max of 0 draws 0 and still steps */
export function randRange(state: GameState, max: number): number {
  return ((step(state) >>> 16) * (max & 0xffff)) >>> 16;
}

/** the game's weighted picker (Utilities_WeightedVector, 0x287c00): ONE draw
 *  over the weights' total, the first entry whose running sum passes it; -1
 *  past them all. `_rand_weighted` is the twin. */
export function randWeighted(state: GameState, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let v = randRange(state, total);
  for (let i = 0; i < weights.length; i++) {
    v -= weights[i];
    if (v < 0) return i;
  }
  return -1;
}
