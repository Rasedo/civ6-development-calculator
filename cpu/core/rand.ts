import type { GameState } from './types';

/**
 * CIV 6'S SYNCHRONOUS GENERATOR (GameCore_XP2_Release.dll's get 0x8b6c10,
 * `tools/civ6lab/dll_readings.md` "H-1: the random events' draws"): one
 * 32-bit state, the ANSI LCG state' = 1103515245 · state + 12345 (mod 2^32),
 * every draw one step. `randRange` is the game's own draw; `nextRandom` reads
 * the same step as a fraction of 2^32 for the draws whose game site the
 * engine does not yet follow. `_rand_range` / `_next_random` are the twins.
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

/** one step read as a fraction in [0, 1) */
export function nextRandom(state: GameState): number {
  return step(state) / 4294967296;
}
