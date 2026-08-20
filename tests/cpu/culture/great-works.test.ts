/**
 * Great Works. A WRITER/MUSICIAN carries 2 Great Works that fill open
 * AMPHITHEATER (writing, 2) / ART MUSEUM (art, 3) / BROADCAST CENTER (music, 1)
 * slots — the real Civ 6 homes — lowest city then lowest slot first. Each
 * slotted work yields building-tier culture and tourism BY KIND (the real GS
 * values: writing +2, music +4; no Great Work pays gold).
 * Charges with no open slot overflow to an instant culture lump.
 * These pin placeGreatWorks + cityGreatWorks +
 * greatWorkCulture + the building-tier yield; the GPU great_works_test battery
 * lane mirrors them across both seats.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders } from '../helpers';
import { foundCity, queueDistrict, queueBuilding } from '../../../cpu/core/game';
import { computeCityStats } from '../../../cpu/core/city';
import { placeGreatWorks, cityGreatWorks, greatWorkCulture, greatWorkTourism, GW_TOURISM, GW_CULTURE, GW_WORKS_PER_PERSON, GW_SLOTS, GW_WRITING, GW_ART, GW_MUSIC, GW_WONDER_SLOTS } from '../../../cpu/data/greatPeople';
// The kind arrays replaced the writing/music pair — these aliases keep the
// existing assertions readable now that ART is a real kind with its own slots.
const GW_WRITING_CULTURE = GW_CULTURE[GW_WRITING];
const GW_MUSIC_CULTURE = GW_CULTURE[GW_MUSIC];
const WORKS_PER_PERSON = GW_WORKS_PER_PERSON[GW_WRITING];
const SLOTS_PER_BUILDING = GW_SLOTS[GW_WRITING];
import type { City } from '../../../cpu/core/types';

/** A city with a completed Theater Square + Amphitheater (2 writing slots). */
function cityWithAmphitheater() {
  const state = makeState(makeMap(16, 16));
  state.sandbox = true; // districts + buildings complete instantly
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
  expandBorders(state, city, 3);
  const ts = tileAtCoords(state.map, 9, 8);
  expect(queueDistrict(state, city.id, 'THEATER_SQUARE', ts.index, 0).ok).toBe(true);
  expect(ts.districtComplete).toBe(true);
  expect(queueBuilding(state, city.id, 'AMPHITHEATER', 0).ok).toBe(true);
  expect(city.buildings.includes('AMPHITHEATER')).toBe(true);
  return { state, city };
}

