/**
 * The Great Person DRAW. Every class offers ONE person at a time, drawn
 * randomly from the unclaimed members of the first era at or past the
 * world's; the price freezes with the draw and outlives an era step. A class
 * with nobody left at or past the world era is exhausted for good, and its
 * points convert to faith 1:1.
 * The GPU twin is religion_gp_test's cost/era-gate block.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords } from '../helpers';
import { foundCity } from '../../../cpu/core/game';
import { advanceGreatPeople, ensureGpOffer, gpOffer, gpOfferCost, greatPeopleEarned } from '../../../cpu/core/greatPeople';
import { GP_CLASSES, GP_ERA_GPP, GP_FLAT_COST_CLASSES, GREAT_PEOPLE, gpCost } from '../../../cpu/data/greatPeople';
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

  it('ends the Prophet roster before the Industrial era', () => {
    // "Industrial: No more Great Prophets"
    expect(Math.max(...GREAT_PEOPLE.PROPHET.map((p) => p.era))).toBeLessThan(4);
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
  it('draws from the first era at or past the world with anyone unclaimed', () => {
    const state = scene();
    expect(gpOffer(state, 'SCIENTIST')).toBe(-1); // pending until the draw
    ensureGpOffer(state, 'SCIENTIST');
    const at = gpOffer(state, 'SCIENTIST');
    expect(at).toBeGreaterThanOrEqual(0);
    // an Ancient world: the pool is the Classical members, nobody earlier exists
    expect(GREAT_PEOPLE.SCIENTIST[at].era).toBe(1);
    expect(gpOfferCost(state, 'SCIENTIST')).toBe(gpCost('SCIENTIST', 1, 0));
  });

  it('never draws from the eras the world has passed', () => {
    const state = scene();
    setWorldEra(state, 3);
    ensureGpOffer(state, 'SCIENTIST');
    expect(GREAT_PEOPLE.SCIENTIST[gpOffer(state, 'SCIENTIST')].era).toBe(3);
    expect(gpOfferCost(state, 'SCIENTIST')).toBe(gpCost('SCIENTIST', 3, 3));
  });

  it('freezes the price at the draw, across an era step', () => {
    const state = scene();
    ensureGpOffer(state, 'SCIENTIST');
    const at = gpOffer(state, 'SCIENTIST');
    const cost = gpOfferCost(state, 'SCIENTIST');
    setWorldEra(state, 3);
    expect(gpOffer(state, 'SCIENTIST')).toBe(at);
    expect(gpOfferCost(state, 'SCIENTIST')).toBe(cost);
  });

  it('exhausts for good, and the dead bank converts to faith 1:1', () => {
    const state = scene();
    setWorldEra(state, 4); // Industrial — every Prophet is behind the world
    ensureGpOffer(state, 'PROPHET');
    expect(gpOffer(state, 'PROPHET')).toBe(-2);
    expect(gpOfferCost(state, 'PROPHET')).toBe(Infinity);
    const owner = seatOf(state, 0)!;
    const faith0 = owner.faith;
    owner.gpp.PROPHET = 1_000_000;
    advanceGreatPeople(state, 0);
    expect(greatPeopleEarned(state, 'PROPHET')).toBe(0);
    expect(owner.gpp.PROPHET).toBe(0);
    expect(owner.faith).toBe(faith0 + 1_000_000);
  });
});

describe('the recruit', () => {
  it('takes the offered person at the frozen price and redraws', () => {
    const state = scene();
    ensureGpOffer(state, 'SCIENTIST');
    const at = gpOffer(state, 'SCIENTIST');
    const cost = gpOfferCost(state, 'SCIENTIST');
    seatOf(state, 0)!.gpp.SCIENTIST = cost;
    advanceGreatPeople(state, 0);
    expect(state.claimedGreatPeople).toContain(GREAT_PEOPLE.SCIENTIST[at].id);
    expect(greatPeopleEarned(state, 'SCIENTIST')).toBe(1);
    expect(seatOf(state, 0)!.gpp.SCIENTIST).toBe(0);
    // the replacement stands at once, and the claimed one is out of the pool
    const next = gpOffer(state, 'SCIENTIST');
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).not.toBe(at);
  });

  it('claims several in one turn while the bank holds out', () => {
    const state = scene();
    ensureGpOffer(state, 'MERCHANT');
    const a = gpOfferCost(state, 'MERCHANT');
    seatOf(state, 0)!.gpp.MERCHANT = a * 4;
    advanceGreatPeople(state, 0);
    expect(greatPeopleEarned(state, 'MERCHANT')).toBeGreaterThanOrEqual(2);
    // every claim a DIFFERENT person
    expect(new Set(state.claimedGreatPeople).size).toBe(state.claimedGreatPeople.length);
  });
});
