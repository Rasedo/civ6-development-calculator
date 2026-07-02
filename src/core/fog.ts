/**
 * Fog of war and tribal villages (stage 11c). One-level fog: tiles are
 * unexplored (hidden, unusable) or explored (fully informative). Reveals
 * happen on founding, border growth, unit movement and spawning. Villages
 * pay a seeded random reward to the first player unit that enters.
 */

import type { GameState, Unit } from './types';
import { tilesWithin, hexDistance } from './hex';
import { nextRandom } from './rand';
import { isWater, isImpassable } from './query';
import { TECHS } from '../data/techs';

export const SIGHT_RANGE = 2;

export function fogActive(state: GameState): boolean {
  return state.unitsMode && state.fogOfWar;
}

export function isExplored(state: GameState, tileIndex: number): boolean {
  if (!fogActive(state)) return true;
  return state.explored.length === 0 || state.explored[tileIndex] === 1;
}

export function revealAround(state: GameState, tileIndex: number, radius = SIGHT_RANGE): void {
  if (!state.fogOfWar) return;
  if (state.explored.length === 0) {
    state.explored = new Array(state.map.tiles.length).fill(0);
  }
  const t = state.map.tiles[tileIndex];
  for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
    state.explored[n.index] = 1;
  }
}

/** Turn fog on mid-game: reveal what the empire plausibly knows. */
export function initFog(state: GameState): void {
  state.explored = new Array(state.map.tiles.length).fill(0);
  for (const t of state.map.tiles) {
    if (t.cityId !== -1) revealAround(state, t.index, 1);
  }
  for (const c of state.cities) revealAround(state, c.centerIndex, 3);
  for (const u of state.units) {
    if (u.owner === 'player') revealAround(state, u.tileIndex);
  }
}

// ---------------------------------------------------------------------------
// Tribal villages
// ---------------------------------------------------------------------------

/** Claim a village with a player unit standing on it (seeded reward). */
export function claimGoodyHut(state: GameState, unit: Unit): void {
  const tile = state.map.tiles[unit.tileIndex];
  if (!tile.goodyHut || unit.owner !== 'player') return;
  tile.goodyHut = false;
  const roll = Math.floor(nextRandom(state) * 6);
  let text: string;
  switch (roll) {
    case 0:
      state.treasury += 40;
      text = 'a stash of 40 gold';
      break;
    case 1:
      state.faithTotal += 20;
      text = '20 faith from local mystics';
      break;
    case 2: {
      const city = [...state.cities].sort(
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
        state.treasury += 40;
        text = 'a stash of 40 gold';
      }
      break;
    }
    case 3: {
      // Eureka for a random unboosted, unresearched tech.
      const candidates = Object.keys(TECHS).filter(
        (id) => !state.research.techs.includes(id) && !state.research.boosted.includes(id),
      );
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(nextRandom(state) * candidates.length)];
        state.research.boosted.push(pick);
        text = `ancient knowledge (eureka for ${TECHS[pick].name})`;
      } else {
        state.scienceTotal += 30;
        text = '30 science';
      }
      break;
    }
    case 4:
      revealAround(state, unit.tileIndex, 5);
      text = 'maps of the surrounding lands';
      break;
    default:
      state.research.civicProgress += 20;
      text = '20 culture from tribal storytellers';
      break;
  }
  state.eventLog.push(`Tribal village: ${text}.`);
  if (state.eventLog.length > 20) state.eventLog.shift();
}

// ---------------------------------------------------------------------------
// Scout auto-explore
// ---------------------------------------------------------------------------

/** Nearest reachable unexplored frontier tile, or null when done. */
export function nearestUnexplored(state: GameState, unit: Unit): number | null {
  if (!fogActive(state) || state.explored.length === 0) return null;
  const from = state.map.tiles[unit.tileIndex];
  let best: number | null = null;
  let bestDist = 25;
  for (const t of state.map.tiles) {
    if (state.explored[t.index] === 1) continue;
    if (isWater(t) || isImpassable(t)) continue;
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < bestDist) {
      bestDist = d;
      best = t.index;
    }
  }
  return best;
}
