/**
 * GREAT WORKS HELD PER HOLDER. CIV6 (`Building_GreatWorks`): a building or
 * wonder declares slots of one type, a slot type takes a set of object types,
 * and a work sits in ONE holder's slot. These pin the table both engines read
 * (`cpu/data/greatWorks.ts`) against the catalogs it names, the capacity a
 * city's holders give it, the placement order, the two museums' theming
 * rules, Kristina's auto-theming and Nkisi's widened Palace; the GPU
 * great_works_holders lane mirrors them.
 */
import { describe, it, expect } from 'vitest';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { BUILT_WONDERS } from '../../../cpu/data/builtWonders';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { computeCityStats, seatTourism } from '../../../cpu/core/city';
import { emptySeat } from '../../../cpu/core/seats';
import {
  GW_HOLDERS, GW_LAYOUT, GW_LAYOUT_W, GWS_ACCEPTS, GWS_COUNT, GWO_COUNT, GWS_PALACE, GWS_ART, GWS_CATHEDRAL,
  GWO_RELIGIOUS, GWO_SCULPTURE, GWO_WRITING, GWO_RELIC, GWO_ARTIFACT, GWO_MUSIC, GWO_CULTURE, GWO_TOURISM,
  GWO_LANDSCAPE, THEMING_MULT, slotAccepts, gwKindOf, holderSlots, EXTRA_SLOT_ROWS, GW_THEME_ART, GW_THEME_ARTIFACT,
} from '../../../cpu/data/greatWorks';
import { ARTIST_WORKS } from '../../../cpu/data/greatPeople';
import {
  greatWorkTourism, greatWorkYields, gwHasRoom, gwWorks, holderThemed, placeGreatWork, workContext,
} from '../../../cpu/core/greatWorks';
import type { City, GameState } from '../../../cpu/core/types';

const holder = (id: string) => GW_HOLDERS.findIndex((h) => h.id === id);
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

/** a two-seat scene, seat 0 playing `row`, with one city holding `buildings`
 *  (the capital's Palace stripped unless asked for) */
function scene(row: number, buildings: string[], keepPalace = false): { state: GameState; city: City } {
  const state = makeState(makeMap(14, 14));
  state.seats.push(emptySeat(1));
  state.seats[0]!.civ = row;
  state.seats[1]!.civ = seatRow('AMERICA');
  const city = settleAt(state, tileAtCoords(state.map, 7, 7).index, 0);
  if (!keepPalace) city.buildings = city.buildings.filter((b) => b !== 'PALACE');
  city.buildings.push(...buildings);
  return { state, city };
}

/** a COMPLETE wonder standing in the city */
function raise(state: GameState, city: City, id: string, col: number, row: number): void {
  const t = tileAtCoords(state.map, col, row);
  t.builtWonderComplete = true;
  city.wonders.push({ id, tileIndex: t.index });
}

const work = (obj: number, maker = -1, era = -1, seat = 0) => ({ obj, maker, era, seat });
const PLAIN = seatRow('AMERICA');

describe('the great-work holder table', () => {
  it('names only buildings and wonders the engine builds', () => {
    for (const h of GW_HOLDERS) {
      if (h.wonder) expect(BUILT_WONDERS[h.id], h.id).toBeDefined();
      else expect(BUILDINGS[h.id], h.id).toBeDefined();
    }
  });

  it('lays out every slot once, holders in table order, the Palace widened by its widest extra row', () => {
    const base = GW_HOLDERS.reduce((n, h) => n + h.slots.reduce((m, s) => m + s.count, 0), 0);
    const extra = EXTRA_SLOT_ROWS.reduce((n, r) => Math.max(n, r.amount), 0);
    expect(GW_LAYOUT_W).toBe(base + extra);
    expect(GW_LAYOUT_W).toBe(37);
    let last = -1;
    for (const s of GW_LAYOUT) { expect(s.holder).toBeGreaterThanOrEqual(last); last = s.holder; }
    expect(holderSlots(holder('PALACE')).length).toBe(1 + 4);
    expect(GW_LAYOUT.filter((s) => s.extraRank >= 0).map((s) => s.extraRank)).toEqual([0, 1, 2, 3]);
  });

  it('accepts what GreatWork_ValidSubTypes says: a Palace slot anything, a Cathedral slot religious art only', () => {
    expect(GWS_ACCEPTS.length).toBe(GWS_COUNT);
    for (let o = 0; o < GWO_COUNT; o++) expect(slotAccepts(GWS_PALACE, o)).toBe(true);
    expect(slotAccepts(GWS_CATHEDRAL, GWO_RELIGIOUS)).toBe(true);
    expect(slotAccepts(GWS_CATHEDRAL, GWO_SCULPTURE)).toBe(false);
    expect(slotAccepts(GWS_ART, GWO_SCULPTURE)).toBe(true);
    expect(slotAccepts(GWS_ART, GWO_WRITING)).toBe(false);
    expect([GWO_WRITING, GWO_SCULPTURE, GWO_MUSIC, GWO_RELIC, GWO_ARTIFACT].map(gwKindOf)).toEqual([0, 1, 2, -1, -1]);
  });

  it('gives the two museums their theming rules and nobody else one', () => {
    const themed = GW_HOLDERS.filter((h) => h.theme !== 0).map((h) => [h.id, h.theme]);
    expect(themed).toEqual([['MUSEUM', GW_THEME_ART], ['ARCHAEOLOGICAL_MUSEUM', GW_THEME_ARTIFACT]]);
  });
});

