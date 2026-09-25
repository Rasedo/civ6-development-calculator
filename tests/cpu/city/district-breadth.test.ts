import { seatOf, unitsOf } from '../../../cpu/core/seats';
import { computeCityStats } from '../../../cpu/core/city';
import { describe, it, expect } from 'vitest';
import { tileSeat, isCityStateSeat, setTileOwner, cityStateOfSeat, emptySeat } from '../../../cpu/core/seats';
import { makeState, seededGame, tileAtCoords } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { seatPhase, transferCity } from '../../../cpu/core/phase';
import { encampOuterPool, fitEncampOuter, outerPool, wallsMax } from '../../../cpu/core/rules';
import { CITY_MAX_HP } from '../../../cpu/data/units';
import { hexDistance, tilesWithin } from '../../../world/hex';
import type { GameState, City, Seat, Tile } from '../../../cpu/core/types';

// -- local builders (the the other civs.test.ts pattern) ------------------------------
function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
    ww: {}, wwTurn: {},
    diplomaticFavor: 0,
    diplomaticPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    treasury: 0,
    scienceTotal: 0,
    cultureTotal: 0,
    faith: 0,
    tourism: 0,
    government: { chosen: null, policies: [], held: 0, civicTurn: 0 },
    cities: [],
    nextCityId: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    projectsDone: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
    ...opts,
  };
  const city: City = {
    id: civ.nextCityId++,
    name: 'Roma',
    seat: civ.seat,
    centerIndex: tile.index,
    population: 3,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    focus: 'balanced',
    queue: [],
    isCapital: true,
    // the PALACE every real capital carries — its two Amenities (the
    // install's Buildings.Entertainment) make a size-3 city HAPPY, so the
    // TOTAL carries a contentment multiplier and yield deltas are read off
    // the breakdown buckets instead
    buildings: ['PALACE'],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civ.seat, city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  state.seats.push(civ);
  return civ;
}

/** A bare non-capital source city holding one regional building on a complete
 * Industrial Zone at `izTileIndex`. */
