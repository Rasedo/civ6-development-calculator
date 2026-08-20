/**
 * Unit mechanics (stage 11a): movement with Civ 6-ish terrain costs and the
 * river-crossing rule, A* pathfinding, one-civilian-per-tile stacking,
 * training, maintenance, and builder actions. Military/combat land in 11b.
 */

import type { GameState, City, Seat, Tile, Unit } from './types';
import { logUnitOrder } from './seatTurn';
import { neighbors, neighborTile, hexDistance, AXIAL_DIRS, offsetToAxial } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { validImprovements, canRemoveFeature, type RuleResult } from './rules';
import { tileAppeal } from './appeal';
import { PARK_MIN_APPEAL } from '../data/improvements';
import { isTechComplete, isCivicComplete } from './effects';
import { ARTIFACT_BUILDING, ARTIFACT_SLOTS } from '../data/greatPeople';
import { clearCampFor } from './combat';
import { UNITS, UNIT_HP, ENCAMPMENT_HP, type UnitDef } from '../data/units';
import { generalAuraMP } from './aura'; // the aura's +1 MP half
import { goldenMoveBonus } from './eras'; // MONUMENTALITY / EXODUS +2 MP
import { GAME_SPEED, EMBARK_MOVES } from '../data/constants';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { tradeCapacity } from './trade';
import { revealAround, claimGoodyHut, nearestUnexplored } from './fog';
import { chopGrant, harvestGrant, applyLumpYield } from './economy';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { NO_SEAT, capsOf, campTiles, civHasStrategic, civsAtWar, seatOf, tileClaimed, tileSeat } from './seats';
import type { ImprovementId } from './types';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export { nextRandom } from './rand';


/**
 * The unit-aware TERRAIN passability plane. A NAVAL unit stands on
 * water; a LAND unit (or a legacy no-unit call) stands on land; impassable
 * (mountains, ice, impassable wonders) blocks everyone. This is only the
 * terrain layer — tech gating (a land unit EMBARKING onto water, and OCEAN
 * needing CARTOGRAPHY) is composed by the caller through `tileFreeForUnit`
 * (it needs the owner's research), mirroring the GPU where `passable`/`wpass`
 * are terrain planes and the gate is applied at the gather site.
 */
export function unitPassable(tile: Tile, unit?: { type: string }): boolean {
  if (isImpassable(tile)) return false;
  const naval = unit ? !!UNITS[unit.type]?.naval : false;
  return naval ? isWater(tile) : !isWater(tile);
}

function ownerTechs(state: GameState, unit: { seat: number }): string[] {
  return seatOf(state, unit.seat)?.research.techs ?? [];
}

export function ownerHasTech(
  state: GameState,
  unit: { seat: number },
  tech: string,
): boolean {
  return ownerTechs(state, unit).includes(tech);
}

/** can this LAND unit embark? Its OWNER needs SAILING (civilians) or
 * SHIPBUILDING (all land units incl. military). Naval units never "embark". */
export function canEmbark(
  state: GameState,
  unit: { type: string; seat: number },
): boolean {
  if (UNITS[unit.type]?.naval) return false;
  const tech = unitDomain(unit.type) === 'civilian' ? 'SAILING' : 'SHIPBUILDING';
  return ownerHasTech(state, unit, tech);
}

/** may a mover (naval or embarking land unit) ENTER this water tile
 * given its owner's tech? OCEAN needs CARTOGRAPHY; COAST/LAKE do not. Assumes
 * the tile is water and not impassable (the terrain plane already checked). */
export function waterEnterable(
  state: GameState,
  tile: Tile,
  unit: { seat: number },
): boolean {
  if (tile.terrain === 'OCEAN') return ownerHasTech(state, unit, 'CARTOGRAPHY');
  return true;
}

/**
 * Is this step ROAD-to-ROAD? Real Civ 6 roads only help a unit
 * moving FROM a road tile TO a road tile — a single roaded tile in open
 * country does nothing.
 */
export function roadStep(from: Tile, to: Tile): boolean {
  return !!from.road && !!to.road;
}

/**
 * Do roads carry BRIDGES yet? Civ 6 upgrades roads by ERA — the
 * Ancient road has no bridges, the Classical road does. The flag is latched at
 * the first era boundary (eras.ts), the one site both engines already fire in
 * lockstep. From the Classical era on, a road-to-road step pays no river.
 */
export function roadBridges(state: GameState): boolean {
  return !!state.roadBridges;
}

/** Civ 6-ish movement cost to ENTER a tile (river handled separately).
 * Water tiles enter at a flat 1 (embarked/naval movement — no
 * hills/features on water). Land tiles keep the terrain schedule.
 * A ROAD-to-ROAD step ignores the terrain penalty entirely —
 * "roads let a unit pass through Woods or Hills as if it were flat".
 * `from` is the tile being left; passing the same tile twice is harmless. */
export function moveCostInto(from: Tile, tile: Tile): number {
  if (isWater(tile)) return 1;
  if (roadStep(from, tile)) return 1;
  let cost = 1;
  if (tile.elevation === 'HILLS') cost += 1;
  if (tile.feature === 'WOODS' || tile.feature === 'RAINFOREST' || tile.feature === 'MARSH') cost += 1;
  return cost;
}

