/** RESOURCE VISIBILITY, TypeScript half.
 *
 * CIV6 (Resources.PrereqTech): a STRATEGIC resource is invisible until its
 * revealing technology — Horses at Animal Husbandry, Iron at Bronze Working,
 * Niter at Military Engineering, Coal at Industrialization, Oil at Refining,
 * Aluminum at Radio, Uranium at Combined Arms. Until then the tile is plain
 * ground to that civilization: no yield from the resource, no improvement
 * forced or offered by it, no access for the units that need it, no
 * stockpile accrual (REQUIREMENT_PLOT_RESOURCE_VISIBLE is what the install's
 * own modifiers ask). The GPU twin is stockpile_ceiling_test.py's poke 6.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs } from '../helpers';
import { setTileOwner, civHasStrategic, hiddenResourcesFor } from '../../../cpu/core/seats';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { tileYields, cityImprovedResourceKinds } from '../../../cpu/core/yields';
import { accrueStockpiles } from '../../../cpu/core/stockpile';
import { validImprovements, canPlaceDistrict } from '../../../cpu/core/rules';
import { RESOURCES } from '../../../world/resources';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import type { GameState } from '../../../cpu/core/types';

const REVEAL: Record<string, string> = {
  HORSES: 'ANIMAL_HUSBANDRY', IRON: 'BRONZE_WORKING', NITER: 'MILITARY_ENGINEERING', COAL: 'INDUSTRIALIZATION',
  OIL: 'REFINING', ALUMINUM: 'RADIO', URANIUM: 'COMBINED_ARMS',
};

function scene(): GameState {
  const state = makeState(makeMap(14, 14, 'GRASSLAND'));
  const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
  for (const [c, r] of [[7, 8], [7, 9]] as const) setTileOwner(tileAtCoords(state.map, c, r), 0, city.id);
  return state;
}

describe('resource visibility', () => {
  it('the seven strategics carry the install\'s revealing technology, nothing else does', () => {
    for (const id of STRATEGIC_IDS) expect(RESOURCES[id]!.revealTech).toBe(REVEAL[id]);
    for (const def of Object.values(RESOURCES)) if (def.category !== 'strategic') expect(def.revealTech).toBeUndefined();
    const state = scene();
    expect([...hiddenResourcesFor(state, 0)].sort()).toEqual([...STRATEGIC_IDS].sort());
    grantTechs(state, 'BRONZE_WORKING');
    expect(hiddenResourcesFor(state, 0).has('IRON')).toBe(false);
    expect(hiddenResourcesFor(state, 0).has('COAL')).toBe(true);
  });

  it('a hidden strategic pays the seat no yield until its technology', () => {
    const state = scene();
    const t = tileAtCoords(state.map, 7, 8);
    t.elevation = 'HILLS';
    t.resource = 'IRON';
    const before = tileYields(makeYieldCtx(state, 0), t);
    grantTechs(state, 'BRONZE_WORKING');
    const after = tileYields(makeYieldCtx(state, 0), t);
    expect(after.science - before.science).toBe(RESOURCES.IRON!.yields.science);
    expect(after.food).toBe(before.food);
  });

  it('a hidden strategic forces and offers no improvement — the plain ground rules apply', () => {
    const state = scene();
    grantTechs(state, 'MINING');
    const t = tileAtCoords(state.map, 7, 9); // flat grassland Niter: a Mine only once Niter is seen
    t.resource = 'NITER';
    expect(validImprovements(state, t, 0)).not.toContain('MINE');
    expect(validImprovements(state, t, 0)).toContain('FARM');
    grantTechs(state, 'MILITARY_ENGINEERING');
    expect(validImprovements(state, t, 0)).toEqual(['MINE']);
  });

  it('a district may stand on a hidden strategic, and not on a seen one', () => {
    const state = scene();
    const city = state.seats[0]!.cities[0]!;
    grantTechs(state, 'WRITING');
    const t = tileAtCoords(state.map, 7, 9);
    t.resource = 'NITER';
    expect(canPlaceDistrict(state, city, 'CAMPUS', t.index).ok).toBe(true);   // plain ground to this seat
    grantTechs(state, 'MILITARY_ENGINEERING');
    expect(canPlaceDistrict(state, city, 'CAMPUS', t.index).ok).toBe(false);  // now a strategic: refused
  });

  it('a hidden strategic accrues nothing, gives no access and counts as unimproved', () => {
    const state = scene();
    const city = state.seats[0]!.cities[0]!;
    const t = tileAtCoords(state.map, 7, 8);
    t.elevation = 'HILLS';
    t.resource = 'IRON';
    t.improvement = 'MINE';
    const slot = STRATEGIC_IDS.indexOf('IRON');
    accrueStockpiles(state, 0);
    expect(state.seats[0]!.stockpile?.[slot] ?? 0).toBe(0);
    expect(civHasStrategic(state, 0, 'IRON')).toBe(false);
    expect(cityImprovedResourceKinds(state, city, 'strategic').has('IRON')).toBe(false);
    grantTechs(state, 'BRONZE_WORKING');
    accrueStockpiles(state, 0);
    expect(state.seats[0]!.stockpile![slot]).toBeGreaterThan(0);
    expect(civHasStrategic(state, 0, 'IRON')).toBe(true);
    expect(cityImprovedResourceKinds(state, city, 'strategic').has('IRON')).toBe(true);
  });
});