function makeSourceCity(civ: Seat, centerIndex: number, izTileIndex: number): City {
  return {
    id: civ.nextCityId++,
    name: 'Ostia',
    seat: civ.seat,
    centerIndex,
    population: 1,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: ['FACTORY'],
    districts: [{ type: 'INDUSTRIAL_ZONE', tileIndex: izTileIndex }],
    wonders: [],
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
describe('regional yield channel, via seatCityYields', () => {

  function setup() {
    const state = makeState();
    const civ = addCiv(state, 6, 6); // receiver = the capital at (6,6)
    const receiver = civ.cities[0];
    const center = state.map.tiles[receiver.centerIndex];
    return { state, civ, receiver, center };
  }

  it('a Factory reaches a same-civ center at range 6 but not 7 (+3 production)', () => {
    const { state, civ, receiver, center } = setup();
    const banned = new Set<number>([center.index]);
    const t6 = tileAtDist(state, center, 6, banned);
    const t7 = tileAtDist(state, center, 7, banned);
    const src = makeSourceCity(civ, tileAtDist(state, center, 3, banned).index, t6.index);
    civ.cities.push(src);

    t6.districtComplete = true;
    // the BUILDINGS bucket is the delivery; the TOTAL also carries the city's
    // contentment multiplier, which scales it with everything else
    const prodIn = computeCityStats(state, receiver).breakdown.buildings.production;
    // move the source IZ out to range 7 -> the receiver loses the delivery
    src.districts[0].tileIndex = t7.index;
    t7.districtComplete = true;
    const prodOut = computeCityStats(state, receiver).breakdown.buildings.production;
    expect(prodIn - prodOut).toBe(3);
  });

  it('two Factories in range still deliver +3 once (dedup by building id)', () => {
    const { state, civ, receiver, center } = setup();
    const banned = new Set<number>([center.index]);
    const t6a = tileAtDist(state, center, 6, banned);
    banned.add(t6a.index);
    const t6b = tileAtDist(state, center, 5, banned);
    const t7 = tileAtDist(state, center, 7, banned);
    const s1 = makeSourceCity(civ, tileAtDist(state, center, 3, banned).index, t6a.index);
    const s2 = makeSourceCity(civ, tileAtDist(state, center, 2, banned).index, t6b.index);
    civ.cities.push(s1, s2);
    t6a.districtComplete = true;
    t6b.districtComplete = true;
    const prodDedup = computeCityStats(state, receiver).breakdown.buildings.production;

    // baseline with both sources pushed out of range
    s1.districts[0].tileIndex = t7.index;
    s2.districts[0].tileIndex = t7.index;
    t7.districtComplete = true;
    const prodOut = computeCityStats(state, receiver).breakdown.buildings.production;
    expect(prodDedup - prodOut).toBe(3); // NOT +6
  });

  it('a pillaged source district is dark', () => {
    const { state, civ, receiver, center } = setup();
    const banned = new Set<number>([center.index]);
    const t6 = tileAtDist(state, center, 6, banned);
    const t7 = tileAtDist(state, center, 7, banned);
    const src = makeSourceCity(civ, tileAtDist(state, center, 3, banned).index, t6.index);
    civ.cities.push(src);
    t6.districtComplete = true;

    src.districts[0].tileIndex = t7.index;
    t7.districtComplete = true;
    const prodOut = computeCityStats(state, receiver).total.production;

    // in range but pillaged -> no delivery, equal to the out-of-range baseline
    src.districts[0].tileIndex = t6.index;
    t6.districtPillaged = true;
    const prodPillaged = computeCityStats(state, receiver).total.production;
    expect(prodPillaged).toBe(prodOut);
  });
});
describe('PALACE grant on founding and on capture', () => {
  it("a civ's FIRST city carries the PALACE", () => {
    const game = seededGame(3, 3);
    for (const r of game.seats) {
      const capital = r.cities[0];
      expect(capital.isCapital).toBe(true);
      expect(capital.buildings).toContain('PALACE');
    }
  });

  it('a SECOND city founded by a settler does not', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 6, 6);
    civ.cities[0].queue.push({ kind: 'settler', progress: 500, cost: 90 });
    seatPhase(state); // completes the settler: a UNIT spawns, founding is an order
    const settler = unitsOf(state, civ.seat).find((u) => u.type === 'SETTLER')!;
    expect(settler).toBeDefined();
    settler.tileIndex = tileAtCoords(state.map, 12, 6).index; // legal ground, ≥4 from the capital
    expect(foundCity(state, settler.tileIndex, civ.seat).ok).toBe(true);
    expect(civ.cities.length).toBe(2);
    const second = civ.cities[1];
    expect(second.isCapital).toBe(false);
    expect(second.buildings).not.toContain('PALACE');
  });

  it('capture strips the PALACE but keeps other buildings', () => {
    const state = makeState();
    const civ = addCiv(state, 6, 6);
    civ.cities[0].buildings = ['PALACE', 'TEMPLE'];
    transferCity(state, civ.seat, seatOf(state, 0)!, civ.cities[0], 'conquered');
    expect(seatOf(state, 0)!.cities.length).toBe(1);
    const captured = seatOf(state, 0)!.cities[seatOf(state, 0)!.cities.length - 1];
    expect(captured.buildings).not.toContain('PALACE');
    expect(captured.buildings).toContain('TEMPLE');
  });
});

/** The four pools a captured city carries, with every one of them PRE-SET to a
 *  known value before the capture so the ride-through can be told from a heal:
 *  the Encampment's own GARRISON, the Encampment's OUTER pool, the centre's
 *  GARRISON and the centre's OUTER pool. */
