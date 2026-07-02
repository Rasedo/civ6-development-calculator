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
import { createGame, foundCity, placeImprovement, queueDistrict, queueBuilding, endTurn, setTechResearch } from '../src/core/game';
import { computeCityStats } from '../src/core/city';
import { validImprovements, districtPlacementTiles } from '../src/core/rules';
import { availableTechs } from '../src/core/effects';
import { scoreSettleSites, compareCandidates, projectTurns } from '../src/core/advisor';
import { WONDERS } from '../src/data/wonders';
import { TECHS } from '../src/data/techs';
import { CIVICS } from '../src/data/civics';
import type { GameState } from '../src/core/types';

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
const wonders = new Set(map.tiles.filter((t) => t.wonder).map((t) => t.wonder!));
console.log(`  natural wonders: ${[...wonders].map((w) => WONDERS[w].name).join(', ') || 'none'}`);

// --- 2. scripted playthrough ---------------------------------------------------
const state: GameState = createGame({ width: 44, height: 26, seed });

const sites = scoreSettleSites(state, 3);
if (sites.length === 0) throw new Error('no legal settle sites');
console.log(
  '\nTop settle sites: ' +
    sites
      .map((s) => {
        const t = state.map.tiles[s.tileIndex];
        return `(${t.col},${t.row}) ${s.score.toFixed(1)}`;
      })
      .join(', '),
);
const best = state.map.tiles[sites[0].tileIndex];
const res = foundCity(state, best.index);
if (!res.ok || !res.city) throw new Error('failed to settle: ' + res.reason);
const city = res.city;
console.log(`Settled ${city.name} at (${best.col},${best.row})`);

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

// Research toward Writing, then queue a campus and a library — exercising
// the tech gating the same way a player would.
let campusQueued = false;
for (let i = 0; i < 60; i++) {
  endTurn(state);
  if (
    !state.research.techs.includes('WRITING') &&
    state.research.tech !== 'WRITING' &&
    availableTechs(state).some((t) => t.id === 'WRITING')
  ) {
    setTechResearch(state, 'WRITING');
  }
  if (!campusQueued && state.research.techs.includes('WRITING')) {
    const spots = districtPlacementTiles(state, city, 'CAMPUS');
    if (spots.length) {
      queueDistrict(state, city.id, 'CAMPUS', spots[0]);
      campusQueued = true;
    }
  }
  if (campusQueued && city.queue.length === 0 && !city.buildings.includes('LIBRARY')) {
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
console.log(`  borders: ${state.map.tiles.filter((t) => t.cityId === city.id).length} tiles owned ` +
  `(${city.tilesAcquired} grown culturally)`);
console.log(`  techs: ${state.research.techs.map((t) => TECHS[t].name).join(', ') || 'none'}`);
console.log(`  civics: ${state.research.civics.map((c) => CIVICS[c].name).join(', ') || 'none'}`);
console.log(`  government: ${state.government.current ?? 'none'}`);
console.log(`  empire: treasury ${state.treasury.toFixed(0)}, science total ${state.scienceTotal.toFixed(0)}`);

// --- 2b. build-choice comparison demo ---------------------------------------------
console.log('\nBuild comparison over the next 20 turns:');
for (const choice of compareCandidates(state, city.id).slice(0, 5)) {
  const p = projectTurns(state, city.id, choice, 20);
  const line = p.error
    ? `✗ ${p.error}`
    : `pop ${p.pop}, sci/t ${p.yields.science.toFixed(1)}, prod/t ${p.yields.production.toFixed(1)}, ` +
      `cult/t ${p.yields.culture.toFixed(1)}, finished: ${p.completed.join(' + ') || '—'}`;
  console.log(`  ${p.label.padEnd(24)} ${line}`);
}

// --- 3. PNG snapshot -------------------------------------------------------------
const png = makePreviewPng(map, deflateSync);
writeFileSync('map-preview.png', png);
console.log('\nWrote map-preview.png');
