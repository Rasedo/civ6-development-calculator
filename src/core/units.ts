/**
 * Unit mechanics (stage 11a): movement with Civ 6-ish terrain costs and the
 * river-crossing rule, A* pathfinding, one-civilian-per-tile stacking,
 * training, maintenance, and builder actions. Military/combat land in 11b.
 */

import type { GameState, RivalCity, RivalCiv, Tile, Unit } from './types';
import { logUnitOrder } from './seatTurn';  // #51/S8.1e
import { neighbors, neighborTile, hexDistance, AXIAL_DIRS, offsetToAxial } from './hex';
import { isWater, isImpassable } from './query';
import { validImprovements, canRemoveFeature, type RuleResult } from './rules';
import { isTechComplete, isCivicComplete } from './effects';
import { ARTIFACT_BUILDING, ARTIFACT_SLOTS } from '../data/greatPeople';
import { clearCampFor } from './combat';
import { UNITS, UNIT_HP, ENCAMPMENT_HP, type UnitDef } from '../data/units';
import { PILLAGE_HEAL_IMPROVEMENTS } from './combat'; // A-21 (#50): the shared heal set
import { generalAuraMP } from './aura'; // #70/S3 (B-8): the aura's +1 MP half
import { goldenMoveBonus } from './eras'; // B-24: MONUMENTALITY / EXODUS +2 MP
import { GAME_SPEED, EMBARK_MOVES } from '../data/constants';
import { revealAround, claimGoodyHut, nearestUnexplored } from './fog';
import { chopGrant, harvestGrant, applyLumpYield } from './economy';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { civHasStrategic, PLAYER_CIV, tileRivalCiv, playerSeat, isPlayerSeat, isRivalSeat, rivalOfSeat, rivalOfCiv, tileSeat, isCityStateSeat, seatOfCityState, NO_SEAT, rivalsOf, capsOf, seatOf } from './seats';
import type { ImprovementId } from './types';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export { nextRandom } from './rand';

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/**
 * #45/B-6: the unit-aware TERRAIN passability plane. A NAVAL unit stands on
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

/** The owner's completed techs for a unit (player → playerSeat(state).research; rival →
 * its own ResearchState; barbarians have none). */
function ownerTechs(state: GameState, unit: { seat: number }): string[] {
  if (isPlayerSeat(unit.seat)) return playerSeat(state).research.techs;
  if (isRivalSeat(unit.seat)) return rivalOfSeat(state, unit.seat)?.research.techs ?? [];
  return [];
}

/** #45/B-6: does a unit's OWNER have a tech (the embark/ocean gate reads this). */
export function ownerHasTech(
  state: GameState,
  unit: { seat: number },
  tech: string,
): boolean {
  return ownerTechs(state, unit).includes(tech);
}

/** #45/B-6: can this LAND unit embark? Its OWNER needs SAILING (civilians) or
 * SHIPBUILDING (all land units incl. military). Naval units never "embark". */
export function canEmbark(
  state: GameState,
  unit: { type: string; seat: number },
): boolean {
  if (UNITS[unit.type]?.naval) return false;
  const tech = unitDomain(unit.type) === 'civilian' ? 'SAILING' : 'SHIPBUILDING';
  return ownerHasTech(state, unit, tech);
}

/** #45/B-6: may a mover (naval or embarking land unit) ENTER this water tile
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
 * B-23 (#71): is this step ROAD-to-ROAD? Real Civ 6 roads only help a unit
 * moving FROM a road tile TO a road tile — a single roaded tile in open
 * country does nothing.
 */
export function roadStep(from: Tile, to: Tile): boolean {
  return !!from.road && !!to.road;
}

/**
 * B-23 (#71): do roads carry BRIDGES yet? Civ 6 upgrades roads by ERA — the
 * Ancient road has no bridges, the Classical road does. The flag is latched at
 * the first era boundary (eras.ts), the one site both engines already fire in
 * lockstep. From the Classical era on, a road-to-road step pays no river.
 */
export function roadBridges(state: GameState): boolean {
  return !!state.roadBridges;
}

/** Civ 6-ish movement cost to ENTER a tile (river handled separately).
 * #45/B-6: water tiles enter at a flat 1 (embarked/naval movement — no
 * hills/features on water). Land tiles keep the terrain schedule.
 * B-23 (#71): a ROAD-to-ROAD step ignores the terrain penalty entirely —
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

/**
 * B-23 (#71): the river charge a step pays — 0 on water, 0 for a road-to-road
 * step once bridges exist, else RIVER_CROSS_MP when the edge carries a river.
 */
export function riverCharge(state: GameState, from: Tile, to: Tile): number {
  if (isWater(to)) return 0;
  if (roadStep(from, to) && roadBridges(state)) return 0;
  return crossesRiver(from, to) ? RIVER_CROSS_MP : 0;
}

