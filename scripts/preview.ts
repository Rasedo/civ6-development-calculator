/**
 * Dev utility (run with `npm run preview:map`):
 *  1. generates a map, prints composition stats,
 *  2. plays a short scripted game to smoke-test the engine end to end,
 *  3. rasterizes the map to map-preview.png (no browser needed).
 */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateMap } from '../src/core/mapgen';
import { makePreviewPng } from './png';
import { createGame, foundCity, placeImprovement, queueDistrict, queueBuilding, endTurn } from '../src/core/game';
import { computeCityStats } from '../src/core/city';
import { validImprovements, districtPlacementTiles } from '../src/core/rules';
import { tileYields } from '../src/core/yields';
import { isWater, isMountain } from '../src/core/query';
import type { GameState, Tile } from '../src/core/types';

const seed = Number(process.argv[2] ?? 42);
const map = generateMap({ width: 84, height: 54, seed });

// --- 1. composition stats ----------------------------------------------------
const counts = new Map<string, number>();
let riverTiles = 0;
let resources = 0;
let features = new Map<string, number>();
for (const t of map.tiles) {
  const key = t.elevation === 'MOUNTAIN' ? 'MOUNTAIN' : t.terrain + (t.elevation === 'HILLS' ? '_HILLS' : '');
  counts.set(key, (counts.get(key) ?? 0) + 1);
  if (t.riverMask) riverTiles++;
  if (t.resource) resources++;
  if (t.feature) features.set(t.feature, (features.get(t.feature) ?? 0) + 1);
}
console.log(`Map 84x54, seed ${seed} — ${map.tiles.length} tiles`);
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(18)} ${String(v).padStart(5)}  (${((v / map.tiles.length) * 100).toFixed(1)}%)`);
}
console.log(`  river-adjacent tiles: ${riverTiles}, resources: ${resources}`);
console.log(`  features: ${[...features.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);

// --- 2. scripted playthrough ---------------------------------------------------
const state: GameState = createGame({ width: 44, height: 26, seed });

function settleScore(t: Tile): number {
  if (isWater(t) || isMountain(t) || t.feature === 'OASIS') return -1;
  let s = 0;
  if (t.riverMask) s += 3;
  for (const n of neighborhood(state, t)) {
    const y = tileYields(n);
    s += y.food * 1.5 + y.production;
  }
  return s;
}
function neighborhood(st: GameState, t: Tile): Tile[] {
  const out: Tile[] = [];
  for (const n of st.map.tiles) {
    const dc = Math.abs(n.col - t.col);
    const dr = Math.abs(n.row - t.row);
    if (dc <= 2 && dr <= 2) out.push(n);
  }
  return out;
}

const best = [...state.map.tiles].sort((a, b) => settleScore(b) - settleScore(a))[0];
const res = foundCity(state, best.index);
if (!res.ok || !res.city) throw new Error('failed to settle: ' + res.reason);
const city = res.city;
console.log(`\nSettled ${city.name} at (${best.col},${best.row})`);

// improve a few tiles
let improved = 0;
for (const t of state.map.tiles) {
  if (t.cityId !== city.id || improved >= 6) continue;
  const opts = validImprovements(state, t);
  if (opts.length) {
    placeImprovement(state, t.index, opts[0]);
    improved++;
  }
}
console.log(`Placed ${improved} improvements`);

// queue a campus on the best spot, then a library
const spots = districtPlacementTiles(state, city, 'CAMPUS');
if (spots.length) queueDistrict(state, city.id, 'CAMPUS', spots[0]);

for (let i = 0; i < 60; i++) {
  endTurn(state);
  if (city.queue.length === 0 && !city.buildings.includes('LIBRARY')) {
    queueBuilding(state, city.id, 'LIBRARY');
  }
}
const stats = computeCityStats(state, city);
console.log(`After 60 turns: pop ${city.population}, housing ${stats.housing}, ` +
  `amenities ${stats.amenities.have}/${stats.amenities.needed} (${stats.amenities.tier.name})`);
console.log(`  yields/turn: food ${stats.total.food.toFixed(1)}, prod ${stats.total.production.toFixed(1)}, ` +
  `gold ${stats.total.gold.toFixed(1)}, sci ${stats.total.science.toFixed(1)}, cult ${stats.total.culture.toFixed(1)}`);
console.log(`  buildings: ${city.buildings.join(', ')}`);
console.log(`  districts: ${city.districts.map((d) => d.type).join(', ')}`);
console.log(`  empire: treasury ${state.treasury.toFixed(0)}, science total ${state.scienceTotal.toFixed(0)}`);

// --- 3. PNG snapshot -------------------------------------------------------------
const png = makePreviewPng(map, deflateSync);
writeFileSync('map-preview.png', png);
console.log('\nWrote map-preview.png');
