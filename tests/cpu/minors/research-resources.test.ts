import { describe, it, expect } from 'vitest';
import { emptySeat, seatOfCityState } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { minorResearchResources, minorResourceCounts } from '../../../cpu/core/minorBuild';
import { amenityPerTurn } from '../../../cpu/core/aiCityBuild';
import { luxuryAmenities } from '../../../cpu/core/aiResource';
import { AI_RESOURCES } from '../../../cpu/data/aiBuildTables';
import type { CityState, GameState } from '../../../cpu/core/types';

// THE RESOURCE VALUE (0x7a21e0) in the research value (tools/civ6lab/
// dll_readings.md "C-96: the resource value"); the numbers below are the
// GPU twin's too (tests/gpu/research_ai_test.py)

function minor(state: GameState): CityState {
  const cs: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length, name: 'CS', type: 'scientific',
    centerIndex: tileAtCoords(state.map, 5, 5).index, population: 3, envoys: {}, met: [],
  };
  state.cityStates.push(cs);
  return cs;
}

describe('the resource value in the research value', () => {
  it("counts the minor's own unimproved plots within three of its centre, the resources it sees", () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    const iron = tileAtCoords(state.map, 6, 5);
    iron.resource = 'IRON';
    iron.ownerSeat = cs.seat;
    const far = tileAtCoords(state.map, 9, 5);
    far.resource = 'IRON';
    far.ownerSeat = cs.seat;
    // Iron shows with Bronze Working
    expect(minorResourceCounts(state, cs).get('RESOURCE_IRON') ?? 0).toBe(0);
    cs.research.techs = ['BRONZE_WORKING'];
    expect(minorResourceCounts(state, cs).get('RESOURCE_IRON')).toBe(1);
  });

  it('a strategic: 25 a chronology step over the need, x2 with none held, discounted to the landing', () => {
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    cs.research.techs = ['BRONZE_WORKING'];
    const iron = tileAtCoords(state.map, 6, 5);
    iron.resource = 'IRON';
    iron.ownerSeat = cs.seat;
    const term = minorResearchResources(state, cs);
    // Mining's Mine works Iron: the need 20 (the most of ResourceCost + 10 x
    // ResourceMaintenanceAmount over the table's Iron units), the Ancient
    // chronology 1: 25 / 20 x 2 = 2.5, discounted 10 turns
    expect(term('MINING', 10)).toBe(465);
    expect(term('MINING', 0)).toBe(640);
    // a technology whose improvements work no Iron
    expect(term('POTTERY', 10)).toBe(0);
  });

  it("a luxury: one Amenity more in the city at least the luxury pseudo-yield, none where it is held", () => {
    expect(luxuryAmenities(AI_RESOURCES.find((r) => r.type === 'RESOURCE_SILVER')!, 1, { chronologyOf: () => null })).toBe(4);
    const state = makeState(makeMap(12, 12));
    const cs = minor(state);
    const silver = tileAtCoords(state.map, 6, 5);
    silver.resource = 'SILVER';
    silver.ownerSeat = cs.seat;
    expect(minorResearchResources(state, cs)('MINING', 10)).toBe(5016);
  });

  it("values one Amenity more at the city's level (0x79f7c0)", () => {
    const yields = { YIELD_FOOD: 4, YIELD_PRODUCTION: 5, YIELD_GOLD: 3, YIELD_SCIENCE: 2.5, YIELD_CULTURE: 2, YIELD_FAITH: 0 };
    // the level holds: PSEUDOYIELD_HAPPINESS of 1
    expect(amenityPerTurn({ view: null, seat: 0 }, { balance: 0, yields })).toBe(256);
    // Content -> Happy: the level climbed and +10% of each yield but Food
    expect(amenityPerTurn({ view: null, seat: 0 }, { balance: 2, yields })).toBe(530);
    // Displeased -> Content
    expect(amenityPerTurn({ view: null, seat: 0 }, { balance: -1, yields })).toBe(564);
  });
});
