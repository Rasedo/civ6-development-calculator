import { describe, it, expect } from 'vitest';
import { makeState, tileAtCoords } from './helpers';
import {
  createGame,
  foundCity,
  endTurn,
  serialize,
  deserialize,
  choosePantheon,
  greatPeopleEarned,
} from '../src/core/game';
import { canFoundCity } from '../src/core/rules';
import { tilesWithin, hexDistance } from '../src/core/hex';
import { rivalPhase, declareWar, sueForPeace, rivalUnits } from '../src/core/rivals';
import { meleeAttack, attackTargets } from '../src/core/combat';
import { spawnUnit, unitsHostile } from '../src/core/units';
import { gpCost } from '../src/data/greatPeople';
import type { GameState, RivalCity, RivalCiv } from '../src/core/types';

function addRival(
  state: GameState,
  col: number,
  row: number,
  opts: Partial<RivalCiv> = {},
): RivalCiv {
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
    techLevel: 0,
    gpp: {},
    pantheonClaimed: true, // opt out of belief races unless a test opts in
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
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (t.cityId === -1 && (t.csId ?? -1) === -1) t.rivalId = rival.id;
  }
  rival.cities.push(city);
  state.rivals.push(rival);
  return rival;
}

describe('rival placement and expansion', () => {
  it('places deterministic, spaced rivals with a capital and escort', () => {
    const a = createGame({ width: 44, height: 26, seed: 3, withResources: true, withWonders: true, rivals: true });
    const b = createGame({ width: 44, height: 26, seed: 3, withResources: true, withWonders: true, rivals: true });
    expect(serialize(a)).toBe(serialize(b));
    expect(a.rivals.length).toBeGreaterThanOrEqual(1);
    for (const r of a.rivals) {
      expect(r.cities.length).toBe(1);
      const center = a.map.tiles[r.cities[0].centerIndex];
      expect(center.rivalId).toBe(r.id);
      expect(center.district).toBe('CITY_CENTER');
      expect(rivalUnits(a, r.id).length).toBeGreaterThanOrEqual(1);
      for (const other of a.rivals) {
        if (other.id === r.id) continue;
        const oc = a.map.tiles[other.cities[0].centerIndex];
        expect(hexDistance(center.col, center.row, oc.col, oc.row)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('rivals grow, expand borders and found further cities', () => {
    const state = makeState();
    const rival = addRival(state, 6, 6);
    // C1-B2: settlers are per-city queue items — queue one about to finish
    rival.cities[0].queue.push({ kind: 'settler', progress: 500, cost: 90 });
    const claimedBefore = state.map.tiles.filter((t) => (t.rivalId ?? -1) !== -1).length;
    state.turn = 9; // border-expansion tick for city id 0
    rivalPhase(state);
    expect(rival.cities.length).toBe(2);
    const claimedAfter = state.map.tiles.filter((t) => (t.rivalId ?? -1) !== -1).length;
    expect(claimedAfter).toBeGreaterThan(claimedBefore);
    // growth box fills toward pop 4
    expect(rival.cities[0].foodBox).toBeGreaterThan(0);
  });

  it('their land blocks settling and the advisor penalty keeps distance', () => {
    const state = makeState();
    const rival = addRival(state, 6, 6);
    expect(canFoundCity(state, rival.cities[0].centerIndex).ok).toBe(false);
    const ring1 = tilesWithin(state.map, 6, 6, 1).find((t) => t.index !== rival.cities[0].centerIndex)!;
    expect(canFoundCity(state, ring1.index).ok).toBe(false);
  });
});

describe('races', () => {
  it('a rival claiming a great person raises your next cost tier', () => {
    const state = makeState();
    const rival = addRival(state, 6, 6);
    rival.gpp.SCIENTIST = gpCost(0); // about to claim
    const before = greatPeopleEarned(state, 'SCIENTIST');
    rivalPhase(state);
    expect(greatPeopleEarned(state, 'SCIENTIST')).toBe(before + 1);
    expect(state.eventLog.some((e) => e.includes('claimed'))).toBe(true);
  });

  it('rival pantheons leave the pool', () => {
    const state = makeState();
    addRival(state, 6, 6, { pantheonClaimed: false });
    state.turn = 30;
    rivalPhase(state);
    expect(state.claimedPantheons.length).toBe(1);
    const taken = state.claimedPantheons[0];
    state.faithTotal = 100;
    expect(choosePantheon(state, taken).ok).toBe(false);
  });
});

describe('war and peace', () => {
  it('hostility follows the war flag', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 8, 8);
    const mine = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 4).index)!;
    const theirs = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 5).index, 'rival', rival.id)!;
    expect(unitsHostile(state, mine, theirs)).toBe(false);
    expect(attackTargets(state, mine)).not.toContain(theirs.tileIndex);
    expect(declareWar(state, rival.id).ok).toBe(true);
    expect(unitsHostile(state, mine, theirs)).toBe(true);
    expect(attackTargets(state, mine)).toContain(theirs.tileIndex);
  });

  it('at-war rival units pillage your improvements', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 10, 10, { atWar: true });
    const city = foundCity(state, tileAtCoords(state.map, 4, 4).index).city!;
    // A farm outside attack range of anything (raiders attack before pillaging).
    const farm = tileAtCoords(state.map, 6, 4);
    farm.cityId = city.id;
    farm.improvement = 'FARM';
    const raider = spawnUnit(state, 'WARRIOR', farm.index, 'rival', rival.id)!;
    raider.tileIndex = farm.index;
    rivalPhase(state);
    expect(farm.pillaged).toBe(true);
  });

  it('peace needs time and gold; capture converts the city', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 8, 8, { atWar: true, warTurns: 0 });
    expect(sueForPeace(state, rival.id).ok).toBe(false); // too soon
    rival.warTurns = 10;
    state.treasury = 0;
    expect(sueForPeace(state, rival.id).ok).toBe(false); // too broke

    // Conquest path instead: batter the city down and take it.
    const rc = rival.cities[0];
    rc.hp = 5;
    const attacker = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 8).index)!;
    const center = state.map.tiles[rc.centerIndex];
    const adj = tilesWithin(state.map, center.col, center.row, 1).find(
      (t) => t.index !== center.index,
    )!;
    attacker.tileIndex = adj.index;
    attacker.movesLeft = 2;
    const r = meleeAttack(state, attacker.id, rc.centerIndex);
    expect(r.ok).toBe(true);
    expect(rival.cities.length).toBe(0);
    expect(state.cities.some((c) => c.name === 'Roma')).toBe(true);
    const converted = state.cities.find((c) => c.name === 'Roma')!;
    expect(converted.population).toBeGreaterThanOrEqual(1);
    expect(state.map.tiles[rc.centerIndex].cityId).toBe(converted.id);
    expect(state.map.tiles[rc.centerIndex].rivalId ?? -1).toBe(-1);
    expect(rival.atWar).toBe(false); // last city gone: war over
  });

  it('attacking a rival city in peacetime is refused', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 8, 8);
    const rc = rival.cities[0];
    const center = state.map.tiles[rc.centerIndex];
    const adj = tilesWithin(state.map, center.col, center.row, 1).find((t) => t.index !== center.index)!;
    const attacker = spawnUnit(state, 'WARRIOR', adj.index)!;
    attacker.tileIndex = adj.index;
    const r = meleeAttack(state, attacker.id, rc.centerIndex);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/peace/i);
  });
});

describe('determinism', () => {
  it('rival games replay identically from a save', () => {
    const a = createGame({
      width: 30,
      height: 20,
      seed: 12,
      withResources: true,
      withWonders: true,
      cityStates: true,
      rivals: true,
    });
    const sites = a.map.tiles.filter((t) => canFoundCity(a, t.index).ok);
    foundCity(a, sites[Math.floor(sites.length / 2)].index);
    for (let i = 0; i < 5; i++) endTurn(a);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 12; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));
  });
});
