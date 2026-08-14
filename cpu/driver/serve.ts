/**
 * THE DECISION-SERVER CLIENT CLI — the TS child `gpu/serve_gate.py` spawns.
 *
 *   CIV6_SERVE=1 CIV6_SERVE_SEED=9001 npx vite-node cpu/driver/serve.ts -- <turns> [worldsDir]
 *
 * Loads the seed's WORLD FILE (Layer A — the seeder no longer plays or even
 * links the engine), builds the live state through `cpu/world/load.ts`, and
 * hands the turn loop to `runDriver`: observations out, decisions in, one
 * trace + digest per turn, all over stdio lines prefixed "@@" (ordinary
 * logging cannot corrupt the stream; the orchestrator filters on the
 * sentinel). A serve run is a gate, not an export — nothing is written,
 * except a checkpoint dump when the orchestrator asks for one (#101:
 * {ckpt: path} writes the GameState JSON that CIV6_SERVE_LOAD reloads).
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import type { WorldFile } from '../../world/file';
import { loadWorld } from '../world/load';
import { runDriver } from './driver';
import type { GameState } from '../core/types';
import { CITY_SLOTS_PER_SEAT } from '../data/seats';
import { IMPROVEMENT_IDS } from '../core/unitActions';
import { SCAFFOLD_DISTRICTS } from '../data/districts';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';

if (!process.env.CIV6_SERVE) {
  console.error('cpu/driver/serve.ts runs only in serve mode — set CIV6_SERVE=1 and CIV6_SERVE_SEED');
  process.exit(1);
}
const SEED = Number(process.env.CIV6_SERVE_SEED ?? -1);
const N_TURNS = Number(process.argv[2] ?? 250);
const DIR = process.argv[3] ?? 'seeder/worlds';
const HORIZON = Number(process.env.CIV6_SERVE_HORIZON ?? N_TURNS);

const world = JSON.parse(readFileSync(`${DIR}/seed${SEED}.world.json`, 'utf-8')) as WorldFile;
// #101 resume: CIV6_SERVE_LOAD names a checkpoint dump (the {ckpt} control
// message's JSON of a live GameState) — reload it instead of rebuilding from
// the world file; the serve knobs ride in the dump. The world file is still
// read for the obs-layout params either way.
let state: GameState;
if (process.env.CIV6_SERVE_LOAD) {
  state = JSON.parse(readFileSync(process.env.CIV6_SERVE_LOAD, 'utf-8')) as GameState;
} else {
  state = loadWorld(world);
  // Serve knobs: decisions arrive on the wire turn by turn; the engine's
  // auto-research stands down like every other scripted fallback.
  state.seatActions = {} as GameState['seatActions'];
  state.autoResearch = false;
}

const rd = createInterface({ input: process.stdin, crlfDelay: Infinity })[Symbol.asyncIterator]();
const techList = Object.values(TECHS);
const civicList = Object.values(CIVICS);

await runDriver({
  state,
  seed: SEED,
  // #101: N_TURNS is the run's ABSOLUTE horizon; a resumed state has
  // already played state.turn - 1 of them.
  turns: N_TURNS - (state.turn - 1),
  // The obs layout's per-city slots — the CITY COLUMN width, not the settle
  // cap: loyalty flips can carry a seat past maxCities, and those cities have
  // to be observable and decidable. Matches the GPU's per-seat-row width.
  cityMax: CITY_SLOTS_PER_SEAT,
  cityStateMax: world.gen.params.cityStateMax,
  civMax: world.gen.params.civMax,
  horizon: HORIZON,
  improvementIds: IMPROVEMENT_IDS as unknown as string[],
  scaffoldDistricts: SCAFFOLD_DISTRICTS,
  techList,
  civicList,
  recv: async () => {
    const nx = await rd.next();
    if (nx.done) throw new Error(`serve: stdin closed at turn ${state.turn}`);
    return String(nx.value);
  },
  send: (msg: unknown) => process.stdout.write('@@' + JSON.stringify(msg) + '\n'),
});