export function riverCharge(state: GameState, from: Tile, to: Tile): number {
  if (isWater(to)) return 0;
  if (roadStep(from, to) && roadBridges(state)) return 0;
  return crossesRiver(from, to) ? RIVER_CROSS_MP : 0;
}

/**
 * ONE step of a Trader's walk: from `fromIndex`, the passable neighbour with
 * the lowest hexDistance to `targetIndex` (ties by direction order) — the
 * SAME integer stepping rule the war-march uses, so both engines agree by
 * construction. Returns `fromIndex` unchanged when arrived or stuck (no
 * strictly-closer passable neighbour). Zero draws, integer-only.
 */
export function tradeWalkStep(state: GameState, fromIndex: number, targetIndex: number): number {
  const map = state.map;
  const dest = map.tiles[targetIndex];
  const at = map.tiles[fromIndex];
  if (!dest || !at || fromIndex === targetIndex) return fromIndex;
  let best: Tile | undefined;
  let bestD = hexDistance(at.col, at.row, dest.col, dest.row);
  for (const n of neighbors(map, at)) {
    if (isWater(n) || isImpassable(n)) continue;
    const d = hexDistance(n.col, n.row, dest.col, dest.row);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best ? best.index : fromIndex;
}

/**
 * Can a Trader WALK from `fromIndex` to `toIndex` over land? A route whose
 * descent needs a water or impassable tile is a SEA route: its walker parks
 * at the origin and lays no roads (real Civ 6 lays roads only on land legs).
 */
export function tradeLandReachable(state: GameState, fromIndex: number, toIndex: number): boolean {
  const map = state.map;
  const dest = map.tiles[toIndex];
  const start = map.tiles[fromIndex];
  if (!dest || isWater(dest) || isImpassable(dest)) return false;
  if (!start || isWater(start) || isImpassable(start)) return false;
  let at = fromIndex;
  for (let step = 0; step < TRADE_ROAD_MAX_STEPS && at !== toIndex; step++) {
    const next = tradeWalkStep(state, at, toIndex);
    if (next === at) return false;
    at = next;
  }
  return at === toIndex;
}

/** the trade walk is bounded by the route range — a route
 *  longer than this cannot exist (canAddTradeRoute gates on TRADE_ROUTE_RANGE),
 *  so the bound is a safety rail, not a rule. */
export const TRADE_ROAD_MAX_STEPS = 32;

/** The MP a river crossing costs (real Civ 6 ends movement; this model charges
 *  a flat 3 — the pre-existing convention, now named). */
export const RIVER_CROSS_MP = 3;

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

export function unitsHostile(
  state: GameState,
  a: { seat: number },
  b: { seat: number },
): boolean {
  if (a.seat === b.seat) return false; // a seat is never hostile to itself
  // Hostility with NO war state — the one thing the war relation cannot
  // express, because an all-false row means peace.
  if (capsOf(a.seat).alwaysHostile || capsOf(b.seat).alwaysHostile) return true;
  return civsAtWar(state, a.seat, b.seat);
}

export function encampmentIntact(tile: Tile): boolean {
  return (
    tile.district === 'ENCAMPMENT' &&
    tile.districtComplete &&
    !tile.districtPillaged &&
    // Absent = FULL, the convention `outerHp ?? WALLS_HP` already uses for the
    // wall pool: a COMPLETE Encampment always has a garrison unless one has
    // actually been beaten down (which writes an explicit 0). Keeps imported
    // saves and directly-constructed states correct; the completion sites still
    // write the value explicitly so the GPU's zero-initialised plane agrees.
    (tile.encampHp ?? ENCAMPMENT_HP) > 0
  );
}

export function tileOwnerSide(tile: Tile): { seat: number } | null {
  const s = tileSeat(tile);
  return s === NO_SEAT ? null : { seat: s };
}

/**
 * Does a LIVE enemy Encampment bar this unit from the tile?
 * Real Civ 6: enemy units may not enter the district's tile until its garrison
 * is reduced to 0 — the melee attack that beats it down IS the entry attempt
 * (meleeAttack / the scripted walkers' attack step). The owner's own units and
 * anyone not at war pass freely.
 */
export function encampmentBlocks(
  state: GameState,
  tile: Tile,
  unit: { seat: number },
): boolean {
  if (!encampmentIntact(tile)) return false;
  const side = tileOwnerSide(tile);
  return side !== null && unitsHostile(state, unit, side);
}

export function inEnemyZoc(
  state: GameState,
  tileIndex: number,
  mover: { seat: number },
): boolean {
  const tile = state.map.tiles[tileIndex];
  for (const n of neighbors(state.map, tile)) {
    for (const u of unitsAt(state, n.index)) {
      // EMBARKED units do NOT exert a zone of control (they still
      // OBEY — the mover's halt rule below is unchanged). Naval military exert
      // normally (no naval units yet, so that half is inert).
      if (unitDomain(u.type) === 'military' && !u.embarked && unitsHostile(state, u, mover)) return true;
    }
  }
  return false;
}

/** FORTIFY: the defender-strength bonus a unit's fortifyTurns grants
 * (+3 CS at >=1, +6 at >=2; cap 2). Civilians never fortify (0). */
export function fortifyBonus(unit: { fortifyTurns?: number }): number {
  return Math.min(2, unit.fortifyTurns ?? 0) * 3;
}



function tileOwnedByUnitOwner(t: Tile, unit: { seat: number }): boolean {
  return tileSeat(t) === unit.seat;
}

export function cliffBlocks(state: GameState, a: Tile, b: Tile, unit?: { seat: number }): boolean {
  const land = isWater(a) ? b : a;
  const water = isWater(a) ? a : b;
  if (isWater(land) || !isWater(water)) return false; // not a land/water edge
  if (!land.cliffMask) return false;
  if (land.district === 'CITY_CENTER') return false; // cities ignore cliffs
  if (land.district === 'HARBOR' && unit && tileOwnedByUnitOwner(land, unit)) return false;
  for (let d = 0; d < 6; d++) {
    if (neighborTile(state.map, land, d)?.index === water.index) {
      return (land.cliffMask & (1 << d)) !== 0;
    }
  }
  return false;
}

/**
 * Is this ONE step an embark/disembark closed by a cliff?
 *
 * Every mover asks the same question, so it lives in one place: a cliff only
 * ever gates a LAND↔WATER transition, and naval units never transition at all.
 * One caller-set on both engines, because a mover that skips it crosses a
 * cliff the others cannot, so
 * the two engines applied the rule to DISJOINT sets of units and a seat
 * musketman embarked over a cliff on one engine but not the other.
 *
 * Callers must filter this at CANDIDATE level, not use it as a halt: a walker
 * routes AROUND a cliff to its next-best neighbour (the GPU's step_ok mask).
 */
export function cliffBlocksStep(
  state: GameState,
  from: Tile,
  to: Tile,
  unit: { type: string; seat: number },
): boolean {
  if (UNITS[unit.type]?.naval) return false; // naval movers never transition
  if (isWater(from) === isWater(to)) return false; // not a land/water crossing
  return cliffBlocks(state, from, to, unit);
}

export function tileFreeForUnit(
  state: GameState,
  tileIndex: number,
  seat: number,
  unit?: Unit | { type: string; seat: number; id?: number },
  allowEmbark = false,
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (isImpassable(tile)) return false;
  const naval = unit ? !!UNITS[unit.type]?.naval : false;
  if (isWater(tile)) {
    if (naval) {
      if (!unit || !waterEnterable(state, tile, unit)) return false;
    } else {
      if (!allowEmbark || !unit || !canEmbark(state, unit) || !waterEnterable(state, tile, unit)) return false;
    }
  } else {
    // Land tile: naval units cannot stand ashore; land units use the land plane.
    if (naval) return false;
  }
  // A LIVE enemy Encampment garrison bars entry outright. The
  // beat-it-down path is the melee attack ON the tile, never a move.
  if (unit && encampmentBlocks(state, tile, unit)) return false;
  const side = unit ? unit.seat : seat;
  const domain = unit ? unitDomain(unit.type) : 'civilian';
  for (const u of unitsAt(state, tileIndex)) {
    if (u.id === unit?.id) continue;
    if (u.seat !== side) return false; // foreign occupied
    if (unitDomain(u.type) === domain) return false; // same-slot ally
  }
  return true;
}

export function findPath(state: GameState, unit: Unit, targetIndex: number): number[] | null {
  const map = state.map;
  const target = map.tiles[targetIndex];
  const naval = !!UNITS[unit.type]?.naval;
  const passOk = (t: Tile): boolean =>
    // Routing never plans THROUGH a live enemy Encampment.
    !encampmentBlocks(state, t, unit) &&
    (naval ? isWater(t) && !isImpassable(t) && waterEnterable(state, t, unit) : unitPassable(t));
  if (!passOk(target)) return null;
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
      if (closed.has(n.index) || !passOk(n)) continue;
      // Rivers cost +3 to cross — the same charge the walker pays (water steps
      // never pay a river charge, so naval routing skips it).
      const g = cur.g + moveCostInto(curTile, n) + (naval ? 0 : riverCharge(state, curTile, n)); // roads
      const existing = open.get(n.index);
      if (!existing || g < existing.g) {
        open.set(n.index, { g, f: g + hexDistance(n.col, n.row, target.col, target.row), from: bestIdx });
        parents.set(n.index, bestIdx);
      }
    }
  }
  return null;
}

