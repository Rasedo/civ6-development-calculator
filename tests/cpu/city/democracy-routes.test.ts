/**
 * DEMOCRACY'S INHERENT BONUS. CIV6 (GS): "Your Trade Routes to an Ally or
 * Suzerain's city provide +4 Food and +4 Production for both cities. Alliance
 * Points with all allies increase by an additional .25 per turn."
 *
 * The ORIGIN half is this seat's own and ships; the destination's half pays
 * another seat's city, which no channel here reaches (B-D). The quarter-point
 * is the unit the alliance store already keeps.
 */
import { describe, it, expect } from 'vitest';
import { grantCivics, makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOf, setAllianceTypeWith, setAllyTurnsWith } from '../../../cpu/core/seats';
import { cityTradeYields } from '../../../cpu/core/trade';
import { GOVERNMENTS } from '../../../cpu/data/policies';
import { ALLIANCE_QP_TURN, AGREEMENT_TURNS, ALLIANCE_MILITARY } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

const DEM = GOVERNMENTS.DEMOCRACY.effects;

function scene(): { state: GameState; mine: number; theirs: number } {
  const state = makeState(makeMap(20, 20, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  const mine = settleAt(state, tileAtCoords(state.map, 5, 5).index, 0).id;
  const theirs = settleAt(state, tileAtCoords(state.map, 14, 14).index, 1).id;
  const s = seatOf(state, 0)!;
  s.tradeRoutes = [{ from: mine, to: -1, toSeat: 1, toSeatCity: theirs, createdTurn: 0, expiresTurn: 50 }];
  return { state, mine, theirs };
}

/** Democracy is adopted from CIVICS — SUFFRAGE unlocks it and
 *  `computeAdoption` takes the newest tier, the same door a game walks. */
function adoptDemocracy(state: GameState): void {
  grantCivics(state, 'SUFFRAGE');
}

describe("Democracy's ally and suzerain routes", () => {
  it('names the published magnitudes in its catalog row', () => {
    expect(DEM.allyRouteYield).toEqual({ food: 4, production: 4 });
    // ".25 per turn" is ONE quarter-point; a whole point a turn is four
    expect(DEM.alliancePointsPerTurn).toBe(1);
    expect(ALLIANCE_QP_TURN).toBe(4);
  });

  it('adds the flat yields only when the destination seat is an ALLY', () => {
    const { state } = scene();
    const city = seatOf(state, 0)!.cities[0];
    const before = cityTradeYields(state, city, 0);

    // no alliance: the route pays what it always paid
    expect(cityTradeYields(state, city, 0).food).toBe(before.food);

    setAllyTurnsWith(state, 0, 1, AGREEMENT_TURNS);
    setAllianceTypeWith(state, 0, 1, ALLIANCE_MILITARY);
    const allied = cityTradeYields(state, city, 0);
    // the ally clause alone is Democracy's; without the government it pays 0
    const govless = allied.food - before.food;
    expect(govless).toBe(0);

    adoptDemocracy(state);
    const demo = cityTradeYields(state, city, 0);
    expect(demo.food - before.food).toBe(DEM.allyRouteYield!.food);
    expect(demo.production - before.production).toBe(DEM.allyRouteYield!.production);
  });

  it('pays nothing on a route to a seat that is not an ally', () => {
    const { state } = scene();
    adoptDemocracy(state);
    const city = seatOf(state, 0)!.cities[0];
    const noAlly = cityTradeYields(state, city, 0);
    setAllyTurnsWith(state, 0, 1, AGREEMENT_TURNS);
    setAllianceTypeWith(state, 0, 1, ALLIANCE_MILITARY);
    const allied = cityTradeYields(state, city, 0);
    expect(allied.food - noAlly.food).toBe(DEM.allyRouteYield!.food);
  });
});
