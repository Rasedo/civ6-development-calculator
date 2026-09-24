
import type { GameState, Tile, Unit } from './types';
import type { GameMap } from '../../world/types';
import { citiesOf, civOf, isCiv, leaderOf, seatOf, seatsAllied, tileSeat, unitsOf } from './seats';
import { ALLIANCE_SHARED_VIS_ROWS, rowIsFor } from '../data/civilizations';
import { tilesWithin, hexDistance, offsetToAxial, axialToOffset, tileAt } from '../../world/hex';
import { isWater, isImpassable, naturalWonderAt } from '../../world/query';
import { dedicationEvent } from './eras';
import { promoValue, promoFlag } from './promotions';
import { ELEVATION_SIGHT, FEATURE_SIGHT_THROUGH } from '../data/sight';
import { DED_DRACONES, DRACONES_DISCOVERY_SCORE } from '../data/seats';
import { UNITS } from '../data/units';
import { gpPermOf } from '../data/greatPeople';

export const SIGHT_RANGE = 2;

/** How far this chassis SEES: `SIGHT_RANGE` unless the row names its own (the
 *  Destroyer's "Has Sight of 3"), plus what CIV6 (Spyglass / Rutter /
 *  Observation) calls "+1 sight range". Reveal Stealth reaches exactly here. */
export function unitSight(u: { type: string; promos?: number; seat?: number }, state?: GameState): number {
  // CIV6 (Leif Erikson): "+1 sight range for all naval units" of the owner,
  // permanent — read only where the caller has the state to name the owner.
  const leif = state !== undefined && u.seat !== undefined && UNITS[u.type]?.naval
    ? gpPermOf(seatOf(state, u.seat), 'navalSight') : 0;
  return (UNITS[u.type]?.sight ?? SIGHT_RANGE) + promoValue(u, 'SIGHT') + leif;
}

/** The height a tile puts in the way of a look ACROSS it — CIV6
 *  (SightThroughModifier): its elevation's plus its feature's; `seeThrough`
 *  (Sentry's CanSee) drops the feature half. */
export function sightThrough(t: Tile, seeThrough: boolean): number {
  const feat = seeThrough || t.feature === null ? 0 : (FEATURE_SIGHT_THROUGH[t.feature] ?? 0);
  return (ELEVATION_SIGHT[t.elevation] ?? 0) + feat;
}

/**
 * The tiles strictly BETWEEN two tiles on the hex line joining them: a cube
 * lerp with the (1e-6, 2e-6, -3e-6) nudge and cube rounding, rounding each
 * coordinate with floor(x + 0.5) so both engines land on the same hex at
 * every half. An off-map hex on the line is simply absent. The GPU builds
 * the same lines once per map (`los_tables`).
 */
export function hexLineBetween(map: GameMap, a: Tile, b: Tile): Tile[] {
  const [aq, ar] = offsetToAxial(a.col, a.row);
  const [bq, br] = offsetToAxial(b.col, b.row);
  const n = hexDistance(a.col, a.row, b.col, b.row);
  const ax = aq + 1e-6, az = ar + 2e-6, ay = -aq - ar - 3e-6;
  const bx = bq + 1e-6, bz = br + 2e-6, by = -bq - br - 3e-6;
  const out: Tile[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const z = az + (bz - az) * t;
    let rx = Math.floor(x + 0.5);
    let ry = Math.floor(y + 0.5);
    let rz = Math.floor(z + 0.5);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    const [c, r] = axialToOffset(rx, rz);
    const m = tileAt(map, c, r);
    if (m) out.push(m);
  }
  return out;
}

/**
 * CIV6 (measured, ask 11): can an eye standing on `from` see `to`?
 * OCCLUSION BY ELEVATION — every tile strictly between must put no more in
 * the way than the observer's own height (flat 0, hills 1, mountain 2); the
 * range is the caller's, a hill adds height and never reach.
 */
export function canSee(map: GameMap, from: Tile, to: Tile, seeThrough: boolean): boolean {
  const h = ELEVATION_SIGHT[from.elevation] ?? 0;
  for (const m of hexLineBetween(map, from, to)) if (sightThrough(m, seeThrough) > h) return false;
  return true;
}

/** CIV6 (Sentry, the install's SENTRY_SEE_THROUGH_FEATURES row, CanSee): this unit's look
 *  counts no feature's height. */
export function unitSeesThrough(u: { type: string; promos?: number }): boolean {
  // Sentry's CanSee, or CIV6 (Ngao Mbeba) the chassis's own
  return promoFlag(u, 'SEE_THROUGH') || !!UNITS[u.type]?.seesThrough;
}

export function fogActive(state: GameState): boolean {
  return state.unitsMode && state.fogOfWar;
}

export function isExplored(state: GameState, seat: number, tileIndex: number): boolean {
  if (!fogActive(state)) return true;
  const ex = seatOf(state, seat)?.explored;
  return !ex || ex.length === 0 || ex[tileIndex] === 1;
}

/** `los` names a UNIT's look: the disk is cut by `canSee` from `tileIndex`
 *  (ask 11). A city's or a claimed tile's reveal passes none and lifts the
 *  whole disk — the live game was measured for units alone. */
export function revealAround(
  state: GameState,
  seat: number,
  tileIndex: number,
  radius = SIGHT_RANGE,
  los?: { seeThrough: boolean },
): void {
  if (!state.fogOfWar) return;
  // MAJOR seats only: nothing reads a city-state's or the barbarians' fog,
  // so tracking it would be write-only state (and a digest liability).
  if (!isCiv(seat)) return;
  const found = liftFog(state, seat, tileIndex, radius, los);
  // CIV6 (Hic Sunt Dracones, dark face): "+3 Era Score each time you discover
  // a new Continent or natural wonder" — one continent here, so wonders are
  // the whole event.
  if (found > 0) dedicationEvent(state, seat, DED_DRACONES, DRACONES_DISCOVERY_SCORE * found);
  // CIV6 (Poundmaker): "...all alliances provide shared visibility" — an ally
  // sees what this seat uncovers, and the clause is MUTUAL, so either side
  // carrying it opens both. The discovery EVENT above is the discoverer's
  // alone: an ally SHOWN a natural wonder earns no era score for it, which is
  // why the fog write and the event are separated here.
  if (!ALLIANCE_SHARED_VIS_ROWS.length) return;
  for (const o of state.seats) {
    if (o.seat === seat || !isCiv(o.seat)) continue;
    if (!seatsAllied(state, seat, o.seat)) continue;
    if (!sharesVisWithAllies(state, seat) && !sharesVisWithAllies(state, o.seat)) continue;
    liftFog(state, o.seat, tileIndex, radius, los);
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
function liftFog(state: GameState, seat: number, tileIndex: number, radius: number,
                 los?: { seeThrough: boolean }): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  if (s.explored.length === 0) s.explored = new Array(state.map.tiles.length).fill(0);
  const t = state.map.tiles[tileIndex];
  let found = 0;
  for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
    if (los && !canSee(state.map, t, n, los.seeThrough)) continue;
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
    for (const u of unitsOf(state, s.seat)) revealAround(state, s.seat, u.tileIndex, unitSight(u, state), { seeThrough: unitSeesThrough(u) });
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
