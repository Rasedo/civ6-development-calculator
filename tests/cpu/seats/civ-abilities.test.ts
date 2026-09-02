import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs } from '../helpers';
import { emptySeat, setTileOwner, NO_SEAT } from '../../../cpu/core/seats';
import { spawnUnit, refreshUnits, stepUnit, waterEnterable, navalHeal, tradeWalkStep, tradeWaterLevel } from '../../../cpu/core/units';
import { routeChainGold } from '../../../cpu/core/trade';
import { levyGoldCost, transferCity, seatPhase } from '../../../cpu/core/phase';
import { floodTile } from '../../../cpu/core/disasters';
import { LEVY_GOLD_COST } from '../../../cpu/data/cityStates';
import { ITERU_RIVER_PROD_MULT } from '../../../cpu/data/civilizations';
import { CIV_IDS } from '../../../cpu/data/seats';
import { unitPromoRows } from '../../../cpu/core/promotions';
import type { GameState, TradeRoute, Unit } from '../../../cpu/core/types';

/**
 * THE CIVILIZATION ABILITIES (CIV6, the owner's install: Traits and their
 * Modifiers) — one clause per assertion, on the rule body that pays it.
 */
const civ = (id: string) => CIV_IDS.indexOf(id as never);

function holdHealAnywhere(unit: Unit): void {
  const k = unitPromoRows(unit).findIndex((p) => p.effects.some((e) => e.kind === 'HEAL_ANYWHERE'));
  expect(k).toBeGreaterThanOrEqual(0);
  unit.promos = (unit.promos ?? 0) | (1 << k);
}

describe('All Roads Lead to Rome', () => {
  function twoCities(state: GameState) {
    const cap = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
    const second = settleAt(state, tileAtCoords(state.map, 6, 1).index, 0);
    return { cap, second };
  }

  it('stamps a Trading Post and lays the road to the capital at every founding', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.seats[0].civ = civ('ROME');
    const { cap, second } = twoCities(state);
    expect(state.seats[0].tradingPosts).toEqual([cap.centerIndex, second.centerIndex].sort((a, b) => a - b));
    // the road is the Trader's own course, both ends included
    const water = tradeWaterLevel(state, 0);
    let at = second.centerIndex;
    const path = [at];
    while (at !== cap.centerIndex) {
      at = tradeWalkStep(state, at, cap.centerIndex, water);
      path.push(at);
    }
    expect(path.length).toBeGreaterThan(2);
    for (const i of path) expect(state.map.tiles[i].road).toBe(true);
    // nobody else gets either
    const other = makeState(makeMap(12, 12, 'GRASSLAND'));
    other.seats[0].civ = civ('EGYPT');
    const o = twoCities(other);
    expect(other.seats[0].tradingPosts ?? []).toEqual([]);
    expect(other.map.tiles[o.second.centerIndex].road ?? false).toBe(false);
  });

  it('does the same for a conquered city', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.seats.push(emptySeat(1));
    state.seats[0].civ = civ('ROME');
    state.seats[1].civ = civ('EGYPT');
    settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
    const theirs = settleAt(state, tileAtCoords(state.map, 2, 6).index, 1);
    expect(state.seats[0].tradingPosts).not.toContain(theirs.centerIndex);
    expect(transferCity(state, 1, state.seats[0], theirs, 'conquered')).toBe(true);
    expect(state.seats[0].tradingPosts).toContain(theirs.centerIndex);
    expect(state.map.tiles[theirs.centerIndex].road).toBe(true);
  });

  it('pays +1 Gold for a chain hop through an own city', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    const cap = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
    const route = { chain: [cap.centerIndex] } as TradeRoute;
    expect(routeChainGold(state, 0, route)).toBe(1);
    state.seats[0].civ = civ('ROME');
    expect(routeChainGold(state, 0, route)).toBe(2);
  });
});

