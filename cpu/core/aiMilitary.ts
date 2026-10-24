/**
 * THE MILITARY AI'S COMBAT DESIRE (GameCore_XP2 AI/Military.cpp, the turn
 * 0x71fb80; `tools/civ6lab/dll_readings.md` "C-96: the knowledge base's army
 * records and the Combat Desire"): the weight its PSEUDOYIELD_UNIT_COMBAT carries (+0x790's vector
 * +0x7e8), logged as AI_Military.csv's Combat Desire beside the three
 * strengths it is drawn from.
 *
 *  - The yardstick B: the player's strongest melee unit trained (PlayerUnits
 *    +0xf0) or its city strike (+0x150, at least COMBAT_MINIMUM_CITY_STRIKE_
 *    STRENGTH), at least 1.
 *  - Each player's strength: over the military AI's regions (+0x2f0, its
 *    cities' Map_Region ids), the knowledge base's records of that player's
 *    units last seen in the region within two turns (0x5eb430 given no area
 *    and the region, 0x3beb0's Map_Region: the record's +0x1c, its plot's
 *    region +0x18; age <= 2), each
 *    unit's max(Combat, RangedCombat) where it exceeds B - 20.
 *  - Regional: its own, with each city's unit in training (the head of its
 *    queue) of such strength; Enemy: the strongest of the players at war
 *    with it (0x469cd0), each not a tribe raising the floor M by 0.5; Other: the
 *    strongest of the rest, each the player flags (+0xc58) raising M by
 *    0.25. M starts at -0.5.
 *  - The desire W: below the enemy, (Enemy - Regional) x 0.05; below a
 *    target of B per city, (target - Regional) / B whole units; 20 past the
 *    enemy, toward the others: (Other - Regional - 60) x 0.025 up to 2.0
 *    where the others pass Regional + 60, else (Enemy - max(Other - 60,
 *    Regional)) x 0.025 up to 3.0; else 0. Then W below -M is 0, else at
 *    least M; at peace with no threatened city at most 2.0; plus the cities'
 *    standing-army counts (CityBuildAI +0x2d8) as PSEUDOYIELD_STANDING_ARMY_
 *    VALUE.
 */
import type { ArmyRecord } from './types';
import { FX, fxConst } from './aiValue';

/** what the desire reads of its player */
export interface MilitaryFacts {
  /** B: max(1, best melee trained, max(best city strike, 3)) */
  best: number;
  cities: number;
  /** the military AI's regions (+0x2f0, Map_Region ids) */
  regions: ReadonlySet<number>;
  self: number;
  /** the players in the game's order: at war with the player (0x469cd0 or
   *  the +0xd18 flag), a tribe (the barbarians, 0x469ce0), flagged (+0xc58) */
  players: readonly { seat: number; atWar: boolean; tribe: boolean; flagged: boolean }[];
  /** the knowledge base's army records, each its plot's region */
  records: readonly ArmyRecord[];
  regionOf(plot: number): number;
  /** max(Combat, RangedCombat) of an install unit type */
  strength(type: string): number;
  turn: number;
  /** each city's unit at the head of its build queue (0x179860 over city
   *  +0x2170), as install types */
  queuedUnits: readonly string[];
  /** the military AI's war footing (+0x4b8) */
  warFooting: boolean;
  /** any city's CityBuildAI +0x1b8 at or above 0 */
  threatened: boolean;
  /** PSEUDOYIELD_STANDING_ARMY_VALUE of the cities' standing-army counts
   *  (0x7a60d0 of their sum), raw */
  standingArmy: number;
}

export interface CombatDesire {
  regional: number;
  enemy: number;
  other: number;
  /** the weight, raw 24.8 */
  desire: number;
}

/** float32 x as the DLL turns it into 24.8: the floor's integer part, the
 *  fraction's 256ths truncated */
function fxFloat(x: number): number {
  const f = Math.fround(x);
  const fl = Math.floor(f);
  return fl * FX + Math.trunc(Math.fround(Math.fround(f - fl) * 256));
}

const F005 = Math.fround(0.05);
const F0025 = Math.fround(0.025);
const RECORD_AGE = 2;

/** 0x71fb80's strengths and desire */
export function combatDesire(f: MilitaryFacts): CombatDesire {
  const per = new Map<number, number>();
  for (const r of f.records) {
    if (f.turn - r.seen > RECORD_AGE || !f.regions.has(f.regionOf(r.plot))) continue;
    const s = f.strength(r.type);
    if (s + 20 <= f.best) continue;
    per.set(r.owner, (per.get(r.owner) ?? 0) + s);
  }
  let floor = fxConst(-0.5);
  let regional = 0;
  let enemy = 0;
  let other = 0;
  for (const p of f.players) {
    const s = per.get(p.seat) ?? 0;
    if (p.atWar) {
      if (!p.tribe) floor += fxConst(0.5);
      enemy = Math.max(enemy, s);
    } else if (p.seat === f.self) {
      regional = s;
      for (const q of f.queuedUnits) {
        const qs = f.strength(q);
        if (qs + 20 > f.best) regional += qs;
      }
    } else {
      if (p.flagged) floor += fxConst(0.25);
      other = Math.max(other, s);
    }
  }
  const target = f.cities * f.best;
  let w = 0;
  if (regional < enemy) w = fxFloat((enemy - regional) * F005);
  else if (regional < target) w = Math.trunc((target - regional) / f.best) * FX;
  else if (regional - 20 > enemy) {
    const [x, cap] = regional + 60 < other ? [other - regional - 60, 2.0] : [enemy - Math.max(other - 60, regional), 3.0];
    const v = Math.fround(x * F0025);
    w = fxFloat(cap <= v ? cap : v);
  }
  if (w < -floor) w = 0;
  else w = Math.max(w, floor);
  if (!f.warFooting && !f.threatened) w = Math.min(w, 2 * FX);
  return { regional, enemy, other, desire: w + f.standingArmy };
}
