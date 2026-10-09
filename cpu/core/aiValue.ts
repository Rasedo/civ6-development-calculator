/**
 * THE AI'S VALUE ARITHMETIC (GameCore_XP2 AI/Value_Manager.cpp;
 * `tools/civ6lab/dll_readings.md` "H-1: the research AI", "H-1: the civics
 * AI"): the DLL's 24.8 fixed point, the present value of a yield paid each
 * turn (0x7a16e0), a yield discounted some turns (0x7a1240), and what a
 * yield a turn is worth from the turn a row lands to the value horizon — the
 * research AI's and the civics AI's every term.
 */
import { AI_DISCOUNT_PCT, AI_VALUE_HORIZON } from '../data/aiValue';

/** one in 24.8 fixed point */
export const FX = 256;

/** a float constant as the DLL converts it: the floor as the integer part,
 *  the fraction's top 8 bits below it */
export function fxConst(c: number): number {
  const fl = Math.floor(c);
  return fl * FX + Math.trunc((c - fl) * FX);
}

/** a value already in fixed point's units, rounded to the nearest raw step */
export function fxOf(x: number): number {
  return Math.round(x * FX);
}

/** the product of two raws (an arithmetic shift: floor) */
export function fmul(a: number, b: number): number {
  return Math.floor((a * b) / FX);
}

/** the quotient of two raws (truncated) */
export function fdiv(a: number, b: number): number {
  return Math.trunc((a * FX) / b);
}

/** a raw times a raw over 100 (the DLL's magic-number divide, truncated) */
function fpct(a: number, b: number): number {
  return Math.trunc((a * b) / (FX * 100));
}

const HALF = fxConst(0.5);
const SIXTH = fxConst(0.16667);
const NEG_SIXTH = fxConst(-0.16667);
const CENT = fxConst(0.01);
const TEN = fxConst(10);

/** 0x7a16e0: the present value of `a` paid each turn for `n` turns at `r`
 *  percent — a(D-1)/(kD), D the cubic expansion of (1+k)^n */
function presentValue(a: number, r: number, n: number): number {
  if (n === 0) return a;
  if (n < 0) return 0;
  if (r === 0) return fmul(a, n * FX);
  if (r >= 0x3200 || fmul(fmul(r, n * FX), CENT) >= TEN) return fdiv(a, fmul(r, CENT));
  n = Math.min(n, 400);
  const nk = fpct(n * FX, r);
  const nk2 = fpct(r, nk);
  const n2k2 = fmul(nk2, (n - 1) * FX);
  const n2k3 = fpct(r, n2k2);
  const n3k3 = fmul(n2k3, (n - 2) * FX);
  const dm1 = fmul(HALF, n2k2) + fmul(SIXTH, n3k3) + nk;
  const d = dm1 + FX;
  if (d < FX) return 0;
  return fdiv(fmul(dm1, a), Math.max(fpct(r, d), CENT));
}

/** 0x7a1240: `a` discounted `n` turns at `r` percent — a(1-k)^n by the
 *  cubic expansion */
function discounted(a: number, r: number, n: number): number {
  if (n === 0) return a;
  if (n < 0) return 0;
  const nk = fmul(fmul(r, n * FX), CENT);
  const n2k2 = fmul(fmul(fmul(nk, r), (n - 1) * FX), CENT);
  const n3k3 = fmul(fmul(fmul(n2k2, r), (n - 2) * FX), CENT);
  const e = Math.max(0, fmul(HALF, n2k2) + fmul(NEG_SIXTH, n3k3) - nk + FX);
  return e > FX ? 0 : fmul(a, e);
}

/** what a yield `a` a turn is worth from the turn a row `turns` away lands
 *  to the horizon: PV(horizon) - PV(turns), one discounted turn at the
 *  horizon itself */
export function fromLanding(a: number, turns: number): number {
  const r = fxConst(AI_DISCOUNT_PCT);
  if (turns === AI_VALUE_HORIZON) return discounted(a, r, turns);
  return presentValue(a, r, AI_VALUE_HORIZON) - presentValue(a, r, turns);
}

/** 0x7a60d0: a pseudo-yield's worth, `amount` of it at its DefaultValue */
export function pseudoYield(def: number, amount: number): number {
  return fmul(amount, fxConst(def));
}

/** 0x8c4540: the turns `rem` raw left needs at `rate` raw a turn — the
 *  truncated quotient, one more where a remainder is left; 1 where nothing
 *  is left; -1 where the rate is none */
export function turnsAt(rem: number, rate: number): number {
  if (rate <= 0) return -1;
  if (rem <= 0) return 1;
  const n = Math.floor(fdiv(rem, rate) / FX);
  return rem > rate * n ? n + 1 : n;
}
