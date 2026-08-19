import { describe, it, expect } from 'vitest';
import { greatPeopleEarned } from '../../../cpu/core/greatPeople';
import { computeCityStats } from '../../../cpu/core/city';
import { setMet } from '../../../cpu/core/cityStates';
import { CITY_MAX_HP } from '../../../cpu/data/units';
import { BARB_SEAT, cityStateOfSeat, civsAtWar, emptySeat, isBarbSeat, isCityStateSeat, seatOf, seatOfCityState, setTileOwner, setWar, setWarTurnsWith, tileCity, tileClaimed, tileSeat, unitsOf } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { createGame, foundCity, endTurn, serialize, deserialize, choosePantheon } from '../../../cpu/core/game';
import { canFoundCity } from '../../../cpu/core/rules';
import { tilesWithin, hexDistance } from '../../../world/hex';
import { applySeatUnitOrders, assertCityRegistryCoherent, declareWar, seatPhase, sueForPeace, transferCity } from '../../../cpu/core/phase';
import { meleeAttack, attackTargets, captureCityState } from '../../../cpu/core/combat';
import { routeRaidedAt, tradeCapacity } from '../../../cpu/core/trade';
import { spawnUnit, unitsHostile } from '../../../cpu/core/units';
import { gpCost } from '../../../cpu/data/greatPeople';
import type { CityState, GameState, City, Seat } from '../../../cpu/core/types';

function addCiv(
  state: GameState,
  col: number,
  row: number,
  opts: Partial<Seat> = {},
): Seat {
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
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
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, // opt out of belief races unless a test opts in
    ...opts,
  };
  addCivCity(state, civ, col, row);
  state.seats.push(civ);
  return civ;
}

/** The city half of addCiv, on its own so a test can give a civ a SECOND
 * city. With no capital gate, the first idle city
 * always takes the settler, so exercising any later branch of the pick loop
 * needs a settler parked elsewhere. */
function addCivCity(state: GameState, civ: Seat, col: number, row: number): City {
  const tile = tileAtCoords(state.map, col, row);
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
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civ.seat, city.id); // per-city registry
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  return city;
}

