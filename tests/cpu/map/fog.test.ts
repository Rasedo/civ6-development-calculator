import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { canFoundCity } from '../../../cpu/core/rules';
import { spawnUnit, orderMove, setExploreMission } from '../../../cpu/core/units';
import { fogActive, isExplored, initFog, canSee, hexLineBetween, sightThrough, revealAround } from '../../../cpu/core/fog';
import { hexDistance, neighbors } from '../../../world/hex';
import { claimGoodyHut } from '../../../cpu/core/units';
import { generateMap } from '../../../world/mapgen';

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
    orderMove(state, scout.id, tileAtCoords(state.map, 14, 9).index);
    for (let i = 0; i < 6; i++) endTurn(state);
    expect(isExplored(state, 0, tileAtCoords(state.map, 14, 9).index)).toBe(true);
    // dark tile is now within the scout's revealed trail or still dark:
    if (isExplored(state, 0, dark.index)) {
      expect(canFoundCity(state, dark.index, 0).ok).toBe(true);
    }
  });

  it('auto-explore keeps revealing until the map runs out', () => {
    const { state } = foggyState();
    const scout = spawnUnit(state, 'SCOUT', tileAtCoords(state.map, 9, 9).index, 0)!;
    setExploreMission(state, scout.id, true);
    const before = seatOf(state, 0)!.explored.filter((e) => e === 1).length;
    for (let i = 0; i < 30; i++) endTurn(state);
    const after = seatOf(state, 0)!.explored.filter((e) => e === 1).length;
    expect(after).toBeGreaterThan(before);
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

  it('the hex line between two tiles is a chain of neighbours, the straight row exact', () => {
    const { state, o, e1, e2, e3 } = flatRow();
    expect(hexLineBetween(state.map, o, e3).map((t) => t.index)).toEqual([e1.index, e2.index]);
    expect(hexLineBetween(state.map, o, e1)).toEqual([]);
    for (const b of state.map.tiles) {
      const d = hexDistance(o.col, o.row, b.col, b.row);
      if (d < 2 || d > 5) continue;
      const mids = hexLineBetween(state.map, o, b);
      expect(mids).toHaveLength(d - 1);
      let prev = o;
      for (const m of mids) {
        expect(neighbors(state.map, prev).some((n) => n.index === m.index)).toBe(true);
        prev = m;
      }
      expect(neighbors(state.map, prev).some((n) => n.index === b.index)).toBe(true);
    }
  });

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
    e1.elevation = 'MOUNTAIN';
    e1.feature = null;
    o.elevation = 'HILLS';
    expect(canSee(state.map, o, e2, false)).toBe(false); // a mountain (2) tops a hill eye (1)
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
    orderMove(state, scout.id, hut.index);
    for (let i = 0; i < 4 && hut.goodyHut; i++) endTurn(state);
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
