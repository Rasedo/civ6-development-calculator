/**
 * SEAT-0 RECORD APPLICATION — the ONE text, two consumers (#51).
 *
 * This is replay-gpu.ts's proven player unit-order arm, extracted VERBATIM
 * so the serve fork cannot paraphrase it (the 9018 t63 lesson: a paraphrase
 * of a verified pair is a new unverified implementation). Consumers:
 * scripts/replay-gpu.ts (the rollout gate's replayer) and
 * scripts/export-gpu.ts's CIV6_SERVE fork (the decision-server client).
 *
 * Orders are [tile, actionCol, isCivilian] triples in logged order; the
 * unit is identified by (start-of-turn) tile + domain — never a slot
 * index (a unit that spawns and dies in one turn would desync indices).
 * Every arm soft-fails exactly where the GPU's re-validation no-ops, so a
 * rejected order matches; real divergences surface in the trace compare.
 */
import type { GameState } from './types';
import { isPlayerSeat } from './seats';
import { UNITS } from '../data/units';
import { walkPath, builderImprove, builderRepair, builderRemoveFeature, playerPillage } from './units';
import { meleeAttack, rangedAttack } from './combat';
import { neighborTile } from './hex';
import { unitActionIndex } from './unitActions';

export function applySeatZeroUnits(
  state: GameState,
  triples: [number, number, number][],
  rangedActive: boolean,
  impIds: string[],
  onFail?: (msg: string) => void,
): boolean {
  const A = unitActionIndex(impIds);
  const RES_START = 18;
  for (const [tile, a, civ] of triples) {
    const unit = state.units.find(
      (un) =>
        isPlayerSeat(un.seat) &&
        un.tileIndex === tile &&
        (UNITS[un.type]?.charges !== undefined) === (civ === 1),
    );
    if (!unit) {
      onFail?.(`turn ${state.turn}: no player unit at tile ${tile} (civ ${civ})`);
      return false;
    }
    if (a === A.PILLAGE) {
      playerPillage(state, unit.id);
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
      builderRemoveFeature(state, unit.id);
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
      if (rangedActive && UNITS[unit.type]?.ranged) rangedAttack(state, unit.id, n.index);
      else meleeAttack(state, unit.id, n.index);
    }
  }
  return true;
}
