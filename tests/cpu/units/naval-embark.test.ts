import { describe, it, expect, afterEach } from 'vitest';
import { emptySeat, isCiv, seatOf, setTileOwner, setWar, tileCity } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs } from '../helpers';
import { MP_SCALE } from '../../../cpu/data/constants';
import { purchaseUnit } from '../../../cpu/core/game';
import { moveCostInto, unitPassable, canEmbark, stepUnit, waterEnterable, ownerHasTech, inEnemyZoc, spawnUnit, tileFreeForUnit, cityNavalCapable, trainableUnits, queueUnit, orderMove, walkPath, unitFullMoves, unitVisibleTo, visibleHostilesAt } from '../../../cpu/core/units';
import { hostileUnitAct, meleeAttack, rangedAttack, attackTargets, defenderCS, embarkedDefenseCS, supportCount, encircled, stackDefender, AMPHIBIOUS_ATTACK_CS, SUPPORT_CS, FLANK_SUPPORT_CIVIC } from '../../../cpu/core/combat';
import { neighbors, hexDistance } from '../../../world/hex';
import { unitSight, SIGHT_RANGE } from '../../../cpu/core/fog';
import { UNITS } from '../../../cpu/data/units';
import { isWater } from '../../../world/query';
import { EMBARKED_DEFENSE_CS_BY_ERA, setEmbarkLive, EMBARK_MOVES, SEA_MOVE_TECH, SEA_MOVE_TECH_BONUS } from '../../../cpu/data/constants';
import type { GameState, City, Seat, Tile, Unit } from '../../../cpu/core/types';

// the MOVEMENT + EMBARKATION model. Every water step on both engines rides the
// `embarkState.live` master switch, which SHIPS ON; the tests below poke it OFF
// to prove the land-only fallback still holds.

afterEach(() => setEmbarkLive(true)); // restore the shipped default

