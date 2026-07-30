import { describe, it, expect, afterEach } from 'vitest';
import { makeMap, makeState, tileAtCoords, grantTechs } from './helpers';
import { foundCity, purchaseUnit } from '../src/core/game';
import {
  moveCostInto,
  unitPassable,
  canEmbark,
  waterEnterable,
  ownerHasTech,
  inEnemyZoc,
  spawnUnit,
  tileFreeForUnit,
  cityNavalCapable,
  trainableUnits,
  queueUnit,
  orderMove,
  walkPath,
} from '../src/core/units';
import { hostileUnitAct, meleeAttack, defenderCS } from '../src/core/combat';
import { neighbors } from '../src/core/hex';
import { isWater } from '../src/core/query';
import { EMBARKED_DEFENSE_CS, setEmbarkLive } from '../src/data/constants';
import type { GameState, RivalCity, RivalCiv, Unit } from '../src/core/types';

// #45/B-6 N1: the MOVEMENT + EMBARKATION model. The scripted rival war-march is
// the only v1 surface that may take water steps, and it is behind the inert
// `embarkState.live` master switch (default OFF → gates byte-identical). These
// tests poke the switch ON to exercise the water-step path directly.

afterEach(() => setEmbarkLive(false)); // never leak the switch into other suites

function addWarRival(state: GameState, col: number, row: number, techs: string[]): RivalCiv {
  const rival: RivalCiv = {
    id: state.rivals.length,
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
    cities: [],
    nextCityId: 0,
    atWar: true,
    warTurns: 5,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [...techs], civics: [], boosted: [] },
    gpp: {},
    pantheonClaimed: true,
    religionFounded: true,
  };
  // A minimal off-map "home" so the rival is a real civ; the war-march targets
  // the PLAYER city, so no rival city geometry is needed here.
  state.rivals.push(rival);
  const tile = tileAtCoords(state.map, col, row);
  spawnUnit(state, 'WARRIOR', tile.index, 'rival', rival.id)!;
  return rival;
}

describe('#45/B-6 movement primitives', () => {
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
    const rival = addWarRival(state, 3, 3, []);
    const warrior = state.units.find((u) => u.owner === 'rival')!;
    const builder = spawnUnit(state, 'BUILDER', tileAtCoords(state.map, 3, 4).index, 'rival', rival.id)!;
    // no naval techs yet
    expect(canEmbark(state, warrior)).toBe(false);
    expect(canEmbark(state, builder)).toBe(false);
    // civilian embarks on SAILING; military still needs SHIPBUILDING
    rival.research.techs.push('SAILING');
    expect(canEmbark(state, builder)).toBe(true);
    expect(canEmbark(state, warrior)).toBe(false);
    rival.research.techs.push('SHIPBUILDING');
    expect(canEmbark(state, warrior)).toBe(true);
  });

  it('OCEAN needs CARTOGRAPHY to enter; COAST/LAKE do not', () => {
    const state = makeState(makeMap(12, 12));
    const rival = addWarRival(state, 3, 3, ['SAILING', 'SHIPBUILDING']);
    const warrior = state.units.find((u) => u.owner === 'rival')!;
    const coast = tileAtCoords(state.map, 5, 5);
    coast.terrain = 'COAST';
    const ocean = tileAtCoords(state.map, 6, 5);
    ocean.terrain = 'OCEAN';
    expect(waterEnterable(state, coast, warrior)).toBe(true);
    expect(waterEnterable(state, ocean, warrior)).toBe(false);
    rival.research.techs.push('CARTOGRAPHY');
    expect(ownerHasTech(state, warrior, 'CARTOGRAPHY')).toBe(true);
    expect(waterEnterable(state, ocean, warrior)).toBe(true);
  });

  it('embarked units do NOT exert ZOC (they still obey)', () => {
    const state = makeState(makeMap(12, 12));
    state.unitsMode = true;
    addWarRival(state, 5, 5, []);
    const exerter = state.units.find((u) => u.owner === 'rival')!;
    const player: Unit = { id: 999, type: 'WARRIOR', owner: 'player', tileIndex: tileAtCoords(state.map, 6, 5).index, movesLeft: 2, hp: 100, charges: null, path: null };
    // the mover is the player; a hostile rival military adjacent exerts ZOC
    expect(inEnemyZoc(state, player.tileIndex, player)).toBe(true);
    // once that rival is EMBARKED it exerts nothing
    exerter.embarked = true;
    expect(inEnemyZoc(state, player.tileIndex, player)).toBe(false);
  });
});

describe('#45/B-6 spawn stays ashore', () => {
  it('a land unit never spawns on water', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    // island: one land tile surrounded by water
    const island = tileAtCoords(state.map, 5, 5);
    island.terrain = 'GRASSLAND';
    const u = spawnUnit(state, 'WARRIOR', island.index, 'player')!;
    expect(u).toBeTruthy();
    expect(isWater(state.map.tiles[u.tileIndex])).toBe(false);
    expect(u.tileIndex).toBe(island.index);
  });
});