export type StepOutcome =
  | 'moved'
  | 'halted'
  | 'cantAfford'
  | 'blocked';

/**
 * THE movement-point contract, in one place.
 *
 * Every walker asks this one text. Six copies could not stay the same — the
 * cliff rule reached only two of them, and the two engines enforced it on
 * DIFFERENT unit sets, which is how a musketman walked over a
 * cliff onto water in the off-script gate, t198). One body now
 * owns the whole contract:
 *
 *   - Real Civ 6: entering costs the tile's full cost, +3 for a
 *     river crossing, and needs that much MP left — except a unit at FULL MP
 *     may always take one step, paying everything it has. No Civ-5-style
 *     "enter on fumes", no river-zeroing.
 *   - Embark/disembark (a LAND unit crossing land↔water) costs ALL remaining
 *     MP. Naval units never transition; water steps never pay a river charge.
 *     An embarked land unit's pool is EMBARK_MOVES, not its land allowance.
 *   - a CLIFF is an unbreakable barrier to that transition —
 *     their entire function, and what makes a cliff-ringed city safe from
 *     naval invasion. Sourced exceptions (the land tile being a city, a
 *     HARBOR bordering the cliff) live in cliffBlocksStep.
 *   - ANY non-barbarian unit clears a barb camp by entering it.
 *     clearCampFor no-ops for barbarians and credits the right treasury.
 *   - ZOC: ending adjacent to a hostile MILITARY unit zeroes MP.
 *
 * The CALLER still picks the destination. That is where the walkers genuinely
 * differ — candidate sets, occupancy tests, stop conditions — and those stay
 * injected at the call site rather than flagged in here.
 *
 * The reveal/goody-hut block is seat 0-only and stays inert for every other
 * walker: hostileUnitAct is fed only by barbUnits/the seat's unit list, and the seat
 * civilian walkers iterate one seat's units.
 */
