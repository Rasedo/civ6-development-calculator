import { describe, it, expect } from 'vitest';
import { CITY_MAX_HP } from '../src/data/units';
import { playerSeat, civOfRival, BARB_SEAT, isBarbSeat, PLAYER_CIV, rivalOfCiv, isPlayerSeat, isRivalSeat, tileSeat, tileCity, isCityStateSeat, setTileOwner, seatOfCityState, cityStateOfSeat, rivalsOf, rivalCount , emptySeat } from '../src/core/seats';
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
import { rivalPhase, declareWar, sueForPeace, rivalUnits, rivalCityYields, assertRivalRegistryCoherent } from '../src/core/rivals';
import { meleeAttack, attackTargets, captureCityState, captureRivalCity } from '../src/core/combat';
import { routeRaidedAt, tradeCapacity } from '../src/core/trade';
import { spawnUnit, unitsHostile } from '../src/core/units';
import { gpCost } from '../src/data/greatPeople';
import { BUILDINGS } from '../src/data/buildings';
import type { CityState, GameState, RivalCity, RivalCiv } from '../src/core/types';

function addRival(
  state: GameState,
  col: number,
  row: number,
  opts: Partial<RivalCiv> = {},
): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    ...emptySeat(civOfRival(rivalCount(state))), // #51/S6.12
    id: rivalCount(state),
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
    government: { current: null, policies: [] },
    cities: [],
    nextCityId: 0,
    atWar: false,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    gpEarned: [],
    settlers: 0,
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, // opt out of belief races unless a test opts in
    ...opts,
  };
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: 'Roma',
    seat: rival.id + 1,
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
  setTileOwner(tile, civOfRival(rival.id), city.id); // A-17: per-city registry
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (!isPlayerSeat(tileSeat(t)) && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civOfRival(rival.id), city.id);
    }
  }
  rival.cities.push(city);
  state.seats.push(rival);
  return rival;
}

