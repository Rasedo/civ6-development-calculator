import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { spawnUnit, tradeWalkable, tradeWalkReachable, tradeWalkStep, TRADE_WATER_NONE } from '../../../cpu/core/units';
import { plunderedByHull, routePlunderGold, PLUNDER_ROUTE_GOLD } from '../../../cpu/core/trade';
import { portalExit } from '../../../cpu/core/rules';
import { GP_ABILITY, GP_PERM } from '../../../cpu/data/greatPeople';
import { deriveMountainRanges } from '../../../world/query';
import type { GameState } from '../../../cpu/core/types';

/**
 * THE TRADE ROUTE'S TAILS.
 *
 * CIV6 (Francis Drake, Ching Shih): "Military units get +50% (+60%) rewards
 * for plundering sea Trade Routes" — ABILITY_*_PLUNDER_BONUS, tagged
 * CLASS_NAVAL_MELEE / _RANGED / _RAIDER / _CARRIER, so it is the plundering
 * unit's class that decides and a land raider or an embarked passenger is paid
 * the plain amount.
 *
 * CIV6 (Mountain Tunnel, Qhapaq Ñan): "Trade Routes traveling through it" — a
 * Trader walks onto a portal's mountain and takes the portal as a unit does.
 *
 * The GPU twin is tests/gpu/trade_tails_test.py.
 */
const PCT = GP_PERM.indexOf('routePlunderPct');

function raiderScene(pct: number): GameState {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  for (const c of [6, 7, 8]) tileAtCoords(state.map, c, 6).terrain = 'COAST';
  const perm = GP_PERM.map(() => 0);
  perm[PCT] = pct;
  seatOf(state, 1)!.gpPerm = perm;
  return state;
}

describe("the admirals' plunder reward", () => {
  it('reads the install: Drake 50, Ching Shih 60', () => {
    expect(GP_ABILITY.GP_FRANCIS_DRAKE.perm?.routePlunderPct).toBe(50);
    expect(GP_ABILITY.GP_CHING_SHIH.perm?.routePlunderPct).toBe(60);
  });

  it('pays a HULL the percentage, and a land raider the plain amount', () => {
    const state = raiderScene(50);
    const wet = tileAtCoords(state.map, 6, 6).index;
    const dry = tileAtCoords(state.map, 12, 12).index;
    spawnUnit(state, 'GALLEY', wet, 1);
    spawnUnit(state, 'WARRIOR', dry, 1);
    expect(plunderedByHull(state, wet, 1)).toBe(true);
    expect(plunderedByHull(state, dry, 1)).toBe(false);
    expect(routePlunderGold(state, 1, wet)).toBe(PLUNDER_ROUTE_GOLD * 1.5);
    expect(routePlunderGold(state, 1, dry)).toBe(PLUNDER_ROUTE_GOLD);
  });

  it('pays an EMBARKED passenger the plain amount — it is a land unit', () => {
    const state = raiderScene(60);
    const wet = tileAtCoords(state.map, 7, 6).index;
    const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 7, 7).index, 1)!;
    u.tileIndex = wet;
    u.embarked = true;
    expect(plunderedByHull(state, wet, 1)).toBe(false);
    expect(routePlunderGold(state, 1, wet)).toBe(PLUNDER_ROUTE_GOLD);
  });

  it('pays a hull nothing extra without the admiral', () => {
    const state = raiderScene(0);
    const wet = tileAtCoords(state.map, 8, 6).index;
    spawnUnit(state, 'GALLEY', wet, 1);
    expect(routePlunderGold(state, 1, wet)).toBe(PLUNDER_ROUTE_GOLD);
  });
});

/** A three-thick ridge down the whole map (cols 7-9), portals on its two
 *  faces in row 5 — the middle column stays bare mountain. */
function ridgeScene(portal: 'MOUNTAIN_TUNNEL' | 'MOUNTAIN_ROAD'): GameState {
  const state = makeState(makeMap(16, 16));
  for (let r = 0; r < 16; r++) for (const c of [7, 8, 9]) tileAtCoords(state.map, c, r).elevation = 'MOUNTAIN';
  deriveMountainRanges(state.map);
  tileAtCoords(state.map, 7, 5).improvement = portal;
  tileAtCoords(state.map, 9, 5).improvement = 'MOUNTAIN_TUNNEL';
  return state;
}

describe('a Trader through a mountain portal', () => {
  it('walks onto a portal and nowhere else on the ridge', () => {
    const state = ridgeScene('MOUNTAIN_TUNNEL');
    expect(tradeWalkable(tileAtCoords(state.map, 7, 5), TRADE_WATER_NONE)).toBe(true);
    expect(tradeWalkable(tileAtCoords(state.map, 8, 5), TRADE_WATER_NONE)).toBe(false);
  });

  it('takes the portal when its exit is closer, and crosses a wall it could not', () => {
    const state = ridgeScene('MOUNTAIN_TUNNEL');
    const from = tileAtCoords(state.map, 6, 5).index;
    const to = tileAtCoords(state.map, 10, 5).index;
    const west = tileAtCoords(state.map, 7, 5).index;
    const east = tileAtCoords(state.map, 9, 5).index;
    expect(portalExit(state.map, state.map.tiles[west])).toBe(east);
    // the step ONTO the west face, then the jump to the east face
    expect(tradeWalkStep(state, from, to, TRADE_WATER_NONE)).toBe(west);
    expect(tradeWalkStep(state, west, to, TRADE_WATER_NONE)).toBe(east);
    expect(tradeWalkReachable(state, from, to, TRADE_WATER_NONE)).toBe(true);
    // without the portals the wall stands
    tileAtCoords(state.map, 7, 5).improvement = null;
    tileAtCoords(state.map, 9, 5).improvement = null;
    expect(tradeWalkReachable(state, from, to, TRADE_WATER_NONE)).toBe(false);
  });

  it('never takes a portal back AWAY from its target', () => {
    const state = ridgeScene('MOUNTAIN_TUNNEL');
    const west = tileAtCoords(state.map, 7, 5).index;
    const home = tileAtCoords(state.map, 4, 5).index;
    // heading west from the west face, the east exit is farther: walk on
    expect(tradeWalkStep(state, west, home, TRADE_WATER_NONE)).not.toBe(tileAtCoords(state.map, 9, 5).index);
  });

  it("treats Qhapaq Ñan as the same network as the Tunnel", () => {
    const state = ridgeScene('MOUNTAIN_ROAD');
    const from = tileAtCoords(state.map, 6, 5).index;
    const to = tileAtCoords(state.map, 10, 5).index;
    expect(tradeWalkReachable(state, from, to, TRADE_WATER_NONE)).toBe(true);
  });
});