describe('capacity comes from the holders standing in the city', () => {
  it('a bare capital holds ONE work of any kind in its Palace, and refuses a second', () => {
    const { state, city } = scene(PLAIN, [], true);
    expect(gwHasRoom(state, city, GWO_MUSIC)).toBe(true);
    expect(placeGreatWork(state, city, work(GWO_RELIC))).toBe(holderSlots(holder('PALACE'))[0]);
    for (let o = 0; o < GWO_COUNT; o++) expect(gwHasRoom(state, city, o)).toBe(false);
    expect(placeGreatWork(state, city, work(GWO_WRITING))).toBe(-1);
    expect(gwWorks(city)).toHaveLength(1);
  });

  it('a city with no holder at all refuses every work', () => {
    const { state, city } = scene(PLAIN, []);
    for (let o = 0; o < GWO_COUNT; o++) expect(gwHasRoom(state, city, o)).toBe(false);
  });

  it('a Cathedral takes a religious painting and nothing else', () => {
    const { state, city } = scene(PLAIN, ['CATHEDRAL']);
    expect(gwHasRoom(state, city, GWO_SCULPTURE)).toBe(false);
    expect(gwHasRoom(state, city, GWO_RELIC)).toBe(false);
    expect(placeGreatWork(state, city, work(GWO_RELIGIOUS, 0))).toBe(holderSlots(holder('CATHEDRAL'))[0]);
  });

  it('works land holder by holder in the table order, slot by slot', () => {
    const { state, city } = scene(PLAIN, ['AMPHITHEATER'], true);
    raise(state, city, 'GREAT_LIBRARY', 8, 8);
    const got: number[] = [];
    for (let i = 0; i < 6; i++) got.push(placeGreatWork(state, city, work(GWO_WRITING, i)));
    // the Palace's one, the Amphitheater's two, the Great Library's two, then nowhere
    expect(got).toEqual([
      holderSlots(holder('PALACE'))[0],
      ...holderSlots(holder('AMPHITHEATER')),
      ...holderSlots(holder('GREAT_LIBRARY')),
      -1,
    ]);
  });

  it('a pillaged holder accepts nothing new and keeps paying what it holds', () => {
    const { state, city } = scene(PLAIN, ['AMPHITHEATER']);
    expect(placeGreatWork(state, city, work(GWO_WRITING, 0))).toBeGreaterThanOrEqual(0);
    city.pillagedBuildings = ['AMPHITHEATER'];
    expect(gwHasRoom(state, city, GWO_WRITING)).toBe(false);
    expect(greatWorkYields(state, city).culture).toBe(GWO_CULTURE[GWO_WRITING]);
  });
});

