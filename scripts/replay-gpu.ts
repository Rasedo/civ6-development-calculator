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

import { readFileSync } from 'node:fs';
import {
  createGame,
  endTurn,
  foundCity,
  queueBuilding,
  queueSettler,
  setTechResearch,
  setCivicResearch,
  purchaseBuilding,
  purchaseSettler,
  purchaseUnit,
} from '../src/core/game';
import { queueUnit, walkPath, builderImprove } from '../src/core/units';
import { meleeAttack, rangedAttack } from '../src/core/combat';
import { assignEnvoy } from '../src/core/cityStates';
import { canPlaceDistrict } from '../src/core/rules';
import { districtAdjacency } from '../src/core/yields';
import { neighborTile } from '../src/core/hex';
import { traceRow, rowTolerance } from './gpu-trace';
import { UNITS } from '../src/data/units';
import type { DistrictId } from '../src/core/types';

const PATH = process.argv[2] ?? 'gpu/fixtures/rollout.json';
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
  }[];
};

const NB = roll.buildings.length;
const NU = roll.unitIds.length;
const SCAFFOLD = roll.scaffold ?? [];
let failures = 0;
let games = 0;
let worst = 0;

for (const game of roll.games) {
  games += 1;
  const state = createGame({
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
  const C = game.sites.length;
  const csMax = roll.csMax ?? 0;
  const rMax = roll.rMax ?? 0;
  const tol = rowTolerance(C, csMax, rMax);
  const byTurn = new Map(game.actions.map((a) => [a.t, a]));
  const cityIds: number[] = state.cities.map((x) => x.id);
  const fail = (msg: string) => {
    console.log(`seed ${game.seed} rng ${game.rng}: ${msg}`);
    failures += 1;
  };

  for (let t = 0; t < game.trace.length; t++) {
    const act = byTurn.get(state.turn);
    let bad = false;
    // Unit orders first (a player moves the army, then ends the turn).
    // Failures are NO-OPS, not errors: both engines re-validate orders at
    // execution time (an earlier unit's move can invalidate a later one's),
    // so a rejected order here must match a no-op there — any real
    // divergence surfaces in the trace comparison instead.
    for (const [tile, a, civ] of act?.u ?? []) {
      // Identify the ordered unit by its (start-of-turn) tile and domain,
      // NOT an append-only slot index: a unit that spawns and dies in the
      // same turn would never enter a post-endTurn spawn log, desyncing the
      // indices. A tile holds at most one player unit per domain (1 military
      // + 1 civilian), so tile + civ is unambiguous, and orders execute in
      // the logged order so no earlier move has vacated/entered this tile.
      const unit = state.units.find(
        (un) =>
          un.owner === 'player' &&
          un.tileIndex === tile &&
          (UNITS[un.type]?.charges !== undefined) === (civ === 1),
      );
      if (!unit) {
        fail(`turn ${state.turn}: no player unit at tile ${tile} (civ ${civ})`);
        bad = true;
        break;
      }
      if (a >= 13) {
        // Build an improvement on the builder's tile: 13 FARM, 14 MINE, 15
        // LUMBER_MILL. Soft-fail (no-op) if invalid — the GPU re-validates
        // identically, so a rejected build matches.
        builderImprove(state, unit.id, a === 13 ? 'FARM' : a === 14 ? 'MINE' : 'LUMBER_MILL');
        continue;
      }
      const dir = a % 6;
      const n = neighborTile(state.map, state.map.tiles[unit.tileIndex], dir);
      if (!n) continue;
      if (a < 6) {
        // The action is "step one tile", so apply it as a forced one-step
        // path — NOT orderMove, whose A* may route an adjacent destination
        // through cheaper intermediate tiles (different side effects).
        unit.path = [n.index];
        walkPath(state, unit);
      } else if (a < 12) {
        // V-R: ranged units strike (one roll, no retaliation) when the GPU
        // engine ran with ranged active — same type-based dispatch rule.
        if (roll.rangedActive && UNITS[unit.type]?.ranged) rangedAttack(state, unit.id, n.index);
        else meleeAttack(state, unit.id, n.index);
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
        // District placement (D5): the RL production head placed a scaffold
        // district instantly (free) in THIS city (any city, slot order). Mirror
        // the exporter's scaffold scan EXACTLY — owned by this city, unimproved,
        // canPlaceDistrict, best floor(districtAdjacency) tile, ties to lowest
        // index — and leave the build slot idle, as the GPU's RL block does.
        const districtId = SCAFFOLD[a - NB - 2 - NU] as DistrictId | undefined;
        if (!districtId) {
          fail(`turn ${state.turn}: district action ${a} in slot ${slot} but no scaffold[${a - NB - 2 - NU}]`);
          bad = true;
          break;
        }
        let best = -1;
        let bestAdj = -1;
        for (const tile of state.map.tiles) {
          if (tile.cityId !== city.id || tile.improvement) continue;
          if (!canPlaceDistrict(state, city, districtId, tile.index).ok) continue;
          const adj = districtAdjacency(state.map, tile, districtId);
          if (adj > bestAdj) {
            bestAdj = adj;
            best = tile.index;
          }
        }
        if (best < 0) {
          fail(`turn ${state.turn}: GPU placed ${districtId} in slot ${slot} but TS found no eligible tile`);
          bad = true;
          break;
        }
        const tile = state.map.tiles[best];
        tile.district = districtId;
        tile.districtComplete = true;
        city.districts.push({ type: districtId, tileIndex: best });
      } // a === NB+1: idle — queue nothing
    }
    if (!bad && act?.r !== undefined) {
      if (state.research.tech !== null) {
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
      if (state.research.civic !== null) {
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
    for (const c of state.cities) {
      if (!cityIds.includes(c.id)) cityIds.push(c.id);
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
    if (bad) break;
  }
  if (failures > 12) {
    console.log('(stopping after 12 failures)');
    break;
  }
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
