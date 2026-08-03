/**
 * The TS oracle side of the off-script parity gate: replays the action
 * logs that gpu/rollout.py recorded from the vectorized engine's random
 * games through the REAL engine, and demands turn-exact agreement.
 *
 *   python gpu/rollout.py            # 1. GPU engine plays + logs
 *   npx vite-node scripts/replay-gpu.ts   # 2. this must print PARITY OK
 *
 * Every logged action is asserted legal here (queue empty, building
 * available, tech/civic selectable, envoy spendable) — an illegal action
 * means the GPU masks diverged from the TS rules, which is itself a
 * parity failure. Unit orders are the exception: both engines re-validate
 * those at execution time, so a rejected order is a mirrored no-op.
 *
 * City production slots and trace columns are keyed by FOUNDING ORDER
 * (`cityIds`), not state.cities position — the array compacts when a city
 * flips to a rival.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { playerSeat, tileBelongsTo } from '../src/core/seats';
import {
  createGame,
  endTurn,
  foundCity,
  queueBuilding,
  queueDistrict,
  queueSettler,
  setTechResearch,
  setCivicResearch,
  purchaseBuilding,
  purchaseSettler,
  purchaseUnit,
  serialize,
  deserialize,
} from '../src/core/game';
import { queueUnit } from '../src/core/units';
import { assignEnvoy } from '../src/core/cityStates';
import { canPlaceDistrict } from '../src/core/rules';
import { districtAdjacency } from '../src/core/yields';
import { traceRow, traceColumns } from './gpu-trace';
import { applySeatZeroUnits } from '../src/core/seatZeroApply';
import type { DistrictId } from '../src/core/types';
import { tsStateLines } from './statelog';

const LOG_RNG = process.env.CIV6_LOG ? Number(process.env.CIV6_LOG) : null;
const logLines: string[] = [];
// §F checkpoints: dump serialize(state) every CIV6_CKPT turns (default 25,
// 0 = off) into the transient ckpt dir; CIV6_RESUME_T resumes each game
// from its checkpoint at that turn (games without one are skipped).
const CKPT_K = process.env.CIV6_CKPT !== undefined ? Number(process.env.CIV6_CKPT) : 25;
const RESUME_T = process.env.CIV6_RESUME_T ? Number(process.env.CIV6_RESUME_T) : null;
const CKPT_DIR = 'gpu/fixtures/ckpt';
if (CKPT_K > 0) mkdirSync(CKPT_DIR, { recursive: true });

const PATH = process.argv[2] ?? 'gpu/fixtures/rollout.json';
// #51/S0.3: the unit-action enum, read from the rules the GPU itself loaded, so
// the replay ladder can never drift from the mask's column order. The old
// hardcoded ladder had PILLAGE on 24 (the FORT column) and no handler at all
// for the real pillage column or for FORT.
const RULES_IMP: string[] = JSON.parse(readFileSync('gpu/fixtures/rules.json', 'utf8')).improvements.ids;

const roll = JSON.parse(readFileSync(PATH, 'utf8')) as {
  width: number;
  height: number;
  unitsMode?: number;
  rangedActive?: number;
  disasters?: number;
  csMax?: number;
  rMax?: number;
  unitIds: string[];
  buildings: string[];
  techs: string[];
  civics: string[];
  scaffold?: string[];
  games: {
    seed: number;
    rng: number;
    sites: number[];
    actions: { t: number; p?: [number, number][]; r?: number; c?: number; e?: number; u?: [number, number, number][] }[];
    trace: number[][];
    rivals?: Record<string, Record<string, unknown>>; // #93: driven rival records per turn
  }[];
};

const NB = roll.buildings.length;
const NU = roll.unitIds.length;
const SCAFFOLD = roll.scaffold ?? [];
let failures = 0;
let games = 0;
let skipped = 0; // resume mode: games without a checkpoint
let worst = 0;

for (const game of roll.games) {
  games += 1;
  let state = createGame({
    width: roll.width,
    height: roll.height,
    seed: game.seed,
    withResources: true,
    withWonders: true,
    unitsMode: !!roll.unitsMode,
    withVillages: false, // must match the exporter — hut claiming is unported
    cityStates: roll.csMax ? roll.csMax : undefined,
    rivals: roll.rMax ? roll.rMax : undefined,
  });
  if (roll.disasters) state.disasters = true;
  foundCity(state, game.sites[0]);
  state.plannedSettles = game.sites.slice(1);
  state.autoResearch = false; // picks come from the action log, as in CivEnv
  // #93: the rollout's rival seats are DRIVEN — the generator recorded their
  // decisions per turn; rivalPhase replays them through the same
  // applyRivalActionRecord path the parity gate uses.
  if (game.rivals) state.rivalActions = game.rivals as never;
  const C = game.sites.length;
  const csMax = roll.csMax ?? 0;
  const rMax = roll.rMax ?? 0;
  const tol = traceColumns(C, csMax, rMax).tol;
  const byTurn = new Map(game.actions.map((a) => [a.t, a]));
  let cityIds: number[] = state.cities.map((x) => x.id);
  // §F resume: continue this game from its checkpoint (deserialized state
  // + the saved cityIds/loop-index); games without one are skipped.
  let t0 = 0;
  if (RESUME_T !== null) {
    const ckf = `${CKPT_DIR}/ts_${game.rng}_t${RESUME_T}.json`;
    if (!existsSync(ckf)) {
      games -= 1;
      skipped += 1;
      continue;
    }
    const wrapped = JSON.parse(readFileSync(ckf, 'utf8'));
    state = deserialize(wrapped.state);
    cityIds = wrapped.cityIds;
    t0 = wrapped.t;
  }
  // Phase-1 combat log: collect the logged game's damage rolls (drained
  // into CB lines by tsStateLines each turn).
  (globalThis as any).__cbLog = LOG_RNG !== null && game.rng === LOG_RNG ? [] : undefined;
  const fail = (msg: string) => {
    console.log(`seed ${game.seed} rng ${game.rng}: ${msg}`);
    failures += 1;
  };

  for (let t = t0; t < game.trace.length; t++) {
    const act = byTurn.get(state.turn);
    let bad = false;
    // Unit orders first (a player moves the army, then ends the turn).
    // Failures are NO-OPS, not errors: both engines re-validate orders at
    // execution time (an earlier unit's move can invalidate a later one's),
    // so a rejected order here must match a no-op there — any real
    // divergence surfaces in the trace comparison instead.
    // #51: the seat-0 unit-order application lives ONCE in
    // src/core/seatZeroApply.ts (typechecked) — this replayer and the
    // serve fork are its two consumers; paraphrases forbidden (9018 t63).
    if (act?.u?.length) {
      if (!applySeatZeroUnits(state, act.u as [number, number, number][], !!roll.rangedActive, RULES_IMP, (m) => fail(m))) {
        bad = true;
      }
    }
    if (bad) break;
    if (act?.e !== undefined) {
      const r = assignEnvoy(state, act.e);
      if (!r.ok) {
        fail(`turn ${state.turn}: assignEnvoy(${act.e}): ${r.reason}`);
        break;
      }
    }
    for (const [slot, a] of act?.p ?? []) {
      const city = state.cities.find((x) => x.id === cityIds[slot]);
      if (!city || city.queue.length > 0) {
        fail(`turn ${state.turn}: production for slot ${slot} but ${city ? 'queue busy' : 'city missing'}`);
        bad = true;
        break;
      }
      if (a < NB) {
        const r = queueBuilding(state, city.id, roll.buildings[a]);
        if (!r.ok) {
          fail(`turn ${state.turn}: queueBuilding(${roll.buildings[a]}) in slot ${slot}: ${r.reason}`);
          bad = true;
          break;
        }
      } else if (a === NB) {
        const r = queueSettler(state, city.id);
        if (!r.ok) {
          fail(`turn ${state.turn}: queueSettler in slot ${slot}: ${r.reason}`);
          bad = true;
          break;
        }
      } else if (a >= NB + 2 && a < NB + 2 + NU) {
        const r = queueUnit(state, city.id, roll.unitIds[a - NB - 2]);
        if (!r.ok) {
          fail(`turn ${state.turn}: queueUnit(${roll.unitIds[a - NB - 2]}) in slot ${slot}: ${r.reason}`);
          bad = true;
          break;
        }
      } else if (a >= NB + 2 + NU + SCAFFOLD.length) {
        // Gold purchase (V-P2): the GPU bought a building / settler / unit
        // outright at GOLD_PURCHASE_MULT× cost. Failures are SOFT no-ops,
        // like unit orders: both engines re-validate at execution — the
        // shared treasury drains in logged slot order, and a bought unit
        // needs a free spawn tile (TS refunds when spawnUnit finds none) —
        // so a rejected purchase here must match the GPU's no-op there. Any
        // real divergence surfaces in the trace comparison instead.
        const pb = a - (NB + 2 + NU + SCAFFOLD.length);
        if (pb < NB) purchaseBuilding(state, city.id, roll.buildings[pb]);
        else if (pb === NB) purchaseSettler(state, city.id);
        else if (pb <= NB + NU) purchaseUnit(state, city.id, roll.unitIds[pb - NB - 1]);
        else {
          fail(`turn ${state.turn}: unknown production code ${a} in slot ${slot}`);
          bad = true;
          break;
        }
      } else if (a >= NB + 2 + NU) {
        // District placement (D5 → P2): the RL production head QUEUES a
        // scaffold district in THIS city (any city, slot order) — mirror the
        // scan (owned, unimproved — AUDIT C-6: bonus-resource tiles are
        // pickable, canPlaceDistrict refuses luxury/strategic; best
        // floor(districtAdjacency), ties lowest index) then route through the
        // real queueDistrict: tile paved incomplete + feature stripped + any
        // bonus resource removed, and the build slot works it off at districtCost.
        const districtId = SCAFFOLD[a - NB - 2 - NU] as DistrictId | undefined;
        if (!districtId) {
          fail(`turn ${state.turn}: district action ${a} in slot ${slot} but no scaffold[${a - NB - 2 - NU}]`);
          bad = true;
          break;
        }
        let best = -1;
        let bestAdj = -1;
        for (const tile of state.map.tiles) {
          if (!tileBelongsTo(tile, city) || tile.improvement) continue;
          if (!canPlaceDistrict(state, city, districtId, tile.index).ok) continue;
          const adj = districtAdjacency(state.map, tile, districtId);
          if (adj > bestAdj) {
            bestAdj = adj;
            best = tile.index;
          }
        }
        if (best < 0) {
          // No eligible tile — a builder improved (or districted) the only
          // candidate EARLIER this turn: unit orders run before production, so
          // the mask's start-of-turn eligibility can be consumed before the
          // district is placed. The GPU's _place_district re-validates on the
          // same post-builder state and no-ops identically, so this is a NO-OP,
          // not an error — exactly like the unit orders above. Leave the build
          // slot idle; any real placement divergence surfaces in the per-turn
          // trace comparison below.
          continue;
        }
        queueDistrict(state, city.id, districtId, best);
      } // a === NB+1: idle — queue nothing
    }
    if (!bad && act?.r !== undefined) {
      if (playerSeat(state).research.tech !== null) {
        fail(`turn ${state.turn}: tech pick while research busy`);
        bad = true;
      } else {
        const r = setTechResearch(state, roll.techs[act.r]);
        if (!r.ok) {
          fail(`turn ${state.turn}: setTechResearch(${roll.techs[act.r]}): ${r.reason}`);
          bad = true;
        }
      }
    }
    if (!bad && act?.c !== undefined) {
      if (playerSeat(state).research.civic !== null) {
        fail(`turn ${state.turn}: civic pick while civic busy`);
        bad = true;
      } else {
        const r = setCivicResearch(state, roll.civics[act.c]);
        if (!r.ok) {
          fail(`turn ${state.turn}: setCivicResearch(${roll.civics[act.c]}): ${r.reason}`);
          bad = true;
        }
      }
    }
    if (bad) break;

    endTurn(state);
    if (LOG_RNG !== null && game.rng === LOG_RNG) logLines.push(...tsStateLines(state, roll.unitIds));
    for (const c of state.cities) {
      if (cityIds.includes(c.id)) continue;
      if (cityIds.length < C) { cityIds.push(c.id); continue; }
      // P5/S2: a 7th-plus ever-founded city reuses the first dead column,
      // mirroring the GPU's first-free-hole slot when founded_n >= C.
      const hole = cityIds.findIndex((id) => !state.cities.some((x) => x.id === id));
      if (hole >= 0) cityIds[hole] = c.id;
    }
    const want = game.trace[t];
    const got = traceRow(state, cityIds, C, csMax, rMax);
    if (process.env.REPLAY_DEBUG) {
      const bads = [];
      for (let i = 0; i < got.length; i++) if (Math.abs(got[i] - want[i]) > tol[i]) bads.push(`col${i} TS=${got[i]} GPU=${want[i]}`);
      if (bads.length) console.log(`DEBUG seed ${game.seed} rng ${game.rng} turn ${state.turn - 1}: ${bads.join('; ')}`);
    }
    for (let i = 0; i < got.length; i++) {
      const diff = Math.abs(got[i] - want[i]);
      if (tol[i] > 0) worst = Math.max(worst, diff);
      if (diff > tol[i]) {
        fail(`turn ${state.turn - 1}: column ${i} TS=${got[i]} GPU=${want[i]}`);
        bad = true;
        break;
      }
    }
    // §F checkpoints: raw state every CIV6_CKPT turns (statelog-labeled by
    // state.turn, matching the GPU's sim.turn naming) — written before the
    // bad-break so a diverged turn's TS view is also dumped for ckptdiff.
    if (CKPT_K > 0 && state.turn % CKPT_K === 0) {
      writeFileSync(`${CKPT_DIR}/ts_${game.rng}_t${state.turn}.json`, JSON.stringify({ t: t + 1, cityIds, state: serialize(state) }));
    }
    if (bad) break;
  }
  if (failures > 12) {
    console.log('(stopping after 12 failures)');
    break;
  }
}

if (LOG_RNG !== null) {
  writeFileSync('gpu/fixtures/ts_statelog.txt', logLines.join('\n') + '\n');
  console.log(`state log ${logLines.length} lines -> gpu/fixtures/ts_statelog.txt`);
}

if (skipped > 0) console.log(`resume: ${skipped} game(s) skipped (no ts_<rng>_t${RESUME_T} checkpoint)`);
if (games === 0) {
  // A-13 hunt trap: RESUME_T with a cleared ckpt dir skipped EVERY game and
  // printed a vacuous PARITY OK — a zero-game run is never a pass.
  console.log('REPLAY VACUOUS — 0 games replayed');
  process.exit(1);
}
if (failures === 0) {
  console.log(
    `REPLAY PARITY OK — ${games} random games × ${roll.games[0]?.trace.length ?? 0} turns replayed through the TS engine: ` +
      `integer state exact, float accumulators within ${worst.toFixed(1)} milli-units`,
  );
} else {
  console.log(`${failures} failures`);
  process.exit(1);
}