/**
 * B-23 (#71): lay the ROAD a new trade route's Trader would leave behind.
 *
 * Real Civ 6 builds roads automatically as a Trader walks its land route, so
 * the road network is a CONSEQUENCE of trade, not a builder job. This models
 * the trader's walk without the unit: from the origin centre, repeatedly step
 * to the neighbour with the lowest hexDistance to the destination (ties by
 * direction order) — the SAME integer stepping rule the war-march already
 * uses, so both engines can mirror it exactly. Zero draws, integer-only.
 *
 * A route whose walk needs a water or impassable tile is a SEA route: real
 * Civ 6 lays no road for those, so nothing is written at all (the walk is
 * collected first and committed only if it reaches the destination).
 */
export function layTradeRoad(state: GameState, fromIndex: number, toIndex: number): void {
  const map = state.map;
  const dest = map.tiles[toIndex];
  if (!dest || isWater(dest) || isImpassable(dest)) return;
  let at = map.tiles[fromIndex];
  if (!at || isWater(at) || isImpassable(at)) return;
  const path: Tile[] = [at];
  for (let step = 0; step < TRADE_ROAD_MAX_STEPS && at.index !== toIndex; step++) {
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
    if (!best) return; // blocked by water/impassable — a sea route lays nothing
    path.push(best);
    at = best;
  }
  if (at.index !== toIndex) return; // never arrived — lay nothing
  for (const t of path) t.road = true;
}

/** B-23 (#71): the trade-road walk is bounded by the route range — a route
 *  longer than this cannot exist (canAddTradeRoute gates on TRADE_ROUTE_RANGE),
 *  so the bound is a safety rail, not a rule. */
export const TRADE_ROAD_MAX_STEPS = 32;

/** The MP a river crossing costs (real Civ 6 ends movement; this model charges
 *  a flat 3 — the pre-existing convention, now named). */
export const RIVER_CROSS_MP = 3;

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

/**
 * Side key: one string per side, so "same side" is a string compare.
 *
 * #51/S6.3: a CITY-STATE used to fall off the end of this chain and come back
 * `'barbarian'` — every seat that was neither the player nor a rival did. It
 * has never fired (neither engine gives a city-state units yet) and it would
 * have fired the moment Round 6 did, in the worst possible way: a minor's unit
 * would have stacked freely with barbarians (`tileFreeForUnit` compares side
 * keys) and been unable to fight them (`unitsHostile` returns false for a
 * same-side pair). Same class as the `"rival"` side string that fell through
 * to "everything blocks" in S3.4 — a default arm standing in for a case
 * nobody had thought about.
 */
export function unitSide(unit: { seat: number }): string {
  if (isRivalSeat(unit.seat)) return `rival:${rivalOfCiv(unit.seat)}`;
  if (isPlayerSeat(unit.seat)) return 'player';
  if (isCityStateSeat(unit.seat)) return `cs:${unit.seat}`; // each minor is its own side
  return 'barbarian';
}

/**
 * Are two units enemies right now? Barbarians fight everyone; rival civs
 * fight the player only while at war; rival civs never fight each other.
 */
export function unitsHostile(
  state: GameState,
  a: { seat: number },
  b: { seat: number },
): boolean {
  if (unitSide(a) === unitSide(b)) return false;
  // #51/S6.11: hostility with NO war state — the one thing the war matrix
  // cannot express, because an all-false row means peace.
  if (capsOf(a.seat).alwaysHostile || capsOf(b.seat).alwaysHostile) return true;
  if (isRivalSeat(a.seat) && isRivalSeat(b.seat)) {
    // A-19/B-33 (S2): rival↔rival hostility off the per-pair war state
    // (atWarRivals stores 0-based rival ids = civId). Symmetric; same-civ /
    // unknown-civ never hostile. Inlined (not `civsAtWar`) to avoid a
    // units↔rivals import cycle.
    if (a.seat === b.seat) return false; // same seat is never hostile to itself
    return rivalOfSeat(state, a.seat)?.atWarRivals?.includes(rivalOfCiv(b.seat)) ?? false;
  }
  // #51/S6.3: a CITY-STATE on either side. Without this the line below asks
  // `rivalOfSeat` about a seat that is not a rival and gets `false`, so a
  // city-state unit would be hostile to nobody — the same hole `civsAtWar`
  // had. Inert while neither engine gives a city-state units; it stops being
  // inert the moment Round 6 does.
  if (isCityStateSeat(a.seat) || isCityStateSeat(b.seat)) {
    const csSeat = isCityStateSeat(a.seat) ? a.seat : b.seat;
    const other = csSeat === a.seat ? b.seat : a.seat;
    if (isCityStateSeat(other)) return false;
    if (!isPlayerSeat(other)) return false; // rival<->CS war is not modelled
    const cs = (state.cityStates ?? []).find((c) => seatOfCityState(c.id) === csSeat);
    return cs?.atWar ?? false;
  }
  const rivalSeat = isRivalSeat(a.seat) ? a.seat : b.seat;
  return rivalOfSeat(state, rivalSeat)?.atWar ?? false;
}

