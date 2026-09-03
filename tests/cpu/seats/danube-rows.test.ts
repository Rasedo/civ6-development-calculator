import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, warBanned, diploVisibility, visibilityCS } from '../../../cpu/core/seats';
import { getModifiers, progressAhead } from '../../../cpu/core/effects';
import { tourismFavorOf } from '../../../cpu/core/effects';
import { tradeCapacity, intlRouteTerrainYields, stampTradingPost } from '../../../cpu/core/trade';
import { declareWarOnCityState, setMet, placeCityStateAt } from '../../../cpu/core/cityStates';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import {
  WONDER_ERA_PROD_ROWS, WONDER_TOURISM_ROWS, RIVER_CROSS_PROD_ROWS, IMMEDIATE_POST_ROWS,
  DIPLO_VIS_ROWS, WAR_BAN_ROWS, WAR_BANS, TOURISM_FAVOR_ROWS, EMERGENCY_FAVOR_ROWS,
  GOLDEN_DEDICATION_ROWS, INTL_ROUTE_TERRAIN_ROWS, GOLDEN_ROUTE_CAPACITY_ROWS, PROGRESS_TRADE_ROWS,
} from '../../../cpu/data/civilizations';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE WONDER, THE RIVER AND THE POST (CIV6, the install's TraitModifiers):
 * France's wonder band and tourism, Pearl of the Danube, Ortoo, Faces of
 * Peace, Strength in Unity, Sahel Merchants and the Grand Embassy.
 *
 * The GPU twin is tests/gpu/danube_rows_test.py.
 */
const PLAIN = -1;
const seatRow = (civ: string) => CIV_LEADERS.findIndex((l) => l.civ === civ);
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function sceneAs(row: number): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  state.seats[0].civ = row;
  state.seats[1].civ = seatRow('AMERICA');
  return state;
}

describe('the wire', () => {
  it('carries every batch-twelve family, with the install\'s own magnitudes', () => {
    expect(WONDER_ERA_PROD_ROWS.length).toBe(1);
    expect(WONDER_TOURISM_ROWS.length).toBe(1);
    expect(RIVER_CROSS_PROD_ROWS.length).toBe(2);
    expect(IMMEDIATE_POST_ROWS.length).toBe(1);
    // the family grew with Catherine's flat level; a census pin is a count
    expect(DIPLO_VIS_ROWS.length).toBe(2);
    expect(WAR_BAN_ROWS.length).toBe(3);
    expect(TOURISM_FAVOR_ROWS.length).toBe(1);
    expect(EMERGENCY_FAVOR_ROWS.length).toBe(1);
    expect(GOLDEN_DEDICATION_ROWS.length).toBe(1);
    expect(INTL_ROUTE_TERRAIN_ROWS.length).toBe(1);
    expect(GOLDEN_ROUTE_CAPACITY_ROWS.length).toBe(1);
    expect(PROGRESS_TRADE_ROWS.length).toBe(1);
    // the band is INCLUSIVE at both ends, and the install's own era names
    expect(WONDER_ERA_PROD_ROWS[0].startEra).toBe('Medieval');
    expect(WONDER_ERA_PROD_ROWS[0].endEra).toBe('Industrial');
    // the visibility row ADDS a second step rather than replacing the first
    expect(DIPLO_VIS_ROWS.find((r) => r.civ === 'MONGOLIA')!.csPerLevel).toBe(3);
    for (const r of WAR_BAN_ROWS) expect(WAR_BANS.indexOf(r.ban)).toBeGreaterThanOrEqual(0);
  });
});

