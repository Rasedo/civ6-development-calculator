import { describe, it, expect } from 'vitest';
import { seatOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { canFoundCity } from '../../../cpu/core/rules';
import { spawnUnit, orderMove, setExploreMission } from '../../../cpu/core/units';
import { fogActive, isExplored, initFog } from '../../../cpu/core/fog';
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
