/**
 * INDUSTRIALIST AND RENEWABLE SUBSIDIZER (DLC/Expansion2/Data/Expansion1_Governors.xml,
 * Expansion2_Buildings.xml, Expansion2_Improvements.xml).
 *
 * Industrialist: INDUSTRIALIST_{COAL,OIL,NUCLEAR}_POWER_PLANT_PRODUCTION
 * (MODIFIER_BUILDING_YIELD_CHANGE, +2 Production on each plant) and
 * INDUSTRIALIST_RESOURCE_POWER_PROVIDED (Amount 1) — "Increase the Power
 * provided by each resource of the Coal Power Plant, Oil Power Plant and
 * Nuclear Power Plant by 1 and the Production by 2."
 *
 * Renewable Subsidizer: RENEWABLE_ENERGY_IMPROVEMENT_PLOTS_GOLD (+2 Gold on a
 * Solar / Wind / Offshore Wind / Geothermal plot), RENEWABLE_ENERGY_IMPROVEMENT_BUILDING_GOLD
 * (+2 Gold on the Hydroelectric Dam) and the MERCHANT_RENEWABLE_ENERGY_* +2
 * Power rows behind CITY_HAS_GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY.
 *
 * The GPU twin is tests/gpu/governor_power_test.py.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders } from '../helpers';
import { IMPROVEMENTS } from '../../../cpu/data/improvements';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTIONS, GOVERNOR_PROMOTION_INDEX, promotionBitValue } from '../../../cpu/data/governors';
import { seatOf } from '../../../cpu/core/seats';
import { governorBuildingYields, governorsOf } from '../../../cpu/core/governors';
import { cityPower, tileYields } from '../../../cpu/core/yields';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { resolveSeatPower } from '../../../cpu/core/stockpile';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import type { City, GameState } from '../../../cpu/core/types';

const P_IND = GOVERNOR_PROMOTION_INDEX.INDUSTRIALIST!;
const P_REN = GOVERNOR_PROMOTION_INDEX.RENEWABLE_SUBSIDIZER!;

function seatGov(state: GameState, city: City, gi: number, promotion: number): void {
  const g = governorsOf(seatOf(state, city.seat)!)[gi];
  g.appointed = true;
  g.cityId = city.id;
  g.establishTurns = 0;
  g.promotions = promotionBitValue(promotion);
}

function scene(): { state: GameState; city: City } {
  const state = makeState(makeMap(20, 16));
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 3);
  return { state, city };
}

describe('the rows are the install rows', () => {
  it('carries Industrialist and Renewable Subsidizer', () => {
    const ind = GOVERNOR_PROMOTIONS[P_IND].effects;
    expect(ind.buildingYields).toEqual({
      COAL_POWER_PLANT: { production: 2 }, OIL_POWER_PLANT: { production: 2 }, NUCLEAR_POWER_PLANT: { production: 2 },
    });
    expect(ind.plantPowerPerResource).toBe(1);
    const ren = GOVERNOR_PROMOTIONS[P_REN].effects;
    expect(ren.buildingYields).toEqual({ HYDROELECTRIC_DAM: { gold: 2 } });
    expect(ren.buildingPower).toEqual({ HYDROELECTRIC_DAM: 2 });
    for (const id of ['SOLAR_FARM', 'WIND_FARM', 'GEOTHERMAL_PLANT', 'OFFSHORE_WIND_FARM'] as const) {
      expect(IMPROVEMENTS[id].governorYields).toEqual({ promo: 'RENEWABLE_SUBSIDIZER', yields: { gold: 2 } });
      expect(IMPROVEMENTS[id].governorPower).toEqual({ promo: 'RENEWABLE_SUBSIDIZER', amount: 2 });
    }
  });
});

describe('Industrialist', () => {
  it('pays each plant +2 Production in the governed city, a lit one only', () => {
    const { state, city } = scene();
    city.buildings.push('COAL_POWER_PLANT');
    expect(governorBuildingYields(state, city).production).toBe(0);
    seatGov(state, city, GOVERNOR_INDEX.MAGNUS, P_IND);
    expect(governorBuildingYields(state, city).production).toBe(2);
    city.pillagedBuildings = ['COAL_POWER_PLANT'];
    expect(governorBuildingYields(state, city).production).toBe(0);
  });

  it("raises what each resource of the governed city's plant provides by 1", () => {
    const { state, city } = scene();
    // an Industrial Zone with a Coal plant, and a load the city asks for
    const iz = tileAtCoords(state.map, 9, 8);
    iz.district = 'INDUSTRIAL_ZONE';
    iz.districtComplete = true;
    city.districts.push({ type: 'INDUSTRIAL_ZONE', tileIndex: iz.index });
    city.buildings.push('COAL_POWER_PLANT', 'FACTORY', 'RESEARCH_LAB');
    const base = BUILDINGS.COAL_POWER_PLANT.fuelRate!;
    expect(cityPower(state, city).plants).toEqual([{ id: 'COAL_POWER_PLANT', rate: base }]);
    seatGov(state, city, GOVERNOR_INDEX.MAGNUS, P_IND);
    expect(cityPower(state, city).plants).toEqual([{ id: 'COAL_POWER_PLANT', rate: base + 1 }]);
    // the burn follows the raised rate: a load of 5 takes 2 Coal at 4, 1 at 5
    const seat = seatOf(state, 0)!;
    const k = STRATEGIC_IDS.indexOf('COAL');
    seat.stockpile = STRATEGIC_IDS.map(() => 10);
    const demand = cityPower(state, city).demand;
    resolveSeatPower(state, 0);
    expect(city.powered).toBe(true);
    expect(seat.stockpile![k]).toBe(10 - Math.ceil(demand / (base + 1)));
  });
});

describe('Renewable Subsidizer', () => {
  it('pays the Dam +2 Gold and +2 Power in the governed city', () => {
    const { state, city } = scene();
    city.buildings.push('HYDROELECTRIC_DAM');
    const supply = cityPower(state, city).supply;
    expect(governorBuildingYields(state, city).gold).toBe(0);
    seatGov(state, city, GOVERNOR_INDEX.REYNA, P_REN);
    expect(governorBuildingYields(state, city).gold).toBe(2);
    expect(cityPower(state, city).supply).toBe(supply + 2);
  });

  it('pays a renewable generator +2 Power, and its plot +2 Gold', () => {
    const { state, city } = scene();
    const t = tileAtCoords(state.map, 9, 9);
    t.improvement = 'SOLAR_FARM';
    const supply = cityPower(state, city).supply;
    const gold = tileYields(makeYieldCtx(state, 0), t).gold;
    seatGov(state, city, GOVERNOR_INDEX.REYNA, P_REN);
    expect(cityPower(state, city).supply).toBe(supply + 2);
    expect(tileYields(makeYieldCtx(state, 0), t).gold).toBe(gold + 2);
    // a pillaged generator supplies nothing, the promotion's share included
    t.pillaged = true;
    expect(cityPower(state, city).supply).toBe(supply - IMPROVEMENTS.SOLAR_FARM.power!);
  });
});
