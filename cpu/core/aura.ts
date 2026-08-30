/**
 * The Great General / Great Admiral aura predicate, in its
 * own module so BOTH consumers can share one definition without an import
 * cycle — `combat.ts` needs it for the +CS half and `units.ts` needs it for the
 * +MP half, and `combat.ts` already imports `units.ts`.
 *
 * Real Civ 6 grants nearby own units +5 Combat Strength AND +1 Movement:
 * an own LAND military unit within GENERAL_AURA_RANGE of an own live GENERAL,
 * or an own NAVAL/EMBARKED unit within range of an own live ADMIRAL. "Own"
 * means same owner AND same civId. The GENERAL/ADMIRAL units are themselves
 * combat-0 civilians and never qualify on their own account.
 */

import { hexDistance } from '../../world/hex';
import { UNITS } from '../data/units';
import { MP_SCALE } from '../data/constants';
import type { GameState, Unit } from './types';

export const GENERAL_AURA_CS = 5;
export const GENERAL_AURA_RANGE = 2;
export const GENERAL_AURA_MP = 1 * MP_SCALE;

export function inGeneralAura(state: GameState, unit: Unit, tileIndex: number): boolean {
  if ((UNITS[unit.type]?.combat ?? 0) <= 0) return false; // civilians are never affected
  const auraType = unit.embarked || UNITS[unit.type]?.naval ? 'ADMIRAL' : 'GENERAL';
  const tile = state.map.tiles[tileIndex];
  for (const g of state.units) {
    if (g.type !== auraType || g.seat !== unit.seat) continue;
    const gt = state.map.tiles[g.tileIndex];
    if (hexDistance(tile.col, tile.row, gt.col, gt.row) <= GENERAL_AURA_RANGE) return true;
  }
  return false;
}

export function generalAuraMP(state: GameState, unit: Unit): number {
  return inGeneralAura(state, unit, unit.tileIndex) ? GENERAL_AURA_MP : 0;
}
