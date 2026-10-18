/**
 * THE CITY-STATES' OPERATIONS ON A WORLD (`minorOps.ts` over the operation
 * manager): seed9001's opening — each major's capital founded on its
 * settler's plot, nothing else ordered — for 38 turns; per turn per
 * city-state its operations as the census reads them (the pool, the pick,
 * each operation's target, rally, backup, strengths and teams), the camps
 * its knowledge base holds, its army records, its contracts, its event
 * slots, its threat, and its units' plots. Pinned in minor-ops-pins.json; the
 * GPU twin is tests/gpu/minor_ops_test.py, against the same pins.
 */
import { describe, it } from 'vitest';
import { matchPins } from './pins';
import { readFileSync } from 'node:fs';
import { loadWorld } from '../../../cpu/world/load';
import { endTurn, foundCity } from '../../../cpu/core/game';
import { groupDump } from '../../../cpu/core/statecompare';
import type { GameState } from '../../../cpu/core/types';
import type { WorldFile } from '../../../world/file';

const MINOR_OPS_TURNS = 38;
const MINOR_OPS_FIELDS = ['minorOps', 'minorCampsKnown', 'minorArmyKnown', 'minorContracts', 'minorAiSlots', 'minorThreat',
  'minorAiHand'];

/** each city-state's units as plot x 1000 + pool slot, sorted */
function unitPlots(state: GameState): Record<string, number[]> {
  return Object.fromEntries(state.cityStates.map((cs) => [String(cs.id), state.units.filter((u) => u.seat === cs.seat)
    .map((u) => u.tileIndex * 1000 + (u.slot ?? 999)).sort((a, b) => a - b)]));
}

function minorOpsRun(): unknown[] {
  const state = loadWorld(JSON.parse(readFileSync('seeder/worlds/seed9001.world.json', 'utf-8')) as WorldFile);
  for (const s of state.seats) {
    const u = state.units.find((x) => x.seat === s.seat && x.type === 'SETTLER');
    if (u) foundCity(state, u.tileIndex, s.seat);
  }
  const out: unknown[] = [];
  for (let t = 0; t < MINOR_OPS_TURNS; t++) {
    endTurn(state);
    const d = groupDump(state, 'cityState');
    const plots = unitPlots(state);
    out.push(Object.fromEntries(Object.entries(d).map(([k, row]) => [k,
      { ...Object.fromEntries(MINOR_OPS_FIELDS.map((f) => [f, row[f]])), unitPlots: plots[k] ?? [] }])));
  }
  return out;
}

describe("the city-states' operations on a world", () => {
  it('play the opening as pinned', () => {
    matchPins('minor-ops-pins.json', minorOpsRun());
  }, 60000);
});
