/**
 * THE DROWNED GROUND IS COAST (C-35).
 *
 * SOURCED (the install's pedia, Sea Level Rise): submerged tiles "become
 * coastal water tiles". Both engines keep the ground's terrain, feature and
 * river edges UNDERNEATH on purpose, so every RING fact masks at the READ —
 * `ringTerrain` and `ringFeature` — and only a rule about what lies beneath
 * reads `tile.terrain` directly.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import {
  hasFreshWater, isCoastalLand, isCoastalWater, isWater, ringFeature, ringTerrain,
} from '../../../world/query';
import { districtAdjacency } from '../../../cpu/core/yields';
import type { GameState } from '../../../cpu/core/types';
import type { Tile } from '../../../world/types';

function scene(): GameState {
  const state = makeState(makeMap(24, 24));
  for (const t of state.map.tiles) {
    t.terrain = 'GRASSLAND';
    t.elevation = 'FLAT';
    t.feature = null;
  }
  return state;
}

const at = (s: GameState, c: number, r: number): Tile => tileAtCoords(s.map, c, r);

describe('what a drowned tile presents to its neighbours', () => {
  it('presents COAST and no feature, while keeping both underneath', () => {
    const s = scene();
    const t = at(s, 10, 10);
    t.feature = 'WOODS';
    expect(ringTerrain(t)).toBe('GRASSLAND');
    expect(ringFeature(t)).toBe('WOODS');
    t.submerged = true;
    expect(ringTerrain(t)).toBe('COAST');
    expect(ringFeature(t)).toBeNull();
    // ...and the ground is still recorded, which is the point of the mask
    expect(t.terrain).toBe('GRASSLAND');
    expect(t.feature).toBe('WOODS');
    expect(isWater(t)).toBe(true);
  });
});

describe('the ring facts read the sea', () => {
  it('makes its land neighbours COASTAL', () => {
    const s = scene();
    const land = at(s, 10, 10);
    const sea = at(s, 11, 10);
    expect(isCoastalLand(s.map, land)).toBe(false);
    sea.submerged = true;
    expect(isCoastalLand(s.map, land)).toBe(true);
  });

  it('is itself COASTAL WATER while it still touches land', () => {
    const s = scene();
    const sea = at(s, 10, 10);
    sea.submerged = true;
    expect(isCoastalWater(s.map, sea)).toBe(true);
  });

  it('stops being a LAKE or an OASIS for fresh water', () => {
    const s = scene();
    const land = at(s, 10, 10);
    const oasis = at(s, 11, 10);
    oasis.feature = 'OASIS';
    expect(hasFreshWater(s.map, land)).toBe(true);
    oasis.submerged = true;
    expect(hasFreshWater(s.map, land)).toBe(false);
  });

  it('lends no WOODS adjacency once the sea has it', () => {
    const s = scene();
    const site = at(s, 10, 10);
    const woods = at(s, 11, 10);
    woods.feature = 'WOODS';
    const own = [{ source: 'WOODS' as const, amount: 2 }];
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(2);
    woods.submerged = true;
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(0);
  });

  it('lends no TUNDRA adjacency either', () => {
    const s = scene();
    const site = at(s, 10, 10);
    const cold = at(s, 11, 10);
    cold.terrain = 'TUNDRA';
    const own = [{ source: 'TUNDRA' as const, amount: 1 }];
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(1);
    cold.submerged = true;
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(0);
  });
});
