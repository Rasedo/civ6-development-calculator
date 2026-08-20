import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn } from '../../../cpu/core/game';
import { worldCongress } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import { CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION, DIPLO_VICTORY_POINTS, CONGRESS_UDT, CONGRESS_PATRONAGE, CONGRESS_MIGRATION, CONGRESS_HERITAGE } from '../../../cpu/data/seats';
import { congressGppFactor, congressGrowthMult, congressLoyaltyDelta, congressUdtBlockedDistrict, congressUdtProdDistrict, congressGwMult } from '../../../cpu/core/congress';
import { BUILT_WONDERS } from '../../../cpu/data/builtWonders';

// WORLD CONGRESS. Sourced (Civilopedia GS): the Congress begins
// meeting once the game reaches the MEDIEVAL era and convenes every 30 turns;
// resolutions are voted on with Diplomatic Favor; Diplomatic Victory needs 20
// Diplomatic Victory Points.
//
// REACHABILITY: the Congress convenes 5-6 times per seed in the gate, so the
// SESSION, the slate and the combo AWARD are exercised there
// (congressSessions/diplomaticPoints/congressActive are compared columns).
// The 20-point WIN is not reachable at 250 turns; these pokes are its bar.

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

/** Force every civ past the Medieval gate by handing them a Medieval tech. */
function medieval(state: ReturnType<typeof newGame>) {
  seatOf(state, 0)!.research.techs.push('APPRENTICESHIP'); // Medieval
  for (const civSeat of state.seats.slice(1)) civSeat.research.techs.push('APPRENTICESHIP');
}

