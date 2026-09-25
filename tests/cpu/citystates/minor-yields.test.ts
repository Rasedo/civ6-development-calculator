/**
 * THE MINOR'S CITY PAYS ITS YIELDS — the TS half (the GPU twin is
 * tests/gpu/minor_yields_test.py).
 *
 * CIV6 (City-state): a city-state's city is an ordinary city — its Campus
 * yields Science, its Commercial Hub Gold — and it "will apparently research
 * certain techs" on that output. No gate lane drives a minor's yields (a minor
 * takes no decision), so these scenes are the whole evidence.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { minorCity } from '../../../cpu/core/cityStates';
import { minorLevyReturn, minorPhase, minorPower } from '../../../cpu/core/minorBuild';
import { computeCityStats } from '../../../cpu/core/city';
import { levyGoldCost, levyUnits } from '../../../cpu/core/phase';
import { purchaseStep } from '../../../cpu/core/effects';
import { buildingPillaged, pillageBuilding } from '../../../cpu/core/yields';
import { spawnUnit } from '../../../cpu/core/units';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { CITIZEN_SCIENCE, GOLD_PURCHASE_MULT } from '../../../cpu/data/constants';
import { UNITS } from '../../../cpu/data/units';
import { LEVY_COST_PCT, LEVY_TURNS, MINOR_BUILD_ROWS, MINOR_PRODUCTION_PCT } from '../../../cpu/data/cityStates';
import { tilesWithin } from '../../../world/hex';
import type { CityState, CityStateType, GameState } from '../../../cpu/core/types';

function addCs(state: GameState, col: number, row: number, type: CityStateType, population = 3): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name: `Testopolis ${state.cityStates.length}`,
    type,
    centerIndex: center.index,
    population,
    envoys: {},
    met: [0],
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  center.district = 'CITY_CENTER';
  state.cityStates.push(cityState);
  return cityState;
}

/** a COMPLETE district of `type` on a tile the minor owns, next to its centre */
function minorDistrict(state: GameState, cs: CityState, type: 'CAMPUS' | 'ENCAMPMENT', dc: number): number {
  const ctr = state.map.tiles[cs.centerIndex];
  const t = tileAtCoords(state.map, ctr.col + dc, ctr.row);
  setTileOwner(t, cs.seat);
  t.district = type;
  t.districtComplete = true;
  (cs.districts ??= []).push({ type, tileIndex: t.index });
  return t.index;
}

describe("the minor's city rides the yield walk", () => {
  it('a bare city pays its citizens and its centre; a Campus with a Library pays more Science', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, 'scientific', 5);
    const bare = computeCityStats(state, minorCity(cs));
    // nothing but its citizens and its Palace pays Science yet, scaled by the
    // amenity tier exactly as a major's would be
    expect(bare.total.science).toBeCloseTo(
      (5 * CITIZEN_SCIENCE + BUILDINGS.PALACE.yields!.science!) * bare.amenities.tier.yieldFactor, 9);
    expect(bare.total.food).toBeGreaterThan(0);
    expect(bare.total.production).toBeGreaterThan(0);
    minorDistrict(state, cs, 'CAMPUS', 1);
    cs.buildings = ['LIBRARY'];
    const lit = computeCityStats(state, minorCity(cs));
    expect(lit.total.science).toBeGreaterThan(bare.total.science);
    // a pillaged Library pays nothing again
    pillageBuilding(cs, 'LIBRARY');
    expect(buildingPillaged(minorCity(cs), 'LIBRARY')).toBe(true);
    expect(computeCityStats(state, minorCity(cs)).total.science).toBeLessThan(lit.total.science);
  });

  it("the walk's Science, Culture and Production fill the three pots; Gold pays upkeep, stopping at 0; Faith banks", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, 'scientific', 5);
    minorDistrict(state, cs, 'CAMPUS', 1);
    cs.buildings = ['LIBRARY'];
    state.turn = 1;
    // nothing on its build table wanted: a spent Builder stands, every drawn
    // row is never, and it keeps no army
    spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat)!.charges = 0;
    cs.buildFrom = MINOR_BUILD_ROWS.map((row) => (row.from ? -1 : 0));
    cs.armyCap = 0;
    const y = computeCityStats(state, minorCity(cs)).total;
    minorPhase(state);
    expect(cs.research.techProgress).toBe(y.science);
    expect(cs.research.civicProgress).toBe(y.culture);
    // so the pot takes the city's Production under the minor's own percent
    expect(cs.prodProgress).toBe(y.production * ((100 + MINOR_PRODUCTION_PCT) / 100) * 1);
    // the spent Builder costs no upkeep; a city whose buildings' maintenance
    // outruns its Gold leaves the balance at 0
    expect(cs.treasury).toBe(Math.max(0, y.gold));
    expect(cs.faith).toBe(y.faith);
    expect(cs.research.techs).toEqual([]);
  });

  it("the stub carries the minor's record and answers to its ground", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, 'cultural', 4);
    const city = minorCity(cs);
    expect(city.id).toBe(-1);
    expect(city.seat).toBe(cs.seat);
    expect(city.population).toBe(4);
    expect(city.districts[0]).toEqual({ type: 'CITY_CENTER', tileIndex: cs.centerIndex });
    expect(city.isCapital).toBe(false);
    expect(city.wonders).toEqual([]);
  });
});

