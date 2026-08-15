import { seatOf, unitsOf } from '../../../cpu/core/seats';
import { describe, it, expect } from 'vitest';
import { createGame } from '../../../cpu/core/game';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import type { GameState, Seat } from '../../../cpu/core/types';

// civ MISSIONARY chassis (mirror of the GPU religion2_test pokes). The
// scripted 250t rollout barely reaches a civ that has founded a religion AND
// built a Shrine on a completed Holy Site, so these pin the buy/price/cap/spread
// semantics: the faith-block missionary branch.

function newGame(opponents = 1): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

/** SPREAD is a wire VERB (column 38 = underfoot); spreadFromUnit re-validates
 * type, charges and a FOUNDED religion. */
function spreadHere(state: GameState, actor: Seat, unitId: number): void {
  const row = unitsOf(state, actor.seat).map((x) => (x.id === unitId ? 38 : -1));
  applySeatUnitOrders(state, actor, [row]);
}

describe('civ missionary chassis', () => {
  it('a missionary within 1 of a differing city spreads +10 (15 SCRIPTURE), loses a charge, dies at 0', () => {
    // base lump 10, charges 2 -> survives at 1.
    {
      const state = newGame();
      const civSeat = (state.seats[(0) + 1] as Seat);
      civSeat.religion.founded = true; // the verb refuses an unfounded spreader
      const target = seatOf(state, 0)!.cities[0];
      target.followedReligion = 0; // != g (1)
      target.religionPressure = [0, 0];
      const u = spawnUnit(state, 'MISSIONARY', target.centerIndex, civSeat.seat)!;
      u.charges = 2;
      const uid = u.id;
      spreadHere(state, civSeat, uid);
      expect((target.religionPressure ?? [])[1]).toBe(10);
      const still = state.units.find((x) => x.id === uid);
      expect(still?.charges).toBe(1);
    }
    // SCRIPTURE lump 15, charges 1 -> dies (disbanded) at 0.
    {
      const state = newGame();
      const civSeat = (state.seats[(0) + 1] as Seat);
      civSeat.religion.founded = true;
      civSeat.religion.enhancer = 'SCRIPTURE';
      const target = seatOf(state, 0)!.cities[0];
      target.followedReligion = 0;
      target.religionPressure = [0, 0];
      const u = spawnUnit(state, 'MISSIONARY', target.centerIndex, civSeat.seat)!;
      u.charges = 1;
      const uid = u.id;
      spreadHere(state, civSeat, uid);
      expect((target.religionPressure ?? [])[1]).toBe(15);
      expect(state.units.find((x) => x.id === uid)).toBeUndefined();
    }
  });
});
