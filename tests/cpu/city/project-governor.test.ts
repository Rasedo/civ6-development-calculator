import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { governorsOf } from '../../../cpu/core/governors';
import { seatPhase } from '../../../cpu/core/phase';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBitValue, type GovernorId } from '../../../cpu/data/governors';
import { PROJECTS } from '../../../cpu/data/projects';

// THE GOVERNOR'S PROJECT PERCENT. CIV6 (Arms Race Proponent): one
// MODIFIER_SINGLE_CITY_ADJUST_PROJECT_PRODUCTION row, Amount 30, on each of
// PROJECT_MANHATTAN_PROJECT, PROJECT_OPERATION_IVY, PROJECT_BUILD_NUCLEAR_DEVICE
// and PROJECT_BUILD_THERMONUCLEAR_DEVICE; (Space Initiative)
// MODIFIER_SINGLE_CITY_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION, Amount 30, on
// every project the install marks SpaceRace. The GPU twin is
// tests/gpu/project_governor_test.py.

const NUCLEAR = ['MANHATTAN_PROJECT', 'OPERATION_IVY', 'BUILD_NUCLEAR_DEVICE', 'BUILD_THERMONUCLEAR_DEVICE'];
const SPACE = ['LAUNCH_EARTH_SATELLITE', 'LAUNCH_MOON_LANDING', 'LAUNCH_MARS_COLONY',
  'EXOPLANET_EXPEDITION', 'TERRESTRIAL_LASER_STATION', 'LAGRANGE_LASER_STATION'];

/** one seatPhase of hammers into `project` at the head of both cities of
 *  seat 0; the governor, when named, sits established in the FIRST. */
function fill(project: string, promo?: { gov: GovernorId; id: string }): [number, number] {
  const state = makeState(makeMap(20, 16));
  const a = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  const b = settleAt(state, tileAtCoords(state.map, 12, 5).index, 0);
  if (promo) {
    const g = governorsOf(seatOf(state, 0)!)[GOVERNOR_INDEX[promo.gov]];
    g.appointed = true;
    g.cityId = a.id;
    g.establishTurns = 0;
    g.promotions = promotionBitValue(GOVERNOR_PROMOTION_INDEX[promo.id]!);
  }
  for (const c of [a, b]) c.queue = [{ kind: 'project', project, progress: 0, cost: 1e9 }];
  seatPhase(state);
  return [a.queue[0].progress, b.queue[0].progress];
}

describe.each([
  { gov: 'VICTOR' as GovernorId, id: 'ARMS_RACE_PROPONENT', set: NUCLEAR },
  { gov: 'PINGALA' as GovernorId, id: 'SPACE_INITIATIVE', set: SPACE },
])('$id', ({ gov, id, set }) => {
  it.each(Object.keys(PROJECTS))('%s', (project) => {
    const plain = fill(project);
    const got = fill(project, { gov, id });
    expect(plain[0]).toBeGreaterThan(0);
    expect(got[0]).toBeCloseTo(plain[0] * (set.includes(project) ? 1.3 : 1), 9);
    // the seat's other city is never reached
    expect(got[1]).toBe(plain[1]);
  });
});
