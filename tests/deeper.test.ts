import { describe, it, expect } from 'vitest';
import { makeState, makeMap, tileAtCoords } from './helpers';
import { foundCity, endTurn } from '../src/core/game';
import { tilesWithin } from '../src/core/hex';
import {
  rivalPhase,
  rivalCityYields,
  levyUnits,
  loyaltyDelta,
  applyLoyalty,
  flipCityToRival,
} from '../src/core/rivals';
import { barbarianPhase, meleeAttack, attackTargets } from '../src/core/combat';
import { spawnUnit } from '../src/core/units';
import { CS_MAX_HP, LEVY_UNITS, LEVY_GOLD_COST } from '../src/data/cityStates';
import { declareWarOnCityState } from '../src/core/cityStates';
import type { CityState, CityStateType, GameState, RivalCity, RivalCiv } from '../src/core/types';

function addRival(state: GameState, col: number, row: number, opts: Partial<RivalCiv> = {}): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    id: state.rivals.length,
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
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
  tile.rivalId = rival.id;
  tile.rivalCityId = city.id; // A-17: per-city registry
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

function addCs(state: GameState, col: number, row: number, type: CityStateType, envoys = 0): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cs: CityState = {
    id: state.cityStates.length,
    name: 'Valletta',
    type,
    centerIndex: center.index,
    population: 3,
    envoys,
    met: true,
    quest: null,
    questIssuedTurn: 0,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) t.csId = cs.id;
  state.cityStates.push(cs);
  return cs;
}

describe('rival tile economies', () => {
  it('good land grows rivals faster than tundra', () => {
    const rich = makeState(makeMap(14, 14, 'GRASSLAND'));
    const poor = makeState(makeMap(14, 14, 'TUNDRA'));
    // Give the rich site some hills so production differs too.
    for (const t of tilesWithin(rich.map, 6, 6, 1)) {
      if (t.index !== tileAtCoords(rich.map, 6, 6).index) t.elevation = 'HILLS';
    }
    const a = addRival(rich, 6, 6);
    const b = addRival(poor, 6, 6);
    const ya = rivalCityYields(rich, a, a.cities[0]);
    const yb = rivalCityYields(poor, b, b.cities[0]);
    expect(ya.food).toBeGreaterThan(yb.food);
    expect(ya.production).toBeGreaterThan(yb.production);
    for (let i = 0; i < 30; i++) {
      rich.turn = poor.turn = i + 1;
      rivalPhase(rich);
      rivalPhase(poor);
    }
    expect(a.cities[0].population).toBeGreaterThan(b.cities[0].population);
    // C1-B2: production output is queue COMPLETIONS — richer land fields
    // more (units + cities + in-flight progress), not a bigger stock.
    // C1-B4: districts/buildings are completions too (rough catalog costs).
    const output = (st: GameState, r: RivalCiv) =>
      st.units.filter((u) => u.owner === 'rival' && u.civId === r.id).length * 40 +
      (r.cities.length - 1) * 90 +
      r.cities.reduce(
        (n, rc) =>
          n +
          (rc.queue[0]?.progress ?? 0) +
          rc.districts.filter((d) => d.type !== 'CITY_CENTER').length * 54 +
          rc.buildings.length * 60,
        0,
      );
    expect(output(rich, a)).toBeGreaterThan(output(poor, b));
  });
});

describe('barbarians vs rivals', () => {
  it('barbarians attack rival units and sack rival cities', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 8, 8);
    const rc = rival.cities[0];
    rc.hp = 5;
    const defender = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index, 'rival', rival.id)!;
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 4).index, 'barbarian');
    const sieger = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 8).index, 'barbarian')!;
    const adj = tilesWithin(state.map, 8, 8, 1).find((t) => t.index !== rc.centerIndex)!;
    sieger.tileIndex = adj.index;

    const popBefore = rc.population;
    barbarianPhase(state);
    // Rival city sacked, not captured — it still belongs to Rome.
    expect(rival.cities.length).toBe(1);
    expect(rc.population).toBeLessThanOrEqual(popBefore);
    expect(rc.hp).toBeGreaterThan(5); // reset after the sack
    // And the lone rival defender took a hit from its barbarian neighbor.
    expect(defender.hp < 100 || !state.units.includes(defender)).toBe(true);
  });

  it('rival units strike back at adjacent barbarians in peacetime', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 8, 8);
    const guard = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 4).index, 'rival', rival.id)!;
    const barb = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 5).index, 'barbarian')!;
    expect(attackTargets(state, guard)).toContain(barb.tileIndex);
    rivalPhase(state);
    expect(barb.hp < 100 || !state.units.includes(barb)).toBe(true);
  });
});

