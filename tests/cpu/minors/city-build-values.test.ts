/**
 * The city build AI's building value against the game's PLOT ANALYSIS LOG
 * (runs/h1_duelv1124, AI_CityBuild.csv): a city-state's Monument at T turns
 * is X + trunc(X), X = PV(1.0, 50) - PV(1.0, T) at the 4.0 discount — its +1
 * Culture at the city-state's weight 0 and MONUMENT_CULTURE_AT_FULL_LOYALTY's
 * whole number (dll_readings "C-96 / C-97: the city build AI", SETTLED).
 */
import { describe, expect, it } from 'vitest';
import { AI_BUILDINGS } from '../../../cpu/data/aiBuildTables';
import { AI_BUILDING_INDEX, buildingValue, type CityBuildFacts } from '../../../cpu/core/aiCityBuild';
import type { AiValueView } from '../../../cpu/core/aiValue';

const view = { yieldWeight: () => 0, pseudoYieldWeight: () => 0 } as unknown as AiValueView;
const facts: CityBuildFacts = {
  view, seat: 100, cityId: -1, population: 1, capital: true, districtCount: 1, hasWonder: false, atWar: false, era: 0,
  yieldPct: (y) => (y === 'YIELD_PRODUCTION' ? -50 : 0), version: (b) => b, hasBuilding: () => false,
  hasDistrict: () => true, governmentTier: 0, worship: null, riverside: false, groundRefuses: () => false,
  current: null, techTurns: () => 0, civicTurns: () => 0, buildTurns: () => 1,
  amenity: { balance: 0, yields: {} }, regionalAmenities: () => [],
};

describe('the city build AI\'s building value', () => {
  it('prints Cardiff\'s logged Monument ladder (runs/h1_duelv1124 t12 .. t2 at T 1 .. 11)', () => {
    const monument = AI_BUILDINGS[AI_BUILDING_INDEX.get('BUILDING_MONUMENT')!];
    const logged = [40.11, 38.29, 36.29, 34.38, 32.53, 30.61, 30.19, 28.11, 26.68, 26.04, 24.25];
    expect(logged.map((_, k) => (buildingValue(facts, monument, k + 1) / 256).toFixed(2))).toEqual(logged.map((x) => x.toFixed(2)));
  });

  it('values the Walls of a population-1 capital at v 6.0: 3 strength, 1 population, 2 capital (runs/h1_duelv1124 Granada t3, T 32)', () => {
    const walls = AI_BUILDINGS[AI_BUILDING_INDEX.get('BUILDING_WALLS')!];
    expect((buildingValue(facts, walls, 32) / 256).toFixed(2)).toBe('19.74');
  });
});