function addCivAtWar(state: GameState, col: number, row: number, techs: string[]): Seat {
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome',
    color: '#8e3db8',
    aggression: 0.5,
    seat: 1,
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
    projectsDone: [],
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
  it('water tiles enter at a flat point; land units are land-only, terrain-passable', () => {
    const map = makeMap(12, 12, 'GRASSLAND');
    const land = tileAtCoords(map, 5, 5);
    const water = tileAtCoords(map, 6, 5);
    water.terrain = 'COAST';
    expect(moveCostInto(makeState(map), water, water)).toBe(MP_SCALE);
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
    const mover: Unit = { id: 999, type: 'WARRIOR', seat: 0, tileIndex: tileAtCoords(state.map, 6, 5).index, movesLeft: 2 * MP_SCALE, hp: 100, charges: null, path: null };
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
    projectsDone: [],
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
      tileIndex: water.index, movesLeft: 2 * MP_SCALE, hp: 100, charges: null, path: null,
      embarked: true, fortifyTurns: 2,
    };
    state.units.push(embarked);
    const flat = embarkedDefenseCS(state, civ.seat);
    expect(flat).toBe(EMBARKED_DEFENSE_CS_BY_ERA[0]);
    expect(defenderCS(state, embarked, water.index)).toBe(flat);
    // wounded embarked: flat CS minus the linear wound penalty
    embarked.hp = 50;
    expect(defenderCS(state, embarked, water.index)).toBe(flat - 5);
    // CIV6: the flat CS "depends on the owner's current technological era ...
    // and is updated upon discovery of the first technology or civic of that
    // era" — one Renaissance civic doubles what this transport defends at.
    embarked.hp = 100;
    civ.research.civics.push('EXPLORATION');
    expect(embarkedDefenseCS(state, civ.seat)).toBe(EMBARKED_DEFENSE_CS_BY_ERA[3]);
    expect(defenderCS(state, embarked, water.index)).toBe(EMBARKED_DEFENSE_CS_BY_ERA[3]);
    // grounded, the override is gone: the unit's own 20 plus the two turns of
    // fortification the flat CS was ignoring
    embarked.embarked = false;
    expect(defenderCS(state, embarked, water.index)).toBe(20 + 6);
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
      galley.movesLeft = 3 * MP_SCALE; // GALLEY moves
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


// --- the AMPHIBIOUS ATTACK ---------------------------------------------------

describe('the amphibious attack', () => {
  /** an all-water map with ONE land tile, a seat-0 warrior on it, and the civ's
   *  warrior embarked on the water tile next door. */
  function shore(): { state: GameState; att: Unit; def: Unit; land: Tile; sea: Tile; civ: Seat } {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    const civ = bareCiv(state);
    const land = tileAtCoords(state.map, 5, 5);
    land.terrain = 'GRASSLAND';
    const def = spawnUnit(state, 'WARRIOR', land.index, 0)!;
    const sea = neighbors(state.map, land).find((n) => isWater(n))!;
    const att: Unit = {
      id: state.nextUnitId++, type: 'WARRIOR', seat: civ.seat,
      tileIndex: sea.index, movesLeft: 2 * MP_SCALE, hp: 100, charges: null, path: null,
      embarked: true,
    };
    state.units.push(att);
    return { state, att, def, land, sea, civ };
  }

  it('an embarked melee unit strikes the shore, at the amphibious penalty', () => {
    expect(AMPHIBIOUS_ATTACK_CS).toBe(10);
    const wet = shore();
    expect(attackTargets(wet.state, wet.att)).toContain(wet.land.index);
    const r = meleeAttack(wet.state, wet.att.id, wet.land.index, wet.civ.seat);
    expect(r.ok).toBe(true);
    const amphibious = 100 - wet.def.hp;
    expect(amphibious).toBeGreaterThan(0);

    // the SAME exchange from dry land: one identical map, one identical RNG
    // stream, the attacker ashore instead of afloat.
    const dry = shore();
    dry.att.embarked = false;
    dry.att.tileIndex = dry.sea.index;
    dry.sea.terrain = 'GRASSLAND';
    const r2 = meleeAttack(dry.state, dry.att.id, dry.land.index, dry.civ.seat);
    expect(r2.ok).toBe(true);
    expect(100 - dry.def.hp).toBeGreaterThan(amphibious);
  });

  it('the victor comes ashore and is no longer embarked', () => {
    const { state, att, def, land, civ } = shore();
    def.hp = 1;
    const r = meleeAttack(state, att.id, land.index, civ.seat);
    expect(r.ok).toBe(true);
    expect(state.units.some((u) => u.id === def.id)).toBe(false);
    expect(att.tileIndex).toBe(land.index);
    expect(att.embarked).toBe(false);
  });

  it('a CLIFF closes the shore entirely', () => {
    const { state, att, def, land, civ } = shore();
    land.cliffMask = 0b111111;
    expect(attackTargets(state, att)).not.toContain(land.index);
    const r = meleeAttack(state, att.id, land.index, civ.seat);
    expect(r.ok).toBe(false);
    expect(def.hp).toBe(100);
  });

  it('an embarked unit may not attack anything in the water', () => {
    const { state, att, sea, civ } = shore();
    const otherSea = neighbors(state.map, state.map.tiles[sea.index]).find(
      (n) => isWater(n) && n.index !== sea.index,
    )!;
    const afloat: Unit = {
      id: state.nextUnitId++, type: 'WARRIOR', seat: 0,
      tileIndex: otherSea.index, movesLeft: 2 * MP_SCALE, hp: 100, charges: null, path: null,
      embarked: true,
    };
    state.units.push(afloat);
    expect(attackTargets(state, att)).not.toContain(otherSea.index);
    expect(meleeAttack(state, att.id, otherSea.index, civ.seat).ok).toBe(false);
    expect(afloat.hp).toBe(100);
  });

  it('an embarked RANGED unit has no attack at all', () => {
    const { state, att, land } = shore();
    att.type = 'ARCHER';
    expect(attackTargets(state, att)).toEqual([]);
    expect(attackTargets(state, att)).not.toContain(land.index);
  });

  it('an embarked defender keeps its escort, except against a ship', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const civ = bareCiv(state);
    civ.research.civics.push(FLANK_SUPPORT_CIVIC);
    const water = tileAtCoords(state.map, 5, 5);
    const afloat: Unit = {
      id: state.nextUnitId++, type: 'WARRIOR', seat: civ.seat,
      tileIndex: water.index, movesLeft: 2 * MP_SCALE, hp: 100, charges: null, path: null,
      embarked: true,
    };
    const escort: Unit = {
      id: state.nextUnitId++, type: 'WARRIOR', seat: civ.seat,
      tileIndex: neighbors(state.map, water)[0].index, movesLeft: 2 * MP_SCALE, hp: 100,
      charges: null, path: null, embarked: true,
    };
    state.units.push(afloat, escort);
    expect(supportCount(state, water.index, afloat)).toBe(1);

    const shore = tileAtCoords(state.map, 3, 3);
    shore.terrain = 'GRASSLAND';
    const soldier = spawnUnit(state, 'WARRIOR', shore.index, 0)!;
    const ship = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 8, 8).index, 0)!;
    const flat = embarkedDefenseCS(state, civ.seat);
    expect(defenderCS(state, afloat, water.index, { attacker: soldier, melee: true }))
      .toBe(flat + SUPPORT_CS);
    expect(defenderCS(state, afloat, water.index, { attacker: ship, melee: true })).toBe(flat);
    // a ranged attack ignores Support whoever fires it
    expect(defenderCS(state, afloat, water.index, { attacker: soldier, melee: false })).toBe(flat);
  });

  it('a REEF defends the ship standing on it', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const bare = tileAtCoords(state.map, 5, 5);
    const reef = tileAtCoords(state.map, 7, 7);
    reef.feature = 'REEF';
    const ship = spawnUnit(state, 'GALLEY', bare.index, 0)!;
    const open = defenderCS(state, ship, bare.index);
    ship.tileIndex = reef.index;
    expect(defenderCS(state, ship, reef.index)).toBe(open + 3);
  });
});

