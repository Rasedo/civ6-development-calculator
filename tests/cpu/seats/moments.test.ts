import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { deriveContinents } from '../../../world/query';
import { campMoment, goodyMoment, greatPersonMoment, pantheonMoment, religionMoment, transferMoments, wonderMoment } from '../../../cpu/core/eras';
import { CIRCUMNAVIGATED_KEY, CITY_SIZE_KEY, DISASTER_IMPROVEMENT_KEY, FORMATION_KEY, FULL_ENCAMPMENT_KEY, HIGH_ADJACENCY_KEY, IMPROVEMENT_KEY, MITIGATED_FLOOD_KEY, NEAR_FLOOD_KEY, TECH_ERA_KEY, districtMoment, improvementMoment, mitigatedFloodMoment, momentKeysHeld, recordMoments } from '../../../cpu/core/moments';
import { districtAdjacency } from '../../../cpu/core/yields';
import { ERAS, TECHS } from '../../../cpu/data/techs';
import {
  MOMENT_GP_PAST_ERA, MOMENT_GP_FAITH_HALF, MOMENT_GOODY, MOMENT_CAMP, MOMENT_CAMP_NEAR, MOMENT_TECH_ERA,
  MOMENT_CITY_SIZES, MOMENT_NEAR_FLOOD, MOMENT_HIGH_ADJACENCY, MOMENT_FORMATION, MOMENT_FULL_ENCAMPMENT,
  MOMENT_FOREIGN_CAPITAL, MOMENT_NEAR_CIV_CITY, MOMENT_NEW_CONTINENT, MOMENT_ON_DESERT, MOMENT_PANTHEON,
  MOMENT_PANTHEON_FIRST, MOMENT_PLAYER_DEFEATED, MOMENT_RELIGION, MOMENT_RELIGION_FIRST, MOMENT_TO_ORIGINAL_OWNER,
  MOMENT_WONDER_GAME_ERA, MOMENT_WONDER_PAST_ERA, MOMENT_DISASTER_IMPROVEMENT, MOMENT_MITIGATED_FLOOD, RENEWABLE_IMPROVEMENTS,
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

  it('a Great Person: PAST_ERA before the game era, a patronage over half its own row', () => {
    const state = makeState(makeMap(20, 12));
    state.gameEra = 3;
    greatPersonMoment(state, 0, 1, null);
    expect(score(state, 0)).toBe(MOMENT_GP_PAST_ERA);
    greatPersonMoment(state, 0, 3, 'faith');
    expect(score(state, 0)).toBe(MOMENT_GP_PAST_ERA + MOMENT_GP_FAITH_HALF);
  });

  it('a village pays through the Ancient game era; a camp near a city its NEAR row through the Medieval', () => {
    const state = makeState(makeMap(20, 12));
    settleAt(state, tileAtCoords(state.map, 3, 5).index);
    goodyMoment(state, 0);
    campMoment(state, 0, tileAtCoords(state.map, 9, 5).index);
    expect(score(state, 0)).toBe(MOMENT_GOODY + MOMENT_CAMP_NEAR);
    state.gameEra = 1;
    goodyMoment(state, 0);
    campMoment(state, 0, tileAtCoords(state.map, 15, 5).index);
    expect(score(state, 0)).toBe(MOMENT_GOODY + MOMENT_CAMP_NEAR + MOMENT_CAMP);
    state.gameEra = 3;
    campMoment(state, 0, tileAtCoords(state.map, 15, 5).index);
    expect(score(state, 0)).toBe(MOMENT_GOODY + MOMENT_CAMP_NEAR + MOMENT_CAMP);
  });
});

describe('the once moments', () => {
  it('a Corps, a city holding every Encampment set: their keys pay once', () => {
    const state = makeState(makeMap(20, 12));
    const city = settleAt(state, tileAtCoords(state.map, 3, 5).index);
    state.units.push({ id: 1, type: 'WARRIOR', seat: 0, tileIndex: city.centerIndex, movesLeft: 2, movesFull: 2, charges: 0,
      hp: 100, xp: 0, level: 1, formation: 1 });
    recordMoments(state);
    expect(score(state, 0)).toBe(MOMENT_FORMATION.land[0][1]);
    expect(seatOf(state, 0)!.moments).toContain(FORMATION_KEY[0][1]);
    city.buildings.push('BARRACKS', 'ARMORY');
    recordMoments(state);
    expect(score(state, 0)).toBe(MOMENT_FORMATION.land[0][1]);
    city.buildings.push('MILITARY_ACADEMY');
    recordMoments(state);
    expect(score(state, 0)).toBe(MOMENT_FORMATION.land[0][1] + MOMENT_FULL_ENCAMPMENT);
    expect(seatOf(state, 0)!.moments).toContain(FULL_ENCAMPMENT_KEY);
  });

  it('the first holder pays FIRST_IN_WORLD, the next the plain row, nobody twice', () => {
    const state = makeState(makeMap(20, 12));
    state.seats.push(emptySeat(1));
    const classical = Object.values(TECHS).find((t) => t.era === ERAS[1])!.id;
    seatOf(state, 0)!.research.techs.push(classical);
    seatOf(state, 1)!.research.techs.push(classical);
    recordMoments(state);
    expect([score(state, 0), score(state, 1)]).toEqual([MOMENT_TECH_ERA[1], MOMENT_TECH_ERA[0]]);
    recordMoments(state);
    expect([score(state, 0), score(state, 1)]).toEqual([MOMENT_TECH_ERA[1], MOMENT_TECH_ERA[0]]);
    expect(seatOf(state, 0)!.moments).toEqual([TECH_ERA_KEY[1]]);
  });

  it('an Ancient tech records nothing; a city of 10 pays CITY_SIZE_SMALL', () => {
    const state = makeState(makeMap(20, 12));
    seatOf(state, 0)!.research.techs.push(Object.values(TECHS).find((t) => t.era === ERAS[0])!.id);
    settleAt(state, tileAtCoords(state.map, 3, 5).index);
    recordMoments(state);
    expect(score(state, 0)).toBe(0);
    seatOf(state, 0)!.cities[0].population = MOMENT_CITY_SIZES[0].pop;
    recordMoments(state);
    expect(score(state, 0)).toBe(MOMENT_CITY_SIZES[0].pay[1]);
    expect(seatOf(state, 0)!.moments).toEqual([CITY_SIZE_KEY[0]]);
  });

  it('a founding within range of Floodplains records NEAR_FLOODABLE_RIVER once a game', () => {
    const state = makeState(makeMap(20, 12));
    tileAtCoords(state.map, 5, 5).feature = 'FLOODPLAINS';
    settleAt(state, tileAtCoords(state.map, 3, 5).index);
    expect(score(state, 0)).toBe(MOMENT_NEAR_FLOOD);
    tileAtCoords(state.map, 12, 5).feature = 'FLOODPLAINS';
    settleAt(state, tileAtCoords(state.map, 12, 6).index);
    expect(score(state, 0)).toBe(MOMENT_NEAR_FLOOD);
    expect(seatOf(state, 0)!.moments).toEqual([NEAR_FLOOD_KEY]);
  });
});

