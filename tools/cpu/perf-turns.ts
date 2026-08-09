/**
 * TS engine TURN-THROUGHPUT driver: headless endTurn over full
 * worlds — barbarians, city-states and the seat phase dominate the cost.
 *
 *   npx vite-node tools/cpu/perf-turns.ts                 # prints turns/sec
 *   $env:NODE_OPTIONS='--cpu-prof'; npx vite-node tools/cpu/perf-turns.ts
 *                                                    # + .cpuprofile files
 *
 * Three seeds, the serve-world shape (44x26, 3 CS, 2 opponents), one seat-0
 * capital, then 250 bare endTurns. Seat 0 stays a one-city empire —
 * deliberate: this isolates the engine-side phases, not any policy.
 * Numbers are only comparable on a QUIET box.
 */

import { createGame, foundCity, endTurn } from '../../cpu/core/game';
import { canFoundCity } from '../../cpu/core/rules';
import { spawnUnit } from '../../cpu/core/units';
import { hexDistance } from '../../world/hex';

const SEEDS = [9001, 9014, 9029];
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
    opponents: 2,
  });
  state.disasters = true;
  // Centre-closest legal capital — the advisor's scored pick is gone (#100),
  // and a perf run needs a decent deterministic start, not a good one. In
  // units mode founding consumes a settler (#71), so spawn one on the tile.
  let site = -1;
  let bestD = Infinity;
  for (const t of state.map.tiles) {
    if (!canFoundCity(state, t.index, 0).ok) continue;
    const d = hexDistance(t.col, t.row, 22, 13);
    if (d < bestD) { bestD = d; site = t.index; }
  }
  if (state.unitsMode) spawnUnit(state, 'SETTLER', site, 0);
  foundCity(state, site, 0);
  const t0 = performance.now();
  for (let t = 0; t < TURNS; t++) endTurn(state, 0);
  const ms = performance.now() - t0;
  total += TURNS;
  totalMs += ms;
  console.log(
    `seed ${seed}: ${TURNS} turns in ${(ms / 1000).toFixed(2)}s — ${(TURNS / (ms / 1000)).toFixed(0)} t/s ` +
    `(cities ${state.seats.map((r) => r.cities.length).join('/')})`,
  );
}
console.log(`TOTAL: ${total} turns in ${(totalMs / 1000).toFixed(2)}s — ${(total / (totalMs / 1000)).toFixed(0)} t/s`);