/**
 * The movement pool a unit is GRANTED for a turn, BEFORE the general/admiral
 * aura: its type's `moves`, or the flat EMBARK_MOVES pool while embarked,
 * plus whatever golden dedication its seat holds. An
 * embarked unit keeps EMBARK_MOVES — embarkation speed is not a unit's own
 * movement, so the dedication does not touch it.
 *
 * FOUR sites computed this expression — stepUnit, refreshUnits,
 * seatPhase and spawnUnit — and a bonus added to one of them is a bonus the
 * other three silently disagree about. The GPU's twin is `_full_mp`.
 */
export function unitFullMoves(state: GameState, unit: { type: string; seat: number; embarked?: boolean }): number {
  const def = UNITS[unit.type];
  if (unit.embarked && !def?.naval) return EMBARK_MOVES;
  return (def?.moves ?? 2) + goldenMoveBonus(state, unit);
}

export function stepUnit(state: GameState, unit: Unit, to: Tile): StepOutcome {
  const seat = unit.seat;
  const from = state.map.tiles[unit.tileIndex];
  const naval = !!UNITS[unit.type]?.naval;
  const full = unitFullMoves(state, unit);
  const transition = !naval && isWater(from) !== isWater(to);
  if (cliffBlocksStep(state, from, to, unit)) return 'blocked';
  const cost = transition
    ? unit.movesLeft
    : moveCostInto(from, to) + riverCharge(state, from, to); // roads
  if (unit.movesLeft < cost && unit.movesLeft < full) return 'cantAfford';
  if (transition) unit.embarked = isWater(to);
  unit.tileIndex = to.index;
  logUnitOrder(state, unit.seat, unit.id, 'move', to.index);
  unit.movesLeft = Math.max(0, unit.movesLeft - cost);
  if (unit.seat === seat) {
    revealAround(state, unit.seat, to.index);
    claimGoodyHut(state, unit);
  }
  clearCampFor(state, unit, to.index, seat);
  if (inEnemyZoc(state, unit.tileIndex, unit)) {
    unit.movesLeft = 0;
    return 'halted';
  }
  return unit.movesLeft > 0 ? 'moved' : 'halted';
}


export function walkPath(state: GameState, unit: Unit): void {
  while (unit.path && unit.path.length > 0 && unit.movesLeft > 0) {
    const nextIndex = unit.path[0];
    const to = state.map.tiles[nextIndex];
    const blockedByEnemy =
      unitsAt(state, nextIndex).some((u) => u.seat !== unit.seat) ||
      encampmentBlocks(state, to, unit);
    if (blockedByEnemy || (unit.path.length === 1 && !tileFreeForUnit(state, nextIndex, unit.seat, unit))) {
      unit.path = null;
      return;
    }
    const outcome = stepUnit(state, unit, to);
    if (outcome === 'blocked') {
      unit.path = null;
      return;
    }
    if (outcome === 'cantAfford') return; // path resumes next turn
    unit.path.shift();
  }
  if (unit.path && unit.path.length === 0) unit.path = null;
}

export function orderMove(state: GameState, unitId: number, targetIndex: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return no('No such unit.');
  if (targetIndex === unit.tileIndex) return no('Already there.');
  if (!tileFreeForUnit(state, targetIndex, 0, unit)) return no('Destination blocked or impassable.');
  const path = findPath(state, unit, targetIndex);
  if (!path) return no('No path to that tile.');
  unit.path = path;
  walkPath(state, unit);
  return ok;
}


/**
 * The builder price escalator — 50 + 4 (pre-speed) per
 * builder THIS SEAT HAS ALREADY PRODUCED, rounded after the game-speed scale
 * like every unit cost (data/units U()). The exporter mirrors the 50/4 literals
 * as scenario.builderBase/builderPer.
 *
 * ONE escalator for every seat, and the QUEUED term is GONE.
 *
 * The seat 0 counted builders "ever trained/purchased OR CURRENTLY IN A QUEUE";
 * the seat counted only those trained. Civ 6 counts neither queue: the unit
 * cost progression is `CostProgressionParam1="4"` applied to the "number of
 * unit already produced" — producing is the event, and an item sitting in a
 * queue has produced nothing. So the CIV SEAT was right and the SEAT 0 was wrong,
 * which is exactly why this task's rule is "pick the behaviour closer to real
 * Civ 6", never "mirror the TypeScript engine".
 *   https://forums.civfanatics.com/threads/600489/
 *
 * `seat` defaults to the seat 0 so the UI call sites are untouched.
 */
