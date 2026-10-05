import type { GameState, Seat, Tile, Unit } from './types';
import { disbandUnit } from './units';
import { neighbors } from '../../world/hex';
import { allCities } from './seats';
import { ENHANCER_BELIEFS, SPREAD_STRENGTH_PCT, followedReligionOf, unconvertedOf } from '../data/religion';
import { UNITS } from '../data/units';
import { promoFirstUse, promoValue } from './promotions';

export function snipeRing(state: GameState, here: Tile): number[] {
  const nb1 = neighbors(state.map, here).filter((t): t is Tile => !!t);
  const d1 = new Set(nb1.map((t) => t.index));
  return [...new Set(nb1.flatMap((t) => neighbors(state.map, t)).filter((t): t is Tile => !!t).map((t) => t.index))]
    .filter((i) => i !== here.index && !d1.has(i))
    .sort((x, y) => x - y);
}

/** the distance-3 ring, ordered by TILE INDEX ascending — `snipeRing`'s
 *  contract one hex out, so SNIPE3 columns scan it in the same order on both
 *  engines. */
export function snipeRing3(state: GameState, here: Tile): number[] {
  const nb1 = neighbors(state.map, here).filter((t): t is Tile => !!t);
  const d1 = new Set(nb1.map((t) => t.index));
  const r2 = snipeRing(state, here);
  const d2 = new Set(r2);
  return [...new Set(r2.flatMap((i) => neighbors(state.map, state.map.tiles[i])).filter((t): t is Tile => !!t).map((t) => t.index))]
    .filter((i) => i !== here.index && !d1.has(i) && !d2.has(i))
    .sort((x, y) => x - y);
}

export function spreadFromUnit(state: GameState, unit: Unit, actor: Seat, toTile: Tile): void {
  if (unit.type !== 'MISSIONARY' && unit.type !== 'APOSTLE') return;
  if ((unit.charges ?? 0) <= 0 || !actor.religion.founded) return;
  const tcity = allCities(state).find((c) => c.centerIndex === toTile.index);
  const tcs = tcity ? undefined : state.cityStates.find((c) => c.centerIndex === toTile.index);
  const target = tcity ?? tcs;
  if (!target) return;
  const nRel = state.seats.length;
  const eb = actor.religion.enhancer ? ENHANCER_BELIEFS[actor.religion.enhancer]?.effects : undefined;
  // CIV6 (Translator): "Religious spread is triple strength in cities of other
  // civilizations" — and the page's note extends it to city-states.
  const foreign = target.seat !== actor.seat ? Math.max(1, promoValue(unit, 'TRANSLATOR')) : 1;
  // CIV6 (Spread Religion): "Pressure = 2.2 * Apostle's current HP" — the
  // unit's ReligiousStrength at SPREAD_STRENGTH_PCT, scaled by its health.
  const full = Math.round((SPREAD_STRENGTH_PCT * (UNITS[unit.type].religiousStrength ?? 0) / 100) * (eb?.spreadPressureMult ?? 1));
  const lump = Math.floor(full * unit.hp / 100) * foreign;
  let pres = target.religionPressure;
  if (!pres || pres.length !== nRel) {
    pres = new Array(nRel).fill(0);
    target.religionPressure = pres;
  }
  const wasFollowed = followedReligionOf(pres, target.population, unconvertedOf(target));
  pres[actor.seat] += lump;
  // CIV6 (Units.ReligionEvictPercent): the spread takes the unit's percent
  // off every other religion's pressure (runs/h1_duelw1103 Lugdunum t124: a
  // Missionary's 10, 1,000 -> 900), PROSELYTIZER raising it to its own.
  const strip = Math.max(UNITS[unit.type].evictPct ?? 0, promoValue(unit, 'PROSELYTIZER'));
  if (strip > 0) {
    for (let g = 0; g < pres.length; g++) {
      if (g !== actor.seat) pres[g] = Math.floor(pres[g] * (100 - strip) / 100);
    }
  }
  // CIV6 (Indulgence Vendor): "Gain 100 Gold if this unit converts a city to
  // your Religion for the first time." The majority is `spreadReligiousPressure`'s
  // own rule, read here at the moment the lump lands.
  if (followedReligionOf(pres, target.population, unconvertedOf(target)) === actor.seat && wasFollowed !== actor.seat) {
    const gold = promoFirstUse(unit, 'INDULGENCE');
    if (gold > 0) actor.treasury = (actor.treasury ?? 0) + gold;
  }
  unit.movesLeft = 0;
  unit.charges = (unit.charges ?? 1) - 1;
  if (unit.charges <= 0) disbandUnit(state, unit.id);
}

