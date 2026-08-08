/**
 * Natural disasters (stage 11d, eyeballed Gathering Storm): river floods,
 * volcanic eruptions, droughts and storms. Destruction pillages
 * improvements; several events leave permanent fertility (+1 food, capped)
 * behind — the classic risk/reward of settling floodplains and volcano
 * slopes. All rolls go through the in-state RNG. Sea-level rise is
 * deliberately not modeled yet.
 */

import type { GameState, Tile } from './types';
import { neighbors, tilesWithin } from '../../world/hex';
import { isWater } from '../../world/query';
import { nextRandom } from './rand';

export const FERTILITY_CAP = 3;
const FLOOD_CHANCE = 0.05;
const ERUPTION_CHANCE_PER_VOLCANO = 0.02;
const DROUGHT_CHANCE = 0.02;
const STORM_CHANCE = 0.04;
const DROUGHT_LENGTH = 8;

function log(state: GameState, text: string): void {
  state.eventLog.push(text);
  if (state.eventLog.length > 20) state.eventLog.shift();
}

function pick<T>(state: GameState, arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(nextRandom(state) * arr.length)];
}

function scorch(tile: Tile): void {
  if (tile.improvement && !tile.pillaged) tile.pillaged = true;
}

function fertilize(tile: Tile): void {
  if (!isWater(tile) && tile.elevation !== 'MOUNTAIN') {
    tile.fertility = Math.min(FERTILITY_CAP, tile.fertility + 1);
  }
}

/** One turn of weather. Call only when state.disasters is on. */
export function disasterPhase(state: GameState): void {
  const map = state.map;

  // Drought clocks tick down first.
  for (const t of map.tiles) {
    if (t.droughtTurns > 0) t.droughtTurns -= 1;
  }

  // --- river flood: a floodplain drowns, then blooms -------------------------
  if (nextRandom(state) < FLOOD_CHANCE) {
    const target = pick(state, map.tiles.filter((t) => t.feature === 'FLOODPLAINS'));
    if (target) {
      scorch(target);
      fertilize(target);
      log(state, `Flood at (${target.col}, ${target.row}) — silt enriches the floodplain.`);
    }
  }

  // --- volcanic eruptions ------------------------------------------------------
  for (const volcano of map.tiles) {
    if (!volcano.volcano) continue;
    if (nextRandom(state) >= ERUPTION_CHANCE_PER_VOLCANO) continue;
    for (const n of neighbors(map, volcano)) {
      scorch(n);
      fertilize(n);
    }
    log(state, `Volcanic eruption at (${volcano.col}, ${volcano.row}) — slopes scorched, soil enriched.`);
  }

  // --- drought -------------------------------------------------------------------
  if (nextRandom(state) < DROUGHT_CHANCE) {
    const center = pick(
      state,
      map.tiles.filter(
        (t) => (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation === 'FLAT',
      ),
    );
    if (center) {
      for (const t of tilesWithin(map, center.col, center.row, 2)) {
        if (!isWater(t)) t.droughtTurns = Math.max(t.droughtTurns, DROUGHT_LENGTH);
      }
      log(state, `Drought around (${center.col}, ${center.row}) — food suffers for ${DROUGHT_LENGTH} turns.`);
    }
  }

  // --- storm (hurricane over water edges, sandstorm over desert, blizzard) ------
  if (nextRandom(state) < STORM_CHANCE) {
    const center = pick(state, map.tiles.filter((t) => !isWater(t)));
    if (center) {
      const area = tilesWithin(map, center.col, center.row, 1);
      for (const t of area) {
        scorch(t);
        if (t.terrain === 'DESERT') fertilize(t); // sandstorms deposit silt
      }
      log(state, `Storm at (${center.col}, ${center.row}) — improvements damaged.`);
    }
  }
}
