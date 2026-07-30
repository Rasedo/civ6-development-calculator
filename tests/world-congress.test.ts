import { describe, it, expect } from 'vitest';
import { playerSeat } from '../src/core/seats';
import { createGame, endTurn, foundCity } from '../src/core/game';
import { worldCongress } from '../src/core/rivals';
import { scoreSettleSites } from '../src/core/advisor';
import {
  CONGRESS_INTERVAL,
  CONGRESS_MIN_ERA,
  DVP_PER_RESOLUTION,
  DIPLO_VICTORY_POINTS,
} from '../src/data/rivals';

// B-22 (#76) WORLD CONGRESS. Sourced (Civilopedia GS): the Congress begins
// meeting once the game reaches the MEDIEVAL era and convenes every 30 turns;
// resolutions are voted on with Diplomatic Favor; Diplomatic Victory needs 20
// Diplomatic Victory Points.
//
// MEASURED in the gate: the Congress convenes 5-6 times per seed and awards
// 102 DVP across the 24 seeds (max 6 to any one civ) — so the SESSION and the
// AWARD are genuinely exercised, and congressSessions/diploPoints are compared
// trace columns. The 20-point WIN is NOT reachable at 250 turns (6 of 20 is
// the best any civ manages), so these pokes are the bar for the victory.

function newGame(rivals = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, rivals,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  state.autoResearch = false;
  return state;
}

/** Force every civ past the Medieval gate by handing them a Medieval tech. */
function medieval(state: ReturnType<typeof newGame>) {
  state.research.techs.push('APPRENTICESHIP'); // Medieval
  for (const rv of state.rivals) rv.research.techs.push('APPRENTICESHIP');
}

describe('B-22 world congress', () => {
  it('does not convene before the MEDIEVAL era', () => {
    const state = newGame(1);
    state.turn = CONGRESS_INTERVAL; // a session turn ...
    playerSeat(state).diploFavor = 50;
    worldCongress(state);
    expect(state.congressSessions ?? 0).toBe(0); // ... but nobody is Medieval
    expect(playerSeat(state).diploFavor).toBe(50); // favor untouched
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

  it('the largest favor commitment wins the resolution and all favor is spent', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    playerSeat(state).diploFavor = 10;
    state.rivals[0].diploFavor = 40; // the rival outspends the player
    worldCongress(state);
    expect(state.rivals[0].diploPoints).toBe(DVP_PER_RESOLUTION);
    expect(playerSeat(state).diploPoints ?? 0).toBe(0);
    expect(playerSeat(state).diploFavor).toBe(0); // spent regardless of the outcome
    expect(state.rivals[0].diploFavor).toBe(0);
  });

  it('a TIE goes to the lower civ id (the player)', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    playerSeat(state).diploFavor = 25;
    state.rivals[0].diploFavor = 25;
    worldCongress(state);
    expect(playerSeat(state).diploPoints).toBe(DVP_PER_RESOLUTION);
    expect(state.rivals[0].diploPoints ?? 0).toBe(0);
  });

  it('a civ with NO favor casts no vote and cannot win', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    playerSeat(state).diploFavor = 0;
    state.rivals[0].diploFavor = 0;
    worldCongress(state);
    expect(state.congressSessions).toBe(1); // the session still happened
    expect(playerSeat(state).diploPoints ?? 0).toBe(0); // ... and awarded nothing
    expect(state.rivals[0].diploPoints ?? 0).toBe(0);
  });

  it('the Medieval gate reads ANY civ, not just the player', () => {
    const state = newGame(1);
    state.rivals[0].research.techs.push('APPRENTICESHIP'); // only the rival
    state.turn = CONGRESS_INTERVAL;
    playerSeat(state).diploFavor = 5;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    expect(CONGRESS_MIN_ERA).toBe(2); // sourced: Medieval
  });
});

describe('B-22/B-25 diplomatic victory', () => {
  it('20 points wins for the player (victoryType 9)', () => {
    const state = newGame(1);
    playerSeat(state).diploPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(9);
    expect(state.gameOver).toBe(true);
  });

  it('a rival reaching 20 is a DEFEAT (victoryType 10)', () => {
    const state = newGame(1);
    state.rivals[0].diploPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(10);
    expect(state.gameOver).toBe(true);
  });

  it('19 points is not a win — the bar is the full threshold', () => {
    const state = newGame(1);
    playerSeat(state).diploPoints = DIPLO_VICTORY_POINTS - 1;
    endTurn(state);
    expect(state.victoryType).not.toBe(9);
    expect(state.gameOver).toBe(false);
  });

  it('a CULTURE victory outranks a diplomatic one on the same turn', () => {
    const state = newGame(1);
    // player would win on culture ...
    playerSeat(state).tourism = 5 * 2 * 200;
    playerSeat(state).cultureTotal = 100;
    state.rivals[0].cultureTotal = 400;
    state.rivals[0].tourism = 0;
    // ... and on diplomacy
    playerSeat(state).diploPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(7); // culture ranks first
  });
});
