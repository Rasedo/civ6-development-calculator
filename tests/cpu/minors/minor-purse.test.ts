/**
 * THE MINOR'S PURSE AND ITS WALKER (C-38's census): its units' upkeep, the
 * Builder and military purchases at the fitted rates, the Warrior Monk bought
 * with Faith, the upgrade a research completion triggers, and the walk of its
 * land military. The GPU twin is tests/gpu/minor_purse_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOf, seatOfCityState, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { minorCity } from '../../../cpu/core/cityStates';
import { minorAccrue, minorPlan, minorPurchases, minorUpgrades } from '../../../cpu/core/minorBuild';
import { walkUnit } from '../../../cpu/core/walker';
import { computeCityStats } from '../../../cpu/core/city';
import { builderCost, spawnUnit } from '../../../cpu/core/units';
import { purchaseStep } from '../../../cpu/core/effects';
import { nextRandom } from '../../../cpu/core/rand';
import {
  MINOR_BUILDER_BUY_SLOTS, MINOR_LOSS_BUY_MULT, MINOR_MILITARY_BUY_BP, MINOR_MILITARY_BUY_FLOOR,
  MINOR_UPGRADE_GOLD,
} from '../../../cpu/data/cityStates';
import { FAITH_PURCHASE_MULT, GOLD_PURCHASE_MULT } from '../../../cpu/data/constants';
import { UNITS } from '../../../cpu/data/units';
import { hexDistance, neighbors, tilesWithin } from '../../../world/hex';
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

/** A minor at (6, 6) of a 14x14 grassland, its episode's draws made. */
function scene(): { state: GameState; cs: CityState } {
  const state = makeState(makeMap(14, 14));
  const cs = addCs(state, 6, 6);
  cs.armyCap = 3;
  cs.buildFrom = [];
  cs.builderBuyRate = 1000;
  return { state, cs };
}

const army = (state: GameState, cs: CityState): Unit[] => state.units.filter((u) => u.seat === cs.seat);

/** Set the stream so its next draw satisfies `pred`. */
function seek(state: GameState, pred: (r: number) => boolean): void {
  for (let s = 1; s < 1_000_000; s++) {
    state.rngState = s;
    if (pred(nextRandom(state))) {
      state.rngState = s;
      return;
    }
  }
  throw new Error('no stream state draws that');
}