describe('embarked and sea movement climb the tech ladder', () => {
  function afloat(state: GameState, techs: string[]): Unit {
    grantTechs(state, ...techs);
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    u.tileIndex = tileAtCoords(state.map, 6, 6).index;
    u.embarked = true;
    return u;
  }

  it('a passenger starts at EMBARK_MOVES and each embark tech adds its own', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    tileAtCoords(state.map, 5, 5).terrain = 'GRASSLAND';
    state.unitsMode = true;
    const u = afloat(state, []);
    expect(unitFullMoves(state, u)).toBe(MP_SCALE * EMBARK_MOVES);
    grantTechs(state, 'SQUARE_RIGGING');
    expect(unitFullMoves(state, u)).toBe(MP_SCALE * (EMBARK_MOVES + 1));
    grantTechs(state, 'STEAM_POWER');
    expect(unitFullMoves(state, u)).toBe(MP_SCALE * (EMBARK_MOVES + 3));
    grantTechs(state, 'COMBUSTION');
    expect(unitFullMoves(state, u)).toBe(MP_SCALE * (EMBARK_MOVES + 4));
  });

  it('the sea-movement tech lifts a ship and a passenger alike, once', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    tileAtCoords(state.map, 5, 5).terrain = 'GRASSLAND';
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const ship = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 8, 8).index, 0)!;
    const hull = UNITS.GALLEY.moves;
    expect(unitFullMoves(state, ship)).toBe(MP_SCALE * hull);
    const u = afloat(state, []);
    expect(unitFullMoves(state, u)).toBe(MP_SCALE * EMBARK_MOVES);
    grantTechs(state, SEA_MOVE_TECH);
    expect(unitFullMoves(state, ship)).toBe(MP_SCALE * (hull + SEA_MOVE_TECH_BONUS));
    expect(unitFullMoves(state, u)).toBe(MP_SCALE * (EMBARK_MOVES + SEA_MOVE_TECH_BONUS));
    // a LAND unit ashore gains nothing from it
    const walker = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 5, 5).index, 0)!;
    expect(unitFullMoves(state, walker)).toBe(MP_SCALE * UNITS.WARRIOR.moves);
  });
});

