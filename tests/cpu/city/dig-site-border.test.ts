/** A DIG SITE IS A SEEN RESOURCE to the next-plot scorer, TypeScript half.
 *
 * Resources.xml: RESOURCE_ANTIQUITY_SITE (PrereqCivic Natural History) and
 * RESOURCE_SHIPWRECK (PrereqCivic Cultural Heritage) are resources the
 * player sees once it holds the civic — the border scorer's 'a resource the
 * player can see' (0x1aa7f0) (runs/h1_duelw1112 Yiyang t216-222).
 *
 * The GPU twin is `tests/gpu/dig_site_border_test.py`.
 */
import { describe, it, expect } from 'vitest';
import { makeState, tileAtCoords } from '../helpers';
import { seenResourceAt } from '../../../cpu/core/city';
import { emptySeat } from '../../../cpu/core/seats';

describe('a dig site', () => {
  it('is a seen resource once its civic is held', () => {
    const state = makeState();
    state.seats = [{ ...emptySeat(0), name: 'Seat0' }];
    const wreck = tileAtCoords(state.map, 3, 3);
    wreck.shipwreck = true;
    const site = tileAtCoords(state.map, 5, 5);
    site.antiquity = true;
    expect(seenResourceAt(state, 0)(wreck)).toBe(false);
    expect(seenResourceAt(state, 0)(site)).toBe(false);
    state.seats[0].research.civics.push('CULTURAL_HERITAGE');
    expect(seenResourceAt(state, 0)(wreck)).toBe(true);
    expect(seenResourceAt(state, 0)(site)).toBe(false);
    state.seats[0].research.civics.push('NATURAL_HISTORY');
    expect(seenResourceAt(state, 0)(site)).toBe(true);
  });
});
