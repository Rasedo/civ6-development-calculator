/**
 * THE EXPORT CLI — compiles Layer A worlds into what the GPU consumes:
 *
 *   npm run export               # seeder/worlds/*.world.json -> rules.json + seed*.json
 *   npm run export -- out/       # a different worlds directory
 *
 * Reads every `seed*.world.json` in the directory, loads each through the
 * engine (`cpu/world/load.ts`) and writes the Layer B fixture beside it,
 * plus one `rules.json` for the set. Each artifact carries `srcStamp` (the
 * cpu/+world/ source hash) and each fixture its world's `worldHash`, and the
 * fixtures must match `seeder/worlds.lock` — the whole staleness chain is
 * checkable end to end.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

import type { WorldFile } from '../../world/file';
import { loadWorld } from '../world/load';
import { buildFixture } from './planes';
import { buildRules } from './rules';
import { exportStamp } from './stamp';

const DIR = process.argv[2] ?? 'seeder/worlds';
const LOCK_PATH = 'seeder/worlds.lock';

const worldFiles = readdirSync(DIR)
  .filter((f) => /^seed\d+\.world\.json$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
if (worldFiles.length === 0) {
  console.error(`no seed*.world.json in ${DIR} — run \`npm run seed\` first`);
  process.exit(1);
}

const lock = existsSync(LOCK_PATH)
  ? (JSON.parse(readFileSync(LOCK_PATH, 'utf-8')) as { worlds?: Record<string, string> })
  : null;

const srcStamp = exportStamp({ dir: DIR });

const rules = buildRules() as Record<string, unknown>;
rules.srcStamp = srcStamp;
writeFileSync(`${DIR}/rules.json`, JSON.stringify(rules));
console.log(`rules.json: srcStamp ${srcStamp.slice(0, 16)}`);

for (const f of worldFiles) {
  const world = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf-8')) as WorldFile;
  const locked = lock?.worlds?.[String(world.gen.seed)];
  if (locked !== undefined && locked !== world.worldHash) {
    console.error(`${f}: worldHash disagrees with ${LOCK_PATH} — re-seed before exporting`);
    process.exit(1);
  }
  const state = loadWorld(world);
  const fixture = buildFixture(state, world) as Record<string, unknown>;
  fixture.srcStamp = srcStamp;
  writeFileSync(`${DIR}/seed${world.gen.seed}.json`, JSON.stringify(fixture));
  console.log(
    `seed${world.gen.seed}.json: format 2 — ${world.civs.length} civs (settler starts), ` +
      `${world.cityStates.length} CS, ${state.map.tiles.length} tiles`,
  );
}
console.log(`\nCompiled ${worldFiles.length} fixtures in ${DIR}/ — ` +
  'NOTE: format 2 (no pre-founded capitals); the GPU engine refuses these.');
