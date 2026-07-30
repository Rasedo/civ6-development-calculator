import { describe, it, expect } from 'vitest';
import { PLAYER_CIV, setTileOwner } from '../src/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs } from './helpers';
import { scoreDistrictSpots, scoreSettleSites, projectTurns, compareCandidates } from '../src/core/advisor';
import { foundCity } from '../src/core/game';
import { hexDistance } from '../src/core/hex';

describe('district spot advisor', () => {
  it('ranks the high-adjacency tile first and reports its bonus', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    grantTechs(state, 'WRITING');
    tileAtCoords(state.map, 10, 8).elevation = 'MOUNTAIN'; // adjacent to (9,8)
    tileAtCoords(state.map, 9, 7).elevation = 'MOUNTAIN'; // adjacent to (9,8)

    const spots = scoreDistrictSpots(state, city, 'CAMPUS');
    expect(spots.length).toBeGreaterThan(0);
    expect(spots[0].tileIndex).toBe(tileAtCoords(state.map, 9, 8).index);
    expect(spots[0].adjacency).toBe(2);
  });

  it('prefers paving worthless tiles when adjacency is equal', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    grantTechs(state, 'WRITING');
    const desert = tileAtCoords(state.map, 7, 8);
    desert.terrain = 'DESERT'; // 0 yields vs grassland 2 food

    const spots = scoreDistrictSpots(state, city, 'CAMPUS');
    const desertScore = spots.find((s) => s.tileIndex === desert.index)!;
    const grassScore = spots.find((s) => s.tileIndex === tileAtCoords(state.map, 8, 7).index)!;
    expect(desertScore.adjacency).toBe(grassScore.adjacency);
    expect(desertScore.score).toBeGreaterThan(grassScore.score);
  });
});

describe('settle-site advisor', () => {
  it('prefers fresh water sites', () => {
    const state = makeState(makeMap(20, 20));
    tileAtCoords(state.map, 5, 5).terrain = 'LAKE';
    const sites = scoreSettleSites(state, 5);
    expect(sites.length).toBe(5);
    expect(sites[0].housing).toBe(10);
    const top = state.map.tiles[sites[0].tileIndex];
    expect(hexDistance(top.col, top.row, 5, 5)).toBe(1); // hugging the lake
  });

  it('is pulled toward unclaimed luxuries, less so toward owned ones', () => {
    const state = makeState(makeMap(20, 20));
    tileAtCoords(state.map, 10, 10).resource = 'WINE';
    let sites = scoreSettleSites(state, 1);
    let top = state.map.tiles[sites[0].tileIndex];
    expect(hexDistance(top.col, top.row, 10, 10)).toBeLessThanOrEqual(3);
    expect(sites[0].resourceScore).toBe(5); // new luxury

    // Same luxury type already inside someone's borders -> lower pull.
    const owned = tileAtCoords(state.map, 2, 2);
    owned.resource = 'WINE';
    setTileOwner(owned, PLAYER_CIV, 99);
    sites = scoreSettleSites(state, 1);
    expect(sites[0].resourceScore).toBe(3);
  });

  it('only returns legal founding sites', () => {
    const state = makeState(makeMap(20, 20));
    foundCity(state, tileAtCoords(state.map, 10, 10).index);
    for (const s of scoreSettleSites(state, 20)) {
      const t = state.map.tiles[s.tileIndex];
      expect(hexDistance(t.col, t.row, 10, 10)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('build projections', () => {
  it('a monument beats building nothing on culture, without touching the real state', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;

    const idle = projectTurns(state, city.id, { kind: 'none' }, 25);
    const monument = projectTurns(state, city.id, { kind: 'building', id: 'MONUMENT' }, 25);

    expect(idle.error).toBeNull();
    expect(monument.error).toBeNull();
    expect(monument.completed).toContain('Monument');
    expect(monument.cultureTotal).toBeGreaterThan(idle.cultureTotal);
    expect(monument.yields.culture).toBeGreaterThan(idle.yields.culture);

    // the projection ran on a clone
    expect(state.turn).toBe(1);
    expect(city.population).toBe(1);
    expect(city.queue.length).toBe(0);
  });

  it('reports an error for choices the city cannot build', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    const p = projectTurns(state, city.id, { kind: 'building', id: 'UNIVERSITY' }, 10);
    expect(p.error).not.toBeNull();
  });

  it('district choices complete within a long enough horizon', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    grantTechs(state, 'WRITING');
    const spot = scoreDistrictSpots(state, city, 'CAMPUS')[0];
    const p = projectTurns(
      state,
      city.id,
      { kind: 'district', type: 'CAMPUS', tileIndex: spot.tileIndex },
      30,
    );
    expect(p.error).toBeNull();
    expect(p.completed).toContain('Campus');
  });

  it('compareCandidates offers the baseline, buildings, and unlocked districts', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
    grantTechs(state, 'WRITING');
    const kinds = compareCandidates(state, city.id);
    expect(kinds.some((c) => c.kind === 'none')).toBe(true);
    expect(kinds.some((c) => c.kind === 'building' && c.id === 'MONUMENT')).toBe(true);
    expect(kinds.some((c) => c.kind === 'district' && c.type === 'CAMPUS')).toBe(true);
    expect(kinds.some((c) => c.kind === 'district' && c.type === 'HOLY_SITE')).toBe(false); // not researched
  });
});
