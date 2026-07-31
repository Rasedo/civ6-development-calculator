import { describe, it, expect } from 'vitest';
import { PLAYER_CIV, BARB_SEAT, civOfRival, seatOfCityState, seatClass, capsOf } from '../src/core/seats';
import { SEAT_CAPS } from '../src/data/seats';
import { createGame, foundCity } from '../src/core/game';
import { scoreSettleSites } from '../src/core/advisor';
import { spawnUnit, unitsHostile } from '../src/core/units';
import { setRivalWar } from '../src/core/seats';
import type { GameState } from '../src/core/types';

// #51/S6.11 — the capability table.
//
// "What may this actor do?" used to be four different spellings of "is this a
// barbarian?" scattered across combat.ts, units.ts and eras.ts. One table
// answers it now (src/data/seats.ts), and the ADMISSIBILITY RULE keeps the
// table from growing into config: a bit exists only where the empty/zero data
// value would be WRONG. Two bits survive that rule out of the twelve the plan
// proposed.
//
// Every case has its negative twin, so the suite cannot pass by giving every
// seat the same answer — which is the failure mode a capability table invites.

function newGame(): GameState {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: true,
    withVillages: false, cityStates: 2, rivals: 2,
  });
  const site = scoreSettleSites(state, 1)[0];
  foundCity(state, site.tileIndex);
  return state;
}

describe('#51/S6.11 seat classes', () => {
  it('the absolute seat space IS the class — nothing stores a duplicate', () => {
    expect(seatClass(PLAYER_CIV)).toBe('major');
    expect(seatClass(civOfRival(0))).toBe('major');
    expect(seatClass(civOfRival(7))).toBe('major');
    expect(seatClass(seatOfCityState(0))).toBe('minor');
    expect(seatClass(seatOfCityState(5))).toBe('minor');
    expect(seatClass(BARB_SEAT)).toBe('hostile');
  });

  it('the three classes are DISTINCT — the table is not one row wearing three hats', () => {
    const major = capsOf(PLAYER_CIV);
    const minor = capsOf(seatOfCityState(0));
    const hostile = capsOf(BARB_SEAT);
    expect(major).toEqual(SEAT_CAPS.major);
    expect(minor).toEqual(SEAT_CAPS.minor);
    expect(hostile).toEqual(SEAT_CAPS.hostile);
    expect(hostile).not.toEqual(major); // the whole point of the table
  });
});

describe('#51/S6.11 caps.xp', () => {
  it('a barbarian gets NO xp field; the player and a rival each get one', () => {
    const state = newGame();
    const land = state.map.tiles.findIndex((t) => t.terrain !== 'OCEAN' && t.terrain !== 'COAST');
    const barb = spawnUnit(state, 'WARRIOR', land, BARB_SEAT)!;
    const mine = spawnUnit(state, 'WARRIOR', land, PLAYER_CIV)!;
    const theirs = spawnUnit(state, 'WARRIOR', land, civOfRival(0))!;
    expect(capsOf(BARB_SEAT).xp).toBe(false);
    expect(barb.xp).toBeUndefined();
    // the negative twin: an absent field must mean "cannot earn", not "new"
    expect(capsOf(PLAYER_CIV).xp).toBe(true);
    expect(mine.xp).toBe(0);
    expect(theirs.xp).toBe(0);
  });
});

describe('#51/S6.11 caps.alwaysHostile', () => {
  it('a barbarian is hostile to everyone with NO war state stored', () => {
    const state = newGame();
    const barb = { seat: BARB_SEAT };
    expect(capsOf(BARB_SEAT).alwaysHostile).toBe(true);
    expect(unitsHostile(state, barb, { seat: PLAYER_CIV })).toBe(true);
    expect(unitsHostile(state, barb, { seat: civOfRival(0) })).toBe(true);
    expect(unitsHostile(state, { seat: civOfRival(1) }, barb)).toBe(true);
    // and to a MINOR, which has no war row with the barbarians at all
    expect(unitsHostile(state, barb, { seat: seatOfCityState(0) })).toBe(true);
  });

  it('two barbarians are not hostile to EACH OTHER — the cap is not a blanket', () => {
    const state = newGame();
    expect(unitsHostile(state, { seat: BARB_SEAT }, { seat: BARB_SEAT })).toBe(false);
  });

  it('a major seat is hostile only where WAR says so — the negative twin', () => {
    const state = newGame();
    const a = { seat: civOfRival(0) };
    const b = { seat: civOfRival(1) };
    expect(capsOf(civOfRival(0)).alwaysHostile).toBe(false);
    expect(unitsHostile(state, a, b)).toBe(false); // at peace
    setRivalWar(state, civOfRival(0), civOfRival(1), true);
    expect(unitsHostile(state, a, b)).toBe(true); // and now at war
    setRivalWar(state, civOfRival(0), civOfRival(1), false);
    expect(unitsHostile(state, a, b)).toBe(false); // peace again — not sticky
  });
});