export function builderCost(state: GameState, seat: number): number {
  return Math.round((50 + 4 * (seatOf(state, seat)?.buildersTrained ?? 0)) * GAME_SPEED);
}

/**
 * The TRADER's live price. CIV6: the Trader's production cost is progressive
 * with GAME PROGRESS (COST_PROGRESSION_GAME_PROGRESS, Param1 400): the base
 * cost x (1 + 4 x p), p = floor(100 x the furthest tree fraction this seat
 * has finished, techs or civics) / 100.
 */
export function traderCost(state: GameState, seat: number): number {
  const r = seatOf(state, seat)!.research;
  const p =
    Math.floor(
      100 * Math.max(r.techs.length / Object.keys(TECHS).length, r.civics.length / Object.keys(CIVICS).length),
    ) / 100;
  return Math.round(UNITS.TRADER.cost * (1 + 4 * p));
}

/**
 * A city may build/buy NAVAL units iff its CENTER is adjacent to a
 * water tile OR it owns a COMPLETED Harbor. Mirrors the GPU naval-build gate
 * (static center-water-adjacency plane | dynamic completed-Harbor). Works for
 * both seat 0 City and City (both carry centerIndex + districts).
 */
export function cityNavalCapable(
  state: GameState,
  city: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): boolean {
  const center = state.map.tiles[city.centerIndex];
  // Enterable water only (the GPU `wpass` plane = isWater && !impassable): a
  // center facing only impassable water (ice) cannot field ships. Matching this
  // exactly keeps the naval-build gate turn-identical across the engines.
  if (neighbors(state.map, center).some((n) => isWater(n) && !isImpassable(n))) return true;
  return city.districts.some(
    (d) => d.type === 'HARBOR' && state.map.tiles[d.tileIndex].districtComplete,
  );
}

export function trainableUnits(
  state: GameState,
  seat: number,
  city?: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): UnitDef[] {
  if (!state.unitsMode) return [];
  return Object.values(UNITS).filter((d) => {
    // Faith-purchase-only chassis (MISSIONARY) — never trainable or
    // gold-purchasable (purchaseUnit funnels through here), sandbox included.
    if (d.faithOnly) return false;
    // Spawn-only chassis (GENERAL/ADMIRAL) — birthed only by the
    // Great-Person claim, never trained/purchased on any seat (sandbox too).
    if (d.spawnOnly) return false;
    // The SETTLER trains through its own escalating-cost column
    // (queueSettler/purchaseSettler), never the generic unit columns.
    if (d.settler) return false;
    if (d.requiresTech && !state.sandbox && !isTechComplete(state, d.requiresTech, seat)) return false;
    if (d.requiresCivic && !state.sandbox && !isCivicComplete(state, d.requiresCivic, seat)) return false;
    // An ARCHAEOLOGIST may only be trained where its city's
    // ARCHAEOLOGICAL MUSEUM still has a FREE artifact slot — the real Civ 6
    // rule, and the reason its charge count equals the free slots. Without a
    // museum the unit has nowhere to put what it digs up.
    if (d.id === 'ARCHAEOLOGIST' && !state.sandbox) {
      if (!city) return false;
      const held = seatOf(state, seat)!.cities.find((c) => c.centerIndex === city.centerIndex);
      const has = (held?.buildings ?? []).includes(ARTIFACT_BUILDING);
      if (!has || (held?.artifacts ?? 0) >= ARTIFACT_SLOTS) return false;
    }
    // CIV6: "when the number of Traders equals the Trading Capacity you
    // cannot build more Traders" — the count is free Trader units plus
    // active routes (each active route embodies a spent Trader).
    if (d.trader && !state.sandbox) {
      const owned =
        state.units.filter((u) => u.seat === seat && u.type === 'TRADER').length +
        (seatOf(state, seat)?.tradeRoutes ?? []).length;
      if (owned >= tradeCapacity(state, seat)) return false;
    }
    // The NATURALIST is bought with FAITH and nothing else (real Civ 6), so
    // it never joins a production column.
    if (d.naturalist) return false;
    if (d.requiresResource && !state.sandbox && !civHasStrategic(state, seat, d.requiresResource)) return false;
    if (d.naval) return !!city && cityNavalCapable(state, city);
    return true;
  });
}

/** the civic that reveals SHIPWRECKS in real Civ 6, and so the one that
 *  lets an Archaeologist work one. */
export const SHIPWRECK_CIVIC = 'CULTURAL_HERITAGE';

/** Is there a dig under this unit that it may work RIGHT NOW? Land
 *  sites need nothing; a WRECK needs Cultural Heritage. */
