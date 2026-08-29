import { describe, it, expect } from 'vitest';
import { makeState, settleFirstCity } from '../helpers';
import { endTurn, queueSettler, foundCityAt } from '../../../cpu/core/game';
import { transferCity } from '../../../cpu/core/phase';
import { cityBuildingSum, newCityGrantUnit, seatBuildingSum } from '../../../cpu/core/city';
import { anyWorkFree, gwExtraSlots, relicSlotsIn } from '../../../cpu/core/greatPeople';
import { gwCapacity, gwCount, gwGive, placeRelic, GW_WRITING, GW_ART } from '../../../cpu/data/greatPeople';
import { healOnEliminate } from '../../../cpu/core/combat';
import { spawnUnit } from '../../../cpu/core/units';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { UNIT_HP } from '../../../cpu/data/units';
import type { City, GameState } from '../../../cpu/core/types';

/**
 * The five Government Plaza buildings that used to pay only their governor
 * title. Every magnitude here is the Gathering Storm Civilopedia's own.
 */

/** a state with one city, the named buildings standing in it. */
function cityWith(...buildings: string[]): { state: GameState; city: City } {
  const state = makeState();
  const city = settleFirstCity(state);
  city.districts.push({ type: 'GOVERNMENT_PLAZA', tileIndex: city.centerIndex });
  city.buildings.push(...buildings);
  return { state, city };
}

describe("the Ancestral Hall — settlers and the founding Builder", () => {
  it('pays 50% toward a SETTLER in its own city, and nothing toward anything else', () => {
    const { state, city } = cityWith('ANCESTRAL_HALL');
    expect(cityBuildingSum(state, city, 'settlerProdPct')).toBe(50);
    const bare = cityWith();
    expect(cityBuildingSum(bare.state, bare.city, 'settlerProdPct')).toBe(0);
  });

  it('the settler queue fills half again as fast', () => {
    const run = (hall: boolean): number => {
      const state = makeState();
      const city = settleFirstCity(state);
      if (hall) {
        city.districts.push({ type: 'GOVERNMENT_PLAZA', tileIndex: city.centerIndex });
        city.buildings.push('ANCESTRAL_HALL');
      }
      city.population = 3;
      expect(queueSettler(state, city.id, 0).ok).toBe(true);
      endTurn(state);
      return city.queue[0]?.progress ?? 0;
    };
    const plain = run(false);
    expect(plain).toBeGreaterThan(0);
    expect(run(true)).toBeCloseTo(plain * 1.5, 9);
  });

  it('hands every city the seat FOUNDS a free Builder, and none before it stands', () => {
    const state = makeState();
    const first = settleFirstCity(state);
    expect(newCityGrantUnit(state, 0)).toBeNull();
    expect(state.units.filter((u) => u.type === 'BUILDER').length).toBe(0);
    first.districts.push({ type: 'GOVERNMENT_PLAZA', tileIndex: first.centerIndex });
    first.buildings.push('ANCESTRAL_HALL');
    expect(newCityGrantUnit(state, 0)).toBe('BUILDER');
    const spot = state.map.tiles.find(
      (t) => !t.district && t.terrain !== 'OCEAN' && t.terrain !== 'COAST'
        && Math.abs(t.col - state.map.tiles[first.centerIndex].col) > 4,
    )!;
    foundCityAt(state, 0, spot, seatOf(state, 0) ?? null);
    const built = state.units.filter((u) => u.type === 'BUILDER');
    expect(built.length).toBe(1);
    expect(built[0]!.tileIndex).toBe(spot.index);
  });

  it('a pillaged Plaza hands out nothing', () => {
    const { state, city } = cityWith('ANCESTRAL_HALL');
    state.map.tiles[city.centerIndex].districtPillaged = true;
    expect(cityBuildingSum(state, city, 'settlerProdPct')).toBe(0);
    expect(newCityGrantUnit(state, 0)).toBeNull();
  });
});

