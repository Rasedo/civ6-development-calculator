// Civ 6's synchronous generator against the draws the live game returned
// (tools/civ6lab/runs/rng_20260921T090000Z.jsonl: Game.SetRandomSeed /
// Game.GetRandNum / Game.GetRandomSeed over the tuner).
import { describe, expect, it } from 'vitest';
import { Civ6Random, drawsBetween, lcgStep, pickWeighted } from '../../../cpu/harness/civ6Random';
import { floodplainList, stormFootprint } from '../../../cpu/harness/eventDraws';
import type { GameMap, Tile } from '../../../world/types';

const s32 = (x: number) => x | 0;

describe('the generator', () => {
  it('steps the state as the game does', () => {
    const obs: [number, number][] = [[0, 12345], [1, 1103527590], [2, -2087924461], [3, -984409216], [12345, -740551042],
      [65536, 1315778617], [2147483647, 1043980748], [-1, -1103502900]];
    for (const [before, after] of obs) expect(s32(lcgStep(before >>> 0))).toBe(after);
  });

  it('draws the game\'s values, the top 16 bits of the new state times the range', () => {
    // [seed, range, value]
    const obs: [number, number, number][] = [[0, 1000000, 0], [1, 1000000, 4357], [2, 1000000, 8714], [3, 1000000, 13072],
      [12345, 1000000, 14035], [65536, 1000000, 5195], [2147483647, 1000000, 4122], [-1, 1000000, 12602],
      [12345, 2, 1], [12345, 6, 4], [12345, 100, 82], [12345, 1024, 847], [12345, 16384, 13559], [12345, 32767, 27117],
      [12345, 32769, 27118], [12345, 40000, 33103], [12345, 65535, 54235], [12345, 65537, 0], [12345, 100000, 28521],
      [12345, 2147483647, 54235]];
    for (const [seed, range, value] of obs) expect(new Civ6Random(seed >>> 0).get(range)).toBe(value);
  });

  it('reproduces the 24-draw stream from 12345', () => {
    const want = [27118, 21378, 27442, 1749, 24847, 8022, 26254, 22445, 4205, 22514, 13526, 19213, 4879, 10543, 12937,
      16184, 29500, 23990, 8830, 26632, 20479, 11532, 11735, 16048];
    const rng = new Civ6Random(12345);
    expect(want.map(() => rng.get(32768))).toEqual(want);
    expect(drawsBetween(12345, rng.state)).toBe(24);
  });

  it('advances on a range of 0 (the DLL get has no early return)', () => {
    const rng = new Civ6Random(12345);
    expect(rng.get(65536)).toBe(0);
    expect(s32(rng.state)).toBe(-740551042);
  });

  it('picks the first entry whose running sum passes the draw', () => {
    const rng = new Civ6Random(12345);
    // rand(10) from 12345 is 8: the third entry of [3, 4, 3]
    expect(pickWeighted(rng, [3, 4, 3], 't')).toBe(2);
  });
});

function grid(w: number, h: number, wrapX = false): GameMap {
  const tiles: Tile[] = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      tiles.push({ index: row * w + col, col, row, terrain: 'GRASSLAND', elevation: 'FLAT', feature: null, riverMask: 0 } as unknown as Tile);
    }
  }
  return { width: w, height: h, wrapX, seed: 0, tiles };
}

describe('the event draws\' plot orders', () => {
  it('walks a 7-hex storm footprint centre first, then NORTHEAST round to NORTHWEST', () => {
    const map = grid(9, 9);
    // centre (4,4), even row: NE is (4,5), E (5,4), SE (4,3), SW (3,3), W (3,4), NW (3,5)
    expect(stormFootprint(map, map.tiles[4 * 9 + 4], 7).map((t) => [t.col, t.row])).toEqual(
      [[4, 4], [4, 5], [5, 4], [4, 3], [3, 3], [3, 4], [3, 5]]);
    expect(stormFootprint(map, map.tiles[4 * 9 + 4], 19)).toHaveLength(20);
  });

  it('reads a river\'s Floodplains from its mouth up, each edge adding the plot the next does not border', () => {
    // runs/h1_duelw1116 river 250: edges 402|446, 446|447, 447|490, 447|491; list 402, 446, 490, 447, 491
    const map = grid(44, 26, true);
    const t = (i: number) => map.tiles[i];
    for (const i of [402, 446, 447, 490, 491]) t(i).feature = 'FLOODPLAINS_GRASSLAND' as Tile['feature'];
    // engine directions: 0 E, 1 NE (row - 1), 2 NW (row - 1), 3 W, 4 SW (row + 1), 5 SE (row + 1)
    const edge = (a: number, d: number, b: number) => { t(a).riverMask |= 1 << d; t(b).riverMask |= 1 << ((d + 3) % 6); };
    edge(446, 1, 402);
    edge(446, 0, 447);
    edge(447, 4, 490);
    edge(447, 5, 491);
    expect(floodplainList(map, t(402)).map((l) => l.map((x) => x.index))).toEqual([[402, 446, 490, 447, 491]]);
  });
});