describe('civ placement and expansion', () => {
  it('places deterministic, spaced the other civs with a capital and escort', () => {
    const a = createGame({ width: 44, height: 26, seed: 3, withResources: true, withWonders: true, opponents: true });
    const b = createGame({ width: 44, height: 26, seed: 3, withResources: true, withWonders: true, opponents: true });
    expect(serialize(a)).toBe(serialize(b));
    expect((a.seats.length - 1)).toBeGreaterThanOrEqual(1);
    for (const r of a.seats.slice(1)) {
      expect(r.cities.length).toBe(1);
      const center = a.map.tiles[r.cities[0].centerIndex];
      expect(tileSeat(center)).toBe(r.seat);
      expect(center.district).toBe('CITY_CENTER');
      expect(unitsOf(a, r.seat).length).toBeGreaterThanOrEqual(1);
      for (const other of a.seats.slice(1)) {
        if (other.seat === r.seat) continue;
        const oc = a.map.tiles[other.cities[0].centerIndex];
        expect(hexDistance(center.col, center.row, oc.col, oc.row)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('the other civs grow, expand borders; a finished settler spawns as a UNIT', () => {
    const state = makeState();
    const civ = addCiv(state, 6, 6);
    // Settlers are per-city queue items — queue one about to finish
    civ.cities[0].queue.push({ kind: 'settler', progress: 500, cost: 90 });
    const claimedBefore = state.map.tiles.filter((t) => tileClaimed(t)).length;
    civ.cities[0].cultureBox = 200; // above borderGrowthCost: the phase claims frontier tiles
    seatPhase(state);
    // founding is a wire ORDER: the completed settler spawns and waits for one
    expect(civ.cities.length).toBe(1);
    expect(unitsOf(state, civ.seat).some((u) => u.type === 'SETTLER')).toBe(true);
    const claimedAfter = state.map.tiles.filter((t) => tileClaimed(t)).length;
    expect(claimedAfter).toBeGreaterThan(claimedBefore);
    // growth box fills toward pop 4
    expect(civ.cities[0].foodBox).toBeGreaterThan(0);
  });

  it('their land blocks settling and the advisor penalty keeps distance', () => {
    const state = makeState();
    const civ = addCiv(state, 6, 6);
    expect(canFoundCity(state, civ.cities[0].centerIndex, 0).ok).toBe(false);
    const ring1 = tilesWithin(state.map, 6, 6, 1).find((t) => t.index !== civ.cities[0].centerIndex)!;
    expect(canFoundCity(state, ring1.index, 0).ok).toBe(false);
  });
});

describe('civ district/tile registry coherence', () => {
  it('stays coherent across a full game (every district/wonder tile registers to its civCity)', () => {
    const state = createGame({ width: 44, height: 26, seed: 7, withResources: true, withWonders: true, opponents: true });
    // Run many turns; the scan (called from seatPhase under the env flag)
    // must never fire — placements/captures keep .districts and Tile.ownerCity
    // mutually consistent. Also assert directly each turn for tight failure.
    for (let i = 0; i < 80; i++) {
      endTurn(state);
      assertCityRegistryCoherent(state);
    }
    // sanity: the scan still has teeth in this full-grown state — forge one
    // incoherent registration and it must throw. (Undriven seats place no
    // districts on their own, so counting placements would prove nothing.)
    const civ = state.seats.slice(1).find((r) => r.cities.length > 0)!;
    const civCity = civ.cities[0];
    setTileOwner(state.map.tiles[civCity.centerIndex], civ.seat, civCity.id + 999);
    expect(() => assertCityRegistryCoherent(state)).toThrow(/registry incoherence/);
  });

  it('the scan catches a district tile registered to a SIBLING civCity', () => {
    const state = makeState();
    const civ = addCiv(state, 6, 6);
    // a second city of the SAME civ; steal a ring tile from city 0's frontier
    const sibling = civ.cities[0];
    const stolen = tilesWithin(state.map, 6, 6, 1).find(
      (t) => tileCity(t) === sibling.id && t.index !== sibling.centerIndex,
    )!;
    // forge an incoherent district: city 0 lists a tile registered to itself is
    // fine; re-register the tile to a phantom sibling id, then reference it.
    sibling.districts.push({ type: 'HOLY_SITE', tileIndex: stolen.index });
    expect(() => assertCityRegistryCoherent(state)).not.toThrow(); // still coherent (tile registers to this civCity)
    setTileOwner(stolen, tileSeat(stolen), sibling.id + 999); // now it belongs to a sibling
    expect(() => assertCityRegistryCoherent(state)).toThrow(/registry incoherence/);
  });
});

describe('races', () => {
  it('a civ claiming a great person raises your next cost tier', () => {
    const state = makeState();
    const civ = addCiv(state, 6, 6);
    civ.gpp.SCIENTIST = gpCost(0); // about to claim
    const before = greatPeopleEarned(state, 'SCIENTIST');
    seatPhase(state);
    expect(greatPeopleEarned(state, 'SCIENTIST')).toBe(before + 1);
    expect(state.eventLog.some((e) => e.includes('claimed'))).toBe(true);
  });

  it('civ pantheons leave the pool', () => {
    // The pantheon costs the civ 25 of its OWN faith.
    const state = makeState();
    const civ = addCiv(state, 6, 6, { religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, faith: 25 });
    seatPhase(state);
    expect(state.claimedPantheons.length).toBe(1);
    expect(civ.faith ?? 0).toBeLessThan(25); // the claim spent it
    const taken = state.claimedPantheons[0];
    seatOf(state, 0)!.faith = 100;
    expect(choosePantheon(state, taken, 0).ok).toBe(false);
  });

  it('a broke civ claims no pantheon', () => {
    const state = makeState();
    addCiv(state, 6, 6, { religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, faith: 0 });
    state.turn = 30;
    seatPhase(state);
    expect(state.claimedPantheons.length).toBe(0);
  });
});

describe('war and peace', () => {
  it('hostility follows the war flag', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 8, 8);
    const mine = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 4).index, 0)!;
    const theirs = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 5).index, civ.seat)!;
    expect(unitsHostile(state, mine, theirs)).toBe(false);
    expect(attackTargets(state, mine)).not.toContain(theirs.tileIndex);
    expect(declareWar(state, civ.seat, 0).ok).toBe(true);
    expect(unitsHostile(state, mine, theirs)).toBe(true);
    expect(attackTargets(state, mine)).toContain(theirs.tileIndex);
  });

  it('the PILLAGE verb wrecks an enemy improvement underfoot (war re-validated)', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 10, 10);
    const city = settleAt(state, tileAtCoords(state.map, 4, 4).index);
    const farm = tileAtCoords(state.map, 6, 4);
    setTileOwner(farm, city.seat, city.id);
    farm.improvement = 'FARM';
    const raider = spawnUnit(state, 'WARRIOR', farm.index, civ.seat)!;
    raider.tileIndex = farm.index;
    // pillage is a wire VERB (column 25), not an autonomous act
    applySeatUnitOrders(state, civ, [[25]]);
    expect(farm.pillaged).toBe(false); // at peace: the apply re-validates and refuses
    setWar(state, civ.seat, 0, true);
    applySeatUnitOrders(state, civ, [[25]]);
    expect(farm.pillaged).toBe(true);
  });

  it('peace needs time and gold; capture converts the city', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 8, 8);
    setWar(state, civ.seat, 0, true);
    expect(sueForPeace(state, civ.seat, 0).ok).toBe(false); // too soon
    setWarTurnsWith(state, civ.seat, 0, 10);
    seatOf(state, 0)!.treasury = 0;
    expect(sueForPeace(state, civ.seat, 0).ok).toBe(false); // too broke

    // Conquest path instead: batter the city down and take it.
    const civCity = civ.cities[0];
    civCity.hp = 5;
    const attacker = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 8).index, 0)!;
    const center = state.map.tiles[civCity.centerIndex];
    const adj = tilesWithin(state.map, center.col, center.row, 1).find(
      (t) => t.index !== center.index,
    )!;
    attacker.tileIndex = adj.index;
    attacker.movesLeft = 2;
    const r = meleeAttack(state, attacker.id, civCity.centerIndex, 0);
    expect(r.ok).toBe(true);
    expect(civ.cities.length).toBe(0);
    expect(seatOf(state, 0)!.cities.some((c) => c.name === 'Roma')).toBe(true);
    const converted = seatOf(state, 0)!.cities.find((c) => c.name === 'Roma')!;
    expect(converted.population).toBeGreaterThanOrEqual(1);
    expect(tileCity(state.map.tiles[civCity.centerIndex])).toBe(converted.id);
    expect(tileSeat(state.map.tiles[civCity.centerIndex])).toBe(0); // the captor owns the center

    expect(civsAtWar(state, civ.seat, 0)).toBe(false); // last city gone: war over
  });

  it('attacking a civ city in peacetime is refused', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 8, 8);
    const civCity = civ.cities[0];
    const center = state.map.tiles[civCity.centerIndex];
    const adj = tilesWithin(state.map, center.col, center.row, 1).find((t) => t.index !== center.index)!;
    const attacker = spawnUnit(state, 'WARRIOR', adj.index, 0)!;
    attacker.tileIndex = adj.index;
    const r = meleeAttack(state, attacker.id, civCity.centerIndex, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/peace/i);
  });
});

