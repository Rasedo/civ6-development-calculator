/**
 * Hex grid math. Civ 6 uses pointy-top hexes in an odd-r offset layout
 * (odd rows shifted +half a hex to the right). A map with `wrapX` wraps in x
 * as the game's maps do: column 0 and column width - 1 are neighbours, and
 * every primitive here (bounds, plot lookup, neighbours, distance, disks,
 * rings, the river-vertex graph) reads columns modulo the width. Rows never
 * wrap.
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

/** the map's shape every hex primitive reads */
export type MapShape = Pick<GameMap, 'width' | 'height' | 'wrapX'>;

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

/** Civ 6's DirectionTypes in the DLL's order — NORTHEAST, EAST, SOUTHEAST,
 *  SOUTHWEST, WEST, NORTHWEST (GameCore_XP2 0xeff670 / 0xeff688) — as this
 *  grid's directions: the game's y grows the way this grid's row does, so
 *  the game's north is this grid's south. */
export const DIRECTION_TYPES: readonly number[] = [DIR_SE, DIR_E, DIR_NE, DIR_NW, DIR_W, DIR_SW];

export function oppositeDir(d: number): number {
  return (d + 3) % 6;
}

export function offsetToAxial(col: number, row: number): [number, number] {
  return [col - ((row - (row & 1)) >> 1), row];
}

export function axialToOffset(q: number, r: number): [number, number] {
  return [q + ((r - (r & 1)) >> 1), r];
}

/** `col` on the map: modulo the width when the map wraps in x, else as is. */
export function wrapCol(map: MapShape, col: number): number {
  return map.wrapX ? ((col % map.width) + map.width) % map.width : col;
}

/** the plot one step in direction `d`, its column wrapped (`wrapCol`); it may
 *  lie off the map's rows, or off its columns on a map that does not wrap. */
export function neighborOffset(map: MapShape, col: number, row: number, d: number): [number, number] {
  const [q, r] = offsetToAxial(col, row);
  const [dq, dr] = AXIAL_DIRS[d];
  const [c, rr] = axialToOffset(q + dq, r + dr);
  return [wrapCol(map, c), rr];
}

function cubeNorm(dq: number, dr: number): number {
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** The axial step (dq, dr) from A to B by the shortest way: on a map that
 *  wraps, B is read at its column shifted by 0, -width and +width and the
 *  first of the shortest wins. */
export function axialDelta(map: MapShape, colA: number, rowA: number, colB: number, rowB: number): [number, number] {
  const [qa, ra] = offsetToAxial(colA, rowA);
  const [qb, rb] = offsetToAxial(colB, rowB);
  const dr = rb - ra;
  let dq = qb - qa;
  if (map.wrapX) {
    let best = cubeNorm(dq, dr);
    for (const s of [-map.width, map.width]) {
      const n = cubeNorm(dq + s, dr);
      if (n < best) {
        best = n;
        dq = qb + s - qa;
      }
    }
  }
  return [dq, dr];
}

export function hexDistance(map: MapShape, colA: number, rowA: number, colB: number, rowB: number): number {
  const dr = rowB - rowA;
  const dq = colB - ((rowB - (rowB & 1)) >> 1) - (colA - ((rowA - (rowA & 1)) >> 1));
  const n = cubeNorm(dq, dr);
  if (!map.wrapX) return n;
  return Math.min(n, cubeNorm(dq - map.width, dr), cubeNorm(dq + map.width, dr));
}

export function inBounds(map: MapShape, col: number, row: number): boolean {
  return row >= 0 && row < map.height && (map.wrapX || (col >= 0 && col < map.width));
}

export function tileAt(map: GameMap, col: number, row: number): Tile | null {
  if (!inBounds(map, col, row)) return null;
  return map.tiles[row * map.width + wrapCol(map, col)];
}

export function neighborTile(map: GameMap, tile: Tile, d: number): Tile | null {
  const [c, r] = neighborOffset(map, tile.col, tile.row, d);
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

/** the direction from `from` to its neighbour `to`, -1 when they are not
 *  neighbours */
export function directionTo(map: GameMap, from: Tile, to: Tile): number {
  for (let d = 0; d < 6; d++) {
    if (neighborTile(map, from, d) === to) return d;
  }
  return -1;
}

/** the on-map plots at the axial offsets `offsets` from (col, row), in the
 *  offsets' order, each plot once (on a narrow wrapping map two offsets can
 *  name one plot; the first keeps it). */
export function tilesAtOffsets(
  map: GameMap,
  col: number,
  row: number,
  offsets: Iterable<readonly [number, number]>,
): Tile[] {
  const [cq, cr] = offsetToAxial(col, row);
  const out: Tile[] = [];
  const seen = map.wrapX ? new Set<number>() : null;
  for (const [dq, dr] of offsets) pushOnce(out, seen, map, cq + dq, cr + dr);
  return out;
}

/** append the plot at axial (q, r) to `out` when it is on the map and not in
 *  `seen` (null: every plot is distinct, a map that does not wrap) */
function pushOnce(out: Tile[], seen: Set<number> | null, map: GameMap, q: number, r: number): void {
  const t = tileAt(map, q + ((r - (r & 1)) >> 1), r);
  if (!t) return;
  if (seen) {
    if (seen.has(t.index)) return;
    seen.add(t.index);
  }
  out.push(t);
}

/** the plots within `radius` of (col, row) — on a wrapping map the shorter
 *  way round — in axial order (dq ascending, then dr), each plot once */
export function tilesWithin(map: GameMap, col: number, row: number, radius: number): Tile[] {
  const [cq, cr] = offsetToAxial(col, row);
  const out: Tile[] = [];
  // two offsets of one row name one plot only where the row of the disk
  // (2 * radius + 1 plots) is wider than the map
  const seen = map.wrapX && map.width <= 2 * radius ? new Set<number>() : null;
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) pushOnce(out, seen, map, cq + dq, cr + dr);
  }
  return out;
}

