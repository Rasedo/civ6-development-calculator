import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';

import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity, settlerCost, endTurn } from '../../../cpu/core/game';
import { applySeatActionRecord } from '../../../cpu/core/phase';
import { prodLayout } from '../../../cpu/core/prodLayout';
import { computeCityStats } from '../../../cpu/core/city';
import { settlerCount, spawnUnit } from '../../../cpu/core/units';
import { scaleByGameSpeed } from '../../../cpu/data/constants';
import { SETTLER_COST_STEP, UNITS } from '../../../cpu/data/units';

// the Units row's Cost 80 and CostProgressionParam1 30, each at the speed
const BASE = UNITS.SETTLER.cost;
const STEP = scaleByGameSpeed(SETTLER_COST_STEP);

describe('settlers', () => {
  it('the settler is a UNIT: training spawns it, founding stands on the tile and consumes it', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const aTile = tileAtCoords(state.map, 6, 9);
    spawnUnit(state, 'SETTLER', aTile.index, 0);
    const a = foundCity(state, aTile.index, 0).city!; // consumes the starting settler
    expect(settlerCount(state, 0)).toBe(0);
    expect(BASE).toBe(scaleByGameSpeed(80));
    expect(settlerCost(state, 0)).toBe(BASE);

    // a second founding needs a settler STANDING on the tile
    expect(foundCity(state, tileAtCoords(state.map, 12, 9).index, 0).ok).toBe(false);

    // a 1-pop city may not train one (completion costs the pop): the
    // record's settler column is refused, then taken
    const trainSettler = () => applySeatActionRecord(state, seatOf(state, 0)!, {
      production: [[a.centerIndex, prodLayout().NB]], tech: null, civic: null, units: [],
    });
    trainSettler();
    expect(a.queue.length).toBe(0);
    a.population = 2;
    trainSettler();
    expect(a.queue[0]?.kind).toBe('settler');
    expect(settlerCost(state, 0)).toBe(BASE + STEP); // a queued settler raises the next price
    const prod = computeCityStats(state, a).total.production;
    const turns = Math.ceil(BASE / prod);
    for (let i = 0; i < turns; i++) endTurn(state);
    expect(settlerCount(state, 0)).toBe(1); // completion SPAWNED the unit at the city

    // walked to the site, FOUND consumes it
    const settler = state.units.find((u) => u.type === 'SETTLER')!;
    settler.tileIndex = tileAtCoords(state.map, 12, 9).index;
    expect(foundCity(state, settler.tileIndex, 0).ok).toBe(true);
    expect(settlerCount(state, 0)).toBe(0);
    expect(seatOf(state, 0)!.cities.length).toBe(2);
  });
});
