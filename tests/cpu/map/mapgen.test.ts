import { describe, it, expect } from 'vitest';
import { generateMap, resourceValidOnTile } from '../../../world/mapgen';
import { neighborOffset, oppositeDir, inBounds, tileAt, neighbors, hexDistance } from '../../../world/hex';
import { RESOURCES } from '../../../world/resources';
import type { GameMap } from '../../../cpu/core/types';

const OPTS = { width: 44, height: 26, seed: 12345 };

function landTiles(map: GameMap) {
  return map.tiles.filter(
    (t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST' && t.terrain !== 'LAKE',
  );
}

describe('map generation', () => {
  const map = generateMap(OPTS);

  it('is deterministic for a given seed', () => {
    const again = generateMap(OPTS);
    expect(JSON.stringify(again)).toBe(JSON.stringify(map));
  });

  it('differs for a different seed', () => {
    const other = generateMap({ ...OPTS, seed: 999 });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(map));
  });

  it('produces a sane land fraction', () => {
    const frac = landTiles(map).length / map.tiles.length;
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.5);
  });

  it('river masks are symmetric across shared edges', () => {
    for (const t of map.tiles) {
      for (let d = 0; d < 6; d++) {
        if (!(t.riverMask & (1 << d))) continue;
        const [nc, nr] = neighborOffset(t.col, t.row, d);
        if (!inBounds(map, nc, nr)) continue;
        const n = tileAt(map, nc, nr)!;
        expect(n.riverMask & (1 << oppositeDir(d))).toBeTruthy();
      }
    }
  });

  it('generates at least one river', () => {
    expect(map.tiles.some((t) => t.riverMask !== 0)).toBe(true);
  });

  it('floodplains lie on flat river plots of their own terrain, the desert, grassland and plains kinds', () => {
    // CIV6 (Expansion2 FeatureGenerator.lua, `GenerateFloodplains(.., 4, 10)`):
    // a run of at least 4 and at most 10 plots along a river from its mouth
    const kind: Record<string, string> = { FLOODPLAINS: 'DESERT', FLOODPLAINS_GRASSLAND: 'GRASSLAND', FLOODPLAINS_PLAINS: 'PLAINS' };
    let n = 0;
    for (const t of map.tiles) {
      if (!t.feature || !(t.feature in kind)) continue;
      n += 1;
      expect(t.terrain).toBe(kind[t.feature]);
      expect(t.elevation).toBe('FLAT');
      expect(t.riverMask).not.toBe(0);
    }
    const all = [1, 2, 3, 4, 5, 6].map((k) => generateMap({ ...OPTS, seed: 1000 + k }))
      .flatMap((m) => m.tiles).filter((t) => t.feature && t.feature in kind);
    expect(n + all.length).toBeGreaterThan(0);
    expect(all.some((t) => t.feature === 'FLOODPLAINS_GRASSLAND' || t.feature === 'FLOODPLAINS_PLAINS')).toBe(true);
  });

  it('ocean tiles never touch land; coast lies within four plots of it', () => {
    // CIV6 (TerrainGenerator.lua): every water plot beside land is Coast,
    // then three "Expanding coasts" passes each widen it by at most a ring
    const land = map.tiles.filter((t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST' && t.terrain !== 'LAKE');
    let expanded = 0;
    for (const t of map.tiles) {
      const touchesLand = neighbors(map, t).some(
        (n) => n.terrain !== 'OCEAN' && n.terrain !== 'COAST' && n.terrain !== 'LAKE',
      );
      if (t.terrain === 'OCEAN') expect(touchesLand).toBe(false);
      if (t.terrain === 'COAST') {
        const d = Math.min(...land.map((u) => hexDistance(t.col, t.row, u.col, u.row)));
        expect(d).toBeLessThanOrEqual(4);
        if (d > 1) expanded++;
      }
    }
    expect(expanded).toBeGreaterThan(0);
  });

  it('every placed resource is valid for its tile', () => {
    let count = 0;
    for (const t of map.tiles) {
      if (!t.resource) continue;
      count++;
      expect(RESOURCES[t.resource]).toBeDefined();
      expect(resourceValidOnTile(t, RESOURCES[t.resource])).toBe(true);
    }
    expect(count).toBeGreaterThan(0);
  });

  it('resources are never adjacent to each other', () => {
    for (const t of map.tiles) {
      if (!t.resource) continue;
      for (const n of neighbors(map, t)) expect(n.resource).toBeNull();
    }
  });

  it('honors withResources=false', () => {
    const bare = generateMap({ ...OPTS, withResources: false });
    expect(bare.tiles.every((t) => t.resource === null)).toBe(true);
  });

  it('mountains exist and have no yields-relevant features', () => {
    const mountains = map.tiles.filter((t) => t.elevation === 'MOUNTAIN');
    expect(mountains.length).toBeGreaterThan(0);
    for (const m of mountains) expect(m.feature).toBeNull();
  });
});
