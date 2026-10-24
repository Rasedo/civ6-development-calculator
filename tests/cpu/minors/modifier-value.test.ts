// The modifier evaluator (cpu/core/aiModifiers.ts, 0x7a4b20) over every
// building the city build tables value and every project carrying
// modifiers, in an owner city's analysis on a stub view (six owned plots:
// Coast with Fish, a Reef, Fishing Boats, a Wheat Farm in Jungle, Rice in a
// Marsh, a Mountain); tests/gpu/city_value_test.py pins the same numbers.
import { describe, expect, it } from 'vitest';
import { AI_BUILDINGS, AI_PROJECTS } from '../../../cpu/data/aiBuildTables';
import { modifiersValue } from '../../../cpu/core/aiModifiers';
import { AI_RATE, type AiPlotView, type AiValueView } from '../../../cpu/core/aiValue';
const plots: AiPlotView[] = [
  { terrain: 'TERRAIN_COAST', feature: null, resource: 'RESOURCE_FISH', resourceVisible: true, improvement: null, impassable: false, resourceClass: 'RESOURCECLASS_BONUS', improved: false, appeal: 1 },
  { terrain: 'TERRAIN_COAST', feature: 'FEATURE_REEF', resource: null, resourceVisible: false, improvement: null, impassable: false, resourceClass: null, improved: false, appeal: 2 },
  { terrain: 'TERRAIN_COAST', feature: null, resource: null, resourceVisible: false, improvement: 'FISHING_BOATS', impassable: false, resourceClass: null, improved: false, appeal: 0 },
  { terrain: 'TERRAIN_GRASS', feature: 'FEATURE_JUNGLE', resource: 'RESOURCE_WHEAT', resourceVisible: true, improvement: 'FARM', impassable: false, resourceClass: 'RESOURCECLASS_BONUS', improved: true, appeal: 0 },
  { terrain: 'TERRAIN_PLAINS', feature: 'FEATURE_MARSH', resource: 'RESOURCE_RICE', resourceVisible: true, improvement: null, impassable: false, resourceClass: 'RESOURCECLASS_BONUS', improved: false, appeal: -1 },
  { terrain: 'TERRAIN_GRASS_MOUNTAIN', feature: null, resource: null, resourceVisible: false, improvement: null, impassable: true, resourceClass: null, improved: false, appeal: 4 },
];
function modView(over: Record<string, unknown> = {}): AiValueView {
  return {
    yieldWeight: () => 0, pseudoYieldWeight: (_s: number, p: string) => (p === 'PSEUDOYIELD_DIPLOMATIC_FAVOR' ? 128 : 0),
    cities: () => [{ id: 1, capital: true }], cityDistricts: () => ['DISTRICT_CITY_CENTER', 'DISTRICT_HARBOR'],
    cityOwnedPlots: () => plots, cityYield: (_s: number, _c: number, y: string) => (y === 'YIELD_PRODUCTION' ? 7.5 : 3),
    cityStrikes: () => true, cityHasBuilding: (_s: number, _c: number, b: string) => b === 'BUILDING_MONUMENT',
    traders: () => 0, tradeRouteCapacity: () => 1, tradeKnowledge: () => 4 * 256 + 64, unitCost: () => 40,
    cityItemTurns: () => 8, cityUnitExpected: () => 256, playerUnits: () => [],
    ...over,
  } as unknown as AiValueView;
}
const terms = (start: number) => ({ view: modView(), seat: 100, start, horizon: 50, rate: AI_RATE, owner: { cityId: 1, capital: true } });
const PINS: Record<string, number[]> = {
  BUILDING_MONUMENT: [5120, 4096, 1792],
  BUILDING_PALACE: [768, 768, 768],
  BUILDING_BARRACKS: [4608, 3840, 1792],
  BUILDING_WATER_MILL: [5120, 4096, 1536],
  BUILDING_LIGHTHOUSE: [83712, 69888, 37120],
  BUILDING_MARKET: [71424, 59904, 33024],
  BUILDING_STABLE: [4608, 3840, 1792],
  BUILDING_CASTLE: [0, 0, 0],
  BUILDING_ARMORY: [4608, 3840, 1792],
  BUILDING_SHIPYARD: [9728, 7936, 3328],
  BUILDING_STAR_FORT: [0, 0, 0],
  BUILDING_MILITARY_ACADEMY: [4608, 3840, 1792],
  BUILDING_ZOO: [5120, 4096, 1536],
  BUILDING_HANGAR: [4608, 3840, 1792],
  BUILDING_SEAPORT: [12288, 9984, 4096],
  BUILDING_AIRPORT: [9472, 7680, 3584],
  BUILDING_STADIUM: [0, 0, 0],
  BUILDING_MOSQUE: [0, 0, 0],
  BUILDING_PAGODA: [5376, 4352, 2048],
  BUILDING_FERRIS_WHEEL: [0, 0, 0],
  BUILDING_AQUARIUM: [5120, 4096, 1536],
  BUILDING_AQUATICS_CENTER: [0, 0, 0],
  BUILDING_GOV_TALL: [0, 0, 0],
  // its +50% Production toward Settlers (EFFECT_ADJUST_UNIT_PRODUCTION): the
  // 7.5 Production x one expected Settler x 0.5, from the start over the 8
  // train turns
  BUILDING_GOV_WIDE: [5632, 5376, 2816],
  BUILDING_GOV_CONQUEST: [0, 0, 0],
  BUILDING_GOV_CITYSTATES: [16128, 13056, 5888],
  // its spy (EFFECT_GRANT_SPY: PSEUDOYIELD_UNIT_SPY 20 a turn from the start
  // to the horizon, 402 / 330 / 152) and its 40
  BUILDING_GOV_SPIES: [113152, 94720, 49152],
  BUILDING_GOV_FAITH: [0, 0, 0],
  BUILDING_GOV_MILITARY: [0, 0, 0],
  BUILDING_GOV_SCIENCE: [0, 0, 0],
  BUILDING_SHOPPING_MALL: [0, 0, 0],
  BUILDING_HYDROELECTRIC_DAM: [0, 0, 0],
  BUILDING_CONSULATE: [5120, 4096, 1792],
  BUILDING_CHANCERY: [7680, 6144, 2816],
  PROJECT_LAUNCH_EARTH_SATELLITE: [0, 0, 0],
  PROJECT_LAUNCH_MOON_LANDING: [0, 0, 0],
  PROJECT_BUILD_NUCLEAR_DEVICE: [0, 0, 0],
  PROJECT_BUILD_THERMONUCLEAR_DEVICE: [0, 0, 0],
  PROJECT_BREAD_AND_CIRCUSES: [0, 0, 0],
  PROJECT_WATER_BREAD_AND_CIRCUSES: [0, 0, 0],
  PROJECT_CARBON_RECAPTURE: [0, 0, 0],
  PROJECT_LAUNCH_EXOPLANET_EXPEDITION: [0, 0, 0],
  PROJECT_ORBITAL_LASER: [0, 0, 0],
  PROJECT_TERRESTRIAL_LASER: [0, 0, 0],
  PROJECT_SEND_AID: [0, 0, 0],
  PROJECT_RECOMMISSION_REACTOR: [0, 0, 0],
};

describe("the modifiers' sum (0x7a4b20) in an owner city's analysis", () => {
  it('every building the tables value and every project carrying modifiers, landing in 0, 5 and 20 turns', () => {
    const rows = [...AI_BUILDINGS.filter((b) => !b.trait && !b.wonder && b.modifiers.length), ...AI_PROJECTS.filter((p) => p.modifiers.length)];
    const got = Object.fromEntries(rows.map((r) => [r.type, [0, 5, 20].map((t) => modifiersValue(terms(t), r.modifiers))]));
    expect(got).toEqual(PINS);
  });
});
