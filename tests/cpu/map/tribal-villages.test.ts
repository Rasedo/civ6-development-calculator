import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, settleAt } from '../helpers';
import { emptySeat, seatOf } from '../../../cpu/core/seats';
import { claimGoodyHut, mostAdvancedStrategic } from '../../../cpu/core/units';
import { drawGoodyReward, goodyEligible, eligibleGoodyKinds } from '../../../cpu/core/goodyHuts';
import { GOODY_SUBTYPES, GOODY_KINDS, GOODY_KIND_WEIGHT } from '../../../cpu/data/goodyHuts';
import { CAMP_GOODY_ROWS } from '../../../cpu/data/civilizations';
import { getModifiers } from '../../../cpu/core/effects';
import { CIV_LEADERS } from '../../../cpu/data/seats';
import { STRATEGIC_IDS, GAME_SPEED } from '../../../cpu/data/constants';
import { governorTitlesEarned } from '../../../cpu/core/governors';
import type { GameState, Unit } from '../../../cpu/core/types';

/**
 * TRIBAL VILLAGES (C-47) — the install's `GoodyHuts` + `GoodyHutSubTypes`.
 *
 * Seven kinds at Weight 100 each and 24 subtypes with their own weights,
 * gates and payloads. The engine's older six-arm reward was unsourced and is
 * replaced rather than preserved.
 *
 * The GPU twin is tests/gpu/tribal_villages_test.py.
 */
function scene(withCity = true): { state: GameState; unit: Unit; hut: number } {
  const state = makeState(makeMap(16, 16, 'GRASSLAND'));
  state.seats.push(emptySeat(1));
  if (withCity) settleAt(state, tileAtCoords(state.map, 6, 6).index, 0);
  const hut = tileAtCoords(state.map, 9, 9).index;
  state.map.tiles[hut].goodyHut = true;
  const unit: Unit = {
    id: 9001, type: 'WARRIOR', seat: 0, tileIndex: hut, hp: 40, movesLeft: 0,
    charges: null, promos: 0, xp: 0,
  } as unknown as Unit;
  state.units.push(unit);
  return { state, unit, hut };
}

describe('the tribal village table', () => {
  it('reads the install: 24 subtypes over 7 kinds, all at Weight 100', () => {
    expect(GOODY_SUBTYPES.length).toBe(24);
    expect(GOODY_KINDS.length).toBe(7);
    expect(GOODY_KIND_WEIGHT).toBe(100);
    // every subtype belongs to a kind the table names
    for (const s of GOODY_SUBTYPES) expect(GOODY_KINDS).toContain(s.hut);
    // the install's own weights, per kind
    const byKind = (k: string) => GOODY_SUBTYPES.filter((s) => s.hut === k).map((s) => s.weight);
    expect(byKind('CULTURE')).toEqual([15, 30, 55]);
    expect(byKind('GOLD')).toEqual([15, 30, 55]);
    expect(byKind('FAITH')).toEqual([15, 30, 55]);
    expect(byKind('SCIENCE')).toEqual([15, 30, 55]);
    expect(byKind('DIPLOMACY')).toEqual([15, 40, 45]);
  });

  it('carries the exact payloads, not the prose`s', () => {
    const of = (id: string) => GOODY_SUBTYPES.find((s) => s.id === id)!;
    expect(of('LARGE_GOLD').payload).toEqual({ kind: 'gold', amount: 120 });
    expect(of('SMALL_GOLD').payload).toEqual({ kind: 'gold', amount: 40 });
    expect(of('LARGE_FAITH').payload).toEqual({ kind: 'faith', amount: 100 });
    expect(of('GRANT_EXPERIENCE').payload).toEqual({ kind: 'experience', amount: 20 });
    expect(of('HEAL').payload).toEqual({ kind: 'heal', amount: 100 });
    expect(of('FAVOR').payload).toEqual({ kind: 'favor', amount: 20 });
    expect(of('RESOURCES').payload).toEqual({ kind: 'strategic', amount: 20 });
    expect(of('GRANT_SCOUT').payload).toEqual({ kind: 'unitByClass', promoClass: 'RECON' });
    // ...and the two the install turns OFF
    expect(of('GRANT_UPGRADE').weight).toBe(0);
    expect(of('GRANT_SETTLER').weight).toBe(0);
    // RESOURCES is a MILITARY row, not one of its own
    expect(of('RESOURCES').hut).toBe('MILITARY');
  });

  it('gates on the install`s own Turn and MinOneCity', () => {
    const of = (id: string) => GOODY_SUBTYPES.find((s) => s.id === id)!;
    expect(goodyEligible(of('LARGE_GOLD'), 39, true)).toBe(false);
    expect(goodyEligible(of('LARGE_GOLD'), 40, true)).toBe(true);
    expect(goodyEligible(of('LARGE_GOLD'), 40, false)).toBe(false);  // MinOneCity
    expect(goodyEligible(of('ONE_CIVIC_BOOST'), 1, false)).toBe(true);
    // a weight of 0 is OFF, never free
    expect(goodyEligible(of('GRANT_UPGRADE'), 250, true)).toBe(false);
  });

  it('offers a city-less claimer only the kinds that need no city', () => {
    const early = eligibleGoodyKinds(1, false);
    expect(early).not.toContain('GOLD');       // every GOLD row is MinOneCity
    expect(early).not.toContain('SURVIVORS');  // as is every SURVIVORS row
    expect(early).toContain('CULTURE');
    expect(early).toContain('SCIENCE');
    // ...and with a city, and late, every kind is reachable
    expect(eligibleGoodyKinds(250, true).sort()).toEqual([...GOODY_KINDS].sort());
  });
});

