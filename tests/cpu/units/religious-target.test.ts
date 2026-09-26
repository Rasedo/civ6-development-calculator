/**
 * WHAT MAY TARGET A RELIGIOUS UNIT OR A CIVILIAN, as the live game answers it
 * (tools/civ6lab/runs/religious_target_20260926T_{read,pairs,fire}.jsonl):
 * a ranged attack or a city's strike never targets a Missionary, an Apostle or
 * a Builder; a melee order onto a religious unit is a MOVE onto its tile, onto
 * a Builder a capture; Condemn Heretic is legal on the heretic's own tile
 * only. The GPU twin is tests/gpu/religious_target_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { BARB_SEAT, emptySeat, setWar } from '../../../cpu/core/seats';
import { attackTargets, meleeAttack, rangedAttack } from '../../../cpu/core/combat';
import { cityStrikes } from '../../../cpu/core/phase';
import { condemnHeretic } from '../../../cpu/core/game';
import { maskCtx, unitMask } from '../../../cpu/core/unitMask';
import { IMPROVEMENT_IDS, unitActionIndex } from '../../../cpu/core/unitActions';
import { WALLS_TIER_HP } from '../../../cpu/data/units';

const ACT = unitActionIndex(IMPROVEMENT_IDS);

/** seat 0 and seat 1 at war on an open grassland */
function scene() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  setWar(state, 0, 1, true);
  return state;
}

describe('a shot never takes a civilian', () => {
  it('a ranged attack refuses a Missionary and a Builder, and takes a combat unit', () => {
    const state = scene();
    const archer = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 5, 5).index, 0)!;
    const miss = spawnUnit(state, 'MISSIONARY', tileAtCoords(state.map, 6, 5).index, 1)!;
    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 5, 6).index, 1)!;
    expect(rangedAttack(state, archer.id, miss.tileIndex).ok).toBe(false);
    expect(rangedAttack(state, archer.id, builder.tileIndex).ok).toBe(false);
    expect(miss.hp).toBe(100);
    expect(builder.hp).toBe(100);
    const mask = unitMask(maskCtx(state, 0), archer);
    expect(mask.filter((c) => c >= 6 && c < 12)).toEqual([]);
    const foe = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 5).index, 1)!;
    expect(rangedAttack(state, archer.id, foe.tileIndex).ok).toBe(true);
    expect(foe.hp).toBeLessThan(100);
  });

  it("a barbarian archer's targets pass over a religious unit", () => {
    const state = scene();
    const archer = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 5, 5).index, BARB_SEAT)!;
    const miss = spawnUnit(state, 'MISSIONARY', tileAtCoords(state.map, 6, 5).index, 0)!;
    expect(attackTargets(state, archer)).not.toContain(miss.tileIndex);
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 5).index, 0)!;
    expect(attackTargets(state, archer)).toContain(w.tileIndex);
  });

  it("a walled city's strike takes the nearest unit it may shoot, never the civilian", () => {
    const state = scene();
    const city = settleAt(state, tileAtCoords(state.map, 10, 10).index, 0);
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = WALLS_TIER_HP[1];
    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 11, 10).index, 1)!;
    const miss = spawnUnit(state, 'MISSIONARY', tileAtCoords(state.map, 9, 10).index, 1)!;
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 10).index, 1)!;
    cityStrikes(state, city, 30);
    expect(builder.hp).toBe(100);
    expect(miss.hp).toBe(100);
    expect(w.hp).toBeLessThan(100);
  });
});

describe('a melee order onto a religious unit, and Condemn Heretic', () => {
  it('shares the tile, harms nothing and leaves moves for the condemnation', () => {
    const state = scene();
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    const miss = spawnUnit(state, 'MISSIONARY', tileAtCoords(state.map, 6, 5).index, 1)!;
    // from beside it, no condemnation
    expect(unitMask(maskCtx(state, 0), w)).not.toContain(ACT.CONDEMN);
    expect(condemnHeretic(state, w).ok).toBe(false);
    expect(meleeAttack(state, w.id, miss.tileIndex, 0).ok).toBe(true);
    expect(w.tileIndex).toBe(miss.tileIndex);
    expect(state.units).toContain(miss);
    expect(miss.hp).toBe(100);
    expect(miss.seat).toBe(1);
    expect(w.hp).toBe(100);
    expect(w.movesLeft).toBeGreaterThan(0);
    // on its tile the verb is offered, and it kills the heretic
    expect(unitMask(maskCtx(state, 0), w)).toContain(ACT.CONDEMN);
    expect(condemnHeretic(state, w).ok).toBe(true);
    expect(state.units).not.toContain(miss);
    expect(w.movesLeft).toBe(0);
  });

  it('onto a Builder it still captures', () => {
    const state = scene();
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 6, 5).index, 1)!;
    expect(meleeAttack(state, w.id, builder.tileIndex, 0).ok).toBe(true);
    expect(builder.seat).toBe(0);
  });

  it('the action space carries one own-tile CONDEMN column and no directional ones', () => {
    expect(ACT.CONDEMN).toBeGreaterThanOrEqual(0);
    expect(ACT.CONDEMN_0).toBeUndefined();
  });
});