describe("the Warlord's Throne — the conquest window", () => {
  it('a capture opens five turns of +20% production in every city', () => {
    const state = makeState();
    const mine = settleFirstCity(state);
    mine.districts.push({ type: 'GOVERNMENT_PLAZA', tileIndex: mine.centerIndex });
    mine.buildings.push('WARLORDS_THRONE');
    expect(seatBuildingSum(state, 0, 'conquestProdTurns')).toBe(5);
    expect(seatBuildingSum(state, 0, 'conquestProdPct')).toBe(20);
    const me = seatOf(state, 0)!;
    expect(me.conquestProdTurns ?? 0).toBe(0);

    state.seats.push(emptySeat(1));
    const foe = seatOf(state, 1)!;
    const far = state.map.tiles.find(
      (t) => !t.district && t.terrain !== 'OCEAN' && t.terrain !== 'COAST'
        && Math.abs(t.col - state.map.tiles[mine.centerIndex].col) > 5,
    )!;
    const theirs = foundCityAt(state, 1, far, foe);
    transferCity(state, 1, me, theirs, 'conquered');
    expect(me.conquestProdTurns).toBe(5);
  });

  it('the window pays the queue and then ticks itself out', () => {
    const run = (open: boolean): number => {
      const state = makeState();
      const city = settleFirstCity(state);
      city.districts.push({ type: 'GOVERNMENT_PLAZA', tileIndex: city.centerIndex });
      city.buildings.push('WARLORDS_THRONE');
      if (open) seatOf(state, 0)!.conquestProdTurns = 5;
      city.population = 3;
      expect(queueSettler(state, city.id, 0).ok).toBe(true);
      endTurn(state);
      return city.queue[0]?.progress ?? 0;
    };
    const shut = run(false);
    expect(shut).toBeGreaterThan(0);
    expect(run(true)).toBeCloseTo(shut * 1.2, 9);

    // and the clock runs down one turn per turn
    const state = makeState();
    settleFirstCity(state);
    seatOf(state, 0)!.conquestProdTurns = 2;
    endTurn(state);
    expect(seatOf(state, 0)!.conquestProdTurns).toBe(1);
    endTurn(state);
    expect(seatOf(state, 0)!.conquestProdTurns).toBe(0);
    endTurn(state);
    expect(seatOf(state, 0)!.conquestProdTurns).toBe(0);
  });
});

describe('the National History Museum — four slots for any Great Work', () => {
  it('opens the pool to every kind, and shrinks as the pool fills', () => {
    const { state, city } = cityWith('NATIONAL_HISTORY_MUSEUM');
    expect(anyWorkFree(state, city)).toBe(4);
    // no Amphitheater: the writing slots are the pool's alone
    expect(gwCapacity(city, GW_WRITING, gwExtraSlots(state, GW_WRITING)(city))).toBe(4);
    gwGive(city, GW_WRITING, [-1, -1]);
    gwGive(city, GW_WRITING, [-1, -1]);
    expect(anyWorkFree(state, city)).toBe(2);
    expect(gwCapacity(city, GW_ART, gwExtraSlots(state, GW_ART)(city))).toBe(2);
    // a RELIC takes from the same pool
    expect(placeRelic([city], relicSlotsIn(state))).toBe(true);
    expect(city.relics).toBe(1);
    expect(anyWorkFree(state, city)).toBe(1);
  });

  it('a DEDICATED slot is spent before the pool is', () => {
    const { state, city } = cityWith('NATIONAL_HISTORY_MUSEUM', 'AMPHITHEATER');
    city.districts.push({ type: 'THEATER_SQUARE', tileIndex: city.centerIndex });
    // the Amphitheater's own two, then the pool's four
    expect(gwCapacity(city, GW_WRITING, gwExtraSlots(state, GW_WRITING)(city))).toBe(6);
    gwGive(city, GW_WRITING, [-1, -1]);
    gwGive(city, GW_WRITING, [-1, -1]);
    expect(gwCount(city, GW_WRITING)).toBe(2);
    expect(anyWorkFree(state, city)).toBe(4); // still nothing standing in the pool
    gwGive(city, GW_WRITING, [-1, -1]);
    expect(anyWorkFree(state, city)).toBe(3);
  });

  it('without the museum there is no pool at all', () => {
    const { state, city } = cityWith('AMPHITHEATER');
    city.districts.push({ type: 'THEATER_SQUARE', tileIndex: city.centerIndex });
    expect(anyWorkFree(state, city)).toBe(0);
    expect(gwCapacity(city, GW_WRITING, gwExtraSlots(state, GW_WRITING)(city))).toBe(2);
  });
});

describe('the War Department — 20 hit points off a kill', () => {
  it('heals the victor, and never past full', () => {
    const { state, city } = cityWith('WAR_DEPARTMENT');
    expect(seatBuildingSum(state, 0, 'healOnKill')).toBe(20);
    const u = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
    u.hp = 40;
    healOnEliminate(state, u);
    expect(u.hp).toBe(60);
    u.hp = UNIT_HP - 5;
    healOnEliminate(state, u);
    expect(u.hp).toBe(UNIT_HP);
  });

  it('pays nothing without the building, and nothing to a barbarian', () => {
    const { state, city } = cityWith();
    const u = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
    u.hp = 40;
    healOnEliminate(state, u);
    expect(u.hp).toBe(40);

    const armed = cityWith('WAR_DEPARTMENT');
    const barb = spawnUnit(armed.state, 'WARRIOR', armed.city.centerIndex, 200);
    if (barb) {
      barb.hp = 40;
      healOnEliminate(armed.state, barb);
      expect(barb.hp).toBe(40);
    }
  });

  it('a dead victor heals nothing', () => {
    const { state, city } = cityWith('WAR_DEPARTMENT');
    const u = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
    u.hp = 0;
    healOnEliminate(state, u);
    expect(u.hp).toBe(0);
  });
});
