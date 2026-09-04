import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOf, setAllyTurnsWith } from '../../../cpu/core/seats';
import { revealAround, initFog } from '../../../cpu/core/fog';
import { getModifiers } from '../../../cpu/core/effects';
import { ALLIANCE_SHARED_VIS_ROWS } from '../../../cpu/data/civilizations';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import type { GameState } from '../../../cpu/core/types';

/**
 * CIV6 (Poundmaker, TRAIT_ALLIANCE_SHARED_VIS): the install writes
 * EFFECT_ADJUST_PLAYER_ALL_ALLIANCES_PROVIDE_SHARED_VIS with `ShareVis: true`
 * — a boolean, no direction and no level. Read as MUTUAL, which is what
 * "shared" means in the alliance system it names (C-70).
 *
 * The GPU twin is tests/gpu/shared_vision_test.py.
 */
const leaderRow = (leader: string) => CIV_LEADERS.findIndex((l) => l.leader === leader);

function scene(row0: number, ally: boolean): GameState {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.unitsMode = true;
  state.fogOfWar = true;
  state.seats.push(emptySeat(1));
  state.seats.push(emptySeat(2));
  state.seats[0].civ = row0;
  initFog(state);
  if (ally) setAllyTurnsWith(state, 0, 1, 10);
  return state;
}

const seen = (state: GameState, seat: number, t: number) =>
  seatOf(state, seat)!.explored[t] === 1;

describe('an alliance that shares what it sees', () => {
  it('reads the install: one row, and it is Poundmaker', () => {
    expect(ALLIANCE_SHARED_VIS_ROWS.length).toBe(1);
    expect(ALLIANCE_SHARED_VIS_ROWS[0].leader).toBe('POUNDMAKER');
  });

  it('opens the ally`s fog where the carrier looks, and the carrier`s where the ally looks', () => {
    const state = scene(leaderRow('POUNDMAKER'), true);
    expect(getModifiers(state, 0).allianceSharedVis).toBe(true);
    const far = tileAtCoords(state.map, 12, 12).index;
    expect(seen(state, 1, far)).toBe(false);
    revealAround(state, 0, far, 1);
    expect(seen(state, 0, far)).toBe(true);
    expect(seen(state, 1, far)).toBe(true);      // the ally was shown it

    // ...and MUTUAL: the ally carries no row of its own, yet its look opens
    // the carrier's fog too
    const other = tileAtCoords(state.map, 3, 12).index;
    expect(getModifiers(state, 1).allianceSharedVis).toBe(false);
    revealAround(state, 1, other, 1);
    expect(seen(state, 0, other)).toBe(true);
  });

  it('shows a seat that is NOT an ally nothing', () => {
    const state = scene(leaderRow('POUNDMAKER'), true);
    const far = tileAtCoords(state.map, 12, 12).index;
    revealAround(state, 0, far, 1);
    expect(seen(state, 2, far)).toBe(false);     // seat 2 is allied with nobody
  });

  it('shares nothing when no seat in the alliance carries the row', () => {
    const state = scene(leaderRow('VICTORIA'), true);
    expect(getModifiers(state, 0).allianceSharedVis).toBe(false);
    const far = tileAtCoords(state.map, 12, 12).index;
    revealAround(state, 0, far, 1);
    expect(seen(state, 0, far)).toBe(true);
    expect(seen(state, 1, far)).toBe(false);
  });

  it('shares nothing without an alliance, row or no row', () => {
    const state = scene(leaderRow('POUNDMAKER'), false);
    const far = tileAtCoords(state.map, 12, 12).index;
    revealAround(state, 0, far, 1);
    expect(seen(state, 1, far)).toBe(false);
  });

  it('gives the DISCOVERY to the discoverer alone', () => {
    // an ally SHOWN a natural wonder earns no era score for it — the fog
    // write travels and the event does not
    const state = scene(leaderRow('POUNDMAKER'), true);
    const far = tileAtCoords(state.map, 12, 12).index;
    state.map.tiles[far].feature = 'ULURU';
    const before0 = seatOf(state, 0)!.eraScore ?? 0;
    const before1 = seatOf(state, 1)!.eraScore ?? 0;
    revealAround(state, 0, far, 1);
    expect(seen(state, 1, far)).toBe(true);            // the ally sees it
    expect(seatOf(state, 1)!.eraScore ?? 0).toBe(before1);  // ...and scores nothing
    expect(seatOf(state, 0)!.eraScore ?? 0).toBeGreaterThanOrEqual(before0);
  });
});
