
import type { GameState, Unit } from './types';
import { citiesOf, isCiv, seatOf, tileSeat, unitsOf } from './seats';
import { tilesWithin, hexDistance } from '../../world/hex';
import { nextRandom } from './rand';
import { isWater, isImpassable, naturalWonderAt } from '../../world/query';
import { TECHS } from '../data/techs';
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
  const s = seatOf(state, seat);
  if (!s) return;
  if (s.explored.length === 0) s.explored = new Array(state.map.tiles.length).fill(0);
  const t = state.map.tiles[tileIndex];
  let found = 0;
  for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
    if (s.explored[n.index] !== 1 && naturalWonderAt(n)) found++;
    s.explored[n.index] = 1;
  }
  // CIV6 (Hic Sunt Dracones, dark face): "+3 Era Score each time you discover
  // a new Continent or natural wonder" — one continent here, so wonders are
  // the whole event.
  if (found > 0) dedicationEvent(state, seat, DED_DRACONES, DRACONES_DISCOVERY_SCORE * found);
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


/**
 * Claim a village with a unit standing on it (seeded reward).
 *
 * Real Civ 6 gives the village to whoever reaches it first, so any civ seat
 * claims it; barbarians and city-states neither settle nor research and take
 * none.
 */
export function claimGoodyHut(state: GameState, unit: Unit): void {
  const tile = state.map.tiles[unit.tileIndex];
  const owner = seatOf(state, unit.seat);
  if (!tile.goodyHut || !owner || !isCiv(unit.seat)) return;
  tile.goodyHut = false;
  const roll = Math.floor(nextRandom(state) * 6);
  let text: string;
  switch (roll) {
    case 0:
      owner.treasury += 40;
      text = 'a stash of 40 gold';
      break;
    case 1:
      owner.faith += 20;
      text = '20 faith from local mystics';
      break;
    case 2: {
      const city = [...owner.cities].sort(
        (a, b) =>
          hexDistance(
            state.map.tiles[a.centerIndex].col,
            state.map.tiles[a.centerIndex].row,
            tile.col,
            tile.row,
          ) -
          hexDistance(
            state.map.tiles[b.centerIndex].col,
            state.map.tiles[b.centerIndex].row,
            tile.col,
            tile.row,
          ),
      )[0];
      if (city) {
        city.population += 1;
        text = `settlers joining ${city.name} (+1 population)`;
      } else {
        owner.treasury += 40;
        text = 'a stash of 40 gold';
      }
      break;
    }
    case 3: {
      const candidates = Object.keys(TECHS).filter(
        (id) => !owner.research.techs.includes(id) && !owner.research.boosted.includes(id),
      );
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(nextRandom(state) * candidates.length)];
        owner.research.boosted.push(pick);
        text = `ancient knowledge (eureka for ${TECHS[pick].name})`;
      } else {
        owner.scienceTotal += 30;
        text = '30 science';
      }
      break;
    }
    case 4:
      revealAround(state, unit.seat, unit.tileIndex, 5);
      text = 'maps of the surrounding lands';
      break;
    default:
      owner.research.civicProgress += 20;
      text = '20 culture from tribal storytellers';
      break;
  }
  state.eventLog.push(`Tribal village: ${text}.`);
  if (state.eventLog.length > 20) state.eventLog.shift();
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
