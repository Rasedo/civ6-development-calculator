import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, stepThrough, tileAtCoords } from '../helpers';
import { canFoundCity } from '../../../cpu/core/rules';
import { spawnUnit } from '../../../cpu/core/units';
import { fogActive, isExplored, initFog, canSee, eyeHeight, losDisk, sightThrough, revealAround } from '../../../cpu/core/fog';
import { hexDistance, neighbors } from '../../../world/hex';
import { claimGoodyHut } from '../../../cpu/core/units';
import { generateMap } from '../../../world/mapgen';
import type { Elevation, FeatureId, GameMap, Tile } from '../../../world/types';

function foggyState() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.fogOfWar = true;
  const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
  return { state, city };
}

describe('fog of war', () => {
  it('founding reveals a neighborhood; the rest stays dark', () => {
    const { state } = foggyState();
    expect(fogActive(state)).toBe(true);
    expect(isExplored(state, 0, tileAtCoords(state.map, 9, 9).index)).toBe(true);
    expect(isExplored(state, 0, tileAtCoords(state.map, 12, 9).index)).toBe(true); // radius 3
    expect(isExplored(state, 0, tileAtCoords(state.map, 16, 9).index)).toBe(false);
  });

  it('units reveal as they move; unexplored land cannot be settled', () => {
    const { state } = foggyState();
    const dark = tileAtCoords(state.map, 16, 9);
    expect(canFoundCity(state, dark.index, 0).ok).toBe(false);

    const scout = spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 9, 9).index, 0)!;
    stepThrough(state, scout, [10, 11, 12, 13, 14].map((c) => tileAtCoords(state.map, c, 9).index));
    expect(isExplored(state, 0, tileAtCoords(state.map, 14, 9).index)).toBe(true);
    // dark tile is now within the scout's revealed trail or still dark:
    if (isExplored(state, 0, dark.index)) {
      expect(canFoundCity(state, dark.index, 0).ok).toBe(true);
    }
  });

  it('initFog reveals owned land and unit surroundings when toggled mid-game', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 9, 9).index);
    state.fogOfWar = true;
    initFog(state);
    expect(isExplored(state, 0, tileAtCoords(state.map, 9, 9).index)).toBe(true);
    expect(isExplored(state, 0, tileAtCoords(state.map, 17, 17).index)).toBe(false);
  });
});