/**
 * B-17 (#71): is this tile a LIVE Encampment garrison? Complete, unpillaged
 * and still holding HP. `districtPillaged` (B-32) already means "the district
 * is down", so a pillaged Encampment blocks nothing.
 */
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

/**
 * B-17 (#71): the OWNER of a district tile, as a hostility probe. Rival
 * territory carries `rivalId`; otherwise an owned tile belongs to the player.
 * (City-states never build Encampments in this model, so `csId` needs no arm.)
 */
export function tileOwnerSide(tile: Tile): { seat: number } | null {
  const s = tileSeat(tile);
  return s === NO_SEAT ? null : { seat: s };
}

/**
 * B-17 (#71): does a LIVE enemy Encampment bar this unit from the tile?
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

/**
 * B-3 ZONE OF CONTROL (deliberate simplification): a MILITARY unit hostile
 * to `mover` standing ADJACENT to `tileIndex` exerts a zone of control —
 * entering that tile ends the mover's movement this turn. Civilians exert
 * none; hostility is tested LIVE via unitsHostile; city centers are deferred.
 */
export function inEnemyZoc(
  state: GameState,
  tileIndex: number,
  mover: { seat: number },
): boolean {
  const tile = state.map.tiles[tileIndex];
  for (const n of neighbors(state.map, tile)) {
    for (const u of unitsAt(state, n.index)) {
      // #45/B-6: EMBARKED units do NOT exert a zone of control (they still
      // OBEY — the mover's halt rule below is unchanged). Naval military exert
      // normally (no naval units yet, so that half is inert).
      if (unitDomain(u.type) === 'military' && !u.embarked && unitsHostile(state, u, mover)) return true;
    }
  }
  return false;
}

/** B-5 FORTIFY: the defender-strength bonus a unit's fortifyTurns grants
 * (+3 CS at >=1, +6 at >=2; cap 2). Civilians never fortify (0). */
export function fortifyBonus(unit: { fortifyTurns?: number }): number {
  return Math.min(2, unit.fortifyTurns ?? 0) * 3;
}

/** Stacking: 1 military + 1 civilian per side; other sides block entirely.
 * #45/B-6: passability is composed here (it needs the owner's tech). A NAVAL
 * unit needs an enterable water tile; a LAND unit needs land, OR — when
 * `allowEmbark` (the war-march v1 surface) and its owner can embark — an
 * enterable water tile. Every non-war-march caller leaves `allowEmbark` false,
 * so land units stay land-only there (inert). */

/**
 * B-26 (#79): is the land/water edge between `a` and `b` closed by a CLIFF?
 * The mask lives on the LAND tile (elevated coastline), so read it from
 * whichever side is land and test the bit pointing at the other.
 * Exceptions are the sourced ones: a city centre, or a Harbor on the land tile.
 */

/** B-26 (#79): does this tile belong to the unit's own civ? (the owner-only
 *  Harbor cliff exception). */
function tileOwnedByUnitOwner(
  t: Tile,
  unit: { seat: number },
): boolean {
  if (isPlayerSeat(unit.seat)) return isPlayerSeat(tileSeat(t));
  if (isRivalSeat(unit.seat)) return tileSeat(t) === unit.seat;
  return false; // barbarians own nothing
}

export function cliffBlocks(state: GameState, a: Tile, b: Tile, unit?: { seat: number }): boolean {
  const land = isWater(a) ? b : a;
  const water = isWater(a) ? a : b;
  if (isWater(land) || !isWater(water)) return false; // not a land/water edge
  if (!land.cliffMask) return false;
  if (land.district === 'CITY_CENTER') return false; // cities ignore cliffs
  // SOURCED: "A Harbor may still be built next to Cliffs. When your units use
  // it, they will be able to pass the Cliffs to embark or disembark. ENEMY
  // units won't." So the Harbor exception is OWNER-ONLY, not a hole in the wall.
  if (land.district === 'HARBOR' && unit && tileOwnedByUnitOwner(land, unit)) return false;
  for (let d = 0; d < 6; d++) {
    if (neighborTile(state.map, land, d)?.index === water.index) {
      return (land.cliffMask & (1 << d)) !== 0;
    }
  }
  return false;
}

