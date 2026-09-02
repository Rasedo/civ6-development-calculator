import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt, grantTechs } from '../helpers';
import { emptySeat } from '../../../cpu/core/seats';
import { seatPhase } from '../../../cpu/core/phase';
import { computeCityStats } from '../../../cpu/core/city';
import { prodMultFor, getModifiers } from '../../../cpu/core/effects';
import { routeYieldsInternational, tradeCapacity, rosterRouteCapacity } from '../../../cpu/core/trade';
import { neighbors } from '../../../world/hex';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { PROD_MULT_ROWS, DISTRICT_ADJ_ROWS, INTL_ROUTE_YIELD_ROWS, ROUTE_CAPACITY_ROWS } from '../../../cpu/data/civilizations';
import type { City, GameState, Tile } from '../../../cpu/core/types';

/**
 * THE ROSTER'S DATA ROWS (CIV6, the install's TraitModifiers): production
 * percentages, Meiji Restoration's district adjacency, Radio Oranje's route
 * culture, and the capacity rows of Nîhithaw and Founder of Carthage — one
 * clause per assertion, on the site that pays it.
 */
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);

function placeDistrict(state: GameState, city: City, type: 'HOLY_SITE' | 'CAMPUS' | 'GOVERNMENT_PLAZA', tile: Tile): void {
  tile.district = type;
  tile.districtComplete = true;
  city.districts.push({ type, tileIndex: tile.index } as City['districts'][number]);
}

describe('the production rows', () => {
  it('prodMultFor multiplies the rows that name the item', () => {
    expect(prodMultFor(PROD_MULT_ROWS.filter((r) => r.civ === 'ENGLAND'), { building: 'WORKSHOP', district: 'INDUSTRIAL_ZONE' })).toBe(1.2);
    expect(prodMultFor(PROD_MULT_ROWS.filter((r) => r.civ === 'ENGLAND'), { building: 'MONUMENT', district: 'CITY_CENTER' })).toBe(1);
    expect(prodMultFor(PROD_MULT_ROWS.filter((r) => r.civ === 'GEORGIA'), { building: 'ANCIENT_WALLS', district: 'CITY_CENTER' })).toBe(1.5);
    expect(prodMultFor(PROD_MULT_ROWS.filter((r) => r.civ === 'OTTOMAN'), { promoClass: 'SIEGE' })).toBe(1.5);
    expect(prodMultFor(PROD_MULT_ROWS.filter((r) => r.civ === 'OTTOMAN'), { promoClass: 'MELEE' })).toBe(1);
  });

  it('pay on the queue: England +20% on a Workshop, Georgia +50% on walls, the Ottomans +50% on a Catapult', () => {
    const run = (civ: string, item: City['queue'][number]): number => {
      const state = makeState(makeMap(12, 12, 'GRASSLAND'));
      state.seats[0].civ = seatRow(civ);
      const city = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
      city.queue.push({ ...item }); // a fresh entry per run: the phase writes its progress
      seatPhase(state);
      return city.queue[0].progress;
    };
    const ws = { kind: 'building', building: 'WORKSHOP', progress: 0 } as City['queue'][number];
    expect(run('ENGLAND', ws)).toBe(run('AMERICA', ws) * 1.2); // America holds no production row
    const walls = { kind: 'building', building: 'ANCIENT_WALLS', progress: 0 } as City['queue'][number];
    expect(run('GEORGIA', walls)).toBe(run('AMERICA', walls) * 1.5);
    const cat = { kind: 'unit', unit: 'CATAPULT', progress: 0 } as City['queue'][number];
    expect(run('OTTOMAN', cat)).toBe(run('AMERICA', cat) * 1.5);
    expect(run('OTTOMAN', ws)).toBe(run('AMERICA', ws));
  });
});