/** the legs of a ring walk, from the ring's W corner: NE, E, SE, SW, W, NW */
const RING_WALK_LEGS = [DIR_NE, DIR_E, DIR_SE, DIR_SW, DIR_W, DIR_NW] as const;

/** the on-map plots of the hex ring of radius `k` >= 1 around (col, row), in
 *  walk order: from the ring's W corner (k plots due W), k steps along each
 *  leg of `RING_WALK_LEGS` in turn. On a wrapping map a plot is on the ring
 *  when its distance (the shorter way round) is `k`, at its first place on
 *  the walk. */
export function hexRingWalk(map: GameMap, col: number, row: number, k: number): Tile[] {
  const [cq, cr] = offsetToAxial(col, row);
  let q = cq - k;
  let r = cr;
  const out: Tile[] = [];
  const seen = map.wrapX ? new Set<number>() : null;
  for (const d of RING_WALK_LEGS) {
    const [dq, dr] = AXIAL_DIRS[d];
    for (let i = 0; i < k; i++) {
      const [c, rr] = axialToOffset(q, r);
      const t = tileAt(map, c, rr);
      if (t && (!seen || (!seen.has(t.index) && hexDistance(map, col, row, t.col, t.row) === k))) {
        seen?.add(t.index);
        out.push(t);
      }
      q += dq;
      r += dr;
    }
  }
  return out;
}

export interface Vertex {
  col: number;
  row: number;
  side: 'N' | 'S';
}

export function vertexKey(v: Vertex): string {
  return `${v.col},${v.row},${v.side}`;
}

export function vertexTouchingTiles(map: MapShape, v: Vertex): [number, number][] {
  const { col, row } = v;
  if (v.side === 'N') {
    return [[col, row], neighborOffset(map, col, row, DIR_NE), neighborOffset(map, col, row, DIR_NW)];
  }
  return [[col, row], neighborOffset(map, col, row, DIR_SE), neighborOffset(map, col, row, DIR_SW)];
}

interface VertexEdge {
  to: Vertex;
  flanks: { col: number; row: number; dir: number }[];
}

/** the three corners one river edge away from `v`, each with the two plots
 *  flanking that edge; columns wrapped (`wrapCol`), so a corner has one key
 *  on a wrapping map */
export function vertexNeighbors(map: MapShape, v: Vertex): VertexEdge[] {
  const { col, row } = v;
  if (v.side === 'N') {
    const ne = neighborOffset(map, col, row, DIR_NE);
    const nw = neighborOffset(map, col, row, DIR_NW);
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
  const se = neighborOffset(map, col, row, DIR_SE);
  const sw = neighborOffset(map, col, row, DIR_SW);
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
