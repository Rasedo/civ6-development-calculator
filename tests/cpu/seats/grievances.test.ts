import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf, setWar } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { declareWar } from '../../../cpu/core/phase';
import { grantCivics, settleFirstCity } from '../helpers';
import { WARMONGER_DOW, WARMONGER_GANG, DIPLO_FAVOR_PER_SUZERAIN, FAVOR_OCCUPIED_CAPITAL } from '../../../cpu/data/seats';
import { diplomaticFavorPerTurn, occupiedCapitals } from '../../../cpu/core/seatTurn';
import { foundCityAt } from '../../../cpu/core/game';
import { transferCity } from '../../../cpu/core/phase';
import { GOVERNMENTS } from '../../../cpu/data/policies';

// THE WARMONGER score (grievances), one `Seat.warmonger` per seat. Real Civ 6
// prices aggression in grievances: declaring war and taking cities make a civ
// shunned and ganged up on. Grows on declaring (+4) and on taking a foreign
// city (+3), decays 1/turn while at peace with EVERY civ, floor 0. Past
// WARMONGER_GANG a seat may be declared on WITHOUT the usual strength
// advantage.
//
// MEASURED live in the gate: seat 0's score peaks at exactly the gang
// threshold (6) with 192 civ-turns at or over it across the 24 scripted seeds,
// so the changed DoW gate is genuinely exercised and `warmonger` is a compared
// HEAD trace column. These pokes pin the accrual and decay rules themselves.

function newGame(opponents = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

describe('diplomatic favor', () => {
  // Real Civ 6 (GS): a civ earns favor per turn equal to its GOVERNMENT TIER,
  // plus +1 per city-state it is Suzerain of. Chiefdom is tier 0 and pays
  // nothing, which is why an early game accrues favor only through envoys.
  it('pays the government TIER per turn', () => {
    expect(diplomaticFavorPerTurn('CHIEFDOM', 0)).toBe(0); // tier 0
    expect(diplomaticFavorPerTurn('MONARCHY', 0)).toBe(GOVERNMENTS.MONARCHY.tier);
    expect(GOVERNMENTS.MONARCHY.tier).toBe(2); // sourced: Monarchy is tier 2
  });

  it('pays per SUZERAINTY on top of the tier', () => {
    const tier = GOVERNMENTS.MONARCHY.tier;
    expect(diplomaticFavorPerTurn('MONARCHY', 3)).toBe(tier + 3 * DIPLO_FAVOR_PER_SUZERAIN);
  });

  it('no government pays nothing but suzerainties still count', () => {
    expect(diplomaticFavorPerTurn(null, 0)).toBe(0);
    expect(diplomaticFavorPerTurn(null, 2)).toBe(2 * DIPLO_FAVOR_PER_SUZERAIN);
  });

  it('accrues on seat 0 each turn', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticFavor = 0;
    // the LIVE government is the scripted adoption — a pure function of civics
    grantCivics(state, 'CODE_OF_LAWS', 'DIVINE_RIGHT'); // adopts MONARCHY
    endTurn(state);
    // no suzerainties in a fresh game -> exactly the tier
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(GOVERNMENTS.MONARCHY.tier);
  });

  // CIV6 (Diplomatic Favor, "Losing Favor"): -5/turn per ORIGINAL CAPITAL
  // occupied, and a seat stuck on a negative rate sits at 0.
  it('charges -5 per turn for each occupied original capital', () => {
    expect(diplomaticFavorPerTurn('MONARCHY', 0, 0, 1))
      .toBe(GOVERNMENTS.MONARCHY.tier - FAVOR_OCCUPIED_CAPITAL);
    expect(diplomaticFavorPerTurn('MONARCHY', 0, 0, 2))
      .toBe(GOVERNMENTS.MONARCHY.tier - 2 * FAVOR_OCCUPIED_CAPITAL);
    expect(FAVOR_OCCUPIED_CAPITAL).toBe(5);
  });

  it('a founding stamps the original capital, and only the first city', () => {
    const state = newGame(1);
    settleFirstCity(state, 1);
    const a = seatOf(state, 0)!;
    expect(a.cities[0].origCapitalSeat).toBe(0);
    expect((state.seats[1] as Seat).cities[0].origCapitalSeat).toBe(1);
    const second = foundCityAt(state, 0, state.map.tiles[a.cities[0].centerIndex + 6], a);
    expect(second.origCapitalSeat).toBe(-1);
    expect(occupiedCapitals(state, 0)).toBe(0); // its own capital costs nothing
  });

  it('a captured capital still belongs to its founder, and the bank floors at zero', () => {
    const state = newGame(1);
    settleFirstCity(state, 1);
    const a = seatOf(state, 0)!, b = state.seats[1] as Seat;
    const taken = b.cities[0];
    transferCity(state, b.seat, a, taken, 'conquered');
    const flipped = a.cities[a.cities.length - 1];
    expect(flipped.origCapitalSeat).toBe(1);   // whoever founded it, founded it
    expect(flipped.isCapital).toBe(false);
    expect(occupiedCapitals(state, 0)).toBe(1);
    expect(occupiedCapitals(state, 1)).toBe(0);
    // Chiefdom pays 0, so the rate is -5 and the bank cannot go under
    a.diplomaticFavor = 2;
    endTurn(state);
    expect(a.diplomaticFavor).toBe(0);
  });
});

describe('seat-0 grievances', () => {
  it('declaring war earns grievances', () => {
    const state = newGame(1);
    expect(seatOf(state, 0)!.warmonger ?? 0).toBe(0);
    expect(declareWar(state, (state.seats[1] as Seat).seat, 0).ok).toBe(true);
    expect(seatOf(state, 0)!.warmonger).toBe(WARMONGER_DOW);
  });

  it('grievances do NOT decay while a war is still running', () => {
    const state = newGame(1);
    declareWar(state, (state.seats[1] as Seat).seat, 0);
    const before = seatOf(state, 0)!.warmonger!;
    endTurn(state);
    expect(seatOf(state, 0)!.warmonger).toBe(before); // still at war -> no decay
  });

  it('grievances decay by 1 per turn once at peace with every civ', () => {
    const state = newGame(1);
    declareWar(state, (state.seats[1] as Seat).seat, 0);
    setWar(state, (state.seats[(0) + 1] as Seat).seat, 0, false); // peace on every axis
    const before = seatOf(state, 0)!.warmonger!;
    endTurn(state);
    expect(seatOf(state, 0)!.warmonger).toBe(before - 1);
  });

  it('decay floors at zero and never goes negative', () => {
    const state = newGame(1);
    seatOf(state, 0)!.warmonger = 1;
    endTurn(state);
    expect(seatOf(state, 0)!.warmonger).toBe(0);
    endTurn(state);
    expect(seatOf(state, 0)!.warmonger).toBe(0); // stays put, never negative
  });

  it('the gang threshold is a real bar the score can reach', () => {
    // Two declarations put seat 0 at 8, past the gang threshold of 6 —
    // the point at which opponents stop needing a strength advantage.
    const state = newGame(2);
    declareWar(state, (state.seats[1] as Seat).seat, 0);
    declareWar(state, (state.seats[2] as Seat).seat, 0);
    expect(seatOf(state, 0)!.warmonger).toBe(2 * WARMONGER_DOW);
    expect(seatOf(state, 0)!.warmonger!).toBeGreaterThanOrEqual(WARMONGER_GANG);
  });
});
