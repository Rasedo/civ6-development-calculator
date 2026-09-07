/**
 * Great Works. A WRITER / ARTIST / MUSICIAN's works each seek an open slot
 * that takes them — the Amphitheater's two writing slots, the Art Museum's
 * three art slots, the Broadcast Center's one music slot, a wonder's own —
 * and a work with no slot degrades to the person's instant culture lump.
 * CIV6 (GreatWorks.xml, GS): a Work of Writing pays +2 Culture / 2 Tourism,
 * a Work of Art +3 / 2, Music +4 / 4; no Great Work pays gold. These pin the
 * placement composer, the yields and the Art Museum's theming rule; the GPU
 * great_works_test lane mirrors them.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders, holdWorks } from '../helpers';
import { foundCity, queueDistrict, queueBuilding } from '../../../cpu/core/game';
import { computeCityStats } from '../../../cpu/core/city';
import { ARTIST_WORKS, GW_WORKS_PER_PERSON, personWorkObjects } from '../../../cpu/data/greatPeople';
import {
  GW_HOLDERS, GW_KIND_ART, GW_KIND_MUSIC, GW_KIND_WRITING, GWO_CULTURE, GWO_LANDSCAPE, GWO_MUSIC, GWO_RELIGIOUS,
  GWO_SCULPTURE, GWO_TOURISM, GWO_WRITING, THEMING_MULT, holderSlots,
} from '../../../cpu/data/greatWorks';
import {
  cityGreatWorks, greatWorkTourism, greatWorkYields, gwCountKind, gwWorks, holderThemed, placeGreatWork, workContext,
  type WorkCity,
} from '../../../cpu/core/greatWorks';
import type { City, GameState } from '../../../cpu/core/types';

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
  // the Palace's own any-object slot comes FIRST in the holder table; these
  // scenes read the Amphitheater alone
  city.buildings = city.buildings.filter((b) => b !== 'PALACE');
  return { state, city };
}

/** spend one person's charge in `city`: every work placed, the rest counted */
function activate(state: GameState, city: City, cls: 'WRITER' | 'ARTIST' | 'MUSICIAN', at = 0): number {
  let overflow = 0;
  for (const obj of personWorkObjects(cls, at)) {
    if (placeGreatWork(state, city, { obj, maker: at, era: -1, seat: city.seat }) < 0) overflow += 1;
  }
  return overflow;
}

const holder = (id: string) => GW_HOLDERS.findIndex((h) => h.id === id);
const culture = (state: GameState, city: City) => computeCityStats(state, city).breakdown.buildings.culture;

