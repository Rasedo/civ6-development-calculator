import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf, setFriendTurnsWith, setWar } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { declareWar } from '../../../cpu/core/phase';
import { grantCivics, settleFirstCity } from '../helpers';
import { DIPLO_FAVOR_PER_SUZERAIN, FAVOR_OCCUPIED_CAPITAL, AGREEMENT_TURNS, FORMAL_WAR_MIN_TURNS,
  GRIEVANCE_WAR_SURPRISE, GRIEVANCE_WAR_FORMAL, GRIEVANCE_DECAY_BASE, GRIEVANCE_DENOUNCE,
  GRIEVANCE_FRIEND_SHARE, GRIEVANCE_CITY_TAKEN, GRIEVANCE_LAST_CITY, GRIEVANCE_GANG,
  GRIEVANCE_HELD_CAPITAL_PER_TURN, GRIEVANCE_OCCUPIED_CAPITAL_DECAY,
  GRIEVANCE_FAVOR_FLOOR, GRIEVANCE_FAVOR_STEP, GRIEVANCE_FAVOR_MAX } from '../../../cpu/data/seats';
import { addGrievance, grievanceDenounce, grievanceFavorPenalty, grievanceWith, grievancesAgainst } from '../../../cpu/core/grievance';
import { diplomaticFavorPerTurn, occupiedCapitals } from '../../../cpu/core/seatTurn';
import { foundCityAt } from '../../../cpu/core/game';
import { transferCity } from '../../../cpu/core/phase';
import { GOVERNMENTS } from '../../../cpu/data/policies';

// GRIEVANCES (GS), one signed balance per PAIR. Real Civ 6 prices aggression
// in grievances: declaring war, taking cities, razing them and denouncing all
// tip the pair's balance toward the victim, the world reads what a seat owes
// everyone as one bill, and peace decays it era by era.
//
// `grievances` is a compared digest field on both engines, so these pokes pin
// the accrual, the spread to friends and allies, the decay and the favor
// penalty that reads the whole bill.

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