describe('the naval raider is invisible', () => {
  /** seat 0's watcher and the rival's raider, `dist` hexes apart. */
  function scene(watcher: string, dist: number): { state: GameState; eye: Unit; raider: Unit } {
    const state = makeState(makeMap(16, 16, 'COAST'));
    state.unitsMode = true;
    state.turn = 40;
    const civ = addCivAtWar(state, 15, 0, []); // its WARRIOR sits in the far corner
    const home = tileAtCoords(state.map, 5, 5);
    if (watcher === 'SCOUT') home.terrain = 'GRASSLAND';
    const eye = spawnUnit(state, watcher, home.index, 0)!;
    eye.tileIndex = home.index;
    const spot = state.map.tiles.find(
      (t) => isWater(t) && hexDistance(home.col, home.row, t.col, t.row) === dist,
    )!;
    const raider = spawnUnit(state, 'PRIVATEER', spot.index, civ.seat)!;
    raider.tileIndex = spot.index;
    return { state, eye, raider };
  }

  it('two hexes from every enemy eye, a Privateer is nothing a seat can act on', () => {
    const { state, raider } = scene('FRIGATE', 2);
    expect(unitVisibleTo(state, raider, 0)).toBe(false);
    expect(visibleHostilesAt(state, raider.tileIndex, { seat: 0 })).toEqual([]);
  });

  it('an ADJACENT enemy unit sees it, and can then swing at it', () => {
    const { state, eye, raider } = scene('IRONCLAD', 1);
    expect(unitVisibleTo(state, raider, 0)).toBe(true);
    expect(visibleHostilesAt(state, raider.tileIndex, { seat: 0 })).toEqual([raider]);
    expect(attackTargets(state, eye)).toContain(raider.tileIndex);
  });

  it('Reveal Stealth reaches as far as the chassis sees', () => {
    const two = scene('SCOUT', 2);
    expect(unitSight(two.eye)).toBe(SIGHT_RANGE);
    expect(unitVisibleTo(two.state, two.raider, 0)).toBe(true);

    const three = scene('DESTROYER', 3);
    expect(unitSight(three.eye)).toBe(3);
    expect(unitVisibleTo(three.state, three.raider, 0)).toBe(true);

    const blind = scene('FRIGATE', 3);
    expect(unitVisibleTo(blind.state, blind.raider, 0)).toBe(false);
  });

  it('its own owner always sees it, and so does everyone once it fires', () => {
    const { state, eye, raider } = scene('FRIGATE', 2);
    expect(unitVisibleTo(state, raider, raider.seat)).toBe(true);
    expect(rangedAttack(state, raider.id, eye.tileIndex).ok).toBe(true);
    expect(raider.revealedTurn).toBe(state.turn);
    expect(unitVisibleTo(state, raider, 0)).toBe(true);
    state.turn += 1;
    expect(unitVisibleTo(state, raider, 0)).toBe(false);
  });
});

describe('the naval raider and the zone of control', () => {
  function pair(rival: string, mover: string): { state: GameState; mover: Unit; dest: Tile } {
    const state = makeState(makeMap(14, 14, 'COAST'));
    state.unitsMode = true;
    const civ = addCivAtWar(state, 13, 0, []);
    const post = tileAtCoords(state.map, 6, 6);
    const held = spawnUnit(state, rival, post.index, civ.seat)!;
    held.tileIndex = post.index;
    const dest = neighbors(state.map, post)[0];
    const m = spawnUnit(state, mover, tileAtCoords(state.map, 3, 3).index, 0)!;
    return { state, mover: m, dest };
  }

  it('a raider ignores enemy ZOC; an ordinary hull obeys it', () => {
    const plain = pair('FRIGATE', 'FRIGATE');
    expect(inEnemyZoc(plain.state, plain.dest.index, plain.mover)).toBe(true);
    const raider = pair('FRIGATE', 'PRIVATEER');
    expect(inEnemyZoc(raider.state, raider.dest.index, raider.mover)).toBe(false);
  });

  it('a submarine exerts none, so nothing it stands beside is halted', () => {
    const sub = pair('SUBMARINE', 'FRIGATE');
    expect(inEnemyZoc(sub.state, sub.dest.index, sub.mover)).toBe(false);
    // its Renaissance ancestor still exerts one: only the two submarines lose it
    const priv = pair('PRIVATEER', 'FRIGATE');
    expect(inEnemyZoc(priv.state, priv.dest.index, priv.mover)).toBe(true);
  });

  it('and a ring of submarines is no siege', () => {
    const state = makeState(makeMap(14, 14, 'COAST'));
    state.unitsMode = true;
    const civ = addCivAtWar(state, 13, 0, []);
    const centre = tileAtCoords(state.map, 6, 6);
    for (const n of neighbors(state.map, centre)) {
      const u = spawnUnit(state, 'FRIGATE', n.index, civ.seat)!;
      u.tileIndex = n.index;
    }
    expect(encircled(state, centre, 0)).toBe(true);
    for (const u of state.units) if (u.type === 'FRIGATE') u.type = 'SUBMARINE';
    expect(encircled(state, centre, 0)).toBe(false);
  });
});