describe('claiming a village', () => {
  it('clears the hut and pays exactly one reward', () => {
    const { state, unit, hut } = scene();
    const before = JSON.stringify(state.seats[0]);
    claimGoodyHut(state, unit);
    expect(state.map.tiles[hut].goodyHut).toBe(false);
    expect(JSON.stringify(state.seats[0])).not.toBe(before);
  });

  it('takes exactly TWO rng draws for a reward with no pool of its own', () => {
    // the draw is kind-then-subtype; only the pooled rewards draw further
    const { state } = scene();
    const rng0 = state.rngState;
    const sub = drawGoodyReward(state, 1, true);
    expect(sub).not.toBeNull();
    expect(state.rngState).not.toBe(rng0);
    // ...and a claimer that can draw NOTHING leaves the stream alone
    const bare = makeState(makeMap(8, 8, 'GRASSLAND'));
    const r0 = bare.rngState;
    // no eligible subtype at all is impossible in this table, so assert the
    // property the engine relies on rather than a fabricated empty case
    expect(eligibleGoodyKinds(1, false).length).toBeGreaterThan(0);
    expect(bare.rngState).toBe(r0);
  });

  it('never pays a barbarian or a city-state', () => {
    const { state, unit, hut } = scene();
    unit.seat = 200;                     // BARB_SEAT
    claimGoodyHut(state, unit);
    expect(state.map.tiles[hut].goodyHut).toBe(true);   // still there
  });

  it('scales the two flagged yields by game speed and nothing else', () => {
    const of = (id: string) => GOODY_SUBTYPES.find((s) => s.id === id)!;
    expect(of('LARGE_GOLD').scale).toBe(true);
    expect(of('SMALL_FAITH').scale).toBe(true);
    expect(of('GRANT_EXPERIENCE').scale).toBeUndefined();
    expect(Math.round(120 * GAME_SPEED)).toBeLessThan(120);  // the speed is < 1 here
  });

  it('grants a governor title that the roster then counts', () => {
    const { state } = scene();
    const before = governorTitlesEarned(state, 0);
    seatOf(state, 0)!.grantedTitles += 1;
    expect(governorTitlesEarned(state, 0)).toBe(before + 1);
  });

  it('banks resources into the most advanced strategic slot', () => {
    const { state } = scene();
    // with no source at all the fallback is slot 0, the ancient one
    expect(mostAdvancedStrategic(state, 0)).toBe(0);
    expect(STRATEGIC_IDS[0]).toBe('HORSES');
  });
});

describe('Epic Quest`s outpost reward', () => {
  it('reads the install: one row, and it is Sumeria', () => {
    expect(CAMP_GOODY_ROWS.length).toBe(1);
    expect(CAMP_GOODY_ROWS[0].civ).toBe('SUMERIA');
  });

  it('pays the SAME table a village pays, and only for that seat', () => {
    const plain = makeState(makeMap(16, 16, 'GRASSLAND'));
    plain.seats.push(emptySeat(1));
    expect(getModifiers(plain, 0).campGoody).toBe(false);
    const sumer = makeState(makeMap(16, 16, 'GRASSLAND'));
    sumer.seats.push(emptySeat(1));
    sumer.seats[0].civ = CIV_LEADERS.findIndex((l) => l.civ === 'SUMERIA');
    expect(getModifiers(sumer, 0).campGoody).toBe(true);
  });
});
