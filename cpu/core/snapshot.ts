/**
 * Exact state capture for the TS engine.
 *
 * `node:v8` rather than JSON: it preserves shared references and cycles, so a
 * restored state is the one that was captured. JSON hands back independent
 * copies of aliased objects, after which a write through one view is invisible
 * through the other — the divergence is silent and looks like an engine bug.
 *
 * Distinct from `serialize`/`deserialize` in game.ts: those are a SAVE FORMAT
 * and deliberately lenient, filling defaults for older saves. A capture must
 * be exact, so it is a different function with a different contract.
 *
 * Storage is the caller's business — these hand back a Buffer and take one.
 */
import { deserialize, serialize } from 'node:v8';
import type { GameState } from './types';

/** Capture `state` exactly. */
export function captureState(state: GameState): Buffer {
  return serialize(state);
}

/** Rebuild the state a `captureState` buffer holds. */
export function restoreState(buf: Buffer): GameState {
  return deserialize(buf) as GameState;
}
