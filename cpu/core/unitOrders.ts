import type { GameState, Seat, Tile, Unit } from './types';
import { disbandUnit } from './units';
import { neighbors } from '../../world/hex';
import { allCities } from './seats';
import { ENHANCER_BELIEFS, SPREAD_PRESSURE } from '../data/religion';

export function snipeRing(state: GameState, here: Tile): number[] {
  const nb1 = neighbors(state.map, here).filter((t): t is Tile => !!t);
  const d1 = new Set(nb1.map((t) => t.index));
  return [...new Set(nb1.flatMap((t) => neighbors(state.map, t)).filter((t): t is Tile => !!t).map((t) => t.index))]
    .filter((i) => i !== here.index && !d1.has(i))
    .sort((x, y) => x - y);
}

export function spreadFromUnit(state: GameState, unit: Unit, actor: Seat, toTile: Tile): void {
  if (unit.type !== 'MISSIONARY' && unit.type !== 'APOSTLE') return;
  if ((unit.charges ?? 0) <= 0 || !actor.religion.founded) return;
  const tcity = allCities(state).find((c) => c.centerIndex === toTile.index);
  if (!tcity) return;
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
