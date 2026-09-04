import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { computeAdoption, governmentBit, governmentIndex, legacyBonusPct, legacyEffects, legacyRatePct } from '../../../cpu/core/effects';
import { GOVERNMENTS, GOVERNMENT_LIST } from '../../../cpu/data/policies';
import { LEGACY_RATE_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { CIVICS } from '../../../cpu/data/civics';
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

/**
 * C-73: a legacy card is worth the percentage its government has ACCUMULATED
 * against the ONE BonusType it names — not that government's whole inherent
 * bonus, which is what `POLICIES[LEGACY_*].effects` still holds.
 */
describe('what a legacy card pays', () => {
  it('maps every BonusType to a channel, and zero to nothing', () => {
    // Sourced twice over: the install's Increment/Interval, and the
    // community's reported percentages, which match those rows exactly.
    expect(legacyEffects(GOVERNMENTS.AUTOCRACY, 2)).toEqual({
      prodBoost: { target: 'wonder', classes: [], eraMax: -1, pct: 0.02 },
    });
    expect(legacyEffects(GOVERNMENTS.FASCISM, 3)).toEqual({
      prodBoost: { target: 'anyUnit', classes: [], eraMax: -1, pct: 0.03 },
    });
    expect(legacyEffects(GOVERNMENTS.COMMUNISM, 5)).toEqual({ yieldMult: { production: 1.05 } });
    expect(legacyEffects(GOVERNMENTS.DEMOCRACY, 4)).toEqual({ projectProdMult: 1.04 });
    expect(legacyEffects(GOVERNMENTS.CLASSICAL_REPUBLIC, 6)).toEqual({ gppMult: 1.06 });
    expect(legacyEffects(GOVERNMENTS.OLIGARCHY, 7)).toEqual({ xpPct: 7 });
    expect(legacyEffects(GOVERNMENTS.MONARCHY, 8)).toEqual({ influenceMult: 1.08 });
    expect(legacyEffects(GOVERNMENTS.MERCHANT_REPUBLIC, 9)).toEqual({ goldBuyDiscountPct: 9 });
    expect(legacyEffects(GOVERNMENTS.THEOCRACY, 10)).toEqual({ faithBuyDiscountPct: 10 });
    // an accrual of nothing must pay NOTHING — a multiplicative channel has
    // to stay exactly 1, not arrive at 1.0 by another route
    for (const g of GOVERNMENT_LIST) expect(legacyEffects(g, 0)).toEqual({});
    expect(legacyEffects(GOVERNMENTS.CHIEFDOM, 50)).toEqual({});
  });

  it('is worth its BonusType and never the government package', () => {
    // The end-to-end scene cannot be built: no civic set, and no number of
    // spare wildcard slots, ever slots a legacy card (see the reachability
    // lane below). So the payload is pinned at the composer instead.
    const state = scene();
    const seat = seatOf(state, 0)!;
    seat.government.govTurns![governmentIndex('AUTOCRACY')] = 40;
    expect(legacyBonusPct(state, 0, 'AUTOCRACY'), '40 turns at 1%/20').toBe(2);
    expect(legacyEffects(GOVERNMENTS.AUTOCRACY, legacyBonusPct(state, 0, 'AUTOCRACY')))
      .toEqual({ prodBoost: { target: 'wonder', classes: [], eraMax: -1, pct: 0.02 } });
    // ...and NOT Autocracy's own inherent bonus, which is what the card's
    // `effects` field still holds and what this engine used to hand back.
    expect(GOVERNMENTS.AUTOCRACY.effects.yieldsPerGovBuilding).toBeGreaterThan(0);
    expect(legacyEffects(GOVERNMENTS.AUTOCRACY, 2).yieldsPerGovBuilding).toBeUndefined();
  });

  it('REACHABILITY: no legacy card is ever slotted in play today', () => {
    // Not a feature — a gap, pinned so it cannot be forgotten (C-75). The
    // greedy fill walks the card catalog in order and legacy cards are
    // appended LAST, so an earlier card takes every wildcard slot. With
    // EVERY civic researched and EVERY government held, the best government
    // in the game still slots none of them.
    const held = GOVERNMENT_LIST.reduce((m, g) => m | governmentBit(g.id), 0);
    const research = {
      tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [],
      civics: Object.keys(CIVICS), boosted: [], techRetained: {}, civicRetained: {},
    };
    const a = computeAdoption(research as never, undefined, -1, false, held);
    const slotted = a.policies.filter((p) => p !== null) as string[];
    expect(slotted.length, 'the scene must fill some slots').toBeGreaterThan(0);
    expect(slotted.filter((p) => p.startsWith('LEGACY_')),
      'a legacy card became reachable — re-read C-75 and C-73 before changing this')
      .toEqual([]);
  });
});