describe('theming per holder', () => {
  it('the Art Museum themes on ONE object type from three makers — three sculptures too', () => {
    const { state, city } = scene(PLAIN, ['MUSEUM']);
    const museum = holder('MUSEUM');
    // Donatello (2), Lewis (14) and Collot (16) each open with a SCULPTURE
    for (const maker of [2, 14, 16]) {
      expect(ARTIST_WORKS[maker]![0]).toBe(GWO_SCULPTURE);
      expect(placeGreatWork(state, city, work(GWO_SCULPTURE, maker))).toBeGreaterThanOrEqual(0);
    }
    expect(holderThemed(state, workContext(state, city), city, museum)).toBe(true);
    expect(greatWorkYields(state, city).culture).toBe(GWO_CULTURE[GWO_SCULPTURE]! * 3 * THEMING_MULT);
    expect(greatWorkTourism(state, city, false)).toBe(GWO_TOURISM[GWO_SCULPTURE]! * 3 * THEMING_MULT);
  });

  it('the Archaeological Museum themes on ONE era from three civilizations', () => {
    const { state, city } = scene(PLAIN, ['ARCHAEOLOGICAL_MUSEUM']);
    const museum = holder('ARCHAEOLOGICAL_MUSEUM');
    const dig = (eras: number[], seats: number[]) => {
      delete city.greatWorks;
      eras.forEach((era, i) => placeGreatWork(state, city, work(GWO_ARTIFACT, -1, era, seats[i]!)));
      return holderThemed(state, workContext(state, city), city, museum);
    };
    expect(dig([2, 2, 2], [0, 1, 200])).toBe(true); // the barbarians are a civilization here
    expect(greatWorkYields(state, city).culture).toBe(GWO_CULTURE[GWO_ARTIFACT]! * 3 * THEMING_MULT);
    expect(dig([2, 2, 2], [0, 1, 1])).toBe(false);
    expect(dig([2, 3, 2], [0, 1, 2])).toBe(false);
    expect(dig([2, 2], [0, 1])).toBe(false);
  });

  it("Nkisi pays Kongo per SCULPTURE held, and the theming doubles the work's own face only", () => {
    const yields = (row: number) => {
      const { state, city } = scene(row, ['MUSEUM']);
      for (const maker of [2, 14, 16]) placeGreatWork(state, city, work(GWO_SCULPTURE, maker));
      return computeCityStats(state, city).breakdown.buildings;
    };
    const kongo = yields(seatRow('KONGO'));
    const plain = yields(PLAIN);
    // +2 Food, +2 Production, +1 Faith, +4 Gold per sculpture — three of them,
    // and the museum's theming does not touch the roster's adders
    expect(kongo.food - plain.food).toBe(2 * 3);
    expect(kongo.production - plain.production).toBe(2 * 3);
    expect(kongo.faith - plain.faith).toBe(1 * 3);
    expect(kongo.gold - plain.gold).toBe(4 * 3);
    expect(kongo.culture).toBe(plain.culture);
  });

  it("Kristina's wonder of two slots themes itself once full, and pays double culture AND tourism", () => {
    const run = (row: number) => {
      const { state, city } = scene(row, []);
      raise(state, city, 'GREAT_LIBRARY', 8, 8);
      placeGreatWork(state, city, work(GWO_WRITING, 0));
      const half = { themed: holderThemed(state, workContext(state, city), city, holder('GREAT_LIBRARY')), tourism: seatTourism(state, 0) };
      placeGreatWork(state, city, work(GWO_WRITING, 0)); // the same writer's second — no rule asks
      return {
        half,
        themed: holderThemed(state, workContext(state, city), city, holder('GREAT_LIBRARY')),
        culture: greatWorkYields(state, city).culture,
        tourism: seatTourism(state, 0),
      };
    };
    const kristina = run(leaderRow('KRISTINA'));
    expect(kristina.half.themed).toBe(false); // one of two slots: not yet
    expect(kristina.themed).toBe(true);
    expect(kristina.culture).toBe(GWO_CULTURE[GWO_WRITING]! * 2 * THEMING_MULT);
    expect(kristina.tourism - kristina.half.tourism).toBe(GWO_TOURISM[GWO_WRITING]! * (2 * THEMING_MULT - 1));
    const plain = run(PLAIN);
    expect(plain.themed).toBe(false);
    expect(plain.culture).toBe(GWO_CULTURE[GWO_WRITING]! * 2);
    expect(plain.tourism - plain.half.tourism).toBe(GWO_TOURISM[GWO_WRITING]!);
  });

  it("Kristina's BUILDING needs three slots: the Amphitheater never auto-themes, a mixed Museum does", () => {
    const { state, city } = scene(leaderRow('KRISTINA'), ['AMPHITHEATER', 'MUSEUM']);
    placeGreatWork(state, city, work(GWO_WRITING, 0));
    placeGreatWork(state, city, work(GWO_WRITING, 0));
    // Michelangelo's own three — religious, sculpture, sculpture — theme
    // nothing by the rule
    for (const obj of ARTIST_WORKS[1]!) placeGreatWork(state, city, work(obj, 1));
    const ctx = workContext(state, city);
    expect(holderThemed(state, ctx, city, holder('AMPHITHEATER'))).toBe(false);
    expect(holderThemed(state, ctx, city, holder('MUSEUM'))).toBe(true);
    const plain = scene(PLAIN, ['MUSEUM']);
    for (const obj of ARTIST_WORKS[1]!) placeGreatWork(plain.state, plain.city, work(obj, 1));
    expect(holderThemed(plain.state, workContext(plain.state, plain.city), plain.city, holder('MUSEUM'))).toBe(false);
  });
});

describe("Nkisi's Palace", () => {
  it('holds five works of any kind for Kongo, one for anyone else', () => {
    const fill = (row: number) => {
      const { state, city } = scene(row, [], true);
      let n = 0;
      for (const obj of [GWO_RELIC, GWO_WRITING, GWO_LANDSCAPE, GWO_MUSIC, GWO_ARTIFACT, GWO_SCULPTURE]) {
        if (placeGreatWork(state, city, work(obj, 0)) >= 0) n += 1;
      }
      return n;
    };
    expect(fill(seatRow('KONGO'))).toBe(5);
    expect(fill(PLAIN)).toBe(1);
  });
});
