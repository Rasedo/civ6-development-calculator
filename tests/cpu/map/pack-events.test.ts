import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs } from '../helpers';
import { setTileOwner } from '../../../cpu/core/seats';
import { disasterPhase, eventRows, erupt, eruptionRing, meteorCandidate } from '../../../cpu/core/disasters';
import {
  ERUPTION_ROWS, ERUPTION_WEIGHT, ERUPTION_WONDER, RANDOM_EVENT_START_TURN, METEOR_WEIGHT, FIRE_WEIGHT,
  FIRE_BURNT_TURN, FIRE_REGROW_TURN,
} from '../../../cpu/data/disasters';
import { canFoundCity, canPlaceDistrictIn } from '../../../cpu/core/rules';
import { chargeUnitUpkeep, fuelShortCS } from '../../../cpu/core/stockpile';
import { claimMeteorSite, classLine, meteorGrantUnit, spawnUnit, terrainMp } from '../../../cpu/core/units';
import { featureDefense } from '../../../cpu/core/combat';
import { tileAppeal } from '../../../cpu/core/appeal';
import { tileYields } from '../../../cpu/core/yields';
import { neighbors } from '../../../world/hex';
import { FEATURES } from '../../../world/features';
import { WONDERS } from '../../../world/wonders';
import { generateMap } from '../../../world/mapgen';
import { isImpassable } from '../../../world/query';
import { FEATURE_SIGHT_THROUGH } from '../../../cpu/data/sight';
import { WORLD_PRESETS } from '../../../seeder/presets';
import { loadWorld } from '../../../cpu/world/load';
import { readFileSync } from 'node:fs';
import type { WorldFile } from '../../../world/file';
import { bareCtx } from '../helpers';
import type { GameState, Tile } from '../../../cpu/core/types';

/** the family of every row of the turn's draw, in draw order */
const drawOrder = () => eventRows(0).map((r) => (r.family === 'eruption' ? ERUPTION_ROWS[r.sev] : `${r.family}${r.sev}`));

describe('the draw carries the Gathering Storm pack rows', () => {
  it('in the live table\'s order: Eyjafjallajokull first, the pack\'s three last', () => {
    const order = drawOrder();
    expect(order.slice(0, 5)).toEqual([
      'EYJAFJALLAJOKULL_CATASTROPHIC', 'EYJAFJALLAJOKULL_MEGACOLOSSAL', 'flood0', 'flood1', 'flood2']);
    expect(order.slice(5, 11)).toEqual(['KILIMANJARO_GENTLE', 'KILIMANJARO_CATASTROPHIC', 'VESUVIUS_MEGACOLOSSAL',
      'VOLCANO_GENTLE', 'VOLCANO_CATASTROPHIC', 'VOLCANO_MEGACOLOSSAL']);
    expect(order.slice(-3)).toEqual(['meteor0', 'fire0', 'fire1']);
    expect(order.length).toBe(2 + 3 + 6 + 8 + 3 + 2 + 3);
  });

  it('weighs the rows at their MODERATE OccurrencesPerGame', () => {
    expect([...ERUPTION_WEIGHT]).toEqual([4, 2.5, 4, 2.5, 7, 4, 2.5, 1.5]);
    expect(METEOR_WEIGHT).toBe(6);
    expect([...FIRE_WEIGHT]).toEqual([6, 6]);
    expect([...ERUPTION_WONDER]).toEqual(['EYJAFJALLAJOKULL', 'EYJAFJALLAJOKULL', 'MOUNT_KILIMANJARO',
      'MOUNT_KILIMANJARO', 'VESUVIUS', '', '', '']);
  });
});