describe('Faces of Peace', () => {
  it('refuses Canada a surprise war, and refuses one declared ON Canada', () => {
    const canada = sceneAs(seatRow('CANADA'));
    const plain = sceneAs(PLAIN);
    // a SURPRISE war is the informal one
    expect(warBanned(canada, 0, 1, false)).toBe(true);
    expect(warBanned(canada, 0, 1, true)).toBe(false); // a formal war is fine
    expect(warBanned(plain, 0, 1, false)).toBe(false);
    // ...and nobody may surprise Canada either
    const other = sceneAs(PLAIN);
    other.seats[1].civ = seatRow('CANADA');
    expect(warBanned(other, 0, 1, false)).toBe(true);
    expect(warBanned(other, 0, 1, true)).toBe(false);
  });

  it('refuses Canada a war on a city-state, and refuses nobody else', () => {
    const attempt = (row: number) => {
      const state = sceneAs(row);
      settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
      // the bare scene seats no minor, so the ban would never be reached
      const cs = placeCityStateAt(state, 0, 'Testopolis', 'militaristic',
                                  tileAtCoords(state.map, 12, 12).index);
      setMet(cs, 0);
      return declareWarOnCityState(state, cs.id, 0);
    };
    const canada = attempt(seatRow('CANADA'));
    expect(canada.ok).toBe(false);
    expect(canada.reason).toContain('may not declare war on a city-state');
    expect(attempt(PLAIN).ok).toBe(true);
  });

  it('turns every hundred Tourism per turn into a Favor', () => {
    const canada = sceneAs(seatRow('CANADA'));
    const plain = sceneAs(PLAIN);
    expect(tourismFavorOf(canada, 0, 250)).toBe(2);
    expect(tourismFavorOf(canada, 0, 99)).toBe(0);
    expect(tourismFavorOf(plain, 0, 250)).toBe(0);
  });

  it('doubles the favor an emergency pays it', () => {
    expect(getModifiers(sceneAs(seatRow('CANADA')), 0).emergencyFavorPct).toBe(100);
    expect(getModifiers(sceneAs(PLAIN), 0).emergencyFavorPct).toBe(0);
  });
});

describe('Ortoo', () => {
  it('reads a trading post as an extra level of visibility', () => {
    const level = (row: number, post: boolean): number => {
      const state = sceneAs(row);
      settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
      const theirs = settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
      if (post) stampTradingPost(state.seats[0], theirs.centerIndex);
      return diploVisibility(state, 0, 1);
    };
    expect(level(seatRow('MONGOLIA'), false)).toBe(level(PLAIN, false));
    expect(level(seatRow('MONGOLIA'), true)).toBe(level(PLAIN, true) + 1);
  });

  it('doubles the strength a visibility advantage pays', () => {
    const cs = (row: number): number => {
      const state = sceneAs(row);
      settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
      settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
      // one level of advantage: the viewer holds the tech, the target does not
      state.seats[0].research.techs = ['PRINTING'];
      return visibilityCS(state, 0, 1);
    };
    const plain = cs(PLAIN);
    expect(plain).toBeGreaterThan(0);
    expect(cs(seatRow('MONGOLIA'))).toBe(plain * 2);
  });
});

describe('Sahel Merchants', () => {
  it('pays a Gold per flat Desert tile of the origin city, and none on hills', () => {
    const gold = (row: number, hills: boolean): number => {
      const state = sceneAs(row);
      const city = settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      let n = 0;
      for (const t of state.map.tiles) {
        if (t.ownerSeat !== 0 || t.ownerCity !== city.id) continue;
        t.terrain = 'DESERT';
        t.elevation = hills ? 'HILLS' : 'FLAT';
        n += 1;
      }
      expect(n).toBeGreaterThan(0);
      return intlRouteTerrainYields(state, city, 0).gold;
    };
    expect(gold(leaderRow('MANSA_MUSA'), false)).toBeGreaterThan(0);
    expect(gold(leaderRow('MANSA_MUSA'), true)).toBe(0); // the install names FLAT desert
    expect(gold(PLAIN, false)).toBe(0);
  });

  it('adds a Trade Capacity per golden age entered', () => {
    const cap = (row: number, ages: number): number => {
      const state = sceneAs(row);
      settleAt(state, tileAtCoords(state.map, 8, 8).index, 0);
      state.seats[0].goldenAges = ages;
      return tradeCapacity(state, 0);
    };
    expect(cap(leaderRow('MANSA_MUSA'), 0)).toBe(cap(PLAIN, 0));
    expect(cap(leaderRow('MANSA_MUSA'), 2)).toBe(cap(PLAIN, 2) + 2);
  });
});

describe('the Grand Embassy', () => {
  it('counts only how far AHEAD the other seat is', () => {
    const state = sceneAs(leaderRow('PETER_GREAT'));
    state.seats[0].research.techs = ['MINING'];
    state.seats[1].research.techs = ['MINING', 'POTTERY', 'SAILING', 'WRITING'];
    expect(progressAhead(state, 0, 1, false)).toBe(3);
    expect(progressAhead(state, 1, 0, false)).toBe(0); // never negative
    expect(getModifiers(state, 0).progressTradePer).toBe(3);
    expect(getModifiers(sceneAs(PLAIN), 0).progressTradePer).toBe(0);
  });
});
