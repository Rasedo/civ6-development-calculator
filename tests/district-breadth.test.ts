import { describe, it, expect } from 'vitest';
import { makeState, tileAtCoords } from './helpers';
import { createGame, buildingFaithCost } from '../src/core/game';
import { rivalPhase, rivalCityYields } from '../src/core/rivals';
import { captureRivalCity } from '../src/core/combat';
import { hexDistance, tilesWithin } from '../src/core/hex';
import { WORSHIP_BUILDINGS } from '../src/data/religion';
import { amenityTier } from '../src/data/constants';
import type { GameState, RivalCity, RivalCiv, Tile } from '../src/core/types';

// -- local builders (the rivals.test.ts pattern) ------------------------------
function addRival(state: GameState, col: number, row: number, opts: Partial<RivalCiv> = {}): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    id: state.rivals.length,
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    warWeariness: 0,
    diploFavor: 0,
    diploPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faith: 0,
    tourism: 0,
    cities: [],
    nextCityId: 0,
    atWar: false,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    pantheonClaimed: true,
    religionFounded: true,
    ...opts,
  };
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Roma',
    civId: rival.id + 1,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.rivalId = rival.id;
  tile.rivalCityId = city.id;
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (t.cityId === -1 && (t.csId ?? -1) === -1) {
      t.rivalId = rival.id;
      t.rivalCityId = city.id;
    }
  }
  rival.cities.push(city);
  state.rivals.push(rival);
  return rival;
}

/** A bare non-capital source city holding one regional building on a complete
 * Industrial Zone at `izTile`. */
