// The majors' diplomatic state (ai/major/diploState.ts) on a stub view: the
// start state, the required transitions' bounds, the triggers, an allowed row
// left untaken while its desires are unread, and the transitions' checks and
// actions (the friendship offered, the denouncement).
import { describe, expect, it } from 'vitest';
import {
  answerAction, diploState, diploStateTurn, newDiploStateGaps, newDiploStateMemory, type DesireOf, type TransitionInputs,
} from '../../../ai/major/diploState';
import { newDiploActionMemory } from '../../../ai/major/diploActions';
import type { MajorView } from '../../../ai/major/view';

function view(turn: number, over: Partial<MajorView> = {}): MajorView {
  return { turn, majors: () => [0, 1], metTurn: () => 1, atWar: () => false, allied: () => false, declaredFriends: () => false,
    denouncing: () => false, actionOpen: () => true, warOpen: () => true, ...over } as unknown as MajorView;
}

const inputs = (desireOf: DesireOf): TransitionInputs => ({ desireOf, sender: newDiploActionMemory(), pref: () => 0 });

describe('the diplomatic state turn (0x67b6e0)', () => {
  it('starts Neutral and takes a required row on its bound', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2), mem, 0, () => 0, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_NEUTRAL');
    // Neutral -> Friendly is required at RequireTransitionMax 15
    diploStateTurn(view(3), mem, 0, () => 15, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_FRIENDLY');
    // Friendly -> Neutral is required at RequireTransitionMin -5
    diploStateTurn(view(4), mem, 0, () => -5, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_NEUTRAL');
    // Neutral -> Unfriendly at -15
    diploStateTurn(view(5), mem, 0, () => -15, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_UNFRIENDLY');
  });

  it('leaves an allowed row untaken and counts it', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2), mem, 0, () => 2, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_NEUTRAL');
    expect(gaps.allowed.get('NEUTRAL>UNFRIENDLY')).toBe(1);
  });

  it('weighs the allowed rows on the desires: Demand Tribute takes Neutral to Unfriendly where Open Borders cannot be done', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2), mem, 0, () => 0, gaps);
    const des = (ob: boolean): DesireOf => (_o, a) => ({
      desire: a === 'DIPLOACTION_DEMAND_TRIBUTE' ? 10 * 256 : a === 'DIPLOACTION_OPEN_BORDERS' ? 21 * 256 : 0,
      canDo: a !== 'DIPLOACTION_OPEN_BORDERS' || ob,
    });
    // runs/h1_duelv1127 t105: Rome at opinion 5, Demand Tribute 10, Open Borders 21 without Early Empire
    diploStateTurn(view(3), mem, 0, () => 5, gaps, inputs(des(false)));
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_UNFRIENDLY');
    // ...and with Open Borders open the Friendly row's 21 outweighs it
    const m2 = newDiploStateMemory();
    diploStateTurn(view(2), m2, 0, () => 0, gaps);
    diploStateTurn(view(3), m2, 0, () => 5, gaps, inputs(des(true)));
    expect(diploState(m2, 0, 1)).toBe('DIPLO_STATE_FRIENDLY');
  });

  it('turns to War with the war and to Unfriendly with the peace, holding each for the turn', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2, { atWar: () => true }), mem, 0, () => 30, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_WAR');
    diploStateTurn(view(3), mem, 0, () => 30, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_UNFRIENDLY');
    diploStateTurn(view(4), mem, 0, () => 30, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_NEUTRAL');
  });

  it('sets Declared Friend on the friendship and Friendly at its end; Denounced on a denouncement either way', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2, { declaredFriends: () => true }), mem, 0, () => 0, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_DECLARED_FRIEND');
    diploStateTurn(view(3), mem, 0, () => 0, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_FRIENDLY');
    diploStateTurn(view(4, { denouncing: (a: number) => a === 1 }), mem, 0, () => 0, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_DENOUNCED');
  });

  it('offers the friendship on Friendly -> Declared Friend and stays Friendly (OnDeclareFriendship returns false)', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2), mem, 0, () => 0, gaps);
    diploStateTurn(view(3), mem, 0, () => 15, gaps);
    const des: DesireOf = () => ({ desire: 10 * 256, canDo: true });
    // required at RequireTransitionMax 25, CanDeclareFriendship on the desire 10
    const sent = diploStateTurn(view(4), mem, 0, () => 25, gaps, inputs(des));
    expect(sent).toEqual([{ owner: 0, other: 1, kind: 'friendship' }]);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_FRIENDLY');
    // a desire below 0 fails the check
    const none = diploStateTurn(view(5), mem, 0, () => 25, gaps, inputs(() => ({ desire: -256, canDo: true })));
    expect(none).toEqual([]);
  });

  it('denounces on Unfriendly -> Denounced where the denouncement and the surprise war are open', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2), mem, 0, () => -15, gaps);
    diploStateTurn(view(3), mem, 0, () => -15, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_UNFRIENDLY');
    const des: DesireOf = () => ({ desire: 0, canDo: true });
    expect(diploStateTurn(view(4, { warOpen: () => false }), mem, 0, () => -25, gaps, inputs(des))).toEqual([]);
    const sent = diploStateTurn(view(5), mem, 0, () => -25, gaps, inputs(des));
    expect(sent).toEqual([{ owner: 0, other: 1, kind: 'denounce' }]);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_DENOUNCED');
  });
});

describe('the receiver\'s answer (0x653f60)', () => {
  // a Gold weight of 0.4 (runs/h1_duelv1127 t68 / t79: 0.5 x gold x 1.4)
  const v = { yieldWeight: () => Math.round(0.4 * 256), militaryStrength: () => 50, majors: () => [0, 1], metTurn: () => 1 } as unknown as MajorView;
  it('accepts a mission in Neutral, where the gold it is paid outweighs the state\'s cost', () => {
    // Embassy: 15 - 25 x 0.5 x 1.4 = -2.5
    expect(answerAction(v, 'DIPLO_STATE_NEUTRAL', 0, 1, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(true);
  });
  it('refuses in Unfriendly (Cost 75 / 100), and an action its state does not list', () => {
    expect(answerAction(v, 'DIPLO_STATE_UNFRIENDLY', 0, 1, 'DIPLOACTION_DIPLOMATIC_DELEGATION', 10)).toBe(false);
    expect(answerAction(v, 'DIPLO_STATE_UNFRIENDLY', 0, 1, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(false);
    expect(answerAction(v, 'DIPLO_STATE_WAR', 0, 1, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(false);
    expect(answerAction(v, null, 0, 1, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(false);
  });
});
