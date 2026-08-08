import { describe, it, expect } from 'vitest';
import { seatOf, tileCity } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { borderGrowthCost } from '../../../cpu/data/constants';
import { foundCity, endTurn, buyTile, tilePurchaseCost } from '../../../cpu/core/game';
import { borderCandidates, pickBorderTile } from '../../../cpu/core/city';
import { hexDistance } from '../../../world/hex';

describe('cultural border growth', () => {
  it('expansion cost rises with tiles acquired', () => {
    expect(borderGrowthCost(0)).toBe(20);
    expect(borderGrowthCost(1)).toBe(35);
    expect(borderGrowthCost(2)).toBe(52); // 10 + (6·3)^1.3
    expect(borderGrowthCost(9)).toBe(214); // the real curve's late-game bite
  });

  it('culture claims new tiles over time, adjacent and within 5 rings', () => {
    const state = makeState(makeMap(18, 18));
    const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
    const before = state.map.tiles.filter((t) => tileCity(t) === city.id).length;
    expect(before).toBe(7);

    let guard = 0;
    while (city.tilesAcquired === 0 && guard++ < 60) endTurn(state, 0);
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

  it('buying tiles costs ring-priced gold on its own schedule (D-17)', () => {
    const state = makeState(makeMap(18, 18));
    const city = foundCity(state, tileAtCoords(state.map, 9, 9).index, 0).city!;
    seatOf(state, 0)!.treasury = 1000;

    const target = tileAtCoords(state.map, 11, 9);
    expect(borderCandidates(state, city)).toContain(target.index);
    const cost = tilePurchaseCost(state, city, target.index);
    expect(cost).toBe(30); // ring 2: round(50 × GAME_SPEED), no research yet

    expect(buyTile(state, city.id, target.index, 0).ok).toBe(true);
    expect(tileCity(target)).toBe(city.id);
    expect(seatOf(state, 0)!.treasury).toBe(1000 - cost);
    expect(city.tilesAcquired).toBe(0); // purchases don't advance the culture counter
    expect(seatOf(state, 0)!.tilesPurchased).toBe(1);
    expect(tilePurchaseCost(state, city)).toBe(33); // +5 (speed-scaled → 3) per purchase

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
