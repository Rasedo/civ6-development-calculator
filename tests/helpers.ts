/** Shared test fixtures: small synthetic maps with uniform terrain. */

import type { GameMap, GameState, TerrainId, Tile } from '../src/core/types';

export function makeMap(width = 12, height = 12, terrain: TerrainId = 'GRASSLAND'): GameMap {
  const tiles: Tile[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      tiles.push({
        index: row * width + col,
        col,
        row,
        terrain,
        elevation: 'FLAT',
        feature: null,
        resource: null,
        riverMask: 0,
        improvement: null,
        district: null,
        districtComplete: false,
        cityId: -1,
      });
    }
  }
  return { width, height, seed: 0, tiles };
}

export function makeState(map: GameMap = makeMap()): GameState {
  return {
    map,
    cities: [],
    nextCityId: 0,
    turn: 1,
    sandbox: false,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faithTotal: 0,
  };
}

export function tileAtCoords(map: GameMap, col: number, row: number): Tile {
  return map.tiles[row * map.width + col];
}
