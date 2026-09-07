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
import { minorPhase } from '../../../cpu/core/minorBuild';
import { computeCityStats } from '../../../cpu/core/city';
import { levyUnits } from '../../../cpu/core/phase';
import { buildingPillaged, pillageBuilding } from '../../../cpu/core/yields';
import { trainXpPct } from '../../../cpu/core/combat';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { CITIZEN_SCIENCE } from '../../../cpu/data/constants';
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
    // nothing but its citizens pays Science yet, scaled by the amenity tier
    // exactly as a major's would be
    expect(bare.total.science).toBeCloseTo(5 * CITIZEN_SCIENCE * bare.amenities.tier.yieldFactor, 9);
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

  it("the walk's Science, Culture and Production fill the three pots; Gold and Faith bank", () => {
    const state = makeState(makeMap(24, 24));
    const cs = addCs(state, 12, 12, 'scientific', 5);
    minorDistrict(state, cs, 'CAMPUS', 1);
    cs.buildings = ['LIBRARY'];
    state.turn = 1;
    const y = computeCityStats(state, minorCity(cs)).total;
    minorPhase(state);
    expect(cs.research.techProgress).toBe(y.science);
    expect(cs.research.civicProgress).toBe(y.culture);
    expect(cs.prodProgress).toBe(y.production);
    expect(cs.treasury).toBe(y.gold);
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

describe('a levied unit carries the training experience of the minor that raised it', () => {
  it("the Barracks' +25% rides the levy, and a pillaged Barracks pays none", () => {
    const state = makeState(makeMap(24, 24));
    state.unitsMode = true;
    const cs = addCs(state, 12, 12, 'militaristic', 4);
    minorDistrict(state, cs, 'ENCAMPMENT', 1);
    cs.buildings = ['BARRACKS'];
    cs.envoys = { 0: 3 };
    state.seats[0].treasury = 100_000;
    expect(trainXpPct(state, minorCity(cs), 'MELEE')).toBe(BUILDINGS.BARRACKS.trainXpPct);

    expect(levyUnits(state, cs.id, 0).ok).toBe(true);
    const levied = state.units.filter((u) => u.seat === 0 && u.levied);
    expect(levied.length).toBeGreaterThan(0);
    for (const u of levied) expect(u.xpPct).toBe(BUILDINGS.BARRACKS.trainXpPct);

    pillageBuilding(cs, 'BARRACKS');
    cs.lastLevyTurn = -1000;
    expect(trainXpPct(state, minorCity(cs), 'MELEE')).toBe(0);
    expect(levyUnits(state, cs.id, 0).ok).toBe(true);
    const again = state.units.filter((u) => u.seat === 0 && u.levied && !levied.includes(u));
    expect(again.length).toBeGreaterThan(0);
    for (const u of again) expect(u.xpPct).toBe(0);
  });
});

describe('power at a minor', () => {
  it("nothing the minor's ladder builds draws or supplies Power", () => {
    // the grid has no minor arm because it would compute zero — the day the
    // ladder reaches a building with a load, this pin fails and the arm is due
    for (const id of ['ANCIENT_WALLS', 'MEDIEVAL_WALLS', 'RENAISSANCE_WALLS', 'LIBRARY', 'AMPHITHEATER',
      'MARKET', 'WORKSHOP', 'BARRACKS', 'STABLE', 'SHRINE']) {
      const def = BUILDINGS[id];
      expect(def, id).toBeTruthy();
      expect(def.power ?? 0).toBe(0);
      expect(def.powerSupply ?? 0).toBe(0);
    }
  });
});
