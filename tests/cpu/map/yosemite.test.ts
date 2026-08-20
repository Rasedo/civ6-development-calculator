import { describe, expect, it } from 'vitest';
import { WONDERS } from '../../../world/wonders';

/**
 * — YOSEMITE, sourced from the Civilopedia
 * (features/feature_yosemite): "+1 Gold, +1 Food, and +1 Science to adjacent
 * tiles" and "impassable — units cannot enter this two-tile natural wonder".
 *
 * The fixtures carry `nw` as a BOOLEAN ("is a natural wonder tile"), not a
 * wonder id, so the gate cannot tell whether Yosemite specifically was rolled
 * onto any map — parity green does not prove this one. These assertions pin the
 * data directly instead.
 */
describe('Yosemite', () => {
  it('is impassable', () => {
    expect(WONDERS.YOSEMITE.impassable).toBe(true);
  });

  it('pays its yields to ADJACENT tiles, not its own', () => {
    expect(WONDERS.YOSEMITE.adjacentYields).toEqual({ gold: 1, food: 1, science: 1 });
    expect(WONDERS.YOSEMITE.tileYields).toEqual({});
  });

  it('is a two-tile wonder', () => {
    expect(WONDERS.YOSEMITE.size).toBe(2);
  });
});

/**
 * Natural-wonder and mountain tiles carry a FIXED appeal that adjacency cannot
 * move — 5 and 4 respectively. Only blanket auras
 * (Eiffel Tower, Golden Gate Bridge, Alvar Aalto, Charles Correa) modify them,
 * by overwriting the tile's own property rather than sending an adjacency
 * signal; none are modelled, so these values are final here.
 */
describe('fixed appeal bases', () => {
  const map = (tiles: unknown[]) => ({ width: 3, height: 1, tiles }) as never;
  const t = (over: Record<string, unknown> = {}) =>
    ({
      index: 0, col: 0, row: 0, terrain: 'PLAINS', elevation: 'FLAT',
      feature: null, resource: null, improvement: null, district: null,
      wonder: null, builtWonder: null, riverMask: 0, pillaged: false,
      ...over,
    }) as never;

  it('a natural-wonder tile is 5 regardless of neighbours', async () => {
    const { tileAppeal } = await import('../../../cpu/core/appeal');
    const tiles = [t({ index: 0, col: 0, wonder: 'YOSEMITE' }),
                   t({ index: 1, col: 1, district: 'INDUSTRIAL_ZONE' }),
                   t({ index: 2, col: 2, feature: 'MARSH' })];
    expect(tileAppeal(map(tiles), tiles[0] as never)).toBe(5);
  });

  it('a mountain tile is 4 regardless of neighbours', async () => {
    const { tileAppeal } = await import('../../../cpu/core/appeal');
    const tiles = [t({ index: 0, col: 0, elevation: 'MOUNTAIN' }),
                   t({ index: 1, col: 1, district: 'INDUSTRIAL_ZONE' }),
                   t({ index: 2, col: 2, feature: 'MARSH' })];
    expect(tileAppeal(map(tiles), tiles[0] as never)).toBe(4);
  });
});
