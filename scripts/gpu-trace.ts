/**
 * The turn-state encoding shared by the GPU-fixture exporter
 * (export-gpu.ts) and the rollout replayer (replay-gpu.ts). One source of
 * truth on the TS side; gpu/civ6gpu/engine.py trace_row() mirrors it.
 *
 * Row layout: [turn, techs, civics, settlers, nCities, treasury·ms,
 * science·ms, culture·ms, score·ms] + per city slot [pop, ownedTiles,
 * buildings, tilesAcquired, foodBox·ms, cultureBox·ms] (·ms = ×1000,
 * rounded — floats compare within ±2 milli-units, integers exactly).
 */

import { empireScore } from '../src/core/empirePlanner';
import type { GameState } from '../src/core/types';

export function traceRow(state: GameState, cMax: number): number[] {
  const row = [
    state.turn,
    state.research.techs.length,
    state.research.civics.length,
    state.settlers,
    state.cities.length,
    Math.round(state.treasury * 1000),
    Math.round(state.scienceTotal * 1000),
    Math.round(state.cultureTotal * 1000),
    Math.round(empireScore(state, 'balanced') * 1000),
  ];
  for (let c = 0; c < cMax; c++) {
    const city = state.cities[c];
    if (!city) {
      row.push(0, 0, 0, 0, 0, 0);
      continue;
    }
    row.push(
      city.population,
      state.map.tiles.filter((x) => x.cityId === city.id).length,
      city.buildings.length,
      city.tilesAcquired,
      Math.round(city.foodBox * 1000),
      Math.round(city.cultureBox * 1000),
    );
  }
  return row;
}

/** Per-column tolerance: 0 = exact integer, 2 = ×1000-encoded float. */
export function rowTolerance(cMax: number): number[] {
  const tol = [0, 0, 0, 0, 0, 2, 2, 2, 2];
  for (let c = 0; c < cMax; c++) tol.push(0, 0, 0, 0, 2, 2);
  return tol;
}
