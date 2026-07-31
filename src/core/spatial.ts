/**
 * Spatial observation: the map as a stack of image-like uint8 planes for
 * CNN policies. Plane-major layout [plane][row][col]. Under fog of war,
 * unexplored tiles are all-zero (the agent cannot see through the fog).
 */

import type { GameState } from './types';
import { isWater, isImpassable } from './query';
import { makeYieldCtx } from './effects';
import { tileYields } from './yields';
import { fogActive, isExplored } from './fog';
import { unitsHostile, unitDomain } from './units';
import { RESOURCES } from '../data/resources';
import { tileForeignTo, PLAYER_CIV, isPlayerSeat, tileSeat, rivalsOf } from './seats';

export const SPATIAL_PLANES = [
  'water',
  'hills',
  'impassable',
  'food',
  'production',
  'otherYield',
  'choppable',
  'bonusResource',
  'luxuryResource',
  'strategicResource',
  'river',
  'ownedMine',
  'ownedForeign',
  'myCityCenter',
  'foreignCityCenter',
  'myDistrict',
  'improvement',
  'myUnits',
  'hostiles',
  'explored',
] as const;

export const SPATIAL_PLANE_COUNT = SPATIAL_PLANES.length;

const P: Record<(typeof SPATIAL_PLANES)[number], number> = Object.fromEntries(
  SPATIAL_PLANES.map((name, i) => [name, i]),
) as Record<(typeof SPATIAL_PLANES)[number], number>;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Encode the current state as SPATIAL_PLANE_COUNT × height × width uint8s. */
export function spatialObservation(state: GameState): Uint8Array {
  const { width, height, tiles } = state.map;
  const out = new Uint8Array(SPATIAL_PLANE_COUNT * height * width);
  const at = (plane: number, index: number) => plane * height * width + index;
  const ctx = makeYieldCtx(state);
  const fog = fogActive(state);

  for (const tile of tiles) {
    const i = tile.index;
    if (fog && !isExplored(state, i)) continue; // all planes stay 0
    out[at(P.explored, i)] = 1;
    if (isWater(tile)) out[at(P.water, i)] = 1;
    if (tile.elevation === 'HILLS') out[at(P.hills, i)] = 1;
    if (isImpassable(tile)) out[at(P.impassable, i)] = 1;

    const y = tileYields(ctx, tile);
    out[at(P.food, i)] = clamp(y.food);
    out[at(P.production, i)] = clamp(y.production);
    out[at(P.otherYield, i)] = clamp(y.gold + y.science + y.culture + y.faith);

    if (tile.feature === 'WOODS' || tile.feature === 'RAINFOREST' || tile.feature === 'MARSH') {
      out[at(P.choppable, i)] = 1;
    }
    if (tile.resource) {
      const cat = RESOURCES[tile.resource]?.category;
      if (cat === 'bonus') out[at(P.bonusResource, i)] = 1;
      else if (cat === 'luxury') out[at(P.luxuryResource, i)] = 1;
      else if (cat === 'strategic') out[at(P.strategicResource, i)] = 1;
    }
    if (tile.riverMask !== 0) out[at(P.river, i)] = 1;
    if (isPlayerSeat(tileSeat(tile))) out[at(P.ownedMine, i)] = 1;
    if (tileForeignTo(tile, PLAYER_CIV)) out[at(P.ownedForeign, i)] = 1;
    if (tile.district || tile.builtWonder) {
      if (isPlayerSeat(tileSeat(tile))) out[at(P.myDistrict, i)] = 1;
    }
    if (tile.improvement) out[at(P.improvement, i)] = tile.pillaged ? 2 : 1;
    if (state.barbSeat.camps.includes(i)) out[at(P.hostiles, i)] = 3;
  }

  for (const city of state.cities) {
    if (fog && !isExplored(state, city.centerIndex)) continue;
    out[at(P.myCityCenter, city.centerIndex)] = clamp(Math.min(10, city.population));
  }
  for (const cs of state.cityStates) {
    if (fog && !isExplored(state, cs.centerIndex)) continue;
    out[at(P.foreignCityCenter, cs.centerIndex)] = clamp(cs.population);
  }
  for (const rival of rivalsOf(state)) {
    for (const rc of rival.cities) {
      if (fog && !isExplored(state, rc.centerIndex)) continue;
      out[at(P.foreignCityCenter, rc.centerIndex)] = clamp(rc.population);
    }
  }

  for (const u of state.units) {
    if (fog && !isExplored(state, u.tileIndex)) continue;
    if (isPlayerSeat(u.seat)) {
      out[at(P.myUnits, u.tileIndex)] = unitDomain(u.type) === 'military' ? 2 : 1;
    } else {
      const hostile = unitsHostile(state, u, { seat: PLAYER_CIV });
      const cur = out[at(P.hostiles, u.tileIndex)];
      out[at(P.hostiles, u.tileIndex)] = Math.max(cur, hostile ? 2 : 1);
    }
  }
  return out;
}
