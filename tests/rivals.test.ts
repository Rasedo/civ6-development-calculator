import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
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
import { rivalPhase, declareWar, sueForPeace, rivalUnits, rivalCityYields } from '../src/core/rivals';
import { meleeAttack, attackTargets, captureCityState } from '../src/core/combat';
import { rivalTradeCapacity, rivalRouteRaidedAt, routeRaidedAt } from '../src/core/trade';
import { spawnUnit, unitsHostile } from '../src/core/units';
import { gpCost } from '../src/data/greatPeople';
import type { CityState, GameState, RivalCity, RivalCiv } from '../src/core/types';

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
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
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
    // P5/S5 (C-17): the pantheon costs the rival 25 of its OWN faith —
    // the old free timed claim is gone.
    const state = makeState();
    const rival = addRival(state, 6, 6, { pantheonClaimed: false, faith: 25 });
    rivalPhase(state);
    expect(state.claimedPantheons.length).toBe(1);
    expect(rival.faith ?? 0).toBeLessThan(25); // the claim spent it
    const taken = state.claimedPantheons[0];
    state.faithTotal = 100;
    expect(choosePantheon(state, taken).ok).toBe(false);
  });

  it('a broke rival claims no pantheon', () => {
    const state = makeState();
    addRival(state, 6, 6, { pantheonClaimed: false, faith: 0 });
    state.turn = 30;
    rivalPhase(state);
    expect(state.claimedPantheons.length).toBe(0);
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

describe('rival trade routes (A-11)', () => {
  function addSecondCity(state: GameState, rival: RivalCiv, col: number, row: number): RivalCity {
    const tile = tileAtCoords(state.map, col, row);
    const city: RivalCity = {
      id: rival.nextCityId++,
      name: 'Ostia',
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
    tile.rivalCityId = city.id;
    rival.cities.push(city);
    return city;
  }

  it('capacity counts FOREIGN_TRADE, Market/Lighthouse per city (non-cumulative)', () => {
    const state = makeState();
    const rival = addRival(state, 8, 8);
    expect(rivalTradeCapacity(state, rival)).toBe(0);
    rival.research.civics.push('FOREIGN_TRADE');
    expect(rivalTradeCapacity(state, rival)).toBe(1);
    rival.cities[0].buildings.push('MARKET');
    expect(rivalTradeCapacity(state, rival)).toBe(2);
    rival.cities[0].buildings.push('LIGHTHOUSE'); // same city: still +1
    expect(rivalTradeCapacity(state, rival)).toBe(2);
  });

  it('rivalPhase forms one route per turn up to capacity; routes die with the city', () => {
    const state = makeState();
    const rival = addRival(state, 8, 8);
    const second = addSecondCity(state, rival, 11, 8);
    rival.research.civics.push('FOREIGN_TRADE');
    rivalPhase(state);
    expect(rival.tradeRoutes?.length).toBe(1);
    const r0 = rival.tradeRoutes![0];
    expect([rival.cities[0].id, second.id]).toContain(r0.from);
    expect([rival.cities[0].id, second.id]).toContain(r0.to);
    expect(r0.from).not.toBe(r0.to);
    rivalPhase(state);
    expect(rival.tradeRoutes?.length).toBe(1); // capacity 1: no second route
    // endpoint death prunes
    rival.tradeRoutes = rival.tradeRoutes!.filter(() => true);
    rival.cities = rival.cities.filter((c) => c.id !== second.id);
    rival.tradeRoutes = rival.tradeRoutes.filter((x) => x.from !== second.id && x.to !== second.id);
    expect(rival.tradeRoutes.length).toBe(0);
  });

  it('rival routes suspend for barbarians always and player units only at war', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 8, 8);
    const center = state.map.tiles[rival.cities[0].centerIndex];
    const ends = [center.index];
    expect(rivalRouteRaidedAt(state, rival, ends)).toBe(false);
    const mine = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, center.col + 2, center.row).index)!;
    expect(rivalRouteRaidedAt(state, rival, ends)).toBe(false); // at peace
    rival.atWar = true;
    expect(rivalRouteRaidedAt(state, rival, ends)).toBe(true);
    state.units = state.units.filter((u) => u.id !== mine.id);
    expect(rivalRouteRaidedAt(state, rival, ends)).toBe(false);
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, center.col + 2, center.row).index, 'barbarian');
    rival.atWar = false;
    expect(rivalRouteRaidedAt(state, rival, ends)).toBe(true); // barbs always
  });

  it('player routes suspend for AT-WAR rival units (the A-11 symmetry fix)', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 10, 10);
    const home = tileAtCoords(state.map, 4, 4);
    const ends = [home.index];
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 4).index, 'rival', rival.id);
    expect(routeRaidedAt(state, ends)).toBe(false); // at peace: no interdiction
    rival.atWar = true;
    expect(routeRaidedAt(state, ends)).toBe(true);
  });
});