function walledCityWithEncampment(state: GameState, col: number, row: number) {
  const civ = addCiv(state, col, row);
  const city = civ.cities[0];
  city.buildings = ['PALACE', 'ANCIENT_WALLS'];
  city.population = 4;
  city.hp = 120;              // the centre's garrison, wounded but standing
  city.outerHp = 60;          // ...behind a part-breached perimeter
  const enc = tilesWithin(state.map, col, row, 1).find((t) => t.index !== city.centerIndex)!;
  setTileOwner(enc, civ.seat, city.id);
  enc.district = 'ENCAMPMENT';
  enc.districtComplete = true;
  enc.encampHp = 40;          // CIV6: the district's own 100-point garrison
  enc.encampOuterHp = 70;     // ...and its own share of the walls' perimeter
  city.districts.push({ type: 'ENCAMPMENT', tileIndex: enc.index });
  return { civ, city, enc };
}

describe("a captured city's four pools", () => {
  it('CIV6 (CaptureRemovesCityDefenses): the conquest destroys the Walls, so BOTH outer pools read 0/0', () => {
    const state = makeState();
    const { civ, city, enc } = walledCityWithEncampment(state, 6, 6);
    // before: a real perimeter, sized by the walls every defending district shares
    const maxBefore = wallsMax(state, city);
    expect(maxBefore).toBeGreaterThan(0);
    expect(outerPool(state, city)).toBe(60);
    expect(encampOuterPool(state, city, enc)).toBe(70);

    transferCity(state, civ.seat, seatOf(state, 0)!, city, 'conquered');
    const taken = seatOf(state, 0)!.cities[seatOf(state, 0)!.cities.length - 1];

    // the WALLS are gone — the building, not just the pool behind it
    expect(taken.buildings).not.toContain('ANCIENT_WALLS');
    expect(wallsMax(state, taken)).toBe(0);
    // ...so the centre's outer pool and the Encampment's own both read 0/0
    expect(taken.outerHp).toBe(0);
    expect(outerPool(state, taken)).toBe(0);
    expect(encampOuterPool(state, taken, enc)).toBe(0);
    // the Encampment's GARRISON rides through byte for byte — neither zeroed
    // nor healed (measured 40/100 before, 40/100 after)
    expect(enc.encampHp).toBe(40);
    // the CENTRE's garrison is reset to exactly half its maximum
    expect(taken.hp).toBe(Math.round(CITY_MAX_HP / 2));
    // and the district itself rides, complete, into the new owner's registry
    expect(taken.districts.some((d) => d.type === 'ENCAMPMENT' && d.tileIndex === enc.index)).toBe(true);
    expect(taken.population).toBe(3); // -25%, floored
  });

  it('a REBUILT set of walls brings both pools back full', () => {
    const state = makeState();
    const { civ, city, enc } = walledCityWithEncampment(state, 6, 6);
    transferCity(state, civ.seat, seatOf(state, 0)!, city, 'conquered');
    const taken = seatOf(state, 0)!.cities[seatOf(state, 0)!.cities.length - 1];
    taken.buildings.push('ANCIENT_WALLS');
    taken.outerHp = wallsMax(state, taken);
    fitEncampOuter(state, taken);
    expect(outerPool(state, taken)).toBe(wallsMax(state, taken));
    expect(encampOuterPool(state, taken, enc)).toBe(wallsMax(state, taken));
  });

  it('a LOYALTY flip breaches nothing: the walls, the perimeter and the centre all ride', () => {
    const state = makeState();
    const { civ, city, enc } = walledCityWithEncampment(state, 6, 6);
    transferCity(state, civ.seat, seatOf(state, 0)!, city, 'revolted');
    const moved = seatOf(state, 0)!.cities[seatOf(state, 0)!.cities.length - 1];
    expect(moved.buildings).toContain('ANCIENT_WALLS');
    expect(moved.outerHp).toBe(60);
    expect(outerPool(state, moved)).toBe(60);
    expect(encampOuterPool(state, moved, enc)).toBe(70);
    expect(enc.encampHp).toBe(40);
    expect(moved.hp).toBe(120);
    expect(moved.population).toBe(4);
  });
});
