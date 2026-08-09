import { describe, it, expect } from 'vitest';
import { computeCityStats } from '../../../cpu/core/city';
import { BARB_SEAT, cityStateOfSeat, emptySeat, isCityStateSeat, isCiv, seatOf, seatOfCityState, seatOfIndex, setTileOwner, tileCity, tileSeat } from '../../../cpu/core/seats';
import { makeState, makeMap, tileAtCoords } from '../helpers';
import { foundCity, endTurn } from '../../../cpu/core/game';
import { tilesWithin } from '../../../world/hex';
import { seatPhase, levyUnits, loyaltyDelta, applyLoyalty, flipCity } from '../../../cpu/core/phase';
import { barbarianPhase, meleeAttack, attackTargets } from '../../../cpu/core/combat';
import { spawnUnit } from '../../../cpu/core/units';
import { CITY_STATE_MAX_HP, LEVY_UNITS, LEVY_GOLD_COST } from '../../../cpu/data/cityStates';
import { declareWarOnCityState } from '../../../cpu/core/cityStates';
import type { CityState, CityStateType, GameState, City, Seat } from '../../../cpu/core/types';

function addCiv(state: GameState, col: number, row: number, opts: Partial<Seat> = {}): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(seatOfIndex(state.seats.length - 1)), // #51/S6.12
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
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
    government: { current: null, policies: [] },
    cities: [],
    nextCityId: 0,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
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
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    specialists: {},
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civ.seat, city.id); // A-17: per-city registry
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  state.seats.push(civ);
  return civ;
}

function addCs(state: GameState, col: number, row: number, type: CityStateType, envoys = 0): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)), // #51/S6.12
    id: state.cityStates.length,
    name: 'Valletta',
    type,
    centerIndex: center.index,
    population: 3,
    envoys: { [0]: envoys },
    met: [0],
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

describe('civ tile economies', () => {
  it('good land grows the other civs faster than tundra', () => {
    const rich = makeState(makeMap(14, 14, 'GRASSLAND'));
    const poor = makeState(makeMap(14, 14, 'TUNDRA'));
    // Give the rich site some hills so production differs too.
    for (const t of tilesWithin(rich.map, 6, 6, 1)) {
      if (t.index !== tileAtCoords(rich.map, 6, 6).index) t.elevation = 'HILLS';
    }
    const a = addCiv(rich, 6, 6);
    const b = addCiv(poor, 6, 6);
    const ya = computeCityStats(rich, a.cities[0]).total;
    const yb = computeCityStats(poor, b.cities[0]).total;
    expect(ya.food).toBeGreaterThan(yb.food);
    expect(ya.production).toBeGreaterThan(yb.production);
    for (let i = 0; i < 30; i++) {
      rich.turn = poor.turn = i + 1;
      seatPhase(rich, 0);
      seatPhase(poor, 0);
    }
    // A productive civ converts POPULATION into CITIES, and each settler costs
    // its city a pop — so one city's count is NOT a growth proxy. Sum the
    // empire, which is what "grows faster" means.
    const totalPop = (r: Seat) => r.cities.reduce((n, civCity) => n + civCity.population, 0);
    expect(a.cities.length).toBeGreaterThan(b.cities.length);
    expect(totalPop(a)).toBeGreaterThan(totalPop(b));
    // Production output is queue COMPLETIONS — richer land fields
    // more (units + cities + in-flight progress), not a bigger stock.
    // Districts/buildings are completions too (rough catalog costs).
    const output = (st: GameState, r: Seat) =>
      st.units.filter((u) => isCiv(u.seat) && u.seat === r.seat).length * 40 +
      (r.cities.length - 1) * 90 +
      r.cities.reduce(
        (n, civCity) =>
          n +
          (civCity.queue[0]?.progress ?? 0) +
          civCity.districts.filter((d) => d.type !== 'CITY_CENTER').length * 54 +
          civCity.buildings.length * 60,
        0,
      );
    expect(output(rich, a)).toBeGreaterThan(output(poor, b));
  });
});

describe('barbarians vs the other civs', () => {
  it('barbarians attack civ units and sack civ cities', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 8, 8);
    const civCity = civ.cities[0];
    civCity.hp = 5;
    const defender = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index, civ.seat)!;
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 4).index, BARB_SEAT);
    const sieger = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 8).index, BARB_SEAT)!;
    const adj = tilesWithin(state.map, 8, 8, 1).find((t) => t.index !== civCity.centerIndex)!;
    sieger.tileIndex = adj.index;

    const popBefore = civCity.population;
    barbarianPhase(state, 0);
    // Civ city sacked, not captured — it still belongs to Rome.
    expect(civ.cities.length).toBe(1);
    expect(civCity.population).toBeLessThanOrEqual(popBefore);
    expect(civCity.hp).toBeGreaterThan(5); // reset after the sack
    // And the lone civ defender took a hit from its barbarian neighbor.
    expect(defender.hp < 100 || !state.units.includes(defender)).toBe(true);
  });

  it('civ units strike back at adjacent barbarians in peacetime', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 8, 8);
    const guard = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 4).index, civ.seat)!;
    const barb = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 5).index, BARB_SEAT)!;
    expect(attackTargets(state, guard)).toContain(barb.tileIndex);
    seatPhase(state, 0);
    expect(barb.hp < 100 || !state.units.includes(barb)).toBe(true);
  });
});

