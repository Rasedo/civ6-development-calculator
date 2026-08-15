/**
 * THE SHARED UNIT-ORDER VERB BODIES.
 *
 * Two verbs whose rule is the same for every seat and is reached from more
 * than one surface: the SNIPE ring's column-to-tile map, and the religious
 * SPREAD lump. `applySeatUnitOrders` in `phase.ts` is the ONE applier that
 * calls them — there is no second schema and no second replay position since
 * #108 retired seat 0's triples record.
 */
import type { GameState, Seat, Tile, Unit } from './types';
import { disbandUnit } from './units';
import { neighbors } from '../../world/hex';
import { allCities } from './seats';
import { ENHANCER_BELIEFS, SPREAD_PRESSURE } from '../data/religion';

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
  // One pressure column per MAJOR — the roster's own length. It was written
  // `seats.length - 1 + 1` (rivals, then seat 0 added back), which is the
  // rivals arithmetic saying the same thing in a way nobody can check.
  const nRel = state.seats.length;
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
