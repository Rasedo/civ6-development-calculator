/** THE LUXURY ON THE TABLE, TypeScript half.
 *
 * CIV6 (Trade, Demand, and Discuss): the screen trades "Strategic and Luxury
 * Resources", and "Resources and gold per turn, however, are temporary, and
 * once the deal has run its course you will get them back." One copy of a
 * luxury goes over for the deal's term: the receiver holds it, the giver
 * holds one fewer — a giver with one copy loses the amenity it paid.
 *
 * The GPU twin is `tests/gpu/luxury_deal_test.py`.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { dealItemPayable, dealTermOf } from '../../../cpu/core/deals';
import { luxuryAmenities, luxuryHoldings } from '../../../cpu/core/city';
import { DEAL_LUXURY, DEAL_TURNS } from '../../../cpu/data/seats';
import { LUXURY_IDS, resourceImprovement } from '../../../world/resources';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat, SeatActionRecord } from '../../../cpu/core/types';

const WINE = LUXURY_IDS.indexOf('WINE');

function addSeat(state: GameState, seat: number, col: number, row: number): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const s: Seat = { ...emptySeat(seat), name: `Seat${seat}` };
  const city: City = {
    id: s.nextCityId++, name: `City${seat}`, seat, centerIndex: tile.index,
    population: 4, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
    queue: [], isCapital: true, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seat, city.id);
  s.cities.push(city);
  s.capitalTile = tile.index;
  if (state.seats.length <= seat) state.seats.length = seat;
  state.seats[seat] = s;
  return s;
}

/** Seats 0..2 in a row; seat 1 works `wines` improved Wine plots. */
function table(wines: number): GameState {
  const state = makeState(makeMap(20, 12, 'GRASSLAND'));
  state.seats = [];
  addSeat(state, 0, 3, 6);
  addSeat(state, 1, 9, 6);
  addSeat(state, 2, 15, 6);
  for (const s of state.seats) s.treasury = 1000;
  for (const [c, r] of [[8, 6], [10, 6]].slice(0, wines)) {
    const t = tileAtCoords(state.map, c, r);
    t.resource = 'WINE';
    t.improvement = resourceImprovement(t);
  }
  return state;
}

const REC = (over: Partial<SeatActionRecord>): SeatActionRecord =>
  ({ production: [], tech: null, civic: null, units: [], ...over });

function play(state: GameState, recs: Record<number, Partial<SeatActionRecord>>): void {
  state.seatActions = {
    [state.turn - 1]: Object.fromEntries(Object.entries(recs).map(([k, v]) => [k, REC(v)])),
  };
  seatPhase(state);
}

const amen = (state: GameState, seat: number): number =>
  [...luxuryAmenities(state, seat).values()].reduce((a, b) => a + b, 0);

describe('a luxury copy on a deal', () => {
  it('is held by the receiver for the term, and goes home when it ends', () => {
    const state = table(2);
    const before = amen(state, 2);
    play(state, { 1: { offer: [2, [[DEAL_LUXURY, WINE, 1]], []] }, 2: { accept: [1] } });
    expect(dealTermOf(state, 1, 2)?.left).toBe(DEAL_TURNS);
    expect(luxuryHoldings(state, 2).held.get('WINE')).toBe(1);
    expect(luxuryHoldings(state, 2).spare.get('WINE')).toBeUndefined();
    expect(luxuryHoldings(state, 1).spare.get('WINE')).toBe(1);
    expect(luxuryHoldings(state, 1).held.get('WINE')).toBe(1);
    expect(amen(state, 2)).toBe(before + 1);
    for (let i = 0; i < DEAL_TURNS; i++) play(state, {});
    expect(dealTermOf(state, 1, 2)).toBeUndefined();
    expect(luxuryHoldings(state, 2).held.get('WINE')).toBeUndefined();
    expect(luxuryHoldings(state, 1).spare.get('WINE')).toBe(2);
  });

  it("costs a one-copy giver the amenity that copy paid", () => {
    const state = table(1);
    const before = amen(state, 1);
    play(state, { 1: { offer: [2, [[DEAL_LUXURY, WINE, 1]], []] }, 2: { accept: [1] } });
    expect(luxuryHoldings(state, 1).held.get('WINE')).toBe(0);
    expect(amen(state, 1)).toBe(before - 1);
  });

  it('is payable only from a copy the giver can still trade', () => {
    const state = table(1);
    expect(dealItemPayable(state, 0, 2, [DEAL_LUXURY, WINE, 1])).toBe(false);  // none
    expect(dealItemPayable(state, 1, 2, [DEAL_LUXURY, -1, 1])).toBe(false);
    expect(dealItemPayable(state, 1, 2, [DEAL_LUXURY, LUXURY_IDS.length, 1])).toBe(false);
    play(state, { 1: { offer: [2, [[DEAL_LUXURY, WINE, 1]], []] }, 2: { accept: [1] } });
    // the one copy is out on the deal, and a received copy is not the
    // receiver's to pass on
    expect(dealItemPayable(state, 1, 0, [DEAL_LUXURY, WINE, 1])).toBe(false);
    expect(dealItemPayable(state, 2, 0, [DEAL_LUXURY, WINE, 1])).toBe(false);
  });
});

describe('a city founded on a luxury', () => {
  // CIV6: the centre stands in for the improvement (runs/h1_duelw1104 Wine,
  // 1106 Diamonds, 1108 Marble: the record holds the copy under the centre)
  it('holds the copy under its centre, and can trade it', () => {
    const state = table(0);
    const centre = state.map.tiles[state.seats[1].cities[0].centerIndex];
    centre.resource = 'WINE';
    centre.improvement = null;
    expect(luxuryHoldings(state, 1).spare.get('WINE')).toBe(1);
    expect(luxuryHoldings(state, 1).held.get('WINE')).toBe(1);
    expect(amen(state, 1)).toBe(1);
    expect(dealItemPayable(state, 1, 2, [DEAL_LUXURY, WINE, 1])).toBe(true);
  });
});
