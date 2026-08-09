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
import type { GameState } from './types';
import { UNITS } from '../data/units';
import { walkPath, builderImprove, builderRepair, builderRemoveFeature, seatPillage } from './units';
import { meleeAttack, rangedAttack } from './combat';
import { foundCity } from './game';
import { neighborTile } from '../../world/hex';
import { unitActionIndex } from './unitActions';

export function applyUnitOrders(
  state: GameState,
  triples: [number, number, number][],
  rangedActive: boolean,
  impIds: string[],
  seat: number,
  onFail?: (msg: string) => void,
): boolean {
  const A = unitActionIndex(impIds);
  const RES_START = 18;
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
    if (a >= RES_START) {
      const rid = impIds[a - RES_START + 3];
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
    if (a >= 13) {
      builderImprove(state, unit.id, a === 13 ? 'FARM' : a === 14 ? 'MINE' : 'LUMBER_MILL');
      continue;
    }
    const dir = a % 6;
    const n = neighborTile(state.map, state.map.tiles[unit.tileIndex], dir);
    if (!n) continue;
    if (a < 6) {
      // forced one-step path — NOT orderMove (A* side effects differ)
      unit.path = [n.index];
      walkPath(state, unit);
    } else if (a < 12) {
      if (rangedActive && UNITS[unit.type]?.ranged) rangedAttack(state, unit.id, n.index, seat);
      else meleeAttack(state, unit.id, n.index, seat);
    }
  }
  return true;
}
