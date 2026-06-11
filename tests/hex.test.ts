import { describe, it, expect } from 'vitest';
import {
  neighborOffset,
  oppositeDir,
  offsetToAxial,
  axialToOffset,
  hexDistance,
  tilesWithin,
  vertexNeighbors,
  vertexTouchingTiles,
  vertexKey,
  type Vertex,
} from '../src/core/hex';
import { makeMap } from './helpers';

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
          const [nc, nr] = neighborOffset(col, row, d);
          expect(neighborOffset(nc, nr, oppositeDir(d))).toEqual([col, row]);
          expect(hexDistance(col, row, nc, nr)).toBe(1);
        }
      }
    }
  });

  it('all six neighbors are distinct', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 6; d++) {
      const [c, r] = neighborOffset(5, 5, d);
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
    expect(hexDistance(3, 3, 3, 3)).toBe(0);
    expect(hexDistance(0, 0, 5, 0)).toBe(5);
    expect(hexDistance(2, 1, 7, 4)).toBe(hexDistance(7, 4, 2, 1));
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
      expect(vertexNeighbors(v).length).toBe(3);
    }
  });

  it('edges are symmetric with identical flanking tiles', () => {
    for (const v of someVertices) {
      for (const e of vertexNeighbors(v)) {
        const back = vertexNeighbors(e.to).find((e2) => vertexKey(e2.to) === vertexKey(v));
        expect(back).toBeDefined();
        const flankSet = (fs: { col: number; row: number; dir: number }[]) =>
          fs.map((f) => `${f.col},${f.row},${f.dir}`).sort().join('|');
        expect(flankSet(back!.flanks)).toBe(flankSet(e.flanks));
      }
    }
  });

  it('edge flanks are mutual hex neighbors with opposite directions', () => {
    for (const v of someVertices) {
      for (const e of vertexNeighbors(v)) {
        const [a, b] = e.flanks;
        expect(neighborOffset(a.col, a.row, a.dir)).toEqual([b.col, b.row]);
        expect(neighborOffset(b.col, b.row, b.dir)).toEqual([a.col, a.row]);
        expect(oppositeDir(a.dir)).toBe(b.dir);
      }
    }
  });

  it('a vertex touches 3 mutually adjacent tiles', () => {
    for (const v of someVertices) {
      const tiles = vertexTouchingTiles(v);
      expect(tiles.length).toBe(3);
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          expect(hexDistance(tiles[i][0], tiles[i][1], tiles[j][0], tiles[j][1])).toBe(1);
        }
      }
    }
  });
});
