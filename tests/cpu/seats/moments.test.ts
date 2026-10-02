import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { deriveContinents } from '../../../world/query';
import { pantheonMoment, religionMoment, transferMoments, wonderMoment } from '../../../cpu/core/eras';
import {
  MOMENT_FOREIGN_CAPITAL, MOMENT_NEAR_CIV_CITY, MOMENT_NEW_CONTINENT, MOMENT_ON_DESERT, MOMENT_PANTHEON,
  MOMENT_PANTHEON_FIRST, MOMENT_PLAYER_DEFEATED, MOMENT_RELIGION, MOMENT_RELIGION_FIRST, MOMENT_TO_ORIGINAL_OWNER,
  MOMENT_WONDER_GAME_ERA, MOMENT_WONDER_PAST_ERA,
} from '../../../cpu/data/seats';

const score = (state: ReturnType<typeof makeState>, seat: number) => seatOf(state, seat)!.eraScore ?? 0;

describe('the founding moments', () => {
  it('a plain founding records none', () => {
    const state = makeState(makeMap(20, 12));
    settleAt(state, tileAtCoords(state.map, 3, 5).index);
    expect(score(state, 0)).toBe(0);
  });

  it('a desert centre pays its row; a city near another major\'s pays NEAR_OTHER_CIV_CITY', () => {
    const state = makeState(makeMap(20, 12));
    state.seats.push(emptySeat(1));
    tileAtCoords(state.map, 3, 5).terrain = 'DESERT';
    settleAt(state, tileAtCoords(state.map, 3, 5).index);
    expect(score(state, 0)).toBe(MOMENT_ON_DESERT);
    // the other major's city 5 away
    settleAt(state, tileAtCoords(state.map, 8, 5).index, 1);
    expect(score(state, 1)).toBe(MOMENT_NEAR_CIV_CITY);
    // 6 away: none
    settleAt(state, tileAtCoords(state.map, 15, 5).index, 1);
    expect(score(state, 1)).toBe(MOMENT_NEAR_CIV_CITY);
  });

  it('a city on a continent none of the seat\'s other cities stands on pays NEW_CONTINENT', () => {
    const state = makeState(makeMap(24, 12));
    for (const t of state.map.tiles) if (t.col === 11 || t.col === 12) t.terrain = 'OCEAN';
    deriveContinents(state.map);
    settleAt(state, tileAtCoords(state.map, 3, 5).index);
    expect(score(state, 0)).toBe(0); // the first city is no new continent
    settleAt(state, tileAtCoords(state.map, 18, 5).index);
    expect(score(state, 0)).toBe(MOMENT_NEW_CONTINENT);
    settleAt(state, tileAtCoords(state.map, 18, 9).index);
    expect(score(state, 0)).toBe(MOMENT_NEW_CONTINENT); // a second city there: none
  });
});

describe('the other moments', () => {
  it('the world\'s first pantheon and religion pay FIRST_IN_WORLD, the rest the plain row', () => {
    const state = makeState(makeMap(20, 12));
    state.seats.push(emptySeat(1));
    pantheonMoment(state, 0);
    seatOf(state, 0)!.religion.pantheon = 'GOD_OF_THE_SEA';
    pantheonMoment(state, 1);
    expect([score(state, 0), score(state, 1)]).toEqual([MOMENT_PANTHEON_FIRST, MOMENT_PANTHEON]);
    religionMoment(state, 1);
    seatOf(state, 1)!.religion.founded = true;
    religionMoment(state, 0);
    expect([score(state, 0), score(state, 1)]).toEqual([MOMENT_PANTHEON_FIRST + MOMENT_RELIGION,
      MOMENT_PANTHEON + MOMENT_RELIGION_FIRST]);
  });

  it('a wonder of the game era or later pays GAME_ERA, an older one PAST_ERA', () => {
    const state = makeState(makeMap(20, 12));
    state.gameEra = 2;
    wonderMoment(state, 0, 2);
    expect(score(state, 0)).toBe(MOMENT_WONDER_GAME_ERA);
    wonderMoment(state, 0, 1);
    expect(score(state, 0)).toBe(MOMENT_WONDER_GAME_ERA + MOMENT_WONDER_PAST_ERA);
  });

  it('a transfer pays the receiver: the last city, an original capital, a city back home', () => {
    const state = makeState(makeMap(20, 12));
    state.seats.push(emptySeat(1));
    transferMoments(state, 1, 0, { founderSeat: 1, origCapitalSeat: 1 }, false, true);
    expect(score(state, 0)).toBe(MOMENT_PLAYER_DEFEATED);
    transferMoments(state, 1, 0, { founderSeat: 1, origCapitalSeat: 1 }, false, false);
    expect(score(state, 0)).toBe(MOMENT_PLAYER_DEFEATED + MOMENT_FOREIGN_CAPITAL);
    transferMoments(state, 1, 0, { founderSeat: 1, origCapitalSeat: -1 }, false, false);
    expect(score(state, 0)).toBe(MOMENT_PLAYER_DEFEATED + MOMENT_FOREIGN_CAPITAL); // a plain capture: none
    transferMoments(state, 1, 0, { founderSeat: 0, origCapitalSeat: -1 }, false, false);
    expect(score(state, 0)).toBe(MOMENT_PLAYER_DEFEATED + MOMENT_FOREIGN_CAPITAL + MOMENT_TO_ORIGINAL_OWNER);
    transferMoments(state, 1, 0, { founderSeat: 0, origCapitalSeat: -1 }, true, false);
    expect(score(state, 0)).toBe(MOMENT_PLAYER_DEFEATED + MOMENT_FOREIGN_CAPITAL + MOMENT_TO_ORIGINAL_OWNER); // by loyalty: none
  });
});