describe('Great Works', () => {
  it('slots a Writer into the Amphitheater and pays +2 culture per work', () => {
    const { state, city } = cityWithAmphitheater();
    const before = culture(state, city);
    expect(activate(state, city, 'WRITER')).toBe(0); // both works fit the 2 Amphitheater slots
    expect(cityGreatWorks(city)).toBe(GW_WORKS_PER_PERSON[GW_KIND_WRITING]);
    expect(gwCountKind(city, GW_KIND_WRITING)).toBe(2);
    expect(gwWorks(city).map((w) => w.slot)).toEqual(holderSlots(holder('AMPHITHEATER')));
    expect(culture(state, city) - before).toBe(GWO_CULTURE[GWO_WRITING]! * 2);
  });

  it('a MUSIC work pays double a writing work (4 vs 2) and no gold', () => {
    const { state, city } = cityWithAmphitheater();
    expect(queueBuilding(state, city.id, 'MUSEUM', 0).ok).toBe(true); // requiresAny AMPHITHEATER
    expect(queueBuilding(state, city.id, 'BROADCAST_CENTER', 0).ok).toBe(true); // requiresAny MUSEUM
    const b0 = computeCityStats(state, city).breakdown.buildings;
    expect(activate(state, city, 'MUSICIAN')).toBe(1); // 2 works, 1 Broadcast Center slot
    expect(gwCountKind(city, GW_KIND_MUSIC)).toBe(1);
    const b1 = computeCityStats(state, city).breakdown.buildings;
    expect(b1.culture - b0.culture).toBe(GWO_CULTURE[GWO_MUSIC]!);
    expect(GWO_CULTURE[GWO_MUSIC]).toBe(2 * GWO_CULTURE[GWO_WRITING]!); // the real GS ratio
    expect(b1.gold - b0.gold).toBe(0); // NO Great Work pays gold in Civ 6
  });

  it('an ARTIST fills the Art Museum (3 slots, +3 culture each)', () => {
    const { state, city } = cityWithAmphitheater();
    expect(queueBuilding(state, city.id, 'MUSEUM', 0).ok).toBe(true);
    const cul0 = culture(state, city);
    expect(GW_WORKS_PER_PERSON[GW_KIND_ART]).toBe(3); // real Civ 6: an Artist makes 3
    expect(activate(state, city, 'ARTIST', 2)).toBe(0); // Donatello's three sculptures fit exactly
    expect(gwCountKind(city, GW_KIND_ART)).toBe(3);
    expect(culture(state, city) - cul0).toBe(GWO_CULTURE[GWO_SCULPTURE]! * 3); // +9
  });

  it('PRINTING doubles WRITING tourism only', () => {
    const state = makeState();
    const w: WorkCity = { seat: 0, buildings: [] };
    holdWorks(w, GWO_WRITING, 2);
    expect(greatWorkTourism(state, w, false)).toBe(GWO_TOURISM[GWO_WRITING]! * 2);
    expect(greatWorkTourism(state, w, true)).toBe(GWO_TOURISM[GWO_WRITING]! * 2 * 2);
    // ... art and music are NOT doubled
    const am: WorkCity = { seat: 0, buildings: [] };
    holdWorks(am, GWO_LANDSCAPE, 2);
    holdWorks(am, GWO_MUSIC, 1);
    expect(greatWorkTourism(state, am, true)).toBe(greatWorkTourism(state, am, false));
    // ... and CULTURE never moves
    expect(greatWorkYields(state, w).culture).toBe(GWO_CULTURE[GWO_WRITING]! * 2);
  });

  it('greatWorkYields weights every object type separately', () => {
    const state = makeState();
    const mk = (fill: (c: WorkCity) => void) => {
      const c: WorkCity = { seat: 0, buildings: [] };
      fill(c);
      return greatWorkYields(state, c).culture;
    };
    expect(mk((c) => holdWorks(c, GWO_WRITING, 2))).toBe(4);
    expect(mk((c) => holdWorks(c, GWO_MUSIC, 2))).toBe(8);
    expect(mk((c) => holdWorks(c, GWO_RELIGIOUS, 2))).toBe(6);
    expect(mk((c) => { holdWorks(c, GWO_WRITING, 1); holdWorks(c, GWO_SCULPTURE, 1); holdWorks(c, GWO_MUSIC, 1); })).toBe(9);
    expect(mk(() => undefined)).toBe(0);
  });

  it('caps at 2 writing slots and overflows further charges', () => {
    const { state, city } = cityWithAmphitheater();
    expect(activate(state, city, 'WRITER')).toBe(0); // fills both slots
    expect(activate(state, city, 'WRITER')).toBe(2); // second Writer: no slots left
    expect(gwCountKind(city, GW_KIND_WRITING)).toBe(2); // still capped at 2
    expect(cityGreatWorks(city)).toBe(2);
  });

  it('music works overflow when no Broadcast Center exists', () => {
    const { state, city } = cityWithAmphitheater();
    expect(activate(state, city, 'MUSICIAN')).toBe(GW_WORKS_PER_PERSON[GW_KIND_MUSIC]);
    expect(gwCountKind(city, GW_KIND_MUSIC)).toBe(0);
  });

  it('a wonder holds works in a city with NO matching building, and adds to one that has', () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    city.buildings = city.buildings.filter((b) => b !== 'PALACE'); // no Palace slot in the way
    const wt = tileAtCoords(state.map, 9, 9);
    // Hermitage alone: 4 art slots, so a whole Artist (3 works) fits
    city.wonders.push({ id: 'HERMITAGE', tileIndex: wt.index });
    expect(activate(state, city, 'ARTIST', 7)).toBe(3); // ... once it is COMPLETE
    wt.builtWonderComplete = true;
    expect(activate(state, city, 'ARTIST', 7)).toBe(0);
    expect(gwWorks(city).map((w) => w.slot)).toEqual(holderSlots(holder('HERMITAGE')).slice(0, 3));

    // Amphitheater (2) + Great Library (2) = 4 writing slots: two Writers fit,
    // the building's slots before the wonder's
    const lt = tileAtCoords(state.map, 7, 7);
    city.buildings.push('AMPHITHEATER');
    city.wonders.push({ id: 'GREAT_LIBRARY', tileIndex: lt.index });
    lt.builtWonderComplete = true;
    expect(activate(state, city, 'WRITER')).toBe(0);
    expect(gwWorks(city).filter((w) => w.obj === GWO_WRITING).map((w) => w.slot)).toEqual(holderSlots(holder('AMPHITHEATER')));
    expect(activate(state, city, 'WRITER')).toBe(0);
    expect(gwCountKind(city, GW_KIND_WRITING)).toBe(4);
    // the fifth work has nowhere to go and overflows
    expect(activate(state, city, 'WRITER')).toBe(GW_WORKS_PER_PERSON[GW_KIND_WRITING]);
  });

  // CIV6 (Building_GreatWorks, BUILDING_MUSEUM_ART): ThemingSameObjectType +
  // ThemingUniquePerson — "its slots must be filled with Great Works of Art of
  // the same type ... made by different Great Artists".
  it('every Great Work of Art records its object type and its maker', () => {
    const state = makeState();
    const city = { seat: 0, buildings: ['MUSEUM'] } as unknown as City;
    // Michelangelo is artist index 1: Religious, Sculpture, Sculpture
    expect(activate(state, city, 'ARTIST', 1)).toBe(0);
    expect(gwWorks(city).map((w) => w.obj)).toEqual([GWO_RELIGIOUS, GWO_SCULPTURE, GWO_SCULPTURE]);
    expect(gwWorks(city).map((w) => w.maker)).toEqual([1, 1, 1]);
    expect(ARTIST_WORKS[1]).toEqual([GWO_RELIGIOUS, GWO_SCULPTURE, GWO_SCULPTURE]);
    // one artist's own three works can never theme a museum
    expect(holderThemed(state, workContext(state, city), city, holder('MUSEUM'))).toBe(false);
  });

  it('three artists of ONE type theme the museum and double what it holds', () => {
    const state = makeState();
    const museum = holder('MUSEUM');
    const mk = () => ({ seat: 0, buildings: ['MUSEUM'] } as unknown as City);
    // Rublev (0), Michelangelo (1) and Bosch (3) each open with a RELIGIOUS
    // work, so one slot from each fills a same-type, three-artist museum
    const city = mk();
    for (const maker of [0, 1, 3]) {
      expect(placeGreatWork(state, city, { obj: ARTIST_WORKS[maker]![0]!, maker, era: -1, seat: 0 })).toBeGreaterThanOrEqual(0);
    }
    expect(holderThemed(state, workContext(state, city), city, museum)).toBe(true);
    // "the bonus doubles the yields of all items in the Museum"
    expect(greatWorkYields(state, city).culture).toBe(GWO_CULTURE[GWO_RELIGIOUS]! * 3 * THEMING_MULT);
    expect(greatWorkTourism(state, city, false)).toBe(GWO_TOURISM[GWO_RELIGIOUS]! * 3 * THEMING_MULT);

    // a repeated MAKER breaks it, and so does a mismatched TYPE
    const dup = mk();
    for (const maker of [0, 0, 3]) placeGreatWork(state, dup, { obj: GWO_RELIGIOUS, maker, era: -1, seat: 0 });
    expect(holderThemed(state, workContext(state, dup), dup, museum)).toBe(false);
    const mixed = mk();
    let k = 0;
    for (const obj of [GWO_RELIGIOUS, GWO_SCULPTURE, GWO_RELIGIOUS]) placeGreatWork(state, mixed, { obj, maker: k++, era: -1, seat: 0 });
    expect(holderThemed(state, workContext(state, mixed), mixed, museum)).toBe(false);
    expect(greatWorkYields(state, mixed).culture).toBe(GWO_CULTURE[GWO_RELIGIOUS]! * 3);
  });

  it("a Hermitage art slot sits outside the museum's own theming", () => {
    const state = makeState(makeMap(16, 16));
    const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
    city.buildings = city.buildings.filter((b) => b !== 'PALACE');
    city.buildings.push('MUSEUM');
    const wt = tileAtCoords(state.map, 9, 9);
    city.wonders.push({ id: 'HERMITAGE', tileIndex: wt.index });
    wt.builtWonderComplete = true;
    // three themed museum slots, then a fourth work lands in the Hermitage
    let k = 0;
    for (const maker of [0, 1, 3, 5]) {
      expect(placeGreatWork(state, city, { obj: GWO_RELIGIOUS, maker, era: -1, seat: 0 })).toBeGreaterThanOrEqual(0);
      k += 1;
    }
    expect(k).toBe(4);
    expect(gwWorks(city).map((w) => w.slot)).toEqual([...holderSlots(holder('MUSEUM')), holderSlots(holder('HERMITAGE'))[0]]);
    const ctx = workContext(state, city);
    expect(holderThemed(state, ctx, city, holder('MUSEUM'))).toBe(true);
    expect(holderThemed(state, ctx, city, holder('HERMITAGE'))).toBe(false);
    // three works double; the fourth pays once
    expect(greatWorkYields(state, city).culture).toBe(GWO_CULTURE[GWO_RELIGIOUS]! * (3 * THEMING_MULT + 1));
  });
});
