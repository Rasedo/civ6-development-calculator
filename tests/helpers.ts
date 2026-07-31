/** Shared test fixtures: small synthetic maps with uniform terrain. */

import type { City, GameMap, GameState, TerrainId, Tile } from '../src/core/types';
import { playerSeat, isPlayerSeat, tileSeat, NO_SEAT, setTileOwner , emptySeat, BARB_SEAT } from '../src/core/seats';
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
    cliffMask: 0,
        improvement: null,
        district: null,
        districtComplete: false,
        builtWonder: null,
        builtWonderComplete: false,
        pillaged: false,
        districtPillaged: false,
        goodyHut: false,
        volcano: false,
        fertility: 0,
        droughtTurns: 0,
        ownerSeat: NO_SEAT,

        ownerCity: -1,
      });
    }
  }
  return { width, height, seed: 0, tiles };
}

export function makeState(map: GameMap = makeMap()): GameState {
  return {
    map,
    barbSeat: emptySeat(BARB_SEAT), // #51/S6.12
    cities: [],
    nextCityId: 0,
    turn: 1,
    sandbox: false,
    claimedGreatPeople: [],
    tradeRoutes: [],
    plannedSettles: [],
    unitsMode: false,
    units: [],
    nextUnitId: 0,
    rngState: 42,
    disasters: false,
    fogOfWar: false,
    explored: [],
    eventLog: [],
    cityStates: [],
    seats: [emptySeat(0)],
    claimedPantheons: [],
    claimedBeliefs: [],
    claimedEnhancers: [],
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
    if (!playerSeat(state).research.techs.includes(id)) playerSeat(state).research.techs.push(id);
  }
}

/** Mark civics as researched without paying for them. */
export function grantCivics(state: GameState, ...ids: string[]): void {
  for (const id of ids) {
    if (!playerSeat(state).research.civics.includes(id)) playerSeat(state).research.civics.push(id);
  }
}

/** Instantly claim all unowned tiles within `radius` of the city center. */
export function expandBorders(state: GameState, city: City, radius: number): void {
  const center = state.map.tiles[city.centerIndex];
  for (const t of tilesWithin(state.map, center.col, center.row, radius)) {
    if (!isPlayerSeat(tileSeat(t))) setTileOwner(t, city.seat, city.id);
  }
}
