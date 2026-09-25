/** THE WALKER — how a city-state's and a Free City's land units stand around
 * their home, fitted to the watched games (C-38, C-60). Neither player is an
 * agent here, so where their units stand is the environment a policy trains
 * against; the install publishes no rule for it, so the walk is the lab's
 * measured step and distance distributions and nothing more.
 *
 * A unit's turn: ONE draw over its step table (per mille over 0, 1, 2, 3
 * plots), then — for a step of k > 0 — ONE draw over the land plots exactly k
 * away that hold no foreign city centre, each weighted by the weight table at
 * its distance from home — the nearest of the holder's centres — (0 past the
 * table), in tile-index order; then it
 * walks toward that plot, each step to the first neighbour in direction order
 * that is strictly closer, legal ground (`walkerGround`) and free for it
 * (`tileFreeForUnit`), paying the ordinary step (`stepUnit`: its cost, its
 * afford rule, zone of control). It stops at the plot, after k steps, or where
 * it cannot step. With no weighted plot there is no second draw.
 */
import type { GameState, Tile, Unit } from './types';
import { nextRandom } from './rand';
import { tileSeat } from './seats';
import { stepUnit, tileFreeForUnit, unitIsMilitary } from './units';
import { UNITS } from '../data/units';
import { hexDistance, neighborTile, tilesWithin } from '../../world/hex';
import { isImpassable, isWater } from '../../world/query';

/** A walker: a military unit of the land, standing ashore. */
export function landWalker(u: Unit): boolean {
  const def = UNITS[u.type];
  return unitIsMilitary(u.type) && !!def && !def.naval && !def.air && !u.embarked;
}

/** Is `t` a city centre — a major's or a Free City's (its CITY_CENTER
 *  district), or a city-state's (which carries none)? */
function centreAt(state: GameState, t: Tile): boolean {
  return t.district === 'CITY_CENTER' || state.cityStates.some((c) => c.centerIndex === t.index);
}

/** Land a walker may stand on: no water, nothing impassable, and no city
 *  centre but one of its own seat's. */
function walkerGround(state: GameState, t: Tile, seat: number): boolean {
  if (isWater(t) || isImpassable(t)) return false;
  return !centreAt(state, t) || tileSeat(t) === seat;
}

/** The step table's draw: the first k whose running per-mille sum exceeds it. */
function drawStep(state: GameState, steps: readonly number[]): number {
  const x = Math.floor(nextRandom(state) * 1000);
  let run = 0;
  for (let k = 0; k < steps.length; k++) {
    run += steps[k];
    if (x < run) return k;
  }
  return steps.length - 1;
}

/** How far `t` stands from the nearest of the `homes` (tile indices). */
export function homeDistance(state: GameState, homes: readonly number[], t: Tile): number {
  let best = Infinity;
  for (const i of homes) {
    const h = state.map.tiles[i];
    best = Math.min(best, hexDistance(t.col, t.row, h.col, h.row));
  }
  return best;
}

/** One unit's walk this turn, around the nearest of its `homes`. */
export function walkUnit(
  state: GameState, u: Unit, homes: readonly number[], steps: readonly number[], weights: readonly number[],
): void {
  const k = drawStep(state, steps);
  if (k === 0) return;
  const at = state.map.tiles[u.tileIndex];
  const weight = (t: Tile): number => {
    const d = homeDistance(state, homes, t);
    return d < weights.length ? weights[d] : 0;
  };
  const ring = tilesWithin(state.map, at.col, at.row, k)
    .filter((t) => hexDistance(t.col, t.row, at.col, at.row) === k && walkerGround(state, t, u.seat))
    .sort((a, b) => a.index - b.index);
  let total = 0;
  for (const t of ring) total += weight(t);
  if (total <= 0) return;
  const pick = Math.floor(nextRandom(state) * total);
  let run = 0;
  let target: Tile = ring[0];
  for (const t of ring) {
    run += weight(t);
    if (pick < run) {
      target = t;
      break;
    }
  }
  for (let s = 0; s < k && u.tileIndex !== target.index && u.movesLeft > 0; s++) {
    const cur = state.map.tiles[u.tileIndex];
    const d0 = hexDistance(cur.col, cur.row, target.col, target.row);
    let next: Tile | null = null;
    for (let dir = 0; dir < 6; dir++) {
      const n = neighborTile(state.map, cur, dir);
      if (!n || hexDistance(n.col, n.row, target.col, target.row) >= d0) continue;
      if (!walkerGround(state, n, u.seat) || !tileFreeForUnit(state, n.index, u.seat, u)) continue;
      next = n;
      break;
    }
    if (!next) return;
    stepUnit(state, u, next);
    if (u.tileIndex !== next.index) return;
  }
}
