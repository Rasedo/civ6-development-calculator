import { describe, it, expect } from 'vitest';
import {
  neighborOffset, neighborTile, oppositeDir, offsetToAxial, axialToOffset, hexDistance, hexRingWalk, tilesWithin,
  vertexNeighbors, vertexTouchingTiles, vertexKey, DIR_E, DIR_W, type MapShape, type Vertex,
} from '../../../world/hex';
import { hexLineBetween, canSee } from '../../../cpu/core/fog';
import { crossesRiver } from '../../../cpu/core/units';
import { makeMap } from '../helpers';

/** a bounded plane wide enough that no test below reaches its edge */
const PLANE: MapShape = { width: 1000, height: 1000, wrapX: false };

describe('hex math', () => {
  it('offset/axial conversion roundtrips (including negatives)', () => {
    for (let row = -4; row <= 4; row++) {
      for (let col = -4; col <= 4; col++) {
        const [q, r] = offsetToAxial(col, row);
        expect(axialToOffset(q, r)).toEqual([col, row]);
      }
    }
  });

  it('neighbor in direction d, then opposite(d), returns home', () => {
    for (let row = -3; row <= 3; row++) {
      for (let col = -3; col <= 3; col++) {
        for (let d = 0; d < 6; d++) {
          const [nc, nr] = neighborOffset(PLANE, col, row, d);
          expect(neighborOffset(PLANE, nc, nr, oppositeDir(d))).toEqual([col, row]);
          expect(hexDistance(PLANE, col, row, nc, nr)).toBe(1);
        }
      }
    }
  });

  it('all six neighbors are distinct', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 6; d++) {
      const [c, r] = neighborOffset(PLANE, 5, 5, d);
      seen.add(`${c},${r}`);
    }
    expect(seen.size).toBe(6);
  });

  it('tilesWithin returns hex-disc sizes (1 + 3r(r+1))', () => {
    const map = makeMap(20, 20);
    expect(tilesWithin(map, 10, 10, 0).length).toBe(1);
    expect(tilesWithin(map, 10, 10, 1).length).toBe(7);
    expect(tilesWithin(map, 10, 10, 2).length).toBe(19);
    expect(tilesWithin(map, 10, 10, 3).length).toBe(37);
  });

  it('hexDistance is symmetric and satisfies small known cases', () => {
    expect(hexDistance(PLANE, 3, 3, 3, 3)).toBe(0);
    expect(hexDistance(PLANE, 0, 0, 5, 0)).toBe(5);
    expect(hexDistance(PLANE, 2, 1, 7, 4)).toBe(hexDistance(PLANE, 7, 4, 2, 1));
  });
});

