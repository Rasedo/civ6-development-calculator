import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { endTurn } from '../../../cpu/core/game';
import { emptySeat } from '../../../cpu/core/seats';
import { UNITS } from '../../../cpu/data/units';
import { THEO_PRESSURE_RANGE } from '../../../cpu/data/religion';
import type { GameState, Unit } from '../../../cpu/core/types';

// CIV6: "Theological combat and city combat damage calculation work the same
// way as normal combat" — the exponential roll on the RELIGIOUS-strength
// difference, wound penalty included.

function duel(atkHp = 100, defHp = 100, defType = 'APOSTLE'): { state: GameState; att: Unit; def: Unit } {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  const a = tileAtCoords(state.map, 9, 9);
  const b = tileAtCoords(state.map, 10, 9);
  const att = spawnUnit(state, 'APOSTLE', a.index, 0)!;
  const def = spawnUnit(state, defType, b.index, 1)!;
  att.hp = atkHp;
  def.hp = defHp;
  return { state, att, def };
}

describe('theological combat', () => {
  it('CIV6 religious strengths, exact: Apostle 110, Missionary 100', () => {
    expect(UNITS.APOSTLE.religiousStrength).toBe(110);
    expect(UNITS.MISSIONARY.religiousStrength).toBe(100);
  });

  it('the blows ROLL, on the same exponential curve a military fight uses', () => {
    // A Missionary cannot initiate, so this is ONE exchange. 110 vs 100 puts
    // the Apostle's blow at 30*e^0.4*[0.8, 1.2] and the reply at 30*e^-0.4*[...].
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const { state, att, def } = duel(100, 100, 'MISSIONARY');
      state.rngState = seed * 7919 + 1;
      endTurn(state);
      const dealt = 100 - def.hp;
      const taken = 100 - att.hp;
      expect(dealt).toBeGreaterThanOrEqual(36);
      expect(dealt).toBeLessThanOrEqual(54);
      expect(taken).toBeGreaterThanOrEqual(16);
      expect(taken).toBeLessThanOrEqual(24);
      seen.add(dealt);
    }
    expect(seen.size).toBeGreaterThan(3); // a roll, not a constant
  });

  it('two Apostles both initiate, so an even pair trades twice a turn', () => {
    const { state, def } = duel();
    state.rngState = 12345;
    endTurn(state);
    expect(100 - def.hp).toBeGreaterThanOrEqual(48); // two even exchanges
    expect(100 - def.hp).toBeLessThanOrEqual(72);
  });

  it('the stronger side deals more and takes less', () => {
    let apostleDealt = 0;
    let missionaryDealt = 0;
    for (let seed = 0; seed < 20; seed++) {
      const { state, att, def } = duel(100, 100, 'MISSIONARY');
      state.rngState = seed * 104729 + 3;
      endTurn(state);
      apostleDealt += 100 - def.hp;
      missionaryDealt += 100 - att.hp;
    }
    expect(apostleDealt).toBeGreaterThan(missionaryDealt);
  });

  it('CIV6: a wounded unit fights at reduced RELIGIOUS strength', () => {
    let healthyTook = 0;
    let woundedTook = 0;
    for (let seed = 0; seed < 20; seed++) {
      {
        const { state, att } = duel(100, 100);
        state.rngState = seed * 15485863 + 11;
        endTurn(state);
        healthyTook += 100 - att.hp;
      }
      {
        // the DEFENDER is the wounded one, so its blow is the weaker of the two
        const { state, att } = duel(100, 40);
        state.rngState = seed * 15485863 + 11;
        endTurn(state);
        woundedTook += 100 - att.hp;
      }
    }
    expect(woundedTook).toBeLessThan(healthyTook);
  });

  it('CIV6: the duel sways cities within 10 tiles', () => {
    expect(THEO_PRESSURE_RANGE).toBe(10);
  });
});
