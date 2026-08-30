/**
 * NUCLEAR WEAPONS: the seat's inventory, what holding it costs, and the
 * ground a blast leaves behind.
 *
 * A device is not a unit — CIV6: a finished one "is added to the player's
 * inventory and can then be used by any unit or improvement capable of
 * deploying it on the map", so it is a per-seat count, and the gold it bills
 * is the seat's, not any city's.
 *
 * A LEAF module: the verbs that SPEND a build charge to clean fallout live
 * with the other charge verbs in `units`, so nothing here reaches back.
 */
import type { GameState } from './types';
import type { Tile } from '../../world/types';
import { tilesWithin } from '../../world/hex';
import { NO_SEAT, seatOf, seatsAllied, tileSeat, unitSeat } from './seats';
import { getModifiers } from './effects';
import { NUCLEAR_DEVICES, NUKE_CARRIERS } from '../data/nuclear';

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

/** CIV6: a tile still under radioactive fallout. Nothing may be worked,
 *  built, repaired or bought on it, and whoever ends a turn there is hurt. */
export function irradiated(tile: Tile | undefined): boolean {
  return (tile?.falloutTurns ?? 0) > 0;
}

/** CIV6: "a blast radius of 1 (i.e., the target tile and all adjacent tiles)"
 *  — the ground one device covers, in TILE INDEX order, which is the order
 *  both engines walk it in. */
export function nukeBlast(state: GameState, tileIndex: number, k: number): Tile[] {
  const at = state.map.tiles[tileIndex];
  const def = NUCLEAR_DEVICES[k];
  if (!at || !def) return [];
  return tilesWithin(state.map, at.col, at.row, def.radius).sort((a, b) => a.index - b.index);
}

/**
 * Does a blast centred here reach anyone this seat would fight? A device
 * poisons its own ground as readily as a rival's, so the column is offered
 * only where the blast touches a seat that is neither this one nor its ally —
 * territory or a unit on one of the tiles.
 */
export function nukeOffers(state: GameState, seat: number, k: number, tileIndex: number): boolean {
  const tiles = nukeBlast(state, tileIndex, k);
  if (!tiles.length) return false;
  for (const t of tiles) {
    const owner = tileSeat(t);
    if (owner !== NO_SEAT && owner !== seat && !seatsAllied(state, seat, owner)) return true;
  }
  const hit = new Set(tiles.map((t) => t.index));
  for (const u of state.units) {
    if (!hit.has(u.tileIndex)) continue;
    const s = unitSeat(u);
    if (s !== seat && !seatsAllied(state, seat, s)) return true;
  }
  return false;
}

/** the seats a blast here lands on — CIV6: "any civilization or city-state
 *  whose territory or units are in the blast radius". Ascending, and never the
 *  launcher's own. */
export function nukeVictims(state: GameState, seat: number, tiles: readonly Tile[]): number[] {
  const out = new Set<number>();
  const hit = new Set(tiles.map((t) => t.index));
  for (const t of tiles) {
    const owner = tileSeat(t);
    if (owner !== NO_SEAT && owner !== seat) out.add(owner);
  }
  for (const u of state.units) {
    if (!hit.has(u.tileIndex)) continue;
    const s = unitSeat(u);
    if (s !== seat) out.add(s);
  }
  return [...out].sort((a, b) => a - b);
}

/** CIV6: a device is deployed by "bomber aircraft, Nuclear Submarines, and the
 *  Missile Silo" — this is the chassis half of that list. */
export function nukeCarrier(type: string): boolean {
  return NUKE_CARRIERS.includes(type);
}
