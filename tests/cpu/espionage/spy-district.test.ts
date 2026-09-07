/**
 * THE SPY STANDS ON A DISTRICT — the TS half (the GPU twin is
 * tests/gpu/spy_district_test.py).
 *
 * CIV6 (UnitOperations): every spy operation names a `TargetDistrict` — Steal
 * Tech Boost the Campus, Sabotage Production the Industrial Zone — or none,
 * the City Center. A spy occupies the district it works out of. No gate lane
 * runs a spy mission end to end, so these scenes are the evidence.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { emptySeat, seatOf, setTileOwner } from '../../../cpu/core/seats';
import {
  spyDestinations, beginTravel, beginMission, missionOffered, tickSpies, spyCity, cityCounterLevels,
} from '../../../cpu/core/espionage';
import { spyHeldWith } from '../../../cpu/core/deals';
import { promoRows } from '../../../cpu/data/promotions';
import {
  SPY_UNIT, SPY_MISSIONS, SPY_M_SABOTAGE_PRODUCTION, SPY_M_STEAL_TECH_BOOST, SPY_M_FOMENT_UNREST,
  SPY_M_COUNTERSPY, SPY_M_GAIN_SOURCES, SPY_M_SIPHON_FUNDS, SPY_ESCAPE_ROUTES, SPY_SURVEILLANCE_REACH,
} from '../../../cpu/data/espionage';
import { buildingPillaged, cityBuildingYields, darkBuildings } from '../../../cpu/core/yields';
import { availableBuildings, goldPurchasableBuildings, buildingCostIn } from '../../../cpu/core/rules';
import { completeQueueItem } from '../../../cpu/core/production';
import { makeYieldCtx } from '../../../cpu/core/effects';
import { BUILDINGS } from '../../../cpu/data/buildings';
import { PILLAGE_BUILDING_REPAIR_PERCENT } from '../../../cpu/data/constants';
import { hexDistance } from '../../../world/hex';
import type { City, GameState, QueueItem } from '../../../cpu/core/types';

const WINS = 7;
const turnsOf = (m: number): number => SPY_MISSIONS[m]!.turns;
function spyBit(id: string): number {
  const k = promoRows('ESPIONAGE').findIndex((p) => p.id === id);
  expect(k).toBeGreaterThanOrEqual(0);
  return 1 << k;
}

/** Two majors, a city each, both spy-capable. */
function spyState() {
  const state = makeState(makeMap(24, 24));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  const mine = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
  const theirs = settleAt(state, tileAtCoords(state.map, 16, 16).index, 1);
  for (const s of state.seats) {
    s.treasury = 10_000;
    if (!s.research.civics.includes('DIPLOMATIC_SERVICE')) s.research.civics.push('DIPLOMATIC_SERVICE');
  }
  return { state, mine, theirs, me: seatOf(state, 0)!, them: seatOf(state, 1)! };
}

/** a COMPLETE district of `type` exactly `dist` tiles from the centre */
function districtAt(state: GameState, city: City, type: string, dist: number): number {
  const ctr = state.map.tiles[city.centerIndex];
  const t = state.map.tiles.find(
    (x) => !x.district && x.terrain !== 'OCEAN' && hexDistance(x.col, x.row, ctr.col, ctr.row) === dist,
  )!;
  setTileOwner(t, city.seat, city.id);
  t.district = type as never;
  t.districtComplete = true;
  city.districts.push({ type: type as never, tileIndex: t.index });
  return t.index;
}

function spyAt(state: GameState, seat: number, tile: number) {
  const u = spawnUnit(state, SPY_UNIT, tile, seat)!;
  u.tileIndex = tile;
  return u;
}