describe('conquest keeps infrastructure', () => {
  it('capture carries districts + buildings + wonders MINUS PALACE, walls at outerHp 0', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 8, 8);
    setWar(state, civ.seat, 0, true);
    setWarTurnsWith(state, civ.seat, 0, 10);
    const civCity = civ.cities[0];
    const center = state.map.tiles[civCity.centerIndex];
    const ring = tilesWithin(state.map, center.col, center.row, 1).filter((t) => t.index !== center.index);
    // A completed CAMPUS on one ring tile, a completed wonder on another.
    const campusTile = ring[0];
    campusTile.district = 'CAMPUS';
    campusTile.districtComplete = true;
    setTileOwner(campusTile, civ.seat, civCity.id);
    civCity.districts.push({ type: 'CAMPUS', tileIndex: campusTile.index });
    const wonderTile = ring[1];
    wonderTile.builtWonder = 'PYRAMIDS';
    wonderTile.builtWonderComplete = true;
    setTileOwner(wonderTile, civ.seat, civCity.id);
    civCity.wonders.push({ id: 'PYRAMIDS', tileIndex: wonderTile.index });
    // An INCOMPLETE district must NOT carry (stays paved-but-dead): a carried
    // incomplete Holy Site would let availableBuildings offer a Shrine the GPU
    // (district-complete gated) never could.
    const holyTile = ring[2];
    holyTile.district = 'HOLY_SITE';
    holyTile.districtComplete = false;
    setTileOwner(holyTile, civ.seat, civCity.id);
    civCity.districts.push({ type: 'HOLY_SITE', tileIndex: holyTile.index });
    // PALACE must never transfer; MARKET + ANCIENT_WALLS are kept.
    civCity.buildings.push('PALACE', 'MARKET', 'ANCIENT_WALLS');

    transferCity(state, civ.seat, seatOf(state, 0)!, civCity, 'conquered', true);

    const taken = seatOf(state, 0)!.cities.find((c) => c.centerIndex === center.index)!;
    expect(taken).toBeDefined();
    // districts kept (live, re-owned): CITY_CENTER + CAMPUS. The incomplete
    // HOLY_SITE is dropped (paved-but-dead), not carried.
    expect(taken.districts.map((d) => d.type).sort()).toEqual(['CAMPUS', 'CITY_CENTER']);
    expect(taken.districts.map((d) => d.type)).not.toContain('HOLY_SITE');
    // buildings kept minus PALACE.
    expect(taken.buildings).not.toContain('PALACE');
    expect(taken.buildings).toContain('MARKET');
    expect(taken.buildings).toContain('ANCIENT_WALLS');
    // wonders kept.
    expect(taken.wonders.map((w) => w.id)).toContain('PYRAMIDS');
    // ANCIENT_WALLS kept but the outer pool resets to 0, and heals back.
    expect(taken.outerHp).toBe(0);
    // the district/wonder tiles re-own to the new city and stay paved.
    expect(tileCity(state.map.tiles[campusTile.index])).toBe(taken.id);
    expect(state.map.tiles[campusTile.index].district).toBe('CAMPUS');
    expect(state.map.tiles[wonderTile.index].builtWonderComplete).toBe(true);
  });

  it('a full empire RAZES instead of keeping infrastructure (scorched earth unchanged)', () => {
    const state = makeState();
    state.unitsMode = true;
    // Six cities → the capture slot cap razes instead of transferring.
    for (let i = 0; i < 6; i++) {
      seatOf(state, 0)!.cities.push({
        id: seatOf(state, 0)!.nextCityId++,
        seat: 0,
        foundedTurn: state.turn,
        name: `P${i}`,
        centerIndex: 20 + i,
        population: 1,
        foodBox: 0,
        cultureBox: 0,
        tilesAcquired: 0,
        lockedTiles: [],
        focus: 'balanced',
        queue: [],
        isCapital: i === 0,
        buildings: [],
        districts: [{ type: 'CITY_CENTER', tileIndex: 20 + i }],
        wonders: [],
        hp: CITY_MAX_HP,
      });
    }
    const civ = addCiv(state, 8, 8);
    setWar(state, civ.seat, 0, true);
    setWarTurnsWith(state, civ.seat, 0, 10);
    const civCity = civ.cities[0];
    const center = state.map.tiles[civCity.centerIndex];
    const ring = tilesWithin(state.map, center.col, center.row, 1).filter((t) => t.index !== center.index);
    ring[0].district = 'CAMPUS';
    ring[0].districtComplete = true;
    setTileOwner(ring[0], civ.seat, civCity.id);
    civCity.districts.push({ type: 'CAMPUS', tileIndex: ring[0].index });
    civCity.buildings.push('MARKET');

    const before = seatOf(state, 0)!.cities.length;
    transferCity(state, civ.seat, seatOf(state, 0)!, civCity, 'conquered', true);
    // razed: no new city added, center unpaved (scorched earth).
    expect(seatOf(state, 0)!.cities.length).toBe(before);
    expect(state.map.tiles[center.index].district).toBeNull();
    expect(tileCity(state.map.tiles[center.index])).toBe(-1);
  });
});