describe('sight is occlusion by elevation (ask 11)', () => {
  // measured in the live game: a tile on the ray hides everything
  // behind it iff its SightThroughModifier sum EXCEEDS the observer's own
  // SightModifier; a hill adds height, never range; Sentry sees through features
  function flatRow() {
    const { state } = foggyState();
    const o = tileAtCoords(state.map, 5, 10);
    const e1 = tileAtCoords(state.map, 6, 10);
    const e2 = tileAtCoords(state.map, 7, 10);
    const e3 = tileAtCoords(state.map, 8, 10);
    for (const t of [o, e1, e2, e3]) {
      t.terrain = 'GRASSLAND';
      t.elevation = 'FLAT';
      t.feature = null;
    }
    return { state, o, e1, e2, e3 };
  }

  it('a hill or woods hides what stands behind it from a flat eye; a hill eye looks over one, not both', () => {
    const { state, o, e1, e2 } = flatRow();
    expect(canSee(state.map, o, e2, false)).toBe(true);
    e1.elevation = 'HILLS';
    expect(sightThrough(e1, false)).toBe(1);
    expect(canSee(state.map, o, e1, false)).toBe(true); // the blocker itself is seen
    expect(canSee(state.map, o, e2, false)).toBe(false);
    o.elevation = 'HILLS';
    expect(canSee(state.map, o, e2, false)).toBe(true);
    e1.feature = 'WOODS';
    expect(sightThrough(e1, false)).toBe(2);
    expect(canSee(state.map, o, e2, false)).toBe(false);
    // Sentry: the feature half is nothing, so a hill (1) does not top a hill eye (1)
    expect(sightThrough(e1, true)).toBe(1);
    expect(canSee(state.map, o, e2, true)).toBe(true);
    e1.elevation = 'FLAT';
    o.elevation = 'FLAT';
    expect(canSee(state.map, o, e2, false)).toBe(false); // woods alone hide from a flat eye
    expect(canSee(state.map, o, e2, true)).toBe(true); // ...but not from a Sentry
    e2.feature = 'WOODS';
    expect(canSee(state.map, o, e2, false)).toBe(false); // a plot never shows over its equal
    e2.elevation = 'HILLS';
    expect(canSee(state.map, o, e2, false)).toBe(true); // a wooded hill (2) shows over woods (1)
    e2.elevation = 'FLAT';
    e2.feature = null;
    e1.elevation = 'MOUNTAIN';
    e1.feature = null;
    o.elevation = 'HILLS';
    expect(canSee(state.map, o, e2, false)).toBe(false); // a mountain (2) tops a hill eye (1)
  });

  it('a look between two parents carries the lower; a split parent gives way', () => {
    const { state, o } = flatRow();
    const map = state.map;
    // a ring-2 plot on a side of the ring: the line from the eye runs between
    // its two parents on ring 1
    const parentsOf = (t: Tile) => neighbors(map, t).filter((n) => hexDistance(map, o.col, o.row, n.col, n.row) === 1);
    const b = map.tiles.find((t) => hexDistance(map, o.col, o.row, t.col, t.row) === 2 && parentsOf(t).length === 2)!;
    const [m1, m2] = parentsOf(b);
    for (const t of [b, m1, m2]) {
      t.elevation = 'FLAT';
      t.feature = null;
    }
    m1.elevation = 'HILLS';
    expect(canSee(map, o, b, false)).toBe(true);
    m2.elevation = 'HILLS';
    expect(canSee(map, o, b, false)).toBe(false);
  });

  it('an eye stands at 1 on a city centre or a live Encampment', () => {
    const { o } = flatRow();
    expect(eyeHeight(o)).toBe(0);
    o.district = 'CITY_CENTER';
    expect(eyeHeight(o)).toBe(1);
    o.district = 'ENCAMPMENT';
    o.districtComplete = false;
    expect(eyeHeight(o)).toBe(0);
    o.districtComplete = true;
    expect(eyeHeight(o)).toBe(1);
    o.districtPillaged = true;
    expect(eyeHeight(o)).toBe(0);
    o.district = null;
    o.districtPillaged = false;
    o.elevation = 'MOUNTAIN';
    expect(eyeHeight(o)).toBe(2);
  });

  it('a unit reveal is the cut disk and a hill adds no range; a city reveal is whole', () => {
    const { state, o, e1, e2, e3 } = flatRow();
    e1.elevation = 'HILLS';
    e1.feature = 'WOODS';
    o.elevation = 'HILLS';
    for (const s of state.seats) s.explored = new Array(state.map.tiles.length).fill(0);
    revealAround(state, 0, o.index, 2, { seeThrough: false });
    expect(isExplored(state, 0, e1.index)).toBe(true);
    expect(isExplored(state, 0, e2.index)).toBe(false);
    expect(isExplored(state, 0, e3.index)).toBe(false); // sight 2 stays 2 on a hill
    revealAround(state, 0, o.index, 2, { seeThrough: true });
    expect(isExplored(state, 0, e2.index)).toBe(true); // a Sentry's look: the hill (1) alone does not top a hill eye
    for (const s of state.seats) s.explored = new Array(state.map.tiles.length).fill(0);
    o.elevation = 'FLAT';
    revealAround(state, 0, o.index, 2, { seeThrough: false });
    expect(isExplored(state, 0, e2.index)).toBe(false);
    revealAround(state, 0, o.index, 2);
    expect(isExplored(state, 0, e2.index)).toBe(true); // a city's disk is whole
  });
});

/** the plots round an eye in a recorded game (col, row, elevation,
 *  feature), laid on a flat map of the duel's size */
function recordedPlot(plots: [number, number, Elevation, FeatureId | null][]): GameMap {
  const map = makeMap(44, 26, 'GRASSLAND', true);
  for (const [c, r, e, f] of plots) {
    const t = map.tiles[r * 44 + c];
    t.elevation = e;
    t.feature = f;
  }
  return map;
}

