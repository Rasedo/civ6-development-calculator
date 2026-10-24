/**
 * THE MINOR'S PURSE: its units' upkeep, the units a threatened city buys
 * (the Economic AI's savings in `minorMilitaryTurn`, `minorAiTurn`'s
 * purchases: TryPurchaseUnits over the city's unit list) and the upgrade a
 * research completion
 * triggers. The GPU twin is tests/gpu/minor_purse_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { BARB_SEAT, emptySeat, seatOfCityState, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { minorCity } from '../../../cpu/core/cityStates';
import { minorEconomy, minorUpgrades } from '../../../cpu/core/minorBuild';
import { minorAiTurn, minorMilitaryTurn, minorThreat } from '../../../cpu/core/minorCityAi';
import { computeCityStats } from '../../../cpu/core/city';
import { spawnUnit } from '../../../cpu/core/units';
import { MINOR_UPGRADE_GOLD } from '../../../cpu/data/cityStates';
import { UNITS } from '../../../cpu/data/units';
import { hexDistance, tilesWithin } from '../../../world/hex';
import type { CityState, GameState, Unit } from '../../../cpu/core/types';

function addCs(state: GameState, col: number, row: number): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length, name: `CS${state.cityStates.length}`, type: 'religious',
    centerIndex: center.index, population: 5, envoys: {}, met: [0],
  };
  for (const t of tilesWithin(state.map, col, row, 2)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  state.cityStateMax = Math.max(state.cityStateMax ?? 0, cityState.id + 1);
  return cityState;
}

/** A minor at (6, 6) of a 14x14 grassland. */
function scene(): { state: GameState; cs: CityState } {
  const state = makeState(makeMap(14, 14));
  const cs = addCs(state, 6, 6);
  return { state, cs };
}

const army = (state: GameState, cs: CityState): Unit[] => state.units.filter((u) => u.seat === cs.seat);

describe("a city-state's purse", () => {
  it("pays its units' upkeep out of the city's Gold and stops at 0", () => {
    const { state, cs } = scene();
    spawnUnit(state, 'SWORDSMAN', cs.centerIndex, cs.seat);
    spawnUnit(state, 'ARCHER', cs.centerIndex, cs.seat);
    const upkeep = UNITS.SWORDSMAN.maintenance! + UNITS.ARCHER.maintenance!;
    expect(upkeep).toBeGreaterThan(0);
    const gold = computeCityStats(state, minorCity(cs)).total.gold;
    cs.treasury = 10;
    minorEconomy(state, cs);
    expect(cs.treasury).toBeCloseTo(Math.max(0, 10 + gold - upkeep), 9);
    cs.treasury = 0;
    minorEconomy(state, cs);
    expect(cs.treasury).toBe(Math.max(0, gold - upkeep));
    expect(cs.treasury).toBeGreaterThanOrEqual(0);
  });

  it('a city its knowledge base sees a barbarian army beside is threatened, and buys its list\'s first unit while its savings meet it', () => {
    const { state, cs } = scene();
    state.turn = 5;
    cs.treasury = 2000;
    const ring = tilesWithin(state.map, 6, 6, 2).filter((t) => hexDistance(state.map, t.col, t.row, 6, 6) === 2);
    cs.armyKnown = ring.slice(0, 6).map((t, i) => ({ id: 900 + i, owner: BARB_SEAT, type: 'HORSEMAN', seen: 5, plot: t.index, damage: 0 }));
    expect(minorThreat(state, cs).level).toBeGreaterThan(-1);
    minorMilitaryTurn(state, cs);
    minorAiTurn(state, cs, true);
    expect(cs.threat).toBeGreaterThan(-1);
    expect(army(state, cs).length).toBeGreaterThan(0);
    expect(cs.treasury).toBeLessThan(2000);
  });

  it('an unthreatened city buys nothing', () => {
    const { state, cs } = scene();
    state.turn = 5;
    cs.treasury = 2000;
    minorMilitaryTurn(state, cs);
    minorAiTurn(state, cs, true);
    expect(cs.threat).toBe(-1);
    expect(army(state, cs)).toEqual([]);
    expect(cs.treasury).toBe(2000);
  });
});

describe("a city-state's upgrades", () => {
  it('upgrades one unit per research completion, first in unit order, for the flat price', () => {
    const { state, cs } = scene();
    cs.research.techs.push('BRONZE_WORKING', 'MINING', 'IRON_WORKING');
    const a = spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat)!;
    const b = spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat)!;
    cs.treasury = 20;
    minorUpgrades(state, cs, 1);
    expect(a.type).toBe(UNITS.WARRIOR.upgradesTo);
    expect(a.movesLeft).toBe(0);
    expect(b.type).toBe('WARRIOR');
    expect(cs.treasury).toBe(20 - MINOR_UPGRADE_GOLD);
    // two completions: the next, and none past the treasury
    cs.treasury = MINOR_UPGRADE_GOLD - 1;
    minorUpgrades(state, cs, 2);
    expect(b.type).toBe('WARRIOR');
    cs.treasury = 100;
    minorUpgrades(state, cs, 2);
    expect(b.type).toBe(UNITS.WARRIOR.upgradesTo);
    expect(cs.treasury).toBe(100 - MINOR_UPGRADE_GOLD);
  });

  it('asks the minor research for the new chassis, and its own ground under the unit', () => {
    const { state, cs } = scene();
    const a = spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat)!;
    cs.treasury = 100;
    minorUpgrades(state, cs, 1);
    expect(a.type).toBe('WARRIOR');
    cs.research.techs.push('BRONZE_WORKING', 'MINING', 'IRON_WORKING');
    const off = state.map.tiles.find((t) => tileSeat(t) < 0 && hexDistance(state.map, t.col, t.row, 6, 6) === 4)!;
    a.tileIndex = off.index;
    minorUpgrades(state, cs, 1);
    expect(a.type).toBe('WARRIOR');
  });
});
