/**
 * Unit mechanics (stage 11a): movement with Civ 6-ish terrain costs and the
 * river-crossing rule, A* pathfinding, one-civilian-per-tile stacking,
 * training, maintenance, and builder actions. Military/combat land in 11b.
 */

import type { GameState, RivalCity, RivalCiv, Tile, Unit } from './types';
import { neighbors, neighborTile, hexDistance, AXIAL_DIRS, offsetToAxial } from './hex';
import { isWater, isImpassable } from './query';
import { validImprovements, canRemoveFeature, type RuleResult } from './rules';
import { isTechComplete } from './effects';
import { UNITS, UNIT_HP, type UnitDef } from '../data/units';
import { revealAround, claimGoodyHut, nearestUnexplored } from './fog';
import { chopGrant, harvestGrant, applyLumpYield } from './economy';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import type { ImprovementId } from './types';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export { nextRandom } from './rand';

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

export function unitsAt(state: GameState, tileIndex: number): Unit[] {
  return state.units.filter((u) => u.tileIndex === tileIndex);
}

export function unitDomain(type: string): 'civilian' | 'military' {
  return UNITS[type]?.charges !== undefined ? 'civilian' : 'military';
}

/** Side key: rival civs are distinct sides; everyone else is their owner. */
export function unitSide(unit: { owner: Unit['owner']; civId?: number }): string {
  return unit.owner === 'rival' ? `rival:${unit.civId ?? 0}` : unit.owner;
}

/**
 * Are two units enemies right now? Barbarians fight everyone; rival civs
 * fight the player only while at war; rival civs never fight each other.
 */
export function unitsHostile(
  state: GameState,
  a: { owner: Unit['owner']; civId?: number },
  b: { owner: Unit['owner']; civId?: number },
): boolean {
  if (unitSide(a) === unitSide(b)) return false;
  if (a.owner === 'barbarian' || b.owner === 'barbarian') return true;
  if (a.owner === 'rival' && b.owner === 'rival') return false;
  const civId = a.owner === 'rival' ? a.civId : b.civId;
  return state.rivals.find((r) => r.id === civId)?.atWar ?? false;
}