describe('the Meteor Shower', () => {
  /** a sea holding one Grassland island of seven plots */
  const island = () => {
    const state = makeState(makeMap(14, 14, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const c = tileAtCoords(state.map, 7, 7);
    const plots = [c, ...neighbors(state.map, c)];
    for (const t of plots) t.terrain = 'GRASSLAND';
    return { state, c, plots };
  };

  it('strikes nobody\'s bare or wooded Plains, Grassland, Snow or Desert, and nothing else', () => {
    const { state, c } = island();
    const none = new Set<number>();
    expect(meteorCandidate(c, none)).toBe(true);
    c.feature = 'WOODS';
    expect(meteorCandidate(c, none)).toBe(true);
    c.feature = 'FLOODPLAINS';
    expect(meteorCandidate(c, none)).toBe(false);
    c.feature = 'BURNT_WOODS';
    expect(meteorCandidate(c, none)).toBe(false);
    c.feature = null;
    c.terrain = 'TUNDRA';
    expect(meteorCandidate(c, none)).toBe(false);
    c.terrain = 'SNOW';
    expect(meteorCandidate(c, none)).toBe(true);
    c.elevation = 'MOUNTAIN';
    expect(meteorCandidate(c, none)).toBe(false);
    c.elevation = 'HILLS';
    expect(meteorCandidate(c, none)).toBe(true);
    setTileOwner(c, 0);
    expect(meteorCandidate(c, none)).toBe(false);
    setTileOwner(c, -1);
    c.goodyHut = true;
    expect(meteorCandidate(c, none)).toBe(false);
    c.goodyHut = false;
    expect(meteorCandidate(c, new Set([c.index]))).toBe(false);
    c.meteor = true;
    expect(meteorCandidate(c, none)).toBe(false);
    expect(meteorCandidate(state.map.tiles[0], none)).toBe(false);
  });

  it('is ONE site at weight 6 however many plots it may strike, and leaves one Meteor Site', () => {
    // the island's seven plots are its only sites; a tornado and a drought
    // pair start there too: 6 against 6 + 18 + 28 = 52
    const { state, plots } = island();
    const N = 4000;
    let meteors = 0;
    for (let i = 0; i < N; i++) {
      for (const t of plots) t.meteor = false;
      for (const t of state.map.tiles) t.droughtTurns = 0;
      state.eventLog = [];
      disasterPhase(state);
      if (!state.eventLog.some((e) => e.startsWith('Meteor'))) continue;
      meteors++;
      expect(plots.filter((t) => t.meteor).length).toBe(1);
    }
    expect(Math.abs(meteors / N - 6 / 52)).toBeLessThan(0.015);
  });

  it('grants the Heavy Cavalry one past the seat\'s research in its nearest city, burning no fuel', () => {
    const state = makeState(makeMap(16, 16));
    state.unitsMode = true;
    const far = settleAt(state, tileAtCoords(state.map, 2, 2).index);
    const near = settleAt(state, tileAtCoords(state.map, 12, 12).index);
    expect(classLine('HEAVY_CAV')).toEqual(['HEAVY_CHARIOT', 'KNIGHT', 'CUIRASSIER', 'TANK', 'MODERN_ARMOR']);
    expect(meteorGrantUnit(state, 0)).toBe('HEAVY_CHARIOT');
    grantTechs(state, 'WHEEL', 'STIRRUPS');
    expect(meteorGrantUnit(state, 0)).toBe('CUIRASSIER');
    grantTechs(state, 'BALLISTICS');
    expect(meteorGrantUnit(state, 0)).toBe('TANK');
    const site = tileAtCoords(state.map, 9, 9);
    site.meteor = true;
    const scout = spawnUnit(state, 'SCOUT', site.index, 0)!;
    claimMeteorSite(state, scout);
    expect(site.meteor).toBe(false);
    const tank = state.units.find((u) => u.type === 'TANK')!;
    expect(tank).toBeDefined();
    expect(tank.noResourceUpkeep).toBe(true);
    const ctr = state.map.tiles[near.centerIndex];
    const at = state.map.tiles[tank.tileIndex];
    expect(Math.max(Math.abs(at.col - ctr.col), Math.abs(at.row - ctr.row))).toBeLessThanOrEqual(1);
    expect(far.centerIndex).not.toBe(near.centerIndex);
    // the tank burns no Oil and is never short of it
    const s = state.seats[0];
    chargeUnitUpkeep(state, 0);
    expect(s.fuelShort ?? 0).toBe(0);
    expect(fuelShortCS(state, tank)).toBe(0);
    // a second unit in finds nothing
    claimMeteorSite(state, scout);
    expect(state.units.filter((u) => u.type === 'TANK').length).toBe(1);
  });
});

describe('the fires', () => {
  /** a Grassland board: a Woods stand of seven plots around (8, 8), the rest bare */
  const woodsBoard = () => {
    const state = makeState(makeMap(16, 16));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const c = tileAtCoords(state.map, 8, 8);
    const stand = [c, ...neighbors(state.map, c)];
    for (const t of stand) t.feature = 'WOODS';
    return { state, c, stand };
  };
  /** a fire lit by hand on turn `start`; the scenes below run turns before
   *  `RANDOM_EVENT_START_TURN`, so the phase spends no draw and the fires'
   *  own turn is all that runs */
  const light = (t: Tile, start: number) => {
    t.feature = 'BURNING_WOODS';
    t.fireStart = start;
  };
  const phaseAt = (state: GameState, turn: number) => {
    expect(turn).toBeLessThan(RANDOM_EVENT_START_TURN);
    state.turn = turn;
    disasterPhase(state);
  };
  const T0 = -50;

  it('burns, is burnt at Turn 2 with +1 Food, regrows at Turn 6 with +1 Production', () => {
    const { state, c, stand } = woodsBoard();
    // an isolated plot: no neighbour to catch
    for (const t of stand.slice(1)) t.feature = null;
    const ctx = bareCtx(state.map);
    const woodsProd = tileYields(ctx, c).production;
    light(c, T0);
    phaseAt(state, T0);
    expect(c.feature).toBe('BURNING_WOODS');
    expect(tileYields(ctx, c).production).toBe(woodsProd - 1);
    phaseAt(state, T0 + 1);
    expect(c.feature).toBe('BURNING_WOODS');
    phaseAt(state, T0 + FIRE_BURNT_TURN);
    expect(c.feature).toBe('BURNT_WOODS');
    expect(c.fertility).toBe(1);
    for (let turn = T0 + FIRE_BURNT_TURN + 1; turn < T0 + FIRE_REGROW_TURN; turn++) {
      phaseAt(state, turn);
      expect(c.feature).toBe('BURNT_WOODS');
    }
    phaseAt(state, T0 + FIRE_REGROW_TURN);
    expect(c.feature).toBe('WOODS');
    expect(c.fireStart).toBeUndefined();
    expect(c.fertilityProd).toBe(1);
    // the regrown Woods pays its Production again, and the silt on top
    expect(tileYields(ctx, c).production).toBe(woodsProd + 1);
  });

  it('spreads to each adjacent Woods at 50% on the fire\'s turns 1 and 2, on the fire\'s clock', () => {
    const N = 400;
    let caught = 0;
    let ring = 0;
    for (let i = 0; i < N; i++) {
      const { state, c, stand } = woodsBoard();
      state.rngState = 1000 + i;
      light(c, T0);
      phaseAt(state, T0);
      // turn 0: nothing spreads
      expect(stand.slice(1).every((t) => t.feature === 'WOODS')).toBe(true);
      phaseAt(state, T0 + 1);
      phaseAt(state, T0 + 2);
      for (const t of stand.slice(1)) {
        ring++;
        if (t.feature === 'WOODS') continue;
        caught++;
        // caught on turn 1 or 2, it is burnt with the rest at the fire's Turn 2
        expect(t.feature).toBe('BURNT_WOODS');
        expect(t.fireStart).toBe(T0);
      }
      // and it regrows with the rest
      for (let turn = T0 + 3; turn <= T0 + FIRE_REGROW_TURN; turn++) phaseAt(state, turn);
      expect(stand.every((t) => t.feature === 'WOODS' || t.feature === null)).toBe(true);
    }
    // a ring plot misses both turns' draws from the centre at 1/4 before the
    // other ring plots' own spreads — at least 3/4 catch
    expect(caught / ring).toBeGreaterThan(0.72);
  });

  it('pillages, kills civilians and burns land units 50-101 on turns 0-2, and costs one citizen on turn 0', () => {
    const { state, c, stand } = woodsBoard();
    state.unitsMode = true;
    for (const t of stand.slice(1)) t.feature = null;
    const city = settleAt(state, tileAtCoords(state.map, 5, 8).index);
    city.population = 5;
    c.improvement = 'LUMBER_MILL';
    setTileOwner(c, 0);
    c.ownerCity = city.id;
    const w = spawnUnit(state, 'WARRIOR', c.index, 0)!;
    w.hp = 1000;
    const b = spawnUnit(state, 'BUILDER', c.index, 0)!;
    light(c, T0);
    phaseAt(state, T0);
    expect(c.pillaged).toBe(true);
    expect(c.improvement).toBe('LUMBER_MILL');
    expect(state.units.some((u) => u.id === b.id)).toBe(false);
    const hit0 = 1000 - w.hp;
    expect(hit0 >= 50 && hit0 <= 101).toBe(true);
    expect(city.population).toBe(4);
    phaseAt(state, T0 + 1);
    const hit1 = 1000 - hit0 - w.hp;
    expect(hit1 >= 50 && hit1 <= 101).toBe(true);
    expect(city.population).toBe(4);
    phaseAt(state, T0 + 2);
    phaseAt(state, T0 + 3);
    const before = w.hp;
    phaseAt(state, T0 + 4);
    expect(w.hp).toBe(before);
  });

  it('a fire\'s plot takes no city and no district, moves and shelters like Woods, and lowers its neighbours\' appeal', () => {
    const { state, c, stand } = woodsBoard();
    for (const t of stand.slice(1)) t.feature = null;
    const n = stand[1];
    const woodsAppeal = tileAppeal(state.map, n);
    c.feature = 'BURNT_WOODS';
    expect(tileAppeal(state.map, n)).toBe(woodsAppeal - 2);
    expect(featureDefense('BURNING_WOODS')).toBe(3);
    expect(featureDefense('BURNT_RAINFOREST')).toBe(3);
    expect(terrainMp(c)).toBe(terrainMp({ ...c, feature: 'WOODS' }));
    // a woods waiver (the Ngao Mbeba's chassis) does not reach it
    expect(terrainMp(c, { type: 'NGAO_MBEBA' })).toBeGreaterThan(terrainMp({ ...c, feature: 'WOODS' }, { type: 'NGAO_MBEBA' }));
    state.seats[0].research.techs.push('POTTERY');
    expect(canFoundCity(state, c.index, 0).ok).toBe(false);
    c.feature = 'WOODS';
    state.fogOfWar = false;
    expect(canFoundCity(state, c.index, 0).ok).toBe(true);
    const city = settleAt(state, tileAtCoords(state.map, 6, 8).index);
    const plot = neighbors(state.map, state.map.tiles[city.centerIndex]).find((t) => t.index !== c.index)!;
    plot.feature = 'BURNING_WOODS';
    expect(canPlaceDistrictIn(state, city, 'CAMPUS', plot.index, { unlocks: null, ownsTile: () => true }).ok).toBe(false);
    plot.feature = null;
    expect(canPlaceDistrictIn(state, city, 'CAMPUS', plot.index, { unlocks: null, ownsTile: () => true }).ok).toBe(true);
  });

  it('starts on a live Woods or Rainforest plot, each row ONE site at 6', () => {
    // one Woods plot and one Rainforest plot on a sea: 6 + 6 against the
    // tornadoes 18, the droughts 28 (the bare island) and the meteor 6
    const state = makeState(makeMap(14, 14, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const island = [tileAtCoords(state.map, 7, 7), ...neighbors(state.map, tileAtCoords(state.map, 7, 7))];
    for (const t of island) t.terrain = 'PLAINS';
    const N = 4000;
    let jungle = 0;
    let forest = 0;
    for (let i = 0; i < N; i++) {
      for (const t of island) { t.feature = null; t.fireStart = undefined; t.meteor = false; t.droughtTurns = 0; }
      island[1].feature = 'WOODS';
      island[2].feature = 'RAINFOREST';
      state.eventLog = [];
      disasterPhase(state);
      if (!state.eventLog.some((e) => e.startsWith('Fire'))) continue;
      const burning = (t: Tile) => t.feature;
      if (burning(island[1]) === 'BURNING_WOODS') forest++;
      if (burning(island[2]) === 'BURNING_RAINFOREST') jungle++;
    }
    const total = 6 + 6 + 18 + 28 + 6;
    expect(Math.abs(forest / N - 6 / total)).toBeLessThan(0.015);
    expect(Math.abs(jungle / N - 6 / total)).toBeLessThan(0.015);
  });
});

describe('the natural wonders\' eruptions', () => {
  it('a two-plot wonder\'s ring is every plot touching either, each once', () => {
    const state = makeState(makeMap(12, 12));
    const a = tileAtCoords(state.map, 5, 5);
    const b = neighbors(state.map, a)[0];
    const ring = eruptionRing(state.map, [a, b]);
    expect(ring.length).toBe(8);
    expect(new Set(ring.map((t) => t.index)).size).toBe(8);
    expect(ring.some((t) => t === a || t === b)).toBe(false);
  });

  it('Eyjafjallajokull and Vesuvius erupt on their own rows while the wonder stands, one site each', () => {
    const state = makeState(makeMap(18, 18, 'COAST'));
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    const e1 = tileAtCoords(state.map, 5, 5);
    const e2 = neighbors(state.map, e1)[0];
    const v = tileAtCoords(state.map, 12, 12);
    // Mountain plots start no blizzard, so the draw names only the wonders
    for (const t of [e1, e2]) {
      t.terrain = 'TUNDRA';
      t.elevation = 'MOUNTAIN';
      t.feature = 'EYJAFJALLAJOKULL';
    }
    v.terrain = 'GRASSLAND';
    v.elevation = 'MOUNTAIN';
    v.feature = 'VESUVIUS';
    // the draw names only them: 6.5 + 7
    const N = 3000;
    let eyj = 0;
    let ves = 0;
    for (let i = 0; i < N; i++) {
      state.eventLog = [];
      disasterPhase(state);
      if (state.eventLog.some((e) => e.includes(`(${e1.col}, ${e1.row})`))) eyj++;
      if (state.eventLog.some((e) => e.includes(`(${v.col}, ${v.row})`))) ves++;
    }
    expect(eyj + ves).toBe(N);
    expect(Math.abs(eyj / N - 6.5 / 13.5)).toBeLessThan(0.03);
  });

  it('Vesuvius\'s MEGACOLOSSAL costs every ring city a citizen and bands its land units 70-90', () => {
    const state = makeState(makeMap(18, 18));
    state.unitsMode = true;
    const v = tileAtCoords(state.map, 8, 8);
    v.elevation = 'MOUNTAIN';
    v.feature = 'VESUVIUS';
    const ring = neighbors(state.map, v);
    const city = settleAt(state, ring[0].index);
    const row = ERUPTION_ROWS.indexOf('VESUVIUS_MEGACOLOSSAL');
    for (let i = 0; i < 50; i++) {
      for (const t of ring.slice(1)) {
        t.feature = null;
        setTileOwner(t, 0);
        t.ownerCity = city.id;
      }
      city.population = 20;
      const w = spawnUnit(state, 'WARRIOR', ring[1].index, 0)!;
      w.hp = 1000;
      erupt(state, [v], row);
      expect(city.population).toBe(20 - ring.length);
      expect(1000 - w.hp >= 70 && 1000 - w.hp <= 90).toBe(true);
      state.units = state.units.filter((x) => x.id !== w.id);
    }
  });
});

describe('Eyjafjallajokull and Vesuvius on the map', () => {
  it('the roster carries both as the install writes them', () => {
    const e = FEATURES.EYJAFJALLAJOKULL;
    const v = FEATURES.VESUVIUS;
    expect([e.naturalWonder, e.impassable, v.naturalWonder, v.impassable]).toEqual([true, true, true, true]);
    // Feature_AdjacentYields: Food 1 (the Expansion2 update) and Culture 1; Production 1
    expect(e.adjacentYields).toEqual({ food: 1, culture: 1 });
    expect(v.adjacentYields).toEqual({ production: 1 });
    expect([FEATURE_SIGHT_THROUGH.EYJAFJALLAJOKULL, FEATURE_SIGHT_THROUGH.VESUVIUS]).toEqual([2, 2]);
    expect([WONDERS.EYJAFJALLAJOKULL.size, WONDERS.VESUVIUS.size]).toEqual([2, 1]);
    // a neighbour takes the adjacent yields and the wonder's Appeal 2, a plot on it is out of reach
    const map = makeMap();
    const w = tileAtCoords(map, 5, 5);
    Object.assign(w, { elevation: 'MOUNTAIN', feature: 'VESUVIUS' });
    const next = tileAtCoords(map, 6, 5);
    const bare = tileYields(bareCtx(map), next);
    w.feature = 'EYJAFJALLAJOKULL';
    w.elevation = 'FLAT';
    const eyj = tileYields(bareCtx(map), next);
    expect(eyj.food).toBe(bare.food + 1);
    expect(eyj.culture).toBe(bare.culture + 1);
    expect(eyj.production).toBe(bare.production - 1);
    expect(tileAppeal(map, w)).toBe(5);
    expect(isImpassable(w)).toBe(true);
  });

  it('every generated placement keeps its plots\' rules (Feature_ValidTerrains, NoCoast, NoRiver)', () => {
    const P = WORLD_PRESETS.baseline;
    const seen = { EYJAFJALLAJOKULL: 0, VESUVIUS: 0 };
    for (let s = 0; s < 240; s++) {
      const map = generateMap({
        width: P.width, height: P.height, seed: 20000 + s, withResources: true, withWonders: true,
        withVillages: true, layout: P.layout, landFraction: P.landFraction, resourceMult: P.resourceMult,
      });
      for (const id of ['EYJAFJALLAJOKULL', 'VESUVIUS'] as const) {
        const plots = map.tiles.filter((t) => t.feature === id);
        if (plots.length === 0) continue;
        seen[id] += 1;
        expect(plots.length).toBe(WONDERS[id].size);
        for (const t of plots) {
          expect(t.riverMask).toBe(0);
          if (id === 'VESUVIUS') {
            expect(['GRASSLAND', 'PLAINS']).toContain(t.terrain);
            expect(t.elevation).toBe('MOUNTAIN');
            expect(t.volcano).toBe(false);
          } else {
            expect(['SNOW', 'TUNDRA']).toContain(t.terrain);
            expect(t.elevation).not.toBe('MOUNTAIN');
            expect(neighbors(map, t).some((n) => n.terrain === 'COAST' || n.terrain === 'OCEAN')).toBe(false);
          }
        }
      }
    }
    expect(seen.EYJAFJALLAJOKULL).toBeGreaterThan(0);
    expect(seen.VESUVIUS).toBeGreaterThan(0);
  });

  it('a locked world holding Vesuvius offers its row a real site', () => {
    const state = loadWorld(JSON.parse(readFileSync('seeder/worlds/seed9027.world.json', 'utf-8')) as WorldFile);
    const v = state.map.tiles.find((t) => t.feature === 'VESUVIUS')!;
    expect(v).toBeDefined();
    state.disasters = true;
    state.turn = RANDOM_EVENT_START_TURN;
    let hit = false;
    for (let i = 0; i < 600 && !hit; i++) {
      state.eventLog = [];
      disasterPhase(state);
      hit = state.eventLog.some((e) => e.startsWith(`Volcanic eruption at (${v.col}, ${v.row})`));
    }
    expect(hit).toBe(true);
  });
});