/**
 * B-26 (#79): is this ONE step an embark/disembark closed by a cliff?
 *
 * Every mover asks the same question, so it lives in one place: a cliff only
 * ever gates a LAND↔WATER transition, and naval units never transition at all.
 * Before this, `cliffBlocks` had a single caller (the player's walkPath) while
 * the rival war-march and the rival patrol crossed cliffs freely — and the GPU
 * had the mirror-image hole (its rival war-march blocked, nothing else did), so
 * the two engines applied the rule to DISJOINT sets of units and a rival
 * musketman embarked over a cliff on one engine but not the other.
 *
 * Callers must filter this at CANDIDATE level, not use it as a halt: a walker
 * routes AROUND a cliff to its next-best neighbour (the GPU's step_ok mask).
 * (#51 still owes us ONE mover; this at least makes the RULE single-sourced.)
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
  unit?: Unit | { type: string; seat: number; id?: number },
  allowEmbark = false,
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (isImpassable(tile)) return false;
  const naval = unit ? !!UNITS[unit.type]?.naval : false;
  if (isWater(tile)) {
    // Water tile: a naval unit (native) or an embark-capable land unit only.
    if (naval) {
      if (!unit || !waterEnterable(state, tile, unit)) return false;
    } else {
      if (!allowEmbark || !unit || !canEmbark(state, unit) || !waterEnterable(state, tile, unit)) return false;
    }
  } else {
    // Land tile: naval units cannot stand ashore; land units use the land plane.
    if (naval) return false;
  }
  // B-17 (#71): a LIVE enemy Encampment garrison bars entry outright. The
  // beat-it-down path is the melee attack ON the tile, never a move.
  if (unit && encampmentBlocks(state, tile, unit)) return false;
  const side = unit ? unitSide(unit) : 'player';
  const domain = unit ? unitDomain(unit.type) : 'civilian';
  for (const u of unitsAt(state, tileIndex)) {
    if (u.id === unit?.id) continue;
    // C1-B5a: rival CIVS are foreign to each other — side alone can't tell
    // them apart. Inert for the all-military world (cross-civ military
    // blocked under either reading); it matters once rival civilians exist.
    // #51/S1.3b: `side` already encodes WHICH rival (`rival:<id>`), so the
    // separate civId test the old string form needed is subsumed.
    if (unitSide(u) !== side) return false; // foreign occupied
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
  // #45/B-6: a NAVAL unit routes over enterable water only (OCEAN needs the
  // owner's CARTOGRAPHY); a LAND unit keeps the land plane (no player-ordered
  // embark routing in v1 — that rides #50). The scripted walkers never use
  // findPath, so this only serves player-ordered ship moves / auto-explore.
  const naval = !!UNITS[unit.type]?.naval;
  const passOk = (t: Tile): boolean =>
    // B-17 (#71): routing never plans THROUGH a live enemy Encampment.
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
      const g = cur.g + moveCostInto(curTile, n) + (naval ? 0 : riverCharge(state, curTile, n)); // B-23 (#71): roads
      const existing = open.get(n.index);
      if (!existing || g < existing.g) {
        open.set(n.index, { g, f: g + hexDistance(n.col, n.row, target.col, target.row), from: bestIdx });
        parents.set(n.index, bestIdx);
      }
    }
  }
  return null;
}

/** Walk a unit along its stored path while its MP cover each step.
 * #45/B-6: embark/disembark (a land unit stepping between land and water) sets/
 * clears `unit.embarked` and costs ALL remaining MP; embarked movement uses the
 * flat EMBARK_MOVES pool. In N1 findPath never routes a LAND unit through water
 * (unitPassable is land-only for them) so this is inert here and exercised only
 * by the war-march; it is left correct for naval/embark movers that N2 adds. */
/** What the movement-point contract did with one step. */
export type StepOutcome =
  /** Took the step and has MP left. */
  | 'moved'
  /** Took the step; MP is now spent (ZOC halt or the pool ran out). */
  | 'halted'
  /** Did not move — not enough MP. The step is still legal next turn. */
  | 'cantAfford'
  /** Did not move — a cliff closes this edge. */
  | 'blocked';

/**
 * THE movement-point contract, in one place.
 *
 * Six walkers used to carry their own copy of this, and the copies were not
 * the same: the cliff rule reached two of them, and the two engines enforced
 * it on DIFFERENT unit sets, which is how a rival musketman walked over a
 * cliff onto water in the off-script gate (seed 9015, t198). One body now
 * owns the whole contract:
 *
 *   - P4/D-3+D-4 (real Civ 6): entering costs the tile's full cost, +3 for a
 *     river crossing, and needs that much MP left — except a unit at FULL MP
 *     may always take one step, paying everything it has. No Civ-5-style
 *     "enter on fumes", no river-zeroing.
 *   - Embark/disembark (a LAND unit crossing land↔water) costs ALL remaining
 *     MP. Naval units never transition; water steps never pay a river charge.
 *     An embarked land unit's pool is EMBARK_MOVES, not its land allowance.
 *   - B-26 (#79): a CLIFF is an unbreakable barrier to that transition —
 *     their entire function, and what makes a cliff-ringed city safe from
 *     naval invasion. Sourced exceptions (the land tile being a city, a
 *     HARBOR bordering the cliff) live in cliffBlocksStep.
 *   - AUDIT #78: ANY non-barbarian unit clears a barb camp by entering it.
 *     clearCampFor no-ops for barbarians and credits the right treasury.
 *   - B-3 ZOC: ending adjacent to a hostile MILITARY unit zeroes MP.
 *
 * The CALLER still picks the destination. That is where the walkers genuinely
 * differ — candidate sets, occupancy tests, stop conditions — and those stay
 * injected at the call site rather than flagged in here.
 *
 * The reveal/goody-hut block is player-only and stays inert for every other
 * walker: hostileUnitAct is fed only by barbUnits/rivalUnits, and the rival
 * civilian walkers iterate one rival's units.
 */
