/**
 * AIR UNITS. CIV6 (Air combat): "Each air unit has to be based somewhere. You
 * will not be able to build more units than you have space for in your bases."
 * A plane is not a tile occupant the way a land unit is — it sits INSIDE its
 * base, strikes from it, and re-bases rather than walking.
 *
 * Bases and their slots, from the same page: a City Center has 1, an Aerodrome
 * "has 2 slots initially, and can reach 4 slots after constructing the Hangar
 * and the Airport", and an Aircraft Carrier "starts with 2".
 */
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { IMPROVEMENTS } from '../data/improvements';
import { hexDistance } from '../../world/hex';
import { citiesOf, seatOf, tileSeat } from './seats';
import { cityAtIndex, unitsAt, unitsHostile, unitVisibleTo } from './units';
import type { GameState, ImprovementId, Tile, Unit } from './types';

export const CITY_CENTER_AIR_SLOTS = 1;
export const AERODROME_AIR_SLOTS = 2;

export function isAirUnit(type: string): boolean {
  return UNITS[type]?.air !== undefined;
}

export function airUnitsOf(state: GameState, seat: number): Unit[] {
  return state.units.filter((u) => u.seat === seat && isAirUnit(u.type));
}

/** every air unit standing at this tile — its base's occupancy. */
export function airUnitsAt(state: GameState, tileIndex: number): Unit[] {
  return unitsAt(state, tileIndex).filter((u) => isAirUnit(u.type));
}

/**
 * How many aircraft `tileIndex` can base for `seat`, 0 if it is no base of
 * theirs. A pillaged district bases nothing, like every other thing a district
 * does while it is wrecked.
 */
export function airSlotsAt(state: GameState, seat: number, tileIndex: number): number {
  const tile: Tile | undefined = state.map.tiles[tileIndex];
  if (!tile) return 0;
  // a CARRIER is a base wherever it floats, its own seat's alone
  const hull = unitsAt(state, tileIndex).find((u) => u.seat === seat && (UNITS[u.type]?.airSlots ?? 0) > 0);
  if (hull) return UNITS[hull.type]!.airSlots!;
  if (tileSeat(tile) !== seat) return 0;
  // CIV6 (Airstrip): "+3 aircraft slots". A pillaged one bases nothing, the
  // same rule a wrecked Aerodrome answers to.
  if (tile.improvement && !tile.pillaged) {
    const slots = IMPROVEMENTS[tile.improvement as ImprovementId].airSlots ?? 0;
    if (slots > 0) return slots;
  }
  if (tile.district === 'CITY_CENTER') return CITY_CENTER_AIR_SLOTS;
  if (tile.district !== 'AERODROME') return 0;
  if (!tile.districtComplete || tile.districtPillaged) return 0;
  const city = citiesOf(state, seat).find((c) => c.districts.some((d) => d.tileIndex === tileIndex));
  const extra = (city?.buildings ?? []).reduce(
    (n, id) => n + (BUILDINGS[id]?.district === 'AERODROME' ? BUILDINGS[id]?.airSlots ?? 0 : 0), 0,
  );
  return AERODROME_AIR_SLOTS + extra;
}

export function airBaseFree(state: GameState, seat: number, tileIndex: number): boolean {
  return airUnitsAt(state, tileIndex).length < airSlotsAt(state, seat, tileIndex);
}

/** every tile this seat could base a plane at right now. */
export function airBasesOf(state: GameState, seat: number): number[] {
  const out: number[] = [];
  for (const city of citiesOf(state, seat)) {
    if (airSlotsAt(state, seat, city.centerIndex) > 0) out.push(city.centerIndex);
    for (const d of city.districts) {
      if (d.type === 'AERODROME' && airSlotsAt(state, seat, d.tileIndex) > 0) out.push(d.tileIndex);
    }
  }
  // an AIRSTRIP stands on no city's district list, so its tiles come off the
  // map rather than off a city.
  for (const t of state.map.tiles) {
    if (!t.improvement || (IMPROVEMENTS[t.improvement as ImprovementId].airSlots ?? 0) <= 0) continue;
    if (airSlotsAt(state, seat, t.index) > 0) out.push(t.index);
  }
  for (const u of state.units) {
    if (u.seat === seat && (UNITS[u.type]?.airSlots ?? 0) > 0) out.push(u.tileIndex);
  }
  return out;
}

/**
 * CIV6 (Air combat): "Air units, as mentioned above, can only be built in a
 * city with an Aerodrome. Newly built aircraft will spawn in the Aerodrome, as
 * long as it still has empty slots."
 */
export function airTrainTile(
  state: GameState,
  seat: number,
  city: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): number | undefined {
  for (const d of city.districts) {
    if (d.type !== 'AERODROME') continue;
    if (airBaseFree(state, seat, d.tileIndex)) return d.tileIndex;
  }
  return undefined;
}

export function canTrainAir(
  state: GameState,
  seat: number,
  city?: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): boolean {
  return !!city && airTrainTile(state, seat, city) !== undefined;
}

/**
 * CIV6: "You may spend a turn to re-base any aircraft, moving it to a new,
 * valid base which is close enough. The maximum re-base distance is twice the
 * Moves of that air unit."
 */
export function rebaseRange(type: string): number {
  return 2 * (UNITS[type]?.moves ?? 0);
}

export function canRebaseTo(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (!isAirUnit(unit.type) || unit.movesLeft <= 0) return false;
  if (tileIndex === unit.tileIndex) return false;
  if (!airBaseFree(state, unit.seat, tileIndex)) return false;
  const a = state.map.tiles[unit.tileIndex];
  const b = state.map.tiles[tileIndex];
  if (!a || !b) return false;
  return hexDistance(a.col, a.row, b.col, b.row) <= rebaseRange(unit.type);
}

