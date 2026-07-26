/**
 * AUDIT B-20 (Round B7): Great Works. WRITER/MUSICIAN great people no longer
 * apply an instant culture lump — each carries 2 Great Works that fill open
 * AMPHITHEATER (writing) / MUSEUM (music) slots, lowest city then lowest slot
 * first. Each slotted work yields building-tier culture BY KIND (#70/S1, the
 * real GS values: writing +2, music +4; no Great Work pays gold, and tourism
 * is unmodeled). Charges with no open slot overflow to the instant culture
 * lump (pre-B7 behaviour). These pin placeGreatWorks + cityGreatWorks +
 * greatWorkCulture + the building-tier yield; the GPU great_works_test battery
 * lane mirrors them across both seats.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders } from './helpers';
import { foundCity, queueDistrict, queueBuilding } from '../src/core/game';
import { computeCityStats } from '../src/core/city';
import { placeGreatWorks, cityGreatWorks, greatWorkCulture, GW_WRITING_CULTURE, GW_MUSIC_CULTURE, WORKS_PER_PERSON, SLOTS_PER_BUILDING } from '../src/data/greatPeople';
import type { City } from '../src/core/types';

/** A city with a completed Theater Square + Amphitheater (2 writing slots). */
function cityWithAmphitheater() {
  const state = makeState(makeMap(16, 16));
  state.sandbox = true; // districts + buildings complete instantly
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index).city!;
  expandBorders(state, city, 3);
  const ts = tileAtCoords(state.map, 9, 8);
  expect(queueDistrict(state, city.id, 'THEATER_SQUARE', ts.index).ok).toBe(true);
  expect(ts.districtComplete).toBe(true);
  expect(queueBuilding(state, city.id, 'AMPHITHEATER').ok).toBe(true);
  expect(city.buildings.includes('AMPHITHEATER')).toBe(true);
  return { state, city };
}

describe('B-20 Great Works', () => {
  it('slots a writing person into Amphitheater slots and yields +2 culture/work', () => {
    const { state, city } = cityWithAmphitheater();
    const before = computeCityStats(state, city).breakdown.buildings.culture;

    const overflow = placeGreatWorks([city], true); // one Writer = 2 works
    expect(overflow).toBe(0); // both works fit the 2 Amphitheater slots
    expect(cityGreatWorks(city)).toBe(WORKS_PER_PERSON);
    expect(city.greatWorksWriting).toBe(2);

    const after = computeCityStats(state, city).breakdown.buildings.culture;
    expect(after - before).toBe(GW_WRITING_CULTURE * WORKS_PER_PERSON); // +4 culture
  });

  it('#70/S1: a MUSIC work pays double a writing work (4 vs 2) and no gold', () => {
    const { state, city } = cityWithAmphitheater();
    expect(queueBuilding(state, city.id, 'MUSEUM').ok).toBe(true); // requiresAny AMPHITHEATER
    expect(city.buildings.includes('MUSEUM')).toBe(true);
    const b0 = computeCityStats(state, city).breakdown.buildings;
    const [cul0, gold0] = [b0.culture, b0.gold];

    expect(placeGreatWorks([city], false)).toBe(0); // one Musician = 2 works into the Museum
    expect(city.greatWorksMusic).toBe(WORKS_PER_PERSON);

    const b1 = computeCityStats(state, city).breakdown.buildings;
    expect(b1.culture - cul0).toBe(GW_MUSIC_CULTURE * WORKS_PER_PERSON); // +8, not +4
    expect(GW_MUSIC_CULTURE).toBe(2 * GW_WRITING_CULTURE); // the real GS ratio
    expect(b1.gold - gold0).toBe(0); // NO Great Work pays gold in Civ 6
  });

  it('#70/S1: greatWorkCulture weights the two kinds separately', () => {
    expect(greatWorkCulture({ greatWorksWriting: 2, greatWorksMusic: 0 })).toBe(4);
    expect(greatWorkCulture({ greatWorksWriting: 0, greatWorksMusic: 2 })).toBe(8);
    expect(greatWorkCulture({ greatWorksWriting: 1, greatWorksMusic: 1 })).toBe(6);
    expect(greatWorkCulture({})).toBe(0);
  });

  it('caps at 2 writing slots and overflows further charges', () => {
    const { state, city } = cityWithAmphitheater();
    placeGreatWorks([city], true); // fills both slots
    const overflow = placeGreatWorks([city], true); // second Writer: no slots left
    expect(overflow).toBe(WORKS_PER_PERSON); // both charges overflow
    expect(city.greatWorksWriting).toBe(SLOTS_PER_BUILDING); // still capped at 2
    void computeCityStats(state, city); // yield stays at the 2-work level
    expect(cityGreatWorks(city)).toBe(SLOTS_PER_BUILDING);
  });

  it('music works overflow when no Museum exists (Amphitheater is writing-only)', () => {
    const { city } = cityWithAmphitheater();
    const overflow = placeGreatWorks([city], false); // Musician, no Museum
    expect(overflow).toBe(WORKS_PER_PERSON); // no music slot -> full overflow
    expect(city.greatWorksMusic ?? 0).toBe(0);
  });

  it('fills the LOWEST city first, then the next (deterministic order)', () => {
    // Two cities, both with an Amphitheater: 3 works fill city A (2) then city B (1).
    const a = { buildings: ['AMPHITHEATER'] } as unknown as City;
    const b = { buildings: ['AMPHITHEATER'] } as unknown as City;
    // First Writer (2 works) -> all into A.
    expect(placeGreatWorks([a, b], true)).toBe(0);
    expect(a.greatWorksWriting).toBe(2);
    expect(b.greatWorksWriting ?? 0).toBe(0);
    // Second Writer (2 works) -> A is full, both spill into B (only 1 slot fits... B has 2).
    expect(placeGreatWorks([a, b], true)).toBe(0);
    expect(b.greatWorksWriting).toBe(2);
  });
});