describe('city-state conquest and levies', () => {
  it('a besieged city-state falls and joins the empire', () => {
    const state = makeState();
    state.unitsMode = true;
    const cityState = addCs(state, 8, 8, 'scientific', 3);
    cityState.hp = 5;
    const attacker = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 8).index, 0)!;
    const adj = tilesWithin(state.map, 8, 8, 1).find((t) => t.index !== cityState.centerIndex)!;
    attacker.tileIndex = adj.index;
    attacker.movesLeft = 2;

    // A city-state is a separate seat — you must DECLARE first.
    // Peace is the default, and the resolver now refuses a peaceful target.
    expect(meleeAttack(state, attacker.id, cityState.centerIndex, 0).ok).toBe(false);
    expect(declareWarOnCityState(state, cityState.id, 0).ok).toBe(true);

    const r = meleeAttack(state, attacker.id, cityState.centerIndex, 0);
    expect(r.ok).toBe(true);
    expect(state.cityStates.length).toBe(0);
    const city = seatOf(state, 0)!.cities.find((c) => c.name === 'Valletta');
    expect(city).toBeDefined();
    expect(tileCity(state.map.tiles[cityState.centerIndex])).toBe(city!.id);
    expect((isCityStateSeat(tileSeat(state.map.tiles[cityState.centerIndex])) ? cityStateOfSeat(tileSeat(state.map.tiles[cityState.centerIndex])) : -1)).toBe(-1);
  });

  it('autopilot target lists never include peaceful city-states', () => {
    const state = makeState();
    state.unitsMode = true;
    const cityState = addCs(state, 8, 8, 'trade', 0);
    const unit = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 8).index, 0)!;
    const adj = tilesWithin(state.map, 8, 8, 1).find((t) => t.index !== cityState.centerIndex)!;
    unit.tileIndex = adj.index;
    unit.movesLeft = 2;
    expect(attackTargets(state, unit)).not.toContain(cityState.centerIndex);
    // ... And DOES once war is declared — the mask column the
    // residual was blocked on. The peaceful case above is the invariant
    // that made a war state necessary rather than an unconditional arm.
    expect(declareWarOnCityState(state, cityState.id, 0).ok).toBe(true);
    expect(attackTargets(state, unit)).toContain(cityState.centerIndex);
  });

  it('suzerains levy militaristic troops for gold, on a cooldown', () => {
    const state = makeState();
    state.unitsMode = true;
    const cityState = addCs(state, 8, 8, 'militaristic', 3);
    seatOf(state, 0)!.treasury = LEVY_GOLD_COST;
    expect(levyUnits(state, cityState.id, 0).ok).toBe(true);
    expect(state.units.filter((u) => (u.seat) === 0).length).toBe(LEVY_UNITS);
    expect(seatOf(state, 0)!.treasury).toBe(0);
    seatOf(state, 0)!.treasury = LEVY_GOLD_COST;
    expect(levyUnits(state, cityState.id, 0).ok).toBe(false); // cooldown

    const nonMil = addCs(state, 2, 2, 'scientific', 3);
    expect(levyUnits(state, nonMil.id, 0).ok).toBe(false);
    const noSuz = addCs(state, 10, 10, 'militaristic', 1);
    expect(levyUnits(state, noSuz.id, 0).ok).toBe(false);
  });

  it('battered city-states recover over time', () => {
    const state = makeState();
    const cityState = addCs(state, 8, 8, 'trade', 0);
    cityState.hp = 50;
    endTurn(state, 0);
    expect(cityState.hp).toBeGreaterThan(50);
    expect(cityState.hp).toBeLessThanOrEqual(CITY_STATE_MAX_HP);
  });
});

describe('loyalty', () => {
  it('civ pressure drains border cities; distance and capitals protect', () => {
    const state = makeState(makeMap(20, 14));
    const capital = foundCity(state, tileAtCoords(state.map, 2, 7).index, 0).city!;
    const border = foundCity(state, tileAtCoords(state.map, 12, 7).index, 0).city!;
    const civ = addCiv(state, 16, 7);
    civ.cities[0].population = 10;

    expect(loyaltyDelta(state, border, 'Content')).toBeLessThan(0);
    expect(loyaltyDelta(state, capital, 'Content')).toBeGreaterThanOrEqual(
      loyaltyDelta(state, border, 'Content'),
    );

    endTurn(state, 0);
    expect(border.loyalty ?? 100).toBeLessThan(100);
    expect(capital.loyalty ?? 100).toBe(100); // capitals are immune

    // Amenities push back.
    expect(loyaltyDelta(state, border, 'Ecstatic')).toBeGreaterThan(
      loyaltyDelta(state, border, 'Unhappy'),
    );
  });

  it('a city at zero loyalty defects to the pressuring civ', () => {
    const state = makeState(makeMap(20, 14));
    foundCity(state, tileAtCoords(state.map, 2, 7).index, 0);
    const border = foundCity(state, tileAtCoords(state.map, 12, 7).index, 0).city!;
    const civ = addCiv(state, 16, 7);
    civ.cities[0].population = 10;
    border.loyalty = 0;

    flipCity(state, border);
    expect(seatOf(state, 0)!.cities.some((c) => c.id === border.id)).toBe(false);
    expect(civ.cities.some((c) => c.name === border.name)).toBe(true);
    const center = state.map.tiles[border.centerIndex];
    // The tile now belongs to the OTHER civ, which the one seat field says
    // directly.
    expect(tileSeat(center)).toBe(civ.seat);
    expect(state.eventLog.some((e) => e.includes('defected'))).toBe(true);
  });

  it('loyalty never moves in civ-free games', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index, 0).city!;
    expect(applyLoyalty(state, city, 'Unhappy')).toBe(false);
    expect(city.loyalty).toBeUndefined();
  });
});
