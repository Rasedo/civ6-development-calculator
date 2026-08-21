/**
 * The Great Person QUEUE. Every class holds its whole sourced roster ordered by
 * era; the game offers the next unclaimed person no earlier than the WORLD era,
 * so anyone the world passes is gone for good and a class whose roster ends
 * before the world era offers nobody at all. The price is the person's era
 * base, scaled for how far the world is BEHIND them — except for the art
 * classes and the Prophet, who stay at the base.
 * The GPU twin is religion_gp_test's cost/era-gate block.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { advanceGreatPeople, gpOffer, gpOfferCost, greatPeopleEarned } from '../../../cpu/core/greatPeople';
import { GP_CLASSES, GP_ERA_GPP, GP_FIRST_OF_ERA, GP_FLAT_COST_CLASSES, GREAT_PEOPLE, gpCost } from '../../../cpu/data/greatPeople';
import { worldEraIndex } from '../../../cpu/core/eras';
import { seatOf } from '../../../cpu/core/seats';
import type { GameState } from '../../../cpu/core/types';

const ERA_TECH = ['POTTERY', 'CELESTIAL_NAVIGATION', 'APPRENTICESHIP', 'BANKING',
  'INDUSTRIALIZATION', 'ELECTRICITY', 'PLASTICS', 'COMPOSITES', 'OFFWORLD_MISSION'];

function scene(): GameState {
  const state = makeState(makeMap(16, 16));
  state.sandbox = true;
  foundCity(state, tileAtCoords(state.map, 8, 8).index, 0);
  return state;
}

function setWorldEra(state: GameState, era: number): void {
  seatOf(state, 0)!.research.techs = ERA_TECH.slice(0, era + 1);
  expect(worldEraIndex(state)).toBe(era);
}

describe('the roster', () => {
  it('is ordered by era, with nobody Ancient', () => {
    for (const cls of GP_CLASSES) {
      const eras = GREAT_PEOPLE[cls].map((p) => p.era);
      expect(eras.length).toBeGreaterThan(0);
      expect(eras).toEqual([...eras].sort((a, b) => a - b));
      expect(Math.min(...eras)).toBeGreaterThanOrEqual(1);
    }
    // the classes that start late
    expect(GREAT_PEOPLE.ARTIST[0].era).toBe(3); // Renaissance
    expect(GREAT_PEOPLE.MUSICIAN[0].era).toBe(4); // Industrial
  });

  it('indexes the first person of each era, and marks the exhausted tail', () => {
    for (const cls of GP_CLASSES) {
      const first = GP_FIRST_OF_ERA[cls];
      expect(first.length).toBe(9);
      expect(first[0]).toBe(0);
      expect([...first]).toEqual([...first].sort((a, b) => a - b));
      for (const [era, at] of first.entries()) {
        if (at < GREAT_PEOPLE[cls].length) expect(GREAT_PEOPLE[cls][at].era).toBeGreaterThanOrEqual(era);
        if (at > 0) expect(GREAT_PEOPLE[cls][at - 1].era).toBeLessThan(era);
      }
    }
    // "Industrial: No more Great Prophets" — the roster is spent from there on
    expect(GP_FIRST_OF_ERA.PROPHET[4]).toBe(GREAT_PEOPLE.PROPHET.length);
  });
});

describe('the price', () => {
  it('scales with the eras the world is behind the person', () => {
    // the page's own worked examples
    expect(gpCost('SCIENTIST', 4, 2)).toBe(1075); // 420 * 1.6^2
    expect(gpCost('SCIENTIST', 1, 0)).toBe(78); // 60 * 1.3
    expect(gpCost('SCIENTIST', 1, 1)).toBe(60); // caught up
    expect(gpCost('SCIENTIST', 1, 5)).toBe(60); // never negative
  });

  it('leaves the art classes and the Prophet at their era base', () => {
    expect([...GP_FLAT_COST_CLASSES].sort()).toEqual(['ARTIST', 'MUSICIAN', 'PROPHET', 'WRITER']);
    for (const cls of GP_FLAT_COST_CLASSES) {
      expect(gpCost(cls, 4, 0)).toBe(GP_ERA_GPP[4]);
      expect(gpCost(cls, 4, 4)).toBe(GP_ERA_GPP[4]);
    }
  });
});

describe('the offer', () => {
  it('never sits behind the world era', () => {
    const state = scene();
    expect(gpOffer(state, 'SCIENTIST')).toBe(0);
    setWorldEra(state, 3);
    expect(gpOffer(state, 'SCIENTIST')).toBe(GP_FIRST_OF_ERA.SCIENTIST[3]);
    expect(GREAT_PEOPLE.SCIENTIST[gpOffer(state, 'SCIENTIST')].era).toBeGreaterThanOrEqual(3);
  });

  it('costs Infinity once the class is spent', () => {
    const state = scene();
    setWorldEra(state, 4); // Industrial
    expect(gpOffer(state, 'PROPHET')).toBe(GREAT_PEOPLE.PROPHET.length);
    expect(gpOfferCost(state, 'PROPHET')).toBe(Infinity);
    // and no bank, however fat, claims one
    seatOf(state, 0)!.gpp.PROPHET = 1_000_000;
    advanceGreatPeople(state, 0);
    expect(greatPeopleEarned(state, 'PROPHET')).toBe(0);
    expect(state.gpNext?.[GP_CLASSES.indexOf('PROPHET')] ?? 0).toBe(0);
  });
});

describe('the recruit', () => {
  it('takes the offered person at the offered price and steps the queue', () => {
    const state = scene();
    const cost = gpOfferCost(state, 'SCIENTIST');
    expect(cost).toBe(gpCost('SCIENTIST', GREAT_PEOPLE.SCIENTIST[0].era, 0));
    seatOf(state, 0)!.gpp.SCIENTIST = cost;
    advanceGreatPeople(state, 0);
    expect(state.claimedGreatPeople).toContain(GREAT_PEOPLE.SCIENTIST[0].id);
    expect(state.gpNext![GP_CLASSES.indexOf('SCIENTIST')]).toBe(1);
    expect(seatOf(state, 0)!.gpp.SCIENTIST).toBe(0);
  });

  it('skips the people the world era has passed', () => {
    const state = scene();
    setWorldEra(state, 3);
    const at = GP_FIRST_OF_ERA.SCIENTIST[3];
    expect(at).toBeGreaterThan(0);
    seatOf(state, 0)!.gpp.SCIENTIST = gpOfferCost(state, 'SCIENTIST');
    advanceGreatPeople(state, 0);
    expect(state.claimedGreatPeople).toEqual([GREAT_PEOPLE.SCIENTIST[at].id]);
    expect(greatPeopleEarned(state, 'SCIENTIST')).toBe(1);
    // the ones the world walked past are never offered again
    expect(state.gpNext![GP_CLASSES.indexOf('SCIENTIST')]).toBe(at + 1);
  });

  it('claims several in one turn while the bank holds out', () => {
    const state = scene();
    const a = gpOfferCost(state, 'MERCHANT');
    seatOf(state, 0)!.gpp.MERCHANT = a * 4;
    advanceGreatPeople(state, 0);
    expect(greatPeopleEarned(state, 'MERCHANT')).toBeGreaterThanOrEqual(2);
    expect(state.gpNext![GP_CLASSES.indexOf('MERCHANT')]).toBe(greatPeopleEarned(state, 'MERCHANT'));
  });
});