describe('Meiji Restoration', () => {
  it('adds +1 to a district per adjacent district, Japan alone', () => {
    expect(DISTRICT_ADJ_ROWS.length).toBe(6);
    const faithOf = (civ: string): number => {
      const state = makeState(makeMap(12, 12, 'GRASSLAND'));
      state.seats[0].civ = seatRow(civ);
      const city = settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
      const around = neighbors(state.map, state.map.tiles[city.centerIndex]);
      const hs = around[0];
      placeDistrict(state, city, 'HOLY_SITE', hs);
      const beside = neighbors(state.map, hs).find((t) => t.index !== city.centerIndex && !t.district)!;
      placeDistrict(state, city, 'CAMPUS', beside);
      expect(getModifiers(state, 0).districtAdjacencyAdd.HOLY_SITE?.length ?? 0).toBe(civ === 'JAPAN' ? 1 : 0);
      // the centre is an adjacent district too: +1 per neighbour holding one
      const n = neighbors(state.map, hs).filter((t) => t.district === 'CITY_CENTER' || (t.district && t.districtComplete)).length;
      return computeCityStats(state, city).breakdown.districts.faith - (civ === 'JAPAN' ? n : 0);
    };
    expect(faithOf('JAPAN')).toBe(faithOf('AMERICA'));
  });
});

describe('Radio Oranje', () => {
  it('pays +2 Culture on an international route the Netherlands send', () => {
    expect(INTL_ROUTE_YIELD_ROWS.length).toBe(1);
    const state = makeState(makeMap(12, 12, 'GRASSLAND'));
    state.seats.push(emptySeat(1));
    state.seats[0].civ = seatRow('NETHERLANDS');
    state.seats[1].civ = seatRow('ROME');
    settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
    const dest = settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
    expect(getModifiers(state, 0).leader).toBe('WILHELMINA');
    expect(routeYieldsInternational(state, dest, 0).culture).toBe(2);
    expect(routeYieldsInternational(state, dest, 1).culture).toBe(0);
  });
});

describe('the capacity rows', () => {
  it("Nîhithaw: +1 at Pottery once a capital stands; Founder of Carthage: +1 per plaza and tier", () => {
    expect(ROUTE_CAPACITY_ROWS.length).toBe(5);
    const cree = makeState(makeMap(12, 12, 'GRASSLAND'));
    cree.seats[0].civ = seatRow('CREE');
    expect(rosterRouteCapacity(cree, 0)).toBe(0); // no capital yet
    settleAt(cree, tileAtCoords(cree.map, 6, 6).index, 0);
    expect(rosterRouteCapacity(cree, 0)).toBe(0); // no Pottery yet
    grantTechs(cree, 'POTTERY');
    expect(rosterRouteCapacity(cree, 0)).toBe(1);
    expect(tradeCapacity(cree, 0)).toBe(1);
    const dido = makeState(makeMap(12, 12, 'GRASSLAND'));
    dido.seats[0].civ = seatRow('PHOENICIA');
    expect(getModifiers(dido, 0).leader).toBe('DIDO');
    const city = settleAt(dido, tileAtCoords(dido.map, 6, 6).index, 0);
    expect(rosterRouteCapacity(dido, 0)).toBe(0);
    placeDistrict(dido, city, 'GOVERNMENT_PLAZA', neighbors(dido.map, dido.map.tiles[city.centerIndex])[0]);
    expect(rosterRouteCapacity(dido, 0)).toBe(1);
    city.buildings.push('ANCESTRAL_HALL');
    expect(rosterRouteCapacity(dido, 0)).toBe(2);
    city.buildings.push('GRAND_MASTERS_CHAPEL');
    expect(rosterRouteCapacity(dido, 0)).toBe(3);
    const rome = makeState(makeMap(12, 12, 'GRASSLAND'));
    rome.seats[0].civ = seatRow('ROME');
    settleAt(rome, tileAtCoords(rome.map, 6, 6).index, 0);
    grantTechs(rome, 'POTTERY');
    expect(rosterRouteCapacity(rome, 0)).toBe(0);
  });
});
