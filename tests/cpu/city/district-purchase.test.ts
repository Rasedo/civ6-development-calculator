/**
 * BUYING A DISTRICT OUTRIGHT.
 *
 * CIV6 (Contractor): "Allows city to purchase Districts with Gold"; (Divine
 * Architect): the same in Faith. Both are pure permissions — CanPurchase
 * booleans on a governor promotion, with no price of their own — so the cost
 * is the engine's: the production cost a BUILDER would pay, through the
 * purchase multiplier a building already pays.
 *
 * The three claims worth pinning are the ones a hand-rolled purchase would get
 * wrong: the price equals the builder's cost times the multiplier (so a
 * discount is worth the same to a buyer), the district finishes through the
 * ONE completion body (so the Encampment's walls and the dedication arrive),
 * and a refusal writes nothing at all — no plot taken, no queue disturbed, no
 * production bank spent.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, expandBorders, grantTechs } from '../helpers';
import { GOVERNOR_INDEX, GOVERNOR_PROMOTION_INDEX, promotionBitValue } from '../../../cpu/data/governors';
import { seatOf } from '../../../cpu/core/seats';
import { governorsOf } from '../../../cpu/core/governors';
import { purchaseSeatDistrict, districtSiteCost } from '../../../cpu/core/phase';
import { computeUnlocks } from '../../../cpu/core/effects';
import { GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT } from '../../../cpu/data/constants';
import type { City, GameState, Seat } from '../../../cpu/core/types';

const P_CONTRACTOR = GOVERNOR_PROMOTION_INDEX.CONTRACTOR!;
const P_DIVINE = GOVERNOR_PROMOTION_INDEX.DIVINE_ARCHITECT!;

function seatGov(state: GameState, city: City, gid: 'REYNA' | 'MOKSHA', promotion: number) {
  const g = governorsOf(seatOf(state, city.seat)!)[GOVERNOR_INDEX[gid]];
  g.appointed = true;
  g.cityId = city.id;
  g.establishTurns = 0;
  g.promotions = promotionBitValue(promotion);
  return g;
}

/** a city with room to build, the Campus opened, and an empty flat plot. */
function scene(): { state: GameState; seat: Seat; city: City; site: number } {
  const state = makeState(makeMap(20, 16));
  for (const t of state.map.tiles) { t.terrain = 'PLAINS'; t.elevation = 'FLAT'; t.feature = null; }
  const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
  expandBorders(state, city, 2);
  grantTechs(state, 'WRITING');
  city.population = 10;                       // past the specialty-district cap
  const seat = seatOf(state, 0)!;
  return { state, seat, city, site: tileAtCoords(state.map, 9, 8).index };
}

function campusCost(state: GameState, seat: Seat): number {
  return districtSiteCost(state, seat, 'CAMPUS', computeUnlocks(state, seat.seat));
}

describe('the permission is the governor promotion', () => {
  it('refuses with no governor in the city, and writes nothing', () => {
    const { state, seat, site } = scene();
    seat.treasury = 100000;
    expect(purchaseSeatDistrict(state, seat, site, 'CAMPUS', false)).toBe(false);
    expect(state.map.tiles[site].district).toBeNull();
    expect(seat.cities[0].districts.some((d) => d.tileIndex === site)).toBe(false);
    expect(seat.treasury).toBe(100000);
  });

  it("refuses the FAITH buy to a governor holding only the GOLD promotion", () => {
    const { state, seat, city, site } = scene();
    seatGov(state, city, 'REYNA', P_CONTRACTOR);
    seat.faith = 100000;
    expect(purchaseSeatDistrict(state, seat, site, 'CAMPUS', true)).toBe(false);
    expect(state.map.tiles[site].district).toBeNull();
    expect(seat.faith).toBe(100000);
  });
});

describe('the price is the builder’s cost through the purchase multiplier', () => {
  it('charges gold and finishes the district in one turn', () => {
    const { state, seat, city, site } = scene();
    seatGov(state, city, 'REYNA', P_CONTRACTOR);
    const cost = campusCost(state, seat);
    expect(cost).toBeGreaterThan(0);
    seat.treasury = 100000;
    const queued = city.queue.length;
    const bank = city.productionBank ?? 0;
    expect(purchaseSeatDistrict(state, seat, site, 'CAMPUS', false)).toBe(true);
    expect(100000 - (seat.treasury ?? 0)).toBe(Math.round(cost * GOLD_PURCHASE_MULT));
    expect(state.map.tiles[site].district).toBe('CAMPUS');
    expect(state.map.tiles[site].districtComplete).toBe(true);
    expect(city.districts.some((d) => d.type === 'CAMPUS' && d.tileIndex === site)).toBe(true);
    // a cheque spends no hammers: the queue and the bank are untouched
    expect(city.queue.length).toBe(queued);
    expect(city.productionBank ?? 0).toBe(bank);
  });

  it('charges faith at the faith multiplier for the Divine Architect', () => {
    const { state, seat, city, site } = scene();
    seatGov(state, city, 'MOKSHA', P_DIVINE);
    const cost = campusCost(state, seat);
    seat.faith = 100000;
    seat.treasury = 7;
    expect(purchaseSeatDistrict(state, seat, site, 'CAMPUS', true)).toBe(true);
    expect(100000 - (seat.faith ?? 0)).toBe(Math.round(cost * FAITH_PURCHASE_MULT));
    expect(seat.treasury).toBe(7);           // the other purse is not touched
    expect(state.map.tiles[site].districtComplete).toBe(true);
  });
});

describe('an unaffordable purchase writes nothing', () => {
  it('leaves the plot empty and the purse alone', () => {
    const { state, seat, city, site } = scene();
    seatGov(state, city, 'REYNA', P_CONTRACTOR);
    seat.treasury = 1;
    expect(purchaseSeatDistrict(state, seat, site, 'CAMPUS', false)).toBe(false);
    expect(seat.treasury).toBe(1);
    expect(state.map.tiles[site].district).toBeNull();
    expect(state.map.tiles[site].districtComplete).toBe(false);
    expect(city.districts.some((d) => d.tileIndex === site)).toBe(false);
    expect(city.queue.length).toBe(0);
  });

  it('refuses a plot that is not this city’s ground', () => {
    const { state, seat, city } = scene();
    seatGov(state, city, 'REYNA', P_CONTRACTOR);
    seat.treasury = 100000;
    const far = tileAtCoords(state.map, 17, 14).index;
    expect(purchaseSeatDistrict(state, seat, far, 'CAMPUS', false)).toBe(false);
    expect(state.map.tiles[far].district).toBeNull();
    expect(seat.treasury).toBe(100000);
  });
});

describe('the completion is the ONE completion body', () => {
  it('gives the Encampment its walls, as a built one gets them', () => {
    const { state, seat, city } = scene();
    seatGov(state, city, 'REYNA', P_CONTRACTOR);
    grantTechs(state, 'BRONZE_WORKING');
    seat.treasury = 100000;
    // the Encampment may not touch the city centre, so it goes two plots out
    const far = tileAtCoords(state.map, 10, 8).index;
    expect(purchaseSeatDistrict(state, seat, far, 'ENCAMPMENT', false)).toBe(true);
    expect(state.map.tiles[far].districtComplete).toBe(true);
    expect(state.map.tiles[far].encampHp).toBeGreaterThan(0);
  });
});
