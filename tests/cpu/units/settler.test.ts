import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';

import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity, queueSettler, settlerCost, endTurn } from '../../../cpu/core/game';
import { computeCityStats } from '../../../cpu/core/city';
import { settlerCount, spawnUnit } from '../../../cpu/core/units';

describe('settlers', () => {
  it('the settler is a UNIT: training spawns it, founding stands on the tile and consumes it', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    const aTile = tileAtCoords(state.map, 6, 9);
    spawnUnit(state, 'SETTLER', aTile.index, 0);
    const a = foundCity(state, aTile.index, 0).city!; // consumes the starting settler
    expect(settlerCount(state, 0)).toBe(0);
    expect(settlerCost(state, 0)).toBe(48); // 80 × GAME_SPEED

    // a second founding needs a settler STANDING on the tile
    expect(foundCity(state, tileAtCoords(state.map, 12, 9).index, 0).ok).toBe(false);

    // a 1-pop city may not train one (completion costs the pop)
    expect(queueSettler(state, a.id, 0).ok).toBe(false);
    a.population = 2;
    expect(queueSettler(state, a.id, 0).ok).toBe(true);
    expect(settlerCost(state, 0)).toBe(66); // queued settler raises the next price (+18)
    const prod = computeCityStats(state, a).total.production;
    const turns = Math.ceil(48 / prod);
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
