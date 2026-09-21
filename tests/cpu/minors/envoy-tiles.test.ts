/**
 * A CITY-STATE'S PLOT PER ENVOY.
 *
 * CIV6 (`CivilizationLevels.CanAnnexTilesWithReceivedInfluence`, TRUE for
 * CITY_STATE alone): a minor takes ground from the influence SPENT ON IT.
 * Measured on one minor over fifteen readings on a single turn, so nothing
 * but the envoys moved — exactly +1 owned plot per envoy received,
 * `plots = envoys + 6`, no cap through sixteen, and the suzerain contest does
 * not change the slope. The GPU half is tests/gpu/envoy_tiles_test.py.
 *
 * WHICH plot is the city rule's own next-tile pick and its own refusals; the
 * game's choice rule is unmeasured.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner, tileSeat } from '../../../cpu/core/seats';
import { addEnvoys, isSuzerain, placeCityStateAt, suzerainOf } from '../../../cpu/core/cityStates';
import { minorPhase } from '../../../cpu/core/minorBuild';
import { pickBorderTile, borderCandidates } from '../../../cpu/core/city';
import { minorCity } from '../../../cpu/core/cityStates';
import { CIV_LEVELS } from '../../../cpu/data/civLevels';
import { SUZERAIN_ENVOYS } from '../../../cpu/data/cityStates';
import type { CityState, GameState, Seat } from '../../../cpu/core/types';

function addSeat(state: GameState, seat: number): Seat {
  const s = emptySeat(seat);
  state.seats.push(s);
  return s;
}

/** The minor seated exactly as the game seats one — `placeCityStateAt`, whose
 *  StartingTilesForCity claim is the SIX the measured equation counts. */
function scene(): { state: GameState; cs: CityState } {
  const state = makeState(makeMap(24, 24));
  addSeat(state, 0);
  addSeat(state, 1);
  const cs = placeCityStateAt(state, 0, 'CS0', 'scientific', tileAtCoords(state.map, 8, 8).index);
  cs.met = [0, 1];
  return { state, cs };
}

function plots(state: GameState, cs: CityState): number {
  return state.map.tiles.filter((t) => tileSeat(t) === cs.seat).length;
}

describe('the install says a minor may annex with received influence', () => {
  it('is the one class of player that can, and the six it starts with', () => {
    expect(CIV_LEVELS.CITY_STATE.canAnnexTilesWithReceivedInfluence).toBe(true);
    expect(CIV_LEVELS.FULL_CIV.canAnnexTilesWithReceivedInfluence).toBe(false);
    expect(CIV_LEVELS.FREE_CITIES.canAnnexTilesWithReceivedInfluence).toBe(false);
    expect(CIV_LEVELS.TRIBE.canAnnexTilesWithReceivedInfluence).toBe(false);
    const { state, cs } = scene();
    expect(plots(state, cs)).toBe(6);
    // ...and the culture box still buys nothing: the two columns are disjoint
    expect(CIV_LEVELS.CITY_STATE.canAnnexTilesWithCulture).toBe(false);
  });
});

describe('one plot per envoy RECEIVED', () => {
  it('0 -> 3 envoys takes three plots, and 3 -> 4 takes one more', () => {
    const { state, cs } = scene();
    addEnvoys(state, cs, 0, 3);
    expect(plots(state, cs)).toBe(9);
    expect(cs.tilesAcquired).toBe(3);
    addEnvoys(state, cs, 0, 1);
    expect(plots(state, cs)).toBe(10);
    expect(cs.tilesAcquired).toBe(4);
  });

  it('holds `plots = envoys + 6` with no cap through sixteen', () => {
    const { state, cs } = scene();
    for (let n = 1; n <= 16; n += 1) {
      addEnvoys(state, cs, 0, 1);
      expect(plots(state, cs)).toBe(n + 6);
    }
  });

  it('pays at the WRITE, not at the minor phase', () => {
    const { state, cs } = scene();
    addEnvoys(state, cs, 0, 2);
    expect(plots(state, cs)).toBe(8);
    // ...and the phase adds nothing of its own: a minor's culture box claims
    // no ground, so the count only ever moves on an envoy
    const before = plots(state, cs);
    for (let t = 0; t < 5; t += 1) {
      state.turn = t;
      minorPhase(state);
    }
    expect(plots(state, cs)).toBe(before);
  });

  it('counts envoys from ANY seat and the suzerain contest changes no slope', () => {
    const split = scene();
    addEnvoys(split.state, split.cs, 0, 2);
    addEnvoys(split.state, split.cs, 1, 2);
    expect(suzerainOf(split.cs)).toBe(-1); // a TIE leaves nobody
    expect(plots(split.state, split.cs)).toBe(10);

    const sole = scene();
    addEnvoys(sole.state, sole.cs, 0, 4);
    expect(isSuzerain(sole.state, sole.cs, 0)).toBe(true);
    expect(suzerainOf(sole.cs)).toBe(0);
    expect(plots(sole.state, sole.cs)).toBe(10); // the same four plots
    expect(SUZERAIN_ENVOYS).toBe(3);
  });
});

describe('the border rule keeps its own refusals', () => {
  it('never takes a plot a major already holds', () => {
    const { state, cs } = scene();
    // the whole ring-2 arc a claim would reach first, in a major's hands
    const taken = borderCandidates(state, minorCity(cs)).slice(0, 4);
    expect(taken.length).toBe(4);
    for (const i of taken) setTileOwner(state.map.tiles[i], 0, 0);
    addEnvoys(state, cs, 0, 4);
    for (const i of taken) {
      expect(tileSeat(state.map.tiles[i])).toBe(0);
    }
    // still exactly four plots, taken from what was free
    expect(cs.tilesAcquired).toBe(4);
    expect(plots(state, cs)).toBe(10);
  });

  it('claims the pick the city rule itself names, plot by plot', () => {
    const { state, cs } = scene();
    for (let n = 0; n < 5; n += 1) {
      const want = pickBorderTile(state, minorCity(cs));
      expect(want).not.toBeNull();
      addEnvoys(state, cs, 0, 1);
      expect(tileSeat(state.map.tiles[want!])).toBe(cs.seat);
    }
  });

  it('a removed envoy takes no ground back and buys nothing until the count passes its mark', () => {
    const { state, cs } = scene();
    addEnvoys(state, cs, 0, 4);
    expect(plots(state, cs)).toBe(10);
    cs.envoys[0] = 1;                    // a spy's Fabricate Scandal
    addEnvoys(state, cs, 0, 1);          // back to 2, still under the mark
    expect(plots(state, cs)).toBe(10);
    expect(cs.tilesAcquired).toBe(4);
    addEnvoys(state, cs, 0, 3);          // 5 — one past the mark
    expect(plots(state, cs)).toBe(11);
  });
});