describe('the jump names a district tile', () => {
  it('offers every district of a revealed city, nearest first, and lands the spy on it', () => {
    const { state, mine, theirs, them } = spyState();
    const iz = districtAt(state, theirs, 'INDUSTRIAL_ZONE', 1);
    const campus = districtAt(state, theirs, 'CAMPUS', 2);
    const spy = spyAt(state, 0, mine.centerIndex);
    const dests = spyDestinations(state, spy);
    expect(dests).toContain(theirs.centerIndex);
    expect(dests).toContain(iz);
    expect(dests).toContain(campus);
    expect(dests).not.toContain(mine.centerIndex);
    const here = state.map.tiles[mine.centerIndex];
    const d = dests.map((t) => hexDistance(here.col, here.row, state.map.tiles[t].col, state.map.tiles[t].row));
    expect(d).toEqual([...d].sort((a, b) => a - b));

    expect(beginTravel(state, spy, campus)).toBe(true);
    expect(spy.spyTarget).toBe(campus);
    const turns = spy.spyTurns ?? 0;
    expect(turns).toBeGreaterThan(0);
    for (let i = 0; i < turns; i++) tickSpies(state, 0);
    expect(spy.tileIndex).toBe(campus);
    expect(spyCity(state, spy)?.city).toBe(theirs);
    // ...and the Campus offers the Campus' mission, not the centre's
    them.research.techs.push('MINING');
    expect(missionOffered(state, spy, SPY_M_STEAL_TECH_BOOST)).toBe(true);
    expect(missionOffered(state, spy, SPY_M_FOMENT_UNREST)).toBe(false);
    expect(missionOffered(state, spy, SPY_M_GAIN_SOURCES)).toBe(false);
    expect(missionOffered(state, spy, SPY_M_SABOTAGE_PRODUCTION)).toBe(false);
  });

  it('the counterspy post is offered on any district of an own city, and nowhere abroad', () => {
    const { state, mine, theirs } = spyState();
    const home = districtAt(state, mine, 'CAMPUS', 1);
    const away = districtAt(state, theirs, 'CAMPUS', 1);
    const spy = spyAt(state, 0, home);
    expect(missionOffered(state, spy, SPY_M_COUNTERSPY)).toBe(true);
    spy.tileIndex = mine.centerIndex;
    expect(missionOffered(state, spy, SPY_M_COUNTERSPY)).toBe(true);
    spy.tileIndex = away;
    expect(missionOffered(state, spy, SPY_M_COUNTERSPY)).toBe(false);
  });
});

describe('the counterspy defends the district it stands on', () => {
  it("SURVEILLANCE guards every district and works a level higher within one hex; POLYGRAPH reads the whole city", () => {
    const { state, theirs } = spyState();
    const near = districtAt(state, theirs, 'INDUSTRIAL_ZONE', 1);
    const far = districtAt(state, theirs, 'CAMPUS', 2);
    const guard = spyAt(state, 1, theirs.centerIndex);
    expect(beginMission(state, guard, SPY_M_COUNTERSPY)).toBe(true);
    expect(cityCounterLevels(state, theirs, near)).toBe(0);
    guard.promos = spyBit('SURVEILLANCE');
    expect(SPY_SURVEILLANCE_REACH).toBe(1);
    expect(cityCounterLevels(state, theirs, near)).toBe(1);
    expect(cityCounterLevels(state, theirs, theirs.centerIndex)).toBe(1);
    expect(cityCounterLevels(state, theirs, far)).toBe(0);
    // Polygraph counts from any district of the city
    guard.promos = spyBit('POLYGRAPH');
    guard.tileIndex = far;
    expect(cityCounterLevels(state, theirs, near)).toBe(1);
  });

  it('a post on the centre catches nobody on the Hub — until Surveillance extends it', () => {
    // the catch is pinned certain and every escape shut, so whether the post
    // GUARDS the Hub decides the whole outcome
    const row = SPY_MISSIONS[SPY_M_SIPHON_FUNDS] as { successPct?: number };
    const saved = row.successPct;
    const rates = SPY_ESCAPE_ROUTES.map((r) => r.basePct);
    row.successPct = -1000;
    for (const r of SPY_ESCAPE_ROUTES) (r as { basePct: number }).basePct = -1000;
    try {
      const run = (surveil: boolean): boolean => {
        for (let seed = 1; seed < 200; seed++) {
          const { state, theirs } = spyState();
          const hub = districtAt(state, theirs, 'COMMERCIAL_HUB', 1);
          const guard = spyAt(state, 1, theirs.centerIndex);
          if (surveil) guard.promos = spyBit('SURVEILLANCE');
          expect(beginMission(state, guard, SPY_M_COUNTERSPY)).toBe(true);
          const spy = spyAt(state, 0, hub);
          state.rngState = seed;
          expect(beginMission(state, spy, SPY_M_SIPHON_FUNDS)).toBe(true);
          for (let i = 0; i < turnsOf(SPY_M_SIPHON_FUNDS); i++) tickSpies(state, 0);
          if (spyHeldWith(state, 0, 1) === 1 && guard.spyLevel === 1) return true;
        }
        return false;
      };
      expect(run(false)).toBe(false);
      expect(run(true)).toBe(true);
    } finally {
      row.successPct = saved;
      SPY_ESCAPE_ROUTES.forEach((r, i) => { (r as { basePct: number }).basePct = rates[i]; });
    }
  });
});

