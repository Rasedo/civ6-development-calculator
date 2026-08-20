import { describe, it, expect } from 'vitest';
import { BUILT_WONDERS } from '../../../cpu/data/builtWonders';
import { makeMap, makeState, tileAtCoords, expandBorders } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { seatOf } from '../../../cpu/core/seats';
import { computeCityStats, computeHousing, seatTourism } from '../../../cpu/core/city';
import { greatPersonPointsPerTurn } from '../../../cpu/core/greatPeople';
import { wonderExtraSlots } from '../../../cpu/core/effects';
import { terrainDefense } from '../../../cpu/core/combat';
import { seatWonderSum, seatWonderFlag } from '../../../cpu/core/wonders';
import { addEraScore } from '../../../cpu/core/eras';
import type { City, GameState } from '../../../cpu/core/types';

/** Stand a COMPLETE wonder on a tile of `city`, the way completeQueueItem does. */
function stand(state: GameState, city: City, id: string, col: number, row: number): number {
  const t = tileAtCoords(state.map, col, row);
  t.builtWonder = id;
  t.builtWonderComplete = true;
  city.wonders.push({ id, tileIndex: t.index });
  return t.index;
}

function oneCity(): { state: GameState; city: City } {
  const state = makeState(makeMap(16, 16));
  foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
  const city = seatOf(state, 0)!.cities[0];
  expandBorders(state, city, 3);
  return { state, city };
}