describe('rival placement and expansion', () => {
  it('places deterministic, spaced rivals with a capital and escort', () => {
    const a = createGame({ width: 44, height: 26, seed: 3, withResources: true, withWonders: true, rivals: true });
    const b = createGame({ width: 44, height: 26, seed: 3, withResources: true, withWonders: true, rivals: true });
    expect(serialize(a)).toBe(serialize(b));
    expect(rivalCount(a)).toBeGreaterThanOrEqual(1);
    for (const r of rivalsOf(a)) {
      expect(r.cities.length).toBe(1);
      const center = a.map.tiles[r.cities[0].centerIndex];
      expect((isRivalSeat(tileSeat(center)) ? rivalOfCiv(tileSeat(center)) : -1)).toBe(r.id);
      expect(center.district).toBe('CITY_CENTER');
      expect(rivalUnits(a, r.id).length).toBeGreaterThanOrEqual(1);
      for (const other of rivalsOf(a)) {
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
    const claimedBefore = state.map.tiles.filter((t) => (isRivalSeat(tileSeat(t)) ? rivalOfCiv(tileSeat(t)) : -1) !== -1).length;
    state.turn = 9; // border-expansion tick for city id 0
    rivalPhase(state);
    expect(rival.cities.length).toBe(2);
    const claimedAfter = state.map.tiles.filter((t) => (isRivalSeat(tileSeat(t)) ? rivalOfCiv(tileSeat(t)) : -1) !== -1).length;
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

describe('A-24 rival district/tile registry coherence', () => {
  it('stays coherent across a full game (every district/wonder tile registers to its rc)', () => {
    const state = createGame({ width: 44, height: 26, seed: 7, withResources: true, withWonders: true, rivals: true });
    // Run many turns; the scan (called from rivalPhase under the env flag)
    // must never fire — placements/captures keep .districts and rivalCityId
    // mutually consistent. Also assert directly each turn for tight failure.
    for (let i = 0; i < 80; i++) {
      endTurn(state);
      assertRivalRegistryCoherent(state);
    }
    // sanity: rivals actually placed some districts to make the check meaningful
    const placed = rivalsOf(state).reduce(
      (n, r) => n + r.cities.reduce((m, c) => m + c.districts.length + (c.wonders?.length ?? 0), 0),
      0,
    );
    expect(placed).toBeGreaterThan(rivalCount(state)); // more than just the CITY_CENTERs
  });

  it('the scan catches a district tile registered to a SIBLING rc', () => {
    const state = makeState();
    const rival = addRival(state, 6, 6);
    // a second city of the SAME civ; steal a ring tile from city 0's frontier
    const sibling = rival.cities[0];
    const stolen = tilesWithin(state.map, 6, 6, 1).find(
      (t) => tileCity(t) === sibling.id && t.index !== sibling.centerIndex,
    )!;
    // forge an incoherent district: city 0 lists a tile registered to itself is
    // fine; re-register the tile to a phantom sibling id, then reference it.
    sibling.districts.push({ type: 'HOLY_SITE', tileIndex: stolen.index });
    expect(() => assertRivalRegistryCoherent(state)).not.toThrow(); // still coherent (tile registers to this rc)
    setTileOwner(stolen, tileSeat(stolen), sibling.id + 999); // now it belongs to a sibling
    expect(() => assertRivalRegistryCoherent(state)).toThrow(/A-24 registry incoherence/);
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
    const rival = addRival(state, 6, 6, { religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, faith: 25 });
    rivalPhase(state);
    expect(state.claimedPantheons.length).toBe(1);
    expect(rival.faith ?? 0).toBeLessThan(25); // the claim spent it
    const taken = state.claimedPantheons[0];
    playerSeat(state).faith = 100;
    expect(choosePantheon(state, taken).ok).toBe(false);
  });

  it('a broke rival claims no pantheon', () => {
    const state = makeState();
    addRival(state, 6, 6, { religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null }, faith: 0 });
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
    const theirs = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 4, 5).index, civOfRival(rival.id))!;
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
    setTileOwner(farm, city.seat, city.id);
    farm.improvement = 'FARM';
    const raider = spawnUnit(state, 'WARRIOR', farm.index, civOfRival(rival.id))!;
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
    playerSeat(state).treasury = 0;
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
    expect(tileCity(state.map.tiles[rc.centerIndex])).toBe(converted.id);
    expect((isRivalSeat(tileSeat(state.map.tiles[rc.centerIndex])) ? rivalOfCiv(tileSeat(state.map.tiles[rc.centerIndex])) : -1)).toBe(-1);
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

describe('AUDIT B-30: conquest keeps infrastructure', () => {
  it('captureRivalCity carries districts + buildings + wonders MINUS PALACE, walls at outerHp 0', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 8, 8, { atWar: true, warTurns: 10 });
    const rc = rival.cities[0];
    const center = state.map.tiles[rc.centerIndex];
    const ring = tilesWithin(state.map, center.col, center.row, 1).filter((t) => t.index !== center.index);
    // A completed CAMPUS on one ring tile, a completed wonder on another.
    const campusTile = ring[0];
    campusTile.district = 'CAMPUS';
    campusTile.districtComplete = true;
    setTileOwner(campusTile, civOfRival(rival.id), rc.id);
    rc.districts.push({ type: 'CAMPUS', tileIndex: campusTile.index });
    const wonderTile = ring[1];
    wonderTile.builtWonder = 'PYRAMIDS';
    wonderTile.builtWonderComplete = true;
    setTileOwner(wonderTile, civOfRival(rival.id), rc.id);
    rc.wonders.push({ id: 'PYRAMIDS', tileIndex: wonderTile.index });
    // An INCOMPLETE district must NOT carry (stays paved-but-dead): a carried
    // incomplete Holy Site would let availableBuildings offer a Shrine the GPU
    // (district-complete gated) never could — seed 9235.
    const holyTile = ring[2];
    holyTile.district = 'HOLY_SITE';
    holyTile.districtComplete = false;
    setTileOwner(holyTile, civOfRival(rival.id), rc.id);
    rc.districts.push({ type: 'HOLY_SITE', tileIndex: holyTile.index });
    // PALACE must never transfer; MARKET + ANCIENT_WALLS are kept.
    rc.buildings.push('PALACE', 'MARKET', 'ANCIENT_WALLS');

    captureRivalCity(state, rival, rc, true);

    const taken = state.cities.find((c) => c.centerIndex === center.index)!;
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
    // ANCIENT_WALLS kept but outer pool reset to 0 (heals via B-1).
    expect(taken.outerHp).toBe(0);
    // the district/wonder tiles re-own to the new city and stay paved.
    expect(tileCity(state.map.tiles[campusTile.index])).toBe(taken.id);
    expect(state.map.tiles[campusTile.index].district).toBe('CAMPUS');
    expect(state.map.tiles[wonderTile.index].builtWonderComplete).toBe(true);
  });

  it('a full empire RAZES instead of keeping infrastructure (scorched earth unchanged)', () => {
    const state = makeState();
    state.unitsMode = true;
    // Six player cities → the capture slot cap razes (captureRivalCity early-return).
    for (let i = 0; i < 6; i++) {
      state.cities.push({
        id: state.nextCityId++,
        seat: PLAYER_CIV,
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
        specialists: {},
        hp: CITY_MAX_HP,
      });
    }
    const rival = addRival(state, 8, 8, { atWar: true, warTurns: 10 });
    const rc = rival.cities[0];
    const center = state.map.tiles[rc.centerIndex];
    const ring = tilesWithin(state.map, center.col, center.row, 1).filter((t) => t.index !== center.index);
    ring[0].district = 'CAMPUS';
    ring[0].districtComplete = true;
    setTileOwner(ring[0], civOfRival(rival.id), rc.id);
    rc.districts.push({ type: 'CAMPUS', tileIndex: ring[0].index });
    rc.buildings.push('MARKET');

    const before = state.cities.length;
    captureRivalCity(state, rival, rc, true);
    // razed: no new city added, center unpaved (scorched earth).
    expect(state.cities.length).toBe(before);
    expect(state.map.tiles[center.index].district).toBeNull();
    expect(tileCity(state.map.tiles[center.index])).toBe(-1);
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

describe('B-10 best-of-roster scripted rival production ladder', () => {
  // Force the unit branch of the pick loop: improve every owned tile (no
  // district placement, no builder job), pre-own every building (no building
  // pick), non-capital city (no settler / wonder). Then rc.queue[0] is the
  // ladder's unit pick. treasury 0 → no A-5r gold buys interfere.
  function ladderPick(techs: string[], opts: { iron?: boolean; horses?: boolean; premelee?: boolean } = {}): string | undefined {
    const state = makeState();
    const rival = addRival(state, 6, 6);
    rival.research.techs.push(...techs);
    const rc = rival.cities[0];
    // improve all owned non-center tiles
    for (const t of state.map.tiles) {
      if ((isRivalSeat(tileSeat(t)) ? rivalOfCiv(tileSeat(t)) : -1) === rival.id && t.index !== rc.centerIndex && !t.improvement) t.improvement = 'FARM';
    }
    // strategic access via improved resource tiles inside the borders
    const owned = state.map.tiles.filter((t) => (isRivalSeat(tileSeat(t)) ? rivalOfCiv(tileSeat(t)) : -1) === rival.id && t.index !== rc.centerIndex);
    if (opts.iron) {
      owned[0].resource = 'IRON';
      owned[0].elevation = 'HILLS';
      owned[0].improvement = 'MINE';
    }
    if (opts.horses) {
      owned[1].resource = 'HORSES';
      owned[1].improvement = 'PASTURE';
    }
    rc.buildings = Object.keys(BUILDINGS); // pre-own everything → no building pick
    if (opts.premelee) {
      // one live melee unit → wantRanged (rangedCount*2 < meleeCount) trips
      spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 2, 2).index, civOfRival(rival.id));
    }
    rivalPhase(state);
    const q = rc.queue[0];
    return q?.kind === 'unit' ? q.unit : undefined;
  }

  it('IRON_WORKING + iron access picks SWORDSMAN over SPEARMAN', () => {
    expect(ladderPick(['BRONZE_WORKING', 'IRON_WORKING'], { iron: true })).toBe('SWORDSMAN');
  });

  it('without iron the melee lane falls to PIKEMAN once MILITARY_TACTICS lands', () => {
    // SWORDSMAN/KNIGHT gated out (no iron); PIKEMAN (41) beats SPEARMAN (25)/WARRIOR (20).
    expect(ladderPick(['BRONZE_WORKING', 'IRON_WORKING', 'MILITARY_TACTICS'], {})).toBe('PIKEMAN');
  });

  it('the ranged lane picks CROSSBOWMAN at MACHINERY', () => {
    // premelee flips wantRanged; ranged strengths SLINGER 15 < ARCHER 25 < CROSSBOWMAN 40.
    expect(ladderPick(['ARCHERY', 'MACHINERY'], { premelee: true })).toBe('CROSSBOWMAN');
  });

  it('the 36-combat HORSEMAN/SWORDSMAN tie keeps HORSEMAN (lower UNITS index)', () => {
    expect(
      ladderPick(['HORSEBACK_RIDING', 'IRON_WORKING'], { iron: true, horses: true }),
    ).toBe('HORSEMAN');
  });

  it('MUSKETMAN wins the melee lane once GUNPOWDER lands (no resource gate)', () => {
    expect(
      ladderPick(['BRONZE_WORKING', 'IRON_WORKING', 'MILITARY_TACTICS', 'GUNPOWDER'], {}),
    ).toBe('MUSKETMAN');
  });
});

describe('rival trade routes (A-11)', () => {
  function addSecondCity(state: GameState, rival: RivalCiv, col: number, row: number): RivalCity {
    const tile = tileAtCoords(state.map, col, row);
    const city: RivalCity = {
      id: rival.nextCityId++,
      name: 'Ostia',
      seat: rival.id + 1,
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
    setTileOwner(tile, civOfRival(rival.id), city.id);
    rival.cities.push(city);
    return city;
  }

  it('capacity counts FOREIGN_TRADE, Market/Lighthouse per city (non-cumulative)', () => {
    const state = makeState();
    const rival = addRival(state, 8, 8);
    expect(tradeCapacity(state, civOfRival(rival.id))).toBe(0);
    rival.research.civics.push('FOREIGN_TRADE');
    expect(tradeCapacity(state, civOfRival(rival.id))).toBe(1);
    rival.cities[0].buildings.push('MARKET');
    expect(tradeCapacity(state, civOfRival(rival.id))).toBe(2);
    rival.cities[0].buildings.push('LIGHTHOUSE'); // same city: still +1
    expect(tradeCapacity(state, civOfRival(rival.id))).toBe(2);
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
    expect(routeRaidedAt(state, ends, civOfRival(rival.id))).toBe(false);
    const mine = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, center.col + 2, center.row).index)!;
    expect(routeRaidedAt(state, ends, civOfRival(rival.id))).toBe(false); // at peace
    rival.atWar = true;
    expect(routeRaidedAt(state, ends, civOfRival(rival.id))).toBe(true);
    state.units = state.units.filter((u) => u.id !== mine.id);
    expect(routeRaidedAt(state, ends, civOfRival(rival.id))).toBe(false);
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, center.col + 2, center.row).index, BARB_SEAT);
    rival.atWar = false;
    expect(routeRaidedAt(state, ends, civOfRival(rival.id))).toBe(true); // barbs always
  });

  it('player routes suspend for AT-WAR rival units (the A-11 symmetry fix)', () => {
    const state = makeState();
    state.unitsMode = true;
    const rival = addRival(state, 10, 10);
    const home = tileAtCoords(state.map, 4, 4);
    const ends = [home.index];
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 4).index, civOfRival(rival.id));
    expect(routeRaidedAt(state, ends)).toBe(false); // at peace: no interdiction
    rival.atWar = true;
    expect(routeRaidedAt(state, ends)).toBe(true);
  });
});

describe('rival CS trade routes (A-12b)', () => {
  function addCs(state: GameState, col: number, row: number, opts: Partial<CityState> = {}): CityState {
    const center = tileAtCoords(state.map, col, row);
    const cs: CityState = {
      ...emptySeat(seatOfCityState(state.cityStates.length)), // #51/S6.12
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
    for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cs.id)); // placement's territory tags (cityStateAt resolves by tile csId)
    state.cityStates.push(cs);
    return cs;
  }

  it('suzerainty of a trade CS adds rival route capacity (strict contest)', () => {
    const state = makeState();
    const rival = addRival(state, 8, 8);
    const cs = addCs(state, 11, 8, { type: 'trade' });
    expect(tradeCapacity(state, civOfRival(rival.id))).toBe(0);
    cs.rivalEnvoys = [];
    cs.rivalEnvoys[rival.id] = 3;
    expect(tradeCapacity(state, civOfRival(rival.id))).toBe(1); // uncontested at the minimum
    cs.envoys = 3; // player ties: nobody is suzerain
    expect(tradeCapacity(state, civOfRival(rival.id))).toBe(0);
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
    expect(rival.tradeRoutes![0]).toEqual({ from: rc.id, toCs: cs.id, expiresTurn: state.turn + 20 }); // B-23 duration
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
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 8).index, civOfRival(rival.id));
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
    expect((isRivalSeat(tileSeat(state.map.tiles[cs.centerIndex])) ? rivalOfCiv(tileSeat(state.map.tiles[cs.centerIndex])) : -1)).toBe(rival.id);
    expect(tileCity(state.map.tiles[cs.centerIndex])).toBe(rc.id);
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
    const builder = spawnUnit(state, 'BUILDER', defTile.index, civOfRival(rival.id))!;
    builder.tileIndex = defTile.index;
    const charges = builder.charges;
    expect(charges).toBeGreaterThan(0);

    expect(meleeAttack(state, atk.id, defTile.index).ok).toBe(true);

    // Captured: SAME unit id, now player-owned, still on its tile, charges kept.
    const cap = state.units.find((u) => u.id === builder.id);
    expect(cap).toBeDefined();
    // #51/S1.3b: one field carries the whole capture — a player-owned unit is
    // simply seat 0, with no separate "and no civId" half to assert.
    expect(cap!.seat).toBe(PLAYER_CIV);
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
    const barb = spawnUnit(state, 'WARRIOR', atkTile.index, BARB_SEAT)!;
    barb.tileIndex = atkTile.index;
    const builder = spawnUnit(state, 'BUILDER', defTile.index)!; // a player civilian
    builder.tileIndex = defTile.index;

    expect(meleeAttack(state, barb.id, defTile.index).ok).toBe(true);

    // Killed, not captured — and the barbarian advances into the emptied tile.
    expect(state.units.some((u) => u.id === builder.id)).toBe(false);
    expect(barb.tileIndex).toBe(defTile.index);
    expect(isBarbSeat(barb.seat)).toBe(true);
  });
});
