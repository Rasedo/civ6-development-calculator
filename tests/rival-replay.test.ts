/** #70 THE FILE IS THE INTERFACE, TypeScript half.
 *
 * `gpu/drive.py` records a driven seat's decisions as mask COLUMNS and
 * `gpu/drive.replay` proves a replay reproduces a GPU run exactly. For the
 * transcription in `rivals.ts` to be DELETED rather than merely duplicated, this
 * engine has to reach the same state from the same file.
 *
 * These tests pin the contract: given a record, `rivalPhase` applies it and does
 * NOT run its own ladder. The column layout comes from `src/core/prodLayout.ts`,
 * which the exporter also imports — one derivation, so the file format cannot
 * rot the way the rival mask rotted five units behind the picker (#85).
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { rivalPhase } from '../src/core/rivals';
import { prodLayout } from '../src/core/prodLayout';
import { civOfRival, rivalCount, isPlayerSeat, tileSeat, cityStateOfSeat, isCityStateSeat, setTileOwner, emptySeat } from '../src/core/seats';
import { tilesWithin, neighbors } from '../src/core/hex';
import { spawnUnit } from '../src/core/units';
import { isWater, isImpassable } from '../src/core/query';
import { BUILDINGS } from '../src/data/buildings';
import { SCAFFOLD_DISTRICTS } from '../src/data/districts';
import type { GameState, RivalCity, RivalCiv } from '../src/core/types';

function addRival(state: GameState, col: number, row: number): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    ...emptySeat(civOfRival(rivalCount(state))),
    id: rivalCount(state),
    name: 'Rome', color: '#8e3db8', aggression: 0.5, seat: 1, warmonger: 0,
    ww: {}, wwTurn: {}, diploFavor: 0, diploPoints: 0, influencePoints: 0,
    envoysAvailable: 0, treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0,
    tourism: 0, government: { current: null, policies: [] }, cities: [], nextCityId: 0,
    atWar: false, warTurns: 0, peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {}, gpEarned: [], settlers: 0, buildersTrained: 0, bestMeleeCS: 0,
    tilesPurchased: 0, spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
  };
  const city: RivalCity = {
    id: rival.nextCityId++, name: 'Roma', seat: rival.id + 1, centerIndex: tile.index,
    population: 5, foodBox: 0, cultureBox: 0, tilesAcquired: 0, lockedTiles: [],
    focus: 'balanced', queue: [], isCapital: true, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [],
    specialists: {}, hp: 200, foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civOfRival(rival.id), city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (!isPlayerSeat(tileSeat(t)) && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civOfRival(rival.id), city.id);
    }
  }
  rival.cities.push(city);
  state.seats.push(rival);
  return rival;
}

describe('#70 the action FILE drives the TS rival', () => {
  it('applies the recorded SETTLER column instead of deciding', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const rival = addRival(state, 6, 6);
    const L = prodLayout();
    state.rivalActions = { [state.turn - 1]: { [rival.id]: { production: [L.settlerCol], tech: null, civic: null, units: [] } } };
    rivalPhase(state);
    expect(rival.cities[0].queue[0]?.kind).toBe('settler');
  });

  it('applies a recorded BUILDING column — the exact row the file names', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const rival = addRival(state, 6, 6);
    const L = prodLayout();
    const col = 0;
    state.rivalActions = { [state.turn - 1]: { [rival.id]: { production: [col], tech: null, civic: null, units: [] } } };
    rivalPhase(state);
    const q = rival.cities[0].queue[0];
    expect(q?.kind).toBe('building');
    expect(q?.kind === 'building' && q.building).toBe(L.buildings[col]);
    expect(BUILDINGS[L.buildings[col]]).toBeDefined();
  });

  it('applies a recorded UNIT column', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const rival = addRival(state, 6, 6);
    const L = prodLayout();
    const ui = L.units.indexOf('WARRIOR');
    state.rivalActions = { [state.turn - 1]: { [rival.id]: { production: [L.unitLo + ui], tech: null, civic: null, units: [] } } };
    rivalPhase(state);
    const q = rival.cities[0].queue[0];
    expect(q?.kind).toBe('unit');
    expect(q?.kind === 'unit' && q.unit).toBe('WARRIOR');
  });

  it('IDLE queues nothing, and the ladder does not step in behind it', () => {
    // The load-bearing case. If the record were merely a hint and the ladder ran
    // anyway, this city would end up with whatever the transcription picked —
    // and the file would not be the interface at all.
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const rival = addRival(state, 6, 6);
    const L = prodLayout();
    state.rivalActions = { [state.turn - 1]: { [rival.id]: { production: [L.idleCol], tech: null, civic: null, units: [] } } };
    rivalPhase(state);
    expect(rival.cities[0].queue.length).toBe(0);
  });

  it('applies a recorded DISTRICT column, running the placement scan', () => {
    // The file names the TYPE; the engine still finds the tile. A tile index in
    // the record would be DERIVED state, and the schema carries decisions only.
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const rival = addRival(state, 6, 6);
    rival.research.techs.push('BRONZE_WORKING', 'MINING', 'ASTROLOGY', 'WRITING', 'POTTERY');
    rival.research.civics.push('CODE_OF_LAWS', 'FOREIGN_TRADE');
    const L = prodLayout();
    const si = SCAFFOLD_DISTRICTS.findIndex((d) => d.id === 'CAMPUS');
    expect(si).toBeGreaterThanOrEqual(0);
    state.rivalActions = { [state.turn - 1]: { [rival.id]: { production: [L.districtLo + si], tech: null, civic: null, units: [] } } };
    rivalPhase(state);
    const q = rival.cities[0].queue[0];
    expect(q?.kind).toBe('district');
    expect(q?.kind === 'district' && q.district).toBe('CAMPUS');
  });

  it('replays recorded UNIT MOVE orders, one entry per step', () => {
    // #90 made a unit's order a direction SEQUENCE, so the record holds one row
    // per step and a faithful replay walks them in order. This asserts the unit
    // actually MOVED — a replay that accepted the rows and moved nothing would
    // leave driven rivals parked while the GPU's walked, and parity would blame
    // something else entirely.
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    state.unitsMode = true;
    const rival = addRival(state, 6, 6);
    const spawned = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index, civOfRival(rival.id));
    expect(spawned).toBeTruthy();
    const before = spawned!.tileIndex;
    const nb = neighbors(state.map, state.map.tiles[before]);
    const dir = nb.findIndex((t) => t && !isImpassable(t) && !isWater(t));
    expect(dir).toBeGreaterThanOrEqual(0);
    state.rivalActions = { [state.turn - 1]: { [rival.id]: { production: [-1], tech: null, civic: null, units: [[dir]] } } };
    rivalPhase(state);
    const after = state.units.find((u) => u.id === spawned!.id);
    expect(after).toBeTruthy();
    expect(after!.tileIndex).not.toBe(before);
  });

  it('a seat with NO record still runs the ladder (the paths coexist)', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const rival = addRival(state, 6, 6);
    state.rivalActions = { [state.turn - 1]: {} };   // record present, this seat absent
    rivalPhase(state);
    expect(rival.cities[0].queue.length).toBeGreaterThan(0);
  });
});
