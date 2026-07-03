/**
 * The turn-state encoding shared by the GPU-fixture exporter
 * (export-gpu.ts) and the rollout replayer (replay-gpu.ts). One source of
 * truth on the TS side; gpu/civ6gpu/engine.py trace_row() mirrors it.
 *
 * Row layout: [turn, techs, civics, settlers, nCities, treasury·ms,
 * science·ms, culture·ms, score·ms, rngState, nCamps, nBarbs] + per city
 * slot [pop, ownedTiles, buildings, tilesAcquired, foodBox·ms,
 * cultureBox·ms, cityHp] (·ms = ×1000, rounded — floats compare within
 * ±2 milli-units, integers exactly).
 *
 * rngState is the strongest parity signal of all: any divergence in the
 * NUMBER or ORDER of random draws — even one whose effect is invisible
 * this turn — fails the very next row.
 */

import { empireScore } from '../src/core/empirePlanner';
import { getCityHp } from '../src/core/combat';
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
    state.rngState >>> 0,
    state.barbCamps.length,
    state.units.filter((u) => u.owner === 'barbarian').length,
  ];
  for (let c = 0; c < cMax; c++) {
    const city = state.cities[c];
    if (!city) {
      row.push(0, 0, 0, 0, 0, 0, 0);
      continue;
    }
    row.push(
      city.population,
      state.map.tiles.filter((x) => x.cityId === city.id).length,
      city.buildings.length,
      city.tilesAcquired,
      Math.round(city.foodBox * 1000),
      Math.round(city.cultureBox * 1000),
      getCityHp(state, city.id),
    );
  }
  return row;
}

/** Per-column tolerance: 0 = exact integer, 2 = ×1000-encoded float. */
export function rowTolerance(cMax: number): number[] {
  const tol = [0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0];
  for (let c = 0; c < cMax; c++) tol.push(0, 0, 0, 0, 2, 2, 0);
  return tol;
}
