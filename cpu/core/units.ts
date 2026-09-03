/**
 * Unit mechanics (stage 11a): movement with Civ 6-ish terrain costs and the
 * river-crossing rule, A* pathfinding, one-civilian-per-tile stacking,
 * training, maintenance, and builder actions. Military/combat land in 11b.
 */

import type { GameState, City, Seat, Tile, Unit, QueueItem } from './types';
import { seatWonderSum } from './wonders';
import { takeItemBank } from './prodLayout';
import { BUILT_WONDERS } from '../data/builtWonders';
import { FORMATION_CS, FORMATION_MAX, FORMATION_CIVIC } from '../data/units';

/** what a unit's FORMATION adds to Combat, Ranged and Bombard Strength alike.
 *  ONE reader of the optional field, so no strength site spells its own
 *  default and none of them can drift apart. */
export function formationCS(unit: Unit): number {
  return FORMATION_CS[unit.formation ?? 0] ?? 0;
}

/** CIV6: fortification tops out at two turns dug in. */
const FORTIFY_MAX_TURNS = 2;
import { logUnitOrder } from './seatTurn';
import { neighbors, neighborTile, hexDistance, AXIAL_DIRS, offsetToAxial } from '../../world/hex';
import { isWater, isImpassable, isMountain, isCoastalLand, canalPassage, hullTile, naturalWonderAt } from '../../world/query';
import { validImprovements, canRemoveFeature, type RuleResult } from './rules';
import { IMPROVEMENTS } from '../data/improvements';
import { tileAppeal } from './appeal';
import { PARK_MIN_APPEAL } from '../data/improvements';
import { isTechComplete, isCivicComplete, makeYieldCtx, getModifiers, unitUpkeep, type YieldCtx } from './effects';
import { effectiveAdjacency, buildingVariantAdjacency } from './yields';
import { BUILDINGS } from '../data/buildings';
import { cityAppealResolver, governorTileFlag, governorTileSum } from './governors';
import { nextRandom } from './rand';
import { artifactFree } from './greatPeople';
import { clearCampFor, conquerEncampment } from './combat';
import { emergencyHeal, emergencyMoveBonus } from './emergency';
import { OPEN_TERRAINS, civUnitAllowed, civUpgradeTarget, GDR_UPGRADES, GDR_ENHANCED_MOVES, UNITS, UNIT_HP, ENCAMPMENT_HP, ROCK_BAND_VENUES, ROCK_BAND_WONDER_VENUE, ROCK_BAND_TIERS, ROCK_BAND_TIER_ODDS, ROCK_BAND_MAX_LEVEL, type UnitDef } from '../data/units';
import {
  BAND_VENUE_BIT, BAND_VENUE_DISTRICTS, CONCERT_SHARE_RANGE, ROCK_BAND_MAX_PROMOTIONS, UNIT_PROMO_CLASS,
} from '../data/promotions';
import { generalAuraMP } from './aura'; // the aura's +1 MP half
import {
  attacksLeftOf, attacksPerTurn, drawPromoOffer, promoCount, promoFirstUse, promoFlag, promoReady,
  promoValue, promoValueFor, stepAttacksLeft,
} from './promotions';
import { dedicationEvent, goldenMoveBonus } from './eras'; // MONUMENTALITY / EXODUS +2 MP
import { DED_WISH, LOYALTY_MAX, OPEN_BORDERS_CIVIC } from '../data/seats';
import { KNARR_NAVAL_MELEE_NEUTRAL_HEAL } from '../data/civilizations';
import {
  GAME_SPEED, EMBARK_MOVES, EMBARK_MOVE_TECHS, SEA_MOVE_TECH, SEA_MOVE_TECH_BONUS,
  MP_SCALE, EMBARK_TRANSITION_MP, ROAD_TIER_MP, ROAD_TIER_BRIDGES, RAILROAD_MP, TRADE_ROAD_MAX_STEPS,
} from '../data/constants';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { tradeCapacity } from './trade';
import { revealAround, claimGoodyHut, nearestUnexplored, unitSight } from './fog';
import { chopGrant, harvestGrant, applyLumpYield } from './economy';
import { congressChopGold } from './congress';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { NO_SEAT, borderTurnsFrom, capsOf, campTiles, cityAtTile, civHasStrategic, civOf, civsAtWar, isCiv, isCityStateSeat, seatOf, seatsAllied, tileSeat } from './seats';
import { suzerainOf } from './cityStates';
import { canPayStockpile, canPayUpgradeGold, spendStockpile, upgradeGoldCost, upgradeResourceCost } from './stockpile';
import { canTrainAir, carryAirWith, isAirUnit } from './air';
import { canTrainSpy, isSpy } from './espionage';
import { canTrainWithStockpile, chargeUnitResource } from './stockpile';
import type { ImprovementId } from './types';

import { gpPermOf } from '../data/greatPeople';
import { irradiated } from './nuclear';
import { FALLOUT_DAMAGE } from '../data/nuclear';
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
  if (unit && waterWalks(unit.type)) return true;
  const naval = unit ? !!UNITS[unit.type]?.naval : false;
  return naval ? hullTile(tile) : !isWater(tile);
}

/** CIV6 (Giant Death Robot): a chassis that moves and fights in Coast and
 *  Ocean "as it would on land" — so water is simply ground to it: no embark,
 *  no seafaring tech, no cliff, and its own strength and Movement throughout. */
export function waterWalks(type: string): boolean {
  return !!UNITS[type]?.waterWalk;
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
  // CIV6 (Knarr): "Units gain the ability to enter Ocean tiles" at
  // Shipbuilding; (Mana) the Maori cross it from the first turn
  // (`OCEAN_ACCESS_ROWS`).
  if (tile.terrain === 'OCEAN') {
    if (ownerHasTech(state, unit, 'CARTOGRAPHY')) return true;
    for (const r of getModifiers(state, unit.seat).oceanAccess) {
      if (r.tech === null || ownerHasTech(state, unit, r.tech)) return true;
    }
    return false;
  }
  return true;
}

/**
 * Is this step ROUTE-to-ROUTE? Real Civ 6 roads only help a unit moving FROM
 * a routed tile TO a routed tile — a single roaded tile in open country does
 * nothing. A RAILROAD carries the road under it, so it answers here too.
 */
export function roadStep(from: Tile, to: Tile): boolean {
  return (!!from.road || !!from.railroad) && (!!to.road || !!to.railroad);
}

/** Is this step RAILROAD-to-RAILROAD, the 0.25 tier? */
export function railStep(from: Tile, to: Tile): boolean {
  return !!from.railroad && !!to.railroad;
}

/** The road TIER the world has reached, 0..3 — latched at each era boundary
 *  (eras.ts), the one site both engines already fire in lockstep. */
export function roadTier(state: GameState): number {
  return state.roadTier ?? 0;
}

/**
 * Do routes carry BRIDGES yet? The Ancient road has none; every tier from the
 * Classical road up, the Railroad included, "Creates Bridges over Rivers".
 */
export function roadBridges(state: GameState): boolean {
  return !!ROAD_TIER_BRIDGES[roadTier(state)];
}

/** What a ROUTE-to-ROUTE step costs, in MP_SCALE units: the railroad's own
 *  0.25 where both ends carry one, else the world's current road tier. */
export function routeStepMp(state: GameState, from: Tile, to: Tile): number {
  if (railStep(from, to)) return RAILROAD_MP;
  return ROAD_TIER_MP[roadTier(state)] ?? MP_SCALE;
}

/** Civ 6-ish movement cost to ENTER a tile, in MP_SCALE units (river handled
 * separately). Water tiles enter at a flat point (embarked/naval movement —
 * no hills/features on water). Land tiles keep the terrain schedule.
 * A ROUTE-to-ROUTE step ignores the terrain penalty entirely — "roads let a
 * unit pass through Woods or Hills as if it were flat" — and pays its tier's
 * own published cost instead.
 * `from` is the tile being left; passing the same tile twice is harmless. */
export function moveCostInto(
  state: GameState, from: Tile, tile: Tile, mover?: { promos?: number; type: string },
): number {
  if (isWater(tile)) return MP_SCALE;
  // a hull in a Canal's passage pays the water step, not the ground's
  if (mover && UNITS[mover.type]?.naval && canalPassage(tile)) return MP_SCALE;
  if (roadStep(from, tile)) return routeStepMp(state, from, tile);
  return terrainMp(tile, mover);
}

/** The TERRAIN schedule alone, in MP_SCALE units — what a step costs where no
 *  route waives it. This is the half the fixture ships to the GPU. */
