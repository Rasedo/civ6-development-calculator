/**
 * One-time yield lumps: chop (feature removal) and harvest (bonus resource
 * removal) values, and the routing of lump yields into the right sinks.
 * Lives outside game.ts so units.ts can use it without an import cycle.
 */

import { seatOf, tileSeat, cityAtTile } from './seats';

import type { City, GameState, Tile, YieldKey } from './types';
import { computeUnlocksIn } from './effects';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';

/**
 * Era-scaled value of a chop/harvest (Civ 6 scales with game progress;
 * we scale with completed research: ~20 ancient, ~150 late).
 */
export function chopValue(state: GameState, seat: number): number {
  const r = seatOf(state, seat)?.research;
  const done = (r?.techs.length ?? 0) + (r?.civics.length ?? 0);
  return Math.round(20 + 2.5 * done);
}

export interface LumpGrant {
  key: YieldKey;
  amount: number;
}

/** What chopping this tile's feature would grant (null = nothing). */
export function chopGrant(state: GameState, tile: Tile, seat: number): LumpGrant | null {
  if (!tile.feature) return null;
  const key = FEATURES[tile.feature]?.chopYield;
  if (!key) return null;
  // A chop only pays the seat whose borders the tile is in.
  if (tileSeat(tile) !== seat) return null;
  return { key, amount: chopValue(state, seat) };
}

/** What harvesting this tile's bonus resource would grant (null = not harvestable). */
export function harvestGrant(state: GameState, tile: Tile, seat: number): LumpGrant | null {
  if (!tile.resource) return null;
  const res = RESOURCES[tile.resource];
  if (!res?.harvestYield) return null;
  if (tileSeat(tile) !== seat) return null;  // #51/S7.9
  // Harvesting needs the tech that works the resource (eyeballed Civ 6
  // gating) — THIS seat's tech.
  const rs = seatOf(state, seat)?.research;
  if (!rs) return null;
  if (!state.sandbox && !computeUnlocksIn(rs).improvements.has(res.improvement)) return null;
  return { key: res.harvestYield, amount: chopValue(state, seat) };
}

/**
 * Route a lump yield into the empire: food/production stay local to the
 * owning city (production banks if the queue is empty), the rest go to
 * empire pools. `tileIndex` locates the owning city.
 */
export function applyLumpYield(
  state: GameState,
  tileIndex: number,
  grant: LumpGrant,
  seat: number,
): void {
  const { key, amount } = grant;
  // The four EMPIRE sinks are the seat's own. `City = City`, so
  // the city sinks below already take either without a branch.
  const s = seatOf(state, seat);
  if (!s) return;
  if (key === 'gold') {
    s.treasury += amount;
    return;
  }
  if (key === 'faith') {
    s.faith += amount;
    return;
  }
  if (key === 'science') {
    s.research.techProgress += amount;
    s.scienceTotal += amount;
    return;
  }
  if (key === 'culture') {
    s.research.civicProgress += amount;
    s.cultureTotal += amount;
    return;
  }
  const city = cityAtTile(state, state.map.tiles[tileIndex]) as City | undefined;
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
