/**
 * DEMOCRACY'S INHERENT BONUS. CIV6 (GS): "Your Trade Routes to an Ally or
 * Suzerain's city provide +4 Food and +4 Production for both cities. Alliance
 * Points with all allies increase by an additional .25 per turn."
 *
 * The ORIGIN half rides the routes loop of `cityTradeYields`; the
 * DESTINATION's half (`incomingAllyRouteYields`) pays the ally's city, or the
 * minor's, for the same route in. The quarter-point is the unit the alliance
 * store already keeps.
 */
import { describe, it, expect } from 'vitest';
import { grantCivics, makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOf, setAllianceTypeWith, setAllyTurnsWith } from '../../../cpu/core/seats';
import { cityTradeYields, incomingAllyRouteYields } from '../../../cpu/core/trade';
import { minorCity, placeCityStateAt, resolveSuzerains, setMet } from '../../../cpu/core/cityStates';
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

  it("pays the DESTINATION city too — the ally's, on the sender's government alone", () => {
    const { state } = scene();
    const theirCity = seatOf(state, 1)!.cities[0];
    // no government, no alliance: nothing
    expect(incomingAllyRouteYields(state, theirCity)).toEqual(expect.objectContaining({ food: 0, production: 0 }));
    // the alliance alone pays nothing; Democracy on the SENDER pays the receiver
    setAllyTurnsWith(state, 0, 1, AGREEMENT_TURNS);
    setAllianceTypeWith(state, 0, 1, ALLIANCE_MILITARY);
    expect(incomingAllyRouteYields(state, theirCity).food).toBe(0);
    adoptDemocracy(state);
    const before = cityTradeYields(state, theirCity, 0);
    expect(incomingAllyRouteYields(state, theirCity)).toEqual(expect.objectContaining(DEM.allyRouteYield));
    // ...and it lands in the receiver's own trade yields, food and production
    expect(before.food).toBeGreaterThanOrEqual(DEM.allyRouteYield!.food!);
    expect(before.production).toBeGreaterThanOrEqual(DEM.allyRouteYield!.production!);
    // the receiver's OWN government is not what pays it: strip the alliance, nothing
    setAllyTurnsWith(state, 0, 1, 0);
    expect(incomingAllyRouteYields(state, theirCity).food).toBe(0);
  });

  it("pays a MINOR's city on its suzerain's route in", () => {
    const { state, mine } = scene();
    adoptDemocracy(state);
    const cs = placeCityStateAt(state, 0, 'Testopolis', 'militaristic', tileAtCoords(state.map, 5, 14).index);
    setMet(cs, 0);
    seatOf(state, 0)!.tradeRoutes = [{ from: mine, to: -1, toCs: cs.id, createdTurn: 0, expiresTurn: 50 }];
    const city = minorCity(cs);
    // met, routed, not suzerain: nothing
    expect(incomingAllyRouteYields(state, city).food).toBe(0);
    cs.envoys[0] = 3;
    resolveSuzerains(state);
    expect(incomingAllyRouteYields(state, city)).toEqual(expect.objectContaining(DEM.allyRouteYield));
    expect(cityTradeYields(state, city, 0).food).toBeGreaterThanOrEqual(DEM.allyRouteYield!.food!);
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
