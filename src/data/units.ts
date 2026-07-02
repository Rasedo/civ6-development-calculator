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
  /** Builder charges (improvements/chops); undefined for non-builders. */
  charges?: number;
  requiresTech?: string;
  description: string;
}

export const UNITS: Record<string, UnitDef> = {
  BUILDER: {
    id: 'BUILDER',
    name: 'Builder',
    code: 'B',
    cost: 54,
    maintenance: 0,
    moves: 2,
    charges: 3,
    description: 'Builds improvements and removes features (3 charges).',
  },
};
