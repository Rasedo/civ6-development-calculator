/** Shared test fixtures: small synthetic maps with uniform terrain. */

import type { City, GameMap, GameState, TerrainId, Tile } from '../../cpu/core/types';
import { BARB_SEAT, NO_SEAT, emptySeat, seatOf, setTileOwner, tileSeat } from '../../cpu/core/seats';
import { foundCity } from '../../cpu/core/game';
import { canFoundCity } from '../../cpu/core/rules';
import { spawnUnit } from '../../cpu/core/units';
import { hexDistance } from '../../world/hex';
import { tilesWithin } from '../../world/hex';
import { defaultModifiers, type YieldCtx } from '../../cpu/core/effects';

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
        fertilityProd: 0,
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
    barbSeat: emptySeat(BARB_SEAT),
    turn: 1,
    sandbox: false,
    claimedGreatPeople: [],
    unitsMode: false,
    units: [],
    nextUnitId: 0,
    rngState: 42,
    disasters: false,
    fogOfWar: false,
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
    if (!seatOf(state, 0)!.research.techs.includes(id)) seatOf(state, 0)!.research.techs.push(id);
  }
}

/** Mark civics as researched without paying for them. */
export function grantCivics(state: GameState, ...ids: string[]): void {
  for (const id of ids) {
    if (!seatOf(state, 0)!.research.civics.includes(id)) seatOf(state, 0)!.research.civics.push(id);
  }
}

/**
 * Found a test city at a tile: in units mode a SETTLER is spawned on the tile
 * first (founding consumes it); outside units mode founding is
 * free. Throws on refusal so a bad setup fails loudly, not three asserts later.
 */
export function settleAt(state: GameState, tileIndex: number, seat = 0): City {
  if (state.unitsMode && !state.sandbox) spawnUnit(state, 'SETTLER', tileIndex, seat);
  const res = foundCity(state, tileIndex, seat);
  if (!res.ok || !res.city) throw new Error(`test founding at ${tileIndex} failed: ${res.reason}`);
  return res.city;
}

/**
 * Found the seat's first city at the LEGAL tile closest to the map centre
 * (ties by index) — the advisor's scored pick is gone; a test setup
 * needs a decent deterministic capital, not a good one.
 */
export function settleFirstCity(state: GameState, seat = 0): City {
  const { width, height } = state.map;
  const cc = Math.floor(width / 2);
  const cr = Math.floor(height / 2);
  let best: Tile | null = null;
  let bestD = Infinity;
  for (const t of state.map.tiles) {
    if (!canFoundCity(state, t.index, seat).ok) continue;
    const d = hexDistance(t.col, t.row, cc, cr);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (!best) throw new Error('no legal settle site on this map');
  return settleAt(state, best.index, seat);
}

/** Instantly claim all unowned tiles within `radius` of the city center. */
export function expandBorders(state: GameState, city: City, radius: number): void {
  const center = state.map.tiles[city.centerIndex];
  for (const t of tilesWithin(state.map, center.col, center.row, radius)) {
    if (tileSeat(t) !== 0) setTileOwner(t, city.seat, city.id);
  }
}