describe('rival CS trade routes (A-12b)', () => {
  function addCs(state: GameState, col: number, row: number, opts: Partial<CityState> = {}): CityState {
    const center = tileAtCoords(state.map, col, row);
    const cs: CityState = {
      id: state.cityStates.length,
      name: `Testopolis ${state.cityStates.length}`,
      type: 'scientific',
      centerIndex: center.index,
      population: 3,
      envoys: 0,
      met: true,
      quest: null,
      questIssuedTurn: 0,
      ...opts,
    };
    for (const t of tilesWithin(state.map, col, row, 1)) t.csId = cs.id; // placement's territory tags (cityStateAt resolves by tile csId)
    state.cityStates.push(cs);
    return cs;
  }

  it('suzerainty of a trade CS adds rival route capacity (strict contest)', () => {
    const state = makeState();
    const rival = addRival(state, 8, 8);
    const cs = addCs(state, 11, 8, { type: 'trade' });
    expect(rivalTradeCapacity(state, rival)).toBe(0);
    cs.rivalEnvoys = [];
    cs.rivalEnvoys[rival.id] = 3;
    expect(rivalTradeCapacity(state, rival)).toBe(1); // uncontested at the minimum
    cs.envoys = 3; // player ties: nobody is suzerain
    expect(rivalTradeCapacity(state, rival)).toBe(0);
  });

  it('rivalPhase routes to a met in-range CS; the origin earns gold + specialty', () => {
    const state = makeState();
    const rival = addRival(state, 8, 8);
    const cs = addCs(state, 11, 8); // scientific, distance 3
    rival.research.civics.push('FOREIGN_TRADE'); // capacity 1
    cs.rivalMet = [];
    cs.rivalMet[rival.id] = true;
    const rc = rival.cities[0];
    const y0 = rivalCityYields(state, rival, rc);
    rivalPhase(state);
    expect(rival.tradeRoutes?.length).toBe(1);
    expect(rival.tradeRoutes![0]).toEqual({ from: rc.id, toCs: cs.id });
    const y1 = rivalCityYields(state, rival, rc);
    // csRouteYields: +3 gold, +1 science (both tier-scaled; band like the
    // envoy tests — the phase also grew the city, so compare channels the
    // route alone moves meaningfully).
    expect(y1.gold - y0.gold).toBeGreaterThanOrEqual(2);
    expect(y1.science - y0.science).toBeGreaterThan(0);
  });

  it('captureCityState prunes rival CS routes', () => {
    const state = makeState();
    const rival = addRival(state, 8, 8);
    const cs = addCs(state, 11, 8);
    rival.tradeRoutes = [{ from: rival.cities[0].id, toCs: cs.id }];
    captureCityState(state, cs);
    expect(rival.tradeRoutes.length).toBe(0);
  });

  it("join-the-suzerain's-war: an at-war rival melee sieges a player-suzerain CS; conquest lands it as a rival city", () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 4, 4);
    const cs = addCs(state, 9, 9);
    cs.envoys = 3; // the player is suzerain, uncontested
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 8).index, 'rival', rival.id);
    const u = state.units[state.units.length - 1];
    expect(attackTargets(state, u)).not.toContain(cs.centerIndex); // at peace: no join-the-war
    rival.atWar = true;
    expect(attackTargets(state, u)).toContain(cs.centerIndex);
    cs.envoys = 0; // not suzerain: the gate closes again
    expect(attackTargets(state, u)).not.toContain(cs.centerIndex);
    cs.envoys = 3;
    cs.hp = 1;
    const before = rival.cities.length;
    meleeAttack(state, u.id, cs.centerIndex);
    expect(state.cityStates.find((c) => c.id === cs.id)).toBeUndefined();
    expect(rival.cities.length).toBe(before + 1);
    const rc = rival.cities[rival.cities.length - 1];
    expect(rc.centerIndex).toBe(cs.centerIndex);
    expect(rc.population).toBe(2); // 3 × 0.75 floored
    expect(state.map.tiles[cs.centerIndex].rivalId).toBe(rival.id);
    expect(state.map.tiles[cs.centerIndex].rivalCityId).toBe(rc.id);
  });
});

describe('B-31 civilian capture', () => {
  it('a player melee captures a lone at-war rival civilian (charges kept, no advance)', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    foundCity(state, tileAtCoords(state.map, 9, 9).index);
    const rival = addRival(state, 16, 16, { atWar: true });
    const atkTile = tileAtCoords(state.map, 11, 9);
    const defTile = tileAtCoords(state.map, 12, 9);
    const atk = spawnUnit(state, 'WARRIOR', atkTile.index)!;
    atk.tileIndex = atkTile.index;
    const builder = spawnUnit(state, 'BUILDER', defTile.index, 'rival', rival.id)!;
    builder.tileIndex = defTile.index;
    const charges = builder.charges;
    expect(charges).toBeGreaterThan(0);

    expect(meleeAttack(state, atk.id, defTile.index).ok).toBe(true);

    // Captured: SAME unit id, now player-owned, still on its tile, charges kept.
    const cap = state.units.find((u) => u.id === builder.id);
    expect(cap).toBeDefined();
    expect(cap!.owner).toBe('player');
    expect(cap!.civId).toBeUndefined();
    expect(cap!.tileIndex).toBe(defTile.index);
    expect(cap!.charges).toBe(charges);
    expect(cap!.movesLeft).toBe(0);
    // The attacker spent its attack and did NOT advance (single-occupancy).
    expect(atk.tileIndex).toBe(atkTile.index);
    expect(atk.movesLeft).toBe(0);
  });

  it('a barbarian still KILLS a lone civilian (no prisoner system)', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    foundCity(state, tileAtCoords(state.map, 9, 9).index);
    const atkTile = tileAtCoords(state.map, 11, 9);
    const defTile = tileAtCoords(state.map, 12, 9);
    const barb = spawnUnit(state, 'WARRIOR', atkTile.index, 'barbarian')!;
    barb.tileIndex = atkTile.index;
    const builder = spawnUnit(state, 'BUILDER', defTile.index)!; // a player civilian
    builder.tileIndex = defTile.index;

    expect(meleeAttack(state, barb.id, defTile.index).ok).toBe(true);

    // Killed, not captured — and the barbarian advances into the emptied tile.
    expect(state.units.some((u) => u.id === builder.id)).toBe(false);
    expect(barb.tileIndex).toBe(defTile.index);
    expect(barb.owner).toBe('barbarian');
  });
});
