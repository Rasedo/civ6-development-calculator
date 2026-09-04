import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat } from '../../../cpu/core/seats';
import { deriveMountainRanges } from '../../../world/query';
import { tunnelTarget, portalExit, PORTAL_MP } from '../../../cpu/core/rules';
import { tunnelAt } from '../../../cpu/core/units';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { IMPROVEMENT_IDS, unitActionNames } from '../../../cpu/core/unitActions';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (Mountain Tunnel): "Acts as a movement portal on a mountain range,
 * allowing units to move into it and exit from another portal at the cost of
 * 2 Movement. ... Can only be built on an adjacent Mountain tile. Cannot be
 * pillaged or removed." Expansion2_Improvements.xml gives PrereqTech
 * TECH_CHEMISTRY, UNIT_MILITARY_ENGINEER alone, the five mountain terrains
 * and PlunderType PLUNDER_NONE (C-20).
 *
 * The GPU twin is tests/gpu/mountain_tunnel_test.py.
 */
function ridge(cols: number[]): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  for (const c of cols) tileAtCoords(state.map, c, 5).elevation = 'MOUNTAIN';
  deriveMountainRanges(state.map);
  return state;
}

describe('the mountain tunnel', () => {
  it('reads the install: engineer only, on a mountain, unpillageable', () => {
    const d = IMPROVEMENTS.MOUNTAIN_TUNNEL;
    expect(d.engineer).toBe(true);
    expect(d.elevations).toEqual(['MOUNTAIN']);
    expect(d.noPillage).toBe(true);
    expect(PORTAL_MP).toBe(2);
  });

  it('appends its verbs LAST, so no earlier column moves', () => {
    const names = unitActionNames(IMPROVEMENT_IDS);
    expect(names[names.length - 1]).toBe('PORTAL');
    expect(IMPROVEMENT_IDS[IMPROVEMENT_IDS.length - 1]).toBe('MOUNTAIN_TUNNEL');
    // PILLAGE sits after every BUILD column, so a new improvement moves it —
    // which is why nothing may write these seats down (#78)
    expect(names.indexOf('PILLAGE')).toBeGreaterThan(names.indexOf('BUILD_MOUNTAIN_TUNNEL'));
  });

  it('flood-fills a range, and separates two that do not touch', () => {
    const s = ridge([3, 4, 5]);
    tileAtCoords(s.map, 12, 5).elevation = 'MOUNTAIN';
    deriveMountainRanges(s.map);
    const a = tileAtCoords(s.map, 3, 5).mountainRange;
    const b = tileAtCoords(s.map, 5, 5).mountainRange;
    const far = tileAtCoords(s.map, 12, 5).mountainRange;
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBe(a);                       // one connected ridge
    expect(far).not.toBe(a);                 // a separate range
    expect(tileAtCoords(s.map, 8, 8).mountainRange).toBe(-1);  // not a mountain
  });

  it('builds from an ADJACENT tile, taking the lowest-index bare mountain', () => {
    const s = ridge([3, 4, 5]);
    // a tile beside the ridge — its own tile is not a mountain
    const stand = tileAtCoords(s.map, 4, 6);
    const t = tunnelTarget(s.map, stand);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(s.map.tiles[t].elevation).toBe('MOUNTAIN');
    // ...the LOWEST index of the bare adjacent mountains, deterministically
    const adj = [3, 4, 5].map((c) => tileAtCoords(s.map, c, 5).index)
      .filter((i) => Math.abs(s.map.tiles[i].col - stand.col) <= 1);
    expect(t).toBe(Math.min(...adj));
    // once built there, it is no longer a candidate
    s.map.tiles[t].improvement = 'MOUNTAIN_TUNNEL';
    expect(tunnelTarget(s.map, stand)).not.toBe(t);
  });

  it('makes its own mountain ENTERABLE and nothing else', () => {
    const s = ridge([3, 4, 5]);
    const m = tileAtCoords(s.map, 4, 5);
    expect(tunnelAt(m)).toBe(false);
    m.improvement = 'MOUNTAIN_TUNNEL';
    expect(tunnelAt(m)).toBe(true);
    // the tile is still a mountain — the fourteen baked flags must not move
    expect(m.elevation).toBe('MOUNTAIN');
    expect(tunnelAt(tileAtCoords(s.map, 3, 5))).toBe(false);
  });

  it('exits at the NEXT portal on its range, wrapping, and never off-range', () => {
    const s = ridge([3, 4, 5]);
    const [a, b, c] = [3, 4, 5].map((x) => tileAtCoords(s.map, x, 5));
    for (const t of [a, b, c]) t.improvement = 'MOUNTAIN_TUNNEL';
    const idx = [a, b, c].map((t) => t.index).sort((x, y) => x - y);
    expect(portalExit(s.map, s.map.tiles[idx[0]])).toBe(idx[1]);
    expect(portalExit(s.map, s.map.tiles[idx[1]])).toBe(idx[2]);
    expect(portalExit(s.map, s.map.tiles[idx[2]])).toBe(idx[0]);   // wraps
  });

  it('gives a lone portal nowhere to go, and a bare mountain nothing at all', () => {
    const s = ridge([3, 4, 5]);
    const only = tileAtCoords(s.map, 4, 5);
    only.improvement = 'MOUNTAIN_TUNNEL';
    expect(portalExit(s.map, only)).toBe(-1);          // the only one on its range
    expect(portalExit(s.map, tileAtCoords(s.map, 3, 5))).toBe(-1);  // no tunnel here
  });

  it('never exits onto a portal on a DIFFERENT range', () => {
    const s = ridge([3, 4, 5]);
    tileAtCoords(s.map, 12, 5).elevation = 'MOUNTAIN';
    deriveMountainRanges(s.map);
    const near = tileAtCoords(s.map, 4, 5);
    const far = tileAtCoords(s.map, 12, 5);
    near.improvement = 'MOUNTAIN_TUNNEL';
    far.improvement = 'MOUNTAIN_TUNNEL';
    expect(near.mountainRange).not.toBe(far.mountainRange);
    expect(portalExit(s.map, near)).toBe(-1);
    expect(portalExit(s.map, far)).toBe(-1);
  });
});