describe('a map that wraps in x', () => {
  const W = 10;
  const map = makeMap(W, 8, 'GRASSLAND', true);
  const at = (c: number, r: number) => map.tiles[r * W + c];

  it('neighbours cross the seam both ways', () => {
    expect(neighborTile(map, at(0, 2), DIR_W)).toBe(at(W - 1, 2));
    expect(neighborTile(map, at(W - 1, 2), DIR_E)).toBe(at(0, 2));
    // even row: NW and SW step one column left, off column 0 onto the last
    expect(neighborTile(map, at(0, 2), 2)).toBe(at(W - 1, 1));
    expect(neighborTile(map, at(0, 2), 4)).toBe(at(W - 1, 3));
    // odd row: NE and SE step one column right, off the last onto column 0
    expect(neighborTile(map, at(W - 1, 3), 1)).toBe(at(0, 2));
    expect(neighborTile(map, at(W - 1, 3), 5)).toBe(at(0, 4));
    for (const t of map.tiles) {
      for (let d = 0; d < 6; d++) {
        const n = neighborTile(map, t, d);
        if (n) expect(neighborTile(map, n, oppositeDir(d))).toBe(t);
      }
    }
    // rows do not wrap
    expect(neighborTile(map, at(3, 0), 1)).toBeNull();
  });

  it('measures the shorter way round', () => {
    expect(hexDistance(map, 0, 2, W - 1, 2)).toBe(1);
    expect(hexDistance(map, 1, 1, 8, 1)).toBe(3);
    expect(hexDistance(map, 0, 0, 5, 0)).toBe(5);
    expect(hexDistance(map, 0, 0, 9, 6)).toBe(6);
    for (const a of map.tiles) {
      for (const b of map.tiles) {
        const d = hexDistance(map, a.col, a.row, b.col, b.row);
        expect(d).toBe(hexDistance(map, b.col, b.row, a.col, a.row));
        // adjacency and distance 1 agree
        expect(d === 1).toBe([0, 1, 2, 3, 4, 5].some((k) => neighborTile(map, a, k) === b));
      }
    }
  });

  it('a disk and a ring on a narrow map hold each plot once', () => {
    const narrow = makeMap(4, 9, 'GRASSLAND', true);
    for (const c of narrow.tiles) {
      for (const r of [1, 2, 3]) {
        const disk = tilesWithin(narrow, c.col, c.row, r).map((t) => t.index);
        expect(new Set(disk).size).toBe(disk.length);
        const want = narrow.tiles.filter((t) => hexDistance(narrow, c.col, c.row, t.col, t.row) <= r).map((t) => t.index);
        expect([...disk].sort((x, y) => x - y)).toEqual(want);
        const ring = hexRingWalk(narrow, c.col, c.row, r).map((t) => t.index);
        expect(new Set(ring).size).toBe(ring.length);
        const wantRing = narrow.tiles.filter((t) => hexDistance(narrow, c.col, c.row, t.col, t.row) === r).map((t) => t.index);
        expect([...ring].sort((x, y) => x - y)).toEqual(wantRing);
      }
    }
  });

  it('a wide map keeps the bounded disk and ring order, shifted round', () => {
    const plane = makeMap(W, 8);
    const shift = (i: number) => {
      const c = i % W, r = Math.floor(i / W);
      return r * W + ((c + 3) % W);
    };
    expect(tilesWithin(map, 0, 4, 2).map((t) => t.index))
      .toEqual(tilesWithin(plane, 3, 4, 2).map((t) => t.index).map((i) => (Math.floor(i / W) * W + ((i % W) - 3 + W) % W)));
    expect(hexRingWalk(map, 7, 4, 2).map((t) => t.index))
      .toEqual(hexRingWalk(plane, 4, 4, 2).map((t) => shift(t.index)));
  });

  it('a line of sight runs across the seam', () => {
    const m = makeMap(12, 8, 'GRASSLAND', true);
    const t = (c: number, r: number) => m.tiles[r * 12 + c];
    expect(hexLineBetween(m, t(1, 3), t(10, 3))).toEqual([t(0, 3), t(11, 3)]);
    expect(canSee(m, t(1, 3), t(10, 3), false)).toBe(true);
    t(11, 3).elevation = 'MOUNTAIN';
    expect(canSee(m, t(1, 3), t(10, 3), false)).toBe(false);
  });

  it('a river on a seam edge is crossed from either side', () => {
    const m = makeMap(W, 8, 'GRASSLAND', true);
    const a = m.tiles[2 * W], b = m.tiles[2 * W + W - 1];
    a.riverMask = 1 << DIR_W;
    b.riverMask = 1 << DIR_E;
    expect(crossesRiver(m, a, b)).toBe(true);
    expect(crossesRiver(m, b, a)).toBe(true);
  });

  it('the river-vertex graph names one corner by one key across the seam', () => {
    const v: Vertex = { col: 0, row: 2, side: 'N' };
    const nw = vertexNeighbors(map, v).map((e) => e.to);
    expect(nw.map((x) => x.col).every((c) => c >= 0 && c < W)).toBe(true);
    for (const e of vertexNeighbors(map, v)) {
      expect(vertexNeighbors(map, e.to).some((e2) => vertexKey(e2.to) === vertexKey(v))).toBe(true);
    }
    for (const [c] of vertexTouchingTiles(map, { col: W - 1, row: 3, side: 'S' })) {
      expect(c >= 0 && c < W).toBe(true);
    }
  });
});

describe('vertex (river) graph', () => {
  const someVertices: Vertex[] = [];
  for (let row = 2; row <= 5; row++) {
    for (let col = 2; col <= 5; col++) {
      someVertices.push({ col, row, side: 'N' }, { col, row, side: 'S' });
    }
  }

  it('every vertex has exactly 3 outgoing edges', () => {
    for (const v of someVertices) {
      expect(vertexNeighbors(PLANE, v).length).toBe(3);
    }
  });

  it('edges are symmetric with identical flanking tiles', () => {
    for (const v of someVertices) {
      for (const e of vertexNeighbors(PLANE, v)) {
        const back = vertexNeighbors(PLANE, e.to).find((e2) => vertexKey(e2.to) === vertexKey(v));
        expect(back).toBeDefined();
        const flankSet = (fs: { col: number; row: number; dir: number }[]) =>
          fs.map((f) => `${f.col},${f.row},${f.dir}`).sort().join('|');
        expect(flankSet(back!.flanks)).toBe(flankSet(e.flanks));
      }
    }
  });

  it('edge flanks are mutual hex neighbors with opposite directions', () => {
    for (const v of someVertices) {
      for (const e of vertexNeighbors(PLANE, v)) {
        const [a, b] = e.flanks;
        expect(neighborOffset(PLANE, a.col, a.row, a.dir)).toEqual([b.col, b.row]);
        expect(neighborOffset(PLANE, b.col, b.row, b.dir)).toEqual([a.col, a.row]);
        expect(oppositeDir(a.dir)).toBe(b.dir);
      }
    }
  });

  it('a vertex touches 3 mutually adjacent tiles', () => {
    for (const v of someVertices) {
      const tiles = vertexTouchingTiles(PLANE, v);
      expect(tiles.length).toBe(3);
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          expect(hexDistance(PLANE, tiles[i][0], tiles[i][1], tiles[j][0], tiles[j][1])).toBe(1);
        }
      }
    }
  });
});
