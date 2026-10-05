/**
 * WHAT A CITY PRESSES, AND WHO TAKES IT (runs/h1_duelw1103..1108, the
 * harness's step.pressure): the Holy City x4, a Holy Site (pillaged or not)
 * or Stonehenge x2 elsewhere, the two never stacked; no city takes its own;
 * a city-state's one city takes pressure, follows and presses on the
 * religion's founder's turn, as every following city does, a city the walk
 * converts included. The GPU twin is tests/gpu/religion2_test.py's `poke_pressure_sources`.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity, pressureFromCity, spreadReligiousPressure } from '../../../cpu/core/game';
import { emptySeat, majorityReligionOf, seatOf, seatOfCityState, setTileOwner } from '../../../cpu/core/seats';
import { HOLY_CITY_PRESSURE_MULT, HOLY_SITE_PRESSURE_MULT, RELIGION_PRESSURE_PER_TURN } from '../../../cpu/data/religion';
import type { City, CityState, GameState } from '../../../cpu/core/types';

function scene(): { state: GameState; holy: City; other: City } {
  const state = makeState(makeMap(40, 20));
  state.sandbox = true;
  const holy = foundCity(state, tileAtCoords(state.map, 5, 10).index, 0).city!;
  const other = foundCity(state, tileAtCoords(state.map, 10, 10).index, 0).city!;
  const r = seatOf(state, 0)!.religion;
  r.founded = true;
  r.holyTile = holy.centerIndex;
  holy.followedReligion = 0;
  other.followedReligion = 0;
  return { state, holy, other };
}

function holySiteIn(state: GameState, city: City, col: number, row: number): number {
  const t = tileAtCoords(state.map, col, row);
  t.district = 'HOLY_SITE';
  t.districtComplete = true;
  setTileOwner(t, city.seat, city.id);
  city.districts.push({ type: 'HOLY_SITE', tileIndex: t.index });
  return t.index;
}

function cityStateAt(state: GameState, col: number, row: number): CityState {
  const cs: CityState = {
    ...emptySeat(seatOfCityState(state.cityStates.length)),
    id: state.cityStates.length,
    name: 'Kandy',
    type: 'religious',
    centerIndex: tileAtCoords(state.map, col, row).index,
    population: 2,
    envoys: {},
    met: [0],
  };
  state.cityStates.push(cs);
  return cs;
}

describe('the pressure a city presses', () => {
  const base = RELIGION_PRESSURE_PER_TURN;

  it('the Holy City x4 with or without a Holy Site; a Holy Site, pillaged or not, x2 elsewhere', () => {
    const { state, holy, other } = scene();
    expect(pressureFromCity(state, holy, 0)).toBe(HOLY_CITY_PRESSURE_MULT * base);
    holySiteIn(state, holy, 6, 10);
    expect(pressureFromCity(state, holy, 0)).toBe(HOLY_CITY_PRESSURE_MULT * base);
    expect(pressureFromCity(state, other, 0)).toBe(base);
    const hs = holySiteIn(state, other, 11, 10);
    expect(pressureFromCity(state, other, 0)).toBe(HOLY_SITE_PRESSURE_MULT * base);
    state.map.tiles[hs].districtPillaged = true;
    expect(pressureFromCity(state, other, 0)).toBe(HOLY_SITE_PRESSURE_MULT * base);
  });

  it('Stonehenge (AllowsHolyCity) presses as a Holy Site does', () => {
    const { state, other } = scene();
    const t = tileAtCoords(state.map, 11, 11);
    t.builtWonder = 'STONEHENGE';
    t.builtWonderComplete = true;
    other.wonders.push({ id: 'STONEHENGE', tileIndex: t.index });
    expect(pressureFromCity(state, other, 0)).toBe(HOLY_SITE_PRESSURE_MULT * base);
  });

  it('a city takes none of its own pressure', () => {
    const { state, holy, other } = scene();
    holy.religionPressure = [1000];
    other.religionPressure = [0];
    spreadReligiousPressure(state, 0);
    expect(holy.religionPressure[0]).toBe(1000 + base);
    expect(other.religionPressure[0]).toBe(HOLY_CITY_PRESSURE_MULT * base);
  });

  it("a city-state's city takes pressure, follows, and presses on the founder's turn", () => {
    const { state, holy, other } = scene();
    holy.religionPressure = [1000];
    other.followedReligion = null;
    const cs = cityStateAt(state, 8, 12);
    spreadReligiousPressure(state, 0);
    expect(cs.religionPressure![0]).toBe(HOLY_CITY_PRESSURE_MULT * base);
    // it follows what its pressure holds against its 50 a citizen
    cs.religionPressure![0] = 500;
    expect(majorityReligionOf(state, cs.seat)).toBe(0);
    // ...and presses every other city in range when the religion's founder
    // spreads it; a minor's own turn spreads nothing
    const h0 = holy.religionPressure?.[0] ?? 0;
    const o0 = other.religionPressure?.[0] ?? 0;
    spreadReligiousPressure(state, cs.seat);
    expect(cs.religionPressure![0]).toBe(500);
    spreadReligiousPressure(state, 0);
    expect(holy.religionPressure![0]).toBe(h0 + base);
    expect(other.religionPressure![0]).toBe(o0 + base + HOLY_CITY_PRESSURE_MULT * base);
    expect(cs.religionPressure![0]).toBe(500 + HOLY_CITY_PRESSURE_MULT * base);
  });

  it('a city the walk converts presses when its own place comes, the same turn (GameCore 0x498660)', () => {
    // runs/h1_duelw1108 t128: Shanghai, pop 1 on 26 of the religion against
    // its 50 unconverted, takes the Holy City's step, follows, and presses
    // Xian before the turn ends
    const { state, holy, other } = scene();
    holy.religionPressure = [1000];
    other.followedReligion = null;
    other.religionPressure = [45];
    other.unconvertedPressure = 50;
    spreadReligiousPressure(state, 0);
    expect(other.religionPressure[0]).toBe(45 + HOLY_CITY_PRESSURE_MULT * base);
    expect(other.followedReligion).toBe(0);
    expect(holy.religionPressure[0]).toBe(1000 + base);
  });
});
