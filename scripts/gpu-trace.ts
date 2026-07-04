/**
 * The turn-state encoding shared by the GPU-fixture exporter
 * (export-gpu.ts) and the rollout replayer (replay-gpu.ts). One source of
 * truth on the TS side; gpu/civ6gpu/engine.py trace_row() mirrors it.
 *
 * Row layout:
 *   head — [turn, techs, civics, settlers, nCities, treasury·ms,
 *           science·ms, culture·ms, score·ms, rngState, nCamps, nBarbs,
 *           nPlayerUnits, envoysAvailable, influence]
 *   per city-state slot (csMax) — [envoys, pop, questKind+1]
 *   per rival slot (rMax) — [nCities, popSum, nUnits, atWar, tech·ms,
 *           prodStock·ms, milStock·ms]
 *   per city slot (cMax) — [pop, ownedTiles, buildings, tilesAcquired,
 *           foodBox·ms, cultureBox·ms, cityHp, loyalty·ms]
 *
 * City slots are keyed by FOUNDING ORDER via `cityIds` (append new ids as
 * cities appear) — not by position in state.cities, which compacts when a
 * city flips to a rival. A missing id renders as zeros, exactly like a
 * dead GPU slot. rngState stays the strongest signal: any divergence in
 * the number or order of draws fails the very next row.
 */

import { empireScore } from '../src/core/empirePlanner';
import { getCityHp } from '../src/core/combat';
import type { GameState } from '../src/core/types';

export function traceRow(state: GameState, cityIds: number[], cMax: number, csMax: number, rMax: number): number[] {
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
    state.units.filter((u) => u.owner === 'player').length,
    state.envoysAvailable,
    state.influencePoints,
  ];
  for (let s = 0; s < csMax; s++) {
    const cs = state.cityStates[s];
    if (!cs) {
      row.push(0, 0, 0);
      continue;
    }
    const kind = cs.quest ? { clearCamp: 1, sendTradeRoute: 2, buildDistrict: 3 }[cs.quest.kind] : 0;
    row.push(cs.envoys, cs.population, kind);
  }
  for (let r = 0; r < rMax; r++) {
    const rival = state.rivals[r];
    if (!rival) {
      row.push(0, 0, 0, 0, 0, 0, 0);
      continue;
    }
    row.push(
      rival.cities.length,
      rival.cities.reduce((s, rc) => s + rc.population, 0),
      state.units.filter((u) => u.owner === 'rival' && u.civId === rival.id).length,
      rival.atWar ? 1 : 0,
      Math.round(rival.techLevel * 1000),
      Math.round(rival.productionStock * 1000),
      Math.round(rival.militaryStock * 1000),
    );
  }
  for (let c = 0; c < cMax; c++) {
    const city = state.cities.find((x) => x.id === cityIds[c]);
    if (!city) {
      row.push(0, 0, 0, 0, 0, 0, 0, 0);
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
      Math.round((city.loyalty ?? 100) * 1000),
    );
  }
  return row;
}

/** Per-column tolerance: 0 = exact integer, 2 = ×1000-encoded float. */
export function rowTolerance(cMax: number, csMax: number, rMax: number): number[] {
  const tol = [0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0];
  for (let s = 0; s < csMax; s++) tol.push(0, 0, 0);
  for (let r = 0; r < rMax; r++) tol.push(0, 0, 0, 0, 2, 2, 2);
  for (let c = 0; c < cMax; c++) tol.push(0, 0, 0, 0, 2, 2, 0, 2);
  return tol;
}
