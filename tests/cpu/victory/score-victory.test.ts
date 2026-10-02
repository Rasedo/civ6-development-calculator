import { describe, it, expect } from 'vitest';
import type { GameState } from '../../../cpu/core/types';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { endTurn, TURN_LIMIT } from '../../../cpu/core/game';
import { enterEra } from '../../../cpu/core/eras';
import { scoreLeader, scoreLines } from '../../../cpu/core/score';
import { SCORING_LINE_ITEMS } from '../../../cpu/data/scoring';
import { GREAT_PEOPLE } from '../../../cpu/data/greatPeople';
import { FOLLOWER_BELIEFS, FOUNDER_BELIEFS, WORSHIP_BELIEFS, ENHANCER_BELIEFS } from '../../../cpu/data/religion';
import { placeCityStateAt } from '../../../cpu/core/cityStates';
import { seededGame, makeMap, makeState, settleAt } from '../helpers';

// CIV 6'S SCORE and the turn-limit victory it decides. No scripted game
// reaches the turn limit with a tie, so these pokes pin the counting and the
// tie order. The GPU twin is tests/gpu/score_victory_test.py.

const line = (count: string) => SCORING_LINE_ITEMS.findIndex((l) => l.count === count);
const total = (state: GameState, seat: number) => scoreLines(state, seatOf(state, seat)!).reduce((a, b) => a + b, 0);

describe('the Score catalog', () => {
  it('carries the GS rows', () => {
    expect(SCORING_LINE_ITEMS.map((l) => [l.id, l.multiplier])).toEqual([
      ['LINE_ITEM_ERA_BUILDINGS', 1],
      ['LINE_ITEM_ERA_CONVERTED', 2],
      ['LINE_ITEM_ERA_SCORE', 1],
      ['LINE_ITEM_CIVICS', 3],
      ['LINE_ITEM_CITIES', 5],
      ['LINE_ITEM_DISTRICTS', 2],
      ['LINE_ITEM_POPULATION', 1],
      ['LINE_ITEM_GREAT_PEOPLE', 5],
      ['LINE_ITEM_RELIGION', 5],
      ['LINE_ITEM_TECHS', 2],
      ['LINE_ITEM_WONDERS', 15],
    ]);
    for (const l of SCORING_LINE_ITEMS) expect(l.categoryMultiplier).toBe(1);
  });
});

describe('the Score', () => {
  it('counts each line on a built state', () => {
    const state = makeState(makeMap(20, 12));
    const a = settleAt(state, 2 * 20 + 3);
    const b = settleAt(state, 8 * 20 + 14);
    const s = seatOf(state, 0)!;
    s.research.civics.push('CODE_OF_LAWS', 'CRAFTSMANSHIP');
    s.research.techs.push('POTTERY', 'MINING', 'ARCHERY');
    a.population = 3;
    b.population = 4;
    // a completed Campus counts, a placed Theater Square does not
    const campus = a.centerIndex + 1;
    a.districts.push({ type: 'CAMPUS', tileIndex: campus });
    state.map.tiles[campus].district = 'CAMPUS';
    state.map.tiles[campus].districtComplete = true;
    const theater = b.centerIndex + 1;
    b.districts.push({ type: 'THEATER_SQUARE', tileIndex: theater });
    state.map.tiles[theater].district = 'THEATER_SQUARE';
    // a completed wonder counts as a wonder AND once among the buildings, its
    // district nothing; one still under construction counts as neither
    const pyr = a.centerIndex - 1;
    a.wonders.push({ id: 'PYRAMIDS', tileIndex: pyr });
    state.map.tiles[pyr].builtWonder = 'PYRAMIDS';
    state.map.tiles[pyr].builtWonderComplete = true;
    const ora = b.centerIndex - 1;
    b.wonders.push({ id: 'ORACLE', tileIndex: ora });
    state.map.tiles[ora].builtWonder = 'ORACLE';
    s.gpEarned.push(GREAT_PEOPLE.SCIENTIST[0].id, GREAT_PEOPLE.ENGINEER[0].id);
    // founded and enhanced: one belief of each of the four classes; the
    // pantheon is not one of them
    s.religion.pantheon = 'GOD_OF_THE_SEA';
    s.religion.founded = true;
    s.religion.follower = Object.keys(FOLLOWER_BELIEFS)[0];
    s.religion.founder = Object.keys(FOUNDER_BELIEFS)[0];
    s.religion.worship = Object.keys(WORSHIP_BELIEFS)[0];
    s.religion.enhancer = Object.keys(ENHANCER_BELIEFS)[0];
    s.eraScore = 39;
    // the capital's Palace, a Monument and a pillaged Granary are buildings,
    // and the completed Pyramids one more
    a.buildings.push('MONUMENT');
    b.buildings.push('GRANARY');
    b.pillagedBuildings = ['GRANARY'];

    const got = scoreLines(state, s);
    expect(got[line('buildings')]).toBe(4);
    expect(got[line('converted')]).toBe(0);
    expect(got[line('eraScore')]).toBe(39);
    expect(got[line('civics')]).toBe(2 * 3);
    expect(got[line('cities')]).toBe(2 * 5);
    expect(got[line('districts')]).toBe(1 * 2);
    expect(got[line('population')]).toBe(7);
    expect(got[line('greatPeople')]).toBe(2 * 5);
    expect(got[line('religion')]).toBe(4 * 5);
    expect(got[line('techs')]).toBe(3 * 2);
    expect(got[line('wonders')]).toBe(15);
    expect(got.reduce((x, y) => x + y, 0)).toBe(4 + 39 + 6 + 10 + 2 + 7 + 10 + 20 + 6 + 15);
  });

  it('Converted counts 2 per foreign city whose majority follows the religion, city-states included', () => {
    const state = makeState(makeMap(24, 12));
    state.seats.push(emptySeat(1));
    const own = settleAt(state, 3 * 24 + 4, 0);
    const far = settleAt(state, 7 * 24 + 18, 1);
    const s0 = seatOf(state, 0)!;
    s0.religion.founded = true;
    // the seat's own city following its religion is not foreign
    own.followedReligion = 0;
    expect(scoreLines(state, s0)[line('converted')]).toBe(0);
    far.followedReligion = 0;
    expect(scoreLines(state, s0)[line('converted')]).toBe(2);
    // a city-state by its majority, whatever its followers
    const cs = placeCityStateAt(state, 0, 'CS0', 'religious', 5 * 24 + 12);
    cs.religionPressure = [400];
    expect(scoreLines(state, s0)[line('converted')]).toBe(4);
    cs.religionPressure = [0, 400];
    expect(scoreLines(state, s0)[line('converted')]).toBe(2);
    expect(scoreLines(state, seatOf(state, 1)!)[line('converted')]).toBe(2);
  });

  it('a new era keeps the whole game\'s era score', () => {
    const state = makeState(makeMap(20, 12));
    settleAt(state, 2 * 20 + 3);
    const s = seatOf(state, 0)!;
    s.eraScore = 17;
    enterEra(state);
    expect(s.eraScore).toBe(17);
    expect(scoreLines(state, s)[line('eraScore')]).toBe(17);
  });
});

