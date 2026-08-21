import { describe, it, expect } from 'vitest';
import { setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, bareCtx } from '../helpers';
import { foundCity, endTurn, serialize, deserialize } from '../../../cpu/core/game';
import { disasterPhase, riverReach, FERTILITY_CAP } from '../../../cpu/core/disasters';
import { neighborTile } from '../../../world/hex';
import type { Tile } from '../../../cpu/core/types';
import { disbandUnit, spawnUnit } from '../../../cpu/core/units';
import { tileYields } from '../../../cpu/core/yields';
import { generateMap } from '../../../world/mapgen';

describe('disasters', () => {
  it('volcanoes exist on generated maps', () => {
    const map = generateMap({ width: 44, height: 26, seed: 42 });
    const volcanoes = map.tiles.filter((t) => t.volcano);
    expect(volcanoes.length).toBeGreaterThan(0);
    for (const v of volcanoes) expect(v.elevation).toBe('MOUNTAIN');
  });

  it('eruptions scorch and fertilize the slopes', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const volcano = tileAtCoords(state.map, 8, 8);
    volcano.elevation = 'MOUNTAIN';
    volcano.volcano = true;
    const slope = tileAtCoords(state.map, 9, 8);
    slope.improvement = 'FARM';
    setTileOwner(slope, 0);

    let guard = 0;
    while (!slope.pillaged && guard++ < 600) disasterPhase(state);
    expect(slope.pillaged).toBe(true);
    expect(slope.fertility).toBeGreaterThanOrEqual(1);
    expect(state.eventLog.some((e) => e.includes('eruption'))).toBe(true);

    // fertility is capped
    slope.fertility = FERTILITY_CAP;
    const before = slope.fertility;
    for (let i = 0; i < 200; i++) disasterPhase(state);
    expect(slope.fertility).toBe(before);
  });

  it('a flood pillages the district on the floodplain, not just the improvement', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const plain = tileAtCoords(state.map, 4, 4);
    plain.feature = 'FLOODPLAINS';
    plain.district = 'CAMPUS';
    plain.districtComplete = true;
    setTileOwner(plain, 0);

    let guard = 0;
    while (!plain.districtPillaged && guard++ < 600) disasterPhase(state);
    expect(plain.districtPillaged).toBe(true);
    expect(state.eventLog.some((e) => e.includes('Flood'))).toBe(true);
  });

  it('a flood leaves an UNFINISHED district and a city centre alone', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const site = tileAtCoords(state.map, 4, 4);
    site.feature = 'FLOODPLAINS';
    site.district = 'CAMPUS'; // queued, not complete
    const centre = tileAtCoords(state.map, 6, 6);
    centre.feature = 'FLOODPLAINS';
    centre.district = 'CITY_CENTER';
    centre.districtComplete = true;

    for (let i = 0; i < 600; i++) disasterPhase(state);
    // both tiles were flooded many times over (the silt proves it landed)
    expect(site.fertility).toBeGreaterThan(0);
    expect(centre.fertility).toBeGreaterThan(0);
    expect(site.districtPillaged).toBeFalsy();
    expect(centre.districtPillaged).toBeFalsy();
  });

  it('fertility adds food; drought subtracts and expires', () => {
    const map = makeMap();
    const t = tileAtCoords(map, 5, 5);
    expect(tileYields(bareCtx(map), t).food).toBe(2);
    t.fertility = 2;
    expect(tileYields(bareCtx(map), t).food).toBe(4);
    t.droughtTurns = 3;
    expect(tileYields(bareCtx(map), t).food).toBe(3);

    const state = makeState(map);
    state.disasters = true;
    disasterPhase(state);
    expect(t.droughtTurns).toBe(2);
  });

  it('is reproducible and inert when toggled off', () => {
    const mk = () => {
      const state = makeState(makeMap(18, 18));
      state.disasters = true;
      tileAtCoords(state.map, 4, 4).feature = 'FLOODPLAINS';
      tileAtCoords(state.map, 4, 4).terrain = 'DESERT';
      foundCity(state, tileAtCoords(state.map, 9, 9).index, 0);
      return state;
    };
    const a = mk();
    const b = deserialize(serialize(mk()));
    for (let i = 0; i < 30; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));

    const calm = makeState(makeMap(18, 18));
    foundCity(calm, tileAtCoords(calm.map, 9, 9).index, 0);
    for (let i = 0; i < 30; i++) endTurn(calm);
    expect(calm.eventLog.length).toBe(0);
    expect(calm.map.tiles.every((t) => t.fertility === 0 && t.droughtTurns === 0)).toBe(true);
  });

  // The Flood page's two tables, poked one severity at a time. `disasterPhase`
  // rolls the severity itself, so the assertions are about the BAND every
  // outcome must sit in, driven until each one has been seen.
  const floodBoard = () => {
    const state = makeState(makeMap(18, 18));
    state.disasters = true;
    state.unitsMode = true;
    const plain = tileAtCoords(state.map, 4, 4);
    plain.feature = 'FLOODPLAINS';
    plain.terrain = 'DESERT';
    setTileOwner(plain, 0);
    return { state, plain };
  };

  it('a flood pillages the improvement every time and sometimes takes it away', () => {
    const { state, plain } = floodBoard();
    plain.improvement = 'FARM';
    let pillaged = 0;
    let destroyed = 0;
    for (let i = 0; i < 900; i++) {
      const had = plain.improvement !== null;
      disasterPhase(state);
      if (had && plain.improvement === null) destroyed++;
      if (plain.pillaged) pillaged++;
      plain.improvement = 'FARM';
      plain.pillaged = false;
    }
    expect(pillaged).toBeGreaterThan(0);
    expect(destroyed).toBeGreaterThan(0);
    // destruction is the rarer half of the pillage column
    expect(destroyed).toBeLessThan(pillaged);
  });

  it('a flood damages a unit and a city centre, and can cost a citizen', () => {
    const { state, plain } = floodBoard();
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    setTileOwner(plain, 0);
    plain.ownerCity = city.id;
    city.population = 6;
    const seen = new Set<number>();
    let popLost = 0;
    let centreHit = 0;
    for (let i = 0; i < 900; i++) {
      const u = spawnUnit(state, 'WARRIOR', plain.index, 0)!;
      const pop = city.population;
      const centre = state.map.tiles[city.centerIndex];
      centre.feature = 'FLOODPLAINS';
      disasterPhase(state);
      if (city.population < pop) popLost++;
      if (city.hp < 200) { centreHit++; city.hp = 200; }
      const alive = state.units.find((x) => x.id === u.id);
      if (alive) {
        if (alive.hp < 100) seen.add(100 - alive.hp);
        disbandUnit(state, u.id);
      } else {
        seen.add(100);
      }
      city.population = 6;
    }
    // every damage seen sits inside the two sourced bands (30-50, 50-70)
    expect(seen.size).toBeGreaterThan(0);
    for (const d of seen) {
      expect(d === 100 || (d >= 30 && d <= 50) || (d >= 50 && d <= 70)).toBe(true);
    }
    expect(popLost).toBeGreaterThan(0);
    expect(centreHit).toBeGreaterThan(0);
  });

  it('a flood silts FOOD and PRODUCTION on their own rolls', () => {
    const { state, plain } = floodBoard();
    for (let i = 0; i < 900 && (plain.fertility === 0 || plain.fertilityProd === 0); i++) {
      disasterPhase(state);
    }
    expect(plain.fertility).toBeGreaterThan(0);
    expect(plain.fertilityProd).toBeGreaterThan(0);
    expect(tileYields(bareCtx(state.map), plain).production).toBeGreaterThanOrEqual(plain.fertilityProd);
  });

  it('the Great Bath spares the damage and halves the silt', () => {
    const { state, plain } = floodBoard();
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    plain.improvement = 'FARM';
    plain.district = 'CAMPUS';
    plain.districtComplete = true;
    state.map.tiles[city.centerIndex].builtWonder = 'GREAT_BATH';
    state.map.tiles[city.centerIndex].builtWonderComplete = true;
    city.wonders.push({ id: 'GREAT_BATH', tileIndex: city.centerIndex });
    setTileOwner(state.map.tiles[city.centerIndex], 0);
    for (let i = 0; i < 900; i++) disasterPhase(state);
    expect(plain.improvement).toBe('FARM');
    expect(plain.pillaged).toBeFalsy();
    expect(plain.districtPillaged).toBeFalsy();
    expect(plain.fertility).toBeGreaterThan(0); // the river still silts
  });
});

