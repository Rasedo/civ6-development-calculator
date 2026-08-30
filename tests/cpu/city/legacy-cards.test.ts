import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applyPolicyEffects, computeAdoption, defaultModifiers, governmentBit, getModifiers } from '../../../cpu/core/effects';
import { GOVERNMENTS, POLICIES, POLICY_LIST } from '../../../cpu/data/policies';
import { endTurn } from '../../../cpu/core/game';
import type { GameState } from '../../../cpu/core/types';

// CIV6 (Legacy policy card): every government but the Chiefdom has one, it
// carries that government's OWN inherent bonus, it is a Wildcard, it is
// "unlocked by" the government, and it "cannot be slotted while in" it.

const WIDE = { military: 0, economic: 0, diplomatic: 0, wildcard: 40 } as const;

function world(): GameState {
  const state = makeState(makeMap(16, 12));
  settleAt(state, tileAtCoords(state.map, 8, 6).index, 0);
  return state;
}

/** The cards this seat slots with a bench wide enough that table order
 *  cannot starve the one under test. */
function slotted(state: GameState, seat = 0): string[] {
  const s = seatOf(state, seat)!;
  return computeAdoption(s.research, { ...WIDE }, -1, false, s.government.held)
    .policies.filter((p): p is string => p !== null);
}

describe('the legacy card roster', () => {
  it('is one Wildcard per government, carrying that government own bonus', () => {
    for (const g of Object.values(GOVERNMENTS)) {
      const card = POLICIES[`LEGACY_${g.id}`];
      if (g.tier === 0) {
        expect(card, 'the Chiefdom has no legacy bonus').toBeUndefined();
        continue;
      }
      expect(card, `${g.id} has no legacy card`).toBeTruthy();
      expect(card.kind).toBe('wildcard');
      expect(card.legacyOf).toBe(g.id);
      expect(card.effects).toEqual(g.effects);
    }
  });

  it('and no legacy card is unlocked by a civic', () => {
    const legacy = POLICY_LIST.filter((p) => p.legacyOf !== undefined);
    expect(legacy.length).toBe(Object.values(GOVERNMENTS).filter((g) => g.tier > 0).length);
    for (const p of legacy) expect(p.obsoleteCivic).toBeUndefined();
  });
});

describe('what unlocks one', () => {
  it('nothing, until the seat has been in that government', () => {
    const state = world();
    grantCivics(state, 'CODE_OF_LAWS', 'STATE_WORKFORCE', 'EARLY_EMPIRE', 'POLITICAL_PHILOSOPHY');
    expect(computeAdoption(seatOf(state, 0)!.research).government).toBe('AUTOCRACY');
    // the seat has not RECORDED it yet — no turn has passed
    expect(seatOf(state, 0)!.government.held).toBe(0);
    expect(slotted(state)).not.toContain('LEGACY_AUTOCRACY');
  });

  it('...the seat records the government it is in, and still cannot slot its card', () => {
    const state = world();
    grantCivics(state, 'CODE_OF_LAWS', 'STATE_WORKFORCE', 'EARLY_EMPIRE', 'POLITICAL_PHILOSOPHY');
    endTurn(state);
    expect(seatOf(state, 0)!.government.held & governmentBit('AUTOCRACY')).toBeGreaterThan(0);
    // CIV6: "cannot be slotted while in" that government
    expect(slotted(state)).not.toContain('LEGACY_AUTOCRACY');
  });

  it('...and the card arrives the moment the seat moves ON', () => {
    const state = world();
    grantCivics(state, 'CODE_OF_LAWS', 'STATE_WORKFORCE', 'EARLY_EMPIRE', 'POLITICAL_PHILOSOPHY');
    endTurn(state);
    grantCivics(state, 'MYSTICISM', 'THEOLOGY', 'DEFENSIVE_TACTICS', 'CIVIL_SERVICE', 'DIVINE_RIGHT');
    endTurn(state);
    const s = seatOf(state, 0)!;
    expect(computeAdoption(s.research).government).toBe('MONARCHY');
    expect(s.government.held & governmentBit('AUTOCRACY')).toBeGreaterThan(0);
    expect(s.government.held & governmentBit('MONARCHY')).toBeGreaterThan(0);
    const cards = slotted(state);
    expect(cards).toContain('LEGACY_AUTOCRACY');
    expect(cards).not.toContain('LEGACY_MONARCHY'); // still in it
  });
});

describe('what the greedy fill does with one', () => {
  // Which card fills a slot is a player decision both engines stand in for,
  // and the stand-in takes the first fit in table order. A legacy card is
  // appended LAST, so an ordinary overflow card reaches every Wildcard first
  // — the same shape that starves the Dark Age pool. Widen the bench and the
  // card slots, which is what makes this REACHABILITY and not a rule.
  function bench(state: GameState, wildcards: number): string[] {
    const s = seatOf(state, 0)!;
    return computeAdoption(s.research,
      { military: 0, economic: 0, diplomatic: 0, wildcard: wildcards },
      -1, false, s.government.held)
      .policies.filter((p): p is string => p !== null);
  }

  it('takes it only once no ordinary card is left to take the slot', () => {
    const state = world();
    grantCivics(state, 'CODE_OF_LAWS', 'STATE_WORKFORCE', 'EARLY_EMPIRE', 'POLITICAL_PHILOSOPHY');
    endTurn(state);
    grantCivics(state, 'MYSTICISM', 'THEOLOGY', 'DEFENSIVE_TACTICS', 'CIVIL_SERVICE', 'DIVINE_RIGHT');
    endTurn(state);
    expect(bench(state, 0)).not.toContain('LEGACY_AUTOCRACY');
    expect(bench(state, 40)).toContain('LEGACY_AUTOCRACY');
  });

  it('and what it pays is exactly its government own bonus', () => {
    const state = world();
    grantCivics(state, 'CODE_OF_LAWS', 'STATE_WORKFORCE', 'EARLY_EMPIRE', 'POLITICAL_PHILOSOPHY');
    endTurn(state);
    grantCivics(state, 'MYSTICISM', 'THEOLOGY', 'DEFENSIVE_TACTICS', 'CIVIL_SERVICE', 'DIVINE_RIGHT');
    endTurn(state);
    const mods = defaultModifiers();
    applyPolicyEffects(mods, POLICIES.LEGACY_AUTOCRACY.effects);
    expect(mods.yieldsPerGovBuilding).toBe(GOVERNMENTS.AUTOCRACY.effects.yieldsPerGovBuilding);
    // ...and the seat that is STILL in Autocracy would double it, which is
    // why the card cannot be slotted there
    const state2 = world();
    grantCivics(state2, 'CODE_OF_LAWS', 'STATE_WORKFORCE', 'EARLY_EMPIRE', 'POLITICAL_PHILOSOPHY');
    endTurn(state2);
    expect(bench(state2, 40)).not.toContain('LEGACY_AUTOCRACY');
    expect(getModifiers(state2, 0).yieldsPerGovBuilding)
      .toBe(GOVERNMENTS.AUTOCRACY.effects.yieldsPerGovBuilding);
  });
});
