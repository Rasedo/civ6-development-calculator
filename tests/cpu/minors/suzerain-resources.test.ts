/**
 * THE SUZERAIN'S RESOURCES. CIV6 (LOC_CITY_STATES_SUZERAIN_DIPLOMATIC_BONUS):
 * "Gain ownership of all the city-state's resources." Each improved,
 * unpillaged luxury on a suzerained city-state's ground is a copy the
 * suzerain holds, and each improved strategic source pays the suzerain its
 * per-turn number; the city-state keeps its own copies (runs/h1_duelw1105:
 * Nalanda holds its two Marble while its suzerain holds two more).
 *
 * The GPU twin is `tests/gpu/suzerain_resources_test.py`.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOf, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { luxuryAmenities, luxuryHoldings } from '../../../cpu/core/city';
import { accrueStockpiles } from '../../../cpu/core/stockpile';
import { STRATEGIC_IDS, STRATEGIC_PER_TURN } from '../../../cpu/data/constants';
import { HATTUSA_FREE_STRATEGIC, SUZERAIN_ENVOYS } from '../../../cpu/data/cityStates';
import { RESOURCES, resourceImprovement } from '../../../world/resources';
import type { GameState, Tile } from '../../../cpu/core/types';

/** Seat 0's city at (5, 5); a city-state at (12, 12) holding `envoys` of
 *  seat 0's, and one plot of its ground carrying `resource`. */
function scene(resource: string, envoys: number): { state: GameState; plot: Tile; minorSeat: number } {
  const state = makeState(makeMap(24, 24));
  settleAt(state, tileAtCoords(state.map, 5, 5).index, 0);
  const center = tileAtCoords(state.map, 12, 12);
  const minorSeat = seatOfCityState(0);
  state.cityStates.push({
    ...emptySeat(minorSeat), id: 0, name: 'NALANDA', type: 'scientific',
    centerIndex: center.index, population: 3, envoys: { 0: envoys }, met: [0],
  });
  setTileOwner(center, minorSeat);
  const plot = tileAtCoords(state.map, 13, 12);
  setTileOwner(plot, minorSeat);
  plot.resource = resource;
  const reveal = RESOURCES[resource]!.revealTech;
  if (reveal) seatOf(state, 0)!.research.techs.push(reveal);
  return { state, plot, minorSeat };
}

const sum = (state: GameState, seat: number): number =>
  [...luxuryAmenities(state, seat).values()].reduce((a, b) => a + b, 0);

describe("a suzerained city-state's luxury", () => {
  it('is a copy the suzerain holds once the city-state improves it', () => {
    const { state, plot } = scene('WINE', SUZERAIN_ENVOYS);
    const before = sum(state, 0);
    expect(luxuryHoldings(state, 0).held.get('WINE')).toBeUndefined();
    plot.improvement = resourceImprovement(plot);
    expect(luxuryHoldings(state, 0).spare.get('WINE')).toBe(1);
    expect(sum(state, 0)).toBe(before + 1);  // one city, one round
    plot.pillaged = true;
    expect(sum(state, 0)).toBe(before);
  });

  it('pays nobody short of suzerainty, and the city-state keeps its own', () => {
    const { state, plot, minorSeat } = scene('WINE', SUZERAIN_ENVOYS - 1);
    plot.improvement = resourceImprovement(plot);
    expect(luxuryHoldings(state, 0).held.get('WINE')).toBeUndefined();
    const own = sum(state, minorSeat);
    expect(own).toBe(1);
    state.cityStates[0].envoys[0] = SUZERAIN_ENVOYS;
    expect(sum(state, minorSeat)).toBe(own);
    expect(luxuryHoldings(state, 0).held.get('WINE')).toBe(1);
  });
});

describe("a suzerained city-state's strategic source", () => {
  it("pays the suzerain the resource's per-turn number", () => {
    const { state, plot } = scene('IRON', SUZERAIN_ENVOYS);
    plot.elevation = 'HILLS';
    const k = STRATEGIC_IDS.indexOf('IRON');
    const bank = (seatOf(state, 0)!.stockpile = STRATEGIC_IDS.map(() => 0));
    accrueStockpiles(state, 0);
    expect(bank[k]).toBe(0);  // unimproved
    plot.improvement = 'MINE';
    accrueStockpiles(state, 0);
    expect(bank[k]).toBe(STRATEGIC_PER_TURN.IRON);
    state.cityStates[0].envoys[0] = SUZERAIN_ENVOYS - 1;
    accrueStockpiles(state, 0);
    expect(bank[k]).toBe(STRATEGIC_PER_TURN.IRON);
  });
});

describe("Hattusa's suzerain", () => {
  it('banks each strategic it sees and improves nowhere of its own', () => {
    const { state } = scene('WINE', SUZERAIN_ENVOYS);
    state.cityStates[0].name = 'Hattusa';
    const seat = seatOf(state, 0)!;
    const bank = (seat.stockpile = STRATEGIC_IDS.map(() => 0));
    const iron = STRATEGIC_IDS.indexOf('IRON');
    const horses = STRATEGIC_IDS.indexOf('HORSES');
    // nothing seen, nothing banked
    seat.research.techs = seat.research.techs.filter((t) => t !== RESOURCES.IRON!.revealTech && t !== RESOURCES.HORSES!.revealTech);
    accrueStockpiles(state, 0);
    expect(bank[iron]).toBe(0);
    // Iron seen and unimproved: the standing amount
    seat.research.techs.push(RESOURCES.IRON!.revealTech!);
    accrueStockpiles(state, 0);
    expect(bank[iron]).toBe(HATTUSA_FREE_STRATEGIC);
    expect(bank[horses]).toBe(0);
    // an improved Iron of the suzerain's own ends it
    const own = tileAtCoords(state.map, 6, 5);
    setTileOwner(own, 0, seat.cities[0].id);
    own.resource = 'IRON';
    own.elevation = 'HILLS';
    own.improvement = 'MINE';
    accrueStockpiles(state, 0);
    expect(bank[iron]).toBe(HATTUSA_FREE_STRATEGIC + STRATEGIC_PER_TURN.IRON);
    // short of suzerainty, nothing
    own.improvement = null;
    state.cityStates[0].envoys[0] = SUZERAIN_ENVOYS - 1;
    accrueStockpiles(state, 0);
    expect(bank[iron]).toBe(HATTUSA_FREE_STRATEGIC + STRATEGIC_PER_TURN.IRON);
  });
});
