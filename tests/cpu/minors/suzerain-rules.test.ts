import { describe, it, expect } from 'vitest';
import { BARB_SEAT, emptySeat, seatOf, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { endTurn } from '../../../cpu/core/game';
import { spawnUnit } from '../../../cpu/core/units';
import { meleeAttack, cavalryHillCS, defenderCS } from '../../../cpu/core/combat';
import { suzerainEffect, regionalReach } from '../../../cpu/core/cityStates';
import { computeCityStats } from '../../../cpu/core/city';
import { cityTradeYields } from '../../../cpu/core/trade';
import {
  KABUL_XP_MULT,
  PRESLAV_HILL_CS,
  REGIONAL_REACH_BONUS,
  ANSHAN_WRITING_SCIENCE,
  ANSHAN_RELIC_SCIENCE,
  KUMASI_ROUTE_CULTURE,
  KUMASI_ROUTE_GOLD,
} from '../../../cpu/data/cityStates';
import { REGIONAL_RANGE } from '../../../cpu/data/constants';
import { RELIGION_PRESSURE_PER_TURN } from '../../../cpu/data/religion';
import { tilesWithin } from '../../../world/hex';
import type { CityState, CityStateType, City, GameState } from '../../../cpu/core/types';

/** a city-state from the REAL catalog — `suzerainEffect` keys on the name. */
function addNamedCs(state: GameState, name: string, type: CityStateType, col: number, row: number, envoys: Record<number, number> = {}): CityState {
  const center = tileAtCoords(state.map, col, row);
  const cityState: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name,
    type,
    centerIndex: center.index,
    population: 3,
    envoys,
    met: [0],
  };
  for (const t of tilesWithin(state.map, col, row, 1)) setTileOwner(t, seatOfCityState(cityState.id));
  state.cityStates.push(cityState);
  return cityState;
}

function completeDistrict(state: GameState, city: City, type: 'HOLY_SITE' | 'CAMPUS', col: number, row: number): void {
  const t = tileAtCoords(state.map, col, row);
  t.district = type;
  t.districtComplete = true;
  setTileOwner(t, city.seat);
  city.districts.push({ type, tileIndex: t.index });
}