describe('Iteru', () => {
  it('pays +15% Production to a district on a river tile', () => {
    const run = (id: string): number => {
      const state = makeState(makeMap(12, 12, 'GRASSLAND'));
      state.seats[0].civ = civ(id);
      const city = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
      const t = tileAtCoords(state.map, 7, 6);
      t.riverMask = 1;
      city.queue.push({ kind: 'district', district: 'CAMPUS', tileIndex: t.index, progress: 0 });
      seatPhase(state);
      return city.queue[0].progress;
    };
    const rome = run('ROME');
    expect(rome).toBeGreaterThan(0);
    expect(run('EGYPT')).toBe(rome * ITERU_RIVER_PROD_MULT);
    // off the river, nothing
    const dry = (id: string): number => {
      const state = makeState(makeMap(12, 12, 'GRASSLAND'));
      state.seats[0].civ = civ(id);
      const city = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
      city.queue.push({ kind: 'district', district: 'CAMPUS', tileIndex: tileAtCoords(state.map, 7, 6).index, progress: 0 });
      seatPhase(state);
      return city.queue[0].progress;
    };
    expect(dry('EGYPT')).toBe(dry('ROME'));
  });

  it("takes no flood damage on Egypt's ground; the flood still counts", () => {
    const run = (id: string) => {
      const state = makeState(makeMap(12, 12, 'GRASSLAND'));
      state.unitsMode = true;
      state.seats[0].civ = civ(id);
      const t = tileAtCoords(state.map, 5, 5);
      t.feature = 'FLOODPLAINS';
      t.riverMask = 1;
      setTileOwner(t, 0);
      const u = spawnUnit(state, 'WARRIOR', t.index, 0)!;
      floodTile(state, t, 2, false);
      return { hp: u.hp, count: t.floodCount ?? 0 };
    };
    const egypt = run('EGYPT');
    expect(egypt.hp).toBe(100);
    expect(egypt.count).toBe(1);
    expect(run('ROME').hp).toBeLessThan(100);
  });
});

describe('Knarr', () => {
  it('opens the Ocean at Shipbuilding for Norway alone', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.unitsMode = true;
    const ocean = tileAtCoords(state.map, 2, 2);
    ocean.terrain = 'OCEAN';
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 6).index, 0)!;
    state.seats[0].civ = civ('NORWAY');
    expect(waterEnterable(state, ocean, u)).toBe(false);
    grantTechs(state, 'SHIPBUILDING');
    expect(waterEnterable(state, ocean, u)).toBe(true);
    state.seats[0].civ = civ('ROME');
    expect(waterEnterable(state, ocean, u)).toBe(false);
    grantTechs(state, 'CARTOGRAPHY');
    expect(waterEnterable(state, ocean, u)).toBe(true);
  });

  it('embarks without the transition cost', () => {
    const run = (id: string): number => {
      const state = makeState(makeMap(12, 12, 'GRASSLAND'));
      state.unitsMode = true;
      state.seats[0].civ = civ(id);
      grantTechs(state, 'SHIPBUILDING');
      const sea = tileAtCoords(state.map, 6, 5);
      sea.terrain = 'COAST';
      const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 6).index, 0)!;
      // 'halted' is a completed step with nothing left to spend
      expect(['moved', 'halted']).toContain(stepUnit(state, u, sea));
      expect(u.tileIndex).toBe(sea.index);
      return u.movesLeft;
    };
    expect(run('ROME')).toBe(0);
    expect(run('NORWAY')).toBeGreaterThan(0);
  });

  it('heals naval melee +10 in neutral waters, on top of the naval heal table', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const sea = tileAtCoords(state.map, 5, 5);
    const galley = spawnUnit(state, 'GALLEY', sea.index, 0)!;
    // CIV6 (COMBAT_HEAL_NAVAL_FRIENDLY 20 / NEUTRAL 0 / ENEMY 0)
    expect(navalHeal(state, galley, true, false)).toBe(20);
    expect(navalHeal(state, galley, false, true)).toBe(0);
    expect(navalHeal(state, galley, false, false)).toBe(0);
    state.seats[0].civ = civ('NORWAY');
    expect(navalHeal(state, galley, false, true)).toBe(10);
    expect(navalHeal(state, galley, false, false)).toBe(0);
    holdHealAnywhere(galley);
    expect(navalHeal(state, galley, false, true)).toBe(20);
    expect(navalHeal(state, galley, false, false)).toBe(5);
    // a ranged hull is not melee
    const frigate = spawnUnit(state, 'FRIGATE', tileAtCoords(state.map, 8, 8).index, 0)!;
    expect(navalHeal(state, frigate, false, true)).toBe(0);
    // end to end: the refresh reads the table
    galley.promos = 0;
    galley.hp = 50;
    expect(sea.ownerSeat).toBe(NO_SEAT);
    refreshUnits(state);
    expect(galley.hp).toBe(60);
  });
});

describe('Epic Quest', () => {
  it('levies at half price', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    expect(levyGoldCost(state, 0)).toBe(LEVY_GOLD_COST);
    state.seats[0].civ = civ('SUMERIA');
    expect(levyGoldCost(state, 0)).toBe(LEVY_GOLD_COST / 2);
  });
});
