import type { GameState } from './types';
import { ERA_LENGTH } from '../data/rivals';

// ---------------------------------------------------------------------------
// B-24 (task #68, gpu/GOVERNORS_DESIGN.md): era score / Ages.
// Unified civ ids: 0 = the player, r+1 = rival r (the civsAtWar convention).
// S1 ships the ACCUMULATOR inert — every hook is a plain `+= const`
// (zero-draw); nothing reads the score yet. Ages land in S2 at the boundary.
// ---------------------------------------------------------------------------

/** Accrue era score for unified civ `civ`. Lazy array — absent entries are 0,
 *  so importers/older saves need no migration. */
export function addEraScore(state: GameState, civ: number, pts: number): void {
  const arr = (state.eraScore ??= []);
  arr[civ] = (arr[civ] ?? 0) + pts;
}

/** Era boundary — runs right AFTER `state.turn += 1` in endTurn (the GPU
 *  mirrors at its own turn increment). At each ERA_LENGTH multiple the
 *  accumulators reset for the new era's window. S2 will read the just-ended
 *  window here (before the reset) to assign each civ's Age. */
export function eraBoundary(state: GameState): void {
  if (state.turn % ERA_LENGTH !== 0) return;
  state.eraScore = [];
}
