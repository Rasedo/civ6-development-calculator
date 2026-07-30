import { describe, it, expect } from 'vitest';
import { makeState, tileAtCoords } from './helpers';
import { transferRivalCityToRival } from '../src/core/rivals';
import { tilesWithin } from '../src/core/hex';
import type { GameState, RivalCity, RivalCiv } from '../src/core/types';

// B-20 (#79). A city that changes hands must carry its GREAT WORKS and RELICS
// to the new owner: in real Civ 6 the victor gains control of the Great Works
// held in a captured city's buildings/districts/wonders, and the buildings that
// hold them (Amphitheater / Museum / Temple) are exactly what B-30 already
// keeps on the flip.
//
// The bug this pins: `transferRivalCityToRival` builds the receiving city from
// a hand-written object literal. B-30 taught that literal to keep districts,
// buildings and wonders; B-20 added the four work counts LATER and never came
// back, so every rc->rc flip silently destroyed them. It cost a 2.85 rGScore
// divergence in seed 9235 that scripted parity could not see.

function addRival(state: GameState, col: number, row: number, name: string): RivalCiv {
  const tile = tileAtCoords(state.map, col, row);
  const rival: RivalCiv = {
    id: state.rivals.length,
    name,
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
    atWar: false,
    warTurns: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] },
    gpp: {},
    pantheonClaimed: true,
    religionFounded: true,
  } as RivalCiv;
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: name + ' Prime',
    civId: rival.id + 1,
    centerIndex: tile.index,
    population: 6,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: ['TEMPLE'],
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

describe('B-20 (#79): great works and relics ride a city transfer', () => {
  it('a flipped rival city carries its relic and great works to the new owner', () => {
    const state = makeState();
    const from = addRival(state, 4, 4, 'Rome');
    const to = addRival(state, 9, 9, 'Greece');
    const rc = from.cities[0];
    rc.relics = 1;
    rc.greatWorksWriting = 2;
    rc.greatWorksArt = 3;
    rc.greatWorksMusic = 1;

    transferRivalCityToRival(state, from, to, rc);

    expect(from.cities).toHaveLength(0);
    expect(to.cities).toHaveLength(2);
    const flipped = to.cities[to.cities.length - 1];
    expect(flipped.relics).toBe(1);
    expect(flipped.greatWorksWriting).toBe(2);
    expect(flipped.greatWorksArt).toBe(3);
    expect(flipped.greatWorksMusic).toBe(1);
    // the Temple that houses the relic must come with it, or the carried count
    // would be unhousable — B-30 keeps buildings minus PALACE
    expect(flipped.buildings).toContain('TEMPLE');
  });

  it('a city with no works transfers zero, not undefined-as-garbage', () => {
    const state = makeState();
    const from = addRival(state, 4, 4, 'Rome');
    const to = addRival(state, 9, 9, 'Greece');
    const rc = from.cities[0];

    transferRivalCityToRival(state, from, to, rc);

    const flipped = to.cities[to.cities.length - 1];
    expect(flipped.relics ?? 0).toBe(0);
    expect(flipped.greatWorksArt ?? 0).toBe(0);
  });
});
