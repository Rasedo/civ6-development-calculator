/**
 * BOARDING'S MAGNITUDE.
 *
 * The AUDIT called it unpublished. It is not: BOARDING_GOLD_FROM_NAVAL_VICTORY
 * is MODIFIER_UNIT_ADJUST_POST_COMBAT_YIELD with PercentDefeatedStrength 100
 * and YieldType YIELD_GOLD, behind BOARDING_REQUIREMENTS — an opponent whose
 * domain is DOMAIN_SEA. So: gold worth the whole Combat Strength of a
 * defeated NAVAL unit, and nothing for a land one.
 *
 * A missing ROW, not a missing mechanic: the post-combat channel already
 * existed and already paid Gorgo and Tamar.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState } from '../helpers';
import { unitKillEvent } from '../../../cpu/core/eras';
import { PROMOTIONS, promoRows } from '../../../cpu/data/promotions';
import { seatOf } from '../../../cpu/core/seats';
import { UNITS } from '../../../cpu/data/units';

const BOARDING = PROMOTIONS.findIndex((p) => p.id === 'BOARDING');
// a unit's promo bits index its OWN CLASS list, not the global catalog
const BOARDING_BIT = 1 << promoRows('NAVAL_RAIDER').findIndex((p) => p.id === 'BOARDING');

describe('the Boarding row', () => {
  it('carries the install magnitude', () => {
    const d = PROMOTIONS[BOARDING]!;
    expect(d.cls).toBe('NAVAL_RAIDER');
    expect(d.tier).toBe(1);
    expect(d.effects).toEqual([{ kind: 'NAVAL_KILL_GOLD', v: 100, mask: 0 }]);
  });
});

describe('what a naval victory pays', () => {
  const kill = (victim: string, promoted: boolean): number => {
    const state = makeState(makeMap(12, 12));
    const s = seatOf(state, 0)!;
    s.treasury = 0;
    const killer = { type: 'PRIVATEER', promos: promoted ? BOARDING_BIT : 0 };
    unitKillEvent(state, 0, killer, { type: victim, seat: 1 });
    return s.treasury;
  };

  it('pays the whole strength of a defeated NAVAL unit', () => {
    const foe = 'GALLEY';
    expect(UNITS[foe]?.naval).toBe(true);
    expect(kill(foe, true)).toBe(UNITS[foe]!.combat);
    expect(kill(foe, false)).toBe(0);
  });

  it('pays nothing for a LAND victim, whoever killed it', () => {
    expect(UNITS.WARRIOR?.naval ?? false).toBe(false);
    expect(kill('WARRIOR', true)).toBe(0);
  });
});
