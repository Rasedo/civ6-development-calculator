/**
 * THE CITY VALUE (AI/Value_Manager: 0x79fef0 over the city's worth 0x7a0ac0;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the war operations").
 *
 * What a known city of another player is worth taking to a seat: its worth
 * (citizens, the city itself, a capital, wonders, Production, Science and
 * Culture, the seat's Loyalty pressure there, its great works and its
 * resources), less its defenses against the seat's best combat strength,
 * less the same of the owner's cities between it and the seat's nearest
 * city, the whole quartered where the owner's army outclasses the seat's,
 * less the defenders about it; never below 0. The war candidates value their
 * targets so ("CITY VALUES" in AI_Operation_Eval.csv).
 */
import { FX, fdiv, fmul, fxConst, pseudoYieldValue, yieldValue } from '../aiValue';
import { LOYALTY_PRESS_MAX_LOYALTY } from '../../data/seats';
import type { AiKnownCityView, AiView } from '../aiViewTypes';
import { armyStrength, type ArmyUnit } from './evaluate';

/** the turns of the 25 the march term scales by (0x5254d0(0x19): x the game
 *  speed's CostMultiplier / 100) */
const MARCH_TURNS = 25;

/** the knowledge base's war record's +0xc term toward the owner: every
 *  AI_Knowledge.csv WAR line of the verbose recordings logs it 0.00 */
const WAR_RECORD_TERM = 0;

/** a city's defense from the knowledge base's districts (0x5eb2c0): with
 *  `all`, per district its walls' strength (the strongest district's, + 10)
 *  where its walls stand, else its defense; without, the strongest of each
 *  district's defense - 10 and its walls */
export function cityDefense(k: AiKnownCityView, all: boolean): number {
  let top = 0;
  for (const d of k.districts) top = Math.max(top, d.defense - 10, d.walls);
  if (!all) return top;
  let sum = 0;
  for (const d of k.districts) sum += d.walls > 0 ? top + 10 : d.defense;
  return sum;
}

/** the hex distance of two plots' offset coordinates read as axial ones, z =
 *  -(x + y): the least sum of two of the three differences (0x79fef0's
 *  inlined distance) */
function axialDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  const dz = Math.abs(ax + ay - (bx + by));
  return Math.min(dx + dy, dx + dz, dy + dz);
}

/** 0x7a0ac0: the city's worth to the seat */
export function cityWorth(view: AiView, seat: number, k: AiKnownCityView): number {
  const py = (amount: number, pseudo: string) => pseudoYieldValue(view, seat, amount, pseudo);
  let w = py(Math.trunc(k.population / 5) * FX, 'PSEUDOYIELD_CITY_POPULATION');
  w += py(FX, 'PSEUDOYIELD_CITY_BASE');
  if (k.originalCapital) w += py(FX, 'PSEUDOYIELD_CITY_ORIGINAL_CAPITAL');
  else if (k.capital) w += py(fxConst(0.5), 'PSEUDOYIELD_CITY_ORIGINAL_CAPITAL');
  w += py(k.wonders * 40 * FX, 'PSEUDOYIELD_WONDER');
  w += yieldValue(view, seat, k.yields[1] * 7 * FX, 'YIELD_PRODUCTION');
  w += yieldValue(view, seat, k.yields[3] * 7 * FX, 'YIELD_SCIENCE');
  w += yieldValue(view, seat, k.yields[4] * 7 * FX, 'YIELD_CULTURE');
  // the seat's Loyalty pressure there, whole: at or below
  // -LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_MAX_LOYALTY the worth is
  // 0; else 10 a point of it, up to 5, and below -5 another 10 a point for
  // each step of 5 back up to -5
  let lead = Math.round(view.pressureLead(seat, k.plot) * FX) >> 8;
  if (lead <= -LOYALTY_PRESS_MAX_LOYALTY) return 0;
  w += Math.min(lead, 5) * 10 * FX;
  for (; lead < -5; lead += 5) w += Math.min(lead, 5) * 10 * FX;
  return w;
}

/** 0x79fef0: the value of the known city to the seat (24.8), 0 where the
 *  knowledge base lacks it */
export function cityValue(view: AiView, seat: number, k: AiKnownCityView, cities: readonly AiKnownCityView[],
  army: (player: number) => readonly ArmyUnit[]): number {
  const plots = view.plots();
  const owner = k.owner;
  let v = cityWorth(view, seat, k);
  const ours = view.militaryUnits(seat, 'DOMAIN_LAND');
  const theirs = view.militaryUnits(owner, 'DOMAIN_LAND');
  const best = view.bestCombatStrength(seat);
  const theirBest = view.bestCombatStrength(owner);
  // the seat's nearest city, the first of equals
  let near = -1;
  let nearD = 0;
  for (const c of view.cityPlots(seat)) {
    const d = view.plotDistance(c, k.plot);
    if (nearD === 0 || d < nearD) {
      nearD = d;
      near = c;
    }
  }
  const defense = cityDefense(k, true);
  // the defenders: the owner's known units within 3 whose strength is within
  // 30 of the seat's best, and its known districts' strikes there
  let around = armyStrength(view, army(owner), k.plot, 3, best - 30);
  for (const x of cities) {
    if (x.owner !== owner) continue;
    for (const d of x.districts) if (d.strike > 0 && view.plotDistance(d.plot, k.plot) <= 3) around += d.strike;
  }
  let defenders = (around + theirBest) * FX;
  if (theirs > 2 * (around + theirBest)) {
    const march = fdiv(nearD * 2 * FX, Math.trunc((MARCH_TURNS * view.costMultiplierPct) / 100) * FX);
    defenders += fmul(march >= FX ? FX : march, theirs * FX);
  }
  if (best > 0) {
    const vsBest = (x: number) => pseudoYieldValue(view, seat, fdiv(x * FX, best * FX), 'PSEUDOYIELD_CITY_DEFENSES');
    if (defense >= best) v -= vsBest(defense);
    if (near >= 0) {
      const { x: kx, y: ky } = plots[k.plot];
      const { x: nx, y: ny } = plots[near];
      const reach = axialDistance(nx, ny, kx, ky);
      for (const x of cities) {
        if (x.owner !== owner || x.id === k.id) continue;
        if (view.plotDistance(x.plot, k.plot) > reach) continue;
        const { x: xx, y: xy } = plots[x.plot];
        const dot = (kx - nx) * (kx - xx) + (ky - ny) * (ky - xy) + (nx + ny - (kx + ky)) * (xx + xy - (kx + ky));
        if (dot <= 0) continue;
        const cut = fmul(vsBest(cityDefense(x, false)), 2 * FX);
        v -= cut;
        if (axialDistance(xx, xy, kx, ky) <= 5) v -= cut;
      }
    }
    if (best < theirBest + 30) {
      if (best < theirBest - 15 || theirs > 3 * ours) v = fmul(v, fxConst(0.25));
      v -= pseudoYieldValue(view, seat, fdiv(defenders, best * FX), 'PSEUDOYIELD_CITY_DEFENDING_UNITS');
    }
  }
  v += WAR_RECORD_TERM;
  return Math.max(0, v);
}
