import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { endTurn } from '../../../cpu/core/game';
import { getModifiers, governmentBit, governmentSlots, governmentsOpen, seatGovernment } from '../../../cpu/core/effects';
import { GOVERNMENT_LIST, POLICY_LIST } from '../../../cpu/data/policies';
import type { GameState, SeatActionRecord } from '../../../cpu/core/types';

/**
 * THE GOVERNMENT CHOICE.
 *
 * A seat's government is a DRIVER decision on the wire: the record's
 * `government` names a roster position, `adoptGovernment` validates it
 * against `governmentsOpen` (unlocked by the civics, never a government the
 * seat has been in before — CIV6: a return is Anarchy, which no seat enters)
 * and stores it in `government.chosen`, where it stands until another record
 * names one. A seat no record has chosen for is in the newest government its
 * civics unlock (`seatGovernment`). A change marks the new government held
 * and carries the slotted cards that still fit.
 *
 * The GPU twin is tests/gpu/government_choice_test.py.
 */
const GOV = (id: string) => GOVERNMENT_LIST.findIndex((g) => g.id === id);
const POL = (id: string) => POLICY_LIST.findIndex((p) => p.id === id);
const REC = (government?: number, policies?: number[]): SeatActionRecord =>
  ({ production: [], tech: null, civic: null, units: [], government, policies });

function scene(...civics: string[]): GameState {
  const state = makeState(makeMap(12, 12, 'GRASSLAND'));
  settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  grantCivics(state, ...civics);
  return state;
}

function adopt(state: GameState, rec: SeatActionRecord): void {
  applySeatActionRecord(state, seatOf(state, 0)!, rec);
}

describe('the government choice', () => {
  it('the record reaches the tier-mates the newest-tier default never adopts', () => {
    for (const id of ['OLIGARCHY', 'CLASSICAL_REPUBLIC', 'AUTOCRACY']) {
      const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
      expect(seatGovernment(state, 0)).toBe('AUTOCRACY');
      adopt(state, REC(GOV(id)));
      const s = seatOf(state, 0)!;
      expect(seatGovernment(state, 0)).toBe(id);
      expect(s.government.chosen).toBe(id);
      // a CHANGE marks the government held; naming the one the seat is in
      // already changes nothing (the seat phase marks that one)
      expect(s.government.held & governmentBit(id)).toBe(id === 'AUTOCRACY' ? 0 : governmentBit(id));
      expect(governmentSlots(state, 0)).toEqual([...GOVERNMENT_LIST[GOV(id)].slots]);
    }
  });

  it('pays the chosen government’s bonus', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    expect(getModifiers(state, 0).gppMult).toBe(1);
    adopt(state, REC(GOV('CLASSICAL_REPUBLIC')));
    expect(getModifiers(state, 0).gppMult).toBeCloseTo(1.15, 10);
  });

  it('refuses a government the civics have not unlocked', () => {
    const state = scene('CODE_OF_LAWS');
    adopt(state, REC(GOV('MONARCHY')));
    expect(seatGovernment(state, 0)).toBe('CHIEFDOM');
    expect(seatOf(state, 0)!.government.chosen).toBeNull();
    expect(governmentsOpen(state, 0)).toEqual([GOV('CHIEFDOM')]);
    grantCivics(state, 'DIVINE_RIGHT');
    adopt(state, REC(GOV('MONARCHY')));
    expect(seatGovernment(state, 0)).toBe('MONARCHY');
  });

  it('refuses a return to a government the seat has been in', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    adopt(state, REC(GOV('OLIGARCHY')));
    adopt(state, REC(GOV('AUTOCRACY')));
    expect(seatGovernment(state, 0)).toBe('AUTOCRACY');
    const open = governmentsOpen(state, 0);
    expect(open).not.toContain(GOV('OLIGARCHY'));
    expect(open).toContain(GOV('AUTOCRACY'));
    expect(open).toContain(GOV('CLASSICAL_REPUBLIC'));
    adopt(state, REC(GOV('OLIGARCHY')));
    expect(seatGovernment(state, 0)).toBe('AUTOCRACY');
  });

  it('the choice stands until a record names another', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    adopt(state, REC(GOV('OLIGARCHY')));
    grantCivics(state, 'DIVINE_RIGHT');
    expect(seatGovernment(state, 0)).toBe('OLIGARCHY');
    adopt(state, REC());
    expect(seatGovernment(state, 0)).toBe('OLIGARCHY');
    adopt(state, REC(GOV('MONARCHY')));
    expect(seatGovernment(state, 0)).toBe('MONARCHY');
  });

  it('a change keeps the slotted cards that still fit, and lands before the record’s cards', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY', 'DIVINE_RIGHT');
    const s = seatOf(state, 0)!;
    adopt(state, REC(GOV('CHIEFDOM'), [POL('URBAN_PLANNING')]));
    expect(s.government.policies.filter((p) => p !== null)).toEqual(['URBAN_PLANNING']);
    adopt(state, REC(GOV('MONARCHY')));
    expect(s.government.policies.filter((p) => p === 'URBAN_PLANNING').length).toBe(1);
    expect(s.government.policies.length).toBe(governmentSlots(state, 0).length);
  });

  it('the seat phase applies the record at its turn', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    state.seatActions = { [state.turn - 1]: { 0: REC(GOV('CLASSICAL_REPUBLIC')) } };
    endTurn(state);
    expect(seatGovernment(state, 0)).toBe('CLASSICAL_REPUBLIC');
  });
});