describe('grievances', () => {
  // CIV6 (Grievances): "a score which each pair of civilizations keep for each
  // other", one signed balance per pair, tipped by the transgressor and
  // decayed back toward zero while the pair is at peace. Every magnitude here
  // is the Grievances page's own table row.
  it('a SURPRISE declaration pays the target 150, a FORMAL one 100', () => {
    const state = newGame(1);
    const foe = (state.seats[1] as Seat).seat;
    expect(grievanceWith(state, foe, 0)).toBe(0);
    expect(declareWar(state, foe, 0).ok).toBe(true);
    expect(grievanceWith(state, foe, 0)).toBe(GRIEVANCE_WAR_SURPRISE);
    // and the balance is one number seen from both sides
    expect(grievanceWith(state, 0, foe)).toBe(-GRIEVANCE_WAR_SURPRISE);

    const s2 = newGame(1);
    const foe2 = (s2.seats[1] as Seat).seat;
    seatOf(s2, 0)!.denounced[foe2] = s2.turn - FORMAL_WAR_MIN_TURNS;
    expect(declareWar(s2, foe2, 0).ok).toBe(true);
    // the denouncement itself is not paid here; only the declaration is
    expect(grievanceWith(s2, foe2, 0)).toBe(GRIEVANCE_WAR_FORMAL);
  });

  it('the ledger does NOT decay while that pair is still at war', () => {
    const state = newGame(1);
    const foe = (state.seats[1] as Seat).seat;
    declareWar(state, foe, 0);
    const before = grievanceWith(state, foe, 0);
    endTurn(state);
    expect(grievanceWith(state, foe, 0)).toBe(before);
  });

  it('at peace it decays 10/turn in the Ancient era, and stops at zero', () => {
    const state = newGame(1);
    const foe = (state.seats[1] as Seat).seat;
    declareWar(state, foe, 0);
    setWar(state, foe, 0, false);
    const before = grievanceWith(state, foe, 0);
    endTurn(state);
    expect(grievanceWith(state, foe, 0)).toBe(before - GRIEVANCE_DECAY_BASE);
    addGrievance(state, foe, 0, -(grievanceWith(state, foe, 0) - 3));
    endTurn(state);
    expect(grievanceWith(state, foe, 0)).toBe(0);  // the step never overshoots
    endTurn(state);
    expect(grievanceWith(state, foe, 0)).toBe(0);
  });

  it('denouncing pays 25, and a declared friend of the victim takes a quarter', () => {
    const state = newGame(2);
    const b = (state.seats[1] as Seat).seat;
    const c = (state.seats[2] as Seat).seat;
    setFriendTurnsWith(state, c, b, AGREEMENT_TURNS);
    grievanceDenounce(state, 0, b);
    expect(grievanceWith(state, b, 0)).toBe(GRIEVANCE_DENOUNCE);
    expect(grievanceWith(state, c, 0)).toBe(Math.floor((GRIEVANCE_DENOUNCE * GRIEVANCE_FRIEND_SHARE) / 100));
  });

  it('taking a city pays 50, and taking the LAST one pays every survivor 150', () => {
    const state = newGame(2);
    const loser = state.seats[1] as Seat;
    const watcher = (state.seats[2] as Seat).seat;
    settleFirstCity(state, loser.seat);
    const city = loser.cities[0]!;
    loser.cities = [city];  // the one it is about to lose IS its last
    transferCity(state, loser.seat, seatOf(state, 0)!, city, 'conquered');
    expect(grievanceWith(state, loser.seat, 0)).toBe(GRIEVANCE_CITY_TAKEN + GRIEVANCE_LAST_CITY);
    expect(grievanceWith(state, watcher, 0)).toBe(GRIEVANCE_LAST_CITY);
  });

  it('a LOYALTY FLIP is free: the ledger only reads a conquest', () => {
    const state = newGame(1);
    const loser = state.seats[1] as Seat;
    settleFirstCity(state, loser.seat);
    transferCity(state, loser.seat, seatOf(state, 0)!, loser.cities[0]!, 'loyalty');
    expect(grievanceWith(state, loser.seat, 0)).toBe(0);
  });

  it('sitting in a captured ORIGINAL CAPITAL charges 3 a turn once the war is over', () => {
    const state = newGame(1);
    const loser = state.seats[1] as Seat;
    settleFirstCity(state, loser.seat);
    transferCity(state, loser.seat, seatOf(state, 0)!, loser.cities[0]!, 'conquered');
    const before = grievanceWith(state, loser.seat, 0);
    endTurn(state);
    // one held capital: +3 charged, and the victim's own balance decays
    // SLOWER for it -- base minus the capital modifier
    expect(grievanceWith(state, loser.seat, 0))
      .toBe(Math.max(0, before + GRIEVANCE_HELD_CAPITAL_PER_TURN
        - (GRIEVANCE_DECAY_BASE - GRIEVANCE_OCCUPIED_CAPITAL_DECAY)));
  });

  it('the favor penalty starts at 200 grievances and steps every 50, capping at 10', () => {
    const state = newGame(1);
    const foe = (state.seats[1] as Seat).seat;
    expect(grievanceFavorPenalty(state, 0)).toBe(0);
    addGrievance(state, foe, 0, GRIEVANCE_FAVOR_FLOOR - 1);
    expect(grievanceFavorPenalty(state, 0)).toBe(0);
    addGrievance(state, foe, 0, 1);
    expect(grievanceFavorPenalty(state, 0)).toBe(1);
    addGrievance(state, foe, 0, GRIEVANCE_FAVOR_STEP);
    expect(grievanceFavorPenalty(state, 0)).toBe(2);
    addGrievance(state, foe, 0, 100 * GRIEVANCE_FAVOR_STEP);
    expect(grievanceFavorPenalty(state, 0)).toBe(GRIEVANCE_FAVOR_MAX);
  });

  it('a pair the transgressor is WINNING adds nothing to its bill', () => {
    const state = newGame(1);
    const foe = (state.seats[1] as Seat).seat;
    addGrievance(state, 0, foe, 300);      // seat 0 is the victim here
    expect(grievancesAgainst(state, 0)).toBe(0);
    expect(grievancesAgainst(state, foe)).toBe(300);
  });

  it('the gang threshold is a bar the ledger can reach', () => {
    const state = newGame(2);
    declareWar(state, (state.seats[1] as Seat).seat, 0);
    declareWar(state, (state.seats[2] as Seat).seat, 0);
    expect(grievancesAgainst(state, 0)).toBe(2 * GRIEVANCE_WAR_SURPRISE);
    expect(grievancesAgainst(state, 0)).toBeGreaterThanOrEqual(GRIEVANCE_GANG);
  });
});