describe('the flood reaches the whole river', () => {
  /** Two tiles carry a river EDGE between them when both masks hold that bit —
   *  the mapgen writes both flanks, so a river tile chain is symmetric. */
  function link(map: ReturnType<typeof makeMap>, a: Tile, dir: number): Tile {
    const b = neighborTile(map, a, dir)!;
    a.riverMask |= 1 << dir;
    b.riverMask |= 1 << ((dir + 3) % 6);
    return b;
  }

  it('walks the river and stops where the river does', () => {
    const state = makeState(makeMap(16, 16));
    const a = tileAtCoords(state.map, 4, 4);
    const b = link(state.map, a, 0);
    const c = link(state.map, b, 0);
    for (const t of [a, b, c]) t.feature = 'FLOODPLAINS';
    // a floodplain OFF the river, and a river tile that is not floodplain
    const off = tileAtCoords(state.map, 10, 10);
    off.feature = 'FLOODPLAINS';
    const dry = link(state.map, c, 1);

    const reach = riverReach(state.map, a).map((t) => t.index);
    expect(reach).toEqual([a, b, c].map((t) => t.index).sort((x, y) => x - y));
    expect(reach).not.toContain(off.index);
    expect(reach).not.toContain(dry.index);

    // ...and from the far end it is the same river
    expect(riverReach(state.map, c).map((t) => t.index)).toEqual(reach);
    // a floodplain with no river at all floods alone
    expect(riverReach(state.map, off).map((t) => t.index)).toEqual([off.index]);
  });

  it('one flood takes every floodplain along its river together', () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    const a = tileAtCoords(state.map, 4, 4);
    const b = link(state.map, a, 0);
    const c = link(state.map, b, 0);
    const off = tileAtCoords(state.map, 10, 10);
    for (const t of [a, b, c, off]) {
      t.feature = 'FLOODPLAINS';
      t.terrain = 'DESERT';
      setTileOwner(t, 0);
    }
    const struck = (t: Tile) => t.pillaged || t.improvement === null;
    let rivers = 0;
    let alone = 0;
    for (let i = 0; i < 900 && (rivers < 3 || alone < 1); i++) {
      for (const t of [a, b, c, off]) { t.improvement = 'FARM'; t.pillaged = false; }
      disasterPhase(state);
      if (struck(a) || struck(b) || struck(c)) {
        // one river, one flood: no tile of it is spared
        expect([struck(a), struck(b), struck(c)]).toEqual([true, true, true]);
        rivers += 1;
      } else if (struck(off)) {
        alone += 1; // the riverless floodplain floods by itself
      }
    }
    expect(rivers).toBeGreaterThanOrEqual(3);
    expect(alone).toBeGreaterThanOrEqual(1);
  });
});
