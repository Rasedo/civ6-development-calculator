// The majors' diplomatic state (ai/major/diploState.ts) on a stub view: the
// start state, the required transitions' bounds, the war and peace triggers,
// and an allowed row left untaken while its desires are unread.
import { describe, expect, it } from 'vitest';
import { answerAction, diploState, diploStateTurn, newDiploStateGaps, newDiploStateMemory } from '../../../ai/major/diploState';
import type { MajorView } from '../../../ai/major/view';

function view(turn: number, war = false): MajorView {
  return { turn, majors: () => [0, 1], metTurn: () => 1, atWar: () => war } as unknown as MajorView;
}

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

  it('turns to War with the war and to Unfriendly with the peace, holding each for the turn', () => {
    const mem = newDiploStateMemory();
    const gaps = newDiploStateGaps();
    diploStateTurn(view(2, true), mem, 0, () => 30, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_WAR');
    diploStateTurn(view(3, false), mem, 0, () => 30, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_UNFRIENDLY');
    diploStateTurn(view(4, false), mem, 0, () => 30, gaps);
    expect(diploState(mem, 0, 1)).toBe('DIPLO_STATE_NEUTRAL');
  });
});

describe('the receiver\'s answer (0x653f60)', () => {
  // a Gold weight of 0.4 (runs/h1_duelv1127 t68 / t79: 0.5 x gold x 1.4)
  const v = { yieldWeight: () => Math.round(0.4 * 256) } as unknown as MajorView;
  it('accepts a mission in Neutral, where the gold it is paid outweighs the state\'s cost', () => {
    // Embassy: 15 - 25 x 0.5 x 1.4 = -2.5
    expect(answerAction(v, 'DIPLO_STATE_NEUTRAL', 0, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(true);
  });
  it('refuses in Unfriendly (Cost 75 / 100), and an action its state does not list', () => {
    expect(answerAction(v, 'DIPLO_STATE_UNFRIENDLY', 0, 'DIPLOACTION_DIPLOMATIC_DELEGATION', 10)).toBe(false);
    expect(answerAction(v, 'DIPLO_STATE_UNFRIENDLY', 0, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(false);
    expect(answerAction(v, 'DIPLO_STATE_WAR', 0, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(false);
    expect(answerAction(v, null, 0, 'DIPLOACTION_RESIDENT_EMBASSY', 25)).toBe(false);
  });
});
