/**
 * One civilization-id space (C1-A1). The player is civ 0; rival civ r is
 * civ r+1. City-states are NOT civs (they are never promoted to full
 * players) and barbarians are not civs — both stay outside this numbering.
 *
 * This module is the single place that answers "who owns this?", so the
 * C1 stages (symmetric rivals → per-seat self-play) can widen the model
 * by changing accessors instead of re-finding call sites. A1 is
 * behavior-preserving: the state fields themselves (tile.cityId /
 * tile.csId / tile.rivalId, unit.owner + unit.civId) are unchanged, the
 * accessors reproduce the exact pre-C1 field tests (including field
 * precedence), and the GPU exporter and all fixtures stay byte-identical.
 */

import type { Tile, Unit } from './types';

/** The human/agent seat in the unified civ space. */
export const PLAYER_CIV = 0;

/** Rival r's id in the unified civ space. */
export const civOfRival = (rivalId: number): number => rivalId + 1;

/** The rival id behind a (non-player) civ id. */
export const rivalOfCiv = (civ: number): number => civ - 1;

/**
 * Civ owning this tile: PLAYER_CIV, civOfRival(r), or null — unowned or
 * city-state land (city-states hold territory without being civs).
 */
export function tileOwnerCiv(t: Tile): number | null {
  if (t.cityId !== -1) return PLAYER_CIV;
  const r = t.rivalId ?? -1;
  return r !== -1 ? civOfRival(r) : null;
}

/** The rival CIV id claiming this tile, or null (reads only the rival field). */
export function tileRivalCiv(t: Tile): number | null {
  const r = t.rivalId ?? -1;
  return r !== -1 ? civOfRival(r) : null;
}

/**
 * Is this tile claimed by exactly this civ? Reads the civ's OWN field
 * (player → cityId, rival → rivalId) with no precedence assumption, so it
 * is bit-equivalent to the pre-C1 per-field tests.
 */
export function tileOwnedByCiv(t: Tile, civ: number): boolean {
  if (civ === PLAYER_CIV) return t.cityId !== -1;
  return (t.rivalId ?? -1) === rivalOfCiv(civ);
}

/** Any territorial claim at all — a civ's or a city-state's. */
export function tileClaimed(t: Tile): boolean {
  return t.cityId !== -1 || (t.csId ?? -1) !== -1 || (t.rivalId ?? -1) !== -1;
}

/**
 * Claimed by someone other than `civ` (city-states are foreign to every
 * civ). For the player this is exactly the pre-C1 `csId || rivalId` test.
 */
export function tileForeignTo(t: Tile, civ: number): boolean {
  if ((t.csId ?? -1) !== -1) return true;
  if (civ === PLAYER_CIV) return (t.rivalId ?? -1) !== -1;
  const owner = tileOwnerCiv(t);
  return owner !== null && owner !== civ;
}

/** Civ owning this unit: PLAYER_CIV, civOfRival(r), or null (barbarian). */
export function unitCiv(u: Unit): number | null {
  if (u.owner === 'player') return PLAYER_CIV;
  if (u.owner === 'rival') return civOfRival(u.civId ?? 0);
  return null;
}
