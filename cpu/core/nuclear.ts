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
import type { GameState, Unit } from './types';
import type { Tile } from '../../world/types';
import { tilesWithin } from '../../world/hex';
import { NO_SEAT, seatOf, seatsAllied, tileSeat, unitSeat } from './seats';
import { getModifiers } from './effects';
import { NUCLEAR_DEVICES, NUKE_CARRIERS, NUKE_COVER_RANGE, NUKE_AA_SUPPORT, NUKE_AA_WOUND } from '../data/nuclear';
import { UNIT_HP } from '../data/units';
import { antiAirAt, airDefenseOf } from './air';

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

/**
 * The anti-air side of an interception, measured live (lab 3 parts three,
 * six and eight; 60 of 60 pre-registered rounds). EVERY unit with an anti-air
 * strength — land or naval, whatever its class — that is not the launcher's
 * own and stands within NUKE_COVER_RANGE of the aim plot qualifies. The
 * STRONGEST fires (ties to the walk order: tile index, then occupancy) at
 *
 *     AntiAirCombat − NUKE_AA_WOUND · (1 − hp/100)   [+ Air Defense Initiative]
 *
 * and every OTHER qualifying unit supports it by NUKE_AA_SUPPORT · hp/100
 * (fractional — the game sums float terms; three half-health supporters
 * read +7 in the preview). The firer's health term is CONTINUOUS, not the
 * rounded `woundPenalty`. 0 where nobody qualifies. `_nuke_intercept_strength`
 * is the twin.
 */
function nukeInterceptors(state: GameState, seat: number, tileIndex: number): Unit[] {
  const at = state.map.tiles[tileIndex];
  if (!at) return [];
  const out: Unit[] = [];
  for (const t of tilesWithin(state.map, at.col, at.row, NUKE_COVER_RANGE)) {
    for (const u of state.units) {
      if (u.tileIndex !== t.index || u.hp <= 0) continue;
      if (unitSeat(u) === seat) continue;
      if (antiAirAt(state, u) <= 0) continue;
      out.push(u);
    }
  }
  return out;
}

/** a qualifying unit's own attack strength — its anti-air less the
 *  continuous health term */
function interceptorCS(state: GameState, u: Unit): number {
  return antiAirAt(state, u) - NUKE_AA_WOUND * (1 - u.hp / UNIT_HP);
}

export function nukeInterceptStrength(state: GameState, seat: number, tileIndex: number): number {
  const guards = nukeInterceptors(state, seat, tileIndex);
  if (!guards.length) return 0;
  let firer = guards[0];
  let best = interceptorCS(state, firer);
  for (const u of guards) {
    const cs = interceptorCS(state, u);
    if (cs > best) {
      best = cs;
      firer = u;
    }
  }
  // CIV6 (Air Defense Initiative): "+25 Combat Strength to ANTI-AIR support
  // units within the city's territory when defending against aircraft and
  // ICBMs" — the governor's term rides the one that fires
  let s = best + (airDefenseOf(state, firer) - antiAirAt(state, firer));
  for (const u of guards) {
    if (u === firer) continue;
    s += NUKE_AA_SUPPORT * (u.hp / UNIT_HP);
  }
  return s;
}

/** the unit that FIRES at a strike on `tileIndex`, or -1 — the strongest
 *  qualifying interceptor (`nukeInterceptStrength` says how hard). */
export function nukeInterceptor(state: GameState, seat: number, tileIndex: number): number {
  const guards = nukeInterceptors(state, seat, tileIndex);
  if (!guards.length) return -1;
  let firer = guards[0];
  let best = interceptorCS(state, firer);
  for (const u of guards) {
    const cs = interceptorCS(state, u);
    if (cs > best) {
      best = cs;
      firer = u;
    }
  }
  return firer.id;
}

/** CIV6: a device is deployed by "bomber aircraft, Nuclear Submarines, and the
 *  Missile Silo" — this is the chassis half of that list. */
export function nukeCarrier(type: string): boolean {
  return NUKE_CARRIERS.includes(type);
}
