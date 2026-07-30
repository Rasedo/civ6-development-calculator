/**
 * Stage-0 TS perf driver (PERF_PLAN): headless endTurn throughput on the
 * exporter's exact scenario shape — the rival phase is the dominant cost.
 *
 *   npx vite-node scripts/perf-rivals.ts             # prints turns/sec
 *   $env:NODE_OPTIONS='--cpu-prof'; npx vite-node scripts/perf-rivals.ts
 *                                                    # + .cpuprofile files
 *
 * Three fixture seeds (the export loop's seed formula incl. the 9029
 * override), createGame options identical to export-gpu.ts, capital
 * founded at the top advisor site, then 250 bare endTurns. The player
 * stays a one-city empire — deliberate: this isolates the engine-side
 * phases (rivals, barbs, city-states) that dominate the gpu-gate TS
 * replay, rather than the exporter's scripted-player bookkeeping.
 * Numbers are only comparable on a QUIET box.
 */

import { createGame, foundCity, endTurn } from '../src/core/game';
import { rivalsOf } from '../src/core/seats';
import { scoreSettleSites } from '../src/core/advisor';

const SEEDS = [9001, 9014, 9029]; // export-gpu s=0,1,2 (9029 = the s=2 override)
const TURNS = 250;

let total = 0;
let totalMs = 0;
for (const seed of SEEDS) {
  const state = createGame({
    width: 44,
    height: 26,
    seed,
    withResources: true,
    withWonders: true,
    unitsMode: true,
    withVillages: false,
    cityStates: 3,
    rivals: 2,
  });
  state.disasters = true;
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  const t0 = performance.now();
  for (let t = 0; t < TURNS; t++) endTurn(state);
  const ms = performance.now() - t0;
  total += TURNS;
  totalMs += ms;
  console.log(
    `seed ${seed}: ${TURNS} turns in ${(ms / 1000).toFixed(2)}s — ${(TURNS / (ms / 1000)).toFixed(0)} t/s ` +
    `(cities ${state.cities.length}, rivals ${rivalsOf(state).map((r) => r.cities.length).join('/')})`,
  );
}
console.log(`TOTAL: ${total} turns in ${(totalMs / 1000).toFixed(2)}s — ${(total / (totalMs / 1000)).toFixed(0)} t/s`);