/**
 * The movement pool a unit is GRANTED for a turn, BEFORE the general/admiral
 * aura: its type's `moves`, or the flat EMBARK_MOVES pool while embarked
 * (#45/B-6), plus whatever golden dedication its seat holds (B-24). An
 * embarked unit keeps EMBARK_MOVES — embarkation speed is not a unit's own
 * movement, so the dedication does not touch it.
 *
 * #51/S5.4: FOUR sites computed this expression — stepUnit, refreshUnits,
 * rivalPhase and spawnUnit — and a bonus added to one of them is a bonus the
 * other three silently disagree about. That is exactly how the #79 attempt
 * failed. The GPU's twin is `_full_mp`.
 */
export function unitFullMoves(state: GameState, unit: { type: string; seat: number; embarked?: boolean }): number {
  const def = UNITS[unit.type];
  if (unit.embarked && !def?.naval) return EMBARK_MOVES;
  return (def?.moves ?? 2) + goldenMoveBonus(state, unit);
}

export function stepUnit(state: GameState, unit: Unit, to: Tile): StepOutcome {
  const from = state.map.tiles[unit.tileIndex];
  const naval = !!UNITS[unit.type]?.naval;
  const full = unitFullMoves(state, unit);
  const transition = !naval && isWater(from) !== isWater(to);
  if (cliffBlocksStep(state, from, to, unit)) return 'blocked';
  const cost = transition
    ? unit.movesLeft
    : moveCostInto(from, to) + riverCharge(state, from, to); // B-23 (#71): roads
  if (unit.movesLeft < cost && unit.movesLeft < full) return 'cantAfford';
  if (transition) unit.embarked = isWater(to);
  unit.tileIndex = to.index;
  // #51/S8.1e: THE move commit, for every seat. `walkPath` is the PLAYER's
  // walker; rivals have their own chassis functions that transcribe its rules
  // by hand ("walkPath's exact charge", three separate copies) — so seaming
  // walkPath logged 642 player moves and ZERO rival ones. Every seat's step
  // lands here instead: this is the ONLY tile write in core.
  logUnitOrder(state, unit.seat, unit.id, 'move', to.index);
  unit.movesLeft = Math.max(0, unit.movesLeft - cost);
  if (isPlayerSeat(unit.seat)) {
    revealAround(state, to.index);
    claimGoodyHut(state, unit);
  }
  clearCampFor(state, unit, to.index);
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
    // Enemy-occupied tiles block; the final step also needs a free slot.
    const blockedByEnemy =
      unitsAt(state, nextIndex).some((u) => u.seat !== unit.seat) ||
      encampmentBlocks(state, to, unit); // B-17 (#71)
    if (blockedByEnemy || (unit.path.length === 1 && !tileFreeForUnit(state, nextIndex, unit))) {
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

/**
 * P4/D-10 (real Civ 6): the builder price escalator — 50 + 4 (pre-speed) per
 * builder THIS SEAT HAS ALREADY PRODUCED, rounded after the game-speed scale
 * like every unit cost (data/units U()). The exporter mirrors the 50/4 literals
 * as scenario.builderBase/builderPer.
 *
 * #51/S7.7a: ONE escalator for every seat, and the QUEUED term is GONE.
 *
 * The player counted builders "ever trained/purchased OR CURRENTLY IN A QUEUE";
 * the rival counted only those trained. Civ 6 counts neither queue: the unit
 * cost progression is `CostProgressionParam1="4"` applied to the "number of
 * unit already produced" — producing is the event, and an item sitting in a
 * queue has produced nothing. So the RIVAL was right and the PLAYER was wrong,
 * which is exactly why this task's rule is "pick the behaviour closer to real
 * Civ 6", never "mirror the TypeScript engine".
 *   https://forums.civfanatics.com/threads/600489/
 *
 * `seat` defaults to the player so the UI call sites are untouched.
 */
export function builderCost(state: GameState, seat: number = PLAYER_CIV): number {
  return Math.round((50 + 4 * (seatOf(state, seat)?.buildersTrained ?? 0)) * GAME_SPEED);
}

/**
 * #45/B-6: a city may build/buy NAVAL units iff its CENTER is adjacent to a
 * water tile OR it owns a COMPLETED Harbor. Mirrors the GPU naval-build gate
 * (static center-water-adjacency plane | dynamic completed-Harbor). Works for
 * both player City and RivalCity (both carry centerIndex + districts).
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

/** Unit types a city can train right now. #45/B-6: NAVAL units are offered ONLY
 * when a naval-capable `city` is supplied (center-coastal or a completed
 * Harbor) — callers without a city (RL candidate scan) never see naval, which
 * keeps player naval to poke tests until #50 gives the RL verbs. */
export function trainableUnits(
  state: GameState,
  city?: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): UnitDef[] {
  if (!state.unitsMode) return [];
  return Object.values(UNITS).filter((d) => {
    // B6-S2: faith-purchase-only chassis (MISSIONARY) — never trainable or
    // gold-purchasable (purchaseUnit funnels through here), sandbox included.
    if (d.faithOnly) return false;
    // B7-G (B-8): spawn-only chassis (GENERAL/ADMIRAL) — birthed only by the
    // Great-Person claim, never trained/purchased on any seat (sandbox too).
    if (d.spawnOnly) return false;
    if (d.requiresTech && !state.sandbox && !isTechComplete(state, d.requiresTech)) return false;
    // B-20 (#79): the CIVIC gate (Archaeologist / Natural History), the exact
    // twin of the tech gate above and equally sandbox-exempt.
    if (d.requiresCivic && !state.sandbox && !isCivicComplete(state, d.requiresCivic)) return false;
    // B-20 (#79): an ARCHAEOLOGIST may only be trained where its city's
    // ARCHAEOLOGICAL MUSEUM still has a FREE artifact slot — the real Civ 6
    // rule, and the reason its charge count equals the free slots. Without a
    // museum the unit has nowhere to put what it digs up.
    if (d.id === 'ARCHAEOLOGIST' && !state.sandbox) {
      if (!city) return false;
      const held = state.cities.find((c) => c.centerIndex === city.centerIndex);
      const has = (held?.buildings ?? []).includes(ARTIFACT_BUILDING);
      if (!has || (held?.artifacts ?? 0) >= ARTIFACT_SLOTS) return false;
    }
    // AUDIT B-9: strategic-resource access gates build AND purchase (purchaseUnit
    // funnels through here). Data-driven off UnitDef.requiresResource; the player
    // is civ 0. Sandbox ignores the gate, like the tech gate above.
    if (d.requiresResource && !state.sandbox && !civHasStrategic(state, PLAYER_CIV, d.requiresResource)) return false;
    if (d.naval) return !!city && cityNavalCapable(state, city);
    return true;
  });
}

/**
 * B-20 (#79): EXCAVATE an Antiquity Site into an Artifact. The Archaeologist
 * must stand on a site, hold a charge, and the tile must be the player's own or
 * unclaimed — real Civ 6 additionally allows a rival's territory under OPEN
 * BORDERS, which this model has no concept of and which is recorded rather than
 * approximated. The artifact lands in the LOWEST-id own city that has an
 * ARCHAEOLOGICAL MUSEUM with a free slot (the placeRelic ordering), and the dig
 * is consumed. With no free slot anywhere the excavation is refused rather than
 * silently losing the find.
 */
export function archaeologistExcavate(state: GameState, unitId: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || !isPlayerSeat(unit.seat)) return no('No such unit.');
  if (unit.type !== 'ARCHAEOLOGIST') return no('Only an Archaeologist can excavate.');
  if ((unit.charges ?? 0) <= 0) return no('No charges left.');
  const tile = state.map.tiles[unit.tileIndex];
  if (!tile?.antiquity) return no('No antiquity site here.');
  if (tileRivalCiv(tile) !== null || isCityStateSeat(tileSeat(tile))) {
    return no('That dig lies in foreign territory.');
  }
  const home = state.cities
    .filter((c) => c.buildings.includes(ARTIFACT_BUILDING) && (c.artifacts ?? 0) < ARTIFACT_SLOTS)
    .sort((a, b) => a.id - b.id)[0];
  if (!home) return no('No Archaeological Museum has a free artifact slot.');
  home.artifacts = (home.artifacts ?? 0) + 1;
  tile.antiquity = false;
  spendCharge(state, unit);
  state.eventLog.push(`An Artifact was excavated and displayed in ${home.name}.`);
  return ok;
}

export function queueUnit(state: GameState, cityId: number, unitType: string): RuleResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return no('No such city.');
  if (!trainableUnits(state, city).some((d) => d.id === unitType)) {
    return no('Unit not available (enable units mode / research).');
  }
  if (state.sandbox) {
    spawnUnit(state, unitType, city.centerIndex);
    return ok;
  }
  // P4/D-10: builders lock their escalated price at queue time (the counter
  // may grow before completion; settlers/districts already work this way).
  if (unitType === 'BUILDER') {
    city.queue.push({ kind: 'unit', unit: unitType, progress: 0, cost: builderCost(state) });
  } else {
    city.queue.push({ kind: 'unit', unit: unitType, progress: 0 });
  }
  return ok;
}

