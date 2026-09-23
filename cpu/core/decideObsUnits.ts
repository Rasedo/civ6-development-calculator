import type { SeatEmitter } from './decideObs';
import { unitRows } from './unitMask';

/**
 * THE UNIT ROWS (tile, type, charges, the Great Person site, the legal action columns).
 *
 * The per-seat groups of the neutral observation this module emits, by the
 * GROUP NAME the GPU's `gpu/core/neutral.py` `seat_obs` uses for the same
 * group. The driver sends every registered group for every seat, and the gate
 * compares each one with the GPU's group of that name, field by field, before
 * the decide. A name the GPU does not emit is a red.
 */
export const SEAT_GROUPS: Record<string, SeatEmitter> = {
  units: unitRows,
};