export function digUnderfoot(state: GameState, tile: Tile | undefined, seat: number): 'antiquity' | 'shipwreck' | null {
  if (!tile) return null;
  if (tile.antiquity) return 'antiquity';
  if (tile.shipwreck && isCivicComplete(state, SHIPWRECK_CIVIC, seat)) return 'shipwreck';
  return null;
}

/**
 * EXCAVATE a dig into an Artifact. The Archaeologist must stand on
 * an ANTIQUITY SITE or a SHIPWRECK, hold a charge, and the tile must be its
 * own or unclaimed — real Civ 6 additionally allows foreign territory under
 * an OPEN BORDERS treaty, which neither engine has any concept of. The
 * artifact lands in the LOWEST-id own city that has an ARCHAEOLOGICAL MUSEUM
 * with a free slot (the placeRelic ordering) and carries its PROVENANCE (the
 * era it was buried in, and whose event buried it) into that museum's slot,
 * where the theming rule reads it. The dig is consumed. With no free slot
 * anywhere the excavation is refused rather than silently losing the find.
 */
export function archaeologistExcavate(state: GameState, unitId: number, seat: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.seat !== seat) return no('No such unit.');
  if (unit.type !== 'ARCHAEOLOGIST') return no('Only an Archaeologist can excavate.');
  if ((unit.charges ?? 0) <= 0) return no('No charges left.');
  const tile = state.map.tiles[unit.tileIndex];
  const kind = digUnderfoot(state, tile, seat);
  if (!kind) return no('No dig here.');
  if (tileClaimed(tile) && tileSeat(tile) !== unit.seat) {
    return no('That dig lies in foreign territory.');
  }
  const home = seatOf(state, seat)!.cities
    .filter((c) => c.buildings.includes(ARTIFACT_BUILDING) && (c.artifacts ?? 0) < ARTIFACT_SLOTS)
    .sort((a, b) => a.id - b.id)[0];
  if (!home) return no('No Archaeological Museum has a free artifact slot.');
  home.artifacts = (home.artifacts ?? 0) + 1;
  (home.artifactEras ??= []).push((kind === 'antiquity' ? tile.antiquityEra : tile.shipwreckEra) ?? 0);
  (home.artifactSeats ??= []).push((kind === 'antiquity' ? tile.antiquitySeat : tile.shipwreckSeat) ?? NO_SEAT);
  if (kind === 'antiquity') {
    tile.antiquity = false;
    tile.antiquityEra = undefined;
    tile.antiquitySeat = undefined;
  } else {
    tile.shipwreck = false;
    tile.shipwreckEra = undefined;
    tile.shipwreckSeat = undefined;
  }
  spendCharge(state, unit);
  state.eventLog.push(`An Artifact was excavated and displayed in ${home.name}.`);
  return ok;
}

/** the four tiles a National Park would cover if it were anchored on
 *  `a` toward its neighbour `b`: the pair itself plus the two tiles adjacent
 *  to BOTH — the hex rhombus real Civ 6 outlines. Empty when the pair has no
 *  two shared neighbours (a map edge). */
export function parkCluster(state: GameState, a: number, b: number): number[] {
  const ta = state.map.tiles[a];
  const tb = state.map.tiles[b];
  if (!ta || !tb) return [];
  const na = new Set(neighbors(state.map, ta).map((t) => t.index));
  if (!na.has(b)) return [];
  const shared = neighbors(state.map, tb)
    .map((t) => t.index)
    .filter((i) => na.has(i))
    .sort((x, y) => x - y);
  if (shared.length < 2) return [];
  return [a, b, shared[0], shared[1]].sort((x, y) => x - y);
}

/** may these four tiles become a National Park for `seat`? Real Civ 6:
 *  every tile Charming or better, all four owned by ONE city of the seat, and
 *  no improvement, district or wonder on any of them. */
export function parkClusterLegal(state: GameState, cluster: number[], seat: number): boolean {
  if (cluster.length !== 4) return false;
  const camps = campTiles(state);
  let city = -1;
  for (const i of cluster) {
    const t = state.map.tiles[i];
    if (!t || (t.park ?? -1) >= 0 || t.improvement || t.district || t.builtWonder) return false;
    if (tileSeat(t) !== seat) return false;
    if (city < 0) city = t.ownerCity;
    else if (t.ownerCity !== city) return false;
    if (tileAppeal(state.map, t, camps) < PARK_MIN_APPEAL) return false;
  }
  return city >= 0;
}

/**
 * DESIGNATE a National Park. The Naturalist must stand on one of the
 * four tiles (real Civ 6: "they must be able to move onto one of its tiles"),
 * and is CONSUMED by the designation. The park pays its tourism and its
 * amenities from the tiles themselves, so nothing is stored on the city.
 */
export function naturalistPark(state: GameState, unitId: number, seat: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.seat !== seat) return no('No such unit.');
  if (!UNITS[unit.type]?.naturalist) return no('Only a Naturalist can designate a park.');
  const here = state.map.tiles[unit.tileIndex];
  if (!here) return no('No such tile.');
  // The anchor's own neighbours, in TILE order, are the candidate partners;
  // the FIRST legal rhombus is taken, so both engines pick the same four.
  for (const nb of neighbors(state.map, here).slice().sort((x, y) => x.index - y.index)) {
    const cluster = parkCluster(state, unit.tileIndex, nb.index);
    if (!parkClusterLegal(state, cluster, seat)) continue;
    // the cluster comes back SORTED, so its first tile is the anchor both
    // engines name the park by.
    for (const i of cluster) state.map.tiles[i].park = cluster[0];
    disbandUnit(state, unit.id);
    state.eventLog.push('A National Park was designated.');
    return ok;
  }
  return no('No legal National Park cluster here.');
}

