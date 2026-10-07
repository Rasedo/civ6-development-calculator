/** The melee result as GameCore_XP2_Release.dll 0x206960 makes it: the
 *  embarked defender's missing counter, the mutual kill, and the attack that
 *  ends the attacker's fortification (0x1fbae0). */
import { describe, it, expect } from 'vitest';
import { BARB_SEAT, seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { raiseBestTrained, spawnUnit } from '../../../cpu/core/units';
import { cityStrikeStrength, meleeAttack, resolveMutualKill, woundedLoss256 } from '../../../cpu/core/combat';
import { CITY_MIN_STRIKE_CS, COMBAT_MAX_EXTRA_DAMAGE } from '../../../cpu/data/constants';
import { UNITS } from '../../../cpu/data/units';
import { randRange } from '../../../cpu/core/rand';

function field() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  return state;
}

describe('the melee result', () => {
  it('the side the blows overshoot further falls, the other stands at 1 — the attacker on a tie', () => {
    // runs/h1_duelw1124 t13: the attacker at 8 HP takes 32, the defender at
    // 19 takes 31 — 24 over against 12, so the defender stands
    const a = { hp: 8 - 32 };
    const d = { hp: 19 - 31 };
    resolveMutualKill(a, d);
    expect(d.hp).toBe(1);
    expect(a.hp).toBeLessThanOrEqual(0);
    const a2 = { hp: 30 - 35 };
    const d2 = { hp: 20 - 40 };
    resolveMutualKill(a2, d2);
    expect(a2.hp).toBe(1);
    expect(d2.hp).toBeLessThanOrEqual(0);
    const a3 = { hp: -5 };
    const d3 = { hp: -5 };
    resolveMutualKill(a3, d3);
    expect(a3.hp).toBe(1);
    // one side standing: nothing to resolve
    const a4 = { hp: 10 };
    const d4 = { hp: -3 };
    resolveMutualKill(a4, d4);
    expect([a4.hp, d4.hp]).toEqual([10, -3]);
  });

  it('an embarked defender strikes no blow back and its counter is not drawn', () => {
    const state = field();
    const sea = tileAtCoords(state.map, 10, 10);
    sea.terrain = 'COAST';
    const from = tileAtCoords(state.map, 9, 10);
    from.terrain = 'COAST';
    const galley = spawnUnit(state, 'GALLEY', from.index, BARB_SEAT)!;
    const warrior = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 10).index, 0)!;
    warrior.tileIndex = sea.index;
    warrior.embarked = true;
    // the one draw the attack takes: the defender's damage
    const probe = structuredClone(state);
    randRange(probe, COMBAT_MAX_EXTRA_DAMAGE, 'Unit Combat Damage');
    const after = probe.rngState;
    expect(meleeAttack(state, galley.id, sea.index, BARB_SEAT)).toEqual({ ok: true });
    expect(galley.hp).toBe(100);
    expect(state.rngState).toBe(after);
  });

  it('a city strikes from the best Ranged Strength its holder made, at least 3', () => {
    const state = field();
    const city = settleAt(state, tileAtCoords(state.map, 5, 5).index);
    expect(cityStrikeStrength(state, city)).toBe(CITY_MIN_STRIKE_CS);
    raiseBestTrained(state, 0, 'CATAPULT'); // a Bombard is no RangedCombat
    expect(seatOf(state, 0)!.bestRangedCS ?? 0).toBe(0);
    raiseBestTrained(state, 0, 'ARCHER');
    expect(cityStrikeStrength(state, city)).toBe(UNITS.ARCHER.ranged!.strength);
    raiseBestTrained(state, 0, 'SLINGER'); // the best never falls
    expect(cityStrikeStrength(state, city)).toBe(UNITS.ARCHER.ranged!.strength);
    // a damaged city strikes weaker: the wounded law on its hit points' percent
    city.hp -= 100;
    expect(cityStrikeStrength(state, city)).toBe(UNITS.ARCHER.ranged!.strength - woundedLoss256(50) / 256);
  });

  it('an attack ends the attacker\'s fortification', () => {
    const state = field();
    const a = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 9).index, 0)!;
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 10, 9).index, BARB_SEAT)!;
    a.fortifyTurns = 2;
    expect(meleeAttack(state, a.id, tileAtCoords(state.map, 10, 9).index, 0).ok).toBe(true);
    expect(a.fortifyTurns).toBe(0);
  });
});