describe('suzerain rules (the `suz`-coded perks)', () => {
  it('suzerainEffect keys on the catalog code and the strict contest', () => {
    const state = makeState(makeMap(20, 20));
    const kabul = addNamedCs(state, 'Kabul', 'militaristic', 3, 3, { 0: 3 });
    expect(suzerainEffect(state, 0, 'xpDouble')).toBe(true);
    expect(suzerainEffect(state, 0, 'cavalryHills')).toBe(false);
    expect(suzerainEffect(state, 1, 'xpDouble')).toBe(false);
    kabul.envoys = { 0: 3, 1: 3 }; // a tie leaves no suzerain
    expect(suzerainEffect(state, 0, 'xpDouble')).toBe(false);
  });

  it('Kabul doubles the XP of battles a unit INITIATES', () => {
    const run = (withKabul: boolean): number => {
      const state = makeState(makeMap(20, 20));
      state.unitsMode = true;
      settleAt(state, tileAtCoords(state.map, 3, 9).index);
      if (withKabul) addNamedCs(state, 'Kabul', 'militaristic', 17, 17, { 0: 3 });
      const atk = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 11, 9).index, 0)!;
      const def = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 12, 9).index, BARB_SEAT)!;
      expect(meleeAttack(state, atk.id, def.tileIndex, 0).ok).toBe(true);
      return atk.xp ?? 0;
    };
    const base = run(false);
    expect(base).toBeGreaterThan(0);
    expect(run(true)).toBe(base * KABUL_XP_MULT);
  });

  it('Preslav pays +5 CS to cavalry FIGHTING ON hill tiles', () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    settleAt(state, tileAtCoords(state.map, 3, 9).index);
    addNamedCs(state, 'Preslav', 'militaristic', 17, 17, { 0: 3 });
    const hill = tileAtCoords(state.map, 12, 9);
    hill.elevation = 'HILLS';
    const knight = spawnUnit(state, 'KNIGHT', hill.index, 0)!;
    const foot = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 13, 9).index, 0)!;
    expect(cavalryHillCS(state, knight, hill.index)).toBe(PRESLAV_HILL_CS);
    expect(cavalryHillCS(state, knight, foot.tileIndex)).toBe(0); // flat ground
    expect(cavalryHillCS(state, foot, hill.index)).toBe(0); // not cavalry
    // the defender term rides defenderCS
    const withSuz = defenderCS(state, knight, hill.index);
    state.cityStates[0].envoys = {};
    expect(defenderCS(state, knight, hill.index)).toBe(withSuz - PRESLAV_HILL_CS);
  });

  it('Mexico City stretches regional district effects by 3', () => {
    const state = makeState(makeMap(20, 20));
    addNamedCs(state, 'Mexico City', 'industrial', 3, 3, { 0: 3 });
    expect(regionalReach(state, 0)).toBe(REGIONAL_RANGE + REGIONAL_REACH_BONUS);
    expect(regionalReach(state, 1)).toBe(REGIONAL_RANGE);
    state.cityStates[0].envoys = {};
    expect(regionalReach(state, 0)).toBe(REGIONAL_RANGE);
  });

  it('Anshan pays science per Great Work of Writing, Relic and Artifact', () => {
    const state = makeState(makeMap(20, 20));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const anshan = addNamedCs(state, 'Anshan', 'scientific', 3, 3, { 0: 3 });
    city.greatWorksWriting = 2;
    city.relics = 1;
    city.artifacts = 3;
    const withSuz = computeCityStats(state, city).breakdown.buildings.science;
    anshan.envoys = {};
    const without = computeCityStats(state, city).breakdown.buildings.science;
    expect(withSuz - without).toBe(ANSHAN_WRITING_SCIENCE * 2 + ANSHAN_RELIC_SCIENCE * (1 + 3));
  });

  it('Kumasi pays route culture+gold per ORIGIN specialty district', () => {
    const state = makeState(makeMap(24, 20));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index);
    const kumasi = addNamedCs(state, 'Kumasi', 'cultural', 15, 9, { 0: 3 });
    completeDistrict(state, city, 'CAMPUS', 10, 9);
    completeDistrict(state, city, 'HOLY_SITE', 8, 9);
    seatOf(state, 0)!.tradeRoutes = [{ from: city.id, to: -1, toCs: kumasi.id, expiresTurn: state.turn + 100 }];
    const withSuz = cityTradeYields(state, city, 0);
    kumasi.envoys = {};
    const without = cityTradeYields(state, city, 0);
    expect(withSuz.culture - without.culture).toBe(KUMASI_ROUTE_CULTURE * 2);
    expect(withSuz.gold - without.gold).toBe(KUMASI_ROUTE_GOLD * 2);
  });

  it('Jerusalem: completed-Holy-Site cities exert pressure like the Holy City', () => {
    const run = (withJerusalem: boolean): number => {
      const state = makeState(makeMap(30, 12));
      const holyCity = settleAt(state, tileAtCoords(state.map, 2, 5).index);
      const hsCity = settleAt(state, tileAtCoords(state.map, 10, 5).index);
      completeDistrict(state, hsCity, 'HOLY_SITE', 11, 5);
      state.seats.push(emptySeat(1));
      const target = settleAt(state, tileAtCoords(state.map, 16, 5).index, 1); // >10 from the Holy City, <=10 from hsCity
      seatOf(state, 0)!.religion = { pantheon: null, founded: true, name: 'Test', follower: null, founder: null, worship: null, enhancer: null, holyTile: holyCity.centerIndex };
      if (withJerusalem) addNamedCs(state, 'Jerusalem', 'religious', 27, 2, { 0: 3 });
      endTurn(state);
      return target.religionPressure?.[0] ?? 0;
    };
    expect(run(false)).toBe(0);
    expect(run(true)).toBe(RELIGION_PRESSURE_PER_TURN);
  });

  it('Jerusalem never double-counts the Holy City itself', () => {
    const state = makeState(makeMap(30, 12));
    const holyCity = settleAt(state, tileAtCoords(state.map, 5, 5).index);
    completeDistrict(state, holyCity, 'HOLY_SITE', 6, 5);
    state.seats.push(emptySeat(1));
    const target = settleAt(state, tileAtCoords(state.map, 10, 5).index, 1);
    seatOf(state, 0)!.religion = { pantheon: null, founded: true, name: 'Test', follower: null, founder: null, worship: null, enhancer: null, holyTile: holyCity.centerIndex };
    addNamedCs(state, 'Jerusalem', 'religious', 27, 2, { 0: 3 });
    endTurn(state);
    expect(target.religionPressure?.[0] ?? 0).toBe(RELIGION_PRESSURE_PER_TURN);
  });
});
