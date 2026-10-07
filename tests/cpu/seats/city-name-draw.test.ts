import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { CITY_NAME_DRAW } from '../../../cpu/data/constants';
import { LCG_ADD, LCG_MUL } from '../../../cpu/core/rand';
import { spawnUnit } from '../../../cpu/core/units';
import { stormNamer } from '../../../cpu/core/disasters';
import { CIV_LEADERS, CITIZEN_NAME_ROWS } from '../../../cpu/data/seats';

/**
 * "Choosing a City Name" (GameCore_XP2 0x327c30 -> 0x328de0): a major's city
 * past its capital takes ONE draw over 55 — the first 10 unused names
 * weighted 10 .. 1; the capital takes its leader's CapitalName with no draw
 * (runs/h1_duelw1117 and 1118: 21 of 21 foundings past a capital).
 * "Choosing a Citizen Name" (0x486c20): a major's Spy at its birth and a storm
 * named for a major take ONE draw over the civilization's citizen names left.
 *
 * The GPU twin is tests/gpu/city_name_draw_test.py.
 */
const lcg = (s: number) => (Math.imul(LCG_MUL, s) + LCG_ADD) >>> 0;

describe("a city's and a citizen's name draws", () => {
  it('draws over 55 for a city past the capital, nothing for the capital', () => {
    expect(CITY_NAME_DRAW).toBe(55);
    const state = makeState(makeMap(20, 20, 'GRASSLAND'));
    state.rngState = 12345;
    settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
    expect(state.rngState).toBe(12345);
    settleAt(state, tileAtCoords(state.map, 12, 12).index, 0);
    expect(state.rngState).toBe(lcg(12345));
  });

  it("names a Spy from its civilization's citizen names left, one draw each", () => {
    expect(CITIZEN_NAME_ROWS).toBe(40);
    const state = makeState(makeMap(20, 20, 'GRASSLAND'));
    state.unitsMode = true;
    state.seats[0].civ = CIV_LEADERS.findIndex((l) => l.civ === 'CHINA');
    settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
    state.rngState = 777;
    spawnUnit(state, 'SPY', tileAtCoords(state.map, 3, 3).index, 0);
    expect(state.rngState).toBe(lcg(777));
    expect(state.seats[0].citizenNames).toBe(1);
    // a seat with no civilization names nobody
    state.seats[0].civ = -1;
    spawnUnit(state, 'SPY', tileAtCoords(state.map, 3, 3).index, 0);
    expect(state.rngState).toBe(lcg(777));
  });

  it("names a storm for the plot's major, else the nearest major city's", () => {
    const state = makeState(makeMap(20, 20, 'GRASSLAND'));
    settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
    expect(stormNamer(state, tileAtCoords(state.map, 3, 4))).toBe(0);
    expect(stormNamer(state, tileAtCoords(state.map, 15, 15))).toBe(0);
    state.seats[0].cities = [];
    expect(stormNamer(state, tileAtCoords(state.map, 15, 15))).toBe(-1);
  });
});