export function queueUnit(state: GameState, cityId: number, unitType: string, seat: number): RuleResult {
  const city = seatOf(state, seat)!.cities.find((c) => c.id === cityId);
  if (!city) return no('No such city.');
  if (!trainableUnits(state, seat, city).some((d) => d.id === unitType)) {
    return no('Unit not available (enable units mode / research).');
  }
  if (state.sandbox) {
    spawnUnit(state, unitType, city.centerIndex, seat);
    return ok;
  }
  if (unitType === 'BUILDER') {
    city.queue.push({ kind: 'unit', unit: unitType, progress: 0, cost: builderCost(state, seat) });
  } else {
    city.queue.push({ kind: 'unit', unit: unitType, progress: 0 });
  }
  return ok;
}

export function spawnUnit(
  state: GameState,
  unitType: string,
  nearIndex: number,
  seat: number,
): Unit | null {
  const def = UNITS[unitType];
  if (!def) return null;
  const near = state.map.tiles[nearIndex];
  const probe = { type: unitType, seat };
  const spot = [near, ...neighbors(state.map, near)]
    .sort((a, b) => hexDistance(near.col, near.row, a.col, a.row) - hexDistance(near.col, near.row, b.col, b.row))
    .find((t) => tileFreeForUnit(state, t.index, seat, probe));
  if (!spot) return null;
  const unit: Unit = {
    id: state.nextUnitId++,
    type: unitType,
    seat,
    tileIndex: spot.index,
    movesLeft: def.moves + goldenMoveBonus(state, { type: unitType, seat }),
    hp: UNIT_HP,
    charges: def.charges ?? null,
    path: null,
  };
  // FORTIFY: military units carry a fortify counter (civilians never do).
  if (def.charges === undefined) unit.fortifyTurns = 0;
  if (capsOf(seat).xp) unit.xp = 0;
  state.units.push(unit);
  revealAround(state, seat, unit.tileIndex);
  // Track the strongest MELEE unit each civ has ever fielded —
  // real Civ 6 bases city defense on it (spawnUnit is the chokepoint for
  // training, purchase, levies and seat production alike).
  if (def.combat > 0 && !def.ranged) {
    const owner = seatOf(state, seat);
    if (owner) owner.bestMeleeCS = Math.max(owner.bestMeleeCS ?? 0, def.combat);
  }
  return unit;
}

export function cityAtIndex(
  state: GameState,
  tileIndex: number,
): { holder: Seat; city: City } | undefined {
  for (const actor of state.seats) {
    const city = actor.cities.find((c) => c.centerIndex === tileIndex);
    if (city) return { holder: actor, city };
  }
  return undefined;
}

export function disbandUnit(state: GameState, unitId: number): void {
  state.units = state.units.filter((u) => u.id !== unitId);
}

export function settlerCount(state: GameState, seat: number): number {
  return state.units.reduce((n, u) => n + (u.seat === seat && u.type === 'SETTLER' ? 1 : 0), 0);
}

export function unitMaintenance(state: GameState, seat: number): number {
  return state.units.reduce(
    (s, u) => s + (u.seat === seat ? UNITS[u.type]?.maintenance ?? 0 : 0),
    0,
  );
}

