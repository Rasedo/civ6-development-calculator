
import type { GameState, Unit } from './types';
import { citiesOf, civOf, isCiv, leaderOf, seatOf, seatsAllied, tileSeat, unitsOf } from './seats';
import { ALLIANCE_SHARED_VIS_ROWS, rowIsFor } from '../data/civilizations';
import { tilesWithin, hexDistance } from '../../world/hex';
import { isWater, isImpassable, naturalWonderAt } from '../../world/query';
import { dedicationEvent } from './eras';
import { promoValue } from './promotions';
import { DED_DRACONES, DRACONES_DISCOVERY_SCORE } from '../data/seats';
import { UNITS } from '../data/units';

export const SIGHT_RANGE = 2;

/** How far this chassis SEES: `SIGHT_RANGE` unless the row names its own (the
 *  Destroyer's "Has Sight of 3"), plus what CIV6 (Spyglass / Rutter /
 *  Observation) calls "+1 sight range". Reveal Stealth reaches exactly here. */
export function unitSight(u: { type: string; promos?: number }): number {
  return (UNITS[u.type]?.sight ?? SIGHT_RANGE) + promoValue(u, 'SIGHT');
}

export function fogActive(state: GameState): boolean {
  return state.unitsMode && state.fogOfWar;
}

export function isExplored(state: GameState, seat: number, tileIndex: number): boolean {
  if (!fogActive(state)) return true;
  const ex = seatOf(state, seat)?.explored;
  return !ex || ex.length === 0 || ex[tileIndex] === 1;
}

export function revealAround(
  state: GameState,
  seat: number,
  tileIndex: number,
  radius = SIGHT_RANGE,
): void {
  if (!state.fogOfWar) return;
  // MAJOR seats only: nothing reads a city-state's or the barbarians' fog,
  // so tracking it would be write-only state (and a digest liability).
  if (!isCiv(seat)) return;
  const found = liftFog(state, seat, tileIndex, radius);
  // CIV6 (Hic Sunt Dracones, dark face): "+3 Era Score each time you discover
  // a new Continent or natural wonder" — one continent here, so wonders are
  // the whole event.
  if (found > 0) dedicationEvent(state, seat, DED_DRACONES, DRACONES_DISCOVERY_SCORE * found);
  // CIV6 (Poundmaker): "...all alliances provide shared visibility" — an ally
  // sees what this seat uncovers, and the clause is MUTUAL, so either side
  // carrying it opens both. The discovery EVENT above is the discoverer's
  // alone: an ally SHOWN a natural wonder earns no era score for it, which is
  // why the fog write and the event are separated here (C-70).
  if (!ALLIANCE_SHARED_VIS_ROWS.length) return;
  for (const o of state.seats) {
    if (o.seat === seat || !isCiv(o.seat)) continue;
    if (!seatsAllied(state, seat, o.seat)) continue;
    if (!sharesVisWithAllies(state, seat) && !sharesVisWithAllies(state, o.seat)) continue;
    liftFog(state, o.seat, tileIndex, radius);
  }
}

/** Does this seat's roster row make its ALLIANCES share map visibility?
 *  Read off the rows directly rather than through `getModifiers`, so the fog
 *  walk — which runs on every unit step — pulls in none of the effect stack. */
function sharesVisWithAllies(state: GameState, seat: number): boolean {
  const civ = civOf(state, seat);
  const leader = leaderOf(state, seat);
  return ALLIANCE_SHARED_VIS_ROWS.some((r) => rowIsFor(r, civ, leader));
}

/** Lift one seat's fog around a tile; answer how many NEW natural wonders it
 *  uncovered. The write alone — the discovery event is the caller's, so a
 *  seat merely SHOWN a wonder does not score it. */
function liftFog(state: GameState, seat: number, tileIndex: number, radius: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  if (s.explored.length === 0) s.explored = new Array(state.map.tiles.length).fill(0);
  const t = state.map.tiles[tileIndex];
  let found = 0;
  for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
    if (s.explored[n.index] !== 1 && naturalWonderAt(n)) found++;
    s.explored[n.index] = 1;
  }
  return found;
}

export function unexploredByAll(state: GameState, tileIndex: number): boolean {
  return state.seats.every((s) => s.explored.length === 0 || s.explored[tileIndex] !== 1);
}

export function initFog(state: GameState): void {
  for (const s of state.seats) {
    s.explored = new Array(state.map.tiles.length).fill(0);
    for (const t of state.map.tiles) {
      if (tileSeat(t) === s.seat) revealAround(state, s.seat, t.index, 1);
    }
    for (const c of citiesOf(state, s.seat)) revealAround(state, s.seat, c.centerIndex, 3);
        for (const u of unitsOf(state, s.seat)) revealAround(state, s.seat, u.tileIndex, unitSight(u));
  }
}


export function nearestUnexplored(state: GameState, unit: Unit): number | null {
  const ex = seatOf(state, unit.seat)?.explored;
  if (!fogActive(state) || !ex || ex.length === 0) return null;
  const from = state.map.tiles[unit.tileIndex];
  let best: number | null = null;
  let bestDist = 25;
  for (const t of state.map.tiles) {
    if (ex[t.index] === 1) continue;
    if (isWater(t) || isImpassable(t)) continue;
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < bestDist) {
      bestDist = d;
      best = t.index;
    }
  }
  return best;
}