describe('the score victory', () => {
  function twoSeats() {
    const state = makeState(makeMap(24, 12));
    state.seats.push(emptySeat(1));
    settleAt(state, 3 * 24 + 4, 0);
    settleAt(state, 7 * 24 + 18, 1);
    return state;
  }

  it('names the seat with the highest Score', () => {
    const state = twoSeats();
    expect(scoreLeader(state)).toBe(0); // level: the lower seat
    seatOf(state, 1)!.research.techs.push('POTTERY');
    expect(scoreLeader(state)).toBe(1);
  });

  it('gives a tie to the lower seat whatever the line items', () => {
    const level = twoSeats();
    expect(total(level, 0)).toBe(total(level, 1));
    expect(scoreLeader(level)).toBe(0);
    // equal totals: seat 0 holds 2 more techs (+4), seat 1 4 more era score
    const era = twoSeats();
    seatOf(era, 0)!.research.techs.push('POTTERY', 'MINING');
    seatOf(era, 1)!.eraScore = (seatOf(era, 1)!.eraScore ?? 0) + 4;
    expect(total(era, 0)).toBe(total(era, 1));
    expect(scoreLeader(era)).toBe(0);
    // equal totals: seat 0 holds one more era score, seat 1 one more building
    const bld = twoSeats();
    seatOf(bld, 0)!.eraScore = (seatOf(bld, 0)!.eraScore ?? 0) + 1;
    seatOf(bld, 1)!.cities[0].buildings.push('MONUMENT');
    expect(total(bld, 0)).toBe(total(bld, 1));
    expect(scoreLeader(bld)).toBe(0);
    // one point ahead wins
    seatOf(bld, 1)!.cities[0].buildings.push('GRANARY');
    expect(scoreLeader(bld)).toBe(1);
  });

  it('a seat with no city cannot win it', () => {
    const state = twoSeats();
    seatOf(state, 1)!.research.techs.push('POTTERY', 'MINING', 'ARCHERY');
    seatOf(state, 1)!.cities = [];
    expect(scoreLeader(state)).toBe(0);
    seatOf(state, 0)!.cities = [];
    expect(scoreLeader(state)).toBe(-1);
  });

  it('past TURN_LIMIT endTurn ends the game on the score and names the leader', () => {
    const state = seededGame(4242, 2);
    state.autoResearch = false;
    seatOf(state, 1)!.research.civics.push('CODE_OF_LAWS', 'CRAFTSMANSHIP', 'FOREIGN_TRADE', 'EARLY_EMPIRE');
    state.turn = TURN_LIMIT - 1;
    endTurn(state);
    expect(state.gameOver).toBe(false);
    expect(state.victoryRow).toBe(-1);
    endTurn(state);
    expect(state.gameOver).toBe(true);
    expect(state.victoryType).toBe(1);
    expect(state.victoryRow).toBe(1);
    expect(state.victoryRow).toBe(scoreLeader(state));
  });
});
