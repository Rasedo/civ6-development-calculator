/**
 * Unit mechanics (stage 11a): movement with Civ 6-ish terrain costs and the
 * river-crossing rule, A* pathfinding, one-civilian-per-tile stacking,
 * training, maintenance, and builder actions. Military/combat land in 11b.
 */

import type { GameState, Tile, Unit } from './types';
import { neighbors, neighborTile, hexDistance, AXIAL_DIRS, offsetToAxial } from './hex';
import { isWater, isImpassable } from './query';
import { validImprovements, canRemoveFeature, type RuleResult } from './rules';
import { isTechComplete } from './effects';
import { UNITS, type UnitDef } from '../data/units';
import type { ImprovementId } from './types';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

// ---------------------------------------------------------------------------
// In-state RNG (groundwork for stochastic mechanics; serialized => replayable)
// ---------------------------------------------------------------------------

/** Advance the game's RNG and return a float in [0, 1). */
export function nextRandom(state: GameState): number {
  let a = state.rngState | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = a;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/** Can a land unit ever stand on this tile? */
export function unitPassable(tile: Tile): boolean {
  return !isWater(tile) && !isImpassable(tile);
}

/** Civ 6-ish movement cost to ENTER a tile (river handled separately). */
export function moveCostInto(tile: Tile): number {
  let cost = 1;
  if (tile.elevation === 'HILLS') cost += 1;
  if (tile.feature === 'WOODS' || tile.feature === 'RAINFOREST' || tile.feature === 'MARSH') cost += 1;
  return cost;
}

/** Does stepping from `from` toward `to` cross a river edge? */
export function crossesRiver(from: Tile, to: Tile): boolean {
  if (from.riverMask === 0) return false;
  const [fq, fr] = offsetToAxial(from.col, from.row);
  const [tq, tr] = offsetToAxial(to.col, to.row);
  for (let d = 0; d < 6; d++) {
    if (fq + AXIAL_DIRS[d][0] === tq && fr + AXIAL_DIRS[d][1] === tr) {
      return (from.riverMask & (1 << d)) !== 0;
    }
  }
  return false;
}

export function unitAt(state: GameState, tileIndex: number): Unit | undefined {
  return state.units.find((u) => u.tileIndex === tileIndex);
}

/** Stacking: one civilian per tile (military stacking arrives in 11b). */
export function tileFreeForUnit(state: GameState, tileIndex: number, ignoreUnitId?: number): boolean {
  const tile = state.map.tiles[tileIndex];
  if (!unitPassable(tile)) return false;
  const u = unitAt(state, tileIndex);
  return !u || u.id === ignoreUnitId;
}

/**
 * A* path (tile indexes, excluding the start). Ignores MP — the walker
 * spends MP turn by turn. Occupied intermediate tiles are allowed (units
 * pass through); only the destination must be free.
 */
export function findPath(state: GameState, unit: Unit, targetIndex: number): number[] | null {
  const map = state.map;
  const target = map.tiles[targetIndex];
  if (!unitPassable(target)) return null;
  const start = map.tiles[unit.tileIndex];

  const open = new Map<number, { g: number; f: number; from: number }>();
  const closed = new Set<number>();
  open.set(start.index, { g: 0, f: hexDistance(start.col, start.row, target.col, target.row), from: -1 });
  const parents = new Map<number, number>();

  while (open.size > 0) {
    let bestIdx = -1;
    let bestF = Infinity;
    for (const [i, n] of open) {
      if (n.f < bestF) {
        bestF = n.f;
        bestIdx = i;
      }
    }
    const cur = open.get(bestIdx)!;
    open.delete(bestIdx);
    closed.add(bestIdx);
    if (bestIdx === targetIndex) {
      const path: number[] = [];
      let at = targetIndex;
      while (at !== start.index) {
        path.unshift(at);
        at = parents.get(at)!;
      }
      return path;
    }
    const curTile = map.tiles[bestIdx];
    for (const n of neighbors(map, curTile)) {
      if (closed.has(n.index) || !unitPassable(n)) continue;
      // Rivers eat all remaining MP; approximate their path cost as +3.
      const g = cur.g + moveCostInto(n) + (crossesRiver(curTile, n) ? 3 : 0);
      const existing = open.get(n.index);
      if (!existing || g < existing.g) {
        open.set(n.index, { g, f: g + hexDistance(n.col, n.row, target.col, target.row), from: bestIdx });
        parents.set(n.index, bestIdx);
      }
    }
  }
  return null;
}

/** Walk a unit along its stored path while it has moves (Civ 6 one-step rule). */
export function walkPath(state: GameState, unit: Unit): void {
  while (unit.path && unit.path.length > 0 && unit.movesLeft > 0) {
    const nextIndex = unit.path[0];
    const from = state.map.tiles[unit.tileIndex];
    const to = state.map.tiles[nextIndex];
    // The destination tile must be free when it's the final step.
    if (unit.path.length === 1 && !tileFreeForUnit(state, nextIndex, unit.id)) {
      unit.path = null;
      return;
    }
    const river = crossesRiver(from, to);
    unit.tileIndex = nextIndex;
    unit.path.shift();
    unit.movesLeft = river ? 0 : Math.max(0, unit.movesLeft - moveCostInto(to));
  }
  if (unit.path && unit.path.length === 0) unit.path = null;
}

/** Order a move: computes a path and walks as far as this turn's MP allow. */
export function orderMove(state: GameState, unitId: number, targetIndex: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return no('No such unit.');
  if (targetIndex === unit.tileIndex) return no('Already there.');
  if (!tileFreeForUnit(state, targetIndex, unit.id)) return no('Destination blocked or impassable.');
  const path = findPath(state, unit, targetIndex);
  if (!path) return no('No path to that tile.');
  unit.path = path;
  walkPath(state, unit);
  return ok;
}

// ---------------------------------------------------------------------------
// Training & upkeep
// ---------------------------------------------------------------------------

/** Unit types a city can train right now. */
export function trainableUnits(state: GameState): UnitDef[] {
  if (!state.unitsMode) return [];
  return Object.values(UNITS).filter(
    (d) => !d.requiresTech || state.sandbox || isTechComplete(state, d.requiresTech),
  );
}

export function queueUnit(state: GameState, cityId: number, unitType: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return no('No such city.');
  if (!trainableUnits(state).some((d) => d.id === unitType)) {
    return no('Unit not available (enable units mode / research).');
  }
  if (state.sandbox) {
    spawnUnit(state, unitType, city.centerIndex);
    return ok;
  }
  city.queue.push({ kind: 'unit', unit: unitType, progress: 0 });
  return ok;
}

/** Place a new unit on/near a tile (first free spot by distance). */
export function spawnUnit(state: GameState, unitType: string, nearIndex: number): Unit | null {
  const def = UNITS[unitType];
  if (!def) return null;
  const near = state.map.tiles[nearIndex];
  const spot = [near, ...neighbors(state.map, near)]
    .sort((a, b) => hexDistance(near.col, near.row, a.col, a.row) - hexDistance(near.col, near.row, b.col, b.row))
    .find((t) => tileFreeForUnit(state, t.index));
  if (!spot) return null;
  const unit: Unit = {
    id: state.nextUnitId++,
    type: unitType,
    tileIndex: spot.index,
    movesLeft: def.moves,
    charges: def.charges ?? null,
    path: null,
  };
  state.units.push(unit);
  return unit;
}

export function disbandUnit(state: GameState, unitId: number): void {
  state.units = state.units.filter((u) => u.id !== unitId);
}

/** Empire-level gold upkeep of all units. */
export function unitMaintenance(state: GameState): number {
  return state.units.reduce((s, u) => s + (UNITS[u.type]?.maintenance ?? 0), 0);
}

/** Start-of-turn refresh: MP back to full, multi-turn moves continue. */
export function refreshUnits(state: GameState): void {
  for (const unit of state.units) {
    unit.movesLeft = UNITS[unit.type]?.moves ?? 2;
    if (unit.path) walkPath(state, unit);
  }
}

// ---------------------------------------------------------------------------
// Builder actions
// ---------------------------------------------------------------------------

function builderOn(state: GameState, unitId: number): { unit?: Unit; err?: RuleResult } {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return { err: no('No such unit.') };
  if (UNITS[unit.type]?.charges === undefined) return { err: no('Not a builder.') };
  if ((unit.charges ?? 0) <= 0) return { err: no('No charges left.') };
  return { unit };
}

function spendCharge(state: GameState, unit: Unit): void {
  unit.charges = (unit.charges ?? 1) - 1;
  unit.movesLeft = 0;
  if (unit.charges <= 0) disbandUnit(state, unit.id);
}

/** Build an improvement with the builder standing on the tile (instant, 1 charge). */
export function builderImprove(state: GameState, unitId: number, imp: ImprovementId): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (!validImprovements(state, tile).includes(imp)) {
    return no('Not a valid improvement for this tile.');
  }
  tile.improvement = imp;
  spendCharge(state, unit!);
  return ok;
}

/** Remove a feature (chop) with the builder standing on the tile (1 charge). */
export function builderRemoveFeature(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  const check = canRemoveFeature(state, tile);
  if (!check.ok) return check;
  if (tile.improvement === 'LUMBER_MILL' && tile.feature === 'WOODS') tile.improvement = null;
  tile.feature = null;
  spendCharge(state, unit!);
  return ok;
}

/** Neighboring tile of a unit in direction d, if any (UI helper). */
export function unitNeighbor(state: GameState, unit: Unit, d: number): Tile | null {
  return neighborTile(state.map, state.map.tiles[unit.tileIndex], d);
}