describe('world congress', () => {
  it('does not convene before the MEDIEVAL era', () => {
    const state = newGame(1);
    state.turn = CONGRESS_INTERVAL; // a session turn ...
    seatOf(state, 0)!.diplomaticFavor = 50;
    worldCongress(state);
    expect(state.congressSessions ?? 0).toBe(0); // ... but nobody is Medieval
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(50); // favor untouched
  });

  it('convenes only on interval turns', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL + 1;
    worldCongress(state);
    expect(state.congressSessions ?? 0).toBe(0);
    state.turn = CONGRESS_INTERVAL * 2;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
  });

  it('a pre-Modern session runs the two-slot slate, spends NO favor, and pays every winning-combo voter', () => {
    const state = newGame(1);
    medieval(state);
    settleFirstCity(state, 1); // a cityless civ casts no vote
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 50;
    (state.seats[1] as Seat).diplomaticFavor = 90;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    // the Medieval-eligible slate is Urban Development Treaty + Patronage
    expect(state.congress!.map((a) => a.res)).toEqual([CONGRESS_UDT, CONGRESS_PATRONAGE]);
    expect(state.congress!.every((a) => a.outcome === 0)).toBe(true);
    // favor is only walked on the DV resolution, which needs Modern
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(50);
    expect((state.seats[1] as Seat).diplomaticFavor).toBe(90);
    // both civs prefer target 0 on both slates (no placeable district, no
    // GPP), so both voted the winning combo twice: +1 DVP each per resolution
    expect(seatOf(state, 0)!.diplomaticPoints).toBe(2 * DVP_PER_RESOLUTION);
    expect((state.seats[1] as Seat).diplomaticPoints).toBe(2 * DVP_PER_RESOLUTION);
  });

  it('a cityless civ casts no vote', () => {
    const state = newGame(1);
    (state.seats[1] as Seat).cities = []; // eliminated
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    expect(seatOf(state, 0)!.diplomaticPoints).toBe(2 * DVP_PER_RESOLUTION);
    expect((state.seats[1] as Seat).diplomaticPoints ?? 0).toBe(0);
  });

  it('from Modern the DV resolution runs third: the favor curve, the leader pile-on, the refund tiers', () => {
    const state = newGame(1);
    medieval(state);
    settleFirstCity(state, 1);
    seatOf(state, 0)!.research.techs.push('RADIO'); // the world era is Modern
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticPoints = 5; // seat 0 leads
    // 65 favor walks 3 extra votes (10+20+30=60, 5 short of the 4th)
    seatOf(state, 0)!.diplomaticFavor = 65;
    // 100 favor walks exactly 4 (10+20+30+40)
    (state.seats[1] as Seat).diplomaticFavor = 100;
    worldCongress(state);
    // the DV resolution is not a STANDING effect — only the two slates are
    expect(state.congress!.length).toBe(2);
    // seat 1's B-on-leader (1+4 votes) beats seat 0's A-on-self (1+3):
    // outcome B wins, so the loser (seat 0) is refunded 100% and the winner
    // keeps nothing and takes +1 DVP; the leader loses CONGRESS_DV_DELTA.
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(65);
    expect((state.seats[1] as Seat).diplomaticFavor).toBe(0);
    // DVP: seat 0 = 5 + 2 (both slates) - 2 (the DV effect) = 5;
    // seat 1 = 2 (both slates) + 1 (winning DV combo) = 3
    expect(seatOf(state, 0)!.diplomaticPoints).toBe(5);
    expect((state.seats[1] as Seat).diplomaticPoints).toBe(3);
  });

  it('the standing resolutions drive the effect readers, both outcomes', () => {
    const state = newGame(1);
    state.congress = [
      { res: CONGRESS_PATRONAGE, outcome: 0, target: 0 }, // SCIENTIST x2
      { res: CONGRESS_MIGRATION, outcome: 1, target: 0 },
    ];
    expect(congressGppFactor(state, 'SCIENTIST')).toBe(2);
    expect(congressGppFactor(state, 'ENGINEER')).toBe(1);
    expect(congressGrowthMult(state, 0)).toBe(0.8);
    expect(congressGrowthMult(state, 1)).toBe(1);
    expect(congressLoyaltyDelta(state, 0)).toBe(5);
    expect(congressLoyaltyDelta(state, 1)).toBe(0);
    state.congress = [{ res: CONGRESS_UDT, outcome: 1, target: 0 }]; // CAMPUS banned
    expect(congressUdtBlockedDistrict(state)).toBe('CAMPUS');
    expect(congressUdtProdDistrict(state)).toBe(null);
    state.congress = [
      { res: CONGRESS_UDT, outcome: 0, target: 0 },
      { res: CONGRESS_HERITAGE, outcome: 0, target: 1 },
    ];
    expect(congressUdtProdDistrict(state)).toBe('CAMPUS');
    expect(congressUdtBlockedDistrict(state)).toBe(null);
    expect(congressGwMult(state)).toEqual([1, 2, 1]);
    state.congress = [{ res: CONGRESS_HERITAGE, outcome: 1, target: 2 }];
    expect(congressGwMult(state)).toEqual([1, 1, 0]);
  });

  it('the wonder DVP magnitudes are the sourced ones', () => {
    // CIV6: Statue of Liberty +4 DVP on completion; Potala Palace +1 DVP
    // and +1 Diplomatic policy slot.
    expect(BUILT_WONDERS.STATUE_OF_LIBERTY.effects?.dvp).toBe(4);
    expect(BUILT_WONDERS.POTALA_PALACE.effects?.dvp).toBe(1);
    expect(BUILT_WONDERS.POTALA_PALACE.effects?.extraSlots?.diplomatic).toBe(1);
    expect(BUILT_WONDERS.FORBIDDEN_CITY.effects?.extraSlots?.wildcard).toBe(1);
  });

  it('the Medieval gate reads ANY civ, not just seat 0', () => {
    const state = newGame(1);
    (state.seats[(0) + 1] as Seat).research.techs.push('APPRENTICESHIP'); // only the civ
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 5;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(5); // no DV slot before Modern
    expect(CONGRESS_MIN_ERA).toBe(2); // sourced: Medieval
  });
});

describe('diplomatic victory', () => {
  it('20 points wins, for whichever seat holds them', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(6);
    expect(state.victoryRow).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it('a civ reaching 20 wins the SAME way — only the victor differs', () => {
    const state = newGame(1);
    (state.seats[(0) + 1] as Seat).diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(6);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });

  it('19 points is not a win — the bar is the full threshold', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS - 1;
    endTurn(state);
    expect(state.victoryType).not.toBe(6);
    expect(state.victoryRow).toBe(-1);
    expect(state.gameOver).toBe(false);
  });

  it('a CULTURE victory outranks a diplomatic one on the same turn', () => {
    const state = newGame(1);
    // seat 0 would win on culture ...
    seatOf(state, 0)!.tourism = 5 * 2 * 200;
    seatOf(state, 0)!.cultureTotal = 100;
    (state.seats[(0) + 1] as Seat).cultureTotal = 400;
    (state.seats[(0) + 1] as Seat).tourism = 0;
    // ... and on diplomacy
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(5); // culture ranks first
  });
});