describe('Great Works', () => {
  it('slots a writing person into Amphitheater slots and yields +2 culture/work', () => {
    const { state, city } = cityWithAmphitheater();
    const before = computeCityStats(state, city).breakdown.buildings.culture;

    const overflow = placeGreatWorks([city], GW_WRITING); // one Writer = 2 works
    expect(overflow).toBe(0); // both works fit the 2 Amphitheater slots
    expect(cityGreatWorks(city)).toBe(WORKS_PER_PERSON);
    expect(city.greatWorksWriting).toBe(2);

    const after = computeCityStats(state, city).breakdown.buildings.culture;
    expect(after - before).toBe(GW_WRITING_CULTURE * WORKS_PER_PERSON); // +4 culture
  });

  // MUSIC lives in the BROADCAST CENTER, its real Civ 6 home, and that
  // building has exactly ONE slot — so a Musician's 2 works always leave 1
  // overflowing. The Museum is the ART Museum now and holds 3 art works.
  it('a MUSIC work pays double a writing work (4 vs 2) and no gold', () => {
    const { state, city } = cityWithAmphitheater();
    expect(queueBuilding(state, city.id, 'MUSEUM', 0).ok).toBe(true); // requiresAny AMPHITHEATER
    expect(queueBuilding(state, city.id, 'BROADCAST_CENTER', 0).ok).toBe(true); // requiresAny MUSEUM
    expect(city.buildings.includes('BROADCAST_CENTER')).toBe(true);
    const b0 = computeCityStats(state, city).breakdown.buildings;
    const [cul0, gold0] = [b0.culture, b0.gold];

    expect(placeGreatWorks([city], GW_MUSIC)).toBe(1); // 2 works, 1 Broadcast Center slot
    expect(city.greatWorksMusic).toBe(GW_SLOTS[GW_MUSIC]);

    const b1 = computeCityStats(state, city).breakdown.buildings;
    expect(b1.culture - cul0).toBe(GW_MUSIC_CULTURE * GW_SLOTS[GW_MUSIC]); // +4 for the one slotted work
    expect(GW_MUSIC_CULTURE).toBe(2 * GW_WRITING_CULTURE); // the real GS ratio
    expect(b1.gold - gold0).toBe(0); // NO Great Work pays gold in Civ 6
  });

  // ART is a real kind — the ART MUSEUM's 3 slots, +2 culture apiece, and
  // a Great Artist carries exactly 3 works, so one Artist fills a Museum.
  it('an ARTIST fills the Art Museum (3 slots, +2 culture each)', () => {
    const { state, city } = cityWithAmphitheater();
    expect(queueBuilding(state, city.id, 'MUSEUM', 0).ok).toBe(true);
    const cul0 = computeCityStats(state, city).breakdown.buildings.culture;

    expect(GW_WORKS_PER_PERSON[GW_ART]).toBe(3); // real Civ 6: an Artist makes 3
    expect(GW_SLOTS[GW_ART]).toBe(3); // ... and the Art Museum holds exactly 3
    expect(placeGreatWorks([city], GW_ART)).toBe(0); // so one Artist fits exactly
    expect(city.greatWorksArt).toBe(3);

    const cul1 = computeCityStats(state, city).breakdown.buildings.culture;
    expect(cul1 - cul0).toBe(GW_CULTURE[GW_ART] * 3); // +6
  });

  // PRINTING doubles the TOURISM of Great Works of WRITING (real
  // Civ 6 — the tourism, not the Amphitheater's slot count). Culture is
  // untouched, and the other two kinds are untouched.
  it('PRINTING doubles WRITING tourism only', () => {
    const w = { greatWorksWriting: 2 };
    expect(greatWorkTourism(w, false)).toBe(GW_TOURISM[GW_WRITING] * 2);
    expect(greatWorkTourism(w, true)).toBe(GW_TOURISM[GW_WRITING] * 2 * 2);
    // ... art and music are NOT doubled
    const am = { greatWorksArt: 2, greatWorksMusic: 1 };
    expect(greatWorkTourism(am, true)).toBe(greatWorkTourism(am, false));
    // ... and CULTURE never moves
    expect(greatWorkCulture(w)).toBe(GW_CULTURE[GW_WRITING] * 2);
  });

  it('greatWorkCulture weights every kind separately', () => {
    expect(greatWorkCulture({ greatWorksWriting: 2 })).toBe(4);
    expect(greatWorkCulture({ greatWorksMusic: 2 })).toBe(8);
    expect(greatWorkCulture({ greatWorksArt: 2 })).toBe(4);
    expect(greatWorkCulture({ greatWorksWriting: 1, greatWorksArt: 1, greatWorksMusic: 1 })).toBe(8);
    expect(greatWorkCulture({})).toBe(0);
  });

  it('caps at 2 writing slots and overflows further charges', () => {
    const { state, city } = cityWithAmphitheater();
    placeGreatWorks([city], GW_WRITING); // fills both slots
    const overflow = placeGreatWorks([city], GW_WRITING); // second Writer: no slots left
    expect(overflow).toBe(WORKS_PER_PERSON); // both charges overflow
    expect(city.greatWorksWriting).toBe(SLOTS_PER_BUILDING); // still capped at 2
    void computeCityStats(state, city); // yield stays at the 2-work level
    expect(cityGreatWorks(city)).toBe(SLOTS_PER_BUILDING);
  });

  it('music works overflow when no Broadcast Center exists', () => {
    const { city } = cityWithAmphitheater();
    const overflow = placeGreatWorks([city], GW_MUSIC); // Musician, no Broadcast Center
    expect(overflow).toBe(GW_WORKS_PER_PERSON[GW_MUSIC]); // no music slot -> full overflow
    expect(city.greatWorksMusic ?? 0).toBe(0);
  });

  it('fills the LOWEST city first, then the next (deterministic order)', () => {
    // Two cities, both with an Amphitheater: 3 works fill city A (2) then city B (1).
    const a = { buildings: ['AMPHITHEATER'] } as unknown as City;
    const b = { buildings: ['AMPHITHEATER'] } as unknown as City;
    // First Writer (2 works) -> all into A.
    expect(placeGreatWorks([a, b], GW_WRITING)).toBe(0);
    expect(a.greatWorksWriting).toBe(2);
    expect(b.greatWorksWriting ?? 0).toBe(0);
    // Second Writer (2 works) -> A is full, both spill into B (only 1 slot fits... B has 2).
    expect(placeGreatWorks([a, b], GW_WRITING)).toBe(0);
    expect(b.greatWorksWriting).toBe(2);
  });

  it('sourced wonder slots: Great Library 2 writing, Hermitage 4 art, Bolshoi 1+1', () => {
    expect(GW_WONDER_SLOTS.GREAT_LIBRARY).toEqual([2, 0, 0]);
    expect(GW_WONDER_SLOTS.HERMITAGE).toEqual([0, 4, 0]);
    expect(GW_WONDER_SLOTS.BOLSHOI_THEATRE).toEqual([1, 0, 1]);
  });

  it('a wonder holds works in a city with NO matching building, and adds to one that has', () => {
    const bare = { buildings: [] as string[] } as unknown as City;
    // Hermitage alone: 4 art slots, so a whole Artist (3 works) fits.
    expect(placeGreatWorks([bare], GW_ART, () => GW_WONDER_SLOTS.HERMITAGE[GW_ART])).toBe(0);
    expect(bare.greatWorksArt).toBe(GW_WORKS_PER_PERSON[GW_ART]);

    // Amphitheater (2) + Great Library (2) = 4 writing slots: two Writers fit.
    const lib = { buildings: ['AMPHITHEATER'] } as unknown as City;
    const extra = () => GW_WONDER_SLOTS.GREAT_LIBRARY[GW_WRITING];
    expect(placeGreatWorks([lib], GW_WRITING, extra)).toBe(0);
    expect(placeGreatWorks([lib], GW_WRITING, extra)).toBe(0);
    expect(lib.greatWorksWriting).toBe(4);
    // The fifth work has nowhere to go and overflows.
    expect(placeGreatWorks([lib], GW_WRITING, extra)).toBe(GW_WORKS_PER_PERSON[GW_WRITING]);
  });
});