describe("the game's line-of-sight walk (Unit_Sight 0x58b1d0, emulated)", () => {
  const key = (m: GameMap, s: Set<number>) => [...s].map((i) => `${m.tiles[i].col},${m.tiles[i].row}`).sort();
  it("runs/h1_duelw1127 t2: Rome's Settler on flat Rainforest (36,13) does not see the Mountain (34,14)", () => {
    const map = recordedPlot([[34, 9, 'FLAT', 'WOODS'], [35, 9, 'HILLS', null], [36, 9, 'FLAT', 'WOODS'], [37, 9, 'FLAT', null], [38, 9, 'FLAT', null], [34, 10, 'HILLS', null], [35, 10, 'FLAT', null], [36, 10, 'FLAT', null], [37, 10, 'HILLS', 'WOODS'], [38, 10, 'FLAT', null], [39, 10, 'FLAT', null], [33, 11, 'HILLS', 'WOODS'], [34, 11, 'HILLS', null], [35, 11, 'MOUNTAIN', null], [36, 11, 'HILLS', 'RAINFOREST'], [37, 11, 'HILLS', 'WOODS'], [38, 11, 'MOUNTAIN', null], [39, 11, 'FLAT', null], [33, 12, 'FLAT', null], [34, 12, 'FLAT', null], [35, 12, 'FLAT', 'RAINFOREST'], [36, 12, 'HILLS', 'RAINFOREST'], [37, 12, 'FLAT', 'WOODS'], [38, 12, 'HILLS', null], [39, 12, 'FLAT', 'RAINFOREST'], [40, 12, 'FLAT', null], [32, 13, 'FLAT', null], [33, 13, 'FLAT', 'RAINFOREST'], [34, 13, 'MOUNTAIN', null], [35, 13, 'HILLS', null], [36, 13, 'FLAT', 'RAINFOREST'], [37, 13, 'HILLS', null], [38, 13, 'FLAT', 'WOODS'], [39, 13, 'FLAT', 'RAINFOREST'], [40, 13, 'FLAT', null], [33, 14, 'FLAT', null], [34, 14, 'MOUNTAIN', null], [35, 14, 'FLAT', null], [36, 14, 'HILLS', 'RAINFOREST'], [37, 14, 'FLAT', 'MARSH'], [38, 14, 'MOUNTAIN', null], [39, 14, 'FLAT', 'WOODS'], [40, 14, 'FLAT', 'RAINFOREST'], [33, 15, 'FLAT', null], [34, 15, 'FLAT', 'RAINFOREST'], [35, 15, 'FLAT', null], [36, 15, 'HILLS', 'RAINFOREST'], [37, 15, 'FLAT', 'WOODS'], [38, 15, 'FLAT', null], [39, 15, 'FLAT', 'RAINFOREST'], [34, 16, 'FLAT', 'MARSH'], [35, 16, 'HILLS', null], [36, 16, 'FLAT', null], [37, 16, 'FLAT', null], [38, 16, 'MOUNTAIN', null], [39, 16, 'HILLS', null], [34, 17, 'FLAT', null], [35, 17, 'FLAT', null], [36, 17, 'HILLS', null], [37, 17, 'FLAT', null], [38, 17, 'FLAT', null]]);
    const eye = map.tiles[13 * 44 + 36];
    expect(canSee(map, eye, map.tiles[14 * 44 + 34], false)).toBe(false);
    expect(key(map, losDisk(map, eye, 3, false))).toEqual(['34,13', '35,13', '36,11', '36,12', '36,13', '36,14', '36,15', '37,11',
      '37,12', '37,13', '37,14', '37,15', '38,11', '38,14', '38,16'].sort());
  });

  it("runs/h1_duelw1127 t30: China's Settler on Forest (12,7) sees the Grassland (13,10) past the Forest (12,9)", () => {
    const map = recordedPlot([[10, 3, 'HILLS', null], [11, 3, 'FLAT', null], [12, 3, 'FLAT', null], [13, 3, 'FLAT', null], [14, 3, 'FLAT', null], [10, 4, 'FLAT', 'WOODS'], [11, 4, 'FLAT', null], [12, 4, 'FLAT', 'WOODS'], [13, 4, 'FLAT', null], [14, 4, 'FLAT', null], [15, 4, 'FLAT', null], [9, 5, 'FLAT', 'WOODS'], [10, 5, 'FLAT', null], [11, 5, 'FLAT', null], [12, 5, 'HILLS', null], [13, 5, 'HILLS', 'WOODS'], [14, 5, 'FLAT', null], [15, 5, 'FLAT', null], [9, 6, 'FLAT', 'WOODS'], [10, 6, 'FLAT', null], [11, 6, 'FLAT', null], [12, 6, 'FLAT', null], [13, 6, 'MOUNTAIN', null], [14, 6, 'FLAT', 'WOODS'], [15, 6, 'FLAT', null], [16, 6, 'FLAT', null], [8, 7, 'FLAT', null], [9, 7, 'FLAT', null], [10, 7, 'MOUNTAIN', null], [11, 7, 'FLAT', null], [12, 7, 'FLAT', 'WOODS'], [13, 7, 'FLAT', null], [14, 7, 'HILLS', null], [15, 7, 'HILLS', null], [16, 7, 'FLAT', null], [9, 8, 'FLAT', null], [10, 8, 'FLAT', null], [11, 8, 'FLAT', null], [12, 8, 'MOUNTAIN', null], [13, 8, 'FLAT', null], [14, 8, 'MOUNTAIN', null], [15, 8, 'HILLS', 'WOODS'], [16, 8, 'HILLS', null], [9, 9, 'FLAT', null], [10, 9, 'FLAT', null], [11, 9, 'FLAT', null], [12, 9, 'FLAT', 'WOODS'], [13, 9, 'FLAT', null], [14, 9, 'FLAT', 'PANTANAL'], [15, 9, 'FLAT', 'PANTANAL'], [10, 10, 'FLAT', null], [11, 10, 'FLAT', null], [12, 10, 'FLAT', 'WOODS'], [13, 10, 'FLAT', null], [14, 10, 'FLAT', 'PANTANAL'], [15, 10, 'FLAT', 'PANTANAL'], [10, 11, 'FLAT', null], [11, 11, 'FLAT', 'RAINFOREST'], [12, 11, 'HILLS', 'WOODS'], [13, 11, 'HILLS', 'RAINFOREST'], [14, 11, 'FLAT', null]]);
    const eye = map.tiles[7 * 44 + 12];
    expect(canSee(map, eye, map.tiles[10 * 44 + 13], false)).toBe(true);
    expect(key(map, losDisk(map, eye, 3, false))).toEqual(['10,5', '10,6', '10,7', '11,4', '11,5', '11,6', '11,7', '11,8', '12,4', '12,5',
      '12,6', '12,7', '12,8', '12,9', '13,6', '13,7', '13,8', '13,9', '13,10', '14,6', '14,7', '14,8', '14,10'].sort());
  });
});

