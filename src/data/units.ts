/**
 * Unit types (stage 11a ships the civilian economy; the military roster,
 * combat stats and barbarians arrive with stage 11b). Costs eyeballed
 * base Civ 6.
 */

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
  description: string;
}

const U = (def: UnitDef) => def;

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  [
    U({
      id: 'BUILDER',
      name: 'Builder',
      code: 'B',
      cost: 54,
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
      combat: 35,
      requiresTech: 'HORSEBACK_RIDING',
      description: 'Fast shock cavalry (resource requirement not modeled).',
    }),
  ].map((u) => [u.id, u]),
);

export const UNIT_HP = 100;
export const CITY_MAX_HP = 200;
