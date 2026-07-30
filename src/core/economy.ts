/**
 * One-time yield lumps: chop (feature removal) and harvest (bonus resource
 * removal) values, and the routing of lump yields into the right sinks.
 * Lives outside game.ts so units.ts can use it without an import cycle.
 */

import { playerSeat } from './seats';

import type { GameState, Tile, YieldKey } from './types';
import { computeUnlocks } from './effects';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';

/**
 * Era-scaled value of a chop/harvest (Civ 6 scales with game progress;
 * we scale with completed research: ~20 ancient, ~150 late).
 */
export function chopValue(state: GameState): number {
  const done = playerSeat(state).research.techs.length + playerSeat(state).research.civics.length;
  return Math.round(20 + 2.5 * done);
}

export interface LumpGrant {
  key: YieldKey;
  amount: number;
}

/** What chopping this tile's feature would grant (null = nothing). */
export function chopGrant(state: GameState, tile: Tile): LumpGrant | null {
  if (!tile.feature) return null;
  const key = FEATURES[tile.feature]?.chopYield;
  if (!key) return null;
  if (tile.cityId === -1) return null; // outside any city's borders
  return { key, amount: chopValue(state) };
}

/** What harvesting this tile's bonus resource would grant (null = not harvestable). */
export function harvestGrant(state: GameState, tile: Tile): LumpGrant | null {
  if (!tile.resource) return null;
  const res = RESOURCES[tile.resource];
  if (!res?.harvestYield) return null;
  if (tile.cityId === -1) return null;
  // Harvesting needs the tech that works the resource (eyeballed Civ 6 gating).
  if (!state.sandbox && !computeUnlocks(state).improvements.has(res.improvement)) return null;
  return { key: res.harvestYield, amount: chopValue(state) };
}

/**
 * Route a lump yield into the empire: food/production stay local to the
 * owning city (production banks if the queue is empty), the rest go to
 * empire pools. `tileIndex` locates the owning city.
 */
export function applyLumpYield(state: GameState, tileIndex: number, grant: LumpGrant): void {
  const { key, amount } = grant;
  if (key === 'gold') {
    playerSeat(state).treasury += amount;
    return;
  }
  if (key === 'faith') {
    playerSeat(state).faith += amount;
    return;
  }
  if (key === 'science') {
    playerSeat(state).research.techProgress += amount;
    playerSeat(state).scienceTotal += amount;
    return;
  }
  if (key === 'culture') {
    playerSeat(state).research.civicProgress += amount;
    playerSeat(state).cultureTotal += amount;
    return;
  }
  const city = state.cities.find((c) => c.id === state.map.tiles[tileIndex].cityId);
  if (!city) return;
  if (key === 'food') {
    city.foodBox += amount;
    return;
  }
  // production: into the current build, else banked until something is queued
  if (city.queue.length > 0) {
    city.queue[0].progress += amount;
  } else {
    city.productionBank = (city.productionBank ?? 0) + amount;
  }
}