describe('city-state conquest and levies', () => {
  it('a besieged city-state falls and joins the empire', () => {
    const state = makeState();
    state.unitsMode = true;
    const cs = addCs(state, 8, 8, 'scientific', 3);
    cs.hp = 5;
    const attacker = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 8).index)!;
    const adj = tilesWithin(state.map, 8, 8, 1).find((t) => t.index !== cs.centerIndex)!;
    attacker.tileIndex = adj.index;
    attacker.movesLeft = 2;

    // A-18 (#79): a city-state is a separate player — you must DECLARE first.
    // Peace is the default, and the resolver now refuses a peaceful target.
    expect(meleeAttack(state, attacker.id, cs.centerIndex).ok).toBe(false);
    expect(declareWarOnCityState(state, cs.id).ok).toBe(true);

    const r = meleeAttack(state, attacker.id, cs.centerIndex);
    expect(r.ok).toBe(true);
    expect(state.cityStates.length).toBe(0);
    const city = state.cities.find((c) => c.name === 'Valletta');
    expect(city).toBeDefined();
    expect(state.map.tiles[cs.centerIndex].cityId).toBe(city!.id);
    expect(state.map.tiles[cs.centerIndex].csId ?? -1).toBe(-1);
  });

  it('autopilot target lists never include peaceful city-states', () => {
    const state = makeState();
    state.unitsMode = true;
    const cs = addCs(state, 8, 8, 'trade');
    const unit = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 6, 8).index)!;
    const adj = tilesWithin(state.map, 8, 8, 1).find((t) => t.index !== cs.centerIndex)!;
    unit.tileIndex = adj.index;
    unit.movesLeft = 2;
    expect(attackTargets(state, unit)).not.toContain(cs.centerIndex);
    // A-18 (#79): ... and DOES once war is declared — the mask column the
    // A-18 residual was blocked on. The peaceful case above is the invariant
    // that made a war state necessary rather than an unconditional arm.
    expect(declareWarOnCityState(state, cs.id).ok).toBe(true);
    expect(attackTargets(state, unit)).toContain(cs.centerIndex);
  });

  it('suzerains levy militaristic troops for gold, on a cooldown', () => {
    const state = makeState();
    state.unitsMode = true;
    const cs = addCs(state, 8, 8, 'militaristic', 3);
    state.treasury = LEVY_GOLD_COST;
    expect(levyUnits(state, cs.id).ok).toBe(true);
    expect(state.units.filter((u) => u.owner === 'player').length).toBe(LEVY_UNITS);
    expect(state.treasury).toBe(0);
    state.treasury = LEVY_GOLD_COST;
    expect(levyUnits(state, cs.id).ok).toBe(false); // cooldown

    const nonMil = addCs(state, 2, 2, 'scientific', 3);
    expect(levyUnits(state, nonMil.id).ok).toBe(false);
    const noSuz = addCs(state, 10, 10, 'militaristic', 1);
    expect(levyUnits(state, noSuz.id).ok).toBe(false);
  });

  it('battered city-states recover over time', () => {
    const state = makeState();
    const cs = addCs(state, 8, 8, 'trade');
    cs.hp = 50;
    endTurn(state);
    expect(cs.hp).toBeGreaterThan(50);
    expect(cs.hp).toBeLessThanOrEqual(CS_MAX_HP);
  });
});

describe('loyalty', () => {
  it('rival pressure drains border cities; distance and capitals protect', () => {
    const state = makeState(makeMap(20, 14));
    const capital = foundCity(state, tileAtCoords(state.map, 2, 7).index).city!;
    state.settlers = 1;
    const border = foundCity(state, tileAtCoords(state.map, 12, 7).index).city!;
    const rival = addRival(state, 16, 7);
    rival.cities[0].population = 10;

    expect(loyaltyDelta(state, border, 'Content')).toBeLessThan(0);
    expect(loyaltyDelta(state, capital, 'Content')).toBeGreaterThanOrEqual(
      loyaltyDelta(state, border, 'Content'),
    );

    endTurn(state);
    expect(border.loyalty ?? 100).toBeLessThan(100);
    expect(capital.loyalty ?? 100).toBe(100); // capitals are immune

    // Amenities push back.
    expect(loyaltyDelta(state, border, 'Ecstatic')).toBeGreaterThan(
      loyaltyDelta(state, border, 'Unhappy'),
    );
  });

  it('a city at zero loyalty defects to the pressuring rival', () => {
    const state = makeState(makeMap(20, 14));
    foundCity(state, tileAtCoords(state.map, 2, 7).index);
    state.settlers = 1;
    const border = foundCity(state, tileAtCoords(state.map, 12, 7).index).city!;
    const rival = addRival(state, 16, 7);
    rival.cities[0].population = 10;
    border.loyalty = 0;

    flipCityToRival(state, border);
    expect(state.cities.some((c) => c.id === border.id)).toBe(false);
    expect(rival.cities.some((c) => c.name === border.name)).toBe(true);
    const center = state.map.tiles[border.centerIndex];
    expect(center.cityId).toBe(-1);
    expect(center.rivalId).toBe(rival.id);
    expect(state.eventLog.some((e) => e.includes('defected'))).toBe(true);
  });

  it('loyalty never moves in rival-free games', () => {
    const state = makeState();
    const city = foundCity(state, tileAtCoords(state.map, 5, 5).index).city!;
    expect(applyLoyalty(state, city, 'Unhappy')).toBe(false);
    expect(city.loyalty).toBeUndefined();
  });
});