describe('a district\'s high starting adjacency', () => {
  it('each adjacency row pays whole on its own; a Campus at its row\'s bonus records the moment, once', () => {
    const state = makeState(makeMap(20, 12));
    const city = settleAt(state, tileAtCoords(state.map, 3, 5).index);
    const campus = tileAtCoords(state.map, 4, 5);
    tileAtCoords(state.map, 5, 5).elevation = 'MOUNTAIN';
    for (const [c, r] of [[5, 4], [4, 4], [4, 6]]) tileAtCoords(state.map, c, r).feature = 'RAINFOREST';
    // a Mountain 1, three Rainforests 1 (one per two), the centre 0 (half a
    // district row): 2, not the pooled 3
    expect(districtAdjacency(state.map, campus, 'CAMPUS')).toBe(2);
    districtMoment(state, 0, city, campus.index, 'CAMPUS');
    expect(score(state, 0)).toBe(0);
    tileAtCoords(state.map, 5, 6).elevation = 'MOUNTAIN';
    districtMoment(state, 0, city, campus.index, 'CAMPUS');
    const pay = MOMENT_HIGH_ADJACENCY.find((r) => r.district === 'CAMPUS')!.pay;
    expect(score(state, 0)).toBe(pay);
    expect(seatOf(state, 0)!.moments).toContain(HIGH_ADJACENCY_KEY.CAMPUS);
    districtMoment(state, 0, city, campus.index, 'CAMPUS');
    expect(score(state, 0)).toBe(pay);
  });
});

describe('an improvement laid on a plot a natural disaster enriched', () => {
  it('records IMPROVEMENT_CONSTRUCTED_ON_DISASTER_YIELD_TILE_FIRST once; a plain plot records nothing', () => {
    const state = makeState(makeMap(20, 12));
    const plain = tileAtCoords(state.map, 4, 4);
    improvementMoment(state, 0, plain);
    expect(score(state, 0)).toBe(0);
    const rich = tileAtCoords(state.map, 6, 4);
    rich.fertility = 1;
    improvementMoment(state, 0, rich);
    improvementMoment(state, 0, rich);
    expect(score(state, 0)).toBe(MOMENT_DISASTER_IMPROVEMENT);
    expect(seatOf(state, 0)!.moments).toContain(DISASTER_IMPROVEMENT_KEY);
  });
});

describe('a mitigated flood, the world circumnavigated, a renewable energy improvement', () => {
  it('the mitigating seat records MITIGATED_RIVER_FLOOD once a game', () => {
    const state = makeState(makeMap(20, 12));
    mitigatedFloodMoment(state, 0);
    mitigatedFloodMoment(state, 0);
    expect(score(state, 0)).toBe(MOMENT_MITIGATED_FLOOD);
    expect(seatOf(state, 0)!.moments).toContain(MITIGATED_FLOOD_KEY);
  });

  it('under fog a seat holds the circumnavigation once every column holds a plot it explored', () => {
    const state = makeState(makeMap(20, 12));
    expect(momentKeysHeld(state, 0)).not.toContain(CIRCUMNAVIGATED_KEY); // no fog: nothing explored
    state.unitsMode = true;
    state.fogOfWar = true;
    const s = seatOf(state, 0)!;
    s.explored = state.map.tiles.map((t) => (t.row === 3 && t.col < 19 ? 1 : 0));
    expect(momentKeysHeld(state, 0)).not.toContain(CIRCUMNAVIGATED_KEY);
    s.explored[tileAtCoords(state.map, 19, 8).index] = 1;
    expect(momentKeysHeld(state, 0)).toContain(CIRCUMNAVIGATED_KEY);
  });

  it('the four renewable energy improvements share one key, held on the seat\'s land', () => {
    const keys = new Set(RENEWABLE_IMPROVEMENTS.map((id) => IMPROVEMENT_KEY[id]));
    expect(keys.size).toBe(1);
    const state = makeState(makeMap(20, 12));
    const t = tileAtCoords(state.map, 4, 4);
    t.ownerSeat = 0;
    t.improvement = 'WIND_FARM';
    expect(momentKeysHeld(state, 0)).toContain(IMPROVEMENT_KEY.WIND_FARM);
  });
});
