import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity, endTurn, serialize, deserialize } from '../src/core/game';
import { spawnUnit, builderRepair } from '../src/core/units';
import {
  meleeAttack,
  rangedAttack,
  attackTargets,
  terrainDefense,
  barbarianPhase,
  getCityHp,
} from '../src/core/combat';
import { routeRaided } from '../src/core/trade';
import { CITY_MAX_HP } from '../src/data/units';

function battlefield() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  const city = foundCity(state, tileAtCoords(state.map, 9, 9).index).city!;
  return { state, city };
}

describe('combat', () => {
  it('terrain grants defense; melee deals mutual damage', () => {
    const { state } = battlefield();
    const hill = tileAtCoords(state.map, 12, 9);
    hill.elevation = 'HILLS';
    expect(terrainDefense(hill)).toBe(3);

    const atk = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 9).index)!;
    atk.tileIndex = tileAtCoords(state.map, 11, 9).index;
    const def = spawnUnit(state, 'WARRIOR', hill.index, 'barbarian')!;
    def.tileIndex = hill.index;

    expect(meleeAttack(state, atk.id, hill.index).ok).toBe(true);
    expect(def.hp).toBeLessThan(100);
    expect(atk.hp).toBeLessThan(100);
    expect(atk.movesLeft).toBe(0);
  });

  it('is reproducible from the serialized RNG state', () => {
    const setup = () => {
      const { state } = battlefield();
      const atk = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 9).index)!;
      atk.tileIndex = tileAtCoords(state.map, 11, 9).index;
      const def = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 9).index, 'barbarian')!;
      def.tileIndex = tileAtCoords(state.map, 12, 9).index;
      return { state, atk, def };
    };
    const a = setup();
    const b = { state: deserialize(serialize(a.state)), atkId: a.atk.id, defIdx: a.def.tileIndex };
    meleeAttack(a.state, a.atk.id, a.def.tileIndex);
    meleeAttack(b.state, b.atkId, b.defIdx);
    expect(serialize(a.state)).toBe(serialize(b.state));
  });

  it('a slain defender lets the victor advance; camps are cleared with reward', () => {
    const { state } = battlefield();
    const campTile = tileAtCoords(state.map, 12, 9);
    state.barbCamps.push(campTile.index);
    const atk = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 11, 9).index)!;
    atk.tileIndex = tileAtCoords(state.map, 11, 9).index;
    const def = spawnUnit(state, 'WARRIOR', campTile.index, 'barbarian')!;
    def.tileIndex = campTile.index;
    def.hp = 5;

    const gold = state.treasury;
    expect(meleeAttack(state, atk.id, campTile.index).ok).toBe(true);
    expect(state.units.some((u) => u.id === def.id)).toBe(false);
    expect(atk.tileIndex).toBe(campTile.index);
    expect(state.barbCamps.length).toBe(0);
    expect(state.treasury).toBe(gold + 50);
  });

  it('ranged attacks take no retaliation and civilians die to melee', () => {
    const { state } = battlefield();
    const archer = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 11, 9).index)!;
    archer.tileIndex = tileAtCoords(state.map, 11, 9).index;
    const barb = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 13, 9).index, 'barbarian')!;
    barb.tileIndex = tileAtCoords(state.map, 13, 9).index;

    expect(attackTargets(state, archer)).toContain(barb.tileIndex); // range 2
    expect(rangedAttack(state, archer.id, barb.tileIndex).ok).toBe(true);
    expect(barb.hp).toBeLessThan(100);
    expect(archer.hp).toBe(100);

    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 12, 9).index)!;
    builder.tileIndex = tileAtCoords(state.map, 12, 9).index;
    barb.movesLeft = 2;
    expect(meleeAttack(state, barb.id, builder.tileIndex).ok).toBe(true);
    expect(state.units.some((u) => u.id === builder.id)).toBe(false);
  });
});

describe('barbarians', () => {
  it('camps spawn deterministically and send raiders that pillage', () => {
    const { state } = battlefield();
    const farm = tileAtCoords(state.map, 10, 9);
    farm.improvement = 'FARM';
    for (let i = 0; i < 60 && state.barbCamps.length === 0; i++) barbarianPhase(state);
    expect(state.barbCamps.length).toBeGreaterThan(0);
    for (let i = 0; i < 120 && !farm.pillaged; i++) barbarianPhase(state);
    expect(farm.pillaged).toBe(true);

    // pillaged improvements are dead weight until repaired
    const builder = spawnUnit(state, 'BUILDER', farm.index)!;
    builder.tileIndex = farm.index;
    expect(builderRepair(state, builder.id).ok).toBe(true);
    expect(farm.pillaged).toBe(false);
  });

  it('cities take siege damage, get sacked at 0, and heal when clear', () => {
    const { state, city } = battlefield();
    city.population = 8;
    state.treasury = 200;
    const barb = spawnUnit(state, 'HORSEMAN', tileAtCoords(state.map, 10, 9).index, 'barbarian')!;
    barb.tileIndex = tileAtCoords(state.map, 10, 9).index;

    let guard = 0;
    while (getCityHp(state, city.id) > 0 && city.population === 8 && guard++ < 60) {
      barb.movesLeft = 4;
      barb.hp = 100;
      meleeAttack(state, barb.id, city.centerIndex);
    }
    expect(city.population).toBeLessThan(8); // sacked
    expect(getCityHp(state, city.id)).toBe(CITY_MAX_HP / 2);

    state.units = []; // barbarians gone
    barbarianPhase(state);
    expect(getCityHp(state, city.id)).toBe(CITY_MAX_HP / 2 + 20);
  });

  it('barbarians near a trade endpoint suspend the route', () => {
    const { state, city } = battlefield();
    state.settlers = 1;
    const b = foundCity(state, tileAtCoords(state.map, 14, 9).index).city!;
    expect(routeRaided(state, city, b)).toBe(false);
    const barb = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 15, 9).index, 'barbarian')!;
    barb.tileIndex = tileAtCoords(state.map, 15, 9).index;
    expect(routeRaided(state, city, b)).toBe(true);
  });

  it('the barbarian phase runs inside endTurn without disturbing peace-mode saves', () => {
    const { state } = battlefield();
    for (let i = 0; i < 5; i++) endTurn(state);
    expect(state.turn).toBe(6);
    const calm = makeState(makeMap(16, 16));
    foundCity(calm, tileAtCoords(calm.map, 8, 8).index);
    for (let i = 0; i < 5; i++) endTurn(calm);
    expect(calm.units.length).toBe(0); // units mode off => no barbarians
  });
});
