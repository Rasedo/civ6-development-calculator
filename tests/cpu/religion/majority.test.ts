import { describe, it, expect } from 'vitest';
import { followersOf, followedReligionOf, ATHEISM_PRESSURE_PER_POP } from '../../../cpu/data/religion';

// A city's MAJORITY religion, measured live (lab 2 scene E, eight draws
// including the decider; tools/civ6lab/runs/religion_20260920T183900Z.jsonl).
// Religion ids here follow the game's order: CATH < PROT < BUD. The rows pass
// the UNCONVERTED pressure the game reported (an accumulator the live game
// keeps — 300 at pop 2 after a shrink — where this engine derives 50 × pop).
const CATH = 0;
const PROT = 1;
const BUD = 2;

describe('followers — pop × pressure share, rounded, forced to sum to pop', () => {
  it('NGAZARGAMU pop 9: CATH 1, PROT 2, BUD 4, none 2 (the largest-remainder allocation)', () => {
    expect(followersOf([212, 641, 940], 9, 400)).toEqual([1, 2, 4, 2]);
  });
  it('STAVANGER pop 6, one Catholic spread: CATH 3, none 3', () => {
    expect(followersOf([220], 6, 300)).toEqual([3, 3]);
  });
  it('STAVANGER pop 3, three groups: one citizen each', () => {
    expect(followersOf([359, 710], 3, 300)).toEqual([1, 1, 1]);
  });
  it('the engine derives the unconverted pressure at 50 per citizen; pop 0 seats nobody', () => {
    expect(ATHEISM_PRESSURE_PER_POP).toBe(50);
    expect(followersOf([], 4)).toEqual([4]);
    expect(followersOf([100], 2)).toEqual([1, 1]);   // 100 vs 100: the remainder tie goes to the lower id
    expect(followersOf([100], 0)).toEqual([0, 0]);
  });
});

describe('the majority — most followers, ties by pressure, at least half the citizens', () => {
  it('NGAZARGAMU: BUD leads on both counts and still fails the half-gate (2 × 4 < 9)', () => {
    expect(followedReligionOf([212, 641, 940], 9, 400)).toBe(-1);
  });
  it('STAVANGER draw 1, pop 6: a 3-3 tie with the unconverted goes to their pressure — no majority', () => {
    expect(followedReligionOf([220], 6, 300)).toBe(-1);
  });
  it('STAVANGER draw 3, pop 2: the same shape with the pressure order flipped — Protestantism', () => {
    expect(followedReligionOf([0, 880], 2, 300)).toBe(PROT);
  });
  it('STAVANGER draw 4, pop 3: the pressure winner is a religion, yet 2 × 1 < 3', () => {
    expect(followedReligionOf([359, 710], 3, 300)).toBe(-1);
  });
  it('STAVANGER draws 5 and 6, pop 2: a 1-1 tie between religions goes to the higher PRESSURE, not the lower id', () => {
    expect(followedReligionOf([579, 532], 2, 0)).toBe(CATH);
    expect(followedReligionOf([434, 752], 2, 0)).toBe(PROT);   // the decider
  });
  it('through the engine\'s own unconverted term: a religion holding every citizen of a one-pop city is its majority; pop 0 is nobody\'s', () => {
    expect(followedReligionOf([0, 0, 300], 1)).toBe(BUD);
    expect(followedReligionOf([300], 0)).toBe(-1);
    // exactly half the citizens is enough; the unconverted at equal followers and higher pressure is not
    expect(followedReligionOf([100], 2)).toBe(CATH);        // 1-1, 100 vs 100: the lower id
    expect(followedReligionOf([90], 2)).toBe(-1);           // 1-1, 90 vs 100: the unconverted
  });
});