export function rebaseAir(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (!canRebaseTo(state, unit, tileIndex)) return false;
  unit.tileIndex = tileIndex;
  unit.movesLeft = 0;
  return true;
}

/**
 * CIV6: "Should your airbase be pillaged, your aircraft stationed within will
 * scatter to nearby valid bases instead of being destroyed. If there are no
 * nearby valid bases, the aircraft will be destroyed." A sunk carrier takes
 * its aircraft down with it, so callers hand `scatter: false` there.
 */
export function displaceAirFrom(state: GameState, tileIndex: number, scatter = true): void {
  const here = airUnitsAt(state, tileIndex);
  if (here.length === 0) return;
  for (const plane of here) {
    let moved = false;
    if (scatter) {
      const from = state.map.tiles[plane.tileIndex];
      const bases = airBasesOf(state, plane.seat)
        .filter((t) => t !== tileIndex && airBaseFree(state, plane.seat, t))
        .map((t) => ({ t, d: hexDistance(from.col, from.row, state.map.tiles[t].col, state.map.tiles[t].row) }))
        .filter((b) => b.d <= rebaseRange(plane.type))
        .sort((a, b) => a.d - b.d || a.t - b.t);
      if (bases.length > 0) {
        plane.tileIndex = bases[0].t;
        moved = true;
      }
    }
    if (!moved) {
      const i = state.units.indexOf(plane);
      if (i >= 0) state.units.splice(i, 1);
    }
  }
}

/** a moving carrier takes its based aircraft along. */
export function carryAirWith(state: GameState, hull: Unit, from: number): void {
  if ((UNITS[hull.type]?.airSlots ?? 0) <= 0) return;
  for (const plane of state.units) {
    if (plane.seat === hull.seat && isAirUnit(plane.type) && plane.tileIndex === from) {
      plane.tileIndex = hull.tileIndex;
    }
  }
}

/**
 * CIV6 (Air combat): a strike reaches anything inside the aircraft's
 * OPERATIONAL RANGE, measured from its base. A FIGHTER's ranged damage is
 * "effective against land units, but not against cities and naval units"; a
 * BOMBER's bombard damage is "effective against cities and naval units but not
 * against land units".
 */
export function airRange(type: string): number {
  return UNITS[type]?.ranged?.range ?? 0;
}

export function airStrikeReaches(state: GameState, unit: Unit, tileIndex: number): boolean {
  const a = state.map.tiles[unit.tileIndex];
  const b = state.map.tiles[tileIndex];
  if (!a || !b) return false;
  return hexDistance(a.col, a.row, b.col, b.row) <= airRange(unit.type);
}

/**
 * What answers an air strike. CIV6: "the attacking unit's Ranged Strength will
 * be matched against the defending unit's Anti-Air Strength (even if its
 * Combat Strength is higher) or Combat Strength if it doesn't have any
 * Anti-Air Strength."
 */
/**
 * The tiles an air strike may be pointed at, ordered by TILE INDEX ascending
 * and cut to the head's width — the same rule the ring heads use, so both
 * engines agree on what column k means without shipping a list.
 */
export function airStrikeTargets(state: GameState, unit: Unit, width: number): number[] {
  const out: number[] = [];
  const here = state.map.tiles[unit.tileIndex];
  if (!here || !isAirUnit(unit.type)) return out;
  for (const t of state.map.tiles) {
    if (t.index === unit.tileIndex) continue;
    if (hexDistance(here.col, here.row, t.col, t.row) > airRange(unit.type)) continue;
    if (airStrikeOffers(state, unit, t.index)) out.push(t.index);
    if (out.length >= width) break;
  }
  return out;
}

/**
 * What `tileIndex` offers THIS aircraft. Which enemies STAND there, never
 * which one is first in the list: a list-order rule would let the two engines
 * point the same column at different tiles.
 */
export function airStrikeOffers(state: GameState, unit: Unit, tileIndex: number): boolean {
  const t = state.map.tiles[tileIndex];
  if (!t) return false;
  let land = false;
  let sea = false;
  for (const u of unitsAt(state, tileIndex)) {
    if (isAirUnit(u.type) || !unitsHostile(state, unit, u)) continue;
    if (!unitVisibleTo(state, u, unit.seat)) continue;
    if (UNITS[u.type]?.naval) sea = true;
    else land = true;
  }
  const holder = cityAtIndex(state, tileIndex);
  const centre = holder !== undefined && unitsHostile(state, unit, { seat: holder.holder.seat });
  return UNITS[unit.type]!.air! === 'BOMBER' ? (centre || sea) : (land && !centre);
}

/** this seat's own bases with room, ordered by tile index and cut to width. */
export function rebaseTargets(state: GameState, unit: Unit, width: number): number[] {
  return airBasesOf(state, unit.seat)
    .filter((t) => canRebaseTo(state, unit, t))
    .sort((a, b) => a - b)
    .slice(0, width);
}

export function antiAirOf(type: string): number {
  return UNITS[type]?.antiAir ?? 0;
}

export function airDefenseOf(type: string): number {
  return antiAirOf(type) || (UNITS[type]?.combat ?? 0);
}

/** the seat's own count of based aircraft, for the training gate's message. */
export function airCapacityOf(state: GameState, seat: number): { used: number; total: number } {
  const bases = airBasesOf(state, seat);
  const total = bases.reduce((n, t) => n + airSlotsAt(state, seat, t), 0);
  return { used: airUnitsOf(state, seat).length, total };
}

export function seatAirIsOverbased(state: GameState, seat: number): boolean {
  const s = seatOf(state, seat);
  if (!s) return false;
  const c = airCapacityOf(state, seat);
  return c.used > c.total;
}
