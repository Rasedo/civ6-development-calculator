import { describe, it, expect } from 'vitest';
import { makeState, holdWorks } from '../helpers';
import { drainRelicReserve, greatWorkYields, gwCountObjs, placeGreatWorkIn, relicTourism, type WorkCity } from '../../../cpu/core/greatWorks';
import { GW_HOLDERS, GWO_FAITH, GWO_RELIC, GWO_TOURISM, GWS_RELIC } from '../../../cpu/data/greatWorks';
import type { GameState } from '../../../cpu/core/types';

// RELICS. Real Civ 6 counts a Relic as a Great Work held in a TEMPLE's single
// slot (GREATWORKSLOT_RELIC), paying +4 Faith and +8 Tourism — the densest
// tourism source in the game. Created when an Apostle carrying the MARTYR
// promotion is killed in theological combat; `theologicalCombatPhase` reads
// the promotion bit at the death. A wonder holds relics too (Mont St. Michel
// 2, St. Basil's 3), in its own slots beside the Temple's.
//
// rFaith/rTourism are both compared trace columns, so the gate exercises the
// grant — these pokes pin the PLACEMENT rules the gate cannot isolate.

const relic = { obj: GWO_RELIC, maker: -1, era: -1, seat: 0 };
const city = (buildings: string[], relics = 0): WorkCity => {
  const c: WorkCity = { seat: 0, buildings };
  if (relics) holdWorks(c, GWO_RELIC, relics);
  return c;
};
const relics = (c: WorkCity) => gwCountObjs(c, [GWO_RELIC]);

/** a city whose complete wonder `id` stands on a fresh tile */
function withWonder(state: GameState, c: WorkCity, id: string, tile: number): WorkCity {
  state.map.tiles[tile]!.builtWonderComplete = true;
  (c.wonders ??= []).push({ id, tileIndex: tile });
  return c;
}

describe('relics', () => {
  it('sourced: a TEMPLE holds ONE relic worth 4 faith and 8 tourism', () => {
    const temple = GW_HOLDERS.find((h) => h.id === 'TEMPLE')!;
    expect(temple.slots).toEqual([{ type: GWS_RELIC, count: 1 }]);
    expect(GWO_FAITH[GWO_RELIC]).toBe(4);
    expect(GWO_TOURISM[GWO_RELIC]).toBe(8);
  });

  it('yields scale with the count, and a Relic pays no culture', () => {
    const state = makeState();
    const c = city(['TEMPLE'], 3);
    expect(greatWorkYields(state, c)).toEqual({ culture: 0, faith: 12 });
    expect(relicTourism(state, c)).toBe(24);
    expect(greatWorkYields(state, city([]))).toEqual({ culture: 0, faith: 0 });
  });

  it('fills the LOWEST city with an open temple slot (array order)', () => {
    const state = makeState();
    const cities = [city(['SHRINE']), city(['TEMPLE']), city(['TEMPLE'])];
    expect(placeGreatWorkIn(state, cities, relic)).toBe(cities[1]);
    expect(cities.map(relics)).toEqual([0, 1, 0]);
  });

  it('a full slot is skipped for the next city', () => {
    const state = makeState();
    const cities = [city(['TEMPLE'], 1), city(['TEMPLE'])];
    expect(placeGreatWorkIn(state, cities, relic)).toBe(cities[1]);
    expect(cities.map(relics)).toEqual([1, 1]);
  });

  it('a relic with no open slot anywhere finds no home, and nothing is written', () => {
    const state = makeState();
    const cities = [city(['TEMPLE'], 1), city(['SHRINE'])];
    expect(placeGreatWorkIn(state, cities, relic)).toBeUndefined();
    expect(cities.map(relics)).toEqual([1, 0]);
    expect(placeGreatWorkIn(state, [], relic)).toBeUndefined();
  });

  it("sourced: St. Basil's holds 3 relics and Mont St. Michel 2", () => {
    expect(GW_HOLDERS.find((h) => h.id === 'ST_BASILS_CATHEDRAL')!.slots).toEqual([{ type: GWS_RELIC, count: 3 }]);
    expect(GW_HOLDERS.find((h) => h.id === 'MONT_ST_MICHEL')!.slots).toEqual([{ type: GWS_RELIC, count: 2 }]);
  });

  it('a wonder holds relics in a city with NO temple, and adds to one that has', () => {
    const state = makeState();
    const basil = withWonder(state, city([]), 'ST_BASILS_CATHEDRAL', 3);
    const cities = [basil, city(['TEMPLE'])];
    expect(placeGreatWorkIn(state, cities, relic)).toBe(basil); // the wonder's slot, no temple needed
    expect(relics(basil)).toBe(1);

    const both = withWonder(state, city(['TEMPLE'], 1), 'ST_BASILS_CATHEDRAL', 4);
    for (let i = 0; i < 3; i++) expect(placeGreatWorkIn(state, [both], relic)).toBe(both);
    expect(relics(both)).toBe(4); // temple 1 + wonder 3
    expect(placeGreatWorkIn(state, [both], relic)).toBeUndefined(); // ... and no more
  });

  it('a held relic goes out as soon as a slot opens, lowest city first', () => {
    // CIV6: a Relic with no open slot waits in reserve.
    const state = makeState();
    const cities = [city(['SHRINE']), city(['SHRINE'])];
    expect(placeGreatWorkIn(state, cities, relic)).toBeUndefined(); // nothing to hold it -> held
    let held = 3;
    expect(drainRelicReserve(state, held, cities, 0)).toBe(3); // still no room
    cities[0]!.buildings.push('TEMPLE');
    cities[1]!.buildings.push('TEMPLE');
    held = drainRelicReserve(state, held, cities, 0);
    expect(cities.map(relics)).toEqual([1, 1]);
    expect(held).toBe(1); // two slots opened, one relic still waiting
  });

  it('the drain never places more than it holds', () => {
    const state = makeState();
    const cities = [city(['TEMPLE']), city(['TEMPLE'])];
    expect(drainRelicReserve(state, 1, cities, 0)).toBe(0);
    expect(cities.map(relics)).toEqual([1, 0]); // the second slot stays open
  });

  it('a pillaged Temple keeps and pays its relic, and takes no other', () => {
    const state = makeState();
    const c = city(['TEMPLE'], 1);
    c.pillagedBuildings = ['TEMPLE'];
    expect(greatWorkYields(state, c).faith).toBe(4);
    const other = city(['TEMPLE']);
    other.pillagedBuildings = ['TEMPLE'];
    expect(placeGreatWorkIn(state, [other], relic)).toBeUndefined();
  });
});
