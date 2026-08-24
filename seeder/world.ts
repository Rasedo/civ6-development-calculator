/**
 * THE WORLD PRODUCER — generates seeded t0 worlds (Layer A), engine-free.
 *
 *   npm run seed                 # writes seeder/worlds/seed*.world.json + worlds.lock
 *   npm run seed -- --check      # regenerate in memory, diff against worlds.lock
 *   npm run seed -- 12 3 3 out/  # nSeeds, cityStateMax, civCount, outDir
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
import { WORLD_PRESETS } from './presets';
import { genStamp } from './stamp';

const args = process.argv.slice(2).filter((a) => a !== '--check');
const CHECK = process.argv.includes('--check');
const pi = args.indexOf('--preset');
const PRESET_NAME = pi >= 0 ? args.splice(pi, 2)[1] : 'baseline';
const P = WORLD_PRESETS[PRESET_NAME];
if (!P) throw new Error(`unknown world preset '${PRESET_NAME}' — have: ${Object.keys(WORLD_PRESETS).join(', ')}`);
const N_SEEDS = Number(args[0] ?? P.nSeeds);
const CITY_STATE_MAX = Number(args[1] ?? P.cityStateMax);
const CIV_COUNT = Number(args[2] ?? P.civCount);
// baseline keeps today's paths; any other preset gets ITS OWN directory and
// ITS OWN lock, so seeding a preset can never clobber the baseline family.
const OUT = args[3] ?? (PRESET_NAME === 'baseline' ? 'seeder/worlds' : `seeder/worlds/presets/${PRESET_NAME}`);
const WIDTH = P.width;
const HEIGHT = P.height;
const LOCK_PATH = PRESET_NAME === 'baseline' ? 'seeder/worlds.lock' : `${OUT}/worlds.lock`;

const seeds = Array.from({ length: N_SEEDS }, (_, s) => P.firstSeed + s * 13);

const params = {
  width: WIDTH, height: HEIGHT, cityStateMax: CITY_STATE_MAX, civCount: CIV_COUNT,
  layout: P.layout, landFraction: P.landFraction,
  resourceMult: P.resourceMult, resourceWeights: P.resourceWeights,
};
const stamp = genStamp({ ...params, seeds, placement: PLACEMENT_VERSION });

const ELEVATIONS = ['FLAT', 'HILLS', 'MOUNTAIN'];

function buildWorld(seed: number): WorldFile {
  const map = generateMap({
    width: WIDTH, height: HEIGHT, seed, withResources: true, withWonders: true, withVillages: false,
    layout: P.layout, landFraction: P.landFraction, resourceMult: P.resourceMult,
    // the default triple keeps the picker's LITERAL 0.45/0.8 boundaries — the
    // normalised quotient of the same weights is a different float.
    resourceWeights: P.resourceWeights[0] === 0.45 && P.resourceWeights[1] === 0.35 && P.resourceWeights[2] === 0.2
      ? undefined : P.resourceWeights,
  });
  const catalogs = {
    terrains: Object.keys(TERRAINS),
    elevations: ELEVATIONS,
    features: Object.keys(FEATURES),
    resources: Object.keys(RESOURCES),
    wonders: Object.keys(WONDERS),
  };
  const idx = (list: string[], v: string | null): number => (v === null ? -1 : list.indexOf(v));
  const { starts, civs } = placeCivs(map, seed, CIV_COUNT);
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
