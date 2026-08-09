/**
 * THE WORLD PRODUCER — generates seeded t0 worlds (Layer A), engine-free.
 *
 *   npm run seed                 # writes seeder/worlds/seed*.world.json + worlds.lock
 *   npm run seed -- --check      # regenerate in memory, diff against worlds.lock
 *   npm run seed -- 12 3 2 out/  # nSeeds, cityStateMax, civMax, outDir
 *
 * The seeder imports only `world/` and node builtins — if a symbol needs to
 * know what a tile is WORTH or what a rule DOES, it belongs engine-side
 * (`cpu/export/` compiles Layer B, the GPU's planes, from these files).
 *
 * Placement (spaced-balanced@1, #71): every major civ starts as a SETTLER and
 * a WARRIOR on a legal, resource-floored start >= 10 tiles from the others —
 * no pre-founded capitals, no planned future cities. City-states remain
 * founded cities. `rngInit` is DECLARED ((seed ^ 0x9e3779b9) >>> 0): placement
 * draws only from its own labelled streams, so the play stream starts at the
 * seed and placement changes can never shift it.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

import { generateMap } from '../world/mapgen';
import { TERRAINS } from '../world/terrains';
import { FEATURES } from '../world/features';
import { RESOURCES } from '../world/resources';
import { WONDERS } from '../world/wonders';
import type { WorldFile } from '../world/file';
import { placeCivs, placeCityStates, PLACEMENT_VERSION } from './place';
import { genStamp } from './stamp';

const args = process.argv.slice(2).filter((a) => a !== '--check');
const CHECK = process.argv.includes('--check');
const N_SEEDS = Number(args[0] ?? 12);
const CITY_STATE_MAX = Number(args[1] ?? 3);
const CIV_MAX = Number(args[2] ?? 2);
const OUT = args[3] ?? 'seeder/worlds';
const WIDTH = 44;
const HEIGHT = 26;
const LOCK_PATH = 'seeder/worlds.lock';

/** The seed list: plain arithmetic. The old survivability SEED_OVERRIDES died
 *  with the scripted reference game — a bad seed is now a coverage question
 *  answered at the level of the SEED SET, never by hand-picking survivors. */
const seeds = Array.from({ length: N_SEEDS }, (_, s) => 9001 + s * 13);

const params = { width: WIDTH, height: HEIGHT, cityStateMax: CITY_STATE_MAX, civMax: CIV_MAX };
const stamp = genStamp({ ...params, seeds, placement: PLACEMENT_VERSION });

const ELEVATIONS = ['FLAT', 'HILLS', 'MOUNTAIN'];

function buildWorld(seed: number): WorldFile {
  // withVillages: false — goody-hut claiming is outside the ported scope.
  const map = generateMap({ width: WIDTH, height: HEIGHT, seed, withResources: true, withWonders: true, withVillages: false });
  const catalogs = {
    terrains: Object.keys(TERRAINS),
    elevations: ELEVATIONS,
    features: Object.keys(FEATURES),
    resources: Object.keys(RESOURCES),
    wonders: Object.keys(WONDERS),
  };
  const idx = (list: string[], v: string | null): number => (v === null ? -1 : list.indexOf(v));
  const { starts, civs } = placeCivs(map, seed, 1 + CIV_MAX);
  const cityStates = placeCityStates(map, seed, CITY_STATE_MAX, starts);
  const world: WorldFile = {
    format: 'world@1',
    gen: { seed, placement: PLACEMENT_VERSION, params, genStamp: stamp },
    catalogs,
    map: {
      width: map.width,
      height: map.height,
      terrain: map.tiles.map((t) => idx(catalogs.terrains, t.terrain)),
      elevation: map.tiles.map((t) => idx(catalogs.elevations, t.elevation)),
      feature: map.tiles.map((t) => idx(catalogs.features, t.feature)),
      resource: map.tiles.map((t) => idx(catalogs.resources, t.resource)),
      wonder: map.tiles.map((t) => idx(catalogs.wonders, t.wonder)),
      riverMask: map.tiles.map((t) => t.riverMask),
      cliffMask: map.tiles.map((t) => t.cliffMask ?? 0),
      volcano: map.tiles.map((t) => (t.volcano ? 1 : 0)),
      goodyHut: map.tiles.map((t) => (t.goodyHut ? 1 : 0)),
    },
    civs,
    cityStates,
    rngInit: (seed ^ 0x9e3779b9) >>> 0,
  };
  world.worldHash = createHash('sha256').update(JSON.stringify(world)).digest('hex');
  return world;
}

const worlds = seeds.map(buildWorld);
const lock = {
  placement: PLACEMENT_VERSION,
  params,
  genStamp: stamp,
  worlds: Object.fromEntries(worlds.map((w) => [String(w.gen.seed), w.worldHash])),
};

if (CHECK) {
  if (!existsSync(LOCK_PATH)) {
    console.error(`no ${LOCK_PATH} — run \`npm run seed\` once to establish the baseline`);
    process.exit(1);
  }
  const have = JSON.parse(readFileSync(LOCK_PATH, 'utf-8')) as typeof lock;
  const drift: string[] = [];
  if (have.placement !== lock.placement) drift.push(`placement ${have.placement} -> ${lock.placement}`);
  if (have.genStamp !== lock.genStamp) drift.push('genStamp moved (seeder/world source or params changed)');
  for (const [sd, h] of Object.entries(lock.worlds)) {
    if (have.worlds?.[sd] !== h) drift.push(`seed ${sd}: ${String(have.worlds?.[sd]).slice(0, 12)} -> ${String(h).slice(0, 12)}`);
  }
  for (const sd of Object.keys(have.worlds ?? {})) {
    if (!(sd in lock.worlds)) drift.push(`seed ${sd}: in the lock, no longer generated`);
  }
  if (drift.length) {
    console.error(`WORLDS DRIFTED from ${LOCK_PATH}:`);
    for (const d of drift) console.error(`  ${d}`);
    process.exit(1);
  }
  console.log(`worlds are current (${lock.genStamp.slice(0, 16)}, ${worlds.length} seeds)`);
} else {
  mkdirSync(OUT, { recursive: true });
  for (const w of worlds) {
    writeFileSync(`${OUT}/seed${w.gen.seed}.world.json`, JSON.stringify(w));
    console.log(
      `seed${w.gen.seed}.world.json: ${w.civs.length} civs (settler+warrior starts), ` +
        `${w.cityStates.length} CS, ${w.map.terrain.length} tiles`,
    );
  }
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 1) + '\n');
  // Sweep orphans: the emit set is the single source of truth — a stale
  // world poisons the serve gate, which globs this directory.
  const emitted = new Set(worlds.map((w) => `seed${w.gen.seed}.world.json`));
  for (const f of readdirSync(OUT)) {
    if (/^seed\d+\.world\.json$/.test(f) && !emitted.has(f)) {
      rmSync(`${OUT}/${f}`);
      console.log(`orphaned world removed: ${f}`);
    }
  }
  console.log(`\nSeeded ${worlds.length} t0 worlds in ${OUT}/ (${PLACEMENT_VERSION}); lock -> ${LOCK_PATH}`);
  console.log('Compile the GPU planes with `npm run export` (cpu/export/export.ts).');
}
