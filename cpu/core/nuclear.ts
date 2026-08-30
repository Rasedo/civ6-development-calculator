/**
 * NUCLEAR WEAPONS: the seat's inventory and what holding it costs.
 *
 * A device is not a unit — CIV6: a finished one "is added to the player's
 * inventory and can then be used by any unit or improvement capable of
 * deploying it on the map", so it is a per-seat count, and the gold it bills
 * is the seat's, not any city's.
 */
import type { GameState } from './types';
import { seatOf } from './seats';
import { getModifiers } from './effects';
import { NUCLEAR_DEVICES } from '../data/nuclear';

/** how many of device `k` this seat holds. */
export function wmdHeld(state: GameState, seat: number, k: number): number {
  return seatOf(state, seat)?.wmd?.[k] ?? 0;
}

export function addWmd(state: GameState, seat: number, k: number, n: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const inv = (s.wmd ??= NUCLEAR_DEVICES.map(() => 0));
  inv[k] = Math.max(0, (inv[k] ?? 0) + n);
}

/**
 * CIV6: "They cost 14 Gold per turn to maintain" / "16 Gold per turn", and
 * Second Strike Capability cuts that in half. Billed at the seat's own upkeep
 * position, beside the units'.
 */
export function wmdUpkeep(state: GameState, seat: number): number {
  const inv = seatOf(state, seat)?.wmd;
  if (!inv) return 0;
  let gold = 0;
  for (let k = 0; k < NUCLEAR_DEVICES.length; k++) gold += (inv[k] ?? 0) * NUCLEAR_DEVICES[k].upkeep;
  if (gold === 0) return 0;
  return (gold * (100 + getModifiers(state, seat).wmdUpkeepPct)) / 100;
}
