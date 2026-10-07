/**
 * CIV 6'S SYNCHRONOUS GENERATOR, as GameCore_XP2_Release.dll's get 0x8b6c10
 * runs it (`tools/civ6lab/dll_readings.md`, "H-1: the random events'
 * draws"): one 32-bit state, the ANSI LCG
 *
 *     state' = 1103515245 · state + 12345  (mod 2^32)
 *     value  = ((state' >> 16) · (max mod 65536)) >> 16
 *
 * Every call advances the state once, a max of 0 included (its value is 0).
 * The state is what Lua's `Game.GetRandomSeed()` reads, so the recorder's
 * per-player witnesses (`PlayerTurnStarted` / `PlayerTurnStartComplete`)
 * bracket every draw the game takes between them.
 */

export const LCG_MUL = 1103515245;
export const LCG_ADD = 12345;

/** the state after one draw */
export function lcgStep(state: number): number {
  return (Math.imul(LCG_MUL, state) + LCG_ADD) >>> 0;
}

/** The generator: a state and the draws it gives, each with the DLL's label
 *  kept for the trace. */
export class Civ6Random {
  state: number;
  /** the number of draws taken */
  count = 0;
  /** the draws taken, with the DLL's label of each, when tracing */
  trace: { label: string; range: number; value: number }[] | null;

  /** the game's log of the draws to come from this state, where the
   *  harness has it (`RandLog`): what the records cannot show — how many
   *  units an event struck — is read from it (`upcoming`) */
  ahead: readonly { label: string }[] | null = null;
  private aheadAt = 0;

  constructor(state: number, trace = false, ahead: readonly { label: string }[] | null = null) {
    this.state = state >>> 0;
    this.trace = trace ? [] : null;
    this.ahead = ahead;
  }

  /** how many of the next draws the game's log labels `label`; undefined
   *  without the log */
  upcoming(label: string): number | undefined {
    if (!this.ahead) return undefined;
    let n = 0;
    while (this.ahead[this.aheadAt + n]?.label === label) n++;
    return n;
  }

  /** a draw in [0, max): max is read as 16 bits, as the game's argument is */
  get(max: number, label = ''): number {
    this.state = lcgStep(this.state);
    this.count += 1;
    this.aheadAt += 1;
    const v = ((this.state >>> 16) * (max & 0xffff)) >>> 16;
    if (this.trace) this.trace.push({ label, range: max, value: v });
    return v;
  }

  /** a copy at the same state, its own count from 0 */
  fork(trace = this.trace !== null): Civ6Random {
    return new Civ6Random(this.state, trace);
  }
}

/** The draws from state `from` to state `to`: the k with step^k(from) = to,
 *  undefined past `limit`. */
export function drawsBetween(from: number, to: number, limit = 1 << 16): number | undefined {
  let s = from >>> 0;
  const t = to >>> 0;
  for (let k = 0; k <= limit; k++) {
    if (s === t) return k;
    s = lcgStep(s);
  }
  return undefined;
}

/** The game's weighted picker (Utilities_WeightedVector, 0x287c00): ONE
 *  draw over the weights' total (16 bits), the first entry whose running sum
 *  passes it; -1 when it passes every entry. */
export function pickWeighted(rng: Civ6Random, weights: readonly number[], label: string): number {
  let total = 0;
  for (const w of weights) total += w;
  let v = rng.get(total, label);
  for (let i = 0; i < weights.length; i++) {
    v -= weights[i];
    if (v < 0) return i;
  }
  return -1;
}
