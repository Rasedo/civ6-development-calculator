// The military AI's unit choice for a team (0x79bd30 / 0x79cba0) over the
// unit production entries.
import { describe, expect, it } from 'vitest';
import { chooseUnit, choiceOrder, keepUnit } from '../../../cpu/core/operations/unitChoice';
import type { UnitProductionRow } from '../../../cpu/core/aiUnitProduction';

const row = (unit: string, over: Partial<UnitProductionRow> = {}): UnitProductionRow => ({
  unit, value: 256, obsolete: false, buildable: true, atWar: 0, all: 0, perPlayer: new Map(), strength: 20, maintenance: null, ...over,
});

describe('the unit choice (0x79bd30)', () => {
  it('walks the buildable entries first, then the at-war and the all-player sums, then the strength', () => {
    const order = choiceOrder([row('UNIT_WARRIOR'), row('UNIT_SPEARMAN', { buildable: false }), row('UNIT_WARRIOR_MONK', { strength: 40 })], -1);
    expect(order.map((r) => r.unit)).toEqual(['UNIT_WARRIOR_MONK', 'UNIT_WARRIOR', 'UNIT_SPEARMAN']);
    expect(choiceOrder([row('UNIT_WARRIOR', { all: 10 }), row('UNIT_WARRIOR_MONK', { strength: 40 })], -1)[0].unit).toBe('UNIT_WARRIOR');
  });
  it('takes the first of a needed AI type that no full type bars, never an obsolete or unbuildable one', () => {
    const rows = [row('UNIT_WARRIOR_MONK', { strength: 40 }), row('UNIT_WARRIOR'), row('UNIT_SCOUT', { strength: 10 })];
    expect(chooseUnit(rows, ['UNITTYPE_MELEE'], [], -1)).toBe('UNIT_WARRIOR_MONK');
    expect(chooseUnit(rows, ['UNITAI_EXPLORE'], ['UNITTYPE_MELEE'], -1)).toBe('UNIT_SCOUT');
    expect(chooseUnit([row('UNIT_WARRIOR', { obsolete: true })], ['UNITTYPE_MELEE'], [], -1)).toBeNull();
  });
  it('keeps a unit the choice may still take (0x79cba0)', () => {
    const rows = [row('UNIT_WARRIOR')];
    expect(keepUnit(rows, 'UNIT_WARRIOR', ['UNITTYPE_MELEE'], [])).toBe(true);
    expect(keepUnit(rows, 'UNIT_WARRIOR', ['UNITTYPE_MELEE'], ['UNITAI_COMBAT'])).toBe(false);
  });
});
