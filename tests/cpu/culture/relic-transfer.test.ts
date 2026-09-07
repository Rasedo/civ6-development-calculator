import { describe, it, expect } from 'vitest';
import { tileSeat, isCityStateSeat, setTileOwner, cityStateOfSeat, emptySeat } from '../../../cpu/core/seats';
import { makeState, tileAtCoords } from '../helpers';
import { transferCity } from '../../../cpu/core/phase';
import { tilesWithin } from '../../../world/hex';
import type { GameState, City, Seat } from '../../../cpu/core/types';
import { holdWorks } from '../helpers';
import { GWO_MUSIC, GWO_RELIC, GWO_SCULPTURE, GWO_WRITING } from '../../../cpu/data/greatWorks';
import { gwCountObjs } from '../../../cpu/core/greatWorks';

// A city that changes hands must carry its GREAT WORKS and RELICS
// to the new owner: in real Civ 6 the victor gains control of the Great Works
// held in a captured city's buildings/districts/wonders, and the buildings that
// hold them (Amphitheater / Museum / Temple) are exactly what already
// keeps on the flip.
//
// WHAT THIS PINS: `transferCity` builds the receiving city from a hand-written
// object literal, so every field added to City must be added there too. A
// field that is missed is destroyed silently on every flip — no error, just a
// score that drifts.

function addCiv(state: GameState, col: number, row: number, name: string): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name,
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
    government: { current: null, policies: [], held: 0 },
    cities: [],
    nextCityId: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {},
    gpEarned: [],
    settlers: 0,
    buildersTrained: 0,
    bestMeleeCS: 0,
    tilesPurchased: 0,
    projectsDone: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
  } as Seat;
  const city: City = {
    id: civ.nextCityId++,
    name: name + ' Prime',
    seat: civ.seat,
    centerIndex: tile.index,
    population: 6,
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    focus: 'balanced',
    queue: [],
    isCapital: true,
    buildings: ['TEMPLE'],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }],
    wonders: [],
    hp: 200,
    foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civ.seat, city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  state.seats.push(civ);
  return civ;
}

describe('great works and relics ride a city transfer', () => {
  it('a flipped civ city carries its relic and great works to the new owner', () => {
    const state = makeState();
    const from = addCiv(state, 4, 4, 'Rome');
    const to = addCiv(state, 9, 9, 'Greece');
    const civCity = from.cities[0];
    holdWorks(civCity, GWO_RELIC, 1, { seat: from.seat });
    holdWorks(civCity, GWO_WRITING, 2, { maker: 4, seat: from.seat });
    holdWorks(civCity, GWO_SCULPTURE, 3, { maker: 2, seat: from.seat });
    holdWorks(civCity, GWO_MUSIC, 1, { maker: 1, seat: from.seat });
    const before = civCity.greatWorks!.map((w) => ({ ...w }));

    transferCity(state, from.seat, to, civCity, 'conquered');

    expect(from.cities).toHaveLength(0);
    expect(to.cities).toHaveLength(2);
    const flipped = to.cities[to.cities.length - 1];
    expect(gwCountObjs(flipped, [GWO_RELIC])).toBe(1);
    expect(gwCountObjs(flipped, [GWO_WRITING])).toBe(2);
    expect(gwCountObjs(flipped, [GWO_SCULPTURE])).toBe(3);
    expect(gwCountObjs(flipped, [GWO_MUSIC])).toBe(1);
    // slot for slot, maker and provenance intact, and not the same array
    expect(flipped.greatWorks).toEqual(before);
    expect(flipped.greatWorks).not.toBe(civCity.greatWorks);
    // the Temple that houses the relic must come with it, or the carried count
    // would be unhousable — keeps buildings minus PALACE
    expect(flipped.buildings).toContain('TEMPLE');
  });

  it('a city with no works transfers zero, not undefined-as-garbage', () => {
    const state = makeState();
    const from = addCiv(state, 4, 4, 'Rome');
    const to = addCiv(state, 9, 9, 'Greece');
    const civCity = from.cities[0];

    transferCity(state, from.seat, to, civCity, 'conquered');

    const flipped = to.cities[to.cities.length - 1];
    expect(flipped.greatWorks).toBeUndefined();
  });
});
