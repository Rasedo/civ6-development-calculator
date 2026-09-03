import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf, routeIntercontinental } from '../../../cpu/core/seats';
import { routeYieldsInternational } from '../../../cpu/core/trade';
import { getModifiers } from '../../../cpu/core/effects';
import { INTL_ROUTE_YIELD_ROWS, DOMESTIC_ROUTE_YIELD_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState, City } from '../../../cpu/core/types';

/**
 * CIV6 (Treasure Fleet): "Trade Routes receive +3 Gold, +2 Faith, and +1
 * Production. Trade Routes between multiple continents receive TRIPLE these
 * numbers." The install ships the plain row and a second one carrying
 * `Intercontinental` at DOUBLE, so the two together make the triple — which
 * is why the intercontinental row ADDS rather than replaces (C-48).
 *
 * The GPU twin is tests/gpu/treasure_fleet_test.py.
 */
const SPAIN = CIV_LEADERS.findIndex((l) => l.civ === 'SPAIN');
const PLAIN = { gold: 3, faith: 2, production: 1 } as const;

/** Two landmasses split by a column of ocean, and a seat on each side. */
function scene(civRow: number): { state: GameState; home: City; near: City; abroad: City } {
  const map = makeMap(24, 24, 'GRASSLAND');
  for (const t of map.tiles) if (t.col === 12) t.terrain = 'OCEAN';
  const state = makeState(map);
  state.seats.push(emptySeat(1));
  state.seats[0].civ = civRow;
  const home = settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
  const near = settleAt(state, tileAtCoords(state.map, 4, 12).index, 0);
  const abroad = settleAt(state, tileAtCoords(state.map, 18, 5).index, 1);
  return { state, home, near, abroad };
}

describe("Spain's Treasure Fleet", () => {
  it('reads the install: 3/2/1 plain, and the intercontinental row DOUBLES on top', () => {
    for (const list of [INTL_ROUTE_YIELD_ROWS, DOMESTIC_ROUTE_YIELD_ROWS]) {
      const es = list.filter((r) => r.civ === 'SPAIN');
      expect(es.length).toBe(6);
      for (const [y, base] of Object.entries(PLAIN)) {
        const plain = es.find((r) => r.yield === y && !r.intercontinental);
        const across = es.find((r) => r.yield === y && r.intercontinental);
        expect(plain?.amount, y).toBe(base);
        expect(across?.amount, y).toBe(base * 2);
        // the two TOGETHER are the published triple
        expect((plain!.amount + across!.amount), y).toBe(base * 3);
      }
    }
  });

  it('pays the plain amounts on a route within one continent', () => {
    const { state, home, near } = scene(SPAIN);
    // both cities are seat 0's, but the international reader is the one with
    // the roster rows on it; the continents are what this lane measures
    expect(routeIntercontinental(state, home.centerIndex, near.centerIndex)).toBe(false);
    const y = routeYieldsInternational(state, home, near, 0);
    const base = routeYieldsInternational(state, home, near, 1);
    expect(y.gold - base.gold).toBe(PLAIN.gold);
    expect(y.faith - base.faith).toBe(PLAIN.faith);
    expect(y.production - base.production).toBe(PLAIN.production);
  });

  it('triples them when the endpoints sit on different continents', () => {
    const { state, home, abroad } = scene(SPAIN);
    expect(routeIntercontinental(state, home.centerIndex, abroad.centerIndex)).toBe(true);
    const y = routeYieldsInternational(state, home, abroad, 0);
    const base = routeYieldsInternational(state, home, abroad, 1);
    expect(y.gold - base.gold).toBe(PLAIN.gold * 3);
    expect(y.faith - base.faith).toBe(PLAIN.faith * 3);
    expect(y.production - base.production).toBe(PLAIN.production * 3);
  });

  it('pays a seat the roster does not name nothing at all', () => {
    // PLAIN = -1, a seat with no roster row
    const { state, home, abroad } = scene(-1);
    expect(getModifiers(state, 0).intlRouteYields.length).toBe(0);
    const y = routeYieldsInternational(state, home, abroad, 0);
    const b = routeYieldsInternational(state, home, abroad, 1);
    expect(y.gold).toBe(b.gold);
    expect(y.faith).toBe(b.faith);
    expect(y.production).toBe(b.production);
  });

  it('does not let water make a route intercontinental', () => {
    const { state, home } = scene(SPAIN);
    const sea = tileAtCoords(state.map, 12, 5);
    expect(sea.continent).toBe(-1);
    expect(routeIntercontinental(state, home.centerIndex, sea.index)).toBe(false);
  });

  it('gives Spain the same six rows on the domestic list', () => {
    const { state } = scene(SPAIN);
    const m = getModifiers(state, 0);
    expect(m.domesticRouteYields.length).toBe(6);
    expect(m.intlRouteYields.filter((r) => r.civ === 'SPAIN').length).toBe(6);
    expect(seatOf(state, 0)!.civ).toBe(SPAIN);
  });
});