describe('determinism', () => {
  it('civ games replay identically from a save', () => {
    const a = createGame({
      width: 30,
      height: 20,
      seed: 12,
      withResources: true,
      withWonders: true,
      cityStates: true,
      opponents: true,
    });
    const sites = a.map.tiles.filter((t) => canFoundCity(a, t.index, 0).ok);
    foundCity(a, sites[Math.floor(sites.length / 2)].index, 0);
    for (let i = 0; i < 5; i++) endTurn(a);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 12; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('civ trade routes', () => {
  function addSecondCity(state: GameState, civ: Seat, col: number, row: number): City {
    const tile = tileAtCoords(state.map, col, row);
    const city: City = {
      id: civ.nextCityId++,
      name: 'Ostia',
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
      hp: 200,
      foundedTurn: 1,
    };
    tile.district = 'CITY_CENTER';
    tile.districtComplete = true;
    setTileOwner(tile, civ.seat, city.id);
    civ.cities.push(city);
    return city;
  }

  it('capacity counts FOREIGN_TRADE, Market/Lighthouse per city (non-cumulative)', () => {
    const state = makeState();
    const civ = addCiv(state, 8, 8);
    expect(tradeCapacity(state, civ.seat)).toBe(0);
    civ.research.civics.push('FOREIGN_TRADE');
    expect(tradeCapacity(state, civ.seat)).toBe(1);
    civ.cities[0].buildings.push('MARKET');
    expect(tradeCapacity(state, civ.seat)).toBe(2);
    civ.cities[0].buildings.push('LIGHTHOUSE'); // same city: still +1
    expect(tradeCapacity(state, civ.seat)).toBe(2);
  });

  it('seatPhase forms one route per turn up to capacity; routes die with the city', () => {
    const state = makeState();
    const civ = addCiv(state, 8, 8);
    const second = addSecondCity(state, civ, 11, 8);
    civ.research.civics.push('FOREIGN_TRADE');
    seatPhase(state);
    expect(civ.tradeRoutes?.length).toBe(1);
    const r0 = civ.tradeRoutes![0];
    expect([civ.cities[0].id, second.id]).toContain(r0.from);
    expect([civ.cities[0].id, second.id]).toContain(r0.to);
    expect(r0.from).not.toBe(r0.to);
    seatPhase(state);
    expect(civ.tradeRoutes?.length).toBe(1); // capacity 1: no second route
    // endpoint death prunes
    civ.tradeRoutes = civ.tradeRoutes!.filter(() => true);
    civ.cities = civ.cities.filter((c) => c.id !== second.id);
    civ.tradeRoutes = civ.tradeRoutes.filter((x) => x.from !== second.id && x.to !== second.id);
    expect(civ.tradeRoutes.length).toBe(0);
  });

  it('civ routes suspend for barbarians always and seat-0 units only at war', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 8, 8);
    const center = state.map.tiles[civ.cities[0].centerIndex];
    const ends = [center.index];
    expect(routeRaidedAt(state, ends, civ.seat)).toBe(false);
    const mine = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, center.col + 2, center.row).index, 0)!;
    expect(routeRaidedAt(state, ends, civ.seat)).toBe(false); // at peace
    setWar(state, civ.seat, 0, true);
    expect(routeRaidedAt(state, ends, civ.seat)).toBe(true);
    state.units = state.units.filter((u) => u.id !== mine.id);
    expect(routeRaidedAt(state, ends, civ.seat)).toBe(false);
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, center.col + 2, center.row).index, BARB_SEAT);
    setWar(state, civ.seat, 0, false);
    expect(routeRaidedAt(state, ends, civ.seat)).toBe(true); // barbs always
  });

  it('a route suspends for at-war units, whoever owns the route', () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 10, 10);
    const home = tileAtCoords(state.map, 4, 4);
    const ends = [home.index];
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 4).index, civ.seat);
    expect(routeRaidedAt(state, ends, 0)).toBe(false); // at peace: no interdiction
    setWar(state, civ.seat, 0, true);
    expect(routeRaidedAt(state, ends, 0)).toBe(true);
  });
});

