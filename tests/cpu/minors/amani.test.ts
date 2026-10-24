import { describe, it, expect } from 'vitest';
import { emptySeat, seatOf, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { tilesWithin } from '../../../world/hex';
import { governorPhase, governorsOf, minorGovernorEffects, neutralizeGovernor, governorClocks } from '../../../cpu/core/governors';
import { GOVERNORS, GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, GOV_ASSIGN_MINOR, promotionBitValue } from '../../../cpu/data/governors';
import { envoysHere, envoysOf, isSuzerain, minorLuxuries, resolveSuzerain, suzerainOf } from '../../../cpu/core/cityStates';
import { luxuryAmenities } from '../../../cpu/core/city';
import { SUZERAIN_ENVOYS } from '../../../cpu/data/cityStates';
import type { CityState, GameState } from '../../../cpu/core/types';

// CIV6 (Amani, the Diplomat): "Can be assigned to a City-state, where she acts
// as 2 Envoys" (Messenger: two envoys in the minor's store from her
// establishment until she leaves); "While established in a city-state, provides a copy
// of its Luxury resources to you" (Affluence); "While established in a
// city-state, doubles the number of Envoys you have there" (Puppeteer). She is
// the only governor the catalog sends abroad.

const AMANI = GOVERNOR_INDEX.AMANI;
const P_AFFLUENCE = GOVERNOR_PROMOTION_INDEX.AFFLUENCE!;
const P_PUPPETEER = GOVERNOR_PROMOTION_INDEX.PUPPETEER!;

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
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

function world() {
  const state = makeState(makeMap(24, 20));
  settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
  return state;
}

/** Appoint Amani by hand and post her — the phase's own choice is tested
 *  separately, and every ability check wants her already established. */
function post(state: GameState, cs: CityState, promotions = 0) {
  const g = governorsOf(seatOf(state, 0)!)[AMANI];
  g.appointed = true;
  g.minorId = cs.id;
  g.establishTurns = 0;
  g.promotions = promotions;
  return g;
}

describe('the governor at a city-state', () => {
  it('only Amani travels: the record posts her at a city-state, and no other governor', () => {
    expect(GOVERNORS.filter((g) => g.cityStates).map((g) => g.id)).toEqual(['AMANI']);
    const state = world();
    const far = addCs(state, 16, 14, { envoys: { 0: 4 } });
    const roster = governorsOf(seatOf(state, 0)!);
    for (const g of roster) g.appointed = true;
    const other = AMANI === 0 ? 1 : 0;
    governorPhase(state, 0, [[GOV_ASSIGN_MINOR, other, far.id], [GOV_ASSIGN_MINOR, AMANI, far.id]]);
    expect(roster[AMANI].minorId).toBe(far.id);
    expect(roster[AMANI].cityId).toBe(-1);       // she took no city
    // seated with the clock full, exactly as a city posting is
    expect(roster[AMANI].establishTurns).toBe(GOVERNORS[AMANI].establishTurns);
    expect(roster[other].minorId).toBe(-1);
  });

  it('an unestablished posting pays nothing, and the clock runs down abroad', () => {
    const state = world();
    const cs = addCs(state, 10, 10, { envoys: { 0: 1 } });
    const g = post(state, cs);
    g.establishTurns = 2;
    expect(minorGovernorEffects(state, 0, cs.id)).toEqual([]);
    expect(envoysHere(state, cs, 0)).toBe(1);
    governorClocks(state, 0);
    expect(g.establishTurns).toBe(1);
    governorClocks(state, 0);
    expect(g.establishTurns).toBe(0);
    // ...and now Messenger counts
    expect(envoysHere(state, cs, 0)).toBe(3);
  });

  it('Messenger brings two envoys to the store at her establishment, and takes them when she leaves', () => {
    const state = world();
    const cs = addCs(state, 10, 10, { envoys: { 0: 1 } });
    const g = post(state, cs);
    g.establishTurns = 1;
    expect(envoysOf(cs, 0)).toBe(1);
    governorClocks(state, 0);
    expect(envoysOf(cs, 0)).toBe(3);            // the store, 1 + her 2
    expect(envoysHere(state, cs, 0)).toBe(3);
    g.promotions = promotionBitValue(P_PUPPETEER);
    expect(envoysHere(state, cs, 0)).toBe(6);   // (1 + 2) doubled
    // and nowhere else
    const other = addCs(state, 16, 14, { envoys: { 0: 1 } });
    expect(envoysHere(state, other, 0)).toBe(1);
    // posted elsewhere, she takes her two back
    governorPhase(state, 0, [[GOV_ASSIGN_MINOR, AMANI, other.id]]);
    expect(envoysOf(cs, 0)).toBe(1);
    expect(envoysOf(other, 0)).toBe(1);         // not established there yet
  });

  it('her envoys win a suzerainty the ledger alone would not', () => {
    const state = world();
    state.seats.push(emptySeat(1));
    const cs = addCs(state, 10, 10, { envoys: { 0: 1, 1: 2 }, met: [0, 1] });
    resolveSuzerain(state, cs);
    expect(suzerainOf(cs)).toBe(-1);             // 2 leads but is under the bar
    expect(isSuzerain(state, cs, 0)).toBe(false);
    const g = post(state, cs);
    g.establishTurns = 1;
    governorClocks(state, 0);
    expect(envoysHere(state, cs, 0)).toBe(1 + 2);
    expect(isSuzerain(state, cs, 0)).toBe(true); // 3 >= the bar, and beats 2
    expect(suzerainOf(cs)).toBe(0);
    expect(SUZERAIN_ENVOYS).toBe(3);
  });

  it('Affluence copies the ground the minor stands on, and only while established', () => {
    const state = world();
    const cs = addCs(state, 10, 10);
    const lux = tileAtCoords(state.map, 10, 11);
    lux.resource = 'WINE';
    setTileOwner(lux, seatOfCityState(cs.id));
    expect(minorLuxuries(state, cs)).toEqual(['WINE']);
    const before = luxuryAmenities(state, 0).get(seatOf(state, 0)!.cities[0].id) ?? 0;
    const g = post(state, cs);
    expect(luxuryAmenities(state, 0).get(seatOf(state, 0)!.cities[0].id) ?? 0).toBe(before);
    g.promotions = promotionBitValue(P_AFFLUENCE);
    expect(luxuryAmenities(state, 0).get(seatOf(state, 0)!.cities[0].id) ?? 0).toBe(before + 1);
    // a neutralized governor leaves, and takes the copy with her
    neutralizeGovernor(state, 0, AMANI, 6);
    expect(g.minorId).toBe(-1);
    expect(luxuryAmenities(state, 0).get(seatOf(state, 0)!.cities[0].id) ?? 0).toBe(before);
  });

  it('a conquered minor sends her home', () => {
    const state = world();
    const cs = addCs(state, 10, 10, { envoys: { 0: 1 } });
    const g = post(state, cs);
    state.cityStates = state.cityStates.filter((m) => m.id !== cs.id);
    governorClocks(state, 0);
    expect(g.minorId).toBe(-1);
    expect(g.establishTurns).toBe(0);
  });
});
