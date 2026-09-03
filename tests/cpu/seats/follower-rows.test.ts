import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, setTileOwner, setWar } from '../../../cpu/core/seats';
import { computeCityStats } from '../../../cpu/core/city';
import { getModifiers, religionsPresent, foreignFollowerCount } from '../../../cpu/core/effects';
import { faithBuyableClass } from '../../../cpu/core/game';
import { standingLoyalty } from '../../../cpu/core/phase';
import { cityTradeYields } from '../../../cpu/core/trade';
import { rosterCS } from '../../../cpu/core/combat';
import { warWearinessBattle } from '../../../cpu/core/weariness';
import { extraCharges } from '../../../cpu/core/units';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import {
  RELIGION_AMENITY_ROWS, ALL_FOLLOWER_BELIEFS_ROWS, ROUTE_PRESSURE_ROWS,
  FOREIGN_FOLLOWER_YIELD_ROWS, GP_GUARANTEE_ROWS, FAITH_PURCHASE_DISTRICT_ROWS,
  START_BOOST_ROWS, POST_COMBAT_LOYALTY_ROWS, LEVY_ROWS, DOMESTIC_ROUTE_LOYALTY_ROWS,
  INCOMING_ROUTE_YIELD_ROWS, COMBAT_CS_ROWS,
} from '../../../cpu/data/civilizations';
import type { City, GameState } from '../../../cpu/core/types';

/**
 * THE FOLLOWER, THE LEVY AND THE ROUTE (CIV6, the install's TraitModifiers):
 * Dharma, The Last Prophet, Songs of the Jeli, Mediterranean Colonies,
 * Swift Hawk, the Raven King and Radio Oranje.
 *
 * The GPU twin is tests/gpu/follower_rows_test.py.
 */
const PLAIN = -1;
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

/** Put `n` religions' pressure into the city, ids 0..n-1. */
function pressure(city: City, ...amounts: number[]): void {
  city.religionPressure = amounts.slice();
}

describe('the wire', () => {
  it('carries every batch-eleven family', () => {
    expect(RELIGION_AMENITY_ROWS.length).toBe(1);
    expect(ALL_FOLLOWER_BELIEFS_ROWS.length).toBe(1);
    expect(ROUTE_PRESSURE_ROWS.length).toBe(1);
    expect(FOREIGN_FOLLOWER_YIELD_ROWS.length).toBe(1);
    expect(GP_GUARANTEE_ROWS.length).toBe(1);
    expect(FAITH_PURCHASE_DISTRICT_ROWS.length).toBe(1);
    expect(START_BOOST_ROWS.length).toBe(1);
    expect(POST_COMBAT_LOYALTY_ROWS.length).toBe(1);
    expect(LEVY_ROWS.length).toBe(1);
    expect(DOMESTIC_ROUTE_LOYALTY_ROWS.length).toBe(1);
    expect(INCOMING_ROUTE_YIELD_ROWS.length).toBe(1);
    // the install's own magnitudes, not the prose's
    expect(POST_COMBAT_LOYALTY_ROWS[0].amount).toBe(-20);
    expect(POST_COMBAT_LOYALTY_ROWS[0].goldenExtra).toBe(-20);
    expect(LEVY_ROWS[0].upgradeDiscountPct).toBe(75);
  });
});

describe('Dharma', () => {
  it('counts a religion present wherever it has pressure', () => {
    const state = sceneAs(seatRow('INDIA'));
    const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
    expect(religionsPresent(city)).toEqual([]);
    pressure(city, 5, 0, 3);
    expect(religionsPresent(city)).toEqual([0, 2]);
  });

  it('pays India an Amenity per religion present, and nobody else', () => {
    const have = (row: number, ...p: number[]): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      pressure(city, ...p);
      return computeCityStats(state, city).amenities.have;
    };
    const plainNone = have(PLAIN, 0, 0);
    expect(have(seatRow('INDIA'), 0, 0)).toBe(plainNone);
    expect(have(seatRow('INDIA'), 5, 0)).toBe(have(PLAIN, 5, 0) + 1);
    expect(have(seatRow('INDIA'), 5, 3)).toBe(have(PLAIN, 5, 3) + 2);
  });
});

describe('The Last Prophet', () => {
  it("counts only ANOTHER seat's cities following this seat's religion", () => {
    const state = sceneAs(seatRow('ARABIA'));
    const mine = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
    const theirs = settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
    expect(foreignFollowerCount(state, 0)).toBe(0);
    mine.followedReligion = 0; // my OWN city does not count
    expect(foreignFollowerCount(state, 0)).toBe(0);
    theirs.followedReligion = 0;
    expect(foreignFollowerCount(state, 0)).toBe(1);
    theirs.followedReligion = 1; // another religion does not count
    expect(foreignFollowerCount(state, 0)).toBe(0);
  });

  it('names the Prophet as the guaranteed class', () => {
    expect(GP_GUARANTEE_ROWS[0].cls).toBe('PROPHET');
    const state = sceneAs(seatRow('ARABIA'));
    expect(getModifiers(state, 0).gpGuarantee.has('PROPHET')).toBe(true);
    expect(getModifiers(sceneAs(PLAIN), 0).gpGuarantee.size).toBe(0);
  });
});

