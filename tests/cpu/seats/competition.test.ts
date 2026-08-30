/** SCORED COMPETITIONS, TypeScript half.
 *
 * Sourced from the Civilopedia (World Congress) and the wiki's Competition and
 * Climate Accords pages:
 *   - "If enacted, players who vote in favor of the Scored Competition will
 *     compete to contribute to the cause. The players that contribute the most
 *     will receive lucrative rewards."
 *   - a competition runs for exactly 30 turns, "after which it ends and winners
 *     are chosen"; "the civilization with the highest score wins the Gold Tier
 *     rewards. Additionally, all civs whose scores fall within the top 25%
 *     (including the Gold Tier winner) win the Silver Tier rewards, and all
 *     civs whose scores fall within the next highest quarter (i.e. the top
 *     26-50%) win the Bronze Tier rewards."
 *   - Climate Accords is scored "1 point per turn for each CO2 emission less
 *     than the highest polluter"; Gold 2 Diplomatic Victory points, Silver 100
 *     Diplomatic Favor, Bronze 50 Diplomatic Favor.
 *
 * The GPU twin is `tests/gpu/congress_vote_test.py`'s competition poke.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, setTileOwner } from '../../../cpu/core/seats';
import { resolveCompetition, startCompetition, competitionOf } from '../../../cpu/core/competition';
import { emitCarbon } from '../../../cpu/core/climate';
import {
  COMPETITIONS, COMPETITION_CLIMATE, COMPETITION_TURNS,
} from '../../../cpu/data/seats';
import { tilesWithin } from '../../../world/hex';
import type { City, GameState, Seat } from '../../../cpu/core/types';

function addSeat(state: GameState, seat: number, col: number, row: number): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const s: Seat = { ...emptySeat(seat), name: `Seat${seat}` };
  const city: City = {
    id: s.nextCityId++, name: `City${seat}`, seat, centerIndex: tile.index,
    population: 4, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced',
    queue: [], isCapital: true, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seat, city.id);
  s.cities.push(city);
  if (state.seats.length <= seat) state.seats.length = seat;
  state.seats[seat] = s;
  return s;
}

function table(): GameState {
  const state = makeState(makeMap(20, 12, 'GRASSLAND'));
  state.seats = [];
  addSeat(state, 0, 3, 6);
  addSeat(state, 1, 9, 6);
  addSeat(state, 2, 15, 6);
  return state;
}

/** One turn of emissions, then the turn's competition bookkeeping. */
function burn(state: GameState, per: readonly number[]): void {
  per.forEach((raw, seat) => emitCarbon(state, seat, raw));
  resolveCompetition(state);
}

const CLIMATE = COMPETITIONS[COMPETITION_CLIMATE];

describe('a scored competition', () => {
  it('scores the gap to the highest polluter, and the polluter scores nothing', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1, 2]);
    burn(state, [10, 4, 0]);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(0);   // the highest polluter is the baseline
    expect(c.score[1]).toBe(6);
    expect(c.score[2]).toBe(10);
    // ...and the turn's emission is spent, never carried
    expect(state.seats[0].co2Turn).toBe(0);
    burn(state, [10, 4, 0]);
    expect(c.score[2]).toBe(20);
  });

  it('only the field competes', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1]);
    burn(state, [10, 4, 0]);
    const c = competitionOf(state)!;
    expect(c.member[2]).toBe(0);
    expect(c.score[2]).toBe(0);
    expect(c.score[1]).toBe(6);
  });

  it('pays the podium when the 30 turns run out, and then ends', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1, 2]);
    for (let i = 0; i < COMPETITION_TURNS; i++) burn(state, [10, 4, 0]);
    expect(competitionOf(state)).toBeUndefined();
    // three in the field: silver is the top quarter rounded up (1 seat), and
    // bronze the quarter below it (the second).
    expect(state.seats[2].diplomaticPoints).toBe(CLIMATE.goldPoints);
    expect(state.seats[2].diplomaticFavor).toBe(CLIMATE.silverFavor);
    expect(state.seats[1].diplomaticPoints ?? 0).toBe(0);
    expect(state.seats[1].diplomaticFavor).toBe(CLIMATE.bronzeFavor);
    expect(state.seats[0].diplomaticFavor ?? 0).toBe(0);
  });

  it('a tie takes the lower seat, one total order both engines share', () => {
    const state = table();
    startCompetition(state, COMPETITION_CLIMATE, [0, 1, 2]);
    // seats 1 and 2 emit nothing, so both trail seat 0 by the same gap
    for (let i = 0; i < COMPETITION_TURNS; i++) burn(state, [10, 0, 0]);
    expect(state.seats[1].diplomaticPoints).toBe(CLIMATE.goldPoints);
    expect(state.seats[2].diplomaticPoints ?? 0).toBe(0);
  });
});
