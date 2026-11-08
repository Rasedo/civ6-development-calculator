/**
 * THE PLUNDER SEAT ACTION (UNITCOMMAND_PLUNDER_TRADE_ROUTE): a military unit
 * on the Trader's own tile, at war with its owner, plunders it — the mask
 * column and the seat order (`plunderTrader`). Lisbon's suzerain's Traders
 * stand immune on water (ABILITY_TRADE_ROUTE_PLUNDER_IMMUNITY_SEA).
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { emptySeat, seatOf, seatOfCityState, setTileOwner, setWar } from '../../../cpu/core/seats';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { PLUNDER_ROUTE_GOLD, plunderTrader } from '../../../cpu/core/trade';
import { maskCtx, unitMask } from '../../../cpu/core/unitMask';
import { IMPROVEMENT_IDS, unitActionIndex } from '../../../cpu/core/unitActions';
import { SUZERAIN_ENVOYS } from '../../../cpu/data/cityStates';
import type { GameState, Seat } from '../../../cpu/core/types';

const ACT = unitActionIndex(IMPROVEMENT_IDS);

/** seats 0 and 1 on an open grassland */
function scene(): GameState {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  return state;
}

describe('the PLUNDER column', () => {
  it('is offered on an enemy Trader\'s own tile at war, and the order plunders it', () => {
    const state = scene();
    const at = tileAtCoords(state.map, 6, 5).index;
    const w = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    const trader = spawnUnit(state, 'TRADER', at, 1)!;
    trader.tileIndex = at;
    // beside it: none
    setWar(state, 0, 1, true);
    expect(unitMask(maskCtx(state, 0), w)).not.toContain(ACT.PLUNDER);
    w.tileIndex = at;
    expect(unitMask(maskCtx(state, 0), w)).toContain(ACT.PLUNDER);
    // at peace: none
    setWar(state, 0, 1, false);
    expect(unitMask(maskCtx(state, 0), w)).not.toContain(ACT.PLUNDER);
    setWar(state, 0, 1, true);
    const before = seatOf(state, 0)!.treasury;
    applySeatUnitOrders(state, seatOf(state, 0) as Seat, [state.units.filter((u) => u.seat === 0).map((u) => (u === w ? ACT.PLUNDER : -1))]);
    expect(state.units).not.toContain(trader);
    expect(seatOf(state, 0)!.treasury - before).toBe(PLUNDER_ROUTE_GOLD);
    expect(w.movesLeft).toBe(0);
  });
});

describe("Lisbon's suzerain", () => {
  it('holds its Traders immune to plunder on water, not on land', () => {
    const state = scene();
    setWar(state, 0, 1, true);
    const minor = seatOfCityState(0);
    const centre = tileAtCoords(state.map, 15, 15);
    state.cityStates.push({
      ...emptySeat(minor), id: 0, name: 'Lisbon', type: 'trade',
      centerIndex: centre.index, population: 3, envoys: { 1: SUZERAIN_ENVOYS }, met: [1],
    });
    setTileOwner(centre, minor);
    const sea = tileAtCoords(state.map, 6, 5);
    sea.terrain = 'COAST';
    const ship = spawnUnit(state, 'GALLEY', sea.index, 0)!;
    ship.tileIndex = sea.index;
    const t1 = spawnUnit(state, 'TRADER', sea.index, 1)!;
    t1.tileIndex = sea.index;
    t1.embarked = true;
    expect(unitMask(maskCtx(state, 0), ship)).not.toContain(ACT.PLUNDER);
    expect(plunderTrader(state, ship).ok).toBe(false);
    const land = tileAtCoords(state.map, 9, 9).index;
    const w = spawnUnit(state, 'WARRIOR', land, 0)!;
    w.tileIndex = land;
    const t2 = spawnUnit(state, 'TRADER', land, 1)!;
    t2.tileIndex = land;
    expect(unitMask(maskCtx(state, 0), w)).toContain(ACT.PLUNDER);
    expect(plunderTrader(state, w).ok).toBe(true);
    // with no suzerain the water Trader is plundered
    state.cityStates[0].envoys = {};
    expect(plunderTrader(state, ship).ok).toBe(true);
    expect(state.units).not.toContain(t1);
  });
});
