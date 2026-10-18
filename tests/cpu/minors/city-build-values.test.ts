/**
 * The city build AI's building value against the game's PLOT ANALYSIS LOG
 * (runs/h1_duelv1124, AI_CityBuild.csv): a city-state's Monument at T turns
 * is X + trunc(X), X = PV(1.0, 50) - PV(1.0, T) at the 4.0 discount — its +1
 * Culture at the city-state's weight 0 and MONUMENT_CULTURE_AT_FULL_LOYALTY's
 * whole number (dll_readings "C-96 / C-97: the city build AI", SETTLED).
 */
import { describe, expect, it } from 'vitest';
import { AI_BUILDINGS, AI_PROJECTS, AI_UNITS } from '../../../cpu/data/aiBuildTables';
import { unitProductionTable } from '../../../cpu/core/aiUnitProduction';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, buildingValue, defaultSpecialization, growthForecast, housingValue, unitValue, type CityBuildFacts, type PickFacts } from '../../../cpu/core/aiCityBuild';
import type { AiValueView } from '../../../cpu/core/aiValue';

const view = { yieldWeight: () => 0, pseudoYieldWeight: () => 0, tradeRouteCapacity: () => 0, bestCombatStrength: () => 0 } as unknown as AiValueView;
const facts: CityBuildFacts = {
  view, seat: 100, cityId: -1, population: 1, capital: true, districtCount: 1, hasWonder: false, atWar: false, era: 0,
  yieldPct: (y) => (y === 'YIELD_PRODUCTION' ? -50 : 0), version: (b) => b, hasBuilding: () => false,
  hasDistrict: () => true, governmentTier: 0, worship: null, riverside: false, groundRefuses: () => false,
  current: null, techTurns: () => 0, civicTurns: () => 0, buildTurns: () => 1,
  amenity: { balance: 0, yields: {} }, regionalAmenities: () => [], unitVersion: (u) => u, fullCiv: false, tribe: false, unitCount: 1,
  growth: { surplus: 2 * 256, housing: 5, population: 1, stored: 0, multiplier: 256 },
  forecast: growthForecast({ surplus: 2 * 256, housing: 5, population: 1, stored: 0, multiplier: 256 }),
  unitProduction: new Map(), trainsDomain: () => true, cities: 0, extraCopies: () => 0, promotionWeight: () => 256,
  resourceAccess: () => true, handicap: 0,
};

describe('the city build AI\'s unit value', () => {
  // runs/h1_duelv1124 Cardiff t2: its knowledge base holds its own two
  // Warriors; the analysis logs the Warrior 10.73 and the Slinger 8.34, both at
  // T 13 (3 and 3 turns to train, +10 for the Monument in hand)
  const table = unitProductionTable({
    isVersion: () => true, obsolete: () => false, owned: () => 0, known: (u) => (u === 'UNIT_WARRIOR' ? 2 : 0),
  });
  const cardiff = { ...facts, unitProduction: table };
  it('values each unit against the known ones: N over the efficiencies\' sum', () => {
    expect(table.get('UNIT_WARRIOR')!.value).toBe(256);
    expect(table.get('UNIT_SLINGER')!.value).toBe(199);
  });
  it('prints Cardiff\'s logged Warrior and Slinger', () => {
    const v = (u: string) => (unitValue(cardiff, AI_UNITS[AI_UNIT_INDEX.get(u)!], 13)! / 256).toFixed(2);
    expect([v('UNIT_WARRIOR'), v('UNIT_SLINGER')]).toEqual(['10.73', '8.34']);
  });
});

describe('the city build AI\'s building value', () => {
  it('prints Cardiff\'s logged Monument ladder (runs/h1_duelv1124 t12 .. t2 at T 1 .. 11)', () => {
    const monument = AI_BUILDINGS[AI_BUILDING_INDEX.get('BUILDING_MONUMENT')!];
    const logged = [40.11, 38.29, 36.29, 34.38, 32.53, 30.61, 30.19, 28.11, 26.68, 26.04, 24.25];
    expect(logged.map((_, k) => (buildingValue(facts, monument, k + 1) / 256).toFixed(2))).toEqual(logged.map((x) => x.toFixed(2)));
  });

  it('values a city-state\'s Shrine at FX(-9999) plus its own value once it holds six units at peace (runs/h1_duelv1124 Granada t28: -9996.57)', () => {
    const shrine = AI_BUILDINGS[AI_BUILDING_INDEX.get('BUILDING_SHRINE')!];
    const own = buildingValue(facts, shrine, 42);
    expect(buildingValue({ ...facts, unitCount: 6 }, shrine, 42)).toBe(own - 9999 * 256);
    expect(buildingValue({ ...facts, unitCount: 6, atWar: true }, shrine, 42)).toBe(own);
  });

  it('forecasts the housing steps: a city at its housing grows at a quarter, the step where the factor changes', () => {
    // 4 Food over the citizens' at population 4 with housing 5: the factor
    // 0.5 now (1 left), 0.25 from the fifth citizen
    const g = { surplus: 4 * 256, housing: 5, population: 4, stored: 0, multiplier: 128 };
    const steps = growthForecast(g);
    expect(steps[0]).toEqual({ turn: 0, lost: 2 * 256, pop: 4 });
    expect(steps[1].pop).toBe(5);
    expect(steps[1].lost).toBe(3 * 256);
    expect(housingValue(g, steps, 1, 10, 50)).toBeGreaterThan(0);
  });

  it('values the Walls of a population-1 capital at v 6.0: 3 strength, 1 population, 2 capital (runs/h1_duelv1124 Granada t3, T 32)', () => {
    const walls = AI_BUILDINGS[AI_BUILDING_INDEX.get('BUILDING_WALLS')!];
    expect((buildingValue(facts, walls, 32) / 256).toFixed(2)).toBe('19.74');
  });
});