describe('wonder effects, sourced', () => {
  it('the effect table matches the Civilopedia rows it was fetched from', () => {
    // CIV6: Alhambra "+2 Amenities, +2 Great General points per turn, +1
    // Military policy slot"; Mont St. Michel grants every Apostle MARTYR;
    // Big Ben "Gold in treasury is increased by 50%" (GS).
    expect(BUILT_WONDERS.ALHAMBRA.effects?.cityAmenities).toBe(2);
    expect(BUILT_WONDERS.ALHAMBRA.effects?.gpPoints?.GENERAL).toBe(2);
    expect(BUILT_WONDERS.ALHAMBRA.effects?.extraSlots?.military).toBe(1);
    expect(BUILT_WONDERS.MONT_ST_MICHEL.effects?.apostleMartyr).toBe(true);
    expect(BUILT_WONDERS.BIG_BEN.effects?.treasuryMult).toBe(1.5);
    expect(BUILT_WONDERS.BIG_BEN.effects?.gpPoints?.MERCHANT).toBe(3);
    expect(BUILT_WONDERS.HERMITAGE.effects?.gpPoints?.ARTIST).toBe(3);
    expect(BUILT_WONDERS.BOLSHOI_THEATRE.effects?.gpPoints).toEqual({ WRITER: 2, MUSICIAN: 2 });
    expect(BUILT_WONDERS.OXFORD_UNIVERSITY.effects?.cityYieldMult?.science).toBe(1.2);
    expect(BUILT_WONDERS.COLOSSEUM.effects?.regionalAmenities).toBe(3);
    expect(BUILT_WONDERS.POTALA_PALACE.cityYields).toEqual({ culture: 2, faith: 3 });
    expect(BUILT_WONDERS.UNIVERSITY_OF_SANKORE.cityYields?.science).toBe(3);
  });

  it('the invented yields are gone — a row pays only what its page lists', () => {
    // Each of these carried a yield the real wonder does not pay, standing in
    // for an effect no channel could express.
    expect(BUILT_WONDERS.ETEMENANKI.cityYields?.faith).toBeUndefined();
    expect(BUILT_WONDERS.GREAT_BATH.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.APADANA.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.MAUSOLEUM_AT_HALICARNASSUS.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.ST_BASILS_CATHEDRAL.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.TAJ_MAHAL.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.STATUE_OF_LIBERTY.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.HERMITAGE.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.BOLSHOI_THEATRE.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.VENETIAN_ARSENAL.cityYields).toBeUndefined();
    expect(BUILT_WONDERS.BIG_BEN.effects?.cityYieldMult).toBeUndefined();
    expect(BUILT_WONDERS.OXFORD_UNIVERSITY.cityYields).toBeUndefined();
  });

  it('per-turn Great Person points are the owner’s, district or not', () => {
    const { state, city } = oneCity();
    expect(greatPersonPointsPerTurn(state, 0).ARTIST).toBe(0);
    stand(state, city, 'HERMITAGE', 9, 8);
    // no Theater Square anywhere, so the district term is still 0
    expect(greatPersonPointsPerTurn(state, 0).ARTIST).toBe(3);
    stand(state, city, 'BOLSHOI_THEATRE', 10, 8);
    const pts = greatPersonPointsPerTurn(state, 0);
    expect(pts.WRITER).toBe(2);
    expect(pts.MUSICIAN).toBe(2);
    expect(pts.ARTIST).toBe(3);
  });

  it('an INCOMPLETE wonder pays nothing', () => {
    const { state, city } = oneCity();
    const t = stand(state, city, 'HERMITAGE', 9, 8);
    state.map.tiles[t].builtWonderComplete = false;
    expect(greatPersonPointsPerTurn(state, 0).ARTIST).toBe(0);
    expect(seatWonderSum(state, 0, 'cityHousing')).toBe(0);
  });

  it('housing and amenities land on the HOLDING city only', () => {
    const { state, city } = oneCity();
    const before = computeHousing(state, city);
    stand(state, city, 'GREAT_BATH', 9, 8);
    // computeHousing is the water/district/building half; the wonder term
    // joins in computeCityStats, which is what a citizen actually sees.
    expect(computeHousing(state, city)).toBe(before);
    expect(computeCityStats(state, city).housing).toBe(before + 3);
    const amen = computeCityStats(state, city).amenities.have;
    foundCity(state, tileAtCoords(state.map, 2, 2).index, 0);
    const other = seatOf(state, 0)!.cities[1];
    expect(computeCityStats(state, other).amenities.have).toBeLessThan(amen);
  });

  it('policy slots are counted by KIND', () => {
    const { state, city } = oneCity();
    expect(wonderExtraSlots(state, 0)).toEqual({ military: 0, economic: 0, diplomatic: 0, wildcard: 0 });
    stand(state, city, 'ALHAMBRA', 9, 8);
    stand(state, city, 'BIG_BEN', 10, 8);
    stand(state, city, 'POTALA_PALACE', 7, 8);
    stand(state, city, 'FORBIDDEN_CITY', 8, 7);
    expect(wonderExtraSlots(state, 0)).toEqual({ military: 1, economic: 1, diplomatic: 1, wildcard: 1 });
  });

  it('a wonder that names a terrain pays its yields on the city’s own tiles', () => {
    const { state, city } = oneCity();
    for (const t of state.map.tiles) if (t.index !== city.centerIndex) t.terrain = 'TUNDRA';
    const before = computeCityStats(state, city).breakdown.tiles;
    stand(state, city, 'ST_BASILS_CATHEDRAL', 9, 8);
    const after = computeCityStats(state, city).breakdown.tiles;
    // every worked non-district tundra tile pays +1 food, +1 production, +1 culture
    expect(after.food).toBeGreaterThan(before.food);
    expect(after.production).toBeGreaterThan(before.production);
    expect(after.culture).toBeGreaterThan(before.culture);
    expect(after.food - before.food).toBe(after.culture - before.culture);
  });

  it('Petra rides the same channel it used to have to itself', () => {
    expect(BUILT_WONDERS.PETRA.effects?.tileYields).toEqual([
      { terrain: 'DESERT', excludeFeature: 'FLOODPLAINS', yields: { food: 2, gold: 2, production: 1 } },
    ]);
    const { state, city } = oneCity();
    for (const t of state.map.tiles) if (t.index !== city.centerIndex) t.terrain = 'DESERT';
    const before = computeCityStats(state, city).breakdown.tiles;
    stand(state, city, 'PETRA', 9, 8);
    const after = computeCityStats(state, city).breakdown.tiles;
    expect(after.gold - before.gold).toBe(after.food - before.food);
    expect(after.production - before.production).toBe((after.food - before.food) / 2);
  });

  it('the occupying unit’s tile defends it', () => {
    const { state, city } = oneCity();
    const bare = tileAtCoords(state.map, 9, 8);
    expect(terrainDefense(bare)).toBe(0);
    stand(state, city, 'MONT_ST_MICHEL', 9, 8);
    expect(terrainDefense(bare)).toBe(6);
    bare.builtWonderComplete = false;
    expect(terrainDefense(bare)).toBe(0);
  });

  it('Mont St. Michel makes every Apostle a Martyr', () => {
    const { state, city } = oneCity();
    expect(seatWonderFlag(state, 0, 'apostleMartyr')).toBe(false);
    stand(state, city, 'MONT_ST_MICHEL', 9, 8);
    expect(seatWonderFlag(state, 0, 'apostleMartyr')).toBe(true);
    expect(seatWonderFlag(state, 1, 'apostleMartyr')).toBe(false);
  });

  it('the Taj Mahal pays for moments worth 2 or more, and only those', () => {
    const { state, city } = oneCity();
    const seat = seatOf(state, 0)!;
    seat.eraScore = 0;
    addEraScore(state, 0, 3);
    addEraScore(state, 0, 1);
    expect(seat.eraScore).toBe(4);
    stand(state, city, 'TAJ_MAHAL', 9, 8);
    seat.eraScore = 0;
    addEraScore(state, 0, 3); // a 3-point moment -> 3 + 1
    addEraScore(state, 0, 1); // a 1-point moment -> 1, no bonus
    expect(seat.eraScore).toBe(5);
    seat.eraScore = 0;
    addEraScore(state, 0, 2, 3); // three 2-point moments -> 6 + 3
    expect(seat.eraScore).toBe(9);
  });

  it('St. Basil’s doubles the relic tourism of its own city, Cristo the resorts', () => {
    // A standing wonder pays its own tourism too, so the control stands a
    // wonder with NO multiplier and the difference is the relics'.
    const ctrl = oneCity();
    ctrl.city.relics = 2;
    stand(ctrl.state, ctrl.city, 'TAJ_MAHAL', 9, 8);
    const plain = seatTourism(ctrl.state, 0);

    const { state, city } = oneCity();
    city.relics = 2;
    stand(state, city, 'ST_BASILS_CATHEDRAL', 9, 8);
    expect(seatTourism(state, 0) - plain).toBe(2 * 8); // the relic term, paid twice over
    expect(BUILT_WONDERS.CRISTO_REDENTOR.effects?.resortTourismMult).toBe(2);
  });

  it('the Statue of Liberty keeps a city in range at full loyalty', () => {
    expect(BUILT_WONDERS.STATUE_OF_LIBERTY.effects?.loyaltyAura).toBe(6);
    expect(BUILT_WONDERS.STATUE_OF_LIBERTY.effects?.dvp).toBe(4);
  });
});