export function terrainMp(tile: Tile, mover?: { promos?: number; type: string }): number {
  let cost = MP_SCALE;
  // CIV6 (Alpine / Ranger): the promotion lets its holder "move onto a tile
  // with the appropriate terrain or terrain feature at the cost of only 1
  // Movement". Ranger names Woods and Jungle; Marsh is nobody's.
  const hills = !mover || !promoFlag(mover, 'TERRAIN_MOVE_HILLS');
  const woods = !mover || !promoFlag(mover, 'TERRAIN_MOVE_WOODS');
  if (tile.elevation === 'HILLS' && hills) cost += MP_SCALE;
  if (tile.feature === 'MARSH') cost += MP_SCALE;
  else if ((tile.feature === 'WOODS' || tile.feature === 'RAINFOREST') && woods) cost += MP_SCALE;
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
/**
 * How far out to sea a seat's Traders may go. CIV6: "The Celestial Navigation
 * technology is required to move on Coast tiles. The Cartography technology is
 * required to move on Ocean tiles." A seat with neither keeps to the land.
 */
export const TRADE_WATER_NONE = 0;
export const TRADE_WATER_COAST = 1;
export const TRADE_WATER_OCEAN = 2;

/** The naval MELEE line: a hull with no ranged strength that is neither a
 *  raider nor a carrier. */
export function navalMelee(def: UnitDef | undefined): boolean {
  return !!def?.naval && !def.ranged && !def.raider && !(def.airSlots ?? 0);
}

/**
 * CIV6 (GlobalParameters COMBAT_HEAL_NAVAL_FRIENDLY 20 / NAVAL_NEUTRAL 0 /
 * NAVAL_ENEMY 0): a hull heals in its own waters alone. (Auxiliary Ships /
 * Supply Fleet / Supercarrier): +10 in neutral and +5 in enemy territory.
 * (Knarr): naval melee +10 in neutral territory.
 */
export function navalHeal(state: GameState, unit: Unit, home: boolean, neutral: boolean): number {
  if (home) return 20;
  const promo = promoFlag(unit, 'HEAL_ANYWHERE');
  if (!neutral) return promo ? 5 : 0;
  const knarr = civOf(state, unit.seat) === 'NORWAY' && navalMelee(UNITS[unit.type]);
  return (promo ? 10 : 0) + (knarr ? KNARR_NAVAL_MELEE_NEUTRAL_HEAL : 0);
}

/** CIV6 (EFFECT_ADJUST_UNIT_MOVEMENT while embarked): the roster's extra
 *  Movement for this embarked unit — `EMBARK_MOVE_ROWS`. */
export function rosterEmbarkMoves(state: GameState, unit: { type: string; seat: number }): number {
  let m = 0;
  for (const r of getModifiers(state, unit.seat).embarkMoves) {
    if (!r.settlerOnly || unit.type === 'SETTLER') m += r.amount;
  }
  return m;
}

/** CIV6 (EFFECT_ADJUST_UNIT_IGNORE_SHORES): "No movement penalty for
 *  embarking and disembarking" — the Knarr's every unit, the Mediterranean
 *  Colonies' Settlers (`IGNORE_SHORES_ROWS`). */
export function ignoresShores(state: GameState, unit: { type: string; seat: number }): boolean {
  return getModifiers(state, unit.seat).ignoreShores.some((r) => !r.settlerOnly || unit.type === 'SETTLER');
}

export function tradeWaterLevel(state: GameState, seat: number): number {
  const techs = seatOf(state, seat)?.research.techs;
  if (!techs?.includes('CELESTIAL_NAVIGATION')) return TRADE_WATER_NONE;
  return techs.includes('CARTOGRAPHY') ? TRADE_WATER_OCEAN : TRADE_WATER_COAST;
}

/** May a Trader at this water level stand here? */
export function tradeWalkable(tile: Tile, water: number): boolean {
  if (isImpassable(tile)) return false;
  if (!isWater(tile)) return true;
  if (water < TRADE_WATER_COAST) return false;
  return tile.terrain !== 'OCEAN' || water >= TRADE_WATER_OCEAN;
}

export function tradeWalkStep(state: GameState, fromIndex: number, targetIndex: number, water: number): number {
  const map = state.map;
  const dest = map.tiles[targetIndex];
  const at = map.tiles[fromIndex];
  if (!dest || !at || fromIndex === targetIndex) return fromIndex;
  let best: Tile | undefined;
  let bestD = hexDistance(at.col, at.row, dest.col, dest.row);
  for (const n of neighbors(map, at)) {
    if (!tradeWalkable(n, water)) continue;
    const d = hexDistance(n.col, n.row, dest.col, dest.row);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best ? best.index : fromIndex;
}

/**
 * Can a Trader descend from `fromIndex` to `toIndex` at this water level?
 * CIV6: "the route may start in an inland city, then go to a coastal city ...
 * move over sea to another city with a Harbor, then continue on land" — one
 * descent walks both modes, and only a pair no descent reaches leaves its
 * Trader parked at the origin.
 */
export function tradeWalkReachable(state: GameState, fromIndex: number, toIndex: number, water: number): boolean {
  const map = state.map;
  const dest = map.tiles[toIndex];
  const start = map.tiles[fromIndex];
  if (!dest || !start) return false;
  if (isImpassable(dest) || isImpassable(start)) return false;
  let at = fromIndex;
  for (let step = 0; step < TRADE_ROAD_MAX_STEPS && at !== toIndex; step++) {
    const next = tradeWalkStep(state, at, toIndex, water);
    if (next === at) return false;
    at = next;
  }
  return at === toIndex;
}

/** the trade walk is bounded by the route range — a route
 *  longer than this cannot exist (canAddTradeRoute gates on TRADE_ROUTE_RANGE),
 *  so the bound is a safety rail, not a rule. */

/** The MP a river crossing costs (real Civ 6 ends movement; this model charges
 *  a flat 3 points — the pre-existing convention, now named). */
export const RIVER_CROSS_MP = 3 * MP_SCALE;

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

/**
 * The STACKING slot a chassis holds. Four, not two: CIV6 bases an air unit
 * INSIDE a city centre, an Aerodrome or a carrier, where it neither blocks a
 * land unit nor defends the tile; and a SPY carries no Combat Strength at all,
 * standing in its own promotion class ("Espionage") and holding no tile.
 * Every `=== 'military'` reader therefore keeps its meaning — neither a plane
 * nor a spy is a garrison, exerts zone of control, is anybody's melee
 * defender, banks experience or ever fortifies.
 */
export function unitDomain(type: string): 'civilian' | 'military' | 'air' | 'spy' {
  if (UNITS[type]?.air !== undefined) return 'air';
  if (isSpy(type)) return 'spy';
  const d = UNITS[type];
  // CIV6 (Legion): a charge-carrier that fights is a military unit — the
  // charge is what it builds with, not what it is.
  return d?.charges !== undefined && !((d.combat ?? 0) > 0) ? 'civilian' : 'military';
}

/** CIV6 (To Arms!, Golden face): "+15% Production towards military units."
 *  The Spy's own chassis page types it "Civilian/Espionage", so the espionage
 *  domain sits outside that set as squarely as a Settler does. */
export function unitIsMilitary(type: string): boolean {
  const d = unitDomain(type);
  return d === 'military' || d === 'air';
}

/**
 * The STACKING slot a unit holds on its tile. CIV6 (Movement, "Stacking"): "At
 * sea, there are no support units, so there can only be one ship per tile.
 * Great Admirals, as civilian units, may stack with ships. Embarked units are
 * also considered a separate class, and may stack with both a military ship
 * and an Admiral." So a water tile holds up to three: the hull, the Admiral,
 * and ONE passenger of either domain.
 */
export type StackSlot = 'civilian' | 'military' | 'air' | 'spy' | 'embarked';
export function unitStackSlot(u: { type: string; embarked?: boolean }): StackSlot {
  const d = unitDomain(u.type);
  return u.embarked && d !== 'air' ? 'embarked' : d;
}

/**
 * A unit changes owner. Three fields move together, so the capture and the
 * conversion cannot answer differently: the new side's flag, a spent turn, and
 * NO fortification — a unit that has just changed hands holds none, which is
 * also what `movesLeft = 0` makes the fortify gate say at the next refresh.
 *
 * The re-seated unit then goes to the END of `state.units`: the pooled engine
 * despawns its merged slot and appends at the receiving pool's head, so both
 * engines must iterate it LAST in every array-order walk.
 */
export function reseatUnit(state: GameState, unit: Unit, seat: number): void {
  unit.seat = seat;
  unit.movesLeft = 0;
  unit.fortifyTurns = 0;
  state.units = state.units.filter((u) => u.id !== unit.id);
  state.units.push(unit);
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

/**
 * Can `seat` SEE this unit? CIV6 (Unit, "Stealth units"): they "are invisible
 * to non-adjacent units"; beside a City Center or an Encampment they "remain
 * hidden as long as they don't attack and there's no unit in the district";
 * once one attacks it "will become visible for a turn"; and the REVEAL STEALTH
 * ability "allows them to see other stealth units within their Sight range".
 *
 * A district sees nothing of its own, so only UNITS answer here — which is
 * also why an adjacent CITY does not give the hex away.
 */
export function unitVisibleTo(state: GameState, u: Unit, seat: number): boolean {
  // CIV6 (Twilight Veil): "Only adjacent enemy units can reveal this unit" —
  // a promoted hider is never given away at range, so Reveal Stealth lengthens
  // the look at a stealth CHASSIS and at nothing else.
  const chassis = !!UNITS[u.type]?.stealth;
  if (!chassis && !promoFlag(u, 'STEALTH')) return true;
  if (u.seat === seat) return true;
  if ((u.revealedTurn ?? -1) >= state.turn) return true;
  const t = state.map.tiles[u.tileIndex];
  for (const v of state.units) {
    if (v.seat !== seat) continue;
    const vt = state.map.tiles[v.tileIndex];
    const reach = chassis && UNITS[v.type]?.revealStealth ? unitSight(v) : 1;
    if (hexDistance(vt.col, vt.row, t.col, t.row) <= reach) return true;
  }
  return false;
}

/** Hostile to `viewer` AND seen by it — the only units it may act against. */
export function visibleHostilesAt(state: GameState, tileIndex: number, viewer: { seat: number }): Unit[] {
  return unitsAt(state, tileIndex).filter(
    (u) => unitsHostile(state, viewer, u) && unitVisibleTo(state, u, viewer.seat),
  );
}

/** Does this unit project a zone of control at all? CIV6 (Zone of Control):
 *  "Ranged and Bombard class units do not exert ZOC" — SUPPRESSION hands it
 *  back to a ranged unit. The two submarines carry "Does not exert zone of
 *  control" on the chassis, and an embarked unit exerts none either. Air
 *  units are no garrison, so `unitDomain` filters them. */
/** CIV6 (Zone of Control): "Religious units exert ZOC against other religious
 *  units" — the ONLY class whose zone is not the military one, so it is a
 *  predicate of its own rather than a widening of `unitExertsZoc` (which the
 *  encirclement ring also reads, and a Missionary holds no ring). */
export function unitReligious(type: string): boolean {
  return (UNITS[type]?.religiousStrength ?? 0) > 0;
}

export function unitExertsZoc(u: Unit): boolean {
  if (unitDomain(u.type) !== 'military' || u.embarked || UNITS[u.type]?.exertsNoZoc) return false;
  const cls = UNIT_PROMO_CLASS[u.type];
  if ((cls === 'RANGED' || cls === 'SIEGE') && !promoFlag(u, 'ZOC_EXERT')) return false;
  return true;
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
  mover: { seat: number; type?: string },
): boolean {
  // CIV6: a naval raider "ignores enemy zone of control", and cavalry-class
  // units ignore it too.
  if (mover.type !== undefined && (UNITS[mover.type]?.ignoresZoc || (UNITS[mover.type]?.cavalry && !UNITS[mover.type]?.chariot))) return false;
  const tile = state.map.tiles[tileIndex];
  // CIV6 (Zone of Control): "Religious units exert ZOC against other religious
  // units" — so a religious mover walks through a military zone, and a
  // military one walks through a religious zone. Only a matching pair halts.
  const relMover = mover.type !== undefined && unitReligious(mover.type);
  for (const n of neighbors(state.map, tile)) {
    // CIV6 (Zone of Control): rivers block ZOC — an exerter across a river
    // from the entered tile halts nothing.
    if (crossesRiver(tile, n)) continue;
    for (const u of unitsAt(state, n.index)) {
      const relU = unitReligious(u.type);
      if (relU !== relMover) continue;
      const exerts = relU ? !u.embarked : unitExertsZoc(u);
      if (exerts && unitsHostile(state, u, mover)) return true;
    }
  }
  return false;
}

/** FORTIFY: the defender-strength bonus a unit's fortifyTurns grants
 * (+3 CS at >=1, +6 at >=2; cap 2). Civilians never fortify (0). */
/** The pool this unit was GRANTED this turn — `movesFull` where it stands,
 *  and the live full where it does not. ONE fallback: the heal gate, the
 *  fortify gate and the state compare must all read the same number, or a
 *  unit born after the reset digs in on one engine alone. */
export function grantedMoves(state: GameState, unit: Unit): number {
  return unit.movesFull ?? unitFullMoves(state, unit);
}

export function fortifyBonus(unit: { fortifyTurns?: number }): number {
  return Math.min(FORTIFY_MAX_TURNS, unit.fortifyTurns ?? 0) * 3;
}

/** The defence a COMPLETE wonder gives the unit standing on its tile. */
export function wonderOccupyDefense(state: GameState, tileIndex: number): number {
  const t = state.map.tiles[tileIndex];
  if (!t?.builtWonder || !t.builtWonderComplete) return 0;
  return BUILT_WONDERS[t.builtWonder]?.effects?.occupyDefense ?? 0;
}



function tileOwnedByUnitOwner(t: Tile, unit: { seat: number }): boolean {
  return tileSeat(t) === unit.seat;
}

export function cliffBlocks(state: GameState, a: Tile, b: Tile, unit?: { seat: number; type?: string; promos?: number }): boolean {
  const land = isWater(a) ? b : a;
  const water = isWater(a) ? a : b;
  if (isWater(land) || !isWater(water)) return false; // not a land/water edge
  if (!land.cliffMask) return false;
  // CIV6 (Commando): "Can scale Cliff walls."
  if (unit?.type && promoFlag({ type: unit.type, promos: unit.promos }, 'CLIFFS')) return false;
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
  if (waterWalks(unit.type)) return false;   // nor does a chassis water is ground to
  if (isWater(from) === isWater(to)) return false; // not a land/water crossing
  return cliffBlocks(state, from, to, unit);
}

/**
 * Is this ground closed to `seat`?
 *
 * CIV6 (Movement, "Entering other empires' borders"): "In the beginning of the
 * game all units may enter freely all other civilizations' and city-states'
 * territory. This changes only after a civ (or city-state) develops the Early
 * Empire civic ... units of one civ may only enter the territory of another
 * civ if they have granted them Open Borders." War opens what the civic
 * closed, and an ally needs no grant of its own: "Allies automatically have
 * Open Borders." "Traders ignore borders", and "Religious units also ignore
 * borders".
 *
 * CITY-STATE ground closes like anyone's, off the MINOR's own research
 * record; CIV6 (Borders): "For city-states, Open Borders is granted to
 * players that have reached Suzerain status." Only a MAJOR's units are
 * bound — a barbarian was never going to ask permission anyway.
 */
export function borderClosedTo(
  state: GameState,
  seat: number,
  tile: Tile,
  unitType?: string,
): boolean {
  const owner = tileSeat(tile);
  if (owner === NO_SEAT || owner === seat) return false;
  if (!isCiv(seat)) return false;
  // CIV6 (Movement): "Traders ignore borders" and "Religious units also ignore
  // borders" — with the one exception the Inquisitor page names for itself:
  // it "cannot enter another civilization's territory without Open Borders".
  if (unitType && unitType !== 'INQUISITOR') {
    const def = UNITS[unitType];
    if (def?.trader || (def?.religiousStrength ?? 0) > 0) return false;
  }
  if (isCityStateSeat(owner)) {
    const cs = state.cityStates.find((c) => c.seat === owner);
    if (!cs?.research.civics.includes(OPEN_BORDERS_CIVIC)) return false;
    if (suzerainOf(cs) === seat) return false;
    return !civsAtWar(state, seat, owner);
  }
  if (!isCiv(owner)) return false;
  const host = seatOf(state, owner);
  if (!host?.research.civics.includes(OPEN_BORDERS_CIVIC)) return false;
  if (civsAtWar(state, seat, owner)) return false;
  if (seatsAllied(state, seat, owner)) return false;
  return borderTurnsFrom(state, owner, seat) <= 0;
}

export function tileFreeForUnit(
  state: GameState,
  tileIndex: number,
  seat: number,
  unit?: Unit | { type: string; seat: number; id?: number },
  allowEmbark = false,
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (isImpassable(tile) && !gdrJump(state, unit, tile)) return false;
  // An AIRCRAFT is BASED, not stationed: several of them share one plot, none
  // of them holds it, and what gates the landing is the base's slot count
  // (`airBaseFree`), never the tile. CIV6 (Espionage): a Spy likewise
  // "jumps from city to city" rather than walking, so it holds no plot either.
  if (unit && (isAirUnit(unit.type) || isSpy(unit.type))) return true;
  const naval = unit ? !!UNITS[unit.type]?.naval : false;
  const walks = !!unit && waterWalks(unit.type);
  if (isWater(tile)) {
    if (naval) {
      if (!unit || !waterEnterable(state, tile, unit)) return false;
    } else if (!walks) {
      if (!allowEmbark || !unit || !canEmbark(state, unit) || !waterEnterable(state, tile, unit)) return false;
    }
  } else {
    // Land tile: a hull stands ashore only in a Canal's passage.
    if (naval && !canalPassage(tile)) return false;
  }
  // A LIVE enemy Encampment garrison bars entry outright. The
  // beat-it-down path is the melee attack ON the tile, never a move.
  if (unit && encampmentBlocks(state, tile, unit)) return false;
  const side = unit ? unit.seat : seat;
  if (borderClosedTo(state, side, tile, unit?.type)) return false;
  // the slot the mover would hold HERE: a land unit standing on water is a
  // passenger, whatever it is on land.
  const domain: StackSlot = unit
    ? (isWater(tile) && !naval && !walks ? 'embarked' : unitDomain(unit.type))
    : 'civilian';
  for (const u of unitsAt(state, tileIndex)) {
    if (u.id === unit?.id || isAirUnit(u.type) || isSpy(u.type)) continue;
    if (u.seat !== side) return false; // foreign occupied
    if (unitStackSlot(u) === domain) return false; // same-slot ally
  }
  return true;
}

export function findPath(state: GameState, unit: Unit, targetIndex: number): number[] | null {
  const map = state.map;
  const target = map.tiles[targetIndex];
  const naval = !!UNITS[unit.type]?.naval;
  const passOk = (t: Tile): boolean =>
    // Routing never plans THROUGH a live enemy Encampment or closed ground.
    !encampmentBlocks(state, t, unit) &&
    !borderClosedTo(state, unit.seat, t, unit.type) &&
    (naval
      ? hullTile(t) && !isImpassable(t) && (canalPassage(t) || waterEnterable(state, t, unit))
      : unitPassable(t, unit) || gdrJump(state, unit, t));
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
      const g = cur.g + moveCostInto(state, curTile, n, unit) + (naval ? 0 : riverCharge(state, curTile, n)); // roads
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
 *   - Embark/disembark (a LAND unit crossing land↔water) costs the step's
 *     own cost plus a 2-MP penalty — CIV6 (Movement): "either 3 Movement or
 *     all the unit's Movement for the round (if it has less than 3)" — and
 *     leftover MP transfers to the new mode, capped at its full pool. The
 *     penalty is waived at a Harbor water tile or a coastal City Center land
 *     tile ("costs only 1 Movement"). Naval units never transition; water
 *     steps never pay a river charge.
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
/**
 * THE ESCORT FORMATION. CIV6 (Formations): "A military unit can create a
 * formation with a support or civilian unit at any time"; the formation's
 * Movement "is equal to that of the slowest unit that belongs to it", and
 * every attack on the tile is answered by its military member.
 *
 * The engine already seats one military and one civilian unit to a tile, so
 * the formation is a LINK rather than a stack: the civilian carries the flag
 * and the tile names its escort. A flag with no military unit beside it is
 * not a formation, which is what frees the civilian the moment its escort
 * dies — no sweep, and no stale link to clear at a capture.
 */
export function escortOf(state: GameState, unit: Unit): Unit | undefined {
  if (!unit.escorted) return undefined;
  return state.units.find(
    (u) => u.id !== unit.id && u.tileIndex === unit.tileIndex && u.seat === unit.seat
      && unitDomain(u.type) === 'military' && !u.embarked,
  );
}

/** MAY this unit be the escorted half of a formation? CIV6 (Formations): a
 *  military unit forms with "a support or civilian unit", and a naval one
 *  "may also create a formation with embarked land units" — which is exactly
 *  the two stacking classes that are not the tile's military slot. */
export function escortable(unit: Unit): boolean {
  return !!unit.embarked || unitDomain(unit.type) === 'civilian';
}

/** the units this military one is escorting — at most one of each stacking
 *  class, which is Civ 6's three-unit formation on a tile that holds all
 *  three. */
export function escortRiders(state: GameState, unit: Unit): Unit[] {
  if (unitDomain(unit.type) === 'military' && !unit.embarked) {
    return state.units.filter(
      (u) => !!u.escorted && u.id !== unit.id && u.tileIndex === unit.tileIndex
        && u.seat === unit.seat && escortable(u),
    );
  }
  return [];
}

export function inEscort(state: GameState, unit: Unit): boolean {
  return escortOf(state, unit) !== undefined;
}

export function escortUnit(state: GameState, unit: Unit): RuleResult {
  if (!escortable(unit)) return no('Only a civilian or a passenger joins an escort.');
  if (unit.escorted) return no('Already in a formation.');
  const esc = state.units.find(
    (u) => u.id !== unit.id && u.tileIndex === unit.tileIndex && u.seat === unit.seat
      && unitDomain(u.type) === 'military' && !u.embarked,
  );
  if (!esc) return no('No military unit here to escort it.');
  // ONE rider to an escort: the drag takes a single passenger, so a second
  // flag on the tile would be a formation nothing moves.
  if (escortRiders(state, esc).length > 0) return no('That unit already escorts one.');
  unit.escorted = true;
  return ok;
}

export function breakEscort(unit: Unit): RuleResult {
  if (!unit.escorted) return no('Not in a formation.');
  unit.escorted = false;
  return ok;
}

/** CIV6 (Giant Death Robot): the chassis "gains additional abilities and
 *  upgrades via Future Era technology research" — an upgrade is the SEAT's
 *  tech, empire-wide, with no per-unit state behind it. */
export function gdrUpgrade(state: GameState, seat: number, id: string): boolean {
  const def = GDR_UPGRADES.find((g) => g.id === id);
  return !!def && isTechComplete(state, def.tech, seat);
}

/** the upgrade that reaches a UNIT: its chassis has to be the robot. */
export function gdrHas(state: GameState, unit: { type: string; seat: number }, id: string): boolean {
  return !!UNITS[unit.type]?.gdr && gdrUpgrade(state, unit.seat, id);
}

/** CIV6 (Enhanced Mobility): the robot "can perform a Jump action to cross
 *  over mountain terrain" — one hex of mountain is simply enterable to this
 *  chassis, which is what the action does over one hex. Ice and an impassable
 *  wonder are not mountains and stay shut.
 *
 *  `unitPassable` stays the pure terrain predicate the GPU's `passable` plane
 *  mirrors; a gate that knows the seat's research composes this beside it. */
export function gdrJump(state: GameState, unit: { type: string; seat: number } | undefined, tile: Tile): boolean {
  return !!unit && isMountain(tile) && gdrHas(state, unit, 'ENHANCED_MOBILITY');
}

/** the Movement a chassis draws from the tile under it at the turn's start:
 *  CIV6 (Heavy Chariot / Maryannu Chariot Archer / War-Cart) "+N Movement if
 *  starting in Desert, Plains, Grassland, or Tundra" — flat ground;
 *  (Berserker Movement) "+2 Movement if this unit starts in enemy
 *  territory"; (Longship Movement) "+1 Movement while in coastal waters". */
export function startTileMoves(state: GameState, unit: { type: string; seat: number; tileIndex?: number }): number {
  const def = UNITS[unit.type];
  if (!def || unit.tileIndex === undefined) return 0;
  const tile = state.map.tiles[unit.tileIndex];
  let m = 0;
  if (def.openTerrainMoves && tile.elevation === 'FLAT' && OPEN_TERRAINS.includes(tile.terrain)) m += def.openTerrainMoves;
  if (def.enemyTerritoryMoves) {
    const owner = tileSeat(tile);
    if (owner >= 0 && owner !== unit.seat && civsAtWar(state, unit.seat, owner)) m += def.enemyTerritoryMoves;
  }
  if (def.coastMoves && tile.terrain === 'COAST') m += def.coastMoves;
  return m;
}

export function unitFullMoves(state: GameState, unit: { type: string; seat: number; embarked?: boolean; tileIndex?: number }): number {
  const def = UNITS[unit.type];
  // CIV6 (Commando): the +1 Movement "also applies while the unit is
  // embarked", so the promotion adder joins both arms.
  const promo = promoValue(unit, 'MOVES');
  const atSea = seaMoveBonus(state, unit.seat);
  if (unit.embarked && !def?.naval) {
    return MP_SCALE * (EMBARK_MOVES + embarkTechMoves(state, unit.seat) + atSea + promo + rosterEmbarkMoves(state, unit));
  }
  // CIV6 (Letters of Marque): "Naval Raiders: +100% Production, +2 Movement."
  const raider = def?.raider ? getModifiers(state, unit.seat).navalRaiderMoves : 0;
  return MP_SCALE * (
    (def?.moves ?? 2) + (def?.naval ? atSea : 0) + promo + raider + goldenMoveBonus(state, unit)
    + startTileMoves(state, unit)
    // CIV6 (Enhanced Mobility): "+3 Moves."
    + (gdrHas(state, unit, 'ENHANCED_MOBILITY') ? GDR_ENHANCED_MOVES : 0)
    // an emergency member marches faster on its target's ground
    + emergencyMoveBonus(state, unit.seat,
        unit.tileIndex === undefined ? NO_SEAT : tileSeat(state.map.tiles[unit.tileIndex])));
}

/** the Mathematics rung every hull and every passenger reads. */
export function seaMoveBonus(state: GameState, seat: number): number {
  return seatOf(state, seat)?.research.techs.includes(SEA_MOVE_TECH) ? SEA_MOVE_TECH_BONUS : 0;
}

/** the three rungs that raise the EMBARKED pool itself. */
export function embarkTechMoves(state: GameState, seat: number): number {
  const techs = seatOf(state, seat)?.research.techs;
  if (!techs) return 0;
  let n = 0;
  for (const [id, v] of EMBARK_MOVE_TECHS) if (techs.includes(id)) n += v;
  return n;
}

export function stepUnit(state: GameState, unit: Unit, to: Tile): StepOutcome {
  const seat = unit.seat;
  // a formed civilian has no step of its own: the formation moves as one, and
  // Civ 6 asks for it to be broken first.
  if (inEscort(state, unit)) return 'blocked';
  const from = state.map.tiles[unit.tileIndex];
  const naval = !!UNITS[unit.type]?.naval;
  // CIV6 (Movement): the one-step allowance reads "full Movement" as "has
  // spent nothing this turn" — measured against the GRANTED pool, exactly as
  // the heal gate's `grantedLast`. A live recompute drifts the moment a tech
  // or aura lands mid-turn, and the GPU afford reads its stored pool.
  const full = unit.movesFull ?? unitFullMoves(state, unit);
  const transition = !naval && !waterWalks(unit.type) && isWater(from) !== isWater(to);
  if (cliffBlocksStep(state, from, to, unit)) return 'blocked';
  const wEnd = isWater(to) ? to : from;
  const lEnd = isWater(to) ? from : to;
  const easyDock = wEnd.district === 'HARBOR'
    || (lEnd.district === 'CITY_CENTER' && isCoastalLand(state.map, lEnd))
    || ignoresShores(state, unit);
  const cost = transition
    ? moveCostInto(state, from, to, unit) + (easyDock ? 0 : EMBARK_TRANSITION_MP)
    : moveCostInto(state, from, to, unit) + riverCharge(state, from, to); // roads
  if (unit.movesLeft < cost && unit.movesLeft < full) return 'cantAfford';
  // THE FORMATION MOVES AS ONE — and no further than its slowest member,
  // unless the escort carries Escort Mobility.
  const riders = escortRiders(state, unit);
  const riderFree = riders.length > 0 && promoFlag(unit, 'ESCORT_SPEED');
  for (const rider of riders) {
    if (!tileFreeForUnit(state, to.index, seat, rider, true)) return 'blocked';
    const rFull = rider.movesFull ?? unitFullMoves(state, rider);
    if (!riderFree && rider.movesLeft < cost && rider.movesLeft < rFull) return 'cantAfford';
  }
  if (transition) unit.embarked = isWater(to);
  unit.tileIndex = to.index;
  carryAirWith(state, unit, from.index);
  logUnitOrder(state, unit.seat, unit.id, 'move', to.index);
  unit.movesLeft = Math.max(0, unit.movesLeft - cost);
  // the transfer cap: what carries over can never exceed the NEW mode's
  // pool — which becomes the granted pool every later afford this turn reads
  if (transition) {
    const modeFull = unitFullMoves(state, unit);
    unit.movesLeft = Math.min(unit.movesLeft, modeFull);
    unit.movesFull = modeFull;
  }
  for (const rider of riders) {
    const rTrans = !UNITS[rider.type]?.naval && !waterWalks(rider.type)
      && isWater(from) !== isWater(to);
    if (rTrans) rider.embarked = isWater(to);
    rider.tileIndex = to.index;
    if (!riderFree) rider.movesLeft = Math.max(0, rider.movesLeft - cost);
    if (rTrans) {
      const rModeFull = unitFullMoves(state, rider);
      rider.movesLeft = Math.min(rider.movesLeft, rModeFull);
      rider.movesFull = rModeFull;
    }
  }
  unit.attacksLeft = stepAttacksLeft(unit);
  // CIV6 (Combat): an Encampment emptied of its garrison is not walk-over
  // ground — it is "'conquered' by a melee unit, as you would a City Center",
  // and a SHOT never conquers, so the shot-emptied district waits for this
  // entry. A ranged walker only OCCUPIES the tile (holding its heal silent).
  if (to.district === 'ENCAMPMENT' && to.districtComplete && !to.districtPillaged
      && (to.encampHp ?? ENCAMPMENT_HP) <= 0
      && unitDomain(unit.type) === 'military' && !UNITS[unit.type]?.ranged) {
    const side = tileOwnerSide(to);
    if (side !== null && unitsHostile(state, unit, side)) conquerEncampment(state, to, unit);
  }
  if (unit.seat === seat) {
    revealAround(state, unit.seat, to.index, unitSight(unit));
    // CIV6 (Pilgrim): "Gains 3 extra spreads when moving adjacent to a natural
    // wonder for the first time."
    if (neighbors(state.map, to).some((t) => naturalWonderAt(t) !== null)) {
      const extra = promoFirstUse(unit, 'PILGRIM');
      if (extra > 0) unit.charges = (unit.charges ?? 0) + extra;
    }
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

/**
 * CIV6 (Pax Britannica): "a free melee unit" — a grant row that names a
 * promotion CLASS rather than a chassis takes the STRONGEST one this seat
 * could train, ties by catalog order. The city-free `trainableUnits` set,
 * which is exactly what the GPU's `_seat_trainable_units` mirrors, so the two
 * engines pick the same chassis by construction.
 */
export function bestTrainableOfClass(state: GameState, seat: number, promoClass: string): string | null {
  let best: UnitDef | undefined;
  for (const d of trainableUnits(state, seat)) {
    if (UNIT_PROMO_CLASS[d.id] !== promoClass) continue;
    // strictly greater keeps the FIRST of a tie, which is catalog order
    if (!best || (d.combat ?? 0) > (best.combat ?? 0)) best = d;
  }
  return best?.id ?? null;
}

export function trainableUnits(
  state: GameState,
  seat: number,
  city?: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): UnitDef[] {
  if (!state.unitsMode) return [];
  // CIV6: fallout stops production and "prevents any Gold or Faith purchasing
  // of units" there. A unit is raised in the CITY CENTER, so that is the tile
  // that has to be clean — this one predicate serves the queue and every
  // purchase path, which all funnel through here.
  if (city && irradiated(state.map.tiles[city.centerIndex])) return [];
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
    if (!civUnitAllowed(civOf(state, seat), d.id)) return false;
    if (d.requiresTech && !state.sandbox && !isTechComplete(state, d.requiresTech, seat)) return false;
    if (d.requiresCivic && !state.sandbox && !isCivicComplete(state, d.requiresCivic, seat)) return false;
    // An ARCHAEOLOGIST may only be trained where its city still has a FREE
    // artifact slot — the museum's own or the any-work pool's (the real
    // Civ 6 rule: with no room the unit has nowhere to put what it digs up).
    if (d.id === 'ARCHAEOLOGIST' && !state.sandbox) {
      if (!city) return false;
      const held = seatOf(state, seat)!.cities.find((c) => c.centerIndex === city.centerIndex);
      if (!held || artifactFree(state, held) <= 0) return false;
    }
    // A unit whose CITY must already hold a building (the Military Engineer's
    // Armory, which carries its Encampment with it).
    if (d.requiresBuilding && !state.sandbox) {
      if (!city) return false;
      const held = seatOf(state, seat)!.cities.find((c) => c.centerIndex === city.centerIndex);
      if (!(held?.buildings ?? []).includes(d.requiresBuilding)) return false;
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
    // ACCESS opens the column; the STOCKPILE is what pays for the unit, and a
    // seat that cannot pay must not be offered it — the applier re-asks.
    if (d.requiresResource && !state.sandbox) {
      if (!civHasStrategic(state, seat, d.requiresResource)) return false;
      if (!canTrainWithStockpile(state, seat, d.id)) return false;
    }
    // CIV6 (Air combat): aircraft "can only be built in a city with an
    // Aerodrome", and only while that Aerodrome "still has empty slots".
    // CIV6 (Espionage): "you can never have more Spies than your current
    // empire's development allows."
    if (d.spy && !state.sandbox) return canTrainSpy(state, seat);
    if (d.air && !state.sandbox) return canTrainAir(state, seat, city);
    if (d.naval) return !!city && cityNavalCapable(state, city);
    return true;
  });
}

/**
 * The military chassis a seat may GOLD-buy, in UNITS-table order so a strict
 * `>` on combat breaks ties to the LOWEST-index chassis (the GPU's
 * `combat * NU - index` argmax mirror).
 *
 * It is the seat-level trainable set and nothing else: `trainableUnits` with
 * no city is what refuses a hull and a plane, because the gold rung spawns at
 * the capital and asks no city question, so neither can name the Harbor or the
 * Aerodrome it would need. CIV6 (Spy): "Cannot be purchased with Gold."
 */
export function goldBuyableUnits(state: GameState, seat: number): UnitDef[] {
  return trainableUnits(state, seat).filter(
    (d) => (d.combat ?? 0) > 0 && !d.noGold && d.id !== 'SCOUT',
  );
}

/**
 * CIV6 (Unit): a unit upgrades when it is "in friendly territory", has "more
 * than 0 Movement left", its owner can pay the Gold, and — in GS — holds the
 * strategic resource the NEXT chassis asks for, "unless the unit you're
 * upgrading also requires the same resource, in which case you don't need
 * any". The new chassis must itself be unlocked. "Upgraded units retain all
 * their Promotions and experience" and "units do not Heal upon upgrading".
 *
 * MODEL: the source does not say what movement an upgrade leaves behind, so
 * this spends the rest of the turn, like every other verb here.
 */
export function canUpgradeUnit(state: GameState, unit: Unit, seat: number): boolean {
  const next = civUpgradeTarget(civOf(state, seat), unit.type);
  if (!next || unit.seat !== seat || unit.movesLeft <= 0) return false;
  const def = UNITS[next];
  if (!def) return false;
  if (def.requiresTech && !isTechComplete(state, def.requiresTech, seat)) return false;
  if (def.requiresCivic && !isCivicComplete(state, def.requiresCivic, seat)) return false;
  const tile = state.map.tiles[unit.tileIndex];
  if (tileSeat(tile) !== seat) return false;
  if (!canPayUpgradeGold(state, seat, unit.type)) return false;
  const c = upgradeResourceCost(state, seat, unit.type);
  return !c || canPayStockpile(state, seat, c.id, c.n);
}

export function upgradeUnit(state: GameState, unit: Unit, seat: number): RuleResult {
  if (!canUpgradeUnit(state, unit, seat)) return { ok: false, reason: 'Cannot upgrade here.' };
  const next = civUpgradeTarget(civOf(state, seat), unit.type)!;
  const s = seatOf(state, seat)!;
  s.treasury -= upgradeGoldCost(state, seat, unit.type);
  const c = upgradeResourceCost(state, seat, unit.type);
  if (c) spendStockpile(state, seat, c.id, c.n);
  unit.type = next;
  unit.movesLeft = 0;
  unit.movesFull = unitFullMoves(state, unit);
  return { ok: true };
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
  // CIV6 (Archaeologist): "Archaeologists cannot enter another civilization's
  // territory without an Open Borders treaty" — ENTRY is what the rule gates,
  // so the dig asks the same question the step did.
  if (borderClosedTo(state, unit.seat, tile, unit.type)) {
    return no('That dig lies behind a closed border.');
  }
  const home = seatOf(state, seat)!.cities
    .filter((c) => artifactFree(state, c) > 0)
    .sort((a, b) => a.id - b.id)[0];
  if (!home) return no('No city has a free artifact slot.');
  home.artifacts = (home.artifacts ?? 0) + 1;
  // CIV6 (Wish You Were Here, dark face): "+1 Era Score for each Artifact
  // extracted."
  dedicationEvent(state, unit.seat, DED_WISH);
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
    if (tileAppeal(state.map, t, camps, cityAppealResolver(state)) < PARK_MIN_APPEAL) return false;
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

/**
 * The venue KINDS a tile is, as `BAND_VENUE_BIT` bits — what a band
 * promotion's mask names: a finished wonder, a finished district of the six
 * the promotions know, a National Park, a Natural Wonder, a Seaside Resort.
 */
export function concertVenueBits(state: GameState, tileIndex: number): number {
  const tile = state.map.tiles[tileIndex];
  if (!tile) return 0;
  let bits = 0;
  if (tile.builtWonder && tile.builtWonderComplete) bits |= BAND_VENUE_BIT.WONDER;
  if (tile.district && tile.districtComplete) {
    for (const d of BAND_VENUE_DISTRICTS) if (tile.district === d) bits |= BAND_VENUE_BIT[d];
  }
  if ((tile.park ?? -1) >= 0) bits |= BAND_VENUE_BIT.NATIONAL_PARK;
  if (naturalWonderAt(tile)) bits |= BAND_VENUE_BIT.NATURAL_WONDER;
  if (tile.improvement === 'SEASIDE_RESORT') bits |= BAND_VENUE_BIT.SEASIDE_RESORT;
  return bits;
}

/**
 * The tile's VENUE value, 0 where a Rock Band cannot play. CIV6 lists a World
 * Wonder at 1000, the Broadcast Center and Stadium at 750, the University and
 * Shipyard at 500 and the Amphitheater and Arena at 250 — a building venue
 * being the DISTRICT tile whose city holds it — and the band's own
 * promotions open more (Music Festival, Space Rock, Surf Band), their value
 * ADDING to whatever the tile already paid.
 */
export function concertVenue(state: GameState, tileIndex: number, unit?: Unit): number {
  const tile = state.map.tiles[tileIndex];
  if (!tile) return 0;
  let best = 0;
  if (tile.builtWonder && tile.builtWonderComplete) best = ROCK_BAND_WONDER_VENUE;
  else if (tile.district && tile.districtComplete) {
    const city = cityAtTile(state, tile);
    if (city) {
      for (const bid of Object.keys(ROCK_BAND_VENUES)) {
        const value = ROCK_BAND_VENUES[bid];
        if (!city.buildings.includes(bid)) continue;
        if (BUILDINGS[bid]?.district !== tile.district) continue;
        if (value > best) best = value;
      }
    }
  }
  if (unit) best += promoValueFor(unit, 'BAND_VENUE', concertVenueBits(state, tileIndex));
  return best;
}

/**
 * PERFORM A ROCK CONCERT. CIV6: "Rock Bands must always perform in foreign
 * lands", each performance applying "a one-time Tourism pressure burst
 * towards the civilization within whose borders it takes place", and
 * "Tourism = Venue Tourism Value * (1 + (Tourism Bomb Value / 100) + (Album
 * Sales / 100))". ONE draw picks the tier off the band's own level row; the
 * two best promote it, the two worst end it.
 */
export function performConcert(state: GameState, unitId: number, seat: number): RuleResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.seat !== seat) return no('No such unit.');
  if (unit.type !== 'ROCK_BAND') return no('Only a Rock Band can perform.');
  const owner = tileSeat(state.map.tiles[unit.tileIndex]);
  if (!isCiv(owner) || owner === seat) return no('A Rock Band performs only in foreign lands.');
  const venue = concertVenue(state, unit.tileIndex, unit);
  if (venue <= 0) return no('No venue on this tile.');
  const level = Math.min(ROCK_BAND_MAX_LEVEL, Math.max(1, unit.bandLevel ?? 1));
  // CIV6 (Album Cover Art, Arena Rock, ...): "+N level when performing at
  // <venue kind>" — the tier ROLL reads the raised level; the band's own
  // level does not move.
  const bits = concertVenueBits(state, unit.tileIndex);
  const rollLevel = Math.min(ROCK_BAND_MAX_LEVEL, Math.max(1, level + promoValueFor(unit, 'BAND_LEVEL', bits)));
  const odds = ROCK_BAND_TIER_ODDS[rollLevel - 1];
  const roll = Math.floor(nextRandom(state) * 1000);
  let acc = 0;
  let tier = odds.length - 1;
  for (let i = 0; i < odds.length; i++) {
    acc += odds[i];
    if (roll < acc) { tier = i; break; }
  }
  const row = ROCK_BAND_TIERS[tier];
  const album = unit.bandAlbum ?? 0;
  const lump = Math.floor(venue * (100 + row.bomb + album) / 100);
  const band = seatOf(state, seat);
  const here = state.map.tiles[unit.tileIndex];
  if (band && lump > 0) {
    band.tourismTo ??= [];
    band.tourismTo[owner] = (band.tourismTo[owner] ?? 0) + lump;
    // CIV6 (Flower Power): "All civilizations not currently at war receive
    // +100% of the Tourism from your Concerts."
    const share = getModifiers(state, seat).concertShare;
    if (share > 0) {
      for (const other of state.seats) {
        if (other.seat === seat || other.seat === owner) continue;
        if (civsAtWar(state, seat, other.seat)) continue;
        band.tourismTo[other.seat] = (band.tourismTo[other.seat] ?? 0) + Math.floor(lump * share);
      }
    }
    // CIV6 (Goes to 11): "Civilizations within 10 tiles of the concert
    // receive 50% of its Tourism" — a civ is within reach through any city
    // centre of its own.
    const near = promoValueFor(unit, 'CONCERT_SHARE_NEAR', 0);
    if (near > 0) {
      for (const other of state.seats) {
        if (other.seat === seat || other.seat === owner || !isCiv(other.seat)) continue;
        const reached = other.cities.some((c) => {
          const cc = state.map.tiles[c.centerIndex];
          return hexDistance(cc.col, cc.row, here.col, here.row) <= CONCERT_SHARE_RANGE;
        });
        if (reached) band.tourismTo[other.seat] = (band.tourismTo[other.seat] ?? 0) + Math.floor(lump * near / 100);
      }
    }
    // CIV6 (Pop Star): "Gains Gold equal to 25% of the Tourism generated."
    const goldPct = promoValueFor(unit, 'CONCERT_GOLD_PCT', 0);
    if (goldPct > 0) band.treasury += Math.floor(lump * goldPct / 100);
  }
  const host = cityAtTile(state, here);
  // CIV6 (Indie): "-40 Loyalty in the city where the concert is performed."
  const drop = promoValueFor(unit, 'CONCERT_LOYALTY', 0);
  if (host && drop > 0) host.loyalty = Math.max(0, (host.loyalty ?? LOYALTY_MAX) - drop);
  // CIV6 (Religious Rock): "Converts the city to the Rock Band's Religion" —
  // the band's civ's own, and only once it has one; its pressure rises to
  // one past the strongest other, so the city follows it on either engine.
  if (host && promoFlag(unit, 'CONCERT_CONVERT') && band?.religion.founded) {
    const n = state.seats.length;
    let pres = host.religionPressure;
    if (!pres || pres.length !== n) {
      pres = new Array(n).fill(0);
      host.religionPressure = pres;
    }
    let top = 0;
    for (let g = 0; g < n; g++) if (g !== seat && pres[g] > top) top = pres[g];
    pres[seat] = Math.max(pres[seat], top + 1);
  }
  unit.bandAlbum = album + row.album;
  if (row.promote) {
    unit.bandLevel = Math.min(ROCK_BAND_MAX_LEVEL, level + 1);
    // CIV6 (RockBandResults ExtraPromotion): the two best tiers also grant a
    // promotion, up to ROCK_BAND_MAX_PROMOTIONS held or owed; a band still
    // holding an unspent offer banks the grant as a re-arm instead.
    const owed = promoCount(unit) + (promoReady(unit) ? 1 : 0) + (unit.promoBonus ?? 0);
    if (owed < ROCK_BAND_MAX_PROMOTIONS) {
      if (promoReady(unit)) unit.promoBonus = (unit.promoBonus ?? 0) + 1;
      else drawPromoOffer(state, unit);
    }
  }
  unit.movesLeft = 0;
  if (row.dies) disbandUnit(state, unit.id);
  return ok;
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
  chargeUnitResource(state, seat, unitType);
  const qi: QueueItem =
    unitType === 'BUILDER'
      ? { kind: 'unit', unit: unitType, progress: 0, cost: builderCost(state, seat) }
      : { kind: 'unit', unit: unitType, progress: 0 };
  qi.progress += takeItemBank(city, qi);
  city.queue.push(qi);
  return ok;
}

/** CIV6: the Pyramids give every Builder an extra build charge, Serfdom and
 *  Public Works give it two more, the Hagia Sophia gives every Missionary
 *  and Apostle an extra spread, and the Mausoleum gives the GREAT Engineer
 *  one more (the game's clause matches the Great Person class, so a Military
 *  Engineer gets nothing). All are paid at CREATION, so a unit that predates
 *  the wonder or the card keeps its own count. */
export function extraCharges(state: GameState, seat: number, unitType: string, at: Tile): number {
  // CIV6 (EFFECT_ADJUST_UNIT_BUILD_CHARGES): the roster's per-type rows (`UNIT_CHARGE_ROWS`)
  let rows = 0;
  for (const r of getModifiers(state, seat).unitCharges) if (r.unit === unitType) rows += r.amount;
  if (unitType === 'BUILDER') {
    return rows + seatWonderSum(state, seat, 'buildCharges') + getModifiers(state, seat).builderCharges
      + governorTileSum(state, at, (e) => e.builderCharges);
  }
  if (unitType === 'MISSIONARY' || unitType === 'APOSTLE') return rows + seatWonderSum(state, seat, 'spreadCharges');
  if (isGreatEngineer(unitType)) return rows + seatWonderSum(state, seat, 'engineerCharges');
  return rows;
}

/** CIV6 (Mausoleum): "Great Engineers have an additional charge" — the one
 *  chassis the clause reaches. */
export function isGreatEngineer(unitType: string): boolean {
  return unitType === 'ENGINEER';
}

/** The highest formation TIER this seat may raise a chassis to right now —
 *  the civic gate `formUp` asks, without a host to merge with. CIV6
 *  (Isibongo): "if the proper Civics are unlocked". */
export function formationTierFor(state: GameState, seat: number, unitType: string): number {
  if (unitDomain(unitType) !== 'military' || formationBanned(unitType)) return 0;
  const naval = !!UNITS[unitType]?.naval;
  const rows = getModifiers(state, seat).formations;
  let best = 0;
  for (let tier = 1; tier <= FORMATION_MAX; tier++) {
    const row = rows.find((r) => r.tier === tier && r.naval === naval && r.civic !== undefined);
    const civic = row?.civic ?? FORMATION_CIVIC[tier];
    if (civic && !isCivicComplete(state, civic, seat)) break;
    best = tier;
  }
  return best;
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
  const spot = isAirUnit(unitType) || isSpy(unitType)
    ? near
    : [near, ...neighbors(state.map, near)]
      .sort((a, b) => hexDistance(near.col, near.row, a.col, a.row) - hexDistance(near.col, near.row, b.col, b.row))
      .find((t) => tileFreeForUnit(state, t.index, seat, probe));
  if (!spot) return null;
  const unit: Unit = {
    id: state.nextUnitId++,
    type: unitType,
    seat,
    tileIndex: spot.index,
    movesLeft: MP_SCALE * (def.moves + (def.raider ? getModifiers(state, seat).navalRaiderMoves : 0)
      + goldenMoveBonus(state, { type: unitType, seat })
      + startTileMoves(state, { type: unitType, seat, tileIndex: spot.index })),
    hp: UNIT_HP,
    charges: def.charges === undefined ? null : def.charges + extraCharges(state, seat, unitType, spot),
    // CIV6 (Flying Squadron): "All spies start as Agents with a free
    // promotion" — the level the unit is BORN at (`SPY_PROMO_ROWS`)
    spyLevel: isSpy(unitType) ? getModifiers(state, seat).spyPromos : undefined,
    path: null,
  };
  // The pool it was GRANTED, recorded at birth: every "spent no MP" gate
  // reads `movesFull`, and a unit created after seatPhase's reset would
  // otherwise carry none until the next turn — the GPU's `_spawn_unit` writes
  // `unit_mp_full` beside `unit_mp` for the same reason.
  unit.movesFull = unit.movesLeft;
  // FORTIFY: military units carry a fortify counter (civilians never do).
  if (def.charges === undefined) unit.fortifyTurns = 0;
  if (capsOf(seat).xp) unit.xp = 0;
  state.units.push(unit);
  revealAround(state, seat, unit.tileIndex, unitSight(unit));
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

/** CIV6 (Giant Death Robot): "Cannot form Corps or Armies by any means." */
export function formationBanned(type: string): boolean {
  return !!UNITS[type]?.gdr;
}

export function disbandUnit(state: GameState, unitId: number): void {
  state.units = state.units.filter((u) => u.id !== unitId);
}

export function settlerCount(state: GameState, seat: number): number {
  return state.units.reduce((n, u) => n + (u.seat === seat && u.type === 'SETTLER' ? 1 : 0), 0);
}

export function unitMaintenance(state: GameState, seat: number): number {
  const mods = getModifiers(state, seat);
  return state.units.reduce((s, u) => s + (u.seat === seat ? unitUpkeep(mods, u.type) : 0), 0);
}

/** CIV6 (Theological combat): "the HP gained per turn is equal to 3 times the
 *  Faith output of the Holy Site". */
export const RELIGIOUS_HEAL_PER_FAITH = 3;

/** The FAITH a Holy Site district itself produces: its adjacency plus the faith
 *  of the buildings standing in it. A pillaged or unfinished site produces
 *  nothing, which is the same gate `cityDistrictYields` applies. */
export function holySiteFaith(state: GameState, tile: Tile, ctx: YieldCtx): number {
  if (tile.district !== 'HOLY_SITE' || !tile.districtComplete || tile.districtPillaged) return 0;
  const city = cityAtTile(state, tile);
  if (!city) return 0;
  // the adjacency `cityDistrictYields` pays — the unique building's rule included
  let faith = effectiveAdjacency(ctx, tile, 'HOLY_SITE', buildingVariantAdjacency(ctx.mods.civ, city, 'HOLY_SITE'));
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    if (def?.district === 'HOLY_SITE') faith += def.yields?.faith ?? 0;
  }
  return faith;
}

/**
 * CIV6 (Theological combat): "Injured religious units do not Heal in the normal
 * way — that is, if they stay in one place, even inside your own territory,
 * they will not regain lost HP. Instead, they Heal only when standing on or
 * next to a Holy Site in their own territory. The parent city's religion is
 * irrelevant." Several sites in reach heal at the best of them, since "the
 * healing capability differs from one Holy Site to the next".
 */
export function religiousHeal(state: GameState, unit: Unit, ctx: YieldCtx): number {
  const here = state.map.tiles[unit.tileIndex];
  let best = 0;
  for (const t of [here, ...neighbors(state.map, here)]) {
    if (tileSeat(t) !== unit.seat) continue; // "in their own territory"
    best = Math.max(best, holySiteFaith(state, t, ctx));
  }
  // CIV6 (Monastery): "+15 HP healing every turn for friendly religious
  // units" — the improvement it stands on, and an unpillaged one.
  const mon = here.improvement && !here.pillaged
    ? IMPROVEMENTS[here.improvement as ImprovementId].religiousHeal ?? 0
    : 0;
  return RELIGIOUS_HEAL_PER_FAITH * best + (tileSeat(here) === unit.seat ? mon : 0);
}

/** CIV6 (Chaplain): the Apostle "operates as a Medic, providing extra healing
 *  to units within 1 tile", and the Medic page prices that at "+20 HP/turn"
 *  for a STATIONARY neighbour. Military units only, and the strongest
 *  neighbouring chaplain answers — two of them do not stack. */
function chaplainHeal(state: GameState, unit: Unit): number {
  if (unitDomain(unit.type) !== 'military') return 0;
  let best = 0;
  for (const t of neighbors(state.map, state.map.tiles[unit.tileIndex])) {
    for (const u of unitsAt(state, t.index)) {
      if (u.seat !== unit.seat) continue;
      best = Math.max(best, promoValue(u, 'CHAPLAIN'));
    }
  }
  return best;
}

export function refreshUnits(state: GameState): void {
  const ctxOf = new Map<number, YieldCtx>();
  const yctx = (seat: number): YieldCtx => {
    let c = ctxOf.get(seat);
    if (!c) { c = makeYieldCtx(state, seat); ctxOf.set(seat, c); }
    return c;
  };
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
    const grantedLast = grantedMoves(state, unit);
    // CIV6 (Resource, GS): "if you had acquired Iron to produce Swordsmen, but
    // have no continuous access to Iron Mines, those Swordsmen won't be able to
    // Heal." A minor or the barbarians keep no bank and are not held to it.
    const need = UNITS[unit.type]?.requiresResource;
    const starved = !!need && isCiv(unit.seat)
      && !civHasStrategic(state, unit.seat, need);
    // CIV6 (Twilight Valor): "Cannot heal outside your territory" — the
    // seat's OWN ground. CIV6 (Giant Death Robot): "Can only heal in friendly
    // territory", which is its own ground or an ally's. Two different bars, so
    // two predicates.
    const ownGround = tileSeat(tile) === unit.seat;
    const friendly = ownGround || seatsAllied(state, unit.seat, tileSeat(tile));
    const healBlocked = (getModifiers(state, unit.seat).healOnlyHome && !ownGround)
      || (!!UNITS[unit.type]?.healFriendlyOnly && !friendly);
    // CIV6 (Tactical Maintenance): "Can heal after attacking." The kind lives
    // on the bomber's list alone, and a sortie is the only thing that spends an
    // aircraft's turn, so a spent attack excuses the spent movement. The
    // fortify gate below keeps the plain reading — no aircraft digs in.
    const rested = unit.movesLeft >= grantedLast
      || (attacksLeftOf(unit) < attacksPerTurn(unit) && promoFlag(unit, 'HEAL_AFTER_ATTACK'));
    if (rested && !starved && !healBlocked) {
      const home = ownGround;
      const onCamp = seatOf(state, unit.seat)?.camps.includes(unit.tileIndex) ?? false;
      const religious = (UNITS[unit.type]?.religiousStrength ?? 0) > 0;
      const naval = !!UNITS[unit.type]?.naval;
      const table = religious ? religiousHeal(state, unit, yctx(unit.seat))
        : naval ? navalHeal(state, unit, home, tileSeat(tile) === NO_SEAT)
        : home && tile.district === 'CITY_CENTER' ? 20
        : home ? 15
        : onCamp ? 20
        : tileSeat(tile) === NO_SEAT ? 10
        : 5;
      // CIV6 (MILITARY_EMERGENCY_MEMBER_HEALING_REWARD, MEDIC_INCREASE_HEAL_RATE,
      // APOSTLE_CHAPLAIN): no domain clause — a hull heals by them too; (Abu
      // Al-Qasim Al-Zahrawi): attached to DOMAIN_LAND units alone.
      const heal = religious ? table
        : table
          + emergencyHeal(state, unit.seat, tileSeat(tile))
          + chaplainHeal(state, unit)
          + (naval ? 0 : gpPermOf(seatOf(state, unit.seat), 'healBonus'));
      // CIV6 (Laying On Of Hands): "All Governor's units heal fully in one
      // turn in tiles of this city."
      unit.hp = governorTileFlag(state, tile, (e) => e.fullHeal) && home
        ? UNIT_HP
        : Math.min(UNIT_HP, unit.hp + heal);
    }
    // FORTIFY: the EXACT heal gate (movesLeft >= full = spent
    // no MP since the last refresh). A military unit that stayed put digs in
    // (+1, cap 2); any move/attack (movesLeft < full) resets it. Symmetric
    // across owners; read movesLeft BEFORE the reset below.
    // NAVAL units never fortify (real Civ 6) — inert until N2 adds
    // ships. (Embarked land units are still military but march every turn, so
    // their fortify gate resets to 0 in practice.)
    if (unitDomain(unit.type) === 'military' && !naval) {
      const dug = unit.movesLeft >= grantedLast ? Math.min(2, (unit.fortifyTurns ?? 0) + 1) : 0;
      // CIV6 (Alhambra, Mont St. Michel): a unit occupying the wonder
      // "automatically gains 2 turns of fortification" — a floor, not a step.
      unit.fortifyTurns = wonderOccupyDefense(state, unit.tileIndex) > 0 ? FORTIFY_MAX_TURNS : dug;
    }
    // The Great General/Admiral aura grants +1 MP alongside its
    // +5 CS (real Civ 6). Record what was granted so NEXT turn's gates above
    // can tell "spent no MP" from "was simply given less".
    const granted = full + generalAuraMP(state, unit);
    unit.movesFull = granted;
    unit.movesLeft = granted;
    unit.attacksLeft = attacksPerTurn(unit);
    // CIV6: "Any units (except Giant Death Robots) that end their turn in a
    // contaminated tile take 50 damage each turn." Taken at the turn's own
    // refresh, AFTER whatever the tile healed — so a unit standing in fallout
    // loses ground every turn it stays.
    if (irradiated(tile) && !UNITS[unit.type]?.gdr) {
      unit.hp -= FALLOUT_DAMAGE;
      if (unit.hp <= 0) {
        state.eventLog.push(`${unit.type} was lost to radioactive fallout.`);
        disbandUnit(state, unit.id);
        continue;
      }
    }
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

/** CIV6: fallout "can be cleaned from affected tiles by Builders, Military
 *  Engineers, or any other unit that has at least 1 remaining build charge",
 *  and doing so "takes 1 build charge" — the same charge, spent the same way
 *  as an improvement's. */
export function canCleanFallout(state: GameState, unit: Unit): boolean {
  return irradiated(state.map.tiles[unit.tileIndex]) && (unit.charges ?? 0) > 0;
}

export function cleanFallout(state: GameState, unit: Unit): RuleResult {
  if (!canCleanFallout(state, unit)) return no('Nothing here to clean, or no charge left.');
  state.map.tiles[unit.tileIndex].falloutTurns = 0;
  spendCharge(state, unit);
  return { ok: true };
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
  const feature = tile.feature;
  const featureName = feature ? FEATURES[feature]?.name ?? feature : '';
  if (tile.improvement === 'LUMBER_MILL' && tile.feature === 'WOODS') tile.improvement = null;
  tile.feature = null;
  if (grant) {
    applyLumpYield(state, tile.index, grant, seat);
    state.eventLog.push(`Chopped ${featureName}: +${grant.amount} ${grant.key}.`);
    const gold = congressChopGold(state, feature, grant.amount);
    if (gold) applyLumpYield(state, tile.index, { key: 'gold', amount: gold }, seat);
  }
  spendCharge(state, unit!);
  return ok;
}

export function builderHarvest(state: GameState, unitId: number): RuleResult {
  const { unit, err } = builderOn(state, unitId);
  if (err) return err;
  const tile = state.map.tiles[unit!.tileIndex];
  if (!tile.resource) return no('No resource here.');
  // CIV6 (Mana): "Resources cannot be harvested" (`SEAT_BAN_ROWS`)
  if (getModifiers(state, unit!.seat).seatBans.has('harvest')) return no('This civilization cannot harvest resources.');
  // the ACTING unit's seat, both times: this body read and paid seat 0 for
  // as long as nothing called it (C-52)
  const grant = harvestGrant(state, tile, unit!.seat);
  if (!grant) {
    return no(
      tileSeat(tile) !== unit!.seat
        ? 'Harvesting only works inside your borders.'
        : 'This resource cannot be harvested (or needs research).',
    );
  }
  const resName = RESOURCES[tile.resource]?.name ?? tile.resource;
  tile.resource = null;
  applyLumpYield(state, tile.index, grant, unit!.seat);
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
