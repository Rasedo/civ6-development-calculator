import { describe, it, expect } from 'vitest';
import { seatOf, tileCity } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { borderGrowthCost, scaleByGameSpeed } from '../../../cpu/data/constants';
import { foundCity, endTurn, buyTile, tilePurchaseCost } from '../../../cpu/core/game';
import { borderCandidates, pickBorderTile } from '../../../cpu/core/city';
import { hexDistance } from '../../../world/hex';

describe('cultural border growth', () => {
  it('expansion cost rises with tiles acquired, at the online speed', () => {
    // floor((10 + (6n)^1.3) / 2), n counted from 0: the game's GetCultureCost
    // on n 0-5, 7, 8, 10, 11 (runs/h1_duelw1103 / 1104)
    expect([0, 1, 2, 3, 4, 5, 7, 8, 10, 11].map(borderGrowthCost)).toEqual([5, 10, 17, 26, 36, 46, 69, 81, 107, 120]);
  });

  it('culture claims new tiles over time, adjacent and within 5 rings', () => {
    const state = makeState(makeMap(18, 18));
    const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
    const before = state.map.tiles.filter((t) => tileCity(t) === city.id).length;
    expect(before).toBe(7);

    let guard = 0;
    while (city.tilesAcquired === 0 && guard++ < 60) endTurn(state);
    expect(city.tilesAcquired).toBeGreaterThanOrEqual(1);

    const owned = state.map.tiles.filter((t) => tileCity(t) === city.id);
    expect(owned.length).toBe(before + city.tilesAcquired);
    const center = state.map.tiles[city.centerIndex];
    for (const t of owned) {
      expect(hexDistance(center.col, center.row, t.col, t.row)).toBeLessThanOrEqual(5);
    }
  });

  it('prefers resource tiles at equal distance', () => {
    const state = makeState(makeMap(18, 18));
    const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
    const luxTile = tileAtCoords(state.map, 11, 9); // ring 2, adjacent to (10,9)
    luxTile.resource = 'WINE';
    expect(pickBorderTile(state, city)).toBe(luxTile.index);
  });

  it('buying tiles costs ring-priced gold on its own schedule', () => {
    const state = makeState(makeMap(18, 18));
    const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
    seatOf(state, 0)!.treasury = 1000;

    const target = tileAtCoords(state.map, 11, 9);
    expect(borderCandidates(state, city)).toContain(target.index);
    const cost = tilePurchaseCost(state, city, target.index);
    expect(cost).toBe(scaleByGameSpeed(50)); // ring 2, no research yet

    expect(buyTile(state, city.id, target.index, 0).ok).toBe(true);
    expect(tileCity(target)).toBe(city.id);
    expect(seatOf(state, 0)!.treasury).toBe(1000 - cost);
    expect(city.tilesAcquired).toBe(0); // a purchase moves neither the culture box nor the count its cost climbs on
    // no step per plot bought: the next ring-2 plot costs the same
    expect(tilePurchaseCost(state, city)).toBe(scaleByGameSpeed(50));

    // far tile: not a candidate
    const far = tileAtCoords(state.map, 16, 9);
    expect(buyTile(state, city.id, far.index, 0).ok).toBe(false);
  });

  it('refuses purchases the treasury cannot afford', () => {
    const state = makeState(makeMap(18, 18));
    const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
    seatOf(state, 0)!.treasury = 10;
    const target = tileAtCoords(state.map, 11, 9);
    expect(buyTile(state, city.id, target.index, 0).ok).toBe(false);
    expect(tileCity(target)).toBe(-1);
  });
});
