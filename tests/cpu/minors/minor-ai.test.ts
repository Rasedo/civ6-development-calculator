/**
 * THE CITY-STATES' CITY AI ON A WORLD (`minorAiTurn`, `minorBuild`):
 * seed9001's opening — each major's capital founded on its settler's plot,
 * nothing else ordered — for 16 turns; per turn per city-state its AI's
 * state as the census reads it: the item in hand, its progress, plot and
 * kept progress, the overflow store, the turn and value it was set, the
 * threat, the savings, the event slots, the trees, the contracts, the
 * reservations, the hand and the serials, the treasury, the Builders
 * trained, the best melee strength, the Combat Desire and the standing
 * army's shortfall. Pinned in
 * minor-ai-pins.json; the GPU twin is tests/gpu/minor_ai_test.py, against the
 * same pins.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadWorld } from '../../../cpu/world/load';
import { endTurn, foundCity } from '../../../cpu/core/game';
import { groupDump } from '../../../cpu/core/statecompare';
import type { WorldFile } from '../../../world/file';

const TURNS = 16;
const FIELDS = ['prodProgress', 'minorProdItem', 'minorProdOverflow', 'minorProdKept', 'minorProdSite', 'minorProdSet', 'minorThreat',
  'minorSavings', 'minorAiSlots', 'minorAiTrees', 'minorContracts', 'minorReservations', 'minorAiHand', 'minorTreasury',
  'minorBuildersTrained', 'minorBestMeleeCS', 'minorCombatDesire', 'minorStandingArmyShort'];

function run(): unknown[] {
  const state = loadWorld(JSON.parse(readFileSync('seeder/worlds/seed9001.world.json', 'utf-8')) as WorldFile);
  for (const s of state.seats) {
    const u = state.units.find((x) => x.seat === s.seat && x.type === 'SETTLER');
    if (u) foundCity(state, u.tileIndex, s.seat);
  }
  const out: unknown[] = [];
  for (let t = 0; t < TURNS; t++) {
    endTurn(state);
    const d = groupDump(state, 'cityState');
    out.push(Object.fromEntries(Object.entries(d).map(([k, row]) => [k, Object.fromEntries(FIELDS.map((f) => [f, row[f]]))])));
  }
  return out;
}

describe("the city-states' city AI on a world", () => {
  it('plays the opening as pinned', () => {
    const pins = JSON.parse(readFileSync(new URL('./minor-ai-pins.json', import.meta.url), 'utf-8')) as unknown[];
    expect(JSON.parse(JSON.stringify(run()))).toEqual(pins);
  }, 60000);
});