function makeSourceCity(rival: RivalCiv, centerIndex: number, izTileIndex: number): RivalCity {
  return {
    id: rival.nextCityId++,
    name: 'Ostia',
    civId: rival.id + 1,
    centerIndex,
    population: 1,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: ['FACTORY'],
    districts: [{ type: 'INDUSTRIAL_ZONE', tileIndex: izTileIndex }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
}

function tileAtDist(state: GameState, center: Tile, dist: number, banned: Set<number>): Tile {
  const t = state.map.tiles.find(
    (x) => hexDistance(center.col, center.row, x.col, x.row) === dist && !banned.has(x.index),
  );
  expect(t, `a tile at hex distance ${dist} must exist`).toBeTruthy();
  return t!;
}

// -----------------------------------------------------------------------------
describe('B9-R2 regional channel (rivalRegionalEffects via rivalCityYields)', () => {
  const CONTENT = amenityTier(0); // yieldFactor 1 -> the regional +3 arrives unscaled

  function setup() {
    const state = makeState();
    const rival = addRival(state, 6, 6); // receiver = the capital at (6,6)
    const receiver = rival.cities[0];
    const center = state.map.tiles[receiver.centerIndex];
    return { state, rival, receiver, center };
  }

  it('a Factory reaches a same-civ center at range 6 but not 7 (+3 production)', () => {
    const { state, rival, receiver, center } = setup();
    const banned = new Set<number>([center.index]);
    const t6 = tileAtDist(state, center, 6, banned);
    const t7 = tileAtDist(state, center, 7, banned);
    const src = makeSourceCity(rival, tileAtDist(state, center, 3, banned).index, t6.index);
    rival.cities.push(src);

    t6.districtComplete = true;
    const prodIn = rivalCityYields(state, rival, receiver, CONTENT).production;
    // move the source IZ out to range 7 -> the receiver loses the delivery
    src.districts[0].tileIndex = t7.index;
    t7.districtComplete = true;
    const prodOut = rivalCityYields(state, rival, receiver, CONTENT).production;
    expect(prodIn - prodOut).toBe(3);
  });

  it('two Factories in range still deliver +3 once (dedup by building id)', () => {
    const { state, rival, receiver, center } = setup();
    const banned = new Set<number>([center.index]);
    const t6a = tileAtDist(state, center, 6, banned);
    banned.add(t6a.index);
    const t6b = tileAtDist(state, center, 5, banned);
    const t7 = tileAtDist(state, center, 7, banned);
    const s1 = makeSourceCity(rival, tileAtDist(state, center, 3, banned).index, t6a.index);
    const s2 = makeSourceCity(rival, tileAtDist(state, center, 2, banned).index, t6b.index);
    rival.cities.push(s1, s2);
    t6a.districtComplete = true;
    t6b.districtComplete = true;
    const prodDedup = rivalCityYields(state, rival, receiver, CONTENT).production;

    // baseline with both sources pushed out of range
    s1.districts[0].tileIndex = t7.index;
    s2.districts[0].tileIndex = t7.index;
    t7.districtComplete = true;
    const prodOut = rivalCityYields(state, rival, receiver, CONTENT).production;
    expect(prodDedup - prodOut).toBe(3); // NOT +6
  });

  it('a pillaged source district is dark', () => {
    const { state, rival, receiver, center } = setup();
    const banned = new Set<number>([center.index]);
    const t6 = tileAtDist(state, center, 6, banned);
    const t7 = tileAtDist(state, center, 7, banned);
    const src = makeSourceCity(rival, tileAtDist(state, center, 3, banned).index, t6.index);
    rival.cities.push(src);
    t6.districtComplete = true;

    src.districts[0].tileIndex = t7.index;
    t7.districtComplete = true;
    const prodOut = rivalCityYields(state, rival, receiver, CONTENT).production;

    // in range but pillaged -> no delivery, equal to the out-of-range baseline
    src.districts[0].tileIndex = t6.index;
    t6.districtPillaged = true;
    const prodPillaged = rivalCityYields(state, rival, receiver, CONTENT).production;
    expect(prodPillaged).toBe(prodOut);
  });
});

describe('B9-R3 rival WORSHIP faith-buy (rivalPhase)', () => {
  // rival index 0 -> WORSHIP_BUILDINGS[(0+1)%5]
  const wid = WORSHIP_BUILDINGS[1];
  const cost = buildingFaithCost(wid);

  /** A fresh founder with a Temple + a COMPLETE Holy Site in its capital and a
   * big faith bank; treasury 0 so no gold building-buy perturbs the run. */
  function buildFounder(): { state: GameState; rival: RivalCiv } {
    const state = makeState();
    const rival = addRival(state, 6, 6, { religionFounded: true, pantheonClaimed: true, faith: 1000, treasury: 0 });
    const cap = rival.cities[0];
    cap.buildings = ['TEMPLE'];
    const hs = tileAtCoords(state.map, 6, 7);
    hs.districtComplete = true;
    hs.districtPillaged = false;
    cap.districts.push({ type: 'HOLY_SITE', tileIndex: hs.index });
    return { state, rival };
  }

  it('appends WORSHIP_BUILDINGS[(r+1)%5] and deducts exactly the faith cost', () => {
    // BUY run: the city has no worship building -> it buys.
    const buy = buildFounder();
    rivalPhase(buy.state);
    const faithBuy = buy.rival.faith ?? 0;
    expect(buy.rival.cities[0].buildings).toContain(wid);

    // OWN control: identical state but the worship building is already owned ->
    // no purchase, same income. faithOwn - faithBuy isolates the flat debit.
    const own = buildFounder();
    own.rival.cities[0].buildings.push(wid);
    rivalPhase(own.state);
    const faithOwn = own.rival.faith ?? 0;
    expect(faithOwn - faithBuy).toBeCloseTo(cost, 6);
  });

  it('a founder WITHOUT the Temple does not buy', () => {
    const { state, rival } = buildFounder();
    rival.cities[0].buildings = []; // strip the Temple
    rivalPhase(state);
    expect(rival.cities[0].buildings).not.toContain(wid);
  });
});

describe('B9-R3 rival PALACE grant (foundRivalCity / captureRivalCity)', () => {
  it("a rival's FIRST city carries the PALACE", () => {
    const game = createGame({ width: 44, height: 26, seed: 3, withResources: true, withWonders: true, rivals: true });
    expect(game.rivals.length).toBeGreaterThanOrEqual(1);
    for (const r of game.rivals) {
      const capital = r.cities[0];
      expect(capital.isCapital).toBe(true);
      expect(capital.buildings).toContain('PALACE');
    }
  });

  it('a SECOND city founded by a settler does not', () => {
    const state = makeState();
    const rival = addRival(state, 6, 6);
    rival.cities[0].queue.push({ kind: 'settler', progress: 500, cost: 90 });
    state.turn = 9; // border/settle tick for city id 0
    rivalPhase(state);
    expect(rival.cities.length).toBe(2);
    const second = rival.cities[1];
    expect(second.isCapital).toBe(false);
    expect(second.buildings).not.toContain('PALACE');
  });

  it('capture strips the PALACE but keeps other buildings (B-30)', () => {
    const state = makeState();
    const rival = addRival(state, 6, 6);
    rival.cities[0].buildings = ['PALACE', 'TEMPLE'];
    captureRivalCity(state, rival, rival.cities[0]);
    expect(state.cities.length).toBe(1);
    const captured = state.cities[state.cities.length - 1];
    expect(captured.buildings).not.toContain('PALACE');
    expect(captured.buildings).toContain('TEMPLE');
  });
});
