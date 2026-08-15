/**
 * Hex grid math. Civ 6 uses pointy-top hexes in an odd-r offset layout
 * (odd rows shifted +half a hex to the right). No world wrap in stage 1.
 *
 * Direction indexes (used by Tile.riverMask bits):
 *   0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE
 *
 * Rivers run along hex *edges*. We model the lattice of hex corners:
 * every corner is canonically the N (top) corner of exactly one hex or the
 * S (bottom) corner of exactly one hex, which gives an exact integer
 * representation of the corner graph (no floating-point keys).
 */

import type { GameMap, Tile } from './types';

export const SQRT3 = Math.sqrt(3);

export const AXIAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // 0 E
  [1, -1], // 1 NE
  [0, -1], // 2 NW
  [-1, 0], // 3 W
  [-1, 1], // 4 SW
  [0, 1], // 5 SE
];

export const DIR_E = 0;
export const DIR_NE = 1;
export const DIR_NW = 2;
export const DIR_W = 3;
export const DIR_SW = 4;
export const DIR_SE = 5;

export function oppositeDir(d: number): number {
  return (d + 3) % 6;
}

export function offsetToAxial(col: number, row: number): [number, number] {
  return [col - ((row - (row & 1)) >> 1), row];
}

export function axialToOffset(q: number, r: number): [number, number] {
  return [q + ((r - (r & 1)) >> 1), r];
}

export function neighborOffset(col: number, row: number, d: number): [number, number] {
  const [q, r] = offsetToAxial(col, row);
  const [dq, dr] = AXIAL_DIRS[d];
  return axialToOffset(q + dq, r + dr);
}

export function hexDistance(colA: number, rowA: number, colB: number, rowB: number): number {
  const [qa, ra] = offsetToAxial(colA, rowA);
  const [qb, rb] = offsetToAxial(colB, rowB);
  const dq = qa - qb;
  const dr = ra - rb;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function inBounds(map: GameMap, col: number, row: number): boolean {
  return col >= 0 && col < map.width && row >= 0 && row < map.height;
}

export function tileIndex(map: GameMap, col: number, row: number): number {
  return row * map.width + col;
}

export function tileAt(map: GameMap, col: number, row: number): Tile | null {
  if (!inBounds(map, col, row)) return null;
  return map.tiles[tileIndex(map, col, row)];
}

export function neighborTile(map: GameMap, tile: Tile, d: number): Tile | null {
  const [c, r] = neighborOffset(tile.col, tile.row, d);
  return tileAt(map, c, r);
}

export function neighbors(map: GameMap, tile: Tile): Tile[] {
  const out: Tile[] = [];
  for (let d = 0; d < 6; d++) {
    const n = neighborTile(map, tile, d);
    if (n) out.push(n);
  }
  return out;
}

export function tilesWithin(map: GameMap, col: number, row: number, radius: number): Tile[] {
  const [cq, cr] = offsetToAxial(col, row);
  const out: Tile[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) {
      const [c, r] = axialToOffset(cq + dq, cr + dr);
      const t = tileAt(map, c, r);
      if (t) out.push(t);
    }
  }
  return out;
}


export function hexCenter(col: number, row: number, size: number): { x: number; y: number } {
  return { x: SQRT3 * size * (col + 0.5 * (row & 1)), y: 1.5 * size * row };
}

export function cornerOffsets(size: number): { x: number; y: number }[] {
  const w2 = (SQRT3 / 2) * size;
  const s2 = size / 2;
  return [
    { x: w2, y: -s2 },
    { x: 0, y: -size },
    { x: -w2, y: -s2 },
    { x: -w2, y: s2 },
    { x: 0, y: size },
    { x: w2, y: s2 },
  ];
}

export const EDGE_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [5, 0], // E
  [0, 1], // NE
  [1, 2], // NW
  [2, 3], // W
  [3, 4], // SW
  [4, 5], // SE
];

export function pixelToHex(x: number, y: number, size: number): [number, number] {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return axialToOffset(rq, rr);
}


export interface Vertex {
  col: number;
  row: number;
  side: 'N' | 'S';
}

export function vertexKey(v: Vertex): string {
  return `${v.col},${v.row},${v.side}`;
}

export function vertexTouchingTiles(v: Vertex): [number, number][] {
  const { col, row } = v;
  if (v.side === 'N') {
    return [[col, row], neighborOffset(col, row, DIR_NE), neighborOffset(col, row, DIR_NW)];
  }
  return [[col, row], neighborOffset(col, row, DIR_SE), neighborOffset(col, row, DIR_SW)];
}

export interface VertexEdge {
  to: Vertex;
  flanks: { col: number; row: number; dir: number }[];
}

export function vertexNeighbors(v: Vertex): VertexEdge[] {
  const { col, row } = v;
  if (v.side === 'N') {
    const ne = neighborOffset(col, row, DIR_NE);
    const nw = neighborOffset(col, row, DIR_NW);
    return [
      {
        to: { col: ne[0], row: ne[1], side: 'S' },
        flanks: [
          { col, row, dir: DIR_NE },
          { col: ne[0], row: ne[1], dir: DIR_SW },
        ],
      },
      {
        to: { col: nw[0], row: nw[1], side: 'S' },
        flanks: [
          { col, row, dir: DIR_NW },
          { col: nw[0], row: nw[1], dir: DIR_SE },
        ],
      },
      {
        to: { col, row: row - 2, side: 'S' },
        flanks: [
          { col: ne[0], row: ne[1], dir: DIR_W },
          { col: nw[0], row: nw[1], dir: DIR_E },
        ],
      },
    ];
  }
  const se = neighborOffset(col, row, DIR_SE);
  const sw = neighborOffset(col, row, DIR_SW);
  return [
    {
      to: { col: se[0], row: se[1], side: 'N' },
      flanks: [
        { col, row, dir: DIR_SE },
        { col: se[0], row: se[1], dir: DIR_NW },
      ],
    },
    {
      to: { col: sw[0], row: sw[1], side: 'N' },
      flanks: [
        { col, row, dir: DIR_SW },
        { col: sw[0], row: sw[1], dir: DIR_NE },
      ],
    },
    {
      to: { col, row: row + 2, side: 'N' },
      flanks: [
        { col: se[0], row: se[1], dir: DIR_W },
        { col: sw[0], row: sw[1], dir: DIR_E },
      ],
    },
  ];
}

export function vertexPixel(v: Vertex, size: number): { x: number; y: number } {
  const c = hexCenter(v.col, v.row, size);
  return { x: c.x, y: c.y + (v.side === 'N' ? -size : size) };
}
