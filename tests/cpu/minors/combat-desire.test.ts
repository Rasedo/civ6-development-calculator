// The military AI's Combat Desire (cpu/core/aiMilitary.ts) on stub records:
// the enemy's lead, the target per city, the others' lead past 60 capped at
// 2.0, the floor's half per non-tribe war and quarter per flagged player, the
// peacetime cap; tests/gpu/city_value_test.py pins the same numbers.
import { describe, expect, it } from 'vitest';
import { combatDesire, type MilitaryFacts } from '../../../cpu/core/aiMilitary';
import { minorKnownUnits } from '../../../cpu/core/minorBuild';
import type { CityState } from '../../../cpu/core/types';

const STRENGTH: Record<string, number> = { WARRIOR: 20, SLINGER: 15, ARCHER: 25, SWORDSMAN: 35, KNIGHT: 50 };

/** minor 100 with its two Warriors; `recs` [owner, type] seen this turn in its area */
function facts(recs: [number, string][], over: Partial<MilitaryFacts> = {}): MilitaryFacts {
  return {
    best: 20, cities: 1, areas: new Set([1]), self: 100,
    players: [
      { seat: 0, atWar: false, tribe: false, flagged: false },
      { seat: 100, atWar: false, tribe: false, flagged: false },
      { seat: 63, atWar: true, tribe: true, flagged: false },
    ],
    records: ([[100, 'WARRIOR'], [100, 'WARRIOR'], ...recs] as [number, string][]).map(([owner, type], i) => ({ id: i, owner, type, seen: 10, plot: 5, damage: 0 })),
    areaOf: () => 1, strength: (t) => STRENGTH[t] ?? 0, turn: 10, queuedUnits: [], warFooting: false, threatened: false, standingArmy: 0,
    ...over,
  };
}

describe('the Combat Desire (0x71fb80)', () => {
  it('below a barbarian enemy: (enemy - regional) x 0.05', () => {
    expect(combatDesire(facts([[63, 'SWORDSMAN'], [63, 'SLINGER']]))).toEqual({ regional: 40, enemy: 50, other: 0, desire: 128 });
    expect(combatDesire(facts([[63, 'SLINGER']]))).toEqual({ regional: 40, enemy: 15, other: 0, desire: 0 });
  });

  it('past the enemy by 20: the others\' lead over 60, at most 2.0; a flagged player raises the floor a quarter', () => {
    const players = [
      { seat: 0, atWar: false, tribe: false, flagged: true },
      { seat: 100, atWar: false, tribe: false, flagged: false },
      { seat: 63, atWar: true, tribe: true, flagged: false },
    ];
    const recs: [number, string][] = [[0, 'KNIGHT'], [0, 'KNIGHT'], [0, 'KNIGHT'], [0, 'SWORDSMAN']];
    expect(combatDesire(facts(recs, { players }))).toEqual({ regional: 40, enemy: 0, other: 185, desire: 512 });
    expect(combatDesire(facts([[0, 'ARCHER']]))).toEqual({ regional: 40, enemy: 0, other: 25, desire: 0 });
  });

  it('at war with a major: the floor at 0, no peacetime cap, the standing army added', () => {
    const players = [
      { seat: 0, atWar: true, tribe: false, flagged: false },
      { seat: 100, atWar: false, tribe: false, flagged: false },
      { seat: 63, atWar: true, tribe: true, flagged: false },
    ];
    const recs: [number, string][] = [[0, 'KNIGHT'], [0, 'KNIGHT'], [0, 'KNIGHT'], [0, 'SWORDSMAN']];
    expect(combatDesire(facts(recs, { players, warFooting: true, standingArmy: 100 }))).toEqual({ regional: 40, enemy: 185, other: 0, desire: 1956 });
    expect(combatDesire(facts(recs, { players, queuedUnits: ['ARCHER', 'SLINGER'] }))).toEqual({ regional: 80, enemy: 185, other: 0, desire: 512 });
  });
});

describe("the knowledge base's unit counts (0x5eb650)", () => {
  it('counts the army records by install type', () => {
    const cs = { armyKnown: [
      { id: 3, owner: 0, type: 'WARRIOR', seen: 1, plot: 1 }, { id: 4, owner: 63, type: 'WARRIOR', seen: 1, plot: 2 },
      { id: 9, owner: 0, type: 'SLINGER', seen: 1, plot: 3 },
    ] } as unknown as CityState;
    const known = minorKnownUnits(cs);
    expect([known('UNIT_WARRIOR'), known('UNIT_SLINGER'), known('UNIT_ARCHER')]).toEqual([2, 1, 0]);
  });
});
