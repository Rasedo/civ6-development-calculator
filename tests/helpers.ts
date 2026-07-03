/** Shared test fixtures: small synthetic maps with uniform terrain. */

import type { City, GameMap, GameState, TerrainId, Tile } from '../src/core/types';
import { tilesWithin } from '../src/core/hex';
import { defaultModifiers, type YieldCtx } from '../src/core/effects';

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
        wonder: null,
        riverMask: 0,
        improvement: null,
        district: null,
        districtComplete: false,
        builtWonder: null,
        builtWonderComplete: false,
        pillaged: false,
        goodyHut: false,
        volcano: false,
        fertility: 0,
        droughtTurns: 0,
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
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    government: { current: null, policies: [] },
    greatPeople: { points: {}, earned: [] },
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null },
    tradeRoutes: [],
    settlers: 0,
    plannedSettles: [],
    unitsMode: false,
    units: [],
    nextUnitId: 0,
    rngState: 42,
    barbCamps: [],
    cityHp: {},
    disasters: false,
    fogOfWar: false,
    explored: [],
    eventLog: [],
    cityStates: [],
    influencePoints: 0,
    envoysAvailable: 0,
  };
}

export function tileAtCoords(map: GameMap, col: number, row: number): Tile {
  return map.tiles[row * map.width + col];
}

/** Bare yield context for map-only tests (no research, no policies). */
export function bareCtx(map: GameMap): YieldCtx {
  return { map, mods: defaultModifiers() };
}

/** Mark techs as researched without paying for them. */
export function grantTechs(state: GameState, ...ids: string[]): void {
  for (const id of ids) {
    if (!state.research.techs.includes(id)) state.research.techs.push(id);
  }
}

/** Mark civics as researched without paying for them. */
export function grantCivics(state: GameState, ...ids: string[]): void {
  for (const id of ids) {
    if (!state.research.civics.includes(id)) state.research.civics.push(id);
  }
}

/** Instantly claim all unowned tiles within `radius` of the city center. */
export function expandBorders(state: GameState, city: City, radius: number): void {
  const center = state.map.tiles[city.centerIndex];
  for (const t of tilesWithin(state.map, center.col, center.row, radius)) {
    if (t.cityId === -1) t.cityId = city.id;
  }
}