/** Place a new unit on/near a tile (first free slot by distance). */
export function spawnUnit(
  state: GameState,
  unitType: string,
  nearIndex: number,
  seat: number = PLAYER_CIV,
): Unit | null {
  const def = UNITS[unitType];
  if (!def) return null;
  const near = state.map.tiles[nearIndex];
  const probe = { type: unitType, seat };
  const spot = [near, ...neighbors(state.map, near)]
    .sort((a, b) => hexDistance(near.col, near.row, a.col, a.row) - hexDistance(near.col, near.row, b.col, b.row))
    .find((t) => tileFreeForUnit(state, t.index, probe));
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
  // B-5 FORTIFY: military units carry a fortify counter (civilians never do).
  if (def.charges === undefined) unit.fortifyTurns = 0;
  // AUDIT B-4 XP: a unit carries an experience counter iff its seat's class
  // can earn any (#51/S6.11 `caps.xp`). Leaving the field ABSENT for a seat
  // that cannot is what keeps `xp = 0` from reading as "a veteran-in-waiting".
  if (capsOf(seat).xp) unit.xp = 0;
  state.units.push(unit);
  if (isPlayerSeat(seat)) revealAround(state, unit.tileIndex);
  // P4/D-22: track the strongest MELEE unit each civ has ever fielded —
  // real Civ 6 bases city defense on it (spawnUnit is the chokepoint for
  // training, purchase, levies and rival production alike).
  if (def.combat > 0 && !def.ranged) {
    if (isPlayerSeat(seat)) {
      playerSeat(state).bestMeleeCS = Math.max(playerSeat(state).bestMeleeCS ?? 0, def.combat);
    } else if (isRivalSeat(seat)) {
      const rv = rivalOfSeat(state, seat);
      if (rv) rv.bestMeleeCS = Math.max(rv.bestMeleeCS ?? 0, def.combat);
    }
  }
  return unit;
}