describe('#45/B-6 war-march water steps (behind the inert live switch)', () => {
  function marchScenario(techs: string[]): { state: GameState; unit: Unit } {
    // Almost-all-water map: unit start + player city are the only land, so the
    // strictly-closer march step is always a water tile (forces an embark).
    const state = makeState(makeMap(14, 12, 'COAST'));
    state.unitsMode = true;
    const start = tileAtCoords(state.map, 3, 5);
    start.terrain = 'GRASSLAND';
    const cityTile = tileAtCoords(state.map, 10, 5);
    cityTile.terrain = 'GRASSLAND';
    foundCity(state, cityTile.index);
    addWarRival(state, 3, 5, techs);
    const unit = state.units.find((u) => u.owner === 'rival')!;
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

  // B-26 (#79) REGRESSION: a CLIFF closes the embark edge for the WAR-MARCH,
  // not just for the player's walkPath. The GPU's _rival_unit_war_act had
  // always masked cliffs out of step_ok while TS had not, so a rival musketman
  // embarked over a cliff on TS only — the off-script divergence at seed 9015
  // t198 (TS moved 360->316 onto water, the GPU held). Scripted parity never
  // saw it; only the rollout put a rival on a cliff edge.
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
    expect(tileFreeForUnit(state, water.index, unit, false)).toBe(false); // land-only by default
    expect(tileFreeForUnit(state, water.index, unit, true)).toBe(true); // embark allowed
  });
});

// --- N2: naval units, production gating, embarked/naval combat --------------

function bareRival(state: GameState, atWar = true): RivalCiv {
  const rival: RivalCiv = {
    id: state.rivals.length,
    name: 'Carthage',
    color: '#2d8',
    aggression: 0.5,
    seat: 1,
    warmonger: 0,
    warWeariness: 0,
    diploFavor: 0,
    diploPoints: 0,
    influencePoints: 0,
    envoysAvailable: 0,
    cities: [],
    nextCityId: 0,
    atWar,
    warTurns: 5,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    pantheonClaimed: true,
    religionFounded: true,
    bestMeleeCS: 0,
  };
  state.rivals.push(rival);
  return rival;
}

