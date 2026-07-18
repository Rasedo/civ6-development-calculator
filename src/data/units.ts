/**
 * Unit types (stage 11a ships the civilian economy; the military roster,
 * combat stats and barbarians arrive with stage 11b). Costs eyeballed
 * base Civ 6.
 */

import { GAME_SPEED } from './constants';

export interface UnitDef {
  id: string;
  name: string;
  /** Letter drawn on the map badge. */
  code: string;
  cost: number;
  /** Gold upkeep per turn (empire-level). */
  maintenance: number;
  moves: number;
  /** Melee combat strength (0 = civilian). */
  combat: number;
  /** Ranged attack strength + range (attacks without retaliation). */
  ranged?: { strength: number; range: number };
  /** Builder charges (improvements/chops); undefined for non-builders. */
  charges?: number;
  requiresTech?: string;
  /** #45/B-6: a NAVAL unit lives on water natively (never `embarked`). No naval
   * units exist yet (N2 adds GALLEY/QUADRIREME) — the field is plumbed now so
   * passability/spawn/combat can branch on it. Default false. */
  naval?: boolean;
  description: string;
}

const U = (def: UnitDef): UnitDef => ({ ...def, cost: Math.round(def.cost * GAME_SPEED) });

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  [
    U({
      id: 'BUILDER',
      name: 'Builder',
      code: 'B',
      cost: 50, // P4/D-10: real Civ 6 base (the +4-per-builder escalation stays unmodeled - AUDIT)
      maintenance: 0,
      moves: 2,
      combat: 0,
      charges: 3,
      description: 'Builds improvements, removes features and repairs pillaging (3 charges).',
    }),
    U({
      id: 'SCOUT',
      name: 'Scout',
      code: 'S',
      cost: 30,
      maintenance: 0,
      moves: 3,
      combat: 10,
      description: 'Fast, fragile explorer.',
    }),
    U({
      id: 'WARRIOR',
      name: 'Warrior',
      code: 'W',
      cost: 40,
      maintenance: 0,
      moves: 2,
      combat: 20,
      description: 'Basic melee defender.',
    }),
    U({
      id: 'SLINGER',
      name: 'Slinger',
      code: 'G',
      cost: 35,
      maintenance: 0,
      moves: 2,
      combat: 5,
      ranged: { strength: 15, range: 1 },
      description: 'Early ranged unit (no retaliation taken).',
    }),
    U({
      id: 'ARCHER',
      name: 'Archer',
      code: 'A',
      cost: 60,
      maintenance: 1,
      moves: 2,
      combat: 15,
      ranged: { strength: 25, range: 2 },
      requiresTech: 'ARCHERY',
      description: 'Ranged attacker, range 2.',
    }),
    U({
      id: 'SPEARMAN',
      name: 'Spearman',
      code: 'P',
      cost: 65,
      maintenance: 1,
      moves: 2,
      combat: 25,
      requiresTech: 'BRONZE_WORKING',
      description: 'Solid melee line unit.',
    }),
    U({
      id: 'HORSEMAN',
      name: 'Horseman',
      code: 'H',
      cost: 80,
      maintenance: 2,
      moves: 4,
      combat: 36, // P4/D-9: real Civ 6 Horseman
      requiresTech: 'HORSEBACK_RIDING',
      description: 'Fast shock cavalry (resource requirement not modeled).',
    }),
    U({
      id: 'GALLEY',
      name: 'Galley',
      code: 'Y',
      cost: 65,
      maintenance: 1,
      moves: 3,
      combat: 30,
      requiresTech: 'SAILING',
      naval: true,
      description: 'Classical naval melee unit — captures coastal cities from the sea.',
    }),
    U({
      id: 'QUADRIREME',
      name: 'Quadrireme',
      code: 'Q',
      cost: 120,
      maintenance: 2,
      moves: 3,
      combat: 20,
      ranged: { strength: 25, range: 1 },
      requiresTech: 'SHIPBUILDING',
      naval: true,
      description: 'Classical naval ranged unit — bombards from adjacent water.',
    }),
  ].map((u) => [u.id, u]),
);

export const UNIT_HP = 100;
export const CITY_MAX_HP = 200;
/** AUDIT A-20: flat per-turn city heal when unbesieged, war or not (real
 * Civ 6) — the rate `barbarianPhase` applies to player cities (combat.ts)
 * and `rivalPhase` to rival cities; the GPU reads it as the exported
 * `cityHealPerTurn` rules field. */
export const CITY_HEAL_PER_TURN = 20;
/** AUDIT B-1: the ANCIENT_WALLS outer-defense pool — full HP a walled city
 * gets on top of its normal HP. Damage depletes it first (combat.ts); it
 * heals with the city (CITY_HEAL_PER_TURN, unbesieged). The GPU reads it as
 * the exported `wallsHp` rules field. */
export const WALLS_HP = 100;
