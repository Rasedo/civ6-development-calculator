import { describe, it, expect } from 'vitest';
import { playerSeat } from '../src/core/seats';
import { createGame, endTurn, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';

// B6-S3 religious victory (predominance in EVERY alive civ, >half of each
// civ's cities). Gate-unreachable at 250t on the current seeds (ambient +1
// pressure and 10/15 missionary lumps don't flip majorities everywhere by the
// horizon), so these pokes pin the semantics: the 5/6 victoryType directions,
// the not-every-civ refusal, and the cityless-civ exclusion.

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

/** Pre-load pressure so this endTurn's spread flips every listed city to g. */
function pressAll(state: ReturnType<typeof newGame>, g: number, amount = 500) {
  const nRel = 1 + state.rivals.length;
  const all = [...state.cities, ...state.rivals.flatMap((rv) => rv.cities)];
  for (const c of all) {
    const pres = new Array(nRel).fill(0);
    pres[g] = amount;
    c.religionPressure = pres;
  }
}

describe('B6-S3 religious victory', () => {
  it('a rival religion predominant in every civ is a DEFEAT (victoryType 6)', () => {
    const state = newGame(1);
    const rv = state.rivals[0];
    rv.religion.founded = true;
    rv.religion.holyTile = rv.cities[0].centerIndex;
    pressAll(state, 1);
    endTurn(state);
    expect(state.victoryType).toBe(6);
    expect(state.gameOver).toBe(true);
  });

  it("the player's religion predominant everywhere wins (victoryType 5)", () => {
    const state = newGame(1);
    playerSeat(state).religion.founded = true;
    playerSeat(state).religion.holyTile = state.cities[0].centerIndex;
    pressAll(state, 0);
    endTurn(state);
    expect(state.victoryType).toBe(5);
    expect(state.gameOver).toBe(true);
  });

  it('no victory while any alive civ lacks a >half majority', () => {
    const state = newGame(1);
    const rv = state.rivals[0];
    rv.religion.founded = true;
    rv.religion.holyTile = rv.cities[0].centerIndex;
    pressAll(state, 1);
    // The player's single city resists: a dominant religion-0 accumulator
    // outweighs any ambient +1 religion-1 pressure this turn's spread adds.
    state.cities[0].religionPressure = [500, 0];
    endTurn(state);
    // 0 of 1 player cities follow religion 1 -> 0*2 <= 1 blocks the win.
    expect(state.victoryType).toBe(0);
    expect(state.gameOver).toBe(false);
  });

  it('a civ with zero cities is excluded from the every-civ requirement', () => {
    const state = newGame(2);
    const rv = state.rivals[0];
    // Rival 1 is eliminated: no cities, no units.
    state.rivals[1].cities = [];
    state.units = state.units.filter((u) => !(u.owner === 'rival' && u.civId === state.rivals[1].id));
    rv.religion.founded = true;
    rv.religion.holyTile = rv.cities[0].centerIndex;
    pressAll(state, 1);
    endTurn(state);
    expect(state.victoryType).toBe(6);
    expect(state.gameOver).toBe(true);
  });
});
