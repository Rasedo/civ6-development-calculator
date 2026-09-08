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
import { resolveCompetition, startCompetition, competitionOf, scoreProject } from '../../../cpu/core/competition';
import { emitCarbon } from '../../../cpu/core/climate';
import {
  COMPETITIONS, COMPETITION_CLIMATE, COMPETITION_TURNS, COMPETITION_WORLDS_FAIR,
  COMPETITION_WORLD_GAMES, COMPETITION_SPACE_STATION,
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

const FAIR = COMPETITIONS[COMPETITION_WORLDS_FAIR];

/** One turn of Great Person points, then the turn's bookkeeping. */
function earn(state: GameState, per: readonly number[]): void {
  per.forEach((n, seat) => {
    const sx = state.seats[seat];
    if (sx) (sx.gppTurn ??= {}).SCIENTIST = ((sx.gppTurn ?? {}).SCIENTIST ?? 0) + n;
  });
  resolveCompetition(state);
}

describe("the World's Fair", () => {
  it('carries the install rewards', () => {
    // CIV6 (Expansion2_Emergencies.xml, EMERGENCY_WORLDS_FAIR): FIRST PLACE
    // +1 Diplomatic Victory point and +100 Great Person points; TOP TIER +50
    // Favor and 2 random Industrial..Information civic boosts; BOTTOM 1.
    // the eight `WORLDS_FAIR_SCORE_GPP_*` rows, ScoreAmount 1 apiece — every
    // Great Person class but the Prophet
    expect(FAIR.scored.map((r) => r.source)).toEqual(Array(8).fill('gpp'));
    expect(FAIR.scored.map((r) => r.of)).toEqual([
      'GENERAL', 'ADMIRAL', 'ENGINEER', 'MERCHANT', 'SCIENTIST', 'WRITER', 'ARTIST', 'MUSICIAN',
    ]);
    expect(FAIR.scored.every((r) => r.amount === 1)).toBe(true);
    expect(FAIR.goldPoints).toBe(1);
    expect(FAIR.goldGpp).toBe(100);
    expect(FAIR.silverFavor).toBe(50);
    expect(FAIR.bronzeFavor).toBe(0);
    expect(FAIR.silverBoosts).toBe(2);
    expect(FAIR.bronzeBoosts).toBe(1);
    expect(FAIR.boostEras).toEqual(['Industrial', 'Information']);
  });

  it('scores the Great Person points EARNED, and clears the stash each turn', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLDS_FAIR, [0, 1, 2]);
    earn(state, [7, 3, 0]);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(7);
    expect(c.score[1]).toBe(3);
    expect(c.score[2]).toBe(0);
    // the stash is read ONCE and cleared, so a quiet turn adds nothing
    expect(state.seats[0].gppTurn).toBeUndefined();
    resolveCompetition(state);
    expect(competitionOf(state)!.score[0]).toBe(7);
  });

  it('pays the winner its victory point and its Great Person points', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLDS_FAIR, [0, 1, 2]);
    earn(state, [9, 1, 0]);
    const c = competitionOf(state)!;
    c.left = 1;
    const dv = state.seats[0].diplomaticPoints ?? 0;
    resolveCompetition(state);
    expect(competitionOf(state)).toBeUndefined();
    expect(state.seats[0].diplomaticPoints).toBe(dv + FAIR.goldPoints);
    expect(state.seats[0].gpp.SCIENTIST).toBe(FAIR.goldGpp);
    // ...and the Prophet is not one of the classes it scores
    expect(state.seats[0].gpp.PROPHET ?? 0).toBe(0);
  });
});

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

// ---------------------------------------------------------------------------
// THE TWO COMPETITIONS THAT SCORE ON HOLDINGS.
//
// CIV6 (Expansion2_Emergencies.xml): "Maintaining Stadiums" and "Maintaining
// Campus Districts" score every turn the building or district STANDS, while
// "Completing the Training Athletes project" scores once. That split is the
// whole point of the table being a list — the World Games score on all three
// at once, and the engine walks the rows rather than forking on the row's id.
// ---------------------------------------------------------------------------
describe('the World Games', () => {
  it('carries the install score table and rewards', () => {
    const g = COMPETITIONS[COMPETITION_WORLD_GAMES];
    expect(g.scored).toEqual([
      { source: 'project', amount: 50, of: 'TRAIN_ATHLETES' },
      { source: 'building', amount: 1, of: 'STADIUM' },
      { source: 'building', amount: 1, of: 'AQUATICS_CENTER' },
    ]);
    expect(g.goldPoints).toBe(1);
    expect(g.silverFavor).toBe(50);
    expect(g.bronzeFavor).toBe(0);
  });

  it('scores a Stadium every turn it stands, and each city separately', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLD_GAMES, [0, 1, 2]);
    state.seats[0].cities[0].buildings.push('STADIUM', 'AQUATICS_CENTER');
    state.seats[1].cities[0].buildings.push('STADIUM');
    resolveCompetition(state);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(2);   // both venues, 1 apiece
    expect(c.score[1]).toBe(1);
    expect(c.score[2]).toBe(0);
    resolveCompetition(state);
    expect(c.score[0]).toBe(4);   // ...and again next turn: it is MAINTAINED
  });

  it('pays the athletes project once, at its completion', () => {
    const state = table();
    startCompetition(state, COMPETITION_WORLD_GAMES, [0, 1, 2]);
    scoreProject(state, 0, 'TRAIN_ATHLETES');
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(50);
    // a project no row names pays nothing, and a seat outside the field
    // scores nothing at all
    scoreProject(state, 0, 'TRAIN_ASTRONAUTS');
    expect(c.score[0]).toBe(50);
    c.member[1] = 0;
    scoreProject(state, 1, 'TRAIN_ATHLETES');
    expect(c.score[1]).toBe(0);
  });
});

describe('the Space Station', () => {
  it('carries the install score table and rewards', () => {
    const s = COMPETITIONS[COMPETITION_SPACE_STATION];
    expect(s.scored).toEqual([
      { source: 'project', amount: 30, of: 'TRAIN_ASTRONAUTS' },
      { source: 'district', amount: 5, of: 'SPACEPORT' },
      { source: 'district', amount: 1, of: 'CAMPUS' },
    ]);
    expect(s.goldPoints).toBe(1);
    expect(s.silverFavor).toBe(50);
  });

  it('counts only districts that STAND', () => {
    const state = table();
    startCompetition(state, COMPETITION_SPACE_STATION, [0, 1, 2]);
    const city = state.seats[0].cities[0];
    const port = tileAtCoords(state.map, 4, 6);
    port.district = 'SPACEPORT';
    port.districtComplete = false;
    city.districts.push({ type: 'SPACEPORT', tileIndex: port.index });
    resolveCompetition(state);
    const c = competitionOf(state)!;
    expect(c.score[0]).toBe(0);   // queued, not finished
    port.districtComplete = true;
    resolveCompetition(state);
    expect(c.score[0]).toBe(5);
  });
});
