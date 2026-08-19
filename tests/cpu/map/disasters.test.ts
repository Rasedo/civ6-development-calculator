import { describe, it, expect } from 'vitest';
import { setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, bareCtx } from '../helpers';
import { foundCity, endTurn, serialize, deserialize } from '../../../cpu/core/game';
import { disasterPhase, FERTILITY_CAP } from '../../../cpu/core/disasters';
import { tileYields } from '../../../cpu/core/yields';
import { generateMap } from '../../../world/mapgen';

describe('disasters', () => {
  it('volcanoes exist on generated maps', () => {
    const map = generateMap({ width: 44, height: 26, seed: 42 });
    const volcanoes = map.tiles.filter((t) => t.volcano);
    expect(volcanoes.length).toBeGreaterThan(0);
    for (const v of volcanoes) expect(v.elevation).toBe('MOUNTAIN');
  });

  it('eruptions scorch and fertilize the slopes', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const volcano = tileAtCoords(state.map, 8, 8);
    volcano.elevation = 'MOUNTAIN';
    volcano.volcano = true;
    const slope = tileAtCoords(state.map, 9, 8);
    slope.improvement = 'FARM';
    setTileOwner(slope, 0);

    let guard = 0;
    while (!slope.pillaged && guard++ < 600) disasterPhase(state);
    expect(slope.pillaged).toBe(true);
    expect(slope.fertility).toBeGreaterThanOrEqual(1);
    expect(state.eventLog.some((e) => e.includes('eruption'))).toBe(true);

    // fertility is capped
    slope.fertility = FERTILITY_CAP;
    const before = slope.fertility;
    for (let i = 0; i < 200; i++) disasterPhase(state);
    expect(slope.fertility).toBe(before);
  });

  it('a flood pillages the district on the floodplain, not just the improvement', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const plain = tileAtCoords(state.map, 4, 4);
    plain.feature = 'FLOODPLAINS';
    plain.district = 'CAMPUS';
    plain.districtComplete = true;
    setTileOwner(plain, 0);

    let guard = 0;
    while (!plain.districtPillaged && guard++ < 600) disasterPhase(state);
    expect(plain.districtPillaged).toBe(true);
    expect(state.eventLog.some((e) => e.includes('Flood'))).toBe(true);
  });

  it('a flood leaves an UNFINISHED district and a city centre alone', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const site = tileAtCoords(state.map, 4, 4);
    site.feature = 'FLOODPLAINS';
    site.district = 'CAMPUS'; // queued, not complete
    const centre = tileAtCoords(state.map, 6, 6);
    centre.feature = 'FLOODPLAINS';
    centre.district = 'CITY_CENTER';
    centre.districtComplete = true;

    for (let i = 0; i < 600; i++) disasterPhase(state);
    // both tiles were flooded many times over (the silt proves it landed)
    expect(site.fertility).toBeGreaterThan(0);
    expect(centre.fertility).toBeGreaterThan(0);
    expect(site.districtPillaged).toBeFalsy();
    expect(centre.districtPillaged).toBeFalsy();
  });

  it('fertility adds food; drought subtracts and expires', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    expect(tileYields(bareCtx(map), t).food).toBe(2);
    t.fertility = 2;
    expect(tileYields(bareCtx(map), t).food).toBe(4);
    t.droughtTurns = 3;
    expect(tileYields(bareCtx(map), t).food).toBe(3);

    const state = makeState(map);
    state.disasters = true;
    disasterPhase(state);
    expect(t.droughtTurns).toBe(2);
  });

  it('is reproducible and inert when toggled off', () => {
    const mk = () => {
      const state = makeState(makeMap(18, 18));
      state.disasters = true;
      tileAtCoords(state.map, 4, 4).feature = 'FLOODPLAINS';
      tileAtCoords(state.map, 4, 4).terrain = 'DESERT';
      foundCity(state, tileAtCoords(state.map, 9, 9).index, 0);
      return state;
    };
    const a = mk();
    const b = deserialize(serialize(mk()));
    for (let i = 0; i < 30; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));

    const calm = makeState(makeMap(18, 18));
    foundCity(calm, tileAtCoords(calm.map, 9, 9).index, 0);
    for (let i = 0; i < 30; i++) endTurn(calm);
    expect(calm.eventLog.length).toBe(0);
    expect(calm.map.tiles.every((t) => t.fertility === 0 && t.droughtTurns === 0)).toBe(true);
  });
});