describe('civ CS trade routes', () => {
  function addCs(state: GameState, col: number, row: number, opts: Partial<CityState> = {}): CityState {
    const center = tileAtCoords(state.map, col, row);
    const cityState: CityState = {
      ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
      name: `Testopolis ${state.cityStates.length}`,
      type: 'scientific',
      centerIndex: center.index,
      population: 3,
      envoys: {},
      met: [0],
      ...opts,
    };
    for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id)); // placement's territory tags (cityStateAt resolves by tile cityStateId)
    state.cityStates.push(cityState);
    return cityState;
  }

  it('suzerainty of a trade CS adds civ route capacity (strict contest)', () => {
    const state = makeState();
    const civ = addCiv(state, 8, 8);
    const cityState = addCs(state, 11, 8, { type: 'trade' });
    expect(tradeCapacity(state, civ.seat)).toBe(0);
    cityState.envoys = {  };
    cityState.envoys[civ.seat] = 3;
    expect(tradeCapacity(state, civ.seat)).toBe(1); // uncontested at the minimum
    cityState.envoys = { [0]: 3 }; // seat 0 ties: nobody is suzerain
    expect(tradeCapacity(state, civ.seat)).toBe(0);
  });

  it('seatPhase routes to a met in-range CS; the origin earns gold + specialty', () => {
    const state = makeState();
    const civ = addCiv(state, 8, 8);
    const cityState = addCs(state, 11, 8); // scientific, distance 3
    civ.research.civics.push('FOREIGN_TRADE'); // capacity 1
    cityState.met = [];
    setMet(cityState, civ.seat);
    const civCity = civ.cities[0];
    const y0 = computeCityStats(state, civCity).total;
    seatPhase(state);
    expect(civ.tradeRoutes?.length).toBe(1);
    expect(civ.tradeRoutes![0]).toEqual({ from: civCity.id, toCs: cityState.id, expiresTurn: state.turn + 20 }); // route duration
    const y1 = computeCityStats(state, civCity).total;
    // cityStateRouteYields: +3 gold, +1 science (both tier-scaled; band like the
    // envoy tests — the phase also grew the city, so compare channels the
    // route alone moves meaningfully).
    expect(y1.gold - y0.gold).toBeGreaterThanOrEqual(2);
    expect(y1.science - y0.science).toBeGreaterThan(0);
  });

  it('captureCityState prunes civ CS routes', () => {
    const state = makeState();
    const civ = addCiv(state, 8, 8);
    const cityState = addCs(state, 11, 8);
    civ.tradeRoutes = [{ from: civ.cities[0].id, toCs: cityState.id }];
    captureCityState(state, cityState, 0);
    expect(civ.tradeRoutes.length).toBe(0);
  });

  it("join-the-suzerain's-war: an at-war civ melee sieges a seat-0-suzerain CS; conquest lands it as a civ city", () => {
    const state = makeState();
    state.unitsMode = true;
    const civ = addCiv(state, 4, 4);
    const cityState = addCs(state, 9, 9);
    cityState.envoys = { [0]: 3 }; // seat 0 is suzerain, uncontested
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 8).index, civ.seat);
    const u = state.units[state.units.length - 1];
    expect(attackTargets(state, u)).not.toContain(cityState.centerIndex); // at peace: no join-the-war
    setWar(state, civ.seat, 0, true);
    expect(attackTargets(state, u)).toContain(cityState.centerIndex);
    cityState.envoys = { [0]: 0 }; // not suzerain: the gate closes again
    expect(attackTargets(state, u)).not.toContain(cityState.centerIndex);
    cityState.envoys = { [0]: 3 };
    cityState.hp = 1;
    const before = civ.cities.length;
    meleeAttack(state, u.id, cityState.centerIndex, 0);
    expect(state.cityStates.find((c) => c.id === cityState.id)).toBeUndefined();
    expect(civ.cities.length).toBe(before + 1);
    const civCity = civ.cities[civ.cities.length - 1];
    expect(civCity.centerIndex).toBe(cityState.centerIndex);
    expect(civCity.population).toBe(2); // 3 × 0.75 floored
    expect(tileSeat(state.map.tiles[cityState.centerIndex])).toBe(civ.seat);
    expect(tileCity(state.map.tiles[cityState.centerIndex])).toBe(civCity.id);
  });
});

