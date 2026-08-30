/** THE NEGOTIATED DEAL, TypeScript half.
 *
 * Sourced from the Civilopedia (Trade, Demand, and Discuss; Ending a War;
 * Open Borders) and the wiki's Diplomacy and Espionage pages:
 *   - "You can trade anything from Gold to resources to cities!", and the
 *     screen's own list is "Gold (either lump sums or payments per turn),
 *     Diplomatic Favor ..., Strategic and Luxury Resources, Great Works,
 *     cities (if they and their fortifications are at full HP), and diplomatic
 *     agreements".
 *   - "an 'Accept Deal' button will appear, which will confirm the trade that
 *     is on the table."
 *   - "Sums of Gold, Great Works, Relics, Artifacts, and captured Spies are all
 *     permanent trades... Resources and gold per turn, however, are temporary,
 *     and once the deal has run its course you will get them back."
 *   - "All Deals, Demands, and Promises last for 30 turns."
 *   - "The peaceful resolution of a war involves diplomatic negotiations...
 *     You or your opponent may initiate a Peace Deal."
 *   - a captured spy is "imprisoned, but not killed"; released, it "is
 *     immediately returned to the original owner's Capital".
 *
 * The GPU twin is `tests/gpu/geopolitics_test.py`'s poke m.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { seatPhase } from '../../../cpu/core/phase';
import { civsAtWar, emptySeat, setTileOwner, setWar, setWarTurnsWith, borderTurnsFrom } from '../../../cpu/core/seats';
import {
  dealOfferOf, dealTermOf, setSpyHeld, spyHeldWith, cityTradeable,
} from '../../../cpu/core/deals';
import {
  AGREEMENT_TURNS, DEAL_CITY, DEAL_FAVOR, DEAL_GOLD, DEAL_GOLD_PER_TURN, DEAL_GREAT_WORK,
  DEAL_OPEN_BORDERS, DEAL_RESOURCE, DEAL_SPY, DEAL_TURNS, WAR_MIN_TURNS,
} from '../../../cpu/data/seats';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import { grantStockpile, stockOf } from '../../../cpu/core/stockpile';
import { spiesOf } from '../../../cpu/core/espionage';
import { gwCount } from '../../../cpu/data/greatPeople';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat, SeatActionRecord } from '../../../cpu/core/types';

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

function table(): GameState {
  const state = makeState(makeMap(20, 12, 'GRASSLAND'));
  state.seats = [];
  addSeat(state, 0, 3, 6);
  addSeat(state, 1, 9, 6);
  addSeat(state, 2, 15, 6);
  for (const s of state.seats) s.treasury = 1000;
  return state;
}

const REC = (over: Partial<SeatActionRecord>): SeatActionRecord =>
  ({ production: [], tech: null, civic: null, units: [], ...over });

function play(state: GameState, recs: Record<number, Partial<SeatActionRecord>>): void {
  state.seatActions = {
    [state.turn - 1]: Object.fromEntries(
      Object.entries(recs).map(([k, v]) => [k, REC(v)]),
    ),
  };
  seatPhase(state);
}

describe('the table, and what crosses it', () => {
  it('an offer alone moves nothing; the answer is what confirms it', () => {
    const state = table();
    play(state, { 1: { offer: [2, [[DEAL_GOLD, 100, 0]], [[DEAL_FAVOR, 5, 0]]] } });
    expect(state.seats[1].treasury).toBe(1000);
    expect(dealOfferOf(state, 1, 2)).toBeTruthy();
    // ...and nothing crosses until the other side presses the button
    state.seats[2].diplomaticFavor = 9;
    play(state, { 2: { accept: [1] } });
    expect(state.seats[1].treasury).toBe(900);
    expect(state.seats[2].treasury).toBe(1100);
    expect(state.seats[1].diplomaticFavor).toBe(5);
    expect(state.seats[2].diplomaticFavor).toBe(4);
    expect(dealOfferOf(state, 1, 2)).toBeUndefined();
  });

  it('a pair that agrees within one turn settles within it', () => {
    const state = table();
    play(state, {
      1: { offer: [2, [[DEAL_GOLD, 250, 0]], []] },
      2: { accept: [1] },
    });
    expect(state.seats[1].treasury).toBe(750);
    expect(state.seats[2].treasury).toBe(1250);
  });

  it('the table confirms whole or not at all', () => {
    const state = table();
    state.seats[1].treasury = 10;
    play(state, {
      1: { offer: [2, [[DEAL_GOLD, 5, 0], [DEAL_GOLD, 500, 0]], []] },
      2: { accept: [1] },
    });
    // the first item was payable; the second was not, so neither moved
    expect(state.seats[1].treasury).toBe(10);
    expect(state.seats[2].treasury).toBe(1000);
  });

  it('an offer nobody answers lapses', () => {
    const state = table();
    play(state, { 1: { offer: [2, [[DEAL_GOLD, 100, 0]], []] } });
    expect(dealOfferOf(state, 1, 2)).toBeTruthy();
    play(state, {});
    expect(dealOfferOf(state, 1, 2)).toBeTruthy();  // still answerable the turn after
    play(state, {});
    expect(dealOfferOf(state, 1, 2)).toBeUndefined();
    play(state, { 2: { accept: [1] } });
    expect(state.seats[1].treasury).toBe(1000);
  });
});

describe('permanent and temporary', () => {
  it('gold per turn runs its 30 turns and then simply stops', () => {
    const state = table();
    play(state, {
      1: { offer: [2, [[DEAL_GOLD_PER_TURN, 3, 0]], []] },
      2: { accept: [1] },
    });
    // "...once the deal has run its course you will get them back": the flow
    // returns, so nothing is refunded — the payments end.
    expect(dealTermOf(state, 1, 2)?.left).toBe(DEAL_TURNS);
    expect(state.seats[1].treasury).toBe(1000);
    for (let i = 0; i < DEAL_TURNS; i++) play(state, {});
    expect(state.seats[1].treasury).toBe(1000 - 3 * DEAL_TURNS);
    expect(state.seats[2].treasury).toBe(1000 + 3 * DEAL_TURNS);
    expect(dealTermOf(state, 1, 2)).toBeUndefined();
    play(state, {});
    expect(state.seats[1].treasury).toBe(1000 - 3 * DEAL_TURNS);
  });

  it('a lump of a strategic resource goes over, and comes home at the term', () => {
    const state = table();
    const id = STRATEGIC_IDS[0];
    grantStockpile(state, 1, id, 30);
    play(state, {
      1: { offer: [2, [[DEAL_RESOURCE, 0, 12]], []] },
      2: { accept: [1] },
    });
    expect(stockOf(state, 1, id)).toBe(18);
    expect(stockOf(state, 2, id)).toBe(12);
    for (let i = 0; i < DEAL_TURNS; i++) play(state, {});
    expect(stockOf(state, 2, id)).toBe(0);
    expect(stockOf(state, 1, id)).toBe(30);
  });

  it('an open-borders grant rides the border clock, not a deal term', () => {
    const state = table();
    play(state, {
      1: { offer: [2, [[DEAL_OPEN_BORDERS, 0, 0]], [[DEAL_GOLD, 20, 0]]] },
      2: { accept: [1] },
    });
    expect(borderTurnsFrom(state, 1, 2)).toBeGreaterThan(0);
    expect(borderTurnsFrom(state, 2, 1)).toBe(0);
    expect(dealTermOf(state, 1, 2)).toBeUndefined();
    expect(state.seats[2].treasury).toBe(980);
  });
});

describe('the things a deal can name', () => {
  it('a Great Work changes hands', () => {
    const state = table();
    const from = state.seats[1].cities[0];
    const home = state.seats[2].cities[0];
    from.buildings.push('AMPHITHEATER');
    home.buildings.push('AMPHITHEATER');
    from.greatWorksWriting = 1;
    play(state, {
      1: { offer: [2, [[DEAL_GREAT_WORK, 0, 0]], []] },
      2: { accept: [1] },
    });
    expect(gwCount(from, 0)).toBe(0);
    expect(gwCount(home, 0)).toBe(1);
  });

  it('a city changes hands only at full HP, walls and all', () => {
    const state = table();
    const city = state.seats[1].cities[0];
    city.hp = 199;
    expect(cityTradeable(state, city)).toBe(false);
    play(state, {
      1: { offer: [2, [[DEAL_CITY, city.centerIndex, 0]], []] },
      2: { accept: [1] },
    });
    expect(state.seats[1].cities).toHaveLength(1);
    // ...and once it is whole again
    city.hp = 200;
    expect(cityTradeable(state, city)).toBe(true);
    play(state, {
      1: { offer: [2, [[DEAL_CITY, city.centerIndex, 0]], []] },
      2: { accept: [1] },
    });
    expect(state.seats[1].cities).toHaveLength(0);
    expect(state.seats[2].cities).toHaveLength(2);
  });

  it('a captured spy goes home to its own capital', () => {
    const state = table();
    setSpyHeld(state, 1, 2, 1);
    expect(spiesOf(state, 1)).toHaveLength(0);
    play(state, {
      2: { offer: [1, [[DEAL_SPY, 0, 0]], [[DEAL_GOLD, 100, 0]]] },
      1: { accept: [2] },
    });
    expect(spyHeldWith(state, 1, 2)).toBe(0);
    const freed = spiesOf(state, 1);
    expect(freed).toHaveLength(1);
    expect(freed[0].tileIndex).toBe(state.seats[1].capitalTile);
    // the captor is paid in full; the freed spy's own upkeep is what makes the
    // owner's side of the ledger a little worse than the price
    expect(state.seats[2].treasury).toBe(1100);
    expect(state.seats[1].treasury).toBeLessThanOrEqual(900);
  });

  it('a captor with no prisoner has nothing to release', () => {
    const state = table();
    play(state, {
      2: { offer: [1, [[DEAL_SPY, 0, 0]], [[DEAL_GOLD, 100, 0]]] },
      1: { accept: [2] },
    });
    expect(spiesOf(state, 1)).toHaveLength(0);
    expect(state.seats[1].treasury).toBe(1000);
  });
});

describe('the table that ends a war', () => {
  it('a deal between two seats at war is the peace deal', () => {
    const state = table();
    setWar(state, 1, 2, true);
    setWarTurnsWith(state, 1, 2, WAR_MIN_TURNS);
    play(state, {
      1: { offer: [2, [[DEAL_GOLD, 200, 0]], []] },
      2: { accept: [1] },
    });
    expect(civsAtWar(state, 1, 2)).toBe(false);
    expect(state.seats[1].treasury).toBe(800);
    expect(state.seats[2].treasury).toBe(1200);
  });

  it('...but not before the war has run its minimum', () => {
    const state = table();
    setWar(state, 1, 2, true);
    setWarTurnsWith(state, 1, 2, WAR_MIN_TURNS - 1);
    play(state, {
      1: { offer: [2, [[DEAL_GOLD, 200, 0]], []] },
      2: { accept: [1] },
    });
    expect(civsAtWar(state, 1, 2)).toBe(true);
    expect(state.seats[1].treasury).toBe(1000);
  });

  it('a deal names one other seat, never itself', () => {
    const state = table();
    play(state, { 1: { offer: [1, [[DEAL_GOLD, 100, 0]], []] }, 2: { accept: [1] } });
    expect(dealOfferOf(state, 1, 1)).toBeUndefined();
    expect(state.seats[1].treasury).toBe(1000);
    expect(AGREEMENT_TURNS).toBe(DEAL_TURNS);
  });
});