describe("a city-state's purse", () => {
  it('draws the Builder purchase rate once, with the episode', () => {
    const state = makeState(makeMap(14, 14));
    const cs = addCs(state, 6, 6);
    minorPlan(state, cs);
    expect(MINOR_BUILDER_BUY_SLOTS).toContain(cs.builderBuyRate);
    const rate = cs.builderBuyRate;
    const rng = state.rngState;
    minorPlan(state, cs);
    expect(cs.builderBuyRate).toBe(rate);
    expect(state.rngState).toBe(rng);
  });

  it("pays its units' upkeep out of the city's Gold and stops at 0", () => {
    const { state, cs } = scene();
    spawnUnit(state, 'SWORDSMAN', cs.centerIndex, cs.seat);
    spawnUnit(state, 'ARCHER', cs.centerIndex, cs.seat);
    const upkeep = UNITS.SWORDSMAN.maintenance! + UNITS.ARCHER.maintenance!;
    expect(upkeep).toBeGreaterThan(0);
    const gold = computeCityStats(state, minorCity(cs)).total.gold;
    cs.treasury = 10;
    minorAccrue(state, cs);
    expect(cs.treasury).toBeCloseTo(Math.max(0, 10 + gold - upkeep), 9);
    cs.treasury = 0;
    minorAccrue(state, cs);
    expect(cs.treasury).toBe(Math.max(0, gold - upkeep));
    expect(cs.treasury).toBeGreaterThanOrEqual(0);
  });

  it('buys a Builder when none stands and the treasury covers it, at the episode rate', () => {
    const { state, cs } = scene();
    const price = purchaseStep(builderCost(state, cs.seat) * GOLD_PURCHASE_MULT);
    cs.treasury = price + 50;
    minorPurchases(state, cs);
    expect(army(state, cs).filter((u) => u.type === 'BUILDER').length).toBe(1);
    expect(cs.treasury).toBe(50);
    expect(cs.buildersTrained).toBe(1);
    // one stands now: no second, and no draw for it
    cs.treasury = 1000;
    minorPurchases(state, cs);
    expect(army(state, cs).filter((u) => u.type === 'BUILDER').length).toBe(1);
  });

  it('draws for a Builder but buys none at a rate of 0, and asks no draw it cannot pay', () => {
    const { state, cs } = scene();
    cs.builderBuyRate = 0;
    cs.treasury = 500;
    const rng = state.rngState;
    minorPurchases(state, cs);
    expect(army(state, cs).length).toBe(0);
    expect(state.rngState).not.toBe(rng);
    cs.treasury = 10;
    const rng2 = state.rngState;
    minorPurchases(state, cs);
    expect(state.rngState).toBe(rng2);
  });

  it("buys the army row's chassis at its military count's rate, above the floor", () => {
    const { state, cs } = scene();
    spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat);
    spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat);
    const bp = MINOR_MILITARY_BUY_BP[1];
    // a treasury under the floor asks no draw
    cs.treasury = MINOR_MILITARY_BUY_FLOOR - 1;
    const rng = state.rngState;
    minorPurchases(state, cs);
    expect(state.rngState).toBe(rng);
    // a draw above the rate buys nothing
    cs.treasury = 500;
    seek(state, (r) => Math.floor(r * 10000) >= bp);
    minorPurchases(state, cs);
    expect(army(state, cs).length).toBe(2);
    // a draw under it buys the army row's pick — the ranged class the army
    // lacks, its strongest chassis the minor's research opens
    seek(state, (r) => Math.floor(r * 10000) < bp);
    minorPurchases(state, cs);
    const bought = army(state, cs).filter((u) => u.type === 'SLINGER');
    expect(bought.length).toBe(1);
    expect(cs.treasury).toBe(500 - purchaseStep(UNITS.SLINGER.cost * GOLD_PURCHASE_MULT));
  });

  it('buys at three times the rate within the turns after a loss, and never at eight or more', () => {
    const { state, cs } = scene();
    spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat);
    spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat);
    const bp = MINOR_MILITARY_BUY_BP[1];
    cs.treasury = 500;
    cs.lossTurn = state.turn - 1;
    seek(state, (r) => Math.floor(r * 10000) >= bp && Math.floor(r * 10000) < bp * MINOR_LOSS_BUY_MULT);
    minorPurchases(state, cs);
    expect(army(state, cs).length).toBe(3);
    // eight military units: no draw at all
    for (const t of tilesWithin(state.map, 6, 6, 2)) {
      if (army(state, cs).filter((u) => u.type !== 'BUILDER').length >= 8) break;
      spawnUnit(state, 'WARRIOR', t.index, cs.seat);
    }
    expect(army(state, cs).filter((u) => u.type !== 'BUILDER').length).toBe(8);
    const rng = state.rngState;
    minorPurchases(state, cs);
    expect(state.rngState).toBe(rng);
  });

  it('buys a Warrior Monk with Faith where its majority religion carries Warrior Monks', () => {
    const { state, cs } = scene();
    spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat);
    const founder = seatOf(state, 0)!;
    founder.religion.founded = true;
    founder.religion.follower = 'WARRIOR_MONKS';
    cs.religionPressure = [100_000];
    cs.buildings = ['SHRINE', 'TEMPLE'];
    const hs = neighbors(state.map, state.map.tiles[cs.centerIndex])[0];
    hs.district = 'HOLY_SITE';
    hs.districtComplete = true;
    cs.districts = [{ type: 'HOLY_SITE', tileIndex: hs.index }];
    const price = purchaseStep(Math.round(UNITS.WARRIOR_MONK.cost * FAITH_PURCHASE_MULT));
    cs.faith = price + 7;
    cs.treasury = 0; // the monk needs no gold floor
    seek(state, (r) => Math.floor(r * 10000) < MINOR_MILITARY_BUY_BP[0]);
    minorPurchases(state, cs);
    expect(army(state, cs).filter((u) => u.type === 'WARRIOR_MONK').length).toBe(1);
    expect(cs.faith).toBe(7);
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
    const off = state.map.tiles.find((t) => tileSeat(t) < 0 && hexDistance(t.col, t.row, 6, 6) === 4)!;
    a.tileIndex = off.index;
    minorUpgrades(state, cs, 1);
    expect(a.type).toBe('WARRIOR');
  });
});

describe('the walker', () => {
  it('walks one step to the ring the weights ask for, on two draws', () => {
    const { state, cs } = scene();
    const u = spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat)!;
    expect(u.tileIndex).toBe(cs.centerIndex);
    const ctr = state.map.tiles[cs.centerIndex];
    walkUnit(state, u, [cs.centerIndex], [0, 1000, 0, 0], [0, 1000]);
    const at = state.map.tiles[u.tileIndex];
    expect(hexDistance(at.col, at.row, ctr.col, ctr.row)).toBe(1);
    // and back home when only home weighs anything
    u.movesLeft = u.movesFull ?? 2;
    walkUnit(state, u, [cs.centerIndex], [0, 1000, 0, 0], [1000]);
    expect(u.tileIndex).toBe(cs.centerIndex);
  });

  it('stands still on a step of 0, with one draw', () => {
    const { state, cs } = scene();
    const u = spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat)!;
    const s0 = state.rngState;
    walkUnit(state, u, [cs.centerIndex], [1000, 0, 0, 0], [1000]);
    expect(u.tileIndex).toBe(cs.centerIndex);
    state.rngState = s0;
    nextRandom(state);
    const s1 = state.rngState;
    state.rngState = s0;
    walkUnit(state, u, [cs.centerIndex], [1000, 0, 0, 0], [1000]);
    expect(state.rngState).toBe(s1);
  });

  it("never steps onto a tile a foreign unit holds, nor into another's city centre", () => {
    const { state, cs } = scene();
    const u = spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat)!;
    const ring = neighbors(state.map, state.map.tiles[cs.centerIndex]);
    for (const t of ring) spawnUnit(state, 'WARRIOR', t.index, 0);
    walkUnit(state, u, [cs.centerIndex], [0, 1000, 0, 0], [0, 1000]);
    expect(u.tileIndex).toBe(cs.centerIndex);
  });
});