/** Rival city occupying a tile, with its owner, if any. */
export function rivalCityAt(
  state: GameState,
  tileIndex: number,
): { rival: RivalCiv; city: RivalCity } | undefined {
  for (const rival of rivalsOf(state)) {
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
    (s, u) => s + (isPlayerSeat(u.seat) ? UNITS[u.type]?.maintenance ?? 0 : 0),
    0,
  );
}

/** Start-of-turn refresh: heal, MP back to full, multi-turn moves continue. */
export function refreshUnits(state: GameState): void {
  for (const unit of state.units) {
    const tile = state.map.tiles[unit.tileIndex];
    // #45/B-6: an EMBARKED land unit refreshes to the flat EMBARK_MOVES pool
    // (naval units keep their own moves). The heal/fortify "spent no MP" gate
    // below reads this same `full`.
    const naval = !!UNITS[unit.type]?.naval;
    const full = unitFullMoves(state, unit);
    // P4/D-2 (real Civ 6, unifies AUDIT C-7/C-8): a unit heals only if it
    // spent NO movement since its last refresh (the heal runs before the
    // reset below, so any move/attack/build blocks it) — +20 in a friendly
    // city (barbs: on their camp), +15 in own territory, +10 on neutral
    // ground, +5 on foreign-owned land.
    // #70/S3: "spent no MP" is measured against what this unit was GRANTED
    // last refresh, not against its type's base moves — the aura's +1 MP makes
    // the granted pool vary per turn. `?? full` reproduces the pre-S3 gate for
    // units that have never been refreshed.
    const grantedLast = unit.movesFull ?? full;
    if (unit.movesLeft >= grantedLast) {
      // #51/S6.14: ONE heal rule for every seat. This was three arms — player,
      // rival, barbarian — of which the first two were the same predicate
      // written twice (a player unit's seat IS `PLAYER_CIV`, so
      // `isPlayerSeat(tileSeat(t))` and `tileSeat(t) === unit.seat` agree), and
      // the third stopped being special once the camps belonged to a seat
      // (S6.13). Each term is simply EMPTY for the classes it does not apply
      // to: a major holds no camps, the barbarians hold no land.
      const home = tileSeat(tile) === unit.seat;
      const onCamp = seatOf(state, unit.seat)?.camps.includes(unit.tileIndex) ?? false;
      const heal = home && tile.district === 'CITY_CENTER' ? 20
        : home ? 15
        : onCamp ? 20
        : tileSeat(tile) === NO_SEAT ? 10
        : 5;
      unit.hp = Math.min(UNIT_HP, unit.hp + heal);
    }
    // B-5 FORTIFY: reuse the EXACT D-2 heal gate (movesLeft >= full = spent
    // no MP since the last refresh). A military unit that stayed put digs in
    // (+1, cap 2); any move/attack (movesLeft < full) resets it. Symmetric
    // across owners; read movesLeft BEFORE the reset below.
    // #45/B-6: NAVAL units never fortify (real Civ 6) — inert until N2 adds
    // ships. (Embarked land units are still military but march every turn, so
    // their fortify gate resets to 0 in practice.)
    if (unitDomain(unit.type) === 'military' && !naval) {
      unit.fortifyTurns = unit.movesLeft >= grantedLast ? Math.min(2, (unit.fortifyTurns ?? 0) + 1) : 0;
    }
    // #70/S3 (B-8): the Great General/Admiral aura grants +1 MP alongside its
    // +5 CS (real Civ 6). Record what was granted so NEXT turn's gates above
    // can tell "spent no MP" from "was simply given less".
    const granted = full + generalAuraMP(state, unit);
    unit.movesFull = granted;
    unit.movesLeft = granted;
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

/** Repair a pillaged improvement or district (no charge, ends the builder's
 * turn). B-32: districts join the same repair, mirroring improvement repair. */
/**
 * A-21 (#50, 2026-07-27): the PLAYER PILLAGE verb. Pillaging existed only on
 * the hostile side (`hostileUnitAct` step 2 for barbarians and at-war rivals),
 * so rivals wrecked player improvements while the player could only answer by
 * killing units or taking cities — the asymmetry A-21 recorded.
 *
 * Mirrors the hostile rule exactly: a MILITARY unit standing on an ENEMY tile
 * pillages the improvement first, else a COMPLETE non-CITY_CENTER unpillaged
 * district (the B-32 order); a PILLAGE_HEAL_IMPROVEMENTS target heals +25
 * (capped at UNIT_HP); the turn is spent. Enemy = an at-war rival's tile or a
 * city-state's; the player never pillages its own.
 */
export function playerPillage(state: GameState, unitId: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || !isPlayerSeat(unit.seat)) return no('No such player unit.');
  if (unitDomain(unit.type) !== 'military') return no('Only military units pillage.');
  if (unit.movesLeft <= 0) return no('No movement left.');
  const tile = state.map.tiles[unit.tileIndex];
  const enemy =
    (isRivalSeat(tileSeat(tile)) && (rivalOfSeat(state, tileSeat(tile))?.atWar ?? false)) ||
    isCityStateSeat(tileSeat(tile));
  if (!enemy) return no('Not an enemy tile.');
  if (tile.improvement && !tile.pillaged) {
    tile.pillaged = true;
    if (PILLAGE_HEAL_IMPROVEMENTS.has(tile.improvement)) unit.hp = Math.min(UNIT_HP, unit.hp + 25);
    unit.movesLeft = 0;
    return ok;
  }
  if (tile.district && tile.district !== 'CITY_CENTER' && tile.districtComplete && !tile.districtPillaged) {
    tile.districtPillaged = true; // B-32
    unit.movesLeft = 0;
    return ok;
  }
  return no('Nothing to pillage here.');
}

export function builderRepair(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (tile.pillaged) tile.pillaged = false;
  else if (tile.districtPillaged) tile.districtPillaged = false; // B-32
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
      !isPlayerSeat(tileSeat(tile))
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

/**
 * #51/S8.2a — GREEDY WALK TOWARD A TILE, for any seat.
 *
 * `walkPath` follows a QUEUED path; this is the other walker — step to the free
 * neighbour strictly closer, first-found wins ties (direction order), stop when
 * within `stopWithin`. It was transcribed by hand three times inside
 * `rivals.ts`, each copy annotated with what it was copying ("pays walkPath's
 * charge", "walkPath's charge (tile cost + 3 per river)", "the missionary
 * chassis verbatim: ... walkPath's EXACT CHARGE, ZOC halt, camp clear").
 *
 * `stepUnit` already held the charge, the ZOC halt and the camp clear, so those
 * were genuinely shared; what was triplicated is the PATHING around it — which
 * is where task #46 came from (a rule inside the player's walker that the hand
 * copies did not carry).
 *
 * Takes a UNIT, not a rival index: nothing here is seat-specific, and the
 * Python ladder will call it for whichever seat it is driving.
 */
export function walkToward(state: GameState, unit: Unit, target: Tile, stopWithin = 0): void {
  for (;;) {
    const at = state.map.tiles[unit.tileIndex];
    const dHere = hexDistance(at.col, at.row, target.col, target.row);
    if (dHere <= stopWithin) break;
    let dest = -1;
    let destD = dHere;
    for (const n of neighbors(state.map, at)) {
      if (!tileFreeForUnit(state, n.index, unit)) continue;
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
