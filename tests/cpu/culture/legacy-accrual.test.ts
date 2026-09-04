import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { governmentIndex, legacyBonusPct, legacyRatePct } from '../../../cpu/core/effects';
import { GOVERNMENTS, GOVERNMENT_LIST } from '../../../cpu/data/policies';
import { LEGACY_RATE_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS): a government
 * accumulates +Increment% against its own BonusType for every Interval turns
 * it is held, and a seat keeps what it accrued after switching (C-63).
 *
 * The install spells this ACCUMULATING, never "legacy", which is why an
 * earlier sourcing pass searched `Governments`, `GovernmentBonusNames` and
 * `BonusRate` and concluded no XML table carried the threshold.
 *
 * The GPU twin is tests/gpu/legacy_accrual_test.py.
 */
const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

function scene(civ?: string): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  if (civ !== undefined) state.seats[0].civ = civRow(civ);
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  return state;
}

/** turns held -> the accrued percentage, without stepping the whole engine */
function accrued(state: GameState, govId: string, turns: number): number {
  const gi = governmentIndex(govId);
  seatOf(state, 0)!.government.govTurns![gi] = turns;
  return legacyBonusPct(state, 0, govId);
}

describe('the government legacy accrual', () => {
  it('carries the install\'s nine intervals and nothing else', () => {
    // Verbatim from Governments.xml's ACCUMULATING ModifierArguments.
    const want: Record<string, [string, number]> = {
      OLIGARCHY: ['combatExperience', 5],
      MONARCHY: ['envoys', 10],
      DEMOCRACY: ['districtProjects', 10],
      FASCISM: ['unitProduction', 10],
      CLASSICAL_REPUBLIC: ['greatPeople', 15],
      MERCHANT_REPUBLIC: ['goldPurchases', 15],
      THEOCRACY: ['faithPurchases', 15],
      AUTOCRACY: ['wonderConstruction', 20],
      COMMUNISM: ['overallProduction', 20],
    };
    for (const [id, [type, interval]] of Object.entries(want)) {
      const g = GOVERNMENTS[id];
      expect(g, `${id} is not a government`).toBeDefined();
      expect(g.bonus, `${id} accumulates nothing`).toBeDefined();
      expect(g.bonus!.type).toBe(type);
      expect(g.bonus!.interval).toBe(interval);
      expect(g.bonus!.increment).toBe(1);
    }
    // the Chiefdom is the ONE government with no accumulating row
    expect(GOVERNMENTS.CHIEFDOM.bonus).toBeUndefined();
    const withBonus = GOVERNMENT_LIST.filter((g) => g.bonus).length;
    expect(withBonus, 'the install writes exactly nine accumulating rows').toBe(9);
  });

  it('floors to whole increments — 19 turns of Autocracy is worth nothing', () => {
    const state = scene();
    expect(accrued(state, 'AUTOCRACY', 0)).toBe(0);
    expect(accrued(state, 'AUTOCRACY', 19)).toBe(0);
    expect(accrued(state, 'AUTOCRACY', 20)).toBe(1);
    expect(accrued(state, 'AUTOCRACY', 39)).toBe(1);
    expect(accrued(state, 'AUTOCRACY', 40)).toBe(2);
    // ...and the interval is per government, not one global number
    expect(accrued(state, 'OLIGARCHY', 20)).toBe(4);
  });

  it('pays nothing for the Chiefdom, however long it is held', () => {
    const state = scene();
    expect(accrued(state, 'CHIEFDOM', 500)).toBe(0);
  });

  it('halves the interval for America, and only for America', () => {
    // CIV6 (Founding Fathers): "Earn all Government legacy bonuses in half
    // the usual time." The install writes it as nine BonusRate 100 rows.
    expect(LEGACY_RATE_ROWS.length, 'nine rows, one per government').toBe(9);
    expect(new Set(LEGACY_RATE_ROWS.map((r) => r.government)).size).toBe(9);
    expect(LEGACY_RATE_ROWS.every((r) => r.ratePct === 100)).toBe(true);

    const usa = scene('AMERICA');
    expect(legacyRatePct(usa, 0, 'AUTOCRACY')).toBe(100);
    expect(accrued(usa, 'AUTOCRACY', 10)).toBe(1);
    expect(accrued(usa, 'AUTOCRACY', 19)).toBe(1);
    expect(accrued(usa, 'AUTOCRACY', 20)).toBe(2);

    const other = scene('ROME');
    expect(legacyRatePct(other, 0, 'AUTOCRACY')).toBe(0);
    expect(accrued(other, 'AUTOCRACY', 10)).toBe(0);
    expect(accrued(other, 'AUTOCRACY', 20)).toBe(1);
  });

  it('is born with the seat, so a fresh state and a loaded one match', () => {
    // The replay-determinism tests caught this: created lazily, the array
    // existed on a LOADED state and not on a fresh one.
    const state = scene();
    const turns = seatOf(state, 0)!.government.govTurns;
    expect(turns).toBeDefined();
    expect(turns!.length).toBe(GOVERNMENT_LIST.length);
    expect(turns!.every((t) => t === 0)).toBe(true);
  });
});
