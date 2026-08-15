
import { seatOf, tileSeat, cityAtTile } from './seats';

import type { City, GameState, ResearchState, Tile, YieldKey } from './types';
import { computeUnlocksIn } from './effects';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';

/**
 * SELECT a tech or civic, keeping the progress on the one being left.
 *
 * Real Civ 6 lets a seat switch research at any moment and hands the
 * abandoned item's science back when it returns to it. The progress POOL
 * (`techProgress`) belongs to whatever is current, so a switch parks the pool
 * under the outgoing id and loads the incoming id's parked value — the two
 * stores partition the seat's science, and no path may add them.
 *
 * Selecting the SAME id is a no-op rather than a park-and-reload, so a record
 * that re-states the current pick cannot round-trip the pool through the map.
 * Selecting `null` parks and leaves the pool holding whatever a completion's
 * overflow left, which is the value the next pick inherits.
 */
export function selectResearch(rsr: ResearchState, id: string | null, isCivic = false): void {
  const cur = isCivic ? rsr.civic : rsr.tech;
  if (cur === id) return;
  const retained = isCivic ? rsr.civicRetained : rsr.techRetained;
  const pool = isCivic ? rsr.civicProgress : rsr.techProgress;
  if (cur) retained[cur] = pool;
  const next = id ? retained[id] ?? 0 : pool;
  if (id) delete retained[id];
  if (isCivic) {
    rsr.civic = id;
    rsr.civicProgress = next;
  } else {
    rsr.tech = id;
    rsr.techProgress = next;
  }
}

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

export function chopGrant(state: GameState, tile: Tile, seat: number): LumpGrant | null {
  if (!tile.feature) return null;
  const key = FEATURES[tile.feature]?.chopYield;
  if (!key) return null;
  if (tileSeat(tile) !== seat) return null;
  return { key, amount: chopValue(state, seat) };
}

export function harvestGrant(state: GameState, tile: Tile, seat: number): LumpGrant | null {
  if (!tile.resource) return null;
  const res = RESOURCES[tile.resource];
  if (!res?.harvestYield) return null;
  if (tileSeat(tile) !== seat) return null;
  // Harvesting needs the tech that works the resource (eyeballed Civ 6
  // gating) — THIS seat's tech.
  const rs = seatOf(state, seat)?.research;
  if (!rs) return null;
  if (!state.sandbox && !computeUnlocksIn(rs).improvements.has(res.improvement)) return null;
  return { key: res.harvestYield, amount: chopValue(state, seat) };
}

export function applyLumpYield(
  state: GameState,
  tileIndex: number,
  grant: LumpGrant,
  seat: number,
): void {
  const { key, amount } = grant;
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
  // (selectResearch, below, is the only other writer of the progress pool.)
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
  if (city.queue.length > 0) {
    city.queue[0].progress += amount;
  } else {
    city.productionBank = (city.productionBank ?? 0) + amount;
  }
}
