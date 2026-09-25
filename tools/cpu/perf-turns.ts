/**
 * TS engine TURN-THROUGHPUT driver: headless endTurn over full
 * worlds — barbarians, city-states and the seat phase dominate the cost.
 *
 *   npx vite-node tools/cpu/perf-turns.ts                 # prints turns/sec
 *   $env:NODE_OPTIONS='--cpu-prof'; npx vite-node tools/cpu/perf-turns.ts
 *                                                    # + .cpuprofile files
 *
 * Three seeded worlds (`seeder/worlds`, the serve shape: 44x26, 3 civs,
 * 3 CS), every civ's capital founded where its settler stands, then 250 bare
 * endTurns. Each seat stays a one-city empire — deliberate: this isolates
 * the engine-side phases, not any policy. Numbers are only comparable on a
 * QUIET box.
 */

import { readFileSync } from 'node:fs';

import { foundCity, endTurn } from '../../cpu/core/game';
import { loadWorld } from '../../cpu/world/load';
import type { WorldFile } from '../../world/file';

const SEEDS = [9001, 9014, 9027];
const TURNS = 250;

let total = 0;
let totalMs = 0;
for (const seed of SEEDS) {
  const state = loadWorld(JSON.parse(readFileSync(`seeder/worlds/seed${seed}.world.json`, 'utf-8')) as WorldFile);
  for (const s of state.seats) {
    const settler = state.units.find((u) => u.seat === s.seat && u.type === 'SETTLER');
    if (settler) foundCity(state, settler.tileIndex, s.seat);
  }
  const t0 = performance.now();
  for (let t = 0; t < TURNS; t++) endTurn(state);
  const ms = performance.now() - t0;
  total += TURNS;
  totalMs += ms;
  console.log(
    `seed ${seed}: ${TURNS} turns in ${(ms / 1000).toFixed(2)}s — ${(TURNS / (ms / 1000)).toFixed(0)} t/s ` +
    `(cities ${state.seats.map((r) => r.cities.length).join('/')})`,
  );
}
console.log(`TOTAL: ${total} turns in ${(totalMs / 1000).toFixed(2)}s — ${(total / (totalMs / 1000)).toFixed(0)} t/s`);
