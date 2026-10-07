/**
 * THE DROWNED GROUND IS COAST.
 *
 * The recorded game (runs/h1_duelw1122 t229): a submerged plot reads
 * TERRAIN_COAST, no feature, a Coast's Food 1 Gold 1, and cities work it.
 * `submergeTile` writes the plot as that Coast, so every rule reads the sea.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { hasFreshWater, isCoastalLand, isCoastalWater, isWater } from '../../../world/query';
import { districtAdjacency, tileYields } from '../../../cpu/core/yields';
import { submergeTile } from '../../../cpu/core/climate';
import { cityYieldCtx } from '../../../cpu/core/city';
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

describe('a drowned plot', () => {
  it('becomes a flat, featureless Coast', () => {
    const s = scene();
    const t = at(s, 10, 10);
    t.feature = 'WOODS';
    t.elevation = 'HILLS';
    submergeTile(s, t);
    expect(t.submerged).toBe(true);
    expect(t.terrain).toBe('COAST');
    expect(t.elevation).toBe('FLAT');
    expect(t.feature).toBeNull();
    expect(isWater(t)).toBe(true);
  });

  it("yields a Coast's Food and Gold", () => {
    const s = scene();
    const city = settleAt(s, at(s, 8, 10).index);
    const t = at(s, 10, 10);
    submergeTile(s, t);
    const y = tileYields(cityYieldCtx(s, city), t);
    expect([y.food, y.production, y.gold]).toEqual([1, 0, 1]);
  });
});

describe('the ring facts read the sea', () => {
  it('makes its land neighbours COASTAL', () => {
    const s = scene();
    const land = at(s, 10, 10);
    const sea = at(s, 11, 10);
    expect(isCoastalLand(s.map, land)).toBe(false);
    submergeTile(s, sea);
    expect(isCoastalLand(s.map, land)).toBe(true);
  });

  it('is itself COASTAL WATER while it still touches land', () => {
    const s = scene();
    const sea = at(s, 10, 10);
    submergeTile(s, sea);
    expect(isCoastalWater(s.map, sea)).toBe(true);
  });

  it('stops being an OASIS for fresh water', () => {
    const s = scene();
    const land = at(s, 10, 10);
    const oasis = at(s, 11, 10);
    oasis.feature = 'OASIS';
    expect(hasFreshWater(s.map, land)).toBe(true);
    submergeTile(s, oasis);
    expect(hasFreshWater(s.map, land)).toBe(false);
  });

  it('lends no WOODS adjacency once the sea has it', () => {
    const s = scene();
    const site = at(s, 10, 10);
    const woods = at(s, 11, 10);
    woods.feature = 'WOODS';
    const own = [{ source: 'WOODS' as const, amount: 2 }];
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(2);
    submergeTile(s, woods);
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(0);
  });

  it('lends no TUNDRA adjacency either', () => {
    const s = scene();
    const site = at(s, 10, 10);
    const cold = at(s, 11, 10);
    cold.terrain = 'TUNDRA';
    const own = [{ source: 'TUNDRA' as const, amount: 1 }];
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(1);
    submergeTile(s, cold);
    expect(districtAdjacency(s.map, site, 'HOLY_SITE', [], own)).toBe(0);
  });
});
