/** The diplomacy tables' row shapes (ai/major/diplomacyTables.ts). */

/** one Requirements row of a requirement set */
export interface DiploRequirement {
  id: string;
  /** the RequirementType */
  type: string;
  inverse: boolean;
  args: Readonly<Record<string, string>>;
}

export interface DiploRequirementSet {
  /** REQUIREMENTSET_TEST_ANY; else every requirement must hold */
  any: boolean;
  reqs: readonly DiploRequirement[];
}

/** one diplomatic modifier: its ModifierType without the
 *  MODIFIER_PLAYER_DIPLOMACY_ prefix, its owner and subject requirement sets
 *  (keys of DIPLO_REQUIREMENT_SETS) and its arguments */
export interface DiploModifierRow {
  id: string;
  type: string;
  owner: string | null;
  subject: string | null;
  args: Readonly<Record<string, string>>;
}