export function refreshUnits(state: GameState): void {
  for (const unit of state.units) {
    const tile = state.map.tiles[unit.tileIndex];
    const naval = !!UNITS[unit.type]?.naval;
    const full = unitFullMoves(state, unit);
    // Real Civ 6: a unit heals only if it
    // spent NO movement since its last refresh (the heal runs before the
    // reset below, so any move/attack/build blocks it) — +20 in a friendly
    // city (barbs: on their camp), +15 in own territory, +10 on neutral
    // ground, +5 on foreign-owned land.
    // "spent no MP" is measured against what this unit was GRANTED
    // last refresh, not against its type's base moves — the aura's +1 MP makes
    // the granted pool vary per turn. `?? full` reproduces the pre-S3 gate for
    // units that have never been refreshed.
    const grantedLast = unit.movesFull ?? full;
    if (unit.movesLeft >= grantedLast) {
      const home = tileSeat(tile) === unit.seat;
      const onCamp = seatOf(state, unit.seat)?.camps.includes(unit.tileIndex) ?? false;
      const heal = home && tile.district === 'CITY_CENTER' ? 20
        : home ? 15
        : onCamp ? 20
        : tileSeat(tile) === NO_SEAT ? 10
        : 5;
      unit.hp = Math.min(UNIT_HP, unit.hp + heal);
    }
    // FORTIFY: the EXACT heal gate (movesLeft >= full = spent
    // no MP since the last refresh). A military unit that stayed put digs in
    // (+1, cap 2); any move/attack (movesLeft < full) resets it. Symmetric
    // across owners; read movesLeft BEFORE the reset below.
    // NAVAL units never fortify (real Civ 6) — inert until N2 adds
    // ships. (Embarked land units are still military but march every turn, so
    // their fortify gate resets to 0 in practice.)
    if (unitDomain(unit.type) === 'military' && !naval) {
      unit.fortifyTurns = unit.movesLeft >= grantedLast ? Math.min(2, (unit.fortifyTurns ?? 0) + 1) : 0;
    }
    // The Great General/Admiral aura grants +1 MP alongside its
    // +5 CS (real Civ 6). Record what was granted so NEXT turn's gates above
    // can tell "spent no MP" from "was simply given less".
    const granted = full + generalAuraMP(state, unit);
    unit.movesFull = granted;
    unit.movesLeft = granted;
    if (unit.path) walkPath(state, unit);
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

export function setExploreMission(state: GameState, unitId: number, on: boolean): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return no('No such unit.');
  unit.mission = on ? 'explore' : null;
  if (!on) unit.path = null;
  return ok;
}


function builderOn(state: GameState, unitId: number): { unit?: Unit; err?: RuleResult } {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return { err: no('No such unit.') };
  // CIV6: only the BUILDER spends charges on build verbs — a Missionary or
  // Apostle charge is a SPREAD, not a build (the GPU arms gate on the builder
  // type; carrying charges is not enough).
  if (unit.type !== 'BUILDER') return { err: no('Not a builder.') };
  if ((unit.charges ?? 0) <= 0) return { err: no('No charges left.') };
  return { unit };
}

function spendCharge(state: GameState, unit: Unit): void {
  unit.charges = (unit.charges ?? 1) - 1;
  unit.movesLeft = 0;
  if (unit.charges <= 0) disbandUnit(state, unit.id);
}

export function builderImprove(state: GameState, unitId: number, imp: ImprovementId, seat: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (!validImprovements(state, tile, seat).includes(imp)) {
    return no('Not a valid improvement for this tile.');
  }
  tile.improvement = imp;
  spendCharge(state, unit!);
  return ok;
}

/* The PILLAGE verb has ONE body, and it is `applySeatUnitOrders`' PILLAGE arm
 * in phase.ts — the same improvement-then-district order, the same +25 heal,
 * gated on `combat > 0` the way `hostileUnitAct` and the GPU's apply both are.
 * A charge test here instead of that combat test is what lets a Great General
 * pillage on one engine and not the other. */

export function builderRepair(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (tile.pillaged) tile.pillaged = false;
  else if (tile.districtPillaged) tile.districtPillaged = false;
  else return no('Nothing pillaged here.');
  unit!.movesLeft = 0;
  return ok;
}

/**
 * Remove a feature (chop) with the builder standing on the tile (1 charge).
 * Chops inside your borders grant an era-scaled yield lump (the Civ 6
 * "chop economy") — this is the only path that pays; the free calculator
 * mode's Remove action does not.
 */
export function builderRemoveFeature(state: GameState, unitId: number, seat: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  const check = canRemoveFeature(state, tile, seat);
  if (!check.ok) return check;
  const grant = state.sandbox ? null : chopGrant(state, tile, seat);
  const featureName = tile.feature ? FEATURES[tile.feature]?.name ?? tile.feature : '';
  if (tile.improvement === 'LUMBER_MILL' && tile.feature === 'WOODS') tile.improvement = null;
  tile.feature = null;
  if (grant) {
    applyLumpYield(state, tile.index, grant, seat);
    state.eventLog.push(`Chopped ${featureName}: +${grant.amount} ${grant.key}.`);
  }
  spendCharge(state, unit!);
  return ok;
}

export function builderHarvest(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (!tile.resource) return no('No resource here.');
  const grant = harvestGrant(state, tile, 0);
  if (!grant) {
    return no(
      tileSeat(tile) !== unit!.seat
        ? 'Harvesting only works inside your borders.'
        : 'This resource cannot be harvested (or needs research).',
    );
  }
  const resName = RESOURCES[tile.resource]?.name ?? tile.resource;
  tile.resource = null;
  applyLumpYield(state, tile.index, grant, 0);
  state.eventLog.push(`Harvested ${resName}: +${grant.amount} ${grant.key}.`);
  spendCharge(state, unit!);
  return ok;
}

export function unitNeighbor(state: GameState, unit: Unit, d: number): Tile | null {
  return neighborTile(state.map, state.map.tiles[unit.tileIndex], d);
}

export function walkToward(state: GameState, unit: Unit, target: Tile, stopWithin = 0): void {
  for (;;) {
    const at = state.map.tiles[unit.tileIndex];
    const dHere = hexDistance(at.col, at.row, target.col, target.row);
    if (dHere <= stopWithin) break;
    let dest = -1;
    let destD = dHere;
    for (const n of neighbors(state.map, at)) {
      if (!tileFreeForUnit(state, n.index, 0, unit)) continue;
      const d = hexDistance(n.col, n.row, target.col, target.row);
      if (d < destD) {
        destD = d;
        dest = n.index;
      }
    }
    if (dest < 0) break;
    if (stepUnit(state, unit, state.map.tiles[dest]) !== 'moved') break;
  }
}
