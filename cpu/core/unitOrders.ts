/**
 * APPLYING A SEAT'S RECORDED UNIT ORDERS.
 *
 * Orders are [tile, actionCol, isCivilian] triples in logged order; the unit
 * is identified by (start-of-turn) tile + domain, never a slot index — a unit
 * that spawns and dies in one turn would desync indices.
 *
 * Every arm soft-fails exactly where the GPU's re-validation no-ops, so a
 * rejected order matches on both engines and real divergences surface in the
 * state compare. Consumer: the decision-server client in `cpu/driver`.
 */
import type { GameState, Seat, Tile, Unit } from './types';
import { UNITS } from '../data/units';
import { walkPath, builderImprove, builderRepair, builderRemoveFeature, seatPillage, disbandUnit } from './units';
import { meleeAttack, rangedAttack, hostileRangedStrike } from './combat';
import { foundCity } from './game';
import { neighborTile, neighbors } from '../../world/hex';
import { allCities, seatOf } from './seats';
import { ENHANCER_BELIEFS, SPREAD_PRESSURE } from '../data/religion';
import { unitActionIndex, improvementOfColumn } from './unitActions';

/**
 * The SNIPE ring: the distance-2 tiles around `here`, ascending by TILE
 * INDEX. The shared #92 column layout — column order IS index order, so
 * both engines enumerate identically, and every seat reads the same ring.
 */
export function snipeRing(state: GameState, here: Tile): number[] {
  const nb1 = neighbors(state.map, here).filter((t): t is Tile => !!t);
  const d1 = new Set(nb1.map((t) => t.index));
  return [...new Set(nb1.flatMap((t) => neighbors(state.map, t)).filter((t): t is Tile => !!t).map((t) => t.index))]
    .filter((i) => i !== here.index && !d1.has(i))
    .sort((x, y) => x - y);
}

/**
 * SPREAD: lump a missionary/apostle's pressure into the city standing on
 * `toTile` for its OWN seat's religion, spend a charge, disband at 0. ONE
 * body for every seat — the walker's own, at the replay surface.
 */
export function spreadFromUnit(state: GameState, unit: Unit, actor: Seat, toTile: Tile): void {
  if (unit.type !== 'MISSIONARY' && unit.type !== 'APOSTLE') return;
  if ((unit.charges ?? 0) <= 0 || !actor.religion.founded) return;
  const tcity = allCities(state).find((c) => c.centerIndex === toTile.index);
  if (!tcity) return;
  const nRel = state.seats.length - 1 + 1;
  const eb = actor.religion.enhancer ? ENHANCER_BELIEFS[actor.religion.enhancer]?.effects : undefined;
  const lump = Math.round(SPREAD_PRESSURE * (eb?.spreadPressureMult ?? 1));
  let pres = tcity.religionPressure;
  if (!pres || pres.length !== nRel) {
    pres = new Array(nRel).fill(0);
    tcity.religionPressure = pres;
  }
  pres[actor.seat] += lump;
  unit.movesLeft = 0;
  unit.charges = (unit.charges ?? 1) - 1;
  if (unit.charges <= 0) disbandUnit(state, unit.id);
}

export function applyUnitOrders(
  state: GameState,
  triples: [number, number, number][],
  impIds: string[],
  seat: number,
  onFail?: (msg: string) => void,
): boolean {
  const A = unitActionIndex(impIds);
  for (const [tile, a, civ] of triples) {
    const unit = state.units.find(
      (un) =>
        un.seat === seat &&
        un.tileIndex === tile &&
        (UNITS[un.type]?.charges !== undefined) === (civ === 1),
    );
    if (!unit) {
      onFail?.(`turn ${state.turn}: no unit at tile ${tile} (civ ${civ})`);
      return false;
    }
    if (a === A.FOUND_CITY) {
      // FOUND where the settler stands (#71). foundCity re-validates
      // legality and consumes the unit; a refusal soft-fails.
      if (unit.type === 'SETTLER') foundCity(state, unit.tileIndex, seat);
      continue;
    }
    if (a === A.PILLAGE) {
      seatPillage(state, unit.id, unit.seat);
      continue;
    }
    if (a >= A.SNIPE_0 && a < A.SNIPE_0 + 12) {
      // SNIPE — the ring-2 tile at this column, the autonomous strike (a
      // ranged unit only; the ring is shared with every other seat).
      const rt = snipeRing(state, state.map.tiles[unit.tileIndex])[a - A.SNIPE_0];
      if (rt !== undefined && UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, rt);
      continue;
    }
    if (a >= A.SPREAD_HERE && a <= A.SPREAD_5) {
      // SPREAD — HERE is the column at SPREAD_HERE; the six directions follow.
      const here = state.map.tiles[unit.tileIndex];
      const to38 = a === A.SPREAD_HERE ? here : neighbors(state.map, here)[a - A.SPREAD_0];
      const actor = seatOf(state, seat);
      if (to38 && actor) spreadFromUnit(state, unit, actor, to38);
      continue;
    }
    const impIdx = improvementOfColumn(a, impIds.length);
    if (impIdx >= 0) {
      const rid = impIds[impIdx];
      if (rid) builderImprove(state, unit.id, rid as Parameters<typeof builderImprove>[2]);
      continue;
    }
    if (a === A.REPAIR) {
      builderRepair(state, unit.id);
      continue;
    }
    if (a === A.CHOP) {
      builderRemoveFeature(state, unit.id, seat);
      continue;
    }
    if (a >= 12) continue;  // HOLD, and any column no verb above claimed
    const dir = a % 6;
    const n = neighborTile(state.map, state.map.tiles[unit.tileIndex], dir);
    if (!n) continue;
    if (a < 6) {
      // forced one-step path — NOT orderMove (A* side effects differ)
      unit.path = [n.index];
      walkPath(state, unit);
    } else if (a < 12) {
      // Dispatch by unit TYPE alone, exactly as the GPU applier does: a
      // ranged unit resolves `rangedAttack`, everything else melees.
      if (UNITS[unit.type]?.ranged) rangedAttack(state, unit.id, n.index, seat);
      else meleeAttack(state, unit.id, n.index, seat);
    }
  }
  return true;
}