describe('Songs of the Jeli', () => {
  it('opens the Commercial Hub to Faith for Mali, with no suzerain', () => {
    const mali = sceneAs(seatRow('MALI'));
    const plain = sceneAs(PLAIN);
    expect(faithBuyableClass(mali, 0, 'MARKET')).toBe(true);
    expect(faithBuyableClass(plain, 0, 'MARKET')).toBe(false);
    // a worship building stays outside the door for both
    expect(faithBuyableClass(mali, 0, 'CATHEDRAL')).toBe(false);
  });
});

describe('Mediterranean Colonies', () => {
  it('names Writing as the boost Phoenicia starts with', () => {
    expect(START_BOOST_ROWS[0].tech).toBe('WRITING');
    expect(START_BOOST_ROWS[0].civ).toBe('PHOENICIA');
  });
});

describe('Swift Hawk', () => {
  it('adds ten strength against a seat in a golden age and nobody else', () => {
    const cs = (row: number, foeAge: number): number => {
      const state = sceneAs(row);
      const at = tileAtCoords(state.map, 8, 8);
      state.seats[1].age = foeAge;
      const unit = { seat: 0, type: 'WARRIOR', tileIndex: at.index, embarked: false, formation: 0 };
      return rosterCS(state, unit as never, 1, 100, false);
    };
    expect(cs(leaderRow('LAUTARO'), 2)).toBe(10);
    expect(cs(leaderRow('LAUTARO'), 1)).toBe(0);
    expect(cs(PLAIN, 2)).toBe(0);
  });

  it("drops the loyalty of the DEFEATED side's city, doubled in a golden age", () => {
    const scene = (row: number, foeAge: number) => {
      const state = sceneAs(row);
      settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
      const theirs = settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
      state.seats[1].age = foeAge;
      setWar(state, 0, 1, true);
      const at = tileAtCoords(state.map, 12, 11);
      setTileOwner(at, 1, theirs.id);
      theirs.loyalty = 100;
      warWearinessBattle(state, 0, 1, at.index, { dDied: true });
      return theirs.loyalty;
    };
    expect(scene(leaderRow('LAUTARO'), 0)).toBe(80);
    expect(scene(leaderRow('LAUTARO'), 2)).toBe(60);
    expect(scene(PLAIN, 2)).toBe(100);
  });

  it('drops nothing when the unit dies outside an enemy city', () => {
    const state = sceneAs(leaderRow('LAUTARO'));
    settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
    const theirs = settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
    setWar(state, 0, 1, true);
    theirs.loyalty = 100;
    // unowned ground between them
    warWearinessBattle(state, 0, 1, tileAtCoords(state.map, 8, 8).index, { dDied: true });
    expect(theirs.loyalty).toBe(100);
  });
});

describe('the Raven King', () => {
  it("hands two Envoys back and names the levy's upgrade discount", () => {
    const state = sceneAs(leaderRow('MATTHIAS_CORVINUS'));
    const rows = getModifiers(state, 0).levy;
    expect(rows.length).toBe(1);
    expect(rows[0].envoys).toBe(2);
    expect(getModifiers(sceneAs(PLAIN), 0).levy.length).toBe(0);
  });
});

describe('Radio Oranje', () => {
  it('pays two Culture per foreign route in, and none for a domestic one', () => {
    const culture = (row: number, foreign: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      const other = settleAt(state, tileAtCoords(state.map, 3, 3).index, 1);
      state.seats[1].tradeRoutes = [];
      for (let i = 0; i < foreign; i++) {
        state.seats[1].tradeRoutes!.push({ from: other.id, to: -1, toSeat: 0, toSeatCity: city.id, expires: 999 } as never);
      }
      return cityTradeYields(state, city, 0).culture;
    };
    expect(culture(leaderRow('WILHELMINA'), 0)).toBe(culture(PLAIN, 0));
    expect(culture(leaderRow('WILHELMINA'), 2)).toBe(culture(PLAIN, 2) + 4);
  });

  it('pays two Loyalty per domestic route out of the origin city', () => {
    const loyalty = (row: number, domestic: number): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      const far = settleAt(state, tileAtCoords(state.map, 3, 3).index, 0);
      state.seats[0].tradeRoutes = [];
      for (let i = 0; i < domestic; i++) {
        state.seats[0].tradeRoutes!.push({ from: city.id, to: far.id, expires: 999 } as never);
      }
      return standingLoyalty(state, city);
    };
    expect(loyalty(leaderRow('WILHELMINA'), 0)).toBe(loyalty(PLAIN, 0));
    expect(loyalty(leaderRow('WILHELMINA'), 2)).toBe(loyalty(PLAIN, 2) + 4);
  });
});

describe("India's Missionary", () => {
  it('carries two more spreads than anyone else', () => {
    const india = sceneAs(seatRow('INDIA'));
    const plain = sceneAs(PLAIN);
    expect(extraCharges(india, 0, 'MISSIONARY', tileAtCoords(india.map, 8, 8))).toBe(
      extraCharges(plain, 0, 'MISSIONARY', tileAtCoords(plain.map, 8, 8)) + 2);
  });
});

describe('the combat-strength census', () => {
  it("keeps Swift Hawk's clause on the roster's own list", () => {
    expect(COMBAT_CS_ROWS.filter((r) => r.when === 'foeGolden').length).toBe(1);
  });
});
