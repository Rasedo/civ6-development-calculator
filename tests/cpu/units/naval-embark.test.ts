import { describe, it, expect, afterEach } from 'vitest';
import { emptySeat, isCiv, seatOf, setTileOwner, setWar, tileCity } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs } from '../helpers';
import { purchaseUnit } from '../../../cpu/core/game';
import { moveCostInto, unitPassable, canEmbark, waterEnterable, ownerHasTech, inEnemyZoc, spawnUnit, tileFreeForUnit, cityNavalCapable, trainableUnits, queueUnit, orderMove, walkPath } from '../../../cpu/core/units';
import { hostileUnitAct, meleeAttack, defenderCS } from '../../../cpu/core/combat';
import { neighbors } from '../../../world/hex';
import { isWater } from '../../../world/query';
import { EMBARKED_DEFENSE_CS, setEmbarkLive } from '../../../cpu/data/constants';
import type { GameState, City, Seat, Unit } from '../../../cpu/core/types';

// the MOVEMENT + EMBARKATION model. The scripted civ war-march is
// the only v1 surface that may take water steps, and it is behind the inert
// `embarkState.live` master switch (default OFF → gates byte-identical). These
// tests poke the switch ON to exercise the water-step path directly.

afterEach(() => setEmbarkLive(false)); // never leak the switch into other suites

function addCivAtWar(state: GameState, col: number, row: number, techs: string[]): Seat {
  const civ: Seat = {
    ...emptySeat(state.seats.length),
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
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [...techs], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
  };
  // A minimal off-map "home" so the civ is a real civ; the war-march targets
  // the SEAT-0 city, so no other civ city geometry is needed here.
  state.seats.push(civ);
  setWar(state, civ.seat, 0, true);
  const tile = tileAtCoords(state.map, col, row);
  spawnUnit(state, 'WARRIOR', tile.index, civ.seat)!;
  return civ;
}

describe('movement primitives', () => {
  it('water tiles enter at cost 1; land units are land-only, terrain-passable', () => {
    const map = makeMap(12, 12, 'GRASSLAND');
    const land = tileAtCoords(map, 5, 5);
    const water = tileAtCoords(map, 6, 5);
    water.terrain = 'COAST';
    expect(moveCostInto(water, water)).toBe(1);
    // land plane: a land unit (WARRIOR) stands on land, never on water
    const warrior = { type: 'WARRIOR' };
    expect(unitPassable(land, warrior)).toBe(true);
    expect(unitPassable(water, warrior)).toBe(false);
    // an impassable land tile blocks
    land.elevation = 'MOUNTAIN';
    expect(unitPassable(land, warrior)).toBe(false);
  });

  it('canEmbark reads the OWNER tech by unit domain (military=SHIPBUILDING, civilian=SAILING)', () => {
    const state = makeState(makeMap(12, 12));
    const civ = addCivAtWar(state, 3, 3, []);
    const warrior = state.units.find((u) => isCiv(u.seat))!;
    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 3, 4).index, civ.seat)!;
    // no naval techs yet
    expect(canEmbark(state, warrior)).toBe(false);
    expect(canEmbark(state, builder)).toBe(false);
    // civilian embarks on SAILING; military still needs SHIPBUILDING
    civ.research.techs.push('SAILING');
    expect(canEmbark(state, builder)).toBe(true);
    expect(canEmbark(state, warrior)).toBe(false);
    civ.research.techs.push('SHIPBUILDING');
    expect(canEmbark(state, warrior)).toBe(true);
  });

  it('OCEAN needs CARTOGRAPHY to enter; COAST/LAKE do not', () => {
    const state = makeState(makeMap(12, 12));
    const civ = addCivAtWar(state, 3, 3, ['SAILING', 'SHIPBUILDING']);
    const warrior = state.units.find((u) => isCiv(u.seat))!;
    const coast = tileAtCoords(state.map, 5, 5);
    coast.terrain = 'COAST';
    const ocean = tileAtCoords(state.map, 6, 5);
    ocean.terrain = 'OCEAN';
    expect(waterEnterable(state, coast, warrior)).toBe(true);
    expect(waterEnterable(state, ocean, warrior)).toBe(false);
    civ.research.techs.push('CARTOGRAPHY');
    expect(ownerHasTech(state, warrior, 'CARTOGRAPHY')).toBe(true);
    expect(waterEnterable(state, ocean, warrior)).toBe(true);
  });

  it('embarked units do NOT exert ZOC (they still obey)', () => {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    addCivAtWar(state, 5, 5, []);
    const exerter = state.units.find((u) => isCiv(u.seat))!;
    const mover: Unit = { id: 999, type: 'WARRIOR', seat: 0, tileIndex: tileAtCoords(state.map, 6, 5).index, movesLeft: 2, hp: 100, charges: null, path: null };
    // the mover belongs to seat 0; a hostile civ military adjacent exerts ZOC
    expect(inEnemyZoc(state, mover.tileIndex, mover)).toBe(true);
    // once that civ is EMBARKED it exerts nothing
    exerter.embarked = true;
    expect(inEnemyZoc(state, mover.tileIndex, mover)).toBe(false);
  });
});

