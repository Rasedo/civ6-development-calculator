import type { GameState, Seat, Tile, Unit } from './types';
import { disbandUnit } from './units';
import { neighbors } from '../../world/hex';
import { allCities } from './seats';
import { ENHANCER_BELIEFS, SPREAD_PRESSURE } from '../data/religion';
import { promoFirstUse, promoValue } from './promotions';

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
  // CIV6 (Translator): "Religious spread is triple strength in cities of other
  // civilizations" — and the page's note extends it to city-states.
  const foreign = tcity.seat !== actor.seat ? Math.max(1, promoValue(unit, 'TRANSLATOR')) : 1;
  const lump = Math.round(SPREAD_PRESSURE * (eb?.spreadPressureMult ?? 1)) * foreign;
  let pres = tcity.religionPressure;
  if (!pres || pres.length !== nRel) {
    pres = new Array(nRel).fill(0);
    tcity.religionPressure = pres;
  }
  const wasFollowed = argmaxPressure(pres);
  pres[actor.seat] += lump;
  // CIV6 (Proselytizer): "Religious spread eliminates 75% of existing pressure
  // from other Religions in the target city."
  const strip = promoValue(unit, 'PROSELYTIZER');
  if (strip > 0) {
    for (let g = 0; g < pres.length; g++) {
      if (g !== actor.seat) pres[g] = Math.floor(pres[g] * (100 - strip) / 100);
    }
  }
  // CIV6 (Indulgence Vendor): "Gain 100 Gold if this unit converts a city to
  // your Religion for the first time." The majority is `spreadReligiousPressure`'s
  // own argmax, read here at the moment the lump lands.
  if (argmaxPressure(pres) === actor.seat && wasFollowed !== actor.seat) {
    const gold = promoFirstUse(unit, 'INDULGENCE');
    if (gold > 0) actor.treasury = (actor.treasury ?? 0) + gold;
  }
  unit.movesLeft = 0;
  unit.charges = (unit.charges ?? 1) - 1;
  if (unit.charges <= 0) disbandUnit(state, unit.id);
}

/** the religion a pressure row follows — `spreadReligiousPressure`'s own
 *  strict-greater scan, so the two never disagree about a tie. */
function argmaxPressure(pres: number[]): number {
  let best = -1;
  let bestP = 0;
  for (let g = 0; g < pres.length; g++) {
    if (pres[g] > bestP) {
      bestP = pres[g];
      best = g;
    }
  }
  return best;
}
