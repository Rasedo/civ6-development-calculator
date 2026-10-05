import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { seatOf } from '../../../cpu/core/seats';
import { applySeatPolicies } from '../../../cpu/core/phase';
import { endTurn } from '../../../cpu/core/game';
import { getModifiers, governmentBit, governmentSlots, governmentsOpen, inAnarchy, seatGovernment } from '../../../cpu/core/effects';
import { GOVERNMENT_LIST, POLICY_LIST } from '../../../cpu/data/policies';
import { ANARCHY_TURNS } from '../../../cpu/data/constants';
import type { GameState, SeatActionRecord } from '../../../cpu/core/types';

/**
 * THE GOVERNMENT CHOICE.
 *
 * A seat's government is a DRIVER decision on the wire: the record's
 * `government` names a roster position, `adoptGovernment` validates it
 * against `governmentsOpen` (unlocked by the civics; nothing in Anarchy) and
 * stores it in `government.chosen`, where it stands until another record
 * names one. A seat no record has chosen for is in the newest government its
 * civics unlock (`seatGovernment`). A change marks the new government held
 * and rebuilds the slots, laying the old cards back lapsed; a return to one held before
 * leaves the seat in no government for `ANARCHY_TURNS` turns
 * (runs/bds3_anarchy_20260926T102305Z.jsonl).
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
  applySeatPolicies(state, seatOf(state, 0)!, rec);
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

  it('a return to a government the seat has been in costs Anarchy; a new one none', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    const s = seatOf(state, 0)!;
    adopt(state, REC(GOV('CLASSICAL_REPUBLIC')));
    adopt(state, REC(GOV('OLIGARCHY')));
    expect(seatGovernment(state, 0)).toBe('OLIGARCHY');
    expect(inAnarchy(state, 0)).toBe(false);
    const open = governmentsOpen(state, 0);
    expect(open).toContain(GOV('CLASSICAL_REPUBLIC'));
    expect(open).toContain(GOV('OLIGARCHY'));
    // the return: no government this turn and the next, the chosen one after
    const t0 = state.turn;
    adopt(state, REC(GOV('CLASSICAL_REPUBLIC')));
    expect(s.government.chosen).toBe('CLASSICAL_REPUBLIC');
    expect(s.government.anarchyEnd).toBe(t0 + ANARCHY_TURNS);
    expect(ANARCHY_TURNS).toBe(2);
    expect(inAnarchy(state, 0)).toBe(true);
    expect(seatGovernment(state, 0)).toBeNull();
    expect(governmentSlots(state, 0)).toEqual([]);
    expect(getModifiers(state, 0).gppMult).toBe(1);
    // nothing is open in Anarchy
    expect(governmentsOpen(state, 0)).toEqual([]);
    adopt(state, REC(GOV('AUTOCRACY')));
    expect(s.government.chosen).toBe('CLASSICAL_REPUBLIC');
    state.turn = t0 + 1;
    expect(seatGovernment(state, 0)).toBeNull();
    state.turn = t0 + ANARCHY_TURNS;
    expect(seatGovernment(state, 0)).toBe('CLASSICAL_REPUBLIC');
    expect(getModifiers(state, 0).gppMult).toBeCloseTo(1.15, 10);
    expect(governmentSlots(state, 0)).toEqual([...GOVERNMENT_LIST[GOV('CLASSICAL_REPUBLIC')].slots]);
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

  it('a change lays the slotted cards back, lapsed, and lands before the record’s cards', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY', 'DIVINE_RIGHT');
    const s = seatOf(state, 0)!;
    adopt(state, REC(GOV('CHIEFDOM'), [POL('URBAN_PLANNING')]));
    expect(s.government.policies.filter((p) => p !== null)).toEqual(['URBAN_PLANNING']);
    expect(s.government.lapsed).toEqual([]);
    adopt(state, REC(GOV('MONARCHY')));
    expect(s.government.policies.filter((p) => p === 'URBAN_PLANNING').length).toBe(1);
    expect(s.government.policies.length).toBe(governmentSlots(state, 0).length);
    expect(s.government.lapsed).toEqual(['URBAN_PLANNING']);
  });

  // dll_readings "C-94: the slot rebuild": the old cards sorted by their
  // unlocking civic's Cost (Cultural Heritage 977, Mobilization 770,
  // Urbanization 605, Colonialism 400, the Enlightenment 360, Civil Service
  // 150), each new slot taking the first of its own slot kind while more than
  // one slot stands empty
  it('a change rebuilds the slots by civic Cost and slot kind, every card laid back lapsed', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY', 'DIVINE_RIGHT', 'REFORMED_CHURCH', 'URBANIZATION',
      'MOBILIZATION', 'CULTURAL_HERITAGE', 'COLONIALISM', 'CIVIL_SERVICE', 'ENLIGHTENMENT');
    const s = seatOf(state, 0)!;
    const cards = ['FORCE_MODERNIZATION', 'LEVEE_EN_MASSE', 'HERITAGE_TOURISM', 'RAJ', 'CIVIL_PRESTIGE', 'LIBERALISM'];
    adopt(state, REC(GOV('MONARCHY'), cards.map(POL)));
    expect(s.government.policies.filter((p) => p !== null).sort()).toEqual([...cards].sort());
    expect(getModifiers(state, 0).unitMaintenanceCut).toBe(2);
    // Monarchy [M M E D W W] holds, in table order, Levée and Force
    // Modernization, Liberalism, Raj, then Civil Prestige and Heritage
    // Tourism in the wildcards; Theocracy [M M E E D W] lays back Levée, Force
    // Modernization, Liberalism, nothing in the second Economic slot, Raj, and
    // in the last wildcard Heritage Tourism, the costlier wildcard card
    adopt(state, REC(GOV('THEOCRACY')));
    expect(s.government.policies).toEqual(['LEVEE_EN_MASSE', 'FORCE_MODERNIZATION', 'LIBERALISM', null, 'RAJ', 'HERITAGE_TOURISM']);
    expect([...s.government.lapsed].sort()).toEqual(['FORCE_MODERNIZATION', 'HERITAGE_TOURISM', 'LEVEE_EN_MASSE', 'LIBERALISM', 'RAJ']);
    expect(getModifiers(state, 0).unitMaintenanceCut).toBe(0);
    // the record's set keeps the lapsed cards lapsed and pays the fresh one;
    // a card it drops and a later set slots again pays
    adopt(state, REC(undefined, cards.map(POL)));
    expect([...s.government.lapsed].sort()).toEqual(['FORCE_MODERNIZATION', 'HERITAGE_TOURISM', 'LEVEE_EN_MASSE', 'LIBERALISM', 'RAJ']);
    adopt(state, REC(undefined, cards.filter((c) => c !== 'LEVEE_EN_MASSE').map(POL)));
    adopt(state, REC(undefined, cards.map(POL)));
    expect(s.government.lapsed).not.toContain('LEVEE_EN_MASSE');
    expect(getModifiers(state, 0).unitMaintenanceCut).toBe(2);
  });

  it('the seat phase applies the record at its turn', () => {
    const state = scene('CODE_OF_LAWS', 'POLITICAL_PHILOSOPHY');
    state.seatActions = { [state.turn - 1]: { 0: REC(GOV('CLASSICAL_REPUBLIC')) } };
    endTurn(state);
    expect(seatGovernment(state, 0)).toBe('CLASSICAL_REPUBLIC');
  });
});