describe('Sabotage Production pillages the buildings', () => {
  it('marks the Zone\'s buildings, the yield walk skips them, and the queue repairs them at a quarter', () => {
    const { state, theirs, them } = spyState();
    const iz = districtAt(state, theirs, 'INDUSTRIAL_ZONE', 1);
    theirs.buildings.push('WORKSHOP');
    them.research.techs.push('APPRENTICESHIP');
    const ctx = makeYieldCtx(state, theirs.seat);
    const lit = cityBuildingYields(ctx, theirs).production;
    const spy = spyAt(state, 0, iz);
    state.rngState = WINS;
    expect(beginMission(state, spy, SPY_M_SABOTAGE_PRODUCTION)).toBe(true);
    for (let i = 0; i < turnsOf(SPY_M_SABOTAGE_PRODUCTION); i++) tickSpies(state, 0);
    expect(buildingPillaged(theirs, 'WORKSHOP')).toBe(true);
    expect(state.map.tiles[iz].districtPillaged).toBe(false);
    expect(darkBuildings(state.map, theirs).has('WORKSHOP')).toBe(true);
    expect(cityBuildingYields(ctx, theirs).production).toBe(lit - (BUILDINGS.WORKSHOP.yields?.production ?? 0));

    // THE REPAIR: the building's own column, at PILLAGE_BUILDING_REPAIR_PERCENT
    // of its price, from the queue alone
    expect(availableBuildings(state, theirs).some((b) => b.id === 'WORKSHOP')).toBe(true);
    expect(goldPurchasableBuildings(state, theirs).some((b) => b.id === 'WORKSHOP')).toBe(false);
    const price = buildingCostIn(state, theirs, 'WORKSHOP');
    expect(price).toBe(Math.round((BUILDINGS.WORKSHOP.cost * PILLAGE_BUILDING_REPAIR_PERCENT) / 100));
    const item: QueueItem = { kind: 'building', building: 'WORKSHOP', progress: price };
    completeQueueItem(state, theirs, item, price);
    expect(buildingPillaged(theirs, 'WORKSHOP')).toBe(false);
    expect(theirs.buildings.filter((b) => b === 'WORKSHOP')).toHaveLength(1);
    expect(availableBuildings(state, theirs).some((b) => b.id === 'WORKSHOP')).toBe(false);
    expect(buildingCostIn(state, theirs, 'WORKSHOP')).toBe(BUILDINGS.WORKSHOP.cost);
    expect(cityBuildingYields(ctx, theirs).production).toBe(lit);
  });
});