describe('a hull and its passenger share the hex', () => {
  function stack(state: GameState, water: Tile, seat: number, hull: string): { hull: Unit; rider: Unit } {
    const h = spawnUnit(state, hull, water.index, seat)!;
    h.tileIndex = water.index;
    const rider: Unit = {
      id: state.nextUnitId++, type: 'WARRIOR', seat,
      tileIndex: water.index, movesLeft: 2 * MP_SCALE, hp: 100, charges: null, path: null, embarked: true,
    };
    state.units.push(rider);
    return { hull: h, rider };
  }

  it('a second hull is refused where a passenger is welcome', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING', 'SHIPBUILDING');
    const water = tileAtCoords(state.map, 5, 5);
    const { hull, rider } = stack(state, water, 0, 'GALLEY');
    expect(rider.tileIndex).toBe(hull.tileIndex);
    const other = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 9, 9).index, 0)!;
    expect(tileFreeForUnit(state, water.index, 0, other, true)).toBe(false);
  });

  it('a melee blow lands on the hull; a shot takes the higher chassis', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    const civ = addCivAtWar(state, 11, 0, ['SQUARE_RIGGING']); // a Renaissance passenger
    const water = tileAtCoords(state.map, 5, 5);
    const { hull, rider } = stack(state, water, civ.seat, 'QUADRIREME'); // combat 20
    const flat = embarkedDefenseCS(state, civ.seat);
    expect(flat).toBeGreaterThan(UNITS.QUADRIREME.combat);
    const both = [hull, rider];
    expect(stackDefender(state, both, false)).toBe(hull);
    expect(stackDefender(state, both, true)).toBe(rider);
    // a STRONGER hull answers the shot itself
    hull.type = 'IRONCLAD';
    expect(stackDefender(state, both, true)).toBe(hull);
  });
});

describe('the passage a hull has ashore, and the chassis water is ground to', () => {
  /** a land map with ONE water column down the middle, and the plot beside it
   *  ready to carry a district. */
  function shore() {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    for (let r = 0; r < 12; r++) tileAtCoords(state.map, 8, r).terrain = 'COAST';
    const dry = tileAtCoords(state.map, 4, 5);
    const wet = tileAtCoords(state.map, 8, 5);
    return { state, dry, wet };
  }

  it('a Canal is water to a hull and land to everyone else', () => {
    const { state, dry } = shore();
    const hull = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 8, 4).index, 0)!;
    // CIV6 (Canal): "Allows Naval units to pass through this tile."
    expect(unitPassable(dry, hull)).toBe(false);
    dry.district = 'CANAL';
    dry.districtComplete = true;
    expect(unitPassable(dry, hull)).toBe(true);
    expect(tileFreeForUnit(state, dry.index, 0, hull, true)).toBe(true);
    // ...and it costs a hull the WATER step, not the ground's schedule
    dry.elevation = 'HILLS';
    expect(moveCostInto(state, tileAtCoords(state.map, 4, 4), dry, hull)).toBe(MP_SCALE);
    dry.elevation = 'FLAT';
    // a pillaged district carries no effect, this one included
    dry.districtPillaged = true;
    expect(unitPassable(dry, hull)).toBe(false);
    dry.districtPillaged = false;
    // the ground is still LAND: a land unit stands on it, and no citizen or
    // city reads it as sea
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 5).index, 0)!;
    expect(unitPassable(dry, foot)).toBe(true);
    expect(isWater(dry)).toBe(false);
  });

  it('a Giant Death Robot walks the sea, unembarked and untaught', () => {
    const { state, wet } = shore();
    const seat = seatOf(state, 0)!;
    seat.research.techs = []; // no SAILING, no SHIPBUILDING, no CARTOGRAPHY
    const gdr = spawnUnit(state, 'GIANT_DEATH_ROBOT', tileAtCoords(state.map, 7, 5).index, 0)!;
    // CIV6 (Giant Death Robot): "Can move and fight in Ocean and Coast tiles
    // as it would on land."
    expect(canEmbark(state, gdr)).toBe(false);
    expect(unitPassable(wet, gdr)).toBe(true);
    expect(tileFreeForUnit(state, wet.index, 0, gdr, true)).toBe(true);
    const full = unitFullMoves(state, gdr);
    gdr.movesLeft = full;
    expect(stepUnit(state, gdr, wet)).toBe('moved');
    expect(gdr.tileIndex).toBe(wet.index);
    expect(gdr.embarked).toBeFalsy();          // it never transitions
    expect(unitFullMoves(state, gdr)).toBe(full); // so it keeps its own pool
    expect(full).toBe(MP_SCALE * UNITS.GIANT_DEATH_ROBOT.moves);
    // one plain point for the step, exactly as on land
    expect(gdr.movesLeft).toBe(full - MP_SCALE);
    // OCEAN asks it for no Cartography either
    wet.terrain = 'OCEAN';
    expect(unitPassable(wet, gdr)).toBe(true);
    expect(waterEnterable(state, wet, gdr)).toBe(false); // the tech gate it skips
  });
});
