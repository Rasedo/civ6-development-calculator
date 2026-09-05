import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs } from '../helpers';
import { seatOf, unitsOf } from '../../../cpu/core/seats';
import { seatPhase } from '../../../cpu/core/phase';
import { grantStockpile, stockOf, unitResourceCost } from '../../../cpu/core/stockpile';
import { goldBuyableUnits } from '../../../cpu/core/units';
import { RESOURCES } from '../../../world/resources';
import { STRATEGIC_PER_TURN } from '../../../cpu/data/constants';
import type { GameState } from '../../../cpu/core/types';

/**
 * A GOLD-BOUGHT STRATEGIC UNIT PAYS ITS RESOURCE (A-10r).
 *
 * CIV6 (GS): a unit that asks for a strategic resource pays it "at the moment
 * you start production (or the moment you purchase it)". `purchaseUnit` and
 * the GPU's gold arm both charged it; the seat phase's gold-unit arm (the
 * record's `buy` kind 2) spawned the unit, took the gold and left the
 * stockpile alone — seed 9300 t237, a Horseman bought for gold, 20 Horses
 * apart. The GPU side of the same arm is exercised by the serve gate.
 */
function scene(): { state: GameState; before: number } {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.unitsMode = true;
  settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  grantTechs(state, 'ANIMAL_HUSBANDRY', 'HORSEBACK_RIDING');
  // an owned, improved Horses source opens the column; the bank pays for it
  const src = tileAtCoords(state.map, 7, 6);
  src.resource = 'HORSES';
  src.improvement = RESOURCES.HORSES.improvement;
  grantStockpile(state, 0, 'HORSES', 40);
  seatOf(state, 0)!.treasury = 100000;
  expect(goldBuyableUnits(state, 0).map((d) => d.id), 'the scene must offer the Horseman for gold').toContain('HORSEMAN');
  return { state, before: stockOf(state, 0, 'HORSES') };
}

describe('the gold unit purchase', () => {
  it('pays the strategic resource the moment it buys a unit that asks for one', () => {
    const { state, before } = scene();
    // the record's ONE gold purchase, kind 2 = a military unit; the seat phase
    // is the body that applies it
    state.seatActions = { [state.turn - 1]: { 0: { production: [], tech: null, civic: null, units: [], buy: [2, 0, 0] } } };
    seatPhase(state);
    const bought = unitsOf(state, 0).filter((u) => u.type === 'HORSEMAN').length;
    expect(bought, 'the gold arm bought no Horseman').toBe(1);
    // the phase's own production pick may also START a Horseman, which pays
    // the same charge at commit — count every Horseman the seat now owes for
    const queued = seatOf(state, 0)!.cities.reduce((n, c) => n + c.queue.filter((q) => q.kind === 'unit' && q.unit === 'HORSEMAN').length, 0);
    // ...and the phase's accrual pays the pasture's per-turn yield into the same bank
    expect(stockOf(state, 0, 'HORSES')).toBe(before - unitResourceCost('HORSEMAN')!.n * (bought + queued) + STRATEGIC_PER_TURN.HORSES);
  });
});
