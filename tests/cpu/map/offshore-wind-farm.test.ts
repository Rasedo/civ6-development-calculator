import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders, grantTechs, bareCtx } from '../helpers';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { spawnUnit } from '../../../cpu/core/units';
import { applySeatUnitOrders } from '../../../cpu/core/phase';
import { IMPROVEMENT_IDS, buildColumnOf, unitActionIndex } from '../../../cpu/core/unitActions';
import { validImprovementsIn } from '../../../cpu/core/rules';
import { computeUnlocksIn } from '../../../cpu/core/effects';
import { cityPower, tileYields } from '../../../cpu/core/yields';
import { builderJobAt, jobCtx } from '../../../cpu/core/targetSites';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import type { GameState, Tile } from '../../../cpu/core/types';

// THE OFFSHORE WIND FARM (Expansion2_Improvements.xml): PrereqTech
// TECH_PREDICTIVE_SYSTEMS, Domain DOMAIN_SEA, `Improvement_ValidBuildUnits`
// UNIT_BUILDER, `Improvement_ValidTerrains` TERRAIN_COAST alone (the install's
// Coast is "Coast and Lake"), no `Improvement_ValidFeatures` row, +2
// Production, and OFFSHORE_WIND_FARM_GENERATE_POWER Amount 2 to its city.

const A = unitActionIndex(IMPROVEMENT_IDS);

function world() {
  const state = makeState(makeMap(20, 16));
  state.unitsMode = true;
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 3);
  const water = tileAtCoords(state.map, 9, 8);
  Object.assign(water, { terrain: 'COAST', feature: null, resource: null });
  setTileOwner(water, 0, city.id);
  return { state, city, water };
}

/** A builder AT SEA: `spawnUnit` refuses a water plot to a land unit, so the
 *  unit is landed first and then walked onto the plot it improves. */
function afloat(state: GameState, at: Tile) {
  const u = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 8, 8).index, 0)!;
  u.tileIndex = at.index;
  u.embarked = true;
  return u;
}

/** Issue one action for `u` through the real order path. */
function order(state: GameState, u: { id: number }, action: number) {
  const seat = seatOf(state, 0)!;
  const mine = state.units.filter((x) => x.seat === 0);
  applySeatUnitOrders(state, seat, [mine.map((x) => (x.id === u.id ? action : -1))]);
}

describe('the Offshore Wind Farm', () => {
  it('has a BUILD column, appended after every earlier row', () => {
    expect(IMPROVEMENT_IDS[IMPROVEMENT_IDS.length - 1]).toBe('OFFSHORE_WIND_FARM');
    expect(IMPROVEMENT_IDS.indexOf('MOUNTAIN_ROAD')).toBe(37);
    expect(A.BUILD_OFFSHORE_WIND_FARM).toBe(buildColumnOf(IMPROVEMENT_IDS.indexOf('OFFSHORE_WIND_FARM')));
    expect(A.BUILD_OFFSHORE_WIND_FARM).toBe(A.PILLAGE - 1);
  });

  it('stands on Coast or Lake with no resource and no feature, once Predictive Systems is in', () => {
    const { state, water } = world();
    const offer = (t: Tile) => validImprovementsIn(t, {
      unlocks: computeUnlocksIn(seatOf(state, 0)!.research, []),
      builder: 'BUILDER', map: state.map, ownsTile: () => true,
    });
    expect(offer(water)).not.toContain('OFFSHORE_WIND_FARM');
    grantTechs(state, 'PREDICTIVE_SYSTEMS');
    expect(offer(water)).toEqual(['OFFSHORE_WIND_FARM']);
    water.terrain = 'LAKE';
    expect(offer(water)).toEqual(['OFFSHORE_WIND_FARM']);
    water.terrain = 'OCEAN';
    expect(offer(water)).toEqual([]);
    water.terrain = 'COAST';
    water.feature = 'REEF';
    expect(offer(water)).toEqual([]);
    water.feature = null;
    // a resource of its own insists on its own improvement
    grantTechs(state, 'SAILING');
    water.resource = 'FISH';
    expect(offer(water)).toEqual(['FISHING_BOATS']);
    water.resource = null;
    // and dry ground never takes it
    expect(offer(tileAtCoords(state.map, 7, 8))).not.toContain('OFFSHORE_WIND_FARM');
  });

  it('an embarked Builder lays it, and spends a charge', () => {
    const { state, water } = world();
    grantTechs(state, 'PREDICTIVE_SYSTEMS');
    const u = afloat(state, water);
    const charges = u.charges!;
    order(state, u, A.BUILD_OFFSHORE_WIND_FARM);
    expect(water.improvement).toBe('OFFSHORE_WIND_FARM');
    expect(u.charges).toBe(charges - 1);
  });

  it('...and nobody lays it without Predictive Systems', () => {
    const { state, water } = world();
    const u = afloat(state, water);
    order(state, u, A.BUILD_OFFSHORE_WIND_FARM);
    expect(water.improvement).toBeNull();
  });

  it('is a Builder job on an owned Coast plot once it is unlocked', () => {
    const { state, water } = world();
    expect(builderJobAt(state, jobCtx(state, 0), water)).toBe(false);
    grantTechs(state, 'PREDICTIVE_SYSTEMS');
    expect(builderJobAt(state, jobCtx(state, 0), water)).toBe(true);
    water.improvement = 'OFFSHORE_WIND_FARM';
    expect(builderJobAt(state, jobCtx(state, 0), water)).toBe(false);
  });

  it('pays +2 Production and 2 Power to the city that owns its plot', () => {
    const { state, city, water } = world();
    expect(IMPROVEMENTS.OFFSHORE_WIND_FARM.power).toBe(2);
    const y0 = tileYields(bareCtx(state.map), water).production;
    expect(cityPower(state, city).supply).toBe(0);
    water.improvement = 'OFFSHORE_WIND_FARM';
    expect(tileYields(bareCtx(state.map), water).production).toBe(y0 + 2);
    expect(cityPower(state, city).supply).toBe(2);
    water.pillaged = true;
    expect(cityPower(state, city).supply).toBe(0);
  });
});
