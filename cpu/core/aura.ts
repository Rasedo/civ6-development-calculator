/**
 * The Great General / Great Admiral aura predicate, in its
 * own module so BOTH consumers can share one definition without an import
 * cycle — `combat.ts` needs it for the +CS half and `units.ts` needs it for the
 * +MP half, and `combat.ts` already imports `units.ts`.
 *
 * Civ 6 grants nearby own units +5 Combat Strength AND +1 Movement: an own
 * LAND military unit, embarked or not, within GENERAL_AURA_RANGE of an own
 * live GENERAL, or an own hull within range of an own live ADMIRAL, where the
 * unit's era matches the person's (`auraCoversEra`). "Own" means same owner.
 * The GENERAL/ADMIRAL units are themselves combat-0 civilians and never
 * qualify on their own account.
 */

import { hexDistance } from '../../world/hex';
import { UNITS, UNIT_ERA_INDEX } from '../data/units';
import { MP_SCALE } from '../data/constants';
import { GREAT_PEOPLE } from '../data/greatPeople';
import { ERAS } from '../data/techs';
import type { GameState, Unit } from './types';

export const GENERAL_AURA_CS = 5;
export const GENERAL_AURA_RANGE = 2;
export const GENERAL_AURA_MP = 1 * MP_SCALE;
/** the last era a person's aura names (AOE_INFORMATION_REQUIREMENTS) */
export const GENERAL_AURA_LAST_ERA = ERAS.indexOf('Information');

/** whether a person of era `person` lays its aura on a unit of era `unit`
 *  (GreatPeople.xml's AOE_<era>_REQUIREMENTS, REQUIREMENTSET_TEST_ANY of
 *  REQUIREMENT_UNIT_ERA_TYPE_MATCHES on its own era and the next, the
 *  Information era's on its own alone; the unit's era is its type's,
 *  0x56de20 at 0xb2c600: the later of its PrereqTech's and PrereqCivic's
 *  eras, Ancient with neither — `UNIT_ERA_INDEX`) */
export function auraCoversEra(person: number, unit: number): boolean {
  return unit === person || (person < GENERAL_AURA_LAST_ERA && unit === person + 1);
}

export function inGeneralAura(state: GameState, unit: Unit, tileIndex: number): boolean {
  if ((UNITS[unit.type]?.combat ?? 0) <= 0) return false; // civilians are never affected
  // the person of the unit type's own domain, embarked or not
  // (AOE_REQUIRES_SEA_DOMAIN / AOE_REQUIRES_LAND_DOMAIN,
  // REQUIREMENT_UNIT_DOMAIN_MATCHES: runs/h1_duels1138 t205, player 1's
  // embarked Line Infantry 4325400 on 31:10 under its Great General fights
  // at +5 both ways; h1_duels1141 t206, player 1's embarked Infantry 5767188
  // beside its Great Admiral holds 7 Movement)
  const auraType = UNITS[unit.type]?.naval ? 'ADMIRAL' : 'GENERAL';
  const era = UNIT_ERA_INDEX[unit.type] ?? 0;
  const tile = state.map.tiles[tileIndex];
  for (const g of state.units) {
    if (g.type !== auraType || g.seat !== unit.seat) continue;
    // the person's birth modifiers (GREATPERSON_*_AOE_<era>_LAND / _SEA) are
    // its era's
    const person = GREAT_PEOPLE[auraType][g.gpAt ?? -1];
    if (!person || !auraCoversEra(person.era, era)) continue;
    const gt = state.map.tiles[g.tileIndex];
    if (hexDistance(state.map, tile.col, tile.row, gt.col, gt.row) <= GENERAL_AURA_RANGE) return true;
  }
  return false;
}

export function generalAuraMP(state: GameState, unit: Unit): number {
  return inGeneralAura(state, unit, unit.tileIndex) ? GENERAL_AURA_MP : 0;
}
