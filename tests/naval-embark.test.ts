import { describe, it, expect, afterEach } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { foundCity } from '../src/core/game';
import {
  moveCostInto,
  unitPassable,
  canEmbark,
  waterEnterable,
  ownerHasTech,
  inEnemyZoc,
  spawnUnit,
  tileFreeForUnit,
} from '../src/core/units';
import { hostileUnitAct } from '../src/core/combat';
import { isWater } from '../src/core/query';
import { setEmbarkLive } from '../src/data/constants';
import type { GameState, RivalCiv, Unit } from '../src/core/types';

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
  const unit = spawnUnit(state, 'WARRIOR', tile.index, 'rival', rival.id)!;
  return rival;
}

describe('#45/B-6 movement primitives', () => {
  it('water tiles enter at cost 1; land units are land-only, terrain-passable', () => {
    const map = makeMap(12, 12, 'GRASSLAND');
    const land = tileAtCoords(map, 5, 5);
    const water = tileAtCoords(map, 6, 5);
    water.terrain = 'COAST';
    expect(moveCostInto(water)).toBe(1);
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
    const rival = addWarRival(state, 5, 5, []);
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
    const rival = addWarRival(state, 3, 5, techs);
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
