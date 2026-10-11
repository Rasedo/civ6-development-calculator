/**
 * THE MILITARY AI'S UNIT PRODUCTION TABLE (GameCore_XP2 AI/UnitProduction.cpp
 * 0x7989e0; `tools/civ6lab/dll_readings.md` "C-96 / C-97: the unit value").
 * Once a turn, before its cities' analyses, the player's military AI values
 * each unit it may build against the units its knowledge base has seen:
 *
 *  - its entries, in the Units' database order: each unit that is the
 *    player's own version of itself, and, where the unit is obsolete to the
 *    player (its ObsoleteTech / ObsoleteCivic or their Mandatory columns
 *    held, 0x538460), only while the player still holds one;
 *  - the opposition: per unit type of Combat above 0 that is not obsolete to
 *    the player and whose PseudoYieldType is none or a combat one, the count
 *    the knowledge base holds of it over every player (0x5eb650) — N in all;
 *  - per entry the sum of each such count times the efficiency of the entry
 *    against that type (`AI_UNIT_EFFICIENCY`, row the opposing type);
 *  - the entry's value N over that sum (1.0 for every entry where N is 0),
 *    x1.25 for a civilization's unique unit (TraitType).
 *
 * The city build AI's unit value reads it (0x79ca90: 0 for a unit the table
 * lacks) and 0x79d2d0 (the entry's obsolete flag).
 */
import { AI_UNITS, AI_UNIT_EFFICIENCY } from '../data/aiBuildTables';
import { FX, fdiv, fmul, fxConst } from './aiValue';

/** what the table reads of its player */
export interface UnitProductionFacts {
  /** the unit is the player's own version of itself (player +0x12e8 +0x1c0) */
  isVersion(unit: string): boolean;
  /** the unit is obsolete to the player (0x538460) */
  obsolete(unit: string): boolean;
  /** the player's units of the type (0x4f2c90) */
  owned(unit: string): number;
  /** the knowledge base's count of the unit type over every player (the
   *  per-player counts 0x5eb650 reads, AI_Knowledge.csv's ARMY lines) */
  known(unit: string): number;
}

export interface UnitProductionEntry {
  value: number;
  obsolete: boolean;
}

const COMBAT_PSEUDO = new Set(['PSEUDOYIELD_UNIT_COMBAT', 'PSEUDOYIELD_UNIT_NAVAL_COMBAT', 'PSEUDOYIELD_UNIT_AIR_COMBAT']);
const UNIQUE = fxConst(1.25);

/** 0x7989e0: the table, by unit type */
export function unitProductionTable(f: UnitProductionFacts): Map<string, UnitProductionEntry> {
  const entries: number[] = [];
  AI_UNITS.forEach((u, k) => {
    if (!f.isVersion(u.type)) return;
    if (f.obsolete(u.type) && f.owned(u.type) <= 0) return;
    entries.push(k);
  });
  const sums = new Map<number, number>(entries.map((k) => [k, 0]));
  let total = 0;
  AI_UNITS.forEach((u, i) => {
    if (u.combat === 0 || f.obsolete(u.type)) return;
    if (u.pseudo && !COMBAT_PSEUDO.has(u.pseudo)) return;
    const n = f.known(u.type);
    if (n <= 0) return;
    total += n;
    for (const k of entries) sums.set(k, sums.get(k)! + AI_UNIT_EFFICIENCY[i][k] * n);
  });
  const out = new Map<string, UnitProductionEntry>();
  for (const k of entries) {
    const u = AI_UNITS[k];
    let v = total === 0 ? FX : sums.get(k)! > 0 ? fdiv(total * FX, sums.get(k)!) : 0;
    if (u.trait) v = fmul(v, UNIQUE);
    out.set(u.type, { value: v, obsolete: f.obsolete(u.type) });
  }
  return out;
}
