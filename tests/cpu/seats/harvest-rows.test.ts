import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { spawnUnit, builderHarvest } from '../../../cpu/core/units';
import { harvestGrant, CHOP_BASE, chopValue } from '../../../cpu/core/economy';
import { unitActionNames } from '../../../cpu/core/unitActions';
import { IMPROVEMENT_IDS } from '../../../cpu/core/unitActions';
import { RESOURCES } from '../../../world/resources';
import { CULTURE_BOMB_ROWS, SEAT_BAN_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { TECHS } from '../../../cpu/data/techs';
import { CIVICS } from '../../../cpu/data/civics';
import type { GameState, Tile } from '../../../cpu/core/types';

/**
 * THE HARVEST (CIV6 Resource_Harvests): a Builder takes a resource off the
 * tile for a one-off lump. The verb had a body and no caller for months, so
 * it also read and paid SEAT 0 whoever acted (C-52).
 *
 * The GPU twin is tests/gpu/harvest_rows_test.py.
 */
function scene(): { state: GameState; at: Tile; far: Tile } {
  const state = makeState(makeMap(20, 20, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  const centre = tileAtCoords(state.map, 8, 8);
  settleAt(state, centre.index, 1);
  // adjacent to the centre, so the city's own claim owns it and a food lump
  // has a city to land in; `far` is well outside any border
  const at = tileAtCoords(state.map, 9, 8);
  const far = tileAtCoords(state.map, 17, 17);
  return { state, at, far };
}

/** Every tech and civic, so each resource's own improvement is unlocked —
 *  `harvestGrant` gates on `computeUnlocksIn`, not on the resource alone. */
function researchAll(state: GameState, seat: number): void {
  const rs = seatOf(state, seat)!.research;
  rs.techs = Object.keys(TECHS);
  rs.civics = Object.keys(CIVICS);
}

describe('the harvest', () => {
  it('appends HARVEST last, so no existing column moves', () => {
    const names = unitActionNames(IMPROVEMENT_IDS);
    expect(names[names.length - 1]).toBe('HARVEST');
  });

  it('pays the ACTING seat, not seat 0', () => {
    const { state, at } = scene();
    at.resource = 'WHEAT';
    researchAll(state, 1);
    const before0 = state.seats[0].treasury;
    const city = seatOf(state, 1)!;
    expect(city).toBeTruthy();
    const u = spawnUnit(state, 'BUILDER', at.index, 1);
    expect(u).toBeTruthy();
    const res = builderHarvest(state, u!.id);
    expect(res.ok).toBe(true);
    // the resource is GONE, which is what the twin's `nr` planes mirror
    expect(at.resource).toBeNull();
    // seat 0 never acted and must not have been paid
    expect(state.seats[0].treasury).toBe(before0);
  });

  it('refuses a tile outside the acting seat borders', () => {
    const { state, far } = scene();
    far.resource = 'WHEAT';
    researchAll(state, 1);
    const u = spawnUnit(state, 'BUILDER', far.index, 1);
    const res = builderHarvest(state, u!.id);
    expect(res.ok).toBe(false);
    expect(far.resource).toBe('WHEAT');
  });

  it('takes the table base per resource, gold ones paying double', () => {
    const { state, at } = scene();
    researchAll(state, 1);
    for (const [id, base] of [['WHEAT', 20], ['STONE', 20], ['CRABS', 40], ['COPPER', 40]] as const) {
      at.resource = id;
      const g = harvestGrant(state, at, 1);
      expect(g, id).toBeTruthy();
      expect(RESOURCES[id].harvestAmount, id).toBe(base);
      expect(g!.amount, id).toBe(chopValue(state, 1, at, base));
    }
  });

  it('a FEATURE chop keeps its own base, unrelated to the resource table', () => {
    expect(CHOP_BASE).toBe(20);
    // no resource row may silently fall back to the chop base: the ten rows
    // the install lists all carry their own amount
    for (const id of Object.keys(RESOURCES)) {
      const r = RESOURCES[id];
      if (r.harvestYield) expect(r.harvestAmount, id).toBeGreaterThan(0);
    }
  });

  it('refuses a resource the catalog gives no harvest', () => {
    const { state, at } = scene();
    researchAll(state, 1);
    const bare = Object.keys(RESOURCES).find((id) => !RESOURCES[id].harvestYield);
    expect(bare).toBeTruthy();
    at.resource = bare!;
    expect(harvestGrant(state, at, 1)).toBeNull();
  });

  it('every harvestable resource is BONUS, so none provides a luxury it keeps', () => {
    // the twin clears `lux_id`/`res_cat` off the tile; this pins the premise
    // that no harvest can strand a strategic or luxury provision
    for (const id of Object.keys(RESOURCES)) {
      if (RESOURCES[id].harvestYield) expect(RESOURCES[id].category, id).toBe('bonus');
    }
  });
});

describe('the harvest ban', () => {
  it('refuses the civilization the install bans, and only that one', () => {
    const banned = SEAT_BAN_ROWS.find((r) => r.ban === 'harvest');
    expect(banned, 'no civilization in the roster bans the harvest').toBeTruthy();
    const { state, at } = scene();
    at.resource = 'WHEAT';
    researchAll(state, 1);
    // the plain seat must succeed first, or the ban proves nothing
    expect(harvestGrant(state, at, 1)).toBeTruthy();
    seatOf(state, 1)!.civ = CIV_LEADERS.findIndex((l) => l.civ === banned!.civ);
    const u = spawnUnit(state, 'BUILDER', at.index, 1);
    const res = builderHarvest(state, u!.id);
    expect(res.ok).toBe(false);
    expect(at.resource).toBe('WHEAT');
  });
});

describe('the roster culture bomb', () => {
  it('names one improvement carrier and one district carrier', () => {
    expect(CULTURE_BOMB_ROWS.filter((r) => r.improvement).length).toBe(1);
    expect(CULTURE_BOMB_ROWS.filter((r) => r.district).length).toBe(1);
    // exactly one of the two, never both — the appliers branch on it
    for (const r of CULTURE_BOMB_ROWS) {
      expect(Boolean(r.improvement) !== Boolean(r.district), JSON.stringify(r)).toBe(true);
    }
  });
});
