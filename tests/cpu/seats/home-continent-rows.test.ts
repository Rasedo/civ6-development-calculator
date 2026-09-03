import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf, onHomeContinent } from '../../../cpu/core/seats';
import { getModifiers, prodMultFor } from '../../../cpu/core/effects';
import { rosterRouteCapacity } from '../../../cpu/core/trade';
import { PROD_MULT_ROWS, ROUTE_CAPACITY_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

/**
 * The three clauses that read a city's landmass against its seat's HOME one
 * (C-48): Spain's district Production off the capital's continent, Victoria's
 * Trade Route capacity per foreign-continent city, and Phoenicia's 100%-loyal
 * coastal cities at home.
 *
 * The GPU twin is tests/gpu/home_continent_rows_test.py.
 */
const civRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leadRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

/** Two landmasses split by a column of ocean; column 12 is the sea. */
function scene(row: number): GameState {
  const map = makeMap(24, 24, 'GRASSLAND');
  for (const t of map.tiles) if (t.col === 12) t.terrain = 'OCEAN';
  const state = makeState(map);
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  return state;
}

describe("Spain's cities off the capital's continent", () => {
  it('reads the install: +25% toward every district item', () => {
    const rows = PROD_MULT_ROWS.filter((r) => r.offHomeContinent);
    expect(rows.length).toBe(1);
    expect(rows[0].civ).toBe('SPAIN');
    expect(rows[0].pct).toBe(25);
    expect(rows[0].every).toBe('district');
  });

  it('multiplies a district only in a city off the home continent', () => {
    const state = scene(civRow('SPAIN'));
    settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    const rows = getModifiers(state, 0).prodMults;
    const item = { kind: 'district' as const, districtItem: 'CAMPUS' };
    expect(prodMultFor(rows, item, true)).toBeCloseTo(1.25);
    expect(prodMultFor(rows, item, false)).toBe(1);
    // ...and it is a DISTRICT clause, not a blanket one
    expect(prodMultFor(rows, { kind: 'building', building: 'MONUMENT' }, true)).toBe(1);
  });

  it('pays a seat the roster does not name nothing either way', () => {
    const state = scene(-1);
    settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    const rows = getModifiers(state, 0).prodMults;
    expect(prodMultFor(rows, { kind: 'district', districtItem: 'CAMPUS' }, true)).toBe(1);
  });
});

describe("Victoria's capacity per foreign-continent city", () => {
  it('reads the install: one per such city', () => {
    const rows = ROUTE_CAPACITY_ROWS.filter((r) => r.perForeignCity);
    expect(rows.length).toBe(1);
    expect(rows[0].leader).toBe('VICTORIA');
    expect(rows[0].amount).toBe(1);
  });

  it('counts the cities abroad and nothing at home', () => {
    const state = scene(leadRow('VICTORIA'));
    settleAt(state, tileAtCoords(state.map, 4, 5).index, 0);
    expect(rosterRouteCapacity(state, 0)).toBe(0);
    settleAt(state, tileAtCoords(state.map, 4, 12).index, 0);   // same landmass
    expect(rosterRouteCapacity(state, 0)).toBe(0);
    settleAt(state, tileAtCoords(state.map, 18, 5).index, 0);   // across the water
    expect(rosterRouteCapacity(state, 0)).toBe(1);
    settleAt(state, tileAtCoords(state.map, 18, 12).index, 0);  // and another
    expect(rosterRouteCapacity(state, 0)).toBe(2);
  });
});

describe("Phoenicia's coastal cities at home", () => {
  it('is 100% loyal only when coastal AND on the home continent', () => {
    const state = scene(civRow('PHOENICIA'));
    const m = getModifiers(state, 0);
    expect(m.coastalHomeLoyal).toBe(true);
    // the capital's landmass is the home one by construction
    const home = settleAt(state, tileAtCoords(state.map, 11, 5).index, 0);  // beside the sea
    expect(onHomeContinent(state, 0, home.centerIndex)).toBe(true);
    // a city across the water is NOT on the home continent, so the clause
    // cannot reach it however coastal it is
    const abroad = settleAt(state, tileAtCoords(state.map, 13, 15).index, 0);
    expect(onHomeContinent(state, 0, abroad.centerIndex)).toBe(false);
  });

  it('names Phoenicia alone', () => {
    for (const civ of ['SPAIN', 'ENGLAND', 'ROME']) {
      const state = scene(civRow(civ));
      expect(getModifiers(state, 0).coastalHomeLoyal, civ).toBe(false);
    }
    expect(seatOf(scene(-1), 0)!.civ).toBe(-1);
  });
});