describe('spawn stays ashore', () => {
  it('a land unit never spawns on water', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    // island: one land tile surrounded by water
    const island = tileAtCoords(state.map, 5, 5);
    island.terrain = 'GRASSLAND';
    const u = spawnUnit(state, 'WARRIOR', island.index, 0)!;
    expect(u).toBeTruthy();
    expect(isWater(state.map.tiles[u.tileIndex])).toBe(false);
    expect(u.tileIndex).toBe(island.index);
  });
});

describe('war-march water steps (behind the inert live switch)', () => {
  function marchScenario(techs: string[]): { state: GameState; unit: Unit } {
    // Almost-all-water map: unit start + seat-0 city are the only land, so the
    // strictly-closer march step is always a water tile (forces an embark).
    const state = makeState(makeMap(14, 12, 'COAST'));
    state.unitsMode = true;
    const start = tileAtCoords(state.map, 3, 5);
    start.terrain = 'GRASSLAND';
    const cityTile = tileAtCoords(state.map, 10, 5);
    cityTile.terrain = 'GRASSLAND';
    settleAt(state, cityTile.index); // the march target; founding consumes the spawned settler
    addCivAtWar(state, 3, 5, techs);
    const unit = state.units.find((u) => u.seat === 1)!;
    return { state, unit };
  }

  it('LIVE + SHIPBUILDING: the war-march embarks (all MP spent, now on water)', () => {
    setEmbarkLive(true);
    const { state, unit } = marchScenario(['SAILING', 'SHIPBUILDING']);
    expect(isWater(state.map.tiles[unit.tileIndex])).toBe(false); // starts ashore
    hostileUnitAct(state, unit);
    expect(unit.embarked).toBe(true);
    expect(isWater(state.map.tiles[unit.tileIndex])).toBe(true);
    expect(unit.movesLeft).toBe(0); // embark consumed all MP
  });

  // A CLIFF closes the embark edge for the WAR-MARCH, not just for the
  // ordinary walker. Both engines must mask it out of the march's step set, or
  // one embarks over a cliff where the other holds.
  it('LIVE + SHIPBUILDING but CLIFFED: the war-march stays ashore', () => {
    setEmbarkLive(true);
    const { state, unit } = marchScenario(['SAILING', 'SHIPBUILDING']);
    const start = state.map.tiles[unit.tileIndex];
    start.cliffMask = 0b111111; // wall every land/water edge of the start tile
    hostileUnitAct(state, unit);
    expect(unit.embarked).toBeFalsy();
    expect(isWater(state.map.tiles[unit.tileIndex])).toBe(false);
    expect(unit.tileIndex).toBe(start.index); // no legal step remained
  });

  it('LIVE but NO SHIPBUILDING: the unit cannot embark and stays ashore', () => {
    setEmbarkLive(true);
    const { state, unit } = marchScenario(['SAILING']); // civilian tech only
    const before = unit.tileIndex;
    hostileUnitAct(state, unit);
    expect(!!unit.embarked).toBe(false);
    expect(unit.tileIndex).toBe(before); // no land-or-water step available
  });

  it('SWITCH OFF: even with SHIPBUILDING the war-march stays land-only', () => {
    setEmbarkLive(false);
    const { state, unit } = marchScenario(['SAILING', 'SHIPBUILDING']);
    const before = unit.tileIndex;
    hostileUnitAct(state, unit);
    expect(!!unit.embarked).toBe(false);
    expect(unit.tileIndex).toBe(before);
  });

  it('tileFreeForUnit gates embark on allowEmbark + owner tech', () => {
    const { state, unit } = marchScenario(['SAILING', 'SHIPBUILDING']);
    const water = tileAtCoords(state.map, 4, 5); // COAST, adjacent, free
    expect(tileFreeForUnit(state, water.index, 0, unit, false)).toBe(false); // land-only by default
    expect(tileFreeForUnit(state, water.index, 0, unit, true)).toBe(true); // embark allowed
  });
});

// --- N2: naval units, production gating, embarked/naval combat --------------

function bareCiv(state: GameState, atWar = true): Seat {
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Carthage',
    color: '#2d8',
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
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
  };
  state.seats.push(civ);
  setWar(state, civ.seat, 0, atWar);
  return civ;
}

