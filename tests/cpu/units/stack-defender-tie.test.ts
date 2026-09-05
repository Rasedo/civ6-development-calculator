import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { stackDefender, stackDefenceCS } from '../../../cpu/core/combat';
import type { GameState, Unit } from '../../../cpu/core/types';

/**
 * A RANGED HIT ON A STACKED HEX GOES TO THE HULL ON A TIE (A-9r).
 *
 * CIV6 (Flanking and Support): against a ranged attack "the unit with the
 * higher Combat Strength will defend". The engines agreed on the comparison
 * and disagreed on the TIE: TS started from `fighters[0]` — whichever unit
 * came first in the tile's array — while the GPU keeps the hull. At seed 9209
 * t178 a passenger listed before its hull took a volley on TS that the hull
 * took on the GPU, and the wounded hull's next melee diverged by 40 CS.
 *
 * The GPU twin is tests/gpu/stack_defender_tie_test.py.
 */
function scene(): { state: GameState; hull: Unit; pax: Unit } {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
  // era index 3 (Renaissance): the embarked defence table reads 30 there,
  // which is exactly a Galley's Combat Strength — the tie the lane needs
  state.seats[0].research.techs.push('ASTRONOMY');
  const t = tileAtCoords(state.map, 9, 9);
  t.terrain = 'COAST';
  // the PASSENGER is spawned first, so it is first in `state.units`
  const pax = spawnUnit(state, 'WARRIOR', t.index, 0)!;
  pax.embarked = true;
  pax.tileIndex = t.index;
  const hull = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 9, 8).index, 0)!;
  hull.tileIndex = t.index;
  return { state, hull, pax };
}

describe('the ranged stack-defender tie', () => {
  it('goes to the hull when the two tie, whatever their array order', () => {
    const { state, hull, pax } = scene();
    const order = state.units.filter((u) => u.seat === 0 && u.tileIndex === hull.tileIndex);
    expect(order[0].id, 'the scene must list the passenger first').toBe(pax.id);
    // pin the tie before asserting on it: an accidental strict inequality
    // would make this lane pass for the wrong reason
    const hullCS = stackDefenceCS(state, hull);
    const paxCS = stackDefenceCS(state, pax);
    expect(hullCS, `the scene must tie (hull ${hullCS} vs passenger ${paxCS})`).toBe(paxCS);
    const picked = stackDefender(state, [pax, hull], true);
    expect(picked.id, 'on a tie the hull defends').toBe(hull.id);
  });

  it('still lets a strictly stronger passenger defend', () => {
    const { state, hull, pax } = scene();
    pax.formation = 2; // an army's +CS on the passenger
    expect(stackDefenceCS(state, pax)).toBeGreaterThan(stackDefenceCS(state, hull));
    expect(stackDefender(state, [pax, hull], true).id).toBe(pax.id);
  });

  it('gives a melee hit to the hull regardless of strength', () => {
    const { state, hull, pax } = scene();
    pax.formation = 2;
    expect(stackDefender(state, [pax, hull], false).id).toBe(hull.id);
  });
});