/** Stacking: 1 military + 1 civilian per side; other sides block entirely. */
export function tileFreeForUnit(
  state: GameState,
  tileIndex: number,
  unit?: Unit | { type: string; owner: Unit['owner']; civId?: number; id?: number },
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (!unitPassable(tile)) return false;
  const side = unit ? unitSide(unit) : 'player';
  const domain = unit ? unitDomain(unit.type) : 'civilian';
  for (const u of unitsAt(state, tileIndex)) {
    if (u.id === unit?.id) continue;
    // C1-B5a: rival CIVS are foreign to each other — side alone can't tell
    // them apart. Inert for the all-military world (cross-civ military
    // blocked under either reading); it matters once rival civilians exist.
    if (unitSide(u) !== side || (side === 'rival' && u.civId !== unit?.civId)) return false; // foreign occupied
    if (unitDomain(u.type) === domain) return false; // same-slot ally
  }
  return true;
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
      // Rivers cost +3 to cross — the same charge the walker pays.
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

/** Walk a unit along its stored path while its MP cover each step. */
export function walkPath(state: GameState, unit: Unit): void {
  const full = UNITS[unit.type]?.moves ?? 2;
  while (unit.path && unit.path.length > 0 && unit.movesLeft > 0) {
    const nextIndex = unit.path[0];
    const from = state.map.tiles[unit.tileIndex];
    const to = state.map.tiles[nextIndex];
    // Enemy-occupied tiles block; the final step also needs a free slot.
    const blockedByEnemy = unitsAt(state, nextIndex).some((u) => u.owner !== unit.owner);
    if (blockedByEnemy || (unit.path.length === 1 && !tileFreeForUnit(state, nextIndex, unit))) {
      unit.path = null;
      return;
    }
    // P4/D-3+D-4 (real Civ 6): entering costs the tile's full cost, +3 for
    // a river crossing, and needs that much MP left — except a unit at full
    // MP may always take one step (paying everything it has). No more
    // Civ-5-style "enter on fumes", no river-zeroing.
    const cost = moveCostInto(to) + (crossesRiver(from, to) ? 3 : 0);
    if (unit.movesLeft < cost && unit.movesLeft < full) return; // path resumes next turn
    unit.tileIndex = nextIndex;
    unit.path.shift();
    unit.movesLeft = Math.max(0, unit.movesLeft - cost);

    if (unit.owner === 'player') {
      revealAround(state, nextIndex);
      claimGoodyHut(state, unit);
      // Player units clear barbarian camps by entering them (+50 gold).
      const camp = state.barbCamps.indexOf(nextIndex);
      if (camp >= 0) {
        state.barbCamps.splice(camp, 1);
        state.treasury += 50;
      }
    }
  }
  if (unit.path && unit.path.length === 0) unit.path = null;
}

/** Order a move: computes a path and walks as far as this turn's MP allow. */
export function orderMove(state: GameState, unitId: number, targetIndex: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return no('No such unit.');
  if (targetIndex === unit.tileIndex) return no('Already there.');
  if (!tileFreeForUnit(state, targetIndex, unit)) return no('Destination blocked or impassable.');
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

/** Place a new unit on/near a tile (first free slot by distance). */
export function spawnUnit(
  state: GameState,
  unitType: string,
  nearIndex: number,
  owner: Unit['owner'] = 'player',
  civId?: number,
): Unit | null {
  const def = UNITS[unitType];
  if (!def) return null;
  const near = state.map.tiles[nearIndex];
  const probe = { type: unitType, owner, civId };
  const spot = [near, ...neighbors(state.map, near)]
    .sort((a, b) => hexDistance(near.col, near.row, a.col, a.row) - hexDistance(near.col, near.row, b.col, b.row))
    .find((t) => tileFreeForUnit(state, t.index, probe));
  if (!spot) return null;
  const unit: Unit = {
    id: state.nextUnitId++,
    type: unitType,
    owner,
    tileIndex: spot.index,
    movesLeft: def.moves,
    hp: UNIT_HP,
    charges: def.charges ?? null,
    path: null,
  };
  if (civId !== undefined) unit.civId = civId;
  state.units.push(unit);
  if (owner === 'player') revealAround(state, unit.tileIndex);
  return unit;
}

/** Rival city occupying a tile, with its owner, if any. */
export function rivalCityAt(
  state: GameState,
  tileIndex: number,
): { rival: RivalCiv; city: RivalCity } | undefined {
  for (const rival of state.rivals) {
    const city = rival.cities.find((c) => c.centerIndex === tileIndex);
    if (city) return { rival, city };
  }
  return undefined;
}

export function disbandUnit(state: GameState, unitId: number): void {
  state.units = state.units.filter((u) => u.id !== unitId);
}

/** Empire-level gold upkeep of the player's units. */
export function unitMaintenance(state: GameState): number {
  return state.units.reduce(
    (s, u) => s + (u.owner === 'player' ? UNITS[u.type]?.maintenance ?? 0 : 0),
    0,
  );
}

/** Start-of-turn refresh: heal, MP back to full, multi-turn moves continue. */
export function refreshUnits(state: GameState): void {
  for (const unit of state.units) {
    const tile = state.map.tiles[unit.tileIndex];
    const full = UNITS[unit.type]?.moves ?? 2;
    // P4/D-2 (real Civ 6, unifies AUDIT C-7/C-8): a unit heals only if it
    // spent NO movement since its last refresh (the heal runs before the
    // reset below, so any move/attack/build blocks it) — +20 in a friendly
    // city (barbs: on their camp), +15 in own territory, +10 on neutral
    // ground, +5 on foreign-owned land.
    if (unit.movesLeft >= full) {
      const unowned = tile.cityId === -1 && tile.rivalId === undefined && tile.csId === undefined;
      let heal: number;
      if (unit.owner === 'player') {
        if (tile.cityId !== -1 && tile.district === 'CITY_CENTER') heal = 20;
        else if (tile.cityId !== -1) heal = 15;
        else heal = unowned ? 10 : 5;
      } else if (unit.owner === 'rival') {
        if (tile.rivalId === unit.civId && tile.district === 'CITY_CENTER') heal = 20;
        else if (tile.rivalId === unit.civId) heal = 15;
        else heal = unowned ? 10 : 5;
      } else {
        // barbarian: the camp is home
        if (state.barbCamps.includes(unit.tileIndex)) heal = 20;
        else heal = unowned ? 10 : 5;
      }
      unit.hp = Math.min(UNIT_HP, unit.hp + heal);
    }
    unit.movesLeft = full;
    if (unit.path) walkPath(state, unit);
    // Auto-explore: keep chasing the fog until there is none in reach.
    if (unit.mission === 'explore' && !unit.path && unit.movesLeft > 0) {
      const target = nearestUnexplored(state, unit);
      if (target === null) {
        unit.mission = null;
      } else {
        const path = findPath(state, unit, target);
        if (path) {
          unit.path = path;
          walkPath(state, unit);
        } else {
          unit.mission = null;
        }
      }
    }
  }
}

/** Toggle a unit's auto-explore standing order. */
export function setExploreMission(state: GameState, unitId: number, on: boolean): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return no('No such unit.');
  unit.mission = on ? 'explore' : null;
  if (!on) unit.path = null;
  return ok;
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

/** Repair a pillaged improvement (no charge, ends the builder's turn). */
export function builderRepair(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (!tile.pillaged) return no('Nothing pillaged here.');
  tile.pillaged = false;
  unit!.movesLeft = 0;
  return ok;
}

/**
 * Remove a feature (chop) with the builder standing on the tile (1 charge).
 * Chops inside your borders grant an era-scaled yield lump (the Civ 6
 * "chop economy") — this is the only path that pays; the free calculator
 * mode's Remove action does not.
 */
export function builderRemoveFeature(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  const check = canRemoveFeature(state, tile);
  if (!check.ok) return check;
  const grant = state.sandbox ? null : chopGrant(state, tile);
  const featureName = tile.feature ? FEATURES[tile.feature]?.name ?? tile.feature : '';
  if (tile.improvement === 'LUMBER_MILL' && tile.feature === 'WOODS') tile.improvement = null;
  tile.feature = null;
  if (grant) {
    applyLumpYield(state, tile.index, grant);
    state.eventLog.push(`Chopped ${featureName}: +${grant.amount} ${grant.key}.`);
  }
  spendCharge(state, unit!);
  return ok;
}

/** Harvest a bonus resource (1 charge): removes it for an era-scaled yield lump. */
export function builderHarvest(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (!tile.resource) return no('No resource here.');
  const grant = harvestGrant(state, tile);
  if (!grant) {
    return no(
      tile.cityId === -1
        ? 'Harvesting only works inside your borders.'
        : 'This resource cannot be harvested (or needs research).',
    );
  }
  const resName = RESOURCES[tile.resource]?.name ?? tile.resource;
  tile.resource = null;
  applyLumpYield(state, tile.index, grant);
  state.eventLog.push(`Harvested ${resName}: +${grant.amount} ${grant.key}.`);
  spendCharge(state, unit!);
  return ok;
}

/** Neighboring tile of a unit in direction d, if any (UI helper). */
export function unitNeighbor(state: GameState, unit: Unit, d: number): Tile | null {
  return neighborTile(state.map, state.map.tiles[unit.tileIndex], d);
}