describe("the levy takes the minor's own army", () => {
  it('pays its share of the units\' prices, takes every military unit still, and holds them until the term or the suzerain ends', () => {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    const cs = addCs(state, 12, 12, 'militaristic', 4);
    cs.envoys = { 0: 3 };
    cs.suzerain = 0;
    state.seats[0].treasury = 1000;
    // no army, no levy
    expect(levyUnits(state, cs.id, 0).ok).toBe(false);
    const w1 = spawnUnit(state, 'WARRIOR', cs.centerIndex, cs.seat)!;
    const w2 = spawnUnit(state, 'SLINGER', cs.centerIndex, cs.seat)!;
    const builder = spawnUnit(state, 'BUILDER', cs.centerIndex, cs.seat)!;
    const price = (id: string) => purchaseStep(UNITS[id].cost * GOLD_PURCHASE_MULT);
    const cost = Math.floor(((price('WARRIOR') + price('SLINGER')) * LEVY_COST_PCT) / 100);
    expect(levyGoldCost(state, 0, cs)).toBe(cost);

    expect(levyUnits(state, cs.id, 0).ok).toBe(true);
    expect(state.seats[0].treasury).toBe(1000 - cost);
    for (const u of [w1, w2]) {
      expect(u.seat).toBe(0);
      expect(u.leviedFrom).toBe(cs.seat);
      expect(u.movesLeft).toBe(0); // "will not be able to move on the turn they are levied"
    }
    expect(builder.seat).toBe(cs.seat); // a civilian is no military unit
    expect(cs.levySeat).toBe(0);
    expect(cs.levyEnds).toBe(state.turn + LEVY_TURNS);
    // "You have already levied the military of this city-state."
    expect(levyUnits(state, cs.id, 0).ok).toBe(false);

    // the term runs: home at its end
    state.turn = cs.levyEnds! - 1;
    minorLevyReturn(state, cs);
    expect(w1.seat).toBe(0);
    state.turn = cs.levyEnds!;
    minorLevyReturn(state, cs);
    for (const u of [w1, w2]) {
      expect(u.seat).toBe(cs.seat);
      expect(u.leviedFrom).toBeUndefined();
    }
    expect(cs.levySeat).toBeUndefined();

    // "or if the Suzerain changes"
    expect(levyUnits(state, cs.id, 0).ok).toBe(true);
    cs.suzerain = -1;
    minorLevyReturn(state, cs);
    expect(w1.seat).toBe(cs.seat);
    expect(cs.levySeat).toBeUndefined();
  });
});

describe("a minor's grid", () => {
  it('a Factory with nothing to feed it stays dark; a Solar Farm on its ground lights it', () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, 'industrial', 4);
    minorPower(state, cs);
    expect(cs.powered).toBe(false); // no load, nothing to light
    const iz = tileAtCoords(state.map, 13, 12);
    iz.district = 'INDUSTRIAL_ZONE';
    iz.districtComplete = true;
    cs.districts = [{ type: 'INDUSTRIAL_ZONE', tileIndex: iz.index }];
    cs.buildings = ['WORKSHOP', 'FACTORY'];
    minorPower(state, cs);
    expect(cs.powered).toBe(false);
    const dark = computeCityStats(state, minorCity(cs)).total.production;
    const farm = tileAtCoords(state.map, 11, 12);
    farm.improvement = 'SOLAR_FARM';
    minorPower(state, cs);
    expect(cs.powered).toBe(true);
    expect(computeCityStats(state, minorCity(cs)).total.production).toBeGreaterThan(dark);
  });
});
