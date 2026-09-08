/**
 * THE ROUTE'S DEST CODE NAMES AN ID, NOT A POSITION.
 *
 * The wire carries a trade route as [origin CENTRE, dest code], where a code
 * of -(2 + n) means a city-state. `captureCityState` SPLICES the city-state
 * array, so every later position shifts the moment a minor is taken — while
 * the GPU keeps a fixed slot per city-state and never renumbers.
 *
 * The applier has always decoded the code with `cityStateById`, so `n` was an
 * ID on the reading side and a POSITION on the writing side, and the two
 * agreed only until the array shrank. The battery found it at seed 9014 turn
 * 117, where the two engines named different city-states for the same trader.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { placeCityStateAt, cityStateById } from '../../../cpu/core/cityStates';
import { captureCityState } from '../../../cpu/core/combat';
import type { GameState } from '../../../cpu/core/types';

function threeMinors(): GameState {
  const state = makeState(makeMap(24, 16));
  for (const t of state.map.tiles) { t.terrain = 'PLAINS'; t.elevation = 'FLAT'; }
  placeCityStateAt(state, 0, 'Alpha', 'trade', tileAtCoords(state.map, 4, 4).index);
  placeCityStateAt(state, 1, 'Beta', 'trade', tileAtCoords(state.map, 12, 4).index);
  placeCityStateAt(state, 2, 'Gamma', 'trade', tileAtCoords(state.map, 20, 4).index);
  return state;
}

describe('a city-state id survives what its array position does not', () => {
  it('keeps every id when a minor in the MIDDLE is captured', () => {
    const state = threeMinors();
    expect(state.cityStates.map((c) => c.id)).toEqual([0, 1, 2]);
    captureCityState(state, cityStateById(state, 1)!, 0);
    // the array shrank and Gamma MOVED — from position 2 to position 1
    expect(state.cityStates.map((c) => c.id)).toEqual([0, 2]);
    expect(state.cityStates[1].id).toBe(2);
    // ...so a code built from the POSITION would now name Alpha's neighbour
    // as -(2+1), which is the captured minor's old code and nobody's now.
    // Built from the ID it still names Gamma, which is what the applier's
    // `cityStateById` will look up.
    expect(cityStateById(state, 2)?.name).toBe('Gamma');
    expect(cityStateById(state, 1)).toBeUndefined();
  });

  it('gives the survivors codes the applier can resolve', () => {
    const state = threeMinors();
    captureCityState(state, cityStateById(state, 0)!, 0);
    for (const cityState of state.cityStates) {
      const code = -(2 + cityState.id);
      // the applier's own decode, spelled here exactly as `phase.ts` spells it
      expect(cityStateById(state, -(code + 2))?.id).toBe(cityState.id);
    }
    // and the position-built code for the FIRST survivor would have resolved
    // to the captured minor — the bug this pins
    const posCode = -(2 + 0);
    expect(cityStateById(state, -(posCode + 2))).toBeUndefined();
    expect(state.cityStates[0].id).toBe(1);
  });
});