describe('#45/B-6 N2 production gating', () => {
  it('naval units build ONLY in a naval-capable city (coastal center or Harbor)', () => {
    const state = makeState(makeMap(16, 12, 'GRASSLAND'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    // coastal city: a water tile adjacent to the center
    const coastCenter = tileAtCoords(state.map, 4, 5);
    tileAtCoords(state.map, 5, 5).terrain = 'COAST';
    foundCity(state, coastCenter.index);
    const coastCity = state.cities[0];
    expect(cityNavalCapable(state, coastCity)).toBe(true);
    expect(trainableUnits(state, coastCity).some((d) => d.id === 'GALLEY')).toBe(true);
    expect(queueUnit(state, coastCity.id, 'GALLEY').ok).toBe(true);

    // inland city: no water neighbor, no completed Harbor
    state.settlers = 1;
    const inlandCenter = tileAtCoords(state.map, 11, 5);
    foundCity(state, inlandCenter.index);
    const inlandCity = state.cities[1];
    expect(cityNavalCapable(state, inlandCity)).toBe(false);
    expect(trainableUnits(state, inlandCity).some((d) => d.id === 'GALLEY')).toBe(false);
    expect(queueUnit(state, inlandCity.id, 'GALLEY').ok).toBe(false);
    // purchase is gated the same way
    state.treasury = 100000;
    expect(purchaseUnit(state, inlandCity.id, 'GALLEY').ok).toBe(false);
    expect(purchaseUnit(state, coastCity.id, 'GALLEY').ok).toBe(true);
  });

  it('a completed Harbor makes an otherwise-inland city naval-capable', () => {
    const state = makeState(makeMap(16, 12, 'GRASSLAND'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const center = tileAtCoords(state.map, 6, 5);
    foundCity(state, center.index);
    const city = state.cities[0];
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

describe('#45/B-6 N2 naval spawn + combat', () => {
  it('a naval unit spawns on the nearest free WATER tile', () => {
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.unitsMode = true;
    grantTechs(state, 'SAILING');
    const center = tileAtCoords(state.map, 5, 5);
    const water = tileAtCoords(state.map, 6, 5);
    water.terrain = 'COAST';
    const galley = spawnUnit(state, 'GALLEY', center.index, 'player')!;
    expect(galley).toBeTruthy();
    expect(isWater(state.map.tiles[galley.tileIndex])).toBe(true);
    expect(galley.embarked).toBeFalsy(); // naval units are never "embarked"
  });

  it('an embarked defender uses the flat CS — no terrain/fortify/support', () => {
    const state = makeState(makeMap(12, 12, 'COAST'));
    state.unitsMode = true;
    const rival = bareRival(state);
    const water = tileAtCoords(state.map, 5, 5);
    // construct the embarked unit directly (the map is all water — a land unit
    // cannot spawnUnit here) with a fortify counter that must be IGNORED.
    const embarked: Unit = {
      id: state.nextUnitId++, type: 'WARRIOR', owner: 'rival', civId: rival.id,
      tileIndex: water.index, movesLeft: 2, hp: 100, charges: null, path: null,
      embarked: true, fortifyTurns: 2,
    };
    state.units.push(embarked);
    expect(defenderCS(state, embarked, water.index)).toBe(EMBARKED_DEFENSE_CS);
    // wounded embarked: flat CS minus the linear wound penalty (B-29)
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
    const rival = bareRival(state);
    // a land tile for the player warrior, an adjacent water tile for the embarked builder
    const warriorTile = tileAtCoords(state.map, 5, 5);
    const builderTile = neighbors(state.map, warriorTile)[0];
    builderTile.terrain = 'COAST';
    const warrior = spawnUnit(state, 'WARRIOR', warriorTile.index, 'player')!;
    const builder = spawnUnit(state, 'BUILDER', warriorTile.index, 'rival', rival.id)!;
    builder.tileIndex = builderTile.index; // embarked civilian on the water tile
    builder.embarked = true;
    // add another player unit AFTER the builder so pool-end is observable
    const tail = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 9, 9).index, 'player')!;
    const res = meleeAttack(state, warrior.id, builderTile.index);
    expect(res.ok).toBe(true);
    expect(builder.owner).toBe('player');
    expect(builder.embarked).toBe(true); // KEEPS embarked under the new owner
    // pool-end: the captured unit is the LAST entry in state.units
    expect(state.units[state.units.length - 1].id).toBe(builder.id);
    expect(state.units.indexOf(builder)).toBeGreaterThan(state.units.indexOf(tail));
  });

  it('a naval unit attacks a coastal rival city through the existing path', () => {
    const state = makeState(makeMap(14, 12, 'COAST'));
    state.unitsMode = true;
    const rival = bareRival(state);
    const rcCenter = tileAtCoords(state.map, 8, 5);
    rcCenter.terrain = 'GRASSLAND';
    rcCenter.rivalId = rival.id;
    const rc: RivalCity = {
      id: 0,
      name: 'Utica',
      civId: 1,
      centerIndex: rcCenter.index,
      population: 5,
      foodBox: 0,
      cultureBox: 0,
      tilesAcquired: 0,
      lockedTiles: [],
      focus: 'balanced',
      queue: [],
      isCapital: true,
      buildings: [],
      districts: [{ type: 'CITY_CENTER', tileIndex: rcCenter.index }],
      wonders: [],
      specialists: {},
      hp: 200,
      foundedTurn: 1,
    };
    rival.cities.push(rc);
    // a galley on a water tile adjacent to the rival city center
    const waterAdj = neighbors(state.map, rcCenter).find((n) => isWater(n))!;
    const galley = spawnUnit(state, 'GALLEY', waterAdj.index, 'player')!;
    expect(galley.tileIndex).toBe(waterAdj.index);
    const before = rc.hp;
    const res = meleeAttack(state, galley.id, rcCenter.index);
    expect(res.ok).toBe(true);
    expect(rc.hp).toBeLessThan(before); // the ship battered the coastal city
  });

  it('a PLAYER galley MOVES across water (findPath naval) then attacks a coastal city', () => {
    // The GPU RL/controlled head cannot order a ship's water move yet (that is
    // the #50 residual — its move-apply reads the land plane); TS findPath/
    // walkPath ARE naval-aware, so the player-naval MOVE end-to-end lives here.
    const state = makeState(makeMap(14, 12, 'COAST')); // all-water map
    state.unitsMode = true;
    const rival = bareRival(state);
    const rcCenter = tileAtCoords(state.map, 9, 5);
    rcCenter.terrain = 'GRASSLAND';
    rcCenter.rivalId = rival.id;
    const rc: RivalCity = {
      id: 0,
      name: 'Kart-Hadasht',
      civId: 1,
      centerIndex: rcCenter.index,
      population: 5,
      foodBox: 0,
      cultureBox: 0,
      tilesAcquired: 0,
      lockedTiles: [],
      focus: 'balanced',
      queue: [],
      isCapital: true,
      buildings: [],
      districts: [{ type: 'CITY_CENTER', tileIndex: rcCenter.index }],
      wonders: [],
      specialists: {},
      hp: 200,
      foundedTurn: 1,
    };
    rival.cities.push(rc);
    // spawn the galley on OPEN WATER several tiles from the city
    const galley = spawnUnit(state, 'GALLEY', tileAtCoords(state.map, 4, 5).index, 'player')!;
    expect(isWater(state.map.tiles[galley.tileIndex])).toBe(true);
    const startIdx = galley.tileIndex;
    const waterAdj = neighbors(state.map, rcCenter).find((n) => isWater(n))!;
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
    const before = rc.hp;
    const atk = meleeAttack(state, galley.id, rcCenter.index);
    expect(atk.ok).toBe(true);
    expect(rc.hp).toBeLessThan(before);
  });
});