// the raw values tests/gpu/city_value_test.py pins alike (the facts above,
// Cardiff's unit table, the amenity's yields 3 Food, 4 Gold, 2.5 Science)
describe('the values the GPU twin pins', () => {
  const table = unitProductionTable({
    isVersion: () => true, obsolete: () => false, owned: () => 0, known: (u) => (u === 'UNIT_WARRIOR' ? 2 : 0),
  });
  const f = { ...facts, unitProduction: table, amenity: { balance: 0, yields: { YIELD_FOOD: 3, YIELD_GOLD: 4, YIELD_SCIENCE: 2.5 } } };
  const b = (x: string, t: number, ff: CityBuildFacts = f) => buildingValue(ff, AI_BUILDINGS[AI_BUILDING_INDEX.get(x)!], t);
  const u = (x: string, t: number) => unitValue(f, AI_UNITS[AI_UNIT_INDEX.get(x)!], t);
  it('units and buildings, raw', () => {
    expect([u('UNIT_WARRIOR', 13), u('UNIT_SLINGER', 13), u('UNIT_SCOUT', 4), u('UNIT_BUILDER', 4)]).toEqual([2748, 2135, 4450, 41]);
    expect([b('BUILDING_WALLS', 32), b('BUILDING_LIBRARY', 5), b('BUILDING_GRANARY', 7), b('BUILDING_SHRINE', 42), b('BUILDING_ARENA', 9)])
      .toEqual([5053, 8463, 3888, 623, 5253]);
    expect(b('BUILDING_SHRINE', 42, { ...f, unitCount: 6 })).toBe(-2559121);
  });

  it('the Default Specialization pick: the building at least the unit and the project, a disfavoured one halved, the defensive pick', () => {
    const NB = AI_BUILDINGS.length;
    const bt = new Array(NB).fill(-9999 * 256);
    const ut = new Array(AI_UNITS.length).fill(-9999 * 256);
    const pt = new Array(AI_PROJECTS.length).fill(-9999 * 256);
    bt[AI_BUILDING_INDEX.get('BUILDING_MONUMENT')!] = 30 * 256;
    bt[AI_BUILDING_INDEX.get('BUILDING_WALLS')!] = 20 * 256;
    ut[AI_UNIT_INDEX.get('UNIT_WARRIOR')!] = 25 * 256;
    ut[AI_UNIT_INDEX.get('UNIT_SCOUT')!] = 40 * 256;
    pt[AI_PROJECTS.findIndex((p) => p.type === 'PROJECT_ENHANCE_DISTRICT_CAMPUS')] = 12 * 256;
    const pf = (over: Partial<PickFacts> = {}): PickFacts => ({
      buildingHeld: () => false, canConstruct: () => true, reasonsClear: () => true, canTrain: (x) => x !== 'UNIT_SCOUT',
      canProduce: () => true, favored: () => 0, defense: false, ...over,
    });
    const pick = (o: Partial<PickFacts>) => { const p = defaultSpecialization({ buildings: bt, units: ut, projects: pt }, pf(o)); return p && [p.kind, p.type, p.value]; };
    expect(pick({})).toEqual(['building', 'BUILDING_MONUMENT', 30 * 256]);
    expect(pick({ favored: (x) => (x === 'BUILDING_MONUMENT' ? -1 : 0) })).toEqual(['unit', 'UNIT_WARRIOR', 25 * 256]);
    expect(pick({ defense: true })).toEqual(['unit', 'UNIT_WARRIOR', 25 * 256]);
    expect(pick({ canTrain: () => false, canConstruct: () => false })).toEqual(['project', 'PROJECT_ENHANCE_DISTRICT_CAMPUS', 12 * 256]);
  });
});