describe('N2 production gating', () => {
  it('naval units build ONLY in a naval-capable city (coastal center or Harbor)', () => {
    const state = makeState(makeMap(16, 12, 'GRASSLAND'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    // coastal city: a water tile adjacent to the center
    const coastCenter = tileAtCoords(state.map, 4, 5);
    tileAtCoords(state.map, 5, 5).terrain = 'COAST';
    const coastCity = settleAt(state, coastCenter.index);
    expect(cityNavalCapable(state, coastCity)).toBe(true);
    expect(trainableUnits(state, 0, coastCity).some((d) => d.id === 'GALLEY')).toBe(true);
    expect(queueUnit(state, coastCity.id, 'GALLEY', 0).ok).toBe(true);

    // inland city: no water neighbor, no completed Harbor
    const inlandCenter = tileAtCoords(state.map, 11, 5);
    const inlandCity = settleAt(state, inlandCenter.index);
    expect(cityNavalCapable(state, inlandCity)).toBe(false);
    expect(trainableUnits(state, 0, inlandCity).some((d) => d.id === 'GALLEY')).toBe(false);
    expect(queueUnit(state, inlandCity.id, 'GALLEY', 0).ok).toBe(false);
    // purchase is gated the same way
    seatOf(state, 0)!.treasury = 100000;
    expect(purchaseUnit(state, inlandCity.id, 'GALLEY', 0).ok).toBe(false);
    expect(purchaseUnit(state, coastCity.id, 'GALLEY', 0).ok).toBe(true);
  });

  it('a completed Harbor makes an otherwise-inland city naval-capable', () => {
    const state = makeState(makeMap(16, 12, 'GRASSLAND'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const center = tileAtCoords(state.map, 6, 5);
    const city = settleAt(state, center.index);
    expect(cityNavalCapable(state, city)).toBe(false);
    // a completed Harbor district (its tile stays land here — the capability
    // gate reads the district, not the tile's water)
    const hTile = tileAtCoords(state.map, 7, 5);
    hTile.district = 'HARBOR';
    hTile.districtComplete = true;
    city.districts.push({ type: 'HARBOR', tileIndex: hTile.index });
    expect(cityNavalCapable(state, city)).toBe(true);
  });
});

describe('N2 naval spawn + combat', () => {
  it('a naval unit spawns on the nearest free WATER tile', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const center = tileAtCoords(state.map, 5, 5);
    const water = tileAtCoords(state.map, 6, 5);
    water.terrain = 'COAST';
    const galley = spawnUnit(state, 'GALLEY', center.index, 0)!;
    expect(galley).toBeTruthy();
    expect(isWater(state.map.tiles[galley.tileIndex])).toBe(true);
    expect(galley.embarked).toBeFalsy(); // naval units are never "embarked"
  });

  it('an embarked defender uses the flat CS — no terrain/fortify/support', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    const civ = bareCiv(state);
    const water = tileAtCoords(state.map, 5, 5);
    // construct the embarked unit directly (the map is all water — a land unit
    // cannot spawnUnit here) with a fortify counter that must be IGNORED.
    const embarked: Unit = {
      id: state.nextUnitId++, type: 'WARRIOR', seat: civ.seat,
      tileIndex: water.index, movesLeft: 2, hp: 100, charges: null, path: null,
      embarked: true, fortifyTurns: 2,
    };
    state.units.push(embarked);
    expect(defenderCS(state, embarked, water.index)).toBe(EMBARKED_DEFENSE_CS);
    // wounded embarked: flat CS minus the linear wound penalty
    embarked.hp = 50;
    expect(defenderCS(state, embarked, water.index)).toBe(EMBARKED_DEFENSE_CS - 5);
    // grounded, it fights at full strength (override gone: combat 20 > 10)
    embarked.hp = 100;
    embarked.embarked = false;
    expect(defenderCS(state, embarked, water.index)).toBeGreaterThan(EMBARKED_DEFENSE_CS);
  });

  it('capturing an embarked civilian KEEPS it embarked and appends it pool-end', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.unitsMode = true;
    const civ = bareCiv(state);
    // a land tile for the seat-0 warrior, an adjacent water tile for the embarked builder
    const warriorTile = tileAtCoords(state.map, 5, 5);
    const builderTile = neighbors(state.map, warriorTile)[0];
    builderTile.terrain = 'COAST';
    const warrior = spawnUnit(state, 'WARRIOR', warriorTile.index, 0)!;
    const builder = spawnUnit(state, 'BUILDER', warriorTile.index, civ.seat)!;
    builder.tileIndex = builderTile.index; // embarked civilian on the water tile
    builder.embarked = true;
    // add another seat-0 unit AFTER the builder so pool-end is observable
    const tail = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 9).index, 0)!;
    const res = meleeAttack(state, warrior.id, builderTile.index, 0);
    expect(res.ok).toBe(true);
    expect((builder.seat) === 0).toBe(true);
    expect(builder.embarked).toBe(true); // KEEPS embarked under the new owner
    // pool-end: the captured unit is the LAST entry in state.units
    expect(state.units[state.units.length - 1].id).toBe(builder.id);
    expect(state.units.indexOf(builder)).toBeGreaterThan(state.units.indexOf(tail));
  });

  it('a naval unit attacks a coastal civ city through the existing path', () => {
    const state = makeState(makeMap(14, 12, 'COAST'));
    state.unitsMode = true;
    const civ = bareCiv(state);
    const civCityCenter = tileAtCoords(state.map, 8, 5);
    civCityCenter.terrain = 'GRASSLAND';
    setTileOwner(civCityCenter, civ.seat, tileCity(civCityCenter));
    const civCity: City = {
      id: 0,
      name: 'Utica',
      seat: 2,
      centerIndex: civCityCenter.index,
      population: 5,
      foodBox: 0,
      cultureBox: 0,
      tilesAcquired: 0,
      lockedTiles: [],
      focus: 'balanced',
      queue: [],
      isCapital: true,
      buildings: [],
      districts: [{ type: 'CITY_CENTER', tileIndex: civCityCenter.index }],
      wonders: [],
      hp: 200,
      foundedTurn: 1,
    };
    civ.cities.push(civCity);
    // a galley on a water tile adjacent to the foreign city center
    const waterAdj = neighbors(state.map, civCityCenter).find((n) => isWater(n))!;
    const galley = spawnUnit(state, 'GALLEY', waterAdj.index, 0)!;
    expect(galley.tileIndex).toBe(waterAdj.index);
    const before = civCity.hp;
    const res = meleeAttack(state, galley.id, civCityCenter.index, 0);
    expect(res.ok).toBe(true);
    expect(civCity.hp).toBeLessThan(before); // the ship battered the coastal city
  });

  it('a SEAT-0 galley MOVES across water (findPath naval) then attacks a coastal city', () => {
    // The GPU RL/controlled head cannot order a ship's water move yet (that is
    // a residual — its move-apply reads the land plane); TS findPath/
    // walkPath ARE naval-aware, so the seat-0 naval MOVE end-to-end lives here.
    const state = makeState(makeMap(14, 12, 'COAST')); // all-water map
    state.unitsMode = true;
    const civ = bareCiv(state);
    const civCityCenter = tileAtCoords(state.map, 9, 5);
    civCityCenter.terrain = 'GRASSLAND';
    setTileOwner(civCityCenter, civ.seat, tileCity(civCityCenter));
    const civCity: City = {
      id: 0,
      name: 'Kart-Hadasht',
      seat: 2,
      centerIndex: civCityCenter.index,
      population: 5,
      foodBox: 0,
      cultureBox: 0,
      tilesAcquired: 0,
      lockedTiles: [],
      focus: 'balanced',
      queue: [],
      isCapital: true,
      buildings: [],
      districts: [{ type: 'CITY_CENTER', tileIndex: civCityCenter.index }],
      wonders: [],
      hp: 200,
      foundedTurn: 1,
    };
    civ.cities.push(civCity);
    // spawn the galley on OPEN WATER several tiles from the city
    const galley = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 4, 5).index, 0)!;
    expect(isWater(state.map.tiles[galley.tileIndex])).toBe(true);
    const startIdx = galley.tileIndex;
    const waterAdj = neighbors(state.map, civCityCenter).find((n) => isWater(n))!;
    // order the sea move; walk it home over a few turns' MP (naval routing)
    const mv = orderMove(state, galley.id, waterAdj.index);
    expect(mv.ok).toBe(true);
    expect(galley.tileIndex).not.toBe(startIdx); // the ship actually sailed
    for (let t = 0; t < 8 && galley.tileIndex !== waterAdj.index; t++) {
      galley.movesLeft = 3; // GALLEY moves
      walkPath(state, galley);
    }
    expect(galley.tileIndex).toBe(waterAdj.index);
    expect(isWater(state.map.tiles[galley.tileIndex])).toBe(true); // arrived, still afloat
    expect(galley.embarked).toBeFalsy(); // a naval unit is never embarked
    // and it batters the coastal city from the sea it just crossed
    const before = civCity.hp;
    const atk = meleeAttack(state, galley.id, civCityCenter.index, 0);
    expect(atk.ok).toBe(true);
    expect(civCity.hp).toBeLessThan(before);
  });
});