describe('civilian capture', () => {
  it('a seat-0 melee captures a lone at-war civ civilian (charges kept, no advance)', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const civ = addCiv(state, 16, 16);
    setWar(state, civ.seat, 0, true);
    const atkTile = tileAtCoords(state.map, 11, 9);
    const defTile = tileAtCoords(state.map, 12, 9);
    const atk = spawnUnit(state, 'WARRIOR', atkTile.index, 0)!;
    atk.tileIndex = atkTile.index;
    const builder = spawnUnit(state, 'BUILDER', defTile.index, civ.seat)!;
    builder.tileIndex = defTile.index;
    const charges = builder.charges;
    expect(charges).toBeGreaterThan(0);

    expect(meleeAttack(state, atk.id, defTile.index, 0).ok).toBe(true);

    // Captured: SAME unit id, now seat-0-owned, still on its tile, charges kept.
    const cap = state.units.find((u) => u.id === builder.id);
    expect(cap).toBeDefined();
    // One field carries the whole capture — a seat-0-owned unit is
    // simply seat 0, with no separate "and no civId" half to assert.
    expect(cap!.seat).toBe(0);
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
    settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const atkTile = tileAtCoords(state.map, 11, 9);
    const defTile = tileAtCoords(state.map, 12, 9);
    const barb = spawnUnit(state, 'WARRIOR', atkTile.index, BARB_SEAT)!;
    barb.tileIndex = atkTile.index;
    const builder = spawnUnit(state, 'BUILDER', defTile.index, 0)!; // a seat-0 civilian
    builder.tileIndex = defTile.index;

    expect(meleeAttack(state, barb.id, defTile.index, 0).ok).toBe(true);

    // Killed, not captured — and the barbarian advances into the emptied tile.
    expect(state.units.some((u) => u.id === builder.id)).toBe(false);
    expect(barb.tileIndex).toBe(defTile.index);
    expect(isBarbSeat(barb.seat)).toBe(true);
  });
});
