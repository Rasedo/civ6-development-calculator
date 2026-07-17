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
 *   per rival slot (rMax) — [nCities, popSum, nUnits, atWar, nTechs,
 *           nCivics, techProg·ms, civicProg·ms, ΣqueueProg·ms, ΣqueueCost·ms]
 *   per city slot (cMax) — [pop, ownedTiles, buildings, tilesAcquired,
 *           foodBox·ms, cultureBox·ms, cityHp, loyalty·ms, followedReligion]
 *
 * City slots are keyed by FOUNDING ORDER via `cityIds` (append new ids as
 * cities appear; once cMax ids exist, a new id REUSES the first dead
 * column — mirroring the GPU's first-free-hole slot) — not by position in
 * state.cities, which compacts when a city flips to a rival. A missing id
 * renders as zeros, exactly like a dead GPU slot. rngState stays the
 * strongest signal: any divergence in the number or order of draws fails
 * the very next row.
 */

import { empireScore, rivalEmpireScore } from '../src/core/empirePlanner';
import { dominationWinner } from '../src/core/game';
import { getCityHp } from '../src/core/combat';
import { UNITS } from '../src/data/units';
import { BUILDINGS } from '../src/data/buildings';
import { BUILT_WONDERS } from '../src/data/builtWonders';
import type { GameState } from '../src/core/types';

export function traceRow(state: GameState, cityIds: number[], cMax: number, csMax: number, rMax: number): number[] {
  // GV-1: current score-leader as a unified civ id (0 player, r+1 rival); ties -> lowest id
  let leader = 0;
  let leaderBest = empireScore(state, 'balanced');
  for (const rv of state.rivals) {
    const rs = rivalEmpireScore(state, rv);
    if (rs > leaderBest) { leaderBest = rs; leader = rv.id + 1; }
  }
  const dom = dominationWinner(state); // GV-3
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
    state.map.tiles.reduce((n, t) => n + t.fertility, 0),
    state.map.tiles.reduce((n, t) => n + (t.droughtTurns > 0 ? 1 : 0), 0),
    state.map.tiles.reduce((n, t) => n + (t.improvement !== null ? 1 : 0), 0),
    leader, // GV-1
    state.gameOver ? 1 : 0, // GV-2
    dom >= 0 ? dom : state.gameOver ? leader : -1, // GV-2/GV-3 winner
    state.victoryType ?? 0, // GV-4/GV-3 victoryType
  ];
  for (let s = 0; s < csMax; s++) {
    // Keyed by id (== the GPU's static slot), NOT array position: a captured
    // city-state leaves the list (V-CS), and positional indexing would shift
    // every later slot's columns.
    const cs = state.cityStates.find((c) => c.id === s);
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
      row.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      continue;
    }
    row.push(
      rival.cities.length,
      rival.cities.reduce((s, rc) => s + rc.population, 0),
      state.units.filter((u) => u.owner === 'rival' && u.civId === rival.id).length,
      rival.atWar ? 1 : 0,
      rival.research.techs.length,
      rival.research.civics.length,
      Math.round(rival.research.techProgress * 1000),
      Math.round(rival.research.civicProgress * 1000),
      // C1-B2: the pooled stocks died — trace the queues instead (Σ front-item
      // progress and Σ front-item cost across the civ's cities).
      Math.round(rival.cities.reduce((s2, rc) => s2 + (rc.queue[0]?.progress ?? 0), 0) * 1000),
      Math.round(
        rival.cities.reduce((s2, rc) => {
          const q = rc.queue[0];
          if (!q) return s2;
          // P4/D-10: unit items may LOCK a cost (escalated builders) — price
          // the lock first, exactly like the completion check does.
          // A-4: wonder items carry NO cost field — price from the catalog
          // (the D-10 lesson AGAIN: every new queue-cost mechanic must
          // update BOTH trace harnesses in the same stage).
          return s2 + (q.kind === 'settler' || q.kind === 'project' || q.kind === 'district' ? q.cost ?? 0 : q.kind === 'unit' ? q.cost ?? UNITS[q.unit]?.cost ?? 0 : q.kind === 'building' ? BUILDINGS[q.building]?.cost ?? 0 : q.kind === 'wonder' ? BUILT_WONDERS[q.wonder]?.cost ?? 0 : 0);
        }, 0) * 1000,
      ),
      // C1-B4: COMPLETED rival districts (queued ones pave but don't count).
      rival.cities.reduce((s2, rc) => s2 + rc.districts.filter((d) => d.type !== 'CITY_CENTER' && state.map.tiles[d.tileIndex].districtComplete).length, 0),
      rival.cities.reduce((s2, rc) => s2 + rc.buildings.length, 0),
      Math.round((rival.treasury ?? 0) * 1000), // VP-G1
      Math.round(rivalEmpireScore(state, rival) * 1000), // GV-1
    );
  }
  for (let c = 0; c < cMax; c++) {
    const city = state.cities.find((x) => x.id === cityIds[c]);
    if (!city) {
      row.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
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
      city.followedReligion ?? -1, // B-18: the pressure-spread followed-religion id (-1 = none)
    );
  }
  return row;
}

/** Per-column tolerance: 0 = exact integer, 2 = ×1000-encoded float. */
export function rowTolerance(cMax: number, csMax: number, rMax: number): number[] {
  // Must match traceRow's column order EXACTLY. HEAD is 22: the 18 base cols
  // + GV leader/gameOver/winner/victoryType (all integer). Each rival is 14:
  // the 12 base + treasury/rGScore (both float ×1000, tol 2). A stale tol
  // silently shifts every later column's tolerance — keep them in lockstep.
  const tol = [0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let s = 0; s < csMax; s++) tol.push(0, 0, 0);
  for (let r = 0; r < rMax; r++) tol.push(0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 2, 2);
  for (let c = 0; c < cMax; c++) tol.push(0, 0, 0, 0, 2, 2, 0, 2, 0); // +followedReligion (int, B-18)
  return tol;
}
