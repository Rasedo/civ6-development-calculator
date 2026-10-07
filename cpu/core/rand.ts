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

/**
 * The label of a draw: the game's own label for the site (the third argument
 * of 0x8b6c10, `tools/civ6lab/dll_rng.py`; the draw log `Logs/RandCalls.csv`
 * writes it), or, for a draw the game takes at no labelled site, an
 * `Engine:` name — the driver's stand-ins for the AI's choices and the
 * engines' rules the game draws otherwise (`cpu/harness/drawSites.ts`).
 */
export type DrawLabel =
  // the turn's random-event step
  | 'Random Event Roll' | 'Active Volcano Roll' | 'Choose Active Volcano Roll' | 'Choose Inactive Volcano Roll'
  | 'Storm Direction' | 'Storm Direction Preview' | 'Pick Storm Start Plot' | 'Pick One Off Start Plot' | 'Pick Drought Start Plot'
  | 'Pillage Improvement Chance' | 'Boosted Yield Chance' | 'Fertility Gain Chance' | 'Remove Fertility Chance'
  | 'Random Event Unit Damage Roll'
  // a player's start and actions
  | 'GetNextBuyablePlot picker' | 'Unit Combat Damage' | 'Unit Capture Chance' | 'Random Promotion'
  | 'Generating a random new Great Person' | 'World Congress Resolutions'
  | 'Choosing random tech boost to grant based on era' | 'Choosing random civic boost to grant based on era'
  | 'Choosing random tech to grant based on era' | 'Choosing random civic to grant based on era'
  | 'Choosing a Goody Hut Type' | 'Choosing a Sub Type' | 'Choosing a Relic' | 'Choosing a City Name' | 'Choosing a Citizen Name'
  | 'Rolling Espionage Result' | 'Police Exit Covered' | 'Rolling Concert Result' | 'Free Cities Unit Choice'
  // the engines' draws at no labelled site of the game's
  | 'Engine: minor walk' | 'Engine: minor plan' | 'Engine: minor buy' | 'Engine: minor builders' | 'Engine: pantheon'
  | 'Engine: partisans' | 'Engine: breached dam'
  // the barbarians' turn
  | 'Barbarian camp region placement' | 'Barbarian camp location' | 'Barb Tribe Roll' | 'Barbarian Ranged unit roll';

function step(state: GameState): number {
  const s = (Math.imul(LCG_MUL, state.rngState) + LCG_ADD) >>> 0;
  state.rngState = s;
  return s;
}

/** A point of the turn the game's own record witnesses the generator at: a
 *  seat's start of turn (`seat`, a city-state's included) or the turn's
 *  random-event step (`step`). */
export type RngPoint = { kind: 'seat' | 'step'; seat: number; turn: number };

/** The action replay's hold on the generator (`cpu/harness/streamHold.ts`):
 *  `point` gives the game's state at a witnessed point, `draw` places the
 *  generator before each labelled draw. */
export interface RngHooks {
  point(state: GameState, point: RngPoint): number | undefined;
  draw(state: GameState, max: number, label: DrawLabel): void;
}

let hooks: RngHooks | null = null;

/** Hold the generator on the game's stream (the action replay), or let it
 *  run free (null): outside a replay every hold is a no-op. */
export function holdRng(h: RngHooks | null): void {
  hooks = h;
}

/** the game's draw in [0, max): the new state's top 16 bits times max read
 *  as 16 bits, over 2^16; a max of 0 draws 0 and still steps */
export function randRange(state: GameState, max: number, label: DrawLabel): number {
  if (hooks) hooks.draw(state, max, label);
  return ((step(state) >>> 16) * (max & 0xffff)) >>> 16;
}

/** the game's weighted picker (Utilities_WeightedVector, 0x287c00): ONE draw
 *  over the weights' total, the first entry whose running sum passes it; -1
 *  past them all. `_rand_weighted` is the twin. */
export function randWeighted(state: GameState, weights: readonly number[], label: DrawLabel): number {
  let total = 0;
  for (const w of weights) total += w;
  let v = randRange(state, total, label);
  for (let i = 0; i < weights.length; i++) {
    v -= weights[i];
    if (v < 0) return i;
  }
  return -1;
}

/** The generator at a witnessed point: the game's state there where a replay
 *  holds it, else as it stands. */
export function atRngPoint(state: GameState, point: RngPoint): void {
  if (!hooks) return;
  const s = hooks.point(state, point);
  if (s !== undefined) state.rngState = s >>> 0;
}
