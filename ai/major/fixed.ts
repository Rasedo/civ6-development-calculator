/**
 * The game AI's 24.8 fixed point (CivTech Math_FixedPointT) and its present
 * value, as GameCore_XP2_Release.dll codes them. A value is its raw integer:
 * fx(f) = floor(f) << 8 | trunc(frac(f) x 256), so fx(0.01) = 2. Products are
 * (a b) >> 8, quotients (a << 8) / b truncated toward zero.
 */

export const FX_ONE = 256;
/** FX(-9999): the AI's "never" (the data word at 0xf04cb0) */
export const FX_MIN = -9999 * 256;

/** fx of a float the way the game converts its table floats (floorf, the
 *  fraction's byte truncated) */
export function fx(f: number): number {
  const fl = Math.floor(Math.fround(f));
  return (fl * 256) | (Math.trunc(Math.fround(Math.fround(f) - fl) * 256) & 0xff);
}

/** truncation toward zero, the C division */
export function tdiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

export const fxMul = (a: number, b: number): number => Math.floor((a * b) / 256);
export const fxDiv = (a: number, b: number): number => tdiv(a * 256, b);
/** x / 25600 truncated toward zero: the "percent" product's divide */
const pct = (x: number): number => tdiv(x, 25600);

/**
 * THE PRESENT VALUE (0x7a16e0): v a turn for n turns at the discount `rate`
 * (fx percent; the global AI's 2.0). n 0 is v; n below 0 is 0; a zero rate is
 * v n; a rate of 50 or more, or rate n fx(0.01) of 10 or more, is the
 * perpetuity v / (rate fx(0.01)); otherwise n is capped at 400 and (1 + r)^n
 * - 1 taken to the third power of its binomial, each product truncated:
 * s = a + c/2 + e/6 with a = n r, c = n(n-1) r^2, e = n(n-1)(n-2) r^3, and
 * PV = (s v) / max(r (1 + s), fx(0.01)).
 */
export function presentValue(v: number, rate: number, n: number): number {
  if (n === 0) return v;
  if (n < 0) return 0;
  if (rate === 0) return Math.floor((v * (n << 8)) / 256);
  if (rate >= 50 * 256 || fxMul(fxMul(rate, n << 8), 2) >= 10 * 256) return tdiv(v * 256, fxMul(rate, 2));
  const m = Math.min(n, 400);
  const a = pct((m << 8) * rate);
  const b = pct(rate * a);
  const c = fxMul(b, (m - 1) << 8);
  const d = pct(rate * c);
  const e = fxMul(d, (m - 2) << 8);
  const s = fxMul(128, c) + fxMul(42, e) + a;
  if (s + 256 < 256) return 0;
  const den = Math.max(pct(rate * (s + 256)), 2);
  return tdiv(fxMul(s, v) * 256, den);
}

/** THE VALUE BETWEEN TWO TURNS (0x7a2140): PV to `to` less PV to `from` */
export function valueBetween(v: number, rate: number, from: number, to: number): number {
  if (from === to) return discounted(v, rate, from);
  return presentValue(v, rate, to) - presentValue(v, rate, from);
}

/** A ONE-OFF VALUE `n` turns away (0x7a1240): n 0 is v itself, n below 0 is
 *  0; a later turn's discount is not ported (every caller this slice holds
 *  passes the evaluation's start, 0). */
export function discounted(v: number, _rate: number, n: number): number {
  if (n === 0) return v;
  if (n < 0) return 0;
  throw new Error(`discounted: n ${n} > 0 is not ported`);
}