describe('tribal villages', () => {
  it('map generation sprinkles villages', () => {
    const map = generateMap({ width: 44, height: 26, seed: 42 });
    expect(map.tiles.filter((t) => t.goodyHut).length).toBeGreaterThan(0);
    const bare = generateMap({ width: 44, height: 26, seed: 42, withVillages: false });
    expect(bare.tiles.filter((t) => t.goodyHut).length).toBe(0);
  });

  it('claiming pays a seeded reward and logs it', () => {
    const { state } = foggyState();
    const hut = tileAtCoords(state.map, 10, 9);
    hut.goodyHut = true;
    const unit = spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 9, 9).index, 0)!;
    unit.tileIndex = hut.index;
    // a stream whose village pays a reward the record below reads
    state.rngState = 0x9e3779b9;
    const before = serializeRewards(state);
    claimGoodyHut(state, unit);
    expect(hut.goodyHut).toBe(false);
    expect(state.eventLog.length).toBe(1);
    expect(serializeRewards(state)).not.toBe(before); // something was granted
  });

  it('walking onto a hut claims it automatically', () => {
    const { state } = foggyState();
    const hut = tileAtCoords(state.map, 11, 9);
    hut.goodyHut = true;
    const scout = spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 9, 9).index, 0)!;
    stepThrough(state, scout, [tileAtCoords(state.map, 10, 9).index, hut.index]);
    expect(hut.goodyHut).toBe(false);
    expect(state.eventLog.some((e) => e.startsWith('Tribal village'))).toBe(true);
  });
});

function serializeRewards(state: ReturnType<typeof makeState>): string {
  return JSON.stringify([
    seatOf(state, 0)!.treasury,
    seatOf(state, 0)!.faith,
    seatOf(state, 0)!.scienceTotal,
    seatOf(state, 0)!.research.boosted,
    seatOf(state, 0)!.research.civicProgress,
    seatOf(state, 0)!.cities.map((c) => c.population),
    seatOf(state, 0)!.explored.filter((e) => e === 1).length,
  ]);
}
